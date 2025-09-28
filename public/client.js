console.log("✅ client.js loaded");

// 本番（Render）
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket", "polling"]
});

let userOrder = [];          // [1,2,3,...] サーバのユーザー配列
let initialLogs = [];        // 接続直後に貰う全ログ（UI構築後に描画）

// ---------- ユーティリティ ----------
function autoResize(t){
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 600) + "px";
}

// ---------- UIビルド ----------
function rebuildUsers(usersMap){
  const usersDiv = document.getElementById("users");
  usersDiv.innerHTML = "";

  userOrder = Object.keys(usersMap).map(n => Number(n)).sort((a,b)=>a-b);

  for(const uid of userOrder){
    addUserBox(uid, usersMap[uid]);
  }
  // 初期ログを投下
  renderInitialLogs();
}

function addUserBox(uid, name){
  const usersDiv = document.getElementById("users");

  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3 id="username-${uid}">${name}</h3>

    <div class="row">
      <span>入力言語：</span>
      <select id="input-lang-${uid}">
        <option value="auto">自動</option>
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>

      <textarea id="input-${uid}" class="text grow" placeholder="入力してください"></textarea>
      <button id="btn-translate-${uid}">翻訳</button>
    </div>

    <div class="row" style="margin-top:6px">
      <span>出力言語：</span>
      <select id="output-lang-${uid}">
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
    </div>

    <textarea id="output-${uid}" class="text output" readonly></textarea>

    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  // 既定言語の適用：1=ja→zh, 2=zh→ja, 3~ = auto→ja
  const inSel  = document.getElementById(`input-lang-${uid}`);
  const outSel = document.getElementById(`output-lang-${uid}`);
  if(uid === 1){ inSel.value = "ja"; outSel.value = "zh"; }
  else if(uid === 2){ inSel.value = "zh"; outSel.value = "ja"; }
  else { inSel.value = "auto"; outSel.value = "ja"; }

  // 入力同期 + オートリサイズ
  const inputArea = document.getElementById(`input-${uid}`);
  inputArea.addEventListener("input", (e)=>{
    autoResize(e.target);
    socket.emit("input", { userId: uid, text: e.target.value });
  });
  // 初期高さ調整
  autoResize(inputArea);

  // 翻訳リクエスト
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", ()=>{
    const text = document.getElementById(`input-${uid}`).value;
    const inputLang  = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const model = document.getElementById("model-select").value;
    const mode  = document.getElementById("mode-select").value;

    socket.emit("translate", { userId: uid, text, inputLang, outputLang, model, mode });
  });
}

function renderInitialLogs(){
  if(!initialLogs.length) return;
  initialLogs.forEach(({userId, inputText, result})=>{
    const logEl = document.getElementById(`log-${userId}`);
    if(logEl){
      logEl.innerHTML =
        `<div class="input">${inputText}</div><div class="output">${result}</div>` +
        logEl.innerHTML;
    }
  });
}

// ---------- 画面上のボタン（トップ） ----------
function emitAddUser(){ socket.emit("add user", {}); }
function emitRemoveUser(){ socket.emit("remove user", {}); }
window.emitAddUser = emitAddUser;
window.emitRemoveUser = emitRemoveUser;
window.clearAllLogs = function(){
  socket.emit("clear logs", {});
  document.querySelectorAll(".log").forEach(el=> el.innerHTML="");
};

// ---------- ソケットイベント ----------
socket.on("init users", (usersMap)=>{ rebuildUsers(usersMap); });
socket.on("users updated", (usersMap)=>{ rebuildUsers(usersMap); });

socket.on("init logs", (logs)=>{ initialLogs = logs || []; renderInitialLogs(); });

socket.on("sync input", ({userId, text})=>{
  const el = document.getElementById(`input-${userId}`);
  if(el && el.value !== text){ el.value = text; autoResize(el); }
});

socket.on("stream result", ({userId, partial})=>{
  const el = document.getElementById(`output-${userId}`);
  if(el){ el.value = partial; autoResize(el); }
});

socket.on("final result", ({userId, result, inputText})=>{
  const out = document.getElementById(`output-${userId}`);
  if(out){ out.value = result; autoResize(out); }
  const logEl = document.getElementById(`log-${userId}`);
  if(logEl){
    logEl.innerHTML =
      `<div class="input">${inputText}</div><div class="output">${result}</div>` +
      logEl.innerHTML;
  }
});
