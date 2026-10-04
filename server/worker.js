// Сервер игр бота @JacksonGamesbot: Cloudflare Worker (бесплатный тариф) + база Cloudflare D1.
//   GET  /invoice?stars=100        — счёт в Telegram Stars для доната;
//   POST /webhook                  — обновления бота: подтверждение оплаты, /start;
//   POST /score                    — игрок присылает свой опыт и результат «Игрока дня»;
//   POST /top                      — таблица лидеров: неделя, всё время, «Игрок дня» сегодня.
// Кто прислал очки, сервер узнаёт по подписи Telegram (initData), подделать чужой результат нельзя.
// Секреты: BOT_TOKEN (токен бота), WEBHOOK_SECRET (любая строка). База: D1, привязка с именем DB.

const ALLOWED = [50, 100, 250, 500, 1000];
const ORIGIN = 'https://komutatorcisco-dot.github.io';
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
  try { const u = JSON.parse(p.get('user')); return u && u.id ? u : null; } catch (e) { return null; }
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
    db.prepare('CREATE INDEX IF NOT EXISTS weekly_xp ON weekly (week, xp)'),
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
  } else {
    rows = (await db.prepare(`SELECT id, nick, emoji, xp AS score FROM users WHERE xp > 0 ORDER BY xp DESC, updated ASC LIMIT ${TOP}`).all()).results;
    total = (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE xp > 0').first()).n;
    const mine = await db.prepare('SELECT xp FROM users WHERE id = ?').bind(id).first();
    if (mine && mine.xp > 0) me = { place: (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE xp > ?').bind(mine.xp).first()).n + 1, score: mine.xp };
  }
  return { rows: rows.map((r) => ({ nick: r.nick, emoji: r.emoji, score: r.score, me: r.id === id })), me, total, weekEnd: weekEnd(now) };
}

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    return cors(new Response(res.body, res), request, env);
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  // ---------- рейтинг ----------
  if ((url.pathname === '/score' || url.pathname === '/top') && request.method === 'POST') {
    if (!env.DB) return json({ ok: false, error: 'no database' }, 500);
    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
    const user = await verifyInit(body.initData, env.BOT_TOKEN);
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    if (url.pathname === '/score') return json({ ok: true, ...(await saveScore(env, user, body)) });
    const scope = ['week', 'all', 'day'].includes(body.scope) ? body.scope : 'week';
    return json({ ok: true, ...(await top(env, user, scope)) });
  }

  // ---------- донат ----------
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
      await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Спасибо за ${p.total_amount} ⭐! Это очень помогает каналу 🙌` });
    } else if (u.message && u.message.text === '/start') {
      await tg(env, 'sendMessage', {
        chat_id: u.message.chat.id, text: 'Футбольные мини-игры канала «Старики Джексоны» ⚽',
        reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: `${ORIGIN}/Games/` } }]] },
      });
    }
    return new Response('ok');
  }
  return new Response('Jackson games worker', { status: 200 });
}
