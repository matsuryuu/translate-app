// client.js — DOM + Socket.IO client (WS-only, UI feedback & badge fix)
document.addEventListener("DOMContentLoaded", () => {
  // ===== Config =====
  const SERVER_URL = (location.hostname === 'localhost')
    ? 'http://localhost:10000'
    : 'https://translate-app-backend.onrender.com'; // 本番URLは環境に合わせて

  // ===== Helpers =====
  const $ = (sel) => document.querySelector(sel);
  const ce = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const params = new URLSearchParams(location.search);
  const room = params.get('room') || 'room1';

  const debounce = (fn, ms = 200) => {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // ボタン押下の視覚フィードバック
  function flashBtn(btn, textTemp = null, ms = 800) {
    if (!btn) return;
    const prev = btn.textContent;
    btn.classList.add('btn-flash');
    if (textTemp !== null) btn.textContent = textTemp;
    setTimeout(() => {
      btn.classList.remove('btn-flash');
      if (textTemp !== null) btn.textContent = prev;
    }, ms);
  }
  function busy(btn, on=true) {
    if (!btn) return;
    btn.classList.toggle('btn-busy', on);
  }

  // ===== State =====
  const state = {
    thisUserId: 1,
    mode: 'free',
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

  // 既存ログを入室時に描画（簡易：出力のみ）
  socket.on('existing-logs', (logs) => {
    logs.forEach((entry) => {
      const uid = entry.userId ?? 1;
      appendLog(uid, 'out', entry.text || entry.result || '');
    });
  });

  // 他端末からの入力同期
  socket.on('sync input', ({ userId, text }) => {
    const ta = $(`#ta-${userId}`);
    if (ta && ta !== document.activeElement) {
      state.texts[userId] = text;
      ta.value = text;
    }
  });

  // ストリーム（自枠のみ反映）
  socket.on('stream', ({ userId, text }) => {
    if (state.thisUserId !== userId) return;
    const out = $(`#out-${userId}`);
    state.outputs[userId] = text;
    if (out) out.textContent = text || '翻訳中...';
  });

  // 完了
  socket.on('translated', ({ userId, text }) => {
    if (state.thisUserId !== userId) return;
    state.outputs[userId] = text;
    const out = $(`#out-${userId}`);
    if (out) out.textContent = text || '';
    appendLog(userId, 'out', text || '');
  });

  // ログ全削除
  socket.on('logs cleared', () => {
    [1,2,3].forEach(i => {
      const log = $(`#log-${i}`);
      if (log) log.innerHTML = '';
    });
    // 押下したことが分かるミニ通知（ボタン側でもフィードバック）
    const btn = $('#clearLogsBtn');
    flashBtn(btn, '✅ 削除済み', 1500);
  });

  // 接続者数
  socket.on('room-stats', (stats) => {
    $('#roomStats').textContent =
      `Room 1（接続者数: ${stats.room1}） / Room 2（${stats.room2}） / Room 3（${stats.room3}）`;
  });

  // ===== UI初期化 =====
  const roomSel = $('#roomSel'); if (roomSel) roomSel.value = room;
  roomSel?.addEventListener('change', (e) => {
    const newRoom = e.target.value;
    socket.emit('leave-room', { room });
    location.href = `/?room=${encodeURIComponent(newRoom)}`;
  });

  $('#modeSel')?.addEventListener('change', (e) => state.mode = e.target.value);
  $('#modelSel')?.addEventListener('change', (e) => state.model = e.target.value);

  $('#clearLogsBtn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    busy(btn, true);
    socket.emit('clear logs', { room });
    setTimeout(() => busy(btn, false), 400);
    flashBtn(btn, '実行中…', 400);
  });

  $('#backBtn')?.addEventListener('click', () => history.back());

  $('#addUserBtn')?.addEventListener('click', (e) => {
    state.thisUserId = Math.min(3, state.thisUserId + 1);
    markSelf();
    flashBtn(e.currentTarget);
  });
  $('#delUserBtn')?.addEventListener('click', (e) => {
    state.thisUserId = Math.max(1, state.thisUserId - 1);
    markSelf();
    flashBtn(e.currentTarget);
  });

  // 共有系
  $('#copyUrlBtn')?.addEventListener('click', (e) => { copyMainLink(); flashBtn(e.currentTarget, '✅ コピー', 1200); });
  $('#shareBtn')?.addEventListener('click', async (e) => {
    await shareLink();
    flashBtn(e.currentTarget, '📨 実行', 800);
  });
  $('#detailBtn')?.addEventListener('click', (e) => { toggleSharePanel(); flashBtn(e.currentTarget); });
  $('#qrBtn')?.addEventListener('click', (e) => { toggleQRCode(); flashBtn(e.currentTarget); });
  $('#curUrl')?.textContent = originUrl();
  buildRoomLinks();

  // ===== Users UI =====
  function renderUsers() {
    const row = $('#usersRow');
    if (!row) return;
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
    ['日本語','英語','中国語','韓国語'].forEach(lang => {
      selIn.appendChild(ce('option', { value: lang, textContent: `入力:${lang}` }));
      selOut.appendChild(ce('option', { value: lang, textContent: `出力:${lang}` }));
    });
    selIn.value = state.langIn[id];
    selOut.value = state.langOut[id];
    selIn.addEventListener('change', e => state.langIn[id] = e.target.value);
    selOut.addEventListener('change', e => state.langOut[id] = e.target.value);

    // ★ バッジはID付与して直接参照（nextSiblingバグ回避）
    const badge = ce('span', { id: `badge-${id}`, className: 'badge', textContent: `ユーザー${id}` });
    line1.append(selIn, selOut, badge);

    // 入力欄
    const ta = ce('textarea', { id: `ta-${id}`, placeholder: 'ここに入力（全端末へ同期）' });
    ta.value = state.texts[id];
    ta.addEventListener('input', debounce((e) => {
      const text = e.target.value;
      state.texts[id] = text;
      socket.emit('input', { room, userId: id, text });
    }, 200));

    // 入力クリア
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

    // 出力欄＋コピー
    const out = ce('div', { id: `out-${id}`, className: 'out', textContent: '' });
    const copyBtn = ce('button', { className: 'icon-btn', textContent: '📋' });
    copyBtn.addEventListener('click', async () => {
      const txt = state.outputs[id] || '';
      try {
        await navigator.clipboard.writeText(txt);
        copyBtn.textContent = '✅';
        setTimeout(() => (copyBtn.textContent = '📋'), 2000);
      } catch {
        // 失敗時もフォールバック
        fallbackCopy(txt);
        copyBtn.textContent = '✅';
        setTimeout(() => (copyBtn.textContent = '📋'), 2000);
      }
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
      const badge = $(`#badge-${id}`);   // ← 直接参照に修正
      const out = $(`#out-${id}`);
      const ta = $(`#ta-${id}`);
      const isSelf = (id === state.thisUserId);
      if (badge) badge.textContent = `ユーザー${id}${isSelf ? '（自枠）' : ''}`;
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
  }

  function startTranslate(id) {
    const text = (state.texts[id] || '').trim();
    if (!text) return;
    const inputLang  = state.langIn[id];
    const outputLang = state.langOut[id];
    const { mode, model } = state;

    const out = $(`#out-${id}`);
    if (out) out.textContent = '翻訳中...'; // ストリームが来るまで維持
    appendLog(id, 'in', text);
    socket.emit('translate', { room, userId: id, text, inputLang, outputLang, mode, model });
  }

  // ===== Share helpers =====
  function originUrl() { return location.href; }

  function copyMainLink() {
    const url = originUrl();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  async function shareLink() {
    const url = originUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'リアルタイム翻訳くん', url }); }
      catch { /* ユーザーキャンセルなどは無視 */ }
    } else {
      copyMainLink();
    }
  }

  function toggleSharePanel() {
    $('#detailPanel')?.classList.toggle('hidden');
    const cur = $('#curUrl'); if (cur) cur.textContent = originUrl();
    buildRoomLinks();
  }

  function buildRoomLinks() {
    const base = location.origin + location.pathname;
    const mk = (r) => `<div><a href="${base}?room=${r}">${r}</a></div>`;
    const el = $('#roomLinks'); if (el) el.innerHTML = ['room1','room2','room3'].map(mk).join('');
  }

  function toggleQRCode() {
    const wrap = $('#qrWrap'); if (!wrap) return;
    wrap.style.display = (wrap.style.display === 'block') ? 'none' : 'block';
    const c = $('#qrCanvas'); if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = '#000';
    ctx.font = '12px monospace';
    ctx.fillText('QR準備: ' + originUrl(), 10, 80);
  }

  // 初期描画
  renderUsers();
});
