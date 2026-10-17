// Проигрыватель движений из anims.json (Mixamo, перенесённые на скелет Балотелли — tools/anim/bake.js).
// sample(clip, t) — поза кадра (с плавным переходом между кадрами), mix(...) — плавная смена одного движения другим.
import * as THREE from 'three';

const ORDER = ['pelvis', 'spine', 'chest', 'neck', 'head', 'clavicle.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];
const SWAP = (n) => (n.endsWith('.L') ? n.slice(0, -1) + 'R' : n.endsWith('.R') ? n.slice(0, -1) + 'L' : n);

export async function loadAnims(url) { return (await fetch(url)).json(); }

// поза: { q: {кость: Quaternion}, root: Vector3 }
export function newPose() { const q = {}; ORDER.forEach((n) => (q[n] = new THREE.Quaternion())); return { q, root: new THREE.Vector3() }; }
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
// mirror — зеркально (прыжок вратаря в другую сторону): левые кости ↔ правые, поворот отражается по X
export function sample(A, clip, t, out, { loop = false, mirror = false } = {}) {
  const c = A[clip]; if (!c) return out;
  const n = c.root.length / 3, ft = Math.max(0, loop ? (t % c.dur) : Math.min(t, c.dur)) * c.fps;
  const i = Math.min(n - 1, Math.floor(ft)), j = Math.min(n - 1, i + 1), u = ft - i;
  for (const name of ORDER) {
    const src = c.q[mirror ? SWAP(name) : name];
    qa.fromArray(src, i * 4); qb.fromArray(src, j * 4); qa.slerp(qb, u);
    if (mirror) qa.set(qa.x, -qa.y, -qa.z, qa.w);
    out.q[name].copy(qa);
  }
  const r = c.root;
  out.root.set(r[i * 3] + (r[j * 3] - r[i * 3]) * u, r[i * 3 + 1] + (r[j * 3 + 1] - r[i * 3 + 1]) * u, r[i * 3 + 2] + (r[j * 3 + 2] - r[i * 3 + 2]) * u);
  if (mirror) out.root.x = -out.root.x;
  return out;
}
// смешать позу b в позу a с весом w (0 — только a, 1 — только b)
export function mix(a, b, w, out = a) {
  for (const n of ORDER) out.q[n].copy(a.q[n]).slerp(b.q[n], w);
  out.root.lerpVectors(a.root, b.root, w);
  return out;
}
// поставить позу на скелет: rig из createRig (motion.js); корень двигается на смещение таза (в единицах модели)
export function apply(rig, pose, { rootMove = true } = {}) {
  for (const n of ORDER) rig.B[n].quaternion.copy(pose.q[n]);
  const r = rig.B.root, p = rig.rest.root.p, K = rig.scaleK || 1; // смещение запечено в единицах модели
  if (rootMove) r.position.set(p.x + pose.root.x / K, p.y + pose.root.y / K, p.z + pose.root.z / K);
  else r.position.set(p.x, p.y + pose.root.y / K, p.z);
}
export { ORDER };
