// client.js — フロントエンド
// --------------------------------------------
console.log("✅ client.js loaded");

// Render接続（WebSocket固定）
const socket = io("https://translate-app-backend.onrender.com", {
  transports: ["websocket"]
});

let roomId = null;
let currentMode = "意訳";
let currentModel = "gpt-4o"; // 精度重視
const logs = [];

// ----------------------
// 📌 ページロード時処理
// ----------------------
window.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  if (path.includes("room")) {
    roomId = path.split("room")[1];
    socket.emit("joinRoom", roomId);
    setupRoomUI();
  }
});

// ----------------------
// 🧩 初期化イベント
// ----------------------
socket.on("initRoom", ({ logs: oldLogs, mode, model }) => {
  currentMode = mode;
  currentModel = model;
  oldLogs.forEach(addLog);
  document.getElementById("mode-select").value = mode;
  document.getElementById("model-select").value = model;
});

// ----------------------
// 🧠 入力同期
// ----------------------
socket.on("inputSync", ({ uid, text }) => {
  const input = document.getElementById(`input-${uid}`);
  if (input && input.value !== text) input.value = text;
});

// ----------------------
// 💬 Streaming表示
// ----------------------
socket.on("streamResult", ({ uid, textChunk }) => {
  const output = document.getElementById(`output-${uid}`);
  if (output) output.value += textChunk;
});

// ----------------------
// ✅ 翻訳完了
// ----------------------
socket.on("finalResult", ({ uid, text }) => {
  const output = document.getElementById(`output-${uid}`);
  if (output) {
    output.value = text;
    addLog({ uid, resultText: text });
  }
});

// ----------------------
// 🧹 ログ削除
// ----------------------
socket.on("logsCleared", () => {
  document.getElementById("logs").innerHTML = "";
});

// ----------------------
// 🔄 モード／モデル更新
// ----------------------
socket.on("modeUpdated", (mode) => {
  currentMode = mode;
  document.getElementById("mode-select").value = mode;
});
socket.on("modelUpdated", (model) => {
  currentModel = model;
  document.getElementById("model-select").value = model;
});

// ----------------------
// 🧩 UI構築
// ----------------------
function setupRoomUI() {
  const container = document.getElementById("app");
  container.innerHTML = `
    <div class="toolbar">
      <button onclick="goBack()">←戻る</button>
      <button onclick="addUser()">ユーザー追加</button>
      <button onclick="removeUser()">ユーザー削除</button>
      <select id="mode-select" onchange="updateMode(this.value)">
        <option value="意訳">意訳</option>
        <option value="直訳">直訳</option>
      </select>
      <select id="model-select" onchange="updateModel(this.value)">
        <option value="gpt-4o" selected>精度重視（GPT-4o）</option>
        <option value="gpt-4o-mini">速度重視（GPT-4o-mini）</option>
      </select>
      <button onclick="clearLogs()">全ログ削除</button>
      <select id="room-switch" onchange="switchRoom(this.value)">
        <option value="1">Room1</option>
        <option value="2">Room2</option>
        <option value="3">Room3</option>
      </select>
    </div>
    <div id="user-container"></div>
    <div id="logs" class="logs"></div>
  `;
  addUser(); addUser(); addUser(); // 初期3人
}

// ----------------------
// 🧍‍♂️ ユーザー管理
// ----------------------
let userCount = 0;
function addUser() {
  if (userCount >= 3) return;
  userCount++;
  const uid = userCount;
  const userBox = document.createElement("div");
  userBox.className = "user-box";
  userBox.innerHTML = `
    <h3>ユーザー${uid}</h3>
    <div class="lang-selects">
      <label>入力:</label>
      <select id="input-lang-${uid}">
        <option>日本語</option>
        <option>中国語</option>
        <option>韓国語</option>
        <option>英語</option>
        <option>自動</option>
      </select>
      <label>出力:</label>
      <select id="output-lang-${uid}">
        <option>日本語</option>
        <option selected>中国語</option>
        <option>韓国語</option>
        <option>英語</option>
      </select>
      <button class="translate-btn" onclick="translateText(${uid})">翻訳</button>
    </div>
    <textarea id="input-${uid}" class="input" placeholder="入力..." oninput="syncInput(${uid})"></textarea>
    <div class="output-wrap">
      <textarea id="output-${uid}" class="output" readonly></textarea>
      <button class="copy-btn" onclick="copyOutput(${uid})">📋</button>
    </div>
  `;
  document.getElementById("user-container").appendChild(userBox);
}

function removeUser() {
  if (userCount <= 1) return;
  const last = document.getElementById("user-container").lastChild;
  last.remove();
  userCount--;
}

// ----------------------
// 🔁 各種操作
// ----------------------
function syncInput(uid) {
  const text = document.getElementById(`input-${uid}`).value;
  socket.emit("inputUpdate", { roomId, uid, text });
}

function translateText(uid) {
  const inputText = document.getElementById(`input-${uid}`).value;
  const inputLang = document.getElementById(`input-lang-${uid}`).value;
  const outputLang = document.getElementById(`output-lang-${uid}`).value;
  const output = document.getElementById(`output-${uid}`);
  output.value = "翻訳中…";
  socket.emit("translate", { roomId, uid, inputText, inputLang, outputLang });
}

function updateMode(mode) {
  socket.emit("updateMode", mode);
}

function updateModel(model) {
  socket.emit("updateModel", model);
}

function clearLogs() {
  socket.emit("clearLogs", roomId);
}

function goBack() {
  window.location.href = "/";
}

function switchRoom(room) {
  window.location.href = `/room${room}`;
}

// ----------------------
// 📋 コピー機能
// ----------------------
function copyOutput(uid) {
  const output = document.getElementById(`output-${uid}`);
  if (output) {
    navigator.clipboard.writeText(output.value);
    alert("✅ 翻訳結果をコピーしました");
  }
}

// ----------------------
// 📜 ログ追加
// ----------------------
function addLog({ uid, resultText }) {
  const log = document.createElement("div");
  log.className = "log-item";
  log.textContent = `ユーザー${uid}: ${resultText}`;
  document.getElementById("logs").prepend(log);
}
