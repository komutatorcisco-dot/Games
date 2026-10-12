// Тестовый манекен с теми же 20 костями, что у модели Балотелли (рост 1,9 м, руки в A-позе, смотрит на +Z).
// Нужен, чтобы проверять анимацию выхода без настоящей модели. Части тела жёстко привязаны к своим костям.
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';

export function mannequin(THREE) {
  const J = {
    root: [null, [0, 0, 0]], pelvis: ['root', [0, 1.0, 0]], spine: ['pelvis', [0, 1.12, 0]], chest: ['spine', [0, 1.32, 0]],
    neck: ['chest', [0, 1.56, 0]], head: ['neck', [0, 1.64, 0]],
    'clavicle.L': ['chest', [0.06, 1.5, 0]], 'upper_arm.L': ['clavicle.L', [0.2, 1.49, 0]], 'forearm.L': ['upper_arm.L', [0.4, 1.28, 0]], 'hand.L': ['forearm.L', [0.58, 1.08, 0.02]],
    'clavicle.R': ['chest', [-0.06, 1.5, 0]], 'upper_arm.R': ['clavicle.R', [-0.2, 1.49, 0]], 'forearm.R': ['upper_arm.R', [-0.4, 1.28, 0]], 'hand.R': ['forearm.R', [-0.58, 1.08, 0.02]],
    'thigh.L': ['pelvis', [0.1, 0.97, 0]], 'shin.L': ['thigh.L', [0.11, 0.53, 0.01]], 'foot.L': ['shin.L', [0.11, 0.09, -0.01]],
    'thigh.R': ['pelvis', [-0.1, 0.97, 0]], 'shin.R': ['thigh.R', [-0.11, 0.53, 0.01]], 'foot.R': ['shin.R', [-0.11, 0.09, -0.01]],
  };
  const names = Object.keys(J), bones = {}, list = [];
  names.forEach((n) => { const b = new THREE.Bone(); b.name = n; bones[n] = b; list.push(b); });
  names.forEach((n) => {
    const [par, p] = J[n], b = bones[n];
    if (par) { const pp = J[par][1]; b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); bones[par].add(b); } else b.position.set(...p);
  });
  const W = (n) => new THREE.Vector3(...J[n][1]);
  const parts = [];
  // отрезок-«капсула» между двумя точками, привязанный к кости
  const seg = (bone, a, b, r) => {
    const len = a.distanceTo(b), g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2 + r), 4, 10);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q); g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    parts.push([g, bone]);
  };
  const box = (bone, c, s) => { const g = new THREE.BoxGeometry(...s); g.translate(...c); parts.push([g, bone]); };
  seg('pelvis', W('thigh.R').add(new THREE.Vector3(0, 0.02, 0)), W('thigh.L').add(new THREE.Vector3(0, 0.02, 0)), 0.13);
  seg('spine', W('spine'), W('chest'), 0.14);
  box('chest', [0, 1.42, 0], [0.42, 0.26, 0.22]);
  seg('neck', W('neck'), W('head'), 0.05);
  const head = new THREE.SphereGeometry(0.11, 20, 14); head.scale(1, 1.18, 1.05); head.translate(0, 1.76, 0.01); parts.push([head, 'head']);
  const nose = new THREE.ConeGeometry(0.025, 0.06, 8); nose.rotateX(Math.PI / 2); nose.translate(0, 1.75, 0.13); parts.push([nose, 'head']);
  [['L', 1], ['R', -1]].forEach(([s]) => {
    seg('upper_arm.' + s, W('upper_arm.' + s), W('forearm.' + s), 0.055);
    seg('forearm.' + s, W('forearm.' + s), W('hand.' + s), 0.045);
    const h = new THREE.BoxGeometry(0.07, 0.15, 0.035); h.translate(...W('hand.' + s).add(new THREE.Vector3(Math.sign(J['hand.' + s][1][0]) * 0.03, -0.07, 0)).toArray()); parts.push([h, 'hand.' + s]);
    seg('thigh.' + s, W('thigh.' + s), W('shin.' + s), 0.08);
    seg('shin.' + s, W('shin.' + s), W('foot.' + s), 0.06);
    const f = new THREE.BoxGeometry(0.1, 0.07, 0.26); f.translate(...W('foot.' + s).add(new THREE.Vector3(0, -0.055, 0.07)).toArray()); parts.push([f, 'foot.' + s]);
  });
  const geos = parts.map(([g, bone]) => {
    g = g.toNonIndexed(); const n = g.attributes.position.count, bi = names.indexOf(bone);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? bi : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    ['uv'].forEach((k) => g.deleteAttribute(k));
    return g;
  });
  const geo = mergeGeometries(geos);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c63d9, roughness: 0.55, metalness: 0.05 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  const group = new THREE.Group();
  group.add(bones.root); group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return group;
}
