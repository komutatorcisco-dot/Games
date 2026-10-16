// «Удар» — проба: сам бьёшь штрафные и пенальти. Свайп по экрану = удар: куда отпустил палец — туда летит мяч,
// быстрее свайп — сильнее удар, изогнул линию — мяч закрутится. Вратарь прыгает, стенка подпрыгивает.
// Характеристика «Удар» карточки (?st=85) меняет точность: чем выше, тем меньше разброс.
// Игрок: общая модель prototypes/player с формой клуба (kit.js), движения — кодом по костям.
// Параметры: ?name=МЕССИ&num=10&kit=1e3a8a.ffffff.c8102e.ffffff&st=93&mode=pen
import * as THREE from 'three';
import { GLTFLoader } from '../balotelli/vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../balotelli/vendor/meshopt_decoder.module.js';
import { createRig } from '../balotelli/motion.js';
import { applyKit, kitFromQuery } from '../player/kit.js';

const Q = new URLSearchParams(location.search);
const ST = Math.max(40, Math.min(99, Number(Q.get('st')) || 82));
const NAME = (Q.get('name') || 'ИГРОК').toUpperCase().slice(0, 14);
let MODE = Q.get('mode') === 'pen' ? 'pen' : 'fk';
const SHOTS = 5, G = 9.81, R = 0.11, GW = 3.66, GH = 2.44;
const $ = (s) => document.querySelector(s);

// ---------- сцена ----------
const ren = new THREE.WebGLRenderer({ antialias: true });
ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(innerWidth, innerHeight); ren.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(ren.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a2a52'); scene.fog = new THREE.Fog('#1a2a52', 45, 90);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight('#dfe9ff', '#2b4a1e', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(-8, 20, 14); scene.add(sun);
addEventListener('resize', () => { ren.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });

// газон с полосами и разметкой (одна текстура на участок у ворот)
function pitch() {
  const X0 = -34, X1 = 34, Z0 = -6, Z1 = 50, S = 16, c = document.createElement('canvas');
  c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
  const g = c.getContext('2d'), px = (x) => (x - X0) * S, pz = (z) => (z - Z0) * S;
  for (let i = 0; i * 5 < Z1 - Z0; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042'; g.fillRect(0, i * 5 * S, c.width, 5 * S); }
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 0.12 * S;
  const rect = (x0, z0, x1, z1) => g.strokeRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
  g.beginPath(); g.moveTo(px(X0), pz(0)); g.lineTo(px(X1), pz(0)); g.stroke();
  rect(-20.16, 0, 20.16, 16.5); rect(-9.16, 0, 9.16, 5.5);
  g.beginPath(); g.arc(px(0), pz(11), 0.2 * S, 0, 7); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.arc(px(0), pz(11), 9.15 * S, Math.asin(5.5 / 9.15), Math.PI - Math.asin(5.5 / 9.15)); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshLambertMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2; m.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); scene.add(m);
  const out = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#3a8435' }));
  out.rotation.x = -Math.PI / 2; out.position.y = -0.01; scene.add(out);
}
// ворота: штанги, перекладина, сетка из линий
function goal() {
  const W = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), r = 0.06, D = 1.8;
  const post = (x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GH + r, 16), W); m.position.set(x, (GH + r) / 2, 0); scene.add(m); };
  post(-GW); post(GW);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GW * 2 + r * 2, 16), W); bar.rotation.z = Math.PI / 2; bar.position.set(0, GH, 0); scene.add(bar);
  const pts = [], st = 0.25;
  for (let x = -GW; x <= GW + 1e-6; x += st) { pts.push(x, 0, -D, x, GH, -D * 0.6); pts.push(x, GH, 0, x, GH, -D * 0.6); }
  for (let y = 0; y <= GH + 1e-6; y += st) { const zz = -D + (D * 0.4) * (y / GH); pts.push(-GW, y, zz, GW, y, zz); }
  for (let z = 0; z >= -D; z -= st) { pts.push(-GW, GH, z, GW, GH, Math.max(z, -D * 0.6)); }
  for (const s of [-1, 1]) {
    for (let y = 0; y <= GH + 1e-6; y += st) pts.push(s * GW, y, 0, s * GW, y, -D + (D * 0.4) * (y / GH));
    for (let z = 0; z >= -D; z -= st) pts.push(s * GW, 0, z, s * GW, GH, Math.max(z, -D * 0.6));
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#e8eef8', transparent: true, opacity: 0.55 })));
}
// трибуны: тёмная стена с «толпой» из цветных точек и рекламные щиты
function stands() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#18213d'; g.fillRect(0, 0, 1024, 256);
  const cols = ['#ff4f5e', '#ffcf3a', '#ffffff', '#4fa3ff', '#3fd14a', '#b98bff', '#2a3352'];
  for (let i = 0; i < 9000; i++) { g.fillStyle = cols[(Math.random() * cols.length) | 0]; g.fillRect(Math.random() * 1024, 30 + Math.random() * 226, 2.2, 2.2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(130, 22), new THREE.MeshBasicMaterial({ map: t, color: '#9aa6c8' })); m.position.set(0, 12, -24); scene.add(m);
  const b = document.createElement('canvas'); b.width = 1024; b.height = 64; const bg = b.getContext('2d');
  for (let i = 0; i < 8; i++) { bg.fillStyle = i % 2 ? '#1b1340' : '#ffcf3a'; bg.fillRect(i * 128, 0, 128, 64); bg.fillStyle = i % 2 ? '#ffcf3a' : '#1b1340'; bg.font = '900 30px system-ui'; bg.textAlign = 'center'; bg.fillText(i % 2 ? 'JACKSON' : 'GAMES', i * 128 + 64, 43); }
  const bt = new THREE.CanvasTexture(b); bt.colorSpace = THREE.SRGBColorSpace; bt.wrapS = THREE.RepeatWrapping; bt.repeat.x = 4;
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.9), new THREE.MeshBasicMaterial({ map: bt })); ad.position.set(0, 0.45, -4.5); scene.add(ad);
}
// мяч: белый с чёрными пятиугольниками (текстура)
function ballMesh() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#16192a';
  for (let i = 0; i < 12; i++) { const x = (i % 6) * 43 + (i > 5 ? 21 : 0), y = i > 5 ? 90 : 38; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13); } g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
}
pitch(); goal(); stands();
const ball = ballMesh(); scene.add(ball);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

// ---------- игроки ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
async function player(kit) {
  const g = await loader.loadAsync('../player/player-mobile.glb');
  const m = g.scene; await applyKit(m, kit);
  const rig = createRig(m); const box = new THREE.Box3().setFromObject(m);
  const s = 1.82 / (box.max.y - box.min.y); // рост 1,82 м
  const holder = new THREE.Group(); m.scale.setScalar(s); m.position.y = -box.min.y * s; holder.add(m); scene.add(holder);
  return { holder, rig };
}
// повернуть кость вокруг оси мира (через систему родителя)
function turn(rig, n, axis, a) {
  const b = rig.B[n]; if (!b || !a) return;
  b.parent.getWorldQuaternion(q1); v3.copy(axis).applyQuaternion(q1.invert());
  b.quaternion.premultiply(q2.setFromAxisAngle(v3, a)); b.updateMatrixWorld(true);
}
function rest(rig) { for (const n in rig.B) { rig.B[n].quaternion.copy(rig.rest[n].q); rig.B[n].position.copy(rig.rest[n].p); } rig.model.updateMatrixWorld(true); }
const kitQ = kitFromQuery(Q) || { shirt: '#1e3a8a', shorts: '#ffffff', socks: '#1e3a8a', ink: '#ffffff', num: '10', name: '', skin: '', face: '', fp: [], fm: [], ff: [], crest: '', stripes: '' };
if (!kitQ.name) kitQ.name = NAME;
if (!kitQ.num) kitQ.num = String(Q.get('num') || '10');
const gkKit = { shirt: '#ffd23f', shorts: '#16192a', socks: '#ffd23f', ink: '#16192a', num: '1', name: 'ВРАТАРЬ', skin: '', face: '', fp: [], fm: [], ff: [], crest: '', stripes: '' };
const wallKit = { shirt: '#e5383b', shorts: '#ffffff', socks: '#e5383b', ink: '#ffffff', num: '', name: '', skin: '', face: '', fp: [], fm: [], ff: [], crest: '', stripes: '' };
let shooter, keeper; const wall = [];

// ---------- позиция удара ----------
let spot = new THREE.Vector3(), wallZ = 0, wallX = [];
function setSpot(n) {
  if (MODE === 'pen') { spot.set(0, R, 11); wallX = []; }
  else { const x = [-4, 3, -7, 6, 0][n % 5], z = [21, 20, 23, 22, 25][n % 5]; spot.set(x, R, z); }
  // стенка в 9,15 м на линии мяч — ближняя штанга, 4 человека
  if (MODE === 'fk') {
    const d = new THREE.Vector3(-Math.sign(spot.x || 1) * GW * 0.55 - spot.x, 0, -spot.z).normalize();
    const c = spot.clone().addScaledVector(d, 9.15); wallZ = c.z;
    const side = new THREE.Vector3(-d.z, 0, d.x);
    wallX = [-1.5, -0.5, 0.5, 1.5].map((k) => c.x + side.x * k * 0.62);
  }
  wall.forEach((w, i) => { w.holder.visible = MODE === 'fk'; if (MODE === 'fk') w.holder.position.set(wallX[i], 0, wallZ); });
}

// ---------- состояние ----------
let state = 'aim', n = 0, results = [], t0 = 0, shot = null, kick = null;
const vel = new THREE.Vector3(), msg = $('#msg');
function resetShot() {
  setSpot(n);
  ball.position.copy(spot); vel.set(0, 0, 0); ball.rotation.set(0, 0, 0);
  if (shooter) { shooter.holder.position.set(spot.x - 0.9, 0, spot.z + 1.8); shooter.holder.rotation.y = Math.PI + 0.25; rest(shooter.rig); }
  if (keeper) { keeper.holder.position.set(MODE === 'fk' ? Math.sign(spot.x || 1) * 0.6 : 0, 0, -0.3); keeper.holder.rotation.set(0, 0, 0); rest(keeper.rig); kpose(0, 0); }
  // камера за мячом, чуть сбоку и сверху
  const back = new THREE.Vector3(spot.x, 0, spot.z).normalize(), right = new THREE.Vector3(back.z, 0, -back.x);
  cam.position.set(spot.x, 0, spot.z).addScaledVector(back, 6).addScaledVector(right, 0.5); cam.position.y = 2.3;
  cam.lookAt(spot.x * 0.15, 1.05, 0);
  state = 'aim'; shot = null; kick = null; msg.className = 'msg';
  dots();
}
function dots() {
  $('#dots').innerHTML = Array.from({ length: SHOTS }, (_, i) => `<i class="${results[i] === undefined ? '' : results[i] ? 'g' : 'm'}"></i>`).join('');
  $('#who').innerHTML = `${NAME} · удар <b>${ST}</b>`;
}

// ---------- удар: свайп → скорость, цель, подкрутка ----------
let path = [];
const scr = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
addEventListener('pointerdown', (e) => { if (state !== 'aim' || e.target.closest('button')) return; path = [scr(e)]; });
addEventListener('pointermove', (e) => { if (path.length) path.push(scr(e)); });
addEventListener('pointerup', (e) => {
  if (!path.length || state !== 'aim') return; path.push(scr(e));
  const a = path[0], b = path[path.length - 1], len = Math.hypot(b.x - a.x, b.y - a.y), dt = Math.max(60, b.t - a.t);
  const p = path; path = [];
  if (len < 40 || b.y > a.y - 20) return; // короткий или вниз — не удар
  // куда отпустил палец: луч из камеры на плоскость ворот
  const nd = new THREE.Vector2((b.x / innerWidth) * 2 - 1, -(b.y / innerHeight) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(nd, cam);
  const o = ray.ray.origin, d = ray.ray.direction, k = (0 - o.z) / d.z;
  let tx = o.x + d.x * k, ty = o.y + d.y * k;
  // изгиб линии: на сколько середина пути ушла вбок от прямой
  let dev = 0; for (const q of p) { const u = ((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len; if (Math.abs(u) > Math.abs(dev)) dev = u; }
  const curve = Math.max(-1, Math.min(1, dev / (innerWidth * 0.18)));
  const speed = Math.max(15, Math.min(33, 14 + (len / dt) * 9));
  // точность по характеристике «Удар»
  const sig = 0.12 + (100 - ST) * 0.028, gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  tx += gauss() * sig; ty = Math.max(0.1, ty + gauss() * sig * 0.7);
  shot = { tx, ty, speed, curve, ax: 0 };
  state = 'runup'; t0 = performance.now() / 1000;
});
function launch() {
  const { tx, ty, speed } = shot, D = spot.z, T = D / (speed * 0.92);
  // подкрутка: насколько мяч отклонится по дуге (до 2,4 м), не зависит от силы удара
  const ax = shot.ax = (shot.curve * 2.4 * 2) / (T * T);
  vel.set((tx - spot.x - 0.5 * ax * T * T) / T, (ty - spot.y + 0.5 * G * T * T) / T, -D / T);
  // заранее: где и когда мяч пересечёт линию ворот (без стенки) — по этому прыгает вратарь
  const p = spot.clone(), v = vel.clone(); let t = 0;
  while (p.z > 0 && t < 3) { v.x += ax * 0.01; v.y -= G * 0.01; p.addScaledVector(v, 0.01); t += 0.01; }
  const react = 0.22 + Math.random() * 0.12, kx = keeper.holder.position.x;
  const need = Math.max(0, Math.abs(p.x - kx) - 0.75), topCorner = p.y > 1.9 && Math.abs(p.x) > 2.6;
  const can = need <= 6.2 * Math.max(0, t - react) * (topCorner ? 0.55 : 1) && Math.abs(p.x) < GW + 0.3 && p.y < 2.6;
  kick = { t: 0, T: t, cx: p.x, cy: p.y, react, save: can && Math.random() < (ST > 90 ? 0.75 : 0.88), dir: Math.sign(p.x - kx) || 1, done: false };
  state = 'fly';
}
function finish(ok, text, cls) {
  if (state === 'over') return; state = 'over';
  results[n] = ok; msg.textContent = text; msg.className = 'msg on ' + cls; dots();
  if (ok && shooter) celebrate = performance.now() / 1000;
  setTimeout(() => { n++; if (n >= SHOTS) end(); else resetShot(); }, 1700);
}
let celebrate = 0;
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
function kpose(dive, side) { // вратарь: 0 — стоит, 1 — в полёте; руки вверх по мере прыжка
  const r = keeper.rig; rest(r);
  turn(r, 'upper_arm.L', AX, -0.6 - 1.9 * dive); turn(r, 'upper_arm.R', AX, -0.6 - 1.9 * dive);
  turn(r, 'upper_arm.L', AZ, -0.5 * r.sideL); turn(r, 'upper_arm.R', AZ, 0.5 * r.sideL);
  turn(r, 'thigh.L', AX, -0.35 + 0.2 * dive); turn(r, 'thigh.R', AX, -0.35 + 0.2 * dive); turn(r, 'shin.L', AX, 0.6 - 0.3 * dive); turn(r, 'shin.R', AX, 0.6 - 0.3 * dive);
}
function spose(u) { // бьющий: разбег (0–0,7), замах и удар (0,7–1), проводка после 1
  const r = shooter.rig; rest(r);
  if (u < 0.7) { const ph = Math.sin(u / 0.7 * Math.PI * 3); turn(r, 'thigh.L', AX, 0.6 * ph); turn(r, 'thigh.R', AX, -0.6 * ph); turn(r, 'shin.L', AX, -0.5 * Math.max(0, -ph)); turn(r, 'shin.R', AX, -0.5 * Math.max(0, ph)); turn(r, 'upper_arm.L', AX, -0.5 * ph); turn(r, 'upper_arm.R', AX, 0.5 * ph); return; }
  const k = Math.min(1.4, (u - 0.7) / 0.3); // 0 — замах, 1 — касание, 1,4 — проводка
  const sw = k < 1 ? -0.9 + 0.9 * k * k : (k - 1) * 3.2;
  turn(r, 'thigh.R', AX, sw); turn(r, 'shin.R', AX, k < 1 ? -1.3 * (1 - k) : 0);
  turn(r, 'thigh.L', AX, -0.15); turn(r, 'upper_arm.L', AZ, -0.9 * r.sideL); turn(r, 'upper_arm.R', AX, 0.6);
  turn(r, 'spine', AX, -0.15);
}
function cpose(t) { const r = shooter.rig; rest(r); const a = Math.min(1, t * 3); turn(r, 'upper_arm.L', AX, -2.6 * a); turn(r, 'upper_arm.R', AX, -2.6 * a); turn(r, 'upper_arm.L', AZ, -0.4 * r.sideL); turn(r, 'upper_arm.R', AZ, 0.4 * r.sideL); }

// ---------- кадр ----------
let last = performance.now() / 1000;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000, dt = Math.min(0.033, now - last); last = now;
  if (!shooter) return;
  if (state === 'runup') {
    const u = (now - t0) / 0.75;
    const from = new THREE.Vector3(spot.x - 0.9, 0, spot.z + 1.8), to = new THREE.Vector3(spot.x - 0.35, 0, spot.z + 0.55);
    shooter.holder.position.lerpVectors(from, to, Math.min(1, u / 0.7));
    spose(u);
    if (u >= 1) launch();
  } else if (state === 'fly' || state === 'over') {
    if (state === 'fly') spose(Math.min(1.4, 1 + (now - t0 - 0.75) / 0.3 * 0.4));
    const prev = ball.position.clone();
    const steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (state === 'fly') vel.x += (kick ? shot.ax : 0) * h;
      vel.y -= G * h; vel.multiplyScalar(1 - 0.015 * h);
      ball.position.addScaledVector(vel, h);
      if (ball.position.y < R) { ball.position.y = R; vel.y = Math.abs(vel.y) * 0.45; vel.x *= 0.92; vel.z *= 0.92; }
      if (ball.position.z < -1.7 && Math.abs(ball.position.x) < GW && ball.position.y < GH) { ball.position.z = -1.7; vel.z = Math.abs(vel.z) * 0.1; vel.x *= 0.3; } // сетка
    }
    ball.rotation.x -= vel.z * dt * 6; ball.rotation.z += vel.x * dt * 6;
    if (kick) kick.t += dt;
    const p = ball.position;
    if (state === 'fly') {
      // стенка: прыгает, когда мяч рядом
      if (MODE === 'fk' && prev.z > wallZ && p.z <= wallZ) {
        const hit = wallX.some((x) => Math.abs(p.x - x) < 0.36) && p.y < 2.15;
        if (hit) { vel.set(vel.x * 0.3, 2, Math.abs(vel.z) * 0.25); finish(false, 'В стенку', 'miss'); }
      }
      // вратарь ловит
      if (kick && kick.save && !kick.done && p.z < 0.6) { kick.done = true; vel.set(kick.dir * 3.5, 3.2, 5); shot.ax = 0; finish(false, 'Сейв!', 'miss'); }
      // линия ворот
      if (state === 'fly' && prev.z > 0 && p.z <= 0) {
        const ax = Math.abs(p.x);
        if (Math.abs(ax - GW) < R + 0.06 && p.y < GH + R) { vel.set(-vel.x * 0.4, vel.y * 0.5, Math.abs(vel.z) * 0.5); shot.ax = 0; finish(false, 'Штанга!', 'miss'); }
        else if (Math.abs(p.y - GH) < R + 0.06 && ax < GW) { vel.set(vel.x * 0.5, Math.abs(vel.y) * 0.5 + 1, Math.abs(vel.z) * 0.5); shot.ax = 0; finish(false, 'Перекладина!', 'miss'); }
        else if (ax < GW - R && p.y < GH - R) { shot.ax = 0; finish(true, 'ГОЛ!', 'goal'); }
        else { finish(false, 'Мимо', 'miss'); }
      }
      if (p.z < -3 || p.z > 40 || Math.abs(p.x) > 30) finish(false, 'Мимо', 'miss');
    }
    // вратарь прыгает к точке удара (если не достаёт — прыгает, но поздно)
    if (kick && kick.t > kick.react) {
      const u = Math.min(1, (kick.t - kick.react) / Math.max(0.25, kick.T - kick.react));
      const reach = kick.save ? kick.cx : keeper.holder.position.x + kick.dir * Math.min(2.2, Math.abs(kick.cx - keeper.holder.position.x)) * 0.8;
      const sx = keeper.holder.position.x + (reach - keeper.holder.position.x) * Math.min(1, u * 0.35);
      keeper.holder.position.x = sx;
      const lift = Math.min(1.2, Math.max(0, kick.cy - 0.9)) * Math.sin(Math.PI * Math.min(1, u)) ;
      keeper.holder.position.y = lift * 0.8;
      keeper.holder.rotation.z = -kick.dir * Math.min(1.35, u * 1.6) * (Math.abs(kick.cx) > 1 ? 1 : 0.3);
      kpose(Math.min(1, u * 1.5));
    }
    // стенка подпрыгивает
    wall.forEach((w) => { const j = kick ? Math.max(0, Math.sin(Math.min(Math.PI, (kick.t - 0.05) * 5))) : 0; w.holder.position.y = j * 0.35; });
    if (celebrate) { cpose(now - celebrate); if (now - celebrate > 1.6) celebrate = 0; }
  }
  shadow.position.set(ball.position.x, 0.005, ball.position.z); shadow.material.opacity = 0.35 * Math.max(0.15, 1 - ball.position.y / 4);
  ren.render(scene, cam);
}

// ---------- старт ----------
(async () => {
  [shooter, keeper] = await Promise.all([player(kitQ), player(gkKit)]);
  for (let i = 0; i < 4; i++) { const w = await player({ ...wallKit, num: String(i + 2) }); rest(w.rig); turn(w.rig, 'upper_arm.L', AZ, 0.25 * w.rig.sideL); turn(w.rig, 'upper_arm.R', AZ, -0.25 * w.rig.sideL); wall.push(w); }
  shooter.holder.rotation.y = Math.PI;
  $('#load').remove();
  resetShot();
  window.ready = true; window.dbg = () => ({ state, shot, kick, b: ball.position.toArray().map((v) => +v.toFixed(2)), v: vel.toArray().map((v) => +v.toFixed(2)), spot: spot.toArray() });
})().catch((e) => { $('#load').textContent = 'Не получилось загрузить: ' + e.message; });
frame();
