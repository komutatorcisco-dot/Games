// Запекает движения Mixamo в prototypes/shot/anims.json для скелета Балотелли.
// node bake.js <папка с FBX>   (нужен пакет three: THREE_DIR=.../node_modules/three)
// Сами FBX в репозиторий не кладём (условия Mixamo: файлы движений не распространять отдельно от игры).
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const DIR = process.argv[2], THREE_DIR = process.env.THREE_DIR, ROOT = path.join(__dirname, '../..');
const CLIPS = { kick: 'soccer penalty kick', kick2: 'kick soccerball', strike: 'strike foward jog', idle: 'offensive idle',
  gk_idle: 'goalkeeper idle', gk_dive: 'goalkeeper diving save', gk_dive2: 'goalkeeper diving save (2)', gk_catch: 'goalkeeper catch',
  gk_block: 'goalkeeper body block', gk_miss: 'goalkeeper miss', gk_step: 'goalkeeper sidestep', jog: 'jog forward' };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage(); p.on('console', (m) => m.type() === 'error' && console.log('page:', m.text()));
  await p.route('http://bake.local/**', (r) => {
    const u = decodeURIComponent(new URL(r.request().url()).pathname); let f;
    if (u.startsWith('/three/')) f = path.join(THREE_DIR, u.slice(7));
    else if (u === '/model.glb') f = path.join(ROOT, 'prototypes/balotelli/balotelli-mobile.glb');
    else if (u.startsWith('/fbx/')) f = path.join(DIR, u.slice(5));
    else f = path.join(__dirname, u.slice(1));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  });
  await p.goto('http://bake.local/page.html'); await p.waitForFunction('window.ready === true', null, { timeout: 60000 });
  const out = {};
  for (const [k, n] of Object.entries(CLIPS)) {
    if (!fs.existsSync(path.join(DIR, n + '.fbx'))) { console.log('нет файла:', n); continue; }
    out[k] = await p.evaluate((u) => window.bake(u), '/fbx/' + n + '.fbx');
    console.log(k, out[k].dur + ' с');
  }
  const file = path.join(ROOT, 'prototypes/shot/anims.json');
  fs.writeFileSync(file, JSON.stringify(out)); console.log('записано', (fs.statSync(file).size / 1024).toFixed(0) + ' КБ');
  await b.close();
})();
