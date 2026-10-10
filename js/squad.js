// «Мой состав» (как в MADFUT): собираешь 11 из своих карточек, видишь рейтинг и химию, играешь матч против бота.
// Химия — «новая» из драфта (клуб, лига, сборная + своя позиция), матч — тот же движок XMatch.
// Сохранение: Store.d.squad = { form, xi: [ключи карточек], match }.
'use strict';

const Squad = (() => {
  const POSMAP = { НАП: ['ST'], ПЗ: ['CM'], ЗАЩ: ['CB'], ВРТ: ['GK'], ЛЗ: ['LB'] };
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, k, o) => (el && el.animate && !RM ? el.animate(k, o) : null);
  const S = () => {
    const d = Store.d;
    if (!d.squad || typeof d.squad !== 'object') d.squad = {};
    const s = d.squad;
    if (!XD.FORMATIONS[s.form]) s.form = '4-3-3';
    if (!Array.isArray(s.xi) || s.xi.length !== 11) s.xi = Array(11).fill(null);
    if (s.match === undefined) s.match = null;
    return s;
  };

  // карточка → игрок для движка драфта (у легенд нет статистики FC — берём рейтинг и позицию с карточки)
  function obj(key) {
    const c = key && Cards.get(key); if (!c) return null;
    const positions = PlayerPositions.get(c.name, c.pos);
    if (c.st) return { ...c, pos: positions, st: c.st.slice() };
    const b = XDraft.P(c.name), up = c.rar === 'jack' ? 4 : 0;
    if (b) return { ...b, key, icon: c.icon, nat: c.nat || b.nat, pos: positions, r: c.r, st: b.st.map((v) => Math.min(99, v + up)), rar: c.rar };
    return { name: c.name, key, icon: c.icon, r: c.r, st: Array(6).fill(c.r), pos: positions, club: c.club, lg: c.lg, nat: c.nat || 'leg:' + c.name, flag: c.flag, face: c.face, rar: c.rar };
  }
  const xi = () => S().xi.map(obj);
  const fits = (p, pos) => p.pos.includes(pos);
  // карточка могла уйти в ИПК — тогда место пустеет
  function prune() {
    const s = S(); let ch = false;
    s.xi = s.xi.map((k) => { if (k && Cards.spare(k) <= 0) { ch = true; return null; } return k; });
    if (ch) Store.save();
  }
  const mine = () => Cards.all().filter((c) => Cards.spare(c.key) > 0);
  const CTX = {
    screen: 'squad', body: '#sq-body', st: S, form: () => S().form, sys: () => (S().sys === 'classic' ? 'classic' : 'new'), xi,
    back: () => { S().match = null; Store.save(); render(); }, title: () => `Мой состав ${S().form}`, link: 'squad',
    onEnd: (w) => { if (typeof Rewards !== 'undefined') Rewards.onEnd(w === 'win', 'squad'); },
  };

  // ---------- экран ----------
  function render() {
    prune();
    const s = S(), F = XD.FORMATIONS[s.form], list = xi(), sys = s.sys === 'classic' ? 'classic' : 'new', c = XD.chem(sys, s.form, list), cls = sys === 'classic';
    const full = list.every(Boolean), r = XD.teamRating(list);
    const box = $('#sq-body');
    box.innerHTML = `<div class="sq-head">
        <div class="sq-k"><small>Рейтинг</small><b>${r || '—'}</b></div>
        <button class="sq-k sq-sys" data-sq="sys"><small>Химия · ${cls ? 'старая' : 'новая'}</small><b>${c.total}<i>/${cls ? 100 : 33}</i></b></button>
        <button class="sq-form" data-sq="form"><small>Схема</small><b>${s.form}</b></button></div>
      <div class="sq-pitch"><svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="3" width="94" height="134" rx="2"/><line x1="3" y1="70" x2="97" y2="70"/><circle cx="50" cy="70" r="12"/><rect x="25" y="3" width="50" height="20"/><rect x="25" y="117" width="50" height="20"/></svg>
        ${cls ? `<svg class="sq-links" viewBox="0 0 100 100" preserveAspectRatio="none">${c.links.filter((l) => l.color !== 'none').map((l) => `<line class="${l.color}" x1="${F.slots[l.i].x}" y1="${F.slots[l.i].y}" x2="${F.slots[l.j].x}" y2="${F.slots[l.j].y}"/>`).join('')}</svg>` : ''}
        ${F.slots.map((sl, i) => {
          const p = list[i], ch = c.per[i];
          return `<button class="sq-slot ${p ? 'on' : ''}" data-slot="${i}" style="left:${sl.x}%;top:${sl.y}%">
            ${p ? `${Cards.html(Cards.get(p.key), { w: 58, cls: 'sq-mini' })}${cls ? `<span class="sq-ch num ${ch.chem >= 7 ? 'g' : ch.chem >= 4 ? 'o' : 'r'}">${ch.chem}</span>` : `<span class="sq-ch ${ch && !ch.onPos ? 'off' : ''}">${ch && ch.onPos ? '<i></i>'.repeat(ch.chem) + '<u></u>'.repeat(3 - ch.chem) : esc(XD.RU[sl.pos])}</span>`}`
              : `<span class="sq-plus">+</span><small>${XD.RU[sl.pos]}</small>`}</button>`;
        }).join('')}</div>
      <div class="sq-act"><button class="btn ghost" data-sq="auto">Собрать лучших</button>
        <button class="btn gold" data-sq="play" ${full ? '' : 'disabled'}>${full ? 'Играть матч' : `Ещё ${list.filter((x) => !x).length} в состав`}</button></div>
      <p class="sq-note">${mine().length ? (cls ? 'Старая химия (FIFA 19): линии между соседями — зелёная, если общие 2 из 3 (клуб, лига, сборная), оранжевая — 1. Игрок на своей позиции получает до 10.' : 'Новая химия: за общий клуб, лигу или сборную во всём составе, только на своей позиции.') : 'У тебя пока нет карточек — открывай паки за победы.'}</p>`;
    $('#sq-sub').textContent = `${list.filter(Boolean).length}/11 · ${mine().length} ${plural(mine().length, 'карточка', 'карточки', 'карточек')}`;
  }

  function sheet(title, inner, onClick) {
    const el = document.createElement('div');
    el.className = 'sx-sheet-wrap sq-sheet';
    el.innerHTML = `<div class="sx-sheet"><div class="sx-grab"></div><div class="sx-sh"><b>${title}</b><button class="sx-x" data-sh="close" aria-label="Закрыть">✕</button></div><div class="sq-pl">${inner}</div></div>`;
    document.body.appendChild(el);
    anim($('.sx-sheet', el), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1)' });
    const close = () => { el.classList.add('out'); const a = anim($('.sx-sheet', el), [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }); if (a) a.onfinish = () => el.remove(); else el.remove(); };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-sh="close"]')) return close(); onClick(e, close); });
    return el;
  }

  function pickFor(i) {
    const s = S(), pos = XD.FORMATIONS[s.form].slots[i].pos, here = s.xi[i];
    const names = new Set(s.xi.map((k, j) => (k && j !== i ? Cards.get(k).name : null)).filter(Boolean));
    const cand = mine().filter(c => !names.has(c.name)).map(c => ({ c, p: { pos: c.positions } }))
      .sort((a, b) => (fits(b.p, pos) - fits(a.p, pos)) || b.c.r - a.c.r);
    const cell = (x) => `<button class="sq-pc ${fits(x.p, pos) ? '' : 'off'} ${x.c.key === here ? 'sel' : ''}" data-card="${esc(x.c.key)}">${Cards.html(x.c, { w: 76 })}${fits(x.p, pos) ? '' : '<em>не своя позиция</em>'}</button>`;
    let page = 0, query = '';
    const el = sheet(`${XD.RU[pos]} · выбери карточку`, cand.length ? `<input class="card-search" type="search" placeholder="Имя или клуб" aria-label="Поиск карточек"><div class="sq-grid"></div><div class="card-pages"></div>${here ? '<button class="btn ghost sq-rm" data-rm="1">Убрать из состава</button>' : ''}`
      : '<p class="sq-note">Нет свободных карточек. Открывай паки за победы.</p>', (e, close) => {
      const pg = e.target.closest('[data-page]');
      if (pg) { page = Number(pg.dataset.page); drawPage(); return; }
      if (e.target.closest('[data-rm]')) { s.xi[i] = null; Store.save(); close(); render(); return; }
      const b = e.target.closest('[data-card]'); if (!b) return;
      const k = b.dataset.card;
      s.xi = s.xi.map((x) => (x === k ? null : x)); s.xi[i] = k; Store.save();
      Sound.play('tap'); haptic('tap'); close(); render();
      const slot = $(`#sq-body [data-slot="${i}"]`);
      anim(slot, [{ transform: 'translate(-50%,-50%) translateY(-60px) rotateY(180deg) scale(1.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotateY(-10deg) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%)' }], { duration: 560, easing: 'cubic-bezier(.2,.9,.3,1)' });
    });
    function drawPage() {
      const list = cand.filter(x => (x.c.name + ' ' + x.c.club).toLocaleLowerCase('ru').includes(query));
      const pages = Math.max(1, Math.ceil(list.length / 24));
      page = Math.min(page, pages - 1);
      $('.sq-grid', el).innerHTML = list.slice(page * 24, (page + 1) * 24).map(cell).join('') || '<p>Карточки не найдены.</p>';
      $('.card-pages', el).innerHTML = `<button data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>←</button><span>${page + 1} / ${pages} · ${list.length} карт</span><button data-page="${page + 1}" ${page + 1 === pages ? 'disabled' : ''}>→</button>`;
      $('.sq-pl', el).scrollTop = 0;
    }
    if (cand.length) {
      drawPage();
      $('.card-search', el).addEventListener('input', e => { query = e.target.value.trim().toLocaleLowerCase('ru'); page = 0; drawPage(); });
    }
    if (typeof Icons !== 'undefined') Icons.fill(el);
  }

  function chooseForm() {
    const s = S();
    sheet('Схема', `<div class="sq-forms">${Object.keys(XD.FORMATIONS).map((f) => `<button class="sq-fb ${f === s.form ? 'sel' : ''}" data-f="${f}">${f}</button>`).join('')}</div>`, (e, close) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      s.form = b.dataset.f; Store.save(); close(); render();
    });
  }

  function chooseSys() {
    const s = S();
    sheet('Система химии', `<div class="sq-sysl">
      <button class="sq-sb ${s.sys !== 'classic' ? 'sel' : ''}" data-y="new"><b>Новая</b><small>Как в FC сейчас: клубы, лиги и сборные считаются по всему составу, до 3 на игрока, максимум 33</small></button>
      <button class="sq-sb ${s.sys === 'classic' ? 'sel' : ''}" data-y="classic"><b>Старая сыгранность</b><small>Как в FIFA 19: связи с соседями по схеме (зелёные и оранжевые линии), до 10 на игрока, максимум 100</small></button></div>`, (e, close) => {
      const b = e.target.closest('[data-y]'); if (!b) return;
      s.sys = b.dataset.y; Store.save(); close(); render();
    });
  }

  // лучший состав: на каждую позицию — самая сильная своя карточка (сначала вратарь и защита)
  function auto() {
    const s = S(), F = XD.FORMATIONS[s.form], pool = mine().map((c) => ({ c, p: obj(c.key) })).sort((a, b) => b.c.r - a.c.r);
    const used = new Set(), xi = Array(11).fill(null);
    F.slots.forEach((sl, i) => { const x = pool.find((q) => !used.has(q.c.name) && fits(q.p, sl.pos)); if (x) { xi[i] = x.c.key; used.add(x.c.name); } });
    F.slots.forEach((sl, i) => { if (xi[i]) return; const x = pool.find((q) => !used.has(q.c.name) && (sl.pos === 'GK') === q.p.pos.includes('GK')); if (x) { xi[i] = x.c.key; used.add(x.c.name); } });
    s.xi = xi; Store.save(); render();
    $$('#sq-body .sq-slot.on').forEach((el, k) => anim(el, [{ transform: 'translate(-50%,-50%) translateY(-30px) rotateX(70deg)', opacity: 0 }, { transform: 'translate(-50%,-50%)', opacity: 1 }], { duration: 480, delay: 35 * k, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' }));
    Sound.play('whistle'); haptic('ok');
  }

  const loadPos = () => new Promise((ok, bad) => {
    if (typeof FC_POS !== 'undefined') return ok();
    const sc = document.createElement('script'); sc.src = 'js/data/fcpos.js?v=1'; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc);
  });
  async function open() {
    if (typeof Release !== 'undefined' && !Release.feature('cards')) { toast('Состав откроется вместе с паками'); return; }
    Modal.close();
    Screens.show('squad');
    $('#sq-body').innerHTML = '<p class="sq-note">Загружаем карточки…</p>';
    try { await loadPos(); } catch (e) { $('#sq-body').innerHTML = '<p class="sq-note">Не получилось загрузить. Проверь интернет.</p>'; return; }
    XMatch.bind('#sq-body', CTX);
    const m = S().match;
    if (m && !m.done) return XMatch.resume(CTX);
    S().match = null; render();
  }

  function bind() {
    $('#sq-body').addEventListener('click', (e) => {
      if ($('#sq-body .xm, #sq-body .xm-intro, #sq-body .xd-res')) return; // идёт матч — кнопки матча ловит XMatch
      const sl = e.target.closest('[data-slot]'); if (sl) { Sound.play('tap'); return pickFor(+sl.dataset.slot); }
      const b = e.target.closest('[data-sq]'); if (!b) return;
      const k = b.dataset.sq;
      if (k === 'form') chooseForm();
      if (k === 'sys') chooseSys();
      if (k === 'auto') auto();
      if (k === 'play' && !b.disabled) XMatch.choose(CTX);
    });
    // перетащить карточку на другую позицию — игроки меняются местами
    if (typeof Drag !== 'undefined') Drag.swap($('#sq-body'), '.sq-slot', {
      ok: (el) => !$('#sq-body .xm, #sq-body .xm-intro, #sq-body .xd-res') && !!S().xi[+el.dataset.slot],
      drop: (f, t) => {
        const x = S().xi, i = +f.dataset.slot, j = +t.dataset.slot;
        [x[i], x[j]] = [x[j] || null, x[i]]; Store.save(); Sound.play('tap'); haptic('ok'); render();
        [i, j].forEach((k) => { const el = $(`#sq-body [data-slot="${k}"]`); if (el) anim(el, [{ transform: 'translate(-50%,-50%) scale(1.25)' }, { transform: 'translate(-50%,-50%)' }], { duration: 320, easing: 'cubic-bezier(.2,1.4,.4,1)' }); });
      },
    });
  }

  return { open, bind, render, S, CTX };
})();
