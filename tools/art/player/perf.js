// Замер матча Arena3D (22 игрока) как на среднем телефоне: процессор медленнее в 4 раза, экран 844×390 ×2.
// Нужен сервер из корня репозитория: python3 -m http.server 8765. Запуск: node tools/art/player/perf.js
// Печатает кадры в секунду (fps), медианный и 95-й перцентиль времени кадра — для прежних фигурок и 3D-игроков.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--enable-webgl'] });
  const out = {};
  for (const [name, q] of [['фигурки', 'jg=0'], ['3D-игроки', 'jg=1']]) {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.error('page:', e.message));
    const cdp = await ctx.newCDPSession(p);
    await p.goto('http://localhost:8765/tools/art/player/perf.html?' + q);
    await p.waitForFunction(() => window.PERF && PERF.ready, null, { timeout: 60000 });
    const gl = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'нет WebGL'; });
    const full = await p.evaluate(() => measure(5000));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = await p.evaluate(() => measure(5000));
    out[name] = { 'обычно': full, 'CPU ×4': slow, gl };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
