// 3D-пак дня: объёмный фольгированный пак парит и покачивается; нажатие — тряска, вращение,
// верх отрывается, из пака выезжает карточка и разворачивается к игроку с монетами.
// Three.js грузится только при первом открытии (vendor/three.min.js), чтобы не тормозить запуск игры.
'use strict';

const Pack3D = (() => {
  let loading = null;
  function three() {
    if (window.THREE) return Promise.resolve();
    if (!loading) loading = new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = (window.PACK3D_BASE || '') + 'vendor/three.min.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
    });
    return loading;
  }

  // ---------- рисунки на холсте ----------
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hex = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); };
  const star = (g, x, y, R, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r : R; g.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); } g.closePath(); };

  // Монета по эскизу: верёвочный ободок, лоскуты мяча по кругу, звезда в центре
  function coin(g, x, y, R) {
    const gold = (a, b) => { const gr = g.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.05, x, y, R * 1.05); gr.addColorStop(0, a); gr.addColorStop(0.55, b); gr.addColorStop(1, '#8a5a00'); return gr; };
    g.save();
    g.fillStyle = '#5c3a00'; g.beginPath(); g.arc(x, y + R * 0.06, R, 0, 7); g.fill();
    g.fillStyle = gold('#fff3b0', '#e8a910'); g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
    // верёвка
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      g.save(); g.translate(x + Math.cos(a) * R * 0.9, y + Math.sin(a) * R * 0.9); g.rotate(a + 0.9);
      g.fillStyle = i % 2 ? '#b07800' : '#ffe27a'; g.beginPath(); g.ellipse(0, 0, R * 0.09, R * 0.045, 0, 0, 7); g.fill(); g.restore();
    }
    g.fillStyle = gold('#ffe680', '#d99a00'); g.beginPath(); g.arc(x, y, R * 0.78, 0, 7); g.fill();
    g.strokeStyle = 'rgba(92,58,0,.5)'; g.lineWidth = R * 0.03; g.stroke();
    // лоскуты мяча по кругу
    g.save(); g.beginPath(); g.arc(x, y, R * 0.76, 0, 7); g.clip();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      hex(g, x + Math.cos(a) * R * 0.66, y + Math.sin(a) * R * 0.66, R * 0.22);
      g.fillStyle = '#c48a00'; g.fill(); g.strokeStyle = 'rgba(92,58,0,.55)'; g.lineWidth = R * 0.025; g.stroke();
    }
    g.restore();
    // звезда
    star(g, x + R * 0.02, y + R * 0.04, R * 0.42, R * 0.18); g.fillStyle = 'rgba(92,58,0,.45)'; g.fill();
    star(g, x, y, R * 0.42, R * 0.18);
    const sg = g.createLinearGradient(x, y - R * 0.4, x, y + R * 0.4); sg.addColorStop(0, '#ffd34a'); sg.addColorStop(1, '#b07800');
    g.fillStyle = sg; g.fill(); g.strokeStyle = '#7a4d00'; g.lineWidth = R * 0.03; g.stroke();
    // блик
    g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - R * 0.35, y - R * 0.45, R * 0.28, R * 0.12, -0.6, 0, 7); g.fill();
    g.restore();
  }

  function frontTex(W, H) {
    const c = cv(W, H), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2a1470'); bg.addColorStop(0.3, '#6b3cff'); bg.addColorStop(0.42, '#c9a8ff'); bg.addColorStop(0.55, '#5a2ee0'); bg.addColorStop(0.8, '#2a1470'); bg.addColorStop(1, '#170a45');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // фольга: тонкие диагональные полосы
    g.globalAlpha = 0.09; g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let i = -H; i < W + H; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - H * 0.6, H); g.stroke(); }
    g.globalAlpha = 1;
    // лучи за эмблемой
    const cx = W / 2, cy = H * 0.42;
    g.save(); g.translate(cx, cy);
    for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); const lg = g.createLinearGradient(0, 0, W * 0.8, 0); lg.addColorStop(0, 'rgba(255,215,90,.55)'); lg.addColorStop(1, 'rgba(255,215,90,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.8, -W * 0.05); g.lineTo(W * 0.8, W * 0.05); g.fill(); }
    g.restore();
    // эмблема: золотой шестиугольник с «Д»
    hex(g, cx, cy, W * 0.2); const hg = g.createLinearGradient(cx - W * 0.2, cy - W * 0.2, cx + W * 0.2, cy + W * 0.2); hg.addColorStop(0, '#fff6c4'); hg.addColorStop(0.4, '#ffcf3a'); hg.addColorStop(0.75, '#b47800'); hg.addColorStop(1, '#ffe27a'); g.fillStyle = hg; g.fill();
    hex(g, cx, cy, W * 0.17); g.fillStyle = '#1a0d52'; g.fill();
    g.fillStyle = '#ffd34a'; g.font = `900 ${W * 0.17}px Oswald, Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Д', cx, cy + W * 0.01);
    // золотая лента снизу
    const by = H * 0.74, bh = H * 0.12, bgr = g.createLinearGradient(0, 0, W, 0);
    bgr.addColorStop(0, '#a87400'); bgr.addColorStop(0.3, '#ffe27a'); bgr.addColorStop(0.6, '#ffcf3a'); bgr.addColorStop(1, '#a87400');
    g.fillStyle = bgr; g.fillRect(0, by, W, bh);
    g.fillStyle = '#1a0d52'; g.font = `700 ${bh * 0.42}px Oswald, Rubik, sans-serif`; g.fillText('ПАК  ДНЯ', cx, by + bh * 0.4);
    g.font = `${bh * 0.22}px sans-serif`; g.fillText('★ ★ ★', cx, by + bh * 0.8);
    // искры
    g.fillStyle = '#fff';
    [[0.18, 0.14, 1], [0.84, 0.22, 0.7], [0.22, 0.6, 0.6], [0.8, 0.62, 0.8]].forEach(([px, py, s]) => { star(g, W * px, H * py, W * 0.04 * s, W * 0.008 * s); g.fill(); });
    // гребёнка сверху и снизу — как запаянный край пака
    g.fillStyle = 'rgba(255,255,255,.25)';
    for (let x = 0; x < W; x += 16) { g.fillRect(x, 0, 8, H * 0.025); g.fillRect(x, H * 0.975, 8, H * 0.025); }
    return c;
  }
  function backTex(W, H) {
    const c = cv(W, H), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1a0d52'); bg.addColorStop(1, '#3a1c8a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,207,58,.35)'; g.lineWidth = 2;
    for (let y = 0; y < H; y += 40) for (let x = (y / 40) % 2 ? 20 : 0; x < W; x += 40) { hex(g, x, y, 14); g.stroke(); }
    g.fillStyle = '#ffd34a'; g.font = `900 ${W * 0.1}px Oswald, Rubik, sans-serif`; g.textAlign = 'center'; g.fillText('ДЖЕКСОНЫ', W / 2, H / 2);
    return c;
  }
  // карточка-щит: серебро / золото / джекпот
  function cardTex(prize) {
    const W = 512, H = 720, c = cv(W, H), g = c.getContext('2d');
    const kind = prize >= 100 ? 'jack' : prize >= 40 ? 'gold' : 'silver';
    const pal = { silver: ['#ffffff', '#d4d6e2', '#8d8fa3', '#1b1340'], gold: ['#fff6c4', '#f2c94c', '#a8761a', '#3a2600'], jack: ['#ffb3dc', '#ff3d6e', '#7a0f2a', '#ffffff'] }[kind];
    const shield = (inset) => { g.beginPath(); g.moveTo(W / 2, inset); g.lineTo(W - inset, H * 0.07 + inset * 0.5); g.lineTo(W - inset, H * 0.88 - inset * 0.3); g.lineTo(W / 2, H - inset); g.lineTo(inset, H * 0.88 - inset * 0.3); g.lineTo(inset, H * 0.07 + inset * 0.5); g.closePath(); };
    shield(0); const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, pal[0]); bg.addColorStop(0.45, pal[1]); bg.addColorStop(0.85, pal[2]); bg.addColorStop(1, pal[0]); g.fillStyle = bg; g.fill();
    g.save(); shield(0); g.clip(); g.globalAlpha = 0.12; g.fillStyle = '#fff'; for (let i = -H; i < W + H; i += 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - H, H); g.lineTo(i - H, H); g.fill(); } g.restore();
    shield(16); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 5; g.stroke();
    g.fillStyle = pal[3]; g.textAlign = 'center';
    g.font = '700 34px Oswald, Rubik, sans-serif'; g.fillText(kind === 'jack' ? 'Д Ж Е К П О Т' : kind === 'gold' ? 'З О Л О Т О' : 'С Е Р Е Б Р О', W / 2, 120);
    coin(g, W / 2, 300, 128);
    g.font = '700 150px Oswald, Rubik, sans-serif'; g.fillText(`+${prize}`, W / 2, 560);
    g.font = '700 34px Oswald, Rubik, sans-serif'; g.fillText('М О Н Е Т', W / 2, 615);
    return c;
  }

  // ---------- сцена ----------
  // box — элемент, в который рисуем; prize — сколько монет внутри; onOpen — когда карточка показана
  async function mount(box, prize, onOpen) {
    await three();
    const T = window.THREE;
    const W = box.clientWidth || 340, H = box.clientHeight || 420;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H);
    renderer.outputEncoding = T.sRGBEncoding;
    box.appendChild(renderer.domElement);
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(32, W / H, 0.1, 50);
    cam.position.set(0, 0, 6.8);
    scene.add(new T.AmbientLight(0xffffff, 0.55));
    const key = new T.DirectionalLight(0xffffff, 0.9); key.position.set(2, 3, 4); scene.add(key);
    const rim = new T.PointLight(0xb48cff, 1.6, 12); rim.position.set(-3, 1, 2); scene.add(rim);
    const gold = new T.PointLight(0xffcf3a, 0, 10); gold.position.set(0, 0, 2.5); scene.add(gold);

    const tex = (c) => { const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
    const PW = 1.5, PH = 2.2, PD = 0.12, CAP = 0.2; // доля высоты, которая отрывается
    const front = tex(frontTex(512, 750)), back = tex(backTex(512, 750));
    const foil = (map) => new T.MeshStandardMaterial({ map, metalness: 0.55, roughness: 0.28 });
    const edge = new T.MeshStandardMaterial({ color: 0xd9a400, metalness: 0.9, roughness: 0.3 });
    // часть пака: кусок текстуры по высоте [v0..v1]
    function slab(v0, v1) {
      const h = PH * (v1 - v0), geo = new T.BoxGeometry(PW, h, PD);
      const fm = foil(front.clone()), bm = foil(back.clone());
      [fm.map, bm.map].forEach((m) => { m.needsUpdate = true; m.repeat.set(1, v1 - v0); m.offset.set(0, v0); });
      const mesh = new T.Mesh(geo, [edge, edge, edge, edge, fm, bm]);
      mesh.position.y = -PH / 2 + PH * (v0 + v1) / 2;
      return mesh;
    }
    const pack = new T.Group(), body = slab(0, 1 - CAP), cap = slab(1 - CAP, 1);
    pack.add(body, cap); scene.add(pack);

    // карточка внутри пака
    const card = new T.Mesh(new T.PlaneGeometry(1.2, 1.69), new T.MeshStandardMaterial({ map: tex(cardTex(prize)), transparent: true, metalness: 0.3, roughness: 0.35, side: T.DoubleSide }));
    card.position.set(0, -0.05, 0); card.visible = false; scene.add(card);

    // лучи за паком
    const rc = cv(256, 256), rg = rc.getContext('2d'); rg.translate(128, 128);
    for (let i = 0; i < 16; i++) { rg.rotate(Math.PI / 8); const lg = rg.createLinearGradient(0, 0, 128, 0); lg.addColorStop(0, 'rgba(255,220,120,.9)'); lg.addColorStop(1, 'rgba(255,220,120,0)'); rg.fillStyle = lg; rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(128, -14); rg.lineTo(128, 14); rg.fill(); }
    const rays = new T.Mesh(new T.PlaneGeometry(5, 5), new T.MeshBasicMaterial({ map: tex(rc), transparent: true, opacity: 0.25, depthWrite: false }));
    rays.position.z = -1; scene.add(rays);

    // искры
    const N = 140, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) vel.push(new T.Vector3());
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const sc = cv(64, 64), sg = sc.getContext('2d'), sgr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); sgr.addColorStop(0, '#fff'); sgr.addColorStop(0.3, '#ffd34a'); sgr.addColorStop(1, 'rgba(255,200,0,0)'); sg.fillStyle = sgr; sg.fillRect(0, 0, 64, 64);
    const sparks = new T.Points(pg, new T.PointsMaterial({ size: 0.16, map: tex(sc), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    sparks.visible = false; scene.add(sparks);
    function burst() {
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.4; pos[i * 3 + 1] = PH / 2 - 0.3; pos[i * 3 + 2] = 0.2;
        const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5;
        vel[i].set(Math.cos(a) * s, Math.abs(Math.sin(a)) * s + 1.5, (Math.random() - 0.3) * 2);
      }
      pg.attributes.position.needsUpdate = true; sparks.visible = true;
    }

    // ---------- анимация ----------
    let phase = 'idle', t0 = performance.now(), last = t0, raf = 0, alive = true;
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const back3 = (x) => { x = Math.min(1, Math.max(0, x)); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    let spinFrom = 0;
    function frame(now) {
      if (!alive) return;
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      rays.rotation.z += dt * 0.25;
      if (phase === 'idle') {
        pack.rotation.y = Math.sin(t * 1.1) * 0.45; pack.rotation.x = Math.sin(t * 0.8) * 0.08;
        pack.position.y = Math.sin(t * 1.6) * 0.08;
      } else if (phase === 'shake') { // тряска и быстрый оборот
        const k = t / 1.1;
        pack.rotation.z = Math.sin(t * 60) * 0.06 * (1 - k);
        pack.rotation.y = spinFrom + ease(k) * Math.PI * 4;
        pack.position.y = 0; gold.intensity = k * 1.3; rays.material.opacity = 0.25 + k * 0.5; rays.scale.setScalar(1 + k * 0.4);
        if (k >= 1) { phase = 'tear'; t0 = now; pack.rotation.set(0, 0, 0); burst(); Sound.play('kick'); haptic('ok'); }
      } else if (phase === 'tear') { // верх отрывается, карточка выезжает
        const k = t / 1.0;
        cap.position.y = PH / 2 - PH * CAP / 2 + ease(k) * 2.6; cap.position.x = ease(k) * 1.4; cap.rotation.z = -ease(k) * 1.2; cap.rotation.x = ease(k) * 0.8;
        card.visible = true; card.position.y = -0.05 + ease(k) * 1.15; card.position.z = 0;
        if (k >= 1) { phase = 'reveal'; t0 = now; }
      } else if (phase === 'reveal') { // пак уходит вниз, карточка выходит вперёд и разворачивается
        const k = t / 1.1;
        pack.position.y = -ease(k) * 4.5; pack.rotation.x = ease(k) * 0.6;
        card.position.set(0, 1.1 - back3(k) * 1.1, back3(k) * 1.6);
        card.rotation.y = (1 - ease(k)) * Math.PI * 2;
        card.scale.setScalar(1 + ease(k) * 0.15);
        if (k >= 1) { phase = 'done'; t0 = now; onOpen && onOpen(); }
      } else if (phase === 'done') {
        card.rotation.y = Math.sin(t * 1.2) * 0.18; card.position.y = Math.sin(t * 1.8) * 0.04;
        gold.intensity = 0.8 + Math.sin(t * 3) * 0.25;
      }
      if (sparks.visible) {
        for (let i = 0; i < N; i++) { vel[i].y -= 6 * dt; pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; }
        pg.attributes.position.needsUpdate = true; sparks.material.opacity = Math.max(0, sparks.material.opacity - dt * 0.35);
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      open() { if (phase !== 'idle') return false; phase = 'shake'; spinFrom = pack.rotation.y; t0 = performance.now(); Sound.play('tap'); haptic('tap'); return true; },
      destroy() { alive = false; cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); },
    };
  }

  return { mount, coin };
})();
