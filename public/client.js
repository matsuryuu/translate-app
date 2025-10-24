console.log("✅ client.js loaded");
const socket = io("https://translate-app-backend.onrender.com", {
  withCredentials: true,
  transports: ["websocket"],
});
let currentRoom = null;

// ===== ユーティリティ =====
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function toast(msg) {
  const t = document.createElement("div");
  t.innerText = msg;
  t.style = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#a7d2f4;padding:10px 16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-weight:600;z-index:9999;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// 現在URL（クエリ含む）
function originUrl() {
  return window.location.href;
}

// ===== 共有系：URLコピー / シェア / 詳細パネル / QR =====
function setBusyFlash(btn, doneText, duration = 1500, originalText) {
  if (!btn) return;
  const prev = originalText ?? btn.textContent;
  btn.textContent = doneText;
  btn.disabled = true;
  btn.style.opacity = "0.7";
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
    btn.style.opacity = "1";
  }, duration);
}

window.copyMainLink = async function copyMainLink(btn) {
  const url = originUrl();
  try {
    await navigator.clipboard.writeText(url);
    setBusyFlash(btn, "✅ コピー", 1500);
    toast("✅ URLをコピーしたよ");
  } catch {
    // フォールバック
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setBusyFlash(btn, "✅ コピー", 1500);
    toast("✅ URLをコピーしたよ");
  }
};

window.shareLink = async function shareLink(btn) {
  const url = originUrl();
  const title = document.title || "リアルタイム翻訳くん";
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      setBusyFlash(btn, "📨 実行", 1200);
      toast("📨 共有を実行したよ");
      return;
    } catch {
      // cancel等は無視してコピーにフォールバック
    }
  }
  // フォールバック: コピー
  await window.copyMainLink(btn);
};

function buildRoomLinks() {
  const base = window.location.origin + window.location.pathname;
  const rooms = ["room1", "room2", "room3"];
  const wrap = document.getElementById("room-links");
  if (!wrap) return;
  wrap.innerHTML = rooms
    .map((r) => `<a href="${base}?room=${r}" target="_blank">${base}?room=${r}</a>`)
    .join("<br>");
  // ついでにメール/Slackのリンクも更新
  const mailto = document.getElementById("mailto-link");
  const slack = document.getElementById("slack-link");
  const subj = encodeURIComponent("リアルタイム翻訳くん 共有リンク");
  const body = encodeURIComponent(rooms.map((r) => `${r}: ${base}?room=${r}`).join("\n"));
  if (mailto) mailto.href = `mailto:?subject=${subj}&body=${body}`;
  if (slack) slack.href = `https://slack.com/app_redirect?channel=&team=&message=${encodeURIComponent(body)}`;
}

let qrInstance = null;
window.toggleSharePanel = function toggleSharePanel(btn) {
  const panel = document.getElementById("share-panel");
  if (!panel) return;
  const isHidden = panel.style.display === "none" || panel.style.display === "";
  panel.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    buildRoomLinks();
    setBusyFlash(btn, "📄 開いたよ", 900);
  } else {
    setBusyFlash(btn, "📄 閉じたよ", 900);
  }
};

window.toggleQRCode = function toggleQRCode(btn) {
  const wrap = document.getElementById("qr-wrap");
  const canvas = document.getElementById("qr-canvas");
  if (!wrap || !canvas) return;
  const isHidden = wrap.style.display === "none" || wrap.style.display === "";
  if (isHidden) {
    wrap.style.display = "block";
    // QR生成（QRious）
    try {
      if (!qrInstance) {
        // eslint-disable-next-line no-undef
        qrInstance = new QRious({ element: canvas, value: originUrl(), size: 220 });
      } else {
        qrInstance.set({ value: originUrl() });
      }
      setBusyFlash(btn, "🧾 表示中", 900);
      toast("🧾 QRを表示したよ");
    } catch (e) {
      console.error(e);
      toast("QRの生成に失敗したよ");
    }
  } else {
    wrap.style.display = "none";
    setBusyFlash(btn, "🧾 閉じたよ", 900);
  }
};

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

  // デフォルト言語
  if (uid === 1) setLang(uid, "ja", "zh");
  if (uid === 2) setLang(uid, "zh", "ja");
  if (uid === 3) setLang(uid, "auto", "ja");

  const inputEl = document.getElementById(`input-${uid}`);
  inputEl.addEventListener(
    "input",
    debounce((e) => socket.emit("input", { room: currentRoom, userId: uid, text: e.target.value }), 200)
  );

  // 翻訳
  document.getElementById(`btn-translate-${uid}`).addEventListener("click", () => {
    const text = inputEl.value;
    const inputLang = document.getElementById(`input-lang-${uid}`).value;
    const outputLang = document.getElementById(`output-lang-${uid}`).value;
    const mode = document.getElementById("mode-select").value;
    const model = document.getElementById("model-select").value;
    const out = document.getElementById(`output-${uid}`);
    out.value = "翻訳中…";
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
  socket.emit("clear logs", { room: currentRoom });
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
  // 仕様：編集中は上書きしない（activeElement判定）
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
