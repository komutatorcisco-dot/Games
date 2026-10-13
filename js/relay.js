// Онлайн через наш сервер вместо прямого соединения телефонов (WebRTC/PeerJS в мобильных сетях часто не соединялся).
// Интерфейс тот же, что у PeerJS, поэтому онлайн-режимы почти не менялись:
//   new Relay.Peer(id)  — хозяин комнаты: on('open'), on('connection', conn), on('error', {type}), on('disconnected'), destroy();
//   new Relay.Peer()    — гость: peer.connect(id) → conn;
//   conn: on('open' | 'data' | 'close' | 'error'), send(obj), close(), open.
// Сообщения уходят пачками (не чаще раза в 0,7 с), приходят «долгим» опросом сервера /room.
'use strict';

const Relay = (() => {
  const post = (body) => Board.post('/room', body);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function emitter(o) {
    const ev = {};
    o.on = (k, f) => { (ev[k] || (ev[k] = [])).push(f); return o; };
    o.emit = (k, ...a) => (ev[k] || []).slice().forEach((f) => { try { f(...a); } catch (e) { safe('relay', () => { throw e; }); } });
    return o;
  }

  // соединение с соперником внутри комнаты (одно на сторону)
  function Conn(room) {
    const c = emitter({ open: false, peer: room });
    let after = 0, alive = true, queue = [], flushT = 0, lastFlush = 0, sending = false, fails = 0;
    const flush = async () => {
      flushT = 0;
      if (!alive || sending || !queue.length) return;
      sending = true; const msgs = queue; queue = []; lastFlush = Date.now();
      try { const r = await post({ act: 'send', room, msgs }); if (!r || !r.ok) throw new Error((r && r.error) || 'send'); }
      catch (e) { if (alive) { queue = msgs.concat(queue); } }
      sending = false;
      if (alive && queue.length) schedule();
    };
    const schedule = () => { if (!flushT) flushT = setTimeout(flush, Math.max(60, 700 - (Date.now() - lastFlush))); };
    c.send = (m) => { if (!alive) return; queue.push(m); schedule(); };
    c.close = () => {
      if (!alive) return;
      alive = false; c.open = false; clearTimeout(flushT);
      post({ act: 'leave', room }).catch(() => {});
      c.emit('close');
    };
    const lost = () => { if (!alive) return; alive = false; c.open = false; clearTimeout(flushT); c.emit('close'); };
    c.start = async () => {
      c.open = true; c.emit('open');
      while (alive) {
        let r;
        try { r = await post({ act: 'poll', room, after, wait: 8000 }); } catch (e) { r = null; }
        if (!alive) return;
        if (!r || !r.ok) {
          if (r && (r.error === 'not found' || r.error === 'not in room')) return lost();
          if (++fails > 8) return lost(); // ~полминуты без связи с сервером
          await sleep(1500 * Math.min(fails, 3)); continue;
        }
        fails = 0; after = r.after || after;
        (r.msgs || []).forEach((m) => alive && c.emit('data', m));
        if (r.gone) return lost();
      }
    };
    return c;
  }

  function Peer(id) {
    const p = emitter({ id: null, destroyed: false });
    let conn = null;
    const room = typeof id === 'string' ? id.toLowerCase() : null;
    p.destroy = () => {
      if (p.destroyed) return;
      p.destroyed = true;
      if (conn) conn.close(); else if (room) post({ act: 'leave', room }).catch(() => {});
      p.emit('close');
    };
    p.connect = (target) => {
      const r0 = String(target).toLowerCase();
      const c = Conn(r0);
      (async () => {
        let r;
        for (let k = 0; k < 3 && !p.destroyed; k++) {
          try { r = await post({ act: 'join', room: r0 }); break; } catch (e) { r = null; await sleep(1200); }
        }
        if (p.destroyed) return;
        if (!r || !r.ok) return p.emit('error', { type: r && r.error === 'not found' ? 'peer-unavailable' : r && r.error === 'full' ? 'room-full' : 'network' });
        conn = c; c.start();
      })();
      return c;
    };
    (async () => {
      if (!room) { p.id = 'guest'; await sleep(0); if (!p.destroyed) p.emit('open', p.id); return; }
      let r = null;
      for (let k = 0; k < 3 && !p.destroyed; k++) {
        try { r = await post({ act: 'open', room }); break; } catch (e) { await sleep(1200); }
      }
      if (p.destroyed) return;
      if (!r) return p.emit('error', { type: 'network' });
      if (!r.ok) return p.emit('error', { type: r.error === 'taken' ? 'unavailable-id' : 'server-error' });
      p.id = room; p.emit('open', room);
      // ждём гостя: долгий опрос возвращается, как только он вошёл
      let fails = 0;
      while (!p.destroyed && !conn) {
        let s;
        try { s = await post({ act: 'poll', room, after: 0, wait: 8000 }); } catch (e) { s = null; }
        if (p.destroyed || conn) return;
        if (!s || !s.ok) { if (++fails > 8) return p.emit('disconnected'); await sleep(1500); continue; }
        fails = 0;
        if (s.guest) { conn = Conn(room); p.emit('connection', conn); conn.start(); return; }
      }
    })();
    return p;
  }

  return { Peer, ready: () => typeof Board !== 'undefined' && Board.ready() };
})();
