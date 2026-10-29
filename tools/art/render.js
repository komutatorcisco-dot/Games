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
  if (what === 'icons') {
    await p.goto('http://localhost:8765/tools/art/icons.html'); await p.waitForTimeout(600); fs.mkdirSync(path.join(ROOT, 'tools/art/.tmp'), { recursive: true });
    for (const id of ['events', 'daily']) { const url = await p.evaluate((id) => window.renderIcon(id), id); const png = path.join(ROOT, `tools/art/.tmp/ic-${id}.png`); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      execFileSync('python3', ['-I', '-c', "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA'); im=im.crop(im.getbbox()); im.thumbnail((128,128), Image.LANCZOS); im.save(sys.argv[2], quality=90, method=6)", png, path.join(ROOT, `img/fcm/ic-${id}.webp`)]); console.log('icon', id); }
  }
  if (what === 'plates') {
    await p.goto('http://localhost:8765/tools/art/icons.html'); await p.waitForTimeout(600);
    for (const [n, k, w, h] of [['tile', 'teal', 256, 256], ['club', 'blue', 400, 300], ['play', 'green', 400, 300], ['feat', 'gold', 560, 300]]) {
      const url = await p.evaluate(([k, w, h]) => window.renderPlate(k, w, h), [k, w, h]); const png = path.join(ROOT, `tools/art/.tmp/pl-${n}.png`); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      execFileSync('python3', ['-I', '-c', "import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], quality=88, method=6)", png, path.join(ROOT, `img/fcm/pl-${n}.webp`)]); console.log('plate', n); }
  }
  if (what === 'ball') {
    await p.goto('http://localhost:8765/tools/art/ball.html'); await p.waitForFunction(() => window.ready); fs.mkdirSync(path.join(ROOT, 'tools/art/.tmp'), { recursive: true });
    const url = await p.evaluate(() => window.renderBall(1024)); const png = path.join(ROOT, 'tools/art/.tmp/ball.png'); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
    execFileSync('python3', ['-I', '-c', "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA'); im=im.crop(im.getbbox()); im.thumbnail((512,512), Image.LANCZOS); im.save(sys.argv[2], quality=92, method=6)", png, path.join(ROOT, 'img/fcm/ball.webp')]); console.log('ball ok');
    const u2 = await p.evaluate(() => window.renderBall(1024, { net: true, crest: true })); const p2 = path.join(ROOT, 'tools/art/.tmp/ballnet.png'); fs.writeFileSync(p2, Buffer.from(u2.split(',')[1], 'base64'));
    execFileSync('python3', ['-I', '-c', "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA'); im=im.crop(im.getbbox()); im.thumbnail((560,560), Image.LANCZOS); im.save(sys.argv[2], quality=92, method=6)", p2, path.join(ROOT, 'img/fcm/ball-net.webp')]); console.log('ball-net ok');
  }
  if (what === 'brand') {
    await p.goto('http://localhost:8765/tools/art/brand.html'); await p.waitForFunction(() => window.ready); fs.mkdirSync(path.join(ROOT, 'img/brand'), { recursive: true });
    const crop = "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA'); bb=im.getbbox(); im=im.crop(bb) if sys.argv[3]=='1' else im; im.save(sys.argv[2])";
    for (const [n, col] of [['white', '#ffffff'], ['black', '#000000']]) { const u = await p.evaluate((c) => window.logo(c), col); const f = path.join(ROOT, `img/brand/logo-${n}.png`); fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); execFileSync('python3', ['-I', '-c', crop, f, f, '1']); }
    for (const [n, fg, bg] of [['dark', '#ffffff', '#000000'], ['light', '#000000', '#ffffff'], ['lime', '#000000', '#c6ff3d']]) { const u = await p.evaluate(([a, b]) => window.mark(a, b), [fg, bg]); const f = path.join(ROOT, `img/brand/mark-${n}.png`); fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64')); execFileSync('python3', ['-I', '-c', crop, f, f, '0']); }
    console.log('brand ok');
  }
  if (what === 'crest') {
    await p.goto('http://localhost:8765/tools/art/packs.html'); await p.waitForTimeout(800);
    const url = await p.evaluate(() => window.renderCrest()); const png = path.join(ROOT, 'tools/art/.tmp/crest.png'); fs.mkdirSync(path.dirname(png), { recursive: true }); fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); im = im.crop(im.getbbox()); h = 320; w = round(im.width * h / im.height)
im.resize((w, h), Image.LANCZOS).save(sys.argv[2], quality=90, method=6)
`, png, path.join(ROOT, 'img/fcm/crest.webp')]);
    console.log('crest ok');
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
