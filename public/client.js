console.log("✅ client.js loaded");

// ===== Socket.IO 初期化 =====
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket"],
});

let currentRoom = null;

// init users の多重抑止を「ルーム単位」で管理する
let initializedRoom = null;

// === URLのハッシュから room 名を取り出す ===
// 例: #room/room1, #room/room2, #room/room3, #room/matsu
function parseRoomFromHash() {
  const m = location.hash.match(/#room\/(room1|room2|room3|matsu)/);
  return m ? m[1] : null;
}

// ===== debounceユーティリティ =====
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ===== トースト通知 =====
function toast(msg) {
  const t = document.createElement("div");
  t.innerText = msg;
  t.style =
    "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#a7d2f4;padding:10px 16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-weight:600;z-index:9999;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ===== 画面切替ユーティリティ =====
function showHome() {
  document.getElementById("main-app").style.display = "none";
  document.getElementById("room-select").style.display = "block";
  document.getElementById("users").innerHTML = "";
}

function showRoom() {
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
}

// ===== ルーム関連 =====
// joinRoom は「hashchange / 初期処理」から呼ぶ前提（hashを書き換えない）
function joinRoom(room) {
  currentRoom = room;

  socket.emit("join room", { room });

  showRoom();

  // 上のルームセレクトも合わせる（matsuが無い場合は無視される）
  const sel = document.getElementById("room-switch");
  if (sel) sel.value = room;
}

function leaveRoom() {
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  currentRoom = null;
  initializedRoom = null;
  showHome();
}

// hash を唯一のトリガーにする
function switchRoom(val) {
  if (val === currentRoom) return;
  location.hash = `#room/${val}`;
}

window.switchRoom = switchRoom;

window.leaveRoom = leaveRoom;

// ===== UI生成 =====
function setLang(uid, i, o) {
  document.getElementById(`input-lang-${uid}`).value = i;
  document.getElementById(`output-lang-${uid}`).value = o;
}

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

  // デフォルト設定
  if (uid === 1) setLang(uid, "ja", "zh");
  if (uid === 2) setLang(uid, "zh", "ja");
  if (uid === 3) setLang(uid, "auto", "ja");

  const inputEl = document.getElementById(`input-${uid}`);
  inputEl.addEventListener(
    "input",
    debounce((e) => socket.emit("input", { room: currentRoom, userId: uid, text: e.target.value }), 200)
  );

  // 翻訳ボタン
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
    const text = inputEl.value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const mode = document.getElementById("mode-select").value;
    const model = document.getElementById("model-select").value;
    const out = document.getElementById(`output-${uid}`);
    out.value = "翻訳中…";

    socket.emit("input", { room: currentRoom, userId: uid, text });
    socket.emit("translate", { room: currentRoom, userId: uid, text, inputLang, outputLang, mode, model });
  });

  // コピー
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

  // クリア
  const clearBtn = document.getElementById(`clear-${uid}`);
  clearBtn.addEventListener("click", () => {
    inputEl.value = "";
    socket.emit("input", { room: currentRoom, userId: uid, text: "" });
  });

  // 貼り付け
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

  // 読み上げ
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

  // 全画面（スマホのみ）
  const fsBtn = document.getElementById(`fs-${uid}`);
  const isMobile = window.innerWidth < 768;
  if (!isMobile) fsBtn.style.display = "none";
  fsBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      fsBtn.textContent = "❌";
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      fsBtn.textContent = "📱";
    }
  });
}

// ===== Socketイベント =====
socket.on("init users", (u) => {
  // ルームが変わったら初期化し直す（多重生成は抑止）
  if (initializedRoom === currentRoom) return;

  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
  initializedRoom = currentRoom;
});

socket.on("users updated", (u) => {
  // サーバー正: 常に再描画
  const d = document.getElementById("users");
  d.innerHTML = "";
  Object.entries(u).forEach(([id, n]) => addUserBox(Number(id), n));
  // users updated のあとも「このルームは初期化済み」として扱う
  initializedRoom = currentRoom;
});

socket.on("room-stats", (counts) => {
  ["room1", "room2", "room3"].forEach((r) => {
    const opt = document.querySelector(`#room-switch option[value='${r}']`);
    if (opt) opt.textContent = `${r.replace("room", "Room ")}（接続者数: ${counts[r] || 0}）`;
  });
});

socket.on("existing-logs", (logs) => {
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

socket.on("sync input", ({ userId, text }) => {
  const el = document.getElementById(`input-${userId}`);
  if (document.activeElement === el) return;
  if (el && el.value !== text) el.value = text;
});

socket.on("stream", ({ userId, text }) => {
  const el = document.getElementById(`output-${userId}`);
  if (el) requestAnimationFrame(() => (el.value = text));
});

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

socket.on("logs cleared", () => {
  document.querySelectorAll(".log").forEach((l) => (l.innerHTML = ""));
});

// ===== 共有ボタン（通信と独立） =====
function originUrl() {
  return window.location.href;
}

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

window.toggleSharePanel = function (btn) {
  const panel = document.getElementById("share-panel");
  if (!panel) return;
  const show = panel.style.display === "none" || !panel.style.display;
  panel.style.display = show ? "block" : "none";
  btn.textContent = show ? "📄 閉じる" : "📄 詳細";
};

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

// ===== 🏠 Homeボタン =====
function goHome() {
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  currentRoom = null;
  initializedRoom = null;
  location.hash = "";
  showHome();
}
window.goHome = goHome;

// ===== 💠 ボタン点滅フィードバック =====
function flashButton(btn) {
  if (!btn) return;
  btn.classList.add("btn-flash");
  setTimeout(() => btn.classList.remove("btn-flash"), 400);
}

// ===== 👤 ユーザー追加・削除（サーバー正） =====
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

// ===== 🗑️ 全ログ削除 =====
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

// ログ行をタップで全文選択
document.addEventListener("click", (e) => {
  const line = e.target.closest(".log .line");
  if (!line) return;
  const range = document.createRange();
  range.selectNodeContents(line);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

// タブ復帰で自動再接続
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && socket.disconnected) {
    socket.connect();
  }
});

// TTS voices 事前ロード（初回の再生遅延を回避）
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => {
    window.availableVoices = speechSynthesis.getVoices();
  };
}

// ===== hash ルーティング（唯一の入口） =====
function handleHashRouting() {
  const next = parseRoomFromHash();

  if (!next) {
    // homeへ
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

// 初期表示
window.addEventListener("DOMContentLoaded", () => {
  handleHashRouting();
});

// ハッシュが変わったとき
window.addEventListener("hashchange", () => {
  handleHashRouting();
});
