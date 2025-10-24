// index.js — Express + Socket.IO + OpenAI streaming (stable, WS-only)
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const server = http.createServer(app);

const allowlist = [
  'https://translate-app-topaz.vercel.app',
  'http://localhost:3000',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowlist.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
}));

app.get('/', (_req, res) => {
  res.status(200).send('realtime translator backend ok');
});

const io = new Server(server, {
  cors: {
    origin: allowlist,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket'],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== Room State =====
const MAX_LOGS = 50;
const rooms = {
  room1: { users: { 1: 'ユーザー1', 2: 'ユーザー2', 3: 'ユーザー3' }, logs: [], count: 0 },
  room2: { users: { 1: 'ユーザー1', 2: 'ユーザー2', 3: 'ユーザー3' }, logs: [], count: 0 },
  room3: { users: { 1: 'ユーザー1', 2: 'ユーザー2', 3: 'ユーザー3' }, logs: [], count: 0 },
};

function broadcastRoomStats() {
  const payload = {
    room1: rooms.room1.count,
    room2: rooms.room2.count,
    room3: rooms.room3.count,
  };
  io.emit('room-stats', payload);
}

// ===== Socket Handlers =====
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join-room', ({ room }) => {
    if (!rooms[room]) return;
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = room;
    socket.join(room);
    rooms[room].count++;
    // 初期ユーザー一覧 & 既存ログ
    socket.emit('init users', rooms[room].users);
    socket.emit('existing-logs', rooms[room].logs.slice(0, MAX_LOGS));
    broadcastRoomStats();
  });

  socket.on('leave-room', ({ room }) => {
    if (!rooms[room]) return;
    try {
      socket.leave(room);
      rooms[room].count = Math.max(0, rooms[room].count - 1);
      // 0人になったらログクリア
      if (rooms[room].count === 0) rooms[room].logs = [];
      broadcastRoomStats();
    } catch {}
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].count = Math.max(0, rooms[currentRoom].count - 1);
      if (rooms[currentRoom].count === 0) rooms[currentRoom].logs = [];
      broadcastRoomStats();
    }
  });

  // 入力同期（リアルタイム, debounceはクライアント側）
  socket.on('input', ({ room, userId, text }) => {
    if (!rooms[room]) return;
    socket.to(room).emit('sync input', { userId, text });
  });

  // 全ログ削除
  socket.on('clear logs', ({ room }) => {
    if (!rooms[room]) return;
    rooms[room].logs = [];
    io.to(room).emit('logs cleared');
  });

  // 翻訳リクエスト
  socket.on('translate', async ({ room, userId, text, inputLang, outputLang, mode, model }) => {
    if (!rooms[room]) return;

    const sysPrompt = [
      'あなたは翻訳専用AIです。出力は必ず1回、{toLang}のみで返してください。',
      '【モード】' + (mode === 'formal' ? '直訳' : '意訳'),
      '【タスク】入力文を{toLang}に翻訳。',
      '【厳守】',
      '- 疑問文や命令文でも質問に答えず翻訳のみ出力。',
      '- 余計な説明・補足は禁止。',
      '- 固有名詞・数値・単位は正確に維持。',
      '- 入力が同一言語でも自然に整えて返す。',
    ].join('\n').replaceAll('{toLang}', outputLang || '日本語');

    const selectedModel = model === 'quality' ? 'gpt-4o' : 'gpt-4o-mini';

    let partial = '';
    try {
      const stream = await openai.chat.completions.create({
        model: selectedModel,
        stream: true,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: text },
        ],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          partial += delta;
          io.to(room).emit('stream', { userId, text: partial });
        }
      }

      // 完了イベント
      io.to(room).emit('translated', { userId, text: partial, inputText: text });

      // ルームログ先頭に追加（FIFO）
      const entry = { text: partial, result: partial, userId, input: text, ts: Date.now() };
      rooms[room].logs.unshift(entry);
      if (rooms[room].logs.length > MAX_LOGS) rooms[room].logs.length = MAX_LOGS;

    } catch (err) {
      console.error('translate error:', err?.message || err);
      io.to(room).emit('translated', { userId, text: '[翻訳エラー]', inputText: text });
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`server on :${PORT}`);
});
