// Выход игрока из пака: настоящая скелетная анимация (кости двигаются кодом), без CSS-перемещения неподвижной модели.
// Скелет — 20 костей: root, pelvis, spine, chest, neck, head, clavicle/upper_arm/forearm/hand (L/R), thigh/shin/foot (L/R).
// Позы задаются направлениями костей в мировых координатах, поэтому не зависят от исходной позы модели (T/A-поза)
// и от того, как в Blender повёрнуты оси костей.
//
// Фазы: появление из света → шаги вперёд → остановка → празднование (разведение рук, грудь вперёд) → дыхание.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
const MODEL_URL = Q.get('model') || 'balotelli.glb';
const FACE = Q.get('face') === '-1' ? -1 : 1; // если модель смотрит спиной к камере — ?face=-1
const deg = THREE.MathUtils.degToRad;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// ---------- тайминг ----------
const T = { appear: 0.7, walk: 2.6, stop: 0.6, celebrate: 1.1 };
const T_WALK0 = T.appear, T_STOP0 = T_WALK0 + T.walk, T_CEL0 = T_STOP0 + T.stop, T_END = T_CEL0 + T.celebrate;
const WALK_DIST = 2.6; // метров к камере
const CYCLE = 1.05; // секунд на полный цикл шага (два шага)

// ---------- сцена ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060f);
scene.fog = new THREE.Fog(0x07060f, 8, 18);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1020, 0.9));
const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
key.position.set(2.2, 5, 4.5); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 0.5, far: 15 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xffc23a, 2.2); rim.position.set(-3, 3, -4); scene.add(rim);
// луч света из «пака» за спиной игрока
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.1, 7, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
beam.position.set(0, 3.2, -WALK_DIST - 0.4); scene.add(beam);
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x12101f, roughness: 0.85, metalness: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 64), new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; scene.add(ring);

// ---------- модель ----------
let rig = null; // { root, bones: {name: bone}, rest: {...}, height }
const status = document.getElementById('status');

function findBones(obj) {
  const bones = {};
  obj.traverse((o) => { if (o.isBone) { bones[o.name] = o; bones[o.name.replace(/\./g, '')] = o; } });
  const get = (n) => bones[n] || bones[n.replace(/\./g, '')] || bones[n.replace('.', '_')];
  const names = ['root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'clavicle.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];
  const out = {}, missing = [];
  names.forEach((n) => { const b = get(n); if (b) out[n] = b; else missing.push(n); });
  return { out, missing };
}

function setupRig(model) {
  // вернуть позу привязки (bind pose) из скина: узлы в GLB могут хранить кадр анимации, а не исходную позу
  model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); });
  const { out: B, missing } = findBones(model);
  if (missing.length) throw new Error('нет костей: ' + missing.join(', '));
  model.updateMatrixWorld(true);
  const rest = {};
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  Object.entries(B).forEach(([n, b]) => { rest[n] = { q: b.quaternion.clone(), p: b.position.clone(), wq: b.getWorldQuaternion(new THREE.Quaternion()), wp: wp(b) }; });
  // направление кости в её локальных осях = на дочернюю кость цепочки
  const CHILD = { 'upper_arm.L': 'forearm.L', 'forearm.L': 'hand.L', 'upper_arm.R': 'forearm.R', 'forearm.R': 'hand.R', 'thigh.L': 'shin.L', 'shin.L': 'foot.L', 'thigh.R': 'shin.R', 'shin.R': 'foot.R' };
  const localDir = {};
  Object.entries(CHILD).forEach(([n, c]) => { localDir[n] = B[c].position.clone().normalize(); });
  // рост и стороны: где у модели «лево» в мире (L может быть +X или −X)
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const sideL = Math.sign(rest['upper_arm.L'].wp.x - rest['upper_arm.R'].wp.x) || 1;
  const ankleY = Math.min(rest['foot.L'].wp.y, rest['foot.R'].wp.y);
  return { model, B, rest, localDir, height, sideL, ankleY, groundY: box.min.y };
}

// мировой кватернион родителя кости (с учётом уже выставленных в этом кадре поз)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
function parentWorldQ(b) { return b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(); }
// повернуть кость так, чтобы она смотрела в мировом направлении dir (минимальным поворотом от позы покоя)
function aim(name, dir) {
  const b = rig.B[name]; b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b);
  const base = Qp.clone().multiply(rig.rest[name].q); // мир. ориентация кости в позе покоя при текущем родителе
  const cur = _v.copy(rig.localDir[name]).applyQuaternion(base);
  const delta = _q.setFromUnitVectors(cur.normalize(), dir.clone().normalize());
  const world = delta.multiply(base);
  b.quaternion.copy(Qp.invert().multiply(world));
  b.updateMatrixWorld(true);
}
// повернуть кость относительно позы покоя вокруг мировой оси
function turn(name, axis, angle) {
  const b = rig.B[name]; b.parent && b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b);
  const restWorld = Qp.clone().multiply(rig.rest[name].q);
  const world = _q2.setFromAxisAngle(axis, angle).multiply(restWorld);
  b.quaternion.copy(Qp.invert().multiply(world));
  b.updateMatrixWorld(true);
}
// держать кость в мировой ориентации «как в покое» (стопы ровно, кисти не крутятся)
function keepWorld(name, extraAxis, extraAngle) {
  const b = rig.B[name]; b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b);
  const rootQ = rig.B.root.getWorldQuaternion(new THREE.Quaternion());
  let world = rootQ.multiply(rig.restRootInv.clone().multiply(rig.rest[name].wq));
  if (extraAxis) world = new THREE.Quaternion().setFromAxisAngle(extraAxis, extraAngle).multiply(world);
  b.quaternion.copy(Qp.invert().multiply(world));
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
// направление «вниз, отклонённое вперёд на a (рад.) и вбок на s»
const legDir = (a) => new THREE.Vector3(0, -Math.cos(a), Math.sin(a) * FACE);
const armDir = (side, fwd, out, up = 0) => {
  // side: +1 — левая, −1 — правая рука (в мировой X через sideL)
  const x = Math.sin(out) * side * rig.sideL, y = -Math.cos(out) * Math.cos(fwd) + up, z = Math.sin(fwd) * Math.cos(out) * FACE;
  return new THREE.Vector3(x, y, z).normalize();
};

// ---------- поза на момент времени t ----------
function pose(t) {
  const B = rig.B;
  // сброс к покою
  Object.entries(rig.rest).forEach(([n, r]) => { B[n].quaternion.copy(r.q); if (n !== 'root') B[n].position.copy(r.p); });

  const walkK = t < T_WALK0 ? 0 : t < T_STOP0 ? 1 : 1 - ease((t - T_STOP0) / T.stop); // сила шага
  const celK = ease((t - T_CEL0) / T.celebrate); // празднование 0→1
  const breathe = t > T_END ? Math.sin((t - T_END) * 2.2) : 0;
  // на праздновании — два лёгких покачивания корпусом в такт, как подбадривание трибун
  const bounce = t > T_CEL0 ? Math.sin(Math.min(1, (t - T_CEL0) / (T.celebrate + 0.8)) * Math.PI * 2) * Math.max(0, 1 - (t - T_CEL0) / (T.celebrate + 1.2)) : 0;

  // путь: идём к камере, к концу шага замедляемся
  const tw = clamp01((t - T_WALK0) / (T.walk + T.stop * 0.5));
  const z = (-WALK_DIST + WALK_DIST * (tw < 1 ? 1 - Math.pow(1 - tw, 1.6) : 1)) * FACE * FACE;
  B.root.position.set(rig.rest.root.p.x, rig.rest.root.p.y, rig.rest.root.p.z + z * FACE);

  // фаза шага
  const ph = (Math.max(0, t - T_WALK0) / CYCLE) * Math.PI * 2;
  const A = deg(27) * walkK; // размах бедра
  const legs = [['L', 0], ['R', Math.PI]];

  // таз и корпус: покачивание и поворот против шага, при праздновании — грудь вперёд, лёгкий прогиб назад
  turn('pelvis', Y, Math.sin(ph) * deg(6) * walkK);
  turn('pelvis', Z, Math.cos(ph * 2) * deg(2.5) * walkK);
  turn('spine', X, (-deg(4) * walkK + deg(-6) * celK) * FACE);
  turn('chest', Y, -Math.sin(ph) * deg(9) * walkK);
  turn('chest', X, (deg(-10) * celK + breathe * deg(1.2) - bounce * deg(3)) * FACE);
  turn('neck', X, deg(-4) * celK * FACE);
  turn('head', X, (deg(-8) * celK + deg(3) * walkK) * FACE);
  if (t > T_END) turn('head', Y, Math.sin((t - T_END) * 0.9) * deg(10));

  // ноги
  legs.forEach(([s, off]) => {
    const p = ph + off;
    const a = Math.sin(p) * A; // бедро вперёд(+)/назад(−)
    // колено сильнее сгибается в переносе (бедро идёт вперёд), в опоре почти прямое
    const knee = (deg(6) + deg(52) * Math.pow(Math.max(0, Math.cos(p)), 1.6)) * walkK + deg(3) * celK;
    aim('thigh.' + s, legDir(a));
    aim('shin.' + s, legDir(a - knee));
    // стопа: в покое ровно; при отрыве носок вниз, при постановке — пятка
    // отрыв: бедро сзади и пошло вперёд — носок вниз; постановка: бедро впереди — пятка (носок вверх)
    const toe = (-deg(22) * Math.max(0, -Math.sin(p)) * Math.max(0, Math.cos(p)) * 2 + deg(10) * Math.max(0, Math.sin(p))) * walkK;
    keepWorld('foot.' + s, X, toe * FACE);
  });

  // руки: в ходьбе — противоход ногам, в праздновании — разведены в стороны и чуть вперёд, ладони открыты
  [['L', 1, 0], ['R', -1, Math.PI]].forEach(([s, side, off]) => {
    const p = ph + off;
    const swing = -Math.sin(p) * deg(24) * walkK;
    const walkUp = armDir(side, swing, deg(13));
    const celUp = armDir(side, deg(10), deg(36) + breathe * deg(2) + bounce * deg(4)); // «Why always me?»: руки вниз и в стороны
    const up = walkUp.clone().lerp(celUp, celK).normalize();
    aim('upper_arm.' + s, up);
    // предплечье: в ходьбе согнуто вперёд, в праздновании почти прямое и раскрыто наружу
    const fwdBend = (deg(18) + Math.max(0, swing) * 0.6) * (1 - celK);
    const fore = up.clone().applyAxisAngle(X, -fwdBend * FACE);
    const celFore = armDir(side, deg(24), deg(44) + bounce * deg(3)); // ладони раскрыты к зрителю
    aim('forearm.' + s, fore.lerp(celFore, celK).normalize());
    // кисть следует за предплечьем (как в позе покоя), иначе запястье выворачивается и тянет руку вниз
  });

  // опора: самая низкая лодыжка всегда на уровне покоя — ноги не проваливаются и не висят
  B.root.updateMatrixWorld(true);
  const yL = B['foot.L'].getWorldPosition(_v).y, yR = B['foot.R'].getWorldPosition(new THREE.Vector3()).y;
  B.root.position.y += rig.ankleY - Math.min(yL, yR);
  B.root.updateMatrixWorld(true);
}

// ---------- камера: голова и стопы целиком на любом экране ----------
function frame() {
  const w = canvas.clientWidth, h = canvas.clientHeight, aspect = w / h;
  camera.aspect = aspect;
  const H = rig.height * 1.16, W = rig.height * 0.82; // запас сверху/снизу и на разведённые руки
  const vfov = deg(camera.fov);
  const dV = (H / 2) / Math.tan(vfov / 2);
  const dH = (W / 2) / (Math.tan(vfov / 2) * aspect);
  const d = Math.max(dV, dH) + 0.3;
  camDist = d;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// камера: в шаге — сбоку на три четверти (видно работу ног), к празднованию — почти анфас
let camDist = 6;
function placeCamera(t) {
  const k = ease((t - T_STOP0 + 0.4) / 1.4), yaw = deg(26) * (1 - k) + deg(8) * k;
  const d = camDist * (1.05 - 0.05 * k) + 1.6 * (1 - ease((t - 0.2) / (T_STOP0 - 0.2))); // наезд камеры к остановке
  // камера едет следом: игрок всегда по центру, и ближе к концу он целиком в кадре
  const pz = rig.B.root.position.z - rig.rest.root.p.z;
  camera.position.set(Math.sin(yaw) * d, rig.groundY + rig.height * 0.52, pz + Math.cos(yaw) * d * FACE);
  camera.lookAt(0, rig.groundY + rig.height * 0.46, pz); // чуть ниже центра — стопы не упираются в кнопки
}

// ---------- запуск ----------
let t0 = performance.now(), skipped = false;
function restart() { t0 = performance.now(); skipped = false; document.body.classList.remove('done'); }
document.getElementById('replay').onclick = restart;
document.getElementById('skip').onclick = () => { t0 = performance.now() - T_END * 1000; skipped = true; };
addEventListener('resize', () => rig && frame());

function loop(now) {
  requestAnimationFrame(loop);
  if (!rig) return;
  const t = (now - t0) / 1000;
  const a = clamp01(t / T.appear);
  if (Q.get('bind') !== '1') pose(t);
  placeCamera(t);
  rig.model.traverse((o) => { if (o.material && 'opacity' in o.material && o.userData.fade) { o.material.opacity = a; o.material.transparent = a < 1; } });
  beam.material.opacity = 0.22 * (1 - ease((t - T_WALK0) / (T.walk * 0.8))) + 0.02;
  ring.material.opacity = ease((t - T_CEL0) / 0.5) * 0.9;
  ring.scale.setScalar(1 + Math.max(0, Math.sin((t - T_CEL0) * 2)) * 0.05);
  document.body.classList.toggle('done', t > T_END);
  renderer.render(scene, camera);
}

async function load() {
  let model, from = 'файл ' + MODEL_URL;
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    model = gltf.scene;
    // встроенный клип (финты с мячом) не запускаем — выход управляется кодом
  } catch (e) {
    model = (await import('./mannequin.js')).mannequin(THREE);
    from = 'тестовый манекен (balotelli.glb не найден)';
  }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material) o.userData.fade = true; } });
  scene.add(model);
  rig = setupRig(model);
  if (Q.get('bones') === '1') { const h = new THREE.SkeletonHelper(model); h.material.depthTest = false; h.material.linewidth = 2; scene.add(h); }
  rig.restRootInv = rig.rest.root.wq.clone().invert();
  status.textContent = `${from} · рост ${rig.height.toFixed(2)} м`;
  frame(); restart();
}
load().catch((e) => { status.textContent = 'Ошибка: ' + e.message; console.error(e); });
requestAnimationFrame(loop);

// для проверок: перемотать на момент t
window.__seek = (t) => { t0 = performance.now() - t * 1000; };
window.__dbg = () => { const o = {}; ['upper_arm.L','forearm.L','hand.L','upper_arm.R','forearm.R','hand.R','clavicle.L'].forEach((n) => { const b = rig.B[n]; const w = b.getWorldPosition(new THREE.Vector3()); o[n] = w.toArray().map((x) => +x.toFixed(3)); o[n + ' ld'] = rig.localDir[n] ? rig.localDir[n].toArray().map((x) => +x.toFixed(2)) : null; }); o.sideL = rig.sideL; return JSON.stringify(o); };
window.__phases = { T_WALK0, T_STOP0, T_CEL0, T_END };
