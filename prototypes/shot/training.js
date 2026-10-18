// Окружение «тренировочной базы» для вида «2 на 1» с трибуны (как в тренировках мобильных футбольных игр):
// вместо трибун — сетка-ограждение по периметру поля и полоса деревьев вдали; за воротами — сетка, а не край трибуны.
// Вызовы отрисовки: столбы (1), сетка (1, alphaTest — без сортировки прозрачных слоёв), деревья (1). Теней не отбрасывает.
import * as THREE from 'three';

export function buildTraining(scene, opts = {}) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const X = 38, Z0 = -6.5, Z1 = 111.5, H = 4.2, maxAniso = opts.aniso || 4;
  // периметр: четыре стороны (по часовой стрелке)
  const sides = [[[-X, Z0], [X, Z0]], [[X, Z0], [X, Z1]], [[X, Z1], [-X, Z1]], [[-X, Z1], [-X, Z0]]];

  // ---- столбы: тонкие тёмные бруски каждые 6 м, одна геометрия ----
  const posts = [], box = new THREE.BoxGeometry(0.07, H, 0.07); box.translate(0, H / 2, 0);
  for (const [[ax, az], [bx, bz]] of sides) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 6);
    for (let i = 0; i < n; i++) { const t = i / n; posts.push(box.clone().translate(ax + (bx - ax) * t, 0, az + (bz - az) * t)); }
  }
  group.add(new THREE.Mesh(merge(posts), new THREE.MeshLambertMaterial({ color: '#69727c' })));

  // ---- сетка: текстура ячеек с прозрачностью, alphaTest (рисуется как непрозрачная, без сортировки) ----
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(70,78,86,1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  g.fillStyle = '#5a636c'; g.fillRect(0, 0, 64, 2); // верхняя проволока ячейки
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = maxAniso;
  const P = [], U = [], I = [];
  for (const [[ax, az], [bx, bz]] of sides) {
    const L = Math.hypot(bx - ax, bz - az), o = P.length / 3;
    P.push(ax, 0, az, bx, 0, bz, bx, H, bz, ax, H, az); U.push(0, 0, L / 0.35, 0, L / 0.35, H / 0.35, 0, H / 0.35); I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); ng.setIndex(I);
  group.add(new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, color: '#c3cad0' })));

  // ---- деревья вдали: полоса с силуэтами крон (одна текстура, повтор), стоит далеко за полем ----
  const t = document.createElement('canvas'); t.width = 512; t.height = 128; const tg = t.getContext('2d');
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) { const x = rnd() * 512, r = 14 + rnd() * 22, y = 128 - r * (0.9 + rnd() * 0.8); tg.fillStyle = ['#3d5a2c', '#47663a', '#35502a', '#527040'][(rnd() * 4) | 0]; tg.beginPath(); tg.arc(x, y, r, 0, 7); tg.arc(x - 512, y, r, 0, 7); tg.fill(); tg.fillRect(x - r, y, r * 2, 128 - y); }
  const tt = new THREE.CanvasTexture(t); tt.colorSpace = THREE.SRGBColorSpace; tt.wrapS = THREE.RepeatWrapping;
  const R = [[-95, -40], [95, -40], [95, 150], [-95, 150]], TP = [], TU = [], TI = [];
  for (let k = 0; k < 4; k++) { const [ax, az] = R[k], [bx, bz] = R[(k + 1) % 4], L = Math.hypot(bx - ax, bz - az), o = TP.length / 3;
    TP.push(ax, 0, az, bx, 0, bz, bx, 14, bz, ax, 14, az); TU.push(0, 0, L / 40, 0, L / 40, 1, 0, 1); TI.push(o, o + 1, o + 2, o, o + 2, o + 3); }
  const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.Float32BufferAttribute(TP, 3)); tgeo.setAttribute('uv', new THREE.Float32BufferAttribute(TU, 2)); tgeo.setIndex(TI);
  group.add(new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ map: tt, alphaTest: 0.5, side: THREE.DoubleSide, fog: true })));
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = false; o.updateMatrix(); });
  return group;
}

function merge(list) {
  const p = [], n = [], idx = []; let o = 0;
  for (const g of list) { const pa = g.attributes.position, na = g.attributes.normal, ia = g.index;
    for (let i = 0; i < pa.count; i++) { p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); n.push(na.getX(i), na.getY(i), na.getZ(i)); }
    for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i) + o); o += pa.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); out.setIndex(idx); return out;
}
