// Лига канала (22.11): трофеи за неделю, место, соседи, итоги прошлой недели и награда — один раз.
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
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, saveScore, league, weekKey, setNow: (t) => { Date.now = () => t; } };', sctx);
const S = sctx.testAPI;
(async () => {
  const env = { DB: db }, T0 = Date.parse('2026-11-18T12:00:00Z'); // среда
  sctx.Date.now = () => T0;
  await S.schema(db);
  const score = (id, nick, tro) => S.saveScore(env, { id, first_name: nick }, { xp: 10, nick, tro });
  // в начале недели у всех свои трофеи — неделя считает только прибавку
  await score(1, 'Аня', 500); await score(2, 'Боря', 300); await score(3, 'Вика', 100); await score(4, 'Гоша', 0);
  await score(1, 'Аня', 560); await score(2, 'Боря', 400); await score(3, 'Вика', 130);
  let r = await S.league(env, { id: 3 }, {});
  assert.deepEqual(r.rows.map((x) => [x.nick, x.score]), [['Аня', 560], ['Боря', 400], ['Вика', 130]]);
  // новичок без строки ustats: start = 0, поэтому прибавка = все трофеи; у старых — от прежнего значения
  const sc = Object.fromEntries(r.rows.map((x) => [x.nick, x.score]));
  assert.equal(sc['Аня'], 560, 'первая запись трофеев — со стартом 0'); // ustats не было до первой записи
  assert.equal(r.me.place, 3); assert.equal(r.above.nick, 'Боря', 'сосед выше — следующий по очкам'); assert.equal(r.below, null);
  assert.equal(r.rows.find((x) => x.me).nick, 'Вика');
  // правка трофеев не даёт больше потолка недели
  await score(5, 'Чит', 5000); await score(5, 'Чит', 8000);
  sctx.Date.now = () => T0 + 400e3; // кеш таблицы (5 минут) устарел
  r = await S.league(env, { id: 5 }, {});
  assert.ok(r.me.score <= 4000, 'больше 4000 за неделю не засчитывается');
  // следующая неделя: итоги прошлой подводятся сами, награда — один раз
  sctx.Date.now = () => T0 + 7 * 864e5;
  r = await S.league(env, { id: 1 }, {});
  assert.equal(r.last.rows[0].nick, 'Чит'); assert.ok(r.prize && r.prize.place >= 1, 'у Ани есть награда за место');
  assert.equal(r.rows.length, 0, 'новая неделя — пустая таблица');
  const c1 = await S.league(env, { id: 1 }, { act: 'claim' }), c2 = await S.league(env, { id: 1 }, { act: 'claim' });
  assert.equal(c1.ok, true); assert.equal(c2.ok, false, 'вторая попытка забрать — нет');
  // повторный запрос не создаёт награды заново
  await S.league(env, { id: 2 }, {});
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lprize').get().n, 4, 'награды — у 4 игроков с трофеями за неделю');
  // прибавка за новую неделю — от трофеев на её начало
  await score(2, 'Боря', 450);
  sctx.Date.now = () => T0 + 7 * 864e5 + 400e3;
  r = await S.league(env, { id: 2 }, {});
  assert.equal(r.me.score, 50, 'новая неделя считает только новые трофеи');
  console.log('League: weekly trophy gain, place and neighbours, cap, auto results, prize claimed once');
})().catch((e) => { console.error(e); process.exit(1); });
