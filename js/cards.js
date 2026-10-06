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

  // ---------- альбом ----------
  const FILTERS = [['all', 'Все'], ...LEAGUES.map((l) => [l, l]), ['other', 'Другие'], ['legend', 'Легенды'], ['jack', 'Джексон']];
  let filter = 'all', shown = 48;
  function inFilter(c) {
    if (filter === 'all') return true;
    if (filter === 'legend') return c.rar === 'legend';
    if (filter === 'jack') return c.rar === 'jack';
    if (c.rar === 'legend' || c.rar === 'jack') return false;
    if (filter === 'other') return !LEAGUES.includes(c.lg);
    return c.lg === filter;
  }
  function album() {
    const list = all().filter(inFilter);
    const mine = list.filter((c) => owned(c.key)).sort((a, b) => ORDER.indexOf(b.rar) - ORDER.indexOf(a.rar) || b.r - a.r);
    const rest = list.filter((c) => !owned(c.key)).sort((a, b) => ORDER.indexOf(a.rar) - ORDER.indexOf(b.rar) || a.r - b.r);
    const items = [...mine, ...rest].slice(0, shown);
    const total = all().length, have = count();
    const fresh = S().fresh;
    return `<div class="cl-head"><b>Коллекция</b><small>${have} / ${total}</small></div>
      <span class="rw-bar cl-bar"><i style="width:${Math.max(1, (have / total) * 100)}%"></i></span>
      <nav class="cl-chips">${FILTERS.map(([k, n]) => `<button data-clf="${k}" class="${filter === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
      <div class="cl-grid">${items.map((c) => `<div class="cl-cell">${owned(c.key) ? html(c, { w: 102 }) + (owned(c.key) > 1 ? `<i class="cl-n">×${owned(c.key)}</i>` : '') + (fresh.includes(c.key) ? '<i class="cl-new">NEW</i>' : '') : html(c, { w: 102, locked: true })}</div>`).join('')}</div>
      ${list.length > shown ? `<button class="btn ghost cl-more" data-clmore="1">Показать ещё (${list.length - shown})</button>` : ''}
      ${have ? '' : '<p class="rw-note">Карточки выпадают из паков: за победы, на дороге трофеев и в пропуске.</p>'}`;
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
    const f = e.target.closest('[data-clf]'); if (f) { filter = f.dataset.clf; shown = 48; Sound.play('tap'); return true; }
    if (e.target.closest('[data-clmore]')) { shown += 48; return true; }
    const c = e.target.closest('.cl-cell [data-card]'); if (c) { details(c.dataset.card); return 'modal'; }
    return false;
  }

  return { all, get, draw, packCards, add, html, reveal, album, onClick, count, total: () => all().length, freshN: () => S().fresh.length, RAR };
})();
