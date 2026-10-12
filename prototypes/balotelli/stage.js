// Арена для выхода игрока: трибуны полукругом, кольцо прожекторов под крышей с лучами,
// световая арка-«ворота», из которых выходит игрок, золотой обод над сценой и вспышки камер на трибунах.
// Всё простое по геометрии (без теней и постобработки), чтобы тянул телефон.
import * as THREE from 'three';

function canvasTex(w, h, draw, repeatX = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeatX, 1); }
  return t;
}
const glowTex = () => canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });

export function buildStage(scene, cols, gold = new THREE.Color('#f6cf63')) {
  const group = new THREE.Group(); scene.add(group);
  const add = (m) => { group.add(m); return m; };
  const additive = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts });
  const glow = glowTex();

  // ---- трибуны: ярусы по дуге позади игрока; на текстуре — ряды кресел и «зрители» ----
  const seats = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#0b0a16'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 12) { g.fillStyle = 'rgba(90,78,160,.5)'; g.fillRect(0, y, w, 3); }
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 6, h); } // проходы между секторами
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + Math.random() * 100},${140 + Math.random() * 90},${200 + Math.random() * 55},${0.08 + Math.random() * 0.18})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 6);
  const ARC0 = Math.PI * 0.62, ARC = Math.PI * 0.76; // дуга, видимая за игроком
  for (let i = 0; i < 6; i++) {
    const R = 10 + i * 1.25, y = 0.55 + i * 0.85;
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.9, 0.85, 72, 1, true, ARC0, ARC), new THREE.MeshBasicMaterial({ map: seats, side: THREE.BackSide, color: 0xc8bff0 })));
    m.position.y = y;
    // светящийся бортик каждого яруса
    const edge = add(new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.035, 96, 1, true, ARC0, ARC), additive({ color: i % 2 ? cols[1 % cols.length] : gold, opacity: 0.35, side: THREE.BackSide })));
    edge.position.y = y + 0.43;
  }
  // ---- вспышки камер на трибунах ----
  const NF = 260, fGeo = new THREE.BufferGeometry(), fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 3), fLife = new Float32Array(NF);
  for (let i = 0; i < NF; i++) {
    const a = ARC0 + Math.random() * ARC, tier = Math.floor(Math.random() * 6), R = 10 + tier * 1.25 + 0.3;
    fPos.set([Math.sin(a) * R, 0.4 + tier * 0.85 + Math.random() * 0.6, Math.cos(a) * R], i * 3);
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const flashes = add(new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.22, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  // ---- кольцо прожекторов под крышей и лучи к центру ----
  const lamps = [], beams = [];
  const beamTex = canvasTex(32, 128, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, 'rgba(255,255,255,.95)'); l.addColorStop(0.35, 'rgba(255,255,255,.25)'); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l; g.fillRect(0, 0, w, h); });
  const NL = 14;
  for (let i = 0; i < NL; i++) {
    const a = ARC0 + (ARC * (i + 0.5)) / NL, R = 12.5, p = new THREE.Vector3(Math.sin(a) * R, 6.6, Math.cos(a) * R);
    const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff4dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.position.copy(p); s.scale.setScalar(0.9); lamps.push(s);
    if (i % 2 === 0) {
      // луч: открытый конус от прожектора к полу рядом с центром сцены
      const target = new THREE.Vector3((Math.random() - 0.5) * 3, 0, -1.5 + (Math.random() - 0.5) * 2);
      const len = p.distanceTo(target);
      const geo = new THREE.CylinderGeometry(0.12, 1.5, len, 20, 1, true); geo.translate(0, -len / 2, 0);
      const b = add(new THREE.Mesh(geo, additive({ map: beamTex, color: i % 4 ? cols[i % cols.length] : 0xfff1d6, opacity: 0.0, side: THREE.DoubleSide })));
      b.position.copy(p); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(p).normalize());
      b.userData.ph = i * 1.37; beams.push(b);
    }
  }
  // ---- золотой обод над сценой (как огромный «нимб» арены) ----
  const halo = add(new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.09, 8, 160), additive({ color: gold, opacity: 0.55 })));
  halo.rotation.x = Math.PI / 2; halo.position.set(0, 7.4, -3.5); halo.scale.set(1, 0.55, 1);
  const halo2 = add(new THREE.Mesh(new THREE.TorusGeometry(9.9, 0.04, 6, 160), additive({ color: cols[0], opacity: 0.35 })));
  halo2.rotation.x = Math.PI / 2; halo2.position.set(0, 7.0, -3.5); halo2.scale.set(1, 0.55, 1);

  // ---- арка-ворота, из которых выходит игрок ----
  const gate = new THREE.Group(); gate.position.set(0, 0, -2.9); group.add(gate);
  const archOuter = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 8, 64, Math.PI), additive({ color: gold, opacity: 0.9 })); gate.add(archOuter);
  const archInner = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.035, 6, 64, Math.PI), additive({ color: cols[0], opacity: 0.7 })); gate.add(archInner);
  // свет из глубины тоннеля
  const tunnelTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h, 0, w / 2, h, h); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.45, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), additive({ map: tunnelTex, color: cols[0], opacity: 0.0 })); tunnel.position.set(0, 1.2, -0.3); gate.add(tunnel);

  // ---- пол: глянцевый, с кругами и лучами разметки ----
  const floorTex = canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#0d0b18'; g.fillRect(0, 0, w, w);
    const c = w / 2; g.strokeStyle = 'rgba(160,140,255,.10)'; g.lineWidth = 2;
    for (let r = 60; r < c; r += 70) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
    g.strokeStyle = 'rgba(246,207,99,.28)'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, 200, 0, Math.PI * 2); g.stroke();
  });
  const floor = add(new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.38, metalness: 0.45, color: 0xbbb4d8 })));
  floor.rotation.x = -Math.PI / 2;

  let last = 0;
  // charge — нарастание света до вспышки (0…1), after — после раскрытия (0…1), walk — игрок в арке/выходит
  function update(t, { charge = 0, after = 0, flash = 0, walk = 0 } = {}) {
    const lit = Math.max(charge, after);
    lamps.forEach((s, i) => { s.material.opacity = 0.25 + 0.75 * lit * (0.85 + 0.15 * Math.sin(t * 3 + i)); s.scale.setScalar(0.7 + 0.5 * lit + 0.6 * flash); });
    beams.forEach((b) => { b.material.opacity = (0.03 + 0.11 * lit + 0.12 * flash) * (0.8 + 0.2 * Math.sin(t * 0.8 + b.userData.ph)); });
    halo.material.opacity = 0.2 + 0.5 * lit; halo2.material.opacity = 0.12 + 0.3 * lit;
    archOuter.material.opacity = 0.25 + 0.65 * lit; archInner.material.opacity = 0.15 + 0.55 * lit;
    tunnel.material.opacity = (0.15 + 0.6 * lit) * (1 - 0.6 * walk);
    // вспышки камер: случайные короткие белые точки, чаще после раскрытия
    const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
    const rate = (4 + 60 * after + 120 * flash) * dt;
    for (let n = 0; n < rate; n++) if (Math.random() < rate - n) fLife[(Math.random() * NF) | 0] = 1;
    for (let i = 0; i < NF; i++) { fLife[i] = Math.max(0, fLife[i] - dt * 6); const v = fLife[i] * fLife[i]; fCol[i * 3] = v; fCol[i * 3 + 1] = v; fCol[i * 3 + 2] = v * 0.95; }
    fGeo.attributes.color.needsUpdate = true;
  }
  return { group, update, floor, gateZ: gate.position.z };
}
