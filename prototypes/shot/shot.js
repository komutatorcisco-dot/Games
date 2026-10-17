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
import * as BP from './ballphys.js'; // физика мяча, ведение, удар — единый конфиг BP.CFG

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'ИГРОК').toUpperCase().slice(0, 14);
let MODE = ['pen', 'run'].includes(Q.get('mode')) ? Q.get('mode') : 'fk';
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
// на экранах с плотными пикселями сглаживание почти не видно, а стоит дорого — выключаем
// мерцание («рябь») на телефоне было от выключенного сглаживания и низкого разрешения — возвращаем оба
const ren = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(LOW ? 1 : 1.5, devicePixelRatio)); ren.setSize(innerWidth, innerHeight);
ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.15;
ren.shadowMap.enabled = false; // вместо карты теней — мягкие пятна под игроками и мячом (вдвое меньше работы видеокарте)
document.body.prepend(ren.domElement);
const scene = new THREE.Scene();
scene.fog = NIGHT ? new THREE.Fog('#0d1530', 60, 140) : new THREE.Fog('#bcd3ea', 90, 220);
// горизонтальный экран: угол обзора поуже, чтобы ворота не казались далёкими
const fov = () => (innerWidth > innerHeight ? { pen: 33, fk: 37, run: 42 }[MODE] : 48);
const cam = new THREE.PerspectiveCamera(fov(), innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.fov = fov(); cam.updateProjectionMatrix(); fitSwipe(); });
// в Telegram (мини-приложение) — на весь экран и горизонтально
addEventListener('load', () => { const tg = window.Telegram && Telegram.WebApp; if (!tg || !tg.initData) return;
  try { tg.ready(); tg.expand(); tg.requestFullscreen && tg.requestFullscreen(); tg.lockOrientation && tg.lockOrientation(); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) { /* старый Telegram */ } });
// «Во весь экран»: на Android ещё и закрепляем горизонтальный поворот (на iPhone — просто поверни телефон)
document.getElementById('rotBtn').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); await screen.orientation.lock('landscape'); } catch (e) { /* не везде можно */ }
});

// свет: днём — солнце и небо (освещение берём из самой картинки неба), ночью — прожекторы
scene.add(new THREE.HemisphereLight(NIGHT ? '#b9c8ff' : '#cfe4ff', NIGHT ? '#2d5a24' : '#3d6b2c', NIGHT ? 0.9 : 0.7));
const key = new THREE.DirectionalLight(NIGHT ? '#fff6e6' : '#fff2dc', NIGHT ? 2.6 : 3.0); key.position.set(-18, 30, 22);
key.target.position.set(0, 0, 10); scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#cfe0ff', NIGHT ? 0.9 : 0.6); fill.position.set(20, 18, 30); scene.add(fill);
const rim = new THREE.DirectionalLight('#ffffff', 0.7); rim.position.set(0, 14, -30); scene.add(rim);

// ---------- небо ----------
if (NIGHT) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#04060f'); gr.addColorStop(0.55, '#0e1838'); gr.addColorStop(1, '#2a3a74');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
} else {
  // дневное небо: ambientCG DaySkyHDRI069B (CC0) — и фон, и мягкий отражённый свет на игроках и газоне
  new THREE.TextureLoader().load('assets/sky.webp', (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    const pm = new THREE.PMREMGenerator(ren); scene.environment = pm.fromEquirectangular(t).texture; scene.environmentIntensity = 0.55; pm.dispose();
  });
}

// ---------- газон ----------
function pitch() {
  const X0 = -40, X1 = 40, Z0 = -8, Z1 = 56, S = LOW ? 10 : 14, c = document.createElement('canvas');
  c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
  const g = c.getContext('2d'), px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
  for (let i = 0; i * 5.5 < Z1 - Z0; i++) { g.fillStyle = i % 2 ? '#2f7d2c' : '#378f33'; g.fillRect(0, i * 5.5 * S, c.width, 5.5 * S); }
  // травинки: мелкий шум, чтобы газон не был пластиковым
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n * 0.5; d[i + 1] += n; d[i + 2] += n * 0.4; }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.12 * S;
  const rect = (x0, z0, x1, z1) => g.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
  g.beginPath(); g.moveTo(px(X0), pz(0)); g.lineTo(px(X1), pz(0)); g.stroke();
  rect(-20.16, 0, 20.16, 16.5); rect(-9.16, 0, 9.16, 5.5);
  g.beginPath(); g.arc(px(0), pz(11), 0.11 * S, 0, 7); g.fillStyle = '#fff'; g.fill(); // точка пенальти — 22 см, как настоящая
  g.beginPath(); g.arc(px(0), pz(11), 9.15 * S, Math.asin(5.5 / 9.15), Math.PI - Math.asin(5.5 / 9.15)); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ren.capabilities.getMaxAnisotropy();
  // настоящая трава (ambientCG Grass001, CC0): мелкий рисунок и рельеф поверх полос стрижки
  const tl = new THREE.TextureLoader(), rep = new THREE.Vector2((X1 - X0) / 2.2, (Z1 - Z0) / 2.2);
  const gN = tl.load('assets/grass_n.webp'), gC = tl.load('assets/grass.webp');
  for (const x of [gN, gC]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.copy(rep); x.anisotropy = 8; }
  gC.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, normalMap: gN, normalScale: new THREE.Vector2(0.7, 0.7) });
  pm.onBeforeCompile = (sh) => {
    sh.uniforms.grassC = { value: gC };
    sh.fragmentShader = 'uniform sampler2D grassC;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  float ln = smoothstep(0.45, 0.75, min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)));\n  diffuseColor.rgb *= mix(texture2D(grassC, vNormalMapUv).rgb * 2.7, vec3(1.0), ln); // разметку (белое) травой не красим');
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), pm);
  m.rotation.x = -Math.PI / 2; m.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); m.receiveShadow = true; scene.add(m);
  const run = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#2a6a27', roughness: 1 }));
  run.rotation.x = -Math.PI / 2; run.position.y = -0.01; scene.add(run);
}

// ---------- ворота и сетка (сетка колышется от мяча) ----------
const net = { pos: null, base: null, geo: null, hits: [] };
// ворота как на больших стадионах: тонкие белые штанги, сетка «коробкой» — ровная крыша назад и наклонный задник,
// ячейки — соты; сзади держится на тонких трубах
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
  // ячейки-соты: рисуем узор, он повторяется без швов
  const a = 16, h = Math.sqrt(3) * a, c = document.createElement('canvas'); c.width = 3 * a * 2; c.height = Math.round(h * 2);
  const g = c.getContext('2d'); g.scale(2, c.height / h); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineJoin = 'round';
  const hex = (cx, cy) => { g.beginPath(); for (let k = 0; k <= 6; k++) { const an = (k * Math.PI) / 3; g.lineTo(cx + a * Math.cos(an), cy + a * Math.sin(an)); } g.stroke(); };
  for (const [cx, cy] of [[0, 0], [3 * a, 0], [0, h], [3 * a, h], [1.5 * a, h / 2], [1.5 * a, -h / 2], [1.5 * a, 1.5 * h]]) hex(cx, cy);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  const CU = 0.27, CV = CU * (h / (3 * a)); // размер узора в метрах: соты ~9 см
  const P = [], UV = [], I = [];
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
  const nm = new THREE.Mesh(net.geo, new THREE.MeshBasicMaterial({ map: tex, color: '#eef2f6', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  nm.frustumCulled = false; scene.add(nm);
}
// ворота — модель romullus (Sketchfab, CC BY-SA 4.0), сетка облегчена gltfpack; колышется в шейдере от удара мяча
const netU = { uHit: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 9)) } };
async function goalModel() {
  const g = (await loader.loadAsync('assets/goal.glb')).scene;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.name === 'rope') m.onBeforeCompile = (sh) => {
      sh.uniforms.uHit = netU.uHit;
      sh.vertexShader = 'uniform vec4 uHit[4];\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 wq = modelMatrix * vec4(transformed, 1.0); float dz = 0.0;
        for (int i = 0; i < 4; i++) { vec4 h = uHit[i]; vec2 d = wq.xy - h.xy; dz += h.z * exp(-dot(d, d) / 0.9) * exp(-h.w * 3.0) * cos(h.w * 14.0); }
        wq.z -= dz * smoothstep(-0.2, -0.6, wq.z);
        vec4 mvPosition = viewMatrix * wq; gl_Position = projectionMatrix * mvPosition;`);
    };
  });
  scene.add(g);
}
function netTick(dt) {
  if (!net.hits.length) return;
  if (!net.pos) { // модель: передаём удары в шейдер
    net.hits.forEach((h) => (h.t += dt)); net.hits = net.hits.filter((h) => h.t < 1.6).slice(-4);
    netU.uHit.value.forEach((v, i) => { const h = net.hits[i]; if (h) v.set(h.x, h.y, h.a, h.t); else v.set(0, 0, 0, 9); });
    return;
  }
  const a = net.pos.array, b = net.base;
  net.hits.forEach((h) => (h.t += dt)); net.hits = net.hits.filter((h) => h.t < 1.6);
  for (let i = 0; i < a.length; i += 3) {
    let dz = 0;
    for (const h of net.hits) { const dx = b[i] - h.x, dy = b[i + 1] - h.y, w = Math.exp(-(dx * dx + dy * dy) / 0.9); dz += h.a * w * Math.exp(-h.t * 3) * Math.cos(h.t * 14); }
    a[i + 2] = b[i + 2] - dz;
  }
  net.pos.needsUpdate = true;
}

// ---------- трибуны и болельщики ----------
let crowd = null;
function stadium() {
  // человечек: голова и плечи (белый — цвет даёт instanceColor)
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 26, 15, 0, 7); g.fill(); g.beginPath(); g.ellipse(32, 92, 28, 46, 0, Math.PI, 0); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true }); // без расчёта света — тысячам людей он не нужен
  const U = { uTime: { value: 0 }, uJump: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime; uniform float uJump; attribute float aPh;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      float jb = uJump * abs(sin(uTime * 9.0 + aPh * 6.0)) * 0.45;
      transformed.y += sin(uTime * (1.2 + fract(aPh * 7.0)) + aPh * 30.0) * 0.04 + jb;
      transformed.x += sin(uTime * 0.7 + aPh * 11.0) * 0.03;`);
  };
  const seats = [];
  // ярусы: за воротами (широкий) и по бокам — ступени
  const tiers = [{ x: 0, w: 92, rot: 0 }, { x: -44, w: 70, rot: Math.PI / 2 }, { x: 44, w: 70, rot: -Math.PI / 2 }];
  const conc = new THREE.MeshStandardMaterial({ color: NIGHT ? '#1b2340' : '#7d8597', roughness: 0.9 });
  const rowsN = LOW ? 8 : 13, step = 0.9, rise = 0.55;
  let lampY = 0, lampZ = 0;
  for (const T of tiers) {
    const grp = new THREE.Group();
    for (let r = 0; r < rowsN; r++) {
      const ring = r >= rowsN * 0.55 ? 1.6 : 0; // проход между ярусами
      const z = -r * step - ring, y = 0.9 + r * rise + ring * 0.8;
      const st = new THREE.Mesh(new THREE.BoxGeometry(T.w, rise, step), conc); st.position.set(0, y - rise / 2, z); grp.add(st);
      for (let x = -T.w / 2 + 0.4; x < T.w / 2 - 0.4; x += 0.8) { if (Math.random() < 0.12) continue; seats.push({ grp, p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.15, y + 0.33, z + 0.1) }); }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.5, 14), new THREE.MeshStandardMaterial({ color: NIGHT ? '#0d1226' : '#d9dee6', roughness: 0.6 }));
    roof.position.set(0, 0.9 + rowsN * rise + 8, -rowsN * step * 0.65); roof.rotation.x = -0.12; grp.add(roof);
    const lamp = { position: new THREE.Vector3(0, roof.position.y - 0.6, roof.position.z + 7) };
    grp.rotation.y = T.rot;
    if (T.rot === 0) { grp.position.set(0, 0, -12); lampY = lamp.position.y; lampZ = -12 + lamp.position.z; } else grp.position.set(T.x, 0, 18);
    scene.add(grp); grp.updateMatrixWorld(true);
  }
  // свечение прожекторов: мягкие пятна
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d');
  const rg = gg.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,250,235,1)'); rg.addColorStop(0.25, 'rgba(255,240,210,.45)'); rg.addColorStop(1, 'rgba(255,240,210,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
  const gt = new THREE.CanvasTexture(gc);
  for (let i = 0; i < (NIGHT ? 9 : 0); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.position.set(-36 + i * 9, lampY, lampZ + 0.5); s.scale.setScalar(9); scene.add(s);
  }
  // люди: один InstancedMesh
  const n = seats.length, geo = new THREE.PlaneGeometry(0.5, 0.75);
  const ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = Math.random();
  geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  crowd = new THREE.InstancedMesh(geo, mat, n); crowd.userData.U = U;
  const cols = ['#e63946', '#f1faee', '#ffd23f', '#3a86ff', '#1b1340', '#e63946', '#ffffff', '#ff9f1c', '#2ec4b6', '#e63946'];
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), wp = new THREE.Vector3(), col = new THREE.Color();
  seats.forEach((s, i) => {
    wp.copy(s.p).applyMatrix4(s.grp.matrixWorld);
    s.grp.getWorldQuaternion(qq); sc.setScalar(0.85 + Math.random() * 0.3);
    m4.compose(wp, qq, sc); crowd.setMatrixAt(i, m4);
    col.set(cols[(Math.random() * cols.length) | 0]).multiplyScalar(0.55 + Math.random() * 0.45); crowd.setColorAt(i, col);
  });
  crowd.frustumCulled = false; scene.add(crowd);
  // LED-щиты вокруг поля: бегущая надпись
  const b = document.createElement('canvas'); b.width = 1024; b.height = 64; const bg = b.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const gr = bg.createLinearGradient(i * 256, 0, i * 256 + 256, 0); gr.addColorStop(0, i % 2 ? '#2b1a7a' : '#ffcf3a'); gr.addColorStop(1, i % 2 ? '#5a3ad6' : '#ff9f1c');
    bg.fillStyle = gr; bg.fillRect(i * 256, 0, 256, 64);
    bg.fillStyle = i % 2 ? '#ffcf3a' : '#1b1340'; bg.font = 'italic 900 40px system-ui'; bg.textAlign = 'center'; bg.fillText(i % 2 ? 'JACKSON' : 'GAMES', i * 256 + 128, 46);
  }
  const bt = new THREE.CanvasTexture(b); bt.colorSpace = THREE.SRGBColorSpace; bt.wrapS = THREE.RepeatWrapping; bt.repeat.x = 6;
  const led = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false });
  const ad = new THREE.Mesh(new THREE.BoxGeometry(84, 0.95, 0.15), led); ad.position.set(0, 0.48, -6.5); scene.add(ad);
  for (const s of [-1, 1]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(60, 0.95, 0.15), led); sd.rotation.y = Math.PI / 2; sd.position.set(s * 38, 0.48, 22); scene.add(sd); }
  crowd.userData.led = bt;
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 24), new THREE.MeshStandardMaterial({ map: t, roughness: 0.32 }));
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
  for (const b of blobs) { const t = b.bone ? b.bone.getWorldPosition(blobV) : b.target.position; b.m.position.set(t.x, 0.01, t.z); b.m.visible = b.target.visible !== false;
    const k = Math.max(0.35, 1 - t.y / 2.5); b.m.scale.setScalar(k); b.m.material.opacity = k; }
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
async function player(kit) { // у всех одна и та же полная модель — без упрощения
  await baseReady;
  const src = base;
  const m = cloneSkinned(src.scene);
  const baseMats = {}; base.scene.traverse((o) => { if (o.isMesh) baseMats[o.name] = o.material; });
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = (baseMats[o.name] || o.material).clone(); // свой материал (цвет формы), текстуры общие
    // матовая ткань и кожа: при переводе модели материал получил «металл» 0,5 и двойной блеск — выглядело мокрым пластиком
    const mt = o.material; mt.metalness = 0; mt.metalnessMap = null; mt.roughnessMap = null; mt.roughness = o.name === 'Ch38_Hair' ? 0.7 : 0.88;
    if ('specularIntensity' in mt) { mt.specularIntensity = 0.25; mt.specularIntensityMap = null; mt.specularColorMap = null; mt.specularColor && mt.specularColor.set('#ffffff'); }
    if (mt.normalScale) mt.normalScale.set(0.8, 0.8);
    const part = kit && PART[o.name]; if (part && kit[part]) o.material.color.set(kit[part]);
  });
  const holder = new THREE.Group(); holder.add(m); scene.add(holder);
  const bl = blob(holder, 1.3);
  const hips = m.getObjectByName('Hips');
  blobs.find((x) => x.m === bl).bone = hips; // тень идёт за тазом: записанные движения двигают игрока сами
  const footL = m.getObjectByName('LeftFoot'), footR = m.getObjectByName('RightFoot');
  const body = ['LeftHand', 'RightHand', 'Spine2', 'Head'].map((n) => m.getObjectByName(n)); // чем вратарь касается мяча
  return { holder, model: m, mixer: new THREE.AnimationMixer(m), hips, hipsRest: hips.position.clone(), body, footL, footR, act: null, t: 0 };
}
const hexKit = (q) => { const k = (q || '').split('.').filter((c) => /^[0-9a-f]{6}$/i.test(c)); return k.length ? { shirt: '#' + k[0], shorts: '#' + (k[1] || k[0]), socks: '#' + (k[2] || k[1] || k[0]) } : null; };
const myKit = hexKit(Q.get('kit')); // без ?kit= — своя белая форма модели
const gkKit = { shirt: '#ffd23f', shorts: '#2a2d3a', socks: '#ffd23f' };
const wallKit = () => ({ shirt: '#e0303c', shorts: '#ffffff', socks: '#e0303c' });
let shooter, keeper; const wall = [];

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
  $('#pad').hidden = MODE !== 'run';
  cam.fov = fov(); cam.updateProjectionMatrix();
  $('#hint').textContent = MODE === 'run' ? 'Слева веди пальцем — бежишь с мячом. Держи «Удар» — сила, наклони джойстик — куда бить, отпусти — удар. Без джойстика бьёт туда, куда смотрит.' : 'Проведи пальцем от мяча к воротам. Быстрее — сильнее, изогни линию — мяч закрутится.';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  msg.className = 'msg'; clearTimeout(toastT); kick = null; shot = null; slow = 1; slowT = 0;
  if (MODE === 'run') return resetRun();
  setSpot(n);
  placeBall(spot);
  placeShooter(); shooter.holder.position.y = 0;
  play(shooter, 'idle', { loop: true, fade: 0.2, t: Math.random() * 3, lock: shooter.holder.localToWorld(KICK.root0.clone()) }); // стоит там, откуда начнёт разбег
  keeper.holder.position.set(MODE === 'fk' ? Math.sign(spot.x || 1) * 0.7 : 0, 0, -0.25); keeper.holder.rotation.set(0, 0, 0);
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, t: Math.random() * 2, lock: keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)) });
  wall.forEach((w, i) => play(w, 'idle', { loop: true, fade: 0.3, t: 1 + i * 1.7, speed: 0.8, lock: w.holder.localToWorld(new THREE.Vector3(0, 0, 0)) }));
  aimCam(); if (state === 'load') { camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); } // после placeShooter — игрок уже стоит
  state = 'aim'; shot = null; kick = null; setTimeout(sfx.whistle, 500); sfx.level(MODE === 'pen' ? 0.6 : 0.4); celebrate = -1; slow = 1; msg.className = 'msg';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  dots();
}
function dots() {
  $('#dots').innerHTML = Array.from({ length: SHOTS }, (_, i) => `<i class="${results[i] === undefined ? '' : results[i] ? 'g' : 'm'}"></i>`).join('');
  $('#who').innerHTML = `${NAME}<small>удар <b>${ST}</b></small>`;
  $('#score').textContent = results.filter(Boolean).length;
}

// ---------- свайп: светящаяся линия за пальцем ----------
const sw = document.createElement('canvas'); sw.className = 'swipe'; document.body.appendChild(sw); const sg = sw.getContext('2d');
function fitSwipe() { const d = Math.min(2, devicePixelRatio); sw.width = innerWidth * d; sw.height = innerHeight * d; sg.setTransform(d, 0, 0, d, 0, 0); }
fitSwipe();
let path = [], fade = 0, drawn = [];
const scr = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
addEventListener('pointerdown', (e) => { if (state !== 'aim' || MODE === 'run' || e.target.closest('button, .joy')) return; path = [scr(e)]; drawn = path; fade = 1; });
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
  if (first) { sfx.hands(false); sfx.buzz('medium'); if (MODE === 'run') toast(q.kind === 'hand' ? 'Отбил!' : 'Блок!'); else finish(false, 'Отбил!', 'miss'); }
  return 'bounce';
};
function worldNow() {
  world.goal = goalDef();
  const own = MODE === 'run' && shooter.sph && !(B.lockOwner === 'me' && (simT < B.lockUntil || B.mustClear));
  world.spheres = own ? keeper.sph.concat(shooter.sph) : keeper.sph;
  return world;
}
// события шага мяча: звук, волна сетки, гол
function onEvents(ev) {
  for (const e of ev) {
    if (e.type === 'bounce' && shot) sfx.bounce(e.v);
    else if (e.type === 'post' || e.type === 'bar') {
      const t = e.type === 'bar' ? 'Перекладина!' : 'Штанга!'; sfx.post(); sfx.buzz('heavy'); shake = Math.max(shake, 0.08);
      if (kick) kick.post = t; if (run) run.lastPost = t; if (MODE === 'run') toast(t);
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
// вратарь заранее прикидывает, где и когда мяч долетит до него, — по этому прыгает. Достанет ли — решает только касание.
function planKeeper() {
  const kz = Math.max(0, keeper.holder.position.z - 0.2), { p, t } = predict(B.p, vel, spin, kz);
  const react = 0.2 + Math.random() * 0.12, kx = keeper.holder.position.x;
  const need = Math.max(0, Math.abs(p.x - kx) - 0.75), topCorner = p.y > 1.9 && Math.abs(p.x) > 2.6;
  const goalBound = Math.abs(predict(B.p, vel, spin).p.x) < GW + 0.3;
  const can = need <= 6.2 * Math.max(0, t - react) * (topCorner ? 0.55 : 1) && goalBound && p.y < 2.6;
  const lp = keeper.holder.worldToLocal(new THREE.Vector3(p.x, p.y, kz)); // точка мяча глазами вратаря
  kick = { t: 0, T: t, cx: p.x, cy: p.y, lx: lp.x, kz, react, save: can && Math.random() < (ST > 90 ? 0.72 : 0.86), dir: Math.sign(p.x - kx) || 1, done: false, x0: kx };
}
function keeperDive() {
  kick.dived = true;
  const dx = kick.lx, far = Math.abs(dx) > 0.9, left = kick.T - kick.react;
  if (!far) { play(keeper, kick.cy > 0.55 ? 'gk_catch' : 'gk_block', { t: 0.25, fade: 0.12, speed: 1.4, hold: 1.6, fz: 0.3, lock: keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)) }); return; }
  // прыжок в нужную сторону; растягиваем вбок до точки мяча (или не долетает — гол), вперёд из ворот почти не выходим,
  // к высокому мячу приподнимаемся; после падения остаёмся лежать (запись дальше — вставание — не играем)
  const D = DIVE[dx > 0 ? 'R' : 'L'], want = kick.save ? Math.abs(dx) - 0.85 : Math.min(Math.abs(dx) * 0.55, 1.8);
  const t0 = Math.max(0, D.tk - left), up = Math.max(0, Math.min(1.1, kick.cy - 0.7));
  play(keeper, D.name, { t: t0, fade: 0.12, fx: Math.max(0.35, Math.min(1.6, want / D.reach)), fz: 0.25, hold: D.tk + 0.6,
    lift: (t) => up * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - t0) / (D.tk + 0.35 - t0))))) });
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
function toast(text) { // короткая надпись без конца эпизода (штанга, отбил — игра продолжается)
  if (state === 'over') return; msg.textContent = text; msg.className = 'msg on miss';
  clearTimeout(toastT); toastT = setTimeout(() => { if (state !== 'over') msg.className = 'msg'; }, 900);
}
function finish(ok, text, cls) {
  if (state === 'over') return; state = 'over'; clearTimeout(toastT);
  if (ok) sfx.roar(); else if (text !== 'В стенку' && text !== 'Вратарь забрал' && !(text === 'Мимо' && Math.abs(B.p.x) > GW + 2.5)) sfx.ooh();
  results[n] = ok; msg.textContent = text; msg.className = 'msg on ' + cls; dots();
  if (ok) { celebrate = 0; slow = 0.3; slowT = 0.9; shake = 0.35; confetti(); crowd.userData.U.uJump.value = 1; }
  setTimeout(() => { crowd.userData.U.uJump.value = 0; n++; if (n >= SHOTS) end(); else resetShot(); }, ok ? 2600 : 1800);
}
function end() {
  const g = results.filter(Boolean).length;
  $('#endT').textContent = g >= 4 ? 'Отлично!' : g >= 2 ? 'Неплохо' : 'Мимо…';
  $('#endP').textContent = `Голов: ${g} из ${SHOTS}`;
  $('#end').classList.add('on');
}
$('#again').addEventListener('click', () => { $('#end').classList.remove('on'); n = 0; results = []; resetShot(); });
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
  header: 'header_soccerball', header2: 'header_soccerball_2' };
const clipOf = (name) => base.animations.find((c) => c.name === (ALIAS[name] || name));
const variants = new Map();
// копия движения: смещение таза по сторонам (fx) и вперёд (fz) умножено — вратарь долетает ровно до мяча и не выбегает из ворот
function variant(name, fx = 1, fz = 1) {
  const key = name + '|' + fx.toFixed(2) + '|' + fz.toFixed(2); if (variants.has(key)) return variants.get(key);
  const c = clipOf(name).clone(); c.name = key;
  const tr = c.tracks.find((t) => t.name === 'Hips.position');
  if (tr && (fx !== 1 || fz !== 1)) { const v = tr.values, x0 = v[0], y0 = v[1]; for (let i = 0; i < v.length; i += 3) { v[i] = x0 + (v[i] - x0) * fx; v[i + 1] = y0 + (v[i + 1] - y0) * fz; } }
  variants.set(key, c); return c;
}
function play(pl, name, { t = 0, loop = false, fade = 0.25, speed = 1, hold = Infinity, fx = 1, fz = 1, lock = null, lift = 0, follow = false } = {}) {
  const a = pl.mixer.clipAction(variant(name, fx, fz));
  a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = speed; a.time = t;
  if (pl.act && pl.act !== a && fade > 0) a.crossFadeFrom(pl.act, fade, false); else if (pl.act && pl.act !== a) pl.act.stop();
  a.play(); Object.assign(pl, { act: a, name, hold, lock, lift, t0: t, t, follow });
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
let STRIKE = null, run = null, crowdT = 0;
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, keys = {}, btn = { shot: false, fin: false, sprint: false };
function resetRun() {
  wall.forEach((w) => (w.holder.visible = false));
  const sx = (Math.random() * 2 - 1) * 7, P = BP.newPlayer({ x: sx, z: 30 }, Math.PI);
  shooter.holder.position.set(sx, 0, 30); shooter.holder.rotation.set(0, Math.PI, 0);
  placeBall(BP.controlPoint(P, null)); BP.capture(B, P, 'me'); B.trapDur = 0; // мяч у ноги с самого начала
  play(shooter, 'idle', { loop: true, fade: 0.2, follow: true });
  keeper.holder.position.set(0, 0, 0.4); keeper.holder.rotation.set(0, 0, 0); keeper.smother = false;
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, follow: true });
  resetSpheres(keeper); resetSpheres(shooter);
  run = { P, charge: -1, fin: false, kv: new THREE.Vector3(), strike: null, fire: false, shotT: 0, slowT: 0, t0: simT, lastPost: null, wasStopping: false };
  const hp = shooter.holder.position; camAim.p.set(hp.x * 0.8, 3.4, hp.z + 7.4); camAim.l.set(hp.x * 0.55, 0.9, hp.z - 9);
  if (state === 'load') { camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); }
  state = 'play'; celebrate = -1; dots();
  // подсказка — только при первом запуске «1 на 1» на этом телефоне
  let seen = false; try { seen = localStorage.getItem('shot.run.hint') === '1'; localStorage.setItem('shot.run.hint', '1'); } catch (e) { /* без памяти — покажем */ }
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
const hintOff = () => { if (MODE === 'run') $('#hint').style.opacity = 0; };
// сила удара — кольцо вокруг кнопки «Удар»
const ringFg = $('#ringFg');
function setPower(p) { ringFg.style.strokeDashoffset = 100 - p * 100; ringFg.style.stroke = p > 0.92 ? '#ff4f5e' : ''; }
const hold = (id, k) => { const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); btn[k] = true; b.classList.add('on'); if (k !== 'sprint') startCharge(k === 'fin'); });
  const up = () => { if (!btn[k]) return; btn[k] = false; b.classList.remove('on'); if (k !== 'sprint') releaseCharge(); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
hold('#b-shot', 'shot'); hold('#b-fin', 'fin'); hold('#b-run', 'sprint');
addEventListener('keydown', (e) => { if (e.code === 'Space') e.preventDefault(); if (keys[e.code]) return; keys[e.code] = true; /* пробел не нажимает кнопки режима */ if (e.code === 'Space') startCharge(false); if (e.code === 'KeyE') startCharge(true); });
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyE') releaseCharge(); });
function input() {
  let x = joy.x, y = joy.y;
  if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1;
  const L = Math.hypot(x, y); return L > 1 ? { x: x / L, y: y / L } : { x, y };
}
// держишь «Удар» — копится сила (кольцо), отпустил — удар; «Крутить» — удар щёчкой с подкруткой.
// Копить можно только с мячом у ноги; во время удара второе нажатие ничего не делает.
function startCharge(fin) {
  if (MODE !== 'run' || state !== 'play' || !run || run.charge >= 0 || run.strike || B.state !== 'owned') return;
  run.charge = performance.now(); run.fin = fin; setPower(0); $('#ring').classList.add('on'); hintOff();
}
const chargePw = () => Math.min(1, (performance.now() - run.charge) / 900); // сила копится по настоящему времени: 0,9 с — полная
function releaseCharge() {
  if (!run || run.charge < 0) return;
  const pw = chargePw(); run.charge = -1; $('#ring').classList.remove('on');
  if (state !== 'play' || B.state !== 'owned') return;
  // замах начинается сразу; мяч остаётся под контролем до касания ноги, импульс — один раз в момент касания (runPhys)
  run.strike = { pw, fin: run.fin, aim: input() }; B.state = 'strike';
  play(shooter, 'strike', { t: Math.max(0, STRIKE.tc - 0.3), fade: 0.1, speed: 1.25, follow: true });
}
function fireStrike() {
  const s = run.strike, P = run.P; run.strike = null;
  const sv = BP.shotVelocity(B, P, s.aim, s.pw, s.fin, goalDef());
  if (BP.applyShot(B, sv, BP.controlPoint(P, null), 'me', simT)) {
    B.inGoal = false; B.goal = false; B.netHit = false;
    shot = { tx: 0, ty: 0, speed: sv.speed, curve: s.fin ? 1 : 0 }; run.shotT = simT; run.lastPost = null;
    planKeeper(); kicked(s.pw);
  } else sfx.touch(); // нога не достала мяч — промах по мячу, мяч свободен
}
function runPhys(h) {
  const P = run.P, live = state === 'play';
  P.sprint = btn.sprint || keys.ShiftLeft || keys.ShiftRight; P.charging = run.charge >= 0;
  BP.playerStep(P, live ? input() : { x: 0, y: 0 }, h, B.state === 'owned' || B.state === 'strike');
  // с вратарём не сталкиваемся насквозь
  const kh = keeper.holder.position, dx = P.p.x - kh.x, dz = P.p.z - kh.z, dl = Math.hypot(dx, dz);
  if (dl < 0.6 && dl > 1e-4) { P.p.x = kh.x + (dx / dl) * 0.6; P.p.z = kh.z + (dz / dl) * 0.6; }
  BP.updateClear(B, P, 'me');
  if (B.state === 'owned' || B.state === 'strike') {
    if (BP.controlStep(B, P, h, keeper.sph) === 'lost') { sfx.touch(); run.strike = null; }
    if (run.fire) { run.fire = false; if (run.strike) fireStrike(); }
    // вратарь в ногах накрыл мяч руками
    if (B.state === 'owned' && keeper.smother && keeper.sph.some((q) => q.kind === 'hand' && Math.hypot(q.x - B.p.x, q.y - B.p.y, q.z - B.p.z) < q.r + R + 0.04)) {
      B.state = 'held'; B.owner = 'gk'; B.v.set(0, 0, 0); B.w.set(0, 0, 0); sfx.hands(true); finish(false, 'Вратарь забрал', 'miss');
    }
  } else if (B.state === 'free' && live && BP.canCapture(B, P, 'me', simT)) {
    const rel = BP.capture(B, P, 'me'); sfx.touch(); if (rel > 5) sfx.buzz('light'); // приём: сильный мяч гасится дольше
  }
  keeperAI(h);
  // итог эпизода
  if (!live) return;
  if (B.state === 'free') {
    if (!B.inGoal && B.p.z < -0.3) return finish(false, run.lastPost || 'Мимо', 'miss');
    if (Math.abs(B.p.x) > 33 || B.p.z > 46) return finish(false, 'Аут', 'miss');
    const far = Math.hypot(B.p.x - P.p.x, B.p.z - P.p.z) > 6, slowBall = B.v.length() < 0.3;
    run.slowT = run.shotT && far && slowBall ? run.slowT + h : 0;
    if (run.slowT > 2) return finish(false, 'Мимо', 'miss');
  }
  if (simT - run.t0 > 45) finish(false, 'Время', 'miss');
}
// вратарь: стоит на линии мяч — центр ворот и выходит навстречу; бросается в ноги, когда мяч рядом
function keeperAI(h) {
  const k = keeper.holder, bp = B.p;
  if (B.state === 'held') return;
  if (kick && kick.dived) { // после прыжка — встаёт и снова играет
    if (!kick.up && kick.t > 1.5) { kick.up = true; const w = keeper.hips.getWorldPosition(v3); k.position.set(w.x, 0, w.z); play(keeper, 'standing_up', { fade: 0.35, follow: true, speed: 1.4 }); }
    if (kick.up && keeper.name === 'standing_up' && keeper.t > clipOf('standing_up').duration - 0.15) kick = null;
    return;
  }
  if (kick && !kick.dived) return; // ждёт момента прыжка
  const dist = Math.hypot(bp.x, bp.z);
  const out = Math.max(0.4, Math.min(5.5, (22 - dist) * 0.24, dist - 1.6));
  const kt = tmpA.set(bp.x, 0, bp.z).normalize().multiplyScalar(out); kt.z = Math.max(0.3, kt.z);
  const toBall = Math.hypot(bp.x - k.position.x, bp.z - k.position.z);
  if (keeper.smother) kt.set(bp.x, 0, bp.z); // в ноги — прямо на мяч
  const kd = kt.sub(k.position); const kl = kd.length(), ksp = Math.min(keeper.smother ? 5 : 4.4, kl * 3) * (run.charge >= 0 && !keeper.smother ? 0.3 : 1); // замах — стойка
  run.kv.lerp(kl > 0.02 ? kd.normalize().multiplyScalar(ksp) : tmpB.set(0, 0, 0), 1 - Math.exp(-h * 5));
  k.position.addScaledVector(run.kv, h);
  k.rotation.y = Math.atan2(bp.x - k.position.x, bp.z - k.position.z);
  if (!keeper.smother && state === 'play' && toBall < 1.6 && bp.y < 0.5 && (B.state === 'owned' || (B.state === 'free' && B.v.length() < 8))) {
    keeper.smother = true; keeper.smT = simT; play(keeper, 'gk_scoop', { fade: 0.12, follow: true, speed: 1.25 });
  }
  if (keeper.smother && simT - keeper.smT > clipOf('gk_scoop').duration / 1.25) keeper.smother = false;
}
// позы игрока в «1 на 1» — каждый кадр (физика уже посчитана)
function runAnim(dt) {
  const P = run.P, h = shooter.holder, sp = Math.hypot(P.v.x, P.v.z);
  h.position.set(P.p.x, 0, P.p.z); h.rotation.y = P.yaw;
  // наклон: на повороте — внутрь, при разгоне — вперёд
  const lean = Math.max(-0.26, Math.min(0.26, -P.yawRate * sp * 0.035)), pitch = Math.max(-0.08, Math.min(0.14, P.acc * 0.025));
  const kl = 1 - Math.exp(-dt * 6); h.rotation.z += (lean - h.rotation.z) * kl; h.rotation.x += (pitch - h.rotation.x) * kl;
  const busy = shooter.name === 'strike' && shooter.t < STRIKE.tc + 0.3;
  const anim = sp > 0.6 ? 'jog' : 'idle';
  if (!busy && shooter.name !== anim) play(shooter, anim, { loop: true, fade: 0.3, follow: true });
  if (shooter.name === 'jog') shooter.act.timeScale = Math.max(0.7, sp / 3.6);
  tickPlayer(shooter, dt);
  if (run.strike && shooter.name === 'strike' && shooter.t >= STRIKE.tc) run.fire = true; // нога дошла до мяча
  // касания при ведении: когда стопа у мяча (по анимации), не реже раза в touchMax
  if (B.state === 'owned' && sp > 0.6 && B.touchCd <= 0) {
    const foot = Math.min(shooter.footL.getWorldPosition(tmpB).distanceTo(B.p), shooter.footR.getWorldPosition(tmpB).distanceTo(B.p));
    if (foot < 0.3 || B.touchCd < -(BP.CFG.control.touchMax - BP.CFG.control.touchMin)) { BP.touch(B, P); sfx.touch(); }
  }
  if (P.stopping && !run.wasStopping && sp > 2.5 && B.state === 'owned') sfx.touch(); // остановил мяч подошвой
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
function prepStrike() { // когда в ударе на ходу нога бьёт по мячу
  const a = shooter.mixer.clipAction(clipOf('strike')); a.reset().play();
  const fp = (n) => { shooter.model.updateMatrixWorld(true); return shooter.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()); };
  let best = 0, tc = 0.6, prev = {};
  for (let t = 0; t <= a.getClip().duration - 0.02; t += 1 / 60) { shooter.mixer.setTime(t); for (const n of ['LeftFoot', 'RightFoot']) { const q = fp(n); if (prev[n] && t > 0.2) { const v = q.distanceTo(prev[n]) * 60; if (v > best) { best = v; tc = t; } } prev[n] = q; } }
  a.stop(); STRIKE = { tc };
}

// ---------- кадр ----------
let last = performance.now() / 1000;
const fpsEl = Q.get('fps') === '1' ? Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:8px;z-index:9;font:700 12px monospace;color:#0f0;background:#000a;padding:3px 6px;border-radius:6px' }) : null;
if (fpsEl) document.body.appendChild(fpsEl);
let fpsN = 0, fpsT = 0, fpsWorst = 0, autoLow = LOW, autoN = 0, autoT = 0;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpV = new THREE.Vector3();
// один шаг игры фиксированной длины h — мяч, игрок, вратарь, итог удара
function gameStep(h) {
  simT += h; ballPrev.copy(B.p);
  const zPrev = B.p.z;
  if (MODE === 'run' && run) runPhys(h);
  const flying = MODE === 'run' ? state === 'play' || state === 'over' : state === 'fly' || state === 'over';
  if (B.state === 'free' && flying) onEvents(BP.stepFree(B, h, worldNow()));
  if (B.state === 'held') { handsAt(B.p); B.v.set(0, 0, 0); B.w.set(0, 0, 0); }
  spinBall(h);
  if (kick) kick.t += h;
  if (state !== 'fly' || MODE === 'run') return;
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
  // сам подстраивается: если кадры долгие, уменьшаем разрешение картинки (один раз)
  if (!autoLow) { autoN++; autoT += raw; if (autoN === 90) { if (autoT / autoN > 0.024) { ren.setPixelRatio(Math.min(1.25, devicePixelRatio)); autoLow = true; } autoN = 0; autoT = 0; } }
  if (fpsEl) { fpsN++; fpsT += raw; fpsWorst = Math.max(fpsWorst, raw); if (fpsT > 1) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} к/с · худший кадр ${Math.round(fpsWorst * 1000)} мс`; fpsN = 0; fpsT = 0; fpsWorst = 0; } }
  if (crowd) { crowd.userData.U.uTime.value = now; crowd.userData.led.offset.x = (now * 0.04) % 1; }
  drawSwipe(raw);
  if (state === 'load') return;

  // физика — фиксированными шагами (не зависит от частоты кадров; при просадке время не копится больше maxFrame)
  const steps = fixed.add(dt);
  for (let i = 0; i < steps; i++) gameStep(BP.CFG.dt);
  // позы — каждый кадр
  if (MODE === 'run' && run) runAnim(dt);
  else if (state === 'aim') tickPlayer(shooter, dt);
  else if (state === 'runup') { tickPlayer(shooter, dt); keeperRead(dt); if (shooter.t >= KICK.tc) launch(); }
  else afterKick(dt);
  tickPlayer(keeper, dt); updSpheres(keeper, dt); if (MODE === 'run') updSpheres(shooter, dt);
  if (kick && !kick.dived && kick.t >= kick.react) keeperDive();
  wall.forEach((w, i) => w.holder.visible && wallTick(w, i, dt));
  // мяч на экране — между двумя последними шагами физики (плавно при любой частоте кадров)
  if (B.state === 'held') { handsAt(B.p); ballPrev.copy(B.p); }
  ball.position.lerpVectors(ballPrev, B.p, fixed.alpha);
  netTick(dt); confTick(dt); burstTick(dt); blobTick();

  // камера: перед ударом — за мячом; в полёте — следует за мячом; в 1 на 1 — за спиной игрока, после удара смотрит на мяч
  if (MODE === 'run') {
    const hp = shooter.holder.position; camAim.p.set(hp.x * 0.8, 3.4, hp.z + 7.4); camAim.l.set(hp.x * 0.55, 0.9, hp.z - 9);
    if (run && run.shotT > 0 && B.state !== 'owned') camAim.l.lerp(tmpB.set(ball.position.x, Math.max(0.6, ball.position.y), ball.position.z), Math.min(1, (simT - run.shotT) / 0.6) * 0.45);
    camNow.p.lerp(camAim.p, 1 - Math.exp(-raw * 5)); camNow.l.lerp(camAim.l, 1 - Math.exp(-raw * 5));
  } else if (kick && (state === 'fly' || state === 'over')) {
    const bp = ball.position, follow = Math.min(1, Math.max(0, (spot.z - Math.max(bp.z, 2)) / spot.z));
    tmpA.set(bp.x * 0.5, 2.1, Math.max(bp.z + 8, 9));
    tmpA.lerpVectors(camAim.p, tmpA, follow * 0.35);
    camNow.p.lerp(tmpA, 1 - Math.exp(-raw * 3));
    tmpB.set(bp.x * 0.6, lerp(1.05, Math.max(0.9, bp.y), 0.5), Math.min(bp.z - 3, 0));
    camNow.l.lerp(tmpB, 1 - Math.exp(-raw * 4));
  } else { camNow.p.lerp(camAim.p, 1 - Math.exp(-raw * 4)); camNow.l.lerp(camAim.l, 1 - Math.exp(-raw * 4)); }
  cam.position.copy(camNow.p);
  if (shake > 0) { shake = Math.max(0, shake - raw); cam.position.x += (Math.random() - 0.5) * shake * 0.4; cam.position.y += (Math.random() - 0.5) * shake * 0.4; }
  cam.lookAt(camNow.l);
  if (camPunch > 0 || cam.fov !== fov()) { camPunch = Math.max(0, camPunch - raw * 2.5); cam.fov = fov() - 4 * camPunch * camPunch; cam.updateProjectionMatrix(); } // камера чуть вздрагивает от удара
  ren.render(scene, cam);
}

// ---------- старт ----------
(async () => {
  const bar = $('#loadbar');
  const all = [player(myKit), player(gkKit), ...[0, 1, 2, 3].map(() => player(wallKit()))];
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; wall.push(...got.slice(2)); blob(ball, 0.45); makeSpheres(keeper, 'gk'); makeSpheres(shooter, 'me');
  // мяч: модель LeMon74 (Sketchfab, CC BY 4.0), облегчена gltfpack до 3,5 тыс. треугольников
  try { const bm = (await loader.loadAsync('assets/ball.glb')).scene, bb = new THREE.Box3().setFromObject(bm), sz = bb.getSize(new THREE.Vector3()).x;
    bm.scale.setScalar((R * 2) / sz); bm.position.copy(bb.getCenter(new THREE.Vector3()).multiplyScalar(-(R * 2) / sz)); ball.add(bm); ball.material.visible = false; } catch (e) { /* остаётся простой мяч */ }
  await goalModel().catch(() => goalSimple());
  prepKick(); prepStrike();

  resetShot();
  // шейдеры собираем заранее, иначе первый гол и первое конфетти подтормаживают
  conf.visible = true; ren.compile(scene, cam); conf.visible = false;
  $('#load').remove();
  window.ready = true;
  const r2 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  window.dbg = () => ({ state, ball: B.state, owner: B.owner, sh: shooter.name, st: +shooter.t.toFixed(2), b: r2(B.p), v: r2(B.v), p: run ? r2(run.P.p) : null,
    d: run ? +Math.hypot(B.p.x - run.P.p.x, B.p.z - run.P.p.z).toFixed(2) : null, msg: msg.textContent, calls: ren.info.render.calls, tris: ren.info.render.triangles });
})().catch((e) => { $('#load').textContent = 'Не получилось загрузить: ' + e.message; });
frame();
