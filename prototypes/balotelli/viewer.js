// 3D-просмотр игрока: модель на подиуме, крутится пальцем, щипок — приблизить.
// Поза — спокойное ожидание из motion.js (дыхание, лёгкие повороты головы), без ходьбы.
// В игре страница открыта во фрейме, касания ловит сама игра и присылает их сюда сообщениями
// ({ m3d: 'drag', dx, dy } / { m3d: 'zoom', k } / { m3d: 'reset' }): в Telegram на iPhone касания внутри фрейма
// иногда не доходят. Открытая отдельно страница слушает касания сама.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { createRig, planWalk, pose } from './motion.js';

const Q = new URLSearchParams(location.search);
const EMBED = Q.get('embed') === '1';
const canvas = document.getElementById('c');
const say = (m) => { if (EMBED && parent !== window) parent.postMessage(m, '*'); };

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
scene.add(new THREE.HemisphereLight(0xb8b0ff, 0x1a0c22, 1.1));
const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(1.8, 3.4, 3.6); scene.add(key);
const fill = new THREE.DirectionalLight(0x9fb6ff, 0.9); fill.position.set(-3, 1.6, 2.2); scene.add(fill);
const rimA = new THREE.DirectionalLight(0xff4f8a, 2.2); rimA.position.set(-2.4, 2.6, -3.2); scene.add(rimA);
const rimB = new THREE.DirectionalLight(0x8a5cff, 2.0); rimB.position.set(2.6, 2.2, -3.2); scene.add(rimB);

// подиум: тёмный диск с золотым кантом и мягким пятном света
const podium = new THREE.Group(); scene.add(podium);
podium.add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x1c1030, roughness: 0.45, metalness: 0.4 })));
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.645, 0.012, 12, 96), new THREE.MeshStandardMaterial({ color: 0xf6c94f, emissive: 0x7a4c10, roughness: 0.3, metalness: 0.9 }));
rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; podium.add(rim);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,170,220,.55)'); gr.addColorStop(1, 'rgba(255,170,220,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
glow.rotation.x = -Math.PI / 2; glow.position.y = 0.045; podium.add(glow);

const turn = new THREE.Group(); scene.add(turn); // вращаем игрока вместе с подиумом
turn.add(podium);

// ---------- управление ----------
const view = { yaw: -0.35, vel: 0, pitch: 0.06, zoom: 1, idleAt: performance.now() };
function drag(dx, dy) {
  view.yaw += dx * 0.011; view.vel = dx * 0.011;
  view.pitch = Math.min(0.35, Math.max(-0.12, view.pitch + dy * 0.003));
  view.idleAt = performance.now();
}
function zoom(k) { view.zoom = Math.min(2.3, Math.max(1, view.zoom * k)); view.idleAt = performance.now(); }
function reset() { view.yaw = -0.35; view.vel = 0; view.pitch = 0.06; view.zoom = 1; }
addEventListener('message', (e) => {
  const d = e.data; if (!d || typeof d !== 'object' || !d.m3d) return;
  if (d.m3d === 'drag') drag(+d.dx || 0, +d.dy || 0);
  else if (d.m3d === 'zoom') zoom(+d.k || 1);
  else if (d.m3d === 'reset') reset();
  else if (d.m3d === 'release') view.idleAt = performance.now();
});
if (!EMBED) {
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) drag(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(d / pinch); pinch = d; }
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  canvas.addEventListener('dblclick', reset);
}

// ---------- модель ----------
let rig = null, plan = null, H = 1.9;
const t0 = performance.now();
async function load() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(new URL(Q.get('model') || 'balotelli-mobile.glb', import.meta.url).href);
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); });
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y; // стопы на пол
  turn.add(model); model.updateMatrixWorld(true);
  rig = createRig(model); H = rig.height;
  // ходьба закончилась давно: остаётся только спокойное ожидание
  plan = planWalk(rig, { t0: -60, startZ: -2.3 * H / 1.9, endZ: 0 });
  podium.scale.setScalar(H / 1.9); podium.position.y = -0.04 * H / 1.9;
  say({ m3d: 'ready' });
  document.body.dataset.state = 'ready';
}
load().catch((err) => { console.error(err); document.body.dataset.state = 'error'; say({ m3d: 'error' }); });

// ---------- кадр ----------
function frame(now) {
  requestAnimationFrame(frame);
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const t = (now - t0) / 1000;
  // инерция после броска и медленный поворот, если долго не трогали
  if (performance.now() - view.idleAt > 60) { view.yaw += view.vel; view.vel *= 0.93; }
  if (performance.now() - view.idleAt > 3500) view.yaw += 0.0035;
  turn.rotation.y = view.yaw;
  if (rig) pose(rig, plan, plan.tEnd + 4 + t);
  // кадр: целиком в рост, щипком — ближе к лицу
  const z = (view.zoom - 1) / 1.3; // 0 — в рост, 1 — по грудь
  const fitH = H * (1.18 - 0.62 * z), lookY = H * (0.5 + 0.36 * z);
  const vfov = THREE.MathUtils.degToRad(camera.fov), fitByW = (H * 0.62) / camera.aspect;
  const dist = Math.max(fitH, fitByW * (1 - 0.5 * z)) / 2 / Math.tan(vfov / 2);
  camera.position.set(0, lookY + Math.sin(view.pitch) * dist, Math.cos(view.pitch) * dist);
  camera.lookAt(0, lookY, 0);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
