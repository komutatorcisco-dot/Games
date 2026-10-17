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
import { buildStadium } from './stadium.js';
import { gestureButton } from './controls.js'; // кнопки с жестами (нажал / держишь / оттянул палец) // чаша стадиона, трибуны, болельщики, щиты // профили качества и внешний вид сцены (свет, газон, материалы) // физика мяча, ведение, удар — единый конфиг BP.CFG

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'ИГРОК').toUpperCase().slice(0, 14);
let MODE = ['pen', 'run', 'duo'].includes(Q.get('mode')) ? Q.get('mode') : 'fk';
const FREE = () => MODE === 'run' || MODE === 'duo'; // свободная игра: «1 на 1» и «2 на 1» (с партнёром)
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
const DUO_OLD = Q.get('cam') === 'old', TV = () => MODE === 'duo' && !DUO_OLD;
const CAM_TV = { side: 20, h: 11.5, fov: 24, look: 4, ahead: 6, rate: 2.6 }; // узкий объектив издалека, как в трансляции: меньше искажений по краям
const fov = () => (innerWidth > innerHeight ? (TV() ? CAM_TV.fov : { pen: 33, fk: 37, run: 44, duo: 44 }[MODE]) : 48);
const cam = new THREE.PerspectiveCamera(fov(), innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = fov(); cam.updateProjectionMatrix(); fitSwipe(); });
// в Telegram (мини-приложение) — на весь экран и горизонтально
addEventListener('load', () => { const tg = window.Telegram && Telegram.WebApp; if (!tg || !tg.initData) return;
  try { tg.ready(); tg.expand(); tg.requestFullscreen && tg.requestFullscreen(); tg.lockOrientation && tg.lockOrientation(); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) { /* старый Telegram */ } });
// «Во весь экран»: на Android ещё и закрепляем горизонтальный поворот (на iPhone — просто поверни телефон)
document.getElementById('rotBtn').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); await screen.orientation.lock('landscape'); } catch (e) { /* не везде можно */ }
});

// ---------- свет ----------
// Днём: одно солнце с тенью (направление совпадает с солнцем на картинке неба) + рассеянный свет и отражения от самого неба
// (scene.environment). Лишних «заполняющих» ламп нет — они делали картинку плоской. Ночью — прожекторы, как было.
const SUN = (() => { const e = THREE.MathUtils.degToRad(LOOK.sun.elevation), a = THREE.MathUtils.degToRad(LOOK.sun.azimuth);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize(); })(); // направление НА солнце
const key = new THREE.DirectionalLight(NIGHT ? '#fff6e6' : LOOK.sun.color, NIGHT ? 2.6 : LOOK.sun.intensity);
key.position.copy(SUN).multiplyScalar(70); key.target.position.set(0, 0, 10); scene.add(key, key.target);
{ const sh = key.shadow; sh.bias = LOOK.shadow.bias; sh.normalBias = LOOK.shadow.normalBias; sh.radius = LOOK.shadow.radius;
  sh.camera.near = 20; sh.camera.far = 130; sh.mapSize.set(PQ.shadowMap || 1024, PQ.shadowMap || 1024); key.castShadow = PQ.shadows; }
if (NIGHT) {
  scene.add(new THREE.HemisphereLight('#b9c8ff', '#2d5a24', 0.9));
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.9); fill.position.set(20, 18, 30); scene.add(fill);
} else scene.add(new THREE.HemisphereLight('#dfe9f5', '#46642f', 0.18)); // чуть отражённого от травы снизу
// область карты теней — только активная игровая зона (чем меньше область, тем чётче тени); центр «прилипает» к сетке
// текселей карты, чтобы края теней не дрожали, когда область едет за игроком
const shadowFit = { size: 0, c: new THREE.Vector3() };
const SH_R = new THREE.Vector3(), SH_U = new THREE.Vector3();
SH_R.crossVectors(AY, SUN).normalize(); SH_U.crossVectors(SUN, SH_R).normalize();
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
function pitch() {
  const P = LOOK.pitch, X0 = -40, X1 = 40, Z0 = -8, Z1 = 56, S = PQ.pitchRes, c = document.createElement('canvas');
  c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
  const g = c.getContext('2d'), px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = g.fillStyle = '#fff'; g.lineWidth = 0.12 * S; // линии 12 см, как на настоящем поле
  const rect = (x0, z0, x1, z1) => g.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
  g.beginPath(); g.moveTo(px(X0), pz(0)); g.lineTo(px(X1), pz(0)); g.stroke();
  rect(-20.16, 0, 20.16, 16.5); rect(-9.16, 0, 9.16, 5.5);
  g.beginPath(); g.arc(px(0), pz(11), 0.11 * S, 0, 7); g.fill(); // точка пенальти — 22 см
  g.beginPath(); g.arc(px(0), pz(11), 9.15 * S, Math.asin(5.5 / 9.15), Math.PI - Math.asin(5.5 / 9.15)); g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(px(sx * 34), pz(0), 1 * S, sx < 0 ? 0 : Math.PI / 2, sx < 0 ? Math.PI / 2 : Math.PI); g.stroke(); } // угловые дуги
  g.beginPath(); g.moveTo(px(-34), pz(0)); g.lineTo(px(-34), pz(52.5)); g.moveTo(px(34), pz(0)); g.lineTo(px(34), pz(52.5)); g.stroke(); // боковые линии
  g.beginPath(); g.moveTo(px(-34), pz(52.5)); g.lineTo(px(34), pz(52.5)); g.stroke(); g.beginPath(); g.arc(px(0), pz(52.5), 9.15 * S, Math.PI, 2 * Math.PI); g.stroke(); // середина поля
  const lines = new THREE.CanvasTexture(c); lines.anisotropy = ren.capabilities.getMaxAnisotropy(); // маска: данные, без перевода цвета
  const tl = new THREE.TextureLoader();
  const gN = tl.load('assets/grass_n.webp'), gC = tl.load('assets/grass.webp'), noise = smoothNoise();
  for (const x of [gN, gC]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = Math.min(PQ.aniso, ren.capabilities.getMaxAnisotropy()); }
  gC.colorSpace = THREE.SRGBColorSpace; // цвет — sRGB; нормали (gN) — линейные данные
  const W = 220, rep = W / 2.2; gN.repeat.set(rep, rep);
  const pm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: P.roughness, normalMap: gN, normalScale: new THREE.Vector2(P.normal, P.normal) });
  const col = (h) => new THREE.Color(h); // THREE.Color сам переводит sRGB → линейный
  const paint = P.paint.match(/[\d.]+/g).map(Number);
  pm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { grassC: { value: gC }, noiseT: { value: noise }, lineT: { value: lines },
      stripeA: { value: col(P.stripeA) }, stripeB: { value: col(P.stripeB) }, paintC: { value: col(`rgb(${paint[0]},${paint[1]},${paint[2]})`) },
      gp: { value: new THREE.Vector4(P.stripeWidth, P.macro, P.detail, P.paintDetail) }, gp2: { value: new THREE.Vector4(P.detailMean, paint[3], 0, 0) },
      lineBox: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) } });
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

// ---------- трибуны и болельщики (stadium.js) ----------
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
function gfxLabel() { if (gfxBtn) gfxBtn.textContent = 'Графика: ' + (QCHOICE === 'auto' ? `авто (${PQ.label.toLowerCase()})` : PQ.label.toLowerCase()); }
// кнопка: авто → низкая → средняя → высокая → авто; выбор запоминается
if (gfxBtn) gfxBtn.addEventListener('click', () => {
  const list = ['auto', ...GFX.ORDER]; QCHOICE = list[(list.indexOf(QCHOICE) + 1) % list.length]; GFX.saveChoice(QCHOICE);
  autoQ = QCHOICE === 'auto' ? new GFX.AutoQuality(QL, applyQuality) : null;
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
    if (b.player && contact) { b.m.visible = false; continue; }
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
}
function resetShot() {
  if (shooter0 && shooter !== shooter0) shooter = shooter0; // после смен в «2 на 1» — исходный игрок снова главный
  if (shooter && shooter.sph) { shooter.sph.forEach((q) => (q.who = 'me')); if (wall[0] && wall[0].sph) wall[0].sph.forEach((q) => (q.who = 'mate')); }
  $('#pad').hidden = !FREE(); $('#pad').classList.toggle('duo', MODE === 'duo'); $('#b-pass').hidden = $('#b-thru').hidden = $('#b-swap').hidden = $('#restart').hidden = MODE !== 'duo';
  cam.fov = fov(); cam.updateProjectionMatrix();
  $('#hint').textContent = MODE === 'duo' ? 'Вы управляете игроком с жёлтым кольцом. «Пас» — передача партнёру, после удара по мячу управление переходит к нему. «Смена» — переключиться вручную, «Заново» — новая попытка.' : FREE() ? 'Слева веди пальцем. Держи «Удар» — сила; потяни палец вбок — подкрутка, вверх — переброс; отпусти — удар. «Рывок»: держи — бег, быстро смахни — финт.' : 'Проведи пальцем от мяча к воротам. Быстрее — сильнее, изогни линию — мяч закрутится.';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  msg.className = 'msg'; clearTimeout(toastT); kick = null; shot = null; slow = 1; slowT = 0;
  recolor(wall[0], wallKit()); // в «2 на 1» он партнёр в нашей форме — в штрафном снова в стенке
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
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  dots();
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
  if (q.who !== 'gk') return 'bounce';
  const K = BP.CFG.keeper, first = simT - lastGkTouch > 0.15; lastGkTouch = simT;
  // ловля — только при настоящем касании: обе кисти у мяча или мяч в корпус, и мяч не слишком быстрый
  const hands = keeper.sph.filter((h) => h.name.endsWith('Hand'));
  const twoHands = hands.length === 2 && hands.every((h) => Math.hypot(B.p.x - h.x, B.p.y - h.y, B.p.z - h.z) < R + h.r + K.twoHands);
  const chest = q.name === 'Spine2' || q.name === 'Spine';
  if (state !== 'over' && ((twoHands && c.rel < K.catchHands) || (chest && c.rel < K.catchChest))) {
    B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); if (kick) kick.held = true;
    sfx.hands(true); sfx.buzz('medium'); finish(false, 'Поймал!', 'miss'); return 'stop';
  }
  // медленный низкий мяч, коснувшийся руки, вратарь прижимает и забирает (сильный — отскакивает, как раньше)
  if (state !== 'over' && FREE() && q.name.endsWith('Hand') && c.rel < K.gather && B.p.y < K.gatherH) {
    B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); if (kick) kick.held = true;
    sfx.hands(true); finish(false, 'Подобрал', 'miss'); return 'stop';
  }
  if (first) { sfx.hands(false); sfx.buzz('medium'); if (FREE()) toast(q.kind === 'hand' ? 'Отбил!' : 'Блок!'); else finish(false, 'Отбил!', 'miss'); }
  return 'bounce';
};
function worldNow() {
  world.goal = goalDef();
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
    } else if (e.type === 'net') { net.hits.push({ x: B.p.x, y: B.p.y, t: 0, a: Math.min(0.55, e.v * 0.025) }); sfx.net(e.v); }
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
  kick = { t: 0, T: t, cx: p.x, cy: p.y, lx: lp.x, kz, react, wide: Math.abs(g.x) > GW + 0.5 || g.y > GH + 0.45, done: false, x0: keeper.holder.position.x };
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
  kick.dived = true;
  const K = BP.CFG.keeper, lx = kick.lx, y = kick.cy, ax = Math.abs(lx), left = Math.max(0.05, kick.T - kick.react);
  const here = () => keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)), follow = FREE();
  const start = (G, speed = 1) => Math.max(0, Math.min(G.tc - 0.12, G.tc - left * speed)); // так, чтобы руки пришли к мячу вовремя (или опоздали)
  if (kick.wide) { play(keeper, 'gk_ready', { loop: true, fade: 0.25, follow, lock: follow ? null : here() }); kick.fall = false; return; } // мимо — провожает взглядом
  if (ax < K.nearReach) { // у тела: ловля
    const name = y > 1.75 ? 'gk_catch4' : y > 0.5 ? 'gk_catch2' : (lx > 0 ? 'gk_block' : 'gk_block2'), G = GKC[name];
    const fx = name.startsWith('gk_block') ? Math.max(0.15, (ax + 0.1) / Math.max(0.5, Math.abs(G.hx))) : 1;
    play(keeper, name, { t: start(G), fade: 0.12, fx, fz: 0.3, hold: G.tc + 0.7, follow: false, lock: name.startsWith('gk_block') ? null : here() });
    kick.fall = name.startsWith('gk_block'); return;
  }
  const reachMax = K.diveReach * THREE.MathUtils.clamp((left + 0.15) / K.diveTime, 0.35, 1); // первый выпад вбок — ещё во время реакции
  if (ax > reachMax + K.hopeless) { play(keeper, lx > 0 ? 'gk_step' : 'gk_side2', { fade: 0.15, speed: 1.3, hold: 0.35, follow, lock: follow ? null : here() }); kick.fall = false; return; } // безнадёжно — шаг, без прыжка
  const low = y < 0.45 && ax < 2.3, name = low ? (lx > 0 ? 'gk_block' : 'gk_block2') : (lx > 0 ? DIVE.R.name : DIVE.L.name), G = GKC[name];
  // растягиваем запись вбок, чтобы руки пришли в точку мяча (но не дальше, чем успевает); вперёд из ворот почти не выходим
  const want = Math.min(ax, reachMax), arm = Math.abs(G.hx) - Math.abs(G.px), fx = THREE.MathUtils.clamp((want - arm) / Math.max(0.3, Math.abs(G.px)), 0.2, 1.4);
  const t0 = start(G), up = low ? 0 : Math.max(0, Math.min(1.2, y - G.hy - 0.15));
  play(keeper, name, { t: t0, fade: 0.1, fx, fz: 0.25, hold: G.tc + 0.6, follow: false,
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
  if (state === 'over') return; state = 'over'; clearTimeout(toastT);
  if (ok) sfx.roar(); else if (text !== 'В стенку' && text !== 'Вратарь забрал' && !(text === 'Мимо' && Math.abs(B.p.x) > GW + 2.5)) sfx.ooh();
  results[n] = ok; lastEvent = text; dots(true);
  if (ok) { celebrate = 0; slow = 0.3; slowT = 0.9; shake = 0.15; crowd.userData.U.uJump.value = 1; } // без конфетти: трибуны, звук и счёт
  setTimeout(() => { crowd.userData.U.uJump.value = 0; n++; if (n >= SHOTS && MODE !== 'duo') end(); else if (state === 'over') resetShot(); }, ok ? 2600 : 1800);
}
function end() {
  const g = results.filter(Boolean).length;
  $('#endT').textContent = g >= 4 ? 'Отлично!' : g >= 2 ? 'Неплохо' : 'Мимо…';
  $('#endP').textContent = `Голов: ${g} из ${SHOTS}`;
  $('#end').classList.add('on');
}
$('#again').addEventListener('click', () => { $('#end').classList.remove('on'); n = 0; results = []; resetShot(); });
document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === MODE)); // ?mode=run — сразу подсвечена «1 на 1»
document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
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
function loco(pl, sp, dt) {
  const L = pl.loco || (pl.loco = { idle: pl.mixer.clipAction(variant('idle')), jog: pl.mixer.clipAction(variant('jog')), f: 1, prev: null });
  if (pl.name !== 'loco') {
    L.prev = pl.act; L.f = 0;
    for (const a of [L.idle, L.jog]) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); a.setEffectiveWeight(0); }
    Object.assign(pl, { name: 'loco', act: L.jog, hold: Infinity, lock: null, lift: 0, follow: true });
  }
  L.f = Math.min(1, L.f + dt / 0.3);
  const w = THREE.MathUtils.smoothstep(sp, 0.3, 1.9);
  L.idle.setEffectiveWeight((1 - w) * L.f); L.jog.setEffectiveWeight(w * L.f);
  if (L.prev && L.prev !== L.idle && L.prev !== L.jog) { L.prev.setEffectiveWeight(1 - L.f); if (L.f >= 1) { L.prev.stop(); L.prev = null; } }
  // на рывке шаг в жизни длиннее — частоту ног ограничиваем (лёгкое скольжение лучше «семенящих» ног)
  L.jog.timeScale = THREE.MathUtils.clamp(sp / JOG_SPEED, 0.75, 2.1);
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
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, keys = {}, btn = { shot: false, sprint: false };
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
function tvCam(out, snap) {
  const m = run && run.mate, a = run ? run.P.p : { x: 0, z: 20 }, b = m ? m.P.p : a, bp = ball.position;
  const fx = bp.x * 0.4 + (a.x + b.x) * 0.3, fz = bp.z * 0.6 + (a.z + b.z) * 0.2; // по глубине — оба игрока в кадре
  const tx = Math.max(-12, Math.min(12, fx)), tz = Math.max(7, Math.min(34, fz - CAM_TV.ahead)); // чуть вперёд — видно пространство до ворот
  if (snap) tvFocus.set(tx, 0, tz); else { const k = 1 - Math.exp(-lastRaw * CAM_TV.rate); tvFocus.x += (tx - tvFocus.x) * k; tvFocus.z += (tz - tvFocus.z) * k; }
  out.l.set(tvFocus.x + CAM_TV.look, 0.6, tvFocus.z); out.p.set(Math.min(40, tvFocus.x + CAM_TV.look + CAM_TV.side), CAM_TV.h, tvFocus.z); // трибуны начинаются с x = 42
}
let lastRaw = 1 / 60;
// маркер управляемого игрока: тонкое кольцо на газоне вокруг ног (мяч у ноги — внутри кольца)
let marker = null;
function markerTick() {
  if (!marker) { marker = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2; marker.renderOrder = 1; scene.add(marker); }
  marker.visible = MODE === 'duo' && !!run && !!run.mate;
  if (marker.visible) marker.position.set(shooter.holder.position.x, 0.03, shooter.holder.position.z);
}
function resetRun() {
  wall.forEach((w) => (w.holder.visible = false));
  const sx = (Math.random() * 2 - 1) * 7, P = BP.newPlayer({ x: sx, z: 30 }, Math.PI);
  shooter.holder.position.set(sx, 0, 30); shooter.holder.rotation.set(0, Math.PI, 0);
  placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; // мяч у ноги с самого начала
  play(shooter, 'idle', { loop: true, fade: 0.2, follow: true });
  keeper.holder.position.set(0, 0, 0.4); keeper.holder.rotation.set(0, 0, 0); keeperReset();
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, follow: true });
  resetSpheres(keeper); resetSpheres(shooter);
  run = { P, charge: -1, kv: new THREE.Vector3(), strike: null, fire: false, shotT: 0, slowT: 0, t0: simT, lastPost: null, wasStopping: false, pass: null, passFire: false, mate: null };
  if (MODE === 'duo') { // партнёр — бот в нашей форме, стартует сбоку и чуть впереди
    const side = sx > 0 ? -1 : 1, M = BP.newPlayer({ x: sx + side * 8, z: 27 }, Math.PI), pl = wall[0];
    recolor(pl, myKit || { shirt: '#ffffff', shorts: '#ffffff', socks: '#ffffff' }); pl.holder.visible = true; pl.holder.position.set(M.p.x, 0, M.p.z); pl.holder.rotation.set(0, Math.PI, 0);
    play(pl, 'idle', { loop: true, fade: 0.2, follow: true }); resetSpheres(pl);
    run.mate = { pl, P: M, side, st: 'support', hold: 0, pass: null, fire: false, plan: null, planT: 0, pick: -1, pickT: 0 };
  }
  if (TV()) tvCam(camAim, true); else runCam(camAim);
  camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); // новая попытка — сразу на месте (без пролёта камеры через всё поле)
  state = 'play'; celebrate = -1; dots();
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
  onDown: () => startCharge('drive'),
  onGesture: (dir) => { if (!run || run.charge < 0) return; if (dir === 'left' || dir === 'right') { run.kind = 'curl'; run.side = dir === 'left' ? 1 : -1; } else if (dir === 'up') { run.kind = 'chip'; run.side = 0; } shotBadge(); },
  onUp: (mode, held, cancel) => { if (cancel) cancelCharge(); else releaseCharge(); },
});
// «Пас»: коротко — в ноги (или на ход, если партнёр бежит), удержание — сильнее, вверх — верховая; мяч у партнёра — просьба вернуть
gestureButton($('#b-pass'), {
  onDown: () => passDown(),
  onGesture: (dir) => { const el = $('#pass-g'); if (el) el.textContent = dir === 'up' && passIn.down >= 0 ? '⌒ верхом' : ''; },
  onUp: (mode, held, cancel) => { const el = $('#pass-g'); if (el) el.textContent = ''; if (cancel) { passIn.down = -1; return; } passUp(mode === 'up' ? 'lofted' : 'ground'); },
});
// «Рывок»: держишь без жеста — ускорение; короткий резкий жест — финт (один раз за жест)
gestureButton($('#b-run'), {
  threshold: 30, flick: 0.28,
  onDown: () => { btn.sprint = true; },
  onGesture: (dir, quick) => { if (quick) feint(dir); },
  onUp: () => { btn.sprint = false; },
});
$('#b-thru').addEventListener('pointerdown', (e) => { e.preventDefault(); throughPass(); });
$('#b-swap').addEventListener('pointerdown', (e) => { e.preventDefault(); swapManual(); });
$('#restart').addEventListener('click', () => { if (FREE() && run) resetShot(); });
addEventListener('keydown', (e) => { if (e.code === 'Space') e.preventDefault(); if (keys[e.code]) return; keys[e.code] = true; /* пробел не нажимает кнопки режима */ if (e.code === 'Space') startCharge('drive'); if (e.code === 'KeyE') startCharge('curl'); if (e.code === 'KeyC') startCharge('chip');
  const fk = { Digit1: 'left', Digit2: 'right', Digit3: 'down', Digit4: 'up' }[e.code]; if (fk) feint(fk); if (e.code === 'KeyQ') passDown(); if (e.code === 'KeyF') throughPass(); if (e.code === 'KeyX') swapManual(); });
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyC') releaseCharge(); if (e.code === 'KeyQ') passUp(); });
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
  const sv = BP.shotVelocity(B, P, s.aim, s.pw, s.kind, goalDef(), s.side);
  if (BP.applyShot(B, sv, BP.controlPoint(P, B), 'me', simT)) {
    B.inGoal = false; B.goal = false; B.netHit = false;
    shot = { tx: 0, ty: 0, speed: sv.speed, curve: s.kind === 'curl' ? 1 : 0 }; run.shotT = simT; run.lastPost = null;
    planKeeper(); kicked(s.pw);
  } else sfx.touch(); // нога не достала мяч — промах по мячу, мяч свободен
}
// ---------- пасы и партнёр («2 на 1») ----------
// «Пас»: короткое нажатие — в ноги (или на ход, если партнёр бежит), удержание > 0,3 с — сильнее, жест вверх — верхом.
// В момент удара по мячу управление переходит к получателю (swapControl); бывший игрок становится ботом поддержки.
const passIn = { down: -1 };
function passDown() {
  if (MODE !== 'duo' || state !== 'play' || !run || !run.mate) return;
  if (B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.charge >= 0) return;
  passIn.down = performance.now(); hintOff();
}
// «На ход»: пас в свободную зону перед партнёром — по ходу его движения
function throughPass() {
  if (MODE !== 'duo' || state !== 'play' || !run || !run.mate) return;
  if (B.state !== 'owned' || B.owner !== 'me' || run.strike || run.pass || run.charge >= 0) return;
  startPass(run.P, 'me', shooter, 0.35, 'through'); hintOff();
}
function passUp(kind = 'ground') {
  if (passIn.down < 0) return; const held = (performance.now() - passIn.down) / 1000; passIn.down = -1;
  startPass(run.P, 'me', shooter, held > 0.3 ? 1 : 0, kind);
}
function startPass(P, who, pl, power, kind) { // замах сразу; направление и сила — в момент касания (firePass)
  if (state !== 'play' || B.state !== 'owned' || B.owner !== who) return false;
  const job = { power, kind };
  if (who === 'me') { if (run.strike || run.pass) return false; run.pass = job; } else run.mate.pass = job;
  B.state = 'strike'; B.strikeAt = PASS.at;
  play(pl, 'pass', { t: Math.max(0, PASS.tc - 0.24), fade: 0.08, speed: 1.15, follow: true });
  return true;
}
// точка встречи: где будет получатель, когда дойдёт мяч (если бежит — на ход), без самонаведения после касания
function passTarget(recv, kind, power) {
  const S = BP.CFG.pass, t = new THREE.Vector3(recv.p.x, 0, recv.p.z), sp = Math.hypot(recv.v.x, recv.v.z);
  if (kind === 'through') { // в свободную зону: по ходу получателя, ближе к воротам
    const gx = -recv.p.x * 0.4, gz = -recv.p.z, gl = Math.hypot(gx, gz) || 1, vx = sp > 1 ? recv.v.x / sp : 0, vz = sp > 1 ? recv.v.z / sp : 0;
    const dx = gx / gl + vx, dz = gz / gl + vz, dl = Math.hypot(dx, dz) || 1, ahead = S.throughAhead + sp * S.throughPerSpeed;
    t.set(recv.p.x + (dx / dl) * ahead, 0, recv.p.z + (dz / dl) * ahead);
    t.x = Math.max(-30, Math.min(30, t.x)); t.z = Math.max(2.5, Math.min(44, t.z)); return t;
  }
  if (sp > 1.2) for (let i = 0; i < 4; i++) { const tt = BP.passVelocity(B, t, kind, power).time; t.set(recv.p.x + recv.v.x * tt * S.lead, 0, recv.p.z + recv.v.z * tt * S.lead); }
  t.x = Math.max(-30, Math.min(30, t.x)); t.z = Math.max(1.5, Math.min(44, t.z)); return t;
}
function firePass(P, who, job, recv) {
  const tgt = passTarget(recv, job.kind, job.power), pv = BP.passVelocity(B, tgt, job.kind === 'lofted' ? 'lofted' : 'ground', job.power);
  if (BP.applyShot(B, pv, BP.controlPoint(P, B), who, simT)) { B.inGoal = false; B.goal = false; B.netHit = false; if (who === 'me' && MODE === 'duo') run.swapNow = true; sfx.kick(0.1 + job.power * 0.25); run.lastPass = { who, t: simT, tgt }; return true; }
  sfx.touch(); return false; // нога не достала — мяч свободен
}
// Смена управления: управляемый и бот меняются ролями ('me' — всегда тот, кем управляю). Владельца мяча не меняет:
// мяч остаётся у того, у кого был (метки 'me'/'mate' на мяче меняются местами вместе с ролями).
// Заряд удара, начатый пас и финт не переходят к другому игроку; удерживаемый джойстик и рывок продолжают работать.
function swapControl() {
  const m = run && run.mate; if (!m) return false;
  cancelCharge(); passIn.down = -1; const pg = $('#pass-g'); if (pg) pg.textContent = '';
  run.feint = null; B.feintOff = null; run.strike = null; run.pass = null; run.fire = false; run.passFire = false;
  const oP = run.P, oPl = shooter; run.P = m.P; shooter = m.pl; m.P = oP; m.pl = oPl;
  const sw = (v) => (v === 'me' ? 'mate' : v === 'mate' ? 'me' : v); B.owner = sw(B.owner); B.lockOwner = sw(B.lockOwner);
  shooter.sph.forEach((q) => (q.who = 'me')); m.pl.sph.forEach((q) => (q.who = 'mate'));
  m.P.charging = false; m.pass = null; m.fire = false; m.hold = 0; m.st = 'support'; m.plan = null; m.planT = 0; m.pick = -1; m.pickT = 0;
  run.swapNow = false; return true;
}
function swapManual() { if (MODE === 'duo' && state === 'play' && run && run.mate && !run.strike && !run.pass && !(B.state === 'strike')) { swapControl(); sfx.touch(); } }
// где перехватить свободный мяч: первая точка его пути, куда игрок успевает добежать (план раз в 0,1 с)
const planBall = BP.newBall();
function meetPoint(M, speed) {
  Object.assign(planBall.p, { x: B.p.x, y: B.p.y, z: B.p.z }); Object.assign(planBall.v, { x: B.v.x, y: B.v.y, z: B.v.z }); Object.assign(planBall.w, { x: B.w.x, y: B.w.y, z: B.w.z });
  planBall.state = 'free'; const h = 1 / 30;
  for (let t = h; t < 3; t += h) {
    for (let k = 0; k < 4; k++) BP.stepFree(planBall, h / 4, { goal: goalDef() });
    const d = Math.hypot(planBall.p.x - M.p.x, planBall.p.z - M.p.z);
    if (planBall.p.y < 0.45 && d - 0.45 <= speed * t) return { x: planBall.p.x, z: planBall.p.z, t };
  }
  return { x: planBall.p.x, z: planBall.p.z, t: 3 };
}
// Бот поддержки. Позиция — одна из нескольких точек вокруг управляемого игрока (вбок и по диагонали, вперёд к воротам
// или чуть сзади); точка оценивается по дистанции, границам поля, линии паса (не через вратаря) и тому, не стоит ли
// она у меня на пути. Выбор пересматривается раз в replan секунд и меняется, только если новая точка заметно лучше.
const MATE = { minGap: 1.1, replan: 0.45, better: 1.5, near: 8.5, stop: 0.35 };
const SUPPORT = [[-6.5, 5], [6.5, 5], [-8, 0.5], [8, 0.5], [-5.5, -4.5], [5.5, -4.5]]; // [вбок, вперёд к воротам], м (вбок — не дальше, чем видно с камеры)
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
  // свободный мяч — его, только если он заметно ближе и мяч не уходит от него после его же паса (подбор — моё дело)
  const away = bsp > 3 && (B.v.x * (bp.x - M.p.x) + B.v.z * (bp.z - M.p.z)) > 0;
  const loose = B.state === 'free' && bp.y < 1.2 && !(B.lockOwner === 'mate' && (simT < B.lockUntil || B.mustClear)) && dBot + 2 < dMe && !(away && dBot < 3);
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
  BP.playerStep(M, k > 0 ? { x: (dx / d) * k, y: (-dz / d) * k } : { x: 0, y: 0 }, h, mine);
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
function runPhys(h) {
  if (run.swapNow) { swapControl(); run.recvT = simT + 3; run.recvPlanT = 0; } // пас ушёл — управляю получателем
  const P = run.P, live = state === 'play';
  P.sprint = btn.sprint || keys.ShiftLeft || keys.ShiftRight; P.charging = run.charge >= 0;
  let inp = live ? input() : { x: 0, y: 0 };
  // мягкая помощь при приёме паса: джойстик отпущен — получатель сам идёт к точке встречи с мячом (любой ввод её отменяет)
  if (run.recvT > simT && B.state === 'free' && live && Math.hypot(inp.x, inp.y) < 0.2) {
    if ((run.recvPlanT -= h) <= 0) { run.recvPlan = meetPoint(P, 5); run.recvPlanT = 0.1; }
    const dx = run.recvPlan.x - P.p.x, dz = run.recvPlan.z - P.p.z, d = Math.hypot(dx, dz), k = Math.min(1, d / 1.2);
    if (d > 0.15) inp = { x: (dx / d) * k, y: (-dz / d) * k };
  } else if (B.state !== 'free') run.recvT = 0;
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
    if (pick) { const rel = BP.capture(B, pick === 'me' ? P : M, pick); sfx.touch(); if (pick === 'me' && rel > 5) sfx.buzz('light'); if (pick === 'mate') { mate.hold = 0; mate.pass = null; } }
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
const GKS = { st: 'pos', t: 0, v: new THREE.Vector3(), want: '', wantT: 0 };
const gkSet = (st) => { GKS.st = st; GKS.t = 0; };
// после движения со смещением таза (бросок, выход) переносим «точку» вратаря туда, где он оказался, — без рывка назад
const gkAnchor = () => { const w = keeper.hips.getWorldPosition(v3); keeper.holder.position.set(w.x, 0, Math.max(0.2, w.z)); };
function keeperReset() { gkSet('pos'); GKS.v.set(0, 0, 0); GKS.want = ''; keeper.smother = false; }
function keeperAI(h) {
  const K = BP.CFG.keeper, k = keeper.holder, bp = B.p; GKS.t += h;
  if (B.state === 'held') return;
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
  if (GKS.st === 'down') { if (GKS.t > K.getUp) { gkAnchor(); play(keeper, 'standing_up', { fade: 0.35, follow: true, speed: 1.3 }); gkSet('getup'); } return; }
  if (GKS.st === 'getup') { if (keeper.t > clipOf('standing_up').duration - 0.15) { kick = null; gkSet('pos'); } return; }
  if (kick && !kick.dived) return; // удар уже был — реакция ещё не прошла: стоит
  // соперник для вратаря — тот, кто с мячом; у свободного мяча — ближайший из нападающих
  const M = run.mate && run.mate.P, dBall = (Q) => Math.hypot(bp.x - Q.p.x, bp.z - Q.p.z);
  const P = B.owner === 'mate' && M ? M : B.owner === 'me' || !M ? run.P : dBall(M) < dBall(run.P) ? M : run.P;
  const dist = Math.hypot(bp.x, bp.z), toBall = Math.hypot(bp.x - k.position.x, bp.z - k.position.z);
  // выход: свободный мяч в штрафной, до которого он успевает раньше соперника; или соперник отпустил мяч далеко от ноги рядом с ним
  // соперник рядом (≤2,2 м) или отпустил мяч от ноги — выходит в ноги
  const loose = B.state === 'owned' && (toBall < 2.2 || (Math.hypot(bp.x - P.p.x, bp.z - P.p.z) > 0.55 && toBall < 3.2));
  const freeBall = B.state === 'free' && bp.y < 0.9 && B.v.length() < 12 && Math.abs(bp.x) < K.rushBox.x && bp.z < K.rushBox.z;
  const firstToIt = freeBall && toBall / K.rush < (Math.hypot(bp.x - P.p.x, bp.z - P.p.z) / 6.2) * K.rushMargin + 0.12;
  if (state === 'play' && (loose || firstToIt) && GKS.st !== 'rush') gkSet('rush');
  if (GKS.st === 'rush' && !(loose || firstToIt || toBall < K.smother + 0.6)) gkSet('pos');
  let tx, tz, vmax;
  if (GKS.st === 'rush') { tx = bp.x + B.v.x * 0.2; tz = bp.z + B.v.z * 0.2; vmax = K.rush; }
  else if (Math.abs(bp.x) > GW + 1.5 && bp.z < 7) { tx = Math.sign(bp.x) * (GW - 0.45); tz = 0.55; vmax = K.lateral; } // ушёл к лицевой — к ближней штанге
  else { // между мячом и центром ворот; чем ближе мяч — тем дальше выходит (сокращает угол), но не вплотную к сопернику
    const out = THREE.MathUtils.clamp(((K.outStart - dist) / K.outStart) * K.maxOut, 0.4, K.maxOut), o = Math.min(out, Math.max(0.4, dist - 2.4));
    tx = (bp.x / Math.max(dist, 0.1)) * o; tz = Math.max(0.35, (bp.z / Math.max(dist, 0.1)) * o); vmax = K.forward;
    if (dist < 8) { const cur = Math.hypot(k.position.x, k.position.z); if (cur > o) { tx = (bp.x / Math.max(dist, 0.1)) * cur; tz = Math.max(0.35, (bp.z / Math.max(dist, 0.1)) * cur); } } // соперник близко — не пятится к воротам
  }
  const ready = run.charge >= 0 || (B.state === 'owned' && dist < 14);
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
    play(keeper, name, { t: Math.max(0, G.tc - 0.3), fade: 0.1, fx, fz: name === 'gk_scoop' ? 0.25 : 0.5, hold: G.tc + 0.6 });
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
function bodyAnim(pl, P, dt) { // положение, наклон, бег/стойка, касания мяча в такт шагу
  const h = pl.holder, sp = Math.hypot(P.v.x, P.v.z);
  h.position.set(P.p.x, 0, P.p.z); h.rotation.y = P.yaw;
  // наклон: на повороте — внутрь, при разгоне — вперёд
  const lean = Math.max(-0.26, Math.min(0.26, -P.yawRate * sp * 0.035)), pitch = Math.max(-0.08, Math.min(0.14, P.acc * 0.025));
  const kl = 1 - Math.exp(-dt * 6); h.rotation.z += (lean - h.rotation.z) * kl; h.rotation.x += (pitch - h.rotation.x) * kl;
  // замах занят до конца движения ноги; запись может закончиться раньше этого запаса — тогда до её конца (иначе поза застывает навсегда)
  const busyTill = (C, extra) => Math.min(C.tc + extra, C.dur - 0.05);
  const busy = (pl.name === 'strike' && pl.t < busyTill(STRIKE, 0.3)) || (pl.name === 'pass' && pl.t < busyTill(PASS, 0.22)) || (pl === shooter && run.feint);
  if (!busy) loco(pl, sp, dt);
  tickPlayer(pl, dt);
  // касания при ведении — в такт шагу: правая нога проходит вперёд на ~62–69% цикла бега (замер записи jog_forward);
  // на медленном шаге (бег почти не смешан) — когда носок у мяча; и не реже раза в touchMax
  const who = pl === shooter ? 'me' : 'mate';
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
  if (FREE() && run) runPhys(h);
  const flying = FREE() ? state === 'play' || state === 'over' : state === 'fly' || state === 'over';
  if (B.state === 'free' && flying) onEvents(BP.stepFree(B, h, worldNow()));
  if (B.state === 'held') { handsAt(B.p); B.v.set(0, 0, 0); B.w.set(0, 0, 0); }
  spinBall(h);
  if (kick) kick.t += h;
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
  if (STADIUM) STADIUM.tick(now, raw);
  drawSwipe(raw);
  if (state === 'load') return;

  // физика — фиксированными шагами (не зависит от частоты кадров; при просадке время не копится больше maxFrame)
  const pT0 = PROF ? performance.now() : 0;
  const steps = fixed.add(dt);
  for (let i = 0; i < steps; i++) gameStep(BP.CFG.dt);
  // позы — каждый кадр
  if (FREE() && run) runAnim(dt);
  else if (state === 'aim') tickPlayer(shooter, dt);
  else if (state === 'runup') { tickPlayer(shooter, dt); keeperRead(dt); if (shooter.t >= KICK.tc) launch(); }
  else afterKick(dt);
  tickPlayer(keeper, dt); updSpheres(keeper, dt); if (FREE()) updSpheres(shooter, dt); if (run && run.mate) updSpheres(run.mate.pl, dt);
  if (kick && !kick.dived && kick.t >= kick.react) keeperDive();
  if (MODE === 'fk') wall.forEach((w, i) => w.holder.visible && wallTick(w, i, dt)); // в «2 на 1» первый из стенки — партнёр
  // мяч на экране — между двумя последними шагами физики (плавно при любой частоте кадров)
  if (B.state === 'held') { handsAt(B.p); ballPrev.copy(B.p); }
  ball.position.lerpVectors(ballPrev, B.p, fixed.alpha);
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
  if (TV() && run) { const a = run.P.p, b = run.mate.P.p, x0 = Math.min(a.x, b.x, ball.position.x, 0), x1 = Math.max(a.x, b.x, ball.position.x, 0), z0 = Math.min(a.z, b.z, ball.position.z, 0), z1 = Math.max(a.z, b.z, ball.position.z, 0);
    fitShadow((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 4); }
  else if (FREE() && run) { const P = run.P.p; fitShadow(P.x * 0.7, P.z * 0.65, Math.max(9, Math.hypot(P.x, P.z) * 0.35 + 4)); }
  else fitShadow(spot.x * 0.5, spot.z * 0.5 - 0.5, spot.length() * 0.5 + 3);
  // для сравнения кадров (скриншоты до/после): window.__cam = { p: [x, y, z], l: [x, y, z], fov } — камера стоит ровно там
  if (window.__cam) { cam.position.fromArray(window.__cam.p); cam.lookAt(tmpA.fromArray(window.__cam.l)); if (window.__cam.fov) { cam.fov = window.__cam.fov; cam.updateProjectionMatrix(); } }
  const pT1 = PROF ? performance.now() : 0;
  ren.render(scene, cam);
  if (PROF) { PROF.logic += pT1 - pT0; PROF.render += performance.now() - pT1; PROF.n++; }
  // ?trace=1 — покадровая запись для проверки движения (мяч на экране и в физике, игрок, камера, поза); в обычной игре выключено
  if (TRACE && run) {
    let gk = 9; for (const q of keeper.sph || []) gk = Math.min(gk, Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z) - q.r - R);
    // от поверхности мяча до ближайшего носка (реальная стопа в мире)
    const toe = Math.min(shooter.toeL.getWorldPosition(tmpB).distanceTo(B.p), shooter.toeR.getWorldPosition(tmpB).distanceTo(B.p)) - R;
    const mt = run.mate; TRACE.push({ ow: B.owner, mp: mt ? [mt.P.p.x, mt.P.p.z] : null, mst: mt ? mt.st : null, man: mt ? mt.pl.name : null, toe, push: B.push, gst: GKS.st, gan: keeper.name, gp: [keeper.holder.position.x, keeper.holder.position.z], ev: lastEvent, t: +clock.toFixed(4), st: state, bs: B.state, b: ball.position.toArray(), bp: B.p.toArray(), p: [run.P.p.x, run.P.p.z], v: Math.hypot(run.P.v.x, run.P.v.z), yaw: run.P.yaw,
      cam: cam.position.toArray(), an: shooter.name, at: !!B.strikeAt, gk, q: QL,
      lo: shooter.loco ? [shooter.loco.idle, shooter.loco.jog].map((a) => [+a.getEffectiveWeight().toFixed(2), +a.time.toFixed(2), a.enabled, a.isRunning()]) : null, aw: shooter.act ? +shooter.act.getEffectiveWeight().toFixed(2) : 0, ctl: shooter === shooter0 ? 'A' : 'B', pick: mt ? mt.pick : null, mv: mt ? Math.hypot(mt.P.v.x, mt.P.v.z) : 0, man2: mt ? mt.pl.name : null });
  }
}
const TRACE = Q.get('trace') === '1' ? (window.__trace = []) : null;
// ?prof=1 — замер на кадр: игровая логика и анимации (logic) и подготовка отрисовки на процессоре (render)
const PROF = Q.get('prof') === '1' ? (window.__prof = { logic: 0, render: 0, n: 0 }) : null;
if (TRACE) window.__variants = () => { let n = 0; for (const c of variants.values()) for (const t of c.tracks) n += t.values.length + t.times.length; return { clips: variants.size, mb: +(n * 4 / 1e6).toFixed(2) }; };
if (TRACE) window.__joy = (x, y) => { joy.x = x; joy.y = y; }; // для проверки: джойстик из теста (медленный ход)
// для проверки: расставить управляемого игрока и бота (мяч — у ноги управляемого)
if (TRACE) window.__place = (ax, az, bx, bz) => { const P = run.P, M = run.mate && run.mate.P; P.p.x = ax; P.p.z = az; P.v.x = P.v.z = 0; if (M) { M.p.x = bx; M.p.z = bz; M.v.x = M.v.z = 0; }
  placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; ballPrev.copy(B.p); };
// для проверки: свободный мяч в заданной точке и с заданной скоростью (лежащий / медленно катящийся)
if (TRACE) window.__ball = (x, z, vx = 0, vz = 0) => { if (B.state === 'owned' || B.state === 'strike') BP.release(B, B.owner, simT, 0.5, false); B.state = 'free'; B.owner = null; B.p.set(x, R, z); B.v.set(vx, 0, vz); B.w.set(0, 0, 0); ballPrev.copy(B.p); if (run) run.shotT = simT; };

// ---------- старт ----------
(async () => {
  const bar = $('#loadbar');
  const all = [player(myKit), player(gkKit), ...[0, 1, 2, 3].map(() => player(wallKit()))];
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; shooter0 = shooter; wall.push(...got.slice(2)); blob(ball, 0.45); makeSpheres(keeper, 'gk'); makeSpheres(shooter, 'me'); makeSpheres(wall[0], 'mate');
  // мяч: модель LeMon74 (Sketchfab, CC BY 4.0), облегчена gltfpack до 3,5 тыс. треугольников
  try { const bm = (await loader.loadAsync('assets/ball.glb')).scene, bb = new THREE.Box3().setFromObject(bm), sz = bb.getSize(new THREE.Vector3()).x;
    bm.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; // настоящий мяч LeMon74: белые и чёрные панели — без хрома, мягкий блик
      const L = o.material.color.r > 0.3 ? LOOK.ball.white : LOOK.ball.black; o.material.color.set(L.color); o.material.roughness = L.rough; o.material.metalness = 0; o.material.envMapIntensity = LOOK.ball.env; }); bm.scale.setScalar((R * 2) / sz); bm.position.copy(bb.getCenter(new THREE.Vector3()).multiplyScalar(-(R * 2) / sz)); ball.add(bm); ball.material.visible = false; } catch (e) { /* остаётся простой мяч */ }
  await goalModel().catch(() => goalSimple());
  prepKick(); prepStrike(); prepKeeper();

  resetShot();
  // шейдеры собираем заранее для всего, что пока скрыто (брызги травы при ударе, конфетти, стенка, партнёр), —
  // иначе видеокарта собирает их в момент первого удара и кадр подвисает
  const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  ren.compile(scene, cam); ren.render(scene, cam); hidden.forEach((o) => (o.visible = false)); // один кадр под заставкой загрузки: драйвер доделывает шейдеры при первой отрисовке
  $('#load').remove();
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
