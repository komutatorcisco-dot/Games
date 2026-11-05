// Открытие паков: объёмный пак (та же модель, что в ИПК) на CSS 3D — без WebGL, плавно и на слабых телефонах.
// Нажатия «прокачивают» пак до итоговой редкости, потом он рвётся, лучшая карточка выходит крупно (как walkout в FUT),
// затем все карточки раскладываются сеткой. Карточки записываются в коллекцию в момент вскрытия — закрыть раньше нельзя потерять.
'use strict';

const PackOpen = (() => {
  const LV = [
    { k: 'common', name: 'ОБЫЧНЫЙ', short: 'Обычный', css: '#7fe0a0', w: 62, prize: [5, 15] },
    { k: 'super', name: 'СВЕРХРЕДКИЙ', short: 'Сверхредкий', css: '#56d4ff', w: 25, prize: [15, 30] },
    { k: 'epic', name: 'ЭПИЧЕСКИЙ', short: 'Эпический', css: '#b98bff', w: 10, prize: [30, 60] },
    { k: 'legend', name: 'ЛЕГЕНДАРНЫЙ', short: 'Легендарный', css: '#f2cb5c', w: 2.5, prize: [60, 120] },
    { k: 'jackson', name: 'ДЖЕКСОН!!', short: 'Джексон!!', css: '#ff4f66', w: 0.5, prize: [200, 300] },
  ];
  const ORDER = ['bronze', 'silver', 'gold', 'legend', 'jack', 'future', 'forgotten', 'jg', 'ps', 'psp'];
  const RCOL = { bronze: '#e0a070', silver: '#dfe5ee', gold: '#ffcf3a', legend: '#d6a6ff', jack: '#ff4f66', future: '#68f5ef', forgotten: '#c77dff', jg: '#c6ff3d', ps: '#7fd8ff', psp: '#ffd23c' };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, k, o) => (el && el.animate && !reduce ? el.animate(k, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
  const rollLevel = () => { let x = Math.random() * LV.reduce((s, l) => s + l.w, 0), i = 0; while ((x -= LV[i].w) > 0 && i < LV.length - 1) i++; return i; };

  // модель пака: лицо с голограммой и обжимом, торец, задник; cap — верхняя полоска, которую срывают
  // рисунок пака по редкости (img/packs/pk*.webp); объём нарисован на самой картинке
  const PIMG = ['pk-silver', 'pk-blue', 'pk-purple', 'pk-gold', 'pk-black'];
  // паки-мячи (4.11): 3D-рендер, tools/art/packforms.html (renderBall), node tools/art/render.js balls
  const pimg = (lv, sz) => `img/packs/pk${lv}-${sz === 'xxl' || sz === 'xl' ? 360 : 160}.webp?v=b2`;
  const art = (lv, sz = '', cap = false) => `<span class="fpk p${lv} ${sz} pimg"><span class="fpk-b">
      <i class="fpk-f" style="-webkit-mask-image:url(${pimg(lv, sz)});mask-image:url(${pimg(lv, sz)})"><img class="fpk-img" src="${pimg(lv, sz)}" alt="" decoding="async" draggable="false"><i class="fpk-sh"></i><em>${LV[lv].short}</em>${cap ? '<i class="po-cap"></i>' : ''}</i>
      <i class="fpk-s"></i><i class="fpk-k"></i></span></span>`;

  const best = (res) => res.slice().sort((a, b) => ORDER.indexOf(b.c.rar) - ORDER.indexOf(a.c.rar) || b.c.r - a.c.r);

  // ---------- общий слой ----------
  function layer(cls = '') {
    const el = document.createElement('div');
    el.className = 'po ' + cls;
    // 3.11: за паком — огромное название контуром и световая черта (как в макете 5), логотип канала; сверху — шкала редкости (макет 4)
    el.innerHTML = `<div class="po-bg"><i class="po-rays"></i></div><b class="po-ghost" aria-hidden="true"></b><i class="po-streak"></i><img class="po-logo" src="img/brand/logo-white.png" alt=""><div class="po-flash"></div>
      <header class="po-top"><small class="po-k"></small><b class="po-name"></b><span class="po-steps"></span></header>
      <main class="po-stage"></main>
      <footer class="po-foot"><p class="po-hint"></p><div class="po-sum"></div><button class="btn gold po-take" hidden>Забрать</button></footer>
      <button class="po-x" aria-label="Закрыть">✕</button>`;
    document.body.appendChild(el); Cover.on();
    requestAnimationFrame(() => el.classList.add('in'));
    return el;
  }
  const flash = (el, strong) => { const f = $('.po-flash', el); f.classList.remove('go', 'go2'); void f.offsetWidth; f.classList.add(strong ? 'go2' : 'go'); };
  const setCol = (el, col) => el.style.setProperty('--rc', col);

  // ---------- карточки: крупный выход лучшей, потом сетка ----------
  async function showCards(el, res, { onDone, take = 'Забрать', coins = 0 } = {}) {
    const list = best(res);
    if (!list.length) { onDone && onDone(); return; }
    const stage = $('.po-stage', el), top = list[0];
    if (ORDER.indexOf(top.c.rar) >= ORDER.indexOf('gold')) prepMan();   // модель для выхода игрока — пока идут флаг и клуб
    // 1) лучшая карточка выходит крупно
    el.dataset.phase = 'walk';
    setCol(el, RCOL[top.c.rar]);
    $('.po-k', el).textContent = top.isNew ? 'Новая карточка' : 'Повтор';
    const nm = $('.po-name', el); nm.textContent = Cards.RAR[top.c.rar].n; nm.classList.toggle('long', nm.textContent.length > 13); slam(nm);
    $('.po-steps', el).innerHTML = '';
    const big = Math.min(240, Math.floor(innerWidth * 0.4), Math.floor((innerHeight - 70) / 1.55)); // лёжа карточка влезает по высоте
    stage.innerHTML = `<div class="po-walk"><div class="po-flip" style="--w:${big}px"><div class="po-back ${top.c.rar}"><b>ДЖ</b></div><div class="po-front">${Cards.html(top.c, { w: big })}</div></div>
      <div class="po-tag ${top.isNew ? 'new' : ''}">${top.isNew ? 'NEW' : `+${top.coins} <i class="coin"></i>`}</div></div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(stage);
    const face = $('.cc-face', stage);
    if (face) {
      face.loading = 'eager'; face.decoding = 'async';
      if (face.decode) await Promise.race([face.decode().catch(() => {}), wait(250)]);
    }
    const flip = $('.po-flip', stage), special = top.c.rar === 'legend' || top.c.rar === 'jack' || top.c.rar === 'future' || top.c.rar === 'forgotten';
    // выход как в FC: золото и выше — сначала страна, позиция, клуб, потом карточка
    if (ORDER.indexOf(top.c.rar) >= ORDER.indexOf('gold') || ['jg', 'ps', 'psp'].includes(top.c.rar)) { await walkIntro(el, top.c, special); await walkMan(el, top.c, special); }
    // подъём и прозрачность — у обёртки, поворот — у самой карточки: так 3D не сплющивается
    const dur = special ? 1500 : 1000;
    anim($('.po-walk', stage), [{ transform: 'translateY(60vh) scale(.4)', opacity: 0 }, { transform: 'translateY(-4vh) scale(1.08)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim(flip, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)', offset: 0.75 }, { transform: 'rotateY(540deg)' }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    if (reduce) flip.style.transform = 'rotateY(180deg)';
    Sound.play('kick');
    await wait(special ? 1250 : 800);
    flash(el, special); haptic(special ? 'ok' : 'pop');
    Sound.play(special ? 'goal' : top.c.rar === 'gold' ? 'coin' : 'token');
    // Вспышка и звук отмечают редкость без десятков дополнительных частиц.
    $('.po-tag', stage).classList.add('on');
    const hint = $('.po-hint', el); hint.textContent = list.length > 1 ? `Нажми, чтобы увидеть все ${list.length}` : 'Нажми, чтобы продолжить';
    await tapOnce(el);
    hint.textContent = '';
    if (list.length === 1) return finish(el, list, { onDone, take, coins });
    // 2) все карточки сеткой
    el.dataset.phase = 'grid';
    setCol(el, RCOL[top.c.rar]);
    const n = list.length, land = innerWidth > innerHeight; // лёжа — шире ряд, карточки по высоте экрана
    const cols = land ? Math.min(n, n <= 6 ? Math.max(3, n) : Math.ceil(n / 2)) : n <= 3 ? 3 : n <= 8 || innerWidth < 420 ? 4 : 5;
    const W = Math.min(land ? 900 : 480, innerWidth) - 32;
    let w = Math.floor((W - (cols - 1) * 8) / cols);
    // лёжа: по высоте свободного места между заголовком и кнопкой (не всего экрана) — иначе карточки обрезаются
    // сверху и снизу; 1.5 — высота карточки к ширине, +22 — метка NEW/+монеты под карточкой
    if (land) { const free = Math.max(120, stage.clientHeight || innerHeight - 190), rows = Math.ceil(n / cols); w = Math.max(48, Math.min(w, 150, Math.floor((free - 12 - (rows - 1) * 10) / rows / 1.5) - 16)); }
    const nNew = list.filter((x) => x.isNew).length;
    $('.po-k', el).textContent = `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;
    nm.textContent = nNew ? `НОВЫХ: ${nNew}` : 'НОВЫХ НЕТ'; nm.classList.remove('long'); slam(nm);
    hint.textContent = n > 8 ? 'Листай список, чтобы увидеть все карточки' : '';
    stage.innerHTML = `<div class="po-grid" style="--cols:${cols};--cw:${w}px">${list.map((x, i) => `<div class="po-cell ${x.c.rar}" style="--i:${i}">
        ${Cards.html(x.c, { w })}
        ${x.isNew ? '<i class="po-new">NEW</i>' : `<i class="po-dup">+${x.coins}</i>`}</div>`).join('')}</div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(stage);
    // Одна короткая анимация сетки вместо двух 3D-анимаций на каждую карту.
    const grid = $('.po-grid', stage);
    const entry = anim(grid, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'ease-out' });
    const skip = () => { if (entry) entry.finish(); };
    el.addEventListener('pointerdown', skip, { once: true });
    if (entry) await entry.finished.catch(() => {});
    el.removeEventListener('pointerdown', skip);
    if (entry) entry.cancel();
    return finish(el, list, { onDone, take, coins });
  }
  // три удара перед карточкой: флаг, позиция, эмблема клуба (нажатие пропускает)
  async function walkIntro(el, c, special) {
    if (reduce) return;
    const box = document.createElement('div'); box.className = 'po-wi'; el.appendChild(box);
    let skip = false; const sk = () => { skip = true; }; el.addEventListener('pointerdown', sk);
    const cr = Cards.crestOf ? Cards.crestOf(c) : '';
    const beats = [
      `<span class="po-wi-flag">${esc(c.flag || '🏳️')}</span><b>${esc(c.nat || '')}</b>`,
      `<span class="po-wi-pos">${esc(c.pos || '')}</span><b>Позиция</b>`,
      cr ? `<img class="po-wi-crest" src="${esc(cr)}" alt=""><b>${esc(c.club || c.series || '')}</b>` : `<span class="po-wi-pos">${c.r}</span><b>${esc(c.club || c.series || 'Рейтинг')}</b>`,
    ];
    for (const html of beats) {
      if (skip) break;
      box.innerHTML = `<div class="po-wi-beat">${html}</div>`;
      flash(el, false); Sound.play('kick'); haptic('tap');
      await wait(special ? 900 : 700);
    }
    el.removeEventListener('pointerdown', sk);
    box.remove();
  }
  // ---------- выход 3D-игрока (assets3d/player.glb, PlayerKit) ----------
  // После флага, позиции и клуба: игрок в форме своего клуба выбегает из глубины к камере и встаёт, потом карточка.
  // Модель грузится заранее (prepMan), не успела или нет WebGL — шаг пропускается, выход идёт как раньше.
  let manReady = null;
  function prepMan() {
    if (manReady || reduce || typeof PlayerKit === 'undefined' || typeof Arena3D === 'undefined' || !Arena3D.supported()) return manReady;
    manReady = Arena3D.three().then(() => PlayerKit.load()).catch(() => { manReady = null; return null; });
    return manReady;
  }
  async function walkMan(el, c, special) {
    if (c.model3d || c.walkout) return;   // у героев (Балотелли) свой выход и своя модель
    const ready = prepMan(); if (!ready) return;
    const g = await Promise.race([ready, wait(1500).then(() => null)]); if (!g) return;
    const box = document.createElement('div'); box.className = 'po-wi po-man'; el.appendChild(box);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { box.remove(); return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });   // размер — по слою, каждый кадр
    let lw = 0, lh = 0;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    box.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 2, 0.1, 60);
    const rim = new THREE.Color(RCOL[c.rar] || '#ffffff');
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x203020, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.2); key.position.set(2, 4, 5); scene.add(key);
    const back = new THREE.DirectionalLight(rim, 1.6); back.position.set(-1, 3, -4); scene.add(back);
    // пятно света под ногами в цвет редкости
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128; const gx = glowC.getContext('2d'), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowC), color: rim, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.01; scene.add(spot);
    // бег — анимация Mixamo «jog» (есть в модели с 28.10), в старой модели — два кадра run/run2
    const p = PlayerKit.make(g, PlayerKit.forCard(c), 'stand'); scene.add(p);
    const has = (n) => !!THREE.AnimationClip.findByName(g.animations, n), live = has('jog');
    if (live) PlayerKit.play(p, 'jog', { fade: 0, speed: 1.35 });
    let last = performance.now();
    let skip = false; const sk = () => { skip = true; }; el.addEventListener('pointerdown', sk);
    flash(el, false); Sound.play('kick');
    const RUN = special ? 1300 : 1000, HOLD = special ? 900 : 700, t0 = performance.now();
    await new Promise((done) => {
      const frame = (now) => {
        const t = now - t0, k = Math.min(1, t / RUN), e = 1 - Math.pow(1 - k, 2.2);
        p.userData.mixer.update(Math.min(0.05, (now - last) / 1000)); last = now;
        if (t < RUN && !skip) {
          if (!live) PlayerKit.play(p, Math.floor(t / 150) % 2 ? 'run2' : 'run', { fade: 0 });
          p.position.set(0, live ? 0 : Math.abs(Math.sin(t / 150 * Math.PI)) * 0.06, -9 + 9 * e);
          cam.position.set(0.5, 1.3 - 0.15 * e, 5.8); cam.lookAt(0, 1.15, -1.5 + 1.5 * e);
        } else {
          if (!p.userData.stood) { p.userData.stood = true; PlayerKit.play(p, 'stand', { fade: live ? 0.3 : 0 }); p.position.set(0, 0, 0); haptic(special ? 'ok' : 'pop'); }
          const h = Math.min(1, (t - RUN) / 600);
          cam.position.set(0.5 - 0.3 * h, 1.15, 5.8 - 0.8 * h); cam.lookAt(0, 1.15, 0);   // во весь рост, голова ниже заголовка
          if (skip || t > RUN + HOLD) { done(); return; }
        }
        const w = box.clientWidth || innerWidth, h = box.clientHeight || innerHeight;
        if (w !== lw || h !== lh) { renderer.setSize(w, h, false); lw = w; lh = h; }
        cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix();
        renderer.render(scene, cam);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    el.removeEventListener('pointerdown', sk);
    anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }); await wait(200);
    PlayerKit.dispose(p); spot.geometry.dispose(); spot.material.map.dispose(); spot.material.dispose();
    renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();   // у телефона мало WebGL-контекстов
    box.remove();
  }

  // купленный пак: сначала сам пак крупно, нажатие — тряска и разрыв, потом карточки
  async function packIntro(el, lv, name) {
    const stage = $('.po-stage', el);
    el.dataset.phase = 'pack'; setCol(el, LV[lv].css);
    $('.po-k', el).textContent = 'Твой пак'; const nm = $('.po-name', el); nm.textContent = name || LV[lv].name; nm.classList.toggle('long', nm.textContent.length > 13); slam(nm);
    stage.innerHTML = `<div class="po-pack" data-lv="${lv}">${art(lv, 'xxl')}</div>`;
    const packEl = $('.po-pack', stage), hint = $('.po-hint', el);
    anim(packEl, [{ transform: 'translateY(50vh) rotateX(40deg) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,1,.3,1)' });
    hint.textContent = 'Нажми на пак, чтобы открыть';
    await tapOnce(el);
    hint.textContent = '';
    await crack(el, packEl);
    await wait(700);
  }
  // мяч-пак (4.11): тряска с разгорающимися трещинами, потом мяч разлетается на куски со вспышкой
  async function crack(el, packEl) {
    packEl.classList.add('charge'); Sound.play('kick'); haptic('tap');
    await wait(330); haptic('tap'); await wait(330); haptic('pop'); await wait(300);
    const b = $('.fpk-b', packEl), f = $('.fpk-f', packEl), im = $('.fpk-img', packEl);
    const box = document.createElement('i'); box.className = 'po-shards'; b.appendChild(box);
    const W = b.offsetWidth, N = reduce ? 0 : 10, a0 = Math.random() * 6.28;
    for (let i = 0; i < N; i++) {
      const a1 = a0 + (i / N) * 6.283, a2 = a0 + ((i + 1) / N) * 6.283, pt = (a) => `${50 + Math.cos(a) * 95}% ${60 + Math.sin(a) * 60}%`;
      const sh = document.createElement('img'); sh.src = im.src; sh.alt = ''; sh.style.clipPath = `polygon(50% 60%, ${pt(a1)}, ${pt((a1 + a2) / 2)}, ${pt(a2)})`; box.appendChild(sh);
      const m = (a1 + a2) / 2, d = W * (0.9 + Math.random() * 0.8);
      anim(sh, [{ transform: 'none', opacity: 1 }, { transform: `translate(${Math.cos(m) * d}px, ${Math.sin(m) * d + W * 0.5}px) rotate(${(Math.random() - 0.5) * 260}deg) scale(.7)`, opacity: 0 }],
        { duration: 780 + Math.random() * 300, easing: 'cubic-bezier(.15,.75,.35,1)', fill: 'forwards' });
    }
    packEl.classList.remove('charge'); packEl.classList.add('burst'); f.style.visibility = 'hidden';
    flash(el, true); Sound.play('goal'); haptic('ok');
    if (typeof FX !== 'undefined') { const r = f.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height * 0.6, 26, true); }
  }
  // мяч-дроп (5.11): одна награда — монеты, лаймовые очки, очки пропуска или пак — крупно, с лучами и всплеском
  async function showPrize(el, p, onDone) {
    const stage = $('.po-stage', el), K = typeof Eco !== 'undefined' && Eco.on() ? Eco.K() : 1, F = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    el.dataset.phase = 'prize'; el.classList.add('prize');
    const [art, big, sub, col] = p.coins ? [`<span class="pz-coins">${'<i class="coin"></i>'.repeat(5)}</span>`, `+${F(p.coins * K)}`, 'монет', '#ffd23c']
      : p.lime ? ['<i class="lime pz-lime"></i>', `+${F(p.lime)}`, 'лаймовых очков прокачки', '#c6ff3d']
      : p.xp ? ['<span class="pz-xp">★</span>', `+${p.xp}`, 'очков пропуска', '#7fd8ff']
      : [`<img class="pz-pk" src="img/packs/pk${p.pack}-360.webp?v=b2" alt="">`, LV[p.pack].name, 'откроется следом', LV[p.pack].css];
    setCol(el, col);
    $('.po-k', el).textContent = 'Мяч-дроп'; const nm = $('.po-name', el); nm.textContent = sub.toUpperCase(); nm.classList.remove('long'); slam(nm);
    stage.innerHTML = `<div class="po-prize"><i class="pz-rays"></i><span class="pz-art">${art}</span><b class="pz-n">${esc(big)}</b><small>${esc(sub)}</small></div>`;
    anim($('.pz-art', stage), [{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1.25) rotate(8deg)', opacity: 1, offset: 0.6 }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,1.3,.4,1)' });
    anim($('.pz-n', stage), [{ transform: 'translateY(30px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: 250, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'backwards' });
    flash(el, true); Sound.play(p.coins ? 'coin' : 'goal'); haptic('ok');
    if (typeof FX !== 'undefined') setTimeout(() => { const a = $('.pz-art', stage); if (a) { const r = a.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, 20, true); } }, 350);
    await wait(500);
    finish(el, [], { onDone, take: 'Забрать', coins: 0 });
  }
  function finish(el, list, { onDone, take, coins }) {
    const dup = list.reduce((s, x) => s + x.coins, 0);
    el.dataset.phase = 'done';
    $('.po-sum', el).innerHTML = [dup ? `<span>Повторы <b>+${dup}</b> <i class="coin"></i></span>` : '', coins ? `<span>В паке <b>+${coins}</b> <i class="coin"></i></span>` : ''].join('');
    const b = $('.po-take', el); b.textContent = take; b.hidden = false;
    anim(b, [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1,.3,1)' });
    b.onclick = () => { close(el); onDone && onDone(); };
  }
  const slam = (nm) => { nm.classList.remove('slam'); void nm.offsetWidth; nm.classList.add('slam'); const el = nm.closest('.po'), g = el && $('.po-ghost', el); if (g) { g.textContent = nm.textContent; g.style.setProperty('--n', Math.max(6, nm.textContent.length)); g.classList.remove('slam'); void g.offsetWidth; g.classList.add('slam'); } };
  const tapOnce = (el) => new Promise((r) => { const f = (e) => { if (e.target.closest('.po-x')) return; el.removeEventListener('pointerup', f); r(); }; setTimeout(() => el.addEventListener('pointerup', f), 250); });
  function close(el) { if (el.classList.contains('out')) return; Cover.off(); el.classList.add('out'); setTimeout(() => el.remove(), 320); }

  // ---------- сам пак ----------
  // contents(level) → { coins, cards:[keys] }; commit(got) записывает награду и возвращает [{c,isNew,coins}]
  async function drop({ gift = false, title = '', minLevel = 0, contents, commit, onStart, onTake, onDone, label = '', single = false, angry = false } = {}) {
    const final = Math.max(minLevel, typeof window.__packLv === 'number' ? window.__packLv : rollLevel());
    PIMG.forEach((_, i) => { if (i >= minLevel && i <= final) new Image().src = pimg(i, 'xxl'); }); // смена редкости без мигания
    const got = contents ? contents(final) : { coins: 0, cards: [] };
    const el = layer('pack');
    let level = minLevel, started = false, busy = false, opened = false;
    setCol(el, LV[level].css);
    el.dataset.phase = 'pack';
    $('.po-k', el).textContent = title || (gift ? 'Подарок · пак дня' : 'Пак дня');
    $('.po-name', el).textContent = LV[level].name; $('.po-ghost', el).textContent = LV[level].name; el.classList.add('meter');
    $('.po-steps', el).innerHTML = LV.map((l, i) => `<i style="--c:${l.css}" class="${i <= level ? 'on' : ''}"></i>`).join('');
    const stage = $('.po-stage', el);
    stage.innerHTML = `<div class="po-pack" data-lv="${level}">${art(level, 'xxl')}</div>`;
    const hint = $('.po-hint', el); hint.textContent = single ? 'Жми на мяч — редкость может вырасти' : 'Жми на пак — редкость может вырасти';
    const packEl = $('.po-pack', stage);
    const AIMG = 'img/packs/angry-360.webp?v=a1';
    if (angry) { el.classList.add('angry'); const im = $('.fpk-img', packEl); im.src = AIMG; im.parentNode.style.webkitMaskImage = im.parentNode.style.maskImage = `url(${AIMG})`; }
    anim(packEl, [{ transform: 'translateY(50vh) rotateX(40deg) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,1,.3,1)' });
    $('.po-x', el).onclick = () => { if (!started) close(el); };

    function setLevel(lv) {
      level = lv;
      setCol(el, LV[lv].css);
      const f = $('.fpk', packEl); f.className = f.className.replace(/\bp\d\b/, 'p' + lv); $('.fpk-f em', packEl).textContent = LV[lv].short; const im = $('.fpk-img', packEl); if (im && !angry) { im.src = pimg(lv, 'xxl'); im.parentNode.style.webkitMaskImage = im.parentNode.style.maskImage = `url(${pimg(lv, 'xxl')})`; }
      const nm = $('.po-name', el); nm.textContent = LV[lv].name; slam(nm);
      $$('.po-steps i', el).forEach((s, i) => s.classList.toggle('on', i <= lv));
      el.classList.toggle('jackson', lv === 4);
    }
    async function tap() {
      if (busy || opened) return;
      busy = true;
      if (!started) { started = true; $('.po-x', el).hidden = true; onStart && onStart(); }
      Sound.play('kick'); haptic('tap');
      if (level < final) {
        anim($('.fpk-b', packEl), [{ transform: 'none' }, { transform: 'translateY(-34px) rotate(-200deg) scale(.9)', offset: 0.45 }, { transform: 'translateY(4px) rotate(-360deg) scale(1.08, .9)', offset: 0.8 }, { transform: 'rotate(-360deg)' }], { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)' });
        await wait(300);
        setLevel(level + 1); flash(el, level >= 3);
        Sound.play(level === 4 ? 'whistle' : level >= 3 ? 'goal' : 'coin'); haptic(level >= 3 ? 'ok' : 'pop');
        if (level === 4 && typeof confetti === 'function') confetti();
        await wait(380);
        hint.textContent = level < 4 ? (single ? 'Жми ещё — мяч может стать лучше' : 'Жми ещё — пак может стать лучше') : 'Нажми, чтобы открыть';
        busy = false;
        return;
      }
      opened = true; hint.textContent = '';
      // тряска с трещинами, мяч разлетается, вспышка
      await crack(el, packEl);
      const res = commit ? commit(got) : [];
      await wait(700);
      const done = () => { onTake && onTake(got); onDone && onDone(got); };
      if (single && !res.length && got.prize) return showPrize(el, got.prize, done);
      await showCards(el, res, { coins: got.coins, take: 'Забрать', onDone: done });
    }
    stage.addEventListener('pointerup', (e) => { if (el.dataset.phase === 'pack') tap(); });
    $('.po-hint', el).addEventListener('pointerup', () => { if (el.dataset.phase === 'pack') tap(); });
    return { final };
  }

  // ---------- злой мяч (5.11): отдельная система, как стардропы — своя лестница редкостей, мяч и экран в цвет редкости ----------
  // prize(lv) → награда; commit(p) → результат карточек (как у мяч-дропа)
  const AR = [{ n: 'Редкий', c: '#3fd94a', h: 120 }, { n: 'Сверхредкий', c: '#2f8cff', h: 215 }, { n: 'Эпический', c: '#b14bff', h: 285 },
    { n: 'Мифический', c: '#ff3b3b', h: 0 }, { n: 'Легендарный', c: '#ffd23c', h: 48 }];
  const AW = [50, 28, 14, 6, 2];
  async function angry({ title = 'Злой мяч', prize, commit, onStart, onDone } = {}) {
    let x = Math.random() * AW.reduce((a, b) => a + b, 0), final = 0; while ((x -= AW[final]) > 0 && final < 4) final++;
    if (typeof window.__angryLv === 'number') final = window.__angryLv;
    const el = layer('pack angry2'); let level = 0, busy = false, opened = false, started = false;
    el.dataset.phase = 'pack';
    const stage = $('.po-stage', el);
    stage.innerHTML = `<div class="po-pack" data-lv="0">${art(0, 'xxl')}</div>`;
    const packEl = $('.po-pack', stage), im = $('.fpk-img', packEl), AIMG = 'img/packs/angry-360.webp?v=a1';
    im.src = AIMG; im.parentNode.style.webkitMaskImage = im.parentNode.style.maskImage = `url(${AIMG})`;
    $('.po-k', el).textContent = title; el.classList.add('meter');
    $('.po-steps', el).innerHTML = AR.map((a, i) => `<i style="--c:${a.c}" class="${i <= 0 ? 'on' : ''}"></i>`).join('');
    const paint = () => { const a = AR[level]; setCol(el, a.c); el.style.setProperty('--ah', a.h + 'deg'); const nm = $('.po-name', el); nm.textContent = a.n; slam(nm);
      el.querySelectorAll('.po-steps i').forEach((st, i) => st.classList.toggle('on', i <= level)); };
    paint();
    anim(packEl, [{ transform: 'translateY(50vh) scale(.5) rotate(-30deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,1,.3,1)' });
    $('.po-x', el).onclick = () => { if (!started) close(el); };
    async function tap() {
      if (busy || opened) return; busy = true;
      if (!started) { started = true; $('.po-x', el).hidden = true; onStart && onStart(); }
      Sound.play('kick'); haptic('tap');
      if (level < final) {
        anim($('.fpk-b', packEl), [{ transform: 'none' }, { transform: 'translateY(-40px) rotate(-200deg) scale(.9)', offset: 0.45 }, { transform: 'translateY(4px) rotate(-360deg) scale(1.1, .88)', offset: 0.8 }, { transform: 'rotate(-360deg)' }], { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)' });
        await wait(300); level++; paint(); flash(el, level >= 3);
        Sound.play(level >= 3 ? 'goal' : 'coin'); haptic(level >= 3 ? 'ok' : 'pop');
        if (level === 4 && typeof confetti === 'function') confetti();
        await wait(380); busy = false; return;
      }
      opened = true;
      await crack(el, packEl);
      const p = prize(level), res = commit ? commit(p) : [];
      await wait(700);
      if (res.length) return showCards(el, res, { take: 'Забрать', onDone });
      showPrize(el, p, onDone);
    }
    stage.addEventListener('pointerup', () => { if (el.dataset.phase === 'pack') tap(); });
  }

  // одиночные награды (покупка, ИПК, дорога трофеев): сразу выход карточки
  // opts.pack — уровень купленного пака: тогда сначала открываем сам пак
  async function reveal(res, onDone, opts = {}) {
    if (!res || !res.length) { onDone && onDone(); return; }
    const el = layer('cards');
    $('.po-x', el).hidden = true;
    if (typeof opts.pack === 'number') await packIntro(el, Math.max(0, Math.min(4, opts.pack)), opts.name);
    showCards(el, res, { onDone, take: res.length > 1 ? 'В коллекцию' : 'Отлично' });
  }

  return { LV, art, drop, reveal, rollLevel, angry, AR };
})();
