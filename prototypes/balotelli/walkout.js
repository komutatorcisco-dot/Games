// Jackson Games — кинематографичный выход игрока из пака (демо, в игру не подключено).
//
// Сценарий ~10 с: тёмная сцена и силуэт карточки → нация → позиция → клуб/«Герой» → вспышка и карточка →
// игрок выходит из глубины, шагает к карточке, останавливается, празднует → спокойное ожидание.
// Результат пака задаётся ДО начала (объект RESULT, только для чтения): сцена его лишь показывает.
// Пропуск, повтор и перезагрузка ничего не начисляют — здесь вообще нет обращений к экономике.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { createRig, planWalk, pose, smooth, smoother } from './motion.js';
import { buildStage } from './stage.js';

const Q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);

// ---------- результат пака: из каталога игры; если игрока нет — явно помеченная тестовая карточка ----------
const RAR = {
  bronze: { n: 'БРОНЗА', c: ['#f3b98a', '#8f5a32', '#f0b98c'] },
  silver: { n: 'СЕРЕБРО', c: ['#ffffff', '#8a94a6', '#dfe5ee'] },
  gold: { n: 'ЗОЛОТО', c: ['#fff3b0', '#e0a21a', '#ffcf3a'] },
  legend: { n: 'ЛЕГЕНДА', c: ['#ff9ae2', '#ffe27a', '#8ff0d8', '#9fdcff', '#d6b2ff'] },
  jack: { n: 'ДЖЕКСОН!!', c: ['#ff4a62', '#2a0610', '#ff5a6e'] },
  forgotten: { n: 'ЗАБЫТЫЕ ЛЕГЕНДЫ', c: ['#c77dff', '#6fb8ff', '#ff7ad9', '#f6cf63'] },
};
// каталоги объявлены в обычных скриптах через const — это глобальные имена, но не свойства window
const CAT = {
  legends: typeof CARD_LEGENDS !== 'undefined' ? CARD_LEGENDS : [],
  nations: typeof CARD_LEGEND_NATIONS !== 'undefined' ? CARD_LEGEND_NATIONS : {},
  crests: typeof CRESTS !== 'undefined' ? CRESTS : {},
};
// Из игры (embed=1) карточка приходит параметрами из каталога игры: имя, рейтинг, позиция, нация, редкость, серия.
const EMBED = Q.get('embed') === '1';
// Параметры попадают в разметку, поэтому текст — только буквы, цифры, пробел, дефис и точка, а картинки — только из img/ игры.
const txt = (v, n = 40) => (v ? String(v).replace(/[^\p{L}\p{N} .'’-]/gu, '').slice(0, n) || null : null);
const imgPath = (v) => (v && /^\.\.\/\.\.\/img\/[\w\-/]+\.(svg|webp|png)$/.test(v) ? v : null);
function fromGame() {
  const r = Math.round(Number(Q.get('r')));
  if (!txt(Q.get('n')) || !(r >= 40 && r <= 99)) return null;
  const rar = /^[a-z]{3,12}$/.test(Q.get('rar') || '') ? Q.get('rar') : 'legend';
  return { name: txt(Q.get('n')), rating: r, club: null, pos: txt(Q.get('pos'), 6), nation: txt(Q.get('nat')), rarity: rar, series: txt(Q.get('series')), crest: imgPath(Q.get('crest')), face: imgPath(Q.get('face')), hero: false, test: false, src: 'каталог игры' };
}
function resolveCard(name) {
  const row = CAT.legends.find((r) => r[0] === name);
  if (row) {
    const nat = CAT.nations[name];
    return { name, rating: row[1], club: row[2], pos: row[3], nation: nat || null, rarity: 'legend', hero: false, test: false, src: 'каталог: CARD_LEGENDS' };
  }
  // Балотелли нет в каталоге карточек: не выдумываем рейтинг, клуб и редкость
  return { name: 'Марио Балотелли', rating: null, club: null, pos: null, nation: 'Италия', rarity: Q.get('rar') || 'legend', hero: Q.get('hero') === '1', test: true, src: 'нет в каталоге — тестовая карточка (нация из «Угадай карьеру»)' };
}
const RESULT = Object.freeze(fromGame() || resolveCard(Q.get('card') || 'Марио Балотелли'));
const RC = RAR[RESULT.rarity] || RAR.legend;
const surname = (n) => { const w = n.split(' '); return w.length > 1 ? w.slice(1).join(' ') : n; };
const FLAGS = { // флаги рисуем полосами — эмодзи-флаги не видны на Windows
  'Италия': 'linear-gradient(90deg,#009246 33.3%,#fff 33.3% 66.6%,#ce2b37 66.6%)',
  'Франция': 'linear-gradient(90deg,#0055a4 33.3%,#fff 33.3% 66.6%,#ef4135 66.6%)',
  'Германия': 'linear-gradient(#000 33.3%,#dd0000 33.3% 66.6%,#ffce00 66.6%)',
  'Испания': 'linear-gradient(#aa151b 25%,#f1bf00 25% 75%,#aa151b 75%)',
  'Нидерланды': 'linear-gradient(#ae1c28 33.3%,#fff 33.3% 66.6%,#21468b 66.6%)',
  'Бельгия': 'linear-gradient(90deg,#000 33.3%,#fae042 33.3% 66.6%,#ed2939 66.6%)',
  'Аргентина': 'linear-gradient(#74acdf 33.3%,#fff 33.3% 66.6%,#74acdf 66.6%)',
  'Украина': 'linear-gradient(#0057b7 50%,#ffd700 50%)',
  'Кот-д’Ивуар': 'linear-gradient(90deg,#f77f00 33.3%,#fff 33.3% 66.6%,#009e60 66.6%)',
  'Бразилия': 'radial-gradient(circle at 50% 50%,#002776 18%,#ffdf00 19% 38%,#009c3b 39%)',
  'Португалия': 'linear-gradient(90deg,#006600 40%,#ff0000 40%)',
  'Англия': 'linear-gradient(90deg,transparent 43%,#ce1124 43% 57%,transparent 57%),linear-gradient(#fff 43%,#ce1124 43% 57%,#fff 57%)',
};

// ---------- сцена ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(2, devicePixelRatio || 1);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.FogExp2(0x05040b, 0.045);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const cols = RC.c.map((c) => new THREE.Color(c));

const hemi = new THREE.HemisphereLight(0x8fa0ff, 0x120a18, 0.0); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0dc, 0.0); key.position.set(1.6, 3.2, 4.2); scene.add(key);
const fill = new THREE.DirectionalLight(0x9fb6ff, 0.0); fill.position.set(-3, 1.5, 2.5); scene.add(fill);
const rimA = new THREE.DirectionalLight(cols[0], 0.0); rimA.position.set(-2.5, 2.6, -3.5); scene.add(rimA);
const rimB = new THREE.DirectionalLight(cols[Math.min(2, cols.length - 1)], 0.0); rimB.position.set(2.6, 2.4, -3.5); scene.add(rimB);

// пол: тёмный диск с мягким цветным пятном и кольцами
function radialTex(stops, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// арена: трибуны, прожекторы, арка-ворота, золотой обод и пол (stage.js)
const stage = buildStage(scene, cols);
const floor = stage.floor;
const glow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(255,255,255,0.55)'], [0.35, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]), color: cols[0], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
glow.rotation.x = -Math.PI / 2; glow.position.y = 0.004; scene.add(glow);
const rings = [0.7, 1.15].map((r, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.025, 96), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.006; scene.add(m); return m; });
// тени-пятна под стопами и телом (дешевле карты теней и мягче на телефоне)
const blobTex = radialTex([[0, 'rgba(0,0,0,0.75)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']], 128);
const blob = (s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.008; scene.add(m); return m; };
const blobs = { body: blob(0.9), L: blob(0.34), R: blob(0.34) };

// частицы: медленная пыль в цвете редкости + всплеск при раскрытии
const N = 520;
const pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(N * 3), pCol = new Float32Array(N * 3), pSeed = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  pSeed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  const c = cols[i % cols.length]; pCol.set([c.r, c.g, c.b], i * 3);
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dot = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 64);
const pMat = new THREE.PointsMaterial({ size: 0.05, map: dot, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
scene.add(new THREE.Points(pGeo, pMat));
function updateParticles(t) {
  const burst = t - T.FLASH;
  for (let i = 0; i < N; i++) {
    const [a, b, c, d] = [pSeed[i * 4], pSeed[i * 4 + 1], pSeed[i * 4 + 2], pSeed[i * 4 + 3]];
    const life = (t * (0.05 + 0.08 * d) + a) % 1;
    let x = (b - 0.5) * 7, y = life * 5.5, z = -6 + c * 7.5;
    x += Math.sin(t * 0.6 + a * 20) * 0.25;
    if (burst > 0 && i < 220) { // всплеск: разлёт от центра раскрытия
      const k = 1 - Math.exp(-burst * 2.4), ang = a * Math.PI * 2, el = (b - 0.3) * 1.6;
      x = Math.cos(ang) * (0.2 + 3.2 * k * (0.4 + c)); y = 1.6 + el * 2.2 * k + Math.sin(ang * 3) * 0.2 - burst * burst * 0.08; z = -1.2 + Math.sin(ang) * 1.5 * k;
    }
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  }
  pGeo.attributes.position.needsUpdate = true;
}

// ---------- тайминг ----------
// основной сценарий ≈ 8 с до кнопок: по ~0,85 с на нацию, позицию и клуб, затем раскрытие и выход
const T = { SIL: 0.15, NAT: 0.45, POS: 1.3, CLUB: 2.15, FLASH: 3.0, DOCK: 3.6, WALK: 3.8 };
let plan = null, rig = null;

// часы: реальное время, но с паузой, если 3D ещё грузится к моменту выхода игрока
let clock0 = performance.now(), held = 0, holdFrom = null, frozen = null;
const now = () => (frozen !== null ? frozen : (performance.now() - clock0) / 1000 - held);
function restart() { clock0 = performance.now(); held = 0; holdFrom = null; frozen = null; setUI('play'); resetMeter(); }
function skip() { if (!rig) return; frozen = null; clock0 = performance.now() - (plan.tEnd + 3) * 1000; held = 0; holdFrom = null; }

// ---------- карточка и этапы (HTML поверх 3D, текст чёткий) ----------
const card = $('#card'), beat = $('#beat');
function buildCard() {
  const r = RESULT;
  card.className = 'jc ' + r.rarity + (r.test ? ' test' : '');
  document.body.style.setProperty('--c1', RC.c[0]); card.style.setProperty('--c1', RC.c[0]); card.style.setProperty('--c2', RC.c[1]); card.style.setProperty('--c3', RC.c[2] || RC.c[0]);
  const crest = r.club && CAT.crests[r.club];
  card.querySelector('.jc-r b').textContent = r.rating == null ? '??' : r.rating;
  card.querySelector('.jc-r small').textContent = r.pos || '—';
  card.querySelector('.jc-flag').style.background = FLAGS[r.nation] || '#444';
  card.querySelector('.jc-crest').innerHTML = r.crest ? `<img src="${r.crest}" alt="">` : crest ? `<img src="../../img/clubs/${crest}" alt="">` : (r.hero ? '<b>ГЕРОЙ</b>' : '');
  if (r.face) card.querySelector('.jc-ph').style.backgroundImage = `url("${r.face}")`; // тот же портрет, что на карточке в игре
  card.querySelector('.jc-name').textContent = surname(r.name).toUpperCase();
  card.querySelector('.jc-rar').textContent = RC.n + (r.test ? ' · ТЕСТ' : '');
  $('#src').textContent = 'Данные: ' + r.src;
}
const BEATS = [
  { t: T.NAT, k: 'nat', label: 'НАЦИЯ', html: () => `<i class="bflag" style="background:${FLAGS[RESULT.nation] || '#333'}"></i><b>${RESULT.nation || '—'}</b>` },
  { t: T.POS, k: 'pos', label: 'ПОЗИЦИЯ', html: () => `<b class="big">${RESULT.pos || '—'}</b>${RESULT.pos ? '' : '<small>нет в каталоге</small>'}` },
  { t: T.CLUB, k: 'club', label: RESULT.series ? 'СЕРИЯ' : RESULT.hero ? 'КАРТОЧКА' : 'КЛУБ', html: () => {
    if (RESULT.series) return `${RESULT.crest ? `<img class="bcrest" src="${RESULT.crest}" alt="">` : ''}<b class="ser">${RESULT.series}</b>`;
    const crest = RESULT.club && CAT.crests[RESULT.club];
    if (RESULT.hero) return '<b class="big">ГЕРОЙ</b>';
    return RESULT.club ? `${crest ? `<img class="bcrest" src="../../img/clubs/${crest}" alt="">` : ''}<b>${RESULT.club}</b>` : '<b class="big">—</b><small>тестовая карточка</small>';
  } },
];
let beatShown = -1;
let SAT = 0; // вырез экрана сверху (iPhone)
const readSat = () => { SAT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0; };
readSat(); addEventListener('resize', readSat);
const easeBack = (x) => { x = Math.min(1, Math.max(0, x)); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
// где стоит карточка: по центру (раскрытие) и у края (пока игрок выходит) — лицо игрока она не закрывает
function cardRect(dock) {
  const W = innerWidth, H = innerHeight, portrait = H > W * 1.1;
  if (!dock) { const w = Math.min(0.62 * W, 280, 0.42 * H * 0.72); return { w, x: W / 2, y: 0.52 * H, r: 0 }; }
  if (portrait) { const w = Math.min(0.3 * W, 150); return { w, x: W - w / 2 - 0.04 * W, y: Math.max(12, SAT) + 0.04 * H + w / 0.72 / 2, r: 3 }; }
  const w = Math.min(0.22 * W, 250, 0.62 * H * 0.72); return { w, x: W - w / 2 - 0.07 * W, y: 0.47 * H, r: 3 };
}
function updateHTML(t) {
  // этапы раскрытия: каждый — отдельный акцент (появление с отскоком, затем уход)
  const i = BEATS.findIndex((b, j) => t >= b.t && t < (BEATS[j + 1] ? BEATS[j + 1].t : T.FLASH - 0.1));
  if (i !== beatShown) {
    beatShown = i;
    if (i >= 0) { beat.innerHTML = `<small class="blab">${BEATS[i].label}</small>${BEATS[i].html()}`; beat.className = 'beat ' + BEATS[i].k; }
  }
  if (i >= 0) {
    const b0 = BEATS[i].t, b1 = BEATS[i + 1] ? BEATS[i + 1].t : T.FLASH - 0.1;
    const op = Math.min(smooth((t - b0) / 0.3), 1 - smooth((t - (b1 - 0.22)) / 0.22));
    beat.style.opacity = op.toFixed(3);
    beat.style.transform = `translate(-50%, -50%) scale(${(0.86 + 0.14 * easeBack((t - b0) / 0.55)).toFixed(4)})`;
  } else beat.style.opacity = '0';
  // силуэт → свечение → вспышка → лицо карточки → к краю
  const st = t < T.SIL ? 'off' : t < T.FLASH ? 'sil' : t < T.DOCK ? 'face' : 'dock';
  if (card.dataset.st !== st) card.dataset.st = st;
  const k = smoother((t - T.DOCK) / 0.9), A = cardRect(false), Bd = cardRect(true);
  const w = A.w + (Bd.w - A.w) * k, x = A.x + (Bd.x - A.x) * k, y = A.y + (Bd.y - A.y) * k;
  const pop = 0.92 + 0.08 * easeBack((t - T.FLASH) / 0.5); // карточка «выстреливает» при вспышке
  card.style.setProperty('--w', w.toFixed(1) + 'px');
  card.style.left = x.toFixed(1) + 'px'; card.style.top = y.toFixed(1) + 'px';
  card.style.transform = `translate(-50%, -50%) rotate(${(Bd.r * k).toFixed(2)}deg) scale(${pop.toFixed(4)})`;
  card.style.opacity = smooth((t - T.SIL) / 0.4).toFixed(3);
  card.querySelector('.jc-face').style.opacity = smooth((t - T.FLASH + 0.04) / 0.18).toFixed(3);
  card.style.setProperty('--charge', smooth((t - T.SIL) / (T.FLASH - T.SIL)).toFixed(3));
  const fl = Math.max(0, 1 - Math.abs(t - T.FLASH) / 0.22);
  $('#flash').style.opacity = (fl * fl).toFixed(3);
  const end = rig && t > plan.tEnd + 1.3;
  setUI(end ? 'end' : 'play');
  $('#loading').hidden = !(holdFrom !== null);
}
let uiState = '';
function setUI(s) { if (s === uiState) return; uiState = s; document.body.dataset.ui = s; }

// ---------- камера ----------
// Кадр строится по реальным габаритам позы (рост с головой, размах рук при праздновании), поэтому
// голова и стопы всегда целиком. Игрок — в левой/центральной части, карточка справа сверху (портрет) или справа (альбом).
function layout() {
  const w = innerWidth, h = innerHeight, portrait = h > w * 1.1;
  return portrait ? { w, h, portrait, cx: 0.45, top: 0.1, bottom: 0.15, side: 0.43 } : { w, h, portrait, cx: 0.36, top: 0.08, bottom: 0.14, side: 0.3 };
}
function fitDistance(L) {
  const vf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), aspect = L.w / L.h;
  const ext = rig ? rig.ext : { top: 2.0, half: 0.7 };
  const dV = (ext.top * 1.04) / (2 * vf * (1 - L.top - L.bottom));
  const dH = (ext.half * 1.08) / (2 * vf * aspect * L.side);
  return Math.max(dV, dH);
}
function placeCamera(t) {
  const L = layout();
  camera.aspect = L.w / L.h;
  const d = fitDistance(L);
  // смещение проекции: центр игрока в L.cx по ширине и посередине между резервами по высоте
  camera.setViewOffset(L.w, L.h, (0.5 - L.cx) * L.w, ((L.bottom - L.top) / 2) * L.h, L.w, L.h);
  const pz = rig ? rig.B.root.position.z - rig.rest.root.p.z : -2.3;
  const walk = plan ? smoother((t - plan.t0) / (plan.tEnd - plan.t0)) : 0;
  const settle = plan ? smoother((t - plan.tEnd + 0.6) / 1.6) : 0;
  const yaw = THREE.MathUtils.degToRad(22 * (1 - settle) + 8 * settle);
  const intro = 1 - smoother((t - T.SIL) / (T.WALK + 0.6)); // медленный наезд из глубины на этапах раскрытия
  const dist = d * (1 + 0.5 * intro) * (1.03 - 0.03 * settle);
  const g = rig ? rig.groundY : 0, top = rig ? rig.ext.top : 2.0;
  const lookY = g + top * 0.5;
  const camY = lookY + top * (0.03 + 0.05 * (1 - walk));
  // камера отъезжает за игроком не полностью — он заметно приближается к зрителю, но в кадре остаётся целиком
  const z = pz * 0.45;
  camera.position.set(Math.sin(yaw) * dist, camY, z + Math.cos(yaw) * dist);
  camera.lookAt(0, lookY, pz); // смотрим на самого игрока: он держится в своей точке кадра, а не уезжает к карточке
  if (DEBUG_CAM) { // отладка: вид сбоку/спереди на одной дистанции, чтобы оценивать походку
    const a = DEBUG_CAM === 'side' ? Math.PI / 2 : DEBUG_CAM === 'back' ? Math.PI : 0;
    camera.clearViewOffset();
    camera.position.set(Math.sin(a) * 6.5, lookY, pz + Math.cos(a) * 6.5); camera.lookAt(0, lookY, pz);
  }
  camera.updateProjectionMatrix();
}
const DEBUG_CAM = Q.get('cam'); // ?cam=side|front|back — только для проверки движения

// ---------- кадр ----------
let last = performance.now(), fpsAvg = 60;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dtReal = (nowMs - last) / 1000; last = nowMs; fpsAvg = fpsAvg * 0.95 + (1 / Math.max(1e-3, dtReal)) * 0.05;
  let t = now();
  // 3D ещё грузится, а пора выходить игроку — придерживаем сцену на раскрытой карточке
  if (!rig && frozen === null && t > T.WALK) { held += t - T.WALK; t = T.WALK; holdFrom = t; } else holdFrom = null;
  render(t);
  if (FPS_ON) fpsMeter(dtReal * 1000, t);
}
// ?fps=1 — замер плавности НА САМОМ УСТРОЙСТВЕ: реальные интервалы между кадрами за проход сцены.
// Медленный кадр — дольше 25 мс (заметно при 60 Гц), рывок — дольше 50 мс.
const FPS_ON = Q.get('fps') === '1';
let fm = { n: 0, sum: 0, slow: 0, jank: 0, worst: 0, list: [], shownAt: 0 };
function fpsMeter(ms, t) {
  if (frozen !== null || t < T.SIL || ms > 1000) return;
  fm.n++; fm.sum += ms; fm.list.push(ms); if (ms > 25) fm.slow++; if (ms > 50) fm.jank++; fm.worst = Math.max(fm.worst, ms);
  if (performance.now() - fm.shownAt < 500) return;
  fm.shownAt = performance.now();
  const sorted = fm.list.slice().sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const el = $('#fpsbox');
  el.hidden = false;
  el.textContent = `кадров ${fm.n} · средн. ${(1000 / (fm.sum / fm.n)).toFixed(0)} к/с · 95% ≤ ${p95.toFixed(0)} мс · медленных ${fm.slow} · рывков ${fm.jank} · худший ${fm.worst.toFixed(0)} мс · DPR ${DPR}`;
}
const resetMeter = () => { fm = { n: 0, sum: 0, slow: 0, jank: 0, worst: 0, list: [], shownAt: 0 }; };
function render(t) {
  const charge = smooth((t - T.SIL) / (T.FLASH - T.SIL)), after = smooth((t - T.FLASH) / 0.6);
  hemi.intensity = 0.25 + 0.55 * after; key.intensity = 2.6 * smooth((t - T.WALK) / 1.2); fill.intensity = 0.6 * after;
  rimA.intensity = rimB.intensity = 0.6 + 2.6 * Math.max(charge, after);
  stage.update(t, { charge, after, flash: Math.max(0, 1 - Math.abs(t - T.FLASH) / 0.5), walk: plan ? smooth((t - plan.t0) / 1.2) : 0 });
  glow.material.opacity = 0.18 + 0.5 * charge - 0.1 * after;
  rings.forEach((r, i) => { r.material.opacity = (rig && plan ? smooth((t - plan.tEnd) / 0.8) : 0) * (0.55 - i * 0.2); r.scale.setScalar(1 + 0.03 * Math.sin(t * 1.4 + i)); });
  pMat.opacity = 0.25 + 0.55 * charge; updateParticles(t);
  if (rig) {
    const info = pose(rig, plan, t);
    const vis = smooth((t - T.WALK - 0.1) / 0.7); // выходит из темноты, когда карточка уже ушла к краю
    rig.mats.forEach((m) => { m.opacity = vis; m.transparent = vis < 0.999; m.depthWrite = vis > 0.5; });
    const v = new THREE.Vector3();
    ['L', 'R'].forEach((s) => { rig.B['foot.' + s].getWorldPosition(v); blobs[s].position.set(v.x, 0.008, v.z + 0.04); blobs[s].material.opacity = vis * Math.max(0.2, 1 - (v.y - rig.ankleY) * 8); });
    rig.B.pelvis.getWorldPosition(v); blobs.body.position.set(v.x, 0.007, v.z); blobs.body.material.opacity = vis * 0.8;
    glow.position.set(0, 0.004, info.z * 0.25);
  }
  placeCamera(t);
  updateHTML(t);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.render(scene, camera);
}

// ---------- загрузка 3D (по требованию, параллельно этапам раскрытия) ----------
const MODEL = Q.get('model') || 'balotelli-mobile.glb';
const loadT0 = performance.now();
async function loadModel() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL);
  const model = gltf.scene; // встроенный клип (финты с мячом) не используем
  const mats = [];
  model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; if (m) { m.transparent = true; m.fog = false; mats.push(m); } } });
  scene.add(model);
  // у модели пол на y = −1 (так экспортировано): ставим стопы на пол сцены
  model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); });
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  model.updateMatrixWorld(true);
  const r = createRig(model);
  r.mats = mats;
  window.__loadMs = Math.round(performance.now() - loadT0);
  // портрет для карточки — снимок лица этой же 3D-модели (никаких выдуманных фото)
  if (!RESULT.face) portrait(r);
  plan = planWalk(r, { t0: T.WALK, startZ: -2.3 * r.height / 1.9, endZ: 0 });
  r.ext = extents(r, plan);
  rig = r; window.__rig = r;
  $('#stat').textContent = `${MODEL} · загрузка ${window.__loadMs} мс`;
}
// габариты в финальной части (празднование и ожидание): высота макушки над полом и половина размаха рук
function extents(r, pl) {
  const v = new THREE.Vector3(); let top = 0, half = 0;
  for (let t = pl.tEnd - 0.5; t < pl.tEnd + 6; t += 0.1) {
    pose(r, pl, t);
    const root = r.B.root.getWorldPosition(new THREE.Vector3());
    top = Math.max(top, r.B.head.getWorldPosition(v).y - r.groundY + 0.15 * r.height / 1.9);
    ['hand.L', 'hand.R', 'forearm.L', 'forearm.R'].forEach((n) => { half = Math.max(half, Math.abs(r.B[n].getWorldPosition(v).x - root.x) + 0.07 * r.height / 1.9); });
  }
  pose(r, pl, 0);
  return { top, half };
}
function portrait(r) {
  const cam = new THREE.PerspectiveCamera(22, 0.8, 0.05, 10);
  const head = r.B.head.getWorldPosition(new THREE.Vector3());
  cam.position.set(head.x + 0.1, head.y + 0.03, head.z + 1.5); cam.lookAt(head.x, head.y - 0.03, head.z);
  const rt = new THREE.WebGLRenderTarget(320, 400, { samples: 4 });
  const prevBg = scene.background, prevFog = scene.fog;
  scene.background = null; scene.fog = null; stage.group.visible = false;
  const saved = [key.intensity, hemi.intensity, fill.intensity]; key.intensity = 3.4; hemi.intensity = 1.4; fill.intensity = 1.2;
  r.mats.forEach((m) => { m.opacity = 1; m.transparent = false; });
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  const px = new Uint8Array(320 * 400 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 320, 400, px);
  renderer.setRenderTarget(null);
  [key.intensity, hemi.intensity, fill.intensity] = saved; scene.background = prevBg; scene.fog = prevFog; stage.group.visible = true;
  const c = document.createElement('canvas'); c.width = 320; c.height = 400; const g = c.getContext('2d'); const img = g.createImageData(320, 400);
  for (let y = 0; y < 400; y++) img.data.set(px.subarray((399 - y) * 320 * 4, (400 - y) * 320 * 4), y * 320 * 4);
  g.putImageData(img, 0, 0);
  card.querySelector('.jc-ph').style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  rt.dispose();
}

// ---------- кнопки ----------
$('#skip').onclick = skip;
$('#replay').onclick = restart;
if (EMBED) { document.body.classList.add('embed'); $('#cont').textContent = 'К карточке'; }
$('#cont').onclick = EMBED ? () => parent.postMessage({ walkout: 'done' }, '*') : () => { $('#toast').textContent = 'В игре здесь — возврат к открытию паков. Награда уже выдана до начала сцены.'; $('#toast').classList.add('on'); setTimeout(() => $('#toast').classList.remove('on'), 2600); };

buildCard();
requestAnimationFrame(frame);
loadModel().catch((e) => { $('#stat').textContent = 'Ошибка 3D: ' + e.message; console.error(e); });

// ---------- для проверок ----------
window.__seek = (t) => { frozen = t; };
window.__dbg = { scene, floor, glow, rings, stage, blobs, camera };
window.__play = () => { const t = frozen || 0; frozen = null; clock0 = performance.now() - t * 1000; held = 0; };
window.__ready = () => !!rig;
window.__T = () => ({ ...T, tEnd: plan && plan.tEnd, steps: plan && plan.steps.length, H: rig && rig.height, ext: rig && rig.ext });
window.__fps = () => Math.round(fpsAvg);
window.__probe = (t0, t1, dt) => {
  const out = [], v = new THREE.Vector3();
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    pose(rig, plan, t);
    const f = (n) => rig.B[n].getWorldPosition(v).toArray();
    const ang = (a, b, c) => { const A = new THREE.Vector3(...f(a)), Bp = new THREE.Vector3(...f(b)), C = new THREE.Vector3(...f(c)); return THREE.MathUtils.radToDeg(A.sub(Bp).angleTo(C.sub(Bp))); };
    out.push({ t, L: f('foot.L'), R: f('foot.R'), P: f('pelvis'), Hd: f('head'), root: f('root'), kneeL: ang('thigh.L', 'shin.L', 'foot.L'), kneeR: ang('thigh.R', 'shin.R', 'foot.R'), elbowL: ang('upper_arm.L', 'forearm.L', 'hand.L'), elbowR: ang('upper_arm.R', 'forearm.R', 'hand.R') });
  }
  return out;
};
// где на экране голова, стопы, карточка и надписи (для проверки, что ничего не обрезано и не перекрыто)
window.__frameCheck = () => {
  const v = new THREE.Vector3(), W = innerWidth, Hh = innerHeight;
  const scr = (n, dy = 0) => { rig.B[n].getWorldPosition(v); v.y += dy; v.project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * Hh]; };
  const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  return { W, H: Hh, headTop: scr('head', 0.14 * rig.height / 1.9), head: scr('head', 0.05), footL: scr('foot.L', -0.09), footR: scr('foot.R', -0.09), handL: scr('hand.L'), handR: scr('hand.R'), card: rect(card), beat: rect(beat), buttons: rect($('.bar')) };
};
