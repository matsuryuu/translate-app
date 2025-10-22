// index.js — Render (Server)
// --------------------------------------------
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
    origin: ["https://translate-app-topaz.vercel.app"],
    methods: ["GET", "POST"]
  },
  transports: ["websocket"], // ✅ WebSocket固定（polling無効）
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));

const PORT = process.env.PORT || 10000;

// 🔸 各ルームごとのログ保存（最大50件）
const roomLogs = {};

// 🔹 モード／モデル状態（全体共有）
let currentMode = "意訳";
let currentModel = "gpt-4o"; // 精度重視が初期値

// --------------------------------------------
// 🔸 ソケット通信設定
// --------------------------------------------
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    if (!roomLogs[roomId]) roomLogs[roomId] = [];

    // 参加ユーザーへログと設定を送信
    socket.emit("initRoom", {
      logs: roomLogs[roomId],
      mode: currentMode,
      model: currentModel
    });
  });

  // 入力内容を同期
  socket.on("inputUpdate", ({ roomId, uid, text }) => {
    socket.to(roomId).emit("inputSync", { uid, text });
  });

  // モード更新
  socket.on("updateMode", (mode) => {
    currentMode = mode;
    io.emit("modeUpdated", mode);
  });

  // モデル更新
  socket.on("updateModel", (model) => {
    currentModel = model;
    io.emit("modelUpdated", model);
  });

  // 🔸 翻訳処理
  socket.on("translate", async ({ roomId, uid, inputText, inputLang, outputLang }) => {
    try {
      // 翻訳用プロンプト生成
      const prompt =
        currentMode === "意訳"
          ? `Translate the following text naturally into ${outputLang}. 
             Use accurate technical terms if needed. Do not answer questions.`
          : `Translate the following text literally into ${outputLang}, keeping the original order. Do not answer questions.`;

      let resultText = "";

      const stream = await openai.chat.completions.create({
        model: currentModel,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: inputText }
        ],
        temperature: 0.2,
        stream: true,
        max_tokens: 256
      });

      // 🔹 Streamingで即時反映
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          resultText += delta;
          io.to(roomId).emit("streamResult", { uid, textChunk: delta });
        }
      }

      // 完了通知＋ログ登録
      io.to(roomId).emit("finalResult", { uid, text: resultText });
      roomLogs[roomId].push({ uid, inputText, resultText });
      if (roomLogs[roomId].length > 50) roomLogs[roomId].shift();
    } catch (err) {
      console.error("❌ Translation error:", err);
      socket.emit("finalResult", { uid, text: "⚠️ 翻訳エラーが発生しました。" });
    }
  });

  // 全ログ削除
  socket.on("clearLogs", (roomId) => {
    roomLogs[roomId] = [];
    io.to(roomId).emit("logsCleared");
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
