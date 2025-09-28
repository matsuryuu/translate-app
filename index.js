import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let logs = [];
let userNames = { 1: "ユーザー1", 2: "ユーザー2" };

// ===== ソケット =====
io.on("connection", (socket) => {
  console.log("✅ Connected:", socket.id);
  socket.emit("init users", userNames);
  socket.emit("init logs", logs);

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));

  socket.on("input", ({ userId, text }) => io.emit("sync input", { userId, text }));

  socket.on("rename user", ({ userId, newName }) => {
    userNames[userId] = newName;
    io.emit("name updated", { userId, newName });
  });

  socket.on("add user", ({ userId, userName }) => {
    if (!userNames[userId] && Object.keys(userNames).length < 5) {
      userNames[userId] = userName;
      io.emit("init users", userNames);
    }
  });

  socket.on("remove user", ({ userId }) => {
    if (Object.keys(userNames).length > 2) {
      delete userNames[userId];
      io.emit("init users", userNames);
    }
  });

  socket.on("translate", async ({ userId, text, inputLang, outputLang, model, mode }) => {
    try {
      let systemPrompt =
        mode === "literal"
          ? `Translate from ${inputLang} to ${outputLang}. Output literal translation only.`
          : `Translate from ${inputLang} to ${outputLang}. Use natural, conversational tone suitable for business. Output only the translation.`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ];

      const stream = await openai.chat.completions.create({
        model: model || "gpt-4o",
        messages,
        stream: true,
      });

      let fullText = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          io.emit("stream result", { userId, partial: fullText });
        }
      }

      logs.unshift({ userId, inputText: text, result: fullText });
      io.emit("final result", { userId, result: fullText, inputText: text });
    } catch (err) {
      console.error("❌ Translate error:", err.message);
      io.emit("translate error", { userId, message: err.message });
    }
  });

  socket.on("clear logs", () => {
    logs = [];
    io.emit("logs cleared");
  });
});

// ===== サーバー起動 =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
