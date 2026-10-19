// «Удар» — проба: сам бьёшь штрафные и пенальти. Свайп по экрану = удар: куда отпустил палец — туда летит мяч,
// быстрее свайп — сильнее удар, изогнул линию — мяч закрутится. Вратарь прыгает, стенка подпрыгивает.
// Характеристика «Удар» карточки (?st=85) меняет точность: чем выше, тем меньше разброс.
// Игроки — персонаж Mixamo «Ch38» со скелетом Mixamo и записанными движениями (assets/player.glb, tools/anim).
// Форма перекрашивается по частям: футболка, шорты, гетры (?kit=футболка.шорты.гетры).
// Стадион: дневное небо (?night=1 — ночь), ярусы трибун с болельщиками (один InstancedMesh, движение в шейдере), прожекторы.
// Режимы: штрафной, пенальти, «1 на 1» (джойстик + кнопки, ?mode=run). Параметры: ?name=МЕССИ&num=10&kit=75aadb.ffffff.ffffff.16192a&st=93&mode=pen&face=img/players/<id>.webp&low=1
import * as THREE from 'three';
import { GLTFLoader } from '../balotelli/vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../balotelli/vendor/meshopt_decoder.module.js';
import { clone as cloneSkinned } from '../balotelli/vendor/utils/SkeletonUtils.js';
import * as sfx from './sfx.js';
import * as BP from './ballphys.js';
import { BASELINE } from './cfg-baseline.js';
// ?cfg=baseline — исходные настройки физики и ведения (для сравнения «было/стало» на телефоне)
if (new URLSearchParams(location.search).get('cfg') === 'baseline') for (const k of Object.keys(BASELINE)) {
  if (k === 'keeper') Object.assign(BP.CFG.keeper, BASELINE.keeper); else BP.CFG[k] = JSON.parse(JSON.stringify(BASELINE[k]));
}
import * as GFX from './gfx.js';
import { buildStadium } from './stadium-lite.js';
import { buildTraining } from './training.js'; // окружение тренировочной базы для вида «2 на 1» // лёгкий стадион: чаша с текстурой болельщиков (прежний stadium.js не загружается)
import { gestureButton } from './controls.js'; // кнопки с жестами (нажал / держишь / оттянул палец) // чаша стадиона, трибуны, болельщики, щиты // профили качества и внешний вид сцены (свет, газон, материалы) // физика мяча, ведение, удар — единый конфиг BP.CFG

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'ИГРОК').toUpperCase().slice(0, 14);
// тренировки для новичка (как «Развитие навыков» в FC Mobile): основы управления, гонка с дриблингом, удары по мишеням
const LESSON = ['basics', 'dribble', 'targets'].includes(Q.get('lesson')) ? Q.get('lesson') : null;
let MODE = LESSON ? { basics: 'duo', dribble: 'run', targets: 'fk' }[LESSON] : ['pen', 'run', 'duo', 'match'].includes(Q.get('mode')) ? Q.get('mode') : 'fk';
const FREE = () => MODE === 'run' || MODE === 'duo' || MODE === 'match'; // свободная игра: «1 на 1», «2 на 1» и матч
const MATCH_ON = MODE === 'match';
const EMBED = Q.get('embed') === '1' && window.parent !== window; // открыто внутри хаба (фрейм): выход, «Назад» и вибрация — через хаб
const FROM_MENU = EMBED; // есть куда выйти: кнопки «Пауза» и «Выйти» // «Матч 3 на 3» (экспериментальный): своё поле, двое ворот, шесть игроков; режим на странице не меняется
const TEAM = () => MODE === 'duo' || MODE === 'match'; // есть партнёр: пас, смена
// поле матча: длина (ворота на z = 0 и z = L), половина ширины; время — настоящие секунды
// состав из хаба (?p0…p(N−2) — полевые, последний — вратарь): «имя|рейтинг|шесть характеристик»; нет — «Игрок клуба» 65
const NSIDE = MATCH_ON ? Math.max(2, Math.min(11, Number(Q.get('n')) || 3)) : 3; // игроков в команде (с вратарём): 3 — матч 3 на 3, 11 — пробный 11 на 11
const LINEUP = Array.from({ length: NSIDE }, (_, i) => i).map((i) => { const v = Q.get('p' + i); if (!v) return null; const a = v.split('|'); return { name: a[0].slice(0, 16), r: +a[1] || 65, st: a.slice(2, 8).map((x) => +x || 65), pos: a[8] || '', fx: a[9] !== undefined && a[9] !== '' ? +a[9] : null, fy: a[10] !== undefined && a[10] !== '' ? +a[10] : null }; });
// место в схеме из «Моего состава» (x %, y % на схеме хаба: y = 93 — свои ворота, 16 — чужие) → [x м, глубина]
const hxyOf = (c) => (c && c.fx !== null && c.fy !== null && NSIDE > 3 ? [((c.fx - 50) / 50) * MATCH.HW * 0.8, (100 - c.fy) / 100] : null);
const k01 = (v) => Math.max(0, Math.min(1, ((v || 65) - 60) / 35)); // характеристика 60…95 → 0…1
const MATCH = { L: 105, HW: 34, N: NSIDE, time: Math.max(30, Math.min(900, Number(Q.get('mt')) || (NSIDE > 3 ? 300 : 180))) };
const NIGHT = Q.get('night') === '1'; // по умолчанию — дневной матч
const SHOTS = 5, G = 9.81, R = 0.11, GW = 3.66, GH = 2.44;
let NET_D = 1.5, NET_TOP = 1.5; // глубина сетки внизу и под крышей (ворота-модель — ровная коробка 1,5 м)
const LOW = Q.get('low') === '1' || (navigator.hardwareConcurrency || 4) <= 2; // слабый телефон: без теней, меньше людей
const $ = (s) => document.querySelector(s);
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a, b, t) => a + (b - a) * t;
const AY = new THREE.Vector3(0, 1, 0);

// ---------- рендер ----------
// качество: low / medium / high (gfx.js); «Авто» — по замеру кадров. Сглаживание (MSAA) включено всегда — без него газон и сетка рябят.
let QCHOICE = GFX.savedChoice(); if (LOW && QCHOICE === 'auto') QCHOICE = 'low';
let QL = QCHOICE === 'auto' ? GFX.autoStart() : QCHOICE, PQ = GFX.PROFILES[QL];
const LOOK = GFX.LOOK;
const ren = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(PQ.pixelRatio, devicePixelRatio)); ren.setSize(innerWidth, innerHeight);
ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.NeutralToneMapping; ren.toneMappingExposure = LOOK.exposure;
ren.shadowMap.enabled = PQ.shadows; ren.shadowMap.type = THREE.PCFShadowMap; // PCF учитывает radius — мягкий край без размытия всей тени
document.body.prepend(ren.domElement);
const scene = new THREE.Scene();
scene.fog = NIGHT ? new THREE.Fog('#0d1530', 60, 140) : new THREE.Fog('#c3d4e6', 95, 230);
// горизонтальный экран: угол обзора поуже, чтобы ворота не казались далёкими
// «2 на 1»: камера сбоку и сверху, как в трансляции (?cam=old — прежняя камера за спиной игрока, для сравнения)
// вид «2 на 1»: ?look=a (по умолчанию) | b | old (прежний); ?cam=old — прежняя камера за спиной
const LOOKSEL = ['a', 'b', 'old'].includes(Q.get('look')) ? Q.get('look') : 'a';
const DUO_OLD = Q.get('cam') === 'old', TV = () => (MODE === 'duo' || MODE === 'match' || LESSON === 'dribble') && !DUO_OLD, BALL_TV = 1.2; // мяч на экране чуть крупнее в виде с трибуны (камера далеко)
// Камера «с трибуны»: ~42° сверху, ~66 м до центра кадра, узкий объектив (почти без перспективного растяжения).
// При таком ракурсе «глубина кадра × размер игрока» ≈ 1,8 / tg(наклона): ~24 м поля в глубину и ~35 м в ширину, игрок ~8% высоты кадра.
const CAM_TV = { side: 48.8, h: 44, fov: 14, look: 0, ahead: 7, rate: 2.6, zMin: 1 }; // ~66 м, ~42°: над трибуной; узкий угол — линии поля почти не сходятся
// для подбора (только с ?trace=1): ?tv=side,h,fov,look — камера, ?sun=высота,азимут — солнце «2 на 1»
if (Q.get('trace') === '1' && Q.get('tv')) { const [a, b, c, d] = Q.get('tv').split(',').map(Number); Object.assign(CAM_TV, { side: a, h: b, fov: c, look: d }); }
const fov = () => (innerWidth > innerHeight ? (TV() ? CAM_TV.fov : LESSON === 'targets' ? 27 : { pen: 33, fk: 37, run: 44, duo: 44, match: 44 }[MODE]) : 48); // мишени — уже кадр: ворота крупнее
const cam = new THREE.PerspectiveCamera(fov(), innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = fov(); cam.updateProjectionMatrix(); fitSwipe(); });
// Страница не прокручивается и не «тянется» (иначе вертикальный свайп может свернуть окно). Ловушки истории нет:
// «Назад» браузера работает как обычно; в Telegram «Назад» — его кнопка (см. «пауза, настройки, выход»).
document.addEventListener('touchmove', (e) => { if (e.touches.length) e.preventDefault(); }, { passive: false });
// в Telegram (мини-приложение) — на весь экран и горизонтально
// Ориентацию не закрепляем: lockOrientation закрепляет текущую — если игру открыли, держа телефон вертикально,
// экран потом не поворачивался. Наоборот, снимаем закрепление (если оно осталось), игра просит повернуть телефон сама.
addEventListener('load', () => { if (EMBED) return; const tg = window.Telegram && Telegram.WebApp; if (!tg || !tg.initData) return;
  try { tg.ready(); tg.expand(); tg.unlockOrientation && tg.unlockOrientation(); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) { /* старый Telegram */ } });
// «Во весь экран»: на Android ещё и закрепляем горизонтальный поворот (на iPhone — просто поверни телефон)
document.getElementById('rotBtn').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); await screen.orientation.lock('landscape'); } catch (e) { /* не везде можно */ }
});

// ---------- свет ----------
// Днём: одно солнце с тенью (направление совпадает с солнцем на картинке неба) + рассеянный свет и отражения от самого неба
// (scene.environment). Лишних «заполняющих» ламп нет — они делали картинку плоской. Ночью — прожекторы, как было.
const sunDir = (elev, az) => { const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(az); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize(); };
const SUN = sunDir(LOOK.sun.elevation, LOOK.sun.azimuth); // направление НА солнце
const key = new THREE.DirectionalLight(NIGHT ? '#fff6e6' : LOOK.sun.color, NIGHT ? 2.6 : LOOK.sun.intensity);
key.position.copy(SUN).multiplyScalar(70); key.target.position.set(0, 0, 10); scene.add(key, key.target);
{ const sh = key.shadow; sh.bias = LOOK.shadow.bias; sh.normalBias = LOOK.shadow.normalBias; sh.radius = LOOK.shadow.radius;
  sh.camera.near = 20; sh.camera.far = 130; sh.mapSize.set(PQ.shadowMap || 1024, PQ.shadowMap || 1024); key.castShadow = PQ.shadows; }
const hemi = NIGHT ? new THREE.HemisphereLight('#b9c8ff', '#2d5a24', 0.9) : new THREE.HemisphereLight('#dfe9f5', '#46642f', 0.18); scene.add(hemi); // чуть отражённого от травы снизу
if (NIGHT) {
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.9); fill.position.set(20, 18, 30); scene.add(fill);
}
// область карты теней — только активная игровая зона (чем меньше область, тем чётче тени); центр «прилипает» к сетке
// текселей карты, чтобы края теней не дрожали, когда область едет за игроком
const shadowFit = { size: 0, c: new THREE.Vector3() };
const SH_R = new THREE.Vector3(), SH_U = new THREE.Vector3();
SH_R.crossVectors(AY, SUN).normalize(); SH_U.crossVectors(SUN, SH_R).normalize();
// солнце для режима: в «2 на 1» камера сбоку — солнце из-за камеры и чуть сбоку (игроки освещены спереди, тени короткие и
// уходят от зрителя); в остальных режимах — как на картинке неба
function setSun(elev, az) { SUN.copy(sunDir(elev, az)); SH_R.crossVectors(AY, SUN).normalize(); SH_U.crossVectors(SUN, SH_R).normalize(); shadowFit.size = 0; }
function fitShadow(cx, cz, radius) {
  if (!key.castShadow) return;
  const L = LOOK.shadow, size = Math.max(L.min, Math.min(L.max, radius * 2 + L.pad * 2)), sc = key.shadow.camera;
  if (Math.abs(size - shadowFit.size) > 1) { shadowFit.size = size; sc.left = sc.bottom = -size / 2; sc.right = sc.top = size / 2; sc.updateProjectionMatrix(); }
  const texel = shadowFit.size / key.shadow.mapSize.x, c = shadowFit.c.set(cx, 0, cz);
  const r = Math.round(c.dot(SH_R) / texel) * texel, u = Math.round(c.dot(SH_U) / texel) * texel, f = c.dot(SUN);
  c.copy(SH_R).multiplyScalar(r).addScaledVector(SH_U, u).addScaledVector(SUN, f);
  key.target.position.copy(c); key.position.copy(c).addScaledVector(SUN, 70);
}

// ---------- небо ----------
if (NIGHT) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#04060f'); gr.addColorStop(0.55, '#0e1838'); gr.addColorStop(1, '#2a3a74');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
} else {
  // дневное небо: ambientCG DaySkyHDRI069B (CC0) — и фон, и рассеянный свет/отражения. Поворачиваем так, чтобы солнце
  // на картинке стояло там же, откуда светит наше солнце (иначе тени «не оттуда»)
  new THREE.TextureLoader().load('assets/sky.webp', (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    const rot = Math.atan2(-SUN.z, SUN.x) - THREE.MathUtils.degToRad(LOOK.skyAzimuth);
    scene.background = t; scene.backgroundRotation.set(0, rot, 0); scene.environmentRotation.set(0, rot, 0);
    const pm = new THREE.PMREMGenerator(ren); scene.environment = pm.fromEquirectangular(t).texture; scene.environmentIntensity = LOOK.env; pm.dispose();
  });
}

// ---------- газон ----------
// Газон — одна плоскость под всем стадионом. Полосы стрижки, крупные пятна и мелкая трава считаются в шейдере
// по мировым координатам (без отдельной плоскости вокруг поля — нет наложения поверхностей и мерцания).
// Разметка — отдельная маска (холст), краска смешивается с травой, а не лежит чистым белым.
// Цветовая текстура травы — sRGB, карта нормалей — данные (без перевода цвета). Мипмапы и анизотропия — против ряби.
function smoothNoise(n = 128, cells = 8, seed = 7) { // плавный бесшовный шум для крупных пятен
  let s0 = seed; const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
  const grid = Array.from({ length: cells * cells }, rnd), c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), at = (x, y) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)];
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = (x / n) * cells, fy = (y / n) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const v = lerp(lerp(at(ix, iy), at(ix + 1, iy), tx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty), i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// параметры газона живут в одном объекте: для «2 на 1» (вид сверху) — своя, более спокойная палитра (LOOK.pitchTV)
const pitchU = {};
function pitchLook(tv) {
  if (!pitchU.gp) return; const P = LOOK.pitch, L = tv && TVL(), T = tv ? Object.assign({}, P, LOOK.pitchTV, L ? L.pitch : null) : P;
  pitchU.gp2.value.y = L ? L.paint : P.paint.match(/[\d.]+/g).map(Number)[3];
  pitchU.stripeA.value.set(T.stripeA); pitchU.stripeB.value.set(T.stripeB); pitchU.gp.value.set(T.stripeWidth, T.macro, T.detail, T.paintDetail); pitchU.gp2.value.z = T.far || 0;
}
// вид «2 на 1» (пресет из gfx.js) или обычный: экспозиция, свет, тени, камера, окружение (тренировочная база / стадион)
const TVL = () => (TV() && LOOKSEL !== 'old' ? GFX.TV_LOOKS[LOOKSEL] : null);
const CAM_TV_OLD = {};
let training = null;
function tvLook() {
  const L = TVL();
  if (!CAM_TV_OLD.side) Object.assign(CAM_TV_OLD, CAM_TV);
  Object.assign(CAM_TV, CAM_TV_OLD, TV() ? TV_CAMS[tvCamSel] : null); // камера — по выбору «Камера», не по пресету вида
  cam.fov = fov(); cam.updateProjectionMatrix();
  ren.toneMappingExposure = L ? L.exposure : LOOK.exposure; scene.environmentIntensity = L ? L.env : LOOK.env; hemi.intensity = NIGHT ? 0.9 : L ? L.hemi : 0.18;
  if (!NIGHT) { key.color.set(L ? L.sun.color : LOOK.sun.color); key.intensity = L ? L.sun.intensity : LOOK.sun.intensity; }
  key.shadow.radius = L ? L.shadowRadius : LOOK.shadow.radius;
  if (!training) training = buildTraining(scene, Object.assign({ aniso: Math.min(PQ.aniso, ren.capabilities.getMaxAnisotropy()) }, MATCH_ON ? { X: MATCH.HW + 7, Z0: -6.5, Z1: MATCH.L + 6.5, trees: [MATCH.HW + 45, -36, MATCH.L + 36] } : null));
  const tr = !!(L && L.envKind === 'training'); if (training) training.visible = tr; if (STADIUM) STADIUM.group.visible = !tr;
}
function pitch() {
  // полное поле 105×68 м: от линии наших ворот (z = 0) до дальней (z = 105), бровки x = ±34; одна система координат для всей разметки
  const P = LOOK.pitch, X0 = -40, X1 = 40, Z0 = -8, Z1 = 113, S = PQ.pitchRes, c = document.createElement('canvas');
  c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
  const g = c.getContext('2d'), px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = g.fillStyle = '#fff'; g.lineWidth = 0.12 * S; // линии 12 см, как на настоящем поле
  const rect = (x0, z0, x1, z1) => g.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
  // матч 3 на 3 — маленькое поле MATCH.L × 2·MATCH.HW с уменьшенной разметкой; иначе — полное 105×68
  const F = { L: MATCH_ON ? MATCH.L : 105, HW: MATCH_ON ? MATCH.HW : 34, box: [20.16, 16.5], area: [9.16, 5.5], spot: 11, arc: 9.15, circle: 9.15 }; // размеры по правилам FIFA (как в FC Mobile)
  const L = F.L, HW = F.HW, ends = [[0, 1], [L, -1]]; // каждая половина: линия ворот и направление в поле
  for (const [gz, dir] of ends) {
    const z = (d) => gz + dir * d;
    g.beginPath(); g.moveTo(px(-HW), pz(gz)); g.lineTo(px(HW), pz(gz)); g.stroke(); // линия ворот — только между угловыми флажками
    rect(-F.box[0], Math.min(z(0), z(F.box[1])), F.box[0], Math.max(z(0), z(F.box[1]))); rect(-F.area[0], Math.min(z(0), z(F.area[1])), F.area[0], Math.max(z(0), z(F.area[1]))); // штрафная и вратарская
    g.beginPath(); g.arc(px(0), pz(z(F.spot)), 0.11 * S, 0, 7); g.fill(); // точка пенальти — 22 см
    if (F.arc) { const a = Math.asin((F.box[1] - F.spot) / F.arc); g.beginPath(); if (dir > 0) g.arc(px(0), pz(z(F.spot)), F.arc * S, a, Math.PI - a); else g.arc(px(0), pz(z(F.spot)), F.arc * S, Math.PI + a, 2 * Math.PI - a); g.stroke(); } // дуга штрафной
    for (const sx of [-1, 1]) { const a0 = Math.atan2(dir, -sx); g.beginPath(); g.arc(px(sx * HW), pz(gz), 1 * S, a0 - Math.PI / 4, a0 + Math.PI / 4); g.stroke(); } // угловые дуги (внутрь поля)
  }
  g.beginPath(); g.moveTo(px(-HW), pz(0)); g.lineTo(px(-HW), pz(L)); g.moveTo(px(HW), pz(0)); g.lineTo(px(HW), pz(L)); g.stroke(); // боковые линии
  g.beginPath(); g.moveTo(px(-HW), pz(L / 2)); g.lineTo(px(HW), pz(L / 2)); g.stroke(); // средняя линия
  g.beginPath(); g.arc(px(0), pz(L / 2), F.circle * S, 0, 2 * Math.PI); g.stroke(); g.beginPath(); g.arc(px(0), pz(L / 2), 0.15 * S, 0, 7); g.fill(); // центральный круг и точка
  const lines = new THREE.CanvasTexture(c); lines.anisotropy = ren.capabilities.getMaxAnisotropy(); // маска: данные, без перевода цвета
  const tl = new THREE.TextureLoader();
  const gN = tl.load('assets/grass3_n.webp'), gC = tl.load('assets/grass3.webp'), noise = smoothNoise(); // Grass003 (ambientCG, CC0)
  for (const x of [gN, gC]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = Math.min(PQ.aniso, ren.capabilities.getMaxAnisotropy()); }
  gC.colorSpace = THREE.SRGBColorSpace; // цвет — sRGB; нормали (gN) — линейные данные
  const W = 220, rep = W / 2.2; gN.repeat.set(rep, rep);
  const pm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: P.roughness, normalMap: gN, normalScale: new THREE.Vector2(P.normal, P.normal) });
  const col = (h) => new THREE.Color(h); // THREE.Color сам переводит sRGB → линейный
  const paint = P.paint.match(/[\d.]+/g).map(Number);
  Object.assign(pitchU, { grassC: { value: gC }, noiseT: { value: noise }, lineT: { value: lines },
    stripeA: { value: col(P.stripeA) }, stripeB: { value: col(P.stripeB) }, paintC: { value: col(`rgb(${paint[0]},${paint[1]},${paint[2]})`) },
    gp: { value: new THREE.Vector4(P.stripeWidth, P.macro, P.detail, P.paintDetail) }, gp2: { value: new THREE.Vector4(P.detailMean, paint[3], 0, 0) },
    lineBox: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) } });
  pm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, pitchU);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vW;\nuniform sampler2D grassC, noiseT, lineT;\nuniform vec3 stripeA, stripeB, paintC;\nuniform vec4 gp, gp2, lineBox;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `
  vec2 wp = vW.xz;
  // полосы стрижки поперёк поля, со сглаженным краем (без «лесенки» вдали)
  float sx = (wp.y + 8.0) / gp.x, aa = fwidth(sx) * 1.5;
  float stripe = smoothstep(0.5 - aa, 0.5 + aa, abs(fract(sx * 0.5) * 2.0 - 1.0));
  vec3 base = mix(stripeA, stripeB, stripe);
  // крупные мягкие пятна (20–60 м) — убирают повторяемость, а не добавляют шум
  float m1 = texture2D(noiseT, wp * 0.019).r, m2 = texture2D(noiseT, wp * 0.0071 + 0.37).r;
  base *= 1.0 + gp.y * ((m1 - 0.5) * 1.3 + (m2 - 0.5) * 0.9);
  // мелкая трава: две выборки в разном масштабе и повороте — повтор плитки не читается
  vec3 d1 = texture2D(grassC, wp / 2.2).rgb, d2 = texture2D(grassC, mat2(0.8, -0.6, 0.6, 0.8) * wp / 3.7).rgb;
  float lum = dot(mix(d1, d2, 0.45), vec3(0.2126, 0.7152, 0.0722)) / gp2.x;
  // разметка — краска: чуть приглушённый белый, сквозь неё немного видна трава
  vec2 luv = (wp - lineBox.xy) / lineBox.zw;
  float inside = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
  float pnt = texture2D(lineT, vec2(luv.x, 1.0 - luv.y)).r * inside * gp2.y;
  vec3 c = mix(base, paintC, pnt);
  c *= mix(1.0, clamp(lum, 0.45, 1.6), gp.z * mix(1.0, gp.w, pnt));
  // вдали — чуть темнее и спокойнее (воздух, как в трансляции): поле не «светится» одинаково до горизонта
  float far = smoothstep(25.0, 95.0, distance(cameraPosition.xz, wp)) * gp2.z;
  c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), far * 0.6) * (1.0 - far * 0.5);
  diffuseColor.rgb *= c;`);
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W), pm);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0, 20); m.receiveShadow = true; scene.add(m);
}

// ---------- ворота и сетка (сетка колышется от мяча) ----------
const net = { pos: null, base: null, geo: null, hits: [] };
// ворота как на больших стадионах: тонкие белые штанги, сетка «коробкой» — ровная крыша назад и наклонный задник,
// ячейки — соты; сзади держится на тонких трубах
// сетка-полотно с узором сот (фильтруемая текстура с мипмапами — не рябит издалека). far — только для дальней дистанции
function netPanels(D, T, far) {
  // ячейки-соты: рисуем узор, он повторяется без швов
  const a = 16, h = Math.sqrt(3) * a, c = document.createElement('canvas'); c.width = 3 * a * 2; c.height = Math.round(h * 2);
  const g = c.getContext('2d'); g.scale(2, c.height / h); g.strokeStyle = '#fff'; g.lineWidth = 2.8; g.lineJoin = 'round';
  const hex = (cx, cy) => { g.beginPath(); for (let k = 0; k <= 6; k++) { const an = (k * Math.PI) / 3; g.lineTo(cx + a * Math.cos(an), cy + a * Math.sin(an)); } g.stroke(); };
  for (const [cx, cy] of [[0, 0], [3 * a, 0], [0, h], [3 * a, h], [1.5 * a, h / 2], [1.5 * a, -h / 2], [1.5 * a, 1.5 * h]]) hex(cx, cy);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  const CU = 0.27, CV = CU * (h / (3 * a)); // размер узора в метрах: соты ~9 см
  const P = [], UV = [], I = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
  // полотно по четырём углам (A — низ-лево, B — низ-право, C — верх-право, Dd — верх-лево), nu×nv клеток; sag — провисание внутрь
  const panel = (A, B, C, Dd, nu, nv, sag = 0) => {
    const o = P.length / 3, wU = A.distanceTo(B), wV = A.distanceTo(Dd);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = A.clone().lerp(B, u).lerp(Dd.clone().lerp(C, u), v);
      p.z += sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * v); // чуть провисает к центру
      P.push(p.x, p.y, p.z); UV.push((u * wU) / CU, (v * wV) / CV);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = o + j * (nu + 1) + i; I.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1); }
  };
  panel(V(-GW, 0, -D), V(GW, 0, -D), V(GW, GH, -T), V(-GW, GH, -T), 40, 14, 0.08); // задник
  panel(V(-GW, GH, -T), V(GW, GH, -T), V(GW, GH, 0), V(-GW, GH, 0), 40, 8); // крыша
  for (const sx of [-1, 1]) { // бока: трапеции (сверху крыша короче низа)
    const o = P.length / 3, nu = 10, nv = 14;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv, z = -u * lerp(D, T, v), y = v * GH; P.push(sx * GW, y, z); UV.push((-z) / CU, y / CV); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = o + j * (nu + 1) + i; I.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1); }
  }
  net.geo = new THREE.BufferGeometry(); net.geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); net.geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); net.geo.setIndex(I);
  net.pos = net.geo.attributes.position; net.base = Float32Array.from(P);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: LOOK.net.color, transparent: true, opacity: LOOK.net.panelOpacity, side: THREE.DoubleSide, depthWrite: false });
  mat.forceSinglePass = true;
  if (far) mat.onBeforeCompile = (sh) => { // дальняя сетка проявляется там, где ближняя (объёмная) исчезает
    sh.vertexShader = 'varying float vNetD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vNetD = -mvPosition.z;');
    sh.fragmentShader = 'varying float vNetD;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `diffuseColor.a *= smoothstep(${LOOK.net.fadeFrom.toFixed(1)}, ${LOOK.net.fadeTo.toFixed(1)}, vNetD);\n#include <alphatest_fragment>`);
  };
  const nm = new THREE.Mesh(net.geo, mat);
  nm.frustumCulled = false; nm.renderOrder = 2; scene.add(nm); return nm;
}
function goalSimple() { // запасные ворота, если модель не загрузилась
  NET_D = 1.9;
  const W = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0, envMapIntensity: 0.6 }), r = 0.06;
  const add = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, W); m.position.set(x, y, z); m.rotation.z = rz; scene.add(m); };
  add(new THREE.CylinderGeometry(r, r, GH + r, 24), -GW, (GH + r) / 2, 0); add(new THREE.CylinderGeometry(r, r, GH + r, 24), GW, (GH + r) / 2, 0);
  add(new THREE.CylinderGeometry(r, r, GW * 2 + 2 * r, 24), 0, GH, 0, Math.PI / 2);
  // опоры сетки: от перекладины прямо назад, потом вниз к земле, внизу — перемычка
  const frame = new THREE.MeshStandardMaterial({ color: '#d5dbe3', roughness: 0.5 }), fr = 0.022, D = NET_D, T = NET_TOP;
  const tube = (A, B) => { const L = A.distanceTo(B), m = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr, L, 8), frame);
    m.position.addVectors(A, B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(AY, B.clone().sub(A).normalize()); scene.add(m); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const sx of [-1, 1]) { tube(V(sx * GW, GH, 0), V(sx * GW, GH, -T)); tube(V(sx * GW, GH, -T), V(sx * GW, 0, -D)); tube(V(sx * GW, fr, 0), V(sx * GW, fr, -D)); }
  tube(V(-GW, GH, -T), V(GW, GH, -T)); tube(V(-GW, fr, -D), V(GW, fr, -D));
  netPanels(D, T, false);
}
// ворота — модель romullus (Sketchfab, CC BY-SA 4.0), сетка облегчена gltfpack; колышется в шейдере от удара мяча
const netU = { uHit: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 9)) } };
async function goalModel() {
  const g = (await loader.loadAsync('assets/goal.glb')).scene;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    o.castShadow = m.name !== 'rope' || PQ.netShadow; o.receiveShadow = m.name !== 'rope'; if (m.name === 'rope') o.userData.net = true;
    // штанги — окрашенный металл (краска, не хром); сетка — матовая нить
    const L = m.name === 'rope' ? LOOK.net : LOOK.posts; m.color.set(L.color); m.roughness = L.rough; m.metalness = 0; if (L.env) m.envMapIntensity = L.env;
    if (m.name === 'rope') { m.transparent = true; m.opacity = LOOK.net.opacity; m.depthWrite = false; m.forceSinglePass = true; } // нити тоньше пикселя: полупрозрачность гасит мерцание
    if (m.name === 'rope') m.onBeforeCompile = (sh) => {
      sh.uniforms.uHit = netU.uHit;
      sh.vertexShader = 'uniform vec4 uHit[4];\nvarying float vNetD;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 wq = modelMatrix * vec4(transformed, 1.0); float dz = 0.0;
        for (int i = 0; i < 4; i++) { vec4 h = uHit[i]; vec2 d = wq.xy - h.xy; dz += h.z * exp(-dot(d, d) / 0.9) * exp(-h.w * 3.0) * cos(h.w * 14.0); }
        wq.z -= dz * smoothstep(-0.2, -0.6, wq.z);
        vec4 mvPosition = viewMatrix * wq; gl_Position = projectionMatrix * mvPosition; vNetD = -mvPosition.z;`);
      // нити тоньше пикселя издалека «искрят»: чем дальше сетка, тем она прозрачнее (вблизи — как была)
      sh.fragmentShader = 'varying float vNetD;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
        diffuseColor.a *= 1.0 - smoothstep(${LOOK.net.fadeFrom.toFixed(1)}, ${LOOK.net.fadeTo.toFixed(1)}, vNetD); // вблизи — объёмные нити, вдали — полотно
        #include <alphatest_fragment>`);
    };
  });
  scene.add(g);
  netPanels(NET_D, NET_TOP, true); // дальняя сетка того же размера, что у модели (коробка 1,5 м)
}
function netTick(dt) {
  if (!net.hits.length) return;
  // удары: объёмной сетке — в шейдер, полотну — сдвигом вершин (одинаковая волна: колебание затухает от места попадания)
  net.hits.forEach((h) => (h.t += dt)); net.hits = net.hits.filter((h) => h.t < 1.6).slice(-4);
  netU.uHit.value.forEach((v, i) => { const h = net.hits[i]; if (h) v.set(h.x, h.y, h.a, h.t); else v.set(0, 0, 0, 9); });
  if (!net.pos) return;
  const a = net.pos.array, b = net.base;
  for (let i = 0; i < a.length; i += 3) {
    let dz = 0;
    for (const h of net.hits) { const dx = b[i] - h.x, dy = b[i + 1] - h.y, w = Math.exp(-(dx * dx + dy * dy) / 0.9); dz += h.a * w * Math.exp(-h.t * 3) * Math.cos(h.t * 14); }
    a[i + 2] = b[i + 2] - dz;
  }
  net.pos.needsUpdate = true;
}

// ---------- трибуны (stadium-lite.js) ----------
let crowd = null, STADIUM = null;
// смена качества на лету: разрешение, тени, «ворс» ткани, число людей, мелкие детали стадиона.
// (Разрешение разметки газона и анизотропия выбираются при загрузке.)
function applyQuality(name) {
  QL = name; PQ = GFX.PROFILES[name];
  ren.setPixelRatio(Math.min(PQ.pixelRatio, devicePixelRatio)); ren.setSize(innerWidth, innerHeight);
  const recompile = ren.shadowMap.enabled !== PQ.shadows;
  ren.shadowMap.enabled = PQ.shadows; key.castShadow = PQ.shadows;
  if (PQ.shadows && key.shadow.mapSize.x !== PQ.shadowMap) { key.shadow.mapSize.set(PQ.shadowMap, PQ.shadowMap); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } shadowFit.size = 0; }
  scene.traverse((o) => {
    if (o.userData.net) o.castShadow = PQ.netShadow;
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) { if (m.userData.cloth) m.sheen = PQ.sheen ? LOOK.mats.cloth.sheen : 0; if (recompile) m.needsUpdate = true; }
  });
  if (STADIUM) { STADIUM.setCrowd(PQ.crowd); STADIUM.setDetail(PQ.detail); }
  gfxLabel();
}
const gfxBtn = document.getElementById('gfxq');
// на экране — только значок; название уровня видно при переключении (и всегда — в режиме отладки ?fps=1)
let gfxShow = 0;
function gfxLabel() { if (!gfxBtn) return; const t = 'Графика: ' + (QCHOICE === 'auto' ? `авто (${PQ.label.toLowerCase()})` : PQ.label.toLowerCase());
  gfxBtn.title = t; gfxBtn.textContent = Q.get('fps') === '1' || performance.now() < gfxShow ? t : '⚙'; }
// кнопка: авто → низкая → средняя → высокая → авто; выбор запоминается
if (gfxBtn) gfxBtn.addEventListener('click', () => {
  const list = ['auto', ...GFX.ORDER]; QCHOICE = list[(list.indexOf(QCHOICE) + 1) % list.length]; GFX.saveChoice(QCHOICE);
  autoQ = QCHOICE === 'auto' ? new GFX.AutoQuality(QL, applyQuality) : null;
  gfxShow = performance.now() + 1600; setTimeout(gfxLabel, 1700);
  applyQuality(QCHOICE === 'auto' ? QL : QCHOICE); gfxBtn.blur();
});
let autoQ = null;
function stadium() {
  STADIUM = buildStadium(scene, { aniso: Math.min(PQ.aniso, ren.capabilities.getMaxAnisotropy()), ledBrightness: LOOK.led.brightness, ledSpeed: LOOK.led.speed });
  crowd = STADIUM.crowd; crowd.userData.U = STADIUM.U;
  STADIUM.setCrowd(PQ.crowd); STADIUM.setDetail(PQ.detail);
}

// ---------- мяч ----------
function ballMesh() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 512, 256);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) {
    const x = i * 86 + (r % 2 ? 43 : 0), y = 20 + r * 54; g.fillStyle = '#16192a'; g.beginPath();
    for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; g.lineTo(x + Math.cos(a) * 17, y + Math.sin(a) * 17 * 0.9); } g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 24), new THREE.MeshStandardMaterial({ map: t, roughness: LOOK.ball.white.rough, envMapIntensity: LOOK.ball.env })); // запасной мяч
  m.castShadow = true; return m;
}
const ball = ballMesh();

pitch(); stadium();
scene.add(ball); // ни следа за мячом, ни линий и меток прицела — в жизни их нет

// ---------- конфетти на гол ----------
const CONF = 260;
const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF);
const confS = Array.from({ length: CONF }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
{ const col = new THREE.Color(), cs = ['#ffcf3a', '#ff4f5e', '#3fd14a', '#4fa3ff', '#ffffff', '#b98bff']; for (let i = 0; i < CONF; i++) conf.setColorAt(i, col.set(cs[i % cs.length])); }
conf.visible = false; conf.frustumCulled = false; scene.add(conf);
function confetti() {
  conf.visible = true;
  confS.forEach((c) => { c.p.set((Math.random() - 0.5) * 9, 3 + Math.random() * 2, -0.5 + Math.random() * 2); c.v.set((Math.random() - 0.5) * 5, 3 + Math.random() * 4, 2 + Math.random() * 4); c.w.set(Math.random() * 9, Math.random() * 9, Math.random() * 9); });
}
const m4c = new THREE.Matrix4(), qE = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
function confTick(dt) {
  if (!conf.visible) return;
  let alive = 0;
  confS.forEach((c, i) => { c.v.y -= 4 * dt; c.v.multiplyScalar(1 - 1.2 * dt); c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; if (c.p.y > 0) alive++;
    m4c.compose(c.p, qE.setFromEuler(c.r), one); conf.setMatrixAt(i, m4c); });
  conf.instanceMatrix.needsUpdate = true; if (!alive) conf.visible = false;
}

// ---------- брызги травы из-под мяча при ударе ----------
const BURST = 40, burstS = Array.from({ length: BURST }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3() }));
const burstGeo = new THREE.BufferGeometry(); burstGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(BURST * 3), 3));
const burstPts = new THREE.Points(burstGeo, new THREE.PointsMaterial({ color: '#b9d98a', size: 0.045, transparent: true, depthWrite: false }));
burstPts.visible = false; burstPts.frustumCulled = false; scene.add(burstPts); let burstT = 0;
function burst(at, dir, p) {
  burstS.forEach((b) => { b.p.copy(at).add(tmpV.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.15)); b.p.y = 0.02;
    b.v.copy(dir).multiplyScalar((0.6 + Math.random() * 2.2) * (0.5 + p)).add(tmpV.set((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6)); });
  burstPts.visible = true; burstT = 0; burstPts.material.opacity = 1;
}
function burstTick(dt) {
  if (!burstPts.visible) return; burstT += dt; const a = burstGeo.attributes.position.array;
  burstS.forEach((b, i) => { b.v.y -= 9 * dt; b.v.multiplyScalar(1 - 2 * dt); b.p.addScaledVector(b.v, dt); if (b.p.y < 0.01) { b.p.y = 0.01; b.v.set(0, 0, 0); } a[i * 3] = b.p.x; a[i * 3 + 1] = b.p.y; a[i * 3 + 2] = b.p.z; });
  burstGeo.attributes.position.needsUpdate = true; burstPts.material.opacity = Math.max(0, 1 - burstT / 0.9); if (burstT > 0.9) burstPts.visible = false;
}

// ---------- мягкие тени-пятна ----------
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgb(140,140,140)'); r.addColorStop(0.6, 'rgb(64,64,64)'); r.addColorStop(1, 'rgb(0,0,0)'); // яркость = прозрачность (alphaMap)
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blobs = [], blobV = new THREE.Vector3();
// тень всегда чёрная (alphaMap): раньше пятно на телефоне светилось белым
function blob(target, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); blobs.push({ m, target, size }); return m;
}
function blobTick() {
  // с настоящими тенями пятна под игроками не нужны (иначе двойное тёмное пятно); под мячом остаётся маленькая мягкая
  // «контактная» тень — она показывает, где мяч касается газона
  const contact = !PQ.blobs;
  for (const b of blobs) {
    if (b.player && contact) { const t = b.bone.getWorldPosition(blobV); b.m.position.set(t.x, 0.012, t.z); b.m.visible = b.target.visible !== false; b.m.scale.setScalar(0.55); b.m.material.opacity = 0.32; continue; } // мягкое затемнение у ног — игрок «стоит» на газоне
    const t = b.bone ? b.bone.getWorldPosition(blobV) : b.target.position; b.m.position.set(t.x, 0.01, t.z); b.m.visible = b.target.visible !== false;
    const k = Math.max(0.35, 1 - t.y / 2.5); b.m.scale.setScalar(k * (contact ? 0.55 : 1)); b.m.material.opacity = k * (contact ? 0.45 : 1);
  }
}

// ---------- игроки ----------
// Персонаж Mixamo «Ch38» (футболист в белой форме) со скелетом Mixamo: движения Mixamo встают на него один в один.
// assets/player.glb — модель без упрощения (текстуры 2048) + 57 движений (собрано tools/anim/build_player.py, сжато gltfpack);
// у всех игроков одна модель, текстуры общие.
// Форма: футболка, шорты и гетры — отдельные части, их белый цвет умножаем на цвета команды.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const v3 = new THREE.Vector3();
let base = null;
const baseReady = loader.loadAsync('assets/player.glb').then((g) => (base = g));
const PART = { Ch38_Shirt: 'shirt', Ch38_Shorts: 'shorts', Ch38_Socks: 'socks' };
// Материалы Ch38. При переводе из Mixamo в glTF карта Glossiness попала в слот «металл/шероховатость»:
// зелёный канал — глянец (а three.js читает его как шероховатость), синий — «металл» = 1 (× 0,5) — отсюда «мокрый пластик».
// Исправление: металл = 0, глянец переворачиваем и переводим в шероховатость в своём диапазоне для каждой части (LOOK.mats).
// Карта Specular однородно-серая (56/255) и ничего не добавляет — её не используем, силу блика задаём сами.
const MAT_OF = { Ch38_Shirt: 'cloth', Ch38_Shorts: 'cloth', Ch38_Socks: 'cloth', Ch38_Body: 'skin', Ch38_Shoes: 'shoes', Ch38_Hair: 'hair', Ch38_Eyelashes: 'hair' };
function playerMaterial(o, kit) {
  const mt = o.material, kind = MAT_OF[o.name] || 'cloth', L = LOOK.mats[kind];
  mt.metalness = 0; mt.metalnessMap = null;
  if ('specularIntensity' in mt) { mt.specularIntensityMap = null; mt.specularColorMap = null; mt.specularIntensity = L.spec; mt.specularColor.set(L.specColor || '#ffffff'); }
  mt.envMapIntensity = L.env;
  if (kind === 'hair') { // карточки волос: прозрачность «сквозь сглаживание» — без сортировки и мерцания
    mt.roughness = L.rough; mt.roughnessMap = null; mt.transparent = false; mt.alphaTest = 0.35; mt.alphaToCoverage = true; mt.depthWrite = true;
  } else {
    if (mt.normalScale) mt.normalScale.set(L.normal, L.normal);
    mt.roughness = 1; mt.userData.rough = new THREE.Vector2(L.rough[0], L.rough[1]);
    mt.onBeforeCompile = (sh) => {
      sh.uniforms.uRough = { value: mt.userData.rough };
      sh.fragmentShader = 'uniform vec2 uRough;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `
  float roughnessFactor = roughness;
  #ifdef USE_ROUGHNESSMAP
    roughnessFactor = mix(uRough.x, uRough.y, 1.0 - texture2D(roughnessMap, vRoughnessMapUv).g); // глянец → шероховатость
  #endif`);
    };
    if (kind === 'cloth' && 'sheen' in mt) { mt.userData.cloth = true; mt.sheen = PQ.sheen ? L.sheen : 0; mt.sheenRoughness = 0.75; mt.sheenColor.set('#ffffff'); } // ворс ткани (только «высокое»)
  }
  // форма перекрашивается умножением: складки и швы из текстуры остаются
  const part = kit && PART[o.name]; if (part && kit[part]) mt.color.set(kit[part]);
}
async function player(kit) { // у всех одна и та же полная модель — без упрощения
  await baseReady;
  const src = base;
  const m = cloneSkinned(src.scene);
  const baseMats = {}; base.scene.traverse((o) => { if (o.isMesh) baseMats[o.name] = o.material; });
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    o.material = (baseMats[o.name] || o.material).clone(); // свой материал (цвет формы), текстуры общие
    playerMaterial(o, kit);
  });
  const holder = new THREE.Group(); holder.add(m); scene.add(holder);
  const bl = blob(holder, 1.3);
  const hips = m.getObjectByName('Hips');
  Object.assign(blobs.find((x) => x.m === bl), { bone: hips, player: true }); // тень идёт за тазом: записанные движения двигают игрока сами
  const footL = m.getObjectByName('LeftFoot'), footR = m.getObjectByName('RightFoot'), toeL = m.getObjectByName('LeftToeBase'), toeR = m.getObjectByName('RightToeBase');
  const body = ['LeftHand', 'RightHand', 'Spine2', 'Head'].map((n) => m.getObjectByName(n)); // чем вратарь касается мяча
  return { holder, model: m, mixer: new THREE.AnimationMixer(m), hips, hipsRest: hips.position.clone(), body, footL, footR, toeL, toeR, act: null, t: 0 };
}
const hexKit = (q) => { const k = (q || '').split('.').filter((c) => /^[0-9a-f]{6}$/i.test(c)); return k.length ? { shirt: '#' + k[0], shorts: '#' + (k[1] || k[0]), socks: '#' + (k[2] || k[1] || k[0]) } : null; };
const myKit = hexKit(Q.get('kit')); // без ?kit= — своя белая форма модели
const gkKit = { shirt: '#ffd23f', shorts: '#2a2d3a', socks: '#ffd23f' };
const wallKit = () => ({ shirt: '#e0303c', shorts: '#ffffff', socks: '#e0303c' });
// перекрасить форму (футболка, шорты, гетры) — складки и швы текстуры остаются
function recolor(pl, kit) { if (pl && kit) pl.model.traverse((o) => { const part = o.isMesh && PART[o.name]; if (part && kit[part]) o.material.color.set(kit[part]); }); }
let shooter, keeper, shooter0 = null; const wall = [];

// ---------- позиция удара ----------
const spot = new THREE.Vector3(); let wallZ = 0, wallX = [], wallFace = 0;
function setSpot(n) {
  if (MODE === 'pen') { spot.set(0, R, 11); wallX = []; }
  else if (LESSON === 'targets') { const x = [-3, 3, 0, -5, 5, 1][n % 6], z = [17, 17, 18, 18, 18, 16][n % 6]; spot.set(x, R, z); } // урок: ближе к воротам — мишени крупнее
  else { const x = [-4, 3.5, -7, 6, 0][n % 5], z = [21, 20, 23, 22, 25][n % 5]; spot.set(x, R, z); }
  if (MODE === 'fk') {
    const d = new THREE.Vector3(-Math.sign(spot.x || 1) * GW * 0.55 - spot.x, 0, -spot.z).normalize();
    const c = spot.clone().addScaledVector(d, 9.15); wallZ = c.z; wallFace = Math.atan2(-d.x, -d.z);
    const side = new THREE.Vector3(-d.z, 0, d.x);
    wallX = [-1.5, -0.5, 0.5, 1.5].map((k) => c.x + side.x * k * 0.6);
  }
  wall.forEach((w, i) => { w.holder.visible = MODE === 'fk'; if (MODE === 'fk') { w.holder.position.set(wallX[i], 0, wallZ); w.holder.rotation.y = wallFace; } }); // лицом к мячу (раньше было +180° — стояли спиной)
}

// ---------- состояние ----------
let camPunch = 0;
let state = 'load', n = 0, results = [], t0 = 0, shot = null, kick = null, slow = 1, slowT = 0, shake = 0, celebrate = -1, clock = 0;
// мяч для физики (ballphys.js): положение, скорость, вращение, состояние и владелец
const B = BP.newBall(); B.p = new THREE.Vector3(0, R, 0); B.v = new THREE.Vector3(); B.w = new THREE.Vector3();
const vel = B.v, spin = B.w, ballPrev = new THREE.Vector3(), msg = $('#msg');
const camAim = { p: new THREE.Vector3(), l: new THREE.Vector3() }, camNow = { p: new THREE.Vector3(), l: new THREE.Vector3() };
function aimCam() { // камера за спиной: в кадре и мяч, и игрок там, откуда начнёт разбег
  const start = KICK && shooter ? shooter.holder.localToWorld(KICK.root0.clone()) : spot.clone();
  const M = spot.clone().lerp(start, 0.45); M.y = 0;
  const back = M.clone().normalize(), right = new THREE.Vector3(back.z, 0, -back.x);
  camAim.p.copy(M).addScaledVector(back, MODE === 'pen' ? 5.5 : 6.5).addScaledVector(right, 0.6); camAim.p.y = 2.4;
  camAim.l.set(spot.x * 0.15, 1.0, 0);
  if (LESSON === 'targets') { camAim.p.addScaledVector(back, 1.5); camAim.p.y = 2.9; camAim.l.set(spot.x * 0.15, 0.2, 0); } // узкий кадр: мяч и ворота с мишенями целиком
}
function resetShot() {
  pitchLook(TV()); ball.scale.setScalar(TV() ? BALL_TV : 1); tvLook();
  if (!NIGHT) { const sv = TV() && TVL() ? TVL().sun : TV() ? (Q.get('trace') === '1' && Q.get('sun') ? Object.fromEntries(Q.get('sun').split(',').map((v, i) => [i ? 'azimuth' : 'elevation', +v])) : LOOK.sunTV) : LOOK.sun; setSun(sv.elevation, sv.azimuth); }
  if (shooter0 && shooter !== shooter0) shooter = shooter0; // после смен в «2 на 1» — исходный игрок снова главный
  if (shooter && shooter.sph) { shooter.sph.forEach((q) => (q.who = 'me')); if (wall[0] && wall[0].sph) wall[0].sph.forEach((q) => (q.who = 'mate')); }
  $('#pad').hidden = !FREE(); $('#pad').classList.toggle('duo', TEAM()); $('#b-pass').hidden = $('#b-thru').hidden = $('#b-swap').hidden = !TEAM(); $('#restart').hidden = MODE !== 'duo'; $('#camBtn').hidden = !TV(); $('#camBtn').textContent = '🎥 ' + TV_CAMS[tvCamSel].label; document.body.classList.toggle('tv', TV()); document.body.classList.toggle('match', MATCH_ON); $('#pauseBtn').hidden = !(FROM_MENU || MATCH_ON); $('#mclock').hidden = !MATCH_ON; if (MATCH_ON) { $('#help').hidden = true; $('#pHelp').hidden = false; }
  cam.fov = fov(); cam.updateProjectionMatrix();
  $('#hint').textContent = MODE === 'duo' ? 'Вы управляете игроком с жёлтым кольцом. «Пас» — передача партнёру, после удара по мячу управление переходит к нему. «Смена» — переключиться вручную, «Заново» — новая попытка.' : FREE() ? 'Слева веди пальцем. Держи «Удар» — сила; потяни палец вбок — подкрутка, вверх — переброс; отпусти — удар. «Рывок»: держи — бег, быстро смахни — финт.' : 'Проведи пальцем от мяча к воротам. Быстрее — сильнее, изогни линию — мяч закрутится.';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  msg.className = 'msg'; clearTimeout(toastT); kick = null; shot = null; slow = 1; slowT = 0;
  recolor(wall[0], wallKit()); // в «2 на 1» он партнёр в нашей форме — в штрафном снова в стенке
  if (MATCH_ON) return resetMatch();
  if (FREE()) return resetRun();
  setSpot(n);
  placeBall(spot);
  placeShooter(); shooter.holder.position.y = 0;
  play(shooter, 'idle', { loop: true, fade: 0.2, t: Math.random() * 3, lock: shooter.holder.localToWorld(KICK.root0.clone()) }); // стоит там, откуда начнёт разбег
  keeper.holder.position.set(MODE === 'fk' ? Math.sign(spot.x || 1) * 0.7 : 0, 0, -0.25); keeper.holder.rotation.set(0, 0, 0);
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, t: Math.random() * 2, lock: keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)) });
  wall.forEach((w, i) => play(w, 'idle', { loop: true, fade: 0.3, t: 1 + i * 1.7, speed: 0.8, lock: w.holder.localToWorld(new THREE.Vector3(0, 0, 0)) }));
  aimCam(); camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); // новая попытка — сразу на месте // после placeShooter — игрок уже стоит
  state = 'aim'; shot = null; kick = null; setTimeout(sfx.whistle, 500); sfx.level(MODE === 'pen' ? 0.6 : 0.4); celebrate = -1; slow = 1; msg.className = 'msg';
  $('#hint').style.opacity = n === 0 && !LESSON ? 1 : 0;
  dots(); if (LESSON) lessonReset();
}
function dots(fresh = false) {
  const o = Math.max(0, Math.min(n, results.length) - (SHOTS - 1)); // «2 на 1» — без конца серии: видны последние попытки
  $('#dots').innerHTML = Array.from({ length: SHOTS }, (_, i) => `<i class="${results[o + i] === undefined ? '' : results[o + i] ? 'g' : 'm'}${fresh && o + i === n ? ' new' : ''}"></i>`).join('');
  $('#who').innerHTML = `${NAME}<small>удар <b>${ST}</b></small>`;
  $('#score').textContent = results.filter(Boolean).length;
}

// ---------- свайп: светящаяся линия за пальцем ----------
const sw = document.createElement('canvas'); sw.className = 'swipe'; document.body.appendChild(sw); const sg = sw.getContext('2d');
function fitSwipe() { const d = Math.min(2, devicePixelRatio); sw.width = innerWidth * d; sw.height = innerHeight * d; sg.setTransform(d, 0, 0, d, 0, 0); }
fitSwipe();
let path = [], fade = 0, drawn = [];
const scr = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
addEventListener('pointerdown', (e) => { if (state !== 'aim' || FREE() || e.target.closest('button, .joy')) return; path = [scr(e)]; drawn = path; fade = 1; });
addEventListener('pointermove', (e) => { if (path.length) { path.push(scr(e)); drawn = path; } });
addEventListener('pointerup', (e) => {
  if (!path.length || state !== 'aim') return; path.push(scr(e));
  const p = path; path = [];
  const a = p[0], b = p[p.length - 1], len = Math.hypot(b.x - a.x, b.y - a.y), dt = Math.max(60, b.t - a.t);
  if (len < 40 || b.y > a.y - 20) return;
  const nd = new THREE.Vector2((b.x / innerWidth) * 2 - 1, -(b.y / innerHeight) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(nd, cam);
  const o = ray.ray.origin, d = ray.ray.direction, k = (0 - o.z) / d.z;
  let tx = o.x + d.x * k, ty = o.y + d.y * k;
  let dev = 0; for (const q of p) { const u = ((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len; if (Math.abs(u) > Math.abs(dev)) dev = u; }
  const curve = Math.max(-1, Math.min(1, dev / (innerWidth * 0.18)));
  const speed = Math.max(15, Math.min(33, 13 + (len / dt) * 9 + (len / innerHeight) * 4));
  const sig = 0.12 + (100 - ST) * 0.028, gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  tx += gauss() * sig; ty = Math.max(0.1, ty + gauss() * sig * 0.7);
  shot = { tx, ty, speed, curve, ax: 0 };
  state = 'runup'; t0 = clock; $('#hint').style.opacity = 0;
  play(shooter, 'kick', { t: 0.05, fade: 0.3 });
});
let swipeDirty = false;
function drawSwipe(dt) {
  if (!drawn.length || fade <= 0) { if (swipeDirty) { sg.clearRect(0, 0, innerWidth, innerHeight); swipeDirty = false; } return; }
  sg.clearRect(0, 0, innerWidth, innerHeight); swipeDirty = true;
  if (!path.length) fade -= dt * 2.2;
  const pts = drawn;
  sg.lineCap = 'round'; sg.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const u = i / pts.length;
      sg.strokeStyle = pass ? `rgba(255,255,255,${0.95 * fade * u})` : `rgba(255,207,58,${0.45 * fade * u})`;
      sg.lineWidth = (pass ? 5 : 16) * (0.35 + 0.65 * u);
      sg.beginPath(); sg.moveTo(pts[i - 1].x, pts[i - 1].y); sg.lineTo(pts[i].x, pts[i].y); sg.stroke();
    }
  }
}

// ---------- физика мяча ----------
// Вся физика и контроль мяча — в ballphys.js (настройки — BP.CFG). Здесь — мяч на сцене и связь с игроками.
// Физика идёт фиксированными шагами (BP.CFG.dt), картинка мяча — плавно между двумя последними шагами.
const goalDef = () => ({ w: GW, h: GH, d: NET_D, top: NET_TOP });
function predict(p0, v0, w0, zp = 0) { const r = BP.predict(p0, v0, w0, zp); return { p: new THREE.Vector3(r.p.x, r.p.y, r.p.z), t: r.t }; }
// свайп (штрафной, пенальти): подбираем скорость, чтобы мяч пришёл туда, куда отпустили палец
function aimVelocity(target, speed, w) {
  const v = target.clone().sub(spot).normalize().multiplyScalar(speed); v.y += 0.5 * G * (spot.distanceTo(target) / speed);
  for (let i = 0; i < 10; i++) { const r = predict(spot, v, w); if (r.t <= 0) break; v.x += (target.x - r.p.x) / r.t; v.y += (target.y - r.p.y) / r.t; }
  return v;
}
function placeBall(p) { BP.resetBall(B, p); ballPrev.copy(B.p); ball.position.copy(B.p); ball.quaternion.identity(); }
const qTmp = new THREE.Quaternion(), axTmp = new THREE.Vector3();
function spinBall(h) { const wl = B.w.length(); if (wl > 0.01) { qTmp.setFromAxisAngle(axTmp.copy(B.w).multiplyScalar(1 / wl), wl * h); ball.quaternion.premultiply(qTmp); } }
let simT = 0; const fixed = BP.clockFixed();

// тела игроков для столкновений с мячом: шары на костях (размеры — как у настоящего тела)
const PARTS = { LeftHand: [0.1, 'hand'], RightHand: [0.1, 'hand'], LeftForeArm: [0.07, 'hand'], RightForeArm: [0.07, 'hand'], Head: [0.11, 'body'], Spine2: [0.17, 'body'],
  Spine: [0.15, 'body'], Hips: [0.15, 'body'], LeftLeg: [0.09, 'body'], RightLeg: [0.09, 'body'], LeftFoot: [0.08, 'body'], RightFoot: [0.08, 'body'] };
function makeSpheres(pl, who) { pl.sph = Object.entries(PARTS).map(([name, [r, kind]]) => ({ bone: pl.model.getObjectByName(name), name, r, kind, who, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, init: false })).filter((q) => q.bone); }
function updSpheres(pl, dt) {
  for (const q of pl.sph) {
    q.bone.getWorldPosition(v3);
    if (q.init && dt > 1e-4) { const k = 1 / dt, vx = (v3.x - q.x) * k, vy = (v3.y - q.y) * k, vz = (v3.z - q.z) * k, l = Math.hypot(vx, vy, vz), c = l > 12 ? 12 / l : 1; q.vx = vx * c; q.vy = vy * c; q.vz = vz * c; }
    else { q.vx = q.vy = q.vz = 0; }
    q.x = v3.x; q.y = v3.y; q.z = v3.z; q.init = true;
  }
}
const resetSpheres = (pl) => pl.sph && pl.sph.forEach((q) => (q.init = false));

// мир для шага мяча: ворота, тела вратаря (и своё тело — когда мяч свободен и не «свой удар»)
const world = { goal: null, spheres: [], onSphere: null };
let lastGkTouch = -9;
world.onSphere = (q, c) => {
  if (q.who === 'gk2' && MT.back) { gkTrapFeet(); return 'stop'; }
  if (q.who === 'gk2') return gkCtx(1, () => gkSphere(q, c));
  if (q.who !== 'gk') return 'bounce';
  return gkCtx(0, () => gkSphere(q, c));
};
function gkSphere(q, c) {
  if (MATCH_ON && MT.shotPend && MT.shotPend.team !== 1 - gkCur) { MST().on[MT.shotPend.team]++; MT.shotPend = null; } // удар в створ — вратарь коснулся
  const K = BP.CFG.keeper, first = simT - lastGkTouch > 0.15; lastGkTouch = simT;
  // ловля — только при настоящем касании: обе кисти у мяча или мяч в корпус, и мяч не слишком быстрый
  const hands = keeper.sph.filter((h) => h.name.endsWith('Hand'));
  const twoHands = hands.length === 2 && hands.every((h) => Math.hypot(B.p.x - h.x, B.p.y - h.y, B.p.z - h.z) < R + h.r + K.twoHands);
  const chest = q.name === 'Spine2' || q.name === 'Spine';
  if (state !== 'over' && state !== 'goal' && ((twoHands && c.rel < K.catchHands) || (chest && c.rel < K.catchChest))) {
    B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); if (kick) kick.held = true;
    sfx.hands(true); sfx.buzz('medium'); finish(false, 'Поймал!', 'miss'); return 'stop';
  }
  // медленный низкий мяч, коснувшийся руки, вратарь прижимает и забирает (сильный — отскакивает, как раньше)
  if (state !== 'over' && state !== 'goal' && FREE() && q.name.endsWith('Hand') && c.rel < K.gather && B.p.y < K.gatherH) {
    B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); if (kick) kick.held = true;
    sfx.hands(true); finish(false, 'Подобрал', 'miss'); return 'stop';
  }
  if (first) { sfx.hands(false); sfx.buzz('medium'); if (FREE()) toast(q.kind === 'hand' ? 'Отбил!' : 'Блок!'); else finish(false, 'Отбил!', 'miss'); }
  return 'bounce';
}
function worldNow() {
  world.goal = goalDef();
  if (MATCH_ON && run && run.opp) { // матч: вторые ворота и тела всех шестерых (кроме только что ударившего)
    world.goal2 = Object.assign(goalDef(), { L: MATCH.L }); world.spheres = [];
    const lock = simT < B.lockUntil || B.mustClear ? B.lockOwner : null;
    for (const a of actors()) if (a.pl.sph && a.id !== lock && Math.abs(a.P.p.x - B.p.x) < 4 && Math.abs(a.P.p.z - B.p.z) < 4) for (const q of a.pl.sph) world.spheres.push(q); // дальние не проверяем
    for (const g of GK) for (const q of g.pl.sph) world.spheres.push(q);
    return world;
  }
  const own = FREE() && shooter.sph && !(B.lockOwner === 'me' && (simT < B.lockUntil || B.mustClear));
  const mt = run && run.mate && run.mate.pl.sph && !(B.lockOwner === 'mate' && (simT < B.lockUntil || B.mustClear));
  world.spheres = keeper.sph.concat(own ? shooter.sph : [], mt ? run.mate.pl.sph : []); // мяч не проходит сквозь игроков (кроме только что ударившего)
  return world;
}
// события шага мяча: звук, волна сетки, гол
function onEvents(ev) {
  for (const e of ev) {
    if (e.type === 'bounce' && shot) sfx.bounce(e.v);
    else if (e.type === 'post' || e.type === 'bar') {
      const t = e.type === 'bar' ? 'Перекладина!' : 'Штанга!'; sfx.post(); sfx.buzz('heavy'); shake = Math.max(shake, 0.08);
      if (kick) kick.post = t; if (run) run.lastPost = t; if (FREE()) toast(t);
    } else if (MATCH_ON && e.type === 'touch') { MT.last = teamOf(e.s.who); const a = actorOf(e.s.who); if (a) checkOffside(a); else if (MT.off && teamOf(e.s.who) !== MT.off.team) MT.off = null; }
    else if (MATCH_ON && e.type === 'goal') matchGoal(e.end);
    else if (MATCH_ON && e.type === 'net' && e.end === 1) sfx.net(e.v);
    else if (e.type === 'net') { net.hits.push({ x: B.p.x, y: B.p.y, t: 0, a: Math.min(0.55, e.v * 0.025) }); sfx.net(e.v); }
    else if (e.type === 'side') sfx.net(3);
    else if (e.type === 'goal') finish(true, 'ГОЛ!', 'goal');
  }
}

// ---------- удар ----------
function launch() { // штрафной и пенальти: удар по свайпу
  const { tx, ty, speed } = shot;
  // подкрутка: вращение вокруг вертикали (5–9 оборотов в секунду); сильный удар подъёмом — верхнее вращение
  const dH = tmpA.set(tx - spot.x, 0, -spot.z).normalize(), top = Math.max(0, speed - 12) * 0.35;
  spin.set(dH.z * top, -shot.curve * 55, -dH.x * top);
  vel.copy(aimVelocity(new THREE.Vector3(tx, ty, 0), speed, spin)); shot.ax = 0;
  B.state = 'free'; B.inGoal = false; B.goal = false; B.netHit = false; B.stopped = false;
  planKeeper();
  state = 'fly';
  kicked(Math.max(0, Math.min(1, (shot.speed - 15) / 18)));
}
// удар случился: звук, вибрация, лёгкая отдача (без лишней тряски — мяч должно быть видно)
function kicked(pw) {
  slow = 0.15; slowT = 0.035; shake = 0.04 + pw * 0.06; camPunch = 0.25 + pw * 0.25;
  sfx.kick(pw); sfx.buzz(pw > 0.55 ? 'heavy' : 'medium');
  burst(B.p, tmpA.set(vel.x, 0, vel.z).normalize(), pw * 0.6);
}
// ---------- вратарь: сейв ----------
// После удара (не раньше!) и с задержкой реакции вратарь оценивает, где мяч пересечёт его линию — с ошибкой, растущей
// со скоростью мяча. По этой оценке выбирает движение: у тела — ловля, низом — бросок на газон, дальше — прыжок,
// безнадёжно — не прыгает. Достал или нет, поймал или отбил — решает только касание рук и тела с мячом.
function planKeeper() {
  const K = BP.CFG.keeper, kz = Math.max(0, keeper.holder.position.z - 0.2), { p, t } = predict(B.p, vel, spin, kz);
  const g = predict(B.p, vel, spin, 0).p, sp = vel.length();
  const err = K.readError * (sp / 10) * (Math.random() * 2 - 1), react = K.reaction + Math.random() * K.reactionJitter;
  const lp = keeper.holder.worldToLocal(new THREE.Vector3(p.x + err, p.y, kz)); // точка мяча глазами вратаря (с ошибкой)
  kick = { t: 0, T: t, cx: p.x, cy: p.y, ex: p.x + err, lx: lp.x, kz, react, wide: Math.abs(g.x) > GW + 0.5 || g.y > GH + 0.45, done: false, x0: keeper.holder.position.x };
}
let GKC = null; // замер записей вратаря: момент касания, где руки и таз (в координатах вратаря)
function prepKeeper() {
  const h = keeper.holder, keep = [h.position.clone(), h.rotation.clone()]; h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.updateMatrixWorld(true);
  const lh = keeper.model.getObjectByName('LeftHand'), rh = keeper.model.getObjectByName('RightHand'), loc = (o) => h.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  GKC = {};
  // по чему искать момент касания: прыжки и броски — руки дальше всего вбок; ловля верхом — руки выше всего
  for (const [name, by] of [['gk_dive', 'x'], ['gk_dive2', 'x'], ['gk_block', 'x'], ['gk_block2', 'x'], ['gk_catch2', 'y'], ['gk_catch4', 'y'], ['gk_scoop', 'low']]) {
    const clip = clipOf(name); if (!clip) continue; const a = keeper.mixer.clipAction(clip); keeper.mixer.stopAllAction(); a.reset().play();
    let best = -1e9, info = null;
    for (let t = 0; t <= clip.duration; t += 1 / 30) {
      keeper.mixer.setTime(t); keeper.model.updateMatrixWorld(true);
      const m = loc(lh).add(loc(rh)).multiplyScalar(0.5), hp = hipsAt(keeper);
      const score = by === 'x' ? Math.abs(m.x) : by === 'y' ? m.y : -m.y + m.z * 0.3;
      if (score > best) { best = score; info = { tc: t, hx: m.x, hy: m.y, hz: m.z, px: hp.x, dur: clip.duration }; }
    }
    a.stop(); GKC[name] = info;
  }
  keeper.act = null; h.position.copy(keep[0]); h.rotation.copy(keep[1]);
}
function keeperDive() { // сейв (и для штрафного с пенальти, и для «1 на 1»)
  // дальний удар: времени больше, чем нужно на прыжок, — не прыгает сразу (иначе падает раньше, чем прилетит мяч),
  // а смещается к мячу приставным шагом и прыгает так, чтобы руки пришли к мячу вовремя
  if (!kick.wide && kick.ex !== undefined && GKC) {
    const LEAD = 0.2, rest = kick.T - kick.t; // прыжок начинается почти с момента вытяжения рук — решение за ≈0,2 с до мяча (замер по записи)
    if (rest > LEAD + 0.12) { kick.wait = true; kick.react = kick.T - LEAD; return; }
    kick.lx = keeper.holder.worldToLocal(new THREE.Vector3(kick.ex, kick.cy, kick.kz)).x; // точка мяча — от того места, куда успел сместиться
  }
  kick.dived = true; kick.wait = false;
  if (TRACE) console.log('dive', JSON.stringify({ gk: gkCur, lx: kick.lx, cy: kick.cy, T: kick.T, react: kick.react, wide: kick.wide, kz: kick.kz, kp: keeper.holder.position.toArray(), b: B.p.toArray() }));
  const K = BP.CFG.keeper, lx = kick.lx, y = kick.cy, ax = Math.abs(lx), left = Math.max(0.05, kick.T - kick.t);
  const here = () => keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)), follow = FREE();
  const start = (G, speed = 1) => Math.max(0, Math.min(G.tc - 0.12, G.tc - left * speed)); // так, чтобы руки пришли к мячу вовремя (или опоздали)
  // мало времени — не прыгаем в середину записи, а проигрываем её ускоренно (до 1,6×) почти с начала: движение цельное
  const fast = (G) => THREE.MathUtils.clamp((G.tc * 0.7) / left, 1, 1.6);
  if (kick.wide) { play(keeper, 'gk_ready', { loop: true, fade: 0.25, follow, lock: follow ? null : here() }); kick.fall = false; return; } // мимо — провожает взглядом
  if (ax < (B.v.length() > 20 ? 0.3 : K.nearReach)) { // у тела: ловля (быстрый мяч в стороне — уже прыжок, ловлей не достать)
    const name = y > 1.75 ? 'gk_catch4' : y > 0.5 ? 'gk_catch2' : (lx > 0 ? 'gk_block' : 'gk_block2'), G = GKC[name];
    const fx = name.startsWith('gk_block') ? Math.max(0.15, (ax + 0.1) / Math.max(0.5, Math.abs(G.hx))) : 1;
    const sp = fast(G); play(keeper, name, { t: start(G, sp), speed: sp, fade: 0.18, fx, fz: 0.3, hold: G.dur - 0.04, follow: false, lock: name.startsWith('gk_block') ? null : here() });
    kick.fall = name.startsWith('gk_block'); return;
  }
  const reachMax = K.diveReach * THREE.MathUtils.clamp((left + 0.15) / K.diveTime, 0.35, 1); // первый выпад вбок — ещё во время реакции
  if (ax > reachMax + K.hopeless) { play(keeper, lx > 0 ? 'gk_step' : 'gk_side2', { fade: 0.15, speed: 1.3, hold: 0.35, follow, lock: follow ? null : here() }); kick.fall = false; return; } // безнадёжно — шаг, без прыжка
  const low = y < 0.45 && ax < 2.3, name = low ? (lx > 0 ? 'gk_block' : 'gk_block2') : (lx > 0 ? DIVE.R.name : DIVE.L.name), G = GKC[name];
  // растягиваем запись вбок, чтобы руки пришли в точку мяча (но не дальше, чем успевает); вперёд из ворот почти не выходим
  const want = Math.min(ax, reachMax), arm = Math.abs(G.hx) - Math.abs(G.px), fx = THREE.MathUtils.clamp((want - arm) / Math.max(0.3, Math.abs(G.px)), 0.2, 1.4);
  const sp = fast(G), t0 = start(G, sp), up = low ? 0 : Math.max(0, Math.min(1.2, y - G.hy - 0.15));
  play(keeper, name, { t: t0, speed: sp, fade: 0.18, fx, fz: 0.25, hold: G.dur - 0.04, follow: false,
    lift: (t) => up * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - t0) / (G.tc + 0.35 - t0))))) });
  kick.fall = true;
}
// перед ударом вратарь чуть смещается — угадывает сторону (чаще верно, если удар не сильный и не в угол)
function keeperRead(dt) {
  if (!shot || !keeper.lock) return;
  if (shot.guess === undefined) { const right = Math.sign(shot.tx - keeper.holder.position.x) || 1; shot.guess = Math.random() < 0.6 ? right : -right; }
  const target = shot.guess * 0.35, cur = keeper.holder.position.x - (shot.kx0 ?? (shot.kx0 = keeper.holder.position.x));
  const dx = (target - cur) * (1 - Math.exp(-dt * 3));
  keeper.holder.position.x += dx; keeper.lock.x += dx;
}
const kp = new THREE.Vector3(), kq = new THREE.Vector3();
function handsAt(out) { keeper.body[0].getWorldPosition(kp); keeper.body[1].getWorldPosition(kq); return out.addVectors(kp, kq).multiplyScalar(0.5); }
let toastT = 0;
// Надписей поверх поля нет: результат виден по мячу, вратарю, звуку и табло. Текст события храним только для проверок.
let lastEvent = '';
function toast(text) { lastEvent = text; } // штанга, отбил — игра продолжается
function finish(ok, text, cls) {
  if (MATCH_ON) { if (B.state === 'held') gkGot(gkCur); return; } // матч: поймал/подобрал — вратарь потом разыграет сам
  if (state === 'over') return; state = 'over'; clearTimeout(toastT);
  if (ok) sfx.roar(); else if (text !== 'В стенку' && text !== 'Вратарь забрал' && !(text === 'Мимо' && Math.abs(B.p.x) > GW + 2.5)) sfx.ooh();
  results[n] = ok; lastEvent = text; dots(true);
  if (ok) { celebrate = 0; slow = 0.3; slowT = 0.9; shake = 0.15; crowd.userData.U.uJump.value = 1; } // без конфетти: трибуны, звук и счёт
  if (LESSON) lessonAttempt(ok);
  setTimeout(() => { crowd.userData.U.uJump.value = 0; n++; if (LESSON) { if (!LS.done && state === 'over') resetShot(); } else if (n >= SHOTS && MODE !== 'duo') end(); else if (state === 'over') resetShot(); }, ok ? 2600 : 1800);
}
function end() {
  const g = results.filter(Boolean).length;
  $('#endT').textContent = g >= 4 ? 'Отлично!' : g >= 2 ? 'Неплохо' : 'Мимо…';
  $('#endP').textContent = `Голов: ${g} из ${SHOTS}`;
  $('#end').classList.add('on');
}
$('#again').addEventListener('click', () => { $('#end').classList.remove('on'); n = 0; results = []; resetShot(); });
$('#toMenu').hidden = !(FROM_MENU || MATCH_ON);
document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === MODE)); // ?mode=run — сразу подсвечена «1 на 1»
// матч и тренировки — разные страницы игры: переход между ними перезагружает её (внутри хаба — в том же фрейме)
const goMode = (m) => { const q = new URLSearchParams(location.search); q.set('mode', m); location.replace('?' + q); };
if (EMBED) { $('[data-m="match"]').hidden = false; $('#pTrain').hidden = !MATCH_ON; }
$('#pTrain').addEventListener('click', () => goMode('duo'));
document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.m === 'match') return goMode('match');
  MODE = b.dataset.m; document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b)); n = 0; results = []; resetShot();
}));

// ---------- позы ----------
// Движения — записанные с людей (Mixamo, «Soccer Game Pack»). Каждый игрок — свой проигрыватель (AnimationMixer),
// смена движения — плавный переход. Растяжка прыжка вратаря — копия записи с изменённым смещением таза.
let KICK = null, DIVE = null;
// короткие имена → движения из набора (все 54 лежат в player.glb под именами файлов Mixamo)
const ALIAS = { kick: 'soccer_penalty_kick', kick2: 'kick_soccerball', strike: 'strike_foward_jog', idle: 'offensive_idle', jog: 'jog_forward',
  gk_idle: 'goalkeeper_idle', gk_idle2: 'goalkeeper_idle_2', gk_dive: 'goalkeeper_diving_save', gk_dive2: 'goalkeeper_diving_save_2',
  gk_catch: 'goalkeeper_catch', gk_block: 'goalkeeper_body_block', gk_miss: 'goalkeeper_miss', gk_step: 'goalkeeper_sidestep', gk_scoop: 'goalkeeper_scoop',
  header: 'header_soccerball', header2: 'header_soccerball_2',
  // вратарь (что делает каждая запись — проверено замером рук и таза, см. GKC в prepKeeper):
  gk_ready: 'goalkeeper_idle_2',        // низкая стойка перед ударом
  gk_side2: 'goalkeeper_sidestep_2',    // приставной шаг вправо (gk_step — влево)
  gk_catch2: 'goalkeeper_catch_2',      // ловля на уровне груди-головы, касание ~0,43 с
  gk_catch4: 'goalkeeper_catch_4',      // прыжок за высоким мячом, руки до 2,3 м
  gk_block2: 'goalkeeper_body_block_2', // низкий бросок на газон вправо (gk_block — влево)
  jog_back: 'jog_backward',
  pass: 'kick_soccerball_2' };          // пас низом правой ногой у земли, касание на 0,47 с (замер носка)
const clipOf = (name) => base.animations.find((c) => c.name === (ALIAS[name] || name));
const variants = new Map();
// копия движения: смещение таза по сторонам (fx) и вперёд (fz) умножено — вратарь долетает ровно до мяча и не выбегает из ворот
function variant(name, fx = 1, fz = 1) {
  fx = Math.round(fx * 20) / 20; fz = Math.round(fz * 20) / 20; // шаг 0,05: глазом не отличить, копий меньше
  const key = name + '|' + fx.toFixed(2) + '|' + fz.toFixed(2); if (variants.has(key)) return variants.get(key);
  // копируем только дорожку таза (её растягиваем), остальные дорожки — общие с исходной записью: меньше памяти и без рывка при создании
  const src = clipOf(name), stretch = fx !== 1 || fz !== 1;
  const c = new THREE.AnimationClip(key, src.duration, src.tracks.map((t) => (stretch && t.name === 'Hips.position' ? t.clone() : t)));
  const tr = stretch && c.tracks.find((t) => t.name === 'Hips.position');
  if (tr) { const v = tr.values, x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] = x0 + (v[i] - x0) * fx; v[i + 1] = y0 + (v[i + 1] - y0) * fz; } }
  variants.set(key, c); return c;
}
function play(pl, name, { t = 0, loop = false, fade = 0.25, speed = 1, hold = Infinity, fx = 1, fz = 1, lock = null, lift = 0, follow = false } = {}) {
  const a = pl.mixer.clipAction(variant(name, fx, fz));
  a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = speed; a.time = t; a.setEffectiveWeight(1);
  if (pl.name === 'loco' && pl.loco) { // из смешанного бега: гасим обе записи (и незавершённый прошлый переход)
    const o = pl.loco; for (const x of [o.idle, o.jog, o.prev]) if (x && x !== a) { if (fade > 0) x.fadeOut(fade); else x.stop(); }
    o.prev = null; if (fade > 0) a.fadeIn(fade);
  } else if (pl.act && pl.act !== a && fade > 0) a.crossFadeFrom(pl.act, fade, false); else if (pl.act && pl.act !== a) pl.act.stop();
  a.play(); Object.assign(pl, { act: a, name, hold, lock, lift, t0: t, t, follow });
}
// Бег и стойка смешиваются плавно по скорости (а не переключаются): вес бега растёт от 0,3 до 1,9 м/с.
// Ноги крутятся со скоростью перемещения: в записи jog_forward таз проходит 2,155 м за 0,87 с — это 2,48 м/с.
const JOG_SPEED = 2.48;
// Бег по направлениям (как «пространство смешивания» в больших играх): вперёд, назад, боком влево/вправо — по скорости
// в осях корпуса. Все записи бега идут в одной фазе шага (время ставим сами), поэтому ноги не путаются при смешивании.
// Метров за цикл записи (замер смещения таза): вперёд 2,15, назад 1,90, влево 2,11, вправо 1,76.
const LOCO_DIRS = [['jog', 2.15], ['jog_back', 1.9], ['jog_strafe_left', 2.11], ['jog_strafe_right', 1.76]];
function loco(pl, sp, dt, P) {
  const L = pl.loco || (pl.loco = { idle: pl.mixer.clipAction(variant('idle')), jog: pl.mixer.clipAction(variant('jog')), dirs: null, f: 1, prev: null, ph: 0 });
  if (MATCH_ON && !L.dirs) L.dirs = LOCO_DIRS.map(([n, m]) => ({ a: n === 'jog' ? L.jog : pl.mixer.clipAction(variant(n)), m }));
  const all = L.dirs ? [L.idle, ...L.dirs.map((d) => d.a)] : [L.idle, L.jog];
  if (pl.name !== 'loco') {
    L.prev = pl.act; L.f = 0;
    for (const a of all) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
    Object.assign(pl, { name: 'loco', act: L.jog, hold: Infinity, lock: null, lift: 0, follow: true });
  }
  L.f = Math.min(1, L.f + dt / 0.3);
  const w = THREE.MathUtils.smoothstep(sp, 0.3, 1.9);
  L.idle.setEffectiveWeight((1 - w) * L.f);
  if (L.prev && !all.includes(L.prev)) { L.prev.setEffectiveWeight(1 - L.f); if (L.f >= 1) { L.prev.stop(); L.prev = null; } }
  if (!L.dirs || !P) { L.jog.setEffectiveWeight(w * L.f); L.jog.timeScale = THREE.MathUtils.clamp(sp / JOG_SPEED, 0.75, 2.1); return; } // на рывке частоту ног ограничиваем
  // скорость в осях корпуса: вперёд и вправо (правая сторона при взгляде вдоль +z — это −x)
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), vf = sp > 0.05 ? (P.v.x * fx + P.v.z * fz) / sp : 1, vr = sp > 0.05 ? (-P.v.x * fz + P.v.z * fx) / sp : 0;
  const s = Math.abs(vf) + Math.abs(vr) || 1, ws = [Math.max(0, vf) / s, Math.max(0, -vf) / s, Math.max(0, -vr) / s, Math.max(0, vr) / s];
  // шагов в секунду — по смеси записей; ограничение то же, что было (не семенить на рывке)
  let cps = 0; for (let i = 0; i < 4; i++) cps += ws[i] * (sp / L.dirs[i].m); cps = THREE.MathUtils.clamp(cps, 0.75 / 0.87, 2.1 / 0.87);
  L.ph = (L.ph + cps * dt) % 1;
  for (let i = 0; i < 4; i++) { const d = L.dirs[i]; d.a.timeScale = 0; d.a.time = L.ph * d.a.getClip().duration; d.a.setEffectiveWeight(w * ws[i] * L.f); }
}
// таз в мировых координатах ↔ в координатах скелета (у скелета Mixamo свой поворот и масштаб 0,01)
function tickPlayer(pl, dt) {
  if (!pl.act) return;
  pl.mixer.update(dt);
  if (pl.act.time >= pl.hold) { pl.act.time = pl.hold; pl.act.paused = true; }
  pl.t = pl.act.time;
  if (pl.lock || pl.lift || pl.follow) {
    pl.holder.updateMatrixWorld(true);
    const par = pl.hips.parent, w = pl.hips.getWorldPosition(v3);
    if (pl.follow) { w.x = pl.holder.position.x; w.z = pl.holder.position.z; } // бег/стойка на месте: двигаем игрока сами
    else if (pl.lock) { w.x = pl.lock.x; w.z = pl.lock.z; }
    if (pl.lift) w.y += pl.lift(pl.t);
    pl.hips.position.copy(par.worldToLocal(w));
  }
}
const hipsAt = (pl) => { pl.model.updateMatrixWorld(true); return pl.holder.worldToLocal(pl.hips.getWorldPosition(new THREE.Vector3())); };
// заранее: в какой момент удара нога касается мяча и где в этот момент стопа (чтобы поставить игрока к мячу)
function prepKick() {
  const h = shooter.holder, keep = [h.position.clone(), h.rotation.y];
  h.position.set(0, 0, 0); h.rotation.y = 0; h.updateMatrixWorld(true);
  const a = shooter.mixer.clipAction(clipOf('kick')); a.reset().play();
  const fp = (n) => { shooter.model.updateMatrixWorld(true); return h.worldToLocal(shooter.model.getObjectByName(n).getWorldPosition(new THREE.Vector3())); };
  let best = 0, tc = 0.9, foot = 'RightFoot', prev = {};
  const dur = a.getClip().duration;
  for (let t = 0; t <= dur - 0.02; t += 1 / 60) {
    shooter.mixer.setTime(t);
    for (const n of ['LeftFoot', 'RightFoot']) { const q = fp(n); if (prev[n] && t > 0.3) { const v = q.distanceTo(prev[n]) * 60; if (v > best) { best = v; tc = t; foot = n; } } prev[n] = q; }
  }
  shooter.mixer.setTime(tc); const atContact = fp(foot);
  shooter.mixer.setTime(0); const root0 = hipsAt(shooter);
  a.stop(); h.position.copy(keep[0]); h.rotation.y = keep[1];
  KICK = { tc, foot, atContact, root0 };
  // прыжки вратаря: gk_dive — вправо (+X), gk_dive2 — влево; когда дальше всего вбок и насколько
  DIVE = {};
  for (const name of ['gk_dive', 'gk_dive2']) {
    const d = keeper.mixer.clipAction(clipOf(name)); d.reset().play(); let mx = 0, tk = 1, sx = 1;
    for (let t = 0; t <= d.getClip().duration - 0.02; t += 1 / 30) { keeper.mixer.setTime(t); const p = hipsAt(keeper); if (Math.abs(p.x) > mx) { mx = Math.abs(p.x); tk = t; sx = Math.sign(p.x); } }
    d.stop(); DIVE[sx > 0 ? 'R' : 'L'] = { name, tk, reach: mx };
  }
}
function placeShooter() { // встаём так, чтобы в момент касания стопа оказалась у мяча
  const dir = new THREE.Vector3(-spot.x, 0, -spot.z).normalize(), yaw = Math.atan2(dir.x, dir.z);
  const h = shooter.holder; h.rotation.set(0, yaw, 0);
  const off = KICK.atContact.clone().applyAxisAngle(AY, yaw); off.y = 0;
  h.position.copy(spot).addScaledVector(dir, -0.14).sub(off); h.position.y = 0;
}
const wallJump = (t) => { const u = (t - 0.12) / 0.55; return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** 0.8; }; // подскок стенки, 0..1
function wallTick(w, i, dt) { // стенка: стоят, при ударе тянутся к мячу (запись «удар головой») и подпрыгивают
  if (kick && !w.jumped) { w.jumped = true; play(w, i % 2 ? 'header2' : 'header', { t: 0.35 + i * 0.05, fade: 0.2, speed: 1.15 }); }
  if (!kick) w.jumped = false;
  tickPlayer(w, dt);
  w.holder.position.y = kick ? 0.45 * wallJump(kick.t - i * 0.03) : 0;
}

// ---------- 1 на 1: бежишь сам с мячом и бьёшь (джойстик + кнопки, как в FC Mobile) ----------
// Игрок и мяч считаются в ballphys.js фиксированными шагами: runPhys — движение, ведение, приём, удар, вратарь;
// runAnim — каждый кадр: позы, касания ногой, наклоны.
let STRIKE = null, PASS = null, run = null, crowdT = 0;
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, keys = {}, btn = { shot: false, sprint: false, press: false, tk: false, pd: false };
// камера «1 на 1»: за спиной игрока по линии на ворота, игрок — в нижней трети кадра, ворота видны впереди
const CAM_RUN = { back: 6.3, height: 2.9, ahead: 8, lookH: 0.9 };
function runCam(out) {
  const hp = shooter.holder.position, gx = -hp.x * 0.35, gz = -hp.z, gl = Math.hypot(gx, gz) || 1, dx = gx / gl, dz = gz / gl;
  out.p.set(hp.x - dx * CAM_RUN.back, CAM_RUN.height, hp.z - dz * CAM_RUN.back);
  out.l.set(hp.x + dx * CAM_RUN.ahead, CAM_RUN.lookH, hp.z + dz * CAM_RUN.ahead);
}
// «2 на 1»: камера сбоку и сверху. Смотрит на мяч с долей обоих атакующих; ориентация и расстояние постоянные
// (без вращения за бегом и без приближения), сдвигается плавно. Ворота справа; точка взгляда чуть ближе к камере,
// чтобы игровая зона была выше кнопок.
const tvFocus = new THREE.Vector3();
// Камеры «2 на 1» (переключаются кнопкой «Камера» или ?tvcam=behind|side|diag; выбор запоминается):
//  behind — сверху за атакующими, взгляд прямо на ворота (ворота вверху экрана);
//  side   — высокая телевизионная с длинной стороны поля, атака слева направо;
//  diag   — прежний диагональный ракурс (для сравнения).
// Ориентация у каждой постоянная (за игроком не вращается), расстояние постоянное (без зума), сдвиг — плавный.
// yaw — откуда смотрит камера (0° — с боковой линии +x, 90° — из-за спины атаки, со стороны +z);
// near/far — сколько метров от центра кадра видно к камере/вглубь (активный игрок всегда в этих пределах).
const TV_CAMS = {
  tv: { label: 'Трансляция', yaw: 0, side: 27, h: 16.5, fov: 31, ahead: 7, zMin: 1, near: 6, far: 8, right: 7, left: 14 }, // как в FC Mobile: ~35° сверху, перспектива
  behind: { label: 'Сверху', yaw: 90, side: 22, h: 27.5, fov: 26, ahead: 7, zMin: 0.5, near: 7, far: 9, right: 2.5, left: 12 },  // ~46° сверху, ~35 м
  side: { label: 'Сбоку', yaw: 0, side: 27.5, h: 30.5, fov: 20, ahead: 7, zMin: 1, near: 4.5, far: 6.5, right: 4, left: 11 },       // ~48° сверху, ~41 м
  diag: { label: 'Диагональ', yaw: 25, side: 29.5, h: 28, fov: 20, ahead: 7, zMin: 1, near: 4.5, far: 6.5, right: 6, left: 12 },
};
const TV_CAM_ORDER = ['tv', 'behind', 'side', 'diag'];
const CAM_KEY = MATCH_ON ? 'shot.match.cam2' : 'shot.duo.cam'; // в матче по умолчанию — высокая боковая камера
let tvCamSel = (() => { const q = Q.get('tvcam'); if (TV_CAMS[q]) return q; try { const v = localStorage.getItem(CAM_KEY); if (TV_CAMS[v]) return v; } catch (e) { /* без памяти */ } return MATCH_ON ? 'tv' : 'behind'; })();
// матч: в центре кадра — мяч и управляемый игрок (без «ворота справа»), ориентация камеры постоянная, сдвиг плавный
function matchCam(out, snap) {
  const C = CAM_TV, a = run ? run.P.p : { x: 0, z: MATCH.L / 2 }, celeP = state === 'goal' && MT.cele && MT.stT > 0.8 ? MT.cele.hero.holder.position : null, bp = celeP || ball.position;
  // главное — мяч: он всегда в кадре; управляемый игрок добавляет немного (если он далеко от мяча, может уйти за край)
  let fx = bp.x * 0.7 + a.x * 0.3, fz = bp.z * 0.72 + a.z * 0.28;
  const yaw = THREE.MathUtils.degToRad(C.yaw || 0), dx = Math.cos(yaw), dz = Math.sin(yaw);
  { const d = (bp.x - fx) * dx + (bp.z - fz) * dz, sh = d > C.near ? d - C.near : d < -C.far ? d + C.far : 0; fx += dx * sh; fz += dz * sh;
    const rx = dz, rz = -dx, l = (bp.x - fx) * rx + (bp.z - fz) * rz, lim = 7, sl = l > lim ? l - lim : l < -lim ? l + lim : 0; fx += rx * sl; fz += rz * sl; }
  const tx = Math.max(-MATCH.HW + 6, Math.min(MATCH.HW - 6, fx)), tz = Math.max(5, Math.min(MATCH.L - 5, fz));
  if (snap) tvFocus.set(tx, 0, tz); else { const k = 1 - Math.exp(-lastRaw * 2.3); tvFocus.x += (tx - tvFocus.x) * k; tvFocus.z += (tz - tvFocus.z) * k; }
  out.l.set(tvFocus.x, 0.6, tvFocus.z); out.p.set(out.l.x + C.side * dx, C.h, out.l.z + C.side * dz);
}
function tvCam(out, snap) {
  if (MATCH_ON) return matchCam(out, snap);
  const C = CAM_TV, m = run && run.mate, a = run ? run.P.p : { x: 0, z: 20 }, b = m ? m.P.p : a, bp = ball.position;
  let fx = bp.x * 0.4 + (a.x + b.x) * 0.3, fz = bp.z * 0.6 + (a.z + b.z) * 0.2; // мяч и оба атакующих
  // ближе к воротам — кадр уходит вперёд к створу и по ширине тянется к центру ворот (ворота в кадре, а не у края)
  const ahead = C.ahead + Math.max(0, 16 - fz) * 0.8, wg = Math.max(0, Math.min(0.6, (22 - fz) / 14));
  fx *= 1 - wg; fz -= ahead;
  // активный игрок всегда в кадре по глубине кадра (вдоль направления камеры)
  const yaw = THREE.MathUtils.degToRad(C.yaw || 0), dx = Math.cos(yaw), dz = Math.sin(yaw);
  if (run) { const d = (a.x - fx) * dx + (a.z - fz) * dz; const sh = d > C.near ? d - C.near : d < -C.far ? d + C.far : 0; fx += dx * sh; fz += dz * sh;
    // и по ширине кадра: справа — не заходит под кнопки (right), слева места больше (left)
    const rx = dz, rz = -dx, l = (a.x - fx) * rx + (a.z - fz) * rz, sl = l > C.right ? l - C.right : l < -C.left ? l + C.left : 0; fx += rx * sl; fz += rz * sl; }
  const tx = Math.max(-12, Math.min(12, fx)), tz = Math.max(C.zMin, Math.min(34, fz));
  if (snap) tvFocus.set(tx, 0, tz); else { const k = 1 - Math.exp(-lastRaw * C.rate); tvFocus.x += (tx - tvFocus.x) * k; tvFocus.z += (tz - tvFocus.z) * k; }
  out.l.set(tvFocus.x, 0.6, tvFocus.z); out.p.set(out.l.x + C.side * dx, C.h, out.l.z + C.side * dz);
}
function setTvCam(name, snap = true) {
  tvCamSel = name; try { localStorage.setItem(CAM_KEY, name); } catch (e) { /* без памяти */ }
  Object.assign(CAM_TV, TV_CAMS[name]); cam.fov = fov(); cam.updateProjectionMatrix();
  const b = $('#camBtn'); if (b) b.textContent = '🎥 ' + TV_CAMS[name].label;
  if (snap && TV() && run) { tvCam(camAim, true); camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); }
}
let lastRaw = 1 / 60;
// маркер управляемого игрока: тонкое кольцо на газоне вокруг ног (мяч у ноги — внутри кольца)
let marker = null;
function markerTick() {
  if (!marker) { marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.57, 48), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2; marker.renderOrder = 1; scene.add(marker); }
  if (!marker.userData.tri) { // небольшой треугольник над головой активного игрока (как в мобильном футболе)
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 3), new THREE.MeshBasicMaterial({ color: '#3fe0a8' })); t.rotation.x = Math.PI; scene.add(t); marker.userData.tri = t; }
  marker.visible = TEAM() && !!run && !!run.mate; marker.userData.tri.visible = marker.visible;
  if (marker.visible) marker.userData.tri.position.set(shooter.hips.getWorldPosition(tmpC).x, 2.35, tmpC.z);
  const sb = $('#b-swap'); if (sb) sb.classList.toggle('off', marker.visible && ownBall());
  if (marker.visible) marker.position.set(shooter.holder.position.x, 0.03, shooter.holder.position.z);
}
function resetRun() {
  wall.forEach((w) => (w.holder.visible = false));
  const sx = LESSON === 'dribble' ? 0 : LESSON === 'basics' ? 4 : (Math.random() * 2 - 1) * 7, sz = LESSON === 'dribble' ? 41 : 30, P = BP.newPlayer({ x: sx, z: sz }, Math.PI);
  shooter.holder.position.set(sx, 0, sz); shooter.holder.rotation.set(0, Math.PI, 0);
  placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; // мяч у ноги с самого начала
  play(shooter, 'idle', { loop: true, fade: 0.2, follow: true });
  keeper.holder.position.set(0, 0, 0.4); keeper.holder.rotation.set(0, 0, 0); keeperReset();
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, follow: true });
  resetSpheres(keeper); resetSpheres(shooter);
  run = { P, charge: -1, kv: new THREE.Vector3(), strike: null, fire: false, shotT: 0, slowT: 0, t0: simT, lastPost: null, wasStopping: false, pass: null, passFire: false, mate: null };
  if (MODE === 'duo') { // партнёр — бот в нашей форме, стартует сбоку и чуть впереди
    const side = sx > 0 ? -1 : 1, M = BP.newPlayer({ x: sx + side * 8, z: 27 }, Math.PI), pl = wall[0];
    recolor(pl, { shirt: '#2c2e35', shorts: '#26282e', socks: '#2c2e35' }); pl.holder.visible = true; // второй атакующий — в чёрной форме pl.holder.position.set(M.p.x, 0, M.p.z); pl.holder.rotation.set(0, Math.PI, 0);
    play(pl, 'idle', { loop: true, fade: 0.2, follow: true }); resetSpheres(pl);
    run.mate = { pl, P: M, side, st: 'support', hold: 0, pass: null, fire: false, plan: null, planT: 0, pick: -1, pickT: 0 };
  }
  if (TV()) tvCam(camAim, true); else runCam(camAim);
  camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); // новая попытка — сразу на месте (без пролёта камеры через всё поле)
  state = 'play'; celebrate = -1; dots(); if (LESSON) { lessonReset(); $('#hint').style.opacity = 0; return; }
  // подсказка — только при первом запуске режима на этом телефоне (новые ключи — новое управление жестами)
  const HINT_KEY = () => MODE === 'duo' ? 'shot.duo.hint3' : 'shot.run.hint2';
  let seen = false; try { seen = localStorage.getItem(HINT_KEY()) === '1'; localStorage.setItem(HINT_KEY(), '1'); } catch (e) { /* без памяти — покажем */ }
  $('#hint').style.opacity = seen ? 0 : 1;
}
// ввод: джойстик (палец), кнопки, клавиатура (WASD/стрелки, пробел — удар, E — подкрутка, Shift — рывок)
// джойстик «плавающий»: появляется там, где палец коснулся левой половины экрана, и исчезает, когда отпустил
const joyEl = $('#joy'), stick = $('#stick'), zone = $('#zone'), JR = 62;
function joySet(e) { let x = (e.clientX - joy.cx) / JR, y = (joy.cy - e.clientY) / JR; const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
  joy.x = x; joy.y = y; stick.style.transform = `translate(${x * JR * 0.6}px, ${-y * JR * 0.6}px)`; }
zone.addEventListener('pointerdown', (e) => { if (joy.id !== null) return; joy.id = e.pointerId; zone.setPointerCapture(e.pointerId);
  joy.cx = e.clientX; joy.cy = e.clientY; joyEl.style.left = joy.cx + 'px'; joyEl.style.top = joy.cy + 'px'; joyEl.classList.add('on'); joySet(e); hintOff(); });
zone.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) joySet(e); });
const joyEnd = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; stick.style.transform = ''; joyEl.classList.remove('on'); };
zone.addEventListener('pointerup', joyEnd); zone.addEventListener('pointercancel', joyEnd);
const hintOff = () => { if (FREE()) $('#hint').style.opacity = 0; };
// сила удара — кольцо вокруг кнопки «Удар»
const ringFg = $('#ringFg');
function setPower(p) { ringFg.style.strokeDashoffset = 100 - p * 100; ringFg.style.stroke = p > 0.92 ? '#ff4f5e' : ''; }
// Кнопки с жестами (controls.js). Направления — по экрану, как у джойстика, и не зависят от ракурса камеры.
// «Удар»: держишь — сила, отпустил — удар; оттянул палец влево/вправо — подкрутка в эту сторону, вверх — переброс.
gestureButton($('#b-shot'), {
  onDown: () => { if (matchDef()) { btn.tk = true; tryTackle(actorOf('me')); return; } btn.tk = false; startCharge('drive'); },
  // жесты одинаковые при любой камере: влево/вправо — подкрутка (мяч уходит в эту сторону от бьющего), вверх — переброс.
  // Мяч у соперника (матч) — эта же кнопка «Отбор»: короткое нажатие — попытка выбить мяч.
  onGesture: (dir) => { if (btn.tk || !run || run.charge < 0) return;
    if (dir === 'left' || dir === 'right') { run.kind = 'curl'; run.side = dir === 'left' ? 1 : -1; } else if (dir === 'up') { run.kind = 'chip'; run.side = 0; }
    shotBadge(); },
  onUp: (mode, held, cancel) => { if (btn.tk) { btn.tk = false; return; } if (cancel) cancelCharge(); else releaseCharge(); },
});
// «Пас»: коротко — в ноги (или на ход, если партнёр бежит), удержание — сильнее, вверх — верховая; мяч у партнёра — просьба вернуть
gestureButton($('#b-pass'), {
  // мяч у соперника (матч) — «Прессинг»: пока держишь, игрок сам идёт к владельцу мяча
  onDown: () => { if (matchDef()) { btn.press = true; btn.pd = true; return; } btn.pd = false; passDown(); },
  onGesture: (dir) => { const el = $('#pass-g'); if (el) el.textContent = dir === 'up' && passIn.down >= 0 ? '⌒ верхом' : ''; },
  onUp: (mode, held, cancel) => { if (btn.pd) { btn.press = false; btn.pd = false; return; } const el = $('#pass-g'); if (el) el.textContent = ''; if (cancel) { passIn.down = -1; return; } passUp(mode === 'up' ? 'lofted' : 'ground'); },
});
// «Рывок»: держишь без жеста — ускорение; короткий резкий жест — финт (один раз за жест)
gestureButton($('#b-run'), {
  threshold: 30, flick: 0.28,
  onDown: () => { btn.sprint = true; },
  onGesture: (dir, quick) => { if (quick) feint(dir); },
  onUp: () => { btn.sprint = false; },
});
// «На ход»: коротко — низом в свободную зону перед партнёром; зажал и потянул вверх — верхом, вразрез (за спину защитникам)
gestureButton($('#b-thru'), {
  onDown: () => {},
  onGesture: (dir) => { const el = $('#thru-g'); if (el) el.textContent = dir === 'up' ? '⌒ верхом' : ''; },
  onUp: (mode, held, cancel) => { const el = $('#thru-g'); if (el) el.textContent = ''; if (!cancel) throughPass(mode === 'up'); },
});
$('#b-swap').addEventListener('pointerdown', (e) => { e.preventDefault(); swapManual(); });
$('#restart').addEventListener('click', () => { if (FREE() && run) resetShot(); });
$('#camBtn').addEventListener('click', () => { if (!TV()) return; setTvCam(TV_CAM_ORDER[(TV_CAM_ORDER.indexOf(tvCamSel) + 1) % TV_CAM_ORDER.length]); $('#camBtn').blur(); });
$('#help').addEventListener('click', () => { const h = $('#hint'); h.style.opacity = 1; clearTimeout(h._t); h._t = setTimeout(() => (h.style.opacity = 0), 7000); });
addEventListener('keydown', (e) => { if (e.code === 'Space') e.preventDefault(); if (keys[e.code]) return; keys[e.code] = true; /* пробел не нажимает кнопки режима */ if (e.code === 'Space') { if (matchDef()) tryTackle(actorOf('me')); else startCharge('drive'); } if (e.code === 'KeyE') startCharge('curl'); if (e.code === 'KeyC') startCharge('chip');
  const fk = { Digit1: 'left', Digit2: 'right', Digit3: 'down', Digit4: 'up' }[e.code]; if (fk) feint(fk); if (e.code === 'KeyQ') { if (matchDef()) btn.press = true; else passDown(); } if (e.code === 'KeyF') throughPass(); if (e.code === 'KeyX') swapManual(); });
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyC') releaseCharge(); if (e.code === 'KeyQ') { btn.press = false; passUp(); } });
function input() {
  let x = joy.x, y = joy.y;
  if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1;
  const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
  if (TV()) { // вправо по экрану — вправо на экране при любой камере: переводим в оси поля (y — «к воротам» = −z)
    cam.getWorldDirection(camF); camF.y = 0; camF.normalize(); const rx = -camF.z, rz = camF.x, wx = x * rx + y * camF.x, wz = x * rz + y * camF.z;
    return { x: wx, y: -wz };
  }
  return { x, y };
}
const camF = new THREE.Vector3();
// держишь «Удар» — копится сила (кольцо), отпустил — удар; жест на кнопке выбирает подкрутку или переброс.
// Копить можно только с мячом у ноги; во время удара второе нажатие ничего не делает.
// kind: 'drive' — обычный удар, 'curl' — подкрутка (side: +1 влево, −1 вправо), 'chip' — переброс
function startCharge(kind = 'drive') {
  if (kind === true) kind = 'curl'; else if (kind === false) kind = 'drive';
  if (!FREE() || state !== 'play' || !run || run.charge >= 0 || run.strike || run.pass || run.feint || B.state !== 'owned' || B.owner !== 'me') return;
  run.charge = performance.now(); run.kind = kind; run.side = 0; setPower(0); $('#ring').classList.add('on'); hintOff(); shotBadge();
}
function cancelCharge() { if (!run || run.charge < 0) return; run.charge = -1; $('#ring').classList.remove('on'); shotBadge(true); }
// на кнопке «Удар» — компактная подпись выбранного удара (на поле ничего не рисуем)
function shotBadge(clear) { const el = $('#shot-g'); if (!el) return; el.textContent = clear || !run || run.charge < 0 ? '' : run.kind === 'curl' ? (run.side > 0 ? '↶ крутить' : run.side < 0 ? 'крутить ↷' : 'крутить') : run.kind === 'chip' ? '⌒ переброс' : ''; }
const chargePw = () => Math.min(1, (performance.now() - run.charge) / 900); // сила копится по настоящему времени: 0,9 с — полная
function releaseCharge() {
  if (!run || run.charge < 0) return;
  const pw = chargePw(); run.charge = -1; $('#ring').classList.remove('on'); shotBadge(true);
  if (state !== 'play' || B.state !== 'owned' || B.owner !== 'me') return;
  // замах начинается сразу; мяч остаётся под контролем до касания ноги, импульс — один раз в момент касания (runPhys)
  run.strike = { pw, kind: run.kind || 'drive', side: run.side || 0, aim: input() }; B.state = 'strike'; B.strikeAt = STRIKE.at;
  play(shooter, 'strike', { t: Math.max(0, STRIKE.tc - 0.3), fade: 0.1, speed: 1.25, follow: true });
}
function fireStrike() {
  const s = run.strike, P = run.P; run.strike = null;
  const pw = MATCH_ON ? (s.pw > 0.92 ? s.pw : Math.min(0.92, s.pw * (shooter.shotK || 1))) : s.pw; // матч: «удар» карточки чуть добавляет силы
  const sv = BP.shotVelocity(B, P, s.aim, pw, s.kind, goalDef(), s.side);
  if (MATCH_ON) MT.kicker = shooter;
  if (BP.applyShot(B, sv, BP.controlPoint(P, B), 'me', simT)) {
    B.inGoal = false; B.goal = false; B.netHit = false;
    shot = { tx: 0, ty: 0, speed: sv.speed, curve: s.kind === 'curl' ? 1 : 0 }; run.shotT = simT; run.lastPost = null;
    planKeeper(); kicked(s.pw); if (MATCH_ON) statShot(0);
  } else sfx.touch(); // нога не достала мяч — промах по мячу, мяч свободен
}
// ---------- пасы и партнёр («2 на 1») ----------
// «Пас»: короткое нажатие — в ноги (или на ход, если партнёр бежит), удержание > 0,3 с — сильнее, жест вверх — верхом.
// В момент удара по мячу управление переходит к получателю (swapControl); бывший игрок становится ботом поддержки.
const passIn = { down: -1 };
const gkWaits = () => MATCH_ON && run && B.state === 'held' && B.owner === 'gk2' && MT.gkHold && MT.gkHold.phase === 'hold' && MT.gkHold.t >= 0.9;
function passDown() {
  if (gkMine()) { passIn.down = performance.now(); return; }
  if (!TEAM() || state !== 'play' || !run || !run.mate) return;
  if (B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.charge >= 0) return;
  passIn.down = performance.now(); hintOff();
}
// «На ход»: пас в свободную зону перед партнёром — по ходу его движения
function throughPass(loft = false) {
  if (!TEAM() || state !== 'play' || !run || !run.mate) return;
  if (B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.charge >= 0) return;
  startPass(run.P, 'me', shooter, 0.35, 'through'); if (loft && run.pass) run.pass.loft = true; hintOff();
}
function passUp(kind = 'ground') {
  if (passIn.down < 0) return; const held = (performance.now() - passIn.down) / 1000; passIn.down = -1;
  if (gkMine()) { MT.gkCmd = { kind, inp: input() }; return; } // команда нашему вратарю
  startPass(run.P, 'me', shooter, held > 0.3 ? 1 : 0, kind);
}
function startPass(P, who, pl, power, kind) { // замах сразу; направление и сила — в момент касания (firePass)
  if (state !== 'play' || B.state !== 'owned' || B.owner !== who) return false;
  const job = { power, kind };
  if (who === 'me') { if (run.strike || run.pass) return false; run.pass = job; } else (MATCH_ON ? actorOf(who).ai : run.mate).pass = job;
  B.state = 'strike'; B.strikeAt = PASS.at;
  play(pl, 'pass', { t: Math.max(0, PASS.tc - 0.24), fade: 0.08, speed: 1.15, follow: true });
  return true;
}
// точка встречи: где будет получатель, когда дойдёт мяч (если бежит — на ход), без самонаведения после касания
function passTarget(recv, kind, power, goalZ = 0, loft = false) {
  const S = BP.CFG.pass, t = new THREE.Vector3(recv.p.x, 0, recv.p.z), sp = Math.hypot(recv.v.x, recv.v.z);
  if (kind === 'through') { // в свободную зону: по ходу получателя, ближе к воротам
    const gx = -recv.p.x * 0.4, gz = goalZ - recv.p.z, gl = Math.hypot(gx, gz) || 1, vx = sp > 1 ? recv.v.x / sp : 0, vz = sp > 1 ? recv.v.z / sp : 0;
    const dx = gx / gl + vx, dz = gz / gl + vz, dl = Math.hypot(dx, dz) || 1, ahead = (S.throughAhead + sp * S.throughPerSpeed) * (loft ? 1.6 : 1); // верхом — дальше, за спину
    t.set(recv.p.x + (dx / dl) * ahead, 0, recv.p.z + (dz / dl) * ahead);
    if (MATCH_ON) { t.x = clampX(t.x, 1.5); t.z = clampZ(t.z, 1.5); } else { t.x = Math.max(-30, Math.min(30, t.x)); t.z = Math.max(2.5, Math.min(44, t.z)); } return t;
  }
  if (sp > 1.2) for (let i = 0; i < 4; i++) { const tt = BP.passVelocity(B, t, kind, power).time; t.set(recv.p.x + recv.v.x * tt * S.lead, 0, recv.p.z + recv.v.z * tt * S.lead); }
  if (MATCH_ON) { t.x = clampX(t.x, 1.2); t.z = clampZ(t.z, 1.2); } else { t.x = Math.max(-30, Math.min(30, t.x)); t.z = Math.max(1.5, Math.min(44, t.z)); } return t;
}
function firePass(P, who, job, recv) {
  const tgt = passTarget(recv, job.kind, job.power, MATCH_ON ? attackZ(teamOf(who)) : 0, !!job.loft);
  if (MATCH_ON && job.kind === 'lofted') { const tm = teamOf(who); if (depthOf(tm, tgt.z) < 18 && Math.abs(tgt.x) < 20) { const dx = tgt.x - B.p.x, dz = tgt.z - B.p.z, dl = Math.hypot(dx, dz) || 1; tgt.x += (dx / dl) * 2.3; tgt.z += (dz / dl) * 2.3; job.cross = true; } }
  const pv = BP.passVelocity(B, tgt, job.kind === 'lofted' || job.loft ? 'lofted' : 'ground', job.power);
  if (BP.applyShot(B, pv, BP.controlPoint(P, B), who, simT)) { B.inGoal = false; B.goal = false; B.netHit = false; if (MATCH_ON) { statPass(teamOf(who)); markOffside(who); } if (who === 'me' && TEAM()) run.swapNow = true; sfx.kick(0.1 + job.power * 0.25); run.lastPass = { who, t: simT, tgt }; if (LESSON === 'basics' && who === 'me') LS.passT = simT; return true; }
  sfx.touch(); return false; // нога не достала — мяч свободен
}
// Смена управления: управляемый и бот меняются ролями ('me' — всегда тот, кем управляю). Владельца мяча не меняет:
// мяч остаётся у того, у кого был (метки 'me'/'mate' на мяче меняются местами вместе с ролями).
// Заряд удара, начатый пас и финт не переходят к другому игроку; удерживаемый джойстик и рывок продолжают работать.
function swapControl(toId = 'mate') {
  const m = run && (toId === 'mate' ? run.mate : run.allies && run.allies.find((x) => x.id === toId)); if (!m) return false;
  cancelCharge(); passIn.down = -1; const pg = $('#pass-g'); if (pg) pg.textContent = '';
  run.feint = null; B.feintOff = null; run.strike = null; run.pass = null; run.fire = false; run.passFire = false;
  const oP = run.P, oPl = shooter; run.P = m.P; shooter = m.pl; m.P = oP; m.pl = oPl;
  const id = m.id || 'mate', sw = (v) => (v === 'me' ? id : v === id ? 'me' : v); B.owner = sw(B.owner); B.lockOwner = sw(B.lockOwner);
  shooter.sph.forEach((q) => (q.who = 'me')); m.pl.sph.forEach((q) => (q.who = id));
  m.P.charging = false; m.pass = null; m.fire = false; m.hold = 0; m.st = 'support'; m.plan = null; m.planT = 0; m.pick = -1; m.pickT = 0; m.strike = null; m.sfire = false;
  run.swapNow = false; run.swapTo = null; return true;
}
// партнёр, ближе всех к мячу (для «Смены» и автосмены в матче); в «2 на 1» — единственный партнёр
function nearestAlly(exceptMe = true) {
  if (!MATCH_ON || !run.allies || !run.allies.length) return 'mate';
  let best = 'mate', bd = 1e9; for (const a of actors()) { if (a.team !== 0 || (exceptMe && a.id === 'me')) continue; const d = Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z); if (d < bd) { bd = d; best = a.id; } }
  return best;
}
// кому пас: партнёр в направлении джойстика (без джойстика — куда смотрит корпус), ближние предпочтительнее
function pickReceiver(from, inp, withMe = false, withGK = false) {
  const A = actors().filter((a) => a.team === 0 && (withMe || a.id !== 'me'));
  if (withGK && MATCH_ON && GK[1]) { const k = GK[1].pl.holder.position; if (Math.hypot(k.x - from.p.x, k.z - from.p.z) < 45) A.push({ id: 'gk2', team: 0, P: { p: k, v: { x: 0, z: 0 } } }); } // пас назад своему вратарю
  if (A.length <= 1) return A[0];
  const il = inp ? Math.hypot(inp.x, inp.y) : 0, dx = il > 0.3 ? inp.x / il : Math.sin(from.yaw), dz = il > 0.3 ? -inp.y / il : Math.cos(from.yaw);
  let best = A[0], bs = -1e9;
  for (const a of A) { const x = a.P.p.x - from.p.x, z = a.P.p.z - from.p.z, d = Math.hypot(x, z) || 1, c = (x * dx + z * dz) / d; const sc = c * 3 - d / 25 - (d < 4 ? 2 : 0); if (sc > bs) { bs = sc; best = a; } }
  return best;
}
const ownBall = () => (B.state === 'owned' || B.state === 'strike') && B.owner === 'me';
// «Смена» — когда мяч не у меня (с мячом — отдать пас); кнопка в это время приглушена
function swapManual() { if (TEAM() && state === 'play' && run && run.mate && !run.strike && !run.pass && B.state !== 'strike' && !ownBall()) { swapControl(nearestAlly()); sfx.touch(); } }
// где перехватить свободный мяч: первая точка его пути, куда игрок успевает добежать (план раз в 0,1 с)
const planBall = BP.newBall();
function meetPoint(M, speed, head = false) { // head — высокий мяч: точка, где он на высоте головы (удар головой)
  Object.assign(planBall.p, { x: B.p.x, y: B.p.y, z: B.p.z }); Object.assign(planBall.v, { x: B.v.x, y: B.v.y, z: B.v.z }); Object.assign(planBall.w, { x: B.w.x, y: B.w.y, z: B.w.z });
  planBall.state = 'free'; const h = 1 / 30;
  // отметки «в воротах» — как у настоящего мяча сейчас (иначе от прошлого прогноза остаётся «мяч в сетке», и сетка отбрасывает его к центру)
  const gf = worldFlipped && B.g2 ? B.g2 : B; planBall.inGoal = !!gf.inGoal; planBall.goal = !!gf.goal; planBall.netHit = !!gf.netHit;
  for (let t = h; t < 3; t += h) {
    for (let k = 0; k < 4; k++) BP.stepFree(planBall, h / 4, { goal: goalDef() });
    const d = Math.hypot(planBall.p.x - M.p.x, planBall.p.z - M.p.z);
    if (head && planBall.v.y < 0 && planBall.p.y > 1.3 && planBall.p.y < 2.1 && d - 0.6 <= speed * t) return { x: planBall.p.x, z: planBall.p.z, t, head: true };
    if (planBall.p.y < 0.45 && d - 0.45 <= speed * t) return { x: planBall.p.x, z: planBall.p.z, t };
    // матч: мяч уходит за линию — дальше не бежим, точка на линии (иначе боты убегают за поле)
    if (MATCH_ON && (Math.abs(planBall.p.x) > MATCH.HW || planBall.p.z < 0 || planBall.p.z > MATCH.L)) return { x: clampX(planBall.p.x, 0.3), z: clampZ(planBall.p.z, 0.3), t: t + 1 };
  }
  return { x: planBall.p.x, z: planBall.p.z, t: 3 };
}
// Бот поддержки. Позиция — одна из нескольких точек вокруг управляемого игрока (вбок и по диагонали, вперёд к воротам
// или чуть сзади); точка оценивается по дистанции, границам поля, линии паса (не через вратаря) и тому, не стоит ли
// она у меня на пути. Выбор пересматривается раз в replan секунд и меняется, только если новая точка заметно лучше.
const MATE = { minGap: 1.1, replan: 0.45, better: 1.5, near: 8.5, stop: 0.35 };
const SUPPORT = [[-7, 5], [7, 5], [-9, 0.5], [9, 0.5], [-6, -4.5], [6, -4.5]]; // [вбок, вперёд к воротам], м (вбок — не дальше, чем видно с камеры)
const supportAt = (P, k, out) => { // точка поддержки k относительно игрока P: «вперёд» — к центру ворот
  const gx = -P.p.x * 0.3, gz = -P.p.z, gl = Math.hypot(gx, gz) || 1, fx = gx / gl, fz = gz / gl, [sd, fw] = SUPPORT[k];
  out.x = Math.max(-25, Math.min(25, P.p.x - fz * sd + fx * fw)); out.z = Math.max(Math.max(6.5, keeper.holder.position.z + 4.5), Math.min(42, P.p.z + fz * fw + fx * sd));
  return out;
};
const segDist = (ax, az, bx, bz, px, pz) => { const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L)); return Math.hypot(ax + vx * t - px, az + vz * t - pz); };
const supT = { x: 0, z: 0 };
function supportScore(k, M, P) {
  const c = supportAt(P, k, supT), K = keeper.holder.position, sp = Math.hypot(P.v.x, P.v.z);
  let sc = Math.hypot(c.x - M.p.x, c.z - M.p.z) * 0.3; // ближе к тому, где он уже есть — меньше беготни
  sc += Math.abs(Math.hypot(c.x - P.p.x, c.z - P.p.z) - MATE.near) * 0.4; // удобная дистанция для паса
  if (segDist(P.p.x, P.p.z, c.x, c.z, K.x, K.z) < 2.2) sc += 8; // пас прошёл бы через вратаря
  if (sp > 1.2) { const vx = P.v.x / sp, vz = P.v.z / sp, rx = c.x - P.p.x, rz = c.z - P.p.z, al = rx * vx + rz * vz; if (al > 0 && al < 12 && Math.abs(rx * vz - rz * vx) < 2.5) sc += 6; } // у меня на пути
  if (sp > 1.2 && P.v.z < -1 && SUPPORT[k][1] < 0) sc += 3; // я иду вперёд — он тоже, а не отстаёт
  if (Math.abs(c.x) > 21) sc += 2; // у самой бровки — хуже
  return sc;
}
function mateAI(h) {
  const m = run.mate, M = m.P, P = run.P, bp = B.p; let tx = M.p.x, tz = M.p.z, sprint = false;
  const mine = B.owner === 'mate' && (B.state === 'owned' || B.state === 'strike');
  const dMe = Math.hypot(bp.x - P.p.x, bp.z - P.p.z), dBot = Math.hypot(bp.x - M.p.x, bp.z - M.p.z), bsp = Math.hypot(B.v.x, B.v.z);
  const away = bsp > 3 && (B.v.x * (bp.x - M.p.x) + B.v.z * (bp.z - M.p.z)) > 0;
  const loose = !run.chase && dBot < 2.5 && B.state === 'free' && bp.y < 1.2 && // на свободный мяч — только если он рядом с ним: подбор — дело активного игрока
     !(B.lockOwner === 'mate' && (simT < B.lockUntil || B.mustClear)) && dBot + 2 < dMe && !(away && dBot < 3);
  if (mine) { // мяч у бота (я переключился): спокойно держит, без удара и паса
    m.st = 'hold'; m.hold += h;
  } else if (loose) { // отскок ближе к нему: бежит к точке встречи
    m.st = 'receive'; m.hold = 0;
    if ((m.planT -= h) <= 0) { m.plan = meetPoint(M, 6.2); m.planT = 0.1; }
    tx = m.plan.x; tz = m.plan.z; sprint = Math.hypot(tx - M.p.x, tz - M.p.z) > 4;
  } else { // поддержка: устойчивый выбор точки
    m.st = 'support'; m.hold = 0;
    if ((m.pickT -= h) <= 0 || m.pick < 0) {
      m.pickT = MATE.replan; let best = -1, bs = 1e9; for (let k = 0; k < SUPPORT.length; k++) { const sc = supportScore(k, M, P); if (sc < bs) { bs = sc; best = k; } }
      if (m.pick < 0 || bs < supportScore(m.pick, M, P) - MATE.better) m.pick = best;
    }
    const c = supportAt(P, m.pick, supT); tx = c.x; tz = c.z;
    sprint = Math.hypot(tx - M.p.x, tz - M.p.z) > 6;
  }
  const dx = tx - M.p.x, dz = tz - M.p.z, d = Math.hypot(dx, dz), k = mine || d < MATE.stop ? 0 : Math.min(1, d / 1.5);
  M.sprint = sprint; M.charging = false;
  BP.playerStep(M, stepToBall(M, k > 0 ? { x: (dx / d) * k, y: (-dz / d) * k } : { x: 0, y: 0 }, 'mate'), h, mine);
}
// ---------- финты ----------
// Три финта на имеющихся записях (что делает каждая — проверено замером таза и носков):
//  • влево/вправо — перекат мяча в сторону: стопа уводит мяч вбок (точка ведения плавно смещается), корпус не разворачивается,
//    игрок шагает следом (записи jog_strafe_left / jog_strafe_right — шаг вбок);
//  • вниз — ложный замах: начало записи удара, остановка до касания, мяч срезается в сторону; вратарь может «купиться»;
//  • вверх — смена направления с уходом в сторону (jog_forward_diagonal / _2 — рывок по диагонали).
// Мяч всё время у ног и в физике: его можно отобрать, сквозь вратаря он не проходит. Один жест — один финт.
const FEINT = { roll: { dist: 0.75, time: 0.42, step: 3.2 }, fake: { time: 0.62, cut: 0.5 }, cut: { angle: 1.0, speed: 5.2, time: 0.42 } };
function feint(dir) {
  if (!FREE() || state !== 'play' || !run || B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.feint || run.charge >= 0) return;
  const P = run.P, f3 = cam.getWorldDirection(tmpA); f3.y = 0; f3.normalize();
  const rX = -f3.z, rZ = f3.x; // «вправо по экрану» на поле (как у джойстика)
  const bodyRight = (x, z) => -Math.cos(P.yaw) * x + Math.sin(P.yaw) * z; // > 0 — правая сторона игрока
  if (dir === 'left' || dir === 'right') {
    const sgn = dir === 'left' ? -1 : 1, dx = rX * sgn, dz = rZ * sgn;
    run.feint = { kind: 'roll', t: 0, dur: FEINT.roll.time, dx, dz, stepped: false }; P.lockYaw = FEINT.roll.time + 0.1;
    play(shooter, bodyRight(dx, dz) > 0 ? 'jog_strafe_right' : 'jog_strafe_left', { fade: 0.1, speed: 1.3, follow: true });
    sfx.touch();
  } else if (dir === 'down') {
    const inp = input(), sgn = Math.abs(inp.x) > 0.25 ? Math.sign(inp.x) : (B.p.x > keeper.holder.position.x ? 1 : -1); // срез — по джойстику или от вратаря
    run.feint = { kind: 'fake', t: 0, dur: FEINT.fake.time, dx: rX * sgn, dz: rZ * sgn, bit: false };
    play(shooter, 'strike', { t: Math.max(0, STRIKE.tc - 0.42), fade: 0.1, speed: 1.2, hold: STRIKE.tc - 0.1, follow: true });
  } else if (dir === 'up') {
    const inp = input(), sgn = Math.abs(inp.x) > 0.25 ? Math.sign(inp.x) : (B.p.x > keeper.holder.position.x ? 1 : -1);
    const hx = Math.sin(P.yaw), hz = Math.cos(P.yaw), a = FEINT.cut.angle, nx = hx * Math.cos(a) + rX * sgn * Math.sin(a), nz = hz * Math.cos(a) + rZ * sgn * Math.sin(a), nl = Math.hypot(nx, nz);
    const sp = Math.max(Math.hypot(P.v.x, P.v.z), FEINT.cut.speed); P.v.x = (nx / nl) * sp; P.v.z = (nz / nl) * sp;
    run.feint = { kind: 'cut', t: 0, dur: FEINT.cut.time };
    play(shooter, bodyRight(nx, nz) > 0 ? 'jog_forward_diagonal' : 'jog_forward_diagonal_2', { fade: 0.08, speed: 1.2, follow: true });
    BP.touch(B, P); sfx.touch();
  }
}
function feintTick(h) {
  const f = run.feint; if (!f) return; f.t += h;
  if (B.state !== 'owned' || B.owner !== 'me') { run.feint = null; B.feintOff = null; return; } // мяч отобрали — финт прерван
  const u = Math.min(1, f.t / f.dur), P = run.P;
  if (f.kind === 'roll') { // мяч уводится стопой вбок и отпускается к ноге, когда игрок шагнул следом
    const k = Math.sin(Math.min(1, u * 1.7) * (Math.PI / 2)) * (1 - Math.max(0, (u - 0.65) / 0.35));
    B.feintOff = { x: f.dx * FEINT.roll.dist * k, z: f.dz * FEINT.roll.dist * k };
    if (!f.stepped && f.t > 0.12) { f.stepped = true; P.v.x += f.dx * FEINT.roll.step; P.v.z += f.dz * FEINT.roll.step; }
  } else if (f.kind === 'fake') { // замах без касания, потом срез мяча в сторону
    if (!f.bit && f.t > 0.18) { f.bit = true; keeperBite(); }
    const k = Math.max(0, Math.min(1, (u - 0.5) / 0.3)) * (1 - Math.max(0, (u - 0.85) / 0.15));
    B.feintOff = { x: f.dx * FEINT.fake.cut * k, z: f.dz * FEINT.fake.cut * k };
  }
  if (f.t >= f.dur) { run.feint = null; B.feintOff = null; }
}
// ложный замах: вратарь, стоящий в позиции, может «купиться» и броситься (потом лежит и встаёт — это и даёт момент)
function keeperBite() {
  const K = BP.CFG.keeper; if (GKS.st !== 'pos' || kick || Math.hypot(B.p.x, B.p.z) > 22 || Math.random() > K.bite) return;
  const lp = keeper.holder.worldToLocal(tmpA.set(B.p.x, 0, B.p.z)), name = lp.x > 0 ? 'gk_block' : 'gk_block2', G = GKC[name];
  play(keeper, name, { t: Math.max(0, G.tc - 0.45), fade: 0.1, fx: 0.55, fz: 0.2, hold: G.tc + 0.6 }); keeper.smother = false; gkSet('smother');
}
// ---------- преследование свободного мяча (активный игрок) ----------
// Свободный мяч в игре (отскок от вратаря, штанги, потеря, пас мне) — активный игрок сам бежит к точке перехвата:
// где мяч будет, когда игрок успеет туда добежать (по полёту мяча — приземление, высокий мяч ногой в воздухе не берётся).
// Мяч к игроку не тянется: взять его можно только касанием (canCapture), дальше — обычное ведение.
// Джойстик отпущен — автоматика ведёт сама; джойстик в сторону мяча — подправляет направление; явно в другую сторону —
// преследование выключается (порог включения/выключения разный, чтобы не дёргалось). У мяча скорость подстраивается под
// мяч: игрок не пробегает мимо и не кружит.
const CHASE = BP.CHASE; // пороги и скорости — в ballphys.js (там же и проверяются тестами)
function chaseInput(P, inp, h) {
  const ok = (FREE() && state === 'play' && B.state === 'free' && !B.inGoal && (MATCH_ON ? Math.abs(B.p.x) < MATCH.HW && B.p.z > 0 && B.p.z < MATCH.L && MT.st === 'play' && matchChaseOk() : Math.abs(B.p.x) < 33 && B.p.z > -0.3 && B.p.z < 46))
    && !(shooter.name === 'strike' && shooter.t < Math.min(STRIKE.tc + 0.3, STRIKE.dur - 0.05)) && simT - (run.shotT || -9) > 0.3; // после своего удара — сначала доиграть замах
  P.boost = 1;
  if (!ok) { run.chase = false; run.chasePlan = null; return inp; }
  if ((run.chasePlanT = (run.chasePlanT || 0) - h) <= 0 || !run.chasePlan) { run.chasePlan = meetPoint(P, BP.CFG.player.sprint * 0.92, MATCH_ON && (B.p.y > 1.5 || B.v.y > 1.5)); run.chasePlanT = CHASE.plan; }
  const mp = run.chasePlan, tx = mp.x - P.p.x, tz = mp.z - P.p.z, dl = Math.hypot(tx, tz) || 1e-6, ux = tx / dl, uz = tz / dl;
  const mag = Math.hypot(inp.x, inp.y), ix = mag > 1e-3 ? inp.x / mag : 0, iz = mag > 1e-3 ? -inp.y / mag : 0, cosA = ix * ux + iz * uz;
  if (TRACE) run.chDbg = [+mag.toFixed(2), +cosA.toFixed(2), +mp.x.toFixed(1), +mp.z.toFixed(1)];
  run.chase = BP.chaseDecide(!!run.chase, mag, cosA); // явно увожу в сторону — отпускаем; отпустил или к мячу — снова веду
  if (!run.chase) return inp;
  const C = BP.CFG.player, cv = BP.chaseVel(P, B, mp), dBall = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z);
  let vx = cv.x, vz = cv.z; P.boost = cv.boost;
  let sp = Math.hypot(vx, vz);
  if (mag >= CHASE.neutral) { // подправка ввода: направление тянем к мячу, темп — мой (у самого мяча — автоматический)
    const mx = ix + (vx / (sp || 1) - ix) * CHASE.assist, mz = iz + (vz / (sp || 1) - iz) * CHASE.assist, ml = Math.hypot(mx, mz) || 1;
    const want = dBall < CHASE.near ? sp : mag * (P.sprint ? C.sprint : C.jog); vx = (mx / ml) * want; vz = (mz / ml) * want; sp = want;
  }
  if (sp > C.jog * 1.02) P.sprint = true; // далеко — бежит на рывке сам
  const max = P.sprint ? C.sprint : C.jog, k = Math.min(1, sp / max);
  return sp > 1e-3 ? { x: (vx / sp) * k, y: (-vz / sp) * k } : { x: 0, y: 0 };
}
// после первого касания мяч к игроку не тянется — игрок сам подходит к нему (шаг-другой, «помощь при приёме»):
// без джойстика — спокойно к мячу; с джойстиком в сторону мяча или вбок — сначала к мячу, в темпе джойстика;
// джойстик явно от мяча — игрок уходит, мяч остаётся (можно потерять)
function stepToBall(P, inp, who) {
  if (!(B.state === 'owned' && B.owner === who && B.touchFirst)) return inp;
  const im = Math.hypot(inp.x, inp.y); if (B.trapT >= BP.CFG.control.turnWindow) B.touchSoft = false;
  if (B.touchSoft && im > 0.5 && B.trapT < BP.CFG.control.turnWindow && Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) < 0.75) { // принял мягко и сразу повёл — разворот с мячом
    BP.firstTouch(B, P, who, { x: inp.x, z: -inp.y }, true); B.touchSoft = false; if (who === 'me') sfx.touch();
  }
  const cp = BP.controlPoint(P, null), ex = B.p.x - cp.x, ez = B.p.z - cp.z, e = Math.hypot(ex, ez);
  const dx = B.p.x - P.p.x, dz = B.p.z - P.p.z, d = Math.hypot(dx, dz) || 1, mag = Math.hypot(inp.x, inp.y);
  if (e < 0.25 || d < 0.5) return B.touchSoft && mag > 0.5 ? { x: 0, y: 0 } : inp; // мяч у ноги — дальше обычное ведение (после мягкого приёма — ждём разворота)
  if (!B.touchSoft && mag > 0.2 && (inp.x * dx - inp.y * dz) / (mag * d) < -0.3) return inp;
  const C = BP.CFG.player, bs = Math.hypot(B.v.x, B.v.z), want = Math.min(mag > 0.2 ? Math.max(C.jog * mag, bs + 1) : C.jog, bs + e * 3), k = Math.min(1, want / C.jog);
  return { x: (dx / d) * k, y: (-dz / d) * k };
}
// После паса управление переходит к получателю, а палец всё ещё держит джойстик в ту сторону, куда вёл пасующий.
// Пока ввод прежний — получатель его не слушает и сам выходит к мячу; отпустил или повёл в другую сторону — снова управляешь.
function holdAfterPass() { const i = input(); run.holdInp = Math.hypot(i.x, i.y) > 0.3 ? { x: i.x, y: i.y, t: simT } : null; }
function passInput() {
  const i = input(), H = run.holdInp; if (!H) return i;
  const m = Math.hypot(i.x, i.y), cos = m > 1e-3 ? (i.x * H.x + i.y * H.y) / (m * Math.hypot(H.x, H.y)) : -1;
  if (m < 0.3 || cos < Math.cos(0.6) || simT - H.t > 2 || (B.state !== 'free' && !(B.state === 'owned' && B.owner === 'me' && B.touchFirst))) { run.holdInp = null; return i; }
  return { x: 0, y: 0 };
}
function runPhys(h) {
  if (run.swapNow) { swapControl(); run.chasePlan = null; holdAfterPass(); } // пас ушёл — управляю получателем (он сразу выходит на мяч)
  const P = run.P, live = state === 'play';
  P.sprint = btn.sprint || keys.ShiftLeft || keys.ShiftRight; P.charging = run.charge >= 0;
  const inp = live ? stepToBall(P, chaseInput(P, passInput(), h), 'me') : { x: 0, y: 0 };
  BP.playerStep(P, inp, h, (B.state === 'owned' || B.state === 'strike') && B.owner === 'me');
  // с вратарём не сталкиваемся насквозь
  const kh = keeper.holder.position, dx = P.p.x - kh.x, dz = P.p.z - kh.z, dl = Math.hypot(dx, dz);
  if (dl < 0.6 && dl > 1e-4) { P.p.x = kh.x + (dx / dl) * 0.6; P.p.z = kh.z + (dz / dl) * 0.6; }
  feintTick(h);
  const mate = run.mate, M = mate && mate.P;
  if (M) {
    mateAI(h);
    // игроки не проходят друг сквозь друга (мягко расталкиваются)
    const sx = M.p.x - P.p.x, sz = M.p.z - P.p.z, sl = Math.hypot(sx, sz);
    if (sl < MATE.minGap && sl > 1e-4) { const push = (MATE.minGap - sl) / 2; P.p.x -= (sx / sl) * push; P.p.z -= (sz / sl) * push; M.p.x += (sx / sl) * push; M.p.z += (sz / sl) * push; }
    const mx = M.p.x - kh.x, mz = M.p.z - kh.z, ml = Math.hypot(mx, mz); if (ml < 0.6 && ml > 1e-4) { M.p.x = kh.x + (mx / ml) * 0.6; M.p.z = kh.z + (mz / ml) * 0.6; }
    BP.updateClear(B, M, 'mate');
  }
  BP.updateClear(B, P, 'me');
  if ((B.state === 'owned' || B.state === 'strike') && B.owner === 'mate' && M) {
    if (BP.controlStep(B, M, h, keeper.sph) === 'lost') { sfx.touch(); mate.pass = null; }
    if (mate.fire) { mate.fire = false; if (mate.pass) { firePass(M, 'mate', mate.pass, P); mate.pass = null; } }
  } else if (B.state === 'owned' || B.state === 'strike') {
    if (BP.controlStep(B, P, h, keeper.sph) === 'lost') { sfx.touch(); run.strike = null; run.pass = null; }
    if (run.fire) { run.fire = false; if (run.strike) fireStrike(); }
    if (run.passFire) { run.passFire = false; if (run.pass && M) firePass(P, 'me', run.pass, M); run.pass = null; }
  } else if (B.state === 'free' && live) { // приём: сильный мяч гасится дольше; берёт тот, кто ближе
    const me = BP.canCapture(B, P, 'me', simT), mt = M && BP.canCapture(B, M, 'mate', simT);
    const pick = me && mt ? (Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) <= Math.hypot(B.p.x - M.p.x, B.p.z - M.p.z) ? 'me' : 'mate') : me ? 'me' : mt ? 'mate' : null;
    if (pick) { const ji = pick === 'me' ? passInput() : null, rel = BP.firstTouch(B, pick === 'me' ? P : M, pick, ji && Math.hypot(ji.x, ji.y) > 0.2 ? { x: ji.x, z: -ji.y } : null); sfx.touch(); if (pick === 'me' && rel > 5) sfx.buzz('light'); if (pick === 'mate') { mate.hold = 0; mate.pass = null; } }
  }
  // вратарь в ногах (у того, кто с мячом): руками накрыл — забрал; телом — мяч выбит и свободен (отскакивает от тела)
  if (B.state === 'owned' && keeper.smother) {
    const O = B.owner === 'mate' && M ? M : P, hit = keeper.sph.find((q) => Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z) < q.r + R + 0.04);
    if (hit && hit.kind === 'hand') { B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); sfx.hands(true); finish(false, 'Вратарь забрал', 'miss'); }
    else if (hit) {
      const nx = B.p.x - hit.x, nz = B.p.z - hit.z, nl = Math.hypot(nx, nz) || 1, rel = Math.max(2.5, Math.hypot(B.v.x - O.v.x, B.v.z - O.v.z) + 2);
      BP.release(B, B.owner, simT, 0.35, false); B.v.set((nx / nl) * rel, 0.6, (nz / nl) * rel); sfx.hands(false); toast('Выбил');
      run.strike = null; run.pass = null; if (mate) mate.pass = null;
    }
  }
  keeperAI(h);
  // итог эпизода
  if (!live) return;
  if (B.state === 'free') {
    if (!B.inGoal && B.p.z < -0.3) return finish(false, run.lastPost || 'Мимо', 'miss');
    if (Math.abs(B.p.x) > 33 || B.p.z > 46) return finish(false, 'Аут', 'miss');
    const far = Math.min(Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z), M ? Math.hypot(B.p.x - M.p.x, B.p.z - M.p.z) : 99) > 6, slowBall = B.v.length() < 0.3;
    run.slowT = run.shotT && far && slowBall ? run.slowT + h : 0;
    if (run.slowT > 2) return finish(false, 'Мимо', 'miss');
  }
  if (MODE !== 'duo' && simT - run.t0 > 45) finish(false, 'Время', 'miss'); // «2 на 1» — свободная тренировка, без лимита
}
// ---------- вратарь в игре («1 на 1»): позиция, выход, бросок в ноги, падение и подъём ----------
// Состояния: pos — позиция между мячом и центром ворот (по линии, сокращение угла, у ближней штанги при уходе к лицевой);
// rush — выход на свободный мяч или на слишком далёкое касание; smother — бросок в ноги; save — сейв после удара (keeperDive);
// down — лежит; getup — встаёт. Повторного прыжка, пока лежит или встаёт, не бывает.
let GKS = { st: 'pos', t: 0, v: new THREE.Vector3(), want: '', wantT: 0 };
const gkSet = (st) => { GKS.st = st; GKS.t = 0; };
// после движения со смещением таза (бросок, выход) переносим «точку» вратаря туда, где он оказался, — без рывка назад
const gkAnchor = () => { const w = keeper.hips.getWorldPosition(v3); keeper.holder.position.set(w.x, 0, Math.max(0.2, w.z)); };
function keeperReset() { gkSet('pos'); GKS.v.set(0, 0, 0); GKS.want = ''; keeper.smother = false; }
function keeperAI(h) {
  const K = BP.CFG.keeper, k = keeper.holder, bp = B.p; GKS.t += h;
  if (B.state === 'held' && !MATCH_ON) return; // в матче: с мячом в руках доигрывает падение/подъём, потом стоит (розыгрыш — gkTick)
  if (kick && kick.dived && GKS.st !== 'down' && GKS.st !== 'getup' && GKS.st !== 'save') gkSet('save');
  if (GKS.st === 'save') { // ждём конца движения сейва: упал — лежит, нет — снова в игре
    const G = GKC[keeper.name], end = (G ? G.tc : 0.6) + 0.55;
    if (keeper.t > end || GKS.t > 2.5) { if (kick && kick.fall) gkSet('down'); else { gkAnchor(); kick = null; gkSet('pos'); } }
    return;
  }
  if (GKS.st === 'smother' && keeper.name === 'gk_scoop' && B.state === 'free' && B.v.length() < 3) { // почти стоящий мяч рядом — просто поднимает
    const G = GKC.gk_scoop, hand = handsAt(tmpB);
    if (keeper.t >= G.tc - 0.1 && hand.distanceTo(B.p) < 0.6) { B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); sfx.hands(true); finish(false, 'Подобрал', 'miss'); return; }
  }
  if (GKS.st === 'smother') { const G = GKC[keeper.name]; if (keeper.t > (G ? G.tc : 0.8) + 0.4) { keeper.smother = false; if (keeper.name === 'gk_scoop') { gkAnchor(); gkSet('pos'); } else gkSet('down'); } return; }
  if (GKS.st === 'down') { if (GKS.t > K.getUp) { gkAnchor(); play(keeper, 'standing_up', { fade: 0.5, follow: true, speed: 1.2 }); gkSet('getup'); } return; }
  if (GKS.st === 'getup') { if (keeper.t > clipOf('standing_up').duration - 0.15) { kick = null; gkSet('pos'); } return; }
  if (B.state === 'held' && B.owner === gkId(gkCur)) return; // мяч у него в руках — стоит (матч)
  if (MATCH_ON && MT.gkHold && MT.gkHold.j === gkCur) return; // доигрывает бросок
  if (MATCH_ON && state !== 'play') return; // гол или конец матча: не бежит за мячом в сетку
  if (MATCH_ON && MT.back && gkCur === 1) return; // пас назад своему вратарю — двигается gkBackPass
  if (kick && !kick.dived) { // удар уже был: до реакции стоит, после — приставным шагом к мячу (дальний удар), прыжок позже
    if (kick.wait) {
      const tx = THREE.MathUtils.clamp(kick.ex, -GW + 0.6, GW - 0.6), dx = tx - k.position.x, st = Math.sign(dx) * Math.min(Math.abs(dx), K.lateral * 1.15 * h);
      k.position.x += st; if (Math.abs(dx) > 0.05) { const nm = dx > 0 === (Math.cos(k.rotation.y) > 0) ? 'gk_step' : 'gk_side2'; if (keeper.name !== nm) play(keeper, nm, { loop: true, fade: 0.12, follow: true }); }
      else if (keeper.name !== 'gk_ready') play(keeper, 'gk_ready', { loop: true, fade: 0.15, follow: true });
    }
    return;
  }
  // соперник для вратаря — тот, кто с мячом; у свободного мяча — ближайший из нападающих (в матче — из команды соперника)
  const M = run.mate && run.mate.P, dBall = (Q) => Math.hypot(bp.x - Q.p.x, bp.z - Q.p.z);
  const foes = MATCH_ON ? matchFoes(gkCur) : [run.P, M].filter(Boolean), ownP = MATCH_ON ? matchOwnerP() : null, foeHas = !MATCH_ON || (!!ownP && foes.includes(ownP));
  const P = MATCH_ON ? (foeHas ? ownP : foes.reduce((a, q) => (dBall(q) < dBall(a) ? q : a))) : B.owner === 'mate' && M ? M : B.owner === 'me' || !M ? run.P : dBall(M) < dBall(run.P) ? M : run.P;
  const dist = Math.hypot(bp.x, bp.z), toBall = Math.hypot(bp.x - k.position.x, bp.z - k.position.z);
  // выход: свободный мяч в штрафной, до которого он успевает раньше соперника; или соперник отпустил мяч далеко от ноги рядом с ним
  // соперник рядом (≤2,2 м) или отпустил мяч от ноги — выходит в ноги
  const loose = B.state === 'owned' && foeHas && (toBall < 2.2 || (Math.hypot(bp.x - P.p.x, bp.z - P.p.z) > 0.55 && toBall < 3.2));
  const freeBall = B.state === 'free' && bp.y < 0.9 && B.v.length() < 12 && Math.abs(bp.x) < K.rushBox.x && bp.z < K.rushBox.z;
  const firstToIt = freeBall && toBall / K.rush < (Math.hypot(bp.x - P.p.x, bp.z - P.p.z) / 6.2) * K.rushMargin + 0.12;
  // перехват паса/прострела: катящийся мяч, путь которого идёт через штрафную, — выходит в точку, куда мяч придёт,
  // если успевает туда раньше атакующих (не во время удара по воротам — там работает сейв)
  let icp = null;
  if (!kick && B.state === 'free' && B.v.length() > 3 && bp.y < 1.2) {
    if ((GKS.ipT = (GKS.ipT || 0) - h) <= 0 || !GKS.ip) { GKS.ipT = 0.1; GKS.ip = meetPoint({ p: k.position }, K.rush); }
    const q = GKS.ip;
    if (Math.abs(q.x) < K.rushBox.x && q.z < K.rushBox.z && q.z > 0.3) {
      const tA = Math.min(...foes.map((A) => Math.hypot(q.x - A.p.x, q.z - A.p.z) / 6.2));
      if (q.t < tA * K.rushMargin) icp = q;
    }
  } else GKS.ip = null;
  if (state === 'play' && (loose || firstToIt || icp) && GKS.st !== 'rush') gkSet('rush');
  if (GKS.st === 'rush' && !(loose || firstToIt || icp || toBall < K.smother + 0.6)) gkSet('pos');
  let tx, tz, vmax;
  if (GKS.st === 'rush') { if (icp) { tx = icp.x; tz = icp.z; } else { tx = bp.x + B.v.x * 0.2; tz = bp.z + B.v.z * 0.2; } vmax = K.rush; }
  else if (Math.abs(bp.x) > GW + 1.5 && bp.z < 7) { tx = Math.sign(bp.x) * (GW - 0.45); tz = 0.55; vmax = K.lateral; } // ушёл к лицевой — к ближней штанге
  else { // между мячом и центром ворот; чем ближе мяч — тем дальше выходит (сокращает угол), но не вплотную к сопернику
    const out = THREE.MathUtils.clamp(((K.outStart - dist) / K.outStart) * K.maxOut, 0.4, K.maxOut), o = Math.min(out, Math.max(0.4, dist - 2.4));
    tx = (bp.x / Math.max(dist, 0.1)) * o; tz = Math.max(0.35, (bp.z / Math.max(dist, 0.1)) * o); vmax = K.forward;
    if (dist < 8) { const cur = Math.hypot(k.position.x, k.position.z); if (cur > o) { tx = (bp.x / Math.max(dist, 0.1)) * cur; tz = Math.max(0.35, (bp.z / Math.max(dist, 0.1)) * cur); } } // соперник близко — не пятится к воротам
  }
  const ready = (MATCH_ON ? gkCur === 0 && run.charge >= 0 : run.charge >= 0) || ((B.state === 'owned' || B.state === 'strike') && foeHas && dist < 14);
  // бросок в ноги: рядом с мячом во время выхода
  // свободный медленный мяч подбирает, подбежав вплотную (руки достают); бросок в ноги — только когда мяч у соперника или быстрый
  // катящийся мяч — туда, где он будет к моменту, когда руки дойдут до земли (~0,3 с)
  const slowFree = B.state === 'free' && B.v.length() < 4, lp0 = slowFree ? k.worldToLocal(tmpA.set(bp.x + B.v.x * 0.3, 0, bp.z + B.v.z * 0.3)) : null;
  const toMeet = slowFree ? Math.hypot(lp0.x, lp0.z) : toBall;
  const goNow = slowFree ? toMeet < K.scoopAt && lp0.z > 0 && (Math.abs(lp0.x) < 0.5 || toMeet < 0.5) : toBall < K.smother;
  if (GKS.st === 'rush' && goNow && bp.y < 0.5) {
    // ложится туда, где мяч будет через 0,3 с (по ходу соперника), — телом поперёк пути мяча
    const lp = k.worldToLocal(tmpA.set(bp.x + B.v.x * 0.3, 0, bp.z + B.v.z * 0.3)), slow = slowFree;
    const name = slow ? 'gk_scoop' : lp.x > 0 ? 'gk_block' : 'gk_block2', G = GKC[name];
    const fx = name === 'gk_scoop' ? 1 : THREE.MathUtils.clamp((Math.abs(lp.x) + 0.2) / Math.max(0.5, Math.abs(G.hx)), 0.25, 1);
    play(keeper, name, { t: Math.max(0, G.tc - 0.42), speed: 1.25, fade: 0.16, fx, fz: name === 'gk_scoop' ? 0.25 : 0.5, hold: G.dur - 0.04 });
    keeper.smother = true; gkSet('smother'); return;
  }
  // движение к цели с ограничением скорости по направлениям (вбок, вперёд, назад) и разгоном
  const dx = tx - k.position.x, dz = tz - k.position.z, d = Math.hypot(dx, dz), yaw = k.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const wantSp = Math.min(vmax * (ready && GKS.st !== 'rush' ? 0.6 : 1), d * 3.2);
  const wx = d > 0.02 ? (dx / d) * wantSp : 0, wz = d > 0.02 ? (dz / d) * wantSp : 0;
  const fwd = wx * fx + wz * fz, lat = wx * fz - wz * fx; // в осях вратаря
  const fwdC = Math.max(-K.back, Math.min(K.forward * (GKS.st === 'rush' ? 1.3 : 1), fwd)), latC = Math.max(-K.lateral, Math.min(K.lateral, lat));
  const tvx = fwdC * fx + latC * fz, tvz = fwdC * fz - latC * fx, dvx = tvx - GKS.v.x, dvz = tvz - GKS.v.z, dvl = Math.hypot(dvx, dvz), maxDv = K.accel * h;
  if (dvl > maxDv) { GKS.v.x += (dvx / dvl) * maxDv; GKS.v.z += (dvz / dvl) * maxDv; } else { GKS.v.x = tvx; GKS.v.z = tvz; }
  k.position.x += GKS.v.x * h; k.position.z = Math.max(0.2, k.position.z + GKS.v.z * h);
  // всегда лицом к мячу (плавно)
  let dy = Math.atan2(bp.x - k.position.x, bp.z - k.position.z) - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); k.rotation.y += dy * (1 - Math.exp(-h * 8));
  // поза по скорости в осях вратаря: стойка, приставной шаг влево/вправо, бег вперёд/назад (с задержкой против дёрганья)
  const vf = GKS.v.x * fx + GKS.v.z * fz, vl = GKS.v.x * fz - GKS.v.z * fx, sp = Math.hypot(vf, vl);
  const want = sp < 0.45 ? (ready ? 'gk_ready' : 'gk_idle') : Math.abs(vl) > Math.abs(vf) * 1.2 ? (vl > 0 ? 'gk_step' : 'gk_side2') : vf >= 0 ? 'jog' : 'jog_back';
  if (want !== GKS.want) { GKS.want = want; GKS.wantT = 0; } else GKS.wantT += h;
  if (keeper.name !== want && GKS.wantT > 0.12) play(keeper, want, { loop: true, fade: 0.25, follow: true });
  const nat = { gk_step: 2.2, gk_side2: 3.0, jog: 2.48, jog_back: 2.24 }[keeper.name];
  if (nat && keeper.act) keeper.act.timeScale = THREE.MathUtils.clamp(sp / nat, 0.6, 1.8);
}
// позы игроков в свободной игре — каждый кадр (физика уже посчитана)
function bodyAnim(pl, P, dt, who0) { // положение, наклон, бег/стойка, касания мяча в такт шагу
  const h = pl.holder, sp = Math.hypot(P.v.x, P.v.z);
  h.position.set(P.p.x, 0, P.p.z); h.rotation.y = P.yaw;
  // наклон: на повороте — внутрь, при разгоне — вперёд
  const lean = Math.max(-0.26, Math.min(0.26, -P.yawRate * sp * 0.035)), pitch = Math.max(-0.08, Math.min(0.14, P.acc * 0.025));
  const kl = 1 - Math.exp(-dt * 6); h.rotation.z += (lean - h.rotation.z) * kl; h.rotation.x += (pitch - h.rotation.x) * kl;
  // замах занят до конца движения ноги; запись может закончиться раньше этого запаса — тогда до её конца (иначе поза застывает навсегда)
  const busyTill = (C, extra) => Math.min(C.tc + extra, C.dur - 0.05);
  const busy = (pl.name === 'strike' && pl.t < busyTill(STRIKE, 0.3)) || (pl.name === 'pass' && pl.t < busyTill(PASS, 0.22)) || (pl === shooter && run.feint) || (pl.cele && pl.name === 'header_soccerball' && pl.t < pl.cele) || (pl.once && pl.name === pl.once.name && pl.t < pl.once.until);
  if (!busy) loco(pl, sp, dt, P);
  tickPlayer(pl, dt);
  // касания при ведении — в такт шагу: правая нога проходит вперёд на ~62–69% цикла бега (замер записи jog_forward);
  // на медленном шаге (бег почти не смешан) — когда носок у мяча; и не реже раза в touchMax
  const who = who0 || (pl === shooter ? 'me' : 'mate');
  if (B.state === 'owned' && B.owner === who && sp > 0.6 && B.touchCd <= 0) {
    const L = pl.loco, jogW = L ? L.jog.getEffectiveWeight() : 0, ph = L ? (L.jog.time / L.jog.getClip().duration) % 1 : 0;
    const stepNow = jogW > 0.5 && L.lastPh !== undefined && L.lastPh < 0.62 && ph >= 0.62;
    const toe = pl.toeR.getWorldPosition(tmpB).distanceTo(B.p) - R;
    if (stepNow || (jogW <= 0.5 && toe < 0.12) || B.touchCd < -(BP.CFG.control.touchMax - BP.CFG.control.touchMin)) { BP.touch(B, P); sfx.touch(); }
  }
  if (pl.loco) pl.loco.lastPh = (pl.loco.jog.time / pl.loco.jog.getClip().duration) % 1;
  return sp;
}
function runAnim(dt) {
  if (TRACE && window.__freeze) return; // проверка поз: кадр записи стоит
  const P = run.P, sp = bodyAnim(shooter, P, dt);
  if (run.strike && shooter.name === 'strike' && shooter.t >= STRIKE.tc) run.fire = true; // нога дошла до мяча
  if (run.pass && shooter.name === 'pass' && shooter.t >= PASS.tc) run.passFire = true;
  const m = run.mate;
  if (m) { bodyAnim(m.pl, m.P, dt); if (m.pass && m.pl.name === 'pass' && m.pl.t >= PASS.tc) m.fire = true; }
  if (P.stopping && !run.wasStopping && sp > 2.5 && B.state === 'owned' && B.owner === 'me') sfx.touch(); // остановил мяч подошвой
  run.wasStopping = P.stopping;
  if (run.charge >= 0) { setPower(chargePw()); if (performance.now() - run.charge > 1200) releaseCharge(); }
  if ((crowdT -= dt) < 0) { crowdT = 0.4; sfx.level(Math.max(0, Math.min(1, (30 - B.p.length()) / 20))); } // ближе к воротам — громче трибуны
}
// после удара игрок не замирает: пробегает по инерции пару шагов к воротам и останавливается
function afterKick(dt) {
  const h = shooter.holder;
  if (shooter.name === 'kick' && shooter.t >= KICK.tc + 0.42) {
    const w = shooter.hips.getWorldPosition(new THREE.Vector3()); h.position.set(w.x, 0, w.z);
    play(shooter, 'jog', { loop: true, fade: 0.35, follow: true }); shooter.coast = 3.4;
  }
  if (shooter.name === 'jog' && shooter.coast > 0) {
    shooter.coast = Math.max(0, shooter.coast - dt * 1.7);
    h.position.x += Math.sin(h.rotation.y) * shooter.coast * dt; h.position.z += Math.cos(h.rotation.y) * shooter.coast * dt;
    shooter.act.timeScale = Math.max(0.6, shooter.coast / 3.4);
    if (shooter.coast < 0.9) play(shooter, 'idle', { loop: true, fade: 0.5, follow: true });
  }
  tickPlayer(shooter, dt);
}
function prepStrike() { STRIKE = prepContact('strike', 0.2); PASS = prepContact('pass', 0.15); if (TRACE) window.__contact = { STRIKE, PASS }; }
// когда в записи нога бьёт по мячу (самая быстрая стопа) и где стопа в этот момент относительно таза
function prepContact(clipName, tMin) {
  const a = shooter.mixer.clipAction(clipOf(clipName)); shooter.mixer.stopAllAction(); a.reset().play();
  const fp = (n) => { shooter.model.updateMatrixWorld(true); return shooter.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()); };
  let best = 0, tc = 0.6, foot = 'RightFoot', prev = {};
  for (let t = 0; t <= a.getClip().duration - 0.02; t += 1 / 60) { shooter.mixer.setTime(t); for (const n of ['LeftFoot', 'RightFoot']) { const q = fp(n); if (prev[n] && t > tMin) { const v = q.distanceTo(prev[n]) * 60; if (v > best) { best = v; tc = t; foot = n; } } prev[n] = q; } }
  // где ударная стопа в момент касания относительно таза: туда мяч подводится во время замаха (визуальный контакт = событие удара)
  shooter.mixer.setTime(tc); const fpos = fp(foot), hp = shooter.hips.getWorldPosition(new THREE.Vector3()), yaw = shooter.holder.rotation.y;
  const dx = fpos.x - hp.x, dz = fpos.z - hp.z, f = dx * Math.sin(yaw) + dz * Math.cos(yaw), side = -(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  const dur = a.getClip().duration; a.stop(); shooter.act = null; return { tc, dur, foot, at: { f: Math.max(0.25, Math.min(0.7, f + 0.12)), s: Math.max(-0.25, Math.min(0.25, side)) } };
}

// ---------- МАТЧ 3 НА 3 (экспериментальный режим, ?mode=match) ----------
// Мы — белые: управляемый игрок, партнёр-бот и наш вратарь у ворот z = L; атакуем ворота z = 0 (с боковой камеры — слева
// направо). Соперники — тёмные: два бота и вратарь у ворот z = 0; атакуют ворота z = L.
// Вратарь дальних ворот — та же логика, что у ближних: на время его расчёта мир поворачивается на 180° (withGK) — для него
// его ворота тоже на z = 0. Боты решают раз в ~0,2 с, бегают, ведут, принимают и бьют с теми же ограничениями, что и игрок,
// и видят только текущее положение (без чужого будущего ввода и без «гарантированных» перехватов).
// Упрощения: нет офсайдов и фолов; аут, угловой — мяч ставится на линию и разыгрывается ногой; от ворот — мяч у вратаря.
const GK = []; // [0] — вратарь соперников у ворот z = 0, [1] — наш вратарь у ворот z = L
let gkCur = 0; // чей вратарь сейчас «текущий» (keeper / GKS / kick указывают на него)
const AUTOPLAY = Q.get('trace') === '1' && Q.get('auto') === '1'; // проверка: мной тоже играет бот
const NO_RENDER = Q.get('trace') === '1' && Q.get('nr') === '1'; // проверка логики без отрисовки (быстрее)
const MT = { score: [0, 0], clock: 0, st: 'play', stT: 0, last: 0, next: null, restart: null, gkHold: null, kickTeam: 0, paused: false, shown: '' };
const AI = { think: 0.2, shootD: 22, tackleD: 1.15, tackleCd: 1.2, keepAway: 9.15 };
// сложность соперников (?diff=0|1|2, выбирается в хабе): как часто думают, как охотно отбирают, как точно и часто бьют,
// насколько быстрее бегают, как реагирует их вратарь. Наши боты — всегда «средние».
const DIFFS = [
  { think: 0.3, tackle: 0.22, noise: 2.6, want: 0.7, spd: 0.95, gk: { reaction: 0.25, diveReach: 2.6 } },
  { think: 0.2, tackle: 0.4, noise: 2.0, want: 1, spd: 1, gk: { reaction: 0.18, diveReach: 2.8 } },
  { think: 0.14, tackle: 0.55, noise: 1.4, want: 1.25, spd: 1.03, gk: { reaction: 0.15, diveReach: 3.0 } },
];
const DIFF = DIFFS[Math.max(0, Math.min(2, Number(Q.get('diff') ?? 1) || (Q.get('diff') === '0' ? 0 : 1)))];
const DF = (team) => (team === 1 ? DIFF : DIFFS[1]);
// расстановки: «дом» каждого места [x, глубина] (0 — своя линия ворот, 1 — чужая). me — место управляемого (нападающий).
// В игре дом сдвигается за мячом и вперёд/назад в атаке и обороне (как линии настоящей команды).
const FORM = {
  3: { me: [0, 0.42], slots: [[-9, 0.4]] },
  // 4-3-3 — те же места, что в «Моём составе» хаба (x — от центра, глубина — от своей линии ворот)
  11: { me: [0, 0.84], slots: [[-20.7, 0.31], [-7.6, 0.27], [7.6, 0.27], [20.7, 0.31], [-14.1, 0.5], [0, 0.46], [14.1, 0.5], [-18.5, 0.78], [18.5, 0.78]] },
};
const formOf = () => FORM[NSIDE] || FORM[3];
function homeBase(a) { // [x, глубина] места игрока: из состава хаба (позиция в схеме) или из стандартной схемы
  if (a.ai && a.ai.hxy) return a.ai.hxy;
  const F = formOf(), list = a.team === 0 ? F.slots : [F.me, ...F.slots]; return (a.id === 'me' ? F.me : list[a.ai.home ?? 0]) || F.me;
}
// Команда — блок: линии держат расстояние между собой и двигаются за мячом.
// В атаке блок поднимается за мячом (защитники — не дальше середины поля), ширина — полная.
// В обороне — компактно и ближе к мячу: линии сжимаются, ширина меньше, всё смещается в сторону мяча.
function homeOf(a, attacking) {
  const [hx, d0] = homeBase(a), t = a.team, bd = t === 0 ? (MATCH.L - B.p.z) / MATCH.L : B.p.z / MATCH.L;
  let d;
  if (attacking) { d = d0 + Math.max(0, Math.min(0.3, bd - 0.3)) + 0.08; if (d0 < 0.36) d = Math.min(d, 0.5); }
  else d = 0.42 + (d0 - 0.5) * 0.7 + Math.max(-0.3, Math.min(0.12, bd - 0.5)) * 0.85;
  d = Math.max(0.07, Math.min(0.88, d));
  return { x: clampX(hx * (attacking ? 1 : 0.78) + B.p.x * (attacking ? 0.15 : 0.3), 2), z: t === 0 ? MATCH.L - d * MATCH.L : d * MATCH.L };
}
const KIT_US = { shirt: '#f4f4f2', shorts: '#f4f4f2', socks: '#f4f4f2' }, KIT_THEM = { shirt: '#2c2e35', shorts: '#26282e', socks: '#2c2e35' }, KIT_GK2 = { shirt: '#2fbf71', shorts: '#1d2430', socks: '#2fbf71' };
const teamOf = (id) => (id === 'me' || id === 'mate' || id === 'gk2' || (typeof id === 'string' && id[0] === 't') ? 0 : 1); // наши: me, mate, t2…; соперники: o1…, gk
const attackZ = (team) => (team === 0 ? 0 : MATCH.L); // ворота, которые атакует команда
const ownZ = (team) => (team === 0 ? MATCH.L : 0);
const fwdZ = (team) => (team === 0 ? -1 : 1); // «вперёд» вдоль поля для команды
const gkId = (j) => (j === 0 ? 'gk' : 'gk2');
const gkOfTeam = (team) => (team === 0 ? 1 : 0); // индекс вратаря команды
const clampX = (x, m = 1.2) => Math.max(-MATCH.HW + m, Math.min(MATCH.HW - m, x));
const clampZ = (z, m = 1.2) => Math.max(m, Math.min(MATCH.L - m, z));
// все полевые игроки: [я, партнёр, партнёры t2…, соперники o1…] (P — физика, pl — модель, ai — состояние бота).
// «me» — всегда тот, кем управляю: при смене модели и физика меняются местами между «me» и другим местом команды.
function actors() {
  if (!run._act) run._act = [{ id: 'me', team: 0 }, { id: 'mate', team: 0, slot: run.mate }, ...run.allies.map((x) => ({ id: x.id, team: 0, slot: x })), ...run.opp.map((x) => ({ id: x.id, team: 1, slot: x }))];
  const A = run._act; A[0].P = run.P; A[0].pl = shooter; A[0].ai = run.meAI;
  for (let i = 1; i < A.length; i++) { const x = A[i].slot; A[i].P = x.P; A[i].pl = x.pl; A[i].ai = x; }
  return A;
}
const actorOf = (id) => actors().find((a) => a.id === id) || null;
const owning = () => B.state === 'owned' || B.state === 'strike';
const ownerTeam = () => (B.state === 'held' || owning()) && B.owner ? teamOf(B.owner) : -1; // −1 — мяч ничей
// команда в атаке: мяч у неё или летит после её паса/удара (во время передачи линия не откатывается назад)
const attackPhase = (team) => { const ot = ownerTeam(); return ot === team || (ot === -1 && MT.last === team); };
function matchFoes(j) { return actors().filter((a) => a.team === (j === 0 ? 0 : 1)).map((a) => a.P); } // кто атакует ворота вратаря j
function matchOwnerP() { if (!owning()) return null; const a = actorOf(B.owner); return a ? a.P : null; }
// ---- вратарь j: переключение и расчёт в его системе координат ----
function gkUse(j) { if (j === gkCur) return; GK[gkCur].kick = kick; gkCur = j; keeper = GK[j].pl; GKS = GK[j].S; kick = GK[j].kick; if (GK[j].kc) Object.assign(BP.CFG.keeper, GK[j].kc); }
// наш вратарь — по карточке: прыжок (1-я характеристика) — дальше достаёт, реакция (4-я) — раньше прыгает
function gkFromCard(c) { const st = c ? c.st : []; return { reaction: 0.23 - 0.07 * k01(st[3]), diveReach: 2.6 + 0.35 * k01(st[0]) }; }
function gkCtx(j, fn) { const was = gkCur; gkUse(j); try { return fn(); } finally { gkUse(was); } }
let worldFlipped = false;
function flipWorld(dir) { // поворот всего, что читает логика вратаря: мяч, полевые игроки, сам вратарь
  const L = MATCH.L; worldFlipped = dir > 0; BP.flipBall(B, L);
  for (const a of actors()) { const P = a.P; P.p.x = -P.p.x; P.p.z = L - P.p.z; P.v.x = -P.v.x; P.v.z = -P.v.z; P.yaw += dir * Math.PI; }
  const h = keeper.holder; h.position.x = -h.position.x; h.position.z = L - h.position.z; h.rotation.y += dir * Math.PI; h.updateWorldMatrix(false, false);
  if (keeper.lock) { keeper.lock.x = -keeper.lock.x; keeper.lock.z = L - keeper.lock.z; }
  GKS.v.x = -GKS.v.x; GKS.v.z = -GKS.v.z; if (GKS.ip) GKS.ip = { x: -GKS.ip.x, z: L - GKS.ip.z, t: GKS.ip.t };
  if (kick && typeof kick.cx === 'number') kick.cx = -kick.cx;
}
function withGK(j, fn) {
  if (!MATCH_ON || j === 0) return gkCtx(0, fn);
  return gkCtx(1, () => { flipWorld(1); try { return fn(); } finally { flipWorld(-1); } });
}
// мяч у вратаря: в руках, а при розыгрыше — опускается к ноге (плавно, без скачка)
function holdBall() {
  if (!MATCH_ON) return handsAt(B.p);
  const j = B.owner === 'gk2' ? 1 : 0, G = MT.gkHold;
  if (G && G.j === j && G.feet) { const k = GK[j].pl.holder; B.p.set(k.position.x + Math.sin(k.rotation.y) * 0.42, R, k.position.z + Math.cos(k.rotation.y) * 0.42); return; } // пас назад: мяч у ноги
  if (G && G.j === j && G.phase === 'throw') { GK[j].pl.body[1].getWorldPosition(B.p); B.p.y = Math.max(R, B.p.y - 0.06); return; } // замах: мяч в правой руке
  gkCtx(j, () => handsAt(B.p));
}
function gkGot(j) { // вратарь j забрал мяч — потом сам разыграет
  B.state = 'held'; B.owner = gkId(j); B.v.set(0, 0, 0); B.w.set(0, 0, 0); BP.clearGoalFlags(B);
  MT.gkHold = { j, t: 0, phase: 'hold', target: null }; MT.restart = null; MT.last = 1 - j; MT.off = null; if (MATCH_ON) statGot(1 - j, 'gk');
  if (j === 0) run.chase = false;
  const S = GK[j].S; if (!['save', 'down', 'getup', 'smother'].includes(S.st)) { S.st = 'pos'; S.t = 0; S.v.set(0, 0, 0); GK[j].pl.smother = false; }
}
// Розыгрыш вратарём (записи Mixamo): ближе ~22 м — катит мяч рукой низом (goalkeeper_pass, мяч уходит из руки у самой
// травы на 1,2 с), дальше — бросок рукой сверху (goalkeeper_overhand_throw, мяч уходит на 1,5 с, верхом). Мяч всё время
// в правой руке, уходит из неё в момент броска; адресат — свободный партнёр (у нас — чаще управляемый игрок).
const GKT = { roll: { clip: 'goalkeeper_pass', tc: 1.2, dur: 3.17 }, throw: { clip: 'goalkeeper_overhand_throw', tc: 1.5, dur: 2.87 } };
const gkFoot = (far) => { const n = far ? 'strike' : 'pass', c = clipOf(n), C = far ? STRIKE : PASS; return { clip: n, tc: C ? C.tc : 0.4, dur: c ? c.duration : 1.5, foot: far ? 'lofted' : 'ground' }; };
// пас назад своему вратарю: руками брать нельзя — выходит навстречу и принимает ногой, потом ждёт команды «Отдать пас»
function gkBackPass(h) {
  const bk = MT.back; if (!bk) return;
  if (B.state !== 'free' || MT.last !== 0 || simT - bk.t > 6 || state !== 'play' || MT.st !== 'play') { MT.back = null; return; }
  const K = GK[1].pl, k = K.holder, S = GK[1].S;
  if ((bk.mpT = (bk.mpT || 0) - h) <= 0) { bk.mpT = 0.1; bk.mp = meetPoint({ p: k.position }, 4.5); }
  const tx = bk.mp.x, tz = Math.min(MATCH.L - 0.3, bk.mp.z), dx = tx - k.position.x, dz = tz - k.position.z, d = Math.hypot(dx, dz), st = Math.min(d, 4.5 * h);
  if (d > 0.05) { k.position.x += (dx / d) * st; k.position.z += (dz / d) * st; }
  let dy = Math.atan2(B.p.x - k.position.x, B.p.z - k.position.z) - k.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); k.rotation.y += dy * (1 - Math.exp(-h * 8));
  const want = d > 0.3 ? 'jog' : 'gk_ready'; if (K.name !== want) play(K, want, { loop: true, fade: 0.2, follow: true });
  S.st = 'pos'; S.v.set(0, 0, 0); K.smother = false;
  const db = Math.hypot(B.p.x - k.position.x, B.p.z - k.position.z);
  if (db < 0.85 && B.p.y < 0.7) gkTrapFeet();
}
function gkTrapFeet() {
  MT.back = null; gkGot(1); MT.gkHold.feet = true; sfx.touch(); const K = GK[1].pl; play(K, 'gk_idle', { loop: true, fade: 0.2, follow: true });
}
function gkTick(h) {
  const G = MT.gkHold; if (!G) return;
  const K = GK[G.j].pl, S = GK[G.j].S, team = 1 - G.j, k = K.holder; G.t += h;
  if (G.phase === 'after') { // бросок сделан: доигрывает запись, потом «точка» вратаря переносится туда, где он оказался
    if (K.t > G.kind.dur - 0.15) { const w = K.hips.getWorldPosition(v3); k.position.set(w.x, 0, w.z); MT.gkHold = null; }
    return;
  }
  if (B.state !== 'held' || B.owner !== gkId(G.j)) { MT.gkHold = null; return; }
  if (G.phase === 'hold') {
    if (G.t > 4 && ['rush', 'save', 'smother'].includes(S.st)) { S.st = 'pos'; S.t = 0; S.v.set(0, 0, 0); K.smother = false; }
    if (S.st !== 'pos' || G.t < 0.9 || state !== 'play') return;
    if (G.j === 1 && !AUTOPLAY) { // наш вратарь: бросок делаешь сам кнопкой «Пас» (ждёт до 6 с, потом катит управляемому)
      const pg = $('#pass-g'); if (pg && !MT.gkCmd && pg.textContent !== '↑ далеко') pg.textContent = '↑ далеко';
      if (!MT.gkCmd && G.t < (G.feet ? 4 : 6)) return;
      const cmd = MT.gkCmd || { kind: 'ground', inp: null }; MT.gkCmd = null; if (pg) pg.textContent = '';
      const target = cmd.inp && Math.hypot(cmd.inp.x, cmd.inp.y) > 0.3 ? pickReceiver({ p: k.position, yaw: k.rotation.y }, cmd.inp, true) : actorOf('me');
      G.target = target; G.force = G.feet ? gkFoot(cmd.kind === 'lofted') : cmd.kind === 'lofted' ? GKT.throw : GKT.roll; G.phase = 'turn'; G.t = 0; return;
    }
    const A = actors().filter((a) => a.team === team), foes = actors().filter((a) => a.team !== team);
    let best = A[0], bs = -1e9;
    for (const a of A) { const open = Math.min(...foes.map((f) => segDist(k.position.x, k.position.z, a.P.p.x, a.P.p.z, f.P.p.x, f.P.p.z)));
      const sc = Math.min(open, 4) * 2 - Math.abs(Math.hypot(a.P.p.x - k.position.x, a.P.p.z - k.position.z) - 14) * 0.15 + (a.id === 'me' ? 2 : 0); if (sc > bs) { bs = sc; best = a; } }
    G.target = best; G.phase = 'turn'; G.t = 0;
  } else if (G.phase === 'turn') {
    const P = G.target.P; let dy = Math.atan2(P.p.x - k.position.x, P.p.z - k.position.z) - k.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); k.rotation.y += dy * (1 - Math.exp(-h * 9));
    if (G.t > 0.35) {
      const far = Math.hypot(P.p.x - k.position.x, P.p.z - k.position.z) > 22;
      G.kind = G.force || (G.feet ? gkFoot(far) : far ? GKT.throw : GKT.roll); G.phase = 'throw'; G.t = 0;
      play(K, G.kind.clip, { t: Math.max(0, G.kind.tc - 1.0), fade: 0.15, speed: 1.15, follow: false });
    }
  } else if (G.phase === 'throw' && K.t >= G.kind.tc) {
    const P = G.target.P, hand = G.feet ? B.p : K.body[1].getWorldPosition(v3), lead = G.kind === GKT.roll || G.kind.foot === 'ground' ? 0.9 : 1.3;
    const tgt = new THREE.Vector3(P.p.x + P.v.x * lead, 0, P.p.z + P.v.z * lead);
    if (G.feet) { const fk = G.kind.foot; B.state = 'free'; B.owner = null; B.lockOwner = gkId(G.j); B.lockUntil = simT + 0.5; B.mustClear = false; B.p.y = R;
      const pv = BP.passVelocity(B, tgt, fk, fk === 'ground' ? 0.5 : 0.2); B.v.set(pv.v.x, pv.v.y, pv.v.z); B.w.set(pv.w.x, pv.w.y, pv.w.z);
      ballPrev.copy(B.p); sfx.kick(fk === 'ground' ? 0.2 : 0.45); MT.last = team; G.phase = 'after'; return; }
    B.p.set(hand.x, Math.max(R, hand.y - 0.06), hand.z); B.state = 'free'; B.owner = null; B.lockOwner = gkId(G.j); B.lockUntil = simT + 0.5; B.mustClear = false;
    const pv = BP.passVelocity(B, tgt, G.kind === GKT.roll ? 'ground' : 'lofted', G.kind === GKT.roll ? 0.3 : 0); B.v.set(pv.v.x, pv.v.y, pv.v.z); B.w.set(pv.w.x, pv.w.y, pv.w.z);
    ballPrev.copy(B.p); sfx.hands(false); MT.last = team; G.phase = 'after';
  }
}
// ---- первое касание: куда бот хочет повести мяч ----
function botIntent(a) { const t = a.ai && a.ai.want; return t ? { x: t.x, z: t.z } : { x: 0, z: fwdZ(a.team) }; }
// ---- отбор стоя (подкатов нет): короткий выпад к мячу и тычок ногой (запись паса) ----
// Шанс зависит от того, достаёт ли нога до мяча в момент тычка, откуда идёт отбор (спереди — лучше, сзади — хуже),
// закрыт ли мяч корпусом владельца и как быстро он бежит. Выбитый мяч отскакивает к ногам отбиравшего, но он ещё
// должен его взять (обычный приём). Промах — игрок теряет темп.
const TK = { reach: 3.0, lunge: 6.8, lungeT: 0.2, contact: 0.16, cd: 0.9 };
function tryTackle(a) {
  const ai = a.ai; if (!ai || ai.tkCd > 0 || ai.tk || state !== 'play' || (owning() && B.owner === a.id)) return false;
  const own = owning() ? actorOf(B.owner) : null; // выбивать есть у кого, только если соперник с мячом рядом
  if (!own || own.team === a.team) return false;
  const P = a.P, tx = B.p.x + B.v.x * 0.18 - P.p.x, tz = B.p.z + B.v.z * 0.18 - P.p.z, d = Math.hypot(tx, tz);
  if (d > TK.reach) return false;
  ai.tkCd = TK.cd; ai.tk = { t: 0, done: false, dx: tx / (d || 1), dz: tz / (d || 1), sp: Math.max(0, Math.min(TK.lunge, (d - 0.5) / TK.lungeT)) };
  P.yaw = Math.atan2(ai.tk.dx, ai.tk.dz); P.lockYaw = TK.lungeT + 0.1; // разворот к мячу — часть выпада
  play(a.pl, 'pass', { t: Math.max(0, PASS.tc - 0.21), fade: 0.06, speed: 1.35, follow: true });
  return true;
}
const inTackleRange = (a) => { const own = owning() ? actorOf(B.owner) : null; return !!own && own.team !== a.team && Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z) <= TK.reach; };
function cancelOwnerAction(id) { if (id === 'me') { run.strike = null; run.pass = null; cancelCharge(); } else { const o = actorOf(id); if (o && o.ai) { o.ai.pass = null; o.ai.strike = null; o.ai.fire = false; o.ai.sfire = false; } } }
function tackleTick(a, h) {
  const ai = a.ai; if (!ai) return; ai.tkCd = Math.max(0, (ai.tkCd || 0) - h); if (ai.slowT > 0) ai.slowT -= h;
  const tk = ai.tk; if (!tk) return; tk.t += h; const P = a.P;
  if (tk.t < TK.lungeT && tk.sp > 0) { P.v.x = tk.dx * tk.sp; P.v.z = tk.dz * tk.sp; } // выпад
  if (!tk.done && tk.t >= TK.contact) {
    tk.done = true; const own = owning() ? actorOf(B.owner) : null; let ok = false;
    if (own && own.team !== a.team) {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), d = Math.hypot(P.p.x + fx * 0.55 - B.p.x, P.p.z + fz * 0.55 - B.p.z), O = own.P;
      const rx = P.p.x - O.p.x, rz = P.p.z - O.p.z, rl = Math.hypot(rx, rz) || 1, front = (Math.sin(O.yaw) * rx + Math.cos(O.yaw) * rz) / rl;
      const shield = segDist(P.p.x, P.p.z, B.p.x, B.p.z, O.p.x, O.p.z) < 0.28; // между ногой и мячом — корпус владельца
      const p = (d > 1.0 ? 0 : d < 0.45 ? 0.92 : d < 0.75 ? 0.72 : 0.35) * (front > 0.3 ? 1 : front > -0.55 ? 0.78 : 0.45) * (shield ? 0.7 : 1) * (Math.hypot(O.v.x, O.v.z) > 5 ? 0.85 : 1);
      if (TRACE) console.log('tackle', JSON.stringify({ id: a.id, d: +d.toFixed(2), front: +front.toFixed(2), shield, p: +p.toFixed(2) }));
      if (Math.random() < p) { // выбил: мяч свободен, катится к ногам отбиравшего
        ok = true; cancelOwnerAction(own.id); BP.release(B, own.id, simT, 0.7, false); MST().tackles[a.team]++; MT.passPend = null;
        // у кого отобрали — спотыкается (запись soccer_trip) и на секунду теряет скорость
        if (Math.random() < 0.6) { play(own.pl, 'soccer_trip', { t: 0.15, fade: 0.1, speed: 1.25, follow: true }); own.pl.once = { name: 'soccer_trip', until: 1.3 }; const oa = own.id === 'me' ? run.meAI : own.ai; if (oa) oa.slowT = 0.9; }
        B.v.set(fx * 1.2 + P.v.x * 0.45, 0.15, fz * 1.2 + P.v.z * 0.45); B.w.set(0, 0, 0); MT.last = a.team; sfx.touch();
        if (a.id === 'me' || own.id === 'me') sfx.buzz('medium');
      }
    }
    if (!ok) { ai.slowT = 0.45; P.v.x *= 0.5; P.v.z *= 0.5; } // промахнулся — потерял темп
  }
  if (tk.t > 0.5) ai.tk = null;
}
// ---- бот: решение раз в ~0,2 с, движение — каждый шаг ----
function botStep(a, h) {
  const ai = a.ai, P = a.P;
  if ((ai.thinkT = (ai.thinkT || 0) - h) <= 0) { ai.thinkT = DF(a.team).think + Math.random() * 0.06; botThink(a); }
  let inp = { x: 0, y: 0 };
  if (ai.tx !== undefined && state === 'play') {
    ai.tx = clampX(ai.tx, -0.5); ai.tz = clampZ(ai.tz, 0.3);
    if (NSIDE > 3 && !ai.run && !ai.chasing && B.owner !== a.id && attackPhase(a.team) && !(MT.restart && MT.restart.taker === a.id)) { // в атаке не стоит в офсайде
      const lim = offsideLine(a.team) + 0.5; if (depthOf(a.team, ai.tz) < lim) ai.tz = a.team === 0 ? lim : MATCH.L - lim; }
    const dx = ai.tx - P.p.x, dz = ai.tz - P.p.z, d = Math.hypot(dx, dz), k = d < 0.3 ? 0 : Math.min(1, d / 1.5) * (ai.slowT > 0 ? 0.5 : 1) * (ai.pace || 1);
    if (k > 0) inp = { x: (dx / d) * k, y: (-dz / d) * k };
  }
  P.sprint = !!ai.sprint && !(ai.slowT > 0) && state === 'play'; P.charging = false;
  // без мяча — корпусом к мячу (бег боком и спиной), если не убегает от него далеко и не рвётся вперёд
  { const own = B.owner === a.id, bx = B.p.x - P.p.x, bz = B.p.z - P.p.z, bl = Math.hypot(bx, bz) || 1, tl = ai.tx !== undefined ? Math.hypot(ai.tx - P.p.x, ai.tz - P.p.z) : 0;
    const away = ai.tx !== undefined && tl > 0.5 ? ((ai.tx - P.p.x) * bx + (ai.tz - P.p.z) * bz) / (tl * bl) : 1;
    P.face = !own && state === 'play' && !ai.run && !ai.chasing && bl < 45 && (away > -0.55 || tl < 6) ? B.p : null; }
  if (ai.run && (ai.run.t -= h) <= 0) ai.run = null; // забегание кончилось — снова по расстановке
  if (state === 'play') inp = stepToBall(P, inp, a.id);
  BP.playerStep(P, inp, h, owning() && B.owner === a.id);
}
function botThink(a) {
  const ai = a.ai, P = a.P, team = a.team, A = actors(), mates = A.filter((x) => x.team === team && x !== a), foes = A.filter((x) => x.team !== team);
  ai.sprint = false; ai.pace = 1; ai.want = null; if (B.state !== 'free') ai.chasing = false;
  if (state !== 'play') { ai.tx = P.p.x; ai.tz = P.p.z; return; }
  const R0 = MT.restart, ot = ownerTeam();
  if (R0 && R0.team !== team) { // чужой розыгрыш: не ближе AI.keepAway к мячу, в остальном — оборона
    botDefend(a, mates, foes);
    const dx = P.p.x - B.p.x, dz = P.p.z - B.p.z, d = Math.hypot(dx, dz) || 1, tx = ai.tx - B.p.x, tz = ai.tz - B.p.z, td = Math.hypot(tx, tz) || 1;
    if (td < AI.keepAway) { ai.tx = B.p.x + (tx / td) * AI.keepAway; ai.tz = B.p.z + (tz / td) * AI.keepAway; }
    if (d < AI.keepAway - 0.5) { ai.tx = B.p.x + (dx / d) * AI.keepAway; ai.tz = B.p.z + (dz / d) * AI.keepAway; ai.sprint = true; }
    return;
  }
  if (R0 && R0.taker === a.id && B.state === 'free') { ai.tx = B.p.x; ai.tz = B.p.z; ai.sprint = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) > 4; ai.want = { x: -B.p.x * 0.1, z: fwdZ(team) }; return; }
  if (owning() && B.owner === a.id) return botWithBall(a, mates, foes);
  if (ot === team) {
    if (NSIDE > 3) { const ow = B.state === 'held' ? null : actorOf(B.owner), O = ow ? ow.P.p : B.p, d = (Q) => Math.hypot(Q.p.x - O.x, Q.p.z - O.z);
      const closer = mates.filter((m) => m.id !== B.owner && homeBase(m)[1] >= 0.4 && d(m.P) < d(P)).length;
      if (closer >= 2 || B.state === 'held' || homeBase(a)[1] < 0.4 || d(P) > 26) return formation(a, foes, true); }
    return botSupport(a, mates, foes);
  }
  if (B.state === 'free' && MT.back && team === 0) return formation(a, foes, true); // пас нашему вратарю — не перехватываем
  if (B.state === 'free') {
    // свободный мяч: бежит ближайший из команды (оценка — расстояние до места, где мяч будет через полсекунды);
    // у нас — только если он заметно ближе меня. Точку встречи считает только он.
    const fx = B.p.x + B.v.x * 0.5, fz = B.p.z + B.v.z * 0.5, est = (Q) => Math.hypot(fx - Q.p.x, fz - Q.p.z);
    const my = est(P), bots = mates.filter((m) => m.id !== 'me'), me = mates.find((m) => m.id === 'me');
    const first = bots.every((m) => my <= est(m.P) + (ai.chasing ? 1.5 : 0)) && (!me || (run.chase ? my + 4 < est(me.P) : my < est(me.P) + 1));
    ai.chasing = first;
    if (first) { const mp = meetPoint(P, BP.CFG.player.sprint * 0.9, B.p.y > 1.5 || B.v.y > 1.5); ai.tx = mp.x; ai.tz = mp.z; ai.sprint = Math.hypot(mp.x - P.p.x, mp.z - P.p.z) > 2.5; ai.want = { x: -mp.x * 0.15, z: fwdZ(team) }; return; }
    if (NSIDE > 3) return formation(a, foes, attackPhase(team));
    return ot === -1 && Math.random() < 0.5 ? botSupport(a, mates, foes, true) : botDefend(a, mates, foes);
  }
  return botDefend(a, mates, foes);
}
// по расстановке; в обороне — подтягивается к ближайшему сопернику в своей зоне (со стороны своих ворот)
function formation(a, foes, attacking) {
  const ai = a.ai, P = a.P, H = homeOf(a, attacking); let tx = H.x, tz = H.z;
  // забегание: полузащитник или нападающий в атаке время от времени рвётся вперёд в свободный коридор — под пас на ход
  if (!attacking) ai.run = null;
  else if (!ai.run && homeBase(a)[1] >= 0.45 && Math.random() < 0.05 && !isOffside(a)) {
    const fz = fwdZ(a.team), side = Math.abs(H.x) > 10 ? -Math.sign(H.x) : Math.random() < 0.5 ? -1 : 1;
    ai.run = { x: clampX(H.x + side * (3 + Math.random() * 5), 3), z: clampZ(H.z + fz * (12 + Math.random() * 8), 4), t: 2.6 };
  }
  if (ai.run) { ai.tx = ai.run.x; ai.tz = ai.run.z; ai.sprint = true; ai.pace = 1; ai.role = 'run'; return; }
  if (!attacking) {
    let f = null, fd = 12; for (const o of foes) { const d = Math.hypot(o.P.p.x - H.x, o.P.p.z - H.z); if (d < fd) { fd = d; f = o; } }
    if (f) { const gz = ownZ(a.team), gx = -f.P.p.x, gl = Math.hypot(gx, gz - f.P.p.z) || 1; tx += (f.P.p.x + (gx / gl) * 2 - tx) * 0.45; tz += (f.P.p.z + ((gz - f.P.p.z) / gl) * 2 - tz) * 0.45; }
  }
  ai.tx = tx; ai.tz = tz; ai.sprint = Math.hypot(tx - P.p.x, tz - P.p.z) > 6; ai.pace = Math.hypot(tx - P.p.x, tz - P.p.z) < 3 ? 0.6 : 1; ai.role = 'form';
}
// с мячом: удар, если близко и есть просвет; пас, если прессингуют или партнёр открыт лучше; иначе — ведение к воротам в обход
function botWithBall(a, mates, foes) {
  const ai = a.ai, P = a.P, team = a.team, gz = attackZ(team), fz = fwdZ(team);
  ai.holdT = (ai.holdT || 0) + AI.think;
  if (ai.strike || ai.pass || B.state === 'strike') return;
  if (MT.restart && MT.restart.kind === 'kickoff' && MT.restart.taker === a.id && mates[0] && ai.holdT > 0.5) { // разводка с центра — пас ближнему партнёру
    const r = mates.slice().sort((x, y) => Math.hypot(x.P.p.x - P.p.x, x.P.p.z - P.p.z) - Math.hypot(y.P.p.x - P.p.x, y.P.p.z - P.p.z))[0];
    if (startPass(P, a.id, a.pl, 0.1, 'ground')) { (a.id === 'me' ? run.pass : ai.pass).recv = r; ai.holdT = 0; } return; }
  const dGoal = Math.hypot(P.p.x, P.p.z - gz), gk = GK[team === 0 ? 0 : 1].pl.holder.position;
  const near = foes.map((f) => ({ f, d: Math.hypot(f.P.p.x - P.p.x, f.P.p.z - P.p.z) })).sort((x, y) => x.d - y.d)[0];
  // удар: в дальний от вратаря угол, с ошибкой; только если линию не закрывает полевой соперник
  const big = NSIDE > 3; // 11 на 11: смелее — бьют чаще и издалека, в последней трети реже отдают назад
  if (dGoal < (big ? 27 : AI.shootD) && Math.abs(P.p.z - gz) > 2) {
    const side = gk.x > P.p.x * 0.3 ? -1 : 1, tx = side * (GW - 1.2) + (Math.random() * 2 - 1) * DF(team).noise; // в угол, но не всегда точно: бывает и мимо
    const clear = foes.every((f) => segDist(P.p.x, P.p.z, tx, gz, f.P.p.x, f.P.p.z) > (big ? 0.75 : 1.0));
    const facing = (Math.sin(P.yaw) * (tx - P.p.x) + Math.cos(P.yaw) * (gz - P.p.z)) / Math.max(1, dGoal) > (big ? 0 : 0.2);
    const want = big ? (dGoal < 11 ? 0.75 : dGoal < 17 ? 0.5 : dGoal < 23 ? 0.28 : 0.12) : dGoal < 11 ? 0.5 : dGoal < 17 ? 0.3 : 0.1;
    if (clear && facing && Math.random() < want * DF(team).want) { botShoot(a, tx, Math.min(0.85, 0.32 + dGoal / 40 + Math.random() * 0.15)); return; }
  }
  // навес: с фланга в последней трети — верхом на партнёра в штрафной (там он бьёт головой)
  if (NSIDE > 3 && Math.abs(P.p.x) > 15 && depthOf(team, P.p.z) < 32 && ai.holdT > 0.4 && Math.random() < 0.3) {
    const t = mates.filter((q) => Math.abs(q.P.p.x) < 11 && depthOf(team, q.P.p.z) < 17 && depthOf(team, q.P.p.z) > 5 && !isOffside(q)).sort((x, y) => Math.abs(x.P.p.x) - Math.abs(y.P.p.x))[0];
    if (t && startPass(P, a.id, a.pl, 0.55, 'lofted')) { (a.id === 'me' ? run.pass : ai.pass).recv = t; ai.holdT = 0; return; }
  }
  // пас: лучший открытый партнёр
  const openOf = (q) => Math.min(...foes.map((f) => segDist(P.p.x, P.p.z, q.P.p.x, q.P.p.z, f.P.p.x, f.P.p.z)));
  let m = mates[0];
  if (mates.length > 1) { let bs = -1e9; for (const q of mates) { const dd = Math.hypot(q.P.p.x - P.p.x, q.P.p.z - P.p.z); if (dd < 5 || dd > 34) continue; const sc = Math.min(openOf(q), 4) * 2 + (q.P.p.z - P.p.z) * fz * 0.15 - dd * 0.05 + (q.ai && q.ai.run ? 3 : 0) - (isOffside(q) && Math.random() < 0.85 ? 20 : 0); if (sc > bs) { bs = sc; m = q; } } }
  const open = m ? openOf(m) : 0;
  const mAhead = m ? (m.P.p.z - P.p.z) * fz : -99, md = m ? Math.hypot(m.P.p.x - P.p.x, m.P.p.z - P.p.z) : 99;
  const pressed = near && near.d < 2.3 && ((near.f.P.p.z - P.p.z) * fz > -0.5);
  const lastThird = big && depthOf(team, P.p.z) < 32 && dGoal > 0; // у чужих ворот — сам идёт и бьёт, отдаёт только под давлением или вперёд
  if (m && open > 1.6 && md > 5 && md < 34 && ((pressed && Math.random() < 0.6) || (m.ai && m.ai.run && mAhead > 3 && Math.random() < 0.55) || (!lastThird && ai.holdT > 1.6 && mAhead > 2 && Math.random() < 0.45) || (ai.holdT > (lastThird ? 2.6 : 3.5) && (!lastThird || mAhead > -2) && Math.random() < 0.5))) {
    const runner = m.ai && m.ai.run && mAhead > 0, kind = runner ? 'through' : 'ground'; // забегающему — на ход (далёкому — верхом)
    if (startPass(P, a.id, a.pl, md > 22 ? 0.7 : md > 14 ? 0.45 : 0.2, kind)) { const job = a.id === 'me' ? run.pass : ai.pass; job.recv = m; if (runner && md > 18) job.loft = true; ai.holdT = 0; return; }
  }
  // ведение: к воротам; соперник впереди — обходим в сторону, где просторнее
  let dx = -P.p.x * 0.25, dz = fz * 6;
  if (near && near.d < 4.5 && ((near.f.P.p.z - P.p.z) * fz > -0.3)) { const s = near.f.P.p.x > P.p.x ? -1 : 1, s2 = Math.abs(P.p.x + s * 4) > MATCH.HW - 2 ? -s : s; dx += s2 * 5; dz *= 0.6; }
  if (Math.abs(P.p.z - gz) < 5) dx = -P.p.x * 0.8; // у лицевой — к центру
  ai.tx = clampX(P.p.x + dx, 1.5); ai.tz = clampZ(P.p.z + dz, 0.8); ai.sprint = !(near && near.d < (big ? 2.4 : 3.5)) && dGoal > 9;
  ai.want = { x: dx, z: dz };
}
function botShoot(a, tx, pw) {
  const ai = a.ai; ai.strike = { pw, tx }; B.state = 'strike'; B.strikeAt = STRIKE.at;
  play(a.pl, 'strike', { t: Math.max(0, STRIKE.tc - 0.3), fade: 0.1, speed: 1.25, follow: true });
}
// удар бота: в системе координат его атаки (ворота на z = 0) — та же функция удара, что у игрока
function fireBotStrike(a) {
  const s = a.ai.strike; a.ai.strike = null;
  const shoot = (tx) => { const ang = Math.max(-1.6, Math.min(1.6, tx / GW)) * BP.CFG.shot.stickAngle, aim = { x: Math.sin(ang), y: Math.cos(ang) };
    const sv = BP.shotVelocity(B, a.P, aim, Math.min(0.92, s.pw * (a.pl.shotK || 1)), 'drive', goalDef(), 0);
    if (BP.applyShot(B, sv, BP.controlPoint(a.P, B), a.id, simT)) { BP.clearGoalFlags(B); planKeeper(); return true; } sfx.touch(); return false; };
  const ok = a.team === 0 ? withGK(0, () => shoot(s.tx)) : withGK(1, () => shoot(-s.tx));
  if (ok) { kicked(s.pw); MT.last = a.team; MT.kicker = a.pl; statShot(a.team); }
}
// без мяча, мяч у своих: открыться — точка сбоку/впереди владельца, не на линии паса за соперником, не в ногах у владельца
const SPOTS = [[-10, 8], [10, 8], [-14, 1], [14, 1], [-9, -6], [9, -6], [-5, 14], [5, 14]]; // поле полное — открываются шире
function botSupport(a, mates, foes, loose = false) {
  const ai = a.ai, P = a.P, team = a.team, fz = fwdZ(team);
  const ow = B.state === 'held' ? GK[B.owner === 'gk2' ? 1 : 0].pl.holder.position : (owning() && actorOf(B.owner)) ? actorOf(B.owner).P.p : B.p;
  const spot = (k, out) => { const [sd, fw] = SPOTS[k], wide = B.state === 'held' ? 1.6 : 1; out.x = clampX(ow.x + sd * wide, 2); out.z = clampZ(ow.z + fw * fz * (B.state === 'held' ? 2 : 1), 2.5); return out; };
  const score = (k) => { const c = spot(k, supT); let sc = Math.hypot(c.x - P.p.x, c.z - P.p.z) * 0.25 + Math.abs(Math.hypot(c.x - ow.x, c.z - ow.z) - 12) * 0.4;
    for (const f of foes) { if (segDist(ow.x, ow.z, c.x, c.z, f.P.p.x, f.P.p.z) < 1.8) sc += 5; if (Math.hypot(f.P.p.x - c.x, f.P.p.z - c.z) < 2.5) sc += 2; }
    for (const m of mates) if (m.P !== actorOf(B.owner)?.P && Math.hypot(m.P.p.x - c.x, m.P.p.z - c.z) < 5) sc += 4; // не толпиться
    if (Math.abs(c.z - attackZ(team)) < 3) sc += 3; return sc; };
  if ((ai.pickT = (ai.pickT || 0) - AI.think) <= 0 || ai.pick === undefined || ai.pick < 0) {
    ai.pickT = 0.6; let best = 0, bs = 1e9; for (let k = 0; k < SPOTS.length; k++) { const sc = score(k); if (sc < bs) { bs = sc; best = k; } }
    if (ai.pick === undefined || ai.pick < 0 || bs < score(ai.pick) - 1.5) ai.pick = best;
  }
  const c = spot(ai.pick, { x: 0, z: 0 }); ai.tx = c.x; ai.tz = c.z; ai.sprint = Math.hypot(c.x - P.p.x, c.z - P.p.z) > 6;
  if (loose) { ai.pace = 0.8; }
}
// оборона: ближайший к владельцу прессингует (со стороны своих ворот), второй страхует — держит второго соперника
function botDefend(a, mates, foes) {
  const ai = a.ai, P = a.P, team = a.team, G = { x: 0, z: ownZ(team) };
  if (B.state === 'held' && teamOf(B.owner) !== team) { // мяч у чужого вратаря — отходим из его штрафной
    const H = homeOf(a, false), lim = attackZ(team) - fwdZ(team) * 20;
    ai.tx = H.x; ai.tz = team === 0 ? Math.max(H.z, lim) : Math.min(H.z, lim); ai.sprint = false; ai.pace = 0.8; ai.role = 'form'; return;
  }
  const carrier = owning() ? actorOf(B.owner) : null, C = carrier && carrier.team !== team ? carrier.P.p : B.p;
  const dC = (Q) => Math.hypot(Q.p.x - C.x, Q.p.z - C.z);
  if (NSIDE > 3) {
    const zoneOk = (x) => { const H = homeOf(x, false); return Math.hypot(H.x - C.x, H.z - C.z) < 24; }; // своя зона рядом с мячом
    const bots = mates.filter((x) => x.id !== 'me' && zoneOk(x)), me = mates.find((x) => x.id === 'me'), meNear = me && dC(me.P) < 6, rank = bots.filter((x) => dC(x.P) < dC(P)).length;
    const role = !zoneOk(a) ? 'form' : meNear ? (rank === 0 ? 'cover' : 'form') : rank === 0 ? 'press' : rank === 1 ? 'cover' : 'form';
    if (role === 'form') return formation(a, foes, false);
    ai.role = role;
  }
  const m = NSIDE > 3 ? (mates.filter((x) => x.id !== 'me').sort((x, y) => dC(x.P) - dC(y.P))[0] || mates[0]) : mates[0];
  const presser = NSIDE > 3 ? ai.role === 'press' : !m || (ai.role === 'press' ? dC(P) < dC(m.P) + 2 : dC(P) + 2 < dC(m.P)) || (m.id === 'me' && !(btn.press) && dC(P) < dC(m.P) + 1.5 && dC(m.P) > 6);
  ai.role = presser ? 'press' : 'cover';
  if (presser) {
    const gx = G.x - C.x, gz = G.z - C.z, gl = Math.hypot(gx, gz) || 1, d = dC(P), off = d > 3 ? 1.3 : 0.75, lead = carrier && d > 2 ? Math.min(0.6, d / 8) : 0;
    ai.tx = C.x + (carrier ? carrier.P.v.x * lead : 0) + (gx / gl) * off; ai.tz = C.z + (carrier ? carrier.P.v.z * lead : 0) + (gz / gl) * off; // наперерез: где владелец будет чуть позже
    ai.sprint = d > 3.5; ai.pace = d < 2 ? 0.75 : 1;
    if (carrier && carrier.team !== team && d < 2.6) {
      const bx = B.p.x - P.p.x, bz = B.p.z - P.p.z, bl = Math.hypot(bx, bz) || 1, face = (bx * Math.sin(P.yaw) + bz * Math.cos(P.yaw)) / bl;
      if (bl < 2.2 && face > 0.3 && Math.random() < DF(team).tackle) tryTackle(a);
    }
  } else { // страховка: между вторым соперником и своими воротами; если он далеко — между мячом и воротами
    const other = foes.filter((f) => !carrier || f.id !== carrier.id).sort((x, y) => Math.hypot(x.P.p.x - P.p.x, x.P.p.z - P.p.z) - Math.hypot(y.P.p.x - P.p.x, y.P.p.z - P.p.z))[0] || foes[0], O = other.P.p;
    const gx = G.x - O.x, gz = G.z - O.z, gl = Math.hypot(gx, gz) || 1;
    let tx = O.x + (gx / gl) * 2.4, tz = O.z + (gz / gl) * 2.4;
    // владелец мяча подошёл к штрафной — страхующий встаёт на линию удара (между мячом и центром ворот)
    const cg = Math.hypot(C.x - G.x, C.z - G.z);
    if (cg < 24) { const k = Math.min(1, (24 - cg) / 8), bx = C.x + ((G.x - C.x) / cg) * Math.min(3.5, cg * 0.45), bz = C.z + ((G.z - C.z) / cg) * Math.min(3.5, cg * 0.45); tx += (bx - tx) * k; tz += (bz - tz) * k; }
    ai.tx = clampX(tx, 1); ai.tz = clampZ(tz, 1.5); ai.sprint = Math.hypot(ai.tx - P.p.x, ai.tz - P.p.z) > 5;
  }
}
// «Прессинг» (держишь): управляемый игрок сам идёт к владельцу мяча со стороны своих ворот; джойстик в это время не нужен
function pressInput(P, inp) {
  if (!MATCH_ON || !btn.press || state !== 'play') return inp;
  const carrier = owning() ? actorOf(B.owner) : null; if (!carrier || carrier.team === 0) return inp;
  const C = carrier.P.p, G = { x: 0, z: MATCH.L }, gx = G.x - C.x, gz = G.z - C.z, gl = Math.hypot(gx, gz) || 1, d = Math.hypot(C.x - P.p.x, C.z - P.p.z);
  const tx = C.x + (gx / gl) * (d > 3 ? 1.2 : 0.7) - P.p.x, tz = C.z + (gz / gl) * (d > 3 ? 1.2 : 0.7) - P.p.z, tl = Math.hypot(tx, tz);
  if (tl < 0.15) return { x: 0, y: 0 };
  P.sprint = d > 3.5; const k = Math.min(1, tl / 1.2) * (d < 2 ? 0.8 : 1);
  return { x: (tx / tl) * k, y: (-tz / tl) * k };
}
const matchDef = () => MATCH_ON && run && state === 'play' && ownerTeam() === 1; // мяч у соперников — кнопки «Отбор» и «Прессинг»
// автоподбор в матче — только если мяч рядом или я ближе партнёра
function matchChaseOk() {
  if (!MATCH_ON) return true; if (MT.back) return false; if (MT.restart && MT.restart.taker !== 'me') return false;
  const P = run.P, d = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z), M = actorOf(nearestAlly()).P, dm = Math.hypot(B.p.x - M.p.x, B.p.z - M.p.z);
  return d < 9 || d < dm + 1;
}
// ---- шаг матча ----
function matchPhys(h) {
  if (run.swapNow) { if (run.swapTo === '-') { run.swapNow = false; run.swapTo = null; } else { swapControl(run.swapTo || 'mate'); run.chasePlan = null; holdAfterPass(); } } // пас вратарю — управление остаётся
  const P = run.P, live = state === 'play', A = actors();
  for (const a of A) a.P.spd = a.pl.spd || 1;
  if (state === 'goal') { celebrateStep(h); gkTick(h); matchRules(h); for (const j of [0, 1]) withGK(j, () => keeperAI(h)); return; } // гол: празднование, мяч в сетке
  P.sprint = btn.sprint || keys.ShiftLeft || keys.ShiftRight; P.charging = run.charge >= 0; P.face = null; // управляемый — корпус по ходу
  if (AUTOPLAY) botStep(A[0], h); else {
    let inp = live ? pressInput(P, chaseInput(P, passInput(), h)) : { x: 0, y: 0 };
    if (run.meAI.slowT > 0) { inp = { x: inp.x * 0.5, y: inp.y * 0.5 }; P.sprint = false; }
    if (live) inp = stepToBall(P, inp, 'me');
    BP.playerStep(P, inp, h, owning() && B.owner === 'me');
  }
  feintTick(h);
  for (const a of A) { if (a.id !== 'me') botStep(a, h); tackleTick(a, h); }
  // игроки не проходят друг сквозь друга и сквозь вратарей
  for (let i = 0; i < A.length; i++) {
    const p = A[i].P.p;
    for (let j = i + 1; j < A.length; j++) { const q = A[j].P.p, sx = q.x - p.x, sz = q.z - p.z, sl = Math.hypot(sx, sz); if (sl < 0.8 && sl > 1e-4) { const push = (0.8 - sl) / 2; p.x -= (sx / sl) * push; p.z -= (sz / sl) * push; q.x += (sx / sl) * push; q.z += (sz / sl) * push; } }
    for (const g of GK) { const kh = g.pl.holder.position, dx = p.x - kh.x, dz = p.z - kh.z, dl = Math.hypot(dx, dz); if (dl < 0.6 && dl > 1e-4) { p.x = kh.x + (dx / dl) * 0.6; p.z = kh.z + (dz / dl) * 0.6; } }
    BP.updateClear(B, A[i].P, A[i].id);
  }
  // мяч у кого-то из полевых: ведение (мяч упирается в тела соперников), удары и пасы в момент касания ногой
  const own = owning() ? actorOf(B.owner) : null;
  if (own) {
    const near = (a) => Math.abs(a.P.p.x - B.p.x) < 3 && Math.abs(a.P.p.z - B.p.z) < 3; // мяч упирается только в тех, кто рядом
    const obs = A.filter((a) => a.team !== own.team && near(a)).flatMap((a) => a.pl.sph || []).concat(GK[gkOfTeam(1 - own.team)].pl.sph || []);
    if (BP.controlStep(B, own.P, h, obs) === 'lost') { sfx.touch(); cancelOwnerAction(own.id); }
    else if (own.id === 'me') {
      if (run.fire) { run.fire = false; if (run.strike) { fireStrike(); MT.last = 0; } }
      if (run.passFire) { run.passFire = false; if (run.pass) { const r = run.pass.recv || pickReceiver(P, input(), false, true); run.swapTo = r.id; if (firePass(P, 'me', run.pass, r.P)) { MT.last = 0; if (r.id === 'gk2') { MT.back = { t: simT }; run.swapTo = '-'; } } } run.pass = null; }
      if (run.meAI.sfire) { run.meAI.sfire = false; if (run.meAI.strike) fireBotStrike(own); } // только в автоигре для проверки
    } else {
      const ai = own.ai;
      if (ai.fire) { ai.fire = false; if (ai.pass) { const r = ai.pass.recv || A.find((x) => x.team === own.team && x !== own); firePass(own.P, own.id, ai.pass, r.P); ai.pass = null; MT.last = own.team; } }
      if (ai.sfire) { ai.sfire = false; if (ai.strike) fireBotStrike(own); }
    }
  } else if (B.state === 'free' && live && MT.st === 'play' && !tryHeader()) { // приём: берёт тот, кто ближе (на розыгрыше — только подающий)
    let best = null, bd = 1e9;
    for (const a of A) {
      if (MT.restart && MT.restart.kind !== 'kickoff' && MT.restart.taker !== a.id && MT.restart.t < 6) continue;
      if (MT.back && a.team === 0) continue; // пас своему вратарю идёт мимо своих
      if (!BP.canCapture(B, a.P, a.id, simT)) continue;
      const d = Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z); if (d < bd) { bd = d; best = a; }
    }
    if (best && checkOffside(best)) best = null; // принял, стоя вне игры, — свисток
    if (best) {
      statGot(best.team);
      const ji = best.id === 'me' ? passInput() : null, intent = best.id === 'me' ? (Math.hypot(ji.x, ji.y) > 0.2 ? { x: ji.x, z: -ji.y } : null) : botIntent(best);
      const vin = Math.hypot(B.v.x, B.v.z), rel = BP.firstTouch(B, best.P, best.id, intent); sfx.touch(); if (best.id === 'me' && rel > 5) sfx.buzz('light');
      // приём паса на месте или шагом — запись приёма: наклон и остановка мяча стопой (receive, с 0,65 с)
      if (vin > 6 && Math.hypot(best.P.v.x, best.P.v.z) < 2.6 && best.pl.name !== 'strike' && best.pl.name !== 'pass') { play(best.pl, 'receive', { t: 0.65, fade: 0.12, speed: 1.35, follow: true }); best.pl.once = { name: 'receive', until: 1.2 }; }
      MT.last = best.team; if (MT.restart && MT.restart.kind !== 'kickoff') MT.restart = null;
      if (best.ai) { best.ai.holdT = 0; best.ai.pass = null; best.ai.strike = null; }
    }
  }
  // вратари: в своей системе координат; бросок в ноги владельцу мяча
  for (let j = 0; j < 2; j++) withGK(j, () => keeperAI(h));
  gkBackPass(h);
  for (let j = 0; j < 2; j++) {
    const K = GK[j].pl; if (!K.smother || !owning()) continue;
    const ow = actorOf(B.owner); if (!ow || ow.team === 1 - j) continue; // свой игрок с мячом — не бросается
    const hit = K.sph.find((q) => Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z) < q.r + R + 0.04);
    if (hit && hit.kind === 'hand') { cancelOwnerAction(ow.id); gkGot(j); sfx.hands(true); }
    else if (hit) {
      const nx = B.p.x - hit.x, nz = B.p.z - hit.z, nl = Math.hypot(nx, nz) || 1, rel = Math.max(2.5, Math.hypot(B.v.x - ow.P.v.x, B.v.z - ow.P.v.z) + 2);
      cancelOwnerAction(ow.id); BP.release(B, ow.id, simT, 0.35, false); B.v.set((nx / nl) * rel, 0.6, (nz / nl) * rel); sfx.hands(false); MT.last = 1 - j;
    }
  }
  gkTick(h);
  // мяч перешёл к соперникам — управление само переходит к тому из нас, кто ближе к мячу (как автосмена в мобильном футболе)
  const ot = ownerTeam();
  if (ot === 1 && MT.prevOT !== 1 && !AUTOPLAY && !run.strike && !run.pass) {
    const me = A[0].P, to = nearestAlly(), mt = actorOf(to).P; if (Math.hypot(B.p.x - mt.p.x, B.p.z - mt.p.z) + 3 < Math.hypot(B.p.x - me.p.x, B.p.z - me.p.z)) { swapControl(to); run.chasePlan = null; }
  }
  MT.prevOT = ot; if (ot >= 0 && live) MST().poss[ot] += h;
  matchRules(h);
}
// ---- удар головой ----
// Высокий мяч (≈1,2–2,6 м) рядом с игроком: в чужой штрафной — головой по воротам (я — в сторону джойстика, бот — в дальний угол),
// у своих ворот — вынос вперёд, в остальных местах — скидка партнёру (бот) или приём головой себе под ноги (я).
function tryHeader() {
  if (B.p.y < 1.2 || B.p.y > 2.6 || B.v.y > 2.5 || simT - (MT.headT ?? -9) < 0.35) return false;
  let best = null, bd = 1.05;
  for (const a of actors()) {
    if (B.lockOwner === a.id && (simT < B.lockUntil || B.mustClear)) continue;
    if (MT.restart && MT.restart.kind !== 'kickoff' && MT.restart.taker !== a.id && MT.restart.t < 6) continue;
    if (MT.back && a.team === 0) continue;
    const d = Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z); if (d < bd) { bd = d; best = a; }
  }
  if (!best) return false;
  if (!checkOffside(best)) header(best);
  return true;
}
function header(a) {
  const team = a.team, P = a.P, gz = attackZ(team), g = BP.CFG.g, me = a.id === 'me';
  const dGoal = Math.hypot(P.p.x, P.p.z - gz), dOwn = Math.hypot(P.p.x, P.p.z - ownZ(team));
  const lob = (tx, tz, ty, sp) => { const dx = tx - B.p.x, dz = tz - B.p.z, d = Math.hypot(dx, dz) || 1, t = d / sp; B.v.set((dx / d) * sp, (ty - B.p.y) / t + 0.5 * g * t, (dz / d) * sp); };
  let kind;
  if (dGoal < 17 && Math.abs(P.p.x) < 19 && (P.p.z - gz) * -fwdZ(team) > 1) { // по воротам
    const inp = me ? input() : null, aimX = me && Math.abs(inp.x) > 0.25 ? Math.sign(inp.x * (team === 0 ? 1 : -1)) : (Math.random() < 0.5 ? -1 : 1);
    const tx = aimX * (GW - 0.6 - Math.random() * 0.9) + (Math.random() * 2 - 1) * 0.5, ty = 0.4 + Math.random() * 1.6;
    lob(tx, gz, ty, 13 + Math.random() * 4 + (dGoal > 10 ? 2 : 0)); kind = 'shot';
  } else if (dOwn < 26) { // вынос от своих ворот
    const tx = clampX(P.p.x + (P.p.x >= 0 ? 6 : -6) + (Math.random() * 2 - 1) * 6, 3), tz = clampZ(P.p.z + fwdZ(team) * (18 + Math.random() * 8), 3);
    lob(tx, tz, R, 15); kind = 'clear';
  } else { // приём головой себе под ноги, чуть вперёд (я — по джойстику, бот — к чужим воротам)
    const i = me ? input() : null, il = i ? Math.hypot(i.x, i.y) : 0, fx = il > 0.3 ? i.x / il : me ? Math.sin(P.yaw) : 0, fz = il > 0.3 ? -i.y / il : me ? Math.cos(P.yaw) : fwdZ(team);
    lob(P.p.x + fx * 1.4, P.p.z + fz * 1.4, R, 2.6); kind = 'cushion';
  }
  B.w.set(0, 0, 0); B.lockOwner = a.id; B.lockUntil = simT + (kind === 'cushion' ? 0.25 : 0.35); B.mustClear = false; BP.clearGoalFlags(B);
  MT.headT = simT; MT.last = team; MT.kicker = a.pl; MST().heads[team]++; if (MT.passPend) statGot(team, 'head');
  if (kind === 'cushion' && B.p.y < 1.55) { play(a.pl, 'stall_soccerball_4', { t: 0.85, fade: 0.1, speed: 1.3, follow: true }); a.pl.once = { name: 'stall_soccerball_4', until: 1.5 }; } // на уровне пояса — бедром
  else { play(a.pl, 'header_soccerball', { t: 0.4, fade: 0.08, speed: 1.35, follow: true }); a.pl.cele = 1.15; }
  sfx.touch(); if (me) sfx.buzz('medium');
  if (kind === 'shot') { statShot(team, 'голова'); withGK(team === 0 ? 0 : 1, () => planKeeper()); }
}
// ---- офсайд (11 на 11) ----
// глубина — расстояние до ворот, которые атакует команда; линия офсайда — второй с конца соперник (вратарь считается).
// Вне игры, если в момент паса партнёра игрок на чужой половине ближе к воротам, чем и мяч, и эта линия.
const depthOf = (team, z) => (team === 0 ? z : MATCH.L - z);
let lineMemo = { t: -1, v: [0, 0] };
function offsideLine(team) {
  if (lineMemo.t !== simT) { lineMemo.t = simT; for (const tm of [0, 1]) { const opp = 1 - tm, d = actors().filter((a) => a.team === opp).map((a) => depthOf(tm, a.P.p.z)); d.push(depthOf(tm, GK[gkOfTeam(opp)].pl.holder.position.z)); d.sort((x, y) => x - y); lineMemo.v[tm] = d[1] ?? 0; } }
  return Math.min(lineMemo.v[team], depthOf(team, B.p.z), MATCH.L / 2); // ближе этого к воротам — вне игры
}
const isOffside = (a) => NSIDE > 3 && depthOf(a.team, a.P.p.z) < offsideLine(a.team) - 0.3;
// пас сделан: запоминаем, кто из партнёров был вне игры
function markOffside(who) {
  if (!MATCH_ON || NSIDE <= 3) return; const team = teamOf(who), list = []; // по игроку (pl), не по метке: при пасе метки me/mate меняются
  for (const a of actors()) if (a.team === team && a.id !== who && isOffside(a)) list.push({ pl: a.pl, x: a.P.p.x, z: a.P.p.z });
  MT.off = list.length ? { team, list } : null;
}
// мяч дошёл до игрока: был вне игры — свисток, штрафной в пользу соперника с того места
function checkOffside(a) {
  const O = MT.off; if (!O) return false;
  const at = a.team === O.team && O.list.find((q) => q.pl === a.pl);
  if (!at) { MT.off = null; return false; }
  MT.off = null; MST().off[a.team]++;
  if (owning()) { cancelOwnerAction(B.owner); BP.release(B, B.owner, simT, 0.3, false); }
  MT.next = { kind: 'free', team: 1 - a.team, x: clampX(at.x, 1), z: clampZ(at.z, 2) }; MT.st = 'dead'; MT.stT = 0; run.chase = false; MT.back = null;
  sfx.whistle(); matchBanner('Офсайд'); return true;
}
// ---- статистика матча (для итогов) ----
const MST = () => MT.stats || (MT.stats = { poss: [0, 0], shots: [0, 0], on: [0, 0], passes: [0, 0], passOk: [0, 0], tackles: [0, 0], off: [0, 0], corners: [0, 0], heads: [0, 0], lost: { int: 0, head: 0, out: 0, gk: 0, free: 0 }, goals: [] });
const matchMin = () => Math.max(1, Math.min(90, Math.ceil(((MATCH.time - MT.clock) / MATCH.time) * 90)));
function statPass(team) { MST().passes[team]++; MT.passPend = { team }; MT.shotPend = null; }
function statGot(team, how = 'int') { if (MT.passPend) { if (MT.passPend.team === team) MST().passOk[team]++; else MST().lost[how]++; MT.passPend = null; } MT.shotPend = null; }
function statShot(team, how = 'нога') { MST().shots[team]++; MT.shotPend = { team }; MT.passPend = null; MT.shotHow = how; MT.shotFrom = Math.round(Math.hypot(B.p.x, B.p.z - attackZ(team))); }
// ---- правила: время, аут, угловой, от ворот, гол, начало с центра ----
function matchRules(h) {
  if (MT.st === 'play' || MT.st === 'dead') { MT.clock = Math.max(0, MT.clock - h); if (MT.clock <= 0 && state === 'play') return matchOver(); }
  if (MT.restart) { MT.restart.t += h; if (MT.restart.kind === 'kickoff' && (MT.restart.t > 2.5 || Math.hypot(B.p.x, B.p.z - MATCH.L / 2) > 1.2)) MT.restart = null; } // мяч сдвинули — розыгрыш начат
  MT.stT += h;
  if (MT.st === 'goal' && MT.stT > 4.6) return kickoff(MT.kickTeam);
  if (MT.st === 'dead' && MT.stT > 0.8) { MT.st = 'play'; return setRestart(MT.next); }
  if (MT.st !== 'play' || state !== 'play') return;
  if (B.state === 'held') return;
  const x = B.p.x, z = B.p.z, HW = MATCH.HW, L = MATCH.L, side = Math.abs(x) > HW + R, end0 = z < -R && !B.inGoal, end1 = z > L + R && !(B.g2 && B.g2.inGoal);
  if (!side && !end0 && !end1) return;
  if (owning()) { cancelOwnerAction(B.owner); BP.release(B, B.owner, simT, 0.3, false); }
  const lt = MT.last, sx = Math.sign(x) || 1;
  if (side) MT.next = { kind: 'throw', team: 1 - lt, x: sx * (HW - 0.35), z: clampZ(z, 1) };
  else if (end0) MT.next = lt === 0 ? { kind: 'gk', team: 1 } : { kind: 'corner', team: 0, x: sx * (HW - 0.45), z: 0.45 };
  else MT.next = lt === 1 ? { kind: 'gk', team: 0 } : { kind: 'corner', team: 1, x: sx * (HW - 0.45), z: L - 0.45 };
  MT.st = 'dead'; MT.stT = 0; run.chase = false; sfx.whistle(); MT.off = null; MT.back = null; if (MT.passPend) MST().lost.out++; MT.passPend = null; MT.shotPend = null;
  if (MT.next.kind === 'corner') MST().corners[MT.next.team]++;
  matchBanner(side ? 'Аут' : MT.next.kind === 'gk' ? 'От ворот' : 'Угловой');
}
function setRestart(R0) {
  if (!R0) return;
  if (R0.kind === 'gk') { const j = gkOfTeam(R0.team); BP.clearGoalFlags(B); gkGot(j); MT.last = R0.team; return; }
  placeBall(new THREE.Vector3(R0.x, R, R0.z)); BP.clearGoalFlags(B); B.lockOwner = null; B.mustClear = false;
  const mates = actors().filter((a) => a.team === R0.team);
  let tk = mates[0]; for (const a of mates) if (Math.hypot(a.P.p.x - R0.x, a.P.p.z - R0.z) < Math.hypot(tk.P.p.x - R0.x, tk.P.p.z - R0.z)) tk = a;
  if (R0.team === 0 && tk.id === 'mate') { swapControl(); tk = actorOf('me'); } // свой розыгрыш — подаю сам
  MT.restart = { kind: R0.kind, team: R0.team, taker: tk.id, t: 0 };
}
function matchGoal(end) {
  if (MT.st !== 'play' || state !== 'play') return;
  const team = end === 0 ? 0 : 1; MT.score[team]++; MT.kickTeam = 1 - team; MT.st = 'goal'; MT.stT = 0; MT.restart = null; MT.off = null; MT.back = null;
  if (MT.shotPend && MT.shotPend.team === team) MST().on[team]++; MT.shotPend = null; MT.passPend = null;
  state = 'goal'; cancelCharge(); run.strike = null; run.pass = null; btn.press = false;
  // празднует автор гола (последний ударивший из забившей команды, иначе ближайший к мячу), партнёр бежит к нему
  const A = actors(), mine = A.filter((a) => a.team === team);
  let hero = mine.find((a) => a.pl === MT.kicker) || mine.reduce((x, y) => (Math.hypot(y.P.p.x - B.p.x, y.P.p.z - B.p.z) < Math.hypot(x.P.p.x - B.p.x, x.P.p.z - B.p.z) ? y : x));
  const gz = attackZ(team), sx = TV_CAMS[tvCamSel].yaw < 60 ? 1 : Math.sign(hero.P.p.x) || 1; // к угловому флажку со стороны камеры
  MST().goals.push({ team, how: MT.shotHow, from: MT.shotFrom, min: matchMin(), name: (team === 0 ? hero.pl.nick : null) || (team === 0 ? 'Игрок клуба' : 'Соперник') });
  MT.cele = { team, hero: hero.pl, t: 0, jumped: false, spot: { x: sx * (MATCH.HW - 4), z: gz + (team === 0 ? 7 : -7) } };
  sfx.roar(); sfx.buzz('heavy'); shake = 0.12; matchBanner('ГОЛ!', true); matchHud(true);
}
// празднование гола: автор бежит к угловому флажку и подпрыгивает (запись «удар головой» — прыжок), партнёр бежит к нему,
// пропустившие медленно идут на свою половину. Всё — обычным бегом (playerStep), без телепортов.
function celebrateStep(h) {
  const C = MT.cele; if (!C) return; C.t += h;
  const A = actors(), hero = A.find((a) => a.pl === C.hero);
  for (const a of A) {
    const P = a.P; let tx = P.p.x, tz = P.p.z, pace = 0.5;
    if (a === hero) {
      tx = C.spot.x; tz = C.spot.z; pace = 1; const d = Math.hypot(tx - P.p.x, tz - P.p.z);
      if (!C.jumped && (d < 1.5 || C.t > 2.6)) { C.jumped = true; const cl = clipOf('header_soccerball'); play(a.pl, 'header_soccerball', { t: 0.15, fade: 0.15, speed: 1.05, follow: true }); a.pl.cele = cl ? cl.duration - 0.1 : 1.5; }
      if (C.jumped) pace = 0;
    } else if (a.team === C.team && hero && A.filter((b) => b.team === C.team && b !== hero && Math.hypot(b.P.p.x - hero.P.p.x, b.P.p.z - hero.P.p.z) < Math.hypot(P.p.x - hero.P.p.x, P.p.z - hero.P.p.z)).length < 2) { tx = hero.P.p.x - Math.sign(hero.P.p.x || 1) * 1.6; tz = hero.P.p.z + (C.team === 0 ? 1.2 : -1.2); pace = 1; }
    else { tx = P.p.x * 0.7; tz = MATCH.L / 2 + (a.team === 0 ? 8 : -8); }
    const dx = tx - P.p.x, dz = tz - P.p.z, d = Math.hypot(dx, dz), k = d < 0.4 ? 0 : Math.min(pace, d / 1.5);
    P.sprint = pace === 1 && d > 3; P.charging = false;
    BP.playerStep(P, k > 0 ? { x: (dx / d) * k, y: (-dz / d) * k } : { x: 0, y: 0 }, h, false);
  }
}
// начало с центра (в начале матча и после гола): короткое затемнение, игроки на своих местах, мяч — у подающего
function kickoff(team, first = false) {
  MT.st = 'kick'; const fade = $('#fade'); if (fade) fade.classList.add('on');
  setTimeout(() => {
    const L = MATCH.L, cz = L / 2, A = actors(), us = team === 0;
    // [x, z] от центра «назад» на свою половину (для команды 0 назад — это +z)
    const lay = (a, x, back) => { const b = a.team === 0 ? 1 : -1; a.P.p.x = x; a.P.p.z = cz + b * back; a.P.v.x = a.P.v.z = 0; a.P.yaw = a.team === 0 ? Math.PI : 0; a.pl.holder.position.set(a.P.p.x, 0, a.P.p.z); a.pl.holder.rotation.y = a.P.yaw; resetSpheres(a.pl); a.pl.cele = 0; if (a.ai) { a.ai.tx = undefined; a.ai.pick = -1; a.ai.tk = null; a.ai.strike = null; a.ai.pass = null; a.ai.fire = a.ai.sfire = false; } };
    // подающий — в центре; остальные — на своих местах расстановки, на своей половине; соперники подающих — не ближе 9,15 м
    const F = formOf(), placeHome = (a, h, kicking) => { let x = h[0], back = Math.max(1.5, (0.5 - h[1]) * L); if (!kicking) { const r = Math.hypot(x, back); if (r < 9.6) { const k = 9.6 / (r || 1); x *= k; back = Math.max(back * k, 2); } } lay(a, x, back); };
    for (const a of A) {
      const kicking = a.team === team, h = homeBase(a);
      if ((a.id === 'me' && us) || (a.id === 'o1' && !us)) lay(a, 0, 0.55); else placeHome(a, h, kicking);
    }
    run.strike = null; run.pass = null; run.feint = null; B.feintOff = null; run.chase = false; run.chasePlan = null; cancelCharge();
    GK[0].pl.holder.position.set(0, 0, 0.4); GK[0].pl.holder.rotation.set(0, 0, 0); GK[1].pl.holder.position.set(0, 0, L - 0.4); GK[1].pl.holder.rotation.set(0, Math.PI, 0);
    for (let j = 0; j < 2; j++) { gkCtx(j, () => { keeperReset(); kick = null; play(keeper, 'gk_idle', { loop: true, fade: 0.2, follow: true }); }); GK[j].pl.smother = false; resetSpheres(GK[j].pl); }
    MT.gkHold = null;
    const taker = us ? A[0] : actorOf('o1'); placeBall(BP.controlPoint(taker.P, null)); BP.capture(B, taker.P, taker.id); B.trapDur = 0; BP.clearGoalFlags(B); B.lockOwner = null;
    MT.restart = { kind: 'kickoff', team, taker: taker.id, t: 0 }; MT.last = team; MT.cele = null; MT.kicker = null; MT.st = 'play'; MT.stT = 0; state = 'play';
    tvCam(camAim, true); camNow.p.copy(camAim.p); camNow.l.copy(camAim.l);
    setTimeout(() => { if (fade) fade.classList.remove('on'); if (!first) sfx.whistle(); }, 60);
  }, first ? 0 : 260);
}
function matchOver() {
  state = 'over'; MT.st = 'over'; cancelCharge(); btn.press = false; sfx.whistle(); setTimeout(sfx.whistle, 450);
  const [a, b] = MT.score;
  $('#endT').textContent = a > b ? 'Победа!' : a < b ? 'Поражение' : 'Ничья';
  $('#endP').textContent = `Джексоны ${a} : ${b} Гости`;
  $('#again').textContent = 'Реванш'; $('#end').classList.add('on'); matchHud(true);
  matchSummary();
}
const escH = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); // имена приходят из адреса
// итоги: голы с минутами, владение, удары, в створ, точность передач, отборы, угловые, офсайды
function matchSummary() {
  const S = MST(), card = $('#endCard'), box = $('#endS'), gl = $('#endG'); if (!card || !box) return;
  card.classList.add('wide'); box.hidden = false;
  gl.innerHTML = S.goals.map((g) => `<div class="${g.team === 0 ? '' : 'them'}"><b>${g.min}'</b>${escH(g.name)}${g.team === 0 ? '' : ' · гости'}</div>`).join('');
  const pt = S.poss[0] + S.poss[1] || 1, p0 = Math.round((S.poss[0] / pt) * 100), acc = (t) => (S.passes[t] ? Math.round((S.passOk[t] / S.passes[t]) * 100) + '%' : '—');
  const rows = [['Владение', p0 + '%', 100 - p0 + '%', p0, 100 - p0], ['Удары', S.shots[0], S.shots[1]], ['В створ', S.on[0], S.on[1]], ['Передачи', S.passes[0], S.passes[1]],
    ['Точность передач', acc(0), acc(1), S.passes[0] ? (S.passOk[0] / S.passes[0]) * 100 : 0, S.passes[1] ? (S.passOk[1] / S.passes[1]) * 100 : 0], ['Отборы', S.tackles[0], S.tackles[1]], ['Угловые', S.corners[0], S.corners[1]]];
  if (NSIDE > 3) rows.push(['Офсайды', S.off[0], S.off[1]]);
  box.innerHTML = '<h3><span>Джексоны</span><span>Гости</span></h3>' + rows.map(([n, a, b, wa, wb]) => { const x = wa ?? +a, y = wb ?? +b, w = x + y > 0 ? (x / (x + y)) * 100 : 0;
    return `<div class="row"><span>${a}</span><i style="--w:${w.toFixed(0)}%"><em>${n}</em></i><span>${b}</span></div>`; }).join('');
}
let bannerT = 0;
function matchBanner(text, big = false) { const m = $('#msg'); if (!m) return; m.textContent = text; m.className = 'msg on ' + (big ? 'goal' : 'miss'); clearTimeout(bannerT); bannerT = setTimeout(() => (m.className = 'msg'), big ? 2200 : 1100); }
function matchHud(force) {
  const t = Math.ceil(MT.clock), txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, key = txt + MT.score.join(':');
  if (!force && key === MT.shown) return; MT.shown = key;
  $('#score').textContent = `${MT.score[0]} : ${MT.score[1]}`; const c = $('#mclock'); if (c) c.textContent = txt;
  // кнопки по ситуации: мяч у соперников — «Отбор» и «Прессинг»
}
let defShown = null;
// мяч у нашего вратаря (в руках или в ногах после паса назад) — ждёт команды «Отдать пас»
const gkMine = () => MATCH_ON && run && state === 'play' && B.state === 'held' && B.owner === 'gk2' && MT.gkHold && MT.gkHold.phase === 'hold' && !AUTOPLAY;
function matchButtons() {
  const gm = gkMine(), def = !gm && matchDef(), near = def && run && inTackleRange(actorOf('me')); $('#b-shot').classList.toggle('off', def && !near);
  const key = gm ? 'gk' : def ? 'def' : 'att'; if (key === defShown) return; defShown = key;
  const lab = (id, t) => { const b = $(id); if (!b) return; const n = [...b.childNodes].find((x) => x.nodeType === 3 && x.nodeValue.trim()); if (n) n.nodeValue = t; };
  lab('#b-shot', def ? 'Отбор' : 'Удар'); lab('#b-pass', gm ? 'Отдать пас' : def ? 'Прессинг' : 'Пас');
  $('#b-thru').classList.toggle('off', def); $('#pad').classList.toggle('def', def); $('#pad').classList.toggle('gkm', gm);
}
function resetMatch() {
  MT.score = [0, 0]; MT.clock = MATCH.time; MT.st = 'play'; MT.restart = null; MT.gkHold = null; MT.next = null; MT.shown = ''; MT.stats = null; MT.off = null; MT.back = null; MT.passPend = null; MT.shotPend = null;
  const L = MATCH.L; GK[0].kc = Object.assign({}, DIFF.gk); const mk = (pl, kit, id) => { recolor(pl, kit); pl.holder.visible = true; if (pl.sph) pl.sph.forEach((q) => (q.who = id)); play(pl, 'idle', { loop: true, fade: 0.2, follow: true }); resetSpheres(pl); };
  if (shooter0 && shooter !== shooter0) shooter = shooter0;
  // места: наши — me (shooter), mate (wall[0]), t2… (wall[1…N−3]); соперники o1… (дальше); наш вратарь — последняя модель
  const N = NSIDE, ourW = wall.slice(0, N - 2), oppW = wall.slice(N - 2, 2 * N - 3), gk2 = wall[wall.length - 1];
  // кто есть кто: имена и характеристики с карточек (у соперников — средние, скорость — по сложности); при смене имя едет с моделью
  const card = (pl, c, k = 1) => { pl.nick = c ? c.name : 'Игрок клуба'; pl.spd = (0.95 + 0.09 * k01(c ? c.st[0] : 65)) * k; pl.shotK = 0.95 + 0.08 * k01(c ? c.st[1] : 65); };
  const bot = (pl, id, home) => ({ id, pl, home, P: BP.newPlayer({ x: 0, z: L / 2 }, 0), st: 'support', hold: 0, pass: null, fire: false, plan: null, planT: 0, pick: -1, pickT: 0, tkCd: 0, slowT: 0 });
  mk(shooter, myKit || KIT_US, 'me'); card(shooter, LINEUP[0]);
  const ours = ourW.map((pl, i) => { const id = i === 0 ? 'mate' : 't' + (i + 1); mk(pl, myKit || KIT_US, id); card(pl, LINEUP[i + 1]); const b = bot(pl, id, i); b.hxy = hxyOf(LINEUP[i + 1]); return b; });
  const opp = oppW.map((pl, i) => { const id = 'o' + (i + 1); mk(pl, KIT_THEM, id); card(pl, { name: 'Гость', st: [76, 74] }, DIFF.spd); return bot(pl, id, i); });
  recolor(gk2, KIT_GK2); gk2.holder.visible = true; gk2.nick = LINEUP[N - 1] ? LINEUP[N - 1].name : 'Игрок клуба';
  for (let k = 2 * N - 2; k < wall.length - 1; k++) wall[k].holder.visible = false;
  // 11 на 11: игроков вне кадра не рисуем (границы — с запасом), тени — только у тех, кто рядом с мячом (lightTick)
  if (N > 3) for (const pl of [shooter, ...ourW, ...oppW]) pl.model.traverse((o) => { if (!o.isSkinnedMesh) return; o.frustumCulled = true; if (!o.boundingSphere) o.computeBoundingSphere(); o.boundingSphere.radius = Math.max(o.boundingSphere.radius, 1.2) * 1.6; });
  const P = BP.newPlayer({ x: 0, z: L / 2 }, Math.PI);
  run = { P, charge: -1, kv: new THREE.Vector3(), strike: null, fire: false, shotT: 0, slowT: 0, t0: simT, lastPost: null, wasStopping: false, pass: null, passFire: false,
    mate: ours[0], allies: ours.slice(1), opp, meAI: { tkCd: 0, slowT: 0, tk: null, hxy: hxyOf(LINEUP[0]) } };
  run.mate.P.yaw = Math.PI;
  $('#end').classList.remove('on'); defShown = null;
  $('#who').textContent = 'Джексоны'; $('#dots').textContent = 'Гости';
  state = 'play'; celebrate = -1; kickoff(0, true); matchHud(true); matchButtons();
  $('#hint').textContent = 'Джойстик слева. «Удар»: держи — сила, оттяни вбок — подкрутка, вверх — переброс. «Пас» — тому, кто в сторону джойстика, зажми и потяни вверх — верхом. «На ход» — в разрез, вверх — верхом за спину защитникам. Мяч у соперника: «Отбор» — коротко, «Прессинг» — держи. Пас назад к своим воротам — вратарю (он примет ногой). Мяч у нашего вратаря — одна кнопка «Отдать пас»: джойстик — кому, вверх — далеко. Навес в штрафную — удар головой сам.';
  let seen = false; try { seen = localStorage.getItem('shot.match.hint1') === '1'; localStorage.setItem('shot.match.hint1', '1'); } catch (e) { /* без памяти */ }
  $('#hint').style.opacity = seen ? 0 : 1;
}
// позы всех, кроме меня и партнёра (они — в runAnim), и нашего вратаря. Тела-шары для столкновений с мячом считаются
// только у тех, кто рядом с мячом (у дальних шары убраны под газон — с мячом они всё равно не встретятся).
function lazySpheres(pl, P, dt) {
  if (Math.abs(P.p.x - B.p.x) < 8 && Math.abs(P.p.z - B.p.z) < 8) { pl.sphAway = false; updSpheres(pl, dt); return; }
  if (!pl.sphAway) { pl.sphAway = true; for (const q of pl.sph) { q.init = false; q.y = -100; } }
}
function matchAnim(dt) {
  runAnim(dt);
  for (const a of actors()) {
    if (a.id === 'me') continue; const o = a.ai;
    if (a.id !== 'mate') { bodyAnim(a.pl, a.P, dt, a.id); if (o.pass && a.pl.name === 'pass' && a.pl.t >= PASS.tc) o.fire = true; }
    if (o.strike && a.pl.name === 'strike' && a.pl.t >= STRIKE.tc) o.sfire = true;
    if (a.id !== 'mate') lazySpheres(a.pl, a.P, dt);
  }
  if (run.meAI.strike && shooter.name === 'strike' && shooter.t >= STRIKE.tc) run.meAI.sfire = true;
  tickPlayer(GK[1].pl, dt); updSpheres(GK[1].pl, dt);
  withGK(1, () => { if (kick && !kick.dived && kick.t >= kick.react) keeperDive(); });
  matchHud(false); matchButtons(); minimap();
  if (NSIDE > 3 && (mm.n % 30) === 0) for (const a of actors()) { const near = Math.hypot(a.P.p.x - B.p.x, a.P.p.z - B.p.z) < 28; if (a.pl.shadowNear !== near) { a.pl.shadowNear = near; a.pl.model.traverse((o) => { if (o.isMesh) o.castShadow = near; }); } }
}
// мини-карта: поле, повёрнутое так же, как его показывает камера; точки — игроки (наши светлые, соперники красные,
// управляемый — бирюзовый), мяч — жёлтый. Перерисовывается через кадр, отдельным маленьким холстом.
const mm = { el: document.getElementById('minimap'), n: 0 }; mm.g = mm.el && mm.el.getContext('2d');
function minimap() {
  if (!mm.g || !MATCH_ON || !run || (mm.n++ & 1)) return;
  const W = mm.el.width, H = mm.el.height, g = mm.g; cam.getWorldDirection(tmpA); tmpA.y = 0; tmpA.normalize();
  const fx = tmpA.x, fz = tmpA.z, rx = -fz, rz = fx; // «вправо» и «вверх» экрана на поле
  const corners = [[-MATCH.HW, 0], [MATCH.HW, 0], [MATCH.HW, MATCH.L], [-MATCH.HW, MATCH.L]].map(([x, z]) => [x * rx + z * rz, x * fx + z * fz]);
  const u0 = Math.min(...corners.map((c) => c[0])), u1 = Math.max(...corners.map((c) => c[0])), w0 = Math.min(...corners.map((c) => c[1])), w1 = Math.max(...corners.map((c) => c[1]));
  const sc = Math.min((W - 8) / (u1 - u0), (H - 8) / (w1 - w0)), ox = (W - (u1 - u0) * sc) / 2, oy = (H - (w1 - w0) * sc) / 2;
  const at = (x, z) => [ox + ((x * rx + z * rz) - u0) * sc, oy + (w1 - (x * fx + z * fz)) * sc];
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(20,70,35,.55)'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
  g.beginPath(); corners.forEach((c, i) => { const p = at(...[[-MATCH.HW, 0], [MATCH.HW, 0], [MATCH.HW, MATCH.L], [-MATCH.HW, MATCH.L]][i]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); g.stroke();
  const h1 = at(-MATCH.HW, MATCH.L / 2), h2 = at(MATCH.HW, MATCH.L / 2); g.beginPath(); g.moveTo(h1[0], h1[1]); g.lineTo(h2[0], h2[1]); g.stroke();
  const dot = (x, z, r, c, ring) => { const [px, py] = at(x, z); g.beginPath(); g.arc(px, py, r, 0, 7); g.fillStyle = c; g.fill(); if (ring) { g.strokeStyle = ring; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1; } };
  for (const a of actors()) if (a.id !== 'me') dot(a.P.p.x, a.P.p.z, 2.6, a.team === 0 ? '#f4f4f2' : '#ff5d6c');
  GK.forEach((k, j) => dot(k.pl.holder.position.x, k.pl.holder.position.z, 2.6, j === 1 ? '#2fbf71' : '#ffd23f'));
  dot(run.P.p.x, run.P.p.z, 3.4, '#3fe0a8', '#0b3d2c'); dot(B.p.x, B.p.z, 2.2, '#ffd84a', '#1b1b1b');
}
// управляемый игрок ушёл за край кадра (камера держит мяч) — стрелка у края экрана показывает, где он
const offEl = document.getElementById('offme'), nameEl = document.getElementById('melbl'), offV = new THREE.Vector3();
function offMarker() {
  if (!offEl) return; if (!MATCH_ON || !run || state === 'load') { offEl.style.display = 'none'; if (nameEl) nameEl.style.display = 'none'; return; }
  offV.copy(shooter.holder.position); offV.y = 1; offV.project(cam);
  const x = (offV.x + 1) / 2, y = (1 - offV.y) / 2, out = x < 0.02 || x > 0.98 || y < 0.04 || y > 0.96;
  // имя управляемого игрока (с карточки) — под ним, мелко, как в FC Mobile
  if (nameEl) { const show = !out && !!shooter.nick && state !== 'load'; nameEl.style.display = show ? 'block' : 'none';
    if (show) { if (nameEl.textContent !== shooter.nick) nameEl.textContent = shooter.nick; offV.copy(shooter.holder.position); offV.y = 0; offV.project(cam); nameEl.style.transform = `translate(${((offV.x + 1) / 2) * innerWidth}px, ${((1 - offV.y) / 2) * innerHeight + 10}px) translate(-50%, 0)`; } }
  if (!out) { offEl.style.display = 'none'; return; }
  const cx = Math.min(0.96, Math.max(0.04, x)) * innerWidth, cy = Math.min(0.58, Math.max(0.16, y)) * innerHeight, ang = Math.atan2(y - 0.5, x - 0.5);
  offEl.style.display = 'block'; offEl.style.transform = `translate(${cx - 14}px, ${cy - 14}px) rotate(${ang}rad)`;
}

// ---------- тренировки для новичка («Развитие навыков» как в FC Mobile) ----------
// Сверху — попытки и очки, подсказки тренера останавливают игру до касания, в конце — карточка «Результат».
// basics — основы: добежать до зоны, пас партнёру, гол; dribble — гонка через ворота из фишек и удар; targets — штрафные по мишеням.
const LS = { coachOn: false, pts: 0, att: 0, step: 0, done: false, props: null, gates: [], discs: [], zone: null, passT: 0, t0: 0, cross: null, zp: null, prevZ: 0 };
const LESSON_INFO = {
  basics: { title: 'Изучите основы управления', label: 'Задание', max: 3, need: 4000, next: 'dribble' },
  dribble: { title: 'Дриблинг: гонка через фишки', label: 'Попытка', max: 2, need: 5000, next: 'targets' },
  targets: { title: 'Удары: мишени и стенка', label: 'Удар', max: 6, need: 3000, next: null },
};
const LI = () => LESSON_INFO[LESSON];
function lessonHud() { const I = LI(); $('#lhL').textContent = I.label.toUpperCase(); $('#lhA').textContent = `${Math.min(I.max, (LESSON === 'basics' ? LS.step : LS.att) + 1)}/${I.max}`; $('#lhP').textContent = LS.pts; }
function lessonPts(v, at) {
  LS.pts += v; lessonHud(); sfx.buzz('light');
  const el = document.createElement('div'); el.className = 'lpop'; el.textContent = '+' + v;
  if (at) { offV.copy(at); offV.project(cam); el.style.left = ((offV.x + 1) / 2) * innerWidth + 'px'; el.style.top = ((1 - offV.y) / 2) * innerHeight + 'px'; } else { el.style.left = '50%'; el.style.top = '30%'; }
  document.body.appendChild(el); setTimeout(() => el.remove(), 1300);
}
// подсказка тренера: игра стоит, пока не коснёшься экрана
function coach(title, text, then) {
  LS.coachOn = true; $('#chT').textContent = title; $('#chP').textContent = text; const c = $('#coach'); c.hidden = false;
  joy.id = null; joy.x = joy.y = 0; btn.sprint = false; btn.press = false; cancelCharge();
  const go = (e) => { e.preventDefault(); e.stopPropagation(); c.removeEventListener('pointerdown', go); c.hidden = true; LS.coachOn = false; last = performance.now() / 1000; if (then) then(); };
  setTimeout(() => c.addEventListener('pointerdown', go), 350);
}
// фишки, зона, ворота из фишек, мишени — простые меши (несколько вызовов отрисовки)
function lessonProps() {
  if (LS.props) return; LS.props = new THREE.Group(); scene.add(LS.props);
  LS.coneG = new THREE.ConeGeometry(0.16, 0.42, 14); LS.coneG.translate(0, 0.21, 0);
  LS.coneM = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.55 });
}
const coneAt = (x, z, m) => { const c = new THREE.Mesh(LS.coneG, m || LS.coneM); c.position.set(x, 0, z); c.castShadow = true; LS.props.add(c); return c; };
function dashTex(color) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeRect(4, 4, 120, 120); g.fillStyle = 'rgba(255,207,58,0.16)'; g.fillRect(4, 4, 120, 120); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function lessonReset() {
  if (!LESSON) return; lessonProps(); LS.cross = null; LS.zp = null; LS.t0 = simT; LS.prevZ = run ? run.P.p.z : 0;
  if (LESSON === 'basics' && LS.step === 0 && !LS.zone) { // зона, до которой надо добежать с мячом
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: dashTex('#ffffff'), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(-7, 0.02, 21); LS.props.add(m); const cs = [[-10, 18], [-4, 18], [-10, 24], [-4, 24]].map(([x, z]) => coneAt(x, z)); LS.zone = { m, cs, x: -7, z: 21 };
  }
  if (LESSON === 'dribble') { // четыре ворот из фишек змейкой до штрафной; пройти — с мячом между фишками
    for (const g of LS.gates) { g.cs.forEach((c) => LS.props.remove(c)); LS.props.remove(g.line); } LS.gates = [];
    [[-4, 35], [4, 29], [-4, 23], [4, 17]].forEach(([x, z]) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.35), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.02, z); LS.props.add(line);
      const mat = LS.coneM.clone(); LS.gates.push({ x, z, done: false, mat, line, cs: [coneAt(x - 1.7, z, mat), coneAt(x + 1.7, z, mat)] });
    });
  }
  if (LESSON === 'targets') { // мишени в воротах; вратаря нет (как в уроке FC Mobile), стенка — манекены
    keeper.holder.position.set(60, 0, -8); keeper.holder.visible = false;
    if (!LS.discs.length) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      ['#ffffff', '#e8343e', '#ffffff', '#e8343e'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 62 - i * 15, 0, 7); g.fill(); });
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      for (const [x, y] of [[-2.85, 1.85], [2.85, 1.85], [-2.85, 0.6], [2.85, 0.6], [-1, 1.95], [1, 1.95]]) {
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })); d.position.set(x, y, -0.06); LS.props.add(d); LS.discs.push({ x, y, d, hit: false });
      }
    }
  }
  lessonHud();
}
function lessonStart() {
  $('#lhud').hidden = false; document.body.classList.add('lesson'); lessonReset();
  if (LESSON !== 'targets') Object.assign(BP.CFG.keeper, { reaction: 0.34, readError: 0.32 }); // новичку — вратарь попроще
  const t = { basics: ['Основы управления', 'Слева — джойстик: веди пальцем, игрок бежит с мячом. Добеги до жёлтой зоны.'],
    dribble: ['Гонка с дриблингом', 'Проведи мяч через все ворота из фишек (+500 за каждые) и забей. Чем быстрее, тем больше очков. Держи «Рывок» — бег быстрее.'],
    targets: ['Удары: мишени', 'Проведи пальцем от мяча к воротам: быстрее — сильнее, изогни линию — мяч закрутится. Попади в мишени — +1000 за каждую.'] }[LESSON];
  setTimeout(() => coach(t[0], t[1]), 700); // сначала поле, потом подсказка
}
function lessonTick() {
  if (!run || LS.done || LS.coachOn) return; const P = run.P;
  if (LESSON === 'basics') {
    if (LS.step === 0 && LS.zone && Math.abs(P.p.x - LS.zone.x) < 3 && Math.abs(P.p.z - LS.zone.z) < 3) {
      lessonPts(1000, new THREE.Vector3(P.p.x, 2, P.p.z)); LS.props.remove(LS.zone.m); LS.zone.cs.forEach((c) => LS.props.remove(c)); LS.zone = null; LS.step = 1; lessonHud();
      coach('Успешно!', 'Отлично получается. Теперь пас: нажми «Пас» — мяч уйдёт партнёру, и ты будешь управлять им.');
    } else if (LS.step === 1 && LS.passT && B.state === 'owned' && B.owner === 'me' && simT - LS.passT < 6) {
      lessonPts(1000, new THREE.Vector3(P.p.x, 2, P.p.z)); LS.step = 2; lessonHud();
      coach('Точный пас!', 'Теперь удар: держи «Удар» — копится сила, отпусти — удар. Забей гол!');
    }
  }
  if (LESSON === 'dribble') {
    const z0 = LS.prevZ, z1 = P.p.z; LS.prevZ = z1;
    for (const g of LS.gates) if (!g.done && z0 > g.z && z1 <= g.z) {
      g.done = true; const ok = Math.abs(P.p.x - g.x) < 1.7 && B.owner === 'me' && (B.state === 'owned' || B.state === 'strike');
      g.mat.color.set(ok ? '#34d26a' : '#e8343e'); g.line.material.color.set(ok ? '#34d26a' : '#e8343e');
      if (ok) lessonPts(500, new THREE.Vector3(g.x, 1.5, g.z)); else sfx.ooh();
    }
  }
}
// попытка закончилась (гол или нет)
function lessonAttempt(ok) {
  if (LS.done) return; const I = LI();
  if (LESSON === 'basics') { if (LS.step === 2 && ok) { lessonPts(2000); LS.step = 3; return lessonDone(); } if (LS.step === 2) setTimeout(() => !LS.done && coach('Почти!', 'Подойди ближе к воротам и бей в угол. Чем дольше держишь «Удар», тем сильнее.'), 2700); return; }
  if (LESSON === 'dribble') { if (ok) { lessonPts(1000); const bonus = Math.max(0, Math.min(1000, Math.round((16 - (simT - LS.t0)) * 100))); if (bonus) setTimeout(() => lessonPts(bonus), 500); } }
  if (LESSON === 'targets') {
    const c = LS.cross; let hit = null;
    if (c) for (const d of LS.discs) if (!d.hit && Math.hypot(c.x - d.x, c.y - d.y) < 0.5 + R) { hit = d; break; }
    if (hit) { hit.hit = true; hit.d.material.opacity = 0.25; lessonPts(1000, new THREE.Vector3(hit.x, hit.y, 0)); } else if (ok) lessonPts(300);
  }
  LS.att++; lessonHud();
  if (LS.att >= I.max) setTimeout(lessonDone, 1700);
  else if (LESSON === 'dribble') setTimeout(() => coach('Попытка 2', 'Ещё раз! Фишки снова на месте. Постарайся быстрее.'), 2700);
}
function lessonDone() {
  if (LS.done) return; LS.done = true; const I = LI(), ok = LS.pts >= I.need;
  try { const st = JSON.parse(localStorage.getItem('shot.lessons') || '{}'); const o = st[LESSON] || {}; st[LESSON] = { best: Math.max(o.best || 0, LS.pts), ok: !!(o.ok || ok) }; localStorage.setItem('shot.lessons', JSON.stringify(st)); } catch (e) { /* без памяти */ }
  setTimeout(() => {
    $('#lrTask').textContent = I.title; $('#lrOk').textContent = ok ? '✓ УСПЕХ' : 'ЕЩЁ НЕМНОГО'; $('#lrOk').classList.toggle('fail', !ok);
    $('#lrPts').textContent = `${LS.pts}/${I.need} оч.`; $('#lrNext').textContent = ok && I.next ? 'Далее' : ok ? 'Готово' : 'Ещё раз';
    $('#lres').classList.add('on'); sfx.whistle();
  }, LESSON === 'basics' ? 2400 : 400);
}
$('#lrNext').addEventListener('click', () => { const I = LI(), ok = LS.pts >= I.need; if (!ok) return location.reload(); if (I.next) { const q = new URLSearchParams(location.search); q.set('lesson', I.next); location.replace('?' + q); } else exitToMenu(); });
$('#lrAgain').addEventListener('click', () => location.reload());

// ---------- пауза, настройки, выход в меню ----------
// Пауза останавливает игру, время матча и звук (кадр не считается и не рисуется). Выход в меню — переход на страницу меню:
// эта страница выгружается целиком (цикл, звук, обработчики), второго рендерера не бывает.
// В Telegram «Назад» — его кнопка: сначала закрывает вложенное окно, из идущего матча — спрашивает подтверждение.
const HUB_URL = '../../index.html'; // открыли по прямой ссылке — выход в хаб
let paused = false;
const isOn = (id) => $(id).classList.contains('on');
function setPause(on) {
  if (paused === on || state === 'load') return; paused = on; sfx.pause(on);
  if (on) { cancelCharge(); passIn.down = -1; btn.press = btn.sprint = false; joy.x = joy.y = 0; for (const k in keys) keys[k] = false; }
  else { ['#sets', '#confirm'].forEach((id) => $(id).classList.remove('on')); last = performance.now() / 1000; }
  $('#pause').classList.toggle('on', on && !isOn('#confirm'));
}
function exitToMenu() {
  sfx.pause(true);
  if (EMBED) { try { parent.postMessage({ jg: 'football-exit' }, location.origin); return; } catch (e) { /* ниже — переход */ } }
  location.replace(HUB_URL);
}
// хаб передаёт «Назад» Telegram сюда; звук — по настройке хаба; вибрация — через хаб (во фрейме Telegram недоступен)
if (EMBED) {
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.jg === 'back') onBack();
    else if (e.data.jg === 'safe') { // хаб во весь экран Telegram: табло и кнопки не прячутся под кнопками Telegram и вырезом
      const r = document.documentElement.style, px = (v) => Math.max(0, Math.min(200, +v || 0));
      [['--st', 'top'], ['--sl', 'left'], ['--sr', 'right'], ['--sb', 'bottom']].forEach(([k, n]) => r.setProperty(k, `max(env(safe-area-inset-${n}, 0px), ${px(e.data[n])}px)`));
    }
  });
  if (Q.get('snd') === '0') sfx.setSound(false, false); else if (Q.get('snd') === '1') sfx.setSound(true, false);
  sfx.setBuzz((kind) => { try { parent.postMessage({ jg: 'haptic', kind: kind === 'light' ? 'tap' : 'pop' }, location.origin); } catch (e) { /* без вибрации */ } });
}
function setsOpen() { setsFill(); $('#pause').classList.remove('on'); $('#sets').classList.add('on'); }
function setsClose() { $('#sets').classList.remove('on'); if (paused) $('#pause').classList.add('on'); }
function setsFill() {
  $('#sSound').textContent = sfx.soundOn() ? 'Вкл' : 'Выкл'; $('#sVibro').textContent = sfx.vibroOn() ? 'Вкл' : 'Выкл';
  $('#sGfx').textContent = QCHOICE === 'auto' ? 'Авто' : GFX.PROFILES[QCHOICE].label; $('#sCam').textContent = TV_CAMS[tvCamSel].label; $('#sCamRow').hidden = !TV(); $('#sSound').parentNode.hidden = $('#sVibro').parentNode.hidden = EMBED; // звук и вибрация — в настройках хаба
}
$('#sSound').addEventListener('click', () => { sfx.setSound(!sfx.soundOn()); setsFill(); });
$('#sVibro').addEventListener('click', () => { sfx.setVibro(!sfx.vibroOn()); setsFill(); if (sfx.vibroOn()) sfx.buzz('light'); });
$('#sGfx').addEventListener('click', () => { const list = ['auto', ...GFX.ORDER]; QCHOICE = list[(list.indexOf(QCHOICE) + 1) % list.length]; GFX.saveChoice(QCHOICE);
  autoQ = QCHOICE === 'auto' ? new GFX.AutoQuality(QL, applyQuality) : null; applyQuality(QCHOICE === 'auto' ? QL : QCHOICE); setsFill(); });
$('#sCam').addEventListener('click', () => { setTvCam(TV_CAM_ORDER[(TV_CAM_ORDER.indexOf(tvCamSel) + 1) % TV_CAM_ORDER.length]); setsFill(); });
$('#sBack').addEventListener('click', setsClose);
$('#pauseBtn').addEventListener('click', () => { setPause(true); $('#pauseBtn').blur(); });
$('#pHelp').addEventListener('click', () => { setPause(false); const h = $('#hint'); h.style.opacity = 1; clearTimeout(h._t); h._t = setTimeout(() => (h.style.opacity = 0), 9000); });
$('#pResume').addEventListener('click', () => setPause(false));
$('#pRestart').addEventListener('click', () => { setPause(false); n = 0; results = []; resetShot(); });
$('#pSets').addEventListener('click', setsOpen);
$('#pExit').addEventListener('click', () => { if (MATCH_ON && state !== 'over') { $('#pause').classList.remove('on'); $('#confirm').classList.add('on'); } else exitToMenu(); });
$('#cStay').addEventListener('click', () => { $('#confirm').classList.remove('on'); setPause(false); });
$('#cExit').addEventListener('click', exitToMenu);
$('#toMenu').addEventListener('click', exitToMenu);
const matchLive = () => MATCH_ON && run && state !== 'over';
function onBack() {
  if (isOn('#sets')) return setsClose();
  if (isOn('#confirm')) { $('#confirm').classList.remove('on'); return setPause(false); }
  if (isOn('#pause')) return setPause(false);
  if (matchLive()) { setPause(true); $('#pause').classList.remove('on'); $('#confirm').classList.add('on'); return; }
  exitToMenu();
}
const TGW = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData ? Telegram.WebApp : null;
if (!EMBED && TGW && TGW.BackButton) { try { TGW.BackButton.show(); TGW.BackButton.onClick(onBack); } catch (e) { /* старый Telegram */ } }
// Esc на компьютере — пауза
addEventListener('keydown', (e) => { if (e.code === 'Escape') { if (paused) onBack(); else if (state !== 'load') setPause(true); } });
// свернули приложение посреди матча — пауза
document.addEventListener('visibilitychange', () => { if (document.hidden && matchLive() && state === 'play') setPause(true); });

// ---------- кадр ----------
let last = performance.now() / 1000;
const fpsEl = Q.get('fps') === '1' ? Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:9;font:700 12px monospace;color:#0f0;background:#000a;padding:3px 6px;border-radius:6px' }) : null;
if (fpsEl) document.body.appendChild(fpsEl);
let fpsN = 0, fpsT = 0, fpsWorst = 0, prevNow = performance.now() / 1000;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpV = new THREE.Vector3();
// один шаг игры фиксированной длины h — мяч, игрок, вратарь, итог удара
function gameStep(h) {
  simT += h; ballPrev.copy(B.p);
  const zPrev = B.p.z;
  if (LESSON === 'targets' && zPrev > 0) LS.zp = { x: B.p.x, y: B.p.y, z: zPrev };
  if (MATCH_ON && run) matchPhys(h);
  else if (FREE() && run) runPhys(h);
  const flying = FREE() ? state === 'play' || state === 'over' || state === 'goal' : state === 'fly' || state === 'over';
  if (B.state === 'free' && flying) onEvents(BP.stepFree(B, h, worldNow()));
  if (LESSON === 'targets' && LS.zp && LS.zp.z > 0 && B.p.z <= 0 && !LS.cross) { const k = LS.zp.z / Math.max(1e-6, LS.zp.z - B.p.z); LS.cross = { x: LS.zp.x + (B.p.x - LS.zp.x) * k, y: LS.zp.y + (B.p.y - LS.zp.y) * k }; }
  if (B.state === 'held') { holdBall(); B.v.set(0, 0, 0); B.w.set(0, 0, 0); }
  spinBall(h);
  if (kick) kick.t += h;
  if (MATCH_ON && GK[1] && GK[1].kick) GK[1].kick.t += h;
  if (state !== 'fly' || FREE()) return;
  // штрафной и пенальти: стенка, мимо, штанга, время
  if (MODE === 'fk' && !kick.wallDone && zPrev > wallZ && B.p.z <= wallZ) {
    kick.wallDone = true;
    const hit = wallX.some((x) => Math.abs(B.p.x - x) < 0.36) && B.p.y < 1.95 + 0.45 * wallJump(kick.t);
    if (hit) { vel.set(vel.x * 0.3, 2.5, Math.abs(vel.z) * 0.25); spin.set(0, 0, 0); sfx.hands(false); finish(false, 'В стенку', 'miss'); return; }
  }
  if (!B.inGoal && B.p.z < -0.3) return finish(false, kick.post || 'Мимо', 'miss');
  if (kick.post && vel.z > 0 && B.p.z > 0.8) return finish(false, kick.post, 'miss'); // отскочил от штанги в поле
  if (B.p.z > 40 || Math.abs(B.p.x) > 30 || kick.t > 4 || (B.stopped && kick.t > 1)) finish(false, 'Мимо', 'miss');
}
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, raw = Math.min(BP.CFG.maxFrame, now - last); last = now;
  if (slowT > 0) { slowT -= raw; if (slowT <= 0) slow = 1; }
  const dt = raw * slow; clock += dt;
  // «Авто»: качество подстраивается по замеру кадров (с задержкой и порогами — gfx.js)
  if (autoQ && state !== 'load') autoQ.frame(now - prevNow);
  prevNow = now;
  if (fpsEl) { fpsN++; fpsT += raw; fpsWorst = Math.max(fpsWorst, raw); if (fpsT > 1) { const i = ren.info.render; fpsEl.textContent = `${Math.round(fpsN / fpsT)} к/с · ${(1000 * fpsT / fpsN).toFixed(1)} мс · худший ${Math.round(fpsWorst * 1000)} мс · ${i.calls} вызовов · ${(i.triangles / 1000).toFixed(0)} тыс. треуг. · ${QL}`; fpsN = 0; fpsT = 0; fpsWorst = 0; } }
  if (paused || LS.coachOn) return; // пауза (и подсказка тренера): ничего не считаем и не рисуем
  if (STADIUM) STADIUM.tick(now, raw);
  drawSwipe(raw);
  if (state === 'load') return;

  // физика — фиксированными шагами (не зависит от частоты кадров; при просадке время не копится больше maxFrame)
  const pT0 = PROF ? performance.now() : 0;
  const steps = fixed.add(dt);
  for (let i = 0; i < steps; i++) gameStep(BP.CFG.dt);
  // позы — каждый кадр
  if (LESSON && state !== 'load') lessonTick(dt);
  if (MATCH_ON && run) matchAnim(dt);
  else if (FREE() && run) runAnim(dt);
  else if (state === 'aim') tickPlayer(shooter, dt);
  else if (state === 'runup') { tickPlayer(shooter, dt); keeperRead(dt); if (shooter.t >= KICK.tc) launch(); }
  else afterKick(dt);
  tickPlayer(keeper, dt); updSpheres(keeper, dt); if (FREE()) updSpheres(shooter, dt); if (run && run.mate) updSpheres(run.mate.pl, dt);
  if (kick && !kick.dived && kick.t >= kick.react) keeperDive();
  if (MODE === 'fk') wall.forEach((w, i) => w.holder.visible && wallTick(w, i, dt)); // в «2 на 1» первый из стенки — партнёр
  // мяч на экране — между двумя последними шагами физики (плавно при любой частоте кадров)
  if (B.state === 'held') { holdBall(); ballPrev.copy(B.p); }
  ball.position.lerpVectors(ballPrev, B.p, fixed.alpha);
  if (TV()) ball.position.y += R * (BALL_TV - 1); // крупнее только на экране (камера далеко): касается газона, а не тонет в нём
  netTick(dt); confTick(dt); burstTick(dt); blobTick();

  // камера: перед ударом — за мячом; в полёте — следует за мячом; в 1 на 1 — за спиной игрока, после удара смотрит на мяч
  lastRaw = raw; markerTick();
  if (TV()) { tvCam(camAim, false); camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); } // сглаживание — внутри tvCam (одно на позицию и взгляд)
  else if (FREE()) {
    runCam(camAim);
    if (run && run.shotT > 0 && B.state !== 'owned') camAim.l.lerp(tmpB.set(ball.position.x, Math.max(0.6, ball.position.y), ball.position.z), Math.min(1, (simT - run.shotT) / 0.6) * 0.45);
    camNow.p.lerp(camAim.p, 1 - Math.exp(-raw * 7)); camNow.l.lerp(camAim.l, 1 - Math.exp(-raw * 9)); // быстро — без ощущения задержки
  } else if (kick && (state === 'fly' || state === 'over')) {
    const bp = ball.position, follow = Math.min(1, Math.max(0, (spot.z - Math.max(bp.z, 2)) / spot.z));
    tmpA.set(bp.x * 0.5, 2.1, Math.max(bp.z + 8, 9));
    tmpA.lerpVectors(camAim.p, tmpA, follow * 0.35);
    camNow.p.lerp(tmpA, 1 - Math.exp(-raw * 3));
    tmpB.set(bp.x * 0.6, lerp(1.05, Math.max(0.9, bp.y), 0.5), Math.min(bp.z - 3, 0));
    camNow.l.lerp(tmpB, 1 - Math.exp(-raw * 4));
  } else { camNow.p.lerp(camAim.p, 1 - Math.exp(-raw * 4)); camNow.l.lerp(camAim.l, 1 - Math.exp(-raw * 4)); }
  cam.position.copy(camNow.p);
  if (shake > 0) { shake = Math.max(0, shake - raw); cam.position.x += Math.sin(clock * 47) * shake * 0.2; cam.position.y += Math.sin(clock * 61 + 1) * shake * 0.2; } // плавная дрожь, без случайных скачков каждый кадр
  cam.lookAt(camNow.l);
  if (camPunch > 0 || cam.fov !== fov()) { camPunch = Math.max(0, camPunch - raw * 2.5); cam.fov = fov() - 4 * camPunch * camPunch; cam.updateProjectionMatrix(); } // камера чуть вздрагивает от удара
  // тень солнца — на активную зону: в «1 на 1» от игрока к воротам, в штрафном и пенальти — от мяча до ворот
  if (TV() && run) { const a = run.P.p, b = run.mate ? run.mate.P.p : a, x0 = Math.min(a.x, b.x, ball.position.x, 0), x1 = Math.max(a.x, b.x, ball.position.x, 0), z0 = Math.min(a.z, b.z, ball.position.z, 0), z1 = Math.max(a.z, b.z, ball.position.z, 0);
    fitShadow((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 4); }
  else if (FREE() && run) { const P = run.P.p; fitShadow(P.x * 0.7, P.z * 0.65, Math.max(9, Math.hypot(P.x, P.z) * 0.35 + 4)); }
  else fitShadow(spot.x * 0.5, spot.z * 0.5 - 0.5, spot.length() * 0.5 + 3);
  // для сравнения кадров (скриншоты до/после): window.__cam = { p: [x, y, z], l: [x, y, z], fov } — камера стоит ровно там
  if (window.__cam) { cam.position.fromArray(window.__cam.p); cam.lookAt(tmpA.fromArray(window.__cam.l)); if (window.__cam.fov) { cam.fov = window.__cam.fov; cam.updateProjectionMatrix(); } }
  const pT1 = PROF ? performance.now() : 0;
  offMarker();
  if (!NO_RENDER) ren.render(scene, cam);
  if (PROF) { PROF.logic += pT1 - pT0; PROF.render += performance.now() - pT1; PROF.n++; }
  // ?trace=1 — покадровая запись для проверки движения (мяч на экране и в физике, игрок, камера, поза); в обычной игре выключено
  if (TRACE && run) {
    let gk = 9; for (const q of keeper.sph || []) gk = Math.min(gk, Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z) - q.r - R);
    // от поверхности мяча до ближайшего носка (реальная стопа в мире)
    const toe = Math.min(shooter.toeL.getWorldPosition(tmpB).distanceTo(B.p), shooter.toeR.getWorldPosition(tmpB).distanceTo(B.p)) - R;
    const mt = run.mate; TRACE.push({ ow: B.owner, mp: mt ? [mt.P.p.x, mt.P.p.z] : null, mst: mt ? mt.st : null, man: mt ? mt.pl.name : null, toe, push: B.push, gst: GKS.st, gan: keeper.name, gp: [keeper.holder.position.x, keeper.holder.position.z], ev: lastEvent, t: +clock.toFixed(4), st: state, bs: B.state, b: ball.position.toArray(), bp: B.p.toArray(), p: [run.P.p.x, run.P.p.z], v: Math.hypot(run.P.v.x, run.P.v.z), yaw: run.P.yaw,
      cam: cam.position.toArray(), an: shooter.name, at: !!B.strikeAt, gk, q: QL,
      lo: shooter.loco ? [shooter.loco.idle, shooter.loco.jog].map((a) => [+a.getEffectiveWeight().toFixed(2), +a.time.toFixed(2), a.enabled, a.isRunning()]) : null, aw: shooter.act ? +shooter.act.getEffectiveWeight().toFixed(2) : 0, ctl: shooter === shooter0 ? 'A' : 'B', ch: !!run.chase, chd: run.chDbg, pick: mt ? mt.pick : null, mv: mt ? Math.hypot(mt.P.v.x, mt.P.v.z) : 0, man2: mt ? mt.pl.name : null });
  }
}
const TRACE = Q.get('trace') === '1' ? (window.__trace = []) : null;
// ?prof=1 — замер на кадр: игровая логика и анимации (logic) и подготовка отрисовки на процессоре (render)
const PROF = Q.get('prof') === '1' ? (window.__prof = { logic: 0, render: 0, n: 0 }) : null;
if (TRACE) window.__variants = () => { let n = 0; for (const c of variants.values()) for (const t of c.tracks) n += t.values.length + t.times.length; return { clips: variants.size, mb: +(n * 4 / 1e6).toFixed(2) }; };
if (TRACE) window.__joy = (x, y) => { joy.x = x; joy.y = y; };
if (TRACE) window.__joyTo = (fx, fz) => { if (!TV()) { joy.x = fx; joy.y = -fz; return; } cam.getWorldDirection(camF); camF.y = 0; camF.normalize(); const rx = -camF.z, rz = camF.x; joy.x = fx * rx + fz * rz; joy.y = fx * camF.x + fz * camF.z; }; // джойстик «в сторону поля (fx, fz)» // для проверки: джойстик из теста (медленный ход)
// для проверки: расставить управляемого игрока и бота (мяч — у ноги управляемого)
if (TRACE) window.__place = (ax, az, bx, bz) => { const P = run.P, M = run.mate && run.mate.P; P.p.x = ax; P.p.z = az; P.v.x = P.v.z = 0; if (M) { M.p.x = bx; M.p.z = bz; M.v.x = M.v.z = 0; }
  placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; ballPrev.copy(B.p); };
// для проверки матча: состояние, счёт, время, владелец, где кто
if (TRACE) window.__match = () => ({ st: MT.st, state, score: MT.score.slice(), clock: +MT.clock.toFixed(2), owner: B.owner, bs: B.state, ball: [+B.p.x.toFixed(2), +B.p.y.toFixed(2), +B.p.z.toFixed(2)], restart: MT.restart && MT.restart.kind, hold: MT.gkHold && MT.gkHold.phase, hT: MT.gkHold ? +MT.gkHold.t.toFixed(1) : 0, stats: MT.stats, mst: MT.st, feet: !!(MT.gkHold && MT.gkHold.feet), back: !!MT.back, off: MT.off ? MT.off.list.map((q) => q.pl.nick || '?') : null, next: MT.next, rk: MT.restart && MT.restart.kind, banner: $('#msg').textContent,
  pl: actors().map((a) => [a.id, +a.P.p.x.toFixed(1), +a.P.p.z.toFixed(1), a.ai && a.ai.role || '', +Math.hypot(a.P.v.x, a.P.v.z).toFixed(1), a.pl.name, a.ai && a.ai.tx !== undefined ? +a.ai.tx.toFixed(1) : null, a.ai && a.ai.tz !== undefined ? +a.ai.tz.toFixed(1) : null, a.ai && a.ai.chasing ? 'CH' : (a.ai && a.ai.run ? 'RUN' : '')]), gk: GK.map((g) => [+g.pl.holder.position.x.toFixed(1), +g.pl.holder.position.z.toFixed(1), g.S.st, g.pl.name]), last: MT.last });
// для проверки отбора: я в (mx, mz), соперник o1 с мячом в (ox, oz) смотрит в сторону (fx, fz); остальные далеко
if (TRACE) window.__duel = (mx, mz, ox, oz, fx, fz) => { const A = actors(); MT.restart = null; MT.gkHold = null; state = 'play'; MT.st = 'play';
  A[1].P.p.x = -15; A[1].P.p.z = 50; A[3].P.p.x = 15; A[3].P.p.z = 10;
  const me = A[0].P, o = A[2].P; me.p.x = mx; me.p.z = mz; me.v.x = me.v.z = 0; me.yaw = Math.atan2(ox - mx, oz - mz); run.meAI.tk = null; run.meAI.tkCd = 0; run.meAI.slowT = 0;
  o.p.x = ox; o.p.z = oz; o.yaw = Math.atan2(fx, fz); o.v.x = fx * 4; o.v.z = fz * 4; A[2].ai.thinkT = 9; A[2].ai.tx = ox + fx * 30; A[2].ai.tz = oz + fz * 30; A[2].ai.strike = A[2].ai.pass = null;
  placeBall(BP.controlPoint(o, null)); BP.capture(B, o, 'o1'); B.trapDur = 0; ballPrev.copy(B.p); };
if (TRACE) window.__tackle = () => tryTackle(actorOf('me'));
if (TRACE) window.__lesson = () => ({ pts: LS.pts, att: LS.att, step: LS.step, done: LS.done, coach: LS.coachOn, gates: LS.gates.map((g) => g.done), discs: LS.discs.map((d) => d.hit), cross: LS.cross, me: run ? [+run.P.p.x.toFixed(1), +run.P.p.z.toFixed(1)] : null, own: B.owner, st: state });
if (TRACE) window.__clipMove = (name) => { const pl = shooter, h = pl.holder, keep = [h.position.clone(), h.rotation.clone()]; h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.updateMatrixWorld(true);
  const a = pl.mixer.clipAction(clipOf(name)); pl.mixer.stopAllAction(); a.reset().play(); pl.mixer.setTime(0); pl.model.updateMatrixWorld(true); const p0 = pl.hips.getWorldPosition(new THREE.Vector3());
  pl.mixer.setTime(Math.min(0.5, clipOf(name).duration * 0.6)); pl.model.updateMatrixWorld(true); const p1 = pl.hips.getWorldPosition(new THREE.Vector3()); a.stop(); pl.act = null; pl.name = ''; h.position.copy(keep[0]); h.rotation.copy(keep[1]);
  return [+(p1.x - p0.x).toFixed(2), +(p1.z - p0.z).toFixed(2)]; }; // смещение записи при взгляде вдоль +z (право — это −x)
if (TRACE) window.__pose = (name, t) => { const pl = shooter; pl.mixer.stopAllAction(); const a = pl.mixer.clipAction(clipOf(name)); a.reset().play(); pl.mixer.setTime(t); pl.act = a; pl.name = 'pose'; pl.follow = false; pl.lock = null; window.__freeze = true; };
if (TRACE) window.__clips = () => base.animations.map((c) => { const t = c.tracks.find((x) => x.name === 'Hips.position'), v = t ? t.values : [0, 0, 0], n = v.length; return [c.name, +c.duration.toFixed(2), t ? [+(v[n - 3] - v[0]).toFixed(0), +(v[n - 2] - v[1]).toFixed(0), +(v[n - 1] - v[2]).toFixed(0)] : null]; });
if (TRACE) window.__pos = (id, x, z) => { const q = actorOf(id); if (!q) return; q.P.p.x = x; q.P.p.z = z; q.P.v.x = q.P.v.z = 0; if (q.ai) { q.ai.tx = x; q.ai.tz = z; q.ai.thinkT = 9; q.ai.run = null; } };
if (TRACE) window.__ids = () => actors().map((q) => q.id);
if (TRACE) window.__kick = () => gkCtx(0, () => ({ lt: +lastGkTouch.toFixed(2), sim: +simT.toFixed(2), k: kick && { t: +kick.t.toFixed(2), T: +kick.T.toFixed(2), react: +kick.react.toFixed(2), wait: !!kick.wait, dived: !!kick.dived, ex: +(kick.ex || 0).toFixed(2), lx: +kick.lx.toFixed(2) }, name: keeper.name, kt: +(keeper.t || 0).toFixed(2), x: +keeper.holder.position.x.toFixed(2), st: GKS.st, hands: keeper.sph.filter((q) => q.name.endsWith('Hand')).map((q) => [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]) }));
// для проверки ударов: я с мячом в (x, z) лицом к воротам соперника, остальные далеко; удар силой pw в сторону (ax, ay) джойстика
if (TRACE) window.__shoot = (x, z, ax, ay, pw, kind = 'drive') => { const A = actors(); MT.restart = null; MT.gkHold = null; state = 'play'; MT.st = 'play';
  A.forEach((q, i) => { if (q.id !== 'me') { q.P.p.x = -30 + (i % 10) * 6; q.P.p.z = 60 + (i % 3) * 5; q.P.v.x = q.P.v.z = 0; if (q.ai) { q.ai.thinkT = 9; q.ai.tx = q.P.p.x; q.ai.tz = q.P.p.z; } } });
  const me = A[0].P; me.p.x = x; me.p.z = z; me.v.x = me.v.z = 0; me.yaw = Math.atan2(-x, -z); run.meAI.tk = null;
  gkCtx(0, () => { keeperReset(); kick = null; keeper.holder.position.set(0, 0, 0.4); keeper.holder.rotation.set(0, 0, 0); play(keeper, 'gk_idle', { loop: true, fade: 0.1, follow: true }); });
  placeBall(BP.controlPoint(me, null)); BP.capture(B, me, 'me'); B.trapDur = 0; ballPrev.copy(B.p); if (pw < 0) return;
  run.strike = { pw, kind, side: 0, aim: { x: ax, y: ay } }; B.state = 'strike'; B.strikeAt = STRIKE.at; play(shooter, 'strike', { t: Math.max(0, STRIKE.tc - 0.3), fade: 0.1, speed: 1.25, follow: true }); };
if (TRACE) window.__gkGot = (j) => { MT.restart = null; gkGot(j); };
// для проверки: свободный мяч в заданной точке и с заданной скоростью (лежащий / медленно катящийся)
if (TRACE) window.__ball = (x, z, vx = 0, vz = 0) => { if (B.state === 'owned' || B.state === 'strike') BP.release(B, B.owner, simT, 0.5, false); B.state = 'free'; B.owner = null; B.p.set(x, R, z); B.v.set(vx, 0, vz); B.w.set(0, 0, 0); ballPrev.copy(B.p); if (run) run.shotT = simT; };

// ---------- старт ----------
(async () => {
  const bar = $('#loadbar');
  const all = [player(myKit), player(gkKit), ...Array.from({ length: MATCH_ON ? 2 * NSIDE - 2 : 4 }, () => player(wallKit()))]; // матч: партнёры, соперники и наш вратарь
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; shooter0 = shooter; wall.push(...got.slice(2)); blob(ball, 0.45); makeSpheres(keeper, 'gk'); makeSpheres(shooter, 'me'); makeSpheres(wall[0], 'mate');
  GK.push({ pl: keeper, S: GKS, kick: null });
  if (MATCH_ON) { // матч: два соперника и наш вратарь — из тех же моделей «стенки»; поле меньше — вратарь выходит ближе
    for (let i = 1; i < wall.length - 1; i++) makeSpheres(wall[i], 'x' + i); // метки (кто есть кто) раздаёт resetMatch
    makeSpheres(wall[wall.length - 1], 'gk2');
    GK.push({ pl: wall[wall.length - 1], S: { st: 'pos', t: 0, v: new THREE.Vector3(), want: '', wantT: 0 }, kick: null });
    Object.assign(BP.CFG.keeper, { reaction: 0.18, reactionJitter: 0.08, diveReach: 2.8, diveTime: 0.52 }); GK[0].kc = { reaction: 0.18, diveReach: 2.8 };
    GK[1].kc = gkFromCard(LINEUP[NSIDE - 1]);
    BP.CFG.player.bounds = { x: MATCH.HW + 1, zMin: 0.25, zMax: MATCH.L - 0.25 };
    $('.modes').style.display = 'none';
  }
  // мяч: модель LeMon74 (Sketchfab, CC BY 4.0), облегчена gltfpack до 3,5 тыс. треугольников
  try { const bm = (await loader.loadAsync('assets/ball.glb')).scene, bb = new THREE.Box3().setFromObject(bm), sz = bb.getSize(new THREE.Vector3()).x;
    bm.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; // настоящий мяч LeMon74: белые и чёрные панели — без хрома, мягкий блик
      const L = o.material.color.r > 0.3 ? LOOK.ball.white : LOOK.ball.black; o.material.color.set(L.color); o.material.roughness = L.rough; o.material.metalness = 0; o.material.envMapIntensity = LOOK.ball.env; }); bm.scale.setScalar((R * 2) / sz); bm.position.copy(bb.getCenter(new THREE.Vector3()).multiplyScalar(-(R * 2) / sz)); ball.add(bm); ball.material.visible = false; } catch (e) { /* остаётся простой мяч */ }
  const before = new Set(scene.children);
  await goalModel().catch(() => goalSimple());
  if (MATCH_ON) { // вторые ворота — копия первых, развёрнутая к полю на линии z = L
    const g2 = new THREE.Group(); g2.position.set(0, 0, MATCH.L); g2.rotation.y = Math.PI;
    for (const o of scene.children.filter((o) => !before.has(o))) g2.add(o.clone());
    scene.add(g2);
  }
  prepKick(); prepStrike(); prepKeeper();

  resetShot();
  // шейдеры собираем заранее для всего, что пока скрыто (брызги травы при ударе, конфетти, стенка, партнёр), —
  // иначе видеокарта собирает их в момент первого удара и кадр подвисает
  const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  ren.compile(scene, cam); ren.render(scene, cam); hidden.forEach((o) => (o.visible = false)); // один кадр под заставкой загрузки: драйвер доделывает шейдеры при первой отрисовке
  $('#load').remove();
  if (LESSON) lessonStart();
  if (QCHOICE === 'auto') autoQ = new GFX.AutoQuality(QL, applyQuality);
  gfxLabel();
  // разбор записей движений (только для проверки): куда смещается таз, где и когда руки/носки. Вызов: __audit(['goalkeeper_catch'], 'keeper')
  window.__audit = (names, who = 'keeper') => {
    const pl = who === 'keeper' ? keeper : shooter, h = pl.holder, keep = [h.position.clone(), h.rotation.clone()];
    h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.updateMatrixWorld(true);
    const bn = (n) => pl.model.getObjectByName(n), parts = { hips: pl.hips, lh: bn('LeftHand'), rh: bn('RightHand'), toeL: bn('LeftToeBase'), toeR: bn('RightToeBase'), head: bn('Head') };
    const out = {};
    for (const name of names) {
      const clip = base.animations.find((c) => c.name === name); if (!clip) { out[name] = null; continue; }
      pl.mixer.stopAllAction(); const a = pl.mixer.clipAction(clip); a.reset().play(); const S = [];
      for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) { pl.mixer.setTime(t); pl.model.updateMatrixWorld(true);
        const f = { t }; for (const [k, o] of Object.entries(parts)) if (o) { const v = h.worldToLocal(o.getWorldPosition(new THREE.Vector3())); f[k] = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; } S.push(f); }
      a.stop(); out[name] = { dur: +clip.duration.toFixed(2), S };
    }
    h.position.copy(keep[0]); h.rotation.copy(keep[1]); pl.act = null; return out;
  };
  window.ready = true;
  window.gfx = () => ({ q: QL, choice: QCHOICE, pr: ren.getPixelRatio(), shadows: ren.shadowMap.enabled, mem: { ...ren.info.memory }, programs: ren.info.programs.length, crowd: crowd.count, last: autoQ && autoQ.last });
  const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  window.dbg = () => ({ state, ball: B.state, owner: B.owner, sh: shooter.name, st: +shooter.t.toFixed(2), b: r2(B.p), v: r2(B.v), p: run ? r2(run.P.p) : null,
    d: run ? +Math.hypot(B.p.x - run.P.p.x, B.p.z - run.P.p.z).toFixed(2) : null, msg: lastEvent, calls: ren.info.render.calls, tris: ren.info.render.triangles, progs: ren.info.programs ? ren.info.programs.length : 0 });
})().catch((e) => { $('#load').textContent = 'Не получилось загрузить: ' + e.message; });
frame();
