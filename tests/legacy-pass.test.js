// Пропуск из старой игры: кто купил премиум до запуска новой версии, получает премиум сезона запуска.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
// ---------- сервер: список итальянцев совпадает с пулом драфта ----------
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
const sctx = { URLSearchParams, console, Date, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch: () => { throw Error('Unexpected network'); } };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, hello, passSeason };', sctx);
const S = sctx.testAPI;
(async () => {
  const env = { DB: db };
  await S.schema(db);
  const old = Date.now() - 20 * 864e5;
  sql.prepare("INSERT INTO purchases (id, item, season, stars, ts) VALUES (1, 'pass', 1, 99, ?)").run(old);
  const r1 = await S.hello(env, { id: 1, first_name: 'A' }, { nick: 'A' });
  const launch = Number(sql.prepare("SELECT v FROM settings WHERE k = 'launch:ts'").get().v), sn = S.passSeason(launch);
  assert.ok(r1.pass.includes(sn), 'old buyer gets premium for the launch season');
  assert.ok(r1.pass.includes(1), 'old purchase stays');
  const r2 = await S.hello(env, { id: 2, first_name: 'B' }, { nick: 'B' });
  assert.ok(!r2.pass.includes(sn), 'no purchase — no premium');
  // покупка уже в новой игре (после запуска) — обычная покупка своего сезона, без подарка на сезон запуска сверх неё
  sql.prepare("INSERT INTO purchases (id, item, season, stars, ts) VALUES (3, 'pass', 99, 99, ?)").run(launch + 1000);
  const r3 = await S.hello(env, { id: 3, first_name: 'C' }, { nick: 'C' });
  assert.deepEqual([...r3.pass], [99], 'new-game purchase is not treated as old');
  await S.hello(env, { id: 1, first_name: 'A' }, { nick: 'A' });
  assert.equal(Number(sql.prepare("SELECT v FROM settings WHERE k = 'launch:ts'").get().v), launch, 'launch time is written once');
  console.log('Legacy pass: old buyers get premium of the launch season, others do not, launch time fixed once');
})().catch((e) => { console.error(e); process.exit(1); });
