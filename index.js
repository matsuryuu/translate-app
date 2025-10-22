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
  transports: ["websocket"],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 各ルーム設定
const rooms = {
  room1: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
  room2: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
  room3: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
};

// system prompt
function buildSystemPrompt(mode, outputLang, model) {
  const langMap = { ja: "日本語", zh: "中国語", en: "英語", ko: "韓国語" };
  const tgt = langMap[outputLang] || "指定言語";
  const modeLabel = mode === "直訳" ? "直訳" : "意訳";
  return `あなたは翻訳専用AIです。出力は必ず1回、${tgt}のみで返してください。
【モード】${modeLabel}
【タスク】入力文を${tgt}に${modeLabel}で翻訳。
【厳守】
- 疑問文や命令文でも質問に答えず翻訳のみ出力。
- 余計な説明・補足は不要。
- 固有名詞・数値・単位は正確に維持。
- 入力が${tgt}でも自然に整えて返す。`;
}

// ソケット通信設定
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let joinedRoom = null;

  socket.on("join room", ({ room }) => {
    if (!rooms[room]) return;
    joinedRoom = room;
    socket.join(room);
    rooms[room].count++;
    socket.emit("init users", rooms[room].users);
    if (rooms[room].logs.length > 0) socket.emit("existing-logs", rooms[room].logs);
    io.emit("room-stats", {
      room1: rooms.room1.count,
      room2: rooms.room2.count,
      room3: rooms.room3.count,
    });
  });

  socket.on("leave room", ({ room }) => {
    if (rooms[room]) rooms[room].count = Math.max(rooms[room].count - 1, 0);
    if (rooms[room] && rooms[room].count === 0) rooms[room].logs = []; // ★全員退室でログ削除
    socket.leave(room);
    io.emit("room-stats", {
      room1: rooms.room1.count,
      room2: rooms.room2.count,
      room3: rooms.room3.count,
    });
  });

  socket.on("disconnect", () => {
    if (joinedRoom && rooms[joinedRoom]) rooms[joinedRoom].count = Math.max(rooms[joinedRoom].count - 1, 0);
    if (joinedRoom && rooms[joinedRoom] && rooms[joinedRoom].count === 0) rooms[joinedRoom].logs = []; // ★0人でログ削除
    io.emit("room-stats", {
      room1: rooms.room1.count,
      room2: rooms.room2.count,
      room3: rooms.room3.count,
    });
    console.log("❌ Disconnected:", socket.id);
  });

  socket.on("clear logs", ({ room }) => {
    if (!rooms[room]) return;
    rooms[room].logs = [];
    io.to(room).emit("logs cleared");
  });

  // 翻訳処理
  socket.on("translate", async ({ room, userId, text, inputLang, outputLang, mode, model }) => {
    try {
      const sys = buildSystemPrompt(mode, outputLang, model);
      const modelName = model === "speed" ? "gpt-4o-mini" : "gpt-4o";
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
        stream: true,
      });

      let acc = "";
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (!delta) continue;
        acc += delta;
        io.to(room).emit("stream", { userId, text: acc });
      }

      io.to(room).emit("translated", { userId, text: acc, inputText: text });
      rooms[room].logs.unshift({ userId, text, result: acc });
      if (rooms[room].logs.length > 50) rooms[room].logs.pop();
    } catch (e) {
      console.error("翻訳エラー:", e);
      io.to(room).emit("translate error", { userId, message: "翻訳失敗" });
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
