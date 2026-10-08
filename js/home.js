// Главный экран в духе Brawl Stars: одна выбранная игра и большая кнопка «Играть», по бокам — «Игрок дня» и пак,
// внизу — путь к следующему открытию. Игры и разделы открываются за трофеи (Release.UNLOCKS).
'use strict';

const Home = (() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, k, o) => (el && el.animate && !reduce ? el.animate(k, o) : null);
  const DUO = ['act:auction-duo', 'act:ttt-duo', 'act:guess-duel', 'act:career-duel', 'act:pick-duo'];
  const FEAT = { 'feat:cards': { title: 'Паки и Галерея', sub: 'Карточки футболистов: собирай клубы и лиги', ui: 'pack' }, 'feat:pass': { title: 'Пропуск и задания', sub: 'Задания дня и награды сезона', ui: 'star' } };
  const UI = () => Store.d.ui || (Store.d.ui = {});

  // каталог игр: берём плитки, которые уже есть в разметке (у них правильные data-act / data-ng)
  let cat = null;
  function catalog() {
    if (cat) return cat;
    const keyOf = (el) => (el.dataset.ng ? 'ng:' + el.dataset.ng : el.dataset.pz ? 'pz:' + el.dataset.pz : el.dataset.act ? 'act:' + el.dataset.act : '');
    const map = new Map();
    $$('#hub :is(.tile-card, .game-card, .auction-hero, .runner-hero), #featured .tile-card').forEach((el) => {
      const k = keyOf(el); if (!k || map.has(k) || !Release.known(k)) return;
      const ico = (($('[data-ico]', el) || {}).dataset || {}).ico || '';
      const title = (($(':scope > b, .card-body h2, b', el) || {}).textContent || '').trim();
      const sub = (($(':scope > small, .card-body p, small', el) || {}).textContent || '').trim();
      const st = el.getAttribute('style') || '';
      map.set(k, { key: k, data: { ...el.dataset }, ico, title, sub, c1: (st.match(/--c1:\s*([^;]+)/) || [])[1] || '#4fc3ff', c2: (st.match(/--c2:\s*([^;]+)/) || [])[1] || '#2f6fe4' });
    });
    // драфт и ИПК — свои экраны
    map.set('act:xdraft', { key: 'act:xdraft', data: { act: 'xdraft' }, ico: 'ng-draft', title: 'Драфт', sub: 'Собери состав и сыграй матч', c1: '#34c46a', c2: '#2f6fe4' });
    map.set('act:sbc', { key: 'act:sbc', data: { act: 'sbc' }, ico: 'ng-draft', title: 'ИПК', sub: 'Сдавай карточки, получай паки', c1: '#5fe0d0', c2: '#5a46c8' });
    cat = map;
    return map;
  }
  const order = () => Release.UNLOCKS.flatMap((u) => u[2]);
  const games = () => { const c = catalog(); return order().filter((k) => c.has(k)).map((k) => c.get(k)); };
  const open = (g) => Release.isOut(g.key);
  const icon = (g) => (g.ui ? Ui.get(g.ui) : (typeof Icons !== 'undefined' && Icons.get(g.ico)) || '');
  const attrs = (d) => Object.entries(d).map(([a, v]) => `data-${a.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${esc(v)}"`).join(' ');

  function selected() {
    const list = games().filter((g) => open(g) && !DUO.includes(g.key));
    // по умолчанию — аукцион: самая любимая игра канала
    return list.find((g) => g.key === UI().sel) || list.find((g) => g.key === 'act:auction-bot') || list[0] || null;
  }

  // ---------- экран ----------
  function render() {
    const panel = $('#panel-home'); if (!panel) return;
    let box = $('#home2');
    if (!box) { box = document.createElement('div'); box.id = 'home2'; panel.prepend(box); document.body.classList.add('home2'); }
    const g = selected(), t = Release.trophies(), nx = Release.next(), cur = Release.current();
    const from = cur ? cur.at : 0, pct = nx ? Math.max(0, Math.min(100, ((t - from) / (nx.need - from)) * 100)) : 100;
    const nxIco = nx ? (FEAT[nx.keys[0]] ? Ui.get(FEAT[nx.keys[0]].ui) : icon(catalog().get(nx.keys[0]) || {})) : Ui.get('crown');
    const dly = Store.d.dly || {}, dlyDone = dly.done && dly.day === (typeof Daily !== 'undefined' && Daily.dayKey ? Daily.dayKey() : dly.day);
    const cards = Release.feature('cards'), pend = (Rewards.S().pending || 0), packReady = cards && typeof Wheel !== 'undefined' && Wheel.ready();
    box.innerHTML = `
      <button class="h2-road" data-act="road">
        <span class="h2-tro">${Ui.get('trophy')}<b>${t}</b></span>
        <span class="h2-bar"><i style="width:${pct}%"></i><small>${nx ? `${t} / ${nx.need}` : 'Всё открыто'}</small></span>
        <span class="h2-ni" title="${nx ? esc(nx.title) : ''}">${nxIco}${nx ? `<em>${Ui.get('lock')}</em>` : ''}</span>
      </button>
      ${typeof Rewards !== 'undefined' && Rewards.weekend() ? `<div class="h2-ev">${Ui.get('bolt')} Выходные: ×2 трофея за игры</div>` : ''}
      <div class="h2-arena">
        <img class="h2-bg" src="img/bg/stadium.svg?v=2" alt="" aria-hidden="true">
        <div class="h2-side l">
          <button class="h2-sb ${dlyDone ? 'done' : 'hot'}" data-act="dly"><span class="h2-sbi dly"><img src="img/players/239085.webp" alt=""><i>?</i></span><b>Игрок дня</b></button>
          ${cards ? `<button class="h2-sb sq" data-act="squad"><span class="h2-sbi">${Ui.get('shirt')}</span><b>Состав</b></button>` : ''}
        </div>
        <div class="h2-side r">
          ${cards ? `<button class="h2-sb ${packReady ? 'hot' : 'done'}" data-act="wheel"><span class="h2-sbi">${PackOpen.art(packReady ? 1 : 0, 'rs')}</span><b>${packReady ? 'Пак дня' : 'Завтра'}</b></button>` : ''}
          ${Release.isOut('ng:duel') ? `<button class="h2-sb on" data-act="online"><span class="h2-sbi">${Ui.get('swords')}</span><b>Онлайн</b></button>` : ''}
          ${cards && pend ? `<button class="h2-sb hot cnt" data-act="rw-packs"><span class="h2-sbi">${PackOpen.art(0, 'rs')}<em>${pend}</em></span><b>За победы</b></button>` : ''}
        </div>
        ${g ? `<button class="h2-game" data-h2="pick" style="--c1:${g.c1};--c2:${g.c2}" aria-label="Сменить игру">
          <span class="h2-stage"><span class="h2-pitch"><i></i><b class="h2-goal l"></b><b class="h2-goal r"></b><u class="h2-flag a"></u><u class="h2-flag b"></u><u class="h2-flag c"></u><u class="h2-flag d"></u></span><span class="h2-ped"></span><span class="h2-shadow"></span><span class="h2-hex"><span class="h2-hex-in">${icon(g)}</span></span></span>
          <span class="h2-ban"><b>${esc(g.title.split(':')[0])}</b></span></button>` : ''}
      </div>
      ${g ? `<div class="h2-cta"><button class="h2-play" ${attrs(g.data)}><span>ИГРАТЬ</span></button>
        <button class="h2-all" data-h2="pick"><span>${Ui.get('gamepad')}</span><b>Игры</b></button></div>` : ''}`;
    if (typeof Icons !== 'undefined') Icons.fill(box);
    fit();
    island(); wall();
    if (typeof Coach !== 'undefined') later(() => Coach.maybe(), 1800);
    later(checkUnlocks, 500);
  }
  // фон главной: наклонная стена из карточек твоей коллекции; чего ещё нет — рубашка «ДЖ». Медленно едет по диагонали
  let wallSig = '';
  function wall() {
    if (typeof Cards === 'undefined') return;
    let el = $('#h2-wall');
    if (!el) { el = document.createElement('div'); el.id = 'h2-wall'; el.setAttribute('aria-hidden', 'true'); document.body.prepend(el); }
    const mine = Cards.all().filter((c) => Cards.owned(c.key)).sort((a, b) => b.r - a.r).slice(0, 48);
    const sig = mine.map((c) => c.key).join('|'); if (sig === wallSig && el.firstChild) return; wallSig = sig;
    // узор повторяется каждые 8 рядов — поэтому стена едет бесконечно без рывка
    const COLS = 8, PER = COLS * 8, rar = ['gold', 'silver', 'bronze'];
    let k = 0; const cell = (i) => {
      // своих карточек мало — больше рубашек; много — рубашка только изредка
      const back = !mine.length || (mine.length < 12 ? i % 3 !== 0 : i % 7 === 3);
      if (back) return `<div class="h2w-b ${rar[(i * 7) % 3]}"><b>ДЖ</b></div>`;
      return Cards.html(mine[k++ % mine.length], { w: 84 });
    };
    const tile = Array.from({ length: PER }, (_, i) => cell(i)).join('');
    el.innerHTML = `<div class="h2w-in">${tile}${tile}</div><i class="h2w-dim"></i>`;
  }
  // 3D стадион-остров вместо нарисованного: грузится после старта, нет WebGL — остаётся рисунок
  let islandAt = 0;
  function island() {
    return; // стадион под игрой убран по просьбе: на главной только значок игры
    const ar = $('#home2 .h2-arena'); if (!ar || typeof Arena3D === 'undefined' || !Arena3D.supported() || UI().no3d) return;
    // нарисованное поле сразу прячем — без подмены одного стадиона другим; 3D проявляется плавно, когда готово
    ar.classList.add('h2-3d-wait');
    const go = () => { const a = $('#home2 .h2-arena'); if (a) Arena3D.menu(a).then((v) => { if (!a.isConnected) return; if (v) { a.classList.add('h2-3d'); requestAnimationFrame(() => a.classList.add('h2-3d-in')); } else a.classList.remove('h2-3d-wait'); }).catch(() => a.classList.remove('h2-3d-wait')); };
    go();
  }
  // главный экран целиком в один экран: от шапки до нижнего меню, без прокрутки
  function fit() {
    const box = $('#home2'); if (!box) return;
    const on = Screens.current === 'hub';
    document.body.classList.toggle('at-home', on);
    if (!on || !box.offsetParent) return;
    // высоту считает CSS от живой высоты окна Telegram (--tg-viewport-height); здесь — только отступы сверху и снизу
    const tb = $('#tabbar'), top = box.getBoundingClientRect().top + scrollY;
    const r = tb && !tb.hidden ? tb.getBoundingClientRect() : null, under = r && r.height ? Math.max(0, innerHeight - r.top) : 0;
    box.style.removeProperty('height');
    document.documentElement.style.setProperty('--h2-off', Math.round(top + under + 8) + 'px');
  }

  // ---------- выбор игры ----------
  function pick() {
    // открытые игры и только три следующих закрытых — без стены замков
    let locked = 0;
    const all = games().filter((g) => open(g) || (!DUO.includes(g.key) && locked++ < 3)), solo = all.filter((g) => !DUO.includes(g.key)), duo = all.filter((g) => DUO.includes(g.key) && open(g));
    const t = Release.trophies(), sel = (selected() || {}).key;
    const cell = (g) => {
      const on = open(g), need = Release.need(g.key);
      return `<button class="h2-pc ${on ? '' : 'lock'} ${g.key === sel ? 'sel' : ''}" ${on ? `data-sel="${esc(g.key)}"` : ''} style="--c1:${g.c1};--c2:${g.c2}">
        <span class="h2-pci">${icon(g)}</span><b>${esc(g.title)}</b>${on ? '' : `<small>${Ui.get('lock')} ${Ui.get('trophy')} ${need}</small>`}</button>`;
    };
    const el = document.createElement('div');
    el.className = 'sx-sheet-wrap h2-sheet';
    el.innerHTML = `<div class="sx-sheet"><div class="sx-grab"></div><div class="sx-sh"><b>Выбери игру</b><button class="sx-x" data-sh="close" aria-label="Закрыть">✕</button></div>
      <div class="h2-pl"><div class="h2-pg">${solo.map(cell).join('')}</div>
      ${duo.length ? `<h4 class="h2-ph">${Ui.get('users')} С другом</h4><div class="h2-pg">${duo.map(cell).join('')}</div>` : ''}
      <p class="h2-pn">У тебя ${t} ${Ui.get('trophy')}. Побеждай — откроются новые игры.</p></div></div>`;
    document.body.appendChild(el);
    if (typeof Icons !== 'undefined') Icons.fill(el);
    anim($('.sx-sheet', el), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1)' });
    $$('.h2-pc', el).forEach((c, i) => anim(c, [{ transform: 'translateY(24px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: 100 + i * 25, easing: 'cubic-bezier(.2,1.1,.4,1)', fill: 'backwards' }));
    const close = () => { const a = anim($('.sx-sheet', el), [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }); el.classList.add('out'); if (a) a.onfinish = () => el.remove(); else el.remove(); };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-sh="close"]')) return close();
      const s = e.target.closest('[data-sel]');
      if (s) {
        const k = s.dataset.sel;
        Sound.play('tap'); haptic('tap');
        if (DUO.includes(k)) { close(); const g = catalog().get(k); const b = document.createElement('button'); Object.assign(b.dataset, g.data); b.hidden = true; $('#home2').appendChild(b); b.click(); b.remove(); return; }
        UI().sel = k; Store.save(); close(); render();
        anim($('#home2 .h2-hex-in'), [{ transform: 'rotateY(-180deg) scale(.6)' }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,1.2,.4,1)' });
        return;
      }
      if (e.target.closest('.h2-pc.lock')) { toast('Открывается за трофеи — побеждай в играх'); haptic('bad'); }
    });
  }

  // ---------- праздник открытия ----------
  let showing = false;
  function checkUnlocks() {
    if (showing || Screens.current !== 'hub' || Modal.isOpen || $('.po') || $('.h2-un')) return;
    const ui = UI(), t = Release.trophies();
    if (typeof ui.unl !== 'number') { ui.unl = t; Store.save(); return; } // старые игроки: без лавины праздников
    const fresh = Release.UNLOCKS.filter((u) => u[0] > ui.unl && u[0] <= t);
    if (!fresh.length) return;
    const u = fresh[0];
    ui.unl = u[0]; Store.save();
    celebrate(u);
  }
  function celebrate(u) {
    showing = true;
    const k = u[2][0], f = FEAT[k], g = f ? { ...f, key: k } : catalog().get(k) || { title: u[1], sub: '', c1: '#ffcf3a', c2: '#ff8a2a' };
    const el = document.createElement('div');
    el.className = 'h2-un';
    el.style.setProperty('--c1', g.c1 || '#ffcf3a'); el.style.setProperty('--c2', g.c2 || '#ff8a2a');
    el.innerHTML = `<div class="h2-un-bg"><i></i></div>
      <small class="h2-un-k">${f ? 'Новый раздел' : 'Новая игра'} · ${u[0]} ${Ui.get('trophy')}</small>
      <div class="h2-un-card"><div class="h2-un-flip"><div class="h2-un-back">${Ui.get('lock')}</div><div class="h2-un-front"><span class="h2-hex big"><span class="h2-hex-in">${icon(g)}</span></span></div></div></div>
      <b class="h2-un-t">${esc(u[1])}</b><p class="h2-un-s">${esc(g.sub || '')}</p>
      <button class="btn gold h2-un-go">${f ? 'Круто!' : 'Играть'}</button>`;
    document.body.appendChild(el);
    if (typeof Icons !== 'undefined') Icons.fill(el);
    Sound.play('whistle'); haptic('ok');
    const flip = $('.h2-un-flip', el);
    anim($('.h2-un-card', el), [{ transform: 'translateY(40vh) scale(.3)', opacity: 0 }, { transform: 'translateY(-3vh) scale(1.1)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 900, easing: 'cubic-bezier(.2,.9,.3,1)' });
    anim(flip, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(180deg)', offset: 0.55 }, { transform: 'rotateY(540deg)' }], { duration: 1400, delay: 300, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    if (reduce) flip.style.transform = 'rotateY(180deg)';
    setTimeout(() => { Sound.play('goal'); if (typeof confetti === 'function') confetti(); }, 1300);
    $$('.h2-un-t, .h2-un-s, .h2-un-go', el).forEach((x, i) => anim(x, [{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: 1300 + i * 120, easing: 'ease-out', fill: 'backwards' }));
    $('.h2-un-go', el).addEventListener('click', () => {
      if (!f && catalog().has(k) && !DUO.includes(k)) { UI().sel = k; Store.save(); }
      el.classList.add('out'); setTimeout(() => { el.remove(); showing = false; render(); }, 300);
    });
  }

  function bind() {
    // значок пака дня в профиле — та же модель пака
    const pk = $('.pf-pk2'); if (pk && typeof PackOpen !== 'undefined') pk.innerHTML = PackOpen.art(1, 'rs');
    document.addEventListener('click', (e) => {
      if (e.target.closest('#home2 [data-h2="pick"]')) { Sound.play('tap'); haptic('tap'); pick(); }
      const p = e.target.closest('#home2 .h2-play');
      if (p) { anim(p, [{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 220 }); }
    }, true);
    addEventListener('resize', () => requestAnimationFrame(fit));
    try { if (TG && TG.onEvent) TG.onEvent('viewportChanged', () => requestAnimationFrame(fit)); } catch (e) { /* не в Telegram */ }
    // при уходе с главной снимаем «без прокрутки»
    const show = Screens.show;
    Screens.show = function (id) { const r = show.apply(this, arguments); requestAnimationFrame(fit); if (id !== 'hub') document.body.classList.remove('at-home'); return r; };
  }

  return { render, bind, checkUnlocks, catalog, fit };
})();
