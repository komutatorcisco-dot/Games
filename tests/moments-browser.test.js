// «Моменты» в самой игре: бот играет за меня всю серию (auto=1). Проверяется: перед стартом видны условия и все атаки;
// каждая атака кончается по правилу (гол, вратарь забрал, за линией, мимо, потеря, фол, время) и не дольше лимита;
// следующая начинается сама; серия доходит до итога, в итоге — все атаки; нет ошибок страницы и зависаний.
// Виртуальные часы: результат одинаков при любой скорости машины.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : { channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const errors = [], ends = []; page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('momEnd ')) ends.push(JSON.parse(t.slice(7))); });
    await page.addInitScript(() => {
      let s = 5; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let t = 1000; const raf = window.requestAnimationFrame.bind(window); performance.now = () => t; window.__f = 0;
      window.requestAnimationFrame = (cb) => raf(() => { t += 1000 / 30; window.__f++; cb(t); });
      try { localStorage.setItem('shot.match.hint1', '1'); } catch (e) {}
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url()); if (url.hostname !== 'jackson.test') return route.abort();
      const file = path.join(process.cwd(), decodeURIComponent(url.pathname)); if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    const ET = 10;
    await page.goto(`http://jackson.test/prototypes/shot/index.html?mode=moments&n=3&trace=1&q=low&nr=1&auto=1&sd=7&et=${ET}&need=2`);
    await page.waitForFunction(() => window.ready, null, { timeout: 200000 });
    const F = async (n) => { const f0 = await page.evaluate(() => window.__f); await page.waitForFunction((x) => window.__f >= x, f0 + n, { timeout: 300000, polling: 20 }); };
    await F(10);
    const intro = await page.evaluate(() => ({ on: document.querySelector('#end').classList.contains('on'), t: document.querySelector('#endT').textContent, p: document.querySelector('#endP').textContent, n: document.querySelectorAll('#endG > div').length, b: document.querySelector('#again').textContent }));
    assert.ok(intro.on && intro.t === 'Моменты' && intro.b === 'Начать', 'перед стартом — карточка условий');
    assert.equal(intro.n, 6, 'видны все 6 атак'); assert.match(intro.p, /Цель — забить 2/, 'цель видна до старта');
    await page.evaluate(() => document.querySelector('#again').click());
    let done = false, last = -1, idle = 0;
    for (let i = 0; i < 30 * 200 && !done; i += 15) {
      await F(15);
      done = await page.evaluate(() => document.querySelector('#end').classList.contains('on'));
      if (ends.length !== last) { last = ends.length; idle = 0; } else idle += 15;
      if (idle >= 30 * (ET + 9)) assert.fail(`атака ${ends.length + 1} не закончилась (зависание): ${JSON.stringify(await page.evaluate(() => window.__momDbg()))} ${JSON.stringify(ends.map((e) => e.why))}`);
    }
    assert.ok(done, 'серия дошла до итога');
    assert.equal(ends.length, 6, 'сыграны все 6 атак');
    const WHY = ['Гол!', 'Вратарь забрал мяч', 'Мяч за линией', 'Мимо ворот', 'Потеря мяча', 'Фол', 'Время вышло', 'Угловой — атака окончена'];
    for (const e of ends) { assert.ok(WHY.includes(e.why), 'понятная причина конца: ' + e.why); assert.ok(e.t <= ET + 3.1, `атака не дольше лимита (${e.t} с)`); }
    assert.deepEqual(ends.map((e) => e.k), ['1v1', '2v1', 'flank', 'back', '2v2', '2v1'], 'атаки — по списку');
    const fin = await page.evaluate(() => ({ n: document.querySelectorAll('#endG > div').length, hud: document.querySelector('#dots').textContent, goals: +document.querySelector('#score').textContent, b: document.querySelector('#again').textContent }));
    assert.equal(fin.n, 6, 'в итоге — все атаки'); assert.equal(fin.hud, 'Атака 6/6'); assert.equal(fin.goals, ends.filter((e) => e.goal).length, 'голы на табло = голы в эпизодах');
    assert.equal(fin.b, 'Ещё серия');
    assert.deepEqual(errors, [], 'без ошибок страницы');
    console.log('moments ok', ends.map((e) => `${e.k}:${e.why}`).join(' | '));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
