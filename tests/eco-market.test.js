// Экономика и рынок на сервере (server/worker.js, /eco): кошелёк, паки, быстрая продажа, лоты, ставки, «купить сразу»,
// завершение торгов, налог, возвраты, повторы запросов, гонки, боты и вайп. Реальный SQL сервера на SQLite.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
// как D1: пачка (batch) — одна транзакция, выполняется целиком без перемежения с другими запросами
const prep = (text, args) => {
  let i = 0; const values = [];
  const query = text.replace(/\?(\d+)?/g, (_, n) => { values.push(args[n ? Number(n) - 1 : i++]); return '?'; });
  const stmt = sql.prepare(query);
  return { values, stmt, runSync: () => { const r = stmt.run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } };
};
const db = {
  prepare(text) {
    const mk = (args) => { const p = prep(text, args); return { first: async () => p.stmt.get(...p.values) || null, all: async () => ({ results: p.stmt.all(...p.values) }), run: async () => p.runSync(), runSync: p.runSync }; };
    return { bind: (...a) => mk(a), run: async () => mk([]).run(), first: async () => mk([]).first(), all: async () => mk([]).all(), runSync: () => mk([]).runSync() };
  },
  async batch(items) { sql.exec('BEGIN'); try { const r = items.map((x) => x.runSync()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
};
const ctx = { console, Date, Math, JSON, setTimeout, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch: () => { throw Error('net'); } };
vm.createContext(ctx);
require('node:child_process').execFileSync('node', ['tools/sync-econ.js', '--check'], { stdio: 'inherit' }); // одна настройка экономики у сервера и игры
const src = fs.readFileSync('server/worker.js', 'utf8');
assert.match(src, /^const STAGING = false;$/m, 'в репозитории STAGING = false (рабочий сервер без экономики)');
vm.runInContext(src.replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {').replace(/^export /gm, '')
  + '\nglobalThis.T = { schema, ecoSchema, eco, ECON, Price, mkSettle, mkBots, ecoOn, setSetting };', ctx);
const { T } = ctx;
let opn = 0; const op = () => 'op' + (++opn).toString().padStart(6, '0');
const env = { DB: db, ADMIN_IDS: '1' };
const call = (uid, body) => T.eco(env, { id: uid }, body);
const coins = (uid) => (sql.prepare('SELECT coins FROM eco_wallet WHERE uid = ?').get(uid) || {}).coins;
const cards = (uid, key) => (sql.prepare('SELECT n FROM eco_cards WHERE uid = ? AND key = ?').get(uid, key) || {}).n || 0;
const total = () => sql.prepare('SELECT SUM(coins) AS s FROM eco_wallet').get().s + sql.prepare("SELECT COALESCE(SUM(bid), 0) AS s FROM mk_lots WHERE status = 'open'").get().s;

(async () => {
  assert.equal(T.ecoOn({}, new URL('https://jackson-games.komutatorcisco.workers.dev/eco')), false, 'рабочий сервер: /eco выключен');
  await T.schema(db); await T.ecoSchema(db);
  // каталог: 30 бронзы, 30 серебра, 30 золота 75–90, особая карточка
  const ins = sql.prepare('INSERT INTO eco_cat (key, name, r, rar, pos, club, nat, dr) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 30; i++) { ins.run('B' + i, 'Бронза ' + i, 50 + (i % 14), 'bronze', i % 10 ? 'ЦП' : 'ВРТ', 'Клуб', i % 2 ? 'Франция' : 'Бразилия', 1); ins.run('S' + i, 'Серебро ' + i, 65 + (i % 10), 'silver', i % 10 ? 'ЦЗ' : 'ВРТ', 'Клуб', i % 2 ? 'Франция' : 'Бразилия', 1); ins.run('G' + i, 'Золото ' + i, 75 + (i % 16), 'gold', 'ФРВ', 'Клуб', i % 2 ? 'Франция' : 'Бразилия', 1); }
  ins.run('JG:x', 'Особый', 84, 'jg', 'ФРВ', 'Клуб', 'Сенегал', 0);

  // ---- кошелёк и паки ----
  const st = await call(10, { act: 'state' });
  assert.equal(st.coins, T.ECON.start.coins, 'стартовые монеты');
  assert.equal((await call(10, { act: 'state' })).coins, T.ECON.start.coins, 'стартовые монеты — один раз');
  const basic = T.ECON.packs[0];
  const p1 = await call(10, { act: 'pack', pack: 'basic', op: op() });
  assert.ok(p1.ok && p1.keys.length === basic.n, 'пак за монеты: карточки выбирает сервер');
  assert.equal(coins(10), T.ECON.start.coins - basic.price);
  const dupOp = op(); await call(10, { act: 'pack', pack: 'basic', op: dupOp });
  const again = await call(10, { act: 'pack', pack: 'basic', op: dupOp });
  assert.ok(again.dup && coins(10) === T.ECON.start.coins - 2 * basic.price, 'повтор того же запроса не покупает второй раз');
  const poor = await call(10, { act: 'pack', pack: 'basic', op: op() });
  assert.equal(poor.ok, false, 'не хватает монет — пак не выдаётся'); assert.ok(coins(10) >= 0);

  // ---- быстрая продажа ----
  const k0 = p1.keys[0], had = cards(10, k0), c0 = sql.prepare('SELECT * FROM eco_cat WHERE key = ?').get(k0);
  const before = coins(10), q = await call(10, { act: 'quick', key: k0, op: op() });
  assert.ok(q.ok && coins(10) === before + T.Price.qs(c0) && cards(10, k0) === had - 1, 'быстрая продажа: цена Price.qs, карточка списана');
  if (had === 1) assert.equal((await call(10, { act: 'quick', key: k0, op: op() })).ok, false, 'нельзя продать то, чего нет');

  // ---- цены: рамка, нельзя за бесценок ----
  const g90 = { key: 'G15', r: 90, rar: 'gold', pos: 'ФРВ' }, g75 = { key: 'G0', r: 75, rar: 'gold', pos: 'ФРВ' };
  assert.ok(T.Price.range(g90, 0, 0)[0] > T.Price.range(g75, 0, 0)[0] * 10, '90 OVR дороже 75 OVR по низу рамки');
  for (const c of [g75, g90, { r: 50, rar: 'bronze' }, { r: 70, rar: 'silver' }, { r: 84, rar: 'jg' }]) {
    const [lo] = T.Price.range(c, 0, 0); assert.ok(T.Price.net(lo) > T.Price.qs(c), 'купить по низу рамки и сдать в быструю продажу — всегда в минус');
  }
  assert.ok(T.Price.base({ r: 84, rar: 'jg' }) > T.Price.base({ r: 84, rar: 'gold' }) * 3, 'особая версия дороже обычной');

  // ---- рынок: выставить, ставки, перебить, выкуп ----
  sql.exec("INSERT INTO eco_cards (uid, key, n) VALUES (20, 'G15', 1), (20, 'G0', 2)");
  await call(20, { act: 'state' }); await call(30, { act: 'state' }); await call(40, { act: 'state' });
  sql.exec('UPDATE eco_wallet SET coins = 200000 WHERE uid IN (30, 40)');
  const [lo, hi] = T.Price.range(g90, 0, 0);
  assert.equal((await call(20, { act: 'm_list', key: 'G15', start: 200, bin: 400, dur: 1, op: op() })).ok, false, 'Мбаппе за 200 не выставить');
  assert.equal((await call(20, { act: 'm_list', key: 'G15', start: lo, bin: hi * 2, dur: 1, op: op() })).ok, false, 'выше рамки нельзя');
  const L = await call(20, { act: 'm_list', key: 'G15', start: lo, bin: T.Price.round(lo * 3), dur: 1, op: op() });
  assert.ok(L.ok && cards(20, 'G15') === 0, 'лот создан, карточка ушла из коллекции');
  assert.equal((await call(20, { act: 'm_list', key: 'G15', start: lo, bin: T.Price.round(lo * 3), dur: 1, op: op() })).ok, false, 'одну карточку дважды не продать');
  const lot = L.lot, t0 = total();
  assert.equal((await call(20, { act: 'm_bid', lot, amount: lo, op: op() })).ok, false, 'продавец не ставит на свой лот');
  assert.equal((await call(30, { act: 'm_bid', lot, amount: lo - T.Price.step(lo), op: op() })).ok, false, 'ниже стартовой нельзя');
  assert.ok((await call(30, { act: 'm_bid', lot, amount: lo, op: op() })).ok, 'ставка');
  assert.equal(coins(30), 200000 - lo, 'ставка списана (резерв)');
  assert.equal((await call(40, { act: 'm_bid', lot, amount: lo, op: op() })).ok, false, 'перебить можно только на шаг выше');
  const nb = T.Price.nextBid(lo, lo);
  assert.ok((await call(40, { act: 'm_bid', lot, amount: nb, op: op() })).ok);
  assert.equal(coins(30), 200000, 'перебитому ставка вернулась'); assert.equal(coins(40), 200000 - nb);
  assert.equal(total(), t0, 'монеты не появились и не пропали');
  // гонка: двое жмут «купить сразу» одновременно
  const bin = T.Price.round(lo * 3), s20 = coins(20);
  const [b1, b2] = await Promise.all([call(30, { act: 'm_buy', lot, op: op() }), call(50, { act: 'm_buy', lot, op: op() })]);
  assert.ok(b1.ok !== b2.ok || (!b1.ok && !b2.ok), 'купить сразу может только один');
  assert.ok(b1.ok, 'у второго (50) нет монет — покупает 30');
  assert.equal(cards(30, 'G15'), 1, 'карточка у покупателя');
  assert.equal(coins(20), s20 + Math.floor(bin * 0.95), 'продавцу цена минус 5%');
  assert.equal(coins(40), 200000, 'лидеру аукциона ставка вернулась при выкупе');
  assert.equal((await call(40, { act: 'm_buy', lot, op: op() })).ok, false, 'проданный лот не купить');
  const hist = await call(20, { act: 'history' });
  assert.ok(hist.rows.some((r) => r.kind === 'sell' && /налог/.test(r.ref)), 'в истории продажа с налогом');

  // ---- аукцион до конца и лот без ставок ----
  const [lo2, hi2] = T.Price.range(g75, 0, 0);
  const A = await call(20, { act: 'm_list', key: 'G0', start: lo2, bin: hi2, dur: 1, op: op() });
  const B = await call(20, { act: 'm_list', key: 'G0', start: lo2, bin: hi2, dur: 3, op: op() });
  assert.ok(A.ok && B.ok && cards(20, 'G0') === 0);
  await call(40, { act: 'm_bid', lot: A.lot, amount: lo2, op: op() });
  assert.equal((await call(20, { act: 'm_cancel', lot: A.lot, op: op() })).ok, false, 'со ставками снять нельзя');
  assert.ok((await call(20, { act: 'm_cancel', lot: B.lot, op: op() })).ok, 'без ставок снять можно'); assert.equal(cards(20, 'G0'), 1);
  const s20b = coins(20);
  sql.exec(`UPDATE mk_lots SET ends = 1 WHERE id = ${A.lot}`);
  await T.mkSettle(db);
  assert.equal(cards(40, 'G0'), 1, 'победитель аукциона получил карточку');
  assert.equal(coins(20), s20b + Math.floor(lo2 * 0.95), 'продавцу — ставка минус налог');
  await T.mkSettle(db); assert.equal(cards(40, 'G0'), 1, 'повторное завершение ничего не меняет');
  const C = await call(20, { act: 'm_list', key: 'G0', start: lo2, bin: hi2, dur: 1, op: op() });
  sql.exec(`UPDATE mk_lots SET ends = 1 WHERE id = ${C.lot}`); await T.mkSettle(db);
  assert.equal(cards(20, 'G0'), 1, 'не продано — карточка вернулась');

  // ---- заработок с потолком дня, стартовый пак один раз ----
  const e1 = await call(60, { act: 'earn', src: 'login', n: 900, op: op() }), e2 = await call(60, { act: 'earn', src: 'login', n: 900, op: op() });
  assert.ok(e1.got === 900 && e2.got === T.ECON.earn.cap.login - 900 && e2.capped, 'потолок дня по источнику');
  const sp = await call(60, { act: 'starter', nat: 'Франция', op: op() });
  assert.ok(sp.ok && sp.keys.length >= 15, 'стартовый пак собран сервером');
  const rar = sp.keys.map((k) => sql.prepare('SELECT rar FROM eco_cat WHERE key = ?').get(k).rar);
  assert.equal(rar.filter((r) => r === 'gold').length, 4);
  assert.equal((await call(60, { act: 'starter', nat: 'Франция', op: op() })).ok, false, 'стартовый пак — один раз');
  const sk = sp.keys.find((k) => /^G/.test(k)), skc = sql.prepare('SELECT * FROM eco_cat WHERE key = ?').get(sk), [slo, shi] = T.Price.range(skc, 0, 0);
  assert.equal((await call(60, { act: 'm_list', key: sk, start: slo, bin: shi, dur: 1, op: op() })).ok, false, 'карточку из стартового пака на рынок не выставить');
  const qsk = await call(60, { act: 'quick', key: sk, op: op() }); assert.ok(qsk.ok, 'а быстро продать можно');
  // награды карточками: особая — один раз, золото — не больше 8 в день
  assert.ok((await call(60, { act: 'grant', keys: ['JG:x'], src: 'event', op: op() })).ok);
  assert.equal((await call(60, { act: 'grant', keys: ['JG:x'], src: 'event', op: op() })).ok, false, 'особую карточку не выдать дважды');
  assert.equal((await call(60, { act: 'grant', keys: Array(9).fill('G3'), src: 'event', op: op() })).ok, false, 'больше 8 золотых в день нельзя');
  // обмен (SBC): всё или ничего
  sql.exec("INSERT INTO eco_cards (uid, key, n) VALUES (60, 'S1', 1) ON CONFLICT(uid, key) DO UPDATE SET n = 1");
  const cs = await call(60, { act: 'consume', keys: ['S1', 'S2', 'S2'], op: op() });
  assert.ok(!cs.ok && cards(60, 'S1') === 1, 'не хватает одной карточки — не списано ни одной');

  // ---- боты: выставляют в рамке, бюджет ----
  sql.exec('UPDATE eco_wallet SET coins = 0 WHERE uid = 70');
  const acts = await T.mkBots(db, true);
  const botLots = sql.prepare("SELECT key, r, rar, pos, start, bin FROM mk_lots WHERE bot = 1 AND status = 'open'").all();
  assert.ok(acts > 0 && botLots.length > 0, 'боты выставили карточки');
  for (const x of botLots) { const [l, h] = T.Price.range(x, 0, 0); assert.ok(x.start >= l && x.bin <= h && x.start <= x.bin, 'цены ботов внутри рамки'); }
  assert.ok(sql.prepare("SELECT COUNT(*) AS n FROM eco_led WHERE bot = 1").get().n > 0, 'операции ботов помечены в истории');
  await T.setSetting(db, 'eco:bots', '0'); assert.equal(await T.mkBots(db, true), 0, 'боты выключаются настройкой');

  // ---- вайп: копия и полная очистка ----
  sql.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, nick TEXT)"); sql.exec("INSERT OR IGNORE INTO users (id, nick) VALUES (20, 'Продавец')");
  sql.exec("INSERT INTO saves (id, ts, tro, data) VALUES (20, 1, 500, '{}')"); sql.exec("INSERT INTO ustats (id, trophies) VALUES (20, 500)");
  const W = await call(20, { act: 'wipe' });
  assert.ok(W.ok && W.rows > 0);
  assert.ok((await call(20, { act: 'wipe_check' })).clean, 'после вайпа у игрока ничего не осталось');
  assert.ok(sql.prepare("SELECT COUNT(*) AS n FROM wipe_backup WHERE uid = 20 AND tbl LIKE 'ustats%'").get().n === 1, 'перед удалением — резервная копия');
  assert.equal((await call(20, { act: 'state' })).coins, T.ECON.start.coins, 'после вайпа — как новый игрок');
  await T.setSetting(db, 'admins', '[1]');
  assert.equal((await call(1, { act: 'a_wipe', uid: 30 })).ok, true, 'админ может сбросить игрока');
  assert.equal((await call(2, { act: 'a_wipe', uid: 30 })).ok, false, 'не админ — нельзя');
  console.log('Экономика и рынок: паки, быстрая продажа, рамки цен, ставки, выкуп, гонка, налог, возвраты, аукцион, боты, вайп — ок');
})().catch((e) => { console.error(e); process.exitCode = 1; });
