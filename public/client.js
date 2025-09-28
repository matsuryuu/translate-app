console.log("✅ client.js loaded");

// 本番（Render）
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket", "polling"]
});
// 開発（ローカル）: // const socket = io();

let currentUsers = 0;
const maxUsers = 5;
const minUsers = 2;
let recognitionInstances = {};

function addUser() {
  if (currentUsers >= maxUsers) return;
  currentUsers++;
  const uid = currentUsers;

  const usersDiv = document.getElementById("users");

  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3 id="username-${uid}">ユーザー${uid}</h3>
    入力言語:
    <select id="input-lang-${uid}">
      <option value="auto">自動</option>
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select>
    <input type="text" id="input-${uid}" placeholder="入力してください">
    <button id="btn-translate-${uid}">翻訳</button>
    出力言語:
    <select id="output-lang-${uid}">
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select>
    <textarea id="output-${uid}" readonly></textarea>
    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  // 入力同期
  document.getElementById(`input-${uid}`).addEventListener("input", (e) => {
    socket.emit("input", { userId: uid, text: e.target.value });
  });

  // 翻訳処理
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
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
      mode
    });
  });
}

// 最初に2ユーザー表示
for (let i = 0; i < 2; i++) addUser();

// ========== ソケットイベント ==========

// 入力同期
socket.on("sync input", ({ userId, text }) => {
  const el = document.getElementById(`input-${userId}`);
  if (el && el.value !== text) { // ✅ 同じ内容なら上書きしない
    el.value = text;
  }
});

// 翻訳ストリーム結果
socket.on("stream result", ({ userId, partial }) => {
  const el = document.getElementById(`output-${userId}`);
  if (el) el.value = partial;
});

// 翻訳完了
socket.on("final result", ({ userId, result, inputText }) => {
  const logEl = document.getElementById(`log-${userId}`);
  if (logEl) {
    logEl.innerHTML =
      `<div class="input">${inputText}</div><div class="output">${result}</div>` +
      logEl.innerHTML;
  }
});

// ログ全削除
function clearAllLogs() {
  socket.emit("clear logs", {});
  for (let i = 1; i <= currentUsers; i++) {
    const logEl = document.getElementById(`log-${i}`);
    if (logEl) logEl.innerHTML = "";
  }
}
