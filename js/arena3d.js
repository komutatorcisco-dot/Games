// 3D: стадион-остров на главной, большая чаша для матчей, футболисты в форме клубов, мячи четырёх видов.
// Всё строится кодом из простых фигур (без файлов моделей). Three.js грузится лениво: свой vendor/three.min.js,
// если его нет (превью) — с cdnjs. Нет WebGL — вызывающий код остаётся на 2D.
'use strict';

const Arena3D = (() => {
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loading = null;
  const addScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  function three() {
    if (window.THREE) return Promise.resolve();
    if (!loading) loading = addScript('vendor/three.min.js').catch(() => addScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'));
    return loading;
  }
  let glOk = null;
  function supported() {
    if (glOk !== null) return glOk;
    try { const c = document.createElement('canvas'); glOk = !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { glOk = false; }
    return glOk;
  }
  const W = 105, H = 68;
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hexColor = (s, d) => { try { return new THREE.Color(s); } catch (e) { return new THREE.Color(d); } };

  // ---------- газон с разметкой ----------
  function pitchTexture(renderer, cols = ['#36ad52', '#2f9a46']) {
    const c = cv(2048, 1024), x = c.getContext('2d'); // степень двойки: мипмапы, без мерцания полос вдали
    const sx = c.width / (W + 8), sy = c.height / (H + 8), o = (m) => (m + 4) * sx, oy = (m) => (m + 4) * sy;
    for (let i = 0; i < 18; i++) { x.fillStyle = cols[i % 2]; x.fillRect((i * c.width) / 18, 0, c.width / 18 + 1, c.height); }
    x.globalAlpha = 0.05; for (let i = 0; i < 9000; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
    x.globalAlpha = 0.95; x.strokeStyle = '#f4f7f2'; x.fillStyle = '#f4f7f2'; x.lineWidth = 0.15 * sx;
    const rect = (a, b, w, h) => x.strokeRect(o(a), oy(b), w * sx, h * sy);
    const ell = (cx, cy, r, a0 = 0, a1 = Math.PI * 2, fill) => { x.beginPath(); x.ellipse(o(cx), oy(cy), r * sx, r * sy, 0, a0, a1); fill ? x.fill() : x.stroke(); };
    rect(0, 0, W, H); x.beginPath(); x.moveTo(o(W / 2), oy(0)); x.lineTo(o(W / 2), oy(H)); x.stroke();
    ell(W / 2, H / 2, 9.15); ell(W / 2, H / 2, 0.35, 0, 7, true);
    [0, 1].forEach((s) => {
      rect(s ? W - 16.5 : 0, H / 2 - 20.16, 16.5, 40.32); rect(s ? W - 5.5 : 0, H / 2 - 9.16, 5.5, 18.32);
      const px = s ? W - 11 : 11, a = Math.acos(5.5 / 9.15); ell(px, H / 2, 0.3, 0, 7, true);
      ell(px, H / 2, 9.15, s ? Math.PI - a : -a, s ? Math.PI + a : a);
      [0, H].forEach((cy) => ell(s ? W : 0, cy, 1, 0, 7));
    });
    const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.encoding = THREE.sRGBEncoding; return t;
  }

  // ---------- мяч: панели-пятиугольники по вершинам икосаэдра ----------
  const BALLS = {
    classic: { name: 'Классика', base: 0xf5f5f2, pent: 0x15151a, metal: [0.05, 0.05] },
    noir: { name: 'Чёрное золото', base: 0x18181d, pent: 0xd8a51f, metal: [0.15, 0.9] },
    ivory: { name: 'Белое золото', base: 0xf5f5f2, pent: 0xd8a51f, metal: [0.05, 0.9] },
    gold: { name: 'Золотой', base: 0xd8a51f, pent: 0x15151a, metal: [0.95, 0.1] },
  };
  function ball(skin = 'classic', r = 0.34) {
    const S = BALLS[skin] || BALLS.classic;
    const src = new THREE.IcosahedronGeometry(r, 3), pos = src.attributes.position;
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position, cen = [];
    for (let i = 0; i < ico.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ico, i).normalize(); if (!cen.some((c) => c.distanceTo(v) < 0.01)) cen.push(v); }
    const A = [], B = [], v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      v.set(0, 0, 0); for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, i + k)); v.normalize();
      const near = Math.max(...cen.map((c) => c.dot(v)));
      const arr = near > 0.945 ? B : A;
      for (let k = 0; k < 3; k++) arr.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
    }
    const mk = (arr, color, metal) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: metal > 0.5 ? 0.28 : 0.45 })); };
    const grp = new THREE.Group(); grp.add(mk(A, S.base, S.metal[0]), mk(B, S.pent, S.metal[1]));
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  // ---------- футболист ----------
  const SKINS = [0xf1c6a2, 0xe0ac86, 0xc68b62, 0x9a6440, 0x6e4329, 0x4a2c1c];
  const HAIR = [0x1b120c, 0x2e1d12, 0x5a3a20, 0x8a6235, 0xd9b26a, 0x111111];
  function numberTex(num, color, ink) {
    const c = cv(128, 128), x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 128, 128);
    x.fillStyle = ink; x.font = '900 84px Rubik, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(num), 64, 70);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  const geos = {};
  function G() {
    if (geos.torso) return geos;
    geos.torso = new THREE.BoxGeometry(0.56, 0.66, 0.3); geos.torso.translate(0, 0.33, 0);
    geos.shorts = new THREE.BoxGeometry(0.52, 0.3, 0.3);
    geos.thigh = new THREE.CylinderGeometry(0.11, 0.095, 0.48, 8); geos.thigh.translate(0, -0.24, 0);
    geos.shin = new THREE.CylinderGeometry(0.085, 0.07, 0.46, 8); geos.shin.translate(0, -0.23, 0);
    geos.boot = new THREE.BoxGeometry(0.13, 0.08, 0.26); geos.boot.translate(0, -0.04, 0.05);
    geos.upper = new THREE.CylinderGeometry(0.075, 0.07, 0.3, 8); geos.upper.translate(0, -0.15, 0);
    geos.fore = new THREE.CylinderGeometry(0.065, 0.055, 0.3, 8); geos.fore.translate(0, -0.15, 0);
    geos.head = new THREE.SphereGeometry(0.15, 14, 10);
    geos.hair = new THREE.SphereGeometry(0.157, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    geos.neck = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8);
    geos.back = new THREE.PlaneGeometry(0.34, 0.34);
    return geos;
  }
  function player(kit, num, seed = 0) {
    const g = G(), R = (k) => ((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    const shirt = new THREE.MeshStandardMaterial({ color: kit.shirt, roughness: 0.65 }), sleeve = new THREE.MeshStandardMaterial({ color: kit.sleeve, roughness: 0.65 });
    const shorts = new THREE.MeshStandardMaterial({ color: kit.shorts, roughness: 0.7 }), socks = new THREE.MeshStandardMaterial({ color: kit.socks, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: SKINS[Math.floor(R(1) * SKINS.length)], roughness: 0.75 });
    const hair = new THREE.MeshStandardMaterial({ color: HAIR[Math.floor(R(2) * HAIR.length)], roughness: 0.9 });
    const boots = new THREE.MeshStandardMaterial({ color: [0xff4fa0, 0x2ee6ff, 0xffd23f, 0xffffff, 0x111111][Math.floor(R(3) * 5)], roughness: 0.4 });
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = 0.98; body.add(hips);
    const sh = new THREE.Mesh(g.shorts, shorts); sh.position.y = 0.02; hips.add(sh);
    const torso = new THREE.Mesh(g.torso, shirt); torso.position.y = 0.12; hips.add(torso);
    const back = new THREE.Mesh(g.back, new THREE.MeshStandardMaterial({ map: numberTex(num, kit.shirtCss, kit.inkCss), roughness: 0.7 }));
    back.position.set(0, 0.47, -0.152); back.rotation.y = Math.PI; hips.add(back);
    const neck = new THREE.Mesh(g.neck, skin); neck.position.y = 0.83; hips.add(neck);
    const head = new THREE.Mesh(g.head, skin); head.position.y = 0.99; hips.add(head);
    const hr = new THREE.Mesh(g.hair, hair); hr.position.y = 1.0; hr.rotation.x = -0.25; hips.add(hr);
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.13, -0.1, 0); hips.add(hip);
      const th = new THREE.Mesh(g.thigh, skin); hip.add(th);
      const knee = new THREE.Group(); knee.position.y = -0.48; hip.add(knee);
      const sn = new THREE.Mesh(g.shin, socks); knee.add(sn);
      const bt = new THREE.Mesh(g.boot, boots); bt.position.y = -0.46; knee.add(bt);
      return { hip, knee };
    };
    const arm = (side) => {
      const s = new THREE.Group(); s.position.set(side * 0.34, 0.62, 0); hips.add(s);
      const up = new THREE.Mesh(g.upper, sleeve); s.add(up);
      const el = new THREE.Group(); el.position.y = -0.3; s.add(el);
      el.add(new THREE.Mesh(g.fore, skin)); s.rotation.z = side * 0.12;
      return { s, el };
    };
    const L = leg(-1), Rg = leg(1), aL = arm(-1), aR = arm(1);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.scale.setScalar(1.55);
    let ph = R(4) * 6;
    // бег: шаг ног и рук от скорости, голова чуть покачивается
    root.userData.animate = (dt, speed) => {
      const s = Math.min(1, speed / 6); ph += dt * (6 + speed * 1.6);
      const a = Math.sin(ph) * 0.9 * s;
      L.hip.rotation.x = a; Rg.hip.rotation.x = -a;
      L.knee.rotation.x = Math.max(0, -Math.sin(ph)) * 1.2 * s; Rg.knee.rotation.x = Math.max(0, Math.sin(ph)) * 1.2 * s;
      aL.s.rotation.x = -a * 0.8; aR.s.rotation.x = a * 0.8; aL.el.rotation.x = -0.4 * s; aR.el.rotation.x = -0.4 * s;
      hips.position.y = 0.98 + Math.abs(Math.cos(ph)) * 0.06 * s; hips.rotation.x = 0.12 * s;
    };
    root.userData.dive = (k, dir) => { body.rotation.z = -dir * k * 1.35; body.position.y = k * 0.25; body.position.x = dir * k * 0.9; };
    return root;
  }
  // форма из цветов клуба: майка, рукава, шорты, гетры; вратарь — отдельный цвет
  function kitFrom(c1, c2, gk) {
    if (gk) return { shirt: 0x2ee66b, sleeve: 0x1a9e48, shorts: 0x111111, socks: 0x2ee66b, shirtCss: '#2ee66b', inkCss: '#111111' };
    const a = hexColor(c1, '#e3243f'), b = hexColor(c2, '#ffffff');
    const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    const ink = lum(a) > 0.55 ? '#141414' : '#ffffff';
    return { shirt: a, sleeve: lum(b) < 0.08 && lum(a) < 0.15 ? new THREE.Color(0xffffff) : b, shorts: lum(a) > 0.6 ? new THREE.Color(0x151515) : b.clone().lerp(new THREE.Color(0xffffff), lum(b) < 0.2 ? 0 : 0.2), socks: a, shirtCss: '#' + a.getHexString(), inkCss: ink };
  }

  // ---------- ворота ----------
  function goal(side) {
    const g = new THREE.Group(), gw = 7.32, gh = 2.44, d = 2, r = 0.07, white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const post = new THREE.CylinderGeometry(r, r, gh, 10);
    [-gw / 2, gw / 2].forEach((z) => { const m = new THREE.Mesh(post, white); m.position.set(0, gh / 2, z); m.castShadow = true; g.add(m); });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gw, 10), white); bar.rotation.x = Math.PI / 2; bar.position.y = gh; g.add(bar);
    const c = cv(64, 64), x = c.getContext('2d'); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
    const net = (w, h) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w * 1.5, h * 1.5); return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }); };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), net(gw, gh)); back.position.set(d, gh / 2, 0); back.rotation.y = Math.PI / 2; g.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(d, gw), net(d, gw)); top.rotation.x = -Math.PI / 2; top.position.set(d / 2, gh, 0); g.add(top);
    [-gw / 2, gw / 2].forEach((z) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(d, gh), net(d, gh)); s.position.set(d / 2, gh / 2, z); g.add(s); });
    g.position.x = side * W / 2; if (side < 0) g.rotation.y = Math.PI;
    g.userData.net = back;
    return g;
  }

  // ---------- рекламные борта с бегущей строкой ----------
  function adBoards(scene, text, fg, bg) {
    const c = cv(2048, 64), x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    let off = 0;
    const draw = () => {
      x.fillStyle = bg; x.fillRect(0, 0, 2048, 64); x.fillStyle = fg; x.font = '900 40px Rubik, Arial Black, sans-serif'; x.textBaseline = 'middle';
      const w = x.measureText(text).width || 600; for (let p = -(off % w); p < 2048; p += w) x.fillText(text, p, 34); tex.needsUpdate = true;
    };
    draw();
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 }), dark = new THREE.MeshStandardMaterial({ color: 0x15183a });
    [[0, H / 2 + 5, W + 12, 0], [0, -H / 2 - 5, W + 12, Math.PI], [W / 2 + 5, 0, H + 10, -Math.PI / 2], [-W / 2 - 5, 0, H + 10, Math.PI / 2]].forEach(([px, pz, len, ry]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.2), [dark, dark, dark, dark, mat, mat]); b.position.set(px, 0.45, pz); b.rotation.y = ry; scene.add(b);
    });
    return (dt) => { off += dt * 120; draw(); };
  }

  // ---------- большая чаша: два яруса по скруглённому прямоугольнику, полупрозрачная крыша ----------
  function bowl(scene, homeColor) {
    const N = 180, n = 4, A0 = W / 2 + 9, B0 = H / 2 + 9;
    const path = [], nrm = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      path.push([A0 * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), B0 * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
    }
    for (let i = 0; i < N; i++) { const a = path[(i + N - 1) % N], b = path[(i + 1) % N], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; nrm.push([dz / l, -dx / l]); }
    // профиль: [отступ наружу, высота]; нижний ярус, проход с рекламой, верхний ярус, задняя стена
    const prof = [[0, 0], [0, 1.2]], rows = [];
    let d = 0, h = 1.2;
    for (let r = 0; r < 14; r++) { prof.push([d + 0.9, h]); rows.push([d + 0.45, h]); d += 0.9; h += 0.5; prof.push([d, h]); }
    prof.push([d + 2.4, h]); d += 2.4; prof.push([d, h + 1.6]); h += 1.6; const ad = [d, h - 0.8];
    for (let r = 0; r < 16; r++) { prof.push([d + 0.85, h]); rows.push([d + 0.42, h]); d += 0.85; h += 0.72; prof.push([d, h]); }
    prof.push([d + 0.6, h + 3]); const top = [d + 0.6, h + 3];
    const pos = [], col = [], idx = [], P = prof.length, cA = new THREE.Color(0x9aa0b8), cB = new THREE.Color(0x6e7590);
    for (let i = 0; i < N; i++) for (let k = 0; k < P; k++) {
      const [x0, z0] = path[i], [nx, nz] = nrm[i], [pd, ph] = prof[k];
      pos.push(x0 + nx * pd, ph, z0 + nz * pd); const cc = k % 2 ? cA : cB; col.push(cc.r, cc.g, cc.b);
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < P - 1; k++) { const a = i * P + k, b = ((i + 1) % N) * P + k; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const stands = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })); stands.receiveShadow = true; scene.add(stands);
    // болельщики: серые кресла и цвета хозяев вкраплениями
    const seats = [];
    rows.forEach(([pd, ph], ri) => {
      let acc = 0;
      for (let i = 0; i < N; i++) {
        const a = path[i], b = path[(i + 1) % N], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += seg;
        while (acc > 0.85) { acc -= 0.85; const k = 1 - acc / seg, x0 = a[0] + (b[0] - a[0]) * k, z0 = a[1] + (b[1] - a[1]) * k, [nx, nz] = nrm[i]; seats.push([x0 + nx * pd, ph, z0 + nz * pd, Math.atan2(-nx, -nz), ri]); }
      }
    });
    const fg = new THREE.BoxGeometry(0.5, 0.62, 0.36); fg.translate(0, 0.31, 0);
    const fans = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ roughness: 0.85 }), seats.length);
    const o = new THREE.Object3D(), cl = new THREE.Color(), home = hexColor(homeColor, '#e3243f');
    const PAL = [0x3a3d4c, 0x2b2e3a, 0x4a4e60, 0xf2f2f2];
    seats.forEach((s, i) => {
      o.position.set(s[0], s[1], s[2]); o.rotation.set(0, s[3], 0); o.updateMatrix(); fans.setMatrixAt(i, o.matrix);
      const r = Math.random(); cl.copy(r < 0.38 ? home : new THREE.Color(PAL[(Math.random() * PAL.length) | 0])).multiplyScalar(0.75 + Math.random() * 0.3); fans.setColorAt(i, cl);
    });
    scene.add(fans);
    // реклама по проходу между ярусами
    const adC = cv(1024, 32), ax = adC.getContext('2d'); ax.fillStyle = '#1a2560'; ax.fillRect(0, 0, 1024, 32);
    ['СТАРИКИ ДЖЕКСОНЫ', '@OLDJACKSONS', 'ДЖЕКСОНЫ АРЕНА', 'ИГРАЙ В БОТЕ'].forEach((t, i) => { ax.fillStyle = i % 2 ? '#ffc21f' : '#ffffff'; ax.font = '900 20px Rubik, Arial Black, sans-serif'; ax.fillText(t, 20 + i * 256, 23); });
    const adT = new THREE.CanvasTexture(adC); adT.wrapS = THREE.RepeatWrapping; adT.repeat.set(10, 1); adT.encoding = THREE.sRGBEncoding;
    const band = []; const bi = []; const buv = [];
    for (let i = 0; i <= N; i++) { const j = i % N, [x0, z0] = path[j], [nx, nz] = nrm[j]; band.push(x0 + nx * (ad[0] - 0.05), ad[1] - 0.7, z0 + nz * (ad[0] - 0.05), x0 + nx * (ad[0] - 0.05), ad[1] + 0.7, z0 + nz * (ad[0] - 0.05)); buv.push(i / N, 0, i / N, 1); }
    for (let i = 0; i < N; i++) { const a = i * 2; bi.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(band, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); bg.setIndex(bi);
    scene.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: adT, side: THREE.DoubleSide })));
    // крыша: белое кольцо с рёбрами, нависает над верхним ярусом
    const rp = [], ri = [];
    for (let i = 0; i <= N; i++) { const j = i % N, [x0, z0] = path[j], [nx, nz] = nrm[j]; rp.push(x0 + nx * (top[0] + 4), top[1] + 1, z0 + nz * (top[0] + 4), x0 + nx * (top[0] - 13), top[1] - 1.5, z0 + nz * (top[0] - 13)); }
    for (let i = 0; i < N; i++) { const a = i * 2; ri.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    scene.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0xf2f4ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false })));
    const rib = new THREE.MeshStandardMaterial({ color: 0xdfe3f5, roughness: 0.5 }), lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
    for (let i = 0; i < N; i += 6) {
      const [x0, z0] = path[i], [nx, nz] = nrm[i], a = new THREE.Vector3(x0 + nx * (top[0] + 4), top[1] + 1, z0 + nz * (top[0] + 4)), b = new THREE.Vector3(x0 + nx * (top[0] - 13), top[1] - 1.5, z0 + nz * (top[0] - 13));
      const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, len), rib); m.position.copy(a).lerp(b, 0.5); m.lookAt(b); scene.add(m);
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.6), lamp); l.position.copy(b); l.position.y -= 0.3; scene.add(l);
    }
    // ликование: трибуны подпрыгивают после гола
    let cheer = 0;
    return {
      cheer: () => { cheer = 2.2; },
      update(dt, t) {
        if (cheer <= 0) return; cheer -= dt;
        for (let i = 0; i < seats.length; i += 1) { const s = seats[i]; o.position.set(s[0], s[1] + Math.max(0, Math.sin(t * 10 + i)) * 0.35 * Math.min(1, cheer), s[2]); o.rotation.set(0, s[3], 0); o.updateMatrix(); fans.setMatrixAt(i, o.matrix); }
        fans.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // ---------- общая заготовка сцены ----------
  function setup(host, { alpha = false, dpr = 2, shadows = false } = {}) {
    const canvas = document.createElement('canvas'); canvas.className = 'a3d';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    host.appendChild(canvas);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
    let alive = true, raf = 0, last = performance.now();
    const size = () => { const w = host.clientWidth || 300, h = host.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(host);
    return {
      canvas, renderer, scene, camera, size,
      loop(fn, visible = () => true) {
        const step = (now) => {
          if (!alive) return;
          raf = requestAnimationFrame(step);
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (!canvas.isConnected || !visible()) return;
          fn(dt, now / 1000); renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(step);
      },
      stop() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { /* ок */ } canvas.remove(); },
    };
  }

  // ---------- главное меню: ночной стадион-остров ----------
  let menuView = null;
  function island(scene) {
    const root = new THREE.Group(); scene.add(root);
    const std = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, ...extra });
    // скалы: крупные блоки по краям и под плато (верх не выше песка), как на референсе
    const rock = std(0x5a6a8c), rock2 = std(0x47557a);
    const rg = new THREE.BoxGeometry(1, 1, 1);
    const edge = (x, z, sx, sz, k) => { const m = new THREE.Mesh(rg, k % 2 ? rock : rock2); const h = 7 + (k % 3) * 2; m.scale.set(sx, h, sz); m.position.set(x, -3 - h / 2 + 2.5, z); m.rotation.y = ((k % 5) - 2) * 0.05; root.add(m); };
    const PW = W + 52, PH = H + 52;
    for (let i = 0; i < 12; i++) { const x = -PW / 2 + 6.5 + i * ((PW - 13) / 11); edge(x, PH / 2 + 1.5, 13, 6, i); edge(x, -PH / 2 - 1.5, 13, 6, i + 1); }
    for (let i = 0; i < 8; i++) { const z = -PH / 2 + 6.5 + i * ((PH - 13) / 7); edge(PW / 2 + 1.5, z, 6, 13, i + 2); edge(-PW / 2 - 1.5, z, 6, 13, i + 3); }
    const under = new THREE.Mesh(new THREE.BoxGeometry(PW - 6, 14, PH - 6), rock2); under.position.y = -9; root.add(under);
    // плато: песок, сверху трава
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W + 52, 3, H + 52), std(0xe8b04a)); plate.position.y = -1.5; root.add(plate);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(W + 44, 0.4, H + 44), std(0x2f8f4a)); lawn.position.y = 0.1; root.add(lawn);
    // трибуны-ступени (оранжевые, как на референсе) и красная дорожка
    const track = new THREE.Mesh(new THREE.BoxGeometry(W + 12, 0.35, H + 12), std(0xd9473a)); track.position.y = 0.3; root.add(track);
    const stepMat = [std(0xe07a3a), std(0xc8622a)];
    for (let r = 0; r < 7; r++) {
      const w = W + 14 + r * 3.2, h = H + 14 + r * 3.2, y = 0.4 + r * 0.9;
      [[0, h / 2, w, 1.6, 0], [0, -h / 2, w, 1.6, 0], [w / 2, 0, 1.6, h, 0], [-w / 2, 0, 1.6, h, 0]].forEach(([x, z, sx, sz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.9 + r * 0.9, sz), stepMat[r % 2]); m.position.set(x, y + (0.9 * r) / 2 - r * 0.45, z); root.add(m);
      });
    }
    // проходы на трибунах
    [-20, 0, 20].forEach((x) => [1, -1].forEach((sd) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 13), std(0xb04f22)); m.position.set(x, 2.2, sd * (H / 2 + 14)); root.add(m); }));
    // болельщики на ступенях
    const fanG = new THREE.BoxGeometry(0.9, 1.1, 0.7), seatsArr = [];
    for (let r = 0; r < 7; r++) {
      const w = W + 14 + r * 3.2, h = H + 14 + r * 3.2, y = 0.9 + r * 0.9 + 0.5;
      for (let x = -w / 2 + 1; x < w / 2; x += 1.6) { seatsArr.push([x, y, h / 2], [x, y, -h / 2]); }
      for (let z = -h / 2 + 2; z < h / 2 - 1; z += 1.6) { seatsArr.push([w / 2, y, z], [-w / 2, y, z]); }
    }
    const fans = new THREE.InstancedMesh(fanG, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), seatsArr.length);
    const o = new THREE.Object3D(), cl = new THREE.Color(), FC = [0xffc21f, 0x2f5bd8, 0xffffff, 0xe3243f, 0x1a1446];
    seatsArr.forEach((s, i) => { o.position.set(...s); o.updateMatrix(); fans.setMatrixAt(i, o.matrix); fans.setColorAt(i, cl.setHex(FC[(Math.random() < 0.55 ? (i % 2) : (Math.random() * 5)) | 0])); });
    root.add(fans);
    // поле и ворота
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 6), new THREE.MeshStandardMaterial({ map: pitchTexture(menuView.renderer, ['#43c45e', '#38b052']), roughness: 0.9 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.5; root.add(pitch);
    [1, -1].forEach((s) => { const g = goal(s); g.position.y = 0.5; g.scale.setScalar(1.6); root.add(g); });
    // фонари, ёлки, домики
    const pole = std(0x6b7590), bulb = new THREE.MeshBasicMaterial({ color: 0xffe28a }), lights = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]].forEach(([a, b]) => {
      const x = a * (W / 2 + 12), z = b * (H / 2 + 30), g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 14, 6), pole); p.position.y = 7; g.add(p);
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bulb); s.position.set((k % 2 ? 1 : -1) * 1.3, 14.4 + (k > 1 ? 1.6 : 0), 0); g.add(s); }
      const pl = new THREE.PointLight(0xffd88a, 0.9, 60, 2); pl.position.set(0, 15, 0); g.add(pl); lights.push(pl);
    });
    const leaf = [std(0x3fbf4f), std(0x2e9e3e), std(0x8cd63a)], trunk = std(0x7a4a2a);
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2 + 0.1, x = Math.cos(t) * (W / 2 + 21), z = Math.sin(t) * (H / 2 + 21);
      if (Math.abs(z) < H / 2 + 10 && Math.abs(x) < W / 2 + 10) continue;
      const g = new THREE.Group(); g.position.set(Math.max(-W / 2 - 23, Math.min(W / 2 + 23, x)), 0.3, Math.max(-H / 2 - 23, Math.min(H / 2 + 23, z))); root.add(g);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 5), trunk); tr.position.y = 1; g.add(tr);
      if (i % 3) for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.6 - k * 0.6, 3, 6), leaf[k % 2]); c.position.y = 3 + k * 1.6; g.add(c); }
      else { const c = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 3.2), leaf[2]); c.position.y = 3.6; c.rotation.y = 0.6; g.add(c); }
    }
    const wall = std(0xf3e6cc), roof = std(0x8a2e2a), win = new THREE.MeshBasicMaterial({ color: 0xffd36a });
    [[W / 2 + 19, H / 2 + 17], [-W / 2 - 19, H / 2 + 17], [W / 2 + 19, -H / 2 - 17], [-W / 2 - 19, -H / 2 - 17]].forEach(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = i * 1.3; root.add(g);
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), wall); b.position.y = 2; g.add(b);
      const r = new THREE.Mesh(new THREE.ConeGeometry(4.4, 3, 4), roof); r.position.y = 5.5; r.rotation.y = Math.PI / 4; g.add(r);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), win); w.position.set(0, 2.2, 2.52); g.add(w);
    });
    // облака вокруг
    const cloudM = new THREE.MeshStandardMaterial({ color: 0xc8d0ff, roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }), clouds = [];
    for (let i = 0; i < 0; i++) {
      const c = new THREE.Group(); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 2, 0), cloudM); s.position.set(k * 3.2 - 5, Math.random() * 1.5, Math.random() * 2); c.add(s); }
      const t = (i / 7) * Math.PI * 2; c.position.set(Math.cos(t) * 110, 18 + Math.random() * 14, Math.sin(t) * 80); c.userData.t = t; scene.add(c); clouds.push(c);
    }
    return { root, clouds, lights };
  }
  async function menu(host) {
    if (!supported()) return null;
    await three();
    if (!menuView) {
      menuView = setup(host, { alpha: true, dpr: 2.5 });
      const { scene, camera } = menuView;
      scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x2a2050, 0.75));
      const moon = new THREE.DirectionalLight(0xdfe6ff, 0.75); moon.position.set(-60, 120, 80); scene.add(moon);
      const isl = island(scene);
      let drag = 0, dragV = 0, sx = 0;
      menuView.canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; dragV = 0; menuView.canvas.setPointerCapture(e.pointerId); menuView.dragging = true; });
      menuView.canvas.addEventListener('pointermove', (e) => { if (!menuView.dragging) return; dragV = (e.clientX - sx) * 0.006; sx = e.clientX; drag += dragV; });
      const up = () => { menuView.dragging = false; }; menuView.canvas.addEventListener('pointerup', up); menuView.canvas.addEventListener('pointercancel', up);
            menuView.loop((dt, t) => {
        if (!menuView.dragging) { dragV *= 0.92; drag += dragV; drag *= 0.985; }
        isl.root.rotation.y = (RM ? 0 : Math.sin(t * 0.25) * 0.09) + drag;
        isl.clouds.forEach((c, i) => { c.userData.t += dt * 0.02; c.position.x = Math.cos(c.userData.t) * 110; c.position.z = Math.sin(c.userData.t) * 80; c.position.y += Math.sin(t + i) * 0.005; });
        // остров целиком в кадре: расстояние считаем от ширины кадра
        // вид спереди сверху, как у прежнего поля; стадион занимает всю ширину кадра
        camera.fov = 30; const hf = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), dist = 118 / Math.tan(hf);
        camera.position.set(0, dist * 0.82, dist * 0.6); camera.lookAt(0, -4, 6); camera.far = dist * 3; camera.updateProjectionMatrix();
      }, () => Screens.current === 'hub' && !document.hidden && !document.querySelector('.po, .h2-un, .sx-sheet-wrap') && !(typeof Modal !== 'undefined' && Modal.isOpen));
    } else host.appendChild(menuView.canvas);
    menuView.size();
    return menuView;
  }

  // ---------- матч: чаша, 22 игрока, камера ведёт мяч ----------
  // opts: { form: [homeForm, awayForm], slots: FORMATIONS, kits: [[c1,c2],[c1,c2]], ball: 'classic' }
  async function match(host, opts) {
    if (!supported()) return null;
    await three();
    const V = setup(host, { dpr: 1.75, shadows: true }), { scene, camera, renderer } = V, visible = opts.visible || (() => true);
    renderer.toneMappingExposure = 1.1;
    scene.background = new THREE.Color(0x0b0f2c); scene.fog = new THREE.Fog(0x0b0f2c, 150, 360);
    scene.add(new THREE.HemisphereLight(0xaab4ff, 0x1d3a20, 0.55));
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.0); sun.position.set(-40, 90, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 10, far: 220 }); scene.add(sun);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, H + 8), new THREE.MeshStandardMaterial({ map: pitchTexture(renderer), roughness: 0.92 }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 22, H + 22), new THREE.MeshStandardMaterial({ color: 0x1f6d36, roughness: 1 })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; scene.add(apron);
    const goals = [goal(1), goal(-1)]; goals.forEach((g) => scene.add(g));
    const ads = adBoards(scene, `  ${opts.names ? opts.names[0] : 'ДЖЕКСОНЫ'}  ·  СТАРИКИ ДЖЕКСОНЫ  ·  @OLDJACKSONS  ·`, '#1a1446', '#ffc21f');
    const B = bowl(scene, opts.kits[0][0]);
    // команды: 0 атакует вправо (+x), 1 — влево
    const team = [0, 1].map((s) => {
      const slots = opts.slots[opts.form[s]].slots;
      return slots.map((sl, i) => {
        const gk = sl.pos === 'GK', kit = kitFrom(opts.kits[s][0], opts.kits[s][1], gk);
        const m = player(kit, gk ? 1 : [2, 3, 4, 5, 6, 8, 10, 7, 9, 11, 14][i % 11], s * 31 + i);
        const depth = (100 - sl.y) / 100, hx = (s ? 1 : -1) * (W / 2 - 3 - depth * (W / 2 - 6)), hz = ((sl.x - 50) / 100) * H * 0.88 * (s ? -1 : 1);
        m.position.set(hx, 0, hz); m.rotation.y = s ? -Math.PI / 2 : Math.PI / 2; scene.add(m);
        return { m, s, gk, pos: sl.pos, home: new THREE.Vector3(hx, 0, hz), tgt: new THREE.Vector3(hx, 0, hz), vel: 0 };
      });
    });
    const all = [...team[0], ...team[1]];
    // подпись над игроком с мячом — как в менеджерах
    const tag = document.createElement('div'); tag.className = 'a3d-tag'; host.appendChild(tag);
    team.forEach((t, s) => t.forEach((p, i) => { p.name = (opts.players && opts.players[s] && opts.players[s][i]) || ''; }));
    const pv = new THREE.Vector3();
    const homeMid = team.map((t) => { const o = t.filter((p) => !p.gk); return o.reduce((a, p) => a + p.home.x, 0) / o.length; });
    const ballM = ball(opts.ball || 'classic', 0.5); ballM.position.set(0, 0.34, 0); scene.add(ballM);
    const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.02; scene.add(shadowBlob);

    // ---- мяч и розыгрыш ----
    let side = 0, owner = team[0][9] || team[0][10], fly = null, queue = [], dive = null;
    const rnd = (a, b) => a + Math.random() * (b - a);
    function kickTo(target, h, dur, after) { fly = { from: ballM.position.clone(), to: target.clone(), h, t: 0, dur, after }; }
    function pass() {
      const mates = team[side].filter((p) => !p.gk && p !== owner);
      const fwd = mates.filter((p) => (side ? p.m.position.x < ballM.position.x + 5 : p.m.position.x > ballM.position.x - 5));
      const pool = fwd.length && Math.random() < 0.7 ? fwd : mates, to = pool[(Math.random() * pool.length) | 0] || mates[0];
      // перехват
      if (Math.random() < 0.16) { side = 1 - side; const opp = team[side].filter((p) => !p.gk); owner = opp.reduce((b, p) => (p.m.position.distanceTo(to.m.position) < b.m.position.distanceTo(to.m.position) ? p : b), opp[0]); }
      else owner = to;
      // пас на ход: мяч летит туда, куда игрок добежит, а игрок бежит навстречу мячу
      const dir = owner.s ? -1 : 1, tp = owner.m.position.clone().add(new THREE.Vector3(dir * rnd(2, 5), 0, rnd(-2, 2)));
      tp.x = Math.max(-W / 2 + 3, Math.min(W / 2 - 3, tp.x)); tp.z = Math.max(-H / 2 + 2, Math.min(H / 2 - 2, tp.z)); tp.y = 0.34;
      const rec = owner, dist = ballM.position.distanceTo(tp); rec.chase = tp;
      kickTo(tp, dist > 28 ? rnd(4, 8) : 0.25, Math.max(0.55, Math.min(1.6, dist / 22)), () => { rec.chase = null; setTimeout(() => { if (!fly) next(); }, rnd(350, 900)); });
    }
    // событие движка: атака стороны s, затем удар — гол, сейв или мимо
    // атака: мяч уходит в штрафную, ближайший атакующий бежит к нему, затем удар — без телепортов
    let focus = 0;
    function shot(ev) {
      focus = 1;
      side = ev.s; const att = team[side].filter((p) => ['ST', 'LW', 'RW', 'CAM', 'CM', 'LM', 'RM'].includes(p.pos));
      const gx = side ? -W / 2 : W / 2, run = new THREE.Vector3(gx - (side ? -1 : 1) * rnd(13, 19), 0.34, rnd(-10, 10));
      owner = att.reduce((b, p) => (p.m.position.distanceToSquared(run) < b.m.position.distanceToSquared(run) ? p : b), att[0] || team[side][10]);
      owner.chase = run;
      kickTo(run, rnd(0.3, 2.5), 0.9, () => {
        let w = 0;
        const go = () => {
          if (owner.m.position.distanceTo(run) > 1.4 && w++ < 40) return setTimeout(go, 40);
          owner.chase = null;
          const gkP = team[1 - side].find((p) => p.gk);
          let tgt;
          if (ev.t === 'goal') tgt = new THREE.Vector3(gx + (side ? -1.2 : 1.2), rnd(0.5, 2.1), rnd(-3.2, 3.2));
          else if (ev.t === 'save') { tgt = new THREE.Vector3(gx - (side ? -1 : 1) * 0.9, rnd(0.4, 1.6), rnd(-2.6, 2.6)); if (gkP) dive = { p: gkP, t: 0, dir: Math.sign(tgt.z - gkP.m.position.z) || 1 }; }
          else tgt = new THREE.Vector3(gx + (side ? -3 : 3), rnd(0.4, 4.5), (Math.random() < 0.5 ? -1 : 1) * rnd(4.6, 7));
          kickTo(tgt, ev.t === 'miss' ? 1.5 : 0.8, 0.55, () => {
            if (ev.t === 'goal') { B.cheer(); shake = 0.5; const net = goals[side ? 1 : 0].userData.net; net.scale.set(1, 1.08, 1); setTimeout(() => net.scale.set(1, 1, 1), 400); }
            setTimeout(() => {
              if (ev.t === 'goal') { ballM.position.set(0, 0.34, 0); side = 1 - side; owner = team[side][9] || team[side][10]; all.forEach((p) => p.m.position.lerp(p.home, 0.85)); }
              else { side = 1 - side; owner = team[side].find((p) => p.gk) || team[side][0]; }
              focus = 0;
              const d = ev.done; next(); if (d) d();
            }, ev.t === 'goal' ? 1600 : 700);
          });
        };
        go();
      });
    }
    function next() { const e = queue.shift(); if (e) shot(e); else pass(); }
    pass();

    // ---- камера: ТВ-трансляция сбоку, ведёт мяч ----
    const camPos = new THREE.Vector3(0, 30, H / 2 + 42), look = new THREE.Vector3();
    let shake = 0, t0 = 0;
    V.loop((dt, t) => {
      t0 += dt;
      if (fly) {
        fly.t += dt / fly.dur; const k = Math.min(1, fly.t);
        ballM.position.lerpVectors(fly.from, fly.to, k); ballM.position.y = fly.from.y + (fly.to.y - fly.from.y) * k + Math.sin(k * Math.PI) * fly.h;
        ballM.rotation.x += dt * 14; ballM.rotation.z += dt * 9;
        if (k >= 1) { const f = fly; fly = null; if (f.after) f.after(); }
      } else if (owner) { // ведение у ног
        const p = owner.m.position; ballM.position.x += (p.x + (owner.s ? -0.6 : 0.6) - ballM.position.x) * Math.min(1, dt * 8); ballM.position.z += (p.z - ballM.position.z) * Math.min(1, dt * 8); ballM.position.y = 0.34; ballM.rotation.x += dt * 6;
      }
      shadowBlob.position.x = ballM.position.x; shadowBlob.position.z = ballM.position.z; const sh = 1 / (1 + ballM.position.y * 0.25); shadowBlob.scale.setScalar(sh);
      // игроки: линии сдвигаются за мячом, ближайший к мячу — прессингует, владелец бежит к чужим воротам
      const bx = ballM.position.x, bz = ballM.position.z;
      all.forEach((p) => {
        const dir = p.s ? -1 : 1;
        if (p.gk) p.tgt.set(p.home.x + dir * Math.max(0, (bx * dir + W / 2) * 0.03), 0, Math.max(-3, Math.min(3, bz * 0.12)));
        // команда с мячом поднимается всей линией к чужим воротам, без мяча — сжимается к своим
        // компактный блок вокруг мяча: расстановка сохраняется, команда с мячом — чуть впереди мяча, без мяча — между мячом и своими воротами
        else { const mid = homeMid[p.s], c = bx + (p.s === side ? dir * 4 : -dir * 9);
          p.tgt.set(Math.max(-W / 2 + 2, Math.min(W / 2 - 2, c + (p.home.x - mid) * 0.62)), 0, p.home.z * (p.s === side ? 1 : 0.78) + bz * 0.25); }
      });
      [0, 1].forEach((s) => { const near = team[s].filter((p) => !p.gk).reduce((b, p) => (p.m.position.distanceToSquared(ballM.position) < b.m.position.distanceToSquared(ballM.position) ? p : b)); near.tgt.set(bx, 0, bz); });
      if (owner && !fly) owner.tgt.set(owner.m.position.x + (owner.s ? -6 : 6), 0, owner.m.position.z);
      if (owner && owner.chase) owner.tgt.copy(owner.chase).setY(0);
      all.forEach((p) => {
        const d = p.tgt.clone().sub(p.m.position); d.y = 0; const dist = d.length();
        const sp = Math.min(dist * 1.4, 7.5); p.vel += (sp - p.vel) * Math.min(1, dt * 4);
        if (dist > 0.1) { d.normalize(); p.m.position.addScaledVector(d, p.vel * dt); const ang = Math.atan2(d.x, d.z); p.m.rotation.y += (((ang - p.m.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8); }
        p.m.userData.animate(dt, p.vel);
      });
      if (dive) { dive.t += dt * 2.4; const k = dive.t < 1 ? dive.t : Math.max(0, 2 - dive.t); dive.p.m.userData.dive(k, dive.dir); if (dive.t > 2) { dive.p.m.userData.dive(0, 1); dive = null; } }
      // камера
      const port = camera.aspect < 1;
      // вертикальный экран: поле вдоль экрана, вид сверху как в менеджерах — видно всю ширину и почти всю длину;
      // наши атакуют вверх. Горизонтальный экран — ТВ-вид сбоку. В опасный момент камера подъезжает ближе.
      const zoom = focus ? 0.62 : 1;
      if (port) {
        camera.fov = 50; camera.up.set(1, 0, 0);
        const cx = Math.max(-W / 2 + 30, Math.min(W / 2 - 30, bx));
        camPos.set(cx - 44 * zoom, 66 * zoom, bz * (focus ? 0.5 : 0.15));
        look.lerp(new THREE.Vector3(cx + 8, 0, bz * (focus ? 0.5 : 0.15)), Math.min(1, dt * 3));
      } else {
        camera.fov = 40; camera.up.set(0, 1, 0);
        camPos.set(bx * 0.85, 34 * zoom, H / 2 + 34 * zoom);
        look.lerp(new THREE.Vector3(bx * 0.95, 0, bz * 0.3), Math.min(1, dt * 3));
      }
      camera.position.lerp(camPos, Math.min(1, dt * 1.8));
      if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
      camera.lookAt(look); camera.updateProjectionMatrix();
      ads(dt); B.update(dt, t);
      if (owner && owner.name) {
        pv.copy(owner.m.position); pv.y = 3.6; pv.project(camera);
        const w = host.clientWidth, h = host.clientHeight;
        tag.style.transform = `translate(${((pv.x + 1) / 2) * w}px, ${((1 - pv.y) / 2) * h}px) translate(-50%, -100%)`;
        if (tag.textContent !== owner.name) { tag.textContent = owner.name; tag.className = 'a3d-tag ' + (owner.s ? 'b' : 'a'); }
        tag.hidden = pv.z > 1;
      }
    }, () => visible() && !document.hidden);
    return {
      // события ждут своей очереди: текущая передача доиграется, потом атака
      // события показываются по одному; done — когда последний момент доигран (часы матча ждут)
      events(evs, done) { evs.forEach((e, i) => queue.push({ ...e, done: i === evs.length - 1 ? done : null })); if (!fly && !focus) { const e = queue.shift(); if (e) shot(e); } },
      stop: () => { tag.remove(); V.stop(); },
    };
  }

  // выбранный мяч и какие открыты: классика сразу, остальные — за турнир драфта
  const BALL_NEED = { classic: 0, noir: 2, ivory: 3, gold: 4 };
  const ballState = () => { const u = Store.d.ui || (Store.d.ui = {}); if (!u.balls) u.balls = ['classic']; if (!u.ball) u.ball = 'classic'; return u; };
  return { supported, three, menu, match, ball, BALLS, BALL_NEED, ballState };
})();
