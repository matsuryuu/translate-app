import express from "express";
import http from "http";
import { Server } from "socket.io";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://translate-app-topaz.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let logs = [];

// 静的ファイル
app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });

  // 入力同期
  socket.on("input", ({ userId, text }) => {
    socket.broadcast.emit("sync input", { userId, text });
  });

  // 翻訳リクエスト
  socket.on("translate", async ({ userId, text, inputLang, outputLang, model, mode }) => {
    try {
      const messages = [
        {
          role: "system",
          content:
            mode === "literal"
              ? `Translate the following text into ${outputLang}. Use precise literal translation.`
              : `Translate the following text into ${outputLang}. Use natural and conversational style.`,
        },
        { role: "user", content: text },
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
      });

      let fullResult = "";
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResult += content;
          socket.emit("stream result", { userId, partial: fullResult });
        }
      }

      socket.emit("final result", { userId, result: fullResult, inputText: text });
      logs.unshift({ userId, inputText: text, result: fullResult });
    } catch (err) {
      console.error("Translation error:", err);
      socket.emit("translate error", { userId, message: "翻訳失敗" });
    }
  });

  // ログ全削除
  socket.on("clear logs", () => {
    logs = [];
    io.emit("logs cleared", {});
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
