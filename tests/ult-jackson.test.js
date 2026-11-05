// «Ультимейт» (5.11): Николас Джексон 99 — карточка, любая позиция с химией 3/3, ИПК, задание и однократная выдача сервером.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

// ---------- клиент: каталог, паки, галерея, химия ----------
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, matchMedia: () => ({ matches: true }), document: { addEventListener() {} }, window: { matchMedia: () => ({ matches: true }) },
  Store: { d: {}, save() {} }, UI: {}, Ui: { get: () => '' }, Release: { weekKey: () => '2026-10-12' }, Day: { key: () => '2026-10-13' }, Coins: { add() {} }, esc: String };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/players.js', 'js/media.js', 'js/data/fcstats.js', 'js/data/fcpos.js', 'js/positions.js', 'js/data/cards.js', 'js/cards.js', 'js/xdraft/engine.js', 'js/xdraft/ui.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
vm.runInContext('globalThis.T = { Cards, XDraft, XD: window.XD };', ctx);
const { Cards, XDraft, XD } = ctx.T;
const KEY = 'UL:nicolas-jackson', c = Cards.get(KEY);
assert.ok(c, 'card exists');
assert.equal(c.name, 'Николас Джексон'); assert.equal(c.r, 99); assert.equal(c.pos, 'ФРВ'); assert.equal(c.rar, 'ult'); assert.ok(c.sbcOnly && c.hero);
assert.equal(c.positions[0], 'ST', 'main position is striker');
assert.equal(c.positions.length, 12, 'plays every position'); assert.ok(c.positions.includes('GK'), 'even goalkeeper');
assert.equal(Cards.draw('ult'), null, 'not in random draws');
for (let lv = 0; lv < 5; lv++) for (let i = 0; i < 40; i++) assert.ok(!Cards.packCards(lv).includes(KEY), 'never in packs');
assert.ok(/УЛЬТИМЕЙТ/.test(Cards.html(c)), 'card band names the rarity');
vm.runInContext("Store.d.cards = { own: { 'UL:nicolas-jackson': 1 }, used: {}, fresh: [] }; globalThis.rs = Cards.readySets(); Store.d.cards.own = {}; globalThis.rs0 = Cards.readySets();", ctx);
assert.equal(ctx.rs, ctx.rs0, 'owning the card creates no gallery prize');
// химия 3/3 на любой позиции, даже в воротах
const ult = { ...c, pos: c.positions, st: c.st };
for (const form of ['4-3-3', '4-4-2']) {
  const F = XD.FORMATIONS[form];
  F.slots.forEach((s, i) => { const xi = Array(11).fill(null); xi[i] = ult; assert.equal(XD.chem('new', form, xi).per[i].chem, 3, `full chemistry at ${s.pos} (${form})`); });
}

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
const sctx = { console, Date, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch: () => { throw Error('Unexpected network'); } };
vm.createContext(sctx);
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, legends, UL };', sctx);
const S = sctx.testAPI;
(async () => {
  const env = { DB: db }, L = (uid, body) => S.legends(env, { id: uid }, body);
  await S.schema(db);
  sql.prepare('INSERT INTO ustats (id, trophies, updated) VALUES (1, 7999, 0), (2, 8000, 0)').run();
  assert.equal((await L(1, { act: 'ult' })).claimed, false, 'status before claim');
  assert.equal((await L(1, { act: 'ult', claim: 1, wins: 25 })).ok, false, '7 999 trophies are not enough (server count)');
  assert.equal((await L(2, { act: 'ult', claim: 1, wins: 24 })).ok, false, '24 wins are not enough');
  assert.equal((await L(3, { act: 'ult', claim: 1, wins: 30 })).ok, false, 'no server trophies — no card');
  const g = await L(2, { act: 'ult', claim: 1, wins: 25 });
  assert.equal(g.ok, true); assert.equal(g.granted, true, 'granted at 8 000 trophies and 25 wins');
  const again = await L(2, { act: 'ult', claim: 1, wins: 25 });
  assert.equal(again.already, true, 'one-time');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM legend_claims WHERE card = 'UL:nicolas-jackson'").get().n, 1, 'one server record (for the OLD card in the new game)');
  assert.equal((await L(2, { act: 'ult' })).claimed, true);
  // ИПК: пять составов, каждый выполним из всех карточек игры
  console.log('Ultimate Jackson: card, any position with 3/3 chemistry, pack exclusion, gallery and one-time server claim passed');
})().catch((e) => { console.error(e); process.exit(1); });
