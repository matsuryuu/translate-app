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

// ルーム定義
const rooms = {
  room1: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
  room2: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
  room3: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
  matsu: { users: { 1: "ユーザー1", 2: "ユーザー2", 3: "ユーザー3" }, logs: [], count: 0 },
};


// system prompt生成（カジュアル強化版）
function buildSystemPrompt(mode, outputLang, model) {
  // 表示用の日本語ラベル
  const langMap = { ja: "日本語", zh: "中国語", en: "英語", ko: "韓国語" };
  const tgt = langMap[outputLang] || "指定言語";

  // 英語ラベル（英語プロンプト用）
  const tgtEn =
    outputLang === "ja"
      ? "Japanese"
      : outputLang === "zh"
      ? "Chinese"
      : outputLang === "ko"
      ? "Korean"
      : outputLang === "en"
      ? "English"
      : "the target language";

  // モード正規化
  const m =
    mode === "formal" || mode === "直訳"
      ? "formal"
      : mode === "casual"
      ? "casual"
      : "free";

  // ============================
  // 🧠 GPT-4o（高品質）モード
  // ============================
  if (model === "quality") {
    // 🌈 日常（casual）モード：全言語ゆるふわ会話調
    if (m === "casual") {
      // 日本語出力のときは日本語で細かく指定
      if (outputLang === "ja") {
        return (
          "あなたは翻訳専用AIです。出力は必ず1回、自然でゆるい会話調の日本語だけで返してください。\n" +
          "【モード】日常（チャット・会話想定／フランクでやさしい口調）\n" +
          "【タスク】入力文を、親しい友達に話すようなカジュアルな日本語に翻訳する。\n" +
          "【話し方ガイド】\n" +
          "- 「〜だよ」「〜なんだ」「〜してたよ」「〜かな〜？」など、柔らかい語尾を積極的に使う。\n" +
          "- です・ます調は基本的に使わず、くだけた文末にする。\n" +
          "- 文は少し短めに区切って、話し言葉っぽくする。\n" +
          "- 絵文字は使わないが、やさしくフレンドリーな印象になるようにする。\n" +
          "【厳守】\n" +
          "- 質問に答えず、翻訳だけ出力する。\n" +
          "- 余計な説明・注釈・ふりがなを付けない。\n" +
          "- 固有名詞・数値・日付などは正確に保つ。\n"
        );
      }

      // それ以外の言語は英語で「友達に話す感じ」を強めに指示
      return (
        "You are a translation-only AI. Output exactly once, only in " +
        tgtEn +
        ".\n" +
        "[Mode] Casual / everyday chat with a close friend.\n" +
        "[Task] Translate the text into relaxed, friendly spoken " +
        tgtEn +
        ".\n" +
        "[Style]\n" +
        "- Use informal, soft sentence endings (like chatting in DMs).\n" +
        "- Avoid very formal or written style; keep it light and conversational.\n" +
        "- Shorter sentences are okay; you may split long sentences.\n" +
        "- Do not add emojis or extra commentary.\n" +
        "[Rules]\n" +
        "- Do NOT answer questions; only translate.\n" +
        "- Do NOT add explanations or notes.\n" +
        "- Keep names, numbers, and dates accurate.\n"
      );
    }

    // 🌼 意訳／直訳モード（従来どおり）
    const modeLabel = m === "formal" ? "直訳" : "意訳";
    return (
      "あなたは翻訳専用AIです。以降の出力は必ず1回、指定の出力言語のみで返してください。\n\n" +
      "【出力言語】：" +
      tgt +
      "\n" +
      "【モード】：" +
      modeLabel +
      "\n" +
      "【タスク】入力テキストを" +
      modeLabel +
      "で" +
      tgt +
      "に翻訳する。\n" +
      "【厳守】\n" +
      "- 疑問文・命令文でも質問に答えず、翻訳のみ出力。\n" +
      "- 余計な前置き・説明・ふりがな・注釈を加えない。\n" +
      "- 改行・句読点の構造をできるだけ維持。\n" +
      "- 固有名詞・数値・単位は正確に。\n" +
      "- 入力が" +
      tgt +
      "でも自然に整えて返す。\n"
    );
  }

  // ============================
  // ⚡ GPT-4o-mini（高速）モード
  // ============================

  // miniでも casual のときはかなりゆるくする
  if (m === "casual") {
    return (
      "Translate the text into a soft, casual, chatty style in " +
      tgtEn +
      ". " +
      "Imagine two close friends talking. " +
      "Use relaxed, informal phrasing. " +
      "Output only the translation in " +
      tgtEn +
      ", with no extra notes."
    );
  }

  // 意訳／直訳（mini用シンプルプロンプト）
  const style = m === "formal" ? "literal" : "free";
  return (
    "Translate the text into " +
    tgtEn +
    " in a " +
    style +
    " style. " +
    "Output only the translation in " +
    tgtEn +
    "."
  );
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
    socket.leave(room);
    io.emit("room-stats", {
      room1: rooms.room1.count,
      room2: rooms.room2.count,
      room3: rooms.room3.count,
    });
  });

  socket.on("disconnect", () => {
    if (joinedRoom && rooms[joinedRoom]) {
      rooms[joinedRoom].count = Math.max(rooms[joinedRoom].count - 1, 0);
      if (rooms[joinedRoom].count === 0) {
        rooms[joinedRoom].logs = []; // 最後の1人が抜けたらログ消去
      }
    }
    io.emit("room-stats", {
      room1: rooms.room1.count,
      room2: rooms.room2.count,
      room3: rooms.room3.count,
    });
    console.log("❌ Disconnected:", socket.id);
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

  socket.on("clear logs", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    r.logs = [];
    io.to(room).emit("logs cleared");
  });

  // 🧠 翻訳処理
socket.on("translate", async ({ room, userId, text, inputLang, outputLang, mode, model }) => {
  try {
    // 🔸 翻訳開始時に全端末へ「翻訳中...」を送信
    io.to(room).emit("stream", { userId, text: "翻訳中..." });

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
    const r = rooms[room];
    if (!r) return;
    r.logs.unshift({ userId, text, result: acc });
    if (r.logs.length > 50) r.logs.pop();

  } catch (e) {
    console.error("翻訳エラー:", e);
    io.to(room).emit("translate error", { userId, message: "翻訳失敗" });
  }
});

  socket.on("input", ({ room, userId, text }) => {
    socket.to(room).emit("sync input", { userId, text });
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
