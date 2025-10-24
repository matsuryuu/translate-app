// client.js — DOM + Socket.IO client (WS-only)
(() => {
  // ===== Config =====
  const SERVER_URL = (location.hostname === 'localhost')
    ? 'http://localhost:10000'
    : 'https://translate-app-backend.onrender.com'; // ←必要に応じて変更

  // ===== Helpers =====
  const $ = (sel) => document.querySelector(sel);
  const ce = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const params = new URLSearchParams(location.search);
  const room = params.get('room') || 'room1';

  const debounce = (fn, ms=200) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // ===== State =====
  const state = {
    thisUserId: 1, // 枠の“自分”定義（PC複数やスマホ共有はUI操作で切替してOK）
    mode: 'free',  // free = 意訳, formal = 直訳
    model: 'quality', // quality=gpt-4o, speed=gpt-4o-mini
    socketsReady: false,
    users: { 1: 'ユーザー1', 2: 'ユーザー2', 3: 'ユーザー3' },
    texts: { 1: '', 2: '', 3: '' },
    outputs: { 1: '', 2: '', 3: '' },
    langIn:  { 1: '日本語', 2: '日本語', 3: '日本語' },
    langOut: { 1: '英語',   2: '中国語', 3: '韓国語' },
  };

  // ===== Socket =====
  const socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('join-room', { room });
    state.socketsReady = true;
  });

  socket.on('init users', (users) => {
    state.users = users;
    renderUsers();
  });

  socket.on('existing-logs', (logs) => {
    // 直近ログを各枠のログ欄に表示（単純化: 共通ログパネルではなく各枠にまとめてpush）
    logs.forEach(() => {}); // 仕様上は受け取れるようにしておく（必要なら拡張）
  });

  socket.on('sync input', ({ userId, text }) => {
    // 自分以外の端末からの入力を即時反映
    const ta = $(`#ta-${userId}`);
    if (ta && ta !== document.activeElement) {
      state.texts[userId] = text;
      ta.value = text;
    }
  });

  socket.on('stream', ({ userId, text }) => {
    // 仕様：全体ブロードキャスト→各クライアントで自枠のみ反映
    if (state.thisUserId !== userId) return;
    state.outputs[userId] = text;
    const out = $(`#out-${userId}`);
    if (out) out.textContent = text || '翻訳中...';
  });

  socket.on('translated', ({ userId, text }) => {
    if (state.thisUserId !== userId) return;
    state.outputs[userId] = text;
    const out = $(`#out-${userId}`);
    if (out) out.textContent = text || '';
    appendLog(userId, 'out', text);
  });

  socket.on('logs cleared', () => {
    // 各枠のログDOMをリセット
    [1,2,3].forEach(i => {
      const log = $(`#log-${i}`);
      if (log) log.innerHTML = '';
    });
  });

  socket.on('room-stats', (stats) => {
    $('#roomStats').textContent = `Room 1（接続者数: ${stats.room1}） / Room 2（${stats.room2}） / Room 3（${stats.room3}）`;
  });

  // ===== UI =====
  $('#roomSel').value = room;
  $('#roomSel').addEventListener('change', (e) => {
    const newRoom = e.target.value;
    socket.emit('leave-room', { room });
    location.href = `/?room=${encodeURIComponent(newRoom)}`;
  });

  $('#modeSel').addEventListener('change', (e) => {
    state.mode = e.target.value;
  });
  $('#modelSel').addEventListener('change', (e) => {
    state.model = e.target.value;
  });

  $('#clearLogsBtn').addEventListener('click', () => {
    socket.emit('clear logs', { room });
  });

  $('#backBtn').addEventListener('click', () => {
    history.back();
  });

  $('#addUserBtn').addEventListener('click', () => {
    // 表示枠の“自分”を2→3へ、など簡易切替（本実装は各自の運用に合わせて）
    state.thisUserId = Math.min(3, state.thisUserId + 1);
    markSelf();
  });
  $('#delUserBtn').addEventListener('click', () => {
    state.thisUserId = Math.max(1, state.thisUserId - 1);
    markSelf();
  });

  // 共有系
  $('#copyUrlBtn').addEventListener('click', copyMainLink);
  $('#shareBtn').addEventListener('click', shareLink);
  $('#detailBtn').addEventListener('click', toggleSharePanel);
  $('#qrBtn').addEventListener('click', toggleQRCode);
  $('#curUrl').textContent = originUrl();
  buildRoomLinks();

  // ===== Users UI =====
  function renderUsers() {
    const row = $('#usersRow');
    row.innerHTML = '';
    [1,2,3].forEach((id) => {
      row.appendChild(renderUserBox(id));
    });
    markSelf();
  }

  function renderUserBox(id) {
    const box = ce('div', { className: 'userbox panel' });

    // 言語セレクト
    const line1 = ce('div', { className: 'line' });
    const selIn = ce('select', { id: `in-${id}` });
    const selOut = ce('select', { id: `out-${id}` });
    ;['日本語','英語','中国語','韓国語'].forEach(lang => {
      selIn.appendChild(ce('option', { value: lang, textContent: `入力:${lang}` }));
      selOut.appendChild(ce('option', { value: lang, textContent: `出力:${lang}` }));
    });
    selIn.value = state.langIn[id];
    selOut.value = state.langOut[id];
    selIn.addEventListener('change', e => state.langIn[id] = e.target.value);
    selOut.addEventListener('change', e => state.langOut[id] = e.target.value);

    const badge = ce('span', { className: 'badge', textContent: `ユーザー${id}` });

    line1.append(selIn, selOut, badge);

    // 入力欄
    const ta = ce('textarea', { id: `ta-${id}`, placeholder: 'ここに入力（全端末へ同期）' });
    ta.value = state.texts[id];
    const onInput = debounce((e) => {
      const text = e.target.value;
      state.texts[id] = text;
      socket.emit('input', { room, userId: id, text });
    }, 200);
    ta.addEventListener('input', onInput);
    // 入力クリアボタン
    const clrBtn = ce('button', { className: 'icon-btn', textContent: '🗑️' });
    clrBtn.addEventListener('click', () => {
      state.texts[id] = '';
      ta.value = '';
      socket.emit('input', { room, userId: id, text: '' });
    });
    const taWrap = ce('div', { style: 'position:relative;' });
    taWrap.append(ta, clrBtn);

    // 翻訳ボタン
    const transBtn = ce('button', { className: 'primary', textContent: '翻訳' });
    transBtn.addEventListener('click', () => startTranslate(id));

    // 出力欄
    const out = ce('div', { id: `out-${id}`, className: 'out', textContent: '' });
    const copyBtn = ce('button', { className: 'icon-btn', textContent: '📋' });
    copyBtn.addEventListener('click', async () => {
      const text = state.outputs[id] || '';
      try {
        await navigator.clipboard.writeText(text);
        const old = copyBtn.textContent;
        copyBtn.textContent = '✅';
        setTimeout(() => (copyBtn.textContent = old), 1200);
      } catch {}
    });
    const outWrap = ce('div', { style: 'position:relative;' });
    outWrap.append(out, copyBtn);

    // ログ
    const log = ce('div', { id: `log-${id}`, className: 'log' });

    box.append(line1, taWrap, transBtn, outWrap, log);
    return box;
  }

  function markSelf() {
    [1,2,3].forEach((id) => {
      const badge = $(`#in-${id}`)?.nextSibling; // selIn, selOut の後に badge
      const out = $(`#out-${id}`);
      const ta = $(`#ta-${id}`);
      const isSelf = (id === state.thisUserId);
      if (badge && badge.nodeType === 1) {
        badge.textContent = `ユーザー${id}${isSelf ? '（自枠）' : ''}`;
      }
      if (out) out.classList.toggle('ghost', !isSelf);
      if (ta)  ta.placeholder = isSelf ? 'ここに入力（全端末へ同期）' : '（他端末の入力が反映）';
    });
  }

  function appendLog(userId, kind, text) {
    const log = $(`#log-${userId}`);
    if (!log) return;
    const line = ce('div', { className: kind === 'out' ? 'out' : 'in' });
    const mark = kind === 'out' ? '💬' : '📝';
    line.textContent = `${mark} ${text}`;
    log.prepend(line);
    // 古いのは自然に流れる（MAXはサーバ側で担保）
  }

  async function startTranslate(id) {
    const text = (state.texts[id] || '').trim();
    if (!text) return;
    const inputLang  = state.langIn[id];
    const outputLang = state.langOut[id];
    const mode = state.mode;
    const model = state.model;

    // 出力欄に「翻訳中…」表示
    const out = $(`#out-${id}`);
    if (out) out.textContent = '翻訳中...';

    appendLog(id, 'in', text);
    socket.emit('translate', { room, userId: id, text, inputLang, outputLang, mode, model });
  }

  // ===== Share helpers =====
  function originUrl() { return location.href; }
  function copyMainLink() {
    navigator.clipboard.writeText(originUrl()).catch(()=>{});
  }
  async function shareLink() {
    const url = originUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'リアルタイム翻訳くん', url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
    }
  }
  function toggleSharePanel() {
    $('#detailPanel').classList.toggle('hidden');
    $('#curUrl').textContent = originUrl();
    buildRoomLinks();
  }
  function buildRoomLinks() {
    const base = location.origin + location.pathname;
    const mk = (r) => `<div><a href="${base}?room=${r}">${r}</a></div>`;
    $('#roomLinks').innerHTML = ['room1','room2','room3'].map(mk).join('');
  }
  function toggleQRCode() {
    const wrap = $('#qrWrap');
    wrap.style.display = (wrap.style.display === 'block') ? 'none' : 'block';
    // シンプルQR（外部ライブラリなしでCanvas描画は省略：必要に応じ導入可）
    const c = $('#qrCanvas');
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = '#000';
    ctx.font = '12px monospace';
    ctx.fillText('QR準備: ' + originUrl(), 10, 80);
  }

  // 初期描画
  renderUsers();
})();
