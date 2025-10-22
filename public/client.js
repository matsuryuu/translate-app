console.log("✅ client.js loaded");

const backend = "https://translate-app-backend.onrender.com";
const socket = io(backend);

const params = new URLSearchParams(window.location.search);
let currentRoom = params.get("room") || "room1";
socket.emit("join-room", currentRoom);

const userContainer = document.createElement("div");
userContainer.className = "user-container";
document.body.appendChild(userContainer);

let userCount = 3;

const defaultLang = [
  { in: "日本語", out: "中国語" },
  { in: "中国語", out: "日本語" },
  { in: "自動認識", out: "日本語" },
];

function buildUI() {
  document.body.innerHTML = `
    <h2>${currentRoom.toUpperCase()} 🏠</h2>
    <div class="top-buttons">
      <button onclick="backHome()">← 戻る</button>
      <button onclick="addUser()">＋追加</button>
      <button onclick="removeUser()">－削除</button>
      <select id="mode"><option>意訳</option><option>直訳</option></select>
      <select id="model"><option value="quality">精度重視</option><option value="speed">速度重視</option></select>
      <button onclick="clearLogs()" style="background:#ffd4d4;">全ログ削除</button>
      <select id="roomSelect" onchange="switchRoom()">
        <option value="room1">ルーム1</option>
        <option value="room2">ルーム2</option>
        <option value="room3">ルーム3</option>
      </select>
    </div>
    <div id="userContainer" class="user-container"></div>
  `;
  generateUsers();
}

function generateUsers() {
  const c = document.getElementById("userContainer");
  c.innerHTML = "";
  for (let i = 1; i <= userCount; i++) {
    const b = document.createElement("div");
    b.className = "user-box";
    b.innerHTML = `
      <h3>ユーザー${i}</h3>
      <div>
        入力:
        <select id="inLang${i}">
          <option>自動認識</option><option>日本語</option><option>中国語</option><option>英語</option><option>韓国語</option>
        </select>
        出力:
        <select id="outLang${i}">
          <option>日本語</option><option>中国語</option><option>英語</option><option>韓国語</option>
        </select>
        <button id="btn${i}" style="background:#ffb5b5;">翻訳</button>
      </div>
      <textarea id="input${i}" placeholder="入力してください"></textarea>
      <textarea id="output${i}" readonly></textarea>
    `;
    c.appendChild(b);
  }

  defaultLang.forEach((cfg, i) => {
    const n = i + 1;
    if (document.getElementById(`inLang${n}`)) {
      document.getElementById(`inLang${n}`).value = cfg.in;
      document.getElementById(`outLang${n}`).value = cfg.out;
    }
  });

  for (let i = 1; i <= userCount; i++) {
    document.getElementById(`btn${i}`).onclick = () => translate(i);
  }
}

function translate(id) {
  const text = document.getElementById(`input${id}`).value.trim();
  const fromLang = document.getElementById(`inLang${id}`).value;
  const toLang = document.getElementById(`outLang${id}`).value;
  const mode = document.getElementById("mode").value;
  const model = document.getElementById("model").value;
  if (!text) return;

  const out = document.getElementById(`output${id}`);
  out.value = "翻訳中...";
  socket.emit("translate", { text, mode, fromLang, toLang, model });
}

socket.on("stream", (data) => {
  document.querySelectorAll("textarea[id^='output']").forEach(o => o.value = data.text);
});

socket.on("translated", (data) => {
  document.querySelectorAll("textarea[id^='output']").forEach(o => o.value = data.text);
});

socket.on("existing-logs", (logs) => {
  logs.forEach((log) => {
    const last = document.querySelector("textarea[id^='output']");
    if (last) last.value = log.result;
  });
});

function addUser() {
  if (userCount < 5) { userCount++; generateUsers(); }
}
function removeUser() {
  if (userCount > 1) { userCount--; generateUsers(); }
}
function clearLogs() {
  document.querySelectorAll("textarea[id^='output']").forEach(o => o.value = "");
}
function switchRoom() {
  const room = document.getElementById("roomSelect").value;
  window.location.href = `/?room=${room}`;
}
function backHome() {
  window.location.href = "https://translate-app-topaz.vercel.app/";
}

buildUI();
