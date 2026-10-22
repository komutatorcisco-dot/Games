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
const LINEUP = Array.from({ length: NSIDE }, (_, i) => i).map((i) => { const v = Q.get('p' + i); if (!v) return null; const a = v.split('|'); return { name: a[0].slice(0, 16), r: +a[1] || 65, st: a.slice(2, 8).map((x) => +x || 65), pos: a[8] || '', fx: a[9] !== undefined && a[9] !== '' ? +a[9] : null, fy: a[10] !== undefined && a[10] !== '' ? +a[10] : null, h: +a[11] || 0, num: +a[12] || 0 }; });
// место в схеме из «Моего состава» (x %, y % на схеме хаба: y = 93 — свои ворота, 16 — чужие) → [x м, глубина]
const hxyOf = (c) => (c && c.fx !== null && c.fy !== null && NSIDE > 3 ? [((c.fx - 50) / 50) * MATCH.HW * 0.8, (100 - c.fy) / 100] : null);
const k01 = (v) => Math.max(0, Math.min(1, ((v || 65) - 60) / 35)); // характеристика 60…95 → 0…1
// Характеристики карточки в игре (полевой: скорость, удар, пас, дриблинг, защита, физика). Разница заметная, но без
// крайностей: у 95 и у 65 — один футбол, просто первый быстрее, точнее и надёжнее.
function cardStats(pl, st, k = 1) {
  const s = (i) => k01(st ? st[i] : 65);
  pl.spd = (0.92 + 0.16 * s(0)) * k;      // скорость бега и рывка: 0,92…1,08
  pl.accK = 0.88 + 0.24 * s(0);           // разгон
  pl.shotK = 0.92 + 0.14 * s(1);          // сила удара
  pl.shotErr = 0.04 * (1 - s(1));         // разброс удара, рад (до ~2,3°)
  pl.passErr = 0.03 * (1 - s(2));         // разброс паса по направлению, рад (до ~1,7°), и по силе
  pl.dribK = 1.12 - 0.24 * s(3);          // насколько далеко отпускает мяч при ведении (меньше — мяч ближе к ноге)
  pl.defK = 0.8 + 0.35 * s(4);            // отбор
  pl.physK = 1.12 - 0.25 * s(5);          // насколько легко отнять мяч (меньше — крепче держит)
}
// Рост (см) — из карточки (база Transfermarkt), иначе по позиции. Обе модели — около 180 см: масштаб = рост / 180.
const heightOf = (c, pos) => (c && c.h) || (pos === 'GK' ? 189 : pos === 'CB' ? 186 : 180);
// телосложение: «физика» карточки делает плечи и корпус чуть шире (0,96…1,06 по ширине и глубине)
function setHeight(pl, cm, phys = 65) { if (!pl || !pl.model) return; pl.hcm = Math.max(160, Math.min(205, cm || 180)); const s = (pl.own ? HERO.scale : 1) * (pl.hcm / 180), w = 0.96 + 0.1 * k01(phys); pl.model.scale.set(s * w, s, s * w); }
const numFor = (c, def) => (c && c.num) || def;
// Фамилия и номер на спине: «нашивка» (плоскость с картинкой) на кости спины — двигается вместе с телом.
// Где спина — находим один раз на модель лучом сзади (своя и общая модели разные), дальше — та же точка у всех.
const PRINT = { own: null, base: null };
function backPrint(pl, name, num, kit) {
  if (!pl || !pl.model || !MATCH_ON) return;
  const sp = pl.model.getObjectByName('Spine2'); if (!sp) return;
  if (pl.print) { pl.print.parent && pl.print.parent.remove(pl.print); pl.print.material.map.dispose(); pl.print.material.dispose(); pl.print = null; }
  if (!num && !name) return;
  // картинка: фамилия сверху, номер крупно; цвет — контрастный к футболке
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const shirt = new THREE.Color(kit && kit.shirt || '#f4f4f2'), lum = shirt.r * 0.3 + shirt.g * 0.59 + shirt.b * 0.11, ink = lum > 0.45 ? '#1c2443' : '#f4f4f2';
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const nm = (name || '').split(' ').pop().toUpperCase().slice(0, 12);
  if (nm) { let fs = 50; g.font = `800 ${fs}px Rubik, Arial, sans-serif`; while (g.measureText(nm).width > 236 && fs > 18) { fs -= 2; g.font = `800 ${fs}px Rubik, Arial, sans-serif`; } g.fillText(nm, 128, 52); }
  if (num) { g.font = '900 165px Rubik, Arial, sans-serif'; g.fillText(String(num), 128, 228); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat); mesh.name = 'backPrint'; mesh.renderOrder = 2;
  const key = pl.own ? 'own' : 'base';
  if (!PRINT[key]) { // луч сзади на уровне лопаток — где поверхность спины
    pl.mixer.update(0.001); const h = pl.holder; h.updateMatrixWorld(true);
    const yaw = h.rotation.y, fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), sw = sp.getWorldPosition(new THREE.Vector3());
    const body = []; pl.model.traverse((o) => { if (o.isSkinnedMesh && /body|Shirt/i.test(o.name)) body.push(o); });
    const rc = new THREE.Raycaster(sw.clone().addScaledVector(fwd, -1.5).add(new THREE.Vector3(0, -0.04, 0)), fwd, 0, 3);
    const hit = rc.intersectObjects(body, false)[0]; if (!hit) return;
    const o3 = new THREE.Object3D(); o3.position.copy(hit.point).addScaledVector(fwd, -0.012); o3.rotation.y = yaw + Math.PI; scene.add(o3); sp.attach(o3);
    PRINT[key] = { p: o3.position.clone(), q: o3.quaternion.clone(), s: o3.scale.clone().multiplyScalar(pl.model.scale.y / (pl.own ? HERO.scale : 1)) }; sp.remove(o3); // масштаб в осях кости — без роста этого игрока
  }
  const P0 = PRINT[key]; // в осях кости спины: у высокого спина шире — нашивка вместе с ней больше
  mesh.position.copy(P0.p); mesh.quaternion.copy(P0.q); mesh.scale.copy(P0.s);
  sp.add(mesh); pl.print = mesh;
}
// разброс: поворот скорости мяча вокруг вертикали (нормальное распределение, sd — рад) и множитель силы
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// удар «из неудобного положения» (как в FC Mobile): корпус развёрнут от направления удара больше чем на ~50° —
// мяч слабее (до −22%) и неточнее (до +4° разброса). Возвращает долю 0…1
function offBalance(P, sv) {
  const l = Math.hypot(sv.v.x, sv.v.z) || 1, c = (Math.sin(P.yaw) * sv.v.x + Math.cos(P.yaw) * sv.v.z) / l;
  const f = THREE.MathUtils.smoothstep(Math.acos(Math.max(-1, Math.min(1, c))), 0.9, 2.3); if (f <= 0) return 0;
  const k = 1 - 0.22 * f; sv.v.x *= k; sv.v.y *= k; sv.v.z *= k; if (sv.speed) sv.speed *= k; return f;
}
function spreadShot(sv, sd, pw = 0) { if (!sd) return sv; const a = gauss() * sd, c = Math.cos(a), sn = Math.sin(a), x = sv.v.x, z = sv.v.z; sv.v.x = x * c + z * sn; sv.v.z = -x * sn + z * c; if (pw) { const m = 1 + gauss() * pw; sv.v.x *= m; sv.v.z *= m; } return sv; }
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
  pitchU.stripeA.value.set(T.stripeA); pitchU.stripeB.value.set(T.stripeB); pitchU.gp.value.set(T.stripeWidth, T.macro, T.detail, T.paintDetail); pitchU.gp2.value.z = T.far || 0; pitchU.gp3.value.set(T.soft || 0, T.grain || 0, T.warm || 0, T.grainK || 1);
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
  const tr = !!(L && L.envKind === 'training') && !MATCH_ON; if (training) training.visible = tr; if (STADIUM) STADIUM.group.visible = !tr; // матч — стадион с трибунами (как в FC Mobile), тренировка — база
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
    gp3: { value: new THREE.Vector4(P.soft || 0, P.grain || 0, P.warm || 0, P.grainK || 1) },
    lineBox: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) } });
  pm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, pitchU);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vW;\nuniform sampler2D grassC, noiseT, lineT;\nuniform vec3 stripeA, stripeB, paintC;\nuniform vec4 gp, gp2, gp3, lineBox;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `
  vec2 wp = vW.xz;
  // полосы стрижки поперёк поля, со сглаженным краем (без «лесенки» вдали)
  float sx = (wp.y + 8.0) / gp.x, aa = fwidth(sx) * 1.5 + gp3.x; // gp3.x — мягкость края полосы (доля ширины)
  float stripe = smoothstep(0.5 - aa, 0.5 + aa, abs(fract(sx * 0.5) * 2.0 - 1.0));
  vec3 base = mix(stripeA, stripeB, stripe);
  // крупные мягкие пятна (20–60 м) — убирают повторяемость, а не добавляют шум
  float m1 = texture2D(noiseT, wp * 0.019).r, m2 = texture2D(noiseT, wp * 0.0071 + 0.37).r;
  base *= 1.0 + gp.y * ((m1 - 0.5) * 1.3 + (m2 - 0.5) * 0.9);
  // мелкая трава: две выборки в разном масштабе и повороте — повтор плитки не читается
  vec3 d1 = texture2D(grassC, wp / 2.2).rgb, d2 = texture2D(grassC, mat2(0.8, -0.6, 0.6, 0.8) * wp / 3.7).rgb;
  float lum = dot(mix(d1, d2, 0.45), vec3(0.2126, 0.7152, 0.0722)) / gp2.x;
  // зерно издалека: та же трава в крупном масштабе (пучки по 5–10 см). Вблизи — мелкая трава, с камеры трансляции
  // (пиксель — несколько сантиметров) мелкая усредняется в ровный цвет, и вместо неё видно зерно — как в FC Mobile
  vec3 g1 = texture2D(grassC, wp / 6.5 + 0.31).rgb, g2 = texture2D(grassC, mat2(0.6, -0.8, 0.8, 0.6) * wp / 15.0).rgb;
  float glum = dot(mix(g1, g2, 0.4), vec3(0.2126, 0.7152, 0.0722)) / gp2.x;
  float coarse = smoothstep(0.006, 0.03, length(fwidth(wp))) * gp3.y;
  lum = mix(lum, 1.0 + (glum - 1.0) * gp3.w, coarse); // gp3.w — контраст зерна
  // разметка — краска: чуть приглушённый белый, сквозь неё немного видна трава
  vec2 luv = (wp - lineBox.xy) / lineBox.zw;
  float inside = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
  float pnt = texture2D(lineT, vec2(luv.x, 1.0 - luv.y)).r * inside * gp2.y;
  vec3 c = mix(base, paintC, pnt);
  c *= mix(1.0, clamp(lum, 0.45, 1.6), gp.z * mix(1.0, gp.w, pnt));
  c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.86), clamp((lum - 1.0) * 2.0, 0.0, 1.0) * gp3.z * (1.0 - pnt)); // светлые травинки чуть желтее
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
// Своя модель команды игрока (assets/hero.glb): сделана в Tripo, кости — авто-скелет Mixamo, облегчена до 24 тыс. треугольников.
// Скелет тот же (65 костей Mixamo), поэтому подходят все записи движений; у него свои единицы: таз во время движения
// на 51 условной единице против 92,8 у общей модели — смещение таза в записях умножаем на HERO.hs, модель — в HERO.scale.
const HERO = { hs: 0.553, scale: 1.95, hv: 1.09 }; // hv — по высоте таз своей модели выше в hv раз (стопы на газоне, а не на 9 см ниже)
let hero = null, heroDrib = null; // heroDrib — ведение мяча (Mixamo «Dribble», записано на этом скелете): 2,62 м за цикл в его единицах
// heroMoves — движения, записанные на этом же скелете (assets/hero_moves.glb, имена с «h_»): рывок, быстрый бег, торможение,
// разворот на 180°, три подката и три поворота. Только для своей модели: на общей модели они искажаются.
let heroMoves = null;
const heroReady = Q.get('hero') === '0' ? Promise.resolve(null) : Promise.all([loader.loadAsync('assets/hero.glb'), loader.loadAsync('assets/hero_dribble.glb').catch(() => null), loader.loadAsync('assets/hero_moves.glb').catch(() => null)])
  .then(([g, d, mv]) => { hero = g; heroDrib = d && d.animations[0] || null; if (mv) heroMoves = prepMoves(g, mv.animations); return g; }).catch(() => null);
// Запись с перемещением: заранее считаем, куда и как быстро движется таз (м/с в осях игрока: x — влево, z — вперёд)
// и насколько поворачивается корпус. Поворот (YAW_OUT) вынимаем из записи: его делает сам игрок (поворот всей модели),
// иначе после разворота запись и бег смотрели бы в разные стороны. У торможения поворот просто убираем — останавливается прямо.
const YAW_OUT = { h_turn_180: 'apply', h_run_to_stop: 'drop', h_back_turn: 'apply', h_turn_run: 'apply', h_run_turn: 'apply' };
function prepMoves(g, clips) {
  const keep = g.scene.scale.x; g.scene.scale.setScalar(HERO.scale); g.scene.updateMatrixWorld(true);
  const hips = g.scene.getObjectByName('Hips'), pm = hips.parent.matrixWorld, pq = hips.parent.getWorldQuaternion(new THREE.Quaternion()), pqi = pq.clone().invert();
  const lft = g.scene.getObjectByName('LeftUpLeg').position.clone().sub(g.scene.getObjectByName('RightUpLeg').position); // «влево» в осях таза
  const m3 = new THREE.Matrix3().setFromMatrix4(pm), q = new THREE.Quaternion(), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), fix = new THREE.Quaternion();
  const out = {};
  for (const c0 of clips) {
    const c = c0.clone(); c.name = 'h_' + c0.name; out[c.name] = c;
    const pos = c.tracks.find((t) => t.name === 'Hips.position'), rot = c.tracks.find((t) => t.name === 'Hips.quaternion');
    const info = c.userData = { t: [], x: [], z: [], yt: [], yaw: [] };
    if (pos) { const v0 = new THREE.Vector3(pos.values[0], pos.values[1], pos.values[2]).applyMatrix3(m3);
      for (let i = 0; i < pos.times.length; i++) { v.fromArray(pos.values, i * 3).applyMatrix3(m3); info.t.push(pos.times[i]); info.x.push(v.x - v0.x); info.z.push(v.z - v0.z); } }
    if (rot && YAW_OUT[c.name]) {
      const val = rot.values; let a0 = 0, prev = 0, acc = 0;
      for (let i = 0; i < rot.times.length; i++) {
        q.fromArray(val, i * 4); v.copy(lft).applyQuaternion(q).applyQuaternion(pq); // «влево» в осях модели
        const a = Math.atan2(-v.z, v.x); if (i === 0) { a0 = a; prev = a; } let d = a - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); acc += d; prev = a;
        fix.setFromAxisAngle(Y, -acc); q.premultiply(pq).premultiply(fix).premultiply(pqi).toArray(val, i * 4); // тот же наклон, без поворота
        info.yt.push(rot.times[i]); info.yaw.push(YAW_OUT[c.name] === 'apply' ? acc : 0);
      }
    }
  }
  g.scene.scale.setScalar(keep); g.scene.updateMatrixWorld(true);
  return out;
}
const lerpAt = (ts, vs, t) => { const n = ts.length; if (!n) return 0; if (t <= ts[0]) return vs[0]; if (t >= ts[n - 1]) return vs[n - 1]; let i = 1; while (ts[i] < t) i++; const u = (t - ts[i - 1]) / (ts[i] - ts[i - 1]); return vs[i - 1] + (vs[i] - vs[i - 1]) * u; };
// скорость таза в записи в момент t (м/с, оси игрока) — по соседним кадрам ±0,05 с
const rootVel = (c, t) => { const I = c.userData, a = Math.max(0, t - 0.05), b = Math.min(c.duration, t + 0.05), dt = b - a || 1; return [(lerpAt(I.t, I.x, b) - lerpAt(I.t, I.x, a)) / dt, (lerpAt(I.t, I.z, b) - lerpAt(I.t, I.z, a)) / dt]; };
// ведение: за цикл записи (1,767 с) опорная стопа уходит назад на 4,35 м (замер __stride) — 2,46 м/с при обычной скорости.
// Было 2,62·0,01·… ≈ 0,03 м/с — запись всегда играла на пределе ×1,7, и на средней скорости ноги перебирали вдвое быстрее
const DRIB_SPEED = 4.35 / 1.767;
async function player(kit, mine = false) { // общая полная модель — без упрощения; своя команда — своя модель (если загрузилась)
  await baseReady; if (mine) await heroReady;
  const own = mine && hero, src = own ? hero : base;
  const m = cloneSkinned(src.scene);
  if (own) m.scale.setScalar(HERO.scale);
  const baseMats = {}; base.scene.traverse((o) => { if (o.isMesh) baseMats[o.name] = o.material; });
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    if (own) { o.material = o.material.clone(); o.material.roughness = 0.78; o.material.metalness = 0; o.material.envMapIntensity = 0.6; heroKitShader(o); return; } // текстура своей формы + перекраска белой ткани
    o.material = (baseMats[o.name] || o.material).clone(); // свой материал (цвет формы), текстуры общие
    playerMaterial(o, kit);
  });
  const holder = new THREE.Group(); holder.add(m); scene.add(holder);
  const bl = blob(holder, 1.3);
  const hips = m.getObjectByName('Hips');
  Object.assign(blobs.find((x) => x.m === bl), { bone: hips, player: true }); // тень идёт за тазом: записанные движения двигают игрока сами
  const footL = m.getObjectByName('LeftFoot'), footR = m.getObjectByName('RightFoot'), toeL = m.getObjectByName('LeftToeBase'), toeR = m.getObjectByName('RightToeBase');
  const body = ['LeftHand', 'RightHand', 'Spine2', 'Head'].map((n) => m.getObjectByName(n)); // чем вратарь касается мяча
  return { holder, model: m, mixer: new THREE.AnimationMixer(m), hips, hipsRest: hips.position.clone(), body, footL, footR, toeL, toeR, act: null, t: 0, hs: own ? HERO.hs : 1, own: !!own };
}
// Своя модель: форма нарисована в текстуре (белая). Перекраска шейдером: светлые бесцветные места текстуры (ткань) —
// в цвет команды, складки и тени сохраняются; кожа, бутсы, волосы, тёмные полосы и логотипы — как были. Что это —
// футболка, шорты или гетры — по высоте точки на теле в исходной позе (ниже колена — гетры, до пояса — шорты).
function heroKitShader(o) {
  const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox, mt = o.material;
  const U = { uKitOn: { value: 0 }, uShirt: { value: new THREE.Color('#ffffff') }, uShorts: { value: new THREE.Color('#ffffff') }, uSocks: { value: new THREE.Color('#ffffff') }, uSkin: { value: new THREE.Vector3(1, 1, 1) }, uKitY: { value: new THREE.Vector2(bb.min.y, bb.max.y - bb.min.y) } };
  mt.userData.kitU = U;
  mt.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying float vKitY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKitY = position.y;');
    sh.fragmentShader = 'varying float vKitY;\nuniform float uKitOn; uniform vec3 uShirt, uShorts, uSocks, uSkin; uniform vec2 uKitY;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx > 1e-3 ? (mx - mn) / mx : 0.0;
    float m = uKitOn * smoothstep(0.16, 0.34, mx) * (1.0 - smoothstep(0.1, 0.24, sat));
    float h = (vKitY - uKitY.x) / uKitY.y; vec3 k = h < 0.3 ? uSocks : h < 0.56 ? uShorts : uShirt;
    diffuseColor.rgb = mix(c, k * clamp(mx / 0.82, 0.0, 1.15), m);
    // тон кожи (у всех одна модель — чтобы игроки не были на одно лицо): тёплые места текстуры (кожа), не жёлтые бутсы
    float sk = smoothstep(0.25, 0.4, sat) * (1.0 - smoothstep(0.78, 0.9, c.g / max(c.r, 1e-3))) * step(c.b, c.g) * smoothstep(0.03, 0.08, mx);
    diffuseColor.rgb *= mix(vec3(1.0), uSkin, sk); }`);
  };
  mt.customProgramCacheKey = () => 'heroKit';
}
const hexKit = (q) => { const k = (q || '').split('.').filter((c) => /^[0-9a-f]{6}$/i.test(c)); return k.length ? { shirt: '#' + k[0], shorts: '#' + (k[1] || k[0]), socks: '#' + (k[2] || k[1] || k[0]) } : null; };
const myKit = hexKit(Q.get('kit')); // без ?kit= — своя белая форма модели
const gkKit = { shirt: '#ffd23f', shorts: '#2a2d3a', socks: '#ffd23f' };
const wallKit = () => ({ shirt: '#e0303c', shorts: '#ffffff', socks: '#e0303c' });
// перекрасить форму (футболка, шорты, гетры) — складки и швы текстуры остаются
// тон кожи своей модели (множитель цвета кожи в текстуре): разные у игроков, по номеру в составе
const SKIN = [[1, 1, 1], [0.62, 0.56, 0.52], [1.22, 1.16, 1.1], [0.8, 0.74, 0.7], [1.12, 1.05, 0.98], [0.5, 0.45, 0.42]];
function skinTone(pl, i) { pl.model.traverse((o) => { const U = o.isMesh && o.material.userData.kitU; if (U) U.uSkin.value.fromArray(SKIN[i % SKIN.length]); }); }
function recolor(pl, kit) { if (pl && kit) pl.model.traverse((o) => { if (!o.isMesh) return; const U = o.material.userData.kitU;
  if (U) { const white = /^#?f[0-9a-f]f[0-9a-f]f/i.test(kit.shirt || '') && kit.shirt === kit.shorts; U.uKitOn.value = white ? 0 : 1; U.uShirt.value.set(kit.shirt); U.uShorts.value.set(kit.shorts || kit.shirt); U.uSocks.value.set(kit.socks || kit.shirt); return; } // своя модель — перекраска шейдером
  const part = PART[o.name]; if (part && kit[part]) o.material.color.set(kit[part]); }); }
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
// у вратарей ещё и бёдра: иначе мяч на высоте 0,4–0,9 м проходил между ног (замер: дальний удар в корпус — гол)
// и «закрытые ноги»: точки посередине бедра и голени и между коленями и стопами — мяч низом не проходит между ног
const GK_PARTS = { LThigh: [0.1, 'body', 'LeftUpLeg', 'LeftLeg'], RThigh: [0.1, 'body', 'RightUpLeg', 'RightLeg'], LShin: [0.08, 'body', 'LeftLeg', 'LeftFoot'], RShin: [0.08, 'body', 'RightLeg', 'RightFoot'],
  Knees: [0.1, 'body', 'LeftLeg', 'RightLeg'], Feet: [0.09, 'body', 'LeftFoot', 'RightFoot'] };
function makeSpheres(pl, who) { pl.sph = Object.entries(who === 'gk' || who === 'gk2' ? Object.assign({}, PARTS, GK_PARTS) : PARTS).map(([name, [r, kind, a, b]]) => ({ bone: pl.model.getObjectByName(a || name), bone2: b ? pl.model.getObjectByName(b) : null, name, r, kind, who, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, init: false })).filter((q) => q.bone); }
const v3b = new THREE.Vector3();
function updSpheres(pl, dt) {
  for (const q of pl.sph) {
    q.bone.getWorldPosition(v3); if (q.bone2) v3.add(q.bone2.getWorldPosition(v3b)).multiplyScalar(0.5);
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
  if (q.who !== 'gk') { if (TRACE) console.log('bodyHit', JSON.stringify({ who: q.who, s: q.name, rel: +c.rel.toFixed(1), y: +B.p.y.toFixed(2), bv: +Math.hypot(B.v.x, B.v.z).toFixed(1), sv: +Math.hypot(q.vx || 0, q.vz || 0).toFixed(1), pass: !!passInFlight() })); return 'bounce'; }
  return gkCtx(0, () => gkSphere(q, c));
};
function gkSphere(q, c) {
  if (MATCH_ON && MT.shotPend && MT.shotPend.team !== 1 - gkCur) { MST().on[MT.shotPend.team]++; MT.shotPend = null; } // удар в створ — вратарь коснулся
  const K = BP.CFG.keeper, first = simT - lastGkTouch > 0.15; lastGkTouch = simT;
  // ловля — только при настоящем касании: обе кисти у мяча или мяч в корпус, и мяч не слишком быстрый
  const hands = keeper.sph.filter((h) => h.name.endsWith('Hand'));
  const twoHands = hands.length === 2 && hands.every((h) => Math.hypot(B.p.x - h.x, B.p.y - h.y, B.p.z - h.z) < R + h.r + K.twoHands);
  // ловит в движении ловли: мяч в корпус, бёдра или ноги — прижимает (не отскакивает от колен в ворота)
  const chest = q.name === 'Spine2' || q.name === 'Spine' || (q.kind === 'body' && keeper.name && keeper.name.startsWith('gk_catch') && q.name !== 'Head' && c.rel < K.catchLegs);
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
    const pf = passInFlight(); // пас своему в пути: свои мяч пропускают, а получатель принимает его ногой (не отбивает корпусом)
    const slowBall = Math.hypot(B.v.x, B.v.z) < 4;
    for (const a of actors()) if (a.pl.sph && a.id !== lock && !(MT.aer && MT.aer.a === a) && !(a.pl.aerT > simT) && Math.abs(a.P.p.x - B.p.x) < 4 && Math.abs(a.P.p.z - B.p.z) < 4 && !(pf && pf.team === a.team) && !(slowBall && isDown(a.pl))) for (const q of a.pl.sph) world.spheres.push(q); // дальние не проверяем; лежащий не держит медленный мяч (замер: мяч 3,5 с «толкался» о лежащего)
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
  for (const [name, by] of [['gk_dive', 'x'], ['gk_dive2', 'x'], ['gk_block', 'x'], ['gk_block2', 'x'], ['gk_catch2', 'y'], ['gk_catch4', 'y'], ['gk_scoop', 'low'], ['gk_catch', 'low']]) {
    const clip = clipOf(name); if (!clip) continue; const a = keeper.mixer.clipAction(clip); keeper.mixer.stopAllAction(); a.reset().play();
    let best = -1e9, info = null; const tab = [];
    for (let t = 0; t <= clip.duration; t += 1 / 30) {
      keeper.mixer.setTime(t); keeper.model.updateMatrixWorld(true);
      const m = loc(lh).add(loc(rh)).multiplyScalar(0.5), hp = hipsAt(keeper);
      const score = by === 'x' ? Math.abs(m.x) : by === 'y' ? m.y : -m.y + m.z * 0.3; tab.push([t, m.y]);
      if (score > best) { best = score; info = { tc: t, hx: m.x, hy: m.y, hz: m.z, px: hp.x, dur: clip.duration }; }
    }
    a.stop(); info.tab = tab; GKC[name] = info;
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
    // низкий мяч прямо в корпус — не бросок вбок (открывал центр), а низкая ловля: руки к газону, ноги закрывают мяч
    let name = y > 1.75 ? 'gk_catch4' : y > 0.32 || (ax < 0.35 && GKC.gk_catch) ? 'gk_catch2' : (lx > 0 ? 'gk_block' : 'gk_block2'), G = GKC[name];
    // мяч в корпус на высоте 0,32–1,75 м: ловля, у которой руки в момент касания — на высоте мяча
    // (низкая ловля у пояса — руки 0,45–0,95 м; «грудь-голова» — 0,95–1,5 м). Раньше всегда руки шли к 1,5 м и мяч проходил под ними
    if (name === 'gk_catch2' && GKC.gk_catch) {
      let bt = null, be = 1e9;
      for (const [nm, t0, t1] of [['gk_catch', 0.35, GKC.gk_catch.tc], ['gk_catch2', 0.05, GKC.gk_catch2.tc]])
        for (const [t, hy] of GKC[nm].tab) if (t >= t0 && t <= t1 && Math.abs(hy - y) < be) { be = Math.abs(hy - y); bt = [nm, t]; }
      if (bt) { name = bt[0]; G = Object.assign({}, GKC[name], { tc: bt[1] }); }
    }
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
const clipOfRaw = (name) => (name.startsWith('h_') ? heroMoves && heroMoves[name] : base.animations.find((c) => c.name === (ALIAS[name] || name)));
// «имя_L» — зеркальная копия записи (левой ногой): пас и удар с левой, если мяч ведёт левая (B.sideK < 0)
const mirrored = new Map();
const clipOf = (name) => { if (!name.endsWith('_L')) return clipOfRaw(name); if (!mirrored.has(name)) { const c = clipOfRaw(name.slice(0, -2)); mirrored.set(name, c ? mirrorClip(c, name) : null); } return mirrored.get(name); };
const variants = new Map();
// копия движения: смещение таза по сторонам (fx) и вперёд (fz) умножено — вратарь долетает ровно до мяча и не выбегает из ворот
// Бег и стойка своей модели (записи общей модели): высоту таза подбираем по замеру — за весь цикл стопа не уходит
// в газон и не висит над ним. Замер — на невидимой копии своей модели, один раз на запись.
const HERO_FIT = new Set(['idle', 'jog', 'jog_back', 'jog_strafe_left', 'jog_strafe_right', 'jog_forward_diagonal', 'jog_forward_diagonal_2', 'jog_backward_diagonal', 'jog_backward_diagonal_2']);
// удар: высота таза подгоняется по каждому ключу записи — опорная стопа всё время на газоне. Иначе на своей модели
// опорная нога уходила под газон (до 0,77 м), «защита от провала» поднимала всё тело, и ударная стопа проходила над мячом
const HERO_FIT_KEYS = new Set(['strike', 'strike_L']);
let heroProbe = null;
function heroFit(c, up) {
  if (!hero) return;
  if (!heroProbe) { const m = cloneSkinned(hero.scene); m.scale.setScalar(HERO.scale);
    heroProbe = { m, mixer: new THREE.AnimationMixer(m), hips: m.getObjectByName('Hips'), feet: ['Foot', 'ToeBase', 'Toe_End'].flatMap((n, i) => ['Left', 'Right'].map((s) => [m.getObjectByName(s + n), GROUND.feet.own[i]])) }; }
  if (up < 0) return; // только создать пробу
  const P = heroProbe, a = P.mixer.clipAction(c); a.reset().play(); let low = 1e9;
  for (let i = 0; i < 30; i++) { P.mixer.setTime((c.duration * i) / 30); P.m.updateMatrixWorld(true); for (const [b, r] of P.feet) low = Math.min(low, b.matrixWorld.elements[13] - r); }
  a.stop(); P.mixer.uncacheAction(c);
  const k = P.hips.parent.matrixWorld.elements[4 * up + 1]; // на сколько метров по высоте сдвигает единица этой оси
  const tr = c.tracks.find((t) => t.name === 'Hips.position'); if (!tr || Math.abs(k) < 1e-4 || Math.abs(low) > 0.3) return; // замер не удался — оставляем как есть
  for (let i = up; i < tr.values.length; i += 3) tr.values[i] -= low / k;
  if (TRACE) console.log('heroFit', c.name, +(-low).toFixed(3));
}
function heroFitKeys(c, up) {
  if (!hero) return; heroFit(c, -1); // создать пробную модель (без подгонки)
  const P = heroProbe, tr = c.tracks.find((t) => t.name === 'Hips.position'); if (!tr) return;
  const a = P.mixer.clipAction(c); a.reset().play(); const lows = [];
  for (let i = 0; i < tr.times.length; i++) { P.mixer.setTime(Math.min(tr.times[i], c.duration - 1e-4)); P.m.updateMatrixWorld(true); let low = 1e9; for (const [bn, r] of P.feet) low = Math.min(low, bn.matrixWorld.elements[13] - r); lows.push(low); }
  a.stop(); P.mixer.uncacheAction(c);
  const k = P.hips.parent.matrixWorld.elements[4 * up + 1]; if (Math.abs(k) < 1e-4) return;
  for (let i = 0; i < lows.length; i++) if (Math.abs(lows[i]) < 1.5) tr.values[i * 3 + up] -= lows[i] / k;
  if (TRACE) console.log('heroFitKeys', c.name, +Math.min(...lows).toFixed(3), +Math.max(...lows).toFixed(3));
}
// какая ось смещения таза — высота: та ось родителя таза (Armature), что в мире смотрит вверх (по общей модели)
let HIPS_UP = -1;
const hipsUp = () => { if (HIPS_UP < 0) { base.scene.updateMatrixWorld(true); const e = base.scene.getObjectByName('Hips').parent.matrixWorld.elements; HIPS_UP = [0, 1, 2].reduce((b, j) => (Math.abs(e[4 * j + 1]) > Math.abs(e[4 * b + 1]) ? j : b), 0); } return HIPS_UP; };
function variant(name, fx = 1, fz = 1, hs = 1) {
  fx = Math.round(fx * 20) / 20; fz = Math.round(fz * 20) / 20; // шаг 0,05: глазом не отличить, копий меньше
  const key = name + '|' + fx.toFixed(2) + '|' + fz.toFixed(2) + (hs !== 1 ? '|h' + hs : ''); if (variants.has(key)) return variants.get(key);
  // копируем только дорожку таза (её растягиваем), остальные дорожки — общие с исходной записью: меньше памяти и без рывка при создании
  // hs — другой скелет (своя модель из Mixamo): смещение таза в его единицах
  const src = clipOf(name), stretch = fx !== 1 || fz !== 1 || hs !== 1;
  const c = new THREE.AnimationClip(key, src.duration, src.tracks.map((t) => (stretch && t.name === 'Hips.position' ? t.clone() : t)));
  const tr = stretch && c.tracks.find((t) => t.name === 'Hips.position');
  if (tr) { const v = tr.values, x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] = x0 + (v[i] - x0) * fx; v[i + 1] = y0 + (v[i + 1] - y0) * fz; }
    if (hs !== 1) { // своя модель: по высоте таз выше (ноги длиннее, чем у общей модели), иначе стопы уходят в газон
      const up = hipsUp(), hv = hs * HERO.hv; for (let i = 0; i < v.length; i++) v[i] *= i % 3 === up ? hv : hs;
      if (HERO_FIT.has(name)) heroFit(c, up); else if (HERO_FIT_KEYS.has(name)) heroFitKeys(c, up); } }
  variants.set(key, c); return c;
}
function play(pl, name, { t = 0, loop = false, fade = 0.25, speed = 1, hold = Infinity, fx = 1, fz = 1, lock = null, lift = 0, follow = false, mirror = false } = {}) {
  // mirror — та же запись зеркально (левой ногой); имя движения (pl.name) остаётся прежним — вся логика паса/удара та же
  const a = pl.mixer.clipAction(variant(mirror ? name + '_L' : name, fx, fz, name.startsWith('h_') ? 1 : pl.hs || 1)); // h_ — записано на своём скелете
  a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = speed; a.time = t; a.setEffectiveWeight(1);
  if (pl.name === 'loco' && pl.loco) { // из смешанного бега: гасим обе записи (и незавершённый прошлый переход)
    const o = pl.loco; for (const x of new Set([o.idle, o.jog, o.prev, o.drib, o.dribL, ...(o.dirs || []).map((d) => d.a), ...(o.run || []).map((r) => r.a)])) if (x && x !== a) { if (fade > 0) x.fadeOut(fade); else x.stop(); }
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
// Бег в 8 направлениях (замер __stride: опорная стопа относительно таза): угол движения относительно корпуса (вправо — +),
// метров за цикл у своей модели и у общей, фаза — когда левый носок ниже всего (доля цикла). Фазы разные у разных записей:
// раньше все играли с одной фазой, и при смешивании (диагональ, поворот) ноги путались; длина шага была одна на обе модели
// (у общей шаг на 20 % короче — ноги проскальзывали). Записи диагоналей раньше не использовались.
const LOCO8 = [
  ['jog', 0, 2.075, 1.731, 0.365], ['jog_forward_diagonal', 45, 2.255, 1.806, 0.0], ['jog_strafe_right', 90, 1.555, 1.345, 0.957], ['jog_backward_diagonal', 140, 1.686, 0.775, 0.978],
  ['jog_back', 180, 1.962, 1.514, 0.655], ['jog_backward_diagonal_2', -135, 2.331, 1.728, 0.596], ['jog_strafe_left', -90, 2.006, 1.584, 0.67], ['jog_forward_diagonal_2', -44, 2.268, 1.845, 0.058],
];
const LOCO_DIRS = [['jog', 2.15], ['jog_back', 1.9], ['jog_strafe_left', 2.11], ['jog_strafe_right', 1.76]];
// своя модель: быстрый бег и рывок — метров за цикл (замер таза: 3,08 и 3,47) и сдвиг фазы, чтобы левая нога
// выходила вперёд в тот же момент, что и в трусце (у трусцы — на 27% цикла, у быстрого бега — на 22%, у рывка — на 21%)
const RUN_CLIPS = [['h_fast_run', 3.046, 0.567 - 0.365], ['h_sprint', 3.296, 0.469 - 0.365]]; // метров за цикл и фаза — замер __stride (как у LOCO8)
// Зеркальная копия записи (левое ↔ правое): имена костей Left/Right меняются местами, повороты отражаются относительно
// плоскости симметрии тела (x → −x: кватернион (x, −y, −z, w)), смещение таза вбок — с обратным знаком.
// Нужна для ведения левой ногой: запись Mixamo «Dribble» ведёт мяч только правой.
let heroDribL = null;
function mirrorClip(c, name) {
  const sw = (n) => n.replace(/Left|Right/g, (m) => (m === 'Left' ? 'Right' : 'Left'));
  const tracks = c.tracks.map((t) => { const u = t.clone(); u.name = sw(t.name); const v = u.values;
    if (t.name.endsWith('.quaternion')) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
    else if (t.name.endsWith('.position')) for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    return u; });
  return new THREE.AnimationClip(name, c.duration, tracks);
}
function loco(pl, sp, dt, P) {
  const hs = pl.hs || 1, L = pl.loco || (pl.loco = { idle: pl.mixer.clipAction(variant('idle', 1, 1, hs)), jog: pl.mixer.clipAction(variant('jog', 1, 1, hs)), dirs: null, f: 1, prev: null, ph: 0 });
  if (MATCH_ON && !L.dirs) L.dirs = LOCO8.map(([n, ang, mo, mb, ph]) => ({ a: n === 'jog' ? L.jog : pl.mixer.clipAction(variant(n, 1, 1, hs)), ang: ang * Math.PI / 180, m: pl.own ? mo : mb, off: ph - LOCO8[0][4], w: 0 }));
  if (pl.own && heroDrib && !L.drib) { L.drib = pl.mixer.clipAction(heroDrib); L.dw = 0; // своя модель: ведение мяча — своя запись
    if (!heroDribL) heroDribL = mirrorClip(heroDrib, 'dribble_left'); L.dribL = pl.mixer.clipAction(heroDribL); } // и её зеркало — ведение левой
  if (pl.own && heroMoves && !L.run) L.run = RUN_CLIPS.map(([n, m, off]) => ({ a: pl.mixer.clipAction(heroMoves[n]), m, off })); // своя модель: быстрый бег и рывок
  const all = (L.dirs ? [L.idle, ...L.dirs.map((d) => d.a)] : [L.idle, L.jog]).concat(L.drib ? [L.drib, L.dribL] : [], L.run ? L.run.map((r) => r.a) : []);
  if (pl.name !== 'loco') {
    // было движение из самого бега (например, стойка после розыгрыша) — без нарастания: иначе на 0,3 с сквозь вес
    // проступала поза покоя скелета (у своей модели она «в газоне»)
    L.prev = all.includes(pl.act) ? null : pl.act; L.f = L.prev ? 0 : 1;
    for (const a of all) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
    Object.assign(pl, { name: 'loco', act: L.jog, hold: Infinity, lock: null, lift: 0, follow: true });
  }
  L.f = Math.min(1, L.f + dt / 0.3);
  const w = THREE.MathUtils.smoothstep(sp, 0.3, 1.9);
  L.idle.setEffectiveWeight((1 - w) * L.f);
  if (L.prev && !all.includes(L.prev)) { L.prev.setEffectiveWeight(1 - L.f); if (L.f >= 1) { L.prev.stop(); L.prev = null; } }
  // ведение (своя модель, мяч у ноги, бежит): плавно переходит с бега на запись ведения
  // на рывке с мячом (быстрее 4 м/с) — не ведение в два раза быстрее (семенит), а настоящий бег и рывок: мяч толкает вперёд
  let dw = 0; if (L.drib) { const want = pl.withBall ? 1 - (L.run ? THREE.MathUtils.smoothstep(sp, 4.0, 4.8) : 0) : 0; L.dw += (want - L.dw) * Math.min(1, dt * 6); dw = L.dw; L.drib.timeScale = THREE.MathUtils.clamp(sp / DRIB_SPEED, 0.5, 1.9);
    // нога ведения: правая — запись, левая — её зеркало; при переводе мяча под другую ногу — плавный переход между ними
    // (sideK от +1 — правая до −1 — левая, меняется вместе с переходом мяча). Зеркало идёт со сдвигом на четверть записи
    // (в ней два шага): левая нога зеркала выходит вперёд в тот же момент, что левая нога записи, — шаг не сбивается
    if (pl.withBall) L.sk = B.sideK ?? 1; const kR = (1 + (L.sk ?? 1)) / 2; // мяч ушёл — доигрывает той ногой, что вела
    const D0 = L.drib.getClip().duration; L.dribL.timeScale = 0; L.dribL.time = (L.drib.time + D0 * 0.25) % D0;
    L.drib.setEffectiveWeight(w * dw * L.f * kR); L.dribL.setEffectiveWeight(w * dw * L.f * (1 - kR)); }
  // быстрый бег и рывок (своя модель): чем быстрее бежит вперёд, тем больше этих записей вместо трусцы; шаг — в той же фазе
  const fwd = !P || sp < 0.05 ? 1 : Math.max(0, (P.v.x * Math.sin(P.yaw) + P.v.z * Math.cos(P.yaw)) / sp);
  const wr = L.run ? THREE.MathUtils.smoothstep(sp, 4.0, 5.2) * fwd * fwd : 0, wsp = THREE.MathUtils.smoothstep(sp, 5.4, 6.3);
  const runW = (ph) => { if (!L.run) return; const ww = [1 - wsp, wsp];
    L.run.forEach((r, i) => { r.a.timeScale = 0; r.a.time = (((ph + r.off) % 1) + 1) % 1 * r.a.getClip().duration; r.a.setEffectiveWeight(w * L.f * (1 - dw) * wr * ww[i]); }); };
  if (!L.dirs || !P) { L.jog.setEffectiveWeight(w * L.f * (1 - dw) * (1 - wr)); L.jog.timeScale = THREE.MathUtils.clamp(sp / JOG_SPEED, 0.75, 2.1); runW((L.jog.time / L.jog.getClip().duration) % 1); return; } // на рывке частоту ног ограничиваем
  // направление движения относительно корпуса (вправо — +): смешиваем две соседние записи из восьми по углу
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), vf = sp > 0.05 ? (P.v.x * fx + P.v.z * fz) / sp : 1, vr = sp > 0.05 ? (-P.v.x * fz + P.v.z * fx) / sp : 0;
  const ang = Math.atan2(vr, vf), D = L.dirs, n8 = D.length; let best = 0, bd = 9;
  for (let i = 0; i < n8; i++) { const d = Math.atan2(Math.sin(ang - D[i].ang), Math.cos(ang - D[i].ang)); if (d >= 0 && d < bd) { bd = d; best = i; } } // ближайшая запись «слева» по углу
  const j = (best + 1) % n8, span = Math.atan2(Math.sin(D[j].ang - D[best].ang), Math.cos(D[j].ang - D[best].ang)) || 1, u = THREE.MathUtils.clamp(bd / span, 0, 1);
  // веса меняются плавно (за ~0,1 с), а не скачком при резком повороте скорости
  const kw = 1 - Math.exp(-dt * 12); for (let i = 0; i < n8; i++) { const t = i === best ? 1 - u : i === j ? u : 0; D[i].w += (t - D[i].w) * kw; }
  // шагов в секунду — чтобы опорная стопа стояла: скорость / метров за цикл (по смеси записей)
  let cps = 0, ws = 0; for (const d of D) { cps += d.w * (sp / d.m); ws += d.w; } cps /= ws || 1;
  if (wr > 0) cps = cps * (1 - wr) + wr * sp / (L.run[0].m * (1 - wsp) + L.run[1].m * wsp); // у рывка шаг длиннее
  cps = THREE.MathUtils.clamp(cps, 0.55 / 0.87, 2.1 / 0.87); // медленнее нижней границы — ноги уже не скользят заметно
  if (pl.cut) { const t = pl.cut.t; cps *= 1 + (CUT.cad - 1) * THREE.MathUtils.smoothstep(t, 0, 0.1) * (1 - THREE.MathUtils.smoothstep(t, CUT.dur - 0.2, CUT.dur)); } // поворот: шаги короче и чаще
  L.ph = (L.ph + cps * dt) % 1; L.cps = cps;
  for (const d of D) { d.a.timeScale = 0; d.a.time = ((((L.ph + d.off) % 1) + 1) % 1) * d.a.getClip().duration; d.a.setEffectiveWeight(w * (d.w / (ws || 1)) * L.f * (1 - dw) * (1 - wr)); }
  runW(L.ph);
}
// таз в мировых координатах ↔ в координатах скелета (у скелета Mixamo свой поворот и масштаб 0,01)
function tickPlayer(pl, dt) {
  if (!pl.act) return;
  pl.mixer.update(dt);
  if (pl.act.time >= pl.hold) { pl.act.time = pl.hold; pl.act.paused = true; }
  pl.t = pl.act.time;
  if (Math.abs(pl.twist || 0) > 0.005) torsoTwist(pl, pl.twist);
  if (pl.lock || pl.lift || pl.follow) {
    pl.holder.updateMatrixWorld(true);
    const par = pl.hips.parent, w = pl.hips.getWorldPosition(v3);
    if (pl.follow) { w.x = pl.holder.position.x; w.z = pl.holder.position.z; } // бег/стойка на месте: двигаем игрока сами
    else if (pl.lock) { w.x = pl.lock.x; w.z = pl.lock.z; }
    if (pl.lift) w.y += pl.lift(pl.t);
    pl.hips.position.copy(par.worldToLocal(w));
  } else pl.holder.updateMatrixWorld(true);
  groundFix(pl, dt, pl.lift ? pl.lift(pl.t) : 0);
}
// Поворот начинается с корпуса: плечи и голова разворачиваются к цели раньше ног (ноги бегут по скорости, а она
// поворачивает дугой). Поверх записи бега: позвоночник и шея скручиваются вокруг вертикали (доли — снизу вверх).
// Поворот вокруг мировой вертикали в системе родителя кости: при повороте кости вокруг вертикали её «вертикаль» не
// меняется, поэтому оси для всех костей берём из одного расчёта.
const TWIST = [['Spine', 0.25], ['Spine1', 0.3], ['Spine2', 0.3], ['Neck', 0.15]], twQ = new THREE.Quaternion(), twA = new THREE.Vector3(), twU = new THREE.Vector3(0, 1, 0);
function torsoTwist(pl, ang) {
  if (!pl.twB) pl.twB = TWIST.map(([n, k]) => [pl.model.getObjectByName(n), k]).filter((x) => x[0]);
  pl.holder.updateMatrixWorld(true);
  const axes = pl.twB.map(([b]) => twA.copy(twU).applyQuaternion(b.parent.getWorldQuaternion(twQ).invert()).clone());
  pl.twB.forEach(([b, k], i) => b.quaternion.premultiply(twQ.setFromAxisAngle(axes[i], ang * k)));
}
// Перекладывание (вид): стопа с мячом перед толчком разворачивается носком наружу — мяч уходит внутренней стороной
// стопы — и возвращается за ~0,2 с; корпус в это время чуть наклоняется к опорной ноге (вес на ней). Поверх записи
// бега, только вращения костей (движение игрока и мяча не меняются).
const XP = { foot: 0.5, lean: 0.12, pre: 0.12 }, xpA = new THREE.Vector3(), xpF = new THREE.Vector3();
function rotW(bone, axisW, ang) { bone.parent.getWorldQuaternion(twQ).invert(); xpA.copy(axisW).applyQuaternion(twQ); bone.quaternion.premultiply(twQ.setFromAxisAngle(xpA, ang)); }
function xferPose(pl, P) {
  const X = B.xfer, L = pl.loco; let push = 0, kf = 0, kl = 0;
  if (X) { const u = Math.min(1, X.t / X.T); push = X.s1 > 0 ? -1 : 1; kf = (1 - u) * (1 - u); kl = Math.sin(Math.PI * u); } // толкает нога, у которой мяч был (против новой)
  else if (B.footNext !== undefined && L) { const cy = stepCycle(L); if (cy > 0) { const ph = (L.jog.time / L.jog.getClip().duration) % 1, phT = B.foot < 0 ? 0.12 : 0.62, tS = ((((phT - ph) % 1) + 1) % 1) * cy;
    push = B.foot; kf = THREE.MathUtils.smoothstep(XP.pre - tS, 0, XP.pre); } } // шаг ноги с мячом близко — стопа заранее разворачивается
  if (kf < 0.01 && kl < 0.01) return;
  pl.holder.updateMatrixWorld(true);
  const foot = pl.model.getObjectByName((push > 0 ? 'Right' : 'Left') + 'Foot');
  if (foot && kf > 0.01) rotW(foot, twU, (push > 0 ? -1 : 1) * XP.foot * kf); // носок наружу: правая — вправо, левая — влево
  if (kl > 0.01) { const sp = pl.model.getObjectByName('Spine'); xpF.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)); if (sp) rotW(sp, xpF, -push * XP.lean * kl); } // наклон к опорной ноге
}
// Поворот с перекладыванием (своя модель; запись EA «Dribbling», 44,7–45,0 и 45,5–45,9 с: на смене направления игрок
// опускает таз, сгибает колени, шагает коротко и часто, корпус отклоняется назад и в сторону поворота, мяч уходит
// внутренней стороной стопы под другую ногу). Слой поверх записи бега, только кости: таз ниже, ноги подгибаются так,
// что стопы остаются где были (двухзвенная подстройка бедро — колено — голеностоп), нога с мячом тянется к его внешнему
// боку и толкает (BP.xferNow в CUT.tc), корпус наклоняется. Движение игрока не меняется (за это отвечает тест управления).
const CUT = { tc: 0.12, tcMax: 0.25, dur: 0.5, crouch: 0.09, back: 0.16, side: 0.14, foot: 0.5, cad: 1.35 };
const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikC = new THREE.Vector3(), ikT = new THREE.Vector3(), ikD = new THREE.Vector3(), ikN = new THREE.Vector3(), ikV = new THREE.Vector3(), ikQ = new THREE.Quaternion(), ikQ2 = new THREE.Quaternion(), ikQ3 = new THREE.Quaternion();
const legBones = (pl, L) => (pl.ik || (pl.ik = {}))[L] || (pl.ik[L] = ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map((n) => pl.model.getObjectByName(L + n)));
function setWorldQ(bone, qW) { bone.parent.getWorldQuaternion(ikQ2).invert(); bone.quaternion.copy(ikQ2.multiply(qW)); bone.updateMatrixWorld(true); }
// голеностоп ноги L — в точку tgt (мир), стопа сохраняет мировой поворот footQ (подошва не заваливается)
function legIK(pl, L, tgt, footQ, P) {
  const [up, leg, foot] = legBones(pl, L); if (!up || !leg || !foot) return;
  up.getWorldPosition(ikA); leg.getWorldPosition(ikB); foot.getWorldPosition(ikC);
  const a = ikA.distanceTo(ikB), b = ikB.distanceTo(ikC), c = THREE.MathUtils.clamp(ikA.distanceTo(tgt), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  ikN.subVectors(ikA, ikB).cross(ikV.subVectors(ikC, ikB)); if (ikN.lengthSq() < 1e-8) ikN.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); ikN.normalize();
  const cur = ikV.subVectors(ikA, ikB).angleTo(ikD.subVectors(ikC, ikB)), want = Math.acos(THREE.MathUtils.clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1));
  leg.getWorldQuaternion(ikQ3); setWorldQ(leg, ikQ.setFromAxisAngle(ikN, want - cur).multiply(ikQ3)); // колено
  foot.getWorldPosition(ikC); up.getWorldQuaternion(ikQ3); setWorldQ(up, ikQ.setFromUnitVectors(ikV.subVectors(ikC, ikA).normalize(), ikD.subVectors(tgt, ikA).normalize()).multiply(ikQ3)); // бедро
  setWorldQ(foot, footQ);
}
const cutP = { L: new THREE.Vector3(), R: new THREE.Vector3(), qL: new THREE.Quaternion(), qR: new THREE.Quaternion(), h: new THREE.Vector3(), toe: new THREE.Vector3() };
function cutStep(pl, P, dt) {
  if (!pl.own) return false;
  if (!pl.cut && B.footNext !== undefined && !B.strikeAt) { let a = Math.atan2(P.wx || 0, P.wz || 0) - P.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); pl.cut = { t: 0, push: B.foot, turn: Math.sign(a) || 1, done: false }; }
  const c = pl.cut; if (!c) return false;
  c.t += dt; const sm = THREE.MathUtils.smoothstep;
  // касание — когда стопа достаёт мяч (игрок набежал на него: мяч ближе к ногам, B.cutK), но не позже tcMax
  if (!c.done && c.t >= 0.06 && ((c.err ?? 9) < 0.16 || c.t >= CUT.tcMax)) { c.done = true; c.tc = c.t; BP.xferNow(B, P, stepCycle(pl.loco)); sfx.touch(); if (run) run.meTouchT = simT; }
  if (c.t >= (c.tc ?? CUT.tcMax) + CUT.dur - CUT.tc || B.strikeAt) { pl.cut = null; B.cutK = 0; return false; }
  const end = (c.tc ?? CUT.tcMax) + CUT.dur - CUT.tc, w = sm(c.t, 0, 0.1) * (1 - sm(c.t, end - 0.2, end)), r = !c.done ? sm(c.t, 0, 0.08) : 1 - sm(c.t, c.tc, c.tc + 0.14);
  B.cutK = !c.done ? w : Math.max(0, 1 - (c.t - c.tc) / 0.15) * w; // до касания мяч ближе к ногам, после — обычно
  pl.model.updateMatrixWorld(true);
  // где стопы по записи бега (до правок) — опорные остаются там же
  const LB = legBones(pl, 'Left'), RB = legBones(pl, 'Right'); if (LB.some((x) => !x) || RB.some((x) => !x)) return false;
  LB[2].getWorldPosition(cutP.L); RB[2].getWorldPosition(cutP.R); LB[2].getWorldQuaternion(cutP.qL); RB[2].getWorldQuaternion(cutP.qR);
  // 1) таз ниже
  const hips = pl.hips; hips.getWorldPosition(cutP.h); cutP.h.y -= CUT.crouch * w; hips.position.copy(hips.parent.worldToLocal(cutP.h.clone())); hips.updateMatrixWorld(true);
  // 2) корпус: назад и в сторону поворота
  const sp = pl.model.getObjectByName('Spine'); if (sp) { ikV.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); rotW(sp, ikV, -CUT.back * w); ikV.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)); rotW(sp, ikV, -c.turn * CUT.side * w); sp.updateMatrixWorld(true); }
  // 3) ноги: опорная — стопа на месте; толкающая — к внешнему боку мяча (носок к нему), носок наружу (толчок внутренней стороной)
  const pushL = c.push < 0 ? 'Left' : 'Right', PB = pushL === 'Left' ? LB : RB, keep = pushL === 'Left' ? cutP.R : cutP.L, keepQ = pushL === 'Left' ? cutP.qR : cutP.qL;
  legIK(pl, pushL === 'Left' ? 'Right' : 'Left', keep, keepQ, P);
  const ank = pushL === 'Left' ? cutP.L : cutP.R, ankQ = (pushL === 'Left' ? cutP.qL : cutP.qR).clone();
  PB[3].getWorldPosition(cutP.toe); const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw), out = c.push; // внешний бок мяча — со стороны толкающей ноги
  ikT.set(B.p.x + rx * out * (R + 0.04) - cutP.toe.x, 0, B.p.z + rz * out * (R + 0.04) - cutP.toe.z); if (ikT.length() > 0.45) ikT.setLength(0.45);
  const cx = B.p.x + rx * out * (R + 0.04), cz = B.p.z + rz * out * (R + 0.04), tgt = ank.clone().addScaledVector(ikT, r); tgt.y = Math.max(tgt.y, 0.09);
  ankQ.premultiply(ikQ.setFromAxisAngle(twU, -c.push * CUT.foot * Math.max(r, w * 0.5)));
  legIK(pl, pushL, tgt, ankQ, P);
  PB[3].getWorldPosition(cutP.toe); c.err = Math.hypot(cutP.toe.x - cx, cutP.toe.z - cz); // где носок после подстройки — достал ли мяч
  return true;
}
// Подошва на мяч (своя модель): разворот назад с мячом (B.ut) и остановка с мячом — стопа той ноги, у которой мяч,
// ставится на мяч сверху (мяч гасится подошвой), опорная нога на месте, таз ниже, корпус назад. Только кости.
const SOLE = { crouch: 0.07, back: 0.14, lift: 0.06, stopDur: 0.45 };
function soleLayer(pl, P, dt, sp, mine) {
  if (!pl.own || pl.name !== 'loco' || pl.mv) { pl.sole = null; return false; }
  if (!pl.sole && mine) {
    if (B.ut && !B.ut.end) pl.sole = { t: 0, kind: 'ut', foot: B.foot };
    else if (P.stopping && Math.hypot(P.wx || 0, P.wz || 0) < 0.3 && sp < 1.8 && (pl.pk || 0) > 2.6 && !pl.soleStopped) pl.sole = { t: 0, kind: 'stop', foot: B.foot };
  }
  if (sp > 2.2) pl.soleStopped = false; // снова бежит — следующая остановка опять с подошвой
  const S = pl.sole; if (!S) return false;
  S.t += dt; const sm = THREE.MathUtils.smoothstep;
  const dur = S.kind === 'ut' ? (B.ut && !B.ut.end ? S.t + 0.2 : (S.endT ??= S.t) + 0.2) : SOLE.stopDur;
  if (!mine || S.t >= dur || B.strikeAt) { if (S.kind === 'stop') pl.soleStopped = true; pl.sole = null; return false; }
  const w = sm(S.t, 0, 0.1) * (1 - sm(S.t, dur - 0.18, dur));
  const LB = legBones(pl, 'Left'), RB = legBones(pl, 'Right'); if (LB.some((x) => !x) || RB.some((x) => !x)) return false;
  pl.model.updateMatrixWorld(true);
  LB[2].getWorldPosition(cutP.L); RB[2].getWorldPosition(cutP.R); LB[2].getWorldQuaternion(cutP.qL); RB[2].getWorldQuaternion(cutP.qR);
  const hips = pl.hips; hips.getWorldPosition(cutP.h); cutP.h.y -= SOLE.crouch * w; hips.position.copy(hips.parent.worldToLocal(cutP.h.clone())); hips.updateMatrixWorld(true);
  const spn = pl.model.getObjectByName('Spine'); if (spn) { ikV.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); rotW(spn, ikV, -SOLE.back * w); spn.updateMatrixWorld(true); }
  const sole = S.foot < 0 ? 'Left' : 'Right', keep = sole === 'Left' ? cutP.R : cutP.L, keepQ = sole === 'Left' ? cutP.qR : cutP.qL;
  legIK(pl, sole === 'Left' ? 'Right' : 'Left', keep, keepQ, P);
  // голеностоп — над мячом (подошва сверху), чуть со стороны игрока
  const ank = sole === 'Left' ? cutP.L : cutP.R, ankQ = sole === 'Left' ? cutP.qL : cutP.qR, dx = P.p.x - B.p.x, dz = P.p.z - B.p.z, dl = Math.hypot(dx, dz) || 1;
  ikT.set(B.p.x + (dx / dl) * 0.05, B.p.y + R + SOLE.lift, B.p.z + (dz / dl) * 0.05); const tgt = ank.clone().lerp(ikT, w);
  legIK(pl, sole, tgt, ankQ, P);
  return true;
}
// Вес тела на поворотах и торможении (с мячом и без, своя модель): чем больше боковое ускорение и торможение, тем ниже
// таз (колени сгибаются, стопы на месте — та же подстройка ног, что в подрезе), корпус наклоняется в поворот и
// отклоняется назад при торможении. Только кости поверх записи бега.
const WT = { crouch: 0.08, side: 0.14, back: 0.14, full: 9 };
function weightLayer(pl, P, dt) {
  const load = THREE.MathUtils.clamp((Math.abs(pl.aLat || 0) + 0.8 * (pl.brake || 0)) / WT.full, 0, 1);
  pl.load = (pl.load || 0) + (load - (pl.load || 0)) * (1 - Math.exp(-dt * (load > (pl.load || 0) ? 12 : 5)));
  if (!pl.own || pl.name !== 'loco' || pl.mv || pl.load < 0.03) return;
  const w = pl.load, LB = legBones(pl, 'Left'), RB = legBones(pl, 'Right'); if (LB.some((x) => !x) || RB.some((x) => !x)) return;
  pl.model.updateMatrixWorld(true);
  LB[2].getWorldPosition(cutP.L); RB[2].getWorldPosition(cutP.R); LB[2].getWorldQuaternion(cutP.qL); RB[2].getWorldQuaternion(cutP.qR);
  const hips = pl.hips; hips.getWorldPosition(cutP.h); cutP.h.y -= WT.crouch * w; hips.position.copy(hips.parent.worldToLocal(cutP.h.clone())); hips.updateMatrixWorld(true);
  const sp = pl.model.getObjectByName('Spine'), bk = THREE.MathUtils.clamp((pl.brake || 0) / 8, 0, 1), side = THREE.MathUtils.clamp((pl.aLat || 0) / 8, -1, 1);
  if (sp) { ikV.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); rotW(sp, ikV, -WT.back * bk); ikV.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)); rotW(sp, ikV, -WT.side * side); sp.updateMatrixWorld(true); }
  legIK(pl, 'Left', cutP.L, cutP.qL, P); legIK(pl, 'Right', cutP.R, cutP.qR, P);
}
// Газон твёрдый: ни одна часть тела не уходит под него (падения, подкаты, прыжки вратаря, а у своей модели — и записи
// с другого скелета). Берём суставы с «толщиной» тела вокруг; если самый низкий ниже газона — вся модель сразу
// приподнимается на эту величину, потом плавно опускается обратно. Толщина у стоп — по ровной стойке (стоя подъёма нет).
const GROUND = {
  bones: [['Hips', 0.1], ['Spine2', 0.11], ['Head', 0.09], ['HeadTop_End', 0.02], ['LeftHand', 0.03], ['RightHand', 0.03], ['LeftForeArm', 0.04], ['RightForeArm', 0.04], ['LeftLeg', 0.055], ['RightLeg', 0.055]],
  // стопа, носок, кончик носка — высота сустава над газоном в ровной стойке (замер): у общей модели и у своей разная
  feet: { base: [0.105, 0.03, 0.035], own: [0.12, 0, 0] },
  slack: [0.01, 0.035, 0.04], // носок на бегу может уйти в траву на 3–4 см (его не видно в траве) — из-за этого тело не подбрасываем
  tol: 0.012, on: Q.get('gfix') !== '0',
};
const groundStat = {};
function groundFix(pl, dt, lift) {
  if (!pl.gb) { const f = GROUND.feet[pl.own ? 'own' : 'base'], ft = ['Foot', 'ToeBase', 'Toe_End'].flatMap((n, i) => [['Left' + n, f[i] - GROUND.slack[i]], ['Right' + n, f[i] - GROUND.slack[i]]]);
    pl.gb = GROUND.bones.concat(ft).map(([n, r]) => [pl.model.getObjectByName(n), r]).filter((x) => x[0]); }
  let low = 1e9, lb = null; for (const [b, r] of pl.gb) { const y = b.matrixWorld.elements[13] - r; if (y < low) { low = y; lb = b; } }
  pl.glb = lb && lb.name; const cur = pl.model.position.y, base = low + lift - cur; // самая низкая точка без подъёма (у прыжка вратаря таз уже поднят на lift)
  if (TRACE) { const k = (pl.own ? 'h:' : '') + pl.name, g = groundStat[k] || (groundStat[k] = { min: 0, n: 0, bad: 0 }); g.n++; if (base < g.min) { g.min = +base.toFixed(3); g.bone = lb.name; g.hip = +pl.hips.matrixWorld.elements[13].toFixed(2); g.vis = pl.holder.visible; g.sp = pl.loco ? +pl.loco.f.toFixed(2) : null; } if (base < -0.03) g.bad++; }
  if (!GROUND.on) return;
  // вверх — быстро (сильно ниже газона — сразу), вниз — плавно: на бегу тело не дёргается от каждого шага
  const want = Math.max(0, -base - GROUND.tol), d = want - cur;
  const y = pl.model.position.y = d > 0.12 ? want : cur + d * (1 - Math.exp(-dt * (d > 0 ? 30 : 9)));
  if (TRACE) { const g = groundStat[(pl.own ? 'h:' : '') + pl.name]; const after = base + y; if (after < (g.after ?? 0)) g.after = +after.toFixed(3); }
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
let STRIKE = null, PASS = null, STRIKE_L = null, PASS_L = null, run = null, crowdT = 0;
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, keys = {}, btn = { shot: false, sprint: false, press: false, tk: false, pd: false, second: false, rd: false, sl: false };
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
  // как в записи матча FC Mobile (пользователь, 21.10): камера дальше и ниже (≈17° над полем, было ≈31°) — круг центра в ≈4 раза
  // шире своей высоты (было в 2 раза), видна дальняя бровка; кадр чуть впереди по ходу атаки
  tv: { label: 'Трансляция', yaw: 0, side: 38, h: 12, fov: 25, lookIn: 4, lead: 5, ahead: 7, zMin: 1, near: 6, far: 8, right: 7, left: 14 },
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
  let fx = bp.x * 0.75 + a.x * 0.25, fz = bp.z * 0.75 + a.z * 0.25;
  // кадр впереди по ходу атаки того, у кого мяч (как в FC Mobile: мяч левее центра, когда атакуем вправо)
  if (C.lead && MATCH_ON) { const ot = ownerTeam(), want = ot >= 0 ? fwdZ(ot) * C.lead : 0; tvLead += (want - tvLead) * Math.min(1, lastRaw * 1.5); fz += tvLead; }
  const yaw = THREE.MathUtils.degToRad(C.yaw || 0), dx = Math.cos(yaw), dz = Math.sin(yaw);
  { const d = (bp.x - fx) * dx + (bp.z - fz) * dz, sh = d > C.near ? d - C.near : d < -C.far ? d + C.far : 0; fx += dx * sh; fz += dz * sh;
    const rx = dz, rz = -dx, l = (bp.x - fx) * rx + (bp.z - fz) * rz, lim = 7, sl = l > lim ? l - lim : l < -lim ? l + lim : 0; fx += rx * sl; fz += rz * sl; }
  const tx = Math.max(-MATCH.HW + 6, Math.min(MATCH.HW - 6, fx)), tz = Math.max(5, Math.min(MATCH.L - 5, fz));
  // пружина с критическим затуханием: камера плавно разгоняется и плавно тормозит (без рывка, когда пас или смена игрока
  // резко сдвигают цель), и не отстаёт навсегда, как простое сглаживание
  if (snap) { tvFocus.set(tx, 0, tz); tvVel.set(0, 0, 0); } else {
    const w = 3.2, dt = Math.min(lastRaw, 0.05), ex = tvFocus.x - tx, ez = tvFocus.z - tz;
    tvVel.x += (-w * w * ex - 2 * w * tvVel.x) * dt; tvVel.z += (-w * w * ez - 2 * w * tvVel.z) * dt;
    const vmax = 22; const vl = Math.hypot(tvVel.x, tvVel.z); if (vl > vmax) { tvVel.x *= vmax / vl; tvVel.z *= vmax / vl; }
    tvFocus.x += tvVel.x * dt; tvFocus.z += tvVel.z * dt;
  }
  out.p.set(tvFocus.x + C.side * dx, C.h, tvFocus.z + C.side * dz); out.l.set(tvFocus.x + (C.lookIn || 0) * dx, 0.6, tvFocus.z + (C.lookIn || 0) * dz);
}
const tvVel = new THREE.Vector3();
let tvLead = 0;
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
// Полоска силы удара под ногами (как в FC Mobile): растёт, пока держишь «Удар», цвет — зелёный → жёлтый → оранжевый →
// красный (полная, мяч уходит высоко). После удара ещё ~1 с показывает выбранную силу. Лежит на газоне поперёк экрана.
let pbar = null;
const PBAR_W = 1.25, pbarColor = (p) => (p < 0.3 ? '#4cd964' : p < 0.6 ? '#ffd23f' : p < 0.92 ? '#ff9a2e' : '#ff4f5e');
function powerBarTick() {
  if (!FREE() || !run || !shooter) { if (pbar) pbar.visible = false; return; }
  if (!pbar) {
    pbar = new THREE.Group(); const mk = (c, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.17), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; pbar.add(m); return m; };
    pbar.userData.bg = mk('#101418', 0.55); pbar.userData.fg = mk('#4cd964', 0.95); pbar.userData.bg.scale.x = PBAR_W; scene.add(pbar);
    pbar.userData.ticks = [1, 2, 3].map((k) => { const t = mk('#5b6570', 0.9); t.scale.set(0.03, 0.6, 1); t.position.x = (k / 4 - 0.5) * PBAR_W; t.position.y = 0.002; return t; }); // деления — как у полоски паса в FC Mobile
  }
  const passing = passIn.down >= 0 && !gkMine() && (owning() && B.owner === 'me' || recvSoon()); // держу «Пас» — та же полоска
  const charging = run.charge >= 0, show = charging || passing || simT < (run.barUntil || 0);
  pbar.visible = show; if (!show) return;
  const p = charging ? chargePw() : passing ? passPw((performance.now() - passIn.down) / 1000) : run.barPw || 0; if (charging || passing) { run.barPw = p; run.barPass = passing; run.barPl = shooter; }
  // пас — зелёная полоска с делениями (FC Mobile); удар — цвет по силе. После паса полоска остаётся под пасующим, а не
  // переезжает к получателю
  const isPass = passing || (!charging && run.barPass), pl = (!charging && !passing && run.barPl) || shooter;
  const fg = pbar.userData.fg; fg.scale.x = Math.max(0.02, p) * PBAR_W; fg.position.x = -(1 - p) * PBAR_W / 2; fg.material.color.set(isPass ? '#3ee05a' : pbarColor(p));
  pbar.userData.ticks.forEach((t) => (t.visible = isPass));
  // поперёк экрана, чуть ближе к камере, чем ступни
  cam.getWorldDirection(tmpC); tmpC.y = 0; tmpC.normalize();
  pbar.position.set(pl.holder.position.x - tmpC.x * 0.45, 0.035, pl.holder.position.z - tmpC.z * 0.45); pbar.rotation.y = Math.atan2(-tmpC.x, -tmpC.z); // длинная сторона — вправо по экрану
}
function markerTick() {
  if (!marker) { marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.57, 48), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2; marker.renderOrder = 1; scene.add(marker); }
  if (!marker.userData.tri) { // небольшой треугольник над головой активного игрока (как в мобильном футболе)
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 3), new THREE.MeshBasicMaterial({ color: '#3fe0a8' })); t.rotation.x = Math.PI; scene.add(t); marker.userData.tri = t; }
  if (!marker.userData.arrow) { // белая «галочка» на газоне перед игроком — куда он бежит / куда джойстик (FC Mobile)
    const sh = new THREE.Shape(); sh.moveTo(0, 0.42); sh.lineTo(0.36, -0.12); sh.lineTo(0, 0.02); sh.lineTo(-0.36, -0.12); sh.closePath();
    const ar = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false }));
    ar.rotation.order = 'YXZ'; ar.renderOrder = 2; scene.add(ar); marker.userData.arrow = ar; marker.userData.ay = 0; }
  const on = TEAM() && !!run && !!run.mate; marker.visible = on && !MATCH_ON; marker.userData.tri.visible = on; // в матче кольца нет — как в FC Mobile
  if (on) marker.userData.tri.position.set(shooter.hips.getWorldPosition(tmpC).x, 2.35, tmpC.z);
  const sb = $('#b-swap'); if (sb) sb.classList.toggle('off', on && ownBall());
  if (marker.visible) marker.position.set(shooter.holder.position.x, 0.03, shooter.holder.position.z);
  const ar = marker.userData.arrow, P = run && run.P;
  if (ar) { ar.visible = on && MATCH_ON && state === 'play';
    if (ar.visible) { const i = input(), il = Math.hypot(i.x, i.y), vs = Math.hypot(P.v.x, P.v.z);
      const want = il > 0.25 ? Math.atan2(i.x, -i.y) : vs > 0.5 ? Math.atan2(P.v.x, P.v.z) : P.yaw;
      let d = want - marker.userData.ay; d = Math.atan2(Math.sin(d), Math.cos(d)); marker.userData.ay += d * Math.min(1, lastRaw * 14);
      const ay = marker.userData.ay, hp = shooter.holder.position; ar.position.set(hp.x + Math.sin(ay) * 1.15, 0.04, hp.z + Math.cos(ay) * 1.15); ar.rotation.set(-Math.PI / 2, ay + Math.PI, 0); } } // форма лежит носом к −z: поворот на 180° — носом по ходу
  powerBarTick(); tapFxTick(Math.min(0.1, lastRaw));
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
zone.addEventListener('pointerup', joyEnd); zone.addEventListener('pointercancel', joyEnd); zone.addEventListener('lostpointercapture', joyEnd);
// окно потеряло фокус (звонок, шторка) — джойстик отпускается, как и кнопки (controls.js): ничего не залипает
const joyDrop = () => { if (joy.id !== null) joyEnd({ pointerId: joy.id }); if (swp) { swp = null; strail.classList.remove('on'); } };
addEventListener('blur', joyDrop); document.addEventListener('visibilitychange', () => { if (document.hidden) joyDrop(); });
const hintOff = () => { if (FREE()) $('#hint').style.opacity = 0; };
// сила удара — кольцо вокруг кнопки «Удар»
const ringFg = $('#ringFg');
function setPower(p) { ringFg.style.strokeDashoffset = 100 - p * 100; ringFg.style.stroke = p > 0.92 ? '#ff4f5e' : ''; }
// Кнопки с жестами (controls.js). Направления — по экрану, как у джойстика, и не зависят от ракурса камеры.
// «Удар»: держишь — сила, отпустил — удар; оттянул палец влево/вправо — подкрутка в эту сторону, вверх — переброс.
gestureButton($('#b-shot'), {
  onDown: () => { if (matchDef()) { btn.tk = true; if (slideOk()) trySlide(actorOf('me')); return; } btn.tk = false; startCharge('drive'); }, // оборона (матч) — «Подкат», как в FC Mobile
  // жесты одинаковые при любой камере: влево/вправо — подкрутка (мяч уходит в эту сторону от бьющего), вверх — переброс.
  // Мяч у соперника (матч) — эта же кнопка «Отбор»: короткое нажатие — попытка выбить мяч.
  onGesture: (dir) => { if (btn.tk || !run || run.charge < 0) return;
    if (dir === 'left' || dir === 'right') { run.kind = 'curl'; run.side = dir === 'left' ? 1 : -1; } else if (dir === 'up') { run.kind = 'chip'; run.side = 0; }
    else if (dir === 'down') { run.kind = 'curl'; run.side = 0; } // вниз — подкрутка в дальний угол (как finesse в FC Mobile)
    shotBadge(); },
  onUp: (mode, held, cancel) => { if (btn.tk) { btn.tk = false; return; } if (cancel) cancelCharge(); else releaseCharge(); },
});
// «Пас»: коротко — в ноги (или на ход, если партнёр бежит), удержание — сильнее, вверх — верховая; мяч у партнёра — просьба вернуть
gestureButton($('#b-pass'), {
  // мяч у соперника (матч) — «Прессинг»: пока держишь, игрок сам идёт к владельцу мяча
  onDown: () => { if (matchDef()) { btn.pd = true; swapManual(); return; } btn.pd = false; passDown(); }, // оборона — «Смена»
  onGesture: (dir) => { const el = $('#pass-g'); if (el) el.textContent = dir === 'up' && passIn.down >= 0 ? '⌒ верхом' : ''; },
  onUp: (mode, held, cancel) => { if (btn.pd) { btn.pd = false; return; } const el = $('#pass-g'); if (el) el.textContent = ''; if (cancel) { passIn.down = -1; return; } passUp(mode === 'up' ? 'lofted' : 'ground'); },
});
// «Рывок»: держишь без жеста — ускорение; короткий резкий жест — финт (один раз за жест)
gestureButton($('#b-run'), {
  threshold: 30, flick: 0.28,
  // оборона (матч) — «Рывок и отбор»: держишь — рывок (без джойстика — сам идёт к владельцу мяча), короткое нажатие — отбор
  onDown: () => { btn.sprint = true; btn.rd = matchDef(); if (btn.rd) btn.press = true; },
  onGesture: (dir, quick) => { if (!btn.rd) feint(dir, !quick); }, // быстрый жест — финт, медленный (придержал и повёл) — второй набор
  onUp: (mode, held, cancel) => { btn.sprint = false; btn.press = false; if (btn.rd && !cancel && held < 0.25 && matchDef()) tryTackle(actorOf('me')); btn.rd = false; },
});
// «На ход»: коротко — низом в свободную зону перед партнёром; зажал и потянул вверх — верхом, вразрез (за спину защитникам)
// мяч у соперника (матч, своя модель) — эта же кнопка «Подкат»
gestureButton($('#b-thru'), {
  onDown: () => { btn.sl = matchDef(); if (btn.sl) btn.second = true; }, // оборона — «2-й защитник»: пока держишь, ближайший партнёр давит на владельца
  onGesture: (dir) => { if (btn.sl) return; const el = $('#thru-g'); if (el) el.textContent = dir === 'up' ? '⌒ верхом' : ''; },
  onUp: (mode, held, cancel) => { if (btn.sl) { btn.sl = false; btn.second = false; return; } const el = $('#thru-g'); if (el) el.textContent = ''; if (!cancel) throughPass(mode === 'up'); },
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
  return screenToField(x, y);
}
// направление на экране (x — вправо, y — вверх) → в осях поля (y — «к воротам», −z): одинаково при любой камере
function screenToField(x, y) {
  if (TV()) { // вправо по экрану — вправо на экране при любой камере: переводим в оси поля (y — «к воротам» = −z)
    cam.getWorldDirection(camF); camF.y = 0; camF.normalize(); const rx = -camF.z, rz = camF.x, wx = x * rx + y * camF.x, wz = x * rz + y * camF.z;
    return { x: wx, y: -wz };
  }
  return { x, y };
}
const camF = new THREE.Vector3();
// Удар свайпом по полю (матч): провёл пальцем по свободной правой части экрана в сторону ворот — удар туда.
// Направление — по свайпу (как у джойстика: одинаково при любой камере), сила — по длине свайпа (короткий — слабый и
// низом, длинный — сильный и выше). На экране остаётся след свайпа. Мяч ещё в пути ко мне — удар сразу после касания.
const szone = $('#szone'), strail = Object.assign(document.createElement('div'), { className: 'strail' }); document.body.appendChild(strail);
let swp = null;
const trail = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; strail.style.width = Math.hypot(dx, dy) + 'px'; strail.style.transform = `translate(${x0}px, ${y0}px) rotate(${Math.atan2(dy, dx)}rad)`; strail.classList.add('on'); };
if (szone) {
  szone.addEventListener('pointerdown', (e) => { if (!MATCH_ON || !run || state !== 'play' || swp) return; e.preventDefault(); swp = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; try { szone.setPointerCapture(e.pointerId); } catch (er) { /* без захвата */ } });
  szone.addEventListener('pointermove', (e) => { if (swp && e.pointerId === swp.id && Math.hypot(e.clientX - swp.x, e.clientY - swp.y) > 12) trail(swp.x, swp.y, e.clientX, e.clientY); });
  const swEnd = (e, cancel) => { if (!swp || e.pointerId !== swp.id) return; const s0 = swp; swp = null; strail.classList.remove('on'); if (cancel) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y, L = Math.hypot(dx, dy), dt = (performance.now() - s0.t) / 1000;
    if (L < 14 && dt < 0.35) { tapPass(e.clientX, e.clientY); return; } // короткий тап — пас туда (урок FC Mobile, 1:44–1:57)
    if (L < 45 || dt > 0.9) return;
    gestureShot(dx / L, -dy / L, Math.min(1, Math.max(0.15, L / (0.6 * Math.min(innerWidth, innerHeight))))); };
  szone.addEventListener('pointerup', (e) => swEnd(e, false)); szone.addEventListener('pointercancel', (e) => swEnd(e, true));
}
// Тап по полю (урок FC Mobile, 1:44 и 1:50): по партнёру — пас ему в ноги; в свободное место — пас на ход в эту точку
// тому партнёру, кто к ней ближе. На газоне — расходящиеся круги в точке тапа.
const tapRay = new THREE.Raycaster(), tapNdc = new THREE.Vector2(), tapFx = [];
function tapPass(cx, cy) {
  if (!MATCH_ON || !run || state !== 'play' || run.strike || run.pass || run.charge >= 0 || run.feint) return;
  const own = B.state === 'owned' && B.owner === 'me'; if (!own && !recvSoon(true)) return;
  const r = ren.domElement.getBoundingClientRect(); tapNdc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); tapRay.setFromCamera(tapNdc, cam);
  const o = tapRay.ray.origin, d = tapRay.ray.direction; if (d.y > -1e-3) return; const k = -o.y / d.y, px = o.x + d.x * k, pz = o.z + d.z * k;
  const me = actorOf('me'), from = me.P; let feet = null, fd = 2.6, near = null, nd = 15;
  for (const a of actors()) { if (a.team !== 0 || a.id === 'me') continue; const dd = Math.hypot(a.P.p.x - px, a.P.p.z - pz); if (dd < fd) { fd = dd; feet = a; } if (dd < nd) { nd = dd; near = a; } }
  const to = feet || near; if (!to) return;
  const at = feet ? null : { x: clampX(px, 1.5), z: clampZ(pz, 1.5) }, dist = Math.hypot((at ? at.x : to.P.p.x) - from.p.x, (at ? at.z : to.P.p.z) - from.p.z), pw = Math.max(0, Math.min(1, (dist - 12) / 18));
  tapFx.push({ x: at ? at.x : to.P.p.x, z: at ? at.z : to.P.p.z, t: 0 });
  if (TRACE) console.log('tapPass', JSON.stringify({ to: to.id, feet: !!feet, at, pw: +pw.toFixed(2) }));
  if (!own) { run.queue = { kind: 'pass', power: pw, k: 'ground', recv: to, at, t: simT, flight: true }; return; }
  if (startPass(from, 'me', shooter, pw, 'ground') && run.pass) { run.pass.recv = to; run.pass.at = at; }
  hintOff();
}
function tapFxTick(dt) {
  for (let i = tapFx.length - 1; i >= 0; i--) {
    const f = tapFx[i]; f.t += dt;
    if (!f.m) { f.m = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.9, depthWrite: false })); f.m.rotation.x = -Math.PI / 2; f.m.renderOrder = 2; scene.add(f.m); }
    const u = f.t / 0.7; f.m.position.set(f.x, 0.04, f.z); f.m.scale.setScalar(1 + u * 1.6); f.m.material.opacity = 0.9 * (1 - u);
    if (u >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); tapFx.splice(i, 1); }
  }
}
// куда указывает свайп: продлеваем его от игрока на экране до линии ворот на экране — там и цель удара
// (на экране углы к левой и правой штанге отличаются на несколько градусов — по одному направлению прицел не попадал)
function gestureAim(sx, sy, fallback) {
  const r = ren.domElement.getBoundingClientRect(), pr = (x, y, z) => { const v = tmpC.set(x, y, z).project(cam); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; }; // в пикселях экрана
  const P0 = pr(run.P.p.x, 0, run.P.p.z), A = pr(-10, 1, 0), Bq = pr(10, 1, 0), d = [sx, -sy], e = [Bq[0] - A[0], Bq[1] - A[1]], den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-6) return fallback;
  const w0 = [A[0] - P0[0], A[1] - P0[1]], t = (w0[0] * e[1] - w0[1] * e[0]) / den, u = (w0[0] * d[1] - w0[1] * d[0]) / den;
  if (t <= 0) return fallback;
  // точка на экране → метры на линии ворот: из-за перспективы середина отрезка на экране — не середина ворот, ищем делением
  const ee = e[0] * e[0] + e[1] * e[1], uOf = (x) => { const q = pr(x, 1, 0); return ((q[0] - A[0]) * e[0] + (q[1] - A[1]) * e[1]) / ee; };
  let lo = -10, hi = 10; for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (uOf(mid) < u) lo = mid; else hi = mid; }
  const tx = Math.max(-1.6 * GW, Math.min(1.6 * GW, (lo + hi) / 2)), an = (tx / GW) * BP.CFG.shot.stickAngle;
  if (TRACE) run.gestTx = tx;
  return { x: Math.sin(an), y: Math.cos(an) };
}
function gestureShot(sx, sy, pw) {
  if (!MATCH_ON || !run || state !== 'play' || run.strike || run.pass || run.charge >= 0) return;
  let aim = screenToField(sx, sy); if (aim.y < 0.2) return; // свайп не в сторону ворот — не удар
  aim = gestureAim(sx, sy, aim);
  run.barPw = pw; run.barUntil = simT + 1.1; run.barPass = false; run.barPl = shooter;
  if (TRACE) { run.pressT = simT; console.log('shotPress', JSON.stringify({ t: +simT.toFixed(3), gesture: true, pw: +pw.toFixed(2) })); }
  if (B.state === 'owned' && B.owner === 'me') doStrike(pw, 'drive', 0, aim);
  else if (recvSoon()) run.queue = { kind: 'strike', pw, k: 'drive', side: 0, aim, t: simT };
}
// держишь «Удар» — копится сила (кольцо), отпустил — удар; жест на кнопке выбирает подкрутку или переброс.
// Копить можно только с мячом у ноги; во время удара второе нажатие ничего не делает.
// kind: 'drive' — обычный удар, 'curl' — подкрутка (side: +1 влево, −1 вправо), 'chip' — переброс
function startCharge(kind = 'drive') {
  if (kind === true) kind = 'curl'; else if (kind === false) kind = 'drive';
  if (!FREE() || state !== 'play' || !run || run.charge >= 0 || run.strike || run.pass || run.feint || ((B.state !== 'owned' || B.owner !== 'me') && !recvSoon())) return;
  run.charge = performance.now(); run.kind = kind; run.side = 0; setPower(0); $('#ring').classList.add('on'); hintOff(); shotBadge();
  if (TRACE) { run.pressT = simT; console.log('shotPress', JSON.stringify({ t: +simT.toFixed(3), owned: B.state === 'owned' && B.owner === 'me' })); }
}
function cancelCharge() { if (!run || run.charge < 0) return; run.charge = -1; $('#ring').classList.remove('on'); shotBadge(true); }
// на кнопке «Удар» — компактная подпись выбранного удара (на поле ничего не рисуем)
function shotBadge(clear) { const el = $('#shot-g'); if (!el) return; el.textContent = clear || !run || run.charge < 0 ? '' : run.kind === 'curl' ? (run.side > 0 ? '↶ крутить' : run.side < 0 ? 'крутить ↷' : 'крутить') : run.kind === 'chip' ? '⌒ переброс' : ''; }
const chargePw = () => Math.min(1, (performance.now() - run.charge) / 600); // сила копится по настоящему времени: 0,6 с — полная (как полоска в FC Mobile, ≈0,5 с)
function releaseCharge() {
  if (!run || run.charge < 0) return;
  const pw = chargePw(); run.charge = -1; $('#ring').classList.remove('on'); shotBadge(true); run.barPw = pw; run.barUntil = simT + 1.1; run.barPass = false; run.barPl = shooter;
  if (state !== 'play') return;
  if ((B.state !== 'owned' || B.owner !== 'me') && recvSoon()) { run.queue = { kind: 'strike', pw, k: run.kind || 'drive', side: run.side || 0, t: simT }; return; } // мяч ещё в пути — удар сразу после касания
  if (B.state !== 'owned' || B.owner !== 'me') return;
  doStrike(pw, run.kind || 'drive', run.side || 0);
}
// замах начинается сразу; мяч остаётся под контролем до касания ноги, импульс — один раз в момент касания (runPhys)
function doStrike(pw, kind, side, aim = input()) {
  const S = strikeOf(shooter, leftNow()); run.strike = { pw, kind, side, aim, cmdT: simT, S }; B.state = 'strike'; B.strikeAt = S.at;
  play(shooter, 'strike', { t: Math.max(0, S.tc - 0.3), fade: shooter.own ? 0 : 0.1, speed: 1.25, follow: true, mirror: isL(S) }); // своя модель — без перехода: при смешивании таз проваливался, тело подбрасывало
}
// мяч вот-вот будет мой (пас мне в пути или бегу к свободному мячу, он рядом): нажатие «Пас»/«Удар» запоминается
// и выполняется сразу после касания (один раз; старше 0,7 с — забывается)
// far — для паса: пока пас летит ко мне, нажатие ждёт касания на любом расстоянии (пас в одно касание)
function recvSoon(far = false) {
  if (!MATCH_ON || !run || state !== 'play' || B.state !== 'free') return false;
  const me = actorOf('me'), pt = passInFlight(); if (!me) return false;
  if (far && pt && pt.id === me.pl) return true;
  return ((pt && pt.id === me.pl) || run.chase) && Math.hypot(B.p.x - me.P.p.x, B.p.z - me.P.p.z) < 5;
}
const queueLife = (q) => (q.flight ? 2.5 : 0.7);
const oneTouchQ = () => run.queue && run.queue.kind === 'pass' && B.p.y < 0.5 && simT - run.queue.t <= queueLife(run.queue) && !run.strike && !run.pass;
function runQueue() {
  const q = run.queue; run.queue = null; if (!q || simT - q.t > queueLife(q) || B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass) return;
  if (q.kind === 'pass' && MATCH_ON && !ballAtFoot()) { q.settle = true; q.flight = false; q.t = simT; run.queue = q; return; } // мяч после приёма ещё не у ноги — пас, как только дойдёт
  if (q.kind === 'strike') doStrike(q.pw, q.k, q.side, q.aim || input());
  else if (q.kind === 'pass' && startPass(run.P, 'me', shooter, q.power, q.k) && run.pass) { run.pass.recv = q.recv && q.recv.id !== 'me' ? q.recv : pickReceiver(run.P, input(), false, true, q.power); run.pass.at = q.at || null; }
}
function fireStrike() {
  const s = run.strike, P = run.P; run.strike = null;
  const pw = MATCH_ON ? (s.pw > 0.92 ? s.pw : Math.min(0.92, s.pw * (shooter.shotK || 1))) : s.pw; // матч: «удар» карточки чуть добавляет силы
  const sv0 = BP.shotVelocity(B, P, s.aim, pw, s.kind, goalDef(), s.side), ob = MATCH_ON ? offBalance(P, sv0) : 0;
  const sv = spreadShot(sv0, (MATCH_ON ? shooter.shotErr || 0 : 0) + 0.07 * ob);
  if (MATCH_ON) MT.kicker = shooter;
  const cpT = BP.controlPoint(P, B), dC = Math.hypot(B.p.x - cpT.x, B.p.z - cpT.z);
  const okShot = BP.applyShot(B, sv, cpT, 'me', simT);
  if (TRACE) { const cr = okShot ? BP.predict(B.p, B.v, B.w, 0) : null; console.log('shotEv', JSON.stringify({ t: +simT.toFixed(3), sinceCmd: +(simT - (s.cmdT ?? simT)).toFixed(3), sincePress: +(simT - (run.pressT ?? simT)).toFixed(3), ok: okShot, dContact: +dC.toFixed(3), kind: s.kind, side: s.side, pw: +s.pw.toFixed(2), aim: [+s.aim.x.toFixed(2), +s.aim.y.toFixed(2)], ob: +ob.toFixed(2),
    speed: +sv.speed.toFixed(1), v: [+sv.v.x.toFixed(1), +sv.v.y.toFixed(1), +sv.v.z.toFixed(1)], w: [+sv.w.x.toFixed(1), +sv.w.y.toFixed(1), +sv.w.z.toFixed(1)], from: [+B.p.x.toFixed(1), +B.p.z.toFixed(1)], psp: +Math.hypot(P.v.x, P.v.z).toFixed(1), yaw: +P.yaw.toFixed(2),
    cross: cr ? [+cr.p.x.toFixed(2), +cr.p.y.toFixed(2), +cr.t.toFixed(2)] : null })); }
  if (okShot) {
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
  if (TRACE) console.log('passBtn', JSON.stringify({ e: 'down', t: +simT.toFixed(2), bs: B.state, ow: B.owner, strike: !!run.strike, pass: !!run.pass, charge: run.charge >= 0, soon: recvSoon(true) }));
  if (run.strike || run.pass || run.charge >= 0) return;
  if ((B.state !== 'owned' || B.owner !== 'me') && !recvSoon(true)) return;
  passIn.down = performance.now(); hintOff();
}
// «На ход»: пас в свободную зону перед партнёром — по ходу его движения
function throughPass(loft = false) {
  if (!TEAM() || state !== 'play' || !run || !run.mate) return;
  if (B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.charge >= 0) return;
  startPass(run.P, 'me', shooter, 0.35, 'through'); if (loft && run.pass) run.pass.loft = true; hintOff();
}
// Сила паса — как в уроке FC Mobile (0:48, 0:59–1:01): пока держишь «Пас», под игроком растёт полоска; отпустил — пас.
// Короткое нажатие — короткий пас, дольше — сильнее и дальше (к дальним партнёрам). Полная сила — за 0,7 с удержания.
const PASS_TAP = 0.12, PASS_FULL = 0.7;
const passPw = (held) => Math.max(0, Math.min(1, (held - PASS_TAP) / (PASS_FULL - PASS_TAP)));
function passUp(kind = 'ground') {
  if (TRACE) console.log('passBtn', JSON.stringify({ e: 'up', t: +simT.toFixed(2), down: passIn.down >= 0, bs: B.state, ow: B.owner, pass: !!run.pass }));
  if (passIn.down < 0) return; const held = (performance.now() - passIn.down) / 1000; passIn.down = -1;
  if (gkMine()) { MT.gkCmd = { kind, inp: input() }; return; } // команда нашему вратарю
  const pw = passPw(held); if (run) { run.barPw = pw; run.barUntil = simT + 0.9; run.barPass = true; run.barPl = shooter; }
  // адресат выбирается в момент отпускания (джойстик + сила) и дальше не меняется
  const recv = MATCH_ON && run ? pickReceiver(run.P, input(), false, true, pw) : null;
  if (MATCH_ON && (B.state !== 'owned' || B.owner !== 'me')) { if (recvSoon(true)) run.queue = { kind: 'pass', power: pw, k: kind, recv, t: simT, flight: !!(passInFlight() && passInFlight().id === shooter) }; return; }
  if (MATCH_ON && B.touchFirst && !ballAtFoot()) { run.queue = { kind: 'pass', power: pw, k: kind, recv, t: simT, settle: true }; return; } // мяч ещё подкатывается к ноге — пас, как только дойдёт
  if (startPass(run.P, 'me', shooter, pw, kind) && recv && run.pass) run.pass.recv = recv;
}
const ballAtFoot = () => { const cp = BP.controlPoint(run.P, null); return Math.hypot(B.p.x - cp.x, B.p.z - cp.z) <= BP.CFG.shot.contactR - 0.05; };
function startPass(P, who, pl, power, kind, quick = false) { // замах сразу; направление и сила — в момент касания (firePass)
  if (state !== 'play' || B.state !== 'owned' || B.owner !== who) return false;
  const job = { power, kind };
  if (who === 'me') { if (run.strike || run.pass) return false; run.pass = job; } else (MATCH_ON ? actorOf(who).ai : run.mate).pass = job;
  const S = passOf(pl, leftNow()); job.S = S;
  B.state = 'strike'; B.strikeAt = S.at;
  play(pl, 'pass', { t: Math.max(0, S.tc - (quick ? 0.08 : 0.24)), fade: quick ? 0.04 : 0.08, speed: 1.15, follow: true, mirror: isL(S) }); // quick — в одно касание: нога уже в замахе
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
  const tgt = job.at ? new THREE.Vector3(job.at.x, 0, job.at.z) : passTarget(recv, job.kind, job.power, MATCH_ON ? attackZ(teamOf(who)) : 0, !!job.loft);
  if (MATCH_ON && job.kind === 'lofted') { const tm = teamOf(who); if (depthOf(tm, tgt.z) < 18 && Math.abs(tgt.x) < 20) { const dx = tgt.x - B.p.x, dz = tgt.z - B.p.z, dl = Math.hypot(dx, dz) || 1; tgt.x += (dx / dl) * 2.3; tgt.z += (dz / dl) * 2.3; job.cross = true; } }
  const pa = MATCH_ON && actorOf(who), pe = pa ? pa.pl.passErr || 0 : 0; // точность паса — по карточке
  const pv = spreadShot(BP.passVelocity(B, tgt, job.kind === 'lofted' || job.loft ? 'lofted' : 'ground', job.power), pe, pe * 0.6);
  if (BP.applyShot(B, pv, BP.controlPoint(P, B), who, simT)) { B.inGoal = false; B.goal = false; B.netHit = false; if (MATCH_ON) { statPass(teamOf(who)); markOffside(who); } if (who === 'me' && TEAM()) run.swapNow = true; sfx.kick(0.1 + job.power * 0.25); run.lastPass = { who, t: simT, tgt };
    if (MATCH_ON) { const ra = actors().find((q) => q.P === recv); run.passTo = ra ? { id: ra.pl, team: ra.team, t: simT, tgt: { x: tgt.x, z: tgt.z } } : null; if (TRACE) console.log('passEv', JSON.stringify({ who, to: ra && ra.id, d: +Math.hypot(tgt.x - B.p.x, tgt.z - B.p.z).toFixed(1), v: +pv.speed.toFixed(1), kind: job.kind, ball: [+B.p.x.toFixed(1), +B.p.z.toFixed(1)], bv: [+B.v.x.toFixed(1), +B.v.z.toFixed(1)], tgt: [+tgt.x.toFixed(1), +tgt.z.toFixed(1)], rp: ra ? [+ra.P.p.x.toFixed(1), +ra.P.p.z.toFixed(1), +ra.P.v.x.toFixed(1), +ra.P.v.z.toFixed(1)] : null, flip: worldFlipped })); } if (LESSON === 'basics' && who === 'me') LS.passT = simT; return true; }
  sfx.touch(); return false; // нога не достала — мяч свободен
}
// Смена управления: управляемый и бот меняются ролями ('me' — всегда тот, кем управляю). Владельца мяча не меняет:
// мяч остаётся у того, у кого был (метки 'me'/'mate' на мяче меняются местами вместе с ролями).
// Заряд удара, начатый пас и финт не переходят к другому игроку; удерживаемый джойстик и рывок продолжают работать.
function swapControl(toId = 'mate') {
  const m = run && (toId === 'mate' ? run.mate : run.allies && run.allies.find((x) => x.id === toId)); if (!m) return false;
  cancelCharge(); passIn.down = -1; const pg = $('#pass-g'); if (pg) pg.textContent = '';
  if (run.feint) run.P.drive = null; run.feint = null; B.feintOff = null; run.strike = null; run.pass = null; run.fire = false; run.passFire = false;
  const oP = run.P, oPl = shooter; run.P = m.P; shooter = m.pl; m.P = oP; m.pl = oPl;
  // место в расстановке остаётся у игрока, а не у «слота»: иначе бывший пасующий получал место получателя и бежал на него
  if (MATCH_ON && run.meAI && m.hxy && run.meAI.hxy) { const h = run.meAI.hxy; run.meAI.hxy = m.hxy; m.hxy = h; }
  const id = m.id || 'mate', sw = (v) => (v === 'me' ? id : v === id ? 'me' : v); B.owner = sw(B.owner); B.lockOwner = sw(B.lockOwner);
  shooter.sph.forEach((q) => (q.who = 'me')); m.pl.sph.forEach((q) => (q.who = id));
  m.P.charging = false; m.pass = null; m.fire = false; m.hold = 0; m.st = 'support'; m.plan = null; m.planT = 0; m.pick = -1; m.pickT = 0; m.strike = null; m.sfire = false;
  run.swapNow = false; run.swapTo = null; run.swapT = simT; return true;
}
// партнёр, ближе всех к мячу (для «Смены» и автосмены в матче); в «2 на 1» — единственный партнёр
function nearestAlly(exceptMe = true) {
  if (!MATCH_ON || !run.allies || !run.allies.length) return 'mate';
  let best = 'mate', bd = 1e9; for (const a of actors()) { if (a.team !== 0 || (exceptMe && a.id === 'me')) continue; const d = switchCost(a); if (d < bd) { bd = d; best = a.id; } }
  return best;
}
// Кому переключиться (как в FC): кто раньше всех успеет к мячу — к тому месту, где мяч (или владелец) будет,
// а не к тому, где он сейчас. Стоящий за мячом (мяч между ним и своими воротами) — хуже: ему разворачиваться и догонять.
// Возвращает «секунды до мяча» с поправками; меньше — лучше. dir — джойстик (в осях поля): кто в ту сторону — лучше.
function switchCost(a, dir = null) {
  const ow = owning() ? actorOf(B.owner) : null, O = ow ? ow.P : null, P = a.P, sp = BP.CFG.player.sprint * (a.pl.spd || 1);
  let t = 3;
  for (let k = 0; k <= 30; k++) { // на 3 с вперёд, шаг 0,1 с
    const tt = k * 0.1, decay = Math.max(0, 1 - tt * 0.25);
    const x = O ? O.p.x + O.v.x * tt : B.p.x + B.v.x * tt * decay, z = O ? O.p.z + O.v.z * tt : B.p.z + B.v.z * tt * decay;
    if (Math.hypot(x - P.p.x, z - P.p.z) / sp + 0.2 <= tt) { t = tt; break; }
  }
  if (t >= 3) t = 3 + Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) / sp;
  const goalSide = (P.p.z - B.p.z) * -fwdZ(a.team) > -1; // наша команда защищает ворота z = L: «у своих ворот» — дальше по z, чем мяч
  if (!goalSide) t += 0.6;
  if (dir) { const dx = P.p.x - B.p.x, dz = P.p.z - B.p.z, dl = Math.hypot(dx, dz) || 1, c = (dx * dir.x + dz * dir.z) / dl; t -= c * 0.8; }
  return t;
}
// кому пас: партнёр в направлении джойстика (без джойстика — куда смотрит корпус). Дальность — по силе (как в уроке
// FC Mobile: «держи Pass, чтобы достать партнёров дальше»): короткое нажатие — ближний (~10 м), полная сила — до ~30 м.
// Линия паса, перекрытая соперником, — хуже.
function pickReceiver(from, inp, withMe = false, withGK = false, pw = 0) {
  const A = actors().filter((a) => a.team === 0 && (withMe || a.id !== 'me'));
  if (withGK && MATCH_ON && GK[1]) { const k = GK[1].pl.holder.position; if (Math.hypot(k.x - from.p.x, k.z - from.p.z) < 45) A.push({ id: 'gk2', team: 0, P: { p: k, v: { x: 0, z: 0 } } }); } // пас назад своему вратарю
  if (A.length <= 1) return A[0];
  const il = inp ? Math.hypot(inp.x, inp.y) : 0, dx = il > 0.3 ? inp.x / il : Math.sin(from.yaw), dz = il > 0.3 ? -inp.y / il : Math.cos(from.yaw);
  let best = A[0], bs = -1e9;
  const want = 10 + 20 * pw, opp = MATCH_ON ? actors().filter((o) => o.team === 1) : [];
  for (const a of A) {
    const x = a.P.p.x - from.p.x, z = a.P.p.z - from.p.z, d = Math.hypot(x, z) || 1, c = (x * dx + z * dz) / d;
    let sc = c * 3 - Math.max(0, d - want) / 8 - Math.max(0, want - 6 - d) / 20 - (d < 4 ? 2 : 0);
    for (const o of opp) { const ox = o.P.p.x - from.p.x, oz = o.P.p.z - from.p.z, t = (ox * x + oz * z) / (d * d); if (t < 0.12 || t > 0.95) continue; if (Math.hypot(ox - x * t, oz - z * t) < 1.3) { sc -= 1.2; break; } }
    if (sc > bs) { bs = sc; best = a; }
  }
  return best;
}
const ownBall = () => (B.state === 'owned' || B.state === 'strike') && B.owner === 'me';
// «Смена» — когда мяч не у меня (с мячом — отдать пас); кнопка в это время приглушена
function swapManual() {
  if (!(TEAM() && state === 'play' && run && run.mate && !run.strike && !run.pass && B.state !== 'strike' && !ownBall())) return;
  if (!MATCH_ON || !run.allies || !run.allies.length) { swapControl(nearestAlly()); sfx.touch(); return; }
  // джойстик зажат — в его сторону (от мяча), иначе — кто раньше всех к мячу
  const i = input(), il = Math.hypot(i.x, i.y), dir = il > 0.4 ? { x: i.x / il, z: -i.y / il } : null;
  let best = null, bc = 1e9; for (const a of actors()) { if (a.team !== 0 || a.id === 'me') continue; const c = switchCost(a, dir); if (c < bc) { bc = c; best = a.id; } }
  if (best) { swapControl(best); run.chasePlan = null; run.swapT = simT; sfx.touch(); }
}
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
//  • (матч) быстрый жест вниз — «рулетка»: оборот на 360° с мячом и продвижением вперёд (запись soccer_spin, 0,3–2,5 с);
//  • (матч) медленный жест вверх — подброс мяча носком вперёд-вверх через соперника (kick_up_soccerball), игрок бежит следом.
const FEINT = { roll: { dist: 0.75, time: 0.42, step: 3.2 }, fake: { time: 0.62, cut: 0.5 }, cut: { angle: 1.0, speed: 5.2, time: 0.42 },
  spin: { t0: 0.3, t1: 2.5, speed: 1.8, dist: 3.2 }, flick: { t0: 0.35, tk: 0.72, t1: 1.05, speed: 1.3, vf: 3.2, vy: 4.3 } };
function feint(dir, slow = false) {
  if (!FREE() || state !== 'play' || !run || B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.feint || run.charge >= 0) return;
  const P = run.P, f3 = cam.getWorldDirection(tmpA); f3.y = 0; f3.normalize();
  const rX = -f3.z, rZ = f3.x; // «вправо по экрану» на поле (как у джойстика)
  const bodyRight = (x, z) => -Math.cos(P.yaw) * x + Math.sin(P.yaw) * z; // > 0 — правая сторона игрока
  if (MATCH_ON && !slow && dir === 'down') { // рулетка
    const F = FEINT.spin, dur = (F.t1 - F.t0) / F.speed, sp = F.dist / dur;
    run.feint = { kind: 'spin', t: 0, dur, fx: Math.sin(P.yaw), fz: Math.cos(P.yaw), sp }; P.lockYaw = dur;
    play(shooter, 'soccer_spin', { t: F.t0, fade: 0.1, speed: F.speed, follow: true }); sfx.touch(); return;
  }
  if (MATCH_ON && slow && dir === 'up') { // подброс через соперника
    const F = FEINT.flick, dur = (F.t1 - F.t0) / F.speed;
    run.feint = { kind: 'flick', t: 0, dur, fx: Math.sin(P.yaw), fz: Math.cos(P.yaw), up: false }; P.lockYaw = dur;
    play(shooter, 'kick_up_soccerball', { t: F.t0, fade: 0.1, speed: F.speed, follow: true }); return;
  }
  if (slow && dir !== 'down') return; // медленный жест вниз — ложный замах (ниже), остальные медленные — просто рывок
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
  if (B.state !== 'owned' || B.owner !== 'me') { run.feint = null; B.feintOff = null; run.P.drive = null; return; } // мяч отобрали — финт прерван
  const u = Math.min(1, f.t / f.dur), P = run.P;
  if (f.kind === 'roll') { // мяч уводится стопой вбок и отпускается к ноге, когда игрок шагнул следом
    const k = Math.sin(Math.min(1, u * 1.7) * (Math.PI / 2)) * (1 - Math.max(0, (u - 0.65) / 0.35));
    B.feintOff = { x: f.dx * FEINT.roll.dist * k, z: f.dz * FEINT.roll.dist * k };
    if (!f.stepped && f.t > 0.12) { f.stepped = true; P.v.x += f.dx * FEINT.roll.step; P.v.z += f.dz * FEINT.roll.step; }
  } else if (f.kind === 'spin') { // рулетка: игрок идёт вперёд со скоростью записи, корпус крутит запись, мяч у ноги
    P.drive = { x: f.fx * f.sp, z: f.fz * f.sp };
    if (f.t >= f.dur) P.drive = null;
  } else if (f.kind === 'flick') { // подброс: в момент касания носка мяч уходит вперёд-вверх, игрок бежит следом
    const F = FEINT.flick; P.drive = { x: f.fx * 3.2, z: f.fz * 3.2 };
    if (!f.up && f.t >= (F.tk - F.t0) / F.speed) { f.up = true; const v0 = Math.max(Math.hypot(P.v.x, P.v.z), 2);
      BP.release(B, 'me', simT, 0.25, false); B.v.set(f.fx * (v0 + F.vf), F.vy, f.fz * (v0 + F.vf)); B.w.set(0, 0, 0); B.p.y = Math.max(B.p.y, R + 0.05); sfx.touch(); run.feint = null; P.drive = null; return; }
    if (f.t >= f.dur) P.drive = null;
  } else if (f.kind === 'fake') { // замах без касания, потом срез мяча в сторону
    if (!f.bit && f.t > 0.18) { f.bit = true; keeperBite(); }
    const k = Math.max(0, Math.min(1, (u - 0.5) / 0.3)) * (1 - Math.max(0, (u - 0.85) / 0.15));
    B.feintOff = { x: f.dx * FEINT.fake.cut * k, z: f.dz * FEINT.fake.cut * k };
  }
  if (f.t >= f.dur) { run.feint = null; B.feintOff = null; P.drive = null; }
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
  // удар или пас уже нажаты (ждут касания) — джойстик сейчас прицел, а не отказ от приёма: к мячу выходит автоматика
  if (run.queue || run.charge >= 0) inp = { x: 0, y: 0 };
  const mag = Math.hypot(inp.x, inp.y), ix = mag > 1e-3 ? inp.x / mag : 0, iz = mag > 1e-3 ? -inp.y / mag : 0, cosA = ix * ux + iz * uz;
  if (TRACE) run.chDbg = [+mag.toFixed(2), +cosA.toFixed(2), +mp.x.toFixed(1), +mp.z.toFixed(1)];
  run.chase = BP.chaseDecide(!!run.chase, mag, cosA); // явно увожу в сторону — отпускаем; отпустил или к мячу — снова веду
  if (!run.chase) return passLineAssist(P, inp);
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
    // разворот с мячом — дальше обычное ведение: мяч сразу идёт за ногой (раньше катился сам медленнее игрока, и тот,
    // разогнавшись, убегал от мяча — потеря на ровном месте)
    B.touchFirst = false; B.trapT = 1; BP.touch(B, P);
  }
  // принял в ход и сразу резко повёл в сторону (больше ~50° от того, куда катится мяч), мяч ещё рядом — нога вторым
  // касанием переводит мяч в новую сторону (раньше мяч катился по старому ходу, а игрок с весом разворачивался и
  // отставал — мяч уходил на 1,2–1,3 м, удар ждал, пока игрок его догонит)
  else if (!B.touchSoft && im > 0.5 && B.trapT < 0.5 && Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) < 0.75) {
    const bv = Math.hypot(B.v.x, B.v.z), cosA = bv > 0.5 ? (inp.x * B.v.x - inp.y * B.v.z) / (im * bv) : 1;
    if (cosA < Math.cos(0.87)) { BP.firstTouch(B, P, who, { x: inp.x, z: -inp.y }, true); if (who === 'me') sfx.touch(); B.touchFirst = false; B.trapT = 1; BP.touch(B, P); }
  }
  const cp = BP.controlPoint(P, null), ex = B.p.x - cp.x, ez = B.p.z - cp.z, e = Math.hypot(ex, ez);
  const dx = B.p.x - P.p.x, dz = B.p.z - P.p.z, d = Math.hypot(dx, dz) || 1, mag = Math.hypot(inp.x, inp.y);
  if (e < 0.25 || d < 0.5) return B.touchSoft && mag > 0.5 ? { x: 0, y: 0 } : inp; // мяч у ноги — дальше обычное ведение (после мягкого приёма — ждём разворота)
  if (!B.touchSoft && mag > 0.2 && (inp.x * dx - inp.y * dz) / (mag * d) < -0.3) return inp;
  const C = BP.CFG.player, bs = Math.hypot(B.v.x, B.v.z), want = Math.min(mag > 0.2 ? Math.max(C.jog * mag, bs + 1) : C.jog, bs + e * 3), k = Math.min(1, want / C.jog);
  return { x: (dx / d) * k, y: (-dz / d) * k };
}
// После паса управление сразу у получателя. Палец ещё держит джойстик в ту сторону, куда отдан пас, — это не новая
// команда: получатель сам выходит к мячу (запись FC Mobile, 18,5–19,3 с: стрелка ещё смотрит по пасу, а игрок
// разворачивается и идёт навстречу мячу). Повёл джойстик в другую сторону (больше ~35°) или отпустил — управляешь сам
// (с помощью passLineAssist). Удержание снимается в момент приёма: после касания — только мой ввод (раньше оно
// держалось, пока мяч не сядет у ноги, и принявшим игроком ещё ~0,5 с рулила автоматика — «бот ведёт за меня»).
function holdAfterPass() { const i = input(); run.holdInp = Math.hypot(i.x, i.y) > 0.3 ? { x: i.x, y: i.y, t: simT } : null; }
function passInput() {
  const i = input(), H = run.holdInp; if (!H) return i;
  const m = Math.hypot(i.x, i.y), cos = m > 1e-3 ? (i.x * H.x + i.y * H.y) / (m * Math.hypot(H.x, H.y)) : -1;
  const done = B.state !== 'free' || !passInFlight(); // мяч принят (или у соперника, или пас уже не в пути)
  if (m < 0.3 || cos < Math.cos(0.6) || simT - H.t > 3 || done) { run.holdInp = null; return i; }
  return { x: 0, y: 0 };
}
// Помощь получателю, который бежит по джойстику (не прямо к мячу): направление — его, автоматика подстраивает только
// темп и чуть-чуть линию, чтобы встретить мяч, а не проскочить. Помогает выйти к мячу, мяч к игроку не тянется.
//  • бежит поперёк линии паса — темп такой, чтобы оказаться в точке пересечения вместе с мячом (раньше на 0,4 с —
//    проскакивал перед мячом, мяч уходил за спину); не медленнее четверти джойстика: явный ввод остаётся главным;
//  • бежит вдоль линии (мяч догоняет или идёт навстречу) — мягко смещаем на линию, не больше 1,3 м/с вбок.
// Пас не ему, мяч пролетел игрока, пересечение дальше 7 м или позже 2,5 с — помощи нет.
function passLineAssist(P, inp) {
  const pt = passInFlight(), mag = Math.hypot(inp.x, inp.y); if (!pt || pt.id !== actorOf('me').pl || mag < 0.3 || B.p.y > 1.2) return inp;
  const bs = Math.hypot(B.v.x, B.v.z); if (bs < 2) return inp;
  const ux = B.v.x / bs, uz = B.v.z / bs, rx = P.p.x - B.p.x, rz = P.p.z - B.p.z, along = rx * ux + rz * uz; if (along < 0.05) return inp;
  const ix = inp.x / mag, iz = -inp.y / mag, C = BP.CFG.player, max = (P.sprint ? C.sprint : C.jog) * (P.spd || 1);
  const cr = ix * uz - iz * ux; // синус угла между ходом игрока и линией мяча
  if (Math.abs(cr) > 0.5) { // поперёк: пересечение P + j·a = B + u·b
    const a = (ux * rz - uz * rx) / cr, b = (ix * rz - iz * rx) / cr;
    if (a < -0.3 || a > 7 || b < 0) return inp; const tb = b / bs; if (tb > 2.5) return inp;
    const want = Math.max(0, a) / Math.max(0.05, tb - 0.08), k = Math.max(0.25 * Math.min(1, mag), Math.min(Math.min(1, mag), want / max));
    if (TRACE) run.assistDbg = ['cross', +a.toFixed(2), +tb.toFixed(2), +k.toFixed(2)];
    return { x: ix * k, y: -iz * k };
  }
  const ex = rx - along * ux, ez = rz - along * uz, e = Math.hypot(ex, ez); if (e > 4) return inp; // дальше 4 м — пас не ему
  // убегает от мяча вдоль линии почти с его скоростью — мяч не догонит: темп чуть ниже скорости мяча (мяч выкатывается к ноге)
  let cap = Math.min(1, mag); if (ix * ux + iz * uz > 0.5) cap = Math.min(cap, Math.max(0.3, (bs - 1.8) / max));
  const lat = e < 0.15 ? 0 : Math.min(1.3, e * 1.6) / max; // вбок к линии, доля от полной скорости
  const ox = inp.x - (e ? ex / e : 0) * lat, oy = inp.y + (e ? ez / e : 0) * lat, ol = Math.hypot(ox, oy), k = cap / (ol || 1);
  if (TRACE) run.assistDbg = ['line', +e.toFixed(2)];
  return { x: ox * k, y: oy * k };
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
    const lp = run.lastPass && simT - run.lastPass.t < 3; // недавний пас: принимает тот, кто не отдавал (метка отдавшего — B.lockOwner, она меняется вместе с ролями)
    const me = BP.canCapture(B, P, 'me', simT) || (lp && B.lockOwner !== 'me' && passCatch(P, 'me')), mt = M && (BP.canCapture(B, M, 'mate', simT) || (lp && B.lockOwner !== 'mate' && passCatch(M, 'mate')));
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
      // вратарь следит за мячом: чем ближе мяч, тем точнее он видит, куда тот летит (ошибка первой оценки тает к моменту прыжка)
      if ((kick.seeT = (kick.seeT || 0) - h) <= 0 && B.state === 'free') {
        kick.seeT = 0.05; const q = predict(B.p, B.v, B.w, kick.kz), rest = Math.max(0, kick.T - kick.t);
        if (kick.e0 === undefined) kick.e0 = kick.ex - kick.cx;
        kick.cx = q.p.x; kick.cy = q.p.y; kick.ex = q.p.x + kick.e0 * (0.45 + 0.55 * Math.min(1, rest / Math.max(0.3, kick.T))); // часть ошибки остаётся — вратарь не идеален
        kick.T = kick.t + q.t; kick.react = kick.T - 0.2;
      }
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
    let out = THREE.MathUtils.clamp(((K.outStart - dist) / K.outStart) * K.maxOut, 0.4, K.maxOut);
    if (MATCH_ON && MT.restart && MT.restart.kind === 'pen') out = 0.4; // пенальти — на линии ворот
    else if (MATCH_ON) {
      // мяч у чужих ворот (дальше 40 м) — стоит выше линии, до 3,5 м (страхует за спиной защитников); ближе — как
      // раньше: у линии и сокращает угол по мере приближения мяча. Стоять дальше от линии и «выбегать навстречу»
      // нельзя: замер 96 ударами — на 12–22 м вратарь не успевал реагировать (сейвов меньше, голов больше).
      // В ноги выходит, когда соперник отпустил мяч (loose) или он первым успевает к свободному мячу (firstToIt).
      if (dist > 40) out = Math.min(K.sweep, 0.4 + (dist - 40) * 0.1);
    }
    const o = Math.min(out, Math.max(0.4, dist - 2.4));
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
// ---- движения своей модели с перемещением (подкат, разворот, торможение) ----
// Запись ведёт игрока сама: скорость — из движения таза в записи (× k), корпус — по записи; джойстик ждёт конца движения.
// end — до какого времени записи движение занято (дальше снова обычный бег); drive — скорость задаёт запись.
function startMove(pl, P, name, { t = 0, speed = 1, end, k = 1, yaw = P.yaw, drive = true, fade = 0.12, onTick = null } = {}) {
  const c = heroMoves && heroMoves[name]; if (!c || !pl.own) return false;
  play(pl, name, { t, fade, speed, follow: true }); pl.once = { name, until: end };
  // начинаем с середины записи — корпус в ней уже повёрнут: отсчёт поворота от текущего направления, без скачка
  const y0 = yaw - (c.userData.yt && c.userData.yt.length ? lerpAt(c.userData.yt, c.userData.yaw, t) : 0);
  P.yaw = yaw; pl.mv = { c, name, yaw0: y0, k, drive, end, onTick, t0: t, P };
  return true;
}
function endMove(pl, P) { pl.mv = null; P.drive = null; P.lockYaw = 0; if (pl.once && pl.once.name === pl.name) pl.once = null; }
function moveTick(pl, P, dt) {
  const m = pl.mv; if (!m) return;
  if (m.P !== P) m.P.drive = null; // игрок сменил «тело» (не должно случаться) — старое не едет само
  if (pl.name !== m.name || !pl.act || pl.act.time >= m.end || m.P !== P) { endMove(pl, P); return; }
  const t = pl.act.time, I = m.c.userData, ca = Math.cos(m.yaw0), sa = Math.sin(m.yaw0);
  if (m.drive) { const [vx, vz] = rootVel(m.c, t), k = m.k * pl.act.timeScale; P.drive = { x: (vx * ca + vz * sa) * k, z: (-vx * sa + vz * ca) * k }; }
  P.yaw = m.yaw0 + lerpAt(I.yt, I.yaw, t); P.lockYaw = 0.1; // поворот корпуса — из записи
  if (m.onTick && m.onTick(pl, P, t) === 'end') endMove(pl, P);
}
// резкая остановка с бега и разворот на 180° — сами по ходу игры (только своя модель)
// длительность цикла бега (шаг правой + шаг левой), с: у своей модели фаза идёт от скорости (L.cps), у остальных — запись
const stepCycle = (L) => (!L ? 0 : L.cps > 0.05 ? 1 / L.cps : L.jog.timeScale > 0.05 ? L.jog.getClip().duration / L.jog.timeScale : 0);
function autoMoves(pl, P, sp, dt, who) {
  pl.pk = Math.max(sp, (pl.pk || 0) - dt * 3); pl.mvCd = Math.max(0, (pl.mvCd || 0) - dt);
  if (!pl.own || !heroMoves || pl.mv || pl.name !== 'loco' || pl.mvCd > 0 || state !== 'play') return;
  const mine = B.state === 'owned' && B.owner === who, want = Math.hypot(P.wx || 0, P.wz || 0);
  // разворот: управляемый игрок бежит и тянет джойстик назад
  // только от настоящего джойстика (не от автопомощи) и не во время приёма: разворот ведёт игрока записью, и раньше
  // автоподбор у мяча запускал его сам — получатель уезжал спиной от паса
  const raw = who === 'me' ? input() : null, rawM = raw ? Math.hypot(raw.x, raw.y) : 0;
  const receiving = (B.state === 'free' && (run.chase || passInFlight())) || (mine && B.touchFirst);
  if (who === 'me' && !receiving && !mine && rawM > 0.6 && sp > 2.4 && pl.pk > 3.3 && want > 2 && !P.charging && (P.wx * P.v.x + P.wz * P.v.z) / (want * sp) < -0.6 && (raw.x * P.v.x - raw.y * P.v.z) / (rawM * sp) < -0.6) {
    // разворот в сторону, куда тянут джойстик: вправо — h_turn_180, влево — h_run_turn (бег с разворотом через левое плечо,
    // берём отрезок самого разворота). Раньше разворот был всегда через правое плечо.
    const side = P.v.x * P.wz - P.v.z * P.wx; // > 0 — нужно повернуть влево
    pl.mvCd = 0.9;
    // запись разворота не держит управление: отпустил джойстик или повёл в другую сторону (больше ~60° от того, куда
    // разворачивались) — запись заканчивается сразу, дальше снова джойстик
    const tx = raw.x / rawM, ty = raw.y / rawM, cancel = () => { const r = input(), m = Math.hypot(r.x, r.y); return m < 0.3 || (r.x * tx + r.y * ty) / m < 0.5 ? 'end' : null; };
    if (side > 0 && heroMoves.h_run_turn) startMove(pl, P, 'h_run_turn', { t: 0.55, speed: 1.45, end: 1.3, k: THREE.MathUtils.clamp(pl.pk / 4.2, 0.7, 1.3), fade: 0.12, onTick: cancel });
    else startMove(pl, P, 'h_turn_180', { t: 0.04, speed: 1.2, end: 0.55, k: THREE.MathUtils.clamp(pl.pk / 4.2, 0.7, 1.3), fade: 0.1, onTick: cancel });
    return;
  }
  // с места резко вправо-назад (джойстик на 75–150° правее корпуса, мяча нет): поворот с разбегом из записи (h_turn_run),
  // а не вращение на месте с проскальзывающими ногами
  if (who === 'me' && !receiving && !mine && rawM > 0.6 && sp < 0.8 && heroMoves.h_turn_run && !P.charging) {
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), wx = raw.x, wz = -raw.y; let a = Math.atan2(wx, wz) - P.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (a < -1.3 && a > -2.6) { pl.mvCd = 0.8; startMove(pl, P, 'h_turn_run', { t: 0.42, speed: 1.3, end: 1.12, k: 1, fade: 0.12, onTick: (q, PP, t) => (t > 0.8 && Math.hypot(PP.wx || 0, PP.wz || 0) < 0.5 ? 'end' : null) }); return; }
  }
  // торможение: бежал быстро и отпустил (без мяча) — запись остановки; снова побежал — сразу бег
  if (who === 'me' && !mine && P.stopping && pl.pk > 4.4 && sp > 1.6 && sp < pl.pk - 0.5) { // только у меня: боты то останавливались, то сразу бежали (10 «рывков» в минуту)
    pl.mvCd = 1.2; startMove(pl, P, 'h_run_to_stop', { t: 0.06, speed: THREE.MathUtils.clamp(sp / 3, 0.9, 1.35), end: 0.74, drive: false, fade: 0.15,
      onTick: (q, PP) => (!PP.stopping && Math.hypot(PP.wx || 0, PP.wz || 0) > 1 ? 'end' : null) });
  }
}
function bodyAnim(pl, P, dt, who0) { // положение, наклон, бег/стойка, касания мяча в такт шагу
  const h = pl.holder, sp = Math.hypot(P.v.x, P.v.z);
  moveTick(pl, P, dt);
  // корпус на экране догоняет направление за ~0,05 с: без рывков от мгновенных поворотов (выпад в отбор, смена цели);
  // большой скачок (перестановка игроков) — сразу
  { const y0 = pl.vyaw ?? P.yaw; let dy = P.yaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); pl.vyaw = Math.abs(dy) > 2.8 ? P.yaw : y0 + dy * (1 - Math.exp(-dt * 18)); }
  h.position.set(P.p.x, 0, P.p.z); h.rotation.y = pl.vyaw;
  // наклон: на повороте — внутрь, при разгоне — вперёд
  // (наклон — вокруг точки на газоне: сильнее 0,18 рад внутренняя стопа уходила бы в газон и тело приподнималось)
  // вес: боковое ускорение (поворот хода × скорость) и торможение — по ним наклон корпуса и присед (weightLayer)
  { const hv = sp > 0.8 ? Math.atan2(P.v.x, P.v.z) : pl.hv0 ?? 0; let dh = hv - (pl.hv0 ?? hv); dh = Math.atan2(Math.sin(dh), Math.cos(dh)); pl.hv0 = hv;
    const aLat = dt > 0 ? (dh / dt) * sp : 0, brake = Math.max(0, -(P.acc || 0)), ka = 1 - Math.exp(-dt * 10);
    pl.aLat = (pl.aLat || 0) + (THREE.MathUtils.clamp(aLat, -14, 14) - (pl.aLat || 0)) * ka; pl.brake = (pl.brake || 0) + (Math.min(12, brake) - (pl.brake || 0)) * ka; }
  const lean = Math.max(-0.2, Math.min(0.2, -(pl.aLat || 0) * 0.028)), pitch = Math.max(-0.1, Math.min(0.1, P.acc * 0.02));
  const kl = 1 - Math.exp(-dt * 6); h.rotation.z += (lean - h.rotation.z) * kl; h.rotation.x += (pitch - h.rotation.x) * kl;
  // замах занят до конца движения ноги; запись может закончиться раньше этого запаса — тогда до её конца (иначе поза застывает навсегда)
  const busyTill = (C, extra) => Math.min(C.tc + extra, C.dur - 0.05);
  const busy = (pl.name === 'strike' && pl.t < busyTill((pl.own && CONTACT.own) || STRIKE, 0.3)) || (pl.name === 'pass' && pl.t < busyTill((pl.own && CONTACT.ownPass) || PASS, 0.22)) || (pl === shooter && run.feint) || (pl.cele && pl.name === 'header_soccerball' && pl.t < pl.cele) || (pl.once && pl.name === pl.once.name && pl.t < pl.once.until && !(pl.once.name === 'receive' && sp > 1.3) && !(pl.once.run && sp < 0.6)); // приём не держит позу, если игрок уже побежал
  fallTick(pl, P, dt);
  pl.withBall = B.state === 'owned' && B.owner === (who0 || (pl === shooter ? 'me' : 'mate')) && sp > 1.4;
  if (!busy) { loco(pl, sp, dt, P); autoMoves(pl, P, sp, dt, who0 || (pl === shooter ? 'me' : 'mate')); }
  { // корпус ведёт поворот: куда хочет бежать (P.wx, P.wz) против того, куда смотрит таз; только в беге и ведении
    const wl = Math.hypot(P.wx || 0, P.wz || 0); let want = 0;
    if (pl.name === 'loco' && !pl.mv && wl > 0.6) { let d = Math.atan2(P.wx, P.wz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); want = THREE.MathUtils.clamp(d, -1.1, 1.1) * 0.6; }
    pl.twist = (pl.twist || 0) + (want - (pl.twist || 0)) * (1 - Math.exp(-dt * (Math.abs(want) > Math.abs(pl.twist || 0) ? 14 : 7))); // в поворот — быстро, обратно — мягче
    if (pl.name !== 'loco' && Math.abs(pl.twist) < 0.3) pl.twist *= Math.exp(-dt * 20); }
  tickPlayer(pl, dt);
  // касания при ведении — в такт шагу: правая нога проходит вперёд на ~62–69% цикла бега (замер записи jog_forward);
  // на медленном шаге (бег почти не смешан) — когда носок у мяча; и не реже раза в touchMax
  const who = who0 || (pl === shooter ? 'me' : 'mate');
  if (B.state === 'owned' && B.owner === who && sp > 0.6 && B.touchCd <= 0) {
    const L = pl.loco, jogW = L ? L.jog.getEffectiveWeight() : 0, ph = L ? (L.jog.time / L.jog.getClip().duration) % 1 : 0;
    const phT = B.foot < 0 ? 0.12 : 0.62, lp = L ? L.lastPh : undefined; // левая нога выходит вперёд на полцикла раньше
    const stepNow = jogW > 0.5 && lp !== undefined && (lp <= ph ? lp < phT && ph >= phT : lp < phT || ph >= phT); // и через конец цикла
    const toe = (B.foot < 0 ? pl.toeL : pl.toeR).getWorldPosition(tmpB).distanceTo(B.p) - R; // носок той ноги, что ведёт мяч
    // касание — только когда стопа у мяча: в такт шагу (мяч уходит вперёд и катится до следующего шага этой ноги —
    // cyc, длительность цикла бега) или носком на медленном шаге. По таймеру больше не касаемся: на повороте это был
    // толчок без ноги (нога в метре от мяча); без касания мяч просто остаётся у стопы
    const cyc = stepCycle(L);
    if (stepNow || (jogW <= 0.5 && toe < 0.12)) { BP.touch(B, P, sp > 1.5 ? cyc : 0); sfx.touch(); if (who === 'me' && run) run.meTouchT = simT; }
  }
  // мяч перешёл под другую ногу посреди качения — следующий шаг уже этой ноги: качение заканчивается к нему
  if (B.state === 'owned' && B.owner === (who0 || (pl === shooter ? 'me' : 'mate')) && pl.loco) {
    const cy = stepCycle(pl.loco);
    if (B.tp && pl.footSeen !== undefined && pl.footSeen !== B.foot && cy > 0) { const L = pl.loco, ph = (L.jog.time / L.jog.getClip().duration) % 1, phT = B.foot < 0 ? 0.12 : 0.62;
      B.tp.T = B.tp.t + Math.max(0.08, (((phT - ph) % 1) + 1) % 1 * cy); }
    pl.footSeen = B.foot;
    if (!cutStep(pl, P, dt)) xferPose(pl, P); }
  { const mine = B.state === 'owned' && B.owner === who; if (!pl.cut && !soleLayer(pl, P, dt, sp, mine)) weightLayer(pl, P, dt); }
  staggerLayer(pl, P, dt);
  if (pl.loco) pl.loco.lastPh = (pl.loco.jog.time / pl.loco.jog.getClip().duration) % 1;
  return sp;
}
function runAnim(dt) {
  if (TRACE && window.__freeze) return; // проверка поз: кадр записи стоит
  const P = run.P, sp = bodyAnim(shooter, P, dt);
  if (run.strike && shooter.name === 'strike') { // удар — когда носок у мяча
    const S0 = run.strike, S = S0.S || STRIKE, c = strikeContact(shooter, S, S0);
    const cp = BP.controlPoint(P, B), near = Math.hypot(B.p.x - cp.x, B.p.z - cp.z) <= BP.CFG.shot.contactR && B.state === 'strike';
    if (c === 'fire' && near) run.fire = true;
    else if (c !== 'wait') { // окно касания прошло, а мяча у ноги нет (например, сразу после разворота) — нога ждёт до 0,3 с, потом отмена
      if ((S0.wait = (S0.wait || 0) + dt) < 0.3) { if (shooter.act) shooter.act.time = Math.max(0, S.tc - 0.1); S0.dPrev = undefined; }
      else { run.strike = null; if (B.state === 'strike' && B.owner === 'me') { B.state = 'owned'; B.strikeAt = null; } play(shooter, 'idle', { loop: true, fade: 0.2, follow: true }); if (TRACE) console.log('shotEv', JSON.stringify({ t: +simT.toFixed(3), ok: false, cancel: true })); }
    }
  }

  if (run.pass && !run.passFire) { const c = passContact(shooter, run.pass, P, 'me', dt); if (c === true) run.passFire = true; else if (c === 'cancel') { const j = run.pass; run.pass = null; cancelPass(shooter, 'me', j); } }
  const m = run.mate;
  if (m) { bodyAnim(m.pl, m.P, dt); if (m.pass && !m.fire) { const c = passContact(m.pl, m.pass, m.P, 'mate', dt); if (c === true) m.fire = true; else if (c === 'cancel') { const j = m.pass; m.pass = null; cancelPass(m.pl, 'mate', j); } } }
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
function prepStrike() { STRIKE = prepContact('strike', 0.2); PASS = prepContact('pass', 0.15); STRIKE_L = prepContact('strike_L', 0.2); PASS_L = prepContact('pass_L', 0.15); if (TRACE) window.__contact = { STRIKE, PASS, STRIKE_L, PASS_L }; }
// когда в записи нога бьёт по мячу (самая быстрая стопа) и где стопа в этот момент относительно таза
function prepContact(clipName, tMin, pl = shooter) {
  const a = pl.mixer.clipAction(pl.hs && pl.hs !== 1 ? variant(clipName, 1, 1, pl.hs) : clipOf(clipName)); pl.mixer.stopAllAction(); a.reset().play(); // та же запись, что играет play()
  const fp = (n) => { pl.model.updateMatrixWorld(true); return pl.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()); };
  let best = 0, tc = 0.6, foot = 'RightFoot', prev = {};
  for (let t = 0; t <= a.getClip().duration - 0.02; t += 1 / 60) { pl.mixer.setTime(t); for (const n of ['LeftFoot', 'RightFoot']) { const q = fp(n); if (prev[n] && t > tMin) { const v = q.distanceTo(prev[n]) * 60; if (v > best) { best = v; tc = t; foot = n; } } prev[n] = q; } }
  // момент касания — нижняя точка маха ударной ноги (носок ниже всего, пока нога ещё быстрая), а не «самая быстрая нога»:
  // та приходится уже на подъём после касания, и мяч улетал, когда стопа была над ним (замер: носок на 0,45 м)
  const toeN = foot.replace('Foot', 'ToeBase'), toe = pl.model.getObjectByName(toeN) ? toeN : foot;
  { let lowY = 1e9, tl = tc, pq = null; for (let t = Math.max(tMin, tc - 0.2); t <= tc + 0.02; t += 1 / 120) { pl.mixer.setTime(t); const q = fp(toe), v = pq ? q.distanceTo(pq) * 120 : 0; pq = q; if (v > best * 0.5 && q.y < lowY) { lowY = q.y; tl = t; } } tc = tl; }
  // точка касания: носок в этот момент плюс радиус мяча по ходу ноги — туда мяч подводится во время замаха
  // (считается для каждой модели отдельно: у своей модели другие пропорции)
  pl.mixer.setTime(tc - 1 / 60); const t0 = fp(toe); pl.mixer.setTime(tc); const t1 = fp(toe), hp = pl.hips.getWorldPosition(new THREE.Vector3()), yaw = pl.holder.rotation.y;
  let sx = t1.x - t0.x, sz = t1.z - t0.z; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
  const cx = t1.x + sx * (R + 0.03), cz = t1.z + sz * (R + 0.03), dx = cx - hp.x, dz = cz - hp.z;
  const f = dx * Math.sin(yaw) + dz * Math.cos(yaw), side = -(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  const dur = a.getClip().duration; a.stop(); pl.act = null; return { tc, dur, foot, toe, at: { f: Math.max(0.2, Math.min(0.85, f)), s: Math.max(-0.35, Math.min(0.35, side)) } };
}
// касание удара для этой модели (своя модель — свой замер, один раз)
const CONTACT = {};
// L — левой ногой (зеркальная запись): своё время и своя точка касания (у левой стопы)
const leftNow = () => (B.sideK ?? 1) < 0; // мяч сейчас у левой стопы того, кто им владеет
// замер касания останавливает все записи игрока (prepContact) — поэтому обе ноги меряются сразу, до начала замаха,
// а не «лениво» посреди удара (иначе запись удара обрывалась, и удар не происходил)
function strikeOf(pl, L = false) { if (!pl || !pl.own) return L ? STRIKE_L : STRIKE; if (!CONTACT.own) { CONTACT.own = prepContact('strike', 0.2, pl); CONTACT.ownL = prepContact('strike_L', 0.2, pl); } return L ? CONTACT.ownL : CONTACT.own; }
// касание при пасе — тоже по своей модели (как у удара: у своей модели другая длина ног и момент касания)
function passOf(pl, L = false) { if (!pl || !pl.own) return L ? PASS_L : PASS; if (!CONTACT.ownPass) { CONTACT.ownPass = prepContact('pass', 0.15, pl); CONTACT.ownPassL = prepContact('pass_L', 0.15, pl); } return L ? CONTACT.ownPassL : CONTACT.ownPass; }
const isL = (S) => !!S && S.foot === 'LeftFoot'; // замер касания этой записи — левой ногой
// Пас — только когда носок у мяча (как удар). Мяча у ноги нет (сразу после приёма он ещё в метре) — нога ждёт до 0,35 с,
// потом пас отменяется и мяч остаётся у игрока. Раньше пас «срабатывал» по времени записи: нога проходила мимо, мяч выпадал.
// Возвращает true — бить сейчас, 'cancel' — отменить, false — ждать.
function passContact(pl, job, P, who, dt) {
  job.age = (job.age || 0) + dt; if (job.age > 1.2) return 'cancel'; // страховка: пас не висит (иначе следующие нажатия блокируются)
  if (pl.name !== 'pass') { // запись паса перебита другой (замер серии: 1 пас из 10 терялся) — мяч ещё у ноги: замах заново
    if (B.state === 'strike' && B.owner === who && (job.restarts = (job.restarts || 0) + 1) <= 2) { const S = job.S || PASS; play(pl, 'pass', { mirror: isL(S), t: Math.max(0, S.tc - 0.12), fade: 0.04, speed: 1.15, follow: true }); job.dPrev = undefined; if (TRACE) console.log('passRestart', JSON.stringify({ who, t: +simT.toFixed(2) })); return false; }
    return 'cancel';
  }
  const S = job.S || PASS, c = strikeContact(pl, S, job), cp = BP.controlPoint(P, B);
  const near = B.state === 'strike' && B.owner === who && Math.hypot(B.p.x - cp.x, B.p.z - cp.z) <= BP.CFG.shot.contactR;
  if (TRACE && job.dPrev !== undefined) { job.dMin = Math.min(job.dMin ?? 9, job.dPrev); job.cpMax = Math.max(job.cpMax || 0, Math.hypot(B.p.x - cp.x, B.p.z - cp.z)); job.lastC = c; job.near = near; }
  if (c === 'wait') return false;
  if (near) return true; // носок у мяча (или окно касания прошло, а мяч у ноги — бьём, как раньше)
  if ((job.wait = (job.wait || 0) + dt) < 0.35) { if (pl.act) pl.act.time = Math.max(0, S.tc - 0.1); job.dPrev = undefined; return false; }
  return 'cancel';
}
function cancelPass(pl, who, job) {
  if (B.state === 'strike' && B.owner === who) { B.state = 'owned'; B.strikeAt = null; }
  play(pl, 'idle', { loop: true, fade: 0.2, follow: true }); if (TRACE) console.log('passCancel', JSON.stringify({ who, t: +simT.toFixed(2), own: !!pl.own, dMin: job && +(job.dMin ?? -1).toFixed(2), cp: job && +(job.cpMax ?? -1).toFixed(2), c: job && job.lastC, near: job && job.near, bs: B.state }));
}
// нога у мяча? Удар срабатывает, когда носок ударной ноги ближе всего к мячу (касание), а не в заранее заданный момент записи.
// 'fire' — бить сейчас; 'wait' — ещё рано; 'late' — окно прошло, мяча у ноги нет
function strikeContact(pl, S, st) {
  const t = pl.t || 0; if (t < S.tc - 0.12) return 'wait';
  const o = pl.model.getObjectByName(S.toe || S.foot); if (!o) return t >= S.tc ? 'fire' : 'wait';
  pl.model.updateMatrixWorld(true); const q = o.getWorldPosition(tmpV), d = Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z);
  const prev = st.dPrev, dtF = Math.max(1 / 120, simT - (st.tPrev ?? simT - 1 / 60)); st.dPrev = d; st.tPrev = simT;
  if (d < R + 0.12) return 'fire'; // носок у мяча
  // при 30 кадрах/с касание может прийтись между кадрами: если до следующего кадра носок дойдёт до мяча — бьём сейчас
  if (prev !== undefined && prev > d && d - (prev - d) * 0.6 < R + 0.12) return 'fire';
  if (prev !== undefined && d > prev + 0.005 && prev < R + 0.35) return 'fire'; // ближайшая точка пройдена — касание было сейчас
  return t > S.tc + 0.08 ? 'late' : 'wait';
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
  { think: 0.3, tackle: 0.22, noise: 2.6, want: 0.7, spd: 0.95, gk: { reaction: 0.25, diveReach: 2.6, readError: 0.2, catchHands: 19 } },
  { think: 0.2, tackle: 0.4, noise: 2.0, want: 1, spd: 1, gk: { reaction: 0.18, diveReach: 2.8, readError: 0.16, catchHands: 21 } },
  { think: 0.14, tackle: 0.55, noise: 1.4, want: 1.25, spd: 1.03, gk: { reaction: 0.15, diveReach: 3.0, readError: 0.14, catchHands: 22 } },
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
  // блок едет за мячом: место = глубина мяча + сдвиг по линии (защита сзади, атака впереди). Владение меняет форму
  // чуть-чуть (в атаке шире по длине), а не отправляет всех вперёд: раньше при владении каждый сразу прибавлял до 0,38
  // длины поля, и защитники оказывались впереди мяча на своей половине
  let d;
  if (attacking) { d = Math.max(bd + (d0 - 0.52) * 0.62, d0 * 0.55); if (d0 < 0.36) d = Math.min(d, bd - 0.1, 0.6); }
  else { d = bd + (d0 - 0.52) * 0.5 - 0.06; if (d0 < 0.36) d = Math.min(d, bd - 0.06); }
  d = Math.max(0.07, Math.min(0.88, d));
  return { x: clampX(hx * (attacking ? 1 : 0.78) + B.p.x * (attacking ? 0.15 : 0.3), 2), z: t === 0 ? MATCH.L - d * MATCH.L : d * MATCH.L };
}
// цвета — как в записи матча FC Mobile: мы — синие с жёлтыми гетрами, соперник — оранжевая футболка и чёрные шорты
const KIT_US = { shirt: '#2357c9', shorts: '#2357c9', socks: '#f1c21b' }, KIT_THEM = { shirt: '#f0602a', shorts: '#1c1d22', socks: '#f0602a' }, KIT_GK2 = { shirt: '#2fbf71', shorts: '#1d2430', socks: '#2fbf71' };
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
  return run.offN ? A.filter((a) => !a.pl.off) : A; // удалённые (красная карточка) в игре не участвуют
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
// вратарь по карточке (прыжок, руки, выбивание, реакция, реакция на поле, выбор позиции): хороший — лучше вратаря
// «Сильных» соперников, средний (80) — как у «Средних». Без карточки — средний.
function gkFromCard(c) {
  if (!c) return { reaction: 0.18, diveReach: 2.8, readError: 0.16, catchHands: 21 };
  const k = (i) => k01(c.st[i]);
  return { reaction: 0.25 - 0.11 * k(3), diveReach: 2.55 + 0.6 * k(0), readError: 0.24 - 0.12 * k(5), catchHands: 17 + 7 * k(1) };
}
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
  // (записи soccer_tackle* проверены: это подкаты с падением и вращение — для отбора стоя не подходят; тычок — запись паса)
  play(a.pl, 'pass', { t: Math.max(0, PASS.tc - 0.21), fade: 0.06, speed: 1.35, follow: true });
  return true;
}
// ---- подкат (своя модель): скользит ногами вперёд к мячу; задел мяч ногой — выбил, промахнулся — лежит ~1 с ----
// Три записи: h_tackle — обычный подкат (нога у мяча через ~0,35 с, достаёт на ~3 м), h_tackle_1 — прыжок ногами вперёд
// (ближе, эффектнее), h_tackle_2 — бросок в сторону (мяч совсем рядом — падает на него боком, мяч справа).
// win — момент записи, когда нога у газона и может выбить мяч; reach — сколько метров до этого момента проходит стопа.
const SLIDE = {
  h_tackle: { t0: 0.08, speed: 1.15, win: [0.3, 0.8], end: 1.42, reach: 3.1 },
  h_tackle_1: { t0: 0.5, speed: 1.2, win: [0.9, 1.5], end: 2.3, reach: 1.9 },
  h_tackle_2: { t0: 0.15, speed: 1.2, win: [0.6, 1.2], end: 1.9, reach: 0 },
  maxD: 5.5, cd: 1.6,
};
const slideParts = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg', 'Hips'];
// подкат доступен: своя модель, мяч не у своих и не дальше maxD
const slideOk = () => { const a = run && actorOf('me'); if (!a || !a.pl.own || !heroMoves || a.pl.mv || (a.ai && a.ai.tkCd > 0)) return false; return Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z) <= SLIDE.maxD; };
function trySlide(a) {
  const pl = a.pl, ai = a.ai, P = a.P; if (!pl.own || !heroMoves || !ai || ai.tkCd > 0 || ai.tk || pl.mv || state !== 'play') return false;
  if (owning() && actorOf(B.owner) && actorOf(B.owner).team === a.team) return false; // мяч у своих — не подкатываемся
  const tx = B.p.x + B.v.x * 0.35 - P.p.x, tz = B.p.z + B.v.z * 0.35 - P.p.z, d = Math.hypot(tx, tz);
  if (d > SLIDE.maxD) return false;
  // бросок в сторону (h_tackle_2) убран: выглядел как прыжок вратаря; близко — обычный подкат покороче
  const name = d > 1.4 && d < 2.6 && Math.random() < 0.35 ? 'h_tackle_1' : 'h_tackle', S = SLIDE[name];
  const yaw = name === 'h_tackle_2' ? Math.atan2(tz, -tx) : Math.atan2(tx, tz); // бросок в сторону — мяч справа от игрока
  const k = S.reach ? THREE.MathUtils.clamp(d / S.reach, 0.6, 1.35) : 1;
  ai.tkCd = SLIDE.cd; pl.mvCd = SLIDE.cd;
  if (a.id === 'me') { run.strike = null; run.pass = null; cancelCharge(); }
  const fx = name === 'h_tackle_2' ? -Math.cos(yaw) : Math.sin(yaw), fz = name === 'h_tackle_2' ? Math.sin(yaw) : Math.cos(yaw); // куда выбиваем
  let hit = false;
  startMove(pl, P, name, { t: S.t0, speed: S.speed, end: S.end, k, yaw, fade: 0.1, onTick: (q, PP, t) => {
    if (hit || t < S.win[0] || t > S.win[1] || B.state === 'held') return;
    const own = owning() ? actorOf(B.owner) : null; if (own && own.team === a.team) return;
    // подкат в ноги, а не в мяч: соперник с мячом у вытянутых ног подкатывающего — фол (сзади — почти всегда карточка)
    if (own && MATCH_ON) { const fwd = name === 'h_tackle_2' ? 0.4 : 0.9, O = own.P, cx = PP.p.x + Math.sin(PP.yaw) * fwd, cz = PP.p.z + Math.cos(PP.yaw) * fwd;
      const ballNear = Math.hypot(B.p.x - cx, B.p.z - cz) < 0.5;
      if (!ballNear && Math.hypot(O.p.x - cx, O.p.z - cz) < 0.65) { hit = true; const rx = PP.p.x - O.p.x, rz = PP.p.z - O.p.z, rl = Math.hypot(rx, rz) || 1; callFoul(a, own, true, (Math.sin(O.yaw) * rx + Math.cos(O.yaw) * rz) / rl < -0.3); return; } }
    if (B.p.y > 0.7) return;
    const near = slideParts.some((n) => { const b = q.model.getObjectByName(n); return b && b.getWorldPosition(tmpB).distanceTo(B.p) < (n === 'Hips' ? 0.42 : 0.3); });
    if (!near) return;
    hit = true;
    if (own) { // отбор: из-за спины — хуже
      const O = own.P, rx = PP.p.x - O.p.x, rz = PP.p.z - O.p.z, rl = Math.hypot(rx, rz) || 1, front = (Math.sin(O.yaw) * rx + Math.cos(O.yaw) * rz) / rl;
      if (Math.random() > Math.min(0.97, (front > -0.4 ? 0.9 : 0.6) * (a.pl.defK || 1) * (own.pl.physK || 1))) return;
      cancelOwnerAction(own.id); BP.release(B, own.id, simT, 0.7, false); MST().tackles[a.team]++; MT.passPend = null;
      { if (Math.random() < 0.45) fallDown(own); else stagger(own); const oa = own.id === 'me' ? run.meAI : own.ai; if (oa) oa.slowT = 1; } // подкат: иногда падает через ногу, чаще теряет равновесие
    }
    const sp = 3 + Math.random() * 2, side = (Math.random() - 0.5) * 2;
    B.v.set(fx * sp - fz * side, 0.35, fz * sp + fx * side); B.w.set(0, 0, 0); MT.last = a.team; sfx.touch();
    if (B.state === 'free') { B.lockOwner = a.id; B.lockUntil = simT + 0.9; B.mustClear = false; } // лёжа мяч не подобрать — его берут партнёры или он сам, когда встанет
    if (a.id === 'me' || (own && own.id === 'me')) sfx.buzz('medium');
    if (TRACE) console.log('slide', JSON.stringify({ id: a.id, name, t: +t.toFixed(2), won: !!own }));
  } });
  if (TRACE) console.log('slideStart', JSON.stringify({ id: a.id, name, d: +d.toFixed(2), k: +k.toFixed(2) }));
  return true;
}
// ---- падения ----
// Раньше у кого отобрали мяч, в 60–70 % случаев проигрывалось одно «падение» (кувырок с ногами вверх, скольжение по
// газону), а через 1,3 с игрок мгновенно оказывался на ногах. Теперь:
//  • обычно — потеря равновесия (stagger): корпус клюёт вперёд и выпрямляется, игрок на миг замедляется, не падает;
//  • настоящее падение (fallDown) — фол, иногда подкат или отбор: падение → лежит ~0,4 с → встаёт по записи
//    standing_up → бег. Пока падает и лежит, скорость гасится (не скользит по газону) и управления нет.
function fallDown(a) {
  const pl = a.pl, P = a.P; if (pl.fall || pl.off) return;
  play(pl, 'soccer_trip', { t: 0.15, fade: 0.1, speed: 1.35, follow: true }); pl.once = { name: 'soccer_trip', until: 9 };
  pl.fall = { st: 'trip', t: 0, vx: P.v.x * 0.6, vz: P.v.z * 0.6 }; pl.stag = null;
  if (pl.mv) endMove(pl, P);
}
function stagger(a) { if (!a.pl.fall) a.pl.stag = { t: 0 }; }
// запись падения — только до касания газона (дальше в ней кувырок через голову), потом лёжа (fallen_idle)
function fallTick(pl, P, dt) {
  const F = pl.fall; if (!F) return;
  F.t += dt; const k = Math.exp(-dt * 5); F.vx *= k; F.vz *= k; P.drive = { x: F.vx, z: F.vz }; P.lockYaw = 0.1;
  if (F.st === 'trip' && (pl.name !== 'soccer_trip' || pl.t >= 0.52)) { play(pl, 'fallen_idle', { t: 0.3, fade: 0.25, follow: true }); pl.once = { name: 'fallen_idle', until: 9 }; F.st = 'lie'; F.t = 0; }
  else if (F.st === 'lie' && F.t > 0.55) { play(pl, 'standing_up', { t: 0.2, fade: 0.3, speed: 1.35, follow: true }); pl.once = { name: 'standing_up', until: 1.55 }; F.st = 'up'; F.t = 0; }
  else if (F.st === 'up' && (pl.name !== 'standing_up' || pl.t >= 1.5)) { pl.fall = null; P.drive = null; P.lockYaw = 0; pl.once = null; }
  if (pl.fall && F.t > 3) { pl.fall = null; P.drive = null; P.lockYaw = 0; pl.once = null; } // страховка
}
// потеря равновесия: корпус вперёд (до ~29°) и обратно за ~0,5 с — поверх записи бега
function staggerLayer(pl, P, dt) {
  const S = pl.stag; if (!S) return; S.t += dt; if (S.t > 0.5 || pl.fall) { pl.stag = null; return; }
  const w = Math.sin(Math.PI * S.t / 0.5), sp = pl.model.getObjectByName('Spine'), sp2 = pl.model.getObjectByName('Spine1'); if (!sp) return;
  pl.holder.updateMatrixWorld(true); ikV.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); rotW(sp, ikV, 0.32 * w); if (sp2) rotW(sp2, ikV, 0.18 * w);
}
// ---- фолы и карточки ----
// Свисток: штрафной с места фола или пенальти (фол в своей штрафной). Карточка — по тому, как сфолил: подкат сзади —
// почти всегда жёлтая, иногда красная; обычный отбор — редко. Вторая жёлтая — красная: игрок уходит с поля.
const inBoxOf = (team, x, z) => Math.abs(x) < 20.16 && Math.abs(z - ownZ(team)) < 16.5; // в штрафной ворот команды team
function callFoul(a, v, slide, behind) {
  if (!MATCH_ON || MT.st !== 'play' || state !== 'play' || (MT.restart && MT.restart.kind !== 'kickoff')) return;
  const S = MST(); S.fouls[a.team]++;
  if (owning()) { cancelOwnerAction(B.owner); BP.release(B, B.owner, simT, 0.3, false); }
  fallDown(v);
  const r = Math.random(), red = slide && behind && r < 0.1, yellow = !red && r < (slide ? (behind ? 0.65 : 0.25) : (behind ? 0.18 : 0.06));
  const x = v.P.p.x, z = v.P.p.z, pen = inBoxOf(a.team, x, z), nm = a.pl.nick || 'Игрок';
  let card = '';
  if (yellow) { a.pl.yc = (a.pl.yc || 0) + 1; if (a.pl.yc >= 2) card = 'red2'; else { card = 'yellow'; S.yellow[a.team]++; } }
  if (red) card = 'red';
  if (card.startsWith('red')) S.red[a.team]++;
  MT.next = pen ? { kind: 'pen', team: v.team, x: 0, z: ownZ(a.team) === 0 ? 11 : MATCH.L - 11 } : { kind: 'free', team: v.team, x: clampX(x, 1), z: clampZ(z, 1.5) };
  MT.st = 'dead'; MT.stT = 0; run.chase = false; MT.off = null; MT.back = null; MT.passPend = null; MT.shotPend = null;
  sfx.whistle(); if (a.id === 'me' || v.id === 'me') sfx.buzz('heavy');
  matchBanner(card === 'yellow' ? `🟨 ${nm}` : card === 'red2' ? `🟨🟥 ${nm} — удалён` : card === 'red' ? `🟥 ${nm} — удалён` : pen ? 'Пенальти!' : 'Фол', !!card || pen);
  if (card && pen) setTimeout(() => { if (MT.st === 'dead') matchBanner('Пенальти!', true); }, 1100);
  if (TRACE) console.log('foul', JSON.stringify({ by: a.id, on: v.id, slide, behind, card, pen }));
  if (card.startsWith('red')) sendOff(a.pl);
}
function sendOff(pl) {
  let a = actors().find((q) => q.pl === pl); if (!a) return;
  if (a.id === 'me') { // удалили того, кем я играю — управление к ближнему партнёру
    let best = null, bd = 1e9; for (const q of actors()) { if (q.team !== 0 || q.id === 'me') continue; const d = Math.hypot(q.P.p.x - a.P.p.x, q.P.p.z - a.P.p.z); if (d < bd) { bd = d; best = q.id; } }
    if (best) swapControl(best); a = actors().find((q) => q.pl === pl); if (!a) return;
  }
  pl.off = true; run.offN = (run.offN || 0) + 1; pl.holder.visible = false; a.P.p.x = MATCH.HW + 40; a.P.p.z = MATCH.L / 2; a.P.v.x = a.P.v.z = 0; run._act = null;
}
const inTackleRange = (a) => { const own = owning() ? actorOf(B.owner) : null; return !!own && own.team !== a.team && Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z) <= TK.reach; };
function cancelOwnerAction(id) { if (id === 'me') { run.strike = null; run.pass = null; cancelCharge(); } else { const o = actorOf(id); if (o && o.ai) { o.ai.pass = null; o.ai.strike = null; o.ai.fire = false; o.ai.sfire = false; } } }
function tackleTick(a, h) {
  const ai = a.ai; if (!ai) return; ai.tkCd = Math.max(0, (ai.tkCd || 0) - h); if (ai.slowT > 0) ai.slowT -= h;
  const tk = ai.tk; if (!tk) return; tk.t += h; const P = a.P;
  if (tk.t < TK.lungeT && tk.sp > 0) { P.v.x = tk.dx * tk.sp; P.v.z = tk.dz * tk.sp; } // выпад
  if (!tk.done && tk.t >= TK.contact) {
    tk.done = true; const own = owning() ? actorOf(B.owner) : null; let ok = false, foulBy = null;
    if (own && own.team !== a.team) {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), d = Math.hypot(P.p.x + fx * 0.55 - B.p.x, P.p.z + fz * 0.55 - B.p.z), O = own.P;
      const rx = P.p.x - O.p.x, rz = P.p.z - O.p.z, rl = Math.hypot(rx, rz) || 1, front = (Math.sin(O.yaw) * rx + Math.cos(O.yaw) * rz) / rl;
      const shield = segDist(P.p.x, P.p.z, B.p.x, B.p.z, O.p.x, O.p.z) < 0.28; // между ногой и мячом — корпус владельца
      // баланс (22.10): откуда отбор — спереди как было, сбоку чуть хуже, сбоку-сзади заметно, прямо сзади почти никогда
      // (раньше сбоку-сзади — 0,7: бот догонял ведущего со спины и чисто забирал мяч); мяч закрыт корпусом — вдвое хуже;
      // мяч у самой ноги владельца — труднее, откатился после касания (b.tpOff) — легче: важно поймать момент
      const dirK = front > 0.3 ? 1 : front > -0.3 ? 0.85 : front > -0.65 ? 0.5 : 0.15;
      const ocp = BP.controlPoint(O, null), loose = Math.hypot(B.p.x - ocp.x, B.p.z - ocp.z) + (B.tpOff || 0), looseK = loose < 0.18 ? 0.75 : loose > 0.35 ? 1.2 : 1;
      const p = Math.min(0.97, (d > 1.0 ? 0 : d < 0.45 ? 0.92 : d < 0.75 ? 0.72 : 0.35) * dirK * (shield ? 0.5 : 1) * looseK * (Math.hypot(O.v.x, O.v.z) > 5 ? 0.85 : 1) * (a.pl.defK || 1) * (own.pl.physK || 1));
      const won = Math.random() < p;
      if (TRACE) console.log('tackle', JSON.stringify({ id: a.id, on: own.id, d: +d.toFixed(2), front: +front.toFixed(2), shield, p: +p.toFixed(2), won }));
      if (won) { // выбил: мяч свободен, катится к ногам отбиравшего
        ok = true; cancelOwnerAction(own.id); BP.release(B, own.id, simT, 0.7, false); MST().tackles[a.team]++; MT.passPend = null;
        // у кого отобрали — теряет равновесие (корпус вперёд) и на миг скорость; изредка падает
        { if (Math.random() < 0.1) fallDown(own); else stagger(own); const oa = own.id === 'me' ? run.meAI : own.ai; if (oa) oa.slowT = 0.6; } // отбор стоя: обычно теряет равновесие, редко падает
        B.v.set(fx * 1.2 + P.v.x * 0.45, 0.15, fz * 1.2 + P.v.z * 0.45); B.w.set(0, 0, 0); MT.last = a.team; sfx.touch();
        if (a.id === 'me' || own.id === 'me') sfx.buzz('medium');
      }
      // фол: не достал мяч, но врезался в соперника (сзади — чаще); или выбил, но сзади через ногу
      const body = Math.hypot(P.p.x - O.p.x, P.p.z - O.p.z);
      if (!ok && body < 0.95 && Math.random() < (front < -0.4 ? 0.5 : front < 0.3 ? 0.2 : 0.07)) foulBy = { own, behind: front < -0.4 };
      else if (ok && front < -0.55 && Math.random() < 0.2) foulBy = { own, behind: true };
    }
    if (foulBy) { callFoul(a, foulBy.own, false, foulBy.behind); return; }
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
  if (R0 && R0.kind === 'pen' && R0.taker !== a.id) { // пенальти: все, кроме бьющего, — за штрафной
    const gz = R0.z < MATCH.L / 2 ? 0 : MATCH.L, dz = gz === 0 ? 1 : -1; ai.tx = clampX(P.p.x * 0.6 + (a.team === R0.team ? 6 : -6), 2); ai.tz = gz + dz * (18.5 + Math.random() * 3); ai.sprint = Math.abs(P.p.z - gz) < 18; return;
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
  const pf = B.state === 'free' && passInFlight();
  if (pf && pf.team === team) { // пас своему в пути: получатель выходит навстречу, остальные — по местам (не бегут на мяч)
    ai.run = null;
    if (pf.id === a.pl) { const mp = meetPoint(P, BP.CFG.player.sprint * 0.85, B.p.y > 1.5 || B.v.y > 1.5); ai.chasing = true; ai.tx = mp.x; ai.tz = mp.z; ai.sprint = Math.hypot(mp.x - P.p.x, mp.z - P.p.z) > 3; ai.want = { x: -mp.x * 0.15, z: fwdZ(team) }; return; }
    ai.chasing = false; return NSIDE > 3 ? formation(a, foes, true) : botSupport(a, mates, foes);
  }
  if (B.state === 'free') {
    // свободный мяч: бежит ближайший из команды (оценка — расстояние до места, где мяч будет через полсекунды);
    // у нас — только если он заметно ближе меня. Точку встречи считает только он.
    // кто первым успеет к мячу — по времени до точки встречи (по полёту мяча), а не по расстоянию до мяча сейчас;
    // выбор держится, пока другой не успевает заметно раньше (без смены цели каждые доли секунды)
    const fc = freeChaser(team), me = mates.find((m) => m.id === 'me');
    const first = fc.id === a.id && !(me && fc.alt === 'me' && (run.chase || simT - (run.meTouchT ?? -9) < 1.5));
    ai.chasing = first;
    if (first) { const mp = meetPoint(P, BP.CFG.player.sprint * 0.9, B.p.y > 1.5 || B.v.y > 1.5); ai.tx = mp.x; ai.tz = mp.z; ai.sprint = Math.hypot(mp.x - P.p.x, mp.z - P.p.z) > 2.5; ai.want = { x: -mp.x * 0.15, z: fwdZ(team) }; return; }
    if (NSIDE > 3) return formation(a, foes, attackPhase(team));
    return ot === -1 && Math.random() < 0.5 ? botSupport(a, mates, foes, true) : botDefend(a, mates, foes);
  }
  return botDefend(a, mates, foes);
}
// свободный мяч: кто из команды раньше всех успеет к нему (время до точки встречи, считается для 4 ближайших).
// Держим выбранного, пока другой не успевает раньше на 0,25 с. alt — второй (у нас: если это я и я бегу к мячу — бот уступает)
function freeChaser(team) {
  const C = (MT.fc || (MT.fc = [{}, {}]))[team]; if (simT - (C.t ?? -9) < 0.15) return C;
  const high = B.p.y > 1.5 || B.v.y > 1.5, fx = B.p.x + B.v.x * 0.5, fz = B.p.z + B.v.z * 0.5;
  const cand = actors().filter((q) => q.team === team).sort((x, y) => Math.hypot(fx - x.P.p.x, fz - x.P.p.z) - Math.hypot(fx - y.P.p.x, fz - y.P.p.z)).slice(0, 4);
  const T = {}; for (const q of cand) T[q.id] = meetPoint(q.P, BP.CFG.player.sprint * 0.9 * (q.pl.spd || 1), high).t;
  let best = null, bt = 1e9; for (const id in T) if (T[id] < bt) { bt = T[id]; best = id; }
  if (C.id && T[C.id] !== undefined && T[C.id] < bt + 0.25) best = C.id;
  // мне — с запасом: если я успеваю почти так же (на 0,6 с), бот мяч не берёт (иначе забирал у меня из-под ног)
  const alt = T.me !== undefined && best !== 'me' && T.me < T[best] + 0.6 ? 'me' : null;
  C.id = best; C.alt = best === 'me' ? 'me' : alt; C.t = simT; return C;
}
// как часто нападающие и полузащитники забегают: когда у своего мяч в центре или у чужих ворот, он смотрит вперёд
// и его не прессингуют — чаще (как в настоящей игре: открываются под пас)
const RUNS = false; // забегания за спину выключены у всех команд: партнёры держат позиции и остаются вариантами для паса
function runChance(a) {
  if (!RUNS) return 0;
  const ow = owning() && actorOf(B.owner); if (!ow || ow.team !== a.team || ow === a) return 0.02;
  const O = ow.P, fz = fwdZ(a.team), facing = Math.cos(O.yaw) * fz, d0 = homeBase(a)[1], deep = depthOf(a.team, O.p.z);
  const pressed = actors().some((f) => f.team !== a.team && Math.hypot(f.P.p.x - O.p.x, f.P.p.z - O.p.z) < 2.5);
  // не больше одного забегающего (у чужой штрафной — двух): остальные остаются вариантами для паса
  const runners = actors().filter((q) => q.team === a.team && q.ai && q.ai.run).length, cap = deep < 35 ? 2 : 1;
  if (runners >= cap) return 0;
  let c = d0 >= 0.7 ? 0.04 : 0.012; if (facing > 0.3) c *= 1.5; if (pressed) c *= 0.3;
  return c;
}
// по расстановке; в обороне — подтягивается к ближайшему сопернику в своей зоне (со стороны своих ворот)
function formation(a, foes, attacking) {
  const ai = a.ai, P = a.P, H = homeOf(a, attacking); let tx = H.x, tz = H.z;
  // забегание: полузащитник или нападающий в атаке время от времени рвётся вперёд в свободный коридор — под пас на ход
  if (!attacking) ai.run = null;
  else if (!ai.run && homeBase(a)[1] >= 0.45 && !isOffside(a) && Math.random() < runChance(a)) {
    // забегание за спину защитникам: стартует из игры (в линию с последним защитником), бежит в коридор, где нет соперника
    const fz = fwdZ(a.team), d0 = homeBase(a)[1], wide = Math.abs(H.x) > 12, line = offsideLine(a.team);
    const lanes = [-1, 1].map((sd) => H.x + sd * (wide ? 4 : 6)).concat(wide ? [H.x * 0.55] : [H.x]);
    const free = (x, z) => Math.min(...foes.map((f) => Math.hypot(f.P.p.x - x, f.P.p.z - z)));
    let bx = lanes[0], bs = -1; for (const x of lanes) { const tz = clampZ(H.z + fz * 14, 4), v = free(clampX(x, 3), tz); if (v > bs) { bs = v; bx = x; } }
    const deep = d0 >= 0.7 ? 16 + Math.random() * 6 : 11 + Math.random() * 6;
    ai.run = { x: clampX(bx, 3), z: clampZ(H.z + fz * deep, 4), t: 2.8 };
    if (NSIDE > 3 && depthOf(a.team, P.p.z) < line - 2) ai.run = null; // уже глубже линии — не бежит (будет офсайд)
  }
  if (ai.run) { ai.tx = ai.run.x; ai.tz = ai.run.z; ai.sprint = true; ai.pace = 1; ai.role = 'run'; return; }
  // атака: открыться под пас — в пределах 5 м от своей позиции точка без опекуна и с чистой линией от владельца мяча
  // (как в FC Mobile: партнёр смещается из-под опеки, а не стоит за спиной защитника). Выбор держится ~1 с, без дёрганья.
  if (attacking && owning() && actorOf(B.owner) && actorOf(B.owner).team === a.team) {
    const O = actorOf(B.owner).P.p, dO = Math.hypot(H.x - O.x, H.z - O.z);
    if (dO > 5 && dO < 34) {
      const fz = fwdZ(a.team), line = NSIDE > 3 ? offsideLine(a.team) : 0;
      const cost = (x, z) => { let c = 0; for (const f of foes) { const m = Math.hypot(f.P.p.x - x, f.P.p.z - z); if (m < 3.5) c += (3.5 - m) * 2; if (segDist(O.x, O.z, x, z, f.P.p.x, f.P.p.z) < 2) c += 3; }
        if (NSIDE > 3 && depthOf(a.team, z) < line - 0.5 && (z - O.z) * fz > 0) c += 6; // не в офсайд
        return c + Math.hypot(x - H.x, z - H.z) * 0.25; };
      if ((ai.openT = (ai.openT || 0) - AI.think) <= 0 || !ai.open) {
        ai.openT = 1.0; let best = { x: H.x, z: H.z, c: cost(H.x, H.z) };
        for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3], [5, 2], [-5, 2]]) { const x = clampX(H.x + ox, 2), z = clampZ(H.z + oz * fz, 2); const c = cost(x, z); if (c < best.c - 0.8) best = { x, z, c }; }
        const keep = ai.open && cost(ai.open.x, ai.open.z) < best.c + 1.2; if (!keep) ai.open = { x: best.x, z: best.z };
      }
      tx = ai.open.x; tz = ai.open.z;
    } else ai.open = null;
  } else ai.open = null;
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
  const S = strikeOf(a.pl, leftNow()), ai = a.ai; ai.strike = { pw, tx, S }; B.state = 'strike'; B.strikeAt = S.at;
  play(a.pl, 'strike', { t: Math.max(0, S.tc - 0.3), fade: a.pl.own ? 0 : 0.1, speed: 1.25, follow: true, mirror: isL(S) });
}
// удар бота: в системе координат его атаки (ворота на z = 0) — та же функция удара, что у игрока
function fireBotStrike(a) {
  const s = a.ai.strike; a.ai.strike = null;
  const shoot = (tx) => { const ang = Math.max(-1.6, Math.min(1.6, tx / GW)) * BP.CFG.shot.stickAngle, aim = { x: Math.sin(ang), y: Math.cos(ang) };
    const sv0 = BP.shotVelocity(B, a.P, aim, Math.min(0.92, s.pw * (a.pl.shotK || 1)), 'drive', goalDef(), 0), ob = offBalance(a.P, sv0);
    const sv = spreadShot(sv0, (a.pl.shotErr || 0) + 0.07 * ob);
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
    const bots = mates.filter((x) => x.id !== 'me' && zoneOk(x)).concat(zoneOk(a) ? [a] : []).sort((x, y) => dC(x.P) - dC(y.P)), me = mates.find((x) => x.id === 'me'), meNear = me && dC(me.P) < 6;
    // давит один и тот же, пока другой не оказался заметно (на 1,5 м) ближе — без смены каждые 0,2 с
    const PR = MT.press || (MT.press = [null, null]); let pr = bots[0]; const cur = bots.find((x) => x.id === PR[team]);
    if (cur && pr && cur !== pr && dC(cur.P) < dC(pr.P) + 1.5) pr = cur; PR[team] = pr ? pr.id : null;
    const rank = a === pr ? 0 : bots.filter((x) => x !== pr).indexOf(a) === 0 ? 1 : 2;
    let role = !zoneOk(a) ? 'form' : meNear ? (rank === 0 ? 'cover' : 'form') : rank === 0 ? 'press' : rank === 1 ? 'cover' : 'form';
    if (team === 0 && btn.second && carrier && carrier.team !== team && a === pr) role = 'press'; // «2-й защитник» (держу кнопку) — давит, даже если я рядом
    if (role === 'form') return formation(a, foes, false);
    ai.role = role;
  }
  const m = NSIDE > 3 ? (mates.filter((x) => x.id !== 'me').sort((x, y) => dC(x.P) - dC(y.P))[0] || mates[0]) : mates[0];
  const presser = NSIDE > 3 ? ai.role === 'press' : (team === 0 && btn.second && (m.id === 'me' || dC(P) <= dC(m.P))) || !m || (ai.role === 'press' ? dC(P) < dC(m.P) + 2 : dC(P) + 2 < dC(m.P)) || (m.id === 'me' && !(btn.press) && dC(P) < dC(m.P) + 1.5 && dC(m.P) > 6);
  ai.role = presser ? 'press' : 'cover';
  if (presser) {
    const gx = G.x - C.x, gz = G.z - C.z, gl = Math.hypot(gx, gz) || 1, d = dC(P), off = d > 3 ? 1.3 : 0.75, lead = carrier && d > 2 ? Math.min(0.6, d / 8) : 0;
    ai.tx = C.x + (carrier ? carrier.P.v.x * lead : 0) + (gx / gl) * off; ai.tz = C.z + (carrier ? carrier.P.v.z * lead : 0) + (gz / gl) * off; // наперерез: где владелец будет чуть позже
    ai.sprint = d > 3.5; ai.pace = d < 2 ? 0.75 : 1;
    if (carrier && carrier.team !== team && d < 2.6) {
      const bx = B.p.x - P.p.x, bz = B.p.z - P.p.z, bl = Math.hypot(bx, bz) || 1, face = (bx * Math.sin(P.yaw) + bz * Math.cos(P.yaw)) / bl;
      // со спины владельца бот в отбор почти не идёт (забегает спереди — presser целится между мячом и воротами)
      const Oc = carrier.P, rbx = P.p.x - Oc.p.x, rbz = P.p.z - Oc.p.z, frontC = (Math.sin(Oc.yaw) * rbx + Math.cos(Oc.yaw) * rbz) / (Math.hypot(rbx, rbz) || 1);
      if (bl < 2.2 && face > 0.3 && Math.random() < DF(team).tackle * (frontC < -0.4 ? 0.25 : 1)) tryTackle(a);
    }
    // свои (своя модель) иногда подкатываются с 2,5–3,8 м, если бегут на владельца
    if (carrier && carrier.team !== team && a.pl.own && d >= 2.5 && d < 3.8 && Math.hypot(P.v.x, P.v.z) > 3 && Math.random() < DF(team).tackle * 0.08) {
      const bx = B.p.x - P.p.x, bz = B.p.z - P.p.z, face = (bx * Math.sin(P.yaw) + bz * Math.cos(P.yaw)) / (Math.hypot(bx, bz) || 1);
      if (face > 0.7) trySlide(a);
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
  if (!MATCH_ON || !btn.press || state !== 'play' || Math.hypot(inp.x, inp.y) > 0.25) return inp; // джойстик — рывок туда, куда ведёшь
  const carrier = owning() ? actorOf(B.owner) : null; if (!carrier || carrier.team === 0) return inp;
  const C = carrier.P.p, G = { x: 0, z: MATCH.L }, gx = G.x - C.x, gz = G.z - C.z, gl = Math.hypot(gx, gz) || 1, d = Math.hypot(C.x - P.p.x, C.z - P.p.z);
  const tx = C.x + (gx / gl) * (d > 3 ? 1.2 : 0.7) - P.p.x, tz = C.z + (gz / gl) * (d > 3 ? 1.2 : 0.7) - P.p.z, tl = Math.hypot(tx, tz);
  if (tl < 0.15) return { x: 0, y: 0 };
  P.sprint = d > 3.5; const k = Math.min(1, tl / 1.2) * (d < 2 ? 0.8 : 1);
  return { x: (tx / tl) * k, y: (-tz / tl) * k };
}
const matchDef = () => MATCH_ON && run && state === 'play' && ownerTeam() === 1; // мяч у соперников — кнопки «Отбор» и «Прессинг»
// пас в пути: мяч свободен, отдан своему (кому — run.passTo), летит к точке паса, прошло не больше 3 с.
// Получатель выходит к мячу сам (и я, и бот), остальные партнёры на этот мяч не бегут.
function passInFlight() {
  const pt = run && run.passTo; if (!pt || B.state !== 'free' || simT - pt.t > 3) return null;
  const vx = B.v.x, vz = B.v.z, sp = Math.hypot(vx, vz), dx = pt.tgt.x - B.p.x, dz = pt.tgt.z - B.p.z, dl = Math.hypot(dx, dz);
  if (sp > 1.5 && dl > 1.5 && (vx * dx + vz * dz) / (sp * dl) < 0.6) { // мяч ушёл не к точке паса: отскок — уже не пас;
    // но если он прошёл точку и летит на самого адресата (тот убежал дальше по ходу) — пас ещё в пути
    const ra = actors().find((q) => q.pl === pt.id), qx = ra ? ra.P.p.x - B.p.x : 0, qz = ra ? ra.P.p.z - B.p.z : 0, ql = Math.hypot(qx, qz);
    if (!ra || (ql > 1.2 && (vx * qx + vz * qz) / (sp * ql) < 0.9) || ql > 25) { if (TRACE) console.log("passOff", JSON.stringify({ ra: !!ra, ql: +ql.toFixed(2), c: ra ? +((vx * qx + vz * qz) / (sp * ql)).toFixed(2) : null, t: +(simT - pt.t).toFixed(2), id: ra && ra.id, rp: ra && [+ra.P.p.x.toFixed(1), +ra.P.p.z.toFixed(1)], b: [+B.p.x.toFixed(1), +B.p.z.toFixed(1)], v: [+vx.toFixed(1), +vz.toFixed(1)] })); run.passTo = null; return null; } }
  return pt;
}
// адресат паса принимает мяч низом, дошедший до ноги, при любой разумной скорости (сильный пас — тяжелее касание)
function passCatch(P, id) {
  if (B.state !== 'free' || B.p.y > 0.5 || (B.lockOwner === id && (simT < B.lockUntil || B.mustClear))) return false;
  const cp = BP.controlPoint(P, null), d = Math.min(Math.hypot(B.p.x - cp.x, B.p.z - cp.z), Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z));
  if (BP.overtaking(B, P) || BP.atHeels(B, P)) return false; // мяч догоняет бегущего сзади — принимаем, когда выкатится к ноге, а не за спиной
  return d < 0.85 && Math.hypot(B.v.x - P.v.x, B.v.z - P.v.z) < 24;
}
// Ничейный мяч низом дошёл до ног игрока (спереди, сбоку или сзади) на разумной скорости — игрок его принимает
// (запись приёма), а не отбивает телом. Раньше брался только мяч перед стопой и не быстрее 9 м/с: остальное
// отскакивало от ног и корпуса (жалоба: «мяч тупо отскакивает, они его не принимают»).
function feetCatch(a) {
  if (B.state !== 'free' || B.p.y > 0.4 || isDown(a.pl) || (B.lockOwner === a.id && (simT < B.lockUntil || B.mustClear))) return false;
  if (passInFlight()) return false; // пас в пути: адресат — passCatch, соперник — interceptOk, остальные свои пропускают
  const rx = B.p.x - a.P.p.x, rz = B.p.z - a.P.p.z, d = Math.hypot(rx, rz), rel = Math.hypot(B.v.x - a.P.v.x, B.v.z - a.P.v.z);
  // мяч догоняет игрока сзади — ждём, пока выкатится к ноге (иначе приём «за спиной»: касание в ход шло бы сквозь тело)
  if (BP.overtaking(B, a.P)) return false;
  return d < 0.62 && rel < 16;
}
// запись приёма: стоит — остановка подошвой (receive), бежит — приём на ходу (receive_soccerball: нога гасит мяч
// на ≈0,47 с записи — начинаем с этого места, касание на экране совпадает с изменением скорости мяча)
function receiveAnim(a, vin, intent) {
  const pl = a.pl; if (pl.name === 'strike' || pl.name === 'pass' || pl.mv || vin < 2.5) return;
  const sp = Math.hypot(a.P.v.x, a.P.v.z);
  if (sp < 1.2 && !intent) { play(pl, 'receive', { t: 0.65, fade: 0.1, speed: 1.35, follow: true }); pl.once = { name: 'receive', until: 1.2 }; }
  else if (clipOf('receive_soccerball')) { play(pl, 'receive_soccerball', { t: 0.4, fade: 0.15, speed: 1.2, follow: true }); pl.once = { name: 'receive_soccerball', until: 0.85, run: true }; }
}
// игрок лежит (подкат, падение) — мяч не берёт и не застревает в нём
const isDown = (pl) => (pl.mv && SLIDE[pl.mv.name] && pl.t > SLIDE[pl.mv.name].win[0]) || pl.name === 'soccer_trip' || pl.name === 'fallen_idle' || pl.name === 'standing_up';
function interceptOk(P, id) {
  if (B.state !== 'free' || B.p.y > 0.45 || (B.lockOwner === id && (simT < B.lockUntil || B.mustClear))) return false;
  const cp = BP.controlPoint(P, null), rx = B.p.x - P.p.x, rz = B.p.z - P.p.z;
  if (rx * Math.sin(P.yaw) + rz * Math.cos(P.yaw) < -0.1) return false; // мяч за спиной — не перехватить
  // только мяч прямо у ноги (0,35 м): матч ботов с 0,5 м — 8 перехватов из 19 пасов (было 1 из 17)
  return Math.min(Math.hypot(B.p.x - cp.x, B.p.z - cp.z), Math.hypot(rx, rz)) < 0.35 && Math.hypot(B.v.x - P.v.x, B.v.z - P.v.z) < 26;
}
// автоподбор в матче — только если мяч рядом или я ближе партнёра (или пас идёт мне)
function matchChaseOk() {
  if (!MATCH_ON) return true; if (MT.back) return false; if (MT.restart && MT.restart.taker !== 'me') return false;
  const pt = passInFlight(); if (pt && pt.team === 0) return pt.id === shooter;
  const P = run.P, d = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z), M = actorOf(nearestAlly()).P, dm = Math.hypot(B.p.x - M.p.x, B.p.z - M.p.z);
  return d < 9 || d < dm + 1;
}
// ---- шаг матча ----
function matchPhys(h) {
  if (run.swapNow) { if (run.swapTo === '-') { run.swapNow = false; run.swapTo = null; } else { swapControl(run.swapTo || 'mate'); run.chasePlan = null; holdAfterPass(); } } // пас вратарю — управление остаётся
  const P = run.P, live = state === 'play', A = actors();
  for (const a of A) { a.P.spd = a.pl.spd || 1; a.P.accK = a.pl.accK || 1; a.P.dribK = a.pl.dribK || 1; }
  if (state === 'goal') { celebrateStep(h); gkTick(h); matchRules(h); for (const j of [0, 1]) withGK(j, () => keeperAI(h)); return; } // гол: празднование, мяч в сетке
  P.sprint = btn.sprint || keys.ShiftLeft || keys.ShiftRight; P.charging = run.charge >= 0; P.face = null; // управляемый — корпус по ходу
  if (AUTOPLAY) botStep(A[0], h); else {
    const raw = input(), i1 = live ? passInput() : raw, i2 = live ? chaseInput(P, i1, h) : i1;
    let inp = live ? pressInput(P, i2) : { x: 0, y: 0 }; const i3 = inp;
    if (run.meAI.slowT > 0) { inp = { x: inp.x * 0.5, y: inp.y * 0.5 }; P.sprint = false; }
    if (live) inp = stepToBall(P, inp, 'me');
    if (TRACE) { // кто в этом шаге задал движение управляемого игрока (для проверки «один источник за шаг»)
      const ne = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1e-3, src = [];
      if (ne(raw, i1)) src.push('hold'); if (ne(i1, i2)) src.push('chase'); if (ne(i2, i3)) src.push('press'); if (ne(i3, inp)) src.push(run.meAI.slowT > 0 ? 'slow' : 'step');
      if (P.drive) src.push('drive'); run.dbgSrc = src.length ? src.join('+') : 'joy'; run.dbgInp = [+inp.x.toFixed(2), +inp.y.toFixed(2)]; run.dbgRaw = [+raw.x.toFixed(3), +raw.y.toFixed(3)]; }
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
  if (run.queue && run.queue.settle && B.state === 'owned' && B.owner === 'me' && !run.pass && !run.strike) { if (simT - run.queue.t > 1.0) run.queue = null; else if (ballAtFoot()) runQueue(); } // мяч ещё подкатывается к ноге — ждём до 1 с
  const own = owning() ? actorOf(B.owner) : null;
  if (own) {
    const near = (a) => Math.abs(a.P.p.x - B.p.x) < 3 && Math.abs(a.P.p.z - B.p.z) < 3; // мяч упирается только в тех, кто рядом
    const obs = A.filter((a) => a.team !== own.team && near(a)).flatMap((a) => a.pl.sph || []).concat(GK[gkOfTeam(1 - own.team)].pl.sph || []);
    if (BP.controlStep(B, own.P, h, obs) === 'lost') { sfx.touch(); cancelOwnerAction(own.id); if (TRACE) console.log('lostBody', JSON.stringify({ id: own.id, sp: +Math.hypot(own.P.v.x, own.P.v.z).toFixed(1) })); }
    else if (own.id === 'me') {
      if (run.fire) { run.fire = false; if (run.strike) { fireStrike(); MT.last = 0; } }
      if (run.passFire) { run.passFire = false; if (run.pass) { const r = run.pass.recv || pickReceiver(P, input(), false, true); run.swapTo = r.id; if (firePass(P, 'me', run.pass, r.P)) { MT.last = 0; if (r.id === 'gk2') { MT.back = { t: simT }; run.swapTo = '-'; } } } run.pass = null; }
      if (run.meAI.sfire) { run.meAI.sfire = false; if (run.meAI.strike) fireBotStrike(own); } // только в автоигре для проверки
    } else {
      const ai = own.ai;
      if (ai.fire) { ai.fire = false; if (ai.pass) { const r = ai.pass.recv || A.find((x) => x.team === own.team && x !== own); firePass(own.P, own.id, ai.pass, r.P); ai.pass = null; MT.last = own.team; } }
      if (ai.sfire) { ai.sfire = false; if (ai.strike) fireBotStrike(own); }
    }
  } else if (B.state === 'free' && live && MT.st === 'play' && !aerialControl() && !tryHeader()) { // приём: берёт тот, кто ближе (на розыгрыше — только подающий)
    let best = null, bd = 1e9;
    for (const a of A) {
      if (MT.restart && MT.restart.kind !== 'kickoff' && MT.restart.taker !== a.id && MT.restart.t < 6) continue;
      if (MT.back && a.team === 0) continue; // пас своему вратарю идёт мимо своих
      if (a.pl.mv && SLIDE[a.pl.mv.name] && a.pl.t > SLIDE[a.pl.mv.name].win[0]) continue; // лежит в подкате — мяч не берёт
      { const pt = passInFlight(); if (pt && pt.team === a.team && pt.id !== a.pl && Math.hypot(B.v.x, B.v.z) > 2.5) continue; } // пас другому своему — пропускает мяч
      // кому адресован пас — принимает и чуть шире (мяч прошёл рядом, в метре от ног): помощь при приёме, как в FC
      // адресат принимает любой пас низом, дошедший до ноги (как в FC Mobile): раньше при встречной скорости > 13 м/с мяч
      // проходил сквозь него (свои на время паса «прозрачны»), пас заканчивался — и мяч отскакивал от тел
      const pt = passInFlight(), mine = pt && pt.id === a.pl && passCatch(a.P, a.id);
      // адресат принимает мяч у самой ноги: пока мяч ещё подкатывается — ждём (раньше «ловил» за 0,85 м — скорость мяча
      // менялась без касания, и пас сразу после приёма не доставал мяч). Мяч проходит мимо — приём в ближайшей точке.
      if (mine) { const cp = BP.controlPoint(a.P, null), dc = Math.hypot(B.p.x - cp.x, B.p.z - cp.z), prev = a.P.recvD; a.P.recvD = dc; const reach = a.id === 'me' && oneTouchQ() ? BP.CFG.shot.contactR : 0.45; if (dc > reach && (prev === undefined || dc < prev - 1e-4)) continue; }
      // соперник на линии паса перехватывает мяч, прошедший у самой его ноги (пас быстрый — обычный приём его не берёт,
      // и без этого пас проходил бы «сквозь» защитника)
      const cut = !mine && pt && pt.team !== a.team && interceptOk(a.P, a.id);
      if (!mine && !cut && !BP.canCapture(B, a.P, a.id, simT) && !feetCatch(a)) continue;
      if (!cut && (BP.overtaking(B, a.P) || BP.atHeels(B, a.P))) continue; // мяч у пяток или догоняет сзади — ногой его ещё не взять
      const d = Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z); if (d < bd) { bd = d; best = a; }
    }
    if (best && checkOffside(best)) best = null; // принял, стоя вне игры, — свисток
    if (best) {
      if (TRACE) { const pt = run.passTo; console.log('capEv', JSON.stringify({ id: best.id, intended: pt ? pt.id === best.pl : null, rel: +Math.hypot(B.v.x - best.P.v.x, B.v.z - best.P.v.z).toFixed(1), vin: +Math.hypot(B.v.x, B.v.z).toFixed(1), psp: +Math.hypot(best.P.v.x, best.P.v.z).toFixed(1), dt: pt ? +(simT - pt.t).toFixed(2) : null })); }
      statGot(best.team); run.passTo = null; if (best.id === 'me') run.meTouchT = simT;
      if (best.pl.mv && !SLIDE[best.pl.mv.name]) endMove(best.pl, best.P); // приём прерывает разворот/остановку: дальше — управление
      // пас нажат заранее (пока мяч летел ко мне) — в одно касание: мяч дошёл до ноги — сразу уходит дальше, без остановки
      // и без подтягивания к ноге; нога в этот момент — в точке касания записи паса. Мяч прошёл мимо ноги — обычный приём и пас.
      const cpq = BP.controlPoint(best.P, null), q1 = best.id === 'me' && oneTouchQ() && Math.hypot(B.p.x - cpq.x, B.p.z - cpq.z) <= BP.CFG.shot.contactR ? run.queue : null;
      best.P.recvD = undefined;
      if (q1) {
        run.queue = null; BP.capture(B, best.P, 'me'); run.holdInp = null;
        const r = q1.recv && q1.recv.id !== 'me' ? q1.recv : pickReceiver(best.P, input(), false, true, q1.power), S = passOf(shooter, leftNow());
        play(shooter, 'pass', { t: Math.max(0, S.tc - 0.03), fade: 0.03, speed: 1.15, follow: true, mirror: isL(S) });
        run.swapTo = r.id; if (TRACE) console.log('oneTouch', JSON.stringify({ t: +simT.toFixed(2), wait: +(simT - q1.t).toFixed(2) }));
        if (firePass(best.P, 'me', { power: q1.power, kind: q1.k, at: q1.at || null, S }, r.P)) { if (r.id === 'gk2') { MT.back = { t: simT }; run.swapTo = '-'; } }
        MT.last = best.team; if (MT.restart && MT.restart.kind !== 'kickoff') MT.restart = null;
      } else {
      // джойстик держат по ходу мяча (как пасующий вёл) — приём сразу в движение (урок FC Mobile, 0:45: принял и повёл дальше);
      // в другую сторону — мягко у ноги, потом разворот
      let ji = best.id === 'me' ? passInput() : null;
      if (best.id === 'me' && run.holdInp && Math.hypot(ji.x, ji.y) < 0.2) {
        const r = input(), rl = Math.hypot(r.x, r.y), bl = Math.hypot(B.v.x, B.v.z) || 1, Q = best.P, qs = Math.hypot(Q.v.x, Q.v.z);
        const hx = qs > 1.5 ? Q.v.x / qs : Math.sin(Q.yaw), hz = qs > 1.5 ? Q.v.z / qs : Math.cos(Q.yaw); // куда получатель уже бежит (или смотрит)
        // только если и мяч, и сам получатель идут туда же: стоящий лицом к мячу не уводит его себе за спину (замер: потеря в серии пасов)
        if (rl > 0.3 && (r.x * B.v.x - r.y * B.v.z) / (rl * bl) > 0.35 && (r.x * hx - r.y * hz) / rl > 0.3) { ji = r; run.holdInp = null; }
      }
      // пас уже нажат (ждёт касания), а в одно касание не вышло — мягкий приём у ноги: мяч не убегает, пас сразу следом
      // (раньше касание по джойстику отправляло мяч вперёд быстрее игрока, и команда паса истекала)
      const queuedPass = best.id === 'me' && run.queue && run.queue.kind === 'pass';
      const intent = best.id === 'me' ? (!queuedPass && Math.hypot(ji.x, ji.y) > 0.2 ? { x: ji.x, z: -ji.y } : null) : botIntent(best);
      const vin = Math.hypot(B.v.x, B.v.z), rel = BP.firstTouch(B, best.P, best.id, intent); sfx.touch(); if (best.id === 'me' && rel > 5) sfx.buzz('light');
      // приём паса на месте или шагом — запись приёма: наклон и остановка мяча стопой (receive, с 0,65 с)
      receiveAnim(best, vin, intent);
      MT.last = best.team; if (MT.restart && MT.restart.kind !== 'kickoff') MT.restart = null;
      if (best.ai) { best.ai.holdT = 0; best.ai.pass = null; best.ai.strike = null; }
      if (best.id === 'me') runQueue(); else run.queue = null;
      }
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
  if (TRACE && window.__openOn && owning() && state === 'play') openStat(A);
  autoSwitch(ot, A);
  MT.prevOT = ot; if (ot >= 0 && live) MST().poss[ot] += h;
  matchRules(h);
}
// Автосмена в обороне (мяч у соперников или ничей): переключает на того, кто раньше всех успеет к мячу (подробности — ниже).
function autoSwitch(ot, A) {
  if (AUTOPLAY || run.strike || run.pass || state !== 'play' || MT.back || (MT.restart && MT.restart.team === 0)) return;
  if (ot === 0 || B.state === 'held') return;
  { const pt = passInFlight(); if (pt && pt.team === 0) return; } // наш пас в пути — управление у получателя, пока мяч не дойдёт (раньше через 0,9 с полёта могло перескочить на другого)
  // Как в FC Mobile: управление само переходит, когда мяч перешёл к соперникам или соперник отдал пас (событие);
  // в остальное время — только если другой успевает к мячу заметно раньше (на 1 с) и мой не рядом с мячом.
  // Замер до правки (оборона без ввода): 12–17 смен в минуту, 1–2 раза за 25 с управление прыгало обратно на того же.
  const sinceSwap = simT - (run.swapT ?? -9);
  const oppPass = B.state === 'free' && B.lockOwner && teamOf(B.lockOwner) === 1 && B.lockOwner !== run.lastOppPass;
  const event = (ot === 1 && MT.prevOT !== 1) || oppPass;
  if (oppPass) run.lastOppPass = B.lockOwner;
  if (sinceSwap < (event ? 0.6 : 1.5)) return;
  if (!event && (run.swapChk = (run.swapChk || 0) - BP.CFG.dt) > 0) return;
  run.swapChk = 0.25;
  const me = A[0], myC = switchCost(me); let best = null, bc = 1e9;
  for (const a of A) { if (a.team !== 0 || a.id === 'me') continue; const c = switchCost(a); if (c < bc) { bc = c; best = a; } }
  if (!best) return;
  const i = input(), il = Math.hypot(i.x, i.y), bx = B.p.x - me.P.p.x, bz = B.p.z - me.P.p.z, bl = Math.hypot(bx, bz) || 1;
  const toBall = il > 0.3 && (i.x * bx - i.y * bz) / (il * bl) > 0.5;
  if (!event && bl < 6) return; // мой рядом с мячом — не отбираем
  // не возвращаться на только что оставленного игрока (≤ 2,5 с), если он не лучше заметно (на 1,2 с)
  const back = run.prevMe && best.pl === run.prevMe.pl && simT - run.prevMe.t < 2.5;
  const need = (event ? 0.35 : toBall ? 1.6 : 1.0) + (back ? 1.2 : 0);
  if (bc + need < myC) { run.prevMe = { pl: me.pl, t: simT }; swapControl(best.id); run.chasePlan = null; run.swapT = simT; }
}
// ---- приём мяча на лету (0,3–1,2 м: ниже головы, выше стопы) ----
// Раньше такой мяч просто отскакивал от ног и корпуса. Теперь: кто встретит мяч (по прогнозу — через 0,05–0,35 с, в 0,6 м
// от себя), заранее начинает запись приёма так, чтобы колено/бедро было у мяча в момент встречи: ниже 0,75 м — правым
// коленом (kneeing_soccerball_2, касание 0,33 с), выше — левым бедром (kneeing_soccerball, 0,57 с). В момент касания мяч
// гасится и падает к ногам, дальше — обычный приём с земли.
const AER = { lo: ['kneeing_soccerball_2', 0.33], hi: ['kneeing_soccerball', 0.57], speed: 1.2 };
function aerialControl() {
  const S = MT.aer;
  if (S) { // запланированное касание
    if (B.state !== 'free') { MT.aer = null; return false; }
    if (simT < S.t) return true;
    MT.aer = null; const a = S.a, P = a.P, d = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z);
    if (d > 1.15 || B.p.y > 1.45 || B.p.y < 0.15) return false; // разминулись — дальше как обычно
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    B.v.set(P.v.x * 0.85 + fx * 0.6, Math.min(0, B.v.y) * 0.15 - 0.8, P.v.z * 0.85 + fz * 0.6); B.w.set(0, 0, 0); B.lockOwner = null; B.mustClear = false;
    MT.last = a.team; statGot(a.team); if (run.passTo && run.passTo.team !== a.team) run.passTo = null; sfx.touch(); a.pl.aerT = simT + 0.45; // тело не отбивает погашенный мяч, пока он падает к ногам
    if (TRACE) console.log('aerial', JSON.stringify({ id: a.id, y: +B.p.y.toFixed(2), d: +d.toFixed(2), clip: S.clip }));
    return true;
  }
  if (B.p.y < 0.35 || B.p.y > 2.4) return false;
  const pt = passInFlight(), g = BP.CFG.g; let best = null;
  for (const a of actors()) {
    if (B.lockOwner === a.id && (simT < B.lockUntil || B.mustClear)) continue;
    if (isDown(a.pl) || a.pl.mv || a.pl.name === 'strike' || a.pl.name === 'pass') continue;
    if (MT.restart && MT.restart.kind !== 'kickoff' && MT.restart.taker !== a.id && MT.restart.t < 6) continue;
    if (MT.back && a.team === 0) continue;
    if (pt && pt.team === a.team && pt.id !== a.pl) continue; // пас другому своему — пропускает
    const rx = B.p.x - a.P.p.x, rz = B.p.z - a.P.p.z, ux = B.v.x - a.P.v.x, uz = B.v.z - a.P.v.z, uu = ux * ux + uz * uz; if (uu < 1) continue;
    const tca = -(rx * ux + rz * uz) / uu; if (tca < 0.05 || tca > 0.42) continue;
    const md = Math.hypot(rx + ux * tca, rz + uz * tca); if (md > 0.7) continue;
    const yAt = B.p.y + B.v.y * tca - 0.5 * g * tca * tca; if (yAt < 0.3 || yAt > 1.2 || Math.sqrt(uu) > 16) continue;
    if (!best || tca < best.tca) best = { a, tca, yAt };
  }
  if (TRACE && window.__aerDbg) { const a = actorOf('me'); if (a) { const rx = B.p.x - a.P.p.x, rz = B.p.z - a.P.p.z, ux = B.v.x - a.P.v.x, uz = B.v.z - a.P.v.z, uu = ux * ux + uz * uz, tca = -(rx * ux + rz * uz) / uu; window.__aerDbg.push([+simT.toFixed(2), +B.p.y.toFixed(2), +Math.hypot(rx, rz).toFixed(2), +tca.toFixed(2), +Math.hypot(rx + ux * tca, rz + uz * tca).toFixed(2), +(B.p.y + B.v.y * tca - 4.9 * tca * tca).toFixed(2), a.pl.name, !!a.pl.mv, isDown(a.pl)]); } }
  {
  }
  if (!best) return false;
  const [clip, cT] = best.yAt < 0.75 ? AER.lo : AER.hi, a = best.a;
  play(a.pl, clip, { t: Math.max(0, cT - best.tca * AER.speed), fade: 0.06, speed: AER.speed, follow: true }); a.pl.once = { name: clip, until: cT + 0.3 };
  // лицом к мячу
  a.P.yaw = Math.atan2(B.p.x - a.P.p.x, B.p.z - a.P.p.z); a.P.lockYaw = best.tca + 0.15;
  MT.aer = { a, t: simT + best.tca, clip };
  return true;
}
// ---- удар головой ----
// Высокий мяч (≈1,2–2,6 м) рядом с игроком: в чужой штрафной — головой по воротам (я — в сторону джойстика, бот — в дальний угол),
// у своих ворот — вынос вперёд, в остальных местах — скидка партнёру (бот) или приём головой себе под ноги (я).
function tryHeader() {
  if (B.p.y < 1.2 || B.p.y > 2.85 || B.v.y > 2.5 || simT - (MT.headT ?? -9) < 0.35) return false;
  // рост: высокий в прыжке достаёт мяч выше (180 см — до 2,56 м) и в борьбе за верховой мяч опережает низкого
  let best = null, bd = 1.05;
  for (const a of actors()) {
    if (B.lockOwner === a.id && (simT < B.lockUntil || B.mustClear)) continue;
    if (MT.restart && MT.restart.kind !== 'kickoff' && MT.restart.taker !== a.id && MT.restart.t < 6) continue;
    if (MT.back && a.team === 0) continue;
    const hm = (a.pl.hcm || 180) / 100; if (B.p.y > hm * 1.42) continue;
    const d = Math.hypot(B.p.x - a.P.p.x, B.p.z - a.P.p.z) - (hm - 1.8) * 1.2; if (d < bd) { bd = d; best = a; }
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
  B.w.set(0, 0, 0); B.lockOwner = a.id; B.lockUntil = simT + (kind === 'cushion' ? 0.25 : 0.35); B.mustClear = false; BP.clearGoalFlags(B); if (kind === 'cushion') a.pl.aerT = simT + 0.6; // мяч падает к ногам — тело его не отбивает
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
const MST = () => MT.stats || (MT.stats = { poss: [0, 0], shots: [0, 0], on: [0, 0], passes: [0, 0], passOk: [0, 0], tackles: [0, 0], off: [0, 0], corners: [0, 0], heads: [0, 0], fouls: [0, 0], yellow: [0, 0], red: [0, 0], lost: { int: 0, head: 0, out: 0, gk: 0, free: 0 }, goals: [] });
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
  if (R0.team === 0 && tk.id !== 'me') { swapControl(tk.id); tk = actorOf('me'); } // свой розыгрыш (штрафной, пенальти, угловой) — подаю сам
  MT.restart = { kind: R0.kind, team: R0.team, taker: tk.id, t: 0, x: R0.x, z: R0.z };
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
    // глубина места → сколько метров от центральной линии назад: нападающий ~1,5 м, полузащитник ~16, защитник ~26
    // (раньше всё, что глубже середины, ставилось на 1,5 м от центра — полкоманды стояло кучей и потом разбегалось)
    const F = formOf(), placeHome = (a, h, kicking) => { let x = h[0], back = Math.max(1.5, Math.min(L / 2 - 14, (0.86 - h[1]) * (NSIDE > 3 ? 45 : 22))); if (!kicking) { const r = Math.hypot(x, back); if (r < 9.6) { const k = 9.6 / (r || 1); x *= k; back = Math.max(back * k, 2); } } lay(a, x, back); };
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
    ['Точность передач', acc(0), acc(1), S.passes[0] ? (S.passOk[0] / S.passes[0]) * 100 : 0, S.passes[1] ? (S.passOk[1] / S.passes[1]) * 100 : 0], ['Отборы', S.tackles[0], S.tackles[1]], ['Угловые', S.corners[0], S.corners[1]], ['Фолы', S.fouls[0], S.fouls[1]], ['Жёлтые карточки', S.yellow[0], S.yellow[1]], ['Красные карточки', S.red[0], S.red[1]]];
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
// Кнопки — как в FC Mobile (запись матча пользователя). Атака: «Пас», «Вразрез», сверху «Выбить» на своей половине и
// «Удар» ближе к чужим воротам, большая «Рывок и навык». Оборона: «Смена», «2-й защ.», «Подкат», «Рывок и отбор».
function matchButtons() {
  const gm = gkMine(), def = !gm && matchDef(), sl = def && slideOk(); $('#b-shot').classList.toggle('off', def && !sl); $('#b-thru').classList.remove('off');
  const far = !def && run && depthOf(0, run.P.p.z) > MATCH.L * 0.5; // на своей половине — «Выбить»
  const key = gm ? 'gk' : def ? 'def' : far ? 'att-far' : 'att'; if (key === defShown) return; defShown = key;
  const lab = (id, t) => { const b = $(id); if (!b) return; const n = [...b.childNodes].find((x) => x.nodeType === 3 && x.nodeValue.trim()); if (n) n.nodeValue = t; };
  lab('#b-shot', def ? 'Подкат' : far ? 'Выбить' : 'Удар'); lab('#b-pass', gm ? 'Отдать пас' : def ? 'Смена' : 'Пас');
  lab('#b-thru', def ? '2-й\nзащ.' : 'Вразрез'); lab('#b-run', def ? 'Рывок\nи\nотбор' : 'Рывок\nи\nнавык');
  $('#pad').classList.toggle('def', def); $('#pad').classList.toggle('gkm', gm);
}
function resetMatch() {
  MT.score = [0, 0]; MT.clock = MATCH.time; MT.st = 'play'; MT.restart = null; MT.gkHold = null; MT.next = null; MT.shown = ''; MT.stats = null; MT.off = null; MT.back = null; MT.passPend = null; MT.shotPend = null;
  const L = MATCH.L; GK[0].kc = Object.assign({}, DIFF.gk); const mk = (pl, kit, id) => { recolor(pl, kit); pl.holder.visible = true; pl.off = false; pl.yc = 0; if (pl.sph) pl.sph.forEach((q) => (q.who = id)); play(pl, 'idle', { loop: true, fade: 0.2, follow: true }); resetSpheres(pl); };
  if (shooter0 && shooter !== shooter0) shooter = shooter0;
  // места: наши — me (shooter), mate (wall[0]), t2… (wall[1…N−3]); соперники o1… (дальше); наш вратарь — последняя модель
  const N = NSIDE, ourW = wall.slice(0, N - 2), oppW = wall.slice(N - 2, 2 * N - 3), gk2 = wall[wall.length - 1];
  // кто есть кто: имена и характеристики с карточек (у соперников — средние, скорость — по сложности); при смене имя едет с моделью
  const card = (pl, c, k = 1, pos = '', kit = null, num = 0) => { pl.nick = c ? c.name : 'Игрок клуба'; faceFor(pl); cardStats(pl, c ? c.st : null, k); setHeight(pl, heightOf(c, pos || (c && c.pos)), c && c.st ? c.st[5] : 65);
    backPrint(pl, c && c.name !== 'Гость' && c.name !== 'Игрок клуба' ? c.name : '', (c && c.num) || num, kit); };
  const bot = (pl, id, home) => ({ id, pl, home, P: BP.newPlayer({ x: 0, z: L / 2 }, 0), st: 'support', hold: 0, pass: null, fire: false, plan: null, planT: 0, pick: -1, pickT: 0, tkCd: 0, slowT: 0 });
  mk(shooter, myKit || KIT_US, 'me'); card(shooter, LINEUP[0], 1, '', myKit || KIT_US, numFor(LINEUP[0], 9));
  const GUEST_H = [178, 184, 187, 175, 182, 189, 180, 176, 186, 183]; // рост гостей (своих карточек у них нет)
  const ours = ourW.map((pl, i) => { const id = i === 0 ? 'mate' : 't' + (i + 1); mk(pl, myKit || KIT_US, id); card(pl, LINEUP[i + 1], 1, '', myKit || KIT_US, numFor(LINEUP[i + 1], [7, 11, 8, 6, 10, 3, 2, 4, 5][i % 9])); const b = bot(pl, id, i); b.hxy = hxyOf(LINEUP[i + 1]); return b; });
  ourW.forEach((pl, i) => skinTone(pl, i + 1)); // (меня — исходный тон)
  const opp = oppW.map((pl, i) => { const id = 'o' + (i + 1); mk(pl, KIT_THEM, id); skinTone(pl, i + 3); card(pl, { name: 'Гость', st: [76, 74, 73, 73, 70, 72], h: GUEST_H[i % GUEST_H.length] }, DIFF.spd, '', KIT_THEM, [9, 7, 11, 8, 6, 10, 3, 2, 4, 5][i % 10]); return bot(pl, id, i); });
  recolor(gk2, KIT_GK2); gk2.holder.visible = true; gk2.nick = LINEUP[N - 1] ? LINEUP[N - 1].name : 'Игрок клуба';
  setHeight(gk2, heightOf(LINEUP[N - 1], 'GK')); setHeight(GK[0].pl, 191);
  backPrint(gk2, LINEUP[N - 1] ? LINEUP[N - 1].name : '', (LINEUP[N - 1] && LINEUP[N - 1].num) || 1, KIT_GK2); backPrint(GK[0].pl, '', 1, GK[0].pl.kit || { shirt: '#e8d33a' }); // вратари: свой — по карточке, у гостей — 191 см
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
  $('#hint').textContent = 'Джойстик слева. «Удар»: держи — сила, оттяни вбок — подкрутка, вверх — переброс. «Пас» — тому, кто в сторону джойстика, зажми и потяни вверх — верхом. «На ход» — в разрез, вверх — верхом за спину защитникам. Мяч у соперника: «Отбор» — коротко, «Прессинг» — держи, «Подкат» — скольжение к мячу (до 5 м). Пас назад к своим воротам — вратарю (он примет ногой). Мяч у нашего вратаря — одна кнопка «Отдать пас»: джойстик — кому, вверх — далеко. Навес в штрафную — удар головой сам.';
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
    if (a.id !== 'mate') { bodyAnim(a.pl, a.P, dt, a.id); if (o.pass && !o.fire) { const c = passContact(a.pl, o.pass, a.P, a.id, dt); if (c === true) o.fire = true; else if (c === 'cancel') { const j = o.pass; o.pass = null; cancelPass(a.pl, a.id, j); } } }
    if (o.strike && a.pl.name === 'strike') { const c = strikeContact(a.pl, o.strike.S || STRIKE, o.strike); if (c === 'fire' || c === 'late') o.sfire = true; }
    if (a.id !== 'mate') lazySpheres(a.pl, a.P, dt);
  }
  if (run.meAI.strike && shooter.name === 'strike') { const c = strikeContact(shooter, run.meAI.strike.S || STRIKE, run.meAI.strike); if (c === 'fire' || c === 'late') run.meAI.sfire = true; }
  tickPlayer(GK[1].pl, dt); updSpheres(GK[1].pl, dt);
  withGK(1, () => { if (kick && !kick.dived && kick.t >= kick.react) keeperDive(); });
  matchHud(false); matchButtons(); minimap();
  if (NSIDE > 3 && (mm.n % 30) === 0) for (const a of actors()) { const near = Math.hypot(a.P.p.x - B.p.x, a.P.p.z - B.p.z) < 28; if (a.pl.shadowNear !== near) { a.pl.shadowNear = near; a.pl.model.traverse((o) => { if (o.isMesh) o.castShadow = near; }); } }
}
// мини-карта: поле, повёрнутое так же, как его показывает камера; точки — игроки (наши светлые, соперники красные,
// управляемый — бирюзовый), мяч — жёлтый. Перерисовывается через кадр, отдельным маленьким холстом.
const mm = { el: document.getElementById('minimap'), n: 0 }; mm.g = mm.el && mm.el.getContext('2d');
const MINIMAP = true;
const mmEl = $('#mmw'), mmMe = $('#mmMe'), mmOpp = $('#mmOpp');
// Мини-карта — как в FC Mobile: поле сверху (ворота слева и справа, как на экране), свои — белые точки, соперники —
// треугольники, я — жёлтый крестик, мяч — точка; под картой имена: мой игрок и ближайший к нему соперник
function minimap() {
  if (!MINIMAP || !mm.g || !MATCH_ON || !run) { if (mmEl) mmEl.classList.remove('on'); return; }
  mmEl.classList.toggle('on', state === 'play' || state === 'goal'); if (mm.n++ % 3) return;
  if (worldFlipped) return; // логика вратаря временно развернула мир — кадр пропускаем
  const W = mm.el.width, H = mm.el.height, g = mm.g, pad = 6;
  // как на экране (камера сбоку): вправо — к воротам z = 0, вверх — к дальней бровке (−x)
  const at = (x, z) => [pad + (1 - z / MATCH.L) * (W - 2 * pad), pad + ((x + MATCH.HW) / (2 * MATCH.HW)) * (H - 2 * pad)];
  g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(34,92,46,.62)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);
  const mid = at(0, MATCH.L / 2); g.beginPath(); g.moveTo(mid[0], pad); g.lineTo(mid[0], H - pad); g.stroke(); g.beginPath(); g.arc(mid[0], H / 2, (H - 2 * pad) * 0.13, 0, 7); g.stroke();
  for (const z of [0, MATCH.L]) { const a = at(-20, z), b = at(20, z + (z ? -16.5 : 16.5)); g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
  const me = actorOf('me'); let opp = null, od = 1e9;
  for (const a of actors()) {
    const [px, py] = at(a.P.p.x, a.P.p.z);
    if (a.team === 1) { const d = Math.hypot(a.P.p.x - me.P.p.x, a.P.p.z - me.P.p.z); if (d < od) { od = d; opp = a; }
      g.beginPath(); g.moveTo(px, py - 3.6); g.lineTo(px + 3.3, py + 2.6); g.lineTo(px - 3.3, py + 2.6); g.closePath(); g.strokeStyle = '#fff'; g.lineWidth = 1.3; g.stroke(); }
    else if (a.id !== 'me') { g.beginPath(); g.arc(px, py, 2.8, 0, 7); g.fillStyle = '#fff'; g.fill(); }
  }
  GK.forEach((k, j) => { const [px, py] = at(k.pl.holder.position.x, k.pl.holder.position.z); if (j === 1) { g.beginPath(); g.arc(px, py, 2.8, 0, 7); g.fillStyle = '#fff'; g.fill(); } else { g.beginPath(); g.moveTo(px, py - 3.6); g.lineTo(px + 3.3, py + 2.6); g.lineTo(px - 3.3, py + 2.6); g.closePath(); g.strokeStyle = '#fff'; g.stroke(); } });
  { const [bx, by] = at(B.p.x, B.p.z); g.beginPath(); g.arc(bx, by, 2, 0, 7); g.fillStyle = '#ffd84a'; g.fill(); }
  { const [px, py] = at(me.P.p.x, me.P.p.z); g.strokeStyle = '#ffd23f'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(px - 4.5, py); g.lineTo(px + 4.5, py); g.moveTo(px, py - 4.5); g.lineTo(px, py + 4.5); g.stroke(); }
  const mn = shooter.nick || '', on = opp ? opp.pl.nick || '' : ''; if (mmMe.textContent !== mn) mmMe.textContent = mn; if (mmOpp.textContent !== on) mmOpp.textContent = on;
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
// Свои головы игроков (модель из FaceBuilder, assets/<файл>.glb): у этого игрока родная голова своей модели сжимается
// в точку (кость Head), на её место ставится отдельная голова и каждый кадр повторяет положение и поворот кости Head.
// Только у игрока с этим именем; у остальных ничего не меняется. top — высота макушки над точкой крепления в файле, м.
const FACES = [{ re: /мбаппе|mbapp/i, file: 'assets/mbappe_head.glb' }], faceCache = {}, faceSwaps = [];
function faceFor(pl) {
  if (!pl || !pl.own || !pl.model || pl.face) return; const F = FACES.find((f) => f.re.test(pl.nick || '')); if (!F) return;
  pl.face = { F };
  (faceCache[F.file] ||= loader.loadAsync(F.file)).then((g) => {
    const hb = pl.model.getObjectByName('Head'), ht = pl.model.getObjectByName('HeadTop_End'); if (!hb || !ht || pl.face.mesh) return;
    pl.model.updateMatrixWorld(true); const a = hb.getWorldPosition(new THREE.Vector3()), b = ht.getWorldPosition(new THREE.Vector3());
    const mesh = g.scene.clone(true), top = (g.scene.children[0] && g.scene.children[0].userData.top) || 0.16;
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    pl.face = { F, mesh, hb, k: a.distanceTo(b) / pl.model.scale.y / top }; scene.add(mesh); faceSwaps.push(pl);
  }).catch(() => {});
}
const fcP = new THREE.Vector3(), fcQ = new THREE.Quaternion(), fcS = new THREE.Vector3(), FACE_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16); // у своей модели кость Head смотрит чуть вверх — голову опускаем на ~9°
function faceSync() {
  for (const pl of faceSwaps) { const f = pl.face; if (!f || !f.mesh) continue;
    f.mesh.visible = pl.holder.visible !== false && pl.model.visible !== false;
    f.hb.scale.setScalar(0.01); pl.holder.updateMatrixWorld(true); f.hb.matrixWorld.decompose(fcP, fcQ, fcS);
    f.mesh.position.copy(fcP); f.mesh.quaternion.copy(fcQ).multiply(FACE_FIX); f.mesh.scale.setScalar(f.k * pl.model.scale.y); }
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
  if (MATCH_ON && run) { matchAnim(dt); if (TRACE && window.__smoothOn) smoothTick(dt); }
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
  faceSync(); if (!NO_RENDER) ren.render(scene, cam);
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
if (TRACE) window.__clipList = () => ({ base: base ? base.animations.map((c) => [c.name, +c.duration.toFixed(2)]) : [], hero: heroMoves ? Object.values(heroMoves).map((c) => [c.name, +c.duration.toFixed(2)]) : [], alias: ALIAS });
if (TRACE) window.__trip = (id, soft) => { const a = actorOf(id); if (soft) stagger(a); else fallDown(a); }; // посмотреть падение
if (TRACE) window.__slide = () => trySlide(actorOf('me'));
if (TRACE) window.__park = () => { for (const a of actors()) if (a.team === 1) { a.P.p.x = -30 + (+a.id.slice(1)) * 5; a.P.p.z = 100; a.P.v.x = a.P.v.z = 0; a.ai.thinkT = 999; a.ai.tx = a.P.p.x; a.ai.tz = 100; a.ai.run = null; } };
if (TRACE) window.__meYaw = (y) => { run.P.yaw = y; const a = actorOf('me'); if (a) a.pl.vyaw = y; };
if (TRACE) window.__toScreen = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam), r = ren.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; };
if (TRACE) window.__gestTx = (sx, sy) => { gestureAim(sx, sy, null); return run.gestTx; };
if (TRACE) window.__footBall = () => { const pl = shooter, out = {}; pl.model.updateMatrixWorld(true); for (const n of ['RightFoot', 'RightToeBase', 'RightToe_End', 'LeftFoot', 'LeftToeBase']) { const o = pl.model.getObjectByName(n); if (o) { const q = o.getWorldPosition(new THREE.Vector3()); out[n] = +Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z).toFixed(3); } } const cp = BP.controlPoint(run.P, B), toe = pl.model.getObjectByName('RightToeBase').getWorldPosition(new THREE.Vector3()); return { t: +simT.toFixed(3), name: pl.name, at: +(pl.t || 0).toFixed(3), tc: (CONTACT.own || STRIKE).tc, sAt: B.strikeAt, own: !!pl.own, bs: B.state, bsp: +Math.hypot(B.v.x, B.v.z).toFixed(1), ballCp: +Math.hypot(B.p.x - cp.x, B.p.z - cp.z).toFixed(3), toeCp: +Math.hypot(toe.x - cp.x, toe.z - cp.z).toFixed(3), toeY: +toe.y.toFixed(2), lift: +pl.model.position.y.toFixed(3), glb: pl.glb, d: out }; };
if (TRACE) window.__clipToe = (name, useVariant = true) => { const pl = shooter, a = pl.mixer.clipAction(useVariant && pl.hs && pl.hs !== 1 ? variant(name, 1, 1, pl.hs) : clipOf(name)); pl.mixer.stopAllAction(); a.reset().play(); const res = [];
  const pos = (n) => pl.model.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  let prev = null; for (let t = 0; t <= a.getClip().duration; t += 1 / 30) { pl.mixer.setTime(t); pl.model.updateMatrixWorld(true); const r = pos('RightToeBase'), l = pos('LeftToeBase'), rf = pos('RightFoot'), lf = pos('LeftFoot');
    const gnd = Math.min(r.y, l.y, rf.y - 0.1, lf.y - 0.1), sp = prev ? r.distanceTo(prev) * 30 : 0; prev = r.clone(); res.push([+t.toFixed(2), +(r.y - gnd).toFixed(2), +sp.toFixed(1), +(l.y - gnd).toFixed(2)]); }
  a.stop(); pl.act = null; play(pl, 'idle', { loop: true, fade: 0, follow: true }); return { own: !!pl.own, hs: pl.hs, dur: +a.getClip().duration.toFixed(2), res }; };
if (TRACE) window.__unpark = () => { for (const a of actors()) if (a.ai) a.ai.thinkT = 0; };
if (TRACE) window.__give = (x, z) => { const me = actorOf('me'), P = me.P; MT.restart = null; MT.gkHold = null; state = 'play'; MT.st = 'play'; if (x !== undefined) { P.p.x = x; P.p.z = z; } P.v.x = P.v.z = 0; placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; ballPrev.copy(B.p); };
if (TRACE) window.__state = () => ({ t: +simT.toFixed(2), owner: B.owner, bs: B.state, ball: [+B.p.x.toFixed(2), +B.p.z.toFixed(2), +Math.hypot(B.v.x, B.v.z).toFixed(1)], me: (() => { const a = actorOf('me'); return [a.pl.nick, +a.P.p.x.toFixed(2), +a.P.p.z.toFixed(2), +Math.hypot(a.P.v.x, a.P.v.z).toFixed(1)]; })(), mates: actors().filter((a) => a.team === 0 && a.id !== 'me').map((a) => [a.id, +a.P.p.x.toFixed(1), +a.P.p.z.toFixed(1), a.ai && a.ai.run ? 1 : 0]), chase: !!run.chase, passTo: run.passTo ? run.passTo.id.nick : null });
if (TRACE) window.__sendOff = (id) => { const a = actorOf(id); if (a) { a.pl.yc = 1; sendOff(a.pl); } return actors().length; };
if (TRACE) window.__ground = () => groundStat;
if (TRACE) window.__bones = () => actors().concat(GK.map((g, i) => ({ id: 'gk' + i, pl: g.pl, P: { v: { x: 0, z: 0 } } }))).map((a) => { const pl = a.pl; if (!pl.gb) return null; const o = { id: a.id, own: pl.own, name: pl.name, sp: +Math.hypot(a.P.v.x, a.P.v.z).toFixed(1), f: pl.loco ? +pl.loco.f.toFixed(2) : 0, lift: +pl.model.position.y.toFixed(3), lb: pl.glb, rz: +pl.holder.rotation.z.toFixed(2), rx: +pl.holder.rotation.x.toFixed(2) }; for (const [b] of pl.gb) o[b.name] = +b.matrixWorld.elements[13].toFixed(3); return o; }).filter(Boolean);
if (TRACE) window.__dbgMe = () => ({ raw: run.dbgRaw, inp: run.dbgInp, src: run.dbgSrc, foot: B.foot || 0, drive: !!run.P.drive, lockYaw: +(run.P.lockYaw || 0).toFixed(2), hold: !!run.holdInp, tf: !!B.touchFirst, soft: !!B.touchSoft, trapT: +(B.trapT || 0).toFixed(2), slow: run.meAI && +(run.meAI.slowT || 0).toFixed(2), pass: !!run.pass, strike: !!run.strike, charge: run.charge >= 0, queue: run.queue ? run.queue.kind : null, chase: !!run.chase, mv: actorOf('me') && actorOf('me').pl.mv ? actorOf('me').pl.mv.name : null, vx: +run.P.v.x.toFixed(2), vz: +run.P.v.z.toFixed(2), yaw: +run.P.yaw.toFixed(2) });
if (TRACE) window.__team = () => actors().map((a) => [a.id, a.team, +a.P.p.x.toFixed(1), +a.P.p.z.toFixed(1), a.ai ? a.ai.role || '' : 'me', a.ai && a.ai.chasing ? 1 : 0, a.ai && a.ai.home !== undefined ? homeBase(a)[1] : (a.ai && a.ai.hxy ? a.ai.hxy[1] : null)]);
if (TRACE) window.__sprint = (on) => { btn.sprint = !!on; };
if (TRACE) window.__me = () => { const a = actorOf('me') || { P: run.P, pl: shooter }, P = a.P, L = a.pl.loco; return { name: a.pl.name, t: a.pl.act ? +a.pl.act.time.toFixed(2) : 0, sp: +Math.hypot(P.v.x, P.v.z).toFixed(2), yaw: +P.yaw.toFixed(2), p: [+P.p.x.toFixed(2), +P.p.z.toFixed(2)], mv: a.pl.mv ? a.pl.mv.name : null, run: L && L.run ? L.run.map((r) => +r.a.getEffectiveWeight().toFixed(2)) : null, drib: L && L.drib ? +L.drib.getEffectiveWeight().toFixed(2) : null, own: !!a.pl.own, owner: B.owner }; };
if (TRACE) window.__lesson = () => ({ pts: LS.pts, att: LS.att, step: LS.step, done: LS.done, coach: LS.coachOn, gates: LS.gates.map((g) => g.done), discs: LS.discs.map((d) => d.hit), cross: LS.cross, me: run ? [+run.P.p.x.toFixed(1), +run.P.p.z.toFixed(1)] : null, own: B.owner, st: state });
if (TRACE) window.__clipMove = (name) => { const pl = shooter, h = pl.holder, keep = [h.position.clone(), h.rotation.clone()]; h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.updateMatrixWorld(true);
  const a = pl.mixer.clipAction(clipOf(name)); pl.mixer.stopAllAction(); a.reset().play(); pl.mixer.setTime(0); pl.model.updateMatrixWorld(true); const p0 = pl.hips.getWorldPosition(new THREE.Vector3());
  pl.mixer.setTime(Math.min(0.5, clipOf(name).duration * 0.6)); pl.model.updateMatrixWorld(true); const p1 = pl.hips.getWorldPosition(new THREE.Vector3()); a.stop(); pl.act = null; pl.name = ''; h.position.copy(keep[0]); h.rotation.copy(keep[1]);
  return [+(p1.x - p0.x).toFixed(2), +(p1.z - p0.z).toFixed(2)]; }; // смещение записи при взгляде вдоль +z (право — это −x)
if (TRACE) window.__pose = (name, t) => { const pl = shooter; pl.mixer.stopAllAction(); const a = pl.mixer.clipAction(clipOf(name)); a.reset().play(); pl.mixer.setTime(t); pl.act = a; pl.name = 'pose'; pl.follow = false; pl.lock = null; window.__freeze = true; };
if (TRACE) window.__clips = () => base.animations.map((c) => { const t = c.tracks.find((x) => x.name === 'Hips.position'), v = t ? t.values : [0, 0, 0], n = v.length; return [c.name, +c.duration.toFixed(2), t ? [+(v[n - 3] - v[0]).toFixed(0), +(v[n - 2] - v[1]).toFixed(0), +(v[n - 1] - v[2]).toFixed(0)] : null]; });
// замер плавности (только для проверки, ?trace=1): по каждому полевому игроку — скорость поворота корпуса на экране,
// скольжение стоящей стопы по газону, вертикальные скачки таза, смены движения
const SM = { ex: [], ex2: [], n: 0, yawFast: 0, yawMax: 0, slide: 0, slideN: 0, slideBad: 0, pop: 0, sw: 0, swBack: 0, wJump: 0, per: {} };
function smoothTick(dt) {
  if (dt <= 0 || state !== 'play') return; SM.n++;
  for (const a of actors()) { if (window.__smoothOnly && a.id !== window.__smoothOnly) continue; const pl = a.pl, h = pl.holder, st = pl.sm || (pl.sm = {});
    { const jx = st.px === undefined ? 0 : Math.hypot(h.position.x - st.px, h.position.z - st.pz); st.px = h.position.x; st.pz = h.position.z; if (jx > 0.6 || MT.st !== 'play') { st.yaw = undefined; st.low = null; st.hy = undefined; st.ww = null; continue; } } // перестановка (розыгрыш) — не считаем
    const yaw = h.rotation.y; if (st.yaw !== undefined) { let d = yaw - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); const w = Math.abs(d) / dt; if (w > 9) SM.yawFast++; SM.yawMax = Math.max(SM.yawMax, w); } st.yaw = yaw;
    if (pl.toeL && pl.toeR) { const l = pl.toeL.getWorldPosition(new THREE.Vector3()), r = pl.toeR.getWorldPosition(new THREE.Vector3()), low = l.y < r.y ? l : r, k = l.y < r.y ? 'l' : 'r', q = st.low;
      if (q && q.k === k && low.y < 0.05) { const v = Math.hypot(low.x - q.x, low.z - q.z) / dt, sp = Math.hypot(a.P.v.x, a.P.v.z), angv = sp > 0.3 ? Math.abs(Math.atan2(Math.sin(Math.atan2(a.P.v.x, a.P.v.z) - a.P.yaw), Math.cos(Math.atan2(a.P.v.x, a.P.v.z) - a.P.yaw))) : 0, bin = (sp < 0.5 ? 'stand' : sp < 2.5 ? 'walk' : sp < 4.5 ? 'jog' : 'run') + (sp < 0.5 ? '' : angv < 0.5 ? '-f' : angv < 2.1 ? '-s' : '-b') + (pl.withBall ? '+b' : '') + (pl.name !== 'loco' ? '#' + pl.name : '');
        SM.slide += v; SM.slideN++; if (v > 1.2) { SM.slideBad++; if (SM.ex && SM.ex.length < 40 && SM.n % 7 === 0) SM.ex.push([a.id, pl.name, +v.toFixed(2), +sp.toFixed(2), +low.y.toFixed(3), pl.own ? 1 : 0, +(pl.act && pl.act.timeScale || 0).toFixed(2)]); } const B2 = SM.per[bin] || (SM.per[bin] = [0, 0]); B2[0] += v; B2[1]++; }
      st.low = { x: low.x, z: low.z, k }; }
    const hy = pl.hips.getWorldPosition(v3).y; if (st.hy !== undefined && Math.abs(hy - st.hy) / dt > 2.2) { SM.pop++; if (SM.ex2 && SM.ex2.length < 30) SM.ex2.push(['pop', a.id, pl.name, +(hy - st.hy).toFixed(3), +(pl.t || 0).toFixed(2), +pl.model.position.y.toFixed(3), pl.glb]); } st.hy = hy;
    if (st.name !== undefined && st.name !== pl.name) { SM.sw++; if (st.prev === pl.name && st.swT < 0.25) { SM.swBack++; if (SM.ex2 && SM.ex2.length < 60) SM.ex2.push(['back', a.id, st.prev, st.name, +st.swT.toFixed(2), +(st.lt || 0).toFixed(2), pl.t !== undefined ? +pl.t.toFixed(2) : null, st.t0]); } st.prev = st.name; st.swT = 0; } if (st.name !== pl.name) st.t0 = +(pl.t || 0).toFixed(2); st.name = pl.name; st.lt = pl.t; st.swT = (st.swT || 0) + dt;
    const ww = pl.loco ? [pl.loco.idle, ...(pl.loco.dirs || []).map((d) => d.a), ...(pl.loco.run || []).map((r) => r.a), pl.loco.drib].filter(Boolean).map((x) => x.getEffectiveWeight()) : null;
    if (ww && st.ww && pl.name === 'loco') { let j = 0; ww.forEach((x, i) => (j += Math.abs(x - (st.ww[i] || 0)))); if (j / dt > 12) SM.wJump++; } st.ww = ww;
  }
}
if (TRACE) window.__dropBall = (x = 33, z = 2) => { B.state = 'free'; B.owner = null; B.p.set(x, R, z); B.v.set(0, 0, 0); B.w.set(0, 0, 0); ballPrev.copy(B.p); MT.restart = null; };
// длина шага записи (метров за цикл): записанная стопа в опоре уходит назад относительно таза — с какой скоростью
if (TRACE) window.__stride = (name, own) => { const a0 = actors().find((q) => !!q.pl.own === !!own && q.id !== 'me'), pl = a0.pl, hs = name.startsWith('h_') ? 1 : pl.hs || 1;
  const c = name === 'drib' ? heroDrib : name.startsWith('h_') ? heroMoves[name] : variant(name, 1, 1, hs); if (!c) return null;
  const was = pl.mv; pl.mixer.stopAllAction(); const ac = pl.mixer.clipAction(c); ac.reset().play(); ac.timeScale = 1; ac.setEffectiveWeight(1); const dur = c.duration, yaw = pl.holder.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const pts = []; for (let t = 0; t < dur; t += 1 / 240) { pl.mixer.setTime(t); pl.model.updateMatrixWorld(true); const hp = pl.hips.getWorldPosition(new THREE.Vector3()), l = pl.toeL.getWorldPosition(new THREE.Vector3()), r = pl.toeR.getWorldPosition(new THREE.Vector3());
    pts.push({ t, l: [(l.x - hp.x) * fx + (l.z - hp.z) * fz, (l.x - hp.x) * rx + (l.z - hp.z) * rz, l.y], r: [(r.x - hp.x) * fx + (r.z - hp.z) * fz, (r.x - hp.x) * rx + (r.z - hp.z) * rz, r.y] }); }
  const minY = Math.min(...pts.map((q) => Math.min(q.l[2], q.r[2])));
  let sf = 0, ss = 0, n = 0; for (let i = 1; i < pts.length; i++) { const q = pts[i], p0 = pts[i - 1], k = q.l[2] < q.r[2] ? 'l' : 'r'; if (q[k][2] > minY + 0.03 || (p0.l[2] < p0.r[2] ? 'l' : 'r') !== k) continue; sf += (q[k][0] - p0[k][0]) * 240; ss += (q[k][1] - p0[k][1]) * 240; n++; }
  pl.mixer.stopAllAction(); pl.name = ''; pl.loco = null; pl.mv = was;
  let ph = 0, mn = 1e9; for (const q of pts) if (q.l[2] < mn) { mn = q.l[2]; ph = q.t / dur; } return { name, own: !!own, phaseL: +ph.toFixed(3), dur: +dur.toFixed(3), stanceFrac: +(n / pts.length).toFixed(2), mPerCycleFwd: +(-sf / Math.max(1, n) * dur).toFixed(3), mPerCycleSide: +(-ss / Math.max(1, n) * dur).toFixed(3) }; };
if (TRACE) window.__pc = (n, own) => { const pl = own ? shooter : actors().find((q) => !q.pl.own) ? actors().find((q) => !q.pl.own).pl : GK[1].pl; const r = prepContact(n, 0.15, pl); return { n, tc: +r.tc.toFixed(3), dur: +r.dur.toFixed(3), foot: r.foot, at: r.at }; };
if (TRACE) window.__moveInfo = () => Object.keys(heroMoves || {}).map((n) => { const c = heroMoves[n], I = c.userData; const rv = (t) => rootVel(c, t); let dist = 0; for (let t = 0; t < c.duration; t += 0.05) { const [vx, vz] = rv(t); dist += Math.hypot(vx, vz) * 0.05; } return { n, dur: +c.duration.toFixed(2), yawEnd: Math.round(I.yaw[I.yaw.length - 1] * 57.3), yawMid: Math.round(lerpAt(I.yt, I.yaw, c.duration / 2) * 57.3), dist: +dist.toFixed(2), v0: rv(0.05).map((x) => +x.toFixed(2)), vEnd: rv(c.duration - 0.05).map((x) => +x.toFixed(2)) }; });
if (TRACE) window.__moveProf = (n) => { const c = heroMoves[n], I = c.userData, r = []; for (let t = 0; t < c.duration; t += 0.1) { const [vx, vz] = rootVel(c, t); r.push([+t.toFixed(1), +vx.toFixed(1), +vz.toFixed(1), Math.round(lerpAt(I.yt, I.yaw, t) * 57.3)]); } return r; };
if (TRACE) window.__limbs = (name) => { const pl = shooter, hs = pl.hs || 1, c = variant(name, 1, 1, hs); pl.mixer.stopAllAction(); const ac = pl.mixer.clipAction(c); ac.reset().play(); ac.timeScale = 1; ac.setEffectiveWeight(1);
  const yaw = pl.holder.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), J = ['LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg', 'Spine2', 'Head'], best = {};
  for (let t = 0; t < c.duration; t += 1 / 60) { pl.mixer.setTime(t); pl.model.updateMatrixWorld(true); const hp = pl.holder.position;
    for (const j of J) { const q = pl.model.getObjectByName(j).getWorldPosition(new THREE.Vector3()); const f = (q.x - hp.x) * fx + (q.z - hp.z) * fz; const b = best[j] || (best[j] = { y: -9 }); if (q.y > b.y) Object.assign(b, { y: +q.y.toFixed(2), t: +t.toFixed(2), f: +f.toFixed(2) }); } }
  pl.mixer.stopAllAction(); pl.name = ''; pl.loco = null; return { name, dur: +c.duration.toFixed(2), best }; };
if (TRACE) window.__throwAt = (id, yArr, sp = 10, from = 9) => { const a = actorOf(id), P = a.P, g = BP.CFG.g, t = from / sp; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  B.state = 'free'; B.owner = null; B.lockOwner = null; B.p.set(P.p.x + fx * from, 0, P.p.z + fz * from); const y0 = 0.4; B.p.y = y0; B.v.set(-fx * sp, (yArr - y0) / t + 0.5 * g * t, -fz * sp); B.w.set(0, 0, 0); ballPrev.copy(B.p); MT.restart = null; MT.st = 'play'; };
if (TRACE) window.__hipsProf = (name) => { const pl = shooter, c = variant(name, 1, 1, pl.hs || 1); pl.mixer.stopAllAction(); const ac = pl.mixer.clipAction(c); ac.reset().play(); ac.timeScale = 1; ac.setEffectiveWeight(1);
  const yaw = pl.holder.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), out = []; let prevA = null, acc = 0;
  const L = pl.model.getObjectByName('LeftUpLeg'), Rr = pl.model.getObjectByName('RightUpLeg'), lt = pl.model.getObjectByName('LeftToeBase'), rt = pl.model.getObjectByName('RightToeBase');
  for (let t = 0; t <= c.duration; t += 0.1) { pl.mixer.setTime(t); pl.model.updateMatrixWorld(true); const hp = pl.hips.getWorldPosition(new THREE.Vector3()), a = L.getWorldPosition(new THREE.Vector3()).sub(Rr.getWorldPosition(new THREE.Vector3())), ang = Math.atan2(a.x, a.z);
    if (prevA !== null) { let d = ang - prevA; d = Math.atan2(Math.sin(d), Math.cos(d)); acc += d; } prevA = ang; const h0 = pl.holder.position;
    out.push([+t.toFixed(1), +((hp.x - h0.x) * fx + (hp.z - h0.z) * fz).toFixed(2), Math.round(acc * 57.3), +lt.getWorldPosition(new THREE.Vector3()).y.toFixed(2), +rt.getWorldPosition(new THREE.Vector3()).y.toFixed(2)]); }
  pl.mixer.stopAllAction(); pl.name = ''; pl.loco = null; return out; };
if (TRACE) window.__contacts = () => ({ STRIKE, PASS, own: CONTACT.own, ownPass: CONTACT.ownPass });
if (TRACE) window.__feet = () => { const pl = actorOf('me').pl, l = pl.toeL.getWorldPosition(new THREE.Vector3()), r = pl.toeR.getWorldPosition(new THREE.Vector3()), fl = pl.footL.getWorldPosition(new THREE.Vector3()), fr = pl.footR.getWorldPosition(new THREE.Vector3()), P = actorOf('me').P; return { t: simT, l: [l.x, l.y, l.z], r: [r.x, r.y, r.z], fl: [fl.x, fl.y, fl.z], fr: [fr.x, fr.y, fr.z], p: [P.p.x, P.p.z], ph: pl.loco ? pl.loco.ph : null }; };
if (TRACE) window.__smooth = (reset) => { const r = { frames: SM.n, yawFastPerS: +(SM.yawFast / Math.max(1, SM.n) * 30).toFixed(2), yawMaxDegS: Math.round(SM.yawMax * 57.3), footSlideMS: +(SM.slide / Math.max(1, SM.slideN)).toFixed(3), slideBadPct: +(100 * SM.slideBad / Math.max(1, SM.slideN)).toFixed(1), hipPops: SM.pop, switches: SM.sw, switchBack: SM.swBack, blendJumps: SM.wJump, ex: SM.ex, ex2: SM.ex2, slideBy: Object.fromEntries(Object.entries(SM.per).sort((x, y) => y[1][1] - x[1][1]).map(([k, v]) => [k, [+(v[0] / v[1]).toFixed(2), v[1]]])) };
  if (reset) Object.assign(SM, { n: 0, yawFast: 0, yawMax: 0, slide: 0, slideN: 0, slideBad: 0, pop: 0, sw: 0, swBack: 0, wJump: 0, per: {}, ex: [], ex2: [] }); window.__smoothOn = true; return r; };
// замер (только для проверки): у владельца мяча сколько открытых вариантов паса в 6–30 м (линия паса не ближе 2 м к сопернику)
const OS = { n: 0, open: 0, cand: 0, marked: 0 };
function openStat(A) { const ow = actorOf(B.owner); if (!ow) return; const foes = A.filter((x) => x.team !== ow.team), P = ow.P; OS.n++;
  for (const q of A) { if (q.team !== ow.team || q === ow) continue; const d = Math.hypot(q.P.p.x - P.p.x, q.P.p.z - P.p.z); if (d < 6 || d > 30) continue; OS.cand++;
    const lane = Math.min(...foes.map((f) => segDist(P.p.x, P.p.z, q.P.p.x, q.P.p.z, f.P.p.x, f.P.p.z))), mark = Math.min(...foes.map((f) => Math.hypot(f.P.p.x - q.P.p.x, f.P.p.z - q.P.p.z)));
    if (lane > 2 && mark > 2.5) OS.open++; if (mark < 2) OS.marked++; } }
if (TRACE) window.__open = (reset) => { const r = { frames: OS.n, candPerFrame: +(OS.cand / Math.max(1, OS.n)).toFixed(2), openPerFrame: +(OS.open / Math.max(1, OS.n)).toFixed(2), markedPct: +(100 * OS.marked / Math.max(1, OS.cand)).toFixed(1) }; if (reset) Object.assign(OS, { n: 0, open: 0, cand: 0, marked: 0 }); window.__openOn = true; return r; };
if (TRACE) window.__run = (id, fx, fz) => { const q = actorOf(id); if (!q || !q.ai) return; q.ai.tx = q.P.p.x + fx * 30; q.ai.tz = q.P.p.z + fz * 30; q.ai.thinkT = 9; q.ai.run = null; }; // для проверки: бот бежит в сторону (fx, fz)
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
if (TRACE) window.__gkClip = (nm) => gkCtx(0, () => { const h = keeper.holder, keep = [h.position.clone(), h.rotation.clone()]; h.position.set(0, 0, 0); h.rotation.set(0, 0, 0); h.updateMatrixWorld(true);
  const clip = base.animations.find((c) => c.name === nm); const a = keeper.mixer.clipAction(clip); keeper.mixer.stopAllAction(); a.reset().play(); const out = [];
  const loc = (n) => h.worldToLocal(keeper.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
  for (let t = 0; t <= clip.duration; t += 0.1) { keeper.mixer.setTime(t); keeper.model.updateMatrixWorld(true); const l = loc('LeftHand'), r = loc('RightHand'), hp = loc('Hips'); out.push([+t.toFixed(1), +((l.x + r.x) / 2).toFixed(2), +((l.y + r.y) / 2).toFixed(2), +((l.z + r.z) / 2).toFixed(2), +hp.y.toFixed(2), +hp.x.toFixed(2)]); }
  a.stop(); h.position.copy(keep[0]); h.rotation.copy(keep[1]); return out; });
if (TRACE) window.__gkGot = (j) => { MT.restart = null; gkGot(j); };
// для проверки: свободный мяч в заданной точке и с заданной скоростью (лежащий / медленно катящийся)
if (TRACE) window.__ball = (x, z, vx = 0, vz = 0) => { if (B.state === 'owned' || B.state === 'strike') BP.release(B, B.owner, simT, 0.5, false); B.state = 'free'; B.owner = null; B.p.set(x, R, z); B.v.set(vx, 0, vz); B.w.set(0, 0, 0); ballPrev.copy(B.p); if (run) run.shotT = simT; };

// ---------- старт ----------
(async () => {
  const bar = $('#loadbar');
  const all = [player(myKit, true), player(gkKit), ...Array.from({ length: MATCH_ON ? 2 * NSIDE - 2 : 4 }, (_, i) => player(wallKit(), MATCH_ON && i < 2 * NSIDE - 3))]; // матч: партнёры и соперники — своя модель (вдвое легче общей, с рывком, ведением, разворотами), наш вратарь — общая
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; shooter0 = shooter; wall.push(...got.slice(2)); blob(ball, 0.45); makeSpheres(keeper, 'gk'); makeSpheres(shooter, 'me'); makeSpheres(wall[0], 'mate');
  GK.push({ pl: keeper, S: GKS, kick: null });
  if (MATCH_ON) { // матч: два соперника и наш вратарь — из тех же моделей «стенки»; поле меньше — вратарь выходит ближе
    for (let i = 1; i < wall.length - 1; i++) makeSpheres(wall[i], 'x' + i); // метки (кто есть кто) раздаёт resetMatch
    makeSpheres(wall[wall.length - 1], 'gk2');
    GK.push({ pl: wall[wall.length - 1], S: { st: 'pos', t: 0, v: new THREE.Vector3(), want: '', wantT: 0 }, kick: null });
    Object.assign(BP.CFG.keeper, { reaction: 0.18, reactionJitter: 0.08, diveReach: 2.8, diveTime: 0.52 }); GK[0].kc = Object.assign({}, DIFF.gk);
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
// для проверки ведения: носки и мяч в системе игрока (f — вперёд, s — вправо), нога ведения, время последнего касания
if (TRACE) window.__drib = () => { const a = actorOf('me'), pl = a.pl, P = a.P, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
  const loc = (v) => { const dx = v.x - P.p.x, dz = v.z - P.p.z; return [+(dx * fx + dz * fz).toFixed(3), +(dx * rx + dz * rz).toFixed(3), +v.y.toFixed(3)]; };
  return { xn: B.xferN || 0, fn: B.footNext ?? 0, tp: B.tp ? [+B.tp.t.toFixed(2), +B.tp.T.toFixed(2), +B.tp.A.toFixed(2)] : null, cps: pl.loco ? pl.loco.cps : null, jts: pl.loco ? +pl.loco.jog.timeScale.toFixed(2) : null, rv: +((B.v.x - P.v.x) * fx + (B.v.z - P.v.z) * fz).toFixed(2), push: +(B.push || 0).toFixed(3), tw: +(pl.twist || 0).toFixed(2), bv: +Math.hypot(B.v.x, B.v.z).toFixed(2), t: +simT.toFixed(3), l: loc(pl.toeL.getWorldPosition(new THREE.Vector3())), r: loc(pl.toeR.getWorldPosition(new THREE.Vector3())), b: loc(B.p), foot: B.foot || 0, sk: +(B.sideK ?? 1).toFixed(2), touch: +(run.meTouchT || 0).toFixed(3), sp: +Math.hypot(P.v.x, P.v.z).toFixed(2), yaw: +P.yaw.toFixed(3), bs: B.state, own: B.owner, dw: pl.loco && pl.loco.dw ? +pl.loco.dw.toFixed(2) : 0, drt: pl.loco && pl.loco.drib ? +((pl.loco.drib.time / pl.loco.drib.getClip().duration) % 1).toFixed(3) : null }; };
if (TRACE) window.__foot = (f) => { B.foot = f; B.sideK = f; B.footT = 0; B.turning = false; }; // для проверки: мяч под правую (1) или левую (−1)
if (TRACE) window.__contactsL = () => ({ own: CONTACT.own, ownL: CONTACT.ownL, ownPass: CONTACT.ownPass, ownPassL: CONTACT.ownPassL, STRIKE_L, PASS_L });
if (TRACE) window.__pl = () => actorOf('me').pl; // для разработки анимаций
if (TRACE) window.__act = () => { const a = actorOf('me').pl.act; return a && { clip: a.getClip().name, dur: +a.getClip().duration.toFixed(2), ts: a.timeScale, en: a.enabled, paused: a.paused, run: a.isRunning(), w: +a.getEffectiveWeight().toFixed(2), time: +a.time.toFixed(3), tracks: a.getClip().tracks.length }; };
