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

function originUrl(){ return window.location.origin; }

// コピー
function copyMainLink(){
  const url = originUrl();
  navigator.clipboard.writeText(url).then(()=> toast("✅ URLをコピーしました"));
}

// Web Share API
function shareLink(){
  const url = originUrl();
  if(navigator.share){
    navigator.share({ title:"リアルタイム翻訳くん 🌏", text:"翻訳ルームの入口です！", url });
  }else{ copyMainLink(); }
}

// メニュー開閉
function toggleSharePanel(){
  const p = document.getElementById("share-panel");
  p.style.display = (p.style.display === "block" ? "none" : "block");
  if(p.style.display === "block"){ updateShareLinks(); buildRoomLinks(); }
}

// メール/Slack/ルームリンク更新
function updateShareLinks(){
  const url = originUrl();
  const subject = encodeURIComponent("翻訳ルームURL");
  const body = encodeURIComponent(`ここから入室できます：\n${url}`);
  document.getElementById("mailto-link").href = `mailto:?subject=${subject}&body=${body}`;
  const text = encodeURIComponent(`翻訳ルームURL: ${url}`);
  document.getElementById("slack-link").href = `https://slack.com/app_redirect?team=&channel=&message=${text}`;
}

// ルームリンク改行つき
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
    linksDiv.appendChild(document.createElement("br"));
  });
}

// QRコード即時表示
function showQRCode(){
  const url = originUrl();
  const canvas = document.getElementById("qr-canvas");
  new QRious({ element:canvas, value:url, size:220, level:"H" });
  toast("🧾 QRコードを生成しました");
}

// ===== ルーム操作 =====
function joinRoom(room){
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}
function leaveRoom(){
  if(currentRoom){ socket.emit("leave room", { room:currentRoom }); currentRoom=null; }
  document.getElementById("main-app").style.display="none";
  document.getElementById("room-select").style.display="block";
  document.getElementById("users").innerHTML="";
}

// URLクエリ自動入室
(function(){
  const p = new URLSearchParams(window.location.search);
  const r = p.get("room");
  if(r && ["room1","room2","room3"].includes(r)){
    window.addEventListener("load", ()=> joinRoom(r));
  }
})();

// ===== UI構築 =====
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
        <option value="auto">自動</option><option value="ja">日本語</option>
        <option value="zh">中国語</option><option value="ko">韓国語</option><option value="en">英語</option>
      </select>
      <button id="btn-translate-${uid}" class="btn-translate">翻訳</button>
      <label>出力:</label>
      <select id="output-lang-${uid}">
        <option value="ja">日本語</option><option value="zh">中国語</option>
        <option value="ko">韓国語</option><option value="en">英語</option>
      </select>
    </div>
    <textarea id="input-${uid}" class="text" placeholder="入力してください"></textarea>
    <textarea id="output-${uid}" class="text output" readonly></textarea>
    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  if(uid===1){inputLang(uid,"ja","zh");}
  if(uid===2){inputLang(uid,"zh","ja");}
  if(uid===3){inputLang(uid,"auto","ja");}

  const inputEl=document.getElementById(`input-${uid}`);
  inputEl.addEventListener("input",e=>socket.emit("input",{room:currentRoom,userId:uid,text:e.target.value}));
  document.getElementById(`btn-translate-${uid}`).addEventListener("click",()=>{
    const text=inputEl.value, inputLangVal=document.getElementById(`input-lang-${uid}`).value, outputLang=document.getElementById(`output-lang-${uid}`).value;
    const out=document.getElementById(`output-${uid}`); out.value="翻訳中…";
    socket.emit("translate",{room:currentRoom,userId:uid,text,inputLang:inputLangVal,outputLang});
  });
}

function inputLang(uid,i,o){
  document.getElementById(`input-lang-${uid}`).value=i;
  document.getElementById(`output-lang-${uid}`).value=o;
}

function emitAddUser(){ socket.emit("add user",{room:currentRoom}); }
function emitRemoveUser(){ socket.emit("remove user",{room:currentRoom}); }
function clearAllLogs(){ socket.emit("clear logs",{room:currentRoom}); }

socket.on("init users",users=>{
  const div=document.getElementById("users");div.innerHTML="";
  Object.entries(users).forEach(([id,name])=>addUserBox(Number(id),name));
});
socket.on("users updated",users=>{
  const div=document.getElementById("users");div.innerHTML="";
  Object.entries(users).forEach(([id,name])=>addUserBox(Number(id),name));
});
socket.on("sync input",({userId,text})=>{
  const el=document.getElementById(`input-${userId}`);
  if(el && el.value!==text) el.value=text;
});
socket.on("stream result",({userId,partial})=>{
  const el=document.getElementById(`output-${userId}`);
  if(el) el.value=partial;
});
socket.on("final result",({userId,result,inputText})=>{
  const out=document.getElementById(`output-${userId}`);
  const log=document.getElementById(`log-${userId}`);
  if(out) out.value=result;
  if(log) log.innerHTML=`<div class="input">${inputText}</div><div class="output">${result}</div>`+log.innerHTML;
});

window.copyMainLink=copyMainLink;
window.shareLink=shareLink;
window.toggleSharePanel=toggleSharePanel;
window.showQRCode=showQRCode;
window.joinRoom=joinRoom;
window.leaveRoom=leaveRoom;
window.emitAddUser=emitAddUser;
window.emitRemoveUser=emitRemoveUser;
window.clearAllLogs=clearAllLogs;
