// Пригласи друга: подарок новичку один раз, награда за друга после 100 трофеев один раз, ступени 3 и 10; «кто ищет соперника».
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
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { hello, referrals, matchmake };', sctx);
const { hello, referrals, matchmake } = sctx.testAPI;
const env = { DB: db };
const H = (id, start) => hello(env, { id, first_name: 'P' + id, start_param: start || '' }, { nick: 'P' + id });
const F = (id, body) => referrals(env, { id }, body);
(async () => {
  await H(1001);                                                    // пригласивший уже играет
  assert.equal((await H(1002, 'ref_1001')).refGift, true, 'новичок по ссылке получает подарок');
  assert.equal((await H(1002, 'ref_1001')).refGift, false, 'подарок — один раз');
  assert.equal((await H(1001, 'ref_1002')).refGift, false, 'старый игрок не становится приглашённым');
  assert.equal((await H(1003, 'ref_1003')).refGift, false, 'себя пригласить нельзя');
  assert.equal((await H(1004, 'ref_999999')).refGift, false, 'по ссылке несуществующего игрока подарка нет');
  let st = await F(1001, {});
  assert.equal(st.friends.length, 1); assert.equal(st.friends[0].id, 1002); assert.equal(st.friends[0].ready, false);
  assert.equal((await F(1001, { act: 'claim', id: 1002 })).ok, false, 'до 100 трофеев награды нет');
  sql.prepare('INSERT INTO ustats (id, trophies, updated) VALUES (1002, 150, 0)').run();
  assert.equal((await F(1001, {})).friends[0].ready, true);
  const c1 = await F(1001, { act: 'claim', id: 1002 }); assert.equal(c1.ok, true); assert.equal(JSON.stringify(c1.reward), JSON.stringify({ coins: 500, pack: 1 }));
  assert.equal((await F(1001, { act: 'claim', id: 1002 })).ok, false, 'за друга — один раз');
  assert.equal((await F(1005, { act: 'claim', id: 1002 })).ok, false, 'чужого друга не забрать');
  assert.equal((await F(1001, { act: 'mile', n: 3 })).ok, false, 'ступень 3 — только с тремя друзьями');
  for (const id of [1006, 1007]) { await H(id, 'ref_1001'); sql.prepare('INSERT INTO ustats (id, trophies, updated) VALUES (?, 120, 0)').run(id); assert.equal((await F(1001, { act: 'claim', id })).ok, true); }
  const m = await F(1001, { act: 'mile', n: 3 }); assert.equal(m.ok, true); assert.equal(JSON.stringify(m.reward), JSON.stringify({ pack: 2 }));
  assert.equal((await F(1001, { act: 'mile', n: 3 })).ok, false, 'ступень — один раз');
  assert.equal((await F(1001, { act: 'mile', n: 5 })).error, 'bad mile');
  st = await F(1001, {}); assert.equal(st.miles.find((x) => x.n === 3).claimed, true); assert.equal(st.friends.length, 3);
  // кто ищет соперника
  await matchmake(env, { id: 30 }, { act: 'find', game: 'duel', code: 'ABCDE', nick: 'A' });
  assert.deepEqual(JSON.parse(JSON.stringify((await matchmake(env, { id: 31 }, { act: 'peek' })).waiting)), { duel: 1 }, 'видно, что в дуэли ищут');
  assert.deepEqual(JSON.parse(JSON.stringify((await matchmake(env, { id: 30 }, { act: 'peek' })).waiting)), {}, 'себя не видно');
  sql.prepare('UPDATE mmg SET ts = ? WHERE id = 30').run(Date.now() - 40000);
  assert.deepEqual(JSON.parse(JSON.stringify((await matchmake(env, { id: 31 }, { act: 'peek' })).waiting)), {}, 'устаревший поиск не показывается');
  console.log('PASS referrals: gift once, claim after 100 trophies once, miles 3/10, peek');
})().catch((e) => { console.error(e); process.exit(1); });
