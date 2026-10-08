// Сервер игр бота @JacksonGamesbot: Cloudflare Worker (бесплатный тариф) + база Cloudflare D1.
//   GET  /invoice?stars=100        — счёт в Telegram Stars для доната;
//   GET  /invoice?item=pass&season=N&initData=… — счёт на премиум-пропуск сезона (покупка записывается в purchases);
//   POST /webhook                  — обновления бота: подтверждение оплаты, /start;
//   POST /score                    — игрок присылает свой опыт и результат «Игрока дня»;
//   POST /top                      — таблица лидеров: неделя, всё время, «Игрок дня» сегодня;
//   POST /hello                    — игрок открыл приложение (для статистики), ответ: админ он или нет;
//   POST /event                    — пачка событий: какую игру открыли, доиграли, сколько длилась;
//   POST /report                   — «Нашёл ошибку»: сообщение уходит админу в бота;
//   POST /admin/stats              — статистика для админа (экран в приложении);
//   scheduled (Cron)               — по понедельникам в 10:00 по Европе бот пишет игрокам про новую игру недели.
// Кто прислал данные, сервер узнаёт по подписи Telegram (initData), подделать чужой результат нельзя.
// Секреты: BOT_TOKEN (токен бота), WEBHOOK_SECRET (любая строка). База: D1, привязка с именем DB.
// Админ: напиши боту «/admin <WEBHOOK_SECRET>» — после этого бот присылает тебе ошибки, команды /stats и /broadcast.

const ALLOWED = [50, 100, 250, 500, 1000];
const PASS_STARS = 100; // цена премиум-пропуска (как в js/rewards.js)
const ORIGIN = 'https://komutatorcisco-dot.github.io';
const CHANNEL = '@oldjacksons'; // канал «Старики Джексоны»: играть могут только подписчики
const TOP = 50;

const tg = (env, method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

// Ответы разрешены сайту игр; ALLOW_ORIGIN — ещё один адрес (например, для проверки на своём компьютере)
function cors(res, request, env) {
  const from = request.headers.get('origin');
  res.headers.set('access-control-allow-origin', from && from === env.ALLOW_ORIGIN ? from : ORIGIN);
  res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.headers.set('access-control-allow-headers', 'content-type');
  res.headers.set('vary', 'origin');
  return res;
}
const json = (data, status = 200) => Response.json(data, { status });

// ---------- время ----------
// «Игрок дня» меняется в полночь по Москве. Рейтинг недели обнуляется в понедельник в 10:00 по центральноевропейскому
// времени (Берлин, Париж, Мадрид; летнее время учитывается).
const msk = (t = Date.now()) => new Date(t + 3 * 3600e3);
const dayKey = (t) => msk(t).toISOString().slice(0, 10);
const WEEK_TZ = 'Europe/Berlin', WEEK_HOUR = 10;
// на сколько часы в Европе впереди UTC в момент t
function tzOffset(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: WEEK_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
// неделя = дата её понедельника; новая неделя начинается в понедельник в 10:00 по Европе
function weekKey(t = Date.now()) {
  const d = new Date(t + tzOffset(t) - WEEK_HOUR * 3600e3), wd = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  return new Date(d.getTime() - wd * 864e5).toISOString().slice(0, 10);
}
// когда закончится текущая неделя (момент в UTC)
function weekEnd(t = Date.now()) {
  const local = Date.parse(weekKey(t)) + 7 * 864e5 + WEEK_HOUR * 3600e3; // понедельник 10:00 по часам Европы
  let end = local - tzOffset(local);
  end = local - tzOffset(end); // поправка, если между ними был переход на летнее/зимнее время
  return end;
}

// ---------- проверка подписи Telegram (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) ----------
const enc = new TextEncoder();
const hmac = async (key, data) => {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
};
export { weekKey, weekEnd };
export async function verifyInit(initData, token, maxAgeSec = 7 * 86400) {
  if (!initData || !token) return null;
  const p = new URLSearchParams(initData), hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', token);
  const sig = [...new Uint8Array(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (sig !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > maxAgeSec) return null;
  try { const u = JSON.parse(p.get('user')); if (u && u.id) u.start_param = p.get('start_param') || ''; return u && u.id ? u : null; } catch (e) { return null; }
}

// ---------- база ----------
let ready = false;
async function schema(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, nick TEXT, emoji TEXT, xp INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, day TEXT, gained INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS weekly (week TEXT NOT NULL, id INTEGER NOT NULL, start INTEGER NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY (week, id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, id INTEGER NOT NULL, tries INTEGER NOT NULL, won INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (day, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS users_xp ON users (xp DESC)'),
    // статистика: кто заходил, по дням; события игр; ошибки; настройки (кто админ, когда была рассылка); кто запускал бота
    db.prepare('CREATE TABLE IF NOT EXISTS seen (id INTEGER PRIMARY KEY, nick TEXT, first INTEGER NOT NULL, last INTEGER NOT NULL, days INTEGER NOT NULL DEFAULT 1, opens INTEGER NOT NULL DEFAULT 1, writable INTEGER NOT NULL DEFAULT 0, platform TEXT, lastday TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY (day, id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS events (day TEXT NOT NULL, id INTEGER NOT NULL, game TEXT NOT NULL, kind TEXT NOT NULL, ms INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS events_day ON events (day, game)'),
    db.prepare('CREATE TABLE IF NOT EXISTS reports (ts INTEGER NOT NULL, id INTEGER NOT NULL, nick TEXT, text TEXT, info TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS bot (chat INTEGER PRIMARY KEY, started INTEGER NOT NULL, blocked INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS names (game TEXT PRIMARY KEY, title TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS weekly_xp ON weekly (week, xp)'),
    // друзья: кто пришёл по чьей ссылке ?startapp=ref_<id> — связь в обе стороны
    // покупки за звёзды: сезонный пропуск
    db.prepare('CREATE TABLE IF NOT EXISTS purchases (id INTEGER NOT NULL, item TEXT NOT NULL, season INTEGER NOT NULL DEFAULT 0, stars INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, PRIMARY KEY (id, item, season))'),
    db.prepare('CREATE TABLE IF NOT EXISTS friends (a INTEGER NOT NULL, b INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (a, b))'),
    // трофеи и победы по играм (для таблиц), кубок драфта недели
    db.prepare('CREATE TABLE IF NOT EXISTS ustats (id INTEGER PRIMARY KEY, trophies INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ustats_tro ON ustats (trophies DESC)'),
    db.prepare('CREATE TABLE IF NOT EXISTS gwins (id INTEGER NOT NULL, game TEXT NOT NULL, wins INTEGER NOT NULL, PRIMARY KEY (id, game))'),
    db.prepare('CREATE INDEX IF NOT EXISTS gwins_game ON gwins (game, wins DESC)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cup (week TEXT NOT NULL, id INTEGER NOT NULL, wins INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (week, id))'),
    // клубы
    db.prepare('CREATE TABLE IF NOT EXISTS clubs (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, emoji TEXT, owner INTEGER NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cmembers (id INTEGER PRIMARY KEY, club INTEGER NOT NULL, joined INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cmembers_club ON cmembers (club)'),
    // напоминания: можно ли писать и когда писали последний раз
    db.prepare('CREATE TABLE IF NOT EXISTS prefs (id INTEGER PRIMARY KEY, remind INTEGER NOT NULL DEFAULT 1, reminded TEXT)'),
    // подбор соперника для онлайн-дуэли
    db.prepare('CREATE TABLE IF NOT EXISTS mm (id INTEGER PRIMARY KEY, code TEXT NOT NULL, nick TEXT, emo TEXT, ts INTEGER NOT NULL, paired INTEGER)'),
    // очередь онлайна по режимам: дуэль, драфт, козыри… (сводим только игроков одного режима)
    // резервная копия сохранения игрока: храним самую «продвинутую» (больше трофеев; при равенстве — новее)
    db.prepare('CREATE TABLE IF NOT EXISTS saves (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, tro INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)'),
    db.prepare("CREATE TABLE IF NOT EXISTS mmg (id INTEGER PRIMARY KEY, game TEXT NOT NULL DEFAULT 'duel', code TEXT NOT NULL, nick TEXT, emo TEXT, ts INTEGER NOT NULL, paired INTEGER)"),
  ]);
  ready = true;
}
const clean = (s, n) => String(s || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);

// Опыт растёт только вверх и не больше PER_DAY за сутки по Москве (защита от правки очков в браузере).
// За одну победу дают 6–25 опыта, так что 2500 в день — это сотня побед.
const FIRST_MAX = 5000, PER_DAY = 2500;

async function saveScore(env, user, body) {
  const db = env.DB, now = Date.now();
  await schema(db);
  const id = user.id;
  const nick = clean(body.nick, 16) || null, emoji = clean(body.emoji, 4) || null; // нет в запросе — оставляем прежние
  const fallback = clean(user.username || user.first_name, 16) || 'Игрок';
  let xp = Math.max(0, Math.floor(Number(body.xp) || 0));
  const today = dayKey(now);
  const old = await db.prepare('SELECT xp, day, gained FROM users WHERE id = ?').bind(id).first();
  let gained = 0;
  if (old) {
    const before = old.day === today ? old.gained : 0;
    xp = Math.max(old.xp, Math.min(xp, old.xp + Math.max(0, PER_DAY - before)));
    gained = before + (xp - old.xp);
  } else xp = Math.min(xp, FIRST_MAX);
  const wk = weekKey(now);
  // неделя: очки считаются от опыта на начало недели (у новичка — с нуля, у давнего игрока его прошлый опыт не в счёт)
  const start = old ? old.xp : (xp <= 300 ? 0 : xp);
  const ops = [
    db.prepare(`INSERT INTO users (id, nick, emoji, xp, updated, day, gained) VALUES (?1, COALESCE(?2, ?8), COALESCE(?3, '⚽'), ?4, ?5, ?6, ?7)
      ON CONFLICT(id) DO UPDATE SET nick = COALESCE(?2, nick), emoji = COALESCE(?3, emoji), xp = ?4, updated = ?5, day = ?6, gained = ?7`).bind(id, nick, emoji, xp, now, today, gained, fallback),
    db.prepare('INSERT INTO weekly (week, id, start, xp) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(week, id) DO UPDATE SET xp = ?4').bind(wk, id, start, xp),
  ];
  const d = body.dly;
  // «Игрок дня»: засчитывается только сегодняшний и только первый присланный результат
  if (d && d.day === dayKey(now)) {
    const tries = Math.max(1, Math.min(12, Math.floor(Number(d.tries) || 12)));
    ops.push(db.prepare('INSERT OR IGNORE INTO daily (day, id, tries, won, ts) VALUES (?, ?, ?, ?, ?)').bind(d.day, id, tries, d.won ? 1 : 0, now));
  }
  // трофеи: только вверх и не больше 3000 за раз (защита от правки в браузере)
  const tro = Math.max(0, Math.floor(Number(body.tro) || 0));
  if (tro) {
    const ot = await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(id).first();
    const t = ot ? Math.max(ot.trophies, Math.min(tro, ot.trophies + 3000)) : Math.min(tro, 5000);
    ops.push(db.prepare('INSERT INTO ustats (id, trophies, updated) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET trophies = ?2, updated = ?3').bind(id, t, now));
  }
  // победы по играм: { 'ng:wordle': 12, … }
  if (body.gw && typeof body.gw === 'object') {
    Object.entries(body.gw).slice(0, 60).forEach(([g, w]) => {
      if (!/^[a-z0-9:-]{2,40}$/.test(g)) return;
      const n = Math.max(0, Math.min(100000, Math.floor(Number(w) || 0))); if (!n) return;
      ops.push(db.prepare('INSERT INTO gwins (id, game, wins) VALUES (?1, ?2, ?3) ON CONFLICT(id, game) DO UPDATE SET wins = MAX(wins, ?3)').bind(id, g, n));
    });
  }
  // кубок драфта недели: сколько турниров выиграл за эту неделю
  if (body.cup && body.cup.week === wk) {
    const n = Math.max(0, Math.min(200, Math.floor(Number(body.cup.wins) || 0)));
    if (n) ops.push(db.prepare('INSERT INTO cup (week, id, wins, ts) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(week, id) DO UPDATE SET wins = MAX(wins, ?3), ts = CASE WHEN ?3 > wins THEN ?4 ELSE ts END').bind(wk, id, n, now));
  }
  await db.batch(ops);
  return { xp };
}

async function top(env, user, scope, game = '') {
  const db = env.DB, now = Date.now(), id = user.id;
  await schema(db);
  let rows, me = null, total = 0;
  if (scope === 'week') {
    const wk = weekKey(now);
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, w.xp - w.start AS score FROM weekly w JOIN users u ON u.id = w.id
      WHERE w.week = ? AND w.xp > w.start ORDER BY score DESC, u.updated ASC LIMIT ${TOP}`).bind(wk).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM weekly WHERE week = ? AND xp > start').bind(wk).first()).n;
    const mine = await db.prepare('SELECT xp - start AS score FROM weekly WHERE week = ? AND id = ?').bind(wk, id).first();
    if (mine && mine.score > 0) {
      const above = (await db.prepare('SELECT COUNT(*) AS n FROM weekly WHERE week = ? AND xp - start > ?').bind(wk, mine.score).first()).n;
      me = { place: above + 1, score: mine.score };
    }
  } else if (scope === 'day') {
    const day = dayKey(now);
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, d.tries AS score FROM daily d JOIN users u ON u.id = d.id
      WHERE d.day = ? AND d.won = 1 ORDER BY d.tries ASC, d.ts ASC LIMIT ${TOP}`).bind(day).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE day = ? AND won = 1').bind(day).first()).n;
    const mine = await db.prepare('SELECT tries, won, ts FROM daily WHERE day = ? AND id = ?').bind(day, id).first();
    if (mine && mine.won) {
      const above = (await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE day = ? AND won = 1 AND (tries < ? OR (tries = ? AND ts < ?))').bind(day, mine.tries, mine.tries, mine.ts).first()).n;
      me = { place: above + 1, score: mine.tries };
    }
  } else if (scope === 'friends') {
    // ты и твои друзья: очки за эту неделю (у кого ещё нет очков — 0)
    const wk = weekKey(now);
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, COALESCE(MAX(w.xp - w.start, 0), 0) AS score FROM users u
      LEFT JOIN weekly w ON w.id = u.id AND w.week = ?1
      WHERE u.id = ?2 OR u.id IN (SELECT b FROM friends WHERE a = ?2) ORDER BY score DESC, u.updated ASC LIMIT ${TOP}`).bind(wk, id).all()).results;
    total = rows.length;
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) me = { place: i + 1, score: rows[i].score };
  } else if (scope === 'tro') {
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, s.trophies AS score FROM ustats s JOIN users u ON u.id = s.id WHERE s.trophies > 0 ORDER BY s.trophies DESC, s.updated ASC LIMIT ${TOP}`).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM ustats WHERE trophies > 0').first()).n;
    const mine = await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(id).first();
    if (mine && mine.trophies > 0) me = { place: (await db.prepare('SELECT COUNT(*) AS n FROM ustats WHERE trophies > ?').bind(mine.trophies).first()).n + 1, score: mine.trophies };
  } else if (scope === 'game') {
    const g = /^[a-z0-9:-]{2,40}$/.test(game) ? game : 'ng:wordle';
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, g.wins AS score FROM gwins g JOIN users u ON u.id = g.id WHERE g.game = ? ORDER BY g.wins DESC LIMIT ${TOP}`).bind(g).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM gwins WHERE game = ?').bind(g).first()).n;
    const mine = await db.prepare('SELECT wins FROM gwins WHERE game = ? AND id = ?').bind(g, id).first();
    if (mine) me = { place: (await db.prepare('SELECT COUNT(*) AS n FROM gwins WHERE game = ? AND wins > ?').bind(g, mine.wins).first()).n + 1, score: mine.wins };
  } else if (scope === 'cup') {
    const wk = weekKey(now);
    rows = (await db.prepare(`SELECT u.id, u.nick, u.emoji, c.wins AS score FROM cup c JOIN users u ON u.id = c.id WHERE c.week = ? ORDER BY c.wins DESC, c.ts ASC LIMIT ${TOP}`).bind(wk).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM cup WHERE week = ?').bind(wk).first()).n;
    const i = rows.findIndex((r) => r.id === id); if (i >= 0) me = { place: i + 1, score: rows[i].score };
  } else if (scope === 'clubs') {
    const ws = weekStartDay(now);
    rows = (await db.prepare(`SELECT c.id, c.name AS nick, c.emoji, COUNT(e.id) AS score FROM clubs c JOIN cmembers m ON m.club = c.id
      LEFT JOIN events e ON e.id = m.id AND e.kind = 'win' AND e.day >= ? GROUP BY c.id ORDER BY score DESC LIMIT ${TOP}`).bind(ws).all()).results;
    total = rows.length;
    const my = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(id).first();
    rows = rows.map((r) => ({ ...r, id: my && r.id === my.club ? id : -1 }));
    const i = rows.findIndex((r) => r.id === id); if (i >= 0) me = { place: i + 1, score: rows[i].score };
  } else {
    rows = (await db.prepare(`SELECT id, nick, emoji, xp AS score FROM users WHERE xp > 0 ORDER BY xp DESC, updated ASC LIMIT ${TOP}`).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE xp > 0').first()).n;
    const mine = await db.prepare('SELECT xp FROM users WHERE id = ?').bind(id).first();
    if (mine && mine.xp > 0) me = { place: (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE xp > ?').bind(mine.xp).first()).n + 1, score: mine.xp };
  }
  return { rows: rows.map((r) => ({ nick: r.nick, emoji: r.emoji, score: r.score, me: r.id === id })), me, total, weekEnd: weekEnd(now) };
}

// ---------- статистика, ошибки, админ ----------
const getSetting = async (db, k) => { const r = await db.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first(); return r ? r.v : null; };
const setSetting = (db, k, v) => db.prepare('INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2').bind(k, String(v)).run();
const adminId = async (env) => Number(await getSetting(env.DB, 'admin')) || 0;
// админов может быть несколько (ведущие канала): список в настройке 'admins', старый одиночный 'admin' тоже считается
async function adminIds(env) {
  let list = []; try { list = JSON.parse((await getSetting(env.DB, 'admins')) || '[]'); } catch (e) { list = []; }
  const one = await adminId(env); if (one) list.push(one);
  return [...new Set(list.map(Number).filter(Boolean))];
}
const isAdminId = async (env, id) => (await adminIds(env)).includes(Number(id));
async function tellAdmins(env, text) { for (const id of await adminIds(env)) await tg(env, 'sendMessage', { chat_id: id, text }); }

async function hello(env, user, body) {
  const db = env.DB, now = Date.now(), today = dayKey(now);
  await schema(db);
  const nick = clean(body.nick, 16) || clean(user.username || user.first_name, 16) || 'Игрок';
  // писать в личку можно, если игрок разрешил это при входе или нажал «Да» на вопросе в приложении
  const writable = user.allows_write_to_pm || body.writeOk === true ? 1 : 0;
  const platform = clean(body.platform, 20);
  await db.batch([
    db.prepare(`INSERT INTO seen (id, nick, first, last, days, opens, writable, platform, lastday) VALUES (?1, ?2, ?3, ?3, 1, 1, ?4, ?5, ?6)
      ON CONFLICT(id) DO UPDATE SET nick = ?2, last = ?3, opens = opens + 1, writable = MAX(writable, ?4), platform = ?5,
      days = days + (CASE WHEN lastday = ?6 THEN 0 ELSE 1 END), lastday = ?6`).bind(user.id, nick, now, writable, platform, today),
    db.prepare('INSERT OR IGNORE INTO visits (day, id) VALUES (?, ?)').bind(today, user.id),
  ]);
  // пришёл по ссылке друга — записываем дружбу в обе стороны
  const ref = /^ref_(\d{3,15})$/.exec(user.start_param || '');
  if (ref && Number(ref[1]) !== user.id) await db.batch([
    db.prepare('INSERT OR IGNORE INTO friends (a, b, ts) VALUES (?, ?, ?)').bind(user.id, Number(ref[1]), now),
    db.prepare('INSERT OR IGNORE INTO friends (a, b, ts) VALUES (?, ?, ?)').bind(Number(ref[1]), user.id, now),
  ]);
  const pass = (await db.prepare("SELECT season FROM purchases WHERE id = ? AND item = 'pass'").bind(user.id).all()).results.map((r) => r.season);
  // покупки в магазине: клиент сам выдаёт те, что ещё не выдал (номер покупки n)
  const shop = (await db.prepare("SELECT item, season AS n FROM purchases WHERE id = ? AND item != 'pass' ORDER BY ts DESC LIMIT 60").bind(user.id).all()).results;
  if (typeof body.remind === 'boolean') await db.prepare('INSERT INTO prefs (id, remind) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET remind = ?2').bind(user.id, body.remind ? 1 : 0).run();
  // приз за кубок драфта прошлой недели
  const prev = weekKey(now - 7 * 864e5), cupWin = Number(await getSetting(db, 'cupwin:' + prev)) === user.id ? prev : null;
  const sv = await db.prepare('SELECT ts, tro FROM saves WHERE id = ?').bind(user.id).first();
  const ut = await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(user.id).first();
  return { admin: await isAdminId(env, user.id), pass, shop, cupWin, save: sv ? { ts: sv.ts, tro: sv.tro } : null, tro: ut ? ut.trophies : 0 };
}

// ---------- резервное сохранение ----------
// Облако Telegram на разных устройствах бывает недоступно или успевает записать только часть,
// поэтому копия лежит ещё и здесь. Хуже по трофеям не перезаписываем — прогресс не откатывается.
async function saveData(env, user, body) {
  const db = env.DB;
  await schema(db);
  const str = typeof body.data === 'string' ? body.data : '';
  if (!str || str.length > 900000) return { ok: false, error: 'size' };
  let d; try { d = JSON.parse(str); } catch (e) { return { ok: false, error: 'bad data' }; }
  const tro = Math.max(0, Math.floor(Number(d && d.rw && d.rw.trophies) || 0)), ts = Math.floor(Number(d && d.ts) || Date.now());
  const old = await db.prepare('SELECT ts, tro FROM saves WHERE id = ?').bind(user.id).first();
  if (old && (tro < old.tro || (tro === old.tro && ts < old.ts))) return { ok: true, kept: true, ts: old.ts, tro: old.tro };
  await db.prepare('INSERT INTO saves (id, ts, tro, data) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET ts = ?2, tro = ?3, data = ?4').bind(user.id, ts, tro, str).run();
  return { ok: true, ts, tro };
}
async function loadData(env, user) {
  await schema(env.DB);
  const r = await env.DB.prepare('SELECT ts, tro, data FROM saves WHERE id = ?').bind(user.id).first();
  return r ? { ok: true, ts: r.ts, tro: r.tro, data: r.data } : { ok: true, data: null };
}

async function events(env, user, body) {
  const db = env.DB, now = Date.now(), today = dayKey(now);
  await schema(db);
  const list = (Array.isArray(body.events) ? body.events : []).slice(0, 40)
    .filter((e) => e && /^[a-z0-9:-]{2,40}$/.test(e.game) && ['open', 'end', 'win'].includes(e.kind));
  if (list.length) await db.batch([
    ...list.map((e) => db.prepare('INSERT INTO events (day, id, game, kind, ms, ts) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(today, user.id, e.game, e.kind, Math.max(0, Math.min(3600e3, Math.floor(Number(e.ms) || 0))), now)),
    // русские названия игр для статистики
    ...list.filter((e) => e.title).map((e) => db.prepare('INSERT INTO names (game, title) VALUES (?1, ?2) ON CONFLICT(game) DO UPDATE SET title = ?2').bind(e.game, clean(e.title, 40))),
  ]);
  return { saved: list.length };
}

async function report(env, user, body) {
  const db = env.DB;
  await schema(db);
  const text = clean(body.text, 1500), info = clean(body.info, 1500), nick = clean(body.nick, 16) || clean(user.username || user.first_name, 16);
  if (!text) return { ok: false };
  await db.prepare('INSERT INTO reports (ts, id, nick, text, info) VALUES (?, ?, ?, ?, ?)').bind(Date.now(), user.id, nick, text, info).run();
  const who = user.username ? `@${user.username}` : `id ${user.id}`;
  await tellAdmins(env, `🐞 Ошибка от ${nick} (${who})\n\n${text}\n\n— ${info}`);
  return { ok: true };
}

// Статистика для админа: игроки, активность по дням, игры за 7 дней, ошибки
async function stats(env) {
  const db = env.DB, now = Date.now();
  await schema(db);
  const days = [...Array(7).keys()].map((i) => dayKey(now - i * 864e5)).reverse();
  const one = async (q, ...a) => (await db.prepare(q).bind(...a).first()) || {};
  const all = async (q, ...a) => (await db.prepare(q).bind(...a).all()).results;
  const total = (await one('SELECT COUNT(*) AS n FROM seen')).n || 0;
  const newToday = (await one('SELECT COUNT(*) AS n FROM seen WHERE first >= ?', Date.parse(days[6]) - 3 * 3600e3)).n || 0;
  const new7 = (await one('SELECT COUNT(*) AS n FROM seen WHERE first >= ?', now - 7 * 864e5)).n || 0;
  const returned = (await one('SELECT COUNT(*) AS n FROM seen WHERE days >= 2')).n || 0;
  const oldEnough = (await one('SELECT COUNT(*) AS n FROM seen WHERE first < ?', now - 864e5)).n || 0;
  const reach = (await recipients(db)).length; // кому бот может написать (без повторов)
  const dauRows = await all(`SELECT day, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY day`, days[0]);
  const dau = days.map((d) => ({ day: d, n: (dauRows.find((r) => r.day === d) || {}).n || 0 }));
  const wau = (await one('SELECT COUNT(DISTINCT id) AS n FROM visits WHERE day >= ?', days[0])).n || 0;
  const games = await all(`SELECT game, (SELECT title FROM names n WHERE n.game = e.game) AS title,
      SUM(kind = 'open') AS opens, SUM(kind = 'end') AS ends, SUM(kind = 'win') AS wins,
      COUNT(DISTINCT id) AS players, CAST(AVG(CASE WHEN kind = 'end' THEN ms END) AS INTEGER) AS avgms
    FROM events e WHERE day >= ? GROUP BY game ORDER BY opens DESC LIMIT 40`, days[0]);
  const topXp = await all('SELECT nick, emoji, xp FROM users ORDER BY xp DESC LIMIT 5');
  const reports = await all('SELECT ts, nick, text, info FROM reports ORDER BY ts DESC LIMIT 15');
  const platforms = await all('SELECT platform, COUNT(*) AS n FROM seen GROUP BY platform ORDER BY n DESC LIMIT 6');
  // расширенное: трофеи, деньги, клубы, онлайн, напоминания, удержание на 7-й день
  const topTro = await all('SELECT u.nick, u.emoji, s.trophies FROM ustats s JOIN users u ON u.id = s.id ORDER BY s.trophies DESC LIMIT 10');
  const troBuckets = await all(`SELECT CASE WHEN trophies < 60 THEN '0–59' WHEN trophies < 230 THEN '60–229' WHEN trophies < 500 THEN '230–499' WHEN trophies < 1000 THEN '500–999' ELSE '1000+' END AS b, COUNT(*) AS n FROM ustats GROUP BY b`);
  const money = await all("SELECT item, COUNT(*) AS n, SUM(stars) AS stars FROM purchases GROUP BY item ORDER BY stars DESC");
  const money7 = (await one('SELECT COUNT(*) AS n, COALESCE(SUM(stars), 0) AS stars FROM purchases WHERE ts >= ?', now - 7 * 864e5));
  const clubs = (await one('SELECT COUNT(*) AS n FROM clubs')).n || 0, inClubs = (await one('SELECT COUNT(*) AS n FROM cmembers')).n || 0;
  const topClubs = await all('SELECT c.name, c.emoji, COUNT(m.id) AS n FROM clubs c JOIN cmembers m ON m.club = c.id GROUP BY c.id ORDER BY n DESC LIMIT 5');
  let online = 0; for (const d of days) online += Number(await getSetting(db, 'mm:' + d)) || 0;
  const reminded = Number(await getSetting(db, 'remind:' + days[6])) || 0;
  const remindOff = (await one('SELECT COUNT(*) AS n FROM prefs WHERE remind = 0')).n || 0;
  const old7 = (await one('SELECT COUNT(*) AS n FROM seen WHERE first < ?', now - 7 * 864e5)).n || 0;
  const back7 = (await one('SELECT COUNT(*) AS n FROM seen WHERE first < ?1 AND last >= first + ?2', now - 7 * 864e5, 7 * 864e5)).n || 0;
  const avgDays = (await one('SELECT ROUND(AVG(days), 1) AS a FROM seen')).a || 0;
  const avgOpens = (await one('SELECT ROUND(AVG(opens), 1) AS a FROM seen')).a || 0;
  const days14 = [...Array(14).keys()].map((i) => dayKey(now - i * 864e5)).reverse();
  const dau14Rows = await all('SELECT day, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY day', days14[0]);
  const dau14 = days14.map((d) => ({ day: d, n: (dau14Rows.find((r) => r.day === d) || {}).n || 0 }));
  return { total, newToday, new7, returnRate: oldEnough ? Math.round((returned / oldEnough) * 100) : 0, reach, dau, wau, games, topXp, reports, platforms,
    topTro, troBuckets, money, money7, clubs, inClubs, topClubs, online, reminded, remindOff, ret7: old7 ? Math.round((back7 / old7) * 100) : 0, avgDays, avgOpens, dau14 };
}

function statsText(st) {
  const sec = (ms) => (ms ? `${Math.round(ms / 1000)} с` : '—');
  return [
    '📊 Статистика игр',
    `Игроков всего: ${st.total} · новых сегодня: ${st.newToday} · за 7 дней: ${st.new7}`,
    `Заходят сегодня: ${st.dau[6].n} · за неделю: ${st.wau}`,
    `Вернулись хотя бы раз: ${st.returnRate}%`,
    `Бот может написать: ${st.reach}`,
    '', 'По дням: ' + st.dau.map((d) => `${d.day.slice(8)}.${d.day.slice(5, 7)} — ${d.n}`).join(', '),
    '', 'Игры за 7 дней (открыли / доиграли / игроков / средняя партия):',
    ...st.games.slice(0, 15).map((g) => `• ${g.title || g.game}: ${g.opens} / ${g.ends} (${g.opens ? Math.round((g.ends / g.opens) * 100) : 0}%) / ${g.players} / ${sec(g.avgms)}`),
    '', `Ошибок прислали: ${st.reports.length ? st.reports.length + ' (последние в приложении, вкладка «Профиль» → «Админка»)' : 'нет'}`,
  ].join('\n');
}

// ---------- рассылка ----------
// Копия расписания из js/release.js: дата понедельника → новая игра недели
const RELEASES = [
  ['2026-10-12', 'Угадай карьеру'], ['2026-10-19', 'Угадай счёт'],
  ['2026-10-26', 'Топ-10'], ['2026-11-02', 'Связи'], ['2026-11-09', 'Кто легендарнее?'], ['2026-11-16', 'Куда перешёл?'],
  ['2026-11-23', 'Машина времени'], ['2026-11-30', 'Тепло-холодно'], ['2026-12-07', 'Кто выше в FC 27?'], ['2026-12-14', 'Состав дня'],
  ['2026-12-21', 'Пас в ворота'], ['2026-12-28', 'Сортировка мячей'], ['2027-01-04', 'Требл дня'], ['2027-01-11', 'Угадай клуб'],
  ['2027-01-18', 'Кто я?'], ['2027-01-25', 'Драфт'], ['2027-02-01', 'Дороже или дешевле'], ['2027-02-08', 'Номер в истории'],
  ['2027-02-15', 'Розыгрыш'], ['2027-02-22', 'Связка'], ['2027-03-01', 'Кто дороже?'], ['2027-03-08', 'Ложная девятка'],
  ['2027-03-15', 'Дартс 170'], ['2027-03-22', 'VS 100'], ['2027-03-29', 'Бинго'], ['2027-04-05', 'Box2Box на время'],
  ['2027-04-12', 'Рейтинг'], ['2027-04-19', '2048: Карьера'], ['2027-04-26', 'Филворд'], ['2027-05-03', 'Найди пару'],
  ['2027-05-10', 'Перекрась поле'], ['2027-05-17', 'Пятнашки'], ['2027-05-24', 'Поп-ит'], ['2027-05-31', 'Повтор гола'],
];

async function recipients(db) {
  const a = (await db.prepare('SELECT chat AS id FROM bot WHERE blocked = 0').all()).results.map((r) => r.id);
  const b = (await db.prepare('SELECT id FROM seen WHERE writable = 1').all()).results.map((r) => r.id);
  return [...new Set([...a, ...b])];
}
// разослать всем, кто разрешил боту писать; кто заблокировал бота — помечаем
async function broadcast(env, text, button = 'Играть') {
  const db = env.DB;
  await schema(db);
  let sent = 0;
  for (const id of await recipients(db)) {
    const r = await tg(env, 'sendMessage', { chat_id: id, text, reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: `${ORIGIN}/Games/` } }]] } }).catch(() => null);
    if (r && r.ok) sent++;
    else if (r && r.error_code === 403) await db.batch([
      db.prepare('INSERT INTO bot (chat, started, blocked) VALUES (?1, ?2, 1) ON CONFLICT(chat) DO UPDATE SET blocked = 1').bind(id, Date.now()),
      db.prepare('UPDATE seen SET writable = 0 WHERE id = ?').bind(id),
    ]);
    await new Promise((ok) => setTimeout(ok, 40)); // не больше ~25 сообщений в секунду
  }
  return sent;
}

// Понедельник, 10:00 по Европе: новая игра недели + тройка лидеров прошлой недели
async function weekly(env) {
  const db = env.DB, now = Date.now(), wk = weekKey(now);
  await schema(db);
  const local = new Date(now + tzOffset(now));
  if (local.getUTCDay() !== 1 || local.getUTCHours() !== WEEK_HOUR) return 'не время';
  if ((await getSetting(db, 'weekly')) === wk) return 'уже отправлено';
  await setSetting(db, 'weekly', wk);
  const prev = weekKey(now - 7 * 864e5);
  const top3 = (await db.prepare(`SELECT u.nick, w.xp - w.start AS score FROM weekly w JOIN users u ON u.id = w.id WHERE w.week = ? AND w.xp > w.start ORDER BY score DESC LIMIT 3`).bind(prev).all()).results;
  // кубок драфта недели: победитель получает приз при следующем входе
  const cup = await db.prepare('SELECT c.id, u.nick, c.wins FROM cup c JOIN users u ON u.id = c.id WHERE c.week = ? ORDER BY c.wins DESC, c.ts ASC LIMIT 1').bind(prev).first();
  if (cup) await setSetting(db, 'cupwin:' + prev, cup.id);
  const text = [
    '⚽ Новая неделя в играх «Стариков Джексонов»! Новые игры открываются на дороге трофеев — каждые 200 🏆',
    top3.length ? `\n🏆 Лучшие прошлой недели:\n${top3.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.nick} — ${r.score} оч.`).join('\n')}` : '',
    cup ? `\n🏆 Кубок драфта недели: ${cup.nick} (${cup.wins} ${cup.wins === 1 ? 'турнир' : 'турниров'}) — забирает легендарный пак!` : '',
    '\nРейтинг недели обнулился — самое время забрать первое место ⚽',
  ].filter(Boolean).join('\n');
  return `отправлено: ${await broadcast(env, text)}`;
}

// Лица игроков FC 27/26: CDN sofifa отдаёт картинки только с Referer sofifa.com, браузер так не умеет.
// Воркер забирает лицо сам и кладёт в кэш Cloudflare на 30 дней. /face/239085?s=240 (размеры 120 и 240).
async function face(request, ctx) {
  const u = new URL(request.url), m = u.pathname.match(/^\/face\/(\d{1,7})$/);
  if (!m) return new Response('bad id', { status: 400 });
  const size = u.searchParams.get('s') === '240' ? 240 : 120;
  const cache = caches.default, key = new Request(`https://faces.local/${m[1]}_${size}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const n = +m[1], path = `${String(Math.floor(n / 1000)).padStart(3, '0')}/${String(n % 1000).padStart(3, '0')}`;
  const headers = { Referer: 'https://sofifa.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', Accept: 'image/webp,image/png,image/*' };
  // сначала свежая версия, потом прошлогодняя; маленький размер есть у всех
  const tries = [`27_${size}`, `26_${size}`, '27_120', '26_120'];
  for (const v of [...new Set(tries)]) {
    for (let a = 0; a < 2; a++) {
      try {
        const r = await fetch(`https://cdn.sofifa.net/players/${path}/${v}.png`, { headers, cf: { cacheTtl: 2592000, cacheEverything: true } });
        if (r.ok) {
          const out = new Response(r.body, { headers: { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=2592000', 'Access-Control-Allow-Origin': '*' } });
          ctx.waitUntil(cache.put(key, out.clone()));
          return out;
        }
        if (r.status === 404 && a === 0) await new Promise((ok) => setTimeout(ok, 200));
        else break;
      } catch (e) { /* пробуем дальше */ }
    }
  }
  return new Response('not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith('/face/')) return face(request, ctx);
    const res = await route(request, env);
    return cors(new Response(res.body, res), request, env);
  },
  // Cron-триггер раз в час («0 * * * *», ставит .github/workflows/worker.yml): рассылка по понедельникам в 10:00 по Европе,
  // напоминания — в 18:00 по Москве. Каждая функция сама проверяет время и не шлёт дважды.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(weekly(env).then(() => reminders(env)));
  },
};
export { weekly, stats };

// Условия и поддержка по оплатам: Telegram требует их у ботов, которые продают цифровые товары за звёзды
const TERMS = [
  'Условия «Джексоны» (мини-игры канала «Старики Джексоны»)',
  '',
  '1. Игры бесплатные. За звёзды Telegram можно купить премиум-пропуск сезона и поддержать канал донатом. Это цифровые товары внутри игры, они не обмениваются на деньги.',
  '2. Премиум-пропуск действует до конца текущего сезона (28 дней) и открывает дополнительные награды. После покупки он появляется сразу.',
  '3. Возврат звёзд возможен, если покупка не пришла или списалась дважды. Напиши /paysupport и опиши проблему.',
  '4. Мы храним ник, прогресс в играх и Telegram ID для таблицы лидеров. Данные никому не передаём, удалить их можно по запросу через /paysupport.',
  '5. Игры могут меняться: баланс, награды и состав игр обновляются.',
].join('\n');
async function infoCommand(env, m) {
  const chat = m.chat.id, text = m.text || '';
  const say = (t) => tg(env, 'sendMessage', { chat_id: chat, text: t });
  if (/^\/terms\b/.test(text)) return say(TERMS);
  const msg = text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
  if (!msg) return say('Проблема с оплатой или покупкой? Напиши одним сообщением: /paysupport и что случилось. Например: /paysupport купил пропуск, а он не открылся.');
  const who = [m.from && m.from.first_name, m.from && m.from.username ? '@' + m.from.username : '', `id ${m.from ? m.from.id : chat}`].filter(Boolean).join(' · ');
  if (env.DB) await tellAdmins(env, `Поддержка по оплате\n${who}\n\n${msg.slice(0, 1500)}`);
  return say('Передали администратору. Ответим здесь или в личные сообщения.');
}

// Команды админа в боте: /admin <секрет> — стать админом; /stats — статистика; /broadcast <текст> — написать всем
async function adminCommand(env, m) {
  const db = env.DB, chat = m.chat.id, text = m.text || '';
  if (!db) return;
  await schema(db);
  const say = (t) => tg(env, 'sendMessage', { chat_id: chat, text: t });
  if (text.startsWith('/admin')) {
    const code = (text.split(/\s+/)[1] || '').replace(/[<>«»"']/g, '');
    // войти админом: отдельный код ADMIN_CODE (переменная воркера) или, как раньше, WEBHOOK_SECRET
    const okCode = code && ((env.ADMIN_CODE && code === String(env.ADMIN_CODE).trim()) || (env.WEBHOOK_SECRET && code === env.WEBHOOK_SECRET));
    if (okCode && m.chat.type === 'private') {
      const list = await adminIds(env); if (!list.includes(chat)) list.push(chat);
      await setSetting(db, 'admins', JSON.stringify(list));
      await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Играть' }, { command: 'terms', description: 'Условия' }, { command: 'paysupport', description: 'Помощь с оплатой' }] });
      return say('✅ Ты админ. Сюда будут приходить ошибки от игроков.\n/stats — статистика\n/broadcast текст — сообщение всем игрокам\nВ приложении: Профиль → Админка.');
    }
    return say('Неверный код.');
  }
  if (!(await isAdminId(env, chat))) return say('Команда только для админа.');
  if (text.startsWith('/stats')) return say(statsText(await stats(env)));
  if (text.startsWith('/broadcast')) {
    const msg = text.replace(/^\/broadcast\s*/, '').trim();
    if (!msg) return say('Напиши так: /broadcast текст сообщения');
    const n = await broadcast(env, msg);
    return say(`Отправлено: ${n}`);
  }
}

// ---------- клубы: игроки объединяются, общая цель недели — победы всех участников ----------
const weekStartDay = (t) => weekKey(t); // понедельник недели (события хранятся по дням)
const CLUB_MAX = 30;
const clubGoal = (n) => Math.max(40, n * 25); // побед за неделю на весь клуб
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function clubInfo(db, uid) {
  const m = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first();
  if (!m) return { club: null };
  const c = await db.prepare('SELECT id, code, name, emoji, owner FROM clubs WHERE id = ?').bind(m.club).first();
  if (!c) { await db.prepare('DELETE FROM cmembers WHERE id = ?').bind(uid).run(); return { club: null }; }
  const ws = weekStartDay(Date.now());
  const members = (await db.prepare(`SELECT m.id, u.nick, u.emoji, COALESCE(s.trophies, 0) AS trophies,
      (SELECT COUNT(*) FROM events e WHERE e.id = m.id AND e.kind = 'win' AND e.day >= ?2) AS wins
    FROM cmembers m LEFT JOIN users u ON u.id = m.id LEFT JOIN ustats s ON s.id = m.id WHERE m.club = ?1 ORDER BY wins DESC, trophies DESC`).bind(c.id, ws).all()).results;
  const wins = members.reduce((a, x) => a + x.wins, 0);
  return { club: { code: c.code, name: c.name, emoji: c.emoji || '⚽', owner: c.owner === uid, week: weekKey(Date.now()), wins, goal: clubGoal(members.length), max: CLUB_MAX,
    members: members.map((x) => ({ nick: x.nick || 'Игрок', emoji: x.emoji || '⚽', trophies: x.trophies, wins: x.wins, me: x.id === uid })) } };
}
async function club(env, user, body) {
  const db = env.DB, uid = user.id, now = Date.now();
  await schema(db);
  const leave = async () => {
    const m = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first(); if (!m) return;
    await db.prepare('DELETE FROM cmembers WHERE id = ?').bind(uid).run();
    const left = await db.prepare('SELECT id FROM cmembers WHERE club = ? ORDER BY joined LIMIT 1').bind(m.club).first();
    if (!left) await db.prepare('DELETE FROM clubs WHERE id = ?').bind(m.club).run();
    else await db.prepare('UPDATE clubs SET owner = ?1 WHERE id = ?2 AND owner = ?3').bind(left.id, m.club, uid).run();
  };
  if (body.act === 'create') {
    const name = clean(body.name, 20); if (name.length < 2) return { ok: false, error: 'Название — от 2 букв' };
    await leave();
    let code = '';
    for (let k = 0; k < 6; k++) { code = Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join(''); if (!(await db.prepare('SELECT 1 FROM clubs WHERE code = ?').bind(code).first())) break; }
    const r = await db.prepare('INSERT INTO clubs (code, name, emoji, owner, created) VALUES (?, ?, ?, ?, ?)').bind(code, name, clean(body.emoji, 4) || '⚽', uid, now).run();
    await db.prepare('INSERT INTO cmembers (id, club, joined) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET club = ?2, joined = ?3').bind(uid, r.meta.last_row_id, now).run();
  } else if (body.act === 'join') {
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const c = await db.prepare('SELECT id FROM clubs WHERE code = ?').bind(code).first();
    if (!c) return { ok: false, error: 'Клуб с таким кодом не найден' };
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM cmembers WHERE club = ?').bind(c.id).first()).n;
    const mine = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first();
    if (!(mine && mine.club === c.id)) {
      if (n >= CLUB_MAX) return { ok: false, error: `В клубе уже ${CLUB_MAX} игроков` };
      await leave();
      await db.prepare('INSERT INTO cmembers (id, club, joined) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET club = ?2, joined = ?3').bind(uid, c.id, now).run();
    }
  } else if (body.act === 'leave') await leave();
  return { ok: true, ...(await clubInfo(db, uid)) };
}

// ---------- онлайн: подбор случайного соперника для дуэли ----------
// Первый ждёт (держит комнату PeerJS со своим кодом), второй получает его код и подключается сам.
async function matchmake(env, user, body) {
  const db = env.DB, uid = user.id, now = Date.now();
  await schema(db);
  const game = ['duel', 'xdraft', 'trumps'].includes(body.game) ? body.game : 'duel';
  await db.prepare('DELETE FROM mmg WHERE ts < ?').bind(now - 30000).run();
  if (body.act === 'cancel') { await db.prepare('DELETE FROM mmg WHERE id = ?').bind(uid).run(); return { ok: true }; }
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (code.length !== 5) return { ok: false, error: 'bad code' };
  // меня уже нашли — второй игрок подключается по моему коду, просто ждём
  const me = await db.prepare('SELECT paired FROM mmg WHERE id = ?').bind(uid).first();
  if (me && me.paired) return { ok: true, role: 'host', paired: true };
  // кто-то ещё ждёт в этом режиме: подключаемся к тому, кто ждёт дольше
  const other = await db.prepare('SELECT id, code, nick, emo FROM mmg WHERE id != ? AND game = ? AND paired IS NULL ORDER BY ts ASC LIMIT 1').bind(uid, game).first();
  if (other) {
    await db.batch([db.prepare('UPDATE mmg SET paired = ? WHERE id = ?').bind(uid, other.id), db.prepare('DELETE FROM mmg WHERE id = ?').bind(uid)]);
    await setSetting(db, 'mm:' + dayKey(now), Number((await getSetting(db, 'mm:' + dayKey(now))) || 0) + 1);
    return { ok: true, role: 'join', code: other.code, nick: other.nick, emo: other.emo };
  }
  await db.prepare('INSERT INTO mmg (id, game, code, nick, emo, ts, paired) VALUES (?1, ?6, ?2, ?3, ?4, ?5, NULL) ON CONFLICT(id) DO UPDATE SET game = ?6, code = ?2, nick = ?3, emo = ?4, ts = ?5, paired = NULL')
    .bind(uid, code, clean(body.nick, 16), clean(body.emo, 4), now, game).run();
  const waiting = (await db.prepare('SELECT COUNT(*) AS n FROM mmg WHERE game = ? AND paired IS NULL').bind(game).first()).n;
  return { ok: true, role: 'host', paired: false, waiting };
}

// ---------- магазин за звёзды ----------
// Цены и что выдаётся — одинаковые здесь и в js/shopstars.js
const SHOP = {
  legend: { stars: 39, title: 'Легендарный пак', desc: 'Пак с гарантированной легендарной редкостью' },
  epic3: { stars: 49, title: '3 эпических пака', desc: 'Три пака эпической редкости' },
  coins: { stars: 49, title: '2000 монет', desc: 'Монеты на счёт сразу' },
  jack: { stars: 99, title: 'Пак «ДЖЕКСОН!!»', desc: 'Самый редкий пак игры' },
  'skin:brawl': { stars: 29, title: 'Скин «Сочный»', desc: 'Оформление навсегда' },
  'skin:ut': { stars: 29, title: 'Скин «Ultimate»', desc: 'Оформление навсегда' },
  'skin:fcm': { stars: 29, title: 'Скин «FC Mobile»', desc: 'Оформление навсегда' },
  'skin:ef': { stars: 29, title: 'Скин «eFootball»', desc: 'Оформление навсегда' },
  'skin:kit': { stars: 29, title: 'Скин «Футболка»', desc: 'Оформление навсегда' },
  'skin:cyber': { stars: 29, title: 'Скин «Киберспорт»', desc: 'Оформление навсегда' },
};

// ---------- напоминания от бота ----------
// Раз в день в 18:00 по Москве — тем, кто разрешил писать, заходил за последние 2 недели, но сегодня ещё не открывал игры.
const UNLOCK_AT = [[40, 'Тики-така'], [60, 'Пропуск и задания'], [80, 'Паки и Галерея'], [120, 'Козыри'], [170, 'Угадай игрока и Дуэль'], [230, 'Драфт'], [300, 'ИПК'],
  ...['Угадай карьеру', 'Угадай счёт', 'Топ-10', 'Связи', 'Кто легендарнее?', 'Куда перешёл?', 'Машина времени', 'Тепло-холодно', 'Кто выше в FC 27?', 'Состав дня', 'Пас в ворота', 'Сортировка мячей', 'Требл дня', 'Угадай клуб', 'Кто я?', 'Дороже или дешевле', 'Номер в истории', 'Розыгрыш', 'Связка', 'Кто дороже?', 'Ложная девятка', 'Дартс 170', 'VS 100', 'Бинго', 'Box2Box на время', 'Рейтинг', '2048: Карьера', 'Филворд', 'Найди пару', 'Перекрась поле', 'Пятнашки', 'Поп-ит', 'Повтор гола']
    .map((t, i) => [500 + i * 200, t])]; // копия js/release.js
async function reminders(env) {
  const db = env.DB, now = Date.now(), today = dayKey(now), h = msk(now).getUTCHours(), wd = msk(now).getUTCDay();
  await schema(db);
  if (h !== 18) return 'не время';
  if ((await getSetting(db, 'remind')) === today) return 'уже';
  await setSetting(db, 'remind', today);
  const list = (await db.prepare(`SELECT s.id, COALESCE(t.trophies, 0) AS tro FROM seen s LEFT JOIN prefs p ON p.id = s.id LEFT JOIN ustats t ON t.id = s.id
    WHERE s.writable = 1 AND s.last > ?1 AND s.lastday != ?2 AND COALESCE(p.remind, 1) = 1 AND COALESCE(p.reminded, '') != ?2 LIMIT 3000`).bind(now - 14 * 864e5, today).all()).results;
  let sent = 0;
  for (const r of list) {
    const next = UNLOCK_AT.find(([t]) => t > r.tro);
    const lines = ['🎁 Пак дня уже ждёт тебя — заходи забрать!'];
    if (next && next[0] - r.tro <= 40) lines.push(`🔓 До новой игры «${next[1]}» осталось всего ${next[0] - r.tro} 🏆`);
    if (wd === 0) lines.push('⏳ Задания недели закончатся завтра утром — успей забрать очки пропуска');
    if (wd === 6 || wd === 0) lines.push('🔥 Выходные: за победы ×2 трофея');
    const res = await tg(env, 'sendMessage', { chat_id: r.id, text: lines.join('\n'), reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: `${ORIGIN}/Games/` } }]] } }).catch(() => null);
    if (res && res.ok) { sent++; await db.prepare('INSERT INTO prefs (id, remind, reminded) VALUES (?1, 1, ?2) ON CONFLICT(id) DO UPDATE SET reminded = ?2').bind(r.id, today).run(); }
    else if (res && res.error_code === 403) await db.prepare('UPDATE seen SET writable = 0 WHERE id = ?').bind(r.id).run();
    await new Promise((ok) => setTimeout(ok, 40));
  }
  await setSetting(db, 'remind:' + today, sent);
  return `напоминаний: ${sent}`;
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  // ---------- подписка на канал: играть можно только подписчикам ----------
  // Боту нужны права администратора в канале, иначе Telegram не отвечает на getChatMember.
  if (url.pathname === '/member' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
    const user = await verifyInit(body.initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    const r = await tg(env, 'getChatMember', { chat_id: CHANNEL, user_id: user.id });
    if (!r || !r.ok) return json({ ok: false, error: (r && r.description) || 'telegram' });
    const st = r.result.status;
    return json({ ok: true, member: ['creator', 'administrator', 'member'].includes(st) || (st === 'restricted' && r.result.is_member) });
  }

  // ---------- рейтинг ----------
  if (['/score', '/top', '/hello', '/event', '/report', '/admin/stats', '/club', '/mm', '/save', '/load'].includes(url.pathname) && request.method === 'POST') {
    if (!env.DB) return json({ ok: false, error: 'no database' }, 500);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
    const user = await verifyInit(body.initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/score') return json({ ok: true, ...(await saveScore(env, user, body)) });
    if (url.pathname === '/hello') return json({ ok: true, ...(await hello(env, user, body)) });
    if (url.pathname === '/event') return json({ ok: true, ...(await events(env, user, body)) });
    if (url.pathname === '/report') return json(await report(env, user, body));
    if (url.pathname === '/club') return json(await club(env, user, body));
    if (url.pathname === '/mm') return json(await matchmake(env, user, body));
    if (url.pathname === '/save') return json(await saveData(env, user, body));
    if (url.pathname === '/load') return json(await loadData(env, user));
    if (url.pathname === '/admin/stats') {
      if (!(await isAdminId(env, user.id))) return json({ ok: false, error: 'forbidden' }, 403);
      return json({ ok: true, ...(await stats(env)) });
    }
    const scope = ['week', 'all', 'day', 'friends', 'tro', 'game', 'cup', 'clubs'].includes(body.scope) ? body.scope : 'week';
    return json({ ok: true, ...(await top(env, user, scope, String(body.game || ''))) });
  }

  // ---------- донат ----------
  if (url.pathname === '/invoice' && url.searchParams.get('item') === 'pass') {
    // премиум-пропуск сезона: кто покупает, узнаём по подписи Telegram
    const user = await verifyInit(url.searchParams.get('initData'), env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    const season = Math.max(1, Math.min(999, Number(url.searchParams.get('season')) || 1));
    const r = await tg(env, 'createInvoiceLink', {
      title: `Премиум-пропуск · сезон ${season}`,
      description: 'Вторая линия наград в пропуске: паки высокой редкости, жизни и монеты. Действует до конца сезона.',
      payload: JSON.stringify({ item: 'pass', season, uid: user.id }),
      currency: 'XTR', prices: [{ label: 'Премиум-пропуск', amount: PASS_STARS }],
    });
    return json(r.ok ? { ok: true, link: r.result } : { ok: false, error: r.description });
  }
  if (url.pathname === '/invoice' && SHOP[url.searchParams.get('item')]) {
    const user = await verifyInit(url.searchParams.get('initData'), env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    const item = url.searchParams.get('item'), it = SHOP[item], n = Date.now() % 1e9; // n — номер покупки, чтобы одну и ту же вещь можно было купить снова
    const r = await tg(env, 'createInvoiceLink', {
      title: it.title, description: it.desc, payload: JSON.stringify({ item, n, uid: user.id }),
      currency: 'XTR', prices: [{ label: it.title, amount: it.stars }],
    });
    return json(r.ok ? { ok: true, link: r.result, n } : { ok: false, error: r.description });
  }
  if (url.pathname === '/invoice') {
    const stars = Number(url.searchParams.get('stars'));
    if (!ALLOWED.includes(stars)) return json({ ok: false, error: 'bad amount' }, 400);
    const nick = (url.searchParams.get('nick') || '').slice(0, 32);
    const r = await tg(env, 'createInvoiceLink', {
      title: 'Поддержка «Старики Джексоны»',
      description: `Спасибо за поддержку игр канала!${nick ? ' От: ' + nick : ''}`,
      payload: JSON.stringify({ stars, nick, t: Date.now() }),
      currency: 'XTR', // Telegram Stars: provider_token не нужен
      prices: [{ label: `${stars} ⭐`, amount: stars }],
    });
    return json(r.ok ? { ok: true, link: r.result } : { ok: false, error: r.description });
  }

  // ---------- бот ----------
  if (url.pathname === '/webhook' && request.method === 'POST') {
    // защита: Telegram присылает секрет, заданный в setWebhook
    if (env.WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    const u = await request.json();
    if (u.pre_checkout_query) {
      await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
    } else if (u.message && u.message.successful_payment) {
      const p = u.message.successful_payment;
      let pl = {}; try { pl = JSON.parse(p.invoice_payload || '{}'); } catch (e) { /* старый формат */ }
      if (pl.item === 'pass' && env.DB) {
        await schema(env.DB);
        await env.DB.prepare('INSERT OR IGNORE INTO purchases (id, item, season, stars, ts) VALUES (?, ?, ?, ?, ?)').bind(u.message.from.id, 'pass', Number(pl.season) || 0, p.total_amount, Date.now()).run();
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Премиум-пропуск сезона ${pl.season} открыт ⭐ Забирай награды во вкладке «Награды»!` });
      } else if (SHOP[pl.item] && env.DB) {
        await schema(env.DB);
        await env.DB.prepare('INSERT OR IGNORE INTO purchases (id, item, season, stars, ts) VALUES (?, ?, ?, ?, ?)').bind(u.message.from.id, pl.item, Number(pl.n) || 0, p.total_amount, Date.now()).run();
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Покупка «${SHOP[pl.item].title}» прошла ⭐ Открой игру — награда уже ждёт!` });
      } else {
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Спасибо за ${p.total_amount} ⭐! Это очень помогает каналу 🙌` });
      }
    } else if (u.message && /^\/(terms|paysupport|support)\b/.test(u.message.text || '')) {
      await infoCommand(env, u.message);
    } else if (u.message && /^\/(admin|stats|broadcast)\b/.test(u.message.text || '')) {
      await adminCommand(env, u.message);
    } else if (u.message && /^\/start\b/.test(u.message.text || '')) {
      if (env.DB) { await schema(env.DB); await env.DB.prepare('INSERT INTO bot (chat, started, blocked) VALUES (?1, ?2, 0) ON CONFLICT(chat) DO UPDATE SET blocked = 0').bind(u.message.chat.id, Date.now()).run(); }
      await tg(env, 'sendMessage', {
        chat_id: u.message.chat.id, text: 'Футбольные мини-игры канала «Старики Джексоны» ⚽',
        reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: `${ORIGIN}/Games/` } }]] },
      });
    }
    return new Response('ok');
  }
  return new Response('Jackson games worker', { status: 200 });
}
