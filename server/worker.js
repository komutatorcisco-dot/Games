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
  await db.batch(ops);
  return { xp };
}

async function top(env, user, scope) {
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
  return { admin: user.id === (await adminId(env)), pass };
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
  const admin = await adminId(env);
  if (admin) {
    const who = user.username ? `@${user.username}` : `id ${user.id}`;
    await tg(env, 'sendMessage', { chat_id: admin, text: `🐞 Ошибка от ${nick} (${who})\n\n${text}\n\n— ${info}` });
  }
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
  return { total, newToday, new7, returnRate: oldEnough ? Math.round((returned / oldEnough) * 100) : 0, reach, dau, wau, games, topXp, reports, platforms };
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
  const game = RELEASES.find((r) => r[0] === wk);
  const text = [
    game ? `🆕 Новая игра недели: «${game[1]}»!` : '⚽ Новая неделя в играх «Стариков Джексонов»!',
    top3.length ? `\n🏆 Лучшие прошлой недели:\n${top3.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${r.nick} — ${r.score} оч.`).join('\n')}` : '',
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
  // Cron-триггер (Settings → Trigger events): «0 8,9 * * 1» — понедельник 8:00 и 9:00 UTC, отправка только в 10:00 по Европе
  async scheduled(event, env, ctx) {
    ctx.waitUntil(weekly(env));
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
  const admin = env.DB ? await adminId(env) : null;
  const who = [m.from && m.from.first_name, m.from && m.from.username ? '@' + m.from.username : '', `id ${m.from ? m.from.id : chat}`].filter(Boolean).join(' · ');
  if (admin) await tg(env, 'sendMessage', { chat_id: admin, text: `Поддержка по оплате\n${who}\n\n${msg.slice(0, 1500)}` });
  return say('Передали администратору. Ответим здесь или в личные сообщения.');
}

// Команды админа в боте: /admin <секрет> — стать админом; /stats — статистика; /broadcast <текст> — написать всем
async function adminCommand(env, m) {
  const db = env.DB, chat = m.chat.id, text = m.text || '';
  if (!db) return;
  await schema(db);
  const say = (t) => tg(env, 'sendMessage', { chat_id: chat, text: t });
  if (text.startsWith('/admin')) {
    if (env.WEBHOOK_SECRET && text.split(/\s+/)[1] === env.WEBHOOK_SECRET && m.chat.type === 'private') {
      await setSetting(db, 'admin', chat);
      await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Играть' }, { command: 'terms', description: 'Условия' }, { command: 'paysupport', description: 'Помощь с оплатой' }] });
      return say('✅ Ты админ. Сюда будут приходить ошибки от игроков.\n/stats — статистика\n/broadcast текст — сообщение всем игрокам\nВ приложении: Профиль → Админка.');
    }
    return say('Неверный код.');
  }
  if (chat !== (await adminId(env))) return say('Команда только для админа.');
  if (text.startsWith('/stats')) return say(statsText(await stats(env)));
  if (text.startsWith('/broadcast')) {
    const msg = text.replace(/^\/broadcast\s*/, '').trim();
    if (!msg) return say('Напиши так: /broadcast текст сообщения');
    const n = await broadcast(env, msg);
    return say(`Отправлено: ${n}`);
  }
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
  if (['/score', '/top', '/hello', '/event', '/report', '/admin/stats'].includes(url.pathname) && request.method === 'POST') {
    if (!env.DB) return json({ ok: false, error: 'no database' }, 500);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
    const user = await verifyInit(body.initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/score') return json({ ok: true, ...(await saveScore(env, user, body)) });
    if (url.pathname === '/hello') return json({ ok: true, ...(await hello(env, user, body)) });
    if (url.pathname === '/event') return json({ ok: true, ...(await events(env, user, body)) });
    if (url.pathname === '/report') return json(await report(env, user, body));
    if (url.pathname === '/admin/stats') {
      if (user.id !== (await adminId(env))) return json({ ok: false, error: 'forbidden' }, 403);
      return json({ ok: true, ...(await stats(env)) });
    }
    const scope = ['week', 'all', 'day', 'friends'].includes(body.scope) ? body.scope : 'week';
    return json({ ok: true, ...(await top(env, user, scope)) });
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
