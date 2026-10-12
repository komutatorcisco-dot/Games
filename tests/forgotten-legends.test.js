// «Забытые легенды»: карточка Балотелли, химия героя, галерея и серверная однократная выдача.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

// ---------- клиент: каталог, паки, галерея, химия ----------
const ctx = { console, setTimeout: () => 0, clearTimeout() {}, matchMedia: () => ({ matches: true }), document: { addEventListener() {} }, window: { matchMedia: () => ({ matches: true }) },
  Store: { d: {}, save() {} }, UI: {}, Ui: { get: () => '' }, Release: { weekKey: () => '2026-10-12' }, Day: { key: () => '2026-10-13' }, Coins: { add() {} }, esc: String };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/players.js', 'js/media.js', 'js/data/fcstats.js', 'js/data/fcpos.js', 'js/positions.js', 'js/data/cards.js', 'js/cards.js', 'js/xdraft/engine.js', 'js/xdraft/ui.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
vm.runInContext('globalThis.T = { Cards, XDraft, XD: window.XD };', ctx);
const { Cards, XDraft, XD } = ctx.T;
const KEY = 'FL:mario-balotelli', c = Cards.get(KEY);
assert.ok(c, 'card exists');
assert.equal(c.name, 'Марио Балотелли'); assert.equal(c.r, 89); assert.equal(c.pos, 'ФРВ'); assert.equal(c.nat, 'Италия'); assert.equal(c.rar, 'forgotten');
assert.ok(c.positions.includes('ST'), 'ФРВ maps to striker position');
assert.equal(c.club, '', 'series emblem is not a club');
assert.equal(c.crestUrl, 'img/brand/forgotten-legends.svg');
assert.ok(fs.existsSync(c.crestUrl) && fs.existsSync(c.faceUrl), 'emblem and portrait files exist');
assert.equal(Cards.draw('forgotten'), null, 'not in random draws');
for (let lv = 0; lv < 5; lv++) for (let i = 0; i < 40; i++) assert.ok(!Cards.packCards(lv).includes(KEY), 'never in packs');
ctx.Store.d.cards = { own: {}, used: {}, fresh: [] };
assert.ok(!Cards.album().includes('Забытые легенды'), 'series hidden in gallery until the challenge is enabled');
ctx.Store.d.cards = { own: { [KEY]: 1 }, used: {}, fresh: [] };
assert.ok(Cards.album().includes('Забытые легенды'), 'gallery group visible once the card is owned');
assert.ok(/ЗАБЫТЫЕ ЛЕГЕНДЫ/.test(Cards.html(c)), 'card band names the series');
// сбор серии из одной карточки не даёт награды (экономика не меняется)
ctx.Store.d.cards = { own: { [KEY]: 1 }, used: {}, fresh: [] };
assert.equal(Cards.readySets(), Cards.readySets(), 'readySets stable');
vm.runInContext("globalThis.rs = Cards.readySets(); Store.d.cards.own = {}; globalThis.rs0 = Cards.readySets();", ctx);
assert.equal(ctx.rs, ctx.rs0, 'owning the series card creates no claimable set prize');

// химия: герой серии — 3/3 на своей позиции, эмблема серии не считается клубом
const hero = { ...c, pos: c.positions, st: c.st };
const ita = XDraft.pool().find((p) => p.nat === 'Италия' && p.pos.includes('LW'));
const other = XDraft.pool().find((p) => p.nat !== 'Италия' && p.pos.includes('RW'));
const F = XD.FORMATIONS['4-3-3'], stI = F.slots.findIndex((s) => s.pos === 'ST'), lwI = F.slots.findIndex((s) => s.pos === 'LW'), rwI = F.slots.findIndex((s) => s.pos === 'RW');
const xi = Array(11).fill(null); xi[stI] = hero; xi[lwI] = ita; xi[rwI] = other;
const nw = XD.chem('new', '4-3-3', xi);
assert.equal(nw.per[stI].chem, 3, 'hero has full new chemistry in position');
assert.ok(!Object.keys(nw.counts.club).some((k) => k === '' || /Забытые/.test(k)), 'series is not counted as a club');
assert.equal(nw.counts.nat['Италия'], 2, 'hero adds to his nation');
const cl = XD.chem('classic', '4-3-3', xi);
const linkTo = (j) => cl.links.find((l) => (l.i === stI && l.j === j) || (l.j === stI && l.i === j));
if (linkTo(lwI)) assert.equal(linkTo(lwI).color, 'green', 'hero + same nation is a strong link');
if (linkTo(rwI)) assert.notEqual(linkTo(rwI).color, 'green', 'hero + other nation is not strong');
const two = Array(11).fill(null); two[stI] = hero; two[lwI] = { ...hero, name: 'Другой герой', nat: 'Франция', pos: ['LW'] };
assert.ok(!Object.keys(XD.chem('new', '4-3-3', two).counts.club).length, 'two heroes do not share a club');

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
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8').replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '') + '\nglobalThis.testAPI = { schema, legends, draftTour, FL_ITALY, FL };', sctx);
const S = sctx.testAPI;
const poolIta = XDraft.pool().filter((p) => p.nat === 'Италия').map((p) => p.name).sort();
assert.equal(JSON.stringify([...S.FL_ITALY].sort()), JSON.stringify(poolIta), 'server Italian list matches the draft pool (regenerate if players change)');

(async () => {
  const ON = { DB: db, FL_ENABLED: '1', FL_START: '1000' }, OFF = { DB: db };
  const L = (env, uid, body) => S.legends(env, { id: uid }, body);
  const tour = (uid, body) => S.draftTour({ DB: db }, { id: uid }, body);
  await S.schema(db);
  assert.equal((await L(OFF, 1, { act: 'status' })).disabled, true, 'disabled without FL_ENABLED');
  // включение только для проверяющих: список ID и режим «только админы»
  assert.equal((await L({ DB: db, FL_TESTERS: '42, 43' }, 42, { act: 'status' })).ok, true, 'tester id enabled');
  assert.equal((await L({ DB: db, FL_TESTERS: '42, 43' }, 44, { act: 'status' })).disabled, true, 'other players stay disabled');
  vm.runInContext('adminIds = async () => [99];', sctx);
  assert.equal((await L({ DB: db, FL_ENABLED: 'admins' }, 99, { act: 'status' })).ok, true, 'admin enabled in admins mode');
  assert.equal((await L({ DB: db, FL_ENABLED: 'admins' }, 98, { act: 'status' })).disabled, true, 'non-admin disabled in admins mode');

  // турниры: 3 попытки по 4 матча; результаты только дописываются
  const roster = (k) => Array.from({ length: 11 }, (_, i) => `Игрок ${k}-${i}`);
  async function play(uid, k, wins) {
    const st = await tour(uid, { act: 'start', players: roster(k), state: JSON.stringify({ round: 0, res: [], over: false }) });
    const res = [];
    for (let m = 0; m < 4; m++) {
      const win = m < wins; res.push({ s: win ? [2, 0] : [0, 1], pens: null, win });
      const over = !win || m === 3;
      const r = await tour(uid, { act: 'sync', attempt: st.attempt, state: JSON.stringify({ round: m + 1, res, over }) });
      assert.equal(r.ok, true, 'append sync ok');
      if (over) break;
    }
    return st.attempt;
  }
  const a1 = await play(7, 'a', 4); // 4 матча, 4 победы
  let s = await L(ON, 7, { act: 'status' });
  assert.equal([s.tasks.matches, s.tasks.wins, s.tasks.italians].join(), '4,4,0');
  // переписать прошлое нельзя
  const bad = await tour(7, { act: 'sync', attempt: a1, state: JSON.stringify({ res: [{ s: [9, 0], win: true }], over: true }) });
  assert.equal(bad.ok, false, 'rewriting results rejected');
  assert.equal(bad.state.res.length, 4, 'rejection returns the server state so a stale device can continue from it');
  // повторное открытие результата не меняет счёт
  await tour(7, { act: 'start', players: roster('a'), state: '{}' });
  s = await L(ON, 7, { act: 'status' });
  assert.equal([s.tasks.matches, s.tasks.wins].join(), '4,4', 'reopening a finished attempt does not add progress');
  // забрать рано нельзя
  assert.equal((await L(ON, 7, { act: 'claim' })).ok, false, 'claim before tasks done is refused');
  await play(7, 'b', 1); // +2 матча, +1 победа
  await play(7, 'c', 3); // +4 матча, +3 победы
  s = await L(ON, 7, { act: 'status' });
  assert.equal([s.tasks.matches, s.tasks.wins].join(), '10,5', 'counts capped at the goals');
  // задание итальянцев: 6 мало, 7 — да, повтор состава/дубли — нет
  const itaNames = poolIta.slice(0, 7), rest = XDraft.pool().filter((p) => p.nat !== 'Италия').slice(0, 5).map((p) => p.name);
  assert.equal((await L(ON, 7, { act: 'draft', players: [...itaNames.slice(0, 6), ...rest] })).tasks.italians, 0, '6 Italians not enough');
  assert.equal((await L(ON, 7, { act: 'draft', players: [...itaNames, itaNames[0], ...rest.slice(0, 3)] })).ok, false, 'duplicates rejected');
  assert.equal((await L(ON, 7, { act: 'draft', players: [...itaNames.slice(0, 7), ...rest.slice(0, 4)] })).tasks.italians, 1, '7 Italians in the XI count');
  s = await L(ON, 7, { act: 'status' });
  assert.equal(s.done, true); assert.equal(s.claimed, false);
  // выдача ровно один раз: двойное нажатие, повтор после «обрыва связи»
  const [c1, c2] = await Promise.all([L(ON, 7, { act: 'claim' }), L(ON, 7, { act: 'claim' })]);
  assert.equal([c1, c2].filter((x) => x.granted).length, 1, 'parallel double tap grants once');
  const c3 = await L(ON, 7, { act: 'claim' });
  assert.equal(c3.granted, false); assert.equal(c3.already, true); assert.equal(c3.claimed, true, 'retry after lost answer reports the card as owned');
  assert.equal((await L(ON, 7, { act: 'status' })).claimed, true, 'status lets the client restore the card');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM legend_claims WHERE uid = 7').get().n, 1);
  // другой игрок ничего не получает от чужого прогресса; турниры до старта испытания не считаются
  assert.equal((await L(ON, 8, { act: 'status' })).tasks.matches, 0);
  await play(9, 'z', 4);
  assert.equal((await L({ ...ON, FL_START: String(Date.now() + 60000) }, 9, { act: 'status' })).tasks.matches, 0, 'tours before challenge start are not counted');
  console.log('Forgotten Legends: card, gallery, hero chemistry, server progress and one-time claim checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
