const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const dir = process.argv[2], files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  const names = ['Чёрное золото','Эмаль','Неон','Винтажная печать','Голограмма','Баухаус','Стекло','Сплит','Нашивка','Ар-деко'];
  const u = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(dir + '/' + f).toString('base64');
  const cells = files.map((f, i) => `<div class="c"><img src="${u(f)}" width="200"><div class="row"><img src="${u(f)}" width="64"><img src="${u(f)}" width="36"><img src="${u(f)}" width="22"></div><b>${i + 1}. ${names[i]}</b></div>`).join('');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(`<style>body{margin:0;background:#151021;font:700 17px Arial;color:#eee;display:grid;grid-template-columns:repeat(5,250px);gap:18px 6px;padding:16px}.c{display:grid;justify-items:center;gap:8px}.row{display:flex;align-items:center;gap:14px;background:#2a2140;padding:8px 14px;border-radius:12px}</style>${cells}`);
  await p.waitForTimeout(500); await p.screenshot({ path: dir + '/_sheet.png', fullPage: true }); await b.close();
})();
