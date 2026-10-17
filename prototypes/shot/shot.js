// «Удар» — проба: сам бьёшь штрафные и пенальти. Свайп по экрану = удар: куда отпустил палец — туда летит мяч,
// быстрее свайп — сильнее удар, изогнул линию — мяч закрутится. Вратарь прыгает, стенка подпрыгивает.
// Характеристика «Удар» карточки (?st=85) меняет точность: чем выше, тем меньше разброс.
// Все игроки — 3D-модель Балотелли (prototypes/balotelli): бьющий в своей форме, вратарь и стенка — в форме
// соперника с лицами из базы игроков (kit.js). Движения — кодом по костям, без сторонних анимаций.
// Стадион: ночное небо, ярусы трибун с болельщиками (один InstancedMesh, движение в шейдере), прожекторы.
// Параметры: ?name=МЕССИ&num=10&kit=75aadb.ffffff.ffffff.16192a&st=93&mode=pen&face=img/players/<id>.webp&low=1
import * as THREE from 'three';
import { GLTFLoader } from '../balotelli/vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../balotelli/vendor/meshopt_decoder.module.js';
import { clone as cloneSkinned } from '../balotelli/vendor/utils/SkeletonUtils.js';
import { createRig } from '../balotelli/motion.js';
import { applyKit, kitFromQuery } from '../player/kit.js';
import { loadAnims, sample, mix, apply, newPose } from './anim.js';

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'БАЛОТЕЛЛИ').toUpperCase().slice(0, 14);
let MODE = Q.get('mode') === 'pen' ? 'pen' : 'fk';
const SHOTS = 5, G = 9.81, R = 0.11, GW = 3.66, GH = 2.44, NET_D = 1.9;
const LOW = Q.get('low') === '1' || (navigator.hardwareConcurrency || 4) <= 2; // слабый телефон: без теней, меньше людей
const $ = (s) => document.querySelector(s);
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- рендер ----------
// на экранах с плотными пикселями сглаживание почти не видно, а стоит дорого — выключаем
// мерцание («рябь») на телефоне было от выключенного сглаживания и низкого разрешения — возвращаем оба
const ren = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
ren.setPixelRatio(Math.min(LOW ? 1 : 1.5, devicePixelRatio)); ren.setSize(innerWidth, innerHeight);
ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.15;
ren.shadowMap.enabled = false; // вместо карты теней — мягкие пятна под игроками и мячом (вдвое меньше работы видеокарте)
document.body.prepend(ren.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#0d1530', 60, 140);
const cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => { ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); fitSwipe(); });

// свет: прожекторы стадиона (основной с тенью) + небо
scene.add(new THREE.HemisphereLight('#b9c8ff', '#2d5a24', 0.9));
const key = new THREE.DirectionalLight('#fff6e6', 2.6); key.position.set(-18, 30, 22); 
key.target.position.set(0, 0, 10); scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#cfe0ff', 0.9); fill.position.set(20, 18, 30); scene.add(fill);
const rim = new THREE.DirectionalLight('#ffffff', 0.7); rim.position.set(0, 14, -30); scene.add(rim);

// ---------- небо ----------
{
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#04060f'); gr.addColorStop(0.55, '#0e1838'); gr.addColorStop(1, '#2a3a74');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
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
  g.beginPath(); g.arc(px(0), pz(11), 0.2 * S, 0, 7); g.fillStyle = '#fff'; g.fill();
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
    sh.fragmentShader = 'uniform sampler2D grassC;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= texture2D(grassC, vNormalMapUv).rgb * 2.7;');
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), pm);
  m.rotation.x = -Math.PI / 2; m.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); m.receiveShadow = true; scene.add(m);
  const run = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#2a6a27', roughness: 1 }));
  run.rotation.x = -Math.PI / 2; run.position.y = -0.01; scene.add(run);
}

// ---------- ворота и сетка (сетка колышется от мяча) ----------
const net = { pos: null, base: null, geo: null, hits: [] };
function goal() {
  const W = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.1 }), r = 0.06;
  const add = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, W); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; scene.add(m); };
  add(new THREE.CylinderGeometry(r, r, GH + r, 20), -GW, (GH + r) / 2, 0); add(new THREE.CylinderGeometry(r, r, GH + r, 20), GW, (GH + r) / 2, 0);
  add(new THREE.CylinderGeometry(r, r, GW * 2 + 2 * r, 20), 0, GH, 0, Math.PI / 2);
  // сетка: полотна с текстурой ячеек (с мип-картами — не рябит вдали), вершины в координатах мира, чтобы сетка гнулась
  const D = NET_D, top = D * 0.55, CELL = 0.12;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const P = [], UV = [], I = [];
  // полотно по четырём углам (a — низ-лево, b — низ-право, c — верх-право, d — верх-лево), nu×nv клеток
  const panel = (A, B, C, Dd, nu, nv) => {
    const o = P.length / 3, wU = A.distanceTo(B), wV = A.distanceTo(Dd);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = A.clone().lerp(B, u).lerp(Dd.clone().lerp(C, u), v);
      P.push(p.x, p.y, p.z); UV.push((u * wU) / CELL, (v * wV) / CELL);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = o + j * (nu + 1) + i; I.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  panel(V(-GW, 0, -D), V(GW, 0, -D), V(GW, GH, -top), V(-GW, GH, -top), 40, 14); // задник
  panel(V(-GW, GH, -top), V(GW, GH, -top), V(GW, GH, 0), V(-GW, GH, 0), 40, 4); // крыша
  for (const sx of [-1, 1]) panel(V(sx * GW, 0, 0), V(sx * GW, 0, -D), V(sx * GW, GH, -top), V(sx * GW, GH, 0), 8, 14); // бока
  net.geo = new THREE.BufferGeometry(); net.geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); net.geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); net.geo.setIndex(I);
  net.pos = net.geo.attributes.position; net.base = Float32Array.from(P);
  const nm = new THREE.Mesh(net.geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
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
  const conc = new THREE.MeshStandardMaterial({ color: '#1b2340', roughness: 0.9 });
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
    const roof = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.5, 14), new THREE.MeshStandardMaterial({ color: '#0d1226', roughness: 0.6 }));
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
  for (let i = 0; i < 9; i++) {
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
  const ad = new THREE.Mesh(new THREE.BoxGeometry(84, 0.95, 0.15), led); ad.position.set(0, 0.48, -5); scene.add(ad);
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
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.6, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const blobs = [], blobV = new THREE.Vector3();
function blob(target, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); blobs.push({ m, target, size }); return m;
}
function blobTick() {
  for (const b of blobs) { const t = b.bone ? b.bone.getWorldPosition(blobV) : b.target.position; b.m.position.set(t.x, 0.01, t.z); b.m.visible = b.target.visible !== false;
    const k = Math.max(0.35, 1 - t.y / 2.5); b.m.scale.setScalar(k); b.m.material.opacity = k; }
}

// ---------- игроки (модель Балотелли) ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
// модель грузим ОДИН раз; остальные игроки — копии со своим скелетом, но с общими сеткой и текстурами
// (раньше каждый грузился отдельно: 6 копий текстур в видеопамяти — главная причина лагов на телефоне)
// вратарь и стенка далеко — им облегчённая сетка (balotelli-lod.glb, 14 тыс. треугольников вместо 50 тыс.,
// сделана gltfpack -si 0.25), а текстуры те же, что у основной модели
let baseModel = null, lodModel = null;
const animsReady = loadAnims('anims.json');
const baseReady = loader.loadAsync('../balotelli/balotelli-mobile.glb').then((g) => (baseModel = g.scene));
const lodReady = loader.loadAsync('../balotelli/balotelli-lod.glb').then((g) => (lodModel = g.scene)).catch(() => null);
const meshOf = (root) => { let m = null; root.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; }); return m; };
async function player(kit, lod = false) {
  await baseReady; if (lod) await lodReady;
  const m = cloneSkinned(lod && lodModel ? lodModel : baseModel);
  const baseMat = meshOf(baseModel).material;
  m.traverse((o) => { if (o.isMesh && o.material) o.material = (lod && lodModel ? baseMat : o.material).clone(); }); // своя форма — свой материал, текстуры общие
  if (kit && kit.whiten) whiten(m); // своя синяя форма модели → белая ткань, чтобы её перекрасил kit.js
  if (kit) await applyKit(m, kit);
  m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); });
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), s = 1.84 / (box.max.y - box.min.y);
  const holder = new THREE.Group(); m.scale.setScalar(s); m.position.y = -box.min.y * s; holder.add(m); scene.add(holder); const bl = blob(holder, 1.3);
  const rig = createRig(m);
  blobs.find((x) => x.m === bl).bone = rig.B.pelvis; // тень идёт за тазом: записанные движения двигают игрока сами
  return { holder, rig };
}
// синие места текстуры (форма сборной Италии у модели) делаем белыми: kit.js красит только белую ткань
const whiteCache = new Map();
function whiten(model) {
  model.traverse((o) => {
    const mt = o.isMesh && o.material, map = mt && mt.map, img = map && map.image; if (!img || !img.width) return;
    let t = whiteCache.get(img);
    if (!t) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const r = a[i], gg = a[i + 1], b = a[i + 2];
        if (b > r + 25 && b > gg + 8) { const l = Math.min(255, (0.3 * r + 0.5 * gg + 0.2 * b) * 2.1 + 40); a[i] = a[i + 1] = a[i + 2] = l; } }
      g.putImageData(d, 0, 0); t = new THREE.CanvasTexture(c); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; whiteCache.set(img, t);
    }
    o.material = mt.clone(); o.material.map = t;
  });
}
// повернуть кость вокруг оси мира. Поворот родителя считаем по цепочке кватернионов, без пересчёта матриц
// (раньше каждый поворот пересчитывал все кости ниже — это и давало лаги)
function turn(rig, n, axis, a) {
  const b = rig.B[n]; if (!b || !a) return;
  q1.identity(); for (let o = b.parent; o; o = o.parent) q1.premultiply(o.quaternion);
  v3.copy(axis).applyQuaternion(q1.invert());
  b.quaternion.premultiply(q2.setFromAxisAngle(v3, a));
}
function rest(rig) { for (const n in rig.B) { rig.B[n].quaternion.copy(rig.rest[n].q); rig.B[n].position.copy(rig.rest[n].p); } }
const FACES = ['228838', '239364', '220383', '235018', '251781', '190286'];
const faceOf = (id) => new URL('../../img/players/' + id + '.webp', location.href).href; // лица игроков из базы игры
const base = (o) => ({ ink: '#ffffff', num: '', name: '', skin: '', face: '', fp: [0.445, 0.69, 0.117, 0.5], fm: [], ff: [], crest: '', stripes: '', ...o });
const myKit = kitFromQuery(Q); if (myKit) { myKit.whiten = true; if (!myKit.name) myKit.name = NAME; if (!myKit.num) myKit.num = String(Q.get('num') || '9'); }
const gkKit = base({ whiten: true, shirt: '#ffd23f', shorts: '#16192a', socks: '#ffd23f', ink: '#16192a', num: '1', name: 'ВРАТАРЬ', face: faceOf(FACES[0]) });
const wallKit = (i) => base({ whiten: true, shirt: '#d62839', shorts: '#ffffff', socks: '#d62839', num: String([4, 5, 6, 8][i]), face: faceOf(FACES[i + 1]) });
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
  wall.forEach((w, i) => { w.holder.visible = MODE === 'fk'; if (MODE === 'fk') { w.holder.position.set(wallX[i], 0, wallZ); w.holder.rotation.y = wallFace + Math.PI; } });
}

// ---------- состояние ----------
let state = 'load', n = 0, results = [], t0 = 0, shot = null, kick = null, slow = 1, slowT = 0, shake = 0, celebrate = -1, clock = 0;
const vel = new THREE.Vector3(), msg = $('#msg');
const camAim = { p: new THREE.Vector3(), l: new THREE.Vector3() }, camNow = { p: new THREE.Vector3(), l: new THREE.Vector3() };
function aimCam() {
  const back = new THREE.Vector3(spot.x, 0, spot.z).normalize(), right = new THREE.Vector3(back.z, 0, -back.x);
  camAim.p.set(spot.x, 0, spot.z).addScaledVector(back, MODE === 'pen' ? 5.2 : 6).addScaledVector(right, 0.5); camAim.p.y = 2.3;
  camAim.l.set(spot.x * 0.15, 1.05, 0);
}
function resetShot() {
  setSpot(n);
  ball.position.copy(spot); vel.set(0, 0, 0); ball.rotation.set(0, 0, 0); trail.pts.length = 0;
  placeShooter(); shooter.holder.position.y = 0; play(shooter, 'idle', { loop: true, fade: 0, t: Math.random() * 3, root: true });
  keeper.holder.position.set(MODE === 'fk' ? Math.sign(spot.x || 1) * 0.7 : 0, 0, -0.25); keeper.holder.rotation.set(0, 0, 0);
  play(keeper, 'gk_idle', { loop: true, fade: 0.3, t: Math.random() * 2, root: false });
  aimCam(); if (state === 'load') { camNow.p.copy(camAim.p); camNow.l.copy(camAim.l); }
  state = 'aim'; shot = null; kick = null; celebrate = -1; slow = 1; msg.className = 'msg';
  $('#hint').style.opacity = n === 0 ? 1 : 0;
  dots();
}
function dots() {
  $('#dots').innerHTML = Array.from({ length: SHOTS }, (_, i) => `<i class="${results[i] === undefined ? '' : results[i] ? 'g' : 'm'}"></i>`).join('');
  $('#who').innerHTML = `${NAME} · удар <b>${ST}</b>`;
}

// ---------- свайп: светящаяся линия за пальцем ----------
const sw = document.createElement('canvas'); sw.className = 'swipe'; document.body.appendChild(sw); const sg = sw.getContext('2d');
function fitSwipe() { const d = Math.min(2, devicePixelRatio); sw.width = innerWidth * d; sw.height = innerHeight * d; sg.setTransform(d, 0, 0, d, 0, 0); }
fitSwipe();
let path = [], fade = 0, drawn = [];
const scr = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
addEventListener('pointerdown', (e) => { if (state !== 'aim' || e.target.closest('button')) return; path = [scr(e)]; drawn = path; fade = 1; });
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

// ---------- удар ----------
function launch() {
  const { tx, ty, speed } = shot, D = spot.z, T = D / (speed * 0.92);
  // подкрутка: насколько мяч отклонится по дуге (до 2,4 м), не зависит от силы удара
  const ax = shot.ax = (shot.curve * 2.4 * 2) / (T * T);
  vel.set((tx - spot.x - 0.5 * ax * T * T) / T, (ty - spot.y + 0.5 * G * T * T) / T, -D / T);
  // заранее: где и когда мяч пересечёт линию ворот — по этому прыгает вратарь
  const p = spot.clone(), v = vel.clone(); let t = 0;
  while (p.z > 0 && t < 3) { v.x += ax * 0.01; v.y -= G * 0.01; p.addScaledVector(v, 0.01); t += 0.01; }
  const react = 0.2 + Math.random() * 0.12, kx = keeper.holder.position.x;
  const need = Math.max(0, Math.abs(p.x - kx) - 0.75), topCorner = p.y > 1.9 && Math.abs(p.x) > 2.6;
  const can = need <= 6.2 * Math.max(0, t - react) * (topCorner ? 0.55 : 1) && Math.abs(p.x) < GW + 0.3 && p.y < 2.6;
  kick = { t: 0, T: t, cx: p.x, cy: p.y, react, save: can && Math.random() < (ST > 90 ? 0.72 : 0.86), dir: Math.sign(p.x - kx) || 1, done: false, x0: kx };
  state = 'fly'; shake = 0.12;
}
function keeperDive() {
  kick.dived = true;
  const dx = kick.cx - kick.x0, far = Math.abs(dx) > 0.9, left = kick.T - kick.react;
  if (!far) { play(keeper, kick.cy > 0.55 ? 'gk_catch' : 'gk_block', { t: 0.25, fade: 0.12, root: true, speed: 1.4, hold: 1.6, fix: (r) => { r.x = 0; r.z *= 0.3; } }); return; }
  // прыжок: зеркалим запись, если она в другую сторону; растягиваем вбок до точки мяча (или не долетает — гол).
  // Вперёд из ворот почти не выходим, к высокому мячу — приподнимаемся; после падения остаёмся лежать (не встаём).
  const want = kick.save ? Math.abs(dx) - 0.85 : Math.min(Math.abs(dx) * 0.55, 1.8);
  const t0 = Math.max(0, DIVE.tk - left), lift = Math.max(0, Math.min(1.1, kick.cy - 0.7));
  play(keeper, 'gk_dive', { t: t0, fade: 0.12, mirror: Math.sign(dx) !== DIVE.side, rootX: Math.max(0.4, Math.min(1.8, want / DIVE.reach)), root: true, hold: DIVE.tk + 0.6,
    fix: (r, t) => { r.z *= 0.25; r.y += lift * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - t0) / (DIVE.tk + 0.35 - t0))))); } });
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
// Движения — записанные с людей (Mixamo, «Soccer Game Pack»), перенесённые на скелет Балотелли (anims.json).
// У каждого игрока: текущее движение, время в нём и плавный переход из прошлой позы (0,25 с).
let A = null, KICK = null, DIVE = null;
const tmpPose = newPose();
function play(pl, clip, { t = 0, loop = false, mirror = false, fade = 0.25, speed = 1, rootX = 1, root = true, hold = Infinity, fix = null } = {}) {
  pl.from = pl.pose ? JSON.parse(JSON.stringify({ q: Object.fromEntries(Object.entries(pl.pose.q).map(([k, v]) => [k, v.toArray()])), root: pl.pose.root.toArray() })) : null;
  if (pl.from) { const f = newPose(); for (const k in f.q) f.q[k].fromArray(pl.from.q[k]); f.root.fromArray(pl.from.root); pl.from = f; }
  Object.assign(pl, { clip, t, loop, mirror, fade, fadeT: 0, speed, rootX, root, hold, fix });
}
function tickPlayer(pl, dt, rootFix) {
  if (!A || !pl.clip) return;
  pl.t = Math.min(pl.hold, pl.t + dt * pl.speed); pl.fadeT += dt;
  pl.pose = pl.pose || newPose();
  sample(A, pl.clip, pl.t, pl.pose, { loop: pl.loop, mirror: pl.mirror });
  pl.pose.root.x *= pl.rootX;
  if (pl.fix) pl.fix(pl.pose.root, pl.t);
  if (rootFix) rootFix(pl.pose.root);
  if (pl.from && pl.fadeT < pl.fade) mix(pl.from, pl.pose, ease(pl.fadeT / pl.fade), tmpPose), apply(pl.rig, tmpPose, { rootMove: pl.root });
  else apply(pl.rig, pl.pose, { rootMove: pl.root });
}
// заранее: в какой момент удара нога касается мяча и где в этот момент стопа (чтобы поставить игрока к мячу)
function prepKick() {
  const c = A.kick, h = shooter.holder, keep = [h.position.clone(), h.rotation.y];
  h.position.set(0, 0, 0); h.rotation.y = 0; h.updateMatrixWorld(true);
  const pose = newPose(); let best = 0, tc = 0.9, foot = 'foot.R', prev = {};
  const fp = (n) => h.worldToLocal(shooter.rig.B[n].getWorldPosition(new THREE.Vector3()));
  for (let t = 0; t <= c.dur; t += 1 / 60) {
    sample(A, 'kick', t, pose); apply(shooter.rig, pose); h.updateMatrixWorld(true);
    for (const n of ['foot.L', 'foot.R']) { const q = fp(n); if (prev[n] && t > 0.3) { const v = q.distanceTo(prev[n]) * 60; if (v > best) { best = v; tc = t; foot = n; } } prev[n] = q; }
  }
  sample(A, 'kick', tc, pose); apply(shooter.rig, pose); h.updateMatrixWorld(true);
  const atContact = fp(foot);
  sample(A, 'kick', 0, pose); const root0 = pose.root.clone();
  h.position.copy(keep[0]); h.rotation.y = keep[1];
  KICK = { tc, foot, atContact, root0 };
  // прыжок вратаря: когда он дальше всего вбок и в какую сторону летит по записи
  const d = A.gk_dive; let mx = 0, tk = 1, sx = 1; const pp = newPose();
  for (let t = 0; t <= d.dur; t += 1 / 30) { sample(A, 'gk_dive', t, pp); if (Math.abs(pp.root.x) > mx) { mx = Math.abs(pp.root.x); tk = t; sx = Math.sign(pp.root.x); } }
  DIVE = { tk, reach: mx, side: sx };
}
function placeShooter() { // встаём так, чтобы в момент касания стопа оказалась у мяча
  const dir = new THREE.Vector3(-spot.x, 0, -spot.z).normalize(), yaw = Math.atan2(dir.x, dir.z);
  const h = shooter.holder; h.rotation.set(0, yaw, 0);
  const off = KICK.atContact.clone().applyAxisAngle(AY, yaw); off.y = 0;
  h.position.copy(spot).addScaledVector(dir, -0.14).sub(off); h.position.y = 0;
}
function celebrateArms(t) { // кулаки вверх поверх записанного движения
  const r = shooter.rig, a = easeOut(t * 2.5);
  turn(r, 'upper_arm.L', AX, -2.4 * a); turn(r, 'upper_arm.R', AX, -2.4 * a);
  turn(r, 'forearm.L', AX, -0.5 * a); turn(r, 'forearm.R', AX, -0.5 * a);
}
function wallPose(w, i, t) {
  const r = w.rig; rest(r);
  const j = kick ? Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, kick.t - 0.08 - i * 0.03) * 4.2))) : 0;
  w.holder.position.y = j * 0.42;
  // руки прикрывают пах, при прыжке колени поджаты
  turn(r, 'upper_arm.L', AZ, 0.35 * r.sideL); turn(r, 'upper_arm.R', AZ, -0.35 * r.sideL);
  turn(r, 'forearm.L', AX, -1.1); turn(r, 'forearm.R', AX, -1.1);
  turn(r, 'thigh.L', AX, -0.6 * j + 0.03 * Math.sin(t * 2 + i)); turn(r, 'thigh.R', AX, -0.6 * j - 0.03 * Math.sin(t * 2 + i));
  turn(r, 'shin.L', AX, 1.0 * j); turn(r, 'shin.R', AX, 1.0 * j);
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

  if (state === 'runup') {
    tickPlayer(shooter, dt);
    if (shooter.t >= KICK.tc) launch();
  } else if (state === 'fly' || state === 'over') {
    if (shooter.clip === 'kick' && shooter.t >= A.kick.dur - 0.05) { const end = shooter.pose.root.clone(); play(shooter, 'idle', { loop: true, fade: 0.5, fix: (r) => { r.x = end.x; r.z = end.z; } }); }
    tickPlayer(shooter, dt);
    const prev = ball.position.clone();
    const steps = 6, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (state === 'fly') vel.x += shot.ax * h;
      vel.y -= G * h; vel.multiplyScalar(1 - 0.02 * h);
      ball.position.addScaledVector(vel, h);
      if (ball.position.y < R) { ball.position.y = R; vel.y = Math.abs(vel.y) * 0.45; vel.x *= 0.9; vel.z *= 0.9; }
      // сетка: мяч вязнет, сетка выгибается
      const bz = -NET_D + (NET_D * 0.45) * (ball.position.y / GH);
      if (ball.position.z < bz + R && ball.position.z < -0.2 && Math.abs(ball.position.x) < GW && ball.position.y < GH) {
        if (vel.z < -2) net.hits.push({ x: ball.position.x, y: ball.position.y, t: 0, a: Math.min(0.55, -vel.z * 0.025) });
        ball.position.z = bz + R; vel.z = Math.abs(vel.z) * 0.08; vel.x *= 0.4; vel.y *= 0.6;
      }
    }
    if (shot) { ball.rotation.x -= vel.z * dt * 7; ball.rotation.z += vel.x * dt * 7 + shot.curve * dt * 25; }
    if (kick) kick.t += dt;
    const p = ball.position;
    if (state === 'fly') {
      if (MODE === 'fk' && prev.z > wallZ && p.z <= wallZ) {
        const jumpH = 0.42 * Math.max(0, Math.sin(Math.min(Math.PI, kick.t * 4.2)));
        const hit = wallX.some((x) => Math.abs(p.x - x) < 0.36) && p.y < 1.95 + jumpH;
        if (hit) { vel.set(vel.x * 0.3, 2.5, Math.abs(vel.z) * 0.25); shot.ax = 0; finish(false, 'В стенку', 'miss'); }
      }
      if (kick && kick.save && !kick.done && p.z < 0.5) { kick.done = true; vel.set(kick.dir * 3.5, 3.2, 5.5); shot.ax = 0; finish(false, 'Сейв!', 'miss'); }
      if (state === 'fly' && prev.z > 0 && p.z <= 0) {
        const ax = Math.abs(p.x);
        if (Math.abs(ax - GW) < R + 0.06 && p.y < GH + R) { vel.set(-vel.x * 0.4, vel.y * 0.5, Math.abs(vel.z) * 0.5); shot.ax = 0; shake = 0.25; finish(false, 'Штанга!', 'miss'); }
        else if (Math.abs(p.y - GH) < R + 0.06 && ax < GW) { vel.set(vel.x * 0.5, Math.abs(vel.y) * 0.5 + 1, Math.abs(vel.z) * 0.5); shot.ax = 0; shake = 0.25; finish(false, 'Перекладина!', 'miss'); }
        else if (ax < GW - R && p.y < GH - R) finish(true, 'ГОЛ!', 'goal');
        else finish(false, 'Мимо', 'miss');
      }
      if (p.z < -4 || p.z > 40 || Math.abs(p.x) > 30) finish(false, 'Мимо', 'miss');
    }
  }
  if (state === 'aim') tickPlayer(shooter, dt, (r) => { r.x = KICK.root0.x; r.z = KICK.root0.z; });
  tickPlayer(keeper, dt);
  if (kick && !kick.dived && kick.t >= kick.react) keeperDive();
  wall.forEach((w, i) => w.holder.visible && wallPose(w, i, now));
  trailTick(state === 'fly' || (state === 'over' && vel.lengthSq() > 30));
  netTick(dt); confTick(dt); blobTick();

  // камера: перед ударом — за мячом; в полёте — плавно следует за мячом
  if (kick && (state === 'fly' || state === 'over')) {
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
  const all = [player(myKit), player(gkKit, true), ...[0, 1, 2, 3].map((i) => player(wallKit(i), true))];
  let done = 0; all.forEach((p) => p.then(() => { done++; if (bar) bar.style.width = (done / all.length) * 100 + '%'; }));
  const got = await Promise.all(all);
  [shooter, keeper] = got; wall.push(...got.slice(2)); blob(ball, 0.45);
  // мяч: модель LeMon74 (Sketchfab, CC BY 4.0), облегчена gltfpack до 3,5 тыс. треугольников
  try { const bm = (await loader.loadAsync('assets/ball.glb')).scene, bb = new THREE.Box3().setFromObject(bm), sz = bb.getSize(new THREE.Vector3()).x;
    bm.scale.setScalar((R * 2) / sz); bm.position.copy(bb.getCenter(new THREE.Vector3()).multiplyScalar(-(R * 2) / sz)); ball.add(bm); ball.material.visible = false; } catch (e) { /* остаётся простой мяч */ }
  A = await animsReady; prepKick();
  resetShot();
  // шейдеры собираем заранее, иначе первый гол и первое конфетти подтормаживают
  conf.visible = true; ren.compile(scene, cam); conf.visible = false;
  $('#load').remove();
  window.ready = true;
  window.dbg = () => ({ state, b: ball.position.toArray().map((v) => +v.toFixed(2)), calls: ren.info.render.calls, tris: ren.info.render.triangles });
})().catch((e) => { $('#load').textContent = 'Не получилось загрузить: ' + e.message; });
frame();
