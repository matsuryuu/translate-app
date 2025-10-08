console.log("✅ client.js loaded");

// ===== Socket接続 =====
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket", "polling"],
});

let currentRoom = null;

// ===== 共有ユーティリティ =====
function toast(msg){
  const t = document.createElement("div");
  t.innerText = msg;
  t.style = `
    position:fixed; left:50%; bottom:28px; transform:translateX(-50%);
    background:#a7d2f4; color:#000; padding:10px 16px; border-radius:10px;
    box-shadow:0 2px 8px rgba(0,0,0,.2); z-index:9999; font-weight:600;
  `;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 1800);
}

function originUrl(){
  // 入口URL（クエリやパスがあってもホスト根本を配る運用）
  return window.location.origin;
}

// コピー
function copyMainLink(){
  const url = originUrl();
  navigator.clipboard.writeText(url).then(()=> toast("✅ URLをコピーしました"));
}

// Web Share API（スマホ向け）
function shareLink(){
  const url = originUrl();
  if(navigator.share){
    navigator.share({
      title: "リアルタイム翻訳くん 🌏",
      text: "この翻訳ルームの入口です。入って使ってね！",
      url
    }).catch(()=>{ /* キャンセル時は無視 */ });
  }else{
    copyMainLink();
  }
}

// 共有メニューの開閉
function toggleSharePanel(){
  const p = document.getElementById("share-panel");
  p.style.display = (p.style.display === "block" ? "none" : "block");
  if(p.style.display === "block"){
    updateShareLinks();
    buildRoomLinks();
  }
}

// メール/Slackリンク＆QR更新
function updateShareLinks(){
  const url = originUrl();
  // mailto
  const subject = encodeURIComponent("翻訳ルームの入口URL");
  const body    = encodeURIComponent(`このページから入室してください：\n${url}\n\nRoom1/2/3 のいずれかに入ってください。`);
  const mailto  = `mailto:?subject=${subject}&body=${body}`;
  document.getElementById("mailto-link").setAttribute("href", mailto);

  // Slack（ブラウザから投稿画面へ遷移する簡易方式）
  const text = encodeURIComponent(`翻訳ルームURL: ${url}\n入室後に Room1/2/3 を選んでください。`);
  const slack = `https://slack.com/app_redirect?team=&channel=&message=${text}`;
  document.getElementById("slack-link").setAttribute("href", slack);
}

// ルーム直リンクを生成（?room=room1 のように付与）
function buildRoomLinks(){
  const root = originUrl();
  const linksDiv = document.getElementById("room-links");
  linksDiv.innerHTML = "";
  ["room1","room2","room3"].forEach(r=>{
    const a = document.createElement("a");
    a.href = `${root}/?room=${r}`;
    a.textContent = `${r}: ${root}/?room=${r}`;
    a.target = "_blank";
    linksDiv.appendChild(a);
  });
}

// QRコード
let qrInstance = null;
function showQRCode(){
  const url = originUrl();
  const wrap = document.getElementById("qr-wrap");
  const canvas = document.getElementById("qr-canvas");
  qrInstance = new QRious({
    element: canvas, value: url, size: 220, level: "H",
  });
  wrap.style.display = "block";
}
function hideQRCode(){
  const wrap = document.getElementById("qr-wrap");
  wrap.style.display = "none";
}

// ===== ルーム入退室 =====
function joinRoom(room){
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}
function leaveRoom(){
  if(currentRoom){
    socket.emit("leave room", { room: currentRoom });
    currentRoom = null;
  }
  document.getElementById("main-app").style.display = "none";
  document.getElementById("room-select").style.display = "block";
  document.getElementById("users").innerHTML = "";
}

// URLに ?room=roomX があれば自動入室（配布リンクからの導線）
(function autoJoinFromQuery(){
  const params = new URLSearchParams(window.location.search);
  const r = params.get("room");
  if(r && ["room1","room2","room3"].includes(r)){
    // 少し遅らせてUIが描画された後に実行
    window.addEventListener("load", ()=> joinRoom(r));
  }
})();

// ===== 既存 UI 構築 =====
function addUserBox(uid, name){
  const usersDiv = document.getElementById("users");
  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3>${name}</h3>
    <div class="lang-controls">
      <label>入力:</label>
      <select id="input-lang-${uid}">
        <option value="auto">自動</option>
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
      <button id="btn-translate-${uid}" class="btn-translate">翻訳</button>
      <label>出力:</label>
      <select id="output-lang-${uid}">
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
    </div>
    <textarea id="input-${uid}" class="text" placeholder="入力してください"></textarea>
    <textarea id="output-${uid}" class="text output" readonly></textarea>
    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  // 既定言語
  if(uid===1){ document.getElementById(`input-lang-${uid}`).value="ja";  document.getElementById(`output-lang-${uid}`).value="zh"; }
  if(uid===2){ document.getElementById(`input-lang-${uid}`).value="zh";  document.getElementById(`output-lang-${uid}`).value="ja"; }
  if(uid===3){ document.getElementById(`input-lang-${uid}`).value="auto";document.getElementById(`output-lang-${uid}`).value="ja"; }

  // 入力同期
  const inputEl = document.getElementById(`input-${uid}`);
  inputEl.addEventListener("input", (e)=>{
    socket.emit("input", { room: currentRoom, userId: uid, text: e.target.value });
  });

  // 翻訳
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", ()=>{
    const text = inputEl.value;
    const inputLang  = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const outputBox  = document.getElementById(`output-${uid}`);
    outputBox.value = "翻訳中…";
    socket.emit("translate", { room: currentRoom, userId: uid, text, inputLang, outputLang });
  });
}

// トップの操作
function emitAddUser(){ socket.emit("add user", { room: currentRoom }); }
function emitRemoveUser(){ socket.emit("remove user", { room: currentRoom }); }
function clearAllLogs(){ socket.emit("clear logs", { room: currentRoom }); }

// ソケットイベント
socket.on("init users", (usersMap)=>{
  document.getElementById("users").innerHTML = "";
  Object.entries(usersMap).forEach(([uid, name])=> addUserBox(Number(uid), name));
});
socket.on("users updated", (usersMap)=>{
  document.getElementById("users").innerHTML = "";
  Object.entries(usersMap).forEach(([uid, name])=> addUserBox(Number(uid), name));
});
socket.on("sync input", ({ userId, text })=>{
  const el = document.getElementById(`input-${userId}`);
  if(el && el.value !== text) el.value = text;
});
socket.on("stream result", ({ userId, partial })=>{
  const el = document.getElementById(`output-${userId}`);
  if(el) el.value = partial;
});
socket.on("final result", ({ userId, result, inputText })=>{
  const out = document.getElementById(`output-${userId}`);
  const log = document.getElementById(`log-${userId}`);
  if(out) out.value = result;
  if(log) log.innerHTML = `<div class="input">${inputText}</div><div class="output">${result}</div>` + log.innerHTML;
});

// グローバルに公開（HTMLから呼ぶ用）
window.copyMainLink = copyMainLink;
window.shareLink = shareLink;
window.toggleSharePanel = toggleSharePanel;
window.showQRCode = showQRCode;
window.hideQRCode = hideQRCode;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.emitAddUser = emitAddUser;
window.emitRemoveUser = emitRemoveUser;
window.clearAllLogs = clearAllLogs;
