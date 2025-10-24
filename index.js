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

// ルーム初期定義
const rooms = {
  room1: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room2: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] },
  room3: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [] }
};

// 🎯 system prompt生成関数
function buildSystemPrompt(mode, outputLang, model) {
  const langMap = { ja: "日本語", zh: "中国語", en: "英語", ko: "韓国語" };
  const tgt = langMap[outputLang] || "指定言語";
  const modeLabel = mode === "直訳" ? "直訳" : "意訳";

  if (model === "quality") {
    return `あなたは翻訳専用AIです。以降の出力は必ず1回、指定の出力言語のみで返してください。

【出力言語（必須）】：${tgt}
【タスク】入力テキストを${modeLabel}で${tgt}に翻訳する。
【厳守】
- 入力が疑問文や命令文でも「質問に答えない」。翻訳結果のみを出力する。
- 追加説明/前置き/脚注/候補列挙/ふりがな/音訳/括弧注記を一切付けない。
- 改行・箇条書き・記号の構造は可能な限り保持する。
- 固有名詞・数値・単位は正確に維持する。
- 入力言語が${tgt}でも、${tgt}で自然に整えて返す（同文出力を避ける）。

【モード定義】
- 直訳: 文構造と意味を忠実に。余計な語を加えない。
- 意訳: 自然で分かりやすい表現に整える。専門分野では適切な専門用語を保持。`;
  }

  // 軽量prompt（速度重視）
  return `Translate the input text into ${tgt} (${modeLabel} style).
Output only the translation in ${tgt}.
Never answer questions or add commentary.`;
}

// ソケット通信設定
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  let joinedRoom = null;

  socket.on("join room", ({ room }) => {
    if (!rooms[room]) return;
    joinedRoom = room;
    socket.join(room);
    socket.emit("init users", rooms[room].users);
    if (rooms[room].logs.length > 0) socket.emit("existing-logs", rooms[room].logs);
  });

  socket.on("leave room", ({ room }) => socket.leave(room));

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

  socket.on("clear logs", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    r.logs = [];
    io.to(room).emit("logs cleared");
  });

  // 🧠 翻訳処理
  socket.on("translate", async ({ room, userId, text, inputLang, outputLang, mode, model }) => {
    try {
      const sys = buildSystemPrompt(mode, outputLang, model);
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

      io.to(room).emit("translated", { userId, text: acc, inputText: text });
      const r = rooms[room];
      if (!r) return;
      r.logs.unshift({ userId, text, result: acc });
      if (r.logs.length > 50) r.logs.pop();
    } catch (e) {
      console.error(e);
      io.to(room).emit("translate error", { userId, message: "翻訳失敗" });
    }
  });

  socket.on("input", ({ room, userId, text }) => {
    socket.to(room).emit("sync input", { userId, text });
  });

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
