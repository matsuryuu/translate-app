console.log("✅ client.js loaded");
const socket = io("https://translate-app-backend.onrender.com", { withCredentials: true, transports: ["websocket"] });
let currentRoom = null;

function toast(msg) {
  const t = document.createElement("div");
  t.innerText = msg;
  t.style =
    "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#a7d2f4;padding:10px 16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-weight:600;z-index:9999;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}
function originUrl() {
  return window.location.origin;
}

// 🩵 共有メニュー
function copyMainLink() {
  navigator.clipboard.writeText(originUrl()).then(() => toast("✅ URLをコピーしました"));
}
function shareLink() {
  const url = originUrl();
  if (navigator.share) {
    navigator.share({ title: "リアルタイム翻訳くん🌏", text: "この翻訳ルームに入ってね！", url });
  } else {
    copyMainLink();
  }
}
function toggleSharePanel() {
  const p = document.getElementById("share-panel");
  p.style.display = p.style.display === "block" ? "none" : "block";
  if (p.style.display === "block") {
    updateShareLinks();
    buildRoomLinks();
  }
}
function updateShareLinks() {
  const url = originUrl();
  document.getElementById("mailto-link").href = `mailto:?subject=翻訳ルームURL&body=${encodeURIComponent(url)}`;
  document.getElementById("slack-link").href = `https://slack.com/app_redirect?team=&channel=&message=${encodeURIComponent(url)}`;
}
function buildRoomLinks() {
  const root = originUrl();
  const linksDiv = document.getElementById("room-links");
  linksDiv.innerHTML = "";
  ["room1", "room2", "room3"].forEach((r) => {
    const a = document.createElement("a");
    a.href = `${root}/?room=${r}`;
    a.textContent = `${r}: ${root}/?room=${r}`;
    a.target = "_blank";
    linksDiv.appendChild(a);
    linksDiv.appendChild(document.createElement("br"));
  });
}

// 🧾 QRコード
function toggleQRCode() {
  const wrap = document.getElementById("qr-wrap");
  if (wrap.style.display === "block") {
    wrap.style.display = "none";
    return;
  }
  const canvas = document.getElementById("qr-canvas");
  new QRious({ element: canvas, value: originUrl(), size: 220, level: "H" });
  wrap.style.display = "block";
  toast("🧾 QRコードを生成しました");
}

// 🪄 ルーム関連
function joinRoom(room) {
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
  document.getElementById("room-switch").value = room;
}
function leaveRoom() {
  if (currentRoom) {
    socket.emit("leave room", { room: currentRoom });
    currentRoom = null;
  }
  document.getElementById("main-app").style.display = "none";
  document.getElementById("room-select").style.display = "block";
  document.getElementById("users").innerHTML = "";
}
function switchRoom(targetRoom) {
  if (targetRoom === currentRoom) return;
  socket.emit("leave room", { room: currentRoom });
  socket.emit("join room", { room: targetRoom });
  currentRoom = targetRoom;
  document.getElementById("room-switch").value = targetRoom;
  toast(`🏠 ${targetRoom} に移動しました`);
}

// 💬 初期入室
window.addEventListener("load", () => {
  const p = new URLSearchParams(window.location.search);
  const r = p.get("room");
  if (r && ["room1", "room2", "room3"].includes(r)) {
    joinRoom(r);
  } else {
    document.getElementById("room-select").style.display = "block";
    document.getElementById("main-app").style.display = "none";
  }
});

// 🧩 ユーザーUI生成
function addUserBox(uid, name) {
  const usersDiv = document.getElementById("users");
  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3>${name}</h3>
    <div class="lang-controls">
      <label>入力:</label>
      <select id="input-lang-${uid}">
        <option value="auto">自動</option><option value="ja">日本語</option>
        <option value="zh">中国語</option><option value="ko">韓国語</option><option value="en">英語</option>
      </select>
      <label>出力:</label>
      <select id="output-lang-${uid}">
        <option value="ja">日本語</option><option value="zh">中国語</option>
        <option value="ko">韓国語</option><option value="en">英語</option>
      </select>
      <button id="btn-translate-${uid}" class="btn-translate">翻訳</button>
    </div>
    <textarea id="input-${uid}" class="text" placeholder="入力してください"></textarea>
    <textarea id="output-${uid}" class="text output" readonly></textarea>
    <div class="log" id="log-${uid}"></div>`;
  usersDiv.appendChild(box);

  if (uid === 1) setLang(uid, "ja", "zh");
  if (uid === 2) setLang(uid, "zh", "ja");
  if (uid === 3) setLang(uid, "auto", "ja");

  const inputEl = document.getElementById(`input-${uid}`);
  inputEl.addEventListener("input", (e) =>
    socket.emit("input", { room: currentRoom, userId: uid, text: e.target.value })
  );

  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
    const text = inputEl.value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const mode = document.getElementById("mode-select").value;
    const model = document.getElementById("model-select").value;
    const out = document.getElementById(`output-${uid}`);
    out.value = "翻訳中…";
    socket.emit("translate", {
      room: currentRoom,
      userId: uid,
      text,
      inputLang,
      outputLang,
      mode,
      model
    });
  });
}
function setLang(uid, i, o) {
  document.getElementById(`input-lang-${uid}`).value = i;
  document.getElementById(`output-lang-${uid}`).value = o;
}
function emitAddUser() {
  socket.emit("add user", { room: currentRoom });
}
function emitRemoveUser() {
  socket.emit("remove user", { room: currentRoom });
}
function clearAllLogs() {
  socket.emit("clear logs", { room: currentRoom });
}

// Socketイベント
socket.on("init users", (u) => {
  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
});
socket.on("users updated", (u) => {
  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
});
socket.on("sync input", ({ userId, text }) => {
  const el = document.getElementById(`input-${userId}`);
  if (el && el.value !== text) el.value = text;
});
socket.on("stream", ({ userId, text }) => {
  const el = document.getElementById(`output-${userId}`);
  if (el) el.value = text;
});
socket.on("translated", ({ userId, text }) => {
  const out = document.getElementById(`output-${userId}`);
  const log = document.getElementById(`log-${userId}`);
  if (out) out.value = text;
  if (log) log.innerHTML = `<div class='output'>${text}</div>` + log.innerHTML;
});
