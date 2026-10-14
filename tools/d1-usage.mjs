// Расход Cloudflare D1 по часам (Rows Read / Rows Written) и самые дорогие запросы — для сравнения «до» и «после».
// Запуск: GitHub Actions → «Расход D1» (нужны секреты CF_API_TOKEN и CF_ACCOUNT_ID). Только чтение статистики.
const token = (process.env.CF_API_TOKEN || '').trim(), acc = (process.env.CF_ACCOUNT_ID || '').trim();
if (!token || !acc) { console.log('Нет секретов CF_API_TOKEN / CF_ACCOUNT_ID'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const days = Number(process.env.DAYS || 3), end = new Date(), start = new Date(end - days * 864e5);
const gql = async (query, variables) => { const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) }); return r.json(); };
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const dbs = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/d1/database`, { headers: H })).json();
if (!dbs.success) console.log('Список баз недоступен (права токена?):', JSON.stringify(dbs.errors));
else dbs.result.forEach((d) => console.log(`База: ${d.name} · таблиц: ${d.num_tables ?? '?'} · размер: ${d.file_size ? Math.round(d.file_size / 1024) + ' КБ' : '?'}`));

const hourly = await gql(`query($acc: String!, $s: Date!, $e: Date!) { viewer { accounts(filter: { accountTag: $acc }) {
  d1AnalyticsAdaptiveGroups(limit: 2000, filter: { date_geq: $s, date_leq: $e }, orderBy: [datetimeHour_ASC]) {
    sum { readQueries writeQueries rowsRead rowsWritten } dimensions { datetimeHour } } } } }`,
  { acc, s: start.toISOString().slice(0, 10), e: end.toISOString().slice(0, 10) });
if (hourly.errors) console.log('Почасовая статистика недоступна:', JSON.stringify(hourly.errors).slice(0, 400));
else {
  const rows = hourly.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups, byDay = {};
  console.log('\nЧас (UTC)            | запросов чт/зап | Rows Read | Rows Written');
  rows.forEach((r) => {
    const h = r.dimensions.datetimeHour, s = r.sum, d = h.slice(0, 10);
    (byDay[d] = byDay[d] || { r: 0, w: 0 }); byDay[d].r += s.rowsRead; byDay[d].w += s.rowsWritten;
    console.log(`${h.replace('T', ' ').slice(0, 16)}     | ${fmt(s.readQueries)}/${fmt(s.writeQueries)} | ${fmt(s.rowsRead)} | ${fmt(s.rowsWritten)}`);
  });
  console.log('\nПо суткам (UTC; лимит бесплатного тарифа: 5 000 000 чтения / 100 000 записи):');
  Object.entries(byDay).forEach(([d, v]) => console.log(`${d}: Rows Read ${fmt(v.r)} · Rows Written ${fmt(v.w)}`));
}

const since = new Date(end - Number(process.env.TOP_HOURS || 6) * 3600e3).toISOString();
const top = await gql(`query($acc: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: { accountTag: $acc }) {
  d1QueriesAdaptiveGroups(limit: 15, filter: { datetime_geq: $s, datetime_leq: $e }, orderBy: [sum_rowsRead_DESC]) {
    count sum { rowsRead rowsWritten } dimensions { query } } } } }`, { acc, s: since, e: end.toISOString() });
if (top.errors) console.log('\nСтатистика по запросам недоступна:', JSON.stringify(top.errors).slice(0, 400));
else {
  console.log(`\nСамые дорогие запросы за последние ${process.env.TOP_HOURS || 6} ч (по Rows Read):`);
  top.data.viewer.accounts[0].d1QueriesAdaptiveGroups.forEach((q) => console.log(`${fmt(q.sum.rowsRead).padStart(10)} r ${fmt(q.sum.rowsWritten).padStart(8)} w ×${q.count}  ${q.dimensions.query.replace(/\s+/g, ' ').slice(0, 110)}`));
}
