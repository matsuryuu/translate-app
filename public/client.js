console.log("✅ client.js loaded");

// 本番（Render）
const socket = io("https://translate-app-backend.onrender.com");
// 開発（ローカル）: // const socket = io();

let currentUsers = 0;
const maxUsers = 5;
const minUsers = 2;
let recognitionInstances = {};

// 言語別のspeechSynthesis用マッピング
function getVoiceForLang(lang) {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langMap = {
    ja: "ja",
    zh: "zh",
    ko: "ko",
    en: "en"
  };

  const code = langMap[lang] || "en";
  const voice = voices.find(v => v.lang.toLowerCase().includes(code));
  return voice || null;
}

// ===== ユーザーボックス生成 =====
function createUserBox(userId) {
  const container = document.getElementById("user-container");
  const box = document.createElement("div");
  box.className = "user-box";
  box.id = `user-${userId}`;

  // 初期設定
  let inputLangInit = "auto";
  let outputLangInit = "ja";
  if (userId === 1) { inputLangInit = "ja"; outputLangInit = "zh"; }
  if (userId === 2) { inputLangInit = "zh"; outputLangInit = "ja"; }

  box.innerHTML = `
    <h2>
      <span id="username-${userId}">ユーザー${userId}</span>
      <button onclick="renameUser(${userId})">✏️</button>
    </h2>
    <label class="lang-label">入力言語</label>
    <select id="input-lang-${userId}">
      <option value="auto"${inputLangInit==="auto"?" selected":""}>自動判別</option>
      <option value="ja"${inputLangInit==="ja"?" selected":""}>日本語</option>
      <option value="zh"${inputLangInit==="zh"?" selected":""}>中文</option>
      <option value="ko"${inputLangInit==="ko"?" selected":""}>한국어</option>
      <option value="en"${inputLangInit==="en"?" selected":""}>English</option>
    </select>

    <textarea class="input-area" id="input-${userId}" placeholder="入力してください..."></textarea>

    <label class="lang-label">翻訳言語</label>
    <select id="output-lang-${userId}">
      <option value="ja"${outputLangInit==="ja"?" selected":""}>日本語</option>
      <option value="zh"${outputLangInit==="zh"?" selected":""}>中文</option>
      <option value="ko"${outputLangInit==="ko"?" selected":""}>한국어</option>
      <option value="en"${outputLangInit==="en"?" selected":""}>English</option>
    </select>

    <div class="controls">
      <button id="btn-translate-${userId}">翻訳</button>
      <button id="btn-clear-${userId}">クリア</button>
      <button id="btn-voice-${userId}" class="voice-btn">🎤</button>
      <button id="btn-speak-${userId}">🔊</button>
    </div>

    <div class="output-area" id="output-${userId}"></div>
    <div class="log-area" id="log-${userId}"></div>
  `;

  container.appendChild(box);

  // イベント登録
  document.getElementById(`btn-translate-${userId}`).addEventListener("click", () => translate(userId));
  document.getElementById(`btn-clear-${userId}`).addEventListener("click", () => clearText(userId));
  document.getElementById(`btn-voice-${userId}`).addEventListener("click", () => toggleVoiceInput(userId));
  document.getElementById(`btn-speak-${userId}`).addEventListener("click", () => speakOutput(userId));
}

// ===== 翻訳処理 =====
function translate(userId) {
  const text = document.getElementById(`input-${userId}`).value;
  const inputLang = document.getElementById(`input-lang-${userId}`).value;
  const outputLang = document.getElementById(`output-lang-${userId}`).value;
  if (!text.trim()) return;

  const model = document.getElementById("model-select")?.value || "gpt-4o";
  const mode = document.getElementById("mode-select")?.value || "free";

  const outputEl = document.getElementById(`output-${userId}`);
  outputEl.innerText = "翻訳中...";

  socket.emit("translate", { userId, text, inputLang, outputLang, model, mode });
}

function clearText(userId) {
  document.getElementById(`input-${userId}`).value = "";
  document.getElementById(`output-${userId}`).innerText = "";
}

// ===== 音声入力（トグル式） =====
function toggleVoiceInput(userId) {
  if (!("webkitSpeechRecognition" in window)) {
    alert("音声入力はサポートされていません");
    return;
  }
  if (!recognitionInstances[userId]) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = document.getElementById(`input-lang-${userId}`).value === "zh" ? "zh-CN" : "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join("");
      document.getElementById(`input-${userId}`).value = transcript;
    };

    recognitionInstances[userId] = recognition;
  }

  const btn = document.getElementById(`btn-voice-${userId}`);
  const recognition = recognitionInstances[userId];

  if (btn.classList.contains("active")) {
    recognition.stop();
    btn.classList.remove("active");
  } else {
    recognition.start();
    btn.classList.add("active");
  }
}

// ===== 音声読み上げ =====
function speakOutput(userId) {
  const text = document.getElementById(`output-${userId}`).innerText;
  if (!text) return;

  const outputLang = document.getElementById(`output-lang-${userId}`).value;
  const utter = new SpeechSynthesisUtterance(text);
  const voice = getVoiceForLang(outputLang);
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

// ===== ログ管理 =====
socket.on("stream result", ({ userId, partial }) => {
  const outputEl = document.getElementById(`output-${userId}`);
  if (outputEl) outputEl.innerText = partial;
});

socket.on("final result", ({ userId, result, inputText }) => {
  const outputEl = document.getElementById(`output-${userId}`);
  if (outputEl) outputEl.innerText = result;

  const logEl = document.getElementById(`log-${userId}`);
  if (logEl) {
    const entry = document.createElement("div");
    entry.innerHTML = `<span class="log-input">${inputText}</span><br><span class="log-output">${result}</span>`;
    logEl.prepend(entry);
  }
});

socket.on("logs cleared", () => {
  document.querySelectorAll(".log-area").forEach((log) => (log.innerHTML = ""));
});

// ===== ユーザー管理 =====
function addUser() {
  if (currentUsers < maxUsers) {
    currentUsers++;
    socket.emit("add user", { userId: currentUsers, userName: `ユーザー${currentUsers}` });
  }
}

function removeUser() {
  if (currentUsers > minUsers) {
    socket.emit("remove user", { userId: currentUsers });
    const box = document.getElementById(`user-${currentUsers}`);
    if (box) box.remove();
    currentUsers--;
  }
}

function renameUser(userId) {
  const newName = prompt("新しい名前を入力してください:", userNames[userId] || `ユーザー${userId}`);
  if (newName) socket.emit("rename user", { userId, newName });
}

// 初期化
let userNames = {};
socket.on("init users", (names) => {
  userNames = names;
  document.getElementById("user-container").innerHTML = "";
  currentUsers = Object.keys(userNames).length;
  for (const uid of Object.keys(userNames)) {
    createUserBox(parseInt(uid));
    document.getElementById(`username-${uid}`).innerText = userNames[uid];
  }
});

socket.on("name updated", ({ userId, newName }) => {
  const nameEl = document.getElementById(`username-${userId}`);
  if (nameEl) nameEl.innerText = newName;
});

function clearAllLogs() {
  socket.emit("clear logs");
}
