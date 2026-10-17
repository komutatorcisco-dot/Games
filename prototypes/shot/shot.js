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

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'ИГРОК').toUpperCase().slice(0, 14);
let MODE = ['pen', 'run'].includes(Q.get('mode')) ? Q.get('mode') : 'fk';
const NIGHT = Q.get('night') === '1'; // по умолчанию — дневной матч
const SHOTS = 5, G = 9.81, R = 0.11, GW = 3.66, GH = 2.44, NET_D = 1.9;
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
const NET_TOP = 1.5; // насколько крыша сетки уходит назад от перекладины
function goal() {
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
function netTick(dt) {
  if (!net.hits.length) return;
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

// ---------- мяч и след ----------
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
const TRAIL = 26;
const trail = { pts: [], geo: new THREE.BufferGeometry() };
trail.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
trail.geo.setAttribute('alpha', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 2), 1));
{ const idx = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trail.geo.setIndex(idx); }
const trailMesh = new THREE.Mesh(trail.geo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.93, 0.7, vA * 0.75); }',
}));
trailMesh.frustumCulled = false;
const ball = ballMesh();
function trailTick(on) {
  if (!on && !trail.pts.length) { if (trail.shown) { trail.geo.attributes.alpha.array.fill(0); trail.geo.attributes.alpha.needsUpdate = true; trail.shown = false; } return; }
  trail.shown = true;
  if (on) { const v = trail.pts.length >= TRAIL ? trail.pts.pop() : new THREE.Vector3(); trail.pts.unshift(v.copy(ball.position)); } else trail.pts.pop();
  const P = trail.geo.attributes.position.array, A = trail.geo.attributes.alpha.array, side = new THREE.Vector3(), dir = new THREE.Vector3(), view = new THREE.Vector3();
  for (let i = 0; i < TRAIL; i++) {
    const p = trail.pts[Math.min(i, trail.pts.length - 1)] || ball.position, q = trail.pts[Math.min(i + 1, trail.pts.length - 1)] || p;
    dir.subVectors(p, q); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); view.subVectors(cam.position, p);
    side.crossVectors(dir, view).normalize().multiplyScalar(R * 0.9 * (1 - i / TRAIL));
    const j = i * 6; P[j] = p.x + side.x; P[j + 1] = p.y + side.y; P[j + 2] = p.z + side.z; P[j + 3] = p.x - side.x; P[j + 4] = p.y - side.y; P[j + 5] = p.z - side.z;
    const a = i < trail.pts.length ? Math.pow(1 - i / TRAIL, 1.5) : 0; A[i * 2] = a; A[i * 2 + 1] = a;
  }
  trail.geo.attributes.position.needsUpdate = true; trail.geo.attributes.alpha.needsUpdate = true;
}

pitch(); goal(); stadium();
scene.add(ball, trailMesh);

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
// assets/player.glb — модель + 11 движений (собрано tools/anim/build_player.py, облегчено gltfpack до 29 тыс. треуг.),
// assets/player-lod.glb — облегчённая сетка (11 тыс.) для вратаря и стенки; текстуры у всех общие.
// Форма: футболка, шорты и гетры — отдельные части, их белый цвет умножаем на цвета команды.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const v3 = new THREE.Vector3();
let base = null, lod = null;
const baseReady = loader.loadAsync('assets/player.glb').then((g) => (base = g));
const lodReady = loader.loadAsync('assets/player-lod.glb').then((g) => (lod = g)).catch(() => null);
const PART = { Ch38_Shirt: 'shirt', Ch38_Shorts: 'shorts', Ch38_Socks: 'socks' };
async function player(kit, useLod = false) {
  await baseReady; if (useLod) await lodReady;
  const src = useLod && lod ? lod : base;
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
  const body = ['LeftHand', 'RightHand', 'Spine2', 'Head'].map((n) => m.getObjectByName(n)); // чем вратарь касается мяча
  return { holder, model: m, mixer: new THREE.AnimationMixer(m), hips, hipsRest: hips.position.clone(), body, act: null, t: 0 };
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
let state = 'load', n = 0, results = [], t0 = 0, shot = null, kick = null, slow = 1, slowT = 0, shake = 0, celebrate = -1, clock = 0;
const vel = new THREE.Vector3(), msg = $('#msg');
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
  $('#hint').textContent = MODE === 'run' ? 'Слева веди пальцем — бежишь. Справа держи «Удар» — копишь силу, отпустил — бьёшь.' : 'Проведи пальцем от мяча к воротам. Быстрее — сильнее, изогни линию — мяч закрутится.';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  if (MODE === 'run') return resetRun();
  setSpot(n);
  ball.position.copy(spot); vel.set(0, 0, 0); spin.set(0, 0, 0); ball.rotation.set(0, 0, 0); trail.pts.length = 0;
  placeShooter(); shooter.holder.position.y = 0;
  play(shooter, 'idle', { loop: true, fade: 0.2, t: Math.random() * 3, lock: shooter.holder.localToWorld(KICK.root0.clone()) }); // стоит там, откуда начнёт разбег
  keeper.holder.position.set(MODE === 'fk' ? Math.sign(spot.x || 1) * 0.7 : 0, 0, -0.25); keeper.holder.rotation.set(0, 0, 0);
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, t: Math.random() * 2, lock: keeper.holder.localToWorld(new THREE.Vector3(0, 0, 0)) });
  wall.forEach((w, i) => play(w, 'idle', { loop: true, fade: 0.3, t: 1 + i * 1.7, speed: 0.8, lock: w.holder.localToWorld(new THREE.Vector3(0, 0, 0)) }));
  aimCam(); if (state === 'load') { camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); } // после placeShooter — игрок уже стоит
  state = 'aim'; shot = null; kick = null; celebrate = -1; slow = 1; msg.className = 'msg';
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
// Сопротивление воздуха (растёт с квадратом скорости), эффект Магнуса от вращения (подкрутка — мяч уходит по дуге,
// и сильнее, чем быстрее летит), вращение понемногу гаснет. Отскоки от газона, штанг и перекладины — по нормали.
const KD = 0.013, KM = 0.0062, E_POST = 0.55, R_POST = 0.06;
const spin = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpA2 = new THREE.Vector3();
function accel(v, w, out) { // ускорение мяча при скорости v и вращении w
  const sp = v.length();
  return out.set(0, -G, 0).addScaledVector(v, -KD * sp).add(tmpA2.crossVectors(w, v).multiplyScalar(KM));
}
function stepBall(p, v, w, h) { // один шаг (полунеявный Эйлер — устойчиво при 120 шагах в секунду)
  v.addScaledVector(accel(v, w, tmpV), h); p.addScaledVector(v, h); w.multiplyScalar(1 - 0.35 * h);
}
// где и когда мяч пересечёт линию ворот (без стенки и вратаря)
function predict(p0, v0, w0, zp = 0) {
  const p = p0.clone(), v = v0.clone(), w = w0.clone(); let t = 0;
  while (p.z > zp && t < 3) { stepBall(p, v, w, 1 / 120); t += 1 / 120; if (p.y < R) { p.y = R; v.y = Math.abs(v.y) * 0.5; } }
  return { p, t };
}
// подбираем начальную скорость так, чтобы мяч пришёл туда, куда отпустили палец (с учётом дуги и сопротивления)
function aimVelocity(target, speed, w) {
  const v = target.clone().sub(spot).normalize().multiplyScalar(speed); v.y += 0.5 * G * (spot.distanceTo(target) / speed);
  for (let i = 0; i < 8; i++) { const r = predict(spot, v, w); if (r.t <= 0) break; v.x += (target.x - r.p.x) / r.t; v.y += (target.y - r.p.y) / r.t; }
  return v;
}
function collidePost(p, v, cx, cy, cz, axis) { // штанга (axis 'y') или перекладина (axis 'x'): отскок от цилиндра
  const d = axis === 'y' ? tmpV.set(p.x - cx, 0, p.z - cz) : tmpV.set(0, p.y - cy, p.z - cz);
  const L = d.length(); if (L > R + R_POST || L < 1e-6) return false;
  d.multiplyScalar(1 / L); const vn = v.dot(d); if (vn >= 0) return false;
  v.addScaledVector(d, -(1 + E_POST) * vn); p.addScaledVector(d, R + R_POST - L); spin.multiplyScalar(0.4); return true;
}

// ---------- удар ----------
function launch() {
  const { tx, ty, speed } = shot;
  // подкрутка: вращение вокруг вертикали (изогнул линию влево — мяч уходит влево по дуге); сильный удар — чуть верхнего вращения (мяч «ныряет»)
  spin.set(-Math.min(speed, 30) * 0.06, -shot.curve * 55, 0);
  vel.copy(aimVelocity(new THREE.Vector3(tx, ty, 0), speed, spin)); shot.ax = 0;
  // заранее: где и когда мяч долетит до вратаря (он может выйти из ворот) — по этому он прыгает
  const kz = Math.max(0, keeper.holder.position.z - 0.2), { p, t } = predict(spot, vel, spin, kz);
  const react = 0.2 + Math.random() * 0.12, kx = keeper.holder.position.x;
  const need = Math.max(0, Math.abs(p.x - kx) - 0.75), topCorner = p.y > 1.9 && Math.abs(p.x) > 2.6;
  const goalBound = Math.abs(predict(spot, vel, spin).p.x) < GW + 0.3;
  const can = need <= 6.2 * Math.max(0, t - react) * (topCorner ? 0.55 : 1) && goalBound && p.y < 2.6;
  const lp = keeper.holder.worldToLocal(new THREE.Vector3(p.x, p.y, kz)); // точка мяча глазами вратаря (он может стоять под углом)
  kick = { t: 0, T: t, cx: p.x, cy: p.y, lx: lp.x, kz, react, save: can && Math.random() < (ST > 90 ? 0.72 : 0.86), dir: Math.sign(p.x - kx) || 1, done: false, x0: kx };
  state = 'fly'; shake = 0.12;
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
// вратарь касается мяча руками или телом: несильный мяч рядом с ним — ловит, остальное — отбивает в сторону (на угловой)
const kp = new THREE.Vector3(), kq = new THREE.Vector3();
function handsAt(out) { keeper.body[0].getWorldPosition(kp); keeper.body[1].getWorldPosition(kq); return out.addVectors(kp, kq).multiplyScalar(0.5); }
function keeperTouch(p) {
  kick.done = true;
  let dmin = 9; for (const b of keeper.body) dmin = Math.min(dmin, b.getWorldPosition(kp).distanceTo(p));
  if (dmin > 1.0) return; // не дотянулся — мяч летит дальше
  const sp = vel.length(), side = Math.sign(p.x - keeper.holder.position.x) || kick.dir;
  if (sp < 22 && Math.abs(kick.lx) < 1.3 && p.y < 2.0) { kick.held = true; shake = 0.12; return finish(false, 'Поймал!', 'miss'); }
  // отбил: мяч теряет скорость и уходит вбок от ворот; высокий — переводит через перекладину
  const high = p.y > 1.75;
  vel.set(side * (2.5 + sp * 0.14 + Math.random()), high ? 4 + Math.random() * 1.5 : 1 + Math.random() * 2, Math.abs(vel.z) * 0.12 + 0.8 + Math.random());
  spin.set(0, 0, 0); shake = 0.2; finish(false, 'Отбил!', 'miss');
}
function finish(ok, text, cls) {
  if (state === 'over') return; state = 'over';
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

// ---------- 1 на 1: бежишь сам и бьёшь (джойстик + кнопки, как в FC Mobile) ----------
let STRIKE = null, run = null;
const joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 }, keys = {}, btn = { shot: false, fin: false, sprint: false };
const GOAL_C = new THREE.Vector3(0, 0, 0);
function resetRun() {
  wall.forEach((w) => (w.holder.visible = false));
  const sx = (Math.random() * 2 - 1) * 7;
  shooter.holder.position.set(sx, 0, 30); shooter.holder.rotation.set(0, Math.PI, 0);
  ball.position.set(sx, R, 29.3); vel.set(0, 0, 0); spin.set(0, 0, 0); ball.rotation.set(0, 0, 0); trail.pts.length = 0;
  play(shooter, 'idle', { loop: true, fade: 0.2, follow: true });
  keeper.holder.position.set(0, 0, 0.4); keeper.holder.rotation.set(0, 0, 0);
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, follow: true });
  run = { v: new THREE.Vector3(), charge: -1, fin: false, kv: new THREE.Vector3() };
  const hp = shooter.holder.position; camAim.p.set(hp.x * 0.8, 3.4, hp.z + 7.4); camAim.l.set(hp.x * 0.55, 0.9, hp.z - 9);
  if (state === 'load') { camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); }
  state = 'play'; shot = null; kick = null; celebrate = -1; slow = 1; msg.className = 'msg'; dots();
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
// держишь «Удар» — копится сила (полоска), отпустил — удар; «Подкрутка» — удар щёчкой с закруткой в дальний угол
function startCharge(fin) { if (MODE !== 'run' || state !== 'play' || !run || run.charge >= 0) return; if (ball.position.distanceTo(shooter.holder.position) > 1.6) return; run.charge = 0; run.fin = fin; setPower(0); $('#ring').classList.add('on'); hintOff(); }
function releaseCharge() { if (!run || run.charge < 0 || state !== 'play') return; const pw = Math.min(1, run.charge / 0.9); run.charge = -1; $('#ring').classList.remove('on'); strike(pw, run.fin); }
function strike(pw, fin) {
  const inp = input(), bp = ball.position;
  // куда: джойстик вбок — в тот угол; без джойстика — в дальний угол от игрока
  let tx = Math.abs(inp.x) > 0.2 ? inp.x * 3.3 : -Math.sign(bp.x || 1) * 2.4;
  let ty = 0.25 + pw * 2.3 + (pw > 0.95 ? 0.7 : 0); // перебрал силу — над перекладиной
  let speed = 15 + pw * 17, curve = 0;
  if (fin) { speed *= 0.82; curve = -Math.sign(tx - bp.x) * 0.9; ty = Math.min(ty, 2.1); }
  const dist = bp.length(), sig = (0.12 + (100 - ST) * 0.028) * Math.max(0.6, dist / 18), gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  tx += gauss() * sig; ty = Math.max(0.1, ty + gauss() * sig * 0.7);
  shot = { tx, ty, speed, curve, ax: 0 };
  run.v.multiplyScalar(0.5);
  play(shooter, 'strike', { t: Math.max(0, STRIKE.tc - 0.35), fade: 0.12, follow: true });
  state = 'runup'; t0 = clock;
}
function dribble(dt, k = 1) { // мяч у ноги: чуть впереди по ходу, катится
  const h = shooter.holder, f = tmpA.set(Math.sin(h.rotation.y), 0, Math.cos(h.rotation.y)), sp = run.v.length();
  const tgt = tmpB.copy(h.position).addScaledVector(f, 0.55 + sp * 0.09); tgt.y = R;
  const before = ball.position.clone(); ball.position.lerp(tgt, 1 - Math.exp(-dt * 7 * k));
  const d = ball.position.clone().sub(before); if (d.lengthSq() > 1e-8) { tmpV.set(d.z, 0, -d.x).normalize(); ball.rotateOnWorldAxis(tmpV, -d.length() / R); }
}
function runMove(dt) { // бег игрока по джойстику (и с мячом, и после удара)
  const inp = input(), max = (btn.sprint || keys.ShiftLeft || keys.ShiftRight) ? 6.6 : 3.9;
  run.v.lerp(tmpA.set(inp.x, 0, -inp.y).multiplyScalar(max), 1 - Math.exp(-dt * 6));
  const h = shooter.holder, sp = run.v.length();
  h.position.addScaledVector(run.v, dt); h.position.x = Math.max(-30, Math.min(30, h.position.x)); h.position.z = Math.max(1.2, Math.min(42, h.position.z));
  if (sp > 0.3) { const yaw = Math.atan2(run.v.x, run.v.z); let d = yaw - h.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.rotation.y += d * (1 - Math.exp(-dt * 9)); }
  // движение ног: стоит / бежит; во время удара не перебиваем запись удара до момента после касания
  const busy = shooter.name === 'strike' && shooter.t < STRIKE.tc + 0.3;
  const want = sp > 0.6 ? 'jog' : 'idle';
  if (!busy && shooter.name !== want) play(shooter, want, { loop: true, fade: 0.3, follow: true });
  if (shooter.name === 'jog') shooter.act.timeScale = Math.max(0.7, sp / 3.6);
  tickPlayer(shooter, dt);
}
function runTick(dt) {
  runMove(dt);
  dribble(dt);
  if (run.charge >= 0) { run.charge += dt; setPower(Math.min(1, run.charge / 0.9)); if (run.charge > 1.2) releaseCharge(); }
  // вратарь: стоит на линии мяч — центр ворот и выходит навстречу, когда игрок близко
  const bp = ball.position, k = keeper.holder, dist = bp.length();
  const out = Math.max(0.4, Math.min(5.5, (22 - dist) * 0.24, dist - 1.6));
  const kt = tmpA.copy(bp).setY(0).normalize().multiplyScalar(out); kt.z = Math.max(0.3, kt.z);
  const kd = kt.sub(k.position); const kl = kd.length(), ksp = Math.min(4.4, kl * 3);
  run.kv.lerp(kl > 0.02 ? kd.normalize().multiplyScalar(ksp) : tmpB.set(0, 0, 0), 1 - Math.exp(-dt * 5));
  k.position.addScaledVector(run.kv, dt);
  k.rotation.y = Math.atan2(bp.x - k.position.x, bp.z - k.position.z);
  const kWant = run.kv.length() > 1.2 ? 'jog' : 'gk_idle';
  if (keeper.name !== kWant && keeper.name !== 'gk_scoop') play(keeper, kWant, { loop: true, fade: 0.3, follow: true });
  // вратарь успел к мячу — забирает
  if (bp.distanceTo(k.position) < 1.15 && run.charge < 0) {
    play(keeper, 'gk_scoop', { fade: 0.15, follow: true, speed: 1.3 });
    vel.set(0, 0, 0); state = 'fly'; kick = { t: 0, T: 9, react: 99, dived: true, kz: 0 }; shot = { curve: 0 };
    finish(false, 'Вратарь забрал', 'miss');
  }
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
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, raw = Math.min(0.033, now - last); last = now;
  if (slowT > 0) { slowT -= raw; if (slowT <= 0) slow = 1; }
  const dt = raw * slow; clock += dt;
  // сам подстраивается: если кадры долгие, уменьшаем разрешение картинки (один раз)
  if (!autoLow) { autoN++; autoT += raw; if (autoN === 90) { if (autoT / autoN > 0.024) { ren.setPixelRatio(Math.min(1.25, devicePixelRatio)); autoLow = true; } autoN = 0; autoT = 0; } }
  if (fpsEl) { fpsN++; fpsT += raw; fpsWorst = Math.max(fpsWorst, raw); if (fpsT > 1) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} к/с · худший кадр ${Math.round(fpsWorst * 1000)} мс`; fpsN = 0; fpsT = 0; fpsWorst = 0; } }
  if (crowd) { crowd.userData.U.uTime.value = now; crowd.userData.led.offset.x = (now * 0.04) % 1; }
  drawSwipe(raw);
  if (state === 'load') return;

  if (state === 'play') runTick(dt);
  else if (state === 'runup') {
    if (MODE === 'run') { runMove(dt); dribble(dt, 0.2); } else tickPlayer(shooter, dt);
    if (shooter.t >= (MODE === 'run' ? STRIKE.tc : KICK.tc)) { if (MODE === 'run') spot.copy(ball.position); launch(); }
  } else if (state === 'fly' || state === 'over') {
    if (MODE === 'run') runMove(dt);
    else afterKick(dt);
    const prev = ball.position.clone();
    const steps = Math.max(2, Math.ceil(dt * 120)), h = dt / steps, bp = ball.position;
    for (let i = 0; i < steps; i++) {
      stepBall(bp, vel, spin, h);
      if (bp.y < R) { bp.y = R; if (vel.y < 0) vel.y = -vel.y * 0.5; vel.x *= 0.86; vel.z *= 0.86; spin.multiplyScalar(0.6); } // газон
      if (bp.y <= R + 0.001 && Math.abs(vel.y) < 0.4) { vel.y = 0; vel.x *= 1 - 1.2 * h; vel.z *= 1 - 1.2 * h; } // катится
      // штанги и перекладина
      if (Math.abs(bp.z) < 0.4) {
        let hit = bp.y < GH + R && (collidePost(bp, vel, -GW, 0, 0, 'y') || collidePost(bp, vel, GW, 0, 0, 'y'));
        if (!hit && Math.abs(bp.x) < GW + R) hit = collidePost(bp, vel, 0, GH, 0, 'x');
        if (hit && kick && !kick.post) { kick.post = Math.abs(bp.y - GH) < R + R_POST + 0.02 ? 'Перекладина!' : 'Штанга!'; shake = 0.25; }
      }
      // сетка: мяч вязнет, сетка выгибается
      const bz = -NET_D + (NET_D - NET_TOP) * (bp.y / GH); // наклонный задник сетки
      if (bp.z < bz + R && bp.z < -0.2 && Math.abs(bp.x) < GW && bp.y < GH) {
        if (vel.z < -2) net.hits.push({ x: bp.x, y: bp.y, t: 0, a: Math.min(0.55, -vel.z * 0.025) });
        bp.z = bz + R; vel.z = Math.abs(vel.z) * 0.08; vel.x *= 0.4; vel.y *= 0.5; spin.set(0, 0, 0);
      }
    }
    // вращение мяча: катится по направлению полёта + своё вращение (подкрутка)
    if (shot) { const sp = vel.length(); if (sp > 0.05) { tmpV.set(-vel.z, 0, vel.x).normalize(); ball.rotateOnWorldAxis(tmpV, (sp / R) * dt * 0.5); } ball.rotateOnWorldAxis(AY, spin.y * dt); }
    if (kick && kick.held) { handsAt(ball.position); vel.set(0, 0, 0); spin.set(0, 0, 0); } // мяч в руках у вратаря
    if (kick) kick.t += dt;
    const p = ball.position;
    if (state === 'fly') {
      if (MODE === 'fk' && prev.z > wallZ && p.z <= wallZ) {
        const jumpH = 0.45 * wallJump(kick.t);
        const hit = wallX.some((x) => Math.abs(p.x - x) < 0.36) && p.y < 1.95 + jumpH;
        if (hit) { vel.set(vel.x * 0.3, 2.5, Math.abs(vel.z) * 0.25); spin.set(0, 0, 0); finish(false, 'В стенку', 'miss'); }
      }
      if (kick && kick.save && !kick.done && !kick.post && p.z < kick.kz + 0.35) keeperTouch(p);
      if (state === 'fly' && prev.z > 0 && p.z <= 0) {
        if (Math.abs(p.x) < GW - R && p.y < GH - R) finish(true, 'ГОЛ!', 'goal');
        else finish(false, kick && kick.post ? kick.post : 'Мимо', 'miss');
      }
      // отскочил от штанги обратно в поле
      if (state === 'fly' && kick && kick.post && vel.z > 0 && p.z > 0.8) finish(false, kick.post, 'miss');
      if (state === 'fly' && (p.z > 40 || Math.abs(p.x) > 30 || (kick && kick.t > 4))) finish(false, 'Мимо', 'miss');
    }
  }
  if (state === 'aim') tickPlayer(shooter, dt);
  tickPlayer(keeper, dt);
  if (kick && !kick.dived && kick.t >= kick.react) keeperDive();
  wall.forEach((w, i) => w.holder.visible && wallTick(w, i, dt));
  trailTick(state === 'fly' || (state === 'over' && vel.lengthSq() > 30));
  netTick(dt); confTick(dt); blobTick();

  // камера: перед ударом — за мячом; в полёте — плавно следует за мячом; в 1 на 1 — за спиной игрока
  if (MODE === 'run' && (state === 'play' || state === 'runup')) {
    const hp = shooter.holder.position; camAim.p.set(hp.x * 0.8, 3.4, hp.z + 7.4); camAim.l.set(hp.x * 0.55, 0.9, hp.z - 9);
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
  ren.render(scene, cam);
}

// ---------- старт ----------
(async () => {
  const bar = $('#loadbar');
  const all = [player(myKit), player(gkKit, true), ...[0, 1, 2, 3].map(() => player(wallKit(), true))];
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; wall.push(...got.slice(2)); blob(ball, 0.45);
  // мяч: модель LeMon74 (Sketchfab, CC BY 4.0), облегчена gltfpack до 3,5 тыс. треугольников
  try { const bm = (await loader.loadAsync('assets/ball.glb')).scene, bb = new THREE.Box3().setFromObject(bm), sz = bb.getSize(new THREE.Vector3()).x;
    bm.scale.setScalar((R * 2) / sz); bm.position.copy(bb.getCenter(new THREE.Vector3()).multiplyScalar(-(R * 2) / sz)); ball.add(bm); ball.material.visible = false; } catch (e) { /* остаётся простой мяч */ }
  prepKick(); prepStrike();

  resetShot();
  // шейдеры собираем заранее, иначе первый гол и первое конфетти подтормаживают
  conf.visible = true; ren.compile(scene, cam); conf.visible = false;
  $('#load').remove();
  window.ready = true;
  window.dbg = () => ({ state, sh: shooter.name, st: +shooter.t.toFixed(2), tc: STRIKE.tc, b: ball.position.toArray().map((v) => +v.toFixed(2)), calls: ren.info.render.calls, tris: ren.info.render.triangles });
})().catch((e) => { $('#load').textContent = 'Не получилось загрузить: ' + e.message; });
frame();
