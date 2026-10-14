const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const dir = process.argv[2], files0 = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  const names = { '01-black-gold': '1. Чёрное золото', '02-enamel': '2. Эмаль', '03-neon': '3. Неон', '04-vintage': '4. Винтаж', '05-holo': '5. Голограмма', '05a-holo-gold': '5a. Золото', '05b-holo-violet': '5b. Фиолет', '05c-holo-ice': '5c. Лёд', '05d-holo-emerald': '5d. Изумруд', '05e-holo-ruby': '5e. Рубин', '05f-holo-black': '5f. Чёрный', '06-bauhaus': '6. Баухаус', '07-glass': '7. Стекло', '08-split': '8. Сплит', '09-patch': '9. Нашивка', '10-deco': '10. Ар-деко' };
  const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
  const files = only ? files0.filter((f) => only.test(f)) : files0;
  const out = process.argv[4] || '_sheet.png';
  const u = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(dir + '/' + f).toString('base64');
  const cells = files.map((f) => `<div class="c"><img src="${u(f)}" width="200"><div class="row"><img src="${u(f)}" width="64"><img src="${u(f)}" width="36"><img src="${u(f)}" width="22"></div><b>${names[f.replace('.svg', '')] || f}</b></div>`).join('');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 400 }, deviceScaleFactor: 1 });
  await p.setContent(`<style>body{margin:0;background:#151021;font:700 17px Arial;color:#eee;display:grid;grid-template-columns:repeat(${Math.min(files.length, 5)},250px);gap:18px 6px;padding:16px}.c{display:grid;justify-items:center;gap:8px}.row{display:flex;align-items:center;gap:14px;background:#2a2140;padding:8px 14px;border-radius:12px}</style>${cells}`);
  await p.waitForTimeout(500); await p.screenshot({ path: dir + '/' + out, fullPage: true }); await b.close();
})();
