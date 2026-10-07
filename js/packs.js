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
  const ORDER = ['bronze', 'silver', 'gold', 'legend', 'jack'];
  const RCOL = { bronze: '#e0a070', silver: '#dfe5ee', gold: '#ffcf3a', legend: '#d6a6ff', jack: '#ff4f66' };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, k, o) => (el && el.animate && !reduce ? el.animate(k, o) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
  const rollLevel = () => { let x = Math.random() * LV.reduce((s, l) => s + l.w, 0), i = 0; while ((x -= LV[i].w) > 0 && i < LV.length - 1) i++; return i; };

  // модель пака: лицо с голограммой и обжимом, торец, задник; cap — верхняя полоска, которую срывают
  const art = (lv, sz = '', cap = false) => `<span class="fpk p${lv} ${sz}"><span class="fpk-b">
      <i class="fpk-f"><i class="fpk-holo"></i><i class="fpk-sh"></i><i class="fpk-crest"></i><b>JX</b><em>${LV[lv].short}</em>${cap ? '<i class="po-cap"></i>' : ''}</i>
      <i class="fpk-s"></i><i class="fpk-k"></i></span></span>`;

  const best = (res) => res.slice().sort((a, b) => ORDER.indexOf(b.c.rar) - ORDER.indexOf(a.c.rar) || b.c.r - a.c.r);
  // заранее грузим лица, чтобы карточка не появлялась пустой
  const preload = (res) => res.slice(0, 12).forEach((x) => { const m = Cards.html(x.c, { w: 100 }).match(/src="([^"]+)"/); if (m) { const i = new Image(); i.src = m[1]; } });

  // ---------- общий слой ----------
  function layer(cls = '') {
    const el = document.createElement('div');
    el.className = 'po ' + cls;
    el.innerHTML = `<div class="po-bg"><i class="po-rays"></i><i class="po-floor"></i></div><div class="po-flash"></div>
      <header class="po-top"><small class="po-k"></small><b class="po-name"></b><span class="po-steps"></span></header>
      <main class="po-stage"></main>
      <footer class="po-foot"><p class="po-hint"></p><div class="po-sum"></div><button class="btn gold po-take" hidden>Забрать</button></footer>
      <button class="po-x" aria-label="Закрыть">✕</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    return el;
  }
  const flash = (el, strong) => { const f = $('.po-flash', el); f.classList.remove('go', 'go2'); void f.offsetWidth; f.classList.add(strong ? 'go2' : 'go'); };
  const setCol = (el, col) => el.style.setProperty('--rc', col);

  // ---------- карточки: крупный выход лучшей, потом сетка ----------
  async function showCards(el, res, { onDone, take = 'Забрать', coins = 0 } = {}) {
    const list = best(res);
    if (!list.length) { onDone && onDone(); return; }
    preload(list);
    const stage = $('.po-stage', el), top = list[0];
    // 1) лучшая карточка выходит крупно
    el.dataset.phase = 'walk';
    setCol(el, RCOL[top.c.rar]);
    $('.po-k', el).textContent = top.isNew ? 'Новая карточка' : 'Повтор';
    const nm = $('.po-name', el); nm.textContent = Cards.RAR[top.c.rar].n; slam(nm);
    $('.po-steps', el).innerHTML = '';
    const big = Math.min(240, Math.floor(innerWidth * 0.6));
    stage.innerHTML = `<div class="po-walk"><div class="po-flip" style="--w:${big}px"><div class="po-back ${top.c.rar}"><b>JX</b></div><div class="po-front">${Cards.html(top.c, { w: big })}</div></div>
      <div class="po-tag ${top.isNew ? 'new' : ''}">${top.isNew ? 'NEW' : `+${top.coins} <i class="coin"></i>`}</div></div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(stage);
    const flip = $('.po-flip', stage), special = top.c.rar === 'legend' || top.c.rar === 'jack';
    // подъём и прозрачность — у обёртки, поворот — у самой карточки: так 3D не сплющивается
    const dur = special ? 1500 : 1000;
    anim($('.po-walk', stage), [{ transform: 'translateY(60vh) scale(.4)', opacity: 0 }, { transform: 'translateY(-4vh) scale(1.08)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim(flip, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)', offset: 0.75 }, { transform: 'rotateY(540deg)' }], { duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    if (reduce) flip.style.transform = 'rotateY(180deg)';
    Sound.play('kick');
    await wait(special ? 1250 : 800);
    flash(el, special); haptic(special ? 'ok' : 'pop');
    Sound.play(special ? 'goal' : top.c.rar === 'gold' ? 'coin' : 'token');
    if (special && typeof confetti === 'function') confetti();
    $('.po-tag', stage).classList.add('on');
    const hint = $('.po-hint', el); hint.textContent = list.length > 1 ? `Нажми, чтобы увидеть все ${list.length}` : 'Нажми, чтобы продолжить';
    await tapOnce(el);
    hint.textContent = '';
    if (list.length === 1) return finish(el, list, { onDone, take, coins });
    // 2) все карточки сеткой
    el.dataset.phase = 'grid';
    setCol(el, RCOL[top.c.rar]);
    const n = list.length, cols = n <= 3 ? 3 : n <= 8 ? 4 : 5;
    const W = Math.min(480, innerWidth) - 32, w = Math.floor((W - (cols - 1) * 8) / cols);
    const nNew = list.filter((x) => x.isNew).length;
    $('.po-k', el).textContent = `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;
    nm.textContent = nNew ? `НОВЫХ: ${nNew}` : 'НОВЫХ НЕТ'; slam(nm);
    stage.innerHTML = `<div class="po-grid" style="--cols:${cols};--cw:${w}px">${list.map((x, i) => `<div class="po-cell ${x.c.rar}" style="--i:${i}">
        <div class="po-flip sm" style="--w:${w}px"><div class="po-back ${x.c.rar}"><b>JX</b></div><div class="po-front">${Cards.html(x.c, { w })}</div></div>
        ${x.isNew ? '<i class="po-new">NEW</i>' : `<i class="po-dup">+${x.coins}</i>`}</div>`).join('')}</div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(stage);
    const cells = $$('.po-cell', stage), step = Math.max(28, Math.min(90, 1400 / n));
    let skip = false;
    const onSkip = () => { skip = true; };
    el.addEventListener('pointerdown', onSkip, { once: true });
    cells.forEach((c, i) => {
      const f = $('.po-flip', c);
      anim(c, [{ transform: 'translateY(40vh) scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: i * step, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
      anim(f, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 420, delay: i * step + 260, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    });
    const tick = setInterval(() => Sound.play('token'), Math.max(70, step * 2));
    for (let t = 0; t < n * step + 700 && !skip; t += 50) await wait(50);
    clearInterval(tick);
    if (skip) el.getAnimations({ subtree: true }).forEach((a) => { try { a.finish(); } catch (e) { /* уже */ } });
    el.removeEventListener('pointerdown', onSkip);
    return finish(el, list, { onDone, take, coins });
  }
  function finish(el, list, { onDone, take, coins }) {
    const dup = list.reduce((s, x) => s + x.coins, 0);
    el.dataset.phase = 'done';
    $('.po-sum', el).innerHTML = [dup ? `<span>Повторы <b>+${dup}</b> <i class="coin"></i></span>` : '', coins ? `<span>В паке <b>+${coins}</b> <i class="coin"></i></span>` : ''].join('');
    const b = $('.po-take', el); b.textContent = take; b.hidden = false;
    anim(b, [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1,.3,1)' });
    b.onclick = () => { close(el); onDone && onDone(); };
  }
  const slam = (nm) => { nm.classList.remove('slam'); void nm.offsetWidth; nm.classList.add('slam'); };
  const tapOnce = (el) => new Promise((r) => { const f = (e) => { if (e.target.closest('.po-x')) return; el.removeEventListener('pointerup', f); r(); }; setTimeout(() => el.addEventListener('pointerup', f), 250); });
  function close(el) { el.classList.add('out'); setTimeout(() => el.remove(), 320); }

  // ---------- сам пак ----------
  // contents(level) → { coins, cards:[keys] }; commit(got) записывает награду и возвращает [{c,isNew,coins}]
  async function drop({ gift = false, title = '', minLevel = 0, contents, commit, onStart, onTake, onDone, label = '' } = {}) {
    const final = Math.max(minLevel, typeof window.__packLv === 'number' ? window.__packLv : rollLevel());
    const got = contents ? contents(final) : { coins: 0, cards: [] };
    const el = layer('pack');
    let level = minLevel, started = false, busy = false, opened = false;
    setCol(el, LV[level].css);
    el.dataset.phase = 'pack';
    $('.po-k', el).textContent = title || (gift ? 'Подарок · пак дня' : 'Пак дня');
    $('.po-name', el).textContent = LV[level].name;
    $('.po-steps', el).innerHTML = LV.map((l, i) => `<i style="--c:${l.css}" class="${i <= level ? 'on' : ''}"></i>`).join('');
    const stage = $('.po-stage', el);
    stage.innerHTML = `<div class="po-pack" data-lv="${level}">${art(level, 'xxl', true)}<i class="po-slit"></i></div>`;
    const hint = $('.po-hint', el); hint.textContent = 'Нажми на пак';
    const packEl = $('.po-pack', stage);
    anim(packEl, [{ transform: 'translateY(50vh) rotateX(40deg) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,1,.3,1)' });
    $('.po-x', el).onclick = () => { if (!started) close(el); };

    function setLevel(lv) {
      level = lv;
      setCol(el, LV[lv].css);
      const f = $('.fpk', packEl); f.className = f.className.replace(/\bp\d\b/, 'p' + lv); $('.fpk-f em', packEl).textContent = LV[lv].short;
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
        anim($('.fpk-b', packEl), [{ transform: 'rotateY(-18deg) scale(1)' }, { transform: 'rotateY(160deg) scale(.86) translateY(-30px)', offset: 0.45 }, { transform: 'rotateY(342deg) scale(1)' }], { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)' });
        await wait(300);
        setLevel(level + 1); flash(el, level >= 3);
        Sound.play(level === 4 ? 'whistle' : level >= 3 ? 'goal' : 'coin'); haptic(level >= 3 ? 'ok' : 'pop');
        if (level === 4 && typeof confetti === 'function') confetti();
        await wait(380);
        hint.textContent = level < 4 ? 'Жми ещё — пак может стать лучше' : 'Нажми, чтобы открыть';
        busy = false;
        return;
      }
      opened = true; hint.textContent = '';
      // тряска, срыв полоски, вспышка
      packEl.classList.add('shake');
      await wait(650);
      packEl.classList.remove('shake'); packEl.classList.add('torn');
      flash(el, true); Sound.play('kick'); haptic('ok');
      const res = commit ? commit(got) : [];
      await wait(520);
      anim(packEl, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(45vh) scale(.8) rotateX(30deg)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' });
      await wait(380);
      await showCards(el, res, { coins: got.coins, take: 'Забрать', onDone: () => { onTake && onTake(got); onDone && onDone(got); } });
    }
    stage.addEventListener('pointerup', (e) => { if (el.dataset.phase === 'pack') tap(); });
    $('.po-hint', el).addEventListener('pointerup', () => { if (el.dataset.phase === 'pack') tap(); });
    return { final };
  }

  // одиночные награды (покупка, ИПК, дорога трофеев): сразу выход карточки
  function reveal(res, onDone) {
    if (!res || !res.length) { onDone && onDone(); return; }
    const el = layer('cards');
    $('.po-x', el).hidden = true;
    showCards(el, res, { onDone, take: res.length > 1 ? 'В коллекцию' : 'Отлично' });
  }

  return { LV, art, drop, reveal, rollLevel };
})();
