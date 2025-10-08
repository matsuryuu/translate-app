console.log("✅ client.js loaded");

const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket", "polling"]
});

let currentRoom = null;

function joinRoom(room) {
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}

function copyMainLink() {
  const url = window.location.origin;
  navigator.clipboard.writeText(url).then(() => {
    alert("URLをコピーしました！\n" + url);
  });
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

function addUserBox(uid, name) {
  const usersDiv = document.getElementById("users");
  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-box-${uid}`;
  box.innerHTML = `
    <h3>${name}</h3>
    <div class="lang-controls">
      <select id="input-lang-${uid}">
        <option value="auto">自動</option>
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
      <button id="btn-translate-${uid}" class="btn-translate">翻訳</button>
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

  if (uid === 1) {
    document.getElementById(`input-lang-${uid}`).value = "ja";
    document.getElementById(`output-lang-${uid}`).value = "zh";
  } else if (uid === 2) {
    document.getElementById(`input-lang-${uid}`).value = "zh";
    document.getElementById(`output-lang-${uid}`).value = "ja";
  } else if (uid === 3) {
    document.getElementById(`input-lang-${uid}`).value = "auto";
    document.getElementById(`output-lang-${uid}`).value = "ja";
  }

  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
    const text = document.getElementById(`input-${uid}`).value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;

    const outputBox = document.getElementById(`output-${uid}`);
    outputBox.value = "翻訳中…";

    socket.emit("translate", {
      room: currentRoom,
      userId: uid,
      text,
      inputLang,
      outputLang
    });
  });
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

socket.on("init users", (usersMap) => {
  document.getElementById("users").innerHTML = "";
  Object.entries(usersMap).forEach(([uid, name]) => addUserBox(Number(uid), name));
});

socket.on("users updated", (usersMap) => {
  document.getElementById("users").innerHTML = "";
  Object.entries(usersMap).forEach(([uid, name]) => addUserBox(Number(uid), name));
});

socket.on("stream result", ({ userId, partial }) => {
  const el = document.getElementById(`output-${userId}`);
  if (el) el.value = partial;
});

socket.on("final result", ({ userId, result, inputText }) => {
  const logEl = document.getElementById(`log-${userId}`);
  const outputBox = document.getElementById(`output-${userId}`);
  if (outputBox) outputBox.value = result;
  if (logEl)
    logEl.innerHTML =
      `<div class="input">${inputText}</div><div class="output">${result}</div>` +
      logEl.innerHTML;
});
