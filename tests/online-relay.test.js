// Онлайн через сервер: комната на двоих, пересылка сообщений, «долгий» опрос, уход соперника.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
const db = {
  prepare(text) {
    return { bind(...args) {
      let i = 0; const values = [];
      const query = text.replace(/\?(\d+)?/g, (_, n) => { values.push(args[n ? Number(n) - 1 : i++]); return '?'; });
      const stmt = sql.prepare(query);
      return { first: async () => stmt.get(...values) || null, all: async () => ({ results: stmt.all(...values) }), run: async () => { const r = stmt.run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } };
    }, async run() { return this.bind().run(); }, async first() { return this.bind().first(); } };
  },
  async batch(items) { sql.exec('BEGIN'); try { const r = []; for (const x of items) r.push(await x.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
};
const sctx = { console, Date, Math, setTimeout, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch: () => { throw Error('Unexpected network'); } };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { relay };', sctx);
const { relay } = sctx.testAPI;
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const R = (uid, body) => relay({ DB: db }, { id: uid }, body);

(async () => {
  const room = 'jacksongames-abcde';
  assert.equal((await R(1, { act: 'open', room })).ok, true, 'host opens');
  assert.equal((await R(2, { act: 'open', room })).error, 'taken', 'live room code is not stolen');
  assert.equal((await R(1, { act: 'join', room })).error, 'own room');
  assert.equal((await R(9, { act: 'join', room: 'jacksongames-zzzzz' })).error, 'not found');
  // хозяин ждёт гостя: опрос возвращается, как только гость вошёл
  const waiting = R(1, { act: 'poll', room, after: 0, wait: 3000 });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await R(2, { act: 'join', room })).ok, true, 'guest joins');
  const w = await waiting; assert.equal(w.guest, true, 'host learns the guest joined'); assert.equal(w.gone, false);
  assert.equal((await R(3, { act: 'join', room })).error, 'full', 'third player cannot join');
  // сообщения идут только к сопернику, по порядку, без повторов
  await R(1, { act: 'send', room, msgs: [{ t: 'hi', n: 1 }, { t: 'go', seed: 5 }] });
  await R(2, { act: 'send', room, msgs: [{ t: 'hi', n: 2 }] });
  const g = await R(2, { act: 'poll', room, after: 0, wait: 0 });
  same(g.msgs, [{ t: 'hi', n: 1 }, { t: 'go', seed: 5 }]);
  const g2 = await R(2, { act: 'poll', room, after: g.after, wait: 0 }); same(g2.msgs, [], 'no repeats');
  const h = await R(1, { act: 'poll', room, after: 0, wait: 0 }); same(h.msgs, [{ t: 'hi', n: 2 }], 'host gets only guest messages');
  // долгий опрос дожидается сообщения
  const p = R(2, { act: 'poll', room, after: g.after, wait: 4000 }), t0 = Date.now();
  await new Promise((r) => setTimeout(r, 500)); await R(1, { act: 'send', room, msgs: [{ t: 'pick', i: 3 }] });
  const pr = await p; same(pr.msgs, [{ t: 'pick', i: 3 }]); assert.ok(Date.now() - t0 < 2500, 'delivered without waiting the full timeout');
  assert.equal((await R(7, { act: 'poll', room, after: 0 })).error, 'not in room', 'strangers cannot read the room');
  assert.equal((await R(1, { act: 'send', room, msgs: [{ x: 'y'.repeat(70000) }] })).error, 'too big');
  // уход: соперник узнаёт сразу
  await R(1, { act: 'leave', room });
  const gone = await R(2, { act: 'poll', room, after: pr.after, wait: 0 }); assert.ok(gone.gone || gone.error === 'not found', 'guest sees the host left');
  // пропал без «leave»: нет опросов 25 с — считается ушедшим
  const room2 = 'jacksongames-fghij';
  await R(1, { act: 'open', room: room2 }); await R(2, { act: 'join', room: room2 });
  sql.prepare('UPDATE rooms SET seen0 = ? WHERE room = ?').run(Date.now() - 30000, room2);
  assert.equal((await R(2, { act: 'poll', room: room2, after: 0, wait: 0 })).gone, true, 'silent host counts as gone');
  console.log('Online relay: rooms, join/full, ordered delivery, long poll, privacy, size limit, leave and timeout passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
