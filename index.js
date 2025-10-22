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
    credentials: true
  }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 各ルーム定義
const rooms = {
  room1: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room2: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room3: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] }
};

// ソケット接続処理
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let joinedRoom = null;

  // 入室
  socket.on("join room", ({ room }) => {
    if (!rooms[room]) return;
    joinedRoom = room;
    socket.join(room);
    socket.emit("init users", rooms[room].users);

    // 新入室者にログ配信
    if (rooms[room].logs.length > 0) {
      socket.emit("existing-logs", rooms[room].logs);
    }
  });

  // 退室
  socket.on("leave room", ({ room }) => {
    socket.leave(room);
  });

  // ユーザー追加
  socket.on("add user", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    const ids = Object.keys(r.users).map(Number);
    if (ids.length >= 5) return;
    const newId = Math.max(...ids) + 1;
    r.users[newId] = `ユーザー${newId}`;
    io.to(room).emit("users updated", r.users);
  });

  // ユーザー削除
  socket.on("remove user", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    const ids = Object.keys(r.users).map(Number);
    if (ids.length <= 2) return;
    delete r.users[Math.max(...ids)];
    io.to(room).emit("users updated", r.users);
  });

  // ログ削除
  socket.on("clear logs", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    r.logs = [];
    io.to(room).emit("logs cleared");
  });

  // 🎯 翻訳イベント（モード・モデル対応）
  socket.on("translate", async ({ room, userId, text, inputLang, outputLang, mode, model }) => {
    try {
      const sys =
        mode === "直訳"
          ? `あなたは翻訳専用AIです。原文の文構造・意味を忠実に翻訳してください。余計な言葉を加えず、回答は翻訳結果のみ出力してください。`
          : `あなたは翻訳専用AIです。自然で分かりやすい現地語に訳し、意図が伝わるよう意訳してください。ただし専門文脈（技術・化学・業務用語など）は適切な専門用語を保持してください。回答は翻訳結果のみ出力してください。`;

      const modelName = model === "speed" ? "gpt-4o-mini" : "gpt-4o";

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text }
        ],
        stream: true
      });

      let acc = "";
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (!delta) continue;
        acc += delta;
        io.to(room).emit("stream", { userId, text: acc });
      }

      io.to(room).emit("translated", { userId, text: acc });
      const r = rooms[room];
      if (!r) return;
      r.logs.unshift({ userId, text, result: acc });
      if (r.logs.length > 50) r.logs.pop();
    } catch (e) {
      console.error(e);
      io.to(room).emit("translate error", { userId, message: "翻訳失敗" });
    }
  });

  // 入力同期
  socket.on("input", ({ room, userId, text }) => {
    socket.to(room).emit("sync input", { userId, text });
  });

  // 切断
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
