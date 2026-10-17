// Перенос движений Mixamo (FBX без кожи) на скелет Балотелли (20 костей). Запуск: node bake.js — см. README.md.
// Как переносим: для каждой кости берём, как она повернулась относительно своей стойки у человечка Mixamo,
// и поворачиваем так же кость Балотелли. Руки и ноги дополнительно выравниваем по направлению кости
// (у Mixamo руки в стороны — T-поза, у Балотелли опущены), поэтому направление руки/ноги совпадает в каждом кадре.
// Таз двигается вместе с корнем: смещение бёдер Mixamo, умноженное на отношение роста.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MAP = { pelvis: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
  'clavicle.L': 'LeftShoulder', 'upper_arm.L': 'LeftArm', 'forearm.L': 'LeftForeArm', 'hand.L': 'LeftHand',
  'clavicle.R': 'RightShoulder', 'upper_arm.R': 'RightArm', 'forearm.R': 'RightForeArm', 'hand.R': 'RightHand',
  'thigh.L': 'LeftUpLeg', 'shin.L': 'LeftLeg', 'foot.L': 'LeftFoot', 'thigh.R': 'RightUpLeg', 'shin.R': 'RightLeg', 'foot.R': 'RightFoot' };
// у каких костей выравниваем направление: кость → её «дочка» (у Балотелли и у Mixamo)
const DIR = { 'clavicle.L': ['upper_arm.L', 'LeftArm'], 'upper_arm.L': ['forearm.L', 'LeftForeArm'], 'forearm.L': ['hand.L', 'LeftHand'],
  'clavicle.R': ['upper_arm.R', 'RightArm'], 'upper_arm.R': ['forearm.R', 'RightForeArm'], 'forearm.R': ['hand.R', 'RightHand'],
  'thigh.L': ['shin.L', 'LeftLeg'], 'shin.L': ['foot.L', 'LeftFoot'], 'thigh.R': ['shin.R', 'RightLeg'], 'shin.R': ['foot.R', 'RightFoot'] };
const ORDER = ['pelvis', 'spine', 'chest', 'neck', 'head', 'clavicle.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];

const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

async function target() {
  const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/model.glb');
  const m = g.scene; m.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); }); m.updateMatrixWorld(true);
  // GLTFLoader убирает точки из имён (clavicle.L → clavicleL): ищем по обоим вариантам, ключи — с точкой
  const all = {}; m.traverse((o) => { if (o.isBone) all[o.name] = o; });
  const B = {}; for (const n of ['root', ...ORDER]) { const b = all[n] || all[n.replace(/\./g, '')]; if (!b) throw new Error('нет кости ' + n); B[n] = b; b.userData.canon = n; }
  const rest = {}; for (const n in B) rest[n] = { q: B[n].quaternion.clone(), p: B[n].position.clone(), wq: wq(B[n]), wp: wp(B[n]) };
  return { m, B, rest };
}

export async function bake(url, T, fps = 30) {
  const src = await new FBXLoader().loadAsync(url);
  const S = {}; src.traverse((o) => { if (o.isBone) S[o.name.replace(/^mixamorig\d*:?/, '')] = o; });
  if (!S.Hips) throw new Error('кости: ' + Object.keys(S).slice(0, 8).join(','));
  src.updateMatrixWorld(true);
  const sRest = {}; for (const n in S) sRest[n] = { wq: wq(S[n]), wp: wp(S[n]) };
  const clip = src.animations[0];
  const mixer = new THREE.AnimationMixer(src); mixer.clipAction(clip).play();
  const { B, rest } = T;
  // выравнивание направлений в стойке: A — поворот, переводящий направление кости Балотелли в направление кости Mixamo
  const A = {};
  for (const n of ORDER) {
    A[n] = new THREE.Quaternion();
    if (!DIR[n]) continue;
    const [tc, sc] = DIR[n];
    const td = rest[tc].wp.clone().sub(rest[n].wp).normalize(), sd = sRest[sc].wp.clone().sub(sRest[MAP[n]].wp).normalize();
    A[n].setFromUnitVectors(td, sd);
  }
  // рост: высота таза
  const k = (rest.pelvis.wp.y - rest['foot.L'].wp.y) / (sRest.Hips.wp.y - sRest.LeftFoot.wp.y);
  const n0 = Math.max(2, Math.round(clip.duration * fps) + 1), out = { dur: +clip.duration.toFixed(3), fps, q: {}, root: [] };
  ORDER.forEach((n) => (out.q[n] = []));
  const tw = {}, tmp = new THREE.Quaternion(), inv = new THREE.Quaternion();
  for (let f = 0; f < n0; f++) {
    mixer.setTime(Math.min(clip.duration, f / fps)); src.updateMatrixWorld(true);
    // таз/корень: смещение бёдер
    const d = wp(S.Hips).sub(sRest.Hips.wp).multiplyScalar(k);
    out.root.push(+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4));
    for (const n of ORDER) {
      const s = S[MAP[n]]; if (!s) { tw[n] = rest[n].wq.clone(); continue; }
      // мир цели = мир источника · (стойка источника)⁻¹ · A · стойка цели
      tw[n] = wq(s).multiply(inv.copy(sRest[MAP[n]].wq).invert()).multiply(A[n]).multiply(rest[n].wq);
      // в локальные координаты кости: (мир родителя)⁻¹ · мир кости
      const par = B[n].parent, pw = tw[par.userData.canon] || wq(par);
      tmp.copy(pw).invert().multiply(tw[n]);
      out.q[n].push(+tmp.x.toFixed(4), +tmp.y.toFixed(4), +tmp.z.toFixed(4), +tmp.w.toFixed(4));
    }
  }
  return out;
}
export { target };
