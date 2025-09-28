console.log("✅ client.js loaded");

// 本番
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket", "polling"]
});

let currentRoom = null;
let userOrder = [];

// ====== 部屋選択 ======
function joinRoom(room){
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display="none";
  document.getElementById("main-app").style.display="block";
}

function copyRoomLink(room){
  const url = `${window.location.origin}?room=${room}`;
  navigator.clipboard.writeText(url).then(()=>{
    alert("URLをコピーしました！\n" + url);
  });
}

// ====== UI構築 ======
function addUserBox(uid, name){
  const usersDiv = document.getElementById("users");
  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3 id="username-${uid}">${name}</h3>
    入力言語:
    <select id="input-lang-${uid}">
      <option value="auto">自動</option>
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select>
    <textarea id="input-${uid}" class="text" placeholder="入力してください"></textarea>
    <button id="btn-translate-${uid}">翻訳</button>
    出力言語:
    <select id="output-lang-${uid}">
      <option value="ja">日本語</option>
      <option value="zh">中国語</option>
      <option value="ko">韓国語</option>
      <option value="en">英語</option>
    </select>
    <textarea id="output-${uid}" class="text output" readonly></textarea>
    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  // 初期設定
  if(uid===1){ document.getElementById(`input-lang-${uid}`).value="ja";
               document.getElementById(`output-lang-${uid}`).value="zh"; }
  if(uid===2){ document.getElementById(`input-lang-${uid}`).value="zh";
               document.getElementById(`output-lang-${uid}`).value="ja"; }
  if(uid===3){ document.getElementById(`input-lang-${uid}`).value="auto";
               document.getElementById(`output-lang-${uid}`).value="ja"; }

  // 入力同期
  document.getElementById(`input-${uid}`).addEventListener("input", (e)=>{
    socket.emit("input", { room:currentRoom, userId:uid, text:e.target.value });
  });

  // 翻訳
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", ()=>{
    const text = document.getElementById(`input-${uid}`).value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const model = document.getElementById("model-select").value;
    const mode = document.getElementById("mode-select").value;
    socket.emit("translate", { room:currentRoom, userId:uid, text, inputLang, outputLang, model, mode });
  });
}

// ====== ボタン ======
function emitAddUser(){ socket.emit("add user", { room:currentRoom }); }
function emitRemoveUser(){ socket.emit("remove user", { room:currentRoom }); }
function clearAllLogs(){ socket.emit("clear logs", { room:currentRoom }); }

// ====== ソケット ======
socket.on("init users", (usersMap)=>{
  document.getElementById("users").innerHTML="";
  Object.entries(usersMap).forEach(([uid,name])=> addUserBox(Number(uid), name));
});

socket.on("users updated", (usersMap)=>{
  document.getElementById("users").innerHTML="";
  Object.entries(usersMap).forEach(([uid,name])=> addUserBox(Number(uid), name));
});

socket.on("sync input", ({userId,text})=>{
  const el=document.getElementById(`input-${userId}`);
  if(el && el.value!==text){ el.value=text; }
});

socket.on("stream result", ({userId,partial})=>{
  const el=document.getElementById(`output-${userId}`);
  if(el){ el.value=partial; }
});

socket.on("final result", ({userId,result,inputText})=>{
  const logEl=document.getElementById(`log-${userId}`);
  if(logEl){
    logEl.innerHTML=`<div class="input">${inputText}</div><div class="output">${result}</div>`+logEl.innerHTML;
  }
});
