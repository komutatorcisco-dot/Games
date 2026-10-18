// Ссылки-приглашения: тестовая версия (CONFIG.stage) зовёт в тестовый Mini App /preview, обычная — в /games.
// core.js и config.js грузятся в том же порядке, что в index.html (config.js — после core.js).
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const load = (href) => {
  const url = new URL(href);
  const noop = () => {};
  const el = () => ({ style: { setProperty: noop }, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, appendChild: noop });
  const document = { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createElement: el, documentElement: el(), body: el() };
  const ctx = { console, setTimeout, clearTimeout, URL, document, navigator: {}, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { href: url.href, search: url.search, hostname: url.hostname, hash: url.hash, pathname: url.pathname } };
  ctx.window = ctx; ctx.addEventListener = noop; ctx.innerWidth = 390; ctx.innerHeight = 844;
  vm.createContext(ctx);
  for (const f of ['js/core.js', 'js/config.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return vm.runInContext('({ appLink, stage: CONFIG.stage })', ctx);
};

const prod = load('https://komutatorcisco-dot.github.io/Games/');
assert.equal(prod.stage, false);
assert.equal(prod.appLink(), 'https://t.me/JacksonGamesbot/games', 'обычная версия ведёт в /games');
assert.equal(prod.appLink('ref_42'), 'https://t.me/JacksonGamesbot/games?startapp=ref_42');

const preview = load('https://jackson-games-preview.pages.dev/');
assert.equal(preview.stage, true);
assert.equal(preview.appLink(), 'https://t.me/JacksonGamesbot/preview', 'тестовая версия ведёт в /preview');
assert.equal(preview.appLink('daily'), 'https://t.me/JacksonGamesbot/preview?startapp=daily');
assert.equal(load('https://abc123.jackson-games-preview.pages.dev/').appLink('cl_ABC123'), 'https://t.me/JacksonGamesbot/preview?startapp=cl_ABC123', 'сборки превью по веткам тоже ведут в /preview');
assert.equal(load('https://komutatorcisco-dot.github.io/Games/?stage=1').appLink('xdraft'), 'https://t.me/JacksonGamesbot/preview?startapp=xdraft', '?stage=1 тоже ведёт в /preview');
assert.equal(load('https://jackson-games-preview.pages.dev.evil.example/').appLink(), 'https://t.me/JacksonGamesbot/games', 'чужой домен не считается превью');

// В js/ нигде больше не зашит адрес Mini App: все ссылки на игру строятся через appLink().
const files = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'vendor' ? [] : files(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []);
for (const f of files('js')) {
  const hits = fs.readFileSync(f, 'utf8').split('\n').filter((l) => /t\.me\/JacksonGamesbot\/(games|preview)/i.test(l));
  if (f === 'js/core.js') assert.equal(hits.length, 1, 'core.js: адреса только в APP_LINK');
  else assert.deepEqual(hits, [], `${f}: ссылку на Mini App строим через appLink()`);
}
console.log('App link: /games in production, /preview in preview (pages.dev, ?stage=1); no hardcoded Mini App links outside core.js');
