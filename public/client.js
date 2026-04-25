// ===== 01 App State =====
// [01-1] Load Check
console.log("✅ client.js loaded");

// [01-2] Socket.IO Setup
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket"],
});

// [01-3] Global State
let currentRoom = null;

// init users の多重抑止を「ルーム単位」で管理する
let initializedRoom = null;

// [01-4] Hash Parser
// 例: #room/room1, #room/room2, #room/room3, #room/matsu
function parseRoomFromHash() {
  const m = location.hash.match(/#room\/(room1|room2|room3|matsu)/);
  return m ? m[1] : null;
}

// ===== 02 Utilities =====
// [02-1] Debounce
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// [02-2] Toast
function toast(msg) {
  const t = document.createElement("div");
  t.innerText = msg;
  t.style =
    "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#a7d2f4;padding:10px 16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-weight:600;z-index:9999;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ===== 03 Output Overlay =====
// [03-1] Overlay Builder
function ensureOutputOverlay() {
  let overlay = document.getElementById("output-overlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "output-overlay";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:rgba(0,0,0,0.55)",
    "z-index:99999",
    "display:none",
    "padding:12px",
    "box-sizing:border-box",
  ].join(";");

  overlay.innerHTML = `
    <div id="output-overlay-panel" style="
      width:100%;
      height:100%;
      background:#fff;
      border-radius:14px;
      box-sizing:border-box;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:10px 12px;
        border-bottom:1px solid #e5e7eb;
        font-weight:700;
      ">
        <div>翻訳結果</div>
        <button id="output-overlay-close" style="
          border:none;
          background:#e5e7eb;
          border-radius:10px;
          padding:8px 10px;
          font-weight:700;
          cursor:pointer;
        ">閉じる</button>
      </div>
      <textarea id="output-overlay-text" readonly style="
        flex:1;
        width:100%;
        border:none;
        outline:none;
        resize:none;
        padding:12px;
        font-size:16px;
        line-height:1.6;
        box-sizing:border-box;
      "></textarea>
      <div style="
        display:flex;
        gap:10px;
        padding:10px 12px;
        border-top:1px solid #e5e7eb;
      ">
        <button id="output-overlay-copy" style="
          flex:1;
          border:none;
          border-radius:12px;
          padding:12px;
          background:#a7d2f4;
          font-weight:800;
          cursor:pointer;
        ">📋 コピー</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#output-overlay-close").addEventListener("click", () => hideOutputOverlay());

  overlay.addEventListener("click", (e) => {
    const panel = overlay.querySelector("#output-overlay-panel");
    if (!panel.contains(e.target)) hideOutputOverlay();
  });

  overlay.querySelector("#output-overlay-copy").addEventListener("click", async () => {
    const ta = overlay.querySelector("#output-overlay-text");
    try {
      await navigator.clipboard.writeText(ta.value || "");
      toast("✅ コピーしたよ");
    } catch {
      toast("コピーできなかったよ");
    }
  });

  return overlay;
}

// [03-2] Overlay Font Size
function adjustOverlayFontSize(textarea) {
  const MAX = 32;   // 最大文字サイズ（適当でOK）
  const MIN = 14;   // 最低サイズ
  let size = MAX;

  textarea.style.fontSize = size + "px";

  // はみ出す限り縮める
  while (
    size > MIN &&
    (textarea.scrollHeight > textarea.clientHeight ||
     textarea.scrollWidth  > textarea.clientWidth)
  ) {
    size -= 1;
    textarea.style.fontSize = size + "px";
  }
}


// [03-3] Show Overlay
function showOutputOverlay(text) {
  const overlay = ensureOutputOverlay();
  const ta = overlay.querySelector("#output-overlay-text");

  ta.value = text || "";
  overlay.style.display = "block";
  document.body.style.overflow = "hidden";

  // 初期サイズ → 自動調整
  requestAnimationFrame(() => {
    adjustOverlayFontSize(ta);
  });

  // 可能なら横画面にロック（失敗しても無視）
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch {}
}

// [03-4] Hide Overlay
function hideOutputOverlay() {
  const overlay = document.getElementById("output-overlay");
  if (!overlay) return;

  overlay.style.display = "none";
  document.body.style.overflow = "";

  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch {}
}


// ===== 04 Screen / Room Control =====
// [04-1] Screen Switch
function showHome() {
  document.getElementById("main-app").style.display = "none";
  document.getElementById("room-select").style.display = "block";
  document.getElementById("users").innerHTML = "";
}

function showRoom() {
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}

// [04-2] Room Join / Leave
function joinRoom(room) {
  currentRoom = room;
  socket.emit("join room", { room });
  showRoom();

  const sel = document.getElementById("room-switch");
  if (sel) sel.value = room;
}

function leaveRoom() {
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  currentRoom = null;
  initializedRoom = null;
  showHome();
}

function switchRoom(val) {
  if (val === currentRoom) return;
  location.hash = `#room/${val}`;
}

window.switchRoom = switchRoom;
window.leaveRoom = leaveRoom;

// ===== 05 User UI =====
// [05-1] Language Preset
function setLang(uid, i, o) {
  document.getElementById(`input-lang-${uid}`).value = i;
  document.getElementById(`output-lang-${uid}`).value = o;
}

// [05-2] User Box Builder
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
        <option value="auto">自動</option>
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
      <label>出力:</label>
      <select id="output-lang-${uid}">
        <option value="ja">日本語</option>
        <option value="zh">中国語</option>
        <option value="ko">韓国語</option>
        <option value="en">英語</option>
      </select>
      <button id="btn-translate-${uid}" class="btn-translate">翻訳</button>
    </div>

    <div style="position:relative;">
      <textarea id="input-${uid}" class="text" placeholder="入力してください"></textarea>
      <button class="paste-btn" id="paste-${uid}" title="貼り付け">📋</button>
      <button class="clear-btn" id="clear-${uid}" title="クリア">🗑️</button>
    </div>

    <div style="position:relative;">
      <textarea id="output-${uid}" class="text output" readonly></textarea>
      <button class="fs-btn"    id="fs-${uid}"    title="全画面(スマホ)">📱</button>
      <button class="speak-btn" id="speak-${uid}" title="読み上げ">🔊</button>
      <button class="copy-btn"  id="copy-${uid}"  title="コピー">📋</button>
    </div>

    <div class="log" id="log-${uid}"></div>
  `;
  usersDiv.appendChild(box);

  if (uid === 1) setLang(uid, "ja", "zh");
  if (uid === 2) setLang(uid, "zh", "ja");
  if (uid === 3) setLang(uid, "auto", "ja");

  // [05-3] Input Sync Handler
  const inputEl = document.getElementById(`input-${uid}`);
  inputEl.addEventListener(
    "input",
    debounce((e) => socket.emit("input", { room: currentRoom, userId: uid, text: e.target.value }), 200)
  );

  // [05-4] Translate Button Handler
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
    const text = inputEl.value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const mode = document.getElementById("mode-select").value;
    const model = document.getElementById("model-select").value;
    const out = document.getElementById(`output-${uid}`);

    if (!currentRoom) {
      toast("ルームに入り直してね");
      return;
    }

    if (socket.disconnected) {
      socket.connect();
    }

    socket.emit("join room", { room: currentRoom });

    out.value = "翻訳中…";

    socket.emit("input", { room: currentRoom, userId: uid, text });
    socket.emit("translate", { room: currentRoom, userId: uid, text, inputLang, outputLang, mode, model });
  });


  // [05-5] Copy Button Handler
  const copyBtn = document.getElementById(`copy-${uid}`);
  copyBtn.addEventListener("click", async () => {
    const out = document.getElementById(`output-${uid}`);
    try {
      await navigator.clipboard.writeText(out.value);
      copyBtn.textContent = "✅";
      setTimeout(() => (copyBtn.textContent = "📋"), 2000);
      toast("✅ コピーしたよ");
    } catch {
      toast("コピーできなかったよ");
    }
  });

  // [05-6] Clear Button Handler
  const clearBtn = document.getElementById(`clear-${uid}`);
  clearBtn.addEventListener("click", () => {
    inputEl.value = "";
    socket.emit("input", { room: currentRoom, userId: uid, text: "" });
  });

  // [05-7] Paste Button Handler
  const pasteBtn = document.getElementById(`paste-${uid}`);
  pasteBtn.addEventListener("click", async () => {
    try {
      const clip = await navigator.clipboard.readText();
      const el = document.getElementById(`input-${uid}`);
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + clip + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + clip.length;
      socket.emit("input", { room: currentRoom, userId: uid, text: el.value });
      toast("✅ 貼り付けたよ");
    } catch {
      toast("貼り付けできなかったよ");
    }
  });

  // [05-8] Speak Button Handler
  const speakBtn = document.getElementById(`speak-${uid}`);
  speakBtn.addEventListener("click", () => {
    const out = document.getElementById(`output-${uid}`);
    const langSel = document.getElementById(`output-lang-${uid}`).value;
    const langMap = { ja: "ja-JP", zh: "zh-TW", en: "en-US", ko: "ko-KR" };
    const u = new SpeechSynthesisUtterance(out.value || "");
    u.lang = langMap[langSel] || "ja-JP";
    u.rate = 1.25;
    u.pitch = 1.0;
    u.volume = 1.0;
    speechSynthesis.cancel();

    const voices = window.availableVoices || speechSynthesis.getVoices();
    const v =
      voices.find((v) => v.lang === u.lang) ||
      voices.find((v) => v.lang.startsWith(u.lang.split("-")[0])) ||
      voices[0];
    if (v) u.voice = v;

    speechSynthesis.speak(u);
    toast("🔊 再生するね");
  });

  // [05-9] Fullscreen Button Handler
  const fsBtn = document.getElementById(`fs-${uid}`);
  const isMobile = window.innerWidth < 768;
  if (!isMobile) fsBtn.style.display = "none";

  fsBtn.addEventListener("click", () => {
    const out = document.getElementById(`output-${uid}`);
    showOutputOverlay(out ? out.value : "");
  });
} // ← ★これが抜けてた（超重要）

// ===== 06 Socket Event Handlers =====
// [06-1] Init Users
socket.on("init users", (u) => {
  if (initializedRoom === currentRoom) return;

  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
  initializedRoom = currentRoom;
});

// [06-2] Users Updated
socket.on("users updated", (u) => {
  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
  initializedRoom = currentRoom;
});

// [06-3] Room Stats
socket.on("room-stats", (counts) => {
  ["room1", "room2", "room3"].forEach((r) => {
    const opt = document.querySelector(`#room-switch option[value='${r}']`);
    if (opt) opt.textContent = `${r.replace("room", "Room ")}（接続者数: ${counts[r] || 0}）`;
  });
});

// [06-4] Existing Logs
socket.on("existing-logs", (logs) => {
  document.querySelectorAll(".log").forEach((l) => (l.innerHTML = ""));

  logs.forEach(({ text, result, userId }) => {
    const log = document.getElementById(`log-${userId || 1}`);
    if (log) {
      const entry = `
        <div class="line"><span class="mark">📝</span><div class="input">${text}</div></div>
        <div class="line"><span class="mark">💬</span><div class="output">${result}</div></div>`;
      log.innerHTML += entry;
    }
  });
});


// [06-5] Sync Input
socket.on("sync input", ({ userId, text }) => {
  const el = document.getElementById(`input-${userId}`);
  if (document.activeElement === el) return;
  if (el && el.value !== text) el.value = text;
});

// [06-6] Stream Output
socket.on("stream", ({ userId, text }) => {
  const el = document.getElementById(`output-${userId}`);
  if (el) requestAnimationFrame(() => (el.value = text));
});

// [06-7] Translation Complete
socket.on("translated", ({ userId, text, inputText }) => {
  const out = document.getElementById(`output-${userId}`);
  const log = document.getElementById(`log-${userId}`);
  if (out) out.value = text;
  if (log) {
    const line = `
      <div class="line"><span class="mark">📝</span><div class="input">${inputText}</div></div>
      <div class="line"><span class="mark">💬</span><div class="output">${text}</div></div>`;
    log.innerHTML = line + log.innerHTML;
  }
});

// [06-8] Logs Cleared
socket.on("logs cleared", () => {
  document.querySelectorAll(".log").forEach((l) => (l.innerHTML = ""));
});

// [06-9] Log Export Response
socket.on("room logs", ({ room, logs }) => {
  // logs: [{ userId, text, result }, ...]（最新が先頭）
  const now = new Date();
  const ts =
    now.getFullYear() +
    "-" + String(now.getMonth() + 1).padStart(2, "0") +
    "-" + String(now.getDate()).padStart(2, "0") +
    "_" + String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");

  const lines = [];
  lines.push(`room: ${room}`);
  lines.push(`exported: ${now.toISOString()}`);
  lines.push("");

  // 保存は古い順で読めるように逆順
  const ordered = [...(logs || [])].reverse();

  ordered.forEach((x, i) => {
    const uid = x.userId ?? "";
    const input = x.text ?? "";
    const out = x.result ?? "";
    lines.push(`--- #${i + 1}  userId=${uid} ---`);
    lines.push(`📝 ${input}`);
    lines.push(`💬 ${out}`);
    lines.push("");
  });

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `logs_${room}_${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast("✅ ログを保存したよ");
});


// ===== 07 Share / Export =====
// [07-1] Current URL
function originUrl() {
  return window.location.href;
}

// [07-2] Copy Main Link
window.copyMainLink = async function (btn) {
  const url = originUrl();
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "✅ コピー";
    setTimeout(() => (btn.textContent = "📋 URLコピー"), 1500);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    btn.textContent = "✅ コピー";
    setTimeout(() => (btn.textContent = "📋 URLコピー"), 1500);
  }
};

// [07-3] Export Logs
window.emitExportLogs = function (btn) {
  if (!currentRoom) return;
  if (btn) {
    btn.classList.add("btn-busy");
    btn.textContent = "出力中…";
  }
  socket.emit("get logs", { room: currentRoom });

  setTimeout(() => {
    if (!btn) return;
    btn.classList.remove("btn-busy");
    btn.textContent = "ログ出力";
  }, 800);
};


// [07-4] Share Link
window.shareLink = async function (btn) {
  const url = originUrl();
  const title = document.title || "リアルタイム翻訳くん";
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      btn.textContent = "📨 実行";
      setTimeout(() => (btn.textContent = "📱 シェア"), 1500);
      return;
    } catch {}
  }
  await window.copyMainLink(btn);
};

// [07-5] QR Code
window.toggleQRCode = function (btn) {
  const wrap = document.getElementById("qr-wrap");
  const canvas = document.getElementById("qr-canvas");
  const show = wrap.style.display === "none" || !wrap.style.display;
  wrap.style.display = show ? "block" : "none";
  if (show) {
    // eslint-disable-next-line no-undef
    new QRious({ element: canvas, value: originUrl(), size: 220 });
    btn.textContent = "🧾 閉じる";
  } else {
    btn.textContent = "🧾 QR表示";
  }
};

// ===== 08 Buttons / Controls =====
// [08-1] Home Button
function goHome() {
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  currentRoom = null;
  initializedRoom = null;
  location.hash = "";
  showHome();
}
window.goHome = goHome;

// [08-2] Button Flash
function flashButton(btn) {
  if (!btn) return;
  btn.classList.add("btn-flash");
  setTimeout(() => btn.classList.remove("btn-flash"), 400);
}

// [08-3] Add / Remove User Buttons
window.emitAddUser = function (btn) {
  flashButton(btn);
  if (!currentRoom) return;
  socket.emit("add user", { room: currentRoom });
};

window.emitRemoveUser = function (btn) {
  flashButton(btn);
  if (!currentRoom) return;
  socket.emit("remove user", { room: currentRoom });
};

// [08-4] Clear Logs Button
window.emitClearLogs = function (btn) {
  flashButton(btn);
  if (!currentRoom) return;
  socket.emit("clear logs", { room: currentRoom });

  btn.classList.add("btn-busy");
  btn.textContent = "削除中…";

  setTimeout(() => {
    btn.classList.remove("btn-busy");
    btn.textContent = "✅ 削除完了";
    setTimeout(() => (btn.textContent = "全ログ削除"), 1200);
  }, 1200);
};

// ===== 09 Browser Events =====
// [09-1] Select Log Line
document.addEventListener("click", (e) => {
  const line = e.target.closest(".log .line");
  if (!line) return;
  const range = document.createRange();
  range.selectNodeContents(line);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

// [09-2] Visibility Reconnect
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;

  if (socket.disconnected) {
    socket.connect();
    return;
  }

  if (currentRoom) {
    socket.emit("join room", { room: currentRoom });
  }
});

// [09-3] Socket Rejoin After Connect
socket.on("connect", () => {
  if (!currentRoom) return;
  socket.emit("join room", { room: currentRoom });
});

// [09-4] TTS Voices Preload
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => {
    window.availableVoices = speechSynthesis.getVoices();
  };
}


// ===== 10 Routing =====
// [10-1] Hash Routing
function handleHashRouting() {
  const next = parseRoomFromHash();

  if (!next) {
    if (currentRoom) socket.emit("leave room", { room: currentRoom });
    currentRoom = null;
    initializedRoom = null;
    showHome();
    return;
  }

  if (next !== currentRoom) {
    if (currentRoom) socket.emit("leave room", { room: currentRoom });
    initializedRoom = null;
    joinRoom(next);
  }
}

// [10-2] Routing Events
window.addEventListener("DOMContentLoaded", () => {
  handleHashRouting();
});

window.addEventListener("hashchange", () => {
  handleHashRouting();
});
