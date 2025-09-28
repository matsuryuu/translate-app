import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://translate-app-topaz.vercel.app", // Vercel本番
      "http://localhost:3000"                   // 開発用
    ],
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== ユーザー & ログ保持 =====
let users = {
  1: "ユーザー1",
  2: "ユーザー2",
};
let logs = []; // { userId, inputText, result }

// ===== 接続時 =====
io.on("connection", (socket) => {
  console.log("✅ 新しいクライアントが接続");

  // 初期ユーザー情報を送信
  socket.emit("init users", users);

  // 過去ログを送信
  socket.emit("init logs", logs);

  // ===== 入力同期 =====
  socket.on("input", ({ userId, text }) => {
    io.emit("sync input", { userId, text });
  });

  // ===== 翻訳リクエスト =====
  socket.on("translate", async (payload) => {
    const { userId, text, inputLang, outputLang, model, mode } = payload;

    try {
      const messages = [
        {
          role: "system",
          content:
            mode === "literal"
              ? "厳密に直訳してください。出力は翻訳のみ。"
              : "自然で口語的に意訳してください。出力は翻訳のみ。",
        },
        { role: "user", content: text },
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
      });

      let finalText = "";
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          finalText += delta;
          io.emit("stream result", { userId, partial: finalText });
        }
      }

      // 完了時にログを追加して配信
      logs.unshift({ userId, inputText: text, result: finalText });
      io.emit("final result", { userId, result: finalText, inputText: text });
    } catch (err) {
      console.error("❌ 翻訳エラー:", err);
      io.emit("translate error", {
        userId,
        message: "翻訳エラーが発生しました",
      });
    }
  });

  // ===== ユーザー名変更 =====
  socket.on("rename user", ({ userId, newName }) => {
    users[userId] = newName;
    io.emit("name updated", { userId, newName });
  });
.
  // ===== ユーザー追加 =====
  socket.on("add user", ({ userId, userName }) => {
    users[userId] = userName;
    io.emit("init users", users);
  });

  // ===== ユーザー削除 =====
  socket.on("remove user", ({ userId }) => {
    delete users[userId];
    io.emit("init users", users);
  });

  // ===== ログ削除 =====
  socket.on("clear logs", () => {
    logs = [];
    io.emit("logs cleared", {});
  });
});

// ===== サーバー起動 =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
