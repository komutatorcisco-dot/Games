// Коллекция карточек футболистов. Карточки выпадают из паков, повторки превращаются в монеты.
// Редкости: бронза (FC 78–79), серебро (80–83), золото (84+), легенда (великие игроки прошлого), «Джексон» — особая версия звёзд.
// Карточка: тёмная наклейка — фото на фоне цветов клуба, снизу плашка цвета редкости.
// Сохранение: Store.d.cards = { own: {ключ: сколько}, fresh: [ключи ещё не просмотренных] }.
'use strict';

const Cards = (() => {
  const RAR = {
    bronze: { n: 'БРОНЗА', dup: 5 },
    silver: { n: 'СЕРЕБРО', dup: 10 },
    gold: { n: 'ЗОЛОТО', dup: 25 },
    legend: { n: 'ЛЕГЕНДА', dup: 60 },
    jack: { n: 'ДЖЕКСОН!!', dup: 120 },
  };
  const ORDER = ['bronze', 'silver', 'gold', 'legend', 'jack'];
  const MIN_R = 78;
  const LEAGUES = ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'Лига 1'];
  const POS = { ГК: 'ВРТ' };

  let ALL = null, BY = null;
  function all() {
    if (ALL) return ALL;
    const cur = PLAYERS.filter((p) => FACES[p.name] && FC_STATS[p.name] && FC_STATS[p.name][0] >= MIN_R).map((p) => {
      const r = FC_STATS[p.name][0];
      return { key: p.name, name: p.name, r, pos: POS[p.pos] || p.pos, club: p.club, flag: p.flag, lg: p.lg, face: FACES[p.name], rar: r >= 84 ? 'gold' : r >= 80 ? 'silver' : 'bronze' };
    });
    const legs = CARD_LEGENDS.map(([name, r, club, pos]) => ({ key: name, name, r, pos, club, flag: '', lg: 'Легенды', face: FACES[name], rar: 'legend' }));
    // «Джексон»: особые версии лучших — 12 действующих и 6 легенд, рейтинг выше обычного
    const top = (list, k) => list.slice().sort((a, b) => b.r - a.r).slice(0, k);
    const jack = [...top(cur, 12), ...top(legs, 6)].map((c) => ({ ...c, key: 'J:' + c.name, r: Math.min(99, c.r + 4), rar: 'jack' }));
    ALL = [...cur, ...legs, ...jack];
    BY = Object.fromEntries(ALL.map((c) => [c.key, c]));
    return ALL;
  }
  const get = (key) => { all(); return BY[key]; };

  const S = () => {
    const d = Store.d;
    if (!d.cards || typeof d.cards !== 'object') d.cards = {};
    if (!d.cards.own) d.cards.own = {};
    if (!Array.isArray(d.cards.fresh)) d.cards.fresh = [];
    return d.cards;
  };
  const owned = (key) => S().own[key] || 0;
  const count = () => Object.keys(S().own).filter((k) => BY && BY[k] || get(k)).length;

  // ---------- что выпадает ----------
  function draw(rar) {
    const pool = all().filter((c) => c.rar === rar);
    const fresh = pool.filter((c) => !owned(c.key));
    // половина шанса — карточка, которой ещё нет: коллекция растёт заметно
    const from = fresh.length && Math.random() < 0.5 ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }
  function roll(w) { let x = Math.random() * w.reduce((s, [, v]) => s + v, 0); for (const [k, v] of w) { x -= v; if (x <= 0) return k; } return w[0][0]; }
  // по уровню пака: сколько карточек и какая гарантирована
  const PACKS = [
    { n: 2, w: [['bronze', 75], ['silver', 25]] },
    { n: 3, sure: 'silver', w: [['bronze', 55], ['silver', 38], ['gold', 7]] },
    { n: 3, sure: 'gold', w: [['bronze', 45], ['silver', 40], ['gold', 15]] },
    { n: 4, sure: 'legend', w: [['bronze', 35], ['silver', 40], ['gold', 25]] },
    { n: 5, sure: 'jack', w: [['silver', 40], ['gold', 45], ['legend', 15]] },
  ];
  function packCards(lv) {
    const P = PACKS[Math.max(0, Math.min(4, lv))];
    const out = [];
    if (P.sure) out.push(draw(P.sure).key);
    while (out.length < P.n) out.push(draw(roll(P.w)).key);
    return out;
  }
  // записать в коллекцию; вернуть, что новое, а что повтор (повтор — монеты)
  function add(keys) {
    const s = S();
    const res = keys.map((k) => {
      const c = get(k); if (!c) return null;
      const isNew = !s.own[k];
      s.own[k] = (s.own[k] || 0) + 1;
      if (isNew && !s.fresh.includes(k)) s.fresh.push(k);
      return { c, isNew, coins: isNew ? 0 : RAR[c.rar].dup };
    }).filter(Boolean);
    Store.save();
    return res;
  }

  // ---------- вид карточки ----------
  const col = (club) => (typeof CLUB_COL !== 'undefined' && CLUB_COL[club]) || ['#3b4f8f', '#141a3a'];
  const img = (id) => (FACE_DATA[id] || `img/cards/${id}.webp`);
  // на плашке — фамилия; «ван Дейк» целиком, короткие тройные имена («Сон Хын Мин») — полностью
  const surname = (n) => {
    const w = n.split(' ');
    if (w.length < 2) return n;
    if (w.length > 2 && !/^[a-zа-яё]/.test(w[1])) return n.length <= 12 ? n : w[w.length - 1];
    return w.slice(1).join(' ');
  };
  function html(c, { w = 150, locked = false, cls = '' } = {}) {
    if (!c) return '';
    if (locked) return `<div class="cc lock ${cls}" style="--w:${w}px"><div class="cc-ph"></div><span class="cc-sil"></span><div class="cc-r">??</div><div class="cc-band"><b>???</b><small>${RAR[c.rar].n}</small></div></div>`;
    const [k1, k2] = col(c.club), cr = CRESTS[c.club];
    return `<div class="cc ${c.rar} ${cls}" style="--w:${w}px;--k1:${k1};--k2:${k2}" data-card="${esc(c.key)}">
      <div class="cc-ph"></div><img class="cc-face" src="${img(c.face)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='img/players/${c.face}.webp'">
      <div class="cc-r">${c.r}<small>${esc(c.pos)}</small></div>${cr ? `<img class="cc-cr" src="img/clubs/${cr}" alt="" loading="lazy">` : ''}
      <div class="cc-band"><b>${esc(surname(c.name))}</b><small>${c.flag ? c.flag + ' ' : ''}${RAR[c.rar].n}</small></div></div>`;
  }

  // ---------- раскрытие паков: карточки по одной, лучшая — последней ----------
  function reveal(res, onDone) {
    if (!res.length) { onDone && onDone(); return; }
    const list = res.slice().sort((a, b) => ORDER.indexOf(a.c.rar) - ORDER.indexOf(b.c.rar) || a.c.r - b.c.r);
    const el = document.createElement('div');
    el.className = 'cr-wrap';
    el.innerHTML = `<div class="cr-bg"></div><div class="cr-top"><span class="cr-cnt"></span></div><div class="cr-stage"></div><div class="cr-row"></div>
      <p class="cr-hint">Нажми, чтобы открыть</p><button class="btn gold cr-done" hidden>В коллекцию</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    let i = -1, busy = false;
    const stage = $('.cr-stage', el), row = $('.cr-row', el);
    function next() {
      if (busy) return;
      if (i >= 0) { const prev = list[i]; row.insertAdjacentHTML('beforeend', html(prev.c, { w: 54, cls: 'mini' })); }
      i++;
      if (i >= list.length) return finish();
      busy = true;
      const r = list[i];
      $('.cr-cnt', el).textContent = `${i + 1} / ${list.length}`;
      el.dataset.rar = r.c.rar;
      stage.innerHTML = `<div class="cr-flip"><div class="cr-back"><span>Д</span></div><div class="cr-front">${html(r.c, { w: 210 })}</div></div>
        <div class="cr-tag ${r.isNew ? 'new' : ''}">${r.isNew ? 'НОВАЯ!' : `Повтор · +${r.coins}`}${r.isNew ? '' : ' <i class="coin"></i>'}</div>`;
      Sound.play('tap'); haptic('tap');
      setTimeout(() => {
        stage.classList.add('open');
        const big = r.c.rar === 'legend' || r.c.rar === 'jack';
        Sound.play(big ? 'goal' : r.c.rar === 'gold' ? 'coin' : 'token');
        haptic(big ? 'ok' : 'pop');
        if (big && typeof confetti === 'function') confetti();
        setTimeout(() => { busy = false; }, 380);
      }, 260);
      stage.classList.remove('open');
    }
    function finish() {
      stage.innerHTML = ''; el.classList.add('fin'); $('.cr-hint', el).hidden = true; $('.cr-done', el).hidden = false;
      const nNew = list.filter((x) => x.isNew).length, coins = list.reduce((s, x) => s + x.coins, 0);
      $('.cr-cnt', el).textContent = `${nNew ? `Новых: ${nNew}` : 'Новых нет'}${coins ? ` · за повторы +${coins}` : ''}`;
    }
    function close() { el.classList.add('out'); setTimeout(() => el.remove(), 260); onDone && onDone(); }
    el.addEventListener('click', (e) => { if (e.target.closest('.cr-done')) return close(); if (!el.classList.contains('fin')) next(); });
    next();
  }

  // ---------- галерея как в EA FC: лиги → клубы → игроки; собрал клуб или лигу — награда ----------
  const GROUPS = [...LEAGUES, 'Другие', 'Легенды', 'Джексон'];
  const GROUP_ICO = { 'АПЛ': '🦁', 'Ла Лига': '🇪🇸', 'Серия А': '🇮🇹', 'Бундеслига': '🇩🇪', 'Лига 1': '🇫🇷', 'Другие': '🌍', 'Легенды': '👑', 'Джексон': '🔥' };
  const groupOf = (c) => (c.rar === 'legend' ? 'Легенды' : c.rar === 'jack' ? 'Джексон' : LEAGUES.includes(c.lg) ? c.lg : 'Другие');
  // награда за клуб — по числу карточек в нём; за лигу — легендарный пак и монеты
  const clubPrize = (n) => (n <= 1 ? { coins: 30 } : n <= 3 ? { coins: 75 } : n <= 7 ? { pack: 0 } : n <= 12 ? { pack: 1 } : n <= 16 ? { pack: 2 } : { pack: 3 });
  const groupPrize = (g) => (g === 'Джексон' ? { pack: 4, coins: 2000 } : g === 'Легенды' ? { pack: 4, coins: 1000 } : { pack: 4, coins: 500 });
  const PACKN = ['пак', 'сверхредкий пак', 'эпический пак', 'легендарный пак', 'пак «ДЖЕКСОН!!»'];
  const prizeTxt = (r) => [r.pack !== undefined ? PACKN[r.pack] : '', r.coins ? `${r.coins} монет` : ''].filter(Boolean).join(' + ');
  const prizeChip = (r) => `<span class="gl-prize">${r.pack !== undefined ? `<i class="rw-pk" style="--c:${['#3ee66b', '#4fc3ff', '#c27bff', '#ffcf3a', '#ff3b5c'][r.pack]}"></i>` : ''}${r.coins ? `<i class="coin"></i>${r.coins}` : ''}</span>`;
  const claimed = () => { const s = S(); if (!Array.isArray(s.sets)) s.sets = []; return s.sets; };
  function sets(group) {
    const list = all().filter((c) => groupOf(c) === group);
    if (group === 'Джексон') return [{ club: '', cards: list }];
    const by = {};
    list.forEach((c) => { (by[c.club] = by[c.club] || []).push(c); });
    return Object.entries(by).map(([club, cards]) => ({ club, cards: cards.sort((a, b) => b.r - a.r) })).sort((a, b) => b.cards.length - a.cards.length || a.club.localeCompare(b.club));
  }
  const have = (cards) => cards.filter((c) => owned(c.key)).length;
  const bar = (h, n, cls = '') => `<span class="gl-bar ${cls}"><i style="width:${n ? Math.round((h / n) * 100) : 0}%"></i></span>`;
  function claimBtn(id, done, prize) {
    if (claimed().includes(id)) return '<span class="gl-got">✓ Получено</span>';
    if (done) return `<button class="btn gold gl-claim" data-claim="${esc(id)}">Забрать</button>`;
    return prizeChip(prize);
  }
  let view = { g: '', club: null }, jump = false;
  function album() {
    const total = all().length, got = count();
    let out = `<div class="cl-head"><b>Галерея</b><small>${got} / ${total}</small></div>${bar(got, total, 'cl-bar')}`;
    if (!view.g) {
      out += `<div class="gl-list">${GROUPS.map((g) => {
        const cards = all().filter((c) => groupOf(c) === g), h = have(cards), id = 'g:' + g;
        return `<button class="gl-row" data-gl="${esc(g)}"><span class="gl-ico">${GROUP_ICO[g]}</span><span class="gl-mid"><b>${g}</b>${bar(h, cards.length)}<small>${h} / ${cards.length}${g === 'Джексон' ? '' : ` · клубов ${sets(g).length}`}</small></span>${claimBtn(id, h === cards.length, groupPrize(g))}</button>`;
      }).join('')}</div><p class="rw-note">Собери всех игроков клуба — получишь пак. Собери всю лигу — пак «ДЖЕКСОН!!» и монеты.</p>`;
      return out;
    }
    const g = view.g, all_ = all().filter((c) => groupOf(c) === g), hg = have(all_);
    if (view.club === null && g !== 'Джексон') {
      out += `<div class="gl-top"><button class="gl-back" data-glback="1">← Лиги</button><span class="gl-ttl">${GROUP_ICO[g]} ${g}</span></div>
        <div class="gl-sum"><span>${hg} / ${all_.length}${bar(hg, all_.length)}</span><span class="gl-for">За всю лигу: ${prizeTxt(groupPrize(g))}</span>${claimBtn('g:' + g, hg === all_.length, groupPrize(g))}</div>
        <div class="gl-clubs">${sets(g).map(({ club, cards }) => {
          const h = have(cards), cr = CRESTS[club], id = `c:${g}:${club}`, done = h === cards.length;
          return `<button class="gl-club ${done ? 'done' : ''} ${claimed().includes(id) ? 'got' : ''}" data-glc="${esc(club)}">
            ${cr ? `<img src="img/clubs/${cr}" alt="" loading="lazy">` : '<span class="gl-noc">⚽</span>'}<b>${esc(club)}</b>${bar(h, cards.length)}<small>${h}/${cards.length}</small>
            ${done && !claimed().includes(id) ? '<i class="gl-dot">!</i>' : claimed().includes(id) ? '<i class="gl-ok">✓</i>' : ''}</button>`;
        }).join('')}</div>`;
      return out;
    }
    const set = g === 'Джексон' ? sets(g)[0] : sets(g).find((x) => x.club === view.club) || { club: '', cards: [] };
    const h = have(set.cards), id = g === 'Джексон' ? 'g:Джексон' : `c:${g}:${set.club}`;
    const prize = g === 'Джексон' ? groupPrize(g) : clubPrize(set.cards.length), cr = CRESTS[set.club];
    const fresh = S().fresh;
    out += `<div class="gl-top"><button class="gl-back" data-glback="1">← ${g === 'Джексон' ? 'Лиги' : g}</button><span class="gl-ttl">${cr ? `<img src="img/clubs/${cr}" alt="">` : GROUP_ICO[g]} ${esc(set.club || g)}</span></div>
      <div class="gl-sum"><span>${h} / ${set.cards.length}${bar(h, set.cards.length)}</span><span class="gl-for">Награда: ${prizeTxt(prize)}</span>${claimBtn(id, h === set.cards.length, prize)}</div>
      <div class="cl-grid">${set.cards.map((c) => `<div class="cl-cell">${owned(c.key) ? html(c, { w: 102 }) + (owned(c.key) > 1 ? `<i class="cl-n">×${owned(c.key)}</i>` : '') + (fresh.includes(c.key) ? '<i class="cl-new">NEW</i>' : '') : html(c, { w: 102, locked: true })}</div>`).join('')}</div>`;
    return out;
  }
  function claim(id) {
    const cl = claimed(); if (cl.includes(id)) return;
    let cards, prize;
    if (id.startsWith('g:')) { const g = id.slice(2); cards = all().filter((c) => groupOf(c) === g); prize = groupPrize(g); }
    else { const [, g, ...rest] = id.split(':'); const club = rest.join(':'); const set = sets(g).find((x) => x.club === club); if (!set) return; cards = set.cards; prize = clubPrize(cards.length); }
    if (have(cards) < cards.length) return;
    cl.push(id); Store.save(); Sound.play('goal'); haptic('ok'); if (typeof confetti === 'function') confetti();
    if (prize.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(prize.coins); }
    if (prize.pack !== undefined) Rewards.openDrop({ title: id.startsWith('g:') ? `СОБРАНО: ${id.slice(2).toUpperCase()}` : `КЛУБ СОБРАН: ${id.split(':').slice(2).join(':').toUpperCase()}`, minLevel: prize.pack });
    else toast(`Клуб собран! +${prize.coins} монет`);
  }
  // сколько наград за наборы ждут
  function readySets() {
    let n = 0;
    for (const g of GROUPS) {
      const cards = all().filter((c) => groupOf(c) === g);
      if (have(cards) === cards.length && !claimed().includes('g:' + g)) n++;
      if (g !== 'Джексон') sets(g).forEach(({ club, cards: cc }) => { if (have(cc) === cc.length && !claimed().includes(`c:${g}:${club}`)) n++; });
    }
    return n;
  }
  function details(key) {
    const c = get(key); if (!c) return;
    const st = FC_STATS[c.name];
    const names = c.pos === 'ВРТ' ? ['ПРЫ', 'РУК', 'ВЫБ', 'РЕА', 'СКР', 'ПОЗ'] : ['СКР', 'УДР', 'ПАС', 'ДРБ', 'ЗАЩ', 'ФИЗ'];
    const stats = st ? `<div class="cd-st">${names.map((n, i) => `<span><b>${st[i + 1]}</b>${n}</span>`).join('')}</div>` : '';
    const s = S(); s.fresh = s.fresh.filter((k) => k !== key); Store.save();
    Modal.open(`<div class="cd">${html(c, { w: 220 })}<h2>${esc(c.name)}</h2><p class="cd-m">${esc(c.club)}${c.rar === 'legend' || c.rar === 'jack' ? '' : ` · ${esc(c.lg || '')}`}</p>${stats}
      <p class="cd-own">В коллекции: ×${owned(key)} · повтор даёт +${RAR[c.rar].dup} <i class="coin"></i></p></div>`, [{ label: 'Закрыть', cls: 'ghost' }]);
  }
  function onClick(e) {
    const g = e.target.closest('[data-gl]'); if (g) { view = { g: g.dataset.gl, club: null }; Sound.play('tap'); jump = true; return true; }
    const c = e.target.closest('[data-glc]'); if (c) { view = { ...view, club: c.dataset.glc }; Sound.play('tap'); jump = true; return true; }
    if (e.target.closest('[data-glback]')) { view = view.club !== null ? { g: view.g, club: null } : { g: '', club: null }; if (view.g === 'Джексон') view = { g: '', club: null }; Sound.play('tap'); jump = true; return true; }
    const cl = e.target.closest('[data-claim]'); if (cl) { claim(cl.dataset.claim); return true; }
    const k = e.target.closest('.cl-cell [data-card]'); if (k) { details(k.dataset.card); return 'modal'; }
    return false;
  }

  return { takeJump: () => { const j = jump; jump = false; return j; }, all, get, draw, packCards, add, html, reveal, album, onClick, readySets, count, total: () => all().length, freshN: () => S().fresh.length, RAR };
})();
