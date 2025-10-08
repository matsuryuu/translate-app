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

// 各部屋の状態
const rooms = {
  room1: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room2: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room3: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] }
};

io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let joinedRoom = null;

  socket.on("join room", ({ room }) => {
    if (!rooms[room]) return;
    joinedRoom = room;
    socket.join(room);
    socket.emit("init users", rooms[room].users);
  });

  socket.on("leave room", ({ room }) => socket.leave(room));

  socket.on("input", ({ room, userId, text }) => {
    socket.to(room).emit("sync input", { userId, text });
  });

  socket.on("add user", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    const ids = Object.keys(r.users).map(Number);
    if (ids.length >= 5) return;
    const newId = Math.max(...ids) + 1;
    r.users[newId] = `ユーザー${newId}`;
    io.to(room).emit("users updated", r.users);
  });

  socket.on("remove user", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    const ids = Object.keys(r.users).map(Number);
    if (ids.length <= 2) return;
    delete r.users[Math.max(...ids)];
    io.to(room).emit("users updated", r.users);
  });

  // 翻訳
  socket.on("translate", async ({ room, userId, text, inputLang, outputLang }) => {
    try {
      const sys = `
あなたは翻訳専用AIです。
絶対に質問に回答したり、新しい内容を作ったりしてはいけません。
入力文の意味を理解せず、文法構造に忠実に ${outputLang} へ翻訳してください。
質問文であっても「答え」ではなく「質問文そのもの」を翻訳してください。`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
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
        io.to(room).emit("stream result", { userId, partial: acc });
      }

      io.to(room).emit("final result", { userId, result: acc, inputText: text });
    } catch (e) {
      console.error(e);
      io.to(room).emit("translate error", { userId, message: "翻訳失敗" });
    }
  });

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
