// Управление с мячом в самой игре (матч 11×11, соперники отведены): непрерывный эпизод экранным джойстиком —
// старт с места, отпустил, круг стиком, зигзаг, разворот, «передумал» посреди разворота, рывок, разворот на рывке.
// Проверяется не только «мяч не потерян», но и что игрок идёт туда, куда ведут: реакция, отклонение хода, топтание,
// автоматика вместо джойстика, рывки мяча. Пороги — с запасом к замеру основы 9a65a67 (в скобках в сообщениях).
// Виртуальные часы: результат одинаков при любой скорости машины. FPS=60 — тот же эпизод при 60 кадрах/с.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const FPS = +(process.env.FPS || 30);
(async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : { channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((fps) => {
      let s = 5; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let t = 1000; const raf = window.requestAnimationFrame.bind(window); performance.now = () => t; window.__f = 0; let budget = 1e9; const q = [];
      const run = (cb) => raf(() => { t += 1000 / fps; window.__f++; cb(t); });
      window.__budget = (n) => { budget = n; while (budget > 0 && q.length) { budget--; run(q.shift()); } };
      window.requestAnimationFrame = (cb) => { if (budget > 0) { budget--; return run(cb); } q.push(cb); return 0; };
      try { localStorage.setItem('shot.match.hint1', '1'); } catch (e) {}
    }, FPS);
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url()); if (url.hostname !== 'jackson.test') return route.abort();
      const file = path.join(process.cwd(), decodeURIComponent(url.pathname)); if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    await page.goto('http://jackson.test/prototypes/shot/index.html?mode=match&n=11&trace=1&q=low&mt=1800', { timeout: 240000 });
    await page.waitForFunction(() => window.ready, null, { timeout: 240000 });
    const K = FPS / 30; await page.evaluate(() => window.__budget(0));
    const F = async (n) => { n = Math.max(1, Math.round(n * K)); const f0 = await page.evaluate((n) => { const f = window.__f; window.__budget(n); return f; }, n); await page.waitForFunction((x) => window.__f >= x, f0 + n, { timeout: 300000, polling: 10 }); };
    await F(60); await page.evaluate(() => { window.__park(); window.__give(0, 60); }); await F(10);
    const R = (a) => [Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180)];
    // [длительность, ввод от t (экран: x вправо, y вверх), рывок, имя]
    const EP = [[0.7, () => [0, 0], 0, 'стою'], [1.3, () => [-1, 0], 0, 'влево с места'], [0.8, () => [0, 0], 0, 'отпустил'], [1.3, () => R(45), 0, 'вправо-вверх'], [0.6, () => [0, 0], 0, 'отпустил 2'],
      [4, (t) => R(t * 90), 0, 'круг'], [2.7, (t) => R(Math.floor(t / 0.45) % 2 ? -40 : 40), 0, 'зигзаг'], [1.3, () => [0, 1], 0, 'вверх'], [1.5, () => [0, -1], 0, 'разворот'],
      [1.2, () => [0, 1], 0, 'снова вверх'], [0.25, () => [0, -1], 0, 'начал разворот'], [1.2, () => [-1, 0], 0, 'передумал'],
      [1.5, () => [0, 1], 1, 'рывок'], [1.6, () => [0, -1], 1, 'разворот на рывке'], [1.2, () => [0, 0], 0, 'отпустил 3']];
    const segs = {};
    for (const [d, fn, spr, name] of EP) {
      await page.evaluate((s) => window.__sprint(s), !!spr); const n = Math.round(d * 30), S = segs[name] = [];
      for (let i = 0; i < n; i++) { const [x, y] = fn(i / 30); // ввод, кадр и замер — одним обращением к странице
        S.push(await page.evaluate(async ([x, y, k]) => { window.__joy(x, y); const f0 = window.__f; window.__budget(k); await new Promise((r) => { const c = () => (window.__f >= f0 + k ? r() : setTimeout(c, 0)); c(); }); return { m: window.__dbgMe(), s: window.__state() }; }, [x, y, Math.max(1, Math.round(K))])); }
    }
    const ang = (a, b, c, d) => Math.acos(Math.max(-1, Math.min(1, (a * c + b * d) / (Math.hypot(a, b) * Math.hypot(c, d) || 1)))) * 57.3;
    const sum = (name) => { const f = segs[name]; let resp = null, dev = [], stall = 0, stopT = null, ballMax = 0, jump = 0, prev = null, lost = 0; const auto = {};
      f.forEach((d, i) => { const t = i / 30, m = d.m, wx = m.raw[0], wz = -m.raw[1], rm = Math.hypot(wx, wz), sp = Math.hypot(m.vx, m.vz);
        if (m.src !== 'joy') auto[m.src] = (auto[m.src] || 0) + 1; if (d.s.owner !== 'me') lost++;
        const bx = d.s.ball[0] - d.s.me[1], bz = d.s.ball[1] - d.s.me[2]; ballMax = Math.max(ballMax, Math.hypot(bx, bz)); if (prev) jump = Math.max(jump, Math.hypot(bx - prev[0], bz - prev[1]) * 30); prev = [bx, bz];
        if (rm > 0.5) { const a = sp > 0.3 ? ang(m.vx, m.vz, wx, wz) : 180; if (resp === null && sp > 1.2 && a < 20) resp = t; if (resp !== null) dev.push(a); if (t > 0.4 && sp < 0.8) stall += 1 / 30; }
        else if (stopT === null && sp < 0.2) stopT = t; });
      return { resp, devMax: dev.length ? Math.max(...dev) : 0, devMean: dev.length ? dev.reduce((a, b) => a + b, 0) / dev.length : 0, stall, stopT, ballMax, jump, lost, auto }; };
    const res = Object.fromEntries(Object.keys(segs).map((k) => [k, sum(k)]));
    if (process.env.VERBOSE) for (const [k, v] of Object.entries(res)) console.log(k, JSON.stringify(v, (kk, x) => (typeof x === 'number' ? +x.toFixed(2) : x)));
    assert.deepEqual(errors, []);
    for (const [k, v] of Object.entries(res)) {
      assert.equal(v.lost, 0, `${k}: мяч потерян без соперника`);
      assert.ok(v.ballMax < 0.8, `${k}: мяч от игрока ${v.ballMax.toFixed(2)} м (0,62)`);
      assert.ok(v.jump < 5, `${k}: мяч дёрнулся на ${v.jump.toFixed(1)} м/с за кадр (3,6)`);
      assert.ok(v.stall < 0.1, `${k}: топтание ${v.stall.toFixed(2)} с (0)`);
      const allowed = /разворот|снова вверх/.test(k) ? ['drive'] : []; // отрезок начинается с разворота на 180° — запись разворота (прерываемая) допустима for (const a of Object.keys(v.auto)) assert.ok(allowed.includes(a), `${k}: управлял не джойстик, а «${a}»`);
    }
    for (const k of ['влево с места', 'вправо-вверх', 'передумал']) assert.ok(res[k].resp !== null && res[k].resp < 0.25, `${k}: реакция ${res[k].resp} с (0,13)`);
    for (const k of ['отпустил', 'отпустил 2', 'отпустил 3']) assert.ok(res[k].stopT !== null && res[k].stopT < 0.8, `${k}: остановка ${res[k].stopT} с (0,5–0,6)`);
    assert.ok(res['круг'].devMax < 15, `круг: отклонение хода ${res['круг'].devMax.toFixed(0)}° (7)`);
    assert.ok(res['зигзаг'].devMean < 16, `зигзаг: среднее отклонение ${res['зигзаг'].devMean.toFixed(0)}° (11)`);
    assert.ok(res['снова вверх'].resp < 0.7, `снова вверх (разворот): реакция ${res['снова вверх'].resp} с (0,37–0,47)`);
    assert.ok(res['разворот'].resp < 0.7 && res['разворот на рывке'].resp < 0.8, `разворот: ${res['разворот'].resp} / ${res['разворот на рывке'].resp} с (0,47 / 0,3–0,63)`);
    console.log(`ведение: управление в норме (${FPS} кадров/с)`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
