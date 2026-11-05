// «Админка»: админ ставит себе трофеи (0…15 000), остальным — отказ.
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
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, setSetting, route, hmac };', sctx);
const S = sctx.testAPI;
const TOKEN = '1:test';
async function initData(id) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'T' }) });
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const sig = [...new Uint8Array(await S.hmac(await S.hmac('WebAppData', TOKEN), check))].map((b) => b.toString(16).padStart(2, '0')).join('');
  p.set('hash', sig); return p.toString();
}
(async () => {
  const env = { DB: db, BOT_TOKEN: TOKEN };
  await S.schema(db); await S.setSetting(db, 'admins', JSON.stringify([5]));
  const call = async (id, tro) => { const r = await S.route(new Request('https://x/admin/tro', { method: 'POST', body: JSON.stringify({ initData: await initData(id), tro }) }), env); return { status: r.status, body: await r.json() }; };
  assert.equal((await call(6, 9000)).status, 403, 'not an admin');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM ustats').get().n, 0);
  assert.equal((await call(5, 10000)).body.tro, 10000, 'admin sets own trophies');
  assert.equal((await call(5, 99999)).body.tro, 15000, 'capped at 15 000');
  assert.equal((await call(5, 2000)).body.tro, 2000, 'can lower');
  assert.equal(sql.prepare('SELECT trophies FROM ustats WHERE id = 5').get().trophies, 2000);
  console.log('Admin trophies: only admins, own account, 0–15 000 passed');
})().catch((e) => { console.error(e); process.exit(1); });
