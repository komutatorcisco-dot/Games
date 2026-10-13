// Бюджет D1: горячие запросы (онлайн, очередь поиска, присутствие, уборка, клубы) не должны перебирать таблицы целиком.
// D1 считает Rows Read по просмотренным строкам: полный SCAN большой таблицы = вся таблица на каждый запрос.
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
const sctx = { console, Date, Math, setTimeout, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch: () => { throw Error('net'); } };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema };', sctx);
const plan = (q, n) => sql.prepare('EXPLAIN QUERY PLAN ' + q).all(...Array(n).fill(1)).map((r) => r.detail).join(' | ');
(async () => {
  await sctx.testAPI.schema(db);
  const hot = [
    ['SELECT id, body FROM rmsg WHERE room = ? AND side = ? AND id > ? ORDER BY id LIMIT 30', 3, 'опрос сообщений соперника'],
    ['DELETE FROM rmsg WHERE room IN (SELECT room FROM rooms WHERE created < ?)', 1, 'уборка сообщений'],
    ['DELETE FROM rooms WHERE created < ?', 1, 'уборка комнат'],
    ['DELETE FROM mmg WHERE game = ? AND paired IS NULL AND ts < ?', 2, 'очередь: устаревшие'],
    ['SELECT id, code, nick, emo FROM mmg WHERE game = ? AND paired IS NULL AND id != ? ORDER BY ts ASC LIMIT 1', 2, 'очередь: соперник'],
    ['SELECT COUNT(*) AS n FROM (SELECT 1 FROM mmg WHERE game = ? AND paired IS NULL LIMIT 20)', 1, 'очередь: сколько ищут'],
    ['SELECT game, COUNT(*) AS n FROM presence WHERE ts >= ? GROUP BY game', 1, 'в сети'],
    ['DELETE FROM event_batches WHERE ts < ?', 1, 'уборка пачек событий'],
    ['SELECT game, code, uid FROM croom WHERE club = ? AND ts > ?', 2, 'вызовы клуба'],
    ['SELECT ts FROM cchat WHERE uid = ? AND kind = ? ORDER BY id DESC LIMIT 1', 2, 'чат клуба: частота'],
    ['SELECT u.id, u.nick, u.emoji, s.trophies AS score FROM ustats s JOIN users u ON u.id = s.id WHERE s.trophies > 0 ORDER BY s.trophies DESC, s.updated ASC LIMIT 50', 0, 'топ трофеев'],
  ];
  for (const [q, n, what] of hot) {
    const p = plan(q, n);
    assert.ok(!/(^|\| )SCAN (rmsg|rooms|mmg|presence|event_batches|croom|cchat|ustats|s)\b(?! USING)/.test(p), `${what}: полный перебор таблицы — ${p}`);
    assert.ok(!/TEMP B-TREE FOR ORDER BY/.test(p) || /COUNT/.test(q), `${what}: сортировка всей выборки — ${p}`);
  }
  console.log('D1 budget: hot queries use indexes (online relay, matchmaking, presence, cleanup, clubs, trophy top) passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
