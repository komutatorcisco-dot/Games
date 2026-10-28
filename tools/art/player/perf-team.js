// Замер «Команды» (фон меню + 11 игроков): вызовы отрисовки, треугольники, текстуры, кадры в секунду (CPU ×4).
// Нужен сервер из корня репозитория: python3 -m http.server 8765. Запуск: node tools/art/player/perf-team.js [tab]
// tab — какую вкладку мерить (team по умолчанию; home — главная). Состав — лучшие золотые карточки (только в этой странице).
const { chromium } = require('playwright');
(async () => {
  const tab = process.argv[2] || 'team';
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-webgl'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: false });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page:', e.message));
  await p.goto('http://localhost:8765/index.html');
  await p.waitForFunction(() => typeof Squad !== 'undefined' && typeof Cards !== 'undefined' && document.querySelector('canvas.a3d'), null, { timeout: 90000 });
  await p.evaluate(async (tab) => {
    if (Store.d.user && !Store.d.user.nick) Store.d.user.nick = 'Тест';
    if (typeof Modal !== 'undefined') Modal.close();
    Cards.spare = () => 1;
    const s = Squad.S(), F = XD.FORMATIONS[s.form];
    const all = Cards.all().filter((c) => !c.sbcOnly && c.rar === 'gold'), gk = all.filter((c) => c.pos === 'ВРТ').sort((a, z) => z.r - a.r), fld = all.filter((c) => c.pos !== 'ВРТ').sort((a, z) => z.r - a.r);
    let fi = 0; s.xi = F.slots.map((sl) => (sl.pos === 'GK' ? gk[0].key : fld[(fi++) * 5].key));
    const t = document.querySelector(`[data-fm-tab="${tab}"]`); if (t) t.click();
  }, tab);
  await p.waitForTimeout(12000); await p.evaluate(() => { if (typeof Modal !== 'undefined' && Modal.isOpen) Modal.close(); }); await p.waitForTimeout(1500);
  const read = () => p.evaluate(async () => { const cv = document.querySelector('canvas.a3d'); const bd = await Arena3D.backdrop(cv.parentNode); return bd.stats(); });
  const stats = await read(); stats.same = await p.evaluate(async () => { const cv = document.querySelector('canvas.a3d'); return (await Arena3D.backdrop(cv.parentNode)).canvas === cv; });
  const fps = await p.evaluate(() => new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else ok(+(n / 4).toFixed(1)); }; requestAnimationFrame(f); }));
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fps4 = await p.evaluate(() => new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else ok(+(n / 4).toFixed(1)); }; requestAnimationFrame(f); }));
  console.log(JSON.stringify({ tab, men: await p.evaluate(() => document.body.classList.contains('fm-men')), ...stats, fps, 'fps CPU×4': fps4 }));
  await b.close();
})();
