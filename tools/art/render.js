// Рендер картинок нового вида: node tools/art/render.js packs
// Нужен локальный сервер из корня проекта на :8765 (python3 -m http.server 8765). PNG → WebP через Pillow.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
(async () => {
  const what = process.argv[2] || 'packs';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('page:', e.message));
  if (what === 'packs') {
    await p.goto('http://localhost:8765/tools/art/packs.html'); await p.waitForTimeout(1500);
    const tmp = path.join(ROOT, 'tools/art/.tmp'); fs.mkdirSync(tmp, { recursive: true });
    for (let lv = 0; lv < 5; lv++) {
      const url = await p.evaluate((lv) => window.renderPack(lv, 640, 976), lv);
      const png = path.join(tmp, `pk${lv}.png`); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); bb = im.getbbox(); im = im.crop(bb)
for h in (360, 160):
    w = round(im.width * h / im.height); im.resize((w, h), Image.LANCZOS).save(sys.argv[2] + f'-{h}.webp', quality=90, method=6)
`, png, path.join(ROOT, `img/packs/pk${lv}`)]);
      console.log('pack', lv, 'ok');
    }
  }
  if (what === 'modes') {
    await p.goto('http://localhost:8765/tools/art/modes.html'); await p.waitForTimeout(800);
    const tmp = path.join(ROOT, 'tools/art/.tmp'); fs.mkdirSync(tmp, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'img/fcm'), { recursive: true });
    for (const id of (process.argv[3] ? process.argv[3].split(',') : ['mom', 'three', 'mgr', 'eleven', 'train', 'dribble', 'targets'])) {
      const url = await p.evaluate((id) => window.renderMode(id, 900, 600), id);
      const png = path.join(tmp, `mode-${id}.png`); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); im = im.crop(im.getbbox())
h = 240; w = round(im.width * h / im.height); im.resize((w, h), Image.LANCZOS).save(sys.argv[2], quality=88, method=6)
`, png, path.join(ROOT, `img/fcm/mode-${id}.webp`)]);
      console.log('mode', id, 'ok');
    }
  }
  await b.close();
})();
