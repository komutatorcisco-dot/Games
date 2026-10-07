// «Драфт» — экран: система химии → схема → капитан → по одному из пяти на каждую позицию (11 + 7 на скамейке) →
// перестановки → итог → матч против бота. Логика и расчёты — в engine.js (XD), здесь только экран и сохранение.
// Сохранение: Store.d.xd = { cur: попытка, best: { classic, new }, match }. Подборки хранятся сразу при создании,
// поэтому перезапуск не перебрасывает кандидатов, а открытая позиция всегда показывает ту же пятёрку.
'use strict';

const XDraft = (() => {
  const SYS = { classic: 'Классическая химия', new: 'Новая химия' };
  let POOL = null, BY = null, sel = null, pick = null;

  // ---------- данные ----------
  const loadPos = () => new Promise((ok, bad) => {
    if (typeof FC_POS !== 'undefined') return ok();
    const s = document.createElement('script'); s.src = 'js/data/fcpos.js?v=1'; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
  });
  function pool() {
    if (POOL) return POOL;
    POOL = PLAYERS.filter((p) => FC_STATS[p.name] && FC_POS[p.name]).map((p) => ({
      name: p.name, r: FC_STATS[p.name][0], st: FC_STATS[p.name].slice(1, 7), pos: FC_POS[p.name].split(' '),
      club: p.club, lg: p.lg, nat: p.nat, flag: p.flag, face: FACES[p.name] || null,
    }));
    BY = Object.fromEntries(POOL.map((p) => [p.name, p]));
    return POOL;
  }
  const P = (name) => (name ? (pool(), BY[name]) || null : null);
  const S = () => { const d = Store.d; if (!d.xd) d.xd = { cur: null, best: {}, match: null }; if (!d.xd.best) d.xd.best = {}; return d.xd; };
  const A = () => S().cur;
  const save = () => Store.save();
  const xiOf = (a) => a.xi.map(P);
  const benchOf = (a) => a.bench.map(P);
  const filled = (a) => a.xi.filter(Boolean).length + a.bench.filter(Boolean).length;

  // ---------- новая попытка ----------
  function fresh() {
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
    const a = A();
    let list, pos = null;
    if (what === 'capt') list = a.capt.map(P).filter(Boolean);
    else { list = offerFor(what, i); pos = what === 'xi' ? XD.FORMATIONS[a.form].slots[i].pos : null; }
    pick = { zone: what, i, list, chosen: null };
    const el = document.createElement('div');
    el.className = 'xp'; el.id = 'xd-pick';
    const title = what === 'capt' ? 'Капитан' : pos ? XD.RU[pos] : 'Запасной';
    el.innerHTML = `<div class="xp-top"><span class="xp-pos">${title}</span><b>${what === 'capt' ? 'Выбери капитана' : 'Выбери игрока'}</b><button class="xp-x" aria-label="Закрыть">✕</button></div>
      <div class="xp-grid n${list.length}">${list.map((p, k) => `<button class="xp-c" data-k="${k}">${cardBig(p)}${what === 'xi' ? chemDelta(i, p) : ''}</button>`).join('')}</div>
      <div class="xp-foot"><div class="xp-sum"></div><button class="btn gold xp-ok" disabled>Выбери карточку</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    el.addEventListener('click', (e) => {
      if (e.target.closest('.xp-x')) return closePick();
      const c = e.target.closest('.xp-c');
      if (c) {
        if (pick.chosen === +c.dataset.k) return confirmPick(); // второе нажатие — взять
        pick.chosen = +c.dataset.k; $$('.xp-c', el).forEach((b) => b.classList.toggle('on', b === c));
        const ok = $('.xp-ok', el); ok.disabled = false; ok.textContent = `Взять ${surname(list[pick.chosen].name)}`;
        if (what !== 'capt') { const pv = preview(what, i, list[pick.chosen]); $('.xp-sum', el).innerHTML = `<span>Рейтинг <b>${pv.before.r || '—'} → ${pv.after.r}</b></span><span>Химия <b>${pv.before.c} → ${pv.after.c}</b></span>`; }
        Sound.play('tap'); return;
      }
      if (e.target.closest('.xp-ok') && pick.chosen !== null) confirmPick();
    });
  }
  // маленький значок под карточкой: на сколько вырастет химия команды
  function chemDelta(i, p) {
    const pv = preview('xi', i, p), d = pv.after.c - pv.before.c;
    return `<span class="xp-d ${d > 0 ? 'up' : ''}">${d > 0 ? '+' + d : d} хим</span>`;
  }
  function closePick() { const el = $('#xd-pick'); if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 200); } pick = null; }
  function confirmPick() {
    const a = A(), p = pick.list[pick.chosen]; if (!p) return;
    if (pick.zone === 'capt') { a.captPick = p.name; save(); closePick(); render(); return; }
    const arr = pick.zone === 'xi' ? a.xi : a.bench;
    if (arr[pick.i]) return closePick(); // уже выбран — подборку не переигрываем
    arr[pick.i] = p.name; save(); Sound.play('token'); haptic('pop'); closePick(); render();
  }
  function placeCaptain(i) {
    const a = A(), p = P(a.captPick), pos = XD.FORMATIONS[a.form].slots[i].pos;
    const ok = a.sys === 'new' ? p.pos.includes(pos) : p.pos[0] === pos;
    if (!ok) { toast(`${surname(p.name)} не играет на ${XD.RU[pos]}`); haptic('bad'); return; }
    a.xi[i] = p.name; a.captSlot = i; a.captPick = null; a.stage = 'draft'; save(); Sound.play('token'); render();
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
  function mini(p, opts) {
    const { slotPos, ch, sys, cls = '', idx, zone } = opts;
    if (!p) return `<button class="xc empty ${cls}" data-z="${zone}" data-i="${idx}"><span class="xc-plus">+</span><small>${slotPos ? XD.RU[slotPos] : ''}</small></button>`;
    const [k1, k2] = colOf(p.club), cr = CRESTS[p.club];
    const off = slotPos && (sys === 'new' ? !p.pos.includes(slotPos) : p.pos[0] !== slotPos);
    let chem = '';
    if (ch && zone === 'xi') {
      chem = sys === 'new'
        ? `<span class="xc-ch new" data-chem="${idx}">${[0, 1, 2].map((d) => `<i class="${d < ch.chem ? 'on' : ''}"></i>`).join('')}</span>`
        : `<span class="xc-ch cl c${ch.chem >= 7 ? 'g' : ch.chem >= 4 ? 'y' : 'r'}" data-chem="${idx}">${ch.chem}</span>`;
    }
    return `<button class="xc ${rarOf(p.r)} ${cls} ${off ? 'off' : ''}" data-z="${zone}" data-i="${idx}" style="--k1:${k1};--k2:${k2}">
      <span class="xc-r"><b>${p.r}</b><small>${XD.RU[slotPos || p.pos[0]]}</small></span>${cr ? `<img class="xc-cr" src="img/clubs/${cr}" alt="">` : ''}${faceImg(p)}
      <span class="xc-n">${esc(surname(p.name))}</span>${zone === 'xi' && A().captSlot === idx ? '<i class="xc-c">C</i>' : ''}${chem}</button>`;
  }

  // ---------- экраны ----------
  function render() {
    const a = A(), box = $('#xd-body'); if (!box) return;
    const best = S().best;
    $('#xd-sub').textContent = a && a.sys ? `${a.form || ''} · ${SYS[a.sys]}` : 'Собери состав из пятёрок';
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
    const lines = a.sys === 'classic' ? `<svg class="xd-links" viewBox="0 0 100 100" preserveAspectRatio="none">${c.links.map((l) => {
      const s1 = F_.slots[l.i], s2 = F_.slots[l.j];
      return `<line x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}" class="ln ${l.color}"/>`;
    }).join('')}</svg>` : '';
    const capt = a.stage === 'capt' && a.captPick ? P(a.captPick) : null;
    const part = a.xi.filter(Boolean).length < 11;
    box.innerHTML = `<div class="xd-bar"><span class="xd-f">${a.form}</span><span class="xd-st"><small>Рейтинг</small><b>${rating || '—'}</b>${part ? '<i>предв.</i>' : ''}</span>
        <button class="xd-st xd-chem" data-act2="chem"><small>Химия</small><b>${c.total}<em>/${c.max}</em></b>${part ? '<i>предв.</i>' : ''}<span class="xd-cbar"><i style="width:${(c.total / c.max) * 100}%"></i></span></button></div>
      <div class="xd-pitch ${a.sys} ${sel ? 'swapping' : ''} ${capt ? 'placing' : ''}"><span class="xd-mk"><i class="pa t"></i><i class="pa b"></i><i class="ga t"></i><i class="ga b"></i></span>${lines}${F_.slots.map((s, i) => {
        const glow = capt && (a.sys === 'new' ? capt.pos.includes(s.pos) : capt.pos[0] === s.pos) && !a.xi[i];
        return `<div class="xd-slot ${sel && sel.zone === 'xi' && sel.i === i ? 'sel' : ''} ${glow ? 'glow' : ''}" style="left:${s.x}%;top:${s.y}%">${mini(xi[i], { slotPos: s.pos, ch: c.per[i], sys: a.sys, idx: i, zone: 'xi' })}</div>`;
      }).join('')}</div>
      <div class="xd-bench"><div class="xd-bh"><b>Скамейка</b><small>${bench.filter(Boolean).length}/${XD.BENCH}</small></div>
        <div class="xd-brow">${bench.map((p, i) => `<div class="xd-slot b ${sel && sel.zone === 'bench' && sel.i === i ? 'sel' : ''}">${mini(p, { idx: i, zone: 'bench', sys: a.sys })}</div>`).join('')}</div></div>
      <div class="xd-act">${a.stage === 'capt' ? `<button class="btn gold" data-act2="capt">${capt ? 'Сменить капитана' : 'Выбрать капитана'}</button>` : `<button class="btn gold" data-act2="finish" ${done < all ? 'disabled' : ''}>${done < all ? `Заполнено ${done}/${all}` : 'Завершить драфт'}</button>`}
        <button class="btn ghost" data-act2="reset">Новый драфт</button></div>`;
    Photos.hydrate(box);
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
        <div class="xd-best">Лучшее в режиме «${SYS[a.sys]}»: рейтинг ${b.r} · химия ${b.c}/${c.max}</div></div>
      <div class="xd-pitch sm ${a.sys}">${F_.slots.map((s, i) => `<div class="xd-slot" style="left:${s.x}%;top:${s.y}%">${mini(xi[i], { slotPos: s.pos, ch: c.per[i], sys: a.sys, idx: i, zone: 'xi' })}</div>`).join('')}</div>
      <div class="xd-bench"><div class="xd-bh"><b>Скамейка</b></div><div class="xd-brow">${bench.map((p, i) => `<div class="xd-slot b">${mini(p, { idx: i, zone: 'bench', sys: a.sys })}</div>`).join('')}</div></div>
      <div class="xd-act col"><button class="btn gold" data-act2="bot">Играть против бота</button><button class="btn ghost" data-act2="share">Поделиться составом</button><button class="btn ghost" data-act2="reset">Новый драфт</button></div>
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
    sel = null;
    if (S().match && !S().match.done && typeof XMatch !== 'undefined') return XMatch.resume();
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
        if (k === 'bot') return XMatch.choose();
        if (k === 'reset') {
          const a = A();
          if (a && a.stage !== 'done' && a.stage !== 'sys') return Modal.open('<h2>Начать новый драфт?</h2><p>Текущий состав пропадёт.</p>', [{ label: 'Начать заново', onClick: () => { fresh(); render(); } }, { label: 'Отмена', cls: 'ghost' }]);
          fresh(); return render();
        }
      }
      const sl = e.target.closest('.xc[data-z]'); if (sl && A().stage !== 'done') return tapSlot(sl.dataset.z, +sl.dataset.i);
    });
  }
  return { open, bind, render, P, xiOf: () => xiOf(A()), A, S, pool, mini, SYS };
})();
