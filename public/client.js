console.log("✅ client.js loaded");

// 本番（Render）
const socket = io("https://translate-app-backend.onrender.com");
// 開発（ローカル）: // const socket = io();

let currentUsers = 0;
const maxUsers = 5;
const minUsers = 2;
let recognitionInstances = {};

// ====== 初期ユーザー描画 ======
socket.on("init users", (users) => {
  const usersDiv = document.getElementById("users");
  usersDiv.innerHTML = "";

  currentUsers = Object.keys(users).length;

  for (const [uid, name] of Object.entries(users)) {
    addUserBox(uid, name);
  }
});

// ====== 過去ログ描画 ======
socket.on("init logs", (logs) => {
  logs.forEach(({ userId, inputText, result }) => {
    prependLog(userId, inputText, result);
  });
});

// ====== 入力同期反映 ======
socket.on("sync input", ({ userId, text }) => {
  const input = document.getElementById(`input-${userId}`);
  if (input && input.value !== text) {
    input.value = text;
  }
});

// ====== 名前更新 ======
socket.on("name updated", ({ userId, newName }) => {
  const username = document.getElementById(`username-${userId}`);
  if (username) username.textContent = newName;
});

// ====== 翻訳結果（途中） ======
socket.on("stream result", ({ userId, partial }) => {
  const output = document.getElementById(`output-${userId}`);
  if (output) output.value = partial;
});

// ====== 翻訳結果（確定） ======
socket.on("final result", ({ userId, result, inputText }) => {
  const output = document.getElementById(`output-${userId}`);
  if (output) output.value = result;
  prependLog(userId, inputText, result);
});

// ====== 翻訳エラー ======
socket.on("translate error", ({ userId, message }) => {
  alert(`ユーザー${userId}の翻訳エラー: ${message}`);
});

// ====== ログ全削除 ======
socket.on("logs cleared", () => {
  document.querySelectorAll(".log").forEach((el) => el.remove());
});

// ====== ユーザー追加 ======
function addUserBox(uid, name) {
  const usersDiv = document.getElementById("users");

  const box = document.createElement("div");
  box.className = "user-box";
  box.innerHTML = `
    <h3 id="username-${uid}">${name}</h3>
    <label>入力言語: <select id="input-lang-${uid}">
      <option value="auto">自動</option>
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select></label>
    <textarea id="input-${uid}" placeholder="入力してください"></textarea>
    <button id="btn-translate-${uid}">翻訳</button>
    <label>出力言語: <select id="output-lang-${uid}">
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select></label>
    <textarea id="output-${uid}" readonly></textarea>
    <div id="log-${uid}" class="log"></div>
  `;

  usersDiv.appendChild(box);

  // 入力リアルタイム同期
  const input = document.getElementById(`input-${uid}`);
  input.addEventListener("input", () => {
    socket.emit("input", { userId: uid, text: input.value });
  });

  // 翻訳ボタン
  document
    .getElementById(`btn-translate-${uid}`)
    .addEventListener("click", () => {
      const text = document.getElementById(`input-${uid}`).value;
      const inputLang = document.getElementById(`input-lang-${uid}`).value;
      const outputLang = document.getElementById(`output-lang-${uid}`).value;
      const model = document.getElementById("model-select").value;
      const mode = document.getElementById("mode-select").value;

      socket.emit("translate", {
        userId: uid,
        text,
        inputLang,
        outputLang,
        model,
        mode,
      });
    });
}

// ====== ログ追加 ======
function prependLog(userId, inputText, result) {
  const logDiv = document.getElementById(`log-${userId}`);
  if (!logDiv) return;

  const entry = document.createElement("div");
  entry.className = "log";
  entry.innerHTML = `<div style="color:gray">${inputText}</div><div style="color:black">${result}</div>`;

  logDiv.prepend(entry);
}
