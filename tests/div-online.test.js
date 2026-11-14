// Онлайн в дивизионах: свой состав сохраняется, соперник — состав живого игрока своего или соседнего дивизиона.
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
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, divOnline };', sctx);
const S = sctx.testAPI;
const row = (n, r) => [n, r, 70, 71, 72, 73, 74, 75, 'ST'].join('|');
const sq = (n) => [row(n + '1', 80), row(n + '2', 81), row(n + '3', 79)];
(async () => {
  const env = { DB: db }, F = (uid, body) => S.divOnline(env, { id: uid }, { act: 'find', ...body });
  await S.schema(db);
  assert.equal((await F(1, { di: 3, sq: sq('A'), keys: ['k1', 'k2', 'k3'], ovr: 80, nick: 'Аня' })).opp, null, 'первый — соперников нет, игра даст бота');
  const r2 = await F(2, { di: 3, sq: sq('B'), ovr: 81, nick: 'Боря' });
  assert.equal(r2.opp.nick, 'Аня', 'второй находит первого'); assert.deepEqual([...r2.opp.keys], ['k1', 'k2', 'k3']); assert.equal(r2.opp.sq.length, 3);
  assert.equal((await F(3, { di: 9, sq: sq('C'), ovr: 90 })).opp, null, 'далёкий дивизион — не подбираем');
  assert.equal((await F(4, { di: 4, sq: sq('D'), ovr: 85 })).opp.di === 3, true, 'соседний дивизион подходит');
  for (let i = 0; i < 10; i++) assert.notEqual((await F(1, { di: 3, sq: sq('A'), ovr: 80 })).opp.uid, 1, 'себя не подбираем');
  assert.equal((await F(5, { di: 3, sq: ['<script>|99|1|1|1|1|1|1'], ovr: 99 })).ok, true);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM div_sq WHERE uid = 5').get().n, 0, 'кривой состав не сохраняется');
  console.log('Division online: own squad stored, opponent from same/neighbour division, never self, bad squads rejected');
})().catch((e) => { console.error(e); process.exit(1); });
