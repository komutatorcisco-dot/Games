// Звезда команды в 3D на главной (23.11): игрок в форме своего клуба (PlayerKit, assets3d/player.glb) чеканит мяч.
// Отдельный маленький WebGL-холст в .hm-star; ~30 кадров, пауза, когда главная скрыта. Нет WebGL/модели — остаётся карточка.
'use strict';

const Hero3D = (() => {
  let cur = null, heroG = null, heroA = null; // { host, renderer, scene, cam, p, ball, raf, key }
  const ok = () => typeof PlayerKit !== 'undefined' && typeof Arena3D !== 'undefined' && Arena3D.supported() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    try { if (cur.p.userData.mixer) cur.p.userData.mixer.stopAllAction(); cur.renderer.dispose(); if (cur.renderer.forceContextLoss) cur.renderer.forceContextLoss(); } catch (e) { /* ок */ }
    if (cur.renderer.domElement.parentNode) cur.renderer.domElement.remove();
    cur = null;
  }
  async function mount(host, c) {
    if (!host || !c || !ok()) return;
    if (cur && cur.key === c.key && cur.host === host) return;
    if (cur && cur.key === c.key && cur.renderer) { host.appendChild(cur.renderer.domElement); cur.host = host; host.classList.add('on3d'); return; }
    stop();
    let g; try { await Arena3D.three(); g = await PlayerKit.load(); } catch (e) { return; }
    if (!host.isConnected) return;
    let renderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(1.6, devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 0.7, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x203020, 0.9));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.25); key.position.set(2, 4, 5); scene.add(key);
    const back = new THREE.DirectionalLight(0xffd23c, 1.5); back.position.set(-1, 3, -4); scene.add(back);
    // 23.11: модель из матча 3 на 3 (prototypes/shot/assets/hero.glb, «Мбаппе») + чеканка из общей модели:
    // скелеты одинаковые (Mixamo), у записи убираем приставку «mixamorig:» и смещение таза. Нет файла — общая модель.
    let p = null, hasJ = false;
    const jug = THREE.AnimationClip.findByName(g.animations, 'juggle');
    try {
      const hg = await (heroG || (heroG = new Promise((ok, bad) => new THREE.GLTFLoader().load('prototypes/shot/assets/hero.glb', ok, undefined, bad))));
      p = THREE.SkeletonUtils.clone(hg.scene); p.scale.setScalar(1.95); // стопы на газоне; как HERO.scale в матче (prototypes/shot/shot.js)
      p.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      const mixer = new THREE.AnimationMixer(p); p.userData.mixer = mixer;
      // 23.11: чеканка коленями — две записи со скелета матча (левое колено, правое колено) по очереди;
      // мяч летит по дуге от одного касания к следующему (точки касаний считаются по позе в момент удара)
      const A = await (heroA || (heroA = fetch('assets3d/hero_anims.json?v=3').then((r) => r.json())));
      const seg = [['kneeing_soccerball', 0.58, 'LeftUpLeg'], ['kneeing_soccerball_2', 0.32, 'RightUpLeg']].map(([n, hit, bone]) => { const cl = THREE.AnimationClip.parse(A[n]); const a = mixer.clipAction(cl); a.play(); a.enabled = false; return { a, dur: cl.duration, hit, bone }; });
      p.userData.seg = seg; hasJ = true;
    } catch (e) { p = null; }
    if (!p) { p = PlayerKit.make(g, PlayerKit.forCard(c), 'stand'); hasJ = !!jug; PlayerKit.play(p, hasJ ? 'juggle' : 'idle', { fade: 0, loop: true }); }
    p.rotation.y = 0.35; if (p.userData.lift) p.position.y = p.userData.lift; scene.add(p);
    // мяч: над той ногой, что выше; отскок — по высоте ноги
    const ball = Arena3D.ball ? Arena3D.ball('classic', 0.11) : new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    if (hasJ) scene.add(ball);
    // точки касаний: колено (кость голени) в момент удара, мяч — чуть выше бедра и вперёд
    const v = new THREE.Vector3(), seg = p.userData.seg || null, hits = [];
    let cyc = 0;
    if (seg) { let t0 = 0; seg.forEach((sg) => { seg.forEach((o) => { o.a.enabled = o === sg; }); sg.a.time = sg.hit; p.userData.mixer.update(0); p.updateMatrixWorld(true);
        const kn = p.getObjectByName(sg.bone.replace('UpLeg', 'Leg')); kn.getWorldPosition(v); hits.push({ t: t0 + sg.hit, p: v.clone().add(new THREE.Vector3(0, 0.13, 0.08)) }); t0 += sg.dur; }); cyc = t0; }
    // тень
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.005; scene.add(sh);
    host.appendChild(renderer.domElement); host.classList.add('on3d');
    let T = 0;
    let last = performance.now(), by = 0.5, vy = 0, lw = 0, lh = 0;
    cur = { host, renderer, scene, cam, p, ball, key: c.key, raf: 0 };
    const frame = (now) => {
      cur.raf = requestAnimationFrame(frame);
      const h = cur.host;
      if (!h.isConnected || document.hidden || now - last < 32) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (seg) { // какая запись сейчас и её время; мяч — по дуге между касаниями
        T = (T + dt) % cyc; let t0 = 0; for (const sg of seg) { if (T < t0 + sg.dur || sg === seg[seg.length - 1]) { seg.forEach((o) => { o.a.enabled = o === sg; }); sg.a.time = T - t0; break; } t0 += sg.dur; }
        p.userData.mixer.update(0);
        let i = hits.findIndex((x) => x.t > T); const nx = i < 0 ? { t: hits[0].t + cyc, p: hits[0].p } : hits[i], pv = i <= 0 ? { t: hits[hits.length - 1].t - (i < 0 ? 0 : cyc), p: hits[hits.length - 1].p } : hits[i - 1];
        const k = (T - pv.t) / (nx.t - pv.t), D = nx.t - pv.t;
        ball.position.lerpVectors(pv.p, nx.p, k); ball.position.y += 2.6 * D * D * k * (1 - k); ball.rotation.x += dt * 8;
      } else p.userData.mixer.update(dt);
      const W = h.clientWidth || 140, H = h.clientHeight || 200;
      if (W !== lw || H !== lh) { renderer.setSize(W, H, false); lw = W; lh = H; cam.aspect = W / H; cam.updateProjectionMatrix(); }
      cam.position.set(0, 1.05, 4.6); cam.lookAt(0, 0.95, 0);
      renderer.render(scene, cam);
    };
    cur.raf = requestAnimationFrame(frame);
  }
  return { mount, stop };
})();
