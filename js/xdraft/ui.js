// «Драфт» — экран: система химии → схема → капитан → по одному из пяти на каждую позицию (11 + 7 на скамейке) →
// перестановки → итог → матч против бота. Логика и расчёты — в engine.js (XD), здесь только экран и сохранение.
// Сохранение: Store.d.xd = { cur: попытка, best: { classic, new }, match }. Подборки хранятся сразу при создании,
// поэтому перезапуск не перебрасывает кандидатов, а открытая позиция всегда показывает ту же пятёрку.
'use strict';

const XDraft = (() => {
  const SYS = { classic: 'Классическая химия', new: 'Новая химия' };
  let POOL = null, BY = null, sel = null, pick = null;
  // анимации: что перелетает после следующей отрисовки, прошлые значения химии и связей — чтобы анимировать только изменения
  let capFrom = null, fx = null, prevChem = {}, prevLinks = {}, prevTotal = null, entering = false;
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, kf, o) => (el && el.animate && !RM ? el.animate(kf, o) : null);
  const slotEl = (zone, i) => $(`#xd-body .fu[data-z="${zone}"][data-i="${i}"]`);
  const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
  // FLIP: элемент «прилетает» из старого прямоугольника в новый, с дугой и 3D-поворотом
  function flyFrom(el, from, { spin = 0, lift = 40, dur = 700 } = {}) {
    if (!el || !from) return;
    const to = el.getBoundingClientRect(), k = to.width / (el.offsetWidth || 1) || 1;
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / k, dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / k, sc = from.width / to.width;
    anim(el, [
      { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotateY(0deg)`, zIndex: 50 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${(sc + 1) / 2 + 0.15}) rotateY(${spin / 2}deg)`, offset: 0.5 },
      { transform: 'translate(0, 0) scale(1) rotateY(' + spin + 'deg)' },
    ], { duration: dur, easing: 'cubic-bezier(.3,.8,.3,1)' });
  }
  function postFx(a, c) {
    if (fx && fx.type === 'place') {
      const el = slotEl(fx.zone, fx.i); flyFrom(el, fx.from, { spin: 360, lift: 60, dur: 760 });
      setTimeout(() => { if (el) { el.classList.add('land'); setTimeout(() => el.classList.remove('land'), 700); } }, 700);
    } else if (fx && fx.type === 'swap') {
      flyFrom(slotEl(fx.b.zone, fx.b.i), fx.a.rect, { lift: 50, dur: 560 });
      flyFrom(slotEl(fx.a.zone, fx.a.i), fx.b.rect, { lift: -30, dur: 560 });
    }
    fx = null;
    // первый показ поля: карточки «падают» на свои места по очереди
    if (entering) {
      $$('#xd-body .xd-pitch .xd-slot .fu, #xd-body .xd-brow .fu').forEach((el, k) => anim(el, [{ transform: 'translateY(-40px) rotateX(75deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 40 * k, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' }));
      $$('#xd-body .xd-links line').forEach((l, k) => anim(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 500, delay: 300 + 20 * k, fill: 'backwards' }));
      entering = false;
    } else {
      // связи, у которых сменился цвет, прорисовываются заново
      $$('#xd-body .xd-links line[data-k]').forEach((l) => { if (prevLinks[l.dataset.k] !== l.getAttribute('class')) anim(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, easing: 'ease-out' }); });
      // химия игрока изменилась — значок подпрыгивает
      $$('#xd-body .fu-ch[data-chem]').forEach((b) => { const k = b.dataset.chem, v = b.textContent || b.querySelectorAll('.on').length; if (prevChem[k] !== undefined && prevChem[k] !== String(v)) anim(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.6) rotate(-8deg)', filter: 'brightness(1.6)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.2,1.6,.4,1)' }); });
    }
    prevChem = {}; $$('#xd-body .fu-ch[data-chem]').forEach((b) => { prevChem[b.dataset.chem] = String(b.textContent || b.querySelectorAll('.on').length); });
    prevLinks = {}; $$('#xd-body .xd-links line[data-k]').forEach((l) => { prevLinks[l.dataset.k] = l.getAttribute('class'); });
    // число химии в шапке докручивается
    const cb = $('#xd-body .xd-ct');
    if (cb && prevTotal !== null && prevTotal !== c.total && typeof countUp === 'function') countUp(cb, c.total, { from: prevTotal, dur: 600, fmt: (v) => v });
    prevTotal = c.total;
  }

  // ---------- данные ----------
  const loadPos = () => new Promise((ok, bad) => {
    if (typeof FC_POS !== 'undefined') return ok();
    const s = document.createElement('script'); s.src = 'js/data/fcpos.js?v=1'; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
  });
  function pool() {
    if (POOL) return POOL;
    // в драфт — только игроки с фото: серые силуэты в пятёрках выглядят как баг
    const withFace = PLAYERS.filter((p) => FC_STATS[p.name] && FC_POS[p.name] && FACES[p.name]);
    POOL = (withFace.length > 1200 ? withFace : PLAYERS.filter((p) => FC_STATS[p.name] && FC_POS[p.name])).map((p) => ({
      name: p.name, r: FC_STATS[p.name][0], st: FC_STATS[p.name].slice(1, 7), pos: PlayerPositions.get(p.name, p.pos),
      club: p.club, lg: p.lg, nat: p.nat, flag: p.flag, face: FACES[p.name] || null,
    }));
    BY = Object.fromEntries(POOL.map((p) => [p.name, p]));
    return POOL;
  }
  const P = (name) => (name ? (pool(), BY[name]) || null : null);
  const S = () => { const d = Store.d; if (!d.xd) d.xd = { cur: null, best: {}, match: null }; if (!d.xd.best) d.xd.best = {}; return d.xd; };
  // старые попытки: скамейка была на 7 — добавляем 5 мест резерва
  const A = () => { const a = S().cur; if (a && Array.isArray(a.bench) && a.bench.length < XD.BENCH) a.bench = a.bench.concat(Array(XD.BENCH - a.bench.length).fill(null)); return a; };
  const save = () => Store.save();
  const xiOf = (a) => a.xi.map(P);
  const benchOf = (a) => a.bench.map(P);
  const filled = (a) => a.xi.filter(Boolean).length + a.bench.filter(Boolean).length;

  // ---------- новая попытка ----------
  function fresh() {
    S().tour = null;
    S().cur = { id: Date.now(), stage: 'sys', sys: null, forms: null, form: null, capt: null, captPick: null, xi: Array(11).fill(null), bench: Array(XD.BENCH).fill(null), offers: {} };
    S().match = null; save();
  }
  function chooseSys(sys) {
    const a = A(); if (a.stage !== 'sys') return;
    const all = Object.keys(XD.FORMATIONS), out = [];
    while (out.length < 5) { const f = all[Math.floor(Math.random() * all.length)]; if (!out.includes(f)) out.push(f); }
    Object.assign(a, { sys, forms: out, stage: 'form' }); save(); render();
  }
  function chooseForm(f) {
    const a = A(); if (a.stage !== 'form' || !a.forms.includes(f)) return;
    a.form = f; a.stage = 'capt';
    a.capt = XD.captains({ pool: pool(), form: f, sys: a.sys, rnd: Math.random }).map((p) => p.name);
    save(); render(); openPick('capt');
  }

  // ---------- подборки ----------
  const keyOf = (zone, i) => (zone === 'xi' ? 'x' : 'b') + i;
  function offerFor(zone, i) {
    const a = A(), k = keyOf(zone, i);
    if (!a.offers[k]) {
      const team = [...xiOf(a), ...benchOf(a)];
      const slotPos = zone === 'xi' ? XD.FORMATIONS[a.form].slots[i].pos : null;
      a.offers[k] = XD.offer({ pool: pool(), team, slotPos, sys: a.sys, rnd: Math.random, bench: zone !== 'xi' }).map((p) => p.name);
      save();
    }
    return a.offers[k].map(P).filter(Boolean);
  }
  // что будет с рейтингом и химией, если взять этого игрока
  function preview(zone, i, p) {
    const a = A(), xi = xiOf(a);
    const before = { r: XD.teamRating(xi), c: XD.chem(a.sys, a.form, xi).total };
    const nx = xi.slice(); if (zone === 'xi') nx[i] = p;
    return { before, after: { r: XD.teamRating(nx), c: XD.chem(a.sys, a.form, nx).total } };
  }

  // ---------- экран выбора из пяти ----------
  function openPick(what, i) {
    if ($('#xd-pick')) return; // уже открыт — второе нажатие не плодит экраны
    const a = A();
    let list, pos = null;
    if (what === 'capt') list = a.capt.map(P).filter(Boolean);
    else { list = offerFor(what, i); pos = what === 'xi' ? XD.FORMATIONS[a.form].slots[i].pos : null; }
    pick = { zone: what, i, list, chosen: 0 };
    const el = document.createElement('div');
    el.className = 'xp'; el.id = 'xd-pick';
    const title = what === 'capt' ? 'Капитан' : pos ? XD.RU[pos] : 'Запас';
    el.innerHTML = `<div class="xp-top"><span class="xp-pos">${title}</span><b>${what === 'capt' ? 'Выбери капитана' : 'Выбери игрока'}</b><button class="xp-x" aria-label="Закрыть">✕</button></div>
      <div class="xp-row5">${list.map((p, k) => `<div class="xp-c ${k === 0 ? 'on' : ''}" data-k="${k}" role="button" tabindex="0">${mini(p, { slotPos: pos, idx: k, zone: 'pick', sys: a.sys })}</div>`).join('')}</div>
      <div class="xp-big"></div>
      <div class="xp-foot"><div class="xp-sum"></div><button class="btn gold xp-ok">Взять</button></div>`;
    document.body.appendChild(el);
    const cards = $$('.xp-c', el);
    const ST = ['СКР', 'УДР', 'ПАС', 'ДРБ', 'ЗАЩ', 'ФИЗ'], STG = ['ПРЫ', 'РУК', 'ВЫБ', 'РЕА', 'СКР', 'ПОЗ'];
    // как в FUT: пять карточек в ряд, выбранная — крупно под ними с характеристиками
    function sync() {
      if (!pick) return;
      const p = list[pick.chosen]; if (!p) return;
      cards.forEach((c, k) => c.classList.toggle('on', k === pick.chosen));
      const names = p.pos[0] === 'GK' ? STG : ST;
      $('.xp-big', el).innerHTML = `<div class="xp-bc">${mini(p, { slotPos: pos, idx: pick.chosen, zone: 'pick', sys: a.sys, big: true })}</div>
        <div class="xp-info"><b>${esc(p.name)}</b><small>${esc(p.club)} · ${esc(p.lg || '')}</small>
          <div class="xp-st">${(p.st || []).map((v, k) => `<span><b class="${v >= 80 ? 'hi' : v >= 65 ? 'mid' : 'lo'}">${v}</b>${names[k]}</span>`).join('')}</div>
          <small class="xp-pos">Позиции: ${p.pos.map((q) => XD.RU[q]).join(', ')}</small>${what === 'xi' ? chemDelta(i, p) : ''}</div>`;
      anim($('.xp-bc', el), [{ transform: 'rotateY(70deg) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
      $('.xp-ok', el).textContent = `Взять ${surname(p.name)}`;
      if (what !== 'capt') { const pv = preview(what, i, p); $('.xp-sum', el).innerHTML = `<span>Рейтинг <b>${pv.before.r || '—'} → ${pv.after.r}</b></span><span>Химия <b>${pv.before.c} → ${pv.after.c}</b></span>`; }
    }
    requestAnimationFrame(() => {
      el.classList.add('in'); sync();
      cards.forEach((c, k) => anim(c, [{ transform: 'translateY(60px) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 60 * k, easing: 'cubic-bezier(.2,1.1,.3,1)', fill: 'backwards' }));
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.xp-x')) return closePick();
      const c = e.target.closest('.xp-c');
      if (c && !c.closest('.xp-big')) { const k = +c.dataset.k; if (k === pick.chosen) return confirmPick(); pick.chosen = k; sync(); Sound.play('tap'); haptic('tap'); return; }
      if (e.target.closest('.xp-ok')) confirmPick();
    });
  }
  // под карточкой: на сколько вырастет химия команды
  function chemDelta(i, p) {
    const pv = preview('xi', i, p), d = pv.after.c - pv.before.c;
    return `<span class="xp-d ${d > 0 ? 'up' : ''}">${d > 0 ? '+' + d : d} хим</span>`;
  }
  function closePick() { const el = $('#xd-pick'); if (el) { el.id = ''; el.classList.add('out'); setTimeout(() => el.remove(), 200); } pick = null; }
  function confirmPick() {
    const a = A(), p = pick.list[pick.chosen]; if (!p) return;
    const srcEl = $$('#xd-pick .xp-c')[pick.chosen], from = rectOf(srcEl && $('.fu', srcEl));
    if (pick.zone === 'capt') { a.captPick = p.name; capFrom = from; save(); closePick(); render(); return; }
    const arr = pick.zone === 'xi' ? a.xi : a.bench;
    if (arr[pick.i]) return closePick(); // уже выбран — подборку не переигрываем
    arr[pick.i] = p.name; save(); Sound.play('token'); haptic('pop');
    fx = { type: 'place', zone: pick.zone, i: pick.i, from }; closePick(); render();
  }
  function placeCaptain(i) {
    const a = A(), p = P(a.captPick), pos = XD.FORMATIONS[a.form].slots[i].pos;
    const ok = p.pos.includes(pos);
    if (!ok) { toast(`${surname(p.name)} не играет на ${XD.RU[pos]}`); haptic('bad'); return; }
    a.xi[i] = p.name; a.captSlot = i; a.captPick = null; a.stage = 'draft'; save(); Sound.play('token');
    fx = { type: 'place', zone: 'xi', i, from: capFrom || rectOf(slotEl('xi', i)) }; capFrom = null; render();
  }

  // ---------- перестановки: «выбрать игрока → выбрать место» ----------
  function tapSlot(zone, i) {
    const a = A(), arr = zone === 'xi' ? a.xi : a.bench;
    if (a.stage === 'capt') { if (zone === 'xi' && a.captPick) placeCaptain(i); else if (!a.captPick) openPick('capt'); return; }
    if (a.stage !== 'draft') return;
    if (!sel) {
      if (!arr[i]) return openPick(zone, i);
      sel = { zone, i }; render(); return;
    }
    if (sel.zone === zone && sel.i === i) { sel = null; render(); return; }
    if (!arr[i]) { toast('Сначала заполни эту позицию'); sel = null; render(); return; }
    const from = sel.zone === 'xi' ? a.xi : a.bench;
    fx = { type: 'swap', a: { zone: sel.zone, i: sel.i, rect: rectOf(slotEl(sel.zone, sel.i)) }, b: { zone, i, rect: rectOf(slotEl(zone, i)) } };
    [from[sel.i], arr[i]] = [arr[i], from[sel.i]];
    if (a.captSlot !== undefined) { // капитан переезжает вместе с игроком
      if (sel.zone === 'xi' && sel.i === a.captSlot) a.captSlot = zone === 'xi' ? i : null;
      else if (zone === 'xi' && i === a.captSlot) a.captSlot = sel.zone === 'xi' ? sel.i : null;
    }
    sel = null; save(); Sound.play('tap'); render();
  }

  // ---------- карточки ----------
  const surname = (n) => { const w = n.split(' '); return w.length > 1 ? w.slice(1).join(' ') : n; };
  const rarOf = (r) => (r >= 78 ? 'gold' : r >= 73 ? 'silver' : 'bronze');
  const colOf = (club) => (typeof CLUB_COL !== 'undefined' && CLUB_COL[club]) || ['#3b4f8f', '#141a3a'];
  function faceImg(p) { return p.face ? `<img class="xc-f" src="${(FreshFaces.on() ? FreshFaces.url(p.face, 120) : faceSrc(p.face))}" alt="">` : '<span class="xc-sil"></span>'; }
  function cardBig(p, slotPos) {
    const c = { key: p.name, name: p.name, r: p.r, pos: XD.RU[p.pos[0]], club: p.club, flag: p.flag, face: p.face, rar: rarOf(p.r) };
    return typeof Cards !== 'undefined' ? Cards.html(c, { w: 132 }) : `<div class="xc big ${c.rar}"><b class="xc-r">${p.r}</b><small>${c.pos}</small>${faceImg(p)}<span class="xc-n">${esc(surname(p.name))}</span></div>`;
  }
  // карточка-щит как в FUT: цвет — редкость, слева рейтинг/позиция/флаг/клуб, справа лицо, снизу фамилия
  function mini(p, opts) {
    const { slotPos, ch, sys, idx, zone, big } = opts;
    const cap = zone === 'xi' && A() && A().captSlot === idx;
    if (!p) return `<button class="fu empty" data-z="${zone}" data-i="${idx}"><span class="fu-plus">+</span><small>${slotPos ? XD.RU[slotPos] : ''}</small></button>`;
    const cr = CRESTS[p.club];
    const off = slotPos && !p.pos.includes(slotPos);
    let chem = '';
    if (ch && zone === 'xi') {
      chem = sys === 'new'
        ? `<span class="fu-ch new" data-chem="${idx}">${[0, 1, 2].map((d) => `<i class="${d < ch.chem ? 'on' : ''}"></i>`).join('')}</span>`
        : `<span class="fu-ch cl c${ch.chem >= 7 ? 'g' : ch.chem >= 4 ? 'y' : 'r'}" data-chem="${idx}"><u>${XD.RU[slotPos]}</u>${ch.chem}</span>`;
    }
    return `<button class="fu ${rarOf(p.r)} ${off ? 'off' : ''} ${big ? 'big' : ''}" data-z="${zone}" data-i="${idx}">
      <span class="fu-l"><b>${p.r}</b><small>${XD.RU[slotPos || p.pos[0]]}</small><em>${p.flag}</em>${cr ? `<img src="img/clubs/${cr}" alt="">` : ''}</span>
      ${p.face ? `<img class="fu-f" src="${FreshFaces.on() ? FreshFaces.url(p.face, big ? 240 : 120) : faceSrc(p.face)}" alt="">` : '<span class="fu-sil"></span>'}
      <span class="fu-n">${esc(surname(p.name))}</span>${cap ? '<i class="fu-c">C</i>' : ''}</button>${chem}`;
  }
  // перспектива как у телекамеры: дальняя сторона уже, игроки там чуть меньше
  // ровное поле сверху, как в «Моём составе»: линии связей идут прямо от карточки к карточке
  const proj = (x, y) => ({ x: 7 + x * 0.86, y: 3 + y * 0.92, k: 1 });
  function field() {
    const P2 = (x, y) => { const q = proj(x, y); return `${q.x.toFixed(2)},${q.y.toFixed(2)}`; };
    const poly = (pts) => `<polygon points="${pts.map(([x, y]) => P2(x, y)).join(' ')}"/>`;
    const stripes = Array.from({ length: 10 }, (_, k) => (k % 2 ? poly([[0, k * 10], [100, k * 10], [100, k * 10 + 10], [0, k * 10 + 10]]) : '')).join('');
    const c = proj(50, 50), h1 = proj(0, 50), h2 = proj(100, 50);
    return `<svg class="xd-field" viewBox="0 0 100 100" preserveAspectRatio="none">
      <g class="st">${stripes}</g>
      <g class="mk">${poly([[0, 0], [100, 0], [100, 100], [0, 100]])}<line x1="${h1.x}" y1="${h1.y}" x2="${h2.x}" y2="${h2.y}"/>
      <ellipse cx="${c.x}" cy="${c.y}" rx="${13 * c.k}" ry="${8 * c.k}"/>${poly([[22, 0], [78, 0], [78, 14], [22, 14]])}${poly([[22, 100], [78, 100], [78, 86], [22, 86]])}
      ${poly([[37, 0], [63, 0], [63, 5], [37, 5]])}${poly([[37, 100], [63, 100], [63, 95], [37, 95]])}</g></svg>`;
  }
  function pitchHTML(a, xi, c, { live = true, capt = null } = {}) {
    const F_ = XD.FORMATIONS[a.form];
    const lines = a.sys === 'classic' ? `<svg class="xd-links" viewBox="0 0 100 100" preserveAspectRatio="none">${c.links.map((l) => {
      const p1 = proj(F_.slots[l.i].x, F_.slots[l.i].y), p2 = proj(F_.slots[l.j].x, F_.slots[l.j].y);
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" class="ln ${l.color}" data-k="${l.i}-${l.j}"/>`;
    }).join('')}</svg>` : '';
    return `<div class="xd-pitch ${a.sys} ${live && sel ? 'swapping' : ''} ${capt ? 'placing' : ''}">${field()}${lines}${F_.slots.map((s, i) => {
      const q = proj(s.x, s.y), glow = capt && capt.pos.includes(s.pos) && !a.xi[i];
      return `<div class="xd-slot ${live && sel && sel.zone === 'xi' && sel.i === i ? 'sel' : ''} ${glow ? 'glow' : ''}" style="left:${q.x}%;top:${q.y}%;--k:${q.k}">${mini(xi[i], { slotPos: s.pos, ch: c.per[i], sys: a.sys, idx: i, zone: 'xi' })}</div>`;
    }).join('')}</div>`;
  }

  // ---------- экраны ----------
  function render() {
    const a = A(), box = $('#xd-body'); if (!box) return;
    const best = S().best;
    $('#xd-sub').textContent = a && a.sys ? `${a.form || ''} · ${a.sys === 'classic' ? 'Классика' : 'Новая химия'}` : 'Собери состав из пятёрок';
    if (!a || a.stage === 'sys') {
      box.innerHTML = `<p class="xd-lead">Система химии</p>
        <button class="xd-opt" data-sys="classic"><b>Классическая</b><span>FIFA 19 · связи с соседями · до 100</span>${best.classic ? `<em>Рекорд: рейтинг ${best.classic.r} · химия ${best.classic.c}/100</em>` : ''}</button>
        <button class="xd-opt" data-sys="new"><b>Новая</b><span>FIFA 23 · клубы, лиги, сборные · до 33</span>${best.new ? `<em>Рекорд: рейтинг ${best.new.r} · химия ${best.new.c}/33</em>` : ''}</button>`;
      return;
    }
    if (a.stage === 'form') {
      box.innerHTML = `<p class="xd-lead">Схема</p><div class="xd-forms">${a.forms.map((f) => `<button class="xd-form" data-form="${f}"><span class="xd-mini">${XD.FORMATIONS[f].slots.map((s) => `<i style="left:${s.x}%;top:${s.y}%"></i>`).join('')}</span><b>${f}</b></button>`).join('')}</div>`;
      return;
    }
    if (a.stage === 'done') return renderResult();
    const xi = xiOf(a), bench = benchOf(a), c = XD.chem(a.sys, a.form, xi), F_ = XD.FORMATIONS[a.form];
    const done = filled(a), all = 11 + XD.BENCH, rating = XD.teamRating(xi);
    const capt = a.stage === 'capt' && a.captPick ? P(a.captPick) : null;
    const part = a.xi.filter(Boolean).length < 11;
    box.innerHTML = `<div class="xd-bar"><span class="xd-f">${a.form}</span><span class="xd-st"><small>Рейтинг</small><b>${rating || '—'}</b><span class="xd-stars" style="--s:${rating ? Math.max(.5, Math.min(5, Math.round((rating - 64) / 4) / 2 + 2)) : 0}"></span></span>
        <button class="xd-st xd-chem" data-act2="chem"><small>Химия</small><b><span class="xd-ct">${c.total}</span><em>/${c.max}</em></b>${part ? '<i>предв.</i>' : ''}<span class="xd-cbar"><i style="width:${(c.total / c.max) * 100}%"></i></span></button></div>
      ${pitchHTML(a, xi, c, { capt })}
      ${[[0, XD.SUBS, 'Скамейка'], [XD.SUBS, XD.BENCH, 'Резерв']].map(([from, to, ttl]) => `<div class="xd-bench"><div class="xd-bh"><b>${ttl}</b><small>${bench.slice(from, to).filter(Boolean).length}/${to - from}</small></div>
        <div class="xd-brow">${bench.slice(from, to).map((p, k) => { const i = from + k; return `<div class="xd-slot b ${sel && sel.zone === 'bench' && sel.i === i ? 'sel' : ''}">${mini(p, { idx: i, zone: 'bench', sys: a.sys })}</div>`; }).join('')}</div></div>`).join('')}
      <div class="xd-act">${a.stage === 'capt' ? `<button class="btn gold" data-act2="capt">${capt ? 'Сменить капитана' : 'Выбрать капитана'}</button>` : `<button class="btn gold" data-act2="finish" ${done < all ? 'disabled' : ''}>${done < all ? `Заполнено ${done}/${all}` : 'Завершить драфт'}</button>`}
        <button class="btn ghost" data-act2="reset">Новый драфт</button></div>`;
    Photos.hydrate(box);
    postFx(a, c);
  }

  // ---------- объяснение химии ----------
  function explainChem(i) {
    const a = A(), xi = xiOf(a), p = xi[i]; if (!p) return;
    if (a.sys === 'classic') {
      const x = XD.ChemClassic.explain(a.form, xi, i);
      Modal.open(`<h3 class="xd-h">${esc(p.name)}<b>химия ${x.chem}/10</b></h3><p class="xd-ex">${x.fit} · ${x.base} + лояльность 1</p>
        <div class="xd-exl">${x.lines.map((l) => `<span class="${l.color}"><i></i>${esc(l.who)} — ${l.why}</span>`).join('')}</div><p class="xd-ex">${x.next}</p>`, [{ label: 'Понятно', cls: 'ghost' }]);
    } else {
      const x = XD.ChemNew.explain(a.form, xi, i);
      Modal.open(`<h3 class="xd-h">${esc(p.name)}<b>химия ${x.chem}/3</b></h3>${x.off ? '' : `<div class="xd-exn">${x.rows.map((r) => `<span><b>${r.name}: ${esc(r.value)}</b><small>${r.n} в составе · +${r.got}</small></span>`).join('')}</div>`}<p class="xd-ex">${x.next}</p>`, [{ label: 'Понятно', cls: 'ghost' }]);
    }
  }
  // панель: для новой — прогресс по клубам, лигам, сборным; для классики — подсказка по цветам
  function chemPanel() {
    const a = A(), xi = xiOf(a);
    if (a.sys === 'classic') {
      const c = XD.chem('classic', a.form, xi), n = { green: 0, orange: 0, red: 0 }; c.links.forEach((l) => { if (n[l.color] !== undefined) n[l.color]++; });
      Modal.open(`<h3 class="xd-h">Классическая химия<b>${c.total}/100</b></h3><div class="xd-lk"><span class="green"><i></i>${n.green}</span><span class="orange"><i></i>${n.orange}</span><span class="red"><i></i>${n.red}</span></div>`, [{ label: 'Понятно', cls: 'ghost' }]);
      return;
    }
    const r = XD.ChemNew.calc(a.form, xi), TH = XD.ChemNew.TH, NAMES = { club: 'Клубы', lg: 'Лиги', nat: 'Сборные' };
    const block = (k) => { const e = Object.entries(r.counts[k]).sort((x, y) => y[1] - x[1]).slice(0, 6); return `<h3 class="section-label">${NAMES[k]}</h3>${e.map(([v, n]) => { const nx = TH[k].find((t) => n < t); return `<div class="xd-pr"><span>${esc(v)}</span><span class="xd-prb"><i style="width:${Math.min(100, (n / TH[k][2]) * 100)}%"></i>${TH[k].map((t) => `<em style="left:${(t / TH[k][2]) * 100}%"></em>`).join('')}</span><b>${n}</b></div>`; }).join('') || '<p class="xd-ex">пока никого</p>'}`; };
    Modal.open(`<h3 class="xd-h">Новая химия<b>${r.total}/33</b></h3>${block('club')}${block('lg')}${block('nat')}`, [{ label: 'Понятно', cls: 'ghost' }]);
  }

  // ---------- итог ----------
  function finish() {
    const a = A(); if (filled(a) < 11 + XD.BENCH) return;
    const xi = xiOf(a), r = XD.teamRating(xi), c = XD.chem(a.sys, a.form, xi).total;
    a.result = { r, c }; a.stage = 'done';
    const b = S().best, cur = b[a.sys] || { r: 0, c: 0 };
    a.result.newR = r > cur.r; a.result.newC = c > cur.c;
    b[a.sys] = { r: Math.max(cur.r, r), c: Math.max(cur.c, c) };
    save(); Sound.play('whistle'); render();
  }
  function renderResult() {
    const a = A(), xi = xiOf(a), bench = benchOf(a), F_ = XD.FORMATIONS[a.form], c = XD.chem(a.sys, a.form, xi), b = S().best[a.sys] || {};
    $('#xd-body').innerHTML = `<div class="xd-res"><div class="sb"><div class="sb-k">ДРАФТ · ${a.form} · ${SYS[a.sys].toUpperCase()}</div>
        <div class="xd-rs"><span><small>Рейтинг</small><b>${a.result.r}</b>${a.result.newR ? '<em>рекорд!</em>' : ''}</span><span><small>Химия</small><b>${a.result.c}<i>/${c.max}</i></b>${a.result.newC ? '<em>рекорд!</em>' : ''}</span></div>
        <div class="xd-best">${b.r ? `Лучшее в режиме «${SYS[a.sys]}»: рейтинг ${b.r} · химия ${b.c}/${c.max}` : 'Первый драфт в этом режиме — это и есть рекорд'}</div></div>
      ${pitchHTML(a, xi, c, { live: false })}
      <div class="xd-bench"><div class="xd-bh"><b>Скамейка и резерв</b></div><div class="xd-brow">${bench.map((p, i) => `<div class="xd-slot b">${mini(p, { idx: i, zone: 'bench', sys: a.sys })}</div>`).join('')}</div></div>
      <div class="xd-act col">${S().tour && !S().tour.paid ? `<button class="btn gold" data-act2="tour-go">${S().tour.over ? 'Итоги турнира' : 'Продолжить турнир'}</button>` : '<button class="btn gold" data-act2="tour">Турнир драфта · 4 матча</button>'}
        <button class="btn xd-online" data-act2="online">Онлайн-матч с игроком</button><button class="btn ghost" data-act2="bot">Товарищеский матч</button><button class="btn ghost" data-act2="share">Поделиться составом</button><button class="btn ghost" data-act2="reset">Новый драфт</button></div>
      <p class="xt-note">Турнир: 4 матча против ботов, каждый сильнее. Проиграл — вылетел. Награды: паки, монеты, трофеи и золотые мячи.</p>
</div>`;
    Photos.hydrate($('#xd-body'));
  }
  function share() {
    const a = A(), xi = xiOf(a), max = a.sys === 'classic' ? 100 : 33;
    const text = `⚽ Мой драфт ${a.form} · ${SYS[a.sys]}\nРейтинг ${a.result.r} · химия ${a.result.c}/${max}\n${xi.map((p, i) => `${XD.RU[XD.FORMATIONS[a.form].slots[i].pos]} ${surname(p.name)} ${p.r}`).join(', ')}\nСтарики Джексоны · собери лучше?`;
    const url = appLink('xdraft');
    try { if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (e) { /* не в Telegram */ }
    if (navigator.share) { navigator.share({ text, url }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(() => toast('Состав скопирован'), () => toast(text)); else toast(text);
  }

  // ---------- вход ----------
  async function open() {
    Screens.show('xdraft');
    $('#xd-body').innerHTML = '<p class="xd-lead">Загружаем базу…</p>';
    try { await loadPos(); } catch (e) { $('#xd-body').innerHTML = '<p class="xd-lead">Не удалось загрузить базу позиций. Проверь интернет и попробуй ещё раз.</p>'; return; }
    pool();
    if (!A()) fresh();
    sel = null; entering = true; prevTotal = null;
    if (S().match && !S().match.done && typeof XMatch !== 'undefined') return XMatch.resume(XMatch.DRAFT);
    render();
  }
  function bind() {
    $('#xd-body').addEventListener('click', (e) => {
      const sy = e.target.closest('[data-sys]'); if (sy) { Sound.play('tap'); return chooseSys(sy.dataset.sys); }
      const fo = e.target.closest('[data-form]'); if (fo) { Sound.play('tap'); return chooseForm(fo.dataset.form); }
      const ch = e.target.closest('[data-chem]'); if (ch && A().stage !== 'done') { e.stopPropagation(); return explainChem(+ch.dataset.chem); }
      const ac = e.target.closest('[data-act2]');
      if (ac) {
        const k = ac.dataset.act2;
        if (k === 'chem') return chemPanel();
        if (k === 'capt') return openPick('capt');
        if (k === 'finish') return finish();
        if (k === 'share') return share();
        if (k === 'bot') return XMatch.choose(XMatch.DRAFT);
        if (k === 'online') return XMatch.online(XMatch.DRAFT);
        if (k === 'tour') return XMatch.tourStart();
        if (k === 'tour-go') { XMatch.use(XMatch.DRAFT); return XMatch.tourScreen(); }
        if (k === 'reset') {
          const a = A();
          if (a && a.stage !== 'done' && a.stage !== 'sys') return Modal.open('<h2>Начать новый драфт?</h2><p>Текущий состав пропадёт.</p>', [{ label: 'Начать заново', onClick: () => { fresh(); render(); } }, { label: 'Отмена', cls: 'ghost' }]);
          fresh(); return render();
        }
      }
      const sl = e.target.closest('.fu[data-z]'); if (sl && A().stage !== 'done') return tapSlot(sl.dataset.z, +sl.dataset.i);
    });
    // перетащить игрока на другое место (на поле или со скамейки) — то же, что «выбрать → нажать место»
    if (typeof Drag !== 'undefined') Drag.swap($('#xd-body'), '.fu[data-z]', {
      ok: (el) => { const a = A(); if (!a || a.stage !== 'draft') return false; const arr = el.dataset.z === 'xi' ? a.xi : a.bench; return !!arr[+el.dataset.i]; },
      drop: (f, t) => { const a = A(), arr = t.dataset.z === 'xi' ? a.xi : a.bench; if (!arr[+t.dataset.i]) return toast('Сначала заполни эту позицию'); sel = { zone: f.dataset.z, i: +f.dataset.i }; tapSlot(t.dataset.z, +t.dataset.i); haptic('ok'); },
    });
  }
  return { open, bind, render, P, xiOf: () => xiOf(A()), A, S, pool, mini, SYS };
})();
