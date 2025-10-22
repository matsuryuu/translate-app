import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import OpenAI from "openai";
import cors from "cors";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://translate-app-topaz.vercel.app",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const roomLogs = {}; // 各ルームごとの翻訳履歴を保持

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let room = "room1";

  // ルーム入室処理
  socket.on("join-room", (selectedRoom) => {
    room = selectedRoom || "room1";
    socket.join(room);
    console.log(`📡 ${socket.id} joined ${room}`);

    // 既存ログを送信
    if (roomLogs[room]) {
      socket.emit("existing-logs", roomLogs[room]);
    }
  });

  // 翻訳リクエスト
  socket.on("translate", async (data) => {
    const { text, mode, fromLang, toLang, model } = data;
    if (!text) return;
    try {
      const response = await openai.chat.completions.create({
        model: model === "speed" ? "gpt-4o-mini" : "gpt-4o",
        messages: [
          {
            role: "system",
            content: `
You are a translation assistant.
If mode is '直訳', translate literally.
If mode is '意訳', translate naturally and idiomatically,
but preserve technical terminology if the text is professional.
Always translate into ${toLang}, regardless of input language.`,
          },
          { role: "user", content: text },
        ],
        stream: true,
      });

      let fullText = "";
      for await (const chunk of response) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          io.to(room).emit("stream", { text: fullText });
        }
      }

      io.to(room).emit("translated", { text: fullText });

      // ログ保存
      roomLogs[room] = roomLogs[room] || [];
      roomLogs[room].push({ text, result: fullText });
    } catch (err) {
      console.error("❌ Translation error:", err.message);
      io.to(room).emit("translated", { text: "[翻訳エラー]" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Disconnected: ${socket.id} (${room})`);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
