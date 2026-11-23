// Звезда команды в 3D на главной (23.11): игрок в форме своего клуба (PlayerKit, assets3d/player.glb) чеканит мяч.
// Отдельный маленький WebGL-холст в .hm-star; ~30 кадров, пауза, когда главная скрыта. Нет WebGL/модели — остаётся карточка.
'use strict';

const Hero3D = (() => {
  let cur = null; // { host, renderer, scene, cam, p, ball, raf, key }
  const ok = () => typeof PlayerKit !== 'undefined' && typeof Arena3D !== 'undefined' && Arena3D.supported() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop() {
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    try { PlayerKit.dispose(cur.p); cur.renderer.dispose(); if (cur.renderer.forceContextLoss) cur.renderer.forceContextLoss(); } catch (e) { /* ок */ }
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
    const p = PlayerKit.make(g, PlayerKit.forCard(c), 'stand'); p.rotation.y = 0.35; scene.add(p);
    const hasJ = !!THREE.AnimationClip.findByName(g.animations, 'juggle');
    PlayerKit.play(p, hasJ ? 'juggle' : 'idle', { fade: 0, loop: true });
    // мяч: над той ногой, что выше; отскок — по высоте ноги
    const ball = Arena3D.ball ? Arena3D.ball('classic', 0.11) : new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    if (hasJ) scene.add(ball);
    const feet = []; p.traverse((o) => { if (o.isBone && /(Right|Left)(Foot|ToeBase)$/i.test(o.name) && /Toe/i.test(o.name)) feet.push(o); });
    if (!feet.length) p.traverse((o) => { if (o.isBone && /Foot$/i.test(o.name)) feet.push(o); });
    // тень
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.005; scene.add(sh);
    host.appendChild(renderer.domElement); host.classList.add('on3d');
    const v = new THREE.Vector3(), w2 = new THREE.Vector3();
    let last = performance.now(), by = 0.5, vy = 0, lw = 0, lh = 0;
    cur = { host, renderer, scene, cam, p, ball, key: c.key, raf: 0 };
    const frame = (now) => {
      cur.raf = requestAnimationFrame(frame);
      const h = cur.host;
      if (!h.isConnected || document.hidden || now - last < 32) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      p.userData.mixer.update(dt);
      if (hasJ && feet.length) { // мяч падает и отскакивает от ноги, когда она его «догоняет»
        p.updateMatrixWorld(true);
        let top = null; feet.forEach((f) => { f.getWorldPosition(v); if (!top || v.y > top.y) top = v.clone(); });
        vy -= 9.8 * dt; by += vy * dt;
        if (by < top.y + 0.12 && vy < 0) { by = top.y + 0.12; vy = 3.4; }
        w2.set(top.x, by, top.z + 0.05); ball.position.lerp(w2, 0.6); ball.position.y = by; ball.rotation.x += dt * 6;
      }
      const W = h.clientWidth || 140, H = h.clientHeight || 200;
      if (W !== lw || H !== lh) { renderer.setSize(W, H, false); lw = W; lh = H; cam.aspect = W / H; cam.updateProjectionMatrix(); }
      cam.position.set(0, 1.05, 4.6); cam.lookAt(0, 0.95, 0);
      renderer.render(scene, cam);
    };
    cur.raf = requestAnimationFrame(frame);
  }
  return { mount, stop };
})();
