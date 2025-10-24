console.log("✅ client.js loaded");

// ===== Socket.IO 初期化 =====
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket"],
});
let currentRoom = null;

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
  t.style = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#a7d2f4;padding:10px 16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-weight:600;z-index:9999;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ===== ルーム関連 =====
function joinRoom(room) {
  currentRoom = room;
  socket.emit("join room", { room });
  document.getElementById("room-select").style.display = "none";
  document.getElementById("main-app").style.display = "block";
  document.getElementById("room-switch").value = room;
}
window.joinRoom = joinRoom;

function leaveRoom() {
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  currentRoom = null;
  document.getElementById("main-app").style.display = "none";
  document.getElementById("room-select").style.display = "block";
  document.getElementById("users").innerHTML = "";
}
window.leaveRoom = leaveRoom;

function switchRoom(val) {
  if (val === currentRoom) return;
  if (currentRoom) socket.emit("leave room", { room: currentRoom });
  socket.emit("join room", { room: val });
  currentRoom = val;
}
window.switchRoom = switchRoom;

// ===== UI生成 =====
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
      <button class="clear-btn" id="clear-${uid}" title="クリア">🗑️</button>
    </div>
    <div style="position:relative;">
      <textarea id="output-${uid}" class="text output" readonly></textarea>
      <button class="copy-btn" id="copy-${uid}" title="コピー">📋</button>
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
    // 🔸全端末へ翻訳中…を通知
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
}

function setLang(uid, i, o) {
  document.getElementById(`input-lang-${uid}`).value = i;
  document.getElementById(`output-lang-${uid}`).value = o;
}

function clearAllLogs() {
  const btn = document.getElementById("btn-clear-logs");
  btn.textContent = "削除中…";
  btn.classList.add("busy");
  socket.emit("clear logs", { room: currentRoom });
  setTimeout(() => {
    btn.textContent = "✅ 削除済み";
    btn.classList.remove("busy");
    btn.classList.add("done");
    setTimeout(() => {
      btn.textContent = "全ログ削除";
      btn.classList.remove("done");
    }, 1500);
  }, 600);
}
window.clearAllLogs = clearAllLogs;

// ===== Socketイベント =====
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
  if (document.activeElement === el) return; // 自分で編集中なら上書きしない
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
document.addEventListener("DOMContentLoaded", () => {
  function originUrl() {
    return window.location.href;
  }

  window.copyMainLink = async function(btn) {
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

  window.shareLink = async function(btn) {
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

  window.toggleSharePanel = function(btn) {
    const panel = document.getElementById("share-panel");
    const show = panel.style.display === "none" || !panel.style.display;
    panel.style.display = show ? "block" : "none";
    btn.textContent = show ? "📄 閉じる" : "📄 詳細";
  };

  window.toggleQRCode = function(btn) {
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
});
