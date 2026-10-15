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

// Social preferences. The public showcase never trusts the showcase request itself: cards are checked
// against the server-stored save (and server grant records for special cards) whenever either changes.
const socialReady = new WeakMap();
async function socialSchema(db) {
  if (!socialReady.has(db)) socialReady.set(db, db.prepare(`CREATE TABLE IF NOT EXISTS social_profiles (
    uid INTEGER PRIMARY KEY, handle TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL DEFAULT '{"favorites":{},"showcase":[null,null,null],"public":false}')`).run()
    .then(() => db.prepare('CREATE INDEX IF NOT EXISTS daily_won_id ON daily (id) WHERE won = 1').run())
    // витрина, которую видят другие: только карточки, найденные сервером в сохранении игрока
    .then(() => db.prepare('CREATE TABLE IF NOT EXISTS social_shown (uid INTEGER PRIMARY KEY, keys TEXT NOT NULL, ts INTEGER NOT NULL)').run())
    .catch(e => { socialReady.delete(db); throw e; }));
  return socialReady.get(db);
}
const socialOn = env => env.SOCIAL_ENABLED !== '0';
const socialHandleCache = new WeakMap();
const socialKey = k => typeof k === 'string' && k.length > 0 && k.length <= 120 && !['__proto__', 'constructor', 'prototype'].includes(k) && !/[\x00-\x1f]/.test(k);
function socialEdit(data, op) {
  const d = JSON.parse(JSON.stringify(data));
  if (!op || typeof op !== 'object') throw Error('bad operation');
  if (op.type === 'favorite' && socialKey(op.key) && typeof op.value === 'boolean') {
    if (op.value) d.favorites[op.key] = true; else delete d.favorites[op.key];
    if (Object.keys(d.favorites).length > 5000) throw Error('too many favorites');
  } else if (op.type === 'showcase' && Array.isArray(op.keys) && op.keys.length === 3 && op.keys.every(k => k === null || socialKey(k)) && new Set(op.keys.filter(Boolean)).size === op.keys.filter(Boolean).length) {
    // Private preferences only, NOT proof that these cards are owned.
    d.showcase = op.keys.slice();
  } else if (op.type === 'privacy' && typeof op.value === 'boolean') d.public = op.value;
  else throw Error('bad operation');
  return d;
}
// Свободные копии в сохранении на сервере: own − used (как Cards.spare на клиенте).
function saveSpare(save, key) {
  const c = save && save.cards;
  if (!c || typeof c.own !== 'object' || !c.own || !Object.prototype.hasOwnProperty.call(c.own, key)) return 0;
  const used = c.used && typeof c.used === 'object' && Object.prototype.hasOwnProperty.call(c.used, key) ? Number(c.used[key]) || 0 : 0;
  return Math.max(0, Math.floor(Number(c.own[key]) || 0) - Math.floor(used));
}
// Особые карточки выдаёт только сервер — без его записи о выдаче карточку не показываем, что бы ни было в сохранении.
const SERVER_GRANTED = /^FL:/;
async function verifyShowcase(db, uid, showcase, save) {
  const keys = [0, 1, 2].map((i) => { const k = Array.isArray(showcase) ? showcase[i] : null; return socialKey(k) && saveSpare(save, k) >= 1 ? k : null; });
  for (let i = 0; i < 3; i++) {
    if (!keys[i] || !SERVER_GRANTED.test(keys[i])) continue;
    const g = await db.prepare('SELECT 1 AS ok FROM legend_claims WHERE uid = ? AND card = ?').bind(uid, keys[i]).first();
    if (!g) keys[i] = null;
  }
  const json = JSON.stringify(keys);
  // пишем только если витрина изменилась
  await db.prepare('INSERT INTO social_shown (uid, keys, ts) VALUES (?1, ?2, ?3) ON CONFLICT(uid) DO UPDATE SET keys = ?2, ts = ?3 WHERE keys != ?2').bind(uid, json, Date.now()).run();
  return keys;
}
async function shownFor(db, uid) {
  const r = await db.prepare('SELECT keys FROM social_shown WHERE uid = ?').bind(uid).first();
  try { const k = r ? JSON.parse(r.keys) : null; return Array.isArray(k) ? k.slice(0, 3) : [null, null, null]; } catch (e) { return [null, null, null]; }
}
// новое сохранение: если у игрока есть витрина — перепроверяем её (сданная в ИПК карточка исчезает)
async function reverifyOnSave(env, uid, save) {
  if (!socialOn(env)) return;
  try {
    await socialSchema(env.DB);
    const p = await env.DB.prepare('SELECT data FROM social_profiles WHERE uid = ?').bind(uid).first();
    if (!p) return;
    const sc = JSON.parse(p.data).showcase;
    if (Array.isArray(sc) && sc.some(Boolean)) await verifyShowcase(env.DB, uid, sc, save);
    else await env.DB.prepare('DELETE FROM social_shown WHERE uid = ?').bind(uid).run();
  } catch (e) { /* витрина никогда не мешает сохранению */ }
}
async function socialHandles(env, ids) {
  if (!socialOn(env) || !ids.length) return {};
  await socialSchema(env.DB);
  const keys = [...new Set(ids)].filter(Number.isSafeInteger);
  if (!keys.length) return {};
  let cache = socialHandleCache.get(env.DB);
  if (!cache) { cache = new Map(); socialHandleCache.set(env.DB, cache); }
  const now = Date.now(), missing = keys.filter(k => !cache.has(k) || cache.get(k).until <= now);
  // Immutable handles only. Never cache profile privacy or card ownership.
  for (let i = 0; i < missing.length; i += 90) {
    const batch = missing.slice(i, i + 90);
    const rows = (await env.DB.prepare(`SELECT uid, handle FROM social_profiles WHERE uid IN (${batch.map(() => '?').join(',')})`).bind(...batch).all()).results;
    const found = new Map(rows.map(r => [r.uid, r.handle]));
    for (const k of batch) cache.set(k, { handle: found.get(k) || null, until: now + 60000 });
  }
  const result = Object.fromEntries(keys.filter(k => cache.get(k)?.handle).map(k => [k, cache.get(k).handle]));
  while (cache.size > 512) cache.delete(cache.keys().next().value);
  return result;
}
async function social(env, user, body) {
  if (!socialOn(env)) return { ok: false, disabled: true };
  const db = env.DB; await schema(db); await socialSchema(db);
  if (body.act === 'profile') {
    if (!/^[a-f0-9]{32}$/.test(body.handle || '')) return { ok: false, error: 'unavailable' };
    const row = await db.prepare('SELECT uid, data FROM social_profiles WHERE handle = ?').bind(body.handle).first();
    if (!row) return { ok: false, error: 'unavailable' };
    if (!JSON.parse(row.data).public) return { ok: true, private: true };
    const u = await db.prepare('SELECT nick, emoji, xp FROM users WHERE id = ?').bind(row.uid).first();
    const t = await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(row.uid).first();
    // «Игрок дня»: частичный индекс только по победам — без перебора всей таблицы daily на каждый просмотр профиля
    const d = await db.prepare('SELECT 1 AS n FROM daily WHERE id = ? AND won = 1 LIMIT 1').bind(row.uid).first();
    const xp = Math.max(0, Number(u && u.xp) || 0);
    const thresholds = [0, 60, 180, 400, 800, 1400, 2400, 4000];
    // Existing profile statistics are server-stored but retain legacy client-result trust limitations.
    // Витрина — только проверенная сервером (social_shown), а не то, что игрок выбрал.
    return { ok: true, private: false, nick: String(u && u.nick || 'Игрок').slice(0, 32), emoji: String(u && u.emoji || '⚽').slice(0, 16),
      level: thresholds.filter(n => xp >= n).length, trophies: Math.max(0, Math.min(11000, Number(t && t.trophies) || 0)),
      achievements: d && d.n > 0 ? ['Игрок дня'] : [], showcase: await shownFor(db, row.uid), showcaseEnabled: true };
  }
  if (!['self', 'edit'].includes(body.act)) return { ok: false, error: 'bad operation' };
  let row = await db.prepare('SELECT handle, revision, data FROM social_profiles WHERE uid = ?').bind(user.id).first();
  if (!row) {
    const handle = crypto.randomUUID().replace(/-/g, '');
    await db.prepare('INSERT OR IGNORE INTO social_profiles(uid, handle) VALUES (?, ?)').bind(user.id, handle).run();
    row = await db.prepare('SELECT handle, revision, data FROM social_profiles WHERE uid = ?').bind(user.id).first();
  }
  let conflict = false;
  if (body.act === 'edit') {
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) return { ok: false, error: 'bad revision' };
    let data; try {
      const ops = body.ops === undefined ? [body.op] : body.ops;
      if (!Array.isArray(ops) || !ops.length || ops.length > 100) throw Error('bad batch');
      data = ops.reduce(socialEdit, JSON.parse(row.data));
    } catch (_) { return { ok: false, error: 'bad operation' }; }
    conflict = row.revision !== body.revision;
    if (!conflict && JSON.stringify(data) !== row.data) {
      const result = await db.prepare('UPDATE social_profiles SET data = ?, revision = revision + 1 WHERE uid = ? AND revision = ?').bind(JSON.stringify(data), user.id, body.revision).run();
      conflict = result.meta.changes !== 1;
      row = await db.prepare('SELECT handle, revision, data FROM social_profiles WHERE uid = ?').bind(user.id).first();
      if (!conflict && (body.ops === undefined ? [body.op] : body.ops).some((o) => o && o.type === 'showcase')) {
        const sv = await db.prepare('SELECT data FROM saves WHERE id = ?').bind(user.id).first();
        let save = null; try { save = sv ? JSON.parse(sv.data) : null; } catch (e) { save = null; }
        await verifyShowcase(db, user.id, JSON.parse(row.data).showcase, save);
      }
    }
  }
  return { ok: !conflict, conflict, handle: row.handle, revision: row.revision, ...JSON.parse(row.data), shown: await shownFor(db, user.id), showcaseEnabled: true };
}

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
  const authDate = Number(p.get('auth_date'));
  const age = Date.now() / 1000 - authDate;
  if (!Number.isFinite(authDate) || authDate <= 0 || age < -120 || age > maxAgeSec) return null;
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
    // события игр теперь копятся счётчиками (одна строка на день+игру+тип), а не строкой на каждое нажатие
    db.prepare('CREATE TABLE IF NOT EXISTS evd (day TEXT NOT NULL, game TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, game, kind))'),
    db.prepare('CREATE TABLE IF NOT EXISTS evu (day TEXT NOT NULL, game TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY (day, game, id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS reports (ts INTEGER NOT NULL, id INTEGER NOT NULL, nick TEXT, text TEXT, info TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS bot (chat INTEGER PRIMARY KEY, started INTEGER NOT NULL, blocked INTEGER NOT NULL DEFAULT 0)'),
    // Track manual broadcast update IDs: Telegram may retry a slow webhook request.
    db.prepare('CREATE TABLE IF NOT EXISTS tg_broadcast_updates (id INTEGER PRIMARY KEY, received INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS event_batches (uid INTEGER NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (uid, id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS event_batches_ts ON event_batches (ts)'), // почасовая уборка без перебора таблицы
    db.prepare('CREATE TABLE IF NOT EXISTS names (game TEXT PRIMARY KEY, title TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS weekly_xp ON weekly (week, xp)'),
    // друзья: кто пришёл по чьей ссылке ?startapp=ref_<id> — связь в обе стороны
    // покупки за звёзды: сезонный пропуск
    db.prepare('CREATE TABLE IF NOT EXISTS purchases (id INTEGER NOT NULL, item TEXT NOT NULL, season INTEGER NOT NULL DEFAULT 0, stars INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, PRIMARY KEY (id, item, season))'),
    db.prepare('CREATE TABLE IF NOT EXISTS payment_receipts (charge TEXT PRIMARY KEY, id INTEGER NOT NULL, item TEXT NOT NULL, purchase INTEGER NOT NULL, stars INTEGER NOT NULL, ts INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS friends (a INTEGER NOT NULL, b INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (a, b))'),
    // трофеи и победы по играм (для таблиц), кубок драфта недели
    db.prepare('CREATE TABLE IF NOT EXISTS ustats (id INTEGER PRIMARY KEY, trophies INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ustats_tro ON ustats (trophies DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ustats_top ON ustats (trophies DESC, updated ASC)'), // топ-50 без сортировки всей таблицы
    db.prepare('CREATE TABLE IF NOT EXISTS gwins (id INTEGER NOT NULL, game TEXT NOT NULL, wins INTEGER NOT NULL, PRIMARY KEY (id, game))'),
    db.prepare('CREATE INDEX IF NOT EXISTS gwins_game ON gwins (game, wins DESC)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cup (week TEXT NOT NULL, id INTEGER NOT NULL, wins INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (week, id))'),
    // клубы
    db.prepare('CREATE TABLE IF NOT EXISTS clubs (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, emoji TEXT, owner INTEGER NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cmembers (id INTEGER PRIMARY KEY, club INTEGER NOT NULL, joined INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cmembers_club ON cmembers (club)'),
    // клуб как в Clash Royale: роли, описание и порог трофеев, чат, запросы карточек и подарки от соклубников
    db.prepare('CREATE TABLE IF NOT EXISTS crole (id INTEGER PRIMARY KEY, role INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cinfo (club INTEGER PRIMARY KEY, descr TEXT, mintro INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cchat (id INTEGER PRIMARY KEY AUTOINCREMENT, club INTEGER NOT NULL, uid INTEGER NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT, meta TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cchat_club ON cchat (club, id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cchat_uid ON cchat (uid, kind, id)'), // «не так быстро» в чате клуба
    db.prepare('CREATE TABLE IF NOT EXISTS croom (uid INTEGER PRIMARY KEY, club INTEGER NOT NULL, game TEXT NOT NULL, code TEXT NOT NULL, ts INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS croom_club ON croom (club, ts)'), // вызовы клуба при каждом открытии экрана клуба
    db.prepare('CREATE INDEX IF NOT EXISTS purchases_id ON purchases (id)'),
    // победы за неделю на игрока — счётчик, чтобы клуб и лига не пересчитывали всю таблицу событий
    db.prepare('CREATE TABLE IF NOT EXISTS cwins (id INTEGER NOT NULL, week TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (week, id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS creq (id INTEGER PRIMARY KEY AUTOINCREMENT, club INTEGER NOT NULL, uid INTEGER NOT NULL, card TEXT NOT NULL, rar TEXT NOT NULL, need INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cgift (id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, card TEXT NOT NULL, frm TEXT, ts INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cdon (id INTEGER NOT NULL, week TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, week))'),
    db.prepare('CREATE INDEX IF NOT EXISTS creq_club ON creq (club, ts)'),
    db.prepare('CREATE INDEX IF NOT EXISTS creq_uid ON creq (uid, ts)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cgift_uid ON cgift (uid, done)'),
    // напоминания: можно ли писать и когда писали последний раз
    db.prepare('CREATE TABLE IF NOT EXISTS prefs (id INTEGER PRIMARY KEY, remind INTEGER NOT NULL DEFAULT 1, reminded TEXT)'),
    // подбор соперника для онлайн-дуэли
    db.prepare('CREATE TABLE IF NOT EXISTS mm (id INTEGER PRIMARY KEY, code TEXT NOT NULL, nick TEXT, emo TEXT, ts INTEGER NOT NULL, paired INTEGER)'),
    // очередь онлайна по режимам: дуэль, драфт, козыри… (сводим только игроков одного режима)
    // резервная копия сохранения игрока: храним самую «продвинутую» (больше трофеев; при равенстве — новее)
    db.prepare('CREATE TABLE IF NOT EXISTS saves (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, tro INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)'),
    db.prepare("CREATE TABLE IF NOT EXISTS mmg (id INTEGER PRIMARY KEY, game TEXT NOT NULL DEFAULT 'duel', code TEXT NOT NULL, nick TEXT, emo TEXT, ts INTEGER NOT NULL, paired INTEGER)"),
    // очередь поиска: без индексов каждый запрос «найти соперника» перебирал всю очередь (квадратичный рост)
    db.prepare('CREATE INDEX IF NOT EXISTS mmg_wait ON mmg (game, paired, ts)'),
    db.prepare('DROP INDEX IF EXISTS mmg_ts'), // лишний индекс удваивал записи при каждом обновлении очереди
    db.prepare('CREATE TABLE IF NOT EXISTS rooms (room TEXT PRIMARY KEY, host INTEGER NOT NULL, guest INTEGER, created INTEGER NOT NULL, seen0 INTEGER NOT NULL, seen1 INTEGER, closed INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rmsg (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, side INTEGER NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL)'),
    // сообщения соперника: (room, side, id) — опрос читает только новые чужие строки, уборка — по префиксу room
    db.prepare('CREATE INDEX IF NOT EXISTS rmsg_rsi ON rmsg (room, side, id)'),
    db.prepare('DROP INDEX IF EXISTS rmsg_room'),
    db.prepare('DROP INDEX IF EXISTS rmsg_ts'),
    db.prepare('CREATE INDEX IF NOT EXISTS rooms_created ON rooms (created)'),
    db.prepare("CREATE TABLE IF NOT EXISTS presence (id INTEGER PRIMARY KEY, game TEXT NOT NULL DEFAULT 'hub', ts INTEGER NOT NULL)"),
    db.prepare('CREATE INDEX IF NOT EXISTS presence_ts ON presence (ts)'),
    db.prepare("CREATE TABLE IF NOT EXISTS draft_tours (attempt INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER NOT NULL, roster TEXT NOT NULL, state TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', claimed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(uid, roster))"),
    db.prepare('CREATE INDEX IF NOT EXISTS draft_tours_uid ON draft_tours (uid, updated DESC)'),
    // испытания серий («Забытые легенды»): отметки заданий и однократная выдача карточки
    db.prepare('CREATE TABLE IF NOT EXISTS legend_marks (uid INTEGER NOT NULL, mark TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (uid, mark))'),
    db.prepare('CREATE TABLE IF NOT EXISTS legend_claims (uid INTEGER NOT NULL, card TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (uid, card))'),
  ]);
  if (!(await db.prepare("SELECT v FROM settings WHERE k = 'migration:trophy-cap-11000'").bind().first())) {
    await db.batch([
      db.prepare('UPDATE ustats SET trophies = 11000 WHERE trophies > 11000'),
      db.prepare('UPDATE saves SET tro = 11000 WHERE tro > 11000'),
      db.prepare("INSERT OR IGNORE INTO settings (k, v) VALUES ('migration:trophy-cap-11000', '1')"),
    ]);
  }
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
      ON CONFLICT(id) DO UPDATE SET nick = COALESCE(?2, nick), emoji = COALESCE(?3, emoji), xp = ?4, updated = ?5, day = ?6, gained = ?7
      WHERE xp != ?4 OR nick IS NOT COALESCE(?2, nick) OR emoji IS NOT COALESCE(?3, emoji)`).bind(id, nick, emoji, xp, now, today, gained, fallback),
    // ничего не поменялось — строки не трогаем (каждая запись тратит дневной лимит базы)
    db.prepare('INSERT INTO weekly (week, id, start, xp) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(week, id) DO UPDATE SET xp = ?4 WHERE xp != ?4').bind(wk, id, start, xp),
  ];
  const d = body.dly;
  // «Игрок дня»: засчитывается только сегодняшний и только первый присланный результат
  if (d && d.day === dayKey(now)) {
    const tries = Math.max(1, Math.min(12, Math.floor(Number(d.tries) || 12)));
    ops.push(db.prepare('INSERT OR IGNORE INTO daily (day, id, tries, won, ts) VALUES (?, ?, ?, ?, ?)').bind(d.day, id, tries, d.won ? 1 : 0, now));
  }
  // Трофеи растут только вверх, максимум +3000 за запрос и никогда выше 11 000.
  const tro = Math.max(0, Math.floor(Number(body.tro) || 0));
  if (tro) {
    const ot = await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(id).first();
    const t = Math.min(11000, ot ? Math.max(ot.trophies, Math.min(tro, ot.trophies + 3000)) : Math.min(tro, 5000));
    if (!ot || ot.trophies !== t) ops.push(db.prepare('INSERT INTO ustats (id, trophies, updated) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET trophies = ?2, updated = ?3 WHERE trophies != ?2').bind(id, t, now));
  }
  // победы по играм: { 'ng:wordle': 12, … }
  if (body.gw && typeof body.gw === 'object') {
    Object.entries(body.gw).slice(0, 60).forEach(([g, w]) => {
      if (!/^[a-z0-9:-]{2,40}$/.test(g)) return;
      const n = Math.max(0, Math.min(100000, Math.floor(Number(w) || 0))); if (!n) return;
      ops.push(db.prepare('INSERT INTO gwins (id, game, wins) VALUES (?1, ?2, ?3) ON CONFLICT(id, game) DO UPDATE SET wins = ?3 WHERE ?3 > wins').bind(id, g, n));
    });
  }
  // кубок драфта недели: сколько турниров выиграл за эту неделю
  if (body.cup && body.cup.week === wk) {
    const n = Math.max(0, Math.min(200, Math.floor(Number(body.cup.wins) || 0)));
    if (n) ops.push(db.prepare('INSERT INTO cup (week, id, wins, ts) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(week, id) DO UPDATE SET wins = ?3, ts = ?4 WHERE ?3 > wins').bind(wk, id, n, now));
  }
  if (ops.length) await db.batch(ops);
  return { xp };
}

// кеш таблиц: в памяти воркера и в settings (между копиями воркера), живёт 90 секунд
const BOARD_TTL = 300e3, boardMem = {}; // рейтинги пересчитываются раз в 5 минут (своё место — по готовому списку очков)
async function boardCache(db, key, build) {
  const now = Date.now(), m = boardMem[key];
  if (m && now - m.ts < BOARD_TTL) return m;
  try { const c = JSON.parse((await getSetting(db, 'top:' + key)) || 'null'); if (c && now - c.ts < BOARD_TTL) { boardMem[key] = c; return c; } } catch (e) { /* пересчитаем */ }
  const c = { ts: now, ...(await build()) };
  boardMem[key] = c;
  await setSetting(db, 'top:' + key, JSON.stringify(c));
  return c;
}

async function top(env, user, scope, game = '') {
  const db = env.DB, now = Date.now(), id = user.id;
  await schema(db);
  let rows, me = null, total = 0;
  // общие таблицы считаются раз в 90 секунд на всех (кеш), а своё место — по готовому списку очков
  const board = async (key, topSql, scoresSql, mineSql, args, mineArgs) => {
    const c = await boardCache(db, key, async () => ({
      rows: (await db.prepare(topSql).bind(...args).all()).results,
      scores: (await db.prepare(scoresSql).bind(...args).all()).results.map((r) => r.s),
    }));
    rows = c.rows.map((r) => ({ ...r })); total = c.scores.length;
    const mine = await db.prepare(mineSql).bind(...mineArgs).first();
    if (mine && mine.s > 0) {
      let lo = 0, hi = c.scores.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (c.scores[mid] > mine.s) lo = mid + 1; else hi = mid; } // очки по убыванию
      me = { place: lo + 1, score: mine.s };
      rows.forEach((r) => { if (r.id === id) r.score = mine.s; });
      rows.sort((x, y) => y.score - x.score);
    }
  };
  if (scope === 'week') {
    const wk = weekKey(now);
    // неделя: список очков всё равно читается целиком — берём из него и топ (id), а ники — по ключу для 50 игроков.
    // Отдельный запрос топа с JOIN сортировал всю таблицу ещё раз (вдвое больше прочитанных строк).
    const c = await boardCache(db, 'week:' + wk, async () => {
      const all = (await db.prepare('SELECT id, xp - start AS s FROM weekly WHERE week = ? AND xp > start ORDER BY s DESC LIMIT 20000').bind(wk).all()).results;
      const ids = all.slice(0, TOP + 20).map((r) => r.id); // запас на равные очки у границы
      const users = ids.length ? (await db.prepare(`SELECT id, nick, emoji, updated FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : [];
      const by = new Map(users.map((u) => [u.id, u]));
      const top = all.slice(0, TOP + 20).filter((r) => by.has(r.id)).map((r) => ({ id: r.id, nick: by.get(r.id).nick, emoji: by.get(r.id).emoji, score: r.s, up: by.get(r.id).updated }))
        .sort((x, y) => y.score - x.score || x.up - y.up).slice(0, TOP).map(({ up, ...r }) => r);
      return { rows: top, scores: all.map((r) => r.s) };
    });
    rows = c.rows.map((r) => ({ ...r })); total = c.scores.length;
    const mine = await db.prepare('SELECT xp - start AS s FROM weekly WHERE week = ? AND id = ?').bind(wk, id).first();
    if (mine && mine.s > 0) {
      let lo = 0, hi = c.scores.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (c.scores[mid] > mine.s) lo = mid + 1; else hi = mid; }
      me = { place: lo + 1, score: mine.s };
      rows.forEach((r) => { if (r.id === id) r.score = mine.s; });
      rows.sort((x, y) => y.score - x.score);
    }
  } else if (scope === 'day') {
    const day = dayKey(now);
    // как остальные таблицы: общий кеш на всех; место — по готовому списку (попытки, время) без подсчёта на каждый просмотр
    const k = (tries, ts) => tries * 1e13 + ts;
    const c = await boardCache(db, 'day:' + day, async () => ({
      rows: (await db.prepare(`SELECT u.id, u.nick, u.emoji, d.tries AS score FROM daily d JOIN users u ON u.id = d.id
        WHERE d.day = ? AND d.won = 1 ORDER BY d.tries ASC, d.ts ASC LIMIT ${TOP}`).bind(day).all()).results,
      scores: (await db.prepare('SELECT tries, ts FROM daily WHERE day = ? AND won = 1 ORDER BY tries ASC, ts ASC LIMIT 20000').bind(day).all()).results.map((r) => k(r.tries, r.ts)),
    }));
    rows = c.rows.map((r) => ({ ...r })); total = c.scores.length;
    const mine = await db.prepare('SELECT tries, won, ts FROM daily WHERE day = ? AND id = ?').bind(day, id).first();
    if (mine && mine.won) {
      const v = k(mine.tries, mine.ts); let lo = 0, hi = c.scores.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (c.scores[mid] < v) lo = mid + 1; else hi = mid; }
      if (lo >= c.scores.length || c.scores[lo] !== v) total = Math.max(total, lo + 1); // сыграл после пересчёта кеша
      me = { place: lo + 1, score: mine.tries };
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
    await board('tro', `SELECT u.id, u.nick, u.emoji, s.trophies AS score FROM ustats s JOIN users u ON u.id = s.id WHERE s.trophies > 0 ORDER BY s.trophies DESC, s.updated ASC LIMIT ${TOP}`,
      'SELECT trophies AS s FROM ustats WHERE trophies > 0 ORDER BY trophies DESC LIMIT 20000', 'SELECT trophies AS s FROM ustats WHERE id = ?', [], [id]);
  } else if (scope === 'game') {
    const g = /^[a-z0-9:-]{2,40}$/.test(game) ? game : 'ng:wordle';
    await board('game:' + g, `SELECT u.id, u.nick, u.emoji, g.wins AS score FROM gwins g JOIN users u ON u.id = g.id WHERE g.game = ? ORDER BY g.wins DESC LIMIT ${TOP}`,
      'SELECT wins AS s FROM gwins WHERE game = ? ORDER BY wins DESC LIMIT 20000', 'SELECT wins AS s FROM gwins WHERE id = ? AND game = ?', [g], [id, g]);
  } else if (scope === 'cup') {
    const wk = weekKey(now);
    await board('cup:' + wk, `SELECT u.id, u.nick, u.emoji, c.wins AS score FROM cup c JOIN users u ON u.id = c.id WHERE c.week = ? ORDER BY c.wins DESC, c.ts ASC LIMIT ${TOP}`,
      'SELECT wins AS s FROM cup WHERE week = ? ORDER BY wins DESC LIMIT 20000', 'SELECT wins AS s FROM cup WHERE week = ? AND id = ?', [wk], [wk, id]);
  } else if (scope === 'clubs') {
    const wk = weekKey(now);
    rows = (await boardCache(db, 'clubs:' + wk, async () => { await fillWins(db, wk); return { rows: (await db.prepare(`SELECT c.id, c.name AS nick, c.emoji, COALESCE(SUM(w.n), 0) AS score FROM clubs c JOIN cmembers m ON m.club = c.id
      LEFT JOIN cwins w ON w.week = ? AND w.id = m.id GROUP BY c.id ORDER BY score DESC LIMIT ${TOP}`).bind(wk).all()).results, scores: [] }; })).rows;
    total = rows.length;
    const my = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(id).first();
    rows = rows.map((r) => ({ ...r, id: my && r.id === my.club ? id : -1 }));
    const i = rows.findIndex((r) => r.id === id); if (i >= 0) me = { place: i + 1, score: rows[i].score };
  } else {
    await board('all', `SELECT id, nick, emoji, xp AS score FROM users WHERE xp > 0 ORDER BY xp DESC, updated ASC LIMIT ${TOP}`,
      'SELECT xp AS s FROM users WHERE xp > 0 ORDER BY xp DESC LIMIT 20000', 'SELECT xp AS s FROM users WHERE id = ?', [], [id]);
  }
  const profiles = scope === 'clubs' ? {} : await socialHandles(env, rows.map(r => r.id));
  return { rows: rows.map((r) => ({ nick: r.nick, emoji: r.emoji, score: r.score, me: r.id === id, ...(profiles[r.id] ? { profile: profiles[r.id] } : {}) })), me, total, weekEnd: weekEnd(now) };
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
  return { admin: await isAdminId(env, user.id), pass, shop, cupWin, save: sv ? { ts: sv.ts, tro: Math.min(11000, sv.tro) } : null, tro: ut ? Math.min(11000, ut.trophies) : 0 };
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
  const tro = Math.max(0, Math.min(11000, Math.floor(Number(d && d.rw && d.rw.trophies) || 0))), ts = Math.floor(Number(d && d.ts) || Date.now());
  if (d.rw) d.rw.trophies = tro;
  const safeData = JSON.stringify(d);
  const old = await db.prepare('SELECT ts, tro FROM saves WHERE id = ?').bind(user.id).first();
  if (old && (tro < old.tro || (tro === old.tro && ts < old.ts))) return { ok: true, kept: true, ts: old.ts, tro: old.tro };
  await db.prepare('INSERT INTO saves (id, ts, tro, data) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET ts = ?2, tro = ?3, data = ?4').bind(user.id, ts, tro, safeData).run();
  await reverifyOnSave(env, user.id, d);
  return { ok: true, ts, tro };
}
async function loadData(env, user) {
  await schema(env.DB);
  const r = await env.DB.prepare('SELECT ts, tro, data FROM saves WHERE id = ?').bind(user.id).first();
  if (!r) return { ok: true, data: null };
  let data = r.data, tro = Math.min(11000, Math.max(0, Number(r.tro) || 0));
  try { const d = JSON.parse(data); if (d.rw) d.rw.trophies = Math.min(11000, Math.max(0, Number(d.rw.trophies) || 0)); data = JSON.stringify(d); } catch (e) { /* проверка будет на клиенте */ }
  return { ok: true, ts: r.ts, tro, data };
}

const knownNames = new Set(), evuMem = new Set();
async function events(env, user, body) {
  const db = env.DB, now = Date.now(), today = dayKey(now);
  await schema(db);
  const list = (Array.isArray(body.events) ? body.events : []).slice(0, 40)
    .filter((e) => e && /^[a-z0-9:-]{2,40}$/.test(e.game) && ['open', 'end', 'win'].includes(e.kind));
  // Ignore retries of the same analytics batch (prevents duplicate club wins on failed responses).
  // Old app versions without batchId continue to work during migration.
  const batchId = typeof body.batchId === 'string' && /^[a-zA-Z0-9:_-]{10,96}$/.test(body.batchId) ? body.batchId : null;
  if (batchId) {
    const claimed = await db.prepare('INSERT OR IGNORE INTO event_batches (uid, id, ts) VALUES (?, ?, ?)').bind(user.id, batchId, now).run();
    if (claimed.meta?.changes !== 1) return { saved: 0, duplicate: true };
  }
  try {
  // склеиваем пачку: по одной записи на игру+тип, игрок за день в игре отмечается один раз (повтор не пишется)
  const agg = {}, seenG = new Set();
  list.forEach((e) => { const k = e.game + '|' + e.kind; const a = agg[k] || (agg[k] = { game: e.game, kind: e.kind, n: 0, ms: 0 }); a.n++; a.ms += Math.max(0, Math.min(3600e3, Math.floor(Number(e.ms) || 0))); seenG.add(e.game); });
  const newSeen = [...seenG].filter((g) => !evuMem.has(today + g + user.id));
  newSeen.forEach((g) => evuMem.add(today + g + user.id));
  if (evuMem.size > 50000) evuMem.clear();
  const w = list.filter((e) => e.kind === 'win').length;
  if (w) await fillWins(db, weekKey(now));
  if (list.length) await db.batch([
    ...Object.values(agg).map((a) => db.prepare('INSERT INTO evd (day, game, kind, n, ms) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(day, game, kind) DO UPDATE SET n = n + ?4, ms = ms + ?5').bind(today, a.game, a.kind, a.n, a.ms)),
    ...newSeen.map((g) => db.prepare('INSERT OR IGNORE INTO evu (day, game, id) VALUES (?, ?, ?)').bind(today, g, user.id)),
    // русские названия игр для статистики — пишем только новые (запомненные в памяти воркера не трогаем)
    ...list.filter((e) => e.title && !knownNames.has(e.game)).map((e) => { knownNames.add(e.game); return db.prepare('INSERT INTO names (game, title) VALUES (?1, ?2) ON CONFLICT(game) DO UPDATE SET title = ?2').bind(e.game, clean(e.title, 40)); }),
    ...(w ? [db.prepare('INSERT INTO cwins (id, week, n) VALUES (?1, ?2, ?3) ON CONFLICT(week, id) DO UPDATE SET n = n + ?3').bind(user.id, weekKey(now), w)] : []),
  ]);
  return { saved: list.length };
  } catch (e) {
    if (batchId) await db.prepare('DELETE FROM event_batches WHERE uid = ? AND id = ?').bind(user.id, batchId).run().catch(() => {});
    throw e;
  }
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
let statsMem = null; // статистика админки: не чаще раза в 5 минут на всех (кеш в памяти и в settings для других копий воркера)
async function stats(env) {
  const now = Date.now();
  if (statsMem && now - statsMem.ts < 5 * 6e4) return statsMem.v;
  await schema(env.DB);
  try { const c = JSON.parse((await getSetting(env.DB, 'stats:cache')) || 'null'); if (c && now - c.ts < 5 * 6e4) { statsMem = c; return c.v; } } catch (e) { /* пересчитаем */ }
  const v = await statsRaw(env); statsMem = { ts: now, v };
  await setSetting(env.DB, 'stats:cache', JSON.stringify(statsMem));
  return v;
}
async function statsRaw(env) {
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
      SUM(CASE WHEN kind = 'open' THEN n END) AS opens, SUM(CASE WHEN kind = 'end' THEN n END) AS ends, SUM(CASE WHEN kind = 'win' THEN n END) AS wins,
      CAST(SUM(CASE WHEN kind = 'end' THEN ms END) / MAX(1, SUM(CASE WHEN kind = 'end' THEN n END)) AS INTEGER) AS avgms
    FROM evd e WHERE day >= ?1 GROUP BY game ORDER BY opens DESC LIMIT 40`, days[0]);
  // игроки по играм — одним проходом по визитам за 7 дней (подзапрос на каждую игру перечитывал их ~40 раз: ~345 тыс. строк)
  const pl = new Map((await all('SELECT game, COUNT(DISTINCT id) AS n FROM evu WHERE day >= ? GROUP BY game', days[0])).map((r) => [r.game, r.n]));
  games.forEach((g) => { g.players = pl.get(g.game) || 0; });
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
  // Emergency fail-safe: bulk messages are disabled until an admin explicitly enables them.
  if ((await getSetting(db, 'broadcast:enabled')) !== '1') return 0;
  let sent = 0, processed = 0;
  for (const id of await recipients(db)) {
    // /stop also interrupts a running mailing within 10 recipients.
    if (processed++ % 10 === 0 && (await getSetting(db, 'broadcast:enabled')) !== '1') break;
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
    ctx.waitUntil((async () => {
      await schema(env.DB);
      // Independence: failures are collected after all tasks have had a chance to run.
      const jobs = [
        weekly(env),
        reminders(env),
        env.DB.prepare('DELETE FROM presence WHERE ts < ?').bind(Date.now() - 86400000).run()
          .then(() => env.DB.prepare('DELETE FROM event_batches WHERE ts < ?').bind(Date.now() - 7 * 86400000).run()),
        // онлайн-комнаты: раз в час удаляем старые (по индексам, без перебора всей таблицы)
        env.DB.prepare('DELETE FROM mmg WHERE ts < ?').bind(Date.now() - 600000).run(), // очередь поиска: брошенные строки
        cleanRelay(env.DB),
      ];
      const results = await Promise.allSettled(jobs);
      const failed = [];
      for (let i = 0; i < results.length; i++) if (results[i].status === 'rejected') {
        const name = ['weekly', 'reminders', 'cleanup'][i];
        console.error(name + ' cron failed', results[i].reason);
        failed.push(name);
      }
      await env.DB.batch([
        env.DB.prepare("INSERT INTO settings (k, v) VALUES ('cron:last', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(Date.now())),
        env.DB.prepare("INSERT INTO settings (k, v) VALUES ('cron:errors', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(failed.join(', ')),
      ]);
      if (failed.length) throw new Error('Scheduled tasks failed: ' + failed.join(', '));
    })());
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
  if (/^\/status(?:\s|$)/.test(text)) {
    const last = Number(await getSetting(db, 'cron:last')) || 0;
    const errors = (await getSetting(db, 'cron:errors')) || '';
    const enabled = (await getSetting(db, 'broadcast:enabled')) === '1';
    return say(['🛠 Джексоны · состояние сервера',
      'Массовые сообщения: ' + (enabled ? 'включены' : 'выключены'),
      'Последний Cron: ' + (last ? new Date(last).toISOString() : 'нет данных'),
      'Ошибки Cron: ' + (errors || 'нет'),
      'Для остановки рассылок: /stop',
    ].join('\n'));
  }
  if (/^\/(stop|broadcast_off)(?:\s|$)/.test(text)) {
    await setSetting(db, 'broadcast:enabled', '0');
    return say('🛑 Все массовые рассылки выключены. Для включения: /broadcast_on');
  }
  if (/^\/broadcast_on(?:\s|$)/.test(text)) {
    await setSetting(db, 'broadcast:enabled', '1');
    return say('✅ Массовые рассылки включены. Используй /broadcast только один раз на кампанию.');
  }
  if (/^\/broadcast(?:\s|$)/.test(text)) {
    if ((await getSetting(db, 'broadcast:enabled')) !== '1') return say('🛑 Рассылки выключены. Для включения: /broadcast_on');
    const msg = text.replace(/^\/broadcast\s*/, '').trim();
    if (!msg) return say('Напиши так: /broadcast текст сообщения');
    const n = await broadcast(env, msg);
    return say(`Отправлено: ${n}`);
  }
}

// ---------- клубы: игроки объединяются, общая цель недели — победы всех участников ----------
const weekStartDay = (t) => weekKey(t); // понедельник недели (события хранятся по дням)
const CLUB_MAX = 30;
const clubGoal = (n) => Math.max(40, n * 25); // побед за неделю на весь клуб: 10 уровней клубного сундука
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// роли: 3 — президент (создатель), 2 — вице-президент, 1 — капитан, 0 — игрок
const REQ_NEED = { bronze: 8, silver: 4, gold: 1 }, REQ_EVERY = 7 * 3600e3;
// счётчик побед недели заполняется из таблицы событий один раз (для недель до появления счётчика)
async function fillWins(db, wk) {
  if (fillWins.done && fillWins.done[wk]) return;
  if (await getSetting(db, 'cwins:' + wk)) { (fillWins.done = fillWins.done || {})[wk] = 1; return; }
  await setSetting(db, 'cwins:' + wk, 1);
  const next = weekKey(new Date(wk + 'T12:00:00Z').getTime() + 8 * 864e5);
  await db.prepare(`INSERT INTO cwins (id, week, n) SELECT id, ?1, COUNT(*) FROM events WHERE day >= ?1 AND day < ?2 AND kind = 'win' GROUP BY id
    ON CONFLICT(week, id) DO UPDATE SET n = excluded.n`).bind(wk, next).run();
  (fillWins.done = fillWins.done || {})[wk] = 1;
}
// места клубов в клубной лиге недели — считаем не чаще раза в 10 минут (прошлую неделю — один раз)
async function clubPlaces(db, wk, final) {
  const key = 'league:' + wk, now = Date.now();
  try { const c = JSON.parse((await getSetting(db, key)) || 'null'); if (c && (c.final || now - c.ts < 10 * 6e4)) return c.list; } catch (e) { /* пересчитаем */ }
  await fillWins(db, wk);
  const list = (await db.prepare(`SELECT m.club AS id, SUM(w.n) AS w FROM cwins w JOIN cmembers m ON m.id = w.id WHERE w.week = ? GROUP BY m.club ORDER BY w DESC, m.club ASC LIMIT 500`).bind(wk).all()).results.map((r) => [r.id, r.w]);
  await setSetting(db, key, JSON.stringify({ ts: now, final: !!final, list }));
  return list;
}
async function clubInfo(db, uid, ackGifts = false, socialEnv = {}) {
  const m = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first();
  if (!m) return { club: null };
  const c = await db.prepare('SELECT id, code, name, emoji, owner FROM clubs WHERE id = ?').bind(m.club).first();
  if (!c) { await db.prepare('DELETE FROM cmembers WHERE id = ?').bind(uid).run(); return { club: null }; }
  const now = Date.now(), wk = weekKey(now);
  await fillWins(db, wk);
  const members = (await db.prepare(`SELECT m.id, u.nick, u.emoji, COALESCE(s.trophies, 0) AS trophies, COALESCE(r.role, 0) AS role, COALESCE(d.n, 0) AS don, se.last AS seen, COALESCE(w.n, 0) AS wins
    FROM cmembers m LEFT JOIN users u ON u.id = m.id LEFT JOIN ustats s ON s.id = m.id LEFT JOIN crole r ON r.id = m.id
    LEFT JOIN cdon d ON d.id = m.id AND d.week = ?2 LEFT JOIN seen se ON se.id = m.id LEFT JOIN cwins w ON w.week = ?2 AND w.id = m.id
    WHERE m.club = ?1 ORDER BY trophies DESC`).bind(c.id, wk).all()).results;
  const wins = members.reduce((a, x) => a + x.wins, 0);
  const info = (await db.prepare('SELECT descr, mintro FROM cinfo WHERE club = ?').bind(c.id).first()) || {};
  const chat = (await db.prepare(`SELECT h.id, h.uid, h.ts, h.kind, h.text, h.meta, u.nick, u.emoji FROM cchat h LEFT JOIN users u ON u.id = h.uid WHERE h.club = ? ORDER BY h.id DESC LIMIT 40`).bind(c.id).all()).results.reverse();
  const reqs = (await db.prepare('SELECT id, uid, card, rar, need, got, ts FROM creq WHERE club = ? AND ts > ? AND got < need').bind(c.id, now - 24 * 3600e3).all()).results;
  const myReq = await db.prepare('SELECT ts FROM creq WHERE uid = ? ORDER BY ts DESC LIMIT 1').bind(uid).first();
  // подарки от соклубников: отдаём один раз
  const gifts = (await db.prepare('SELECT id, card, frm FROM cgift WHERE uid = ? AND done = 0 LIMIT 40').bind(uid).all()).results;
  if (!ackGifts && gifts.length) await db.prepare(`UPDATE cgift SET done = 1 WHERE id IN (${gifts.map(() => '?').join(',')})`).bind(...gifts.map(g => g.id)).run();
  // Mark delivered only after the client has persisted these IDs and cards.
  const battles = (await db.prepare('SELECT game, code, uid FROM croom WHERE club = ? AND ts > ?').bind(c.id, now - 45000).all()).results;
  // клубная лига: место на этой неделе и итог прошлой
  const cur = await clubPlaces(db, wk), prev = await clubPlaces(db, weekKey(now - 7 * 864e5), true);
  const place = cur.findIndex((x) => x[0] === c.id) + 1, pi = prev.findIndex((x) => x[0] === c.id);
  const role = (x) => (x.id === c.owner ? 3 : Math.min(2, x.role));
  const me = members.find((x) => x.id === uid);
  const profiles = await socialHandles(socialEnv, members.map(x => x.id).concat(chat.map(h => h.uid)));
  return { club: { code: c.code, name: c.name, emoji: c.emoji || '⚽', descr: info.descr || '', mintro: info.mintro || 0, week: wk, prevWeek: weekKey(now - 7 * 864e5), wins, goal: clubGoal(members.length), max: CLUB_MAX,
    myRole: me ? role(me) : 0, me: uid, trophies: members.reduce((a, x) => a + x.trophies, 0),
    league: { place, clubs: Math.max(cur.length, place), prevPlace: pi >= 0 && prev[pi][1] > 0 ? pi + 1 : 0 },
    nextReq: myReq ? Math.max(0, myReq.ts + REQ_EVERY - now) : 0,
    members: members.map((x) => ({ profile: profiles[x.id], uid: x.id, nick: x.nick || 'Игрок', emoji: x.emoji || '⚽', trophies: x.trophies, wins: x.wins, role: role(x), don: x.don, seen: x.seen || 0, me: x.id === uid })),
    chat: chat.map((h) => ({ id: h.id, uid: h.uid, ts: h.ts, kind: h.kind, text: h.text || '', meta: h.meta ? JSON.parse(h.meta) : null, profile: profiles[h.uid], nick: h.nick || 'Игрок', emoji: h.emoji || '⚽', me: h.uid === uid })),
    reqs: reqs.map((r) => ({ id: r.id, uid: r.uid, card: r.card, rar: r.rar, need: r.need, got: r.got, ts: r.ts, me: r.uid === uid })),
    battles, gifts: gifts.map((g) => ({ id: g.id, card: g.card, from: g.frm || 'Соклубник' })) } };
}
async function club(env, user, body) {
  const db = env.DB, uid = user.id, now = Date.now();
  const err = (e) => ({ ok: false, error: e });
  await schema(db);
  if (body.act === 'giftAck') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(Number.isSafeInteger).slice(0, 40);
    if (ids.length) await db.prepare(`UPDATE cgift SET done = 1 WHERE uid = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(uid, ...ids).run();
    return { ok: true };
  }
  const say = (clubId, kind, text, meta) => db.prepare('INSERT INTO cchat (club, uid, ts, kind, text, meta) VALUES (?, ?, ?, ?, ?, ?)').bind(clubId, uid, now, kind, text ? String(text).slice(0, 300) : null, meta ? JSON.stringify(meta) : null).run();
  const nickOf = async (id) => ((await db.prepare('SELECT nick FROM users WHERE id = ?').bind(id).first()) || {}).nick || 'Игрок';
  const mine = async () => {
    const m = await db.prepare('SELECT m.club, c.owner, COALESCE(r.role, 0) AS role FROM cmembers m JOIN clubs c ON c.id = m.club LEFT JOIN crole r ON r.id = m.id WHERE m.id = ?').bind(uid).first();
    return m ? { club: m.club, role: m.owner === uid ? 3 : Math.min(2, m.role) } : null;
  };
  if (['battlePulse', 'battleClose', 'battleCheck'].includes(body.act)) {
    const m = await mine(); if (!m) return err('Ты не в клубе');
    const game = String(body.game || ''), code = String(body.code || '');
    if (body.act === 'battleClose') await db.prepare('DELETE FROM croom WHERE uid = ? AND game = ? AND code = ?').bind(uid, game, code).run();
    if (body.act === 'battlePulse') await db.prepare('UPDATE croom SET ts = ? WHERE uid = ? AND club = ? AND game = ? AND code = ?').bind(now, uid, m.club, game, code).run();
    if (body.act === 'battleCheck') {
      const room = await db.prepare('SELECT uid FROM croom WHERE club = ? AND game = ? AND code = ? AND ts > ?').bind(m.club, game, code, now - 45000).first();
      return room && room.uid !== uid ? { ok: true } : err('Вызов закрыт: хозяин уже вышел или начал матч. Попроси новый вызов.');
    }
    return { ok: true };
  }
  const leave = async (quiet) => {
    const m = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first(); if (!m) return;
    await db.batch([db.prepare('DELETE FROM cmembers WHERE id = ?').bind(uid), db.prepare('DELETE FROM crole WHERE id = ?').bind(uid)]);
    if (!quiet) await say(m.club, 'sys', `${await nickOf(uid)} покинул клуб`);
    // президент ушёл — клуб получает вице-президент со стажем, иначе самый давний участник
    const c = await db.prepare('SELECT owner FROM clubs WHERE id = ?').bind(m.club).first();
    if (c && c.owner === uid) {
      const next = await db.prepare('SELECT m.id FROM cmembers m LEFT JOIN crole r ON r.id = m.id WHERE m.club = ? ORDER BY COALESCE(r.role, 0) DESC, m.joined ASC LIMIT 1').bind(m.club).first();
      if (!next) await db.batch([db.prepare('DELETE FROM clubs WHERE id = ?').bind(m.club), db.prepare('DELETE FROM cinfo WHERE club = ?').bind(m.club), db.prepare('DELETE FROM cchat WHERE club = ?').bind(m.club)]);
      else { await db.batch([db.prepare('UPDATE clubs SET owner = ? WHERE id = ?').bind(next.id, m.club), db.prepare('DELETE FROM crole WHERE id = ?').bind(next.id)]); await say(m.club, 'sys', `${await nickOf(next.id)} — новый президент клуба`); }
    }
  };
  if (body.act === 'create') {
    const name = clean(body.name, 20); if (name.length < 2) return err('Название — от 2 букв');
    await leave();
    let code = '';
    for (let k = 0; k < 6; k++) { code = Array.from({ length: 6 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join(''); if (!(await db.prepare('SELECT 1 FROM clubs WHERE code = ?').bind(code).first())) break; }
    const r = await db.prepare('INSERT INTO clubs (code, name, emoji, owner, created) VALUES (?, ?, ?, ?, ?)').bind(code, name, clean(body.emoji, 4) || '⚽', uid, now).run();
    const id = r.meta.last_row_id;
    await db.prepare('INSERT INTO cmembers (id, club, joined) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET club = ?2, joined = ?3').bind(uid, id, now).run();
    await say(id, 'sys', `Клуб «${name}» основан`);
  } else if (body.act === 'join') {
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const c = await db.prepare('SELECT id FROM clubs WHERE code = ?').bind(code).first();
    if (!c) return err('Клуб с таким кодом не найден');
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM cmembers WHERE club = ?').bind(c.id).first()).n;
    const cur = await db.prepare('SELECT club FROM cmembers WHERE id = ?').bind(uid).first();
    if (!(cur && cur.club === c.id)) {
      if (n >= CLUB_MAX) return err(`В клубе уже ${CLUB_MAX} игроков`);
      const info = await db.prepare('SELECT mintro FROM cinfo WHERE club = ?').bind(c.id).first();
      const t = ((await db.prepare('SELECT trophies FROM ustats WHERE id = ?').bind(uid).first()) || {}).trophies || 0;
      if (info && info.mintro > t) return err(`Нужно ${info.mintro} 🏆 — у тебя ${t}`);
      await leave();
      await db.prepare('INSERT INTO cmembers (id, club, joined) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET club = ?2, joined = ?3').bind(uid, c.id, now).run();
      await say(c.id, 'sys', `${await nickOf(uid)} вступил в клуб`);
    }
  } else if (body.act === 'leave') await leave();
  else if (body.act === 'poll') {
    // лёгкое обновление чата: только новые сообщения и открытые запросы
    const m = await mine(); if (!m) return { ok: true, club: null };
    const chat = (await db.prepare(`SELECT h.id, h.uid, h.ts, h.kind, h.text, h.meta, u.nick, u.emoji FROM cchat h LEFT JOIN users u ON u.id = h.uid WHERE h.club = ? AND h.id > ? ORDER BY h.id LIMIT 40`).bind(m.club, Number(body.after) || 0).all()).results;
    const reqs = (await db.prepare('SELECT id, uid, card, rar, need, got, ts FROM creq WHERE club = ? AND ts > ? AND got < need').bind(m.club, now - 24 * 3600e3).all()).results;
    const battles = (await db.prepare('SELECT game, code, uid FROM croom WHERE club = ? AND ts > ?').bind(m.club, now - 45000).all()).results;
    const gifts = (await db.prepare('SELECT id, card, frm FROM cgift WHERE uid = ? AND done = 0 LIMIT 40').bind(uid).all()).results;
    const profiles = await socialHandles(env, chat.map(h => h.uid));
    return { ok: true, poll: true, battles, gifts: gifts.map(g => ({ id:g.id, card:g.card, from:g.frm })), chat: chat.map((h) => ({ id: h.id, uid: h.uid, ts: h.ts, kind: h.kind, text: h.text || '', meta: h.meta ? JSON.parse(h.meta) : null, profile: profiles[h.uid], nick: h.nick || 'Игрок', emoji: h.emoji || '⚽', me: h.uid === uid })),
      reqs: reqs.map((r) => ({ id: r.id, uid: r.uid, card: r.card, rar: r.rar, need: r.need, got: r.got, ts: r.ts, me: r.uid === uid })) };
  } else if (body.act !== 'get') {
    const m = await mine(); if (!m) return err('Ты не в клубе');
    if (body.act === 'say') {
      const text = String(body.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200); if (!text) return err('Пустое сообщение');
      const last = await db.prepare('SELECT ts FROM cchat WHERE uid = ? AND kind = ? ORDER BY id DESC LIMIT 1').bind(uid, 'msg').first();
      if (last && now - last.ts < 1500) return err('Не так быстро');
      await say(m.club, 'msg', text);
    } else if (body.act === 'battle') {
      // вызов на товарищеский матч: в чате появляется кнопка «Принять» с кодом комнаты
      const game = ['duel', 'xdraft', 'squad', 'trumps'].includes(body.game) ? body.game : 'duel';
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (code.length !== 5) return err('bad code');
      await db.prepare('INSERT INTO croom (uid, club, game, code, ts) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(uid) DO UPDATE SET club = ?2, game = ?3, code = ?4, ts = ?5').bind(uid, m.club, game, code, now).run();
      await say(m.club, 'battle', null, { game, code });
    } else if (body.act === 'req') {
      const rar = Object.keys(REQ_NEED).includes(body.rar) ? body.rar : null, card = String(body.card || '').slice(0, 80);
      if (!rar || !card) return err('Эту карточку запросить нельзя');
      const last = await db.prepare('SELECT ts FROM creq WHERE uid = ? ORDER BY ts DESC LIMIT 1').bind(uid).first();
      if (last && now - last.ts < REQ_EVERY) return err('Новый запрос — через ' + Math.ceil((last.ts + REQ_EVERY - now) / 3600e3) + ' ч');
      const made = await db.prepare('INSERT INTO creq (club, uid, card, rar, need, got, ts) VALUES (?, ?, ?, ?, ?, 0, ?)').bind(m.club, uid, card, rar, REQ_NEED[rar], now).run();
      await say(m.club, 'req', null, { card, rar, requestId: made.meta.last_row_id });
    } else if (body.act === 'don') {
      const r = await db.prepare('SELECT id, club, uid, card, rar, need, got, ts FROM creq WHERE id = ?').bind(Number(body.id) || 0).first();
      if (!r || r.club !== m.club) return err('Запрос не найден');
      if (r.uid === uid) return err('Себе дарить нельзя');
      if (r.got >= r.need) return err('Уже собрали');
      if (r.ts <= now - 24 * 3600e3) return err('Запрос истёк');
      const wk = weekKey(now);
      const sent = await db.batch([
        db.prepare('INSERT INTO cgift (uid, card, frm, ts) SELECT ?, ?, ?, ? FROM creq WHERE id = ? AND got < need AND ts > ?').bind(r.uid, r.card, await nickOf(uid), now, r.id, now - 24 * 3600e3),
        db.prepare('UPDATE creq SET got = got + 1 WHERE id = ? AND changes() > 0').bind(r.id),
        db.prepare('INSERT INTO cdon (id, week, n) SELECT ?1, ?2, 1 WHERE changes() > 0 ON CONFLICT(id, week) DO UPDATE SET n = n + 1').bind(uid, wk),
      ]);
      if (!sent[0].meta.changes) return err('Запрос уже закрыт');
      return { ok: true, donated: { card: r.card, rar: r.rar } };
    } else if (['promote', 'demote', 'kick'].includes(body.act)) {
      const t = await db.prepare('SELECT m.id, c.owner, COALESCE(r.role, 0) AS role FROM cmembers m JOIN clubs c ON c.id = m.club LEFT JOIN crole r ON r.id = m.id WHERE m.id = ? AND m.club = ?').bind(Number(body.uid) || 0, m.club).first();
      if (!t || t.id === uid) return err('Игрок не найден');
      const tr = t.owner === t.id ? 3 : Math.min(2, t.role), tn = await nickOf(t.id);
      const NAMES = ['игрок', 'капитан', 'вице-президент', 'президент'];
      if (m.role <= tr || m.role < 1) return err('Недостаточно прав');
      if (body.act === 'kick') {
        await db.batch([db.prepare('DELETE FROM cmembers WHERE id = ?').bind(t.id), db.prepare('DELETE FROM crole WHERE id = ?').bind(t.id)]);
        await say(m.club, 'sys', `${tn} исключён из клуба`);
      } else if (body.act === 'promote') {
        if (m.role < 2) return err('Повышать могут президент и вице-президенты');
        if (tr + 1 >= m.role && m.role < 3) return err('Недостаточно прав');
        if (tr === 2) { // президент передаёт клуб
          await db.batch([db.prepare('UPDATE clubs SET owner = ? WHERE id = ?').bind(t.id, m.club), db.prepare('DELETE FROM crole WHERE id = ?').bind(t.id),
            db.prepare('INSERT INTO crole (id, role) VALUES (?1, 2) ON CONFLICT(id) DO UPDATE SET role = 2').bind(uid)]);
          await say(m.club, 'sys', `${tn} — новый президент клуба`);
        } else {
          await db.prepare('INSERT INTO crole (id, role) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET role = ?2').bind(t.id, tr + 1).run();
          await say(m.club, 'sys', `${tn} повышен: теперь ${NAMES[tr + 1]}`);
        }
      } else {
        if (tr === 0) return err('Ниже некуда');
        if (m.role < 2) return err('Понижать могут президент и вице-президенты');
        await db.prepare('INSERT INTO crole (id, role) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET role = ?2').bind(t.id, tr - 1).run();
        await say(m.club, 'sys', `${tn} понижен: теперь ${NAMES[tr - 1]}`);
      }
    } else if (body.act === 'settings') {
      if (m.role < 2) return err('Настройки меняют президент и вице-президенты');
      const descr = clean(body.descr, 120), mintro = Math.max(0, Math.min(5000, Math.floor(Number(body.mintro) || 0)));
      await db.prepare('INSERT INTO cinfo (club, descr, mintro) VALUES (?1, ?2, ?3) ON CONFLICT(club) DO UPDATE SET descr = ?2, mintro = ?3').bind(m.club, descr, mintro).run();
      if (body.emoji) await db.prepare('UPDATE clubs SET emoji = ? WHERE id = ?').bind(clean(body.emoji, 4) || '⚽', m.club).run();
      await say(m.club, 'sys', 'Настройки клуба обновлены');
    } else return err('unknown');
  }
  return { ok: true, ...(await clubInfo(db, uid, body.giftProtocol === 1, env)) };
}

// ---------- активность онлайн и число игроков по режимам ----------
let presenceMem = null;
const resetPresenceCache = () => { presenceMem = null; }; // для тестов
async function onlinePresence(env, user, body) {
  const db = env.DB, now = Date.now();
  await schema(db);
  // пересчёт «в сети» читает всех онлайн: делаем его раз в минуту, а вход/выход/смену режима учитываем в кэше на ±1
  const adjust = (old, game) => {
    if (!presenceMem) return;
    const v = presenceMem.v, live = old && now - old.ts < 300000;
    if (live) { if (old.game in v.modes) v.modes[old.game] = Math.max(0, v.modes[old.game] - 1); if (!game) v.total = Math.max(0, v.total - 1); } else if (game) v.total++;
    if (game && game in v.modes) v.modes[game]++;
  };
  if (body.act === 'leave') {
    const old = await db.prepare('SELECT game, ts FROM presence WHERE id = ?').bind(user.id).first();
    if (old) { adjust(old, null); await db.prepare('DELETE FROM presence WHERE id = ?').bind(user.id).run(); }
  }
  else if (body.act === 'heartbeat') {
    const game = ['duel', 'xdraft', 'trumps'].includes(body.game) ? body.game : 'hub';
    const old = await db.prepare('SELECT game, ts FROM presence WHERE id = ?').bind(user.id).first();
    // Enforce the write budget on the server too: old clients still send every 20s.
    if (!old || now - old.ts >= 110000 || (old.game !== game && now - old.ts >= 20000)) {
      if (!old || now - old.ts >= 300000 || old.game !== game) adjust(old, game);
      await db.prepare("INSERT INTO presence (id, game, ts) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET game = ?2, ts = ?3 WHERE presence.ts <= ?3 - 110000 OR (presence.game != ?2 AND presence.ts <= ?3 - 20000)").bind(user.id, game, now).run();
    }
  }
  // счётчик «в сети» общий для всех: пересчитываем не чаще раза в минуту на копию воркера (иначе каждый пинг читает всех онлайн)
  if (presenceMem && now - presenceMem.ts < 60000) return presenceMem.v;
  const rows = (await db.prepare('SELECT game, COUNT(*) AS n FROM presence WHERE ts >= ? GROUP BY game').bind(now - 300000).all()).results || [];
  const modes = { duel: 0, xdraft: 0, trumps: 0 };
  let total = 0;
  rows.forEach((r) => { const n = Number(r.n) || 0; total += n; if (Object.prototype.hasOwnProperty.call(modes, r.game)) modes[r.game] = n; });
  presenceMem = { ts: now, v: { ok: true, total, modes, ttl: 300 } };
  return presenceMem.v;
}

// ---------- один турнир на состав драфта: попытка и награда хранятся по Telegram ID ----------
async function draftTour(env, user, body) {
  const db = env.DB, uid = user.id, now = Date.now();
  await schema(db);
  const act = String(body.act || '');
  if (act === 'start') {
    const players = Array.isArray(body.players) ? body.players.map((n) => clean(n, 60)).filter(Boolean) : [];
    if (players.length !== 11 || new Set(players).size !== 11) return { ok: false, error: 'Нужен полный состав из 11 игроков' };
    const roster = [...players].sort().join('\n');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(roster)));
    const fingerprint = [...digest].map((x) => x.toString(16).padStart(2, '0')).join('');
    const state = typeof body.state === 'string' && body.state.length <= 12000 ? body.state : '{}';
    await db.prepare("INSERT OR IGNORE INTO draft_tours (uid, roster, state, status, created, updated) VALUES (?1, ?2, ?3, 'active', ?4, ?4)").bind(uid, fingerprint, state, now).run();
    const row = await db.prepare('SELECT attempt, state, status, claimed FROM draft_tours WHERE uid = ? AND roster = ?').bind(uid, fingerprint).first();
    let saved = {}; try { saved = JSON.parse(row.state); } catch (e) { /* пустое сохранение */ }
    return { ok: true, attempt: row.attempt, state: saved, locked: row.status === 'done', claimed: !!row.claimed, resumed: true };
  }
  const attempt = Math.max(0, Math.floor(Number(body.attempt) || 0));
  if (!attempt) return { ok: false, error: 'Попытка не найдена' };
  const row = await db.prepare('SELECT attempt, state, status, claimed FROM draft_tours WHERE attempt = ? AND uid = ?').bind(attempt, uid).first();
  if (!row) return { ok: false, error: 'Попытка не найдена' };
  if (act === 'claim') {
    if (row.status !== 'done') return { ok: false, error: 'Сначала заверши турнир' };
    const result = await db.prepare('UPDATE draft_tours SET claimed = 1, updated = ? WHERE attempt = ? AND uid = ? AND status = \'done\' AND claimed = 0').bind(now, attempt, uid).run();
    return result.meta.changes ? { ok: true, granted: true } : { ok: true, granted: false, already: true };
  }
  if (act === 'sync') {
    const state = typeof body.state === 'string' && body.state.length <= 12000 ? body.state : null;
    if (!state) return { ok: false, error: 'Сохранение турнира слишком большое' };
    let parsed = {}; try { parsed = JSON.parse(state); } catch (e) { return { ok: false, error: 'bad state' }; }
    // результаты матчей только дописываются: старые не меняются, максимум 4 матча, завершённый турнир не меняется.
    // По этим записям сервер считает задания испытаний, поэтому переписать прошлое нельзя.
    // (Несколько новых за раз допускаем: если прошлое сохранение не дошло, турнир не должен застрять.)
    let prev = {}; try { prev = JSON.parse(row.state); } catch (e) { /* пустое сохранение */ }
    const was = Array.isArray(prev.res) ? prev.res : [], now_ = Array.isArray(parsed.res) ? parsed.res : [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (now_.length > 4 || now_.length < was.length || was.some((r, i) => !same(r, now_[i])) || (row.status === 'done' && now_.length !== was.length)) {
      return { ok: false, error: 'Сохранение турнира не совпадает с сервером', state: prev, done: row.status === 'done', claimed: !!row.claimed };
    }
    const done = parsed && parsed.over ? 'done' : 'active';
    await db.prepare("UPDATE draft_tours SET state = ?1, status = CASE WHEN status = 'done' THEN 'done' ELSE ?2 END, updated = ?3 WHERE attempt = ?4 AND uid = ?5").bind(state, done, now, attempt, uid).run();
    const updated = await db.prepare('SELECT state, status, claimed FROM draft_tours WHERE attempt = ? AND uid = ?').bind(attempt, uid).first();
    let saved = {}; try { saved = JSON.parse(updated.state); } catch (e) { /* пустое сохранение */ }
    return { ok: true, state: saved, done: updated.status === 'done', claimed: !!updated.claimed };
  }
  return { ok: false, error: 'unknown action' };
}

// ---------- «Забытые легенды»: испытание за карточку (выдача только сервером, один раз) ----------
// Открыто всем; FL_ENABLED=0 выключает, «admins» — только админам; FL_TESTERS — отдельные Telegram ID. Прогресс считается по серверным записям:
// матчи и победы — из попыток турниров драфта (draft_tours, результаты только дописываются),
// «7 итальянцев» — по составу, присланному при завершении драфта, и серверному списку итальянцев пула драфта.
// Ограничение: сами матчи и подбор игроков драфта идут на устройстве — сервер их не переигрывает.
const FL = { card: 'FL:mario-balotelli', matches: 10, wins: 5, italians: 7, start: Date.parse('2026-10-13T00:00:00Z') };
// Все итальянцы базы (PLAYERS, nat «Италия») и кумиры-итальянцы: пул драфта на телефоне шире, чем без фото. Сверяется тестом tests/forgotten-legends.test.js.
const FL_ITALY = new Set(["Алберто Бриньоли", "Алберто Доссена", "Алберто Палеари", "Алекс Мерет", "Алессандро Бастони", "Алессандро Бианко", "Алессандро Буонджорно", "Алессандро Вольиакко", "Алессандро Деиола", "Алессандро ди Пардо", "Алессандро Маркандалли", "Алессандро Неста", "Алессандро Цаноли", "Алессио Романьоли", "Алессио Цербин", "Андреа Адоранте", "Андреа Гион", "Андреа Камбьязо", "Андреа Карбони", "Андреа Кольпани", "Андреа Петаньа", "Андреа Пинамонти", "Андреа Пирло", "Андреа Францони", "Андреа Фулиньати", "Анс Николусси Кавильиа", "Антонино Галло", "Антонио Каракчоло", "Антонио Палумбо", "Антонио Раимондо", "Армандо Иццо", "Брайан Кристанте", "Вилфриэд Ньонто", "Винченцо Грифо", "Владимиро Фальконе", "Габриэле Бракальиа", "Габриэле Цаппа", "Гаэтано Ористанио", "Гульельмо Викарио", "Давиде Адорни", "Давиде Бартесаги", "Давиде Дзаппакоста", "Давиде Калабрия", "Давиде Фраттези", "Данило Катальди", "Даниэле Гиларди", "Даниэле Касираги", "Даниэле Ругани", "Даниэль Малдини", "Дестини Удоджи", "Джакомо Кало", "Джакомо Квальиата", "Джакомо Распадори", "Джанджакомо Маньани", "Джанлуиджи Буффон", "Джанлуиджи Доннарумма", "Джанлука Гаэтано", "Джанлука Капрари", "Джанлука Манчини", "Джанлука Скамакка", "Дженнаро Гаттузо", "Дженнаро Тутино", "Джованни Ди Лоренцо", "Джованни Леони", "Джованни Фаббиан", "Джорджо Кьеллини", "Джорджо Скальвини", "Джусеппе Касо", "Джусеппе Леоне", "Джусеппе Пеццелла", "Димитри Бисоли", "Диэго Коппола", "Доменико Берарди", "Иван Проведел", "Иларио Монтериси", "Йакопо Петрикчоне", "Йакопо Сегре", "Йакопо Фаццини", "Йури Чисотти", "Кевин Ласаньа", "Кер Ндоур", "Кристиано Бираги", "Леонардо Бонуччи", "Леонардо Спинаццола", "Лоренцо Аматукчи", "Лоренцо Бернаскони", "Лоренцо Инсинье", "Лоренцо Коломбо", "Лоренцо Лукка", "Лоренцо Монтипо", "Лоренцо Пеллегрини", "Лоренцо Пирола", "Луис Фелипе", "Лука Колеосо", "Лука Маццителли", "Лука Пеллегрини", "Лука Раванелли", "Лука Раниэри", "Лука Цанимаккиа", "Майкл Фолорунсо", "Мануэл Лаццари", "Мануэль Локателли", "Марко Беллик", "Марко Брешианини", "Марко Варниэр", "Марко Д’Алессандро", "Марко Карнезекки", "Марко Палестра", "Марко Ругджеро", "Марко Спортьелло", "Матео Ретеги", "Маттео Бианкетти", "Маттео Брунори", "Маттео Габбия", "Маттео Канчеллиэри", "Маттео Ловато", "Маттео Пессина", "Маттео Политано", "Маттео Прати", "Маттео Руджери", "Маттео Трамони", "Маттиа Бани", "Маттиа Вити", "Маттиа Дзаккальи", "Маттиа Перин", "Маттиа Феличи", "Маттиа Цанотти", "Микаэль Кайоде", "Микеле Ди Грегорио", "Микеле Коллоколо", "Мирко Пильиачелли", "Мойзе Кин", "Мохамед Али Цома", "Надир Цортеа", "Никколо Писилли", "Никколо Пиэроцци", "Никола Леали", "Николас Пиэрини", "Николо Барелла", "Николо Бертола", "Николо Дзаньоло", "Николо Камбьяги", "Николо Касале", "Николо Ровелла", "Николо Савона", "Николо Фаджоли", "Онест Аанор", "Пасквале Маццокки", "Патрик Кутроне", "Патрик Чурриа", "Пиэрлуиджи Голлини", "Пиэтро Иэммелло", "Пиэтро Комуццо", "Пиэтро Чеккарони", "Пьетро Терраччано", "Раул Белланова", "Ренато Марин", "Риккардо Калафьори", "Риккардо Орсолини", "Риккардо Соттил", "Риккардо Чиэрво", "Рияд Идрисси", "Роберто Пикколи", "Роландо Мандрагора", "Салваторе Молина", "Салваторе Элиа", "Салваторе Эспосито", "Самуэле Ангори", "Самуэле Биринделли", "Самуэле Иначо", "Самуэле Мулаттиэри", "Самуэле Риччи", "Сандро Тонали", "Себастиано Деспланкес", "Себастиано Луперто", "Себастьяно Эспозито", "Симоне Д’Уффици", "Симоне Канестрелли", "Симоне Коломби", "Симоне Пафунди", "Симоне Понтиссо", "Симоне Санторо", "Симоне Скуффет", "Симоне Цанон", "Стефано ди Марио", "Стефано Морео", "Стефано Сабелли", "Стефано Турати", "Томмасо Ауджелло", "Томмасо Балданци", "Томмасо Барбиэри", "Томмасо Биаши", "Томмасо Мартинелли", "Томмасо Побега", "Фабиано Париси", "Фабио Киародиа", "Фабио Миретти", "Фабрицио Бриньани", "Федерико Баскиротто", "Федерико Бернардески", "Федерико Бонаццоли", "Федерико Бонини", "Федерико Гатти", "Федерико ди Франческо", "Федерико Димарко", "Федерико Кьеза", "Федерико Равальиа", "Филиппо Делли Карри", "Филиппо Индзаги", "Филиппо Питтарелло", "Филиппо Раноккиа", "Филиппо Терракчано", "Франческо Барди", "Франческо ди Мариано", "Франческо Пио Эспозито", "Франческо Цампано", "Чесаре Касадеи", "Эдоардо Бове", "Эдоардо Голданига", "Элиа Каприле", "Эмануэл Виньато", "Эмануэле Валери", "Эмерсон Палмьери", "Энрико Делпрато", "Янник Бригт"]);
async function flStatus(db, uid, start) {
  const rows = (await db.prepare('SELECT state FROM draft_tours WHERE uid = ? AND created >= ?').bind(uid, start).all()).results || [];
  let matches = 0, wins = 0;
  rows.forEach((r) => {
    let st = {}; try { st = JSON.parse(r.state); } catch (e) { return; }
    const res = Array.isArray(st.res) ? st.res.slice(0, 4) : [];
    matches += res.length; wins += res.filter((x) => x && x.win === true).length;
  });
  const ita = await db.prepare("SELECT created FROM legend_marks WHERE uid = ? AND mark = 'fl:italians'").bind(uid).first();
  const got = await db.prepare('SELECT created FROM legend_claims WHERE uid = ? AND card = ?').bind(uid, FL.card).first();
  const tasks = { matches: Math.min(matches, FL.matches), wins: Math.min(wins, FL.wins), italians: ita ? 1 : 0 };
  const done = tasks.matches >= FL.matches && tasks.wins >= FL.wins && tasks.italians === 1;
  return { card: FL.card, need: { matches: FL.matches, wins: FL.wins, italians: FL.italians }, tasks, done, claimed: !!got };
}
async function legends(env, user, body) {
  // Испытание открыто всем (запуск 13.10.2026). FL_ENABLED: не задана или «1» — всем; «0»/«off» — выключено (кроме FL_TESTERS);
  // «admins» — только админам игры. FL_TESTERS — список Telegram ID через запятую, им открыто всегда.
  const mode = String(env.FL_ENABLED ?? '').trim(), testers = String(env.FL_TESTERS || '').split(/[\s,]+/).filter(Boolean).map(Number);
  const on = mode === '' || mode === '1' || testers.includes(Number(user.id)) || (mode === 'admins' && (await isAdminId(env, user.id)));
  if (!on) return { ok: false, disabled: true, error: 'Испытание ещё не включено' };
  const db = env.DB, uid = user.id, now = Date.now();
  await schema(db);
  const start = Number(env.FL_START) || FL.start;
  const act = String(body.act || 'status');
  if (act === 'draft') {
    // завершённый драфт: считаем только стартовые 11, запасные не присылаются
    const players = Array.isArray(body.players) ? body.players.map((n) => clean(n, 60)).filter(Boolean) : [];
    if (players.length !== 11 || new Set(players).size !== 11) return { ok: false, error: 'Нужен полный стартовый состав' };
    const n = players.filter((x) => FL_ITALY.has(x)).length;
    if (n >= FL.italians) await db.prepare("INSERT OR IGNORE INTO legend_marks (uid, mark, created) VALUES (?, 'fl:italians', ?)").bind(uid, now).run();
    return { ok: true, italians: n, ...(await flStatus(db, uid, start)) };
  }
  if (act === 'claim') {
    const st = await flStatus(db, uid, start);
    if (st.claimed) return { ok: true, granted: false, already: true, ...st };
    if (!st.done) return { ok: false, error: 'Задания ещё не выполнены', ...st };
    const r = await db.prepare('INSERT OR IGNORE INTO legend_claims (uid, card, created) VALUES (?, ?, ?)').bind(uid, FL.card, now).run();
    return { ok: true, granted: !!r.meta.changes, already: !r.meta.changes, ...st, claimed: true };
  }
  return { ok: true, ...(await flStatus(db, uid, start)) };
}

// ---------- онлайн: подбор случайного соперника для дуэли ----------
// Первый ждёт (держит комнату PeerJS со своим кодом), второй получает его код и подключается сам.
async function matchmake(env, user, body) {
  const db = env.DB, uid = user.id, now = Date.now();
  await schema(db);
  const game = ['duel', 'xdraft', 'trumps'].includes(body.game) ? body.game : 'duel';
  // устаревшие ожидающие этого режима — по индексу mmg_wait (читаются только они); остальное убирает почасовой cron
  await db.prepare('DELETE FROM mmg WHERE game = ? AND paired IS NULL AND ts < ?').bind(game, now - 30000).run();
  if (body.act === 'cancel') { await db.prepare('DELETE FROM mmg WHERE id = ?').bind(uid).run(); return { ok: true }; }
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (code.length !== 5) return { ok: false, error: 'bad code' };
  // меня уже нашли — второй игрок подключается по моему коду, просто ждём
  const me = await db.prepare('SELECT paired, ts FROM mmg WHERE id = ?').bind(uid).first();
  // свежая отметка «соперник найден» — ждём его; старая (>30 с, соперник не пришёл) — ищем заново, строку перезапишет INSERT ниже
  if (me && me.paired && now - me.ts < 30000) return { ok: true, role: 'host', paired: true };
  // кто-то ещё ждёт в этом режиме: подключаемся к тому, кто ждёт дольше
  const other = await db.prepare('SELECT id, code, nick, emo FROM mmg WHERE game = ? AND paired IS NULL AND id != ? ORDER BY ts ASC LIMIT 1').bind(game, uid).first();
  if (other) {
    // Atomically claim the host: concurrent guests must not both join the same waiting player.
    const claimed = await db.prepare('UPDATE mmg SET paired = ? WHERE id = ? AND game = ? AND paired IS NULL AND ts > ?').bind(uid, other.id, game, now - 30000).run();
    if (claimed.meta?.changes === 1) {
      await db.prepare('DELETE FROM mmg WHERE id = ?').bind(uid).run();
      await db.prepare("INSERT INTO settings (k, v) VALUES (?1, '1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1").bind('mm:' + dayKey(now)).run();
      return { ok: true, role: 'join', code: other.code, nick: other.nick, emo: other.emo };
    }
  }
  await db.prepare('INSERT INTO mmg (id, game, code, nick, emo, ts, paired) VALUES (?1, ?6, ?2, ?3, ?4, ?5, NULL) ON CONFLICT(id) DO UPDATE SET game = ?6, code = ?2, nick = ?3, emo = ?4, ts = ?5, paired = NULL WHERE ts < ?5 - 20000 OR code != ?2 OR game != ?6')
    .bind(uid, code, clean(body.nick, 16), clean(body.emo, 4), now, game).run();
  const waiting = (await db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM mmg WHERE game = ? AND paired IS NULL LIMIT 20)').bind(game).first()).n; // для подписи «ищут: N» хватит до 20
  return { ok: true, role: 'host', paired: false, waiting };
}

// ---------- онлайн: пересылка ходов через сервер (вместо прямого соединения телефонов) ----------
// Комната на двоих: хозяин создаёт (open), гость входит (join). Сообщения пачками (send), получение — «долгий» опрос (poll):
// запрос ждёт до ~8 с, пока не придут новые сообщения или не изменится состав комнаты. Соперник пропал — нет опросов 25 с.
const ROOM_TTL = 2 * 3600e3, ROOM_GONE = 25000; // опрос держит запрос до 8 с, проверяя новые сообщения раз в 0,9 с
const roomId = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
// Уборка онлайна раз в час без перебора таблиц. Сообщения — по «водяному знаку»: запоминаем MAX(id) каждый час;
// всё, что не новее знака двухчасовой давности, старше любой живой комнаты (комната живёт ROOM_TTL) — удаляем диапазоном
// по первичному ключу. Так уходят и «осиротевшие» сообщения без строки в rooms. Комнаты — по индексу rooms_created.
async function cleanRelay(db, now = Date.now()) {
  let marks = []; try { marks = JSON.parse((await getSetting(db, 'rmsg:marks')) || '[]'); } catch (e) { marks = []; }
  const top = await db.prepare('SELECT MAX(id) AS id FROM rmsg').first();
  const old = marks.filter((m) => m.t <= now - ROOM_TTL).pop();
  if (old) await db.prepare('DELETE FROM rmsg WHERE id <= ?').bind(old.id).run();
  marks = marks.filter((m) => m.t > now - ROOM_TTL).concat(top && top.id ? [{ t: now, id: top.id }] : []).slice(-6);
  await setSetting(db, 'rmsg:marks', JSON.stringify(marks));
  await db.prepare('DELETE FROM rooms WHERE created < ?').bind(now - ROOM_TTL).run();
}
async function relay(env, user, body) {
  const db = env.DB, uid = Number(user.id), now = Date.now();
  await schema(db);
  const room = roomId(body.room), act = String(body.act || '');
  if (room.length < 5) return { ok: false, error: 'bad room' };
  let r = await db.prepare('SELECT * FROM rooms WHERE room = ?').bind(room).first();
  if (act === 'open') {
    // код занят живой комнатой другого игрока — пусть клиент возьмёт другой
    if (r && !r.closed && r.host !== uid && now - Math.max(r.seen0, r.seen1 || 0) < ROOM_GONE) return { ok: false, error: 'taken' };
    await db.batch([
      db.prepare('DELETE FROM rmsg WHERE room = ?').bind(room),
      db.prepare('INSERT INTO rooms (room, host, guest, created, seen0, seen1, closed) VALUES (?1, ?2, NULL, ?3, ?3, NULL, NULL) ON CONFLICT(room) DO UPDATE SET host = ?2, guest = NULL, created = ?3, seen0 = ?3, seen1 = NULL, closed = NULL').bind(room, uid, now),
    ]);
    return { ok: true, side: 0 };
  }
  if (!r || r.closed || now - r.created > ROOM_TTL) return { ok: false, error: 'not found' };
  if (act === 'join') {
    if (r.host === uid) return { ok: false, error: 'own room' };
    if (now - r.seen0 > ROOM_GONE) return { ok: false, error: 'not found' };
    if (r.guest && r.guest !== uid && now - (r.seen1 || 0) < ROOM_GONE) return { ok: false, error: 'full' };
    const j = await db.prepare('UPDATE rooms SET guest = ?, seen1 = ? WHERE room = ? AND (guest IS NULL OR guest = ? OR seen1 < ?)').bind(uid, now, room, uid, now - ROOM_GONE).run();
    if (!j.meta || j.meta.changes !== 1) return { ok: false, error: 'full' };
    return { ok: true, side: 1 };
  }
  const side = r.host === uid ? 0 : r.guest === uid ? 1 : -1;
  if (side < 0) return { ok: false, error: 'not in room' };
  if (act === 'profile') { const profiles = await socialHandles(env, [side ? r.host : r.guest]); return { ok: true, profile: profiles[side ? r.host : r.guest] || null }; }
  const seenCol = side ? 'seen1' : 'seen0';
  if (act === 'leave') {
    await db.prepare('UPDATE rooms SET closed = ? WHERE room = ?').bind(now, room).run();
    return { ok: true };
  }
  if (act === 'send') {
    const msgs = Array.isArray(body.msgs) ? body.msgs.slice(0, 40) : [];
    const text = JSON.stringify(msgs);
    if (!msgs.length) return { ok: true };
    if (text.length > 60000) return { ok: false, error: 'too big' };
    await db.prepare('INSERT INTO rmsg (room, side, body, ts) VALUES (?, ?, ?, ?)').bind(room, side, text, now).run();
    return { ok: true };
  }
  if (act === 'poll') {
    const after = Math.max(0, Number(body.after) || 0), until = now + Math.min(8000, Math.max(0, Number(body.wait) || 0));
    await db.prepare(`UPDATE rooms SET ${seenCol} = ? WHERE room = ? AND (${seenCol} IS NULL OR ${seenCol} < ?)`).bind(now, room, now - 10000).run();
    const hadGuest = !!r.guest; let spin = 0;
    for (;;) {
      const rows = side === 0 && !r.guest ? [] : (await db.prepare('SELECT id, body FROM rmsg WHERE room = ? AND side = ? AND id > ? ORDER BY id LIMIT 30').bind(room, 1 - side, after).all()).results || [];
      const t = Date.now();
      const otherSeen = side ? r.seen0 : r.seen1;
      const gone = !!r.closed || (side === 1 || r.guest ? t - (otherSeen || 0) > ROOM_GONE : false);
      if (rows.length || gone || (side === 0 && !hadGuest && r.guest) || t >= until) {
        const msgs = []; let last = after;
        rows.forEach((x) => { last = x.id; try { msgs.push(...JSON.parse(x.body)); } catch (e) { /* битая запись */ } });
        return { ok: true, after: last, msgs, guest: !!r.guest, gone };
      }
      await new Promise((res) => setTimeout(res, 900));
      if (++spin % 3 === 0 || (side === 0 && !hadGuest)) { // состав комнаты меняется редко — перечитываем раз в ~3 с (хозяин без гостя — каждый раз)
        r = await db.prepare('SELECT * FROM rooms WHERE room = ?').bind(room).first();
        if (!r) return { ok: true, after, msgs: [], gone: true };
      }
    }
  }
  return { ok: false, error: 'bad act' };
}

// ---------- магазин за звёзды ----------
// Цены и что выдаётся — одинаковые здесь и в js/shopstars.js
async function recordPurchase(db, uid, item, n, payment) {
  const ts = Date.now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO payment_receipts (charge, id, item, purchase, stars, ts) VALUES (?, ?, ?, ?, ?, ?)').bind(payment.telegram_payment_charge_id, uid, item, n, payment.total_amount, ts),
    db.prepare('INSERT OR IGNORE INTO purchases (id, item, season, stars, ts) VALUES (?, ?, ?, ?, ?)').bind(uid, item, n, payment.total_amount, ts),
  ]);
}
function validPayment(payment, uid) {
  let p; try { p = JSON.parse(payment.invoice_payload); } catch (_) { return false; }
  if (!p || payment.currency !== 'XTR') return false;
  if (p.item === 'pass') return p.uid === uid && Number.isInteger(p.season) && p.season >= 1 && p.season <= 999 && payment.total_amount === PASS_STARS;
  if (Object.prototype.hasOwnProperty.call(SHOP, p.item)) return p.uid === uid && Number.isSafeInteger(p.n) && p.n > 0 && payment.total_amount === SHOP[p.item].stars;
  return !p.item && ALLOWED.includes(p.stars) && payment.total_amount === p.stars;
}
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
  if ((await getSetting(db, 'broadcast:enabled')) !== '1') return 'рассылки отключены';
  if (h !== 18) return 'не время';
  if ((await getSetting(db, 'remind')) === today) return 'уже';
  await setSetting(db, 'remind', today);
  const list = (await db.prepare(`SELECT s.id, COALESCE(t.trophies, 0) AS tro FROM seen s LEFT JOIN prefs p ON p.id = s.id LEFT JOIN ustats t ON t.id = s.id
    WHERE s.writable = 1 AND s.last > ?1 AND s.lastday != ?2 AND COALESCE(p.remind, 1) = 1 AND COALESCE(p.reminded, '') != ?2 LIMIT 3000`).bind(now - 14 * 864e5, today).all()).results;
  let sent = 0, processed = 0;
  for (const r of list) {
    if (processed++ % 10 === 0 && (await getSetting(db, 'broadcast:enabled')) !== '1') break;
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
  if (url.pathname === '/presence' && request.method === 'GET') {
    if (!env.DB) return json({ ok: false, error: 'no database' }, 500);
    return json(await onlinePresence(env, null, { act: 'counts' }));
  }
  if (['/score', '/top', '/hello', '/event', '/report', '/admin/stats', '/club', '/mm', '/presence', '/tour', '/save', '/load', '/legend', '/room', '/social'].includes(url.pathname) && request.method === 'POST') {
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
    if (url.pathname === '/presence') return json(await onlinePresence(env, user, body));
    if (url.pathname === '/tour') return json(await draftTour(env, user, body));
    if (url.pathname === '/legend') return json(await legends(env, user, body));
    if (url.pathname === '/room') return json(await relay(env, user, body));
    if (url.pathname === '/social') return json(await social(env, user, body));
    if (url.pathname === '/save') return json(await saveData(env, user, body));
    if (url.pathname === '/load') return json(await loadData(env, user));
    if (url.pathname === '/admin/stats') {
      if (!(await isAdminId(env, user.id))) return json({ ok: false, error: 'forbidden' }, 403);
      return json({ ok: true, ...(await stats(env)) });
    }
    const scope = ['week', 'all', 'day', 'friends', 'tro', 'game', 'cup', 'clubs'].includes(body.scope) ? body.scope : 'week';
    return json({ ok: true, ...(await top(env, user, scope, String(body.game || ''))) });
  }

  // Read-only confirmation: the client invoice callback is not proof of payment.
  if (url.pathname === '/shop/purchase' && request.method === 'POST') {
    const body = await request.json();
    const user = await verifyInit(body.initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    if (!env.DB || !SHOP[body.item] || !Number.isSafeInteger(body.n)) return json({ ok: false, error: 'bad purchase' }, 400);
    await schema(env.DB);
    const row = await env.DB.prepare('SELECT season FROM purchases WHERE id = ? AND item = ? AND season = ?').bind(user.id, body.item, body.n).first();
    return json({ ok: true, paid: !!row });
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
    const item = url.searchParams.get('item'), it = SHOP[item], n = Date.now() * 1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
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
    if (!env.WEBHOOK_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    const u = await request.json();
    // Telegram retries timed-out /broadcast updates: claim once before sending any messages.
    if (u.message && /^\/broadcast(?:\s|$)/.test(u.message.text || '')) {
      if (!env.DB || !Number.isSafeInteger(u.update_id)) return new Response('bad broadcast update', { status: 400 });
      await schema(env.DB);
      const claim = await env.DB.prepare('INSERT OR IGNORE INTO tg_broadcast_updates (id, received) VALUES (?1, ?2)').bind(u.update_id, Date.now()).run();
      if (!claim.success) return new Response('broadcast unavailable', { status: 503 });
      if (claim.meta?.changes !== 1) return new Response('ok');
    }
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      let ok = validPayment(q, q.from.id);
      if (ok) {
        const order = JSON.parse(q.invoice_payload);
        if (order.item) {
          if (!env.DB) ok = false;
          else {
            await schema(env.DB);
            const already = await env.DB.prepare('SELECT id FROM purchases WHERE id = ? AND item = ? AND season = ?').bind(q.from.id, order.item, order.item === 'pass' ? order.season : order.n).first();
            if (already) ok = false;
          }
        }
      }
      await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok, ...(ok ? {} : { error_message: 'Счёт недействителен. Открой магазин и создай новый.' }) });
    } else if (u.message && u.message.successful_payment) {
      const p = u.message.successful_payment;
      if (!validPayment(p, u.message.from.id)) return json({ ok: false, error: 'invalid payment' });
      let pl = {}; try { pl = JSON.parse(p.invoice_payload || '{}'); } catch (e) { /* старый формат */ }
      if (pl.item === 'pass' && env.DB) {
        await schema(env.DB);
        await recordPurchase(env.DB, u.message.from.id, 'pass', pl.season, p);
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Премиум-пропуск сезона ${pl.season} открыт ⭐ Забирай награды во вкладке «Награды»!` });
      } else if (SHOP[pl.item] && env.DB) {
        await schema(env.DB);
        await recordPurchase(env.DB, u.message.from.id, pl.item, pl.n, p);
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Покупка «${SHOP[pl.item].title}» прошла ⭐ Открой игру — награда уже ждёт!` });
      } else {
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Спасибо за ${p.total_amount} ⭐! Это очень помогает каналу 🙌` });
      }
    } else if (u.message && /^\/(terms|paysupport|support)\b/.test(u.message.text || '')) {
      await infoCommand(env, u.message);
    } else if (u.message && /^\/(admin|stats|status|stop|broadcast(?:_on|_off)?)\b/.test(u.message.text || '')) {
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
