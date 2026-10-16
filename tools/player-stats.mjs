// Статистика игроков из рабочей базы D1 — ТОЛЬКО ЧТЕНИЕ (SELECT). Новички по дням, кто вернулся на 1-й/3-й/7-й день,
// сколько дней играют, до скольких трофеев доходят, в какие игры играют, во что играют новички в первый день.
// Запуск: GitHub Actions → «Статистика игроков» (секреты CF_API_TOKEN с правом «D1: Read» и CF_ACCOUNT_ID).
const token = (process.env.CF_API_TOKEN || '').trim(), acc = (process.env.CF_ACCOUNT_ID || '').trim();
if (!token || !acc) { console.log('Нет секретов CF_API_TOKEN / CF_ACCOUNT_ID'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const DAYS = Number(process.env.DAYS || 21);
const dbs = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/d1/database`, { headers: H })).json();
if (!dbs.success) { console.log('Список баз недоступен — у токена нет права «D1: Read»:', JSON.stringify(dbs.errors)); process.exit(1); }
const db = dbs.result.find((d) => d.name === (process.env.DB_NAME || 'jackson-games')) || dbs.result.find((d) => !/staging/.test(d.name));
if (!db) { console.log('Рабочая база не найдена:', dbs.result.map((d) => d.name).join(', ')); process.exit(1); }
console.log(`База: ${db.name}`);
async function q(sql, params = []) {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('только чтение');
  const r = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/d1/database/${db.uuid}/query`, { method: 'POST', headers: H, body: JSON.stringify({ sql, params }) })).json();
  if (!r.success) throw new Error(JSON.stringify(r.errors).slice(0, 300));
  return r.result[0].results;
}
const out = [];
const say = (s = '') => { console.log(s); out.push(s); };
const table = (rows, cols) => { if (!rows.length) return say('_нет данных_'); say('| ' + cols.join(' | ') + ' |'); say('|' + cols.map(() => '---').join('|') + '|'); rows.forEach((r) => say('| ' + cols.map((c) => r[c] ?? '').join(' | ') + ' |')); say(); };
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const since = new Date(Date.now() - DAYS * 864e5 + 3 * 3600e3).toISOString().slice(0, 10);

say('# Статистика игроков'); say();
const [tot] = await q('SELECT COUNT(*) AS n, SUM(CASE WHEN days >= 2 THEN 1 ELSE 0 END) AS back, SUM(CASE WHEN days >= 7 THEN 1 ELSE 0 END) AS d7 FROM seen');
say(`Всего игроков: **${tot.n}** · заходили хотя бы 2 разных дня: ${tot.back} (${pct(tot.back, tot.n)}) · 7+ дней: ${tot.d7} (${pct(tot.d7, tot.n)})`); say();

// когорты: первый день — первый визит; вернулся ли на 1-й, 3-й, 7-й день после первого
say(`## Новички и возвраты (с ${since})`);
const coh = await q(`WITH f AS (SELECT id, MIN(day) AS d0 FROM visits GROUP BY id HAVING MIN(day) >= ?1)
  SELECT f.d0 AS day, COUNT(*) AS new,
    SUM(EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day = date(f.d0, '+1 day'))) AS d1,
    SUM(EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day = date(f.d0, '+3 day'))) AS d3,
    SUM(EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day = date(f.d0, '+7 day'))) AS d7,
    SUM(EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day > f.d0)) AS ever
  FROM f GROUP BY f.d0 ORDER BY f.d0`, [since]);
table(coh.map((r) => ({ 'день': r.day, 'новых': r.new, 'вернулись назавтра': `${r.d1} (${pct(r.d1, r.new)})`, 'на 3-й день': `${r.d3} (${pct(r.d3, r.new)})`, 'на 7-й день': `${r.d7} (${pct(r.d7, r.new)})`, 'хоть раз вернулись': `${r.ever} (${pct(r.ever, r.new)})` })),
  ['день', 'новых', 'вернулись назавтра', 'на 3-й день', 'на 7-й день', 'хоть раз вернулись']);

say('## Игроков в день'); const dau = await q('SELECT day, COUNT(*) AS n FROM visits WHERE day >= ?1 GROUP BY day ORDER BY day', [since]);
table(dau.map((r) => ({ 'день': r.day, 'игроков': r.n })), ['день', 'игроков']);

say('## Сколько разных дней играют');
const dd = await q(`SELECT CASE WHEN days = 1 THEN '1 день' WHEN days = 2 THEN '2 дня' WHEN days <= 6 THEN '3–6 дней' WHEN days <= 13 THEN '7–13 дней' ELSE '14+ дней' END AS g, COUNT(*) AS n FROM seen GROUP BY g ORDER BY MIN(days)`);
table(dd.map((r) => ({ 'дней в игре': r.g, 'игроков': `${r.n} (${pct(r.n, tot.n)})` })), ['дней в игре', 'игроков']);

say('## До скольких трофеев доходят');
const tr = await q(`SELECT CASE WHEN COALESCE(u.trophies, 0) < 10 THEN 'меньше 10' WHEN u.trophies < 80 THEN '10–79 (карточки ещё закрыты)' WHEN u.trophies < 200 THEN '80–199' WHEN u.trophies < 500 THEN '200–499' WHEN u.trophies < 1000 THEN '500–999' WHEN u.trophies < 2000 THEN '1000–1999' ELSE '2000+' END AS g,
  COUNT(*) AS n, MIN(COALESCE(u.trophies, 0)) AS lo FROM seen s LEFT JOIN ustats u ON u.id = s.id GROUP BY g ORDER BY lo`);
table(tr.map((r) => ({ 'трофеи': r.g, 'игроков': `${r.n} (${pct(r.n, tot.n)})` })), ['трофеи', 'игроков']);

say(`## Игры за ${DAYS} дней (открытий, доиграно, побед, средняя партия)`);
const g = await q(`SELECT e.game, COALESCE(n.title, e.game) AS title, SUM(CASE WHEN kind = 'open' THEN e.n END) AS opens, SUM(CASE WHEN kind = 'end' THEN e.n END) AS ends,
  SUM(CASE WHEN kind = 'win' THEN e.n END) AS wins, CAST(SUM(CASE WHEN kind = 'end' THEN e.ms END) / MAX(1, SUM(CASE WHEN kind = 'end' THEN e.n END)) / 1000 AS INTEGER) AS sec
  FROM evd e LEFT JOIN names n ON n.game = e.game WHERE e.day >= ?1 GROUP BY e.game ORDER BY opens DESC LIMIT 40`, [since]);
const gp = await q(`SELECT game, COUNT(DISTINCT id) AS players FROM evu WHERE day >= ?1 GROUP BY game`, [since]); // evu: игрок отмечен в игре раз в день
const P = Object.fromEntries(gp.map((r) => [r.game, r.players]));
table(g.map((r) => ({ 'игра': r.title, 'игроков': P[r.game] ?? '', 'открытий': r.opens ?? 0, 'доиграно': `${r.ends ?? 0} (${pct(r.ends || 0, r.opens || 0)})`, 'побед': r.wins ?? 0, 'партия, с': r.sec ?? '' })), ['игра', 'игроков', 'открытий', 'доиграно', 'побед', 'партия, с']);

say('## Во что играют новички в первый день (и кто из них вернулся)');
const fd = await q(`WITH f AS (SELECT id, MIN(day) AS d0 FROM visits GROUP BY id HAVING MIN(day) >= ?1),
  b AS (SELECT f.id, EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day > f.d0) AS back FROM f)
  SELECT e.game, COALESCE(n.title, e.game) AS title, COUNT(DISTINCT e.id) AS players, COUNT(DISTINCT CASE WHEN b.back THEN e.id END) AS back
  FROM f JOIN evu e ON e.id = f.id AND e.day = f.d0 JOIN b ON b.id = f.id LEFT JOIN names n ON n.game = e.game
  GROUP BY e.game ORDER BY players DESC LIMIT 25`, [since]);
table(fd.map((r) => ({ 'игра': r.title, 'новичков открыли': r.players, 'из них вернулись': `${r.back} (${pct(r.back, r.players)})` })), ['игра', 'новичков открыли', 'из них вернулись']);
const [first] = await q(`WITH f AS (SELECT id, MIN(day) AS d0 FROM visits GROUP BY id HAVING MIN(day) >= ?1)
  SELECT COUNT(*) AS n, SUM(NOT EXISTS(SELECT 1 FROM evu e WHERE e.id = f.id AND e.day = f.d0)) AS none,
    SUM((SELECT COUNT(*) FROM evu e WHERE e.id = f.id AND e.day = f.d0) >= 3) AS three FROM f`, [since]);
say(`Новичков: ${first.n} · не открыли ни одной игры в первый день: ${first.none} (${pct(first.none, first.n)}) · попробовали 3+ разные игры: ${first.three} (${pct(first.three, first.n)})`); say();
const [fv] = await q(`WITH f AS (SELECT id, MIN(day) AS d0 FROM visits GROUP BY id HAVING MIN(day) >= ?1),
  x AS (SELECT f.id, (SELECT COUNT(*) FROM evu e WHERE e.id = f.id AND e.day = f.d0) AS g, EXISTS(SELECT 1 FROM visits v WHERE v.id = f.id AND v.day > f.d0) AS back FROM f)
  SELECT SUM(g = 0) AS n0, SUM(g = 0 AND back) AS b0, SUM(g BETWEEN 1 AND 2) AS n1, SUM(g BETWEEN 1 AND 2 AND back) AS b1, SUM(g >= 3) AS n3, SUM(g >= 3 AND back) AS b3 FROM x`, [since]);
say(`Вернулись хоть раз: без игр в первый день — ${pct(fv.b0, fv.n0)} из ${fv.n0} · 1–2 игры — ${pct(fv.b1, fv.n1)} из ${fv.n1} · 3+ игры — ${pct(fv.b3, fv.n3)} из ${fv.n3}`); say();

say('## Платформы'); table((await q('SELECT COALESCE(NULLIF(platform, \'\'), \'?\') AS p, COUNT(*) AS n FROM seen GROUP BY p ORDER BY n DESC LIMIT 8')).map((r) => ({ 'платформа': r.p, 'игроков': r.n })), ['платформа', 'игроков']);

if (process.env.GITHUB_STEP_SUMMARY) (await import('node:fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n');
