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

// 静的配信（Render直アクセス用の簡易UI）
app.use(express.static("public"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ========== サーバ状態 ==========
let users = { 1: "ユーザー1", 2: "ユーザー2" };     // 最小2/最大5
let logs  = []; // { userId, inputText, result } を先頭追加

function broadcastUsers(){ io.emit("users updated", users); }

// ========== 接続 ==========
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  // 現在のユーザー配列とログを新規接続に渡す
  socket.emit("init users", users);
  socket.emit("init logs", logs);

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });

  // 入力同期：自分以外へブロードキャスト
  socket.on("input", ({ userId, text }) => {
    socket.broadcast.emit("sync input", { userId, text });
  });

  // ユーザー追加
  socket.on("add user", () => {
    const ids = Object.keys(users).map(n=>Number(n)).sort((a,b)=>a-b);
    const maxId = ids.length ? ids[ids.length-1] : 0;
    if(Object.keys(users).length >= 5) return;
    users[maxId+1] = `ユーザー${maxId+1}`;
    broadcastUsers();
  });

  // ユーザー削除（最後のIDを削除、最小2）
  socket.on("remove user", () => {
    const ids = Object.keys(users).map(n=>Number(n)).sort((a,b)=>a-b);
    if(ids.length <= 2) return;
    const last = ids[ids.length-1];
    delete users[last];
    broadcastUsers();
  });

  // 翻訳
  socket.on("translate", async ({ userId, text, inputLang, outputLang, model, mode }) => {
    try {
      const sys =
        mode === "literal"
          ? `Translate the following text into ${outputLang}. STRICTLY literal. Output translation only.`
          : `Translate the following text into ${outputLang}. Natural, conversational, business-safe. Output translation only.`;

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text }
        ],
        stream: true,
      });

      let acc = "";
      for await (const chunk of completion) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if(!delta) continue;
        acc += delta;
        // 途中経過も全員へ
        io.emit("stream result", { userId, partial: acc });
      }

      // 確定を全員へ
      io.emit("final result", { userId, result: acc, inputText: text });
      logs.unshift({ userId, inputText: text, result: acc });
      // ログのサイズを適度にキープ（過去100件）
      if(logs.length > 100) logs.length = 100;

    } catch (err) {
      console.error("Translation error:", err);
      io.emit("translate error", { userId, message: "翻訳失敗" });
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
