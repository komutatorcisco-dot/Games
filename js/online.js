// Онлайн против живого соперника для любого режима: случайный соперник (сервер сводит игроков одного режима)
// или комната по коду для друга. Телефоны соединяются напрямую (WebRTC через PeerJS), как в «Футбольной дуэли».
// Online.open(box, { game, title, hello, onReady, back }) рисует лобби в box; когда оба на связи —
// onReady(link): link = { host, op: { nick, emo, data }, seed, send(m), onMsg, onClose, close() }.
'use strict';

const Online = (() => {
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', PRE = 'jacksongames-';
  const SHORT = { xdraft: 'xd', trumps: 'tr' }, LONG = { xd: 'xdraft', tr: 'trumps' };
  const code5 = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  const me = () => ({ nick: String(Store.d.user.nick || 'Игрок').slice(0, 16), emo: Store.d.user.emoji || '⚽' });
  const opts = () => Object.assign({ debug: 0 }, window.DUEL_PEER || {});
  let lib = null, cur = null;
  let activity = 'hub', presenceTimer = null, presenceBusy = false, onlineCounts = { total: null, modes: {} };
  function paintPresence() {
    if (typeof document === 'undefined') return;
    const total = document.querySelector('#online-total');
    if (total) total.textContent = Number.isFinite(onlineCounts.total) ? onlineCounts.total.toLocaleString('ru-RU') : '—';
    const badge = document.querySelector('#online-switch-count');
    if (badge) badge.textContent = Number.isFinite(onlineCounts.total) ? onlineCounts.total.toLocaleString('ru-RU') : '—';
    document.querySelectorAll('[data-presence-game]').forEach((el) => {
      const n = onlineCounts.modes && onlineCounts.modes[el.dataset.presenceGame];
      el.textContent = Number.isFinite(n) ? n.toLocaleString('ru-RU') : '—';
    });
  }
  async function refreshPresence() {
    if (presenceBusy || (typeof document !== 'undefined' && document.hidden) || !Board.ready()) return;
    presenceBusy = true;
    try {
      const r = await Board.post('/presence', { act: 'heartbeat', game: activity });
      if (r && r.ok) { onlineCounts = r; paintPresence(); }
    } catch (e) { /* сеть может быть недоступна */ }
    finally { presenceBusy = false; }
  }
  function setActivity(game) {
    activity = ['duel', 'xdraft', 'trumps'].includes(game) ? game : 'hub';
    refreshPresence();
  }
  function startPresence() {
    if (presenceTimer) return;
    refreshPresence();
    presenceTimer = setInterval(refreshPresence, 20000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Board.ready()) Board.post('/presence', { act: 'leave' }).catch(() => {});
      else refreshPresence();
    });
    paintPresence();
  }
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return lib || (lib = new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js';
      s.onload = () => ok(); s.onerror = () => { lib = null; bad(new Error('peerjs')); };
      document.head.appendChild(s);
    }));
  }
  const mm = (body) => Board.post('/mm', body).catch(() => ({ ok: false }));

  // закрыть всё: поиск, соединение, таймеры
  function stop() {
    if (!cur) return;
    const c = cur; cur = null;
    if (c.inviteCleanup) { c.inviteCleanup(); c.inviteCleanup = null; }
    c.alive = false; c.timers.forEach(clearTimeout);
    if (c.mm) mm({ act: 'cancel', game: c.o.game });
    try { c.conn && c.conn.close(); } catch (e) { /* уже закрыто */ }
    try { c.peer && c.peer.destroy(); } catch (e) { /* уже закрыто */ }
    setActivity('hub');
  }

  function open(box, o) {
    stop();
    setActivity(o.game);
    const c = cur = { o, box, screen: Screens.current, alive: true, timers: [], peer: null, conn: null, mm: false };
    const T = (fn, ms) => { const id = setTimeout(() => c.alive && fn(), ms); c.timers.push(id); };
    let acts = {};
    box.onclick = null;
    const click = (e) => {
      if (cur !== c) return box.removeEventListener('click', click);
      const b = e.target.closest('[data-on]'); if (!b) return;
      e.stopPropagation(); Sound.play('tap');
      const f = acts[b.dataset.on]; if (f) f();
    };
    box.addEventListener('click', click, true);
    const leave = () => { stop(); box.removeEventListener('click', click, true); o.back && o.back(); };

    function menu() {
      if (cur !== c) return;
      killPeer();
      box.innerHTML = `<div class="on-wrap"><div class="on-ico">${Ui.get('bolt')}</div><h3>${esc(o.title)}</h3><p>${esc(o.lead || 'Играй против живого соперника в реальном времени.')}</p>
        <button class="btn gold" data-on="rnd">${Ui.get('users')} Случайный соперник</button>
        <button class="btn" data-on="host">${Ui.get('send')} Позвать друга</button>
        <div class="on-join"><input id="on-code" maxlength="5" placeholder="КОД" autocomplete="off" autocapitalize="characters"><button class="btn" data-on="join">Войти</button></div>
        <button class="btn ghost" data-on="back">Назад</button></div>`;
      acts = { rnd: random, host, back: leave, join: () => { const v = ($('#on-code', box).value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v.length === 5) join(v); else toast('В коде 5 символов'); } };
    }
    function wait(text, code) {
      box.innerHTML = `<div class="on-wrap on-wait"><div class="du-radar"><i></i><i></i><i></i><span>${esc(me().emo)}</span></div><h3>${text}</h3>
        ${code ? `<div class="du-code">${code.split('').map((ch, k) => `<b style="--i:${k}">${ch}</b>`).join('')}</div>
        <button class="btn gold" data-on="invite">${Ui.get('send')} Отправить приглашение</button><button class="btn ghost" data-on="copy">Скопировать код</button>` : ''}
        ${code && o.onCode ? '<p>Вызов в чате клуба. Оставайся здесь до подключения соперника. Отмена закроет вызов.</p>' : ''}
        <button class="btn ghost" data-on="menu">Отмена</button></div>`;
      acts = { menu: () => { mmStop(); menu(); } };
    }
    function fail(msg) {
      if (cur !== c) return;
      mmStop(); killPeer();
      box.innerHTML = `<div class="on-wrap"><div class="on-ico">${Ui.get('signal')}</div><h3>${esc(msg)}</h3><p>Попробуй ещё раз — в некоторых мобильных сетях соединение не с первого раза.</p>
        <button class="btn gold" data-on="menu">Попробовать снова</button><button class="btn ghost" data-on="back">Назад</button></div>`;
      acts = { menu, back: leave };
    }
    function clearInvite() { if (c.inviteCleanup) { c.inviteCleanup(); c.inviteCleanup = null; } }
    function killPeer() { clearInvite(); try { c.conn && c.conn.close(); } catch (e) { /* */ } try { c.peer && c.peer.destroy(); } catch (e) { /* */ } c.conn = null; c.peer = null; }
    const mmStop = () => { if (c.mm) { c.mm = false; mm({ act: 'cancel', game: o.game }); } };

    async function random() {
      if (!Board.ready()) { toast('Онлайн работает в Telegram через бота @JacksonGamesbot'); return; }
      wait('Ищем соперника…');
      try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн'); }
      if (cur !== c) return;
      const code = code5(), t0 = Date.now();
      killPeer(); c.mm = true;
      c.peer = new window.Peer(PRE + code, opts());
      c.peer.on('connection', (x) => { if (c.conn) { x.on('open', () => x.close()); return; } mmStop(); wire(x, true); });
      c.peer.on('error', (e) => { if (e.type === 'unavailable-id') { mmStop(); random(); } else if (!c.conn) fail('Не удалось выйти в онлайн'); });
      const poll = async () => {
        if (cur !== c || !c.mm || c.conn) return;
        const r = await mm({ act: 'find', game: o.game, code, nick: me().nick, emo: me().emo });
        if (cur !== c || !c.mm || c.conn) return;
        if (r.ok && r.role === 'join') { c.mm = false; toast(`Соперник найден: ${String(r.nick || 'Игрок').slice(0, 16)}`); return join(r.code); }
        const h = $('.on-wait h3', box); if (h) h.textContent = r.ok && r.waiting > 1 ? `Ищем соперника… ищут: ${r.waiting}` : 'Ищем соперника…';
        if (Date.now() - t0 > 60000) {
          mmStop(); killPeer();
          box.innerHTML = `<div class="on-wrap"><div class="on-ico">${Ui.get('users')}</div><h3>Пока никого нет онлайн</h3><p>Позови друга — отправь ему код комнаты.</p>
            <button class="btn gold" data-on="rnd">Искать ещё</button><button class="btn" data-on="host">${Ui.get('send')} Позвать друга</button><button class="btn ghost" data-on="menu">Назад</button></div>`;
          acts = { rnd: random, host, menu }; return;
        }
        T(poll, 3000);
      };
      c.peer.on('open', poll);
    }
    async function host() {
      wait('Создаём комнату…');
      try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн'); }
      if (cur !== c) return;
      const code = code5();
      killPeer();
      c.peer = new window.Peer(PRE + code, opts());
      c.peer.on('open', () => {
        wait('Ждём друга…', code);
        if (o.onCode) {
          const advertisedPeer = c.peer;
          Promise.resolve().then(() => o.onCode(code)).then(clean => {
            if (typeof clean !== 'function') return;
            if (cur === c && c.peer === advertisedPeer && !c.conn) c.inviteCleanup = clean; else clean();
          }).catch(() => { if (cur === c && c.peer === advertisedPeer) fail('Не удалось отправить вызов в клуб'); });
        }
        acts.invite = () => Duel.share(`o_${SHORT[o.game] || o.game}_${code}`, `⚡ ${o.title} — сыграем онлайн! Код комнаты: ${code}`);
        acts.copy = () => { try { navigator.clipboard.writeText(code).then(() => toast('Код скопирован')); } catch (e) { toast(code); } };
      });
      c.peer.on('disconnected', () => { clearInvite(); if (cur === c && !c.conn) fail('Соединение с комнатой потеряно — создай новый вызов'); });
      c.peer.on('close', clearInvite);
      c.peer.on('connection', (x) => { if (c.conn) { x.on('open', () => x.close()); return; } wire(x, true); });
      c.peer.on('error', (e) => { if (e.type === 'unavailable-id') host(); else if (!c.conn) fail('Не удалось создать комнату'); });
    }
    async function join(code) {
      wait(`Подключаемся к ${code}…`);
      try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн'); }
      if (cur !== c) return;
      killPeer();
      c.peer = new window.Peer(opts());
      c.peer.on('open', () => wire(c.peer.connect(PRE + code, { reliable: true }), false));
      c.peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Комната не найдена — проверь код' : 'Не удалось подключиться'));
      T(() => { if (!c.conn || !c.conn.open) fail('Не удалось подключиться'); }, 20000);
    }
    // рукопожатие: оба шлют hi {nick, emo, data}; хозяин отвечает go {seed}; дальше — сообщения режима
    function wire(x, isHost) {
      c.conn = x;
      let link = null, op = null;
      const send = (m) => { try { x.open && x.send(m); } catch (e) { /* соединение пропало */ } };
      x.on('open', () => { clearInvite(); send({ t: 'hi', ...me(), data: o.hello ? o.hello() : null }); });
      x.on('close', () => { if (c.conn !== x) return; c.conn = null; if (link) { if (link.onClose) link.onClose(); } else fail('Соединение закрыто'); });
      x.on('error', () => {});
      const ready = (seed) => {
        box.removeEventListener('click', click, true);
        link = { host: isHost, op, seed, send, onMsg: null, onClose: null, close: () => { if (cur === c) stop(); } };
        Sound.play('whistle'); haptic('ok'); toast(`Играем с ${op.nick}!`);
        o.onReady(link);
      };
      x.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (link) { if (link.onMsg) link.onMsg(m); return; }
        if (m.t === 'hi') {
          op = { nick: String(m.nick || 'Соперник').replace(/[<>]/g, '').slice(0, 16), emo: String(m.emo || '⚽').slice(0, 4), data: m.data };
          if (isHost) { const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0; send({ t: 'go', seed }); ready(seed); }
        } else if (m.t === 'go' && !isHost && op) ready(m.seed >>> 0);
      });
    }

    if (o.join) join(o.join); else if (o.host) host(); else menu();
  }

  // ссылка-приглашение o_xd_CODE / o_tr_CODE
  function deep(param) {
    const m = /^o_([a-z]+)_([A-Z0-9]{5})$/.exec(param || ''); if (!m) return false;
    const game = LONG[m[1]] || m[1];
    if (game === 'xdraft' && typeof XMatch !== 'undefined') { Promise.resolve(XDraft.open()).then(() => XMatch.online(XMatch.DRAFT, m[2])); return true; }
    if (game === 'trumps') { NG.open('trumps', { online: m[2] }); return true; }
    return false;
  }
  return { open, stop, deep, startPresence, setActivity, refreshPresence, counts: () => onlineCounts, leaveScreen: id => { if (cur && cur.screen !== id) stop(); } };
})();
