// ИПК — испытания по комплектованию состава, как в FUT: сдай карточки из клуба по условиям — получи пак или игрока.
// Сданные карточки уходят из клуба (свободные копии), но в галерее игрок остаётся навсегда.
'use strict';

const SBC = (() => {
  const LEAGUES = ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'Лига 1'];
  const GOLDUP = ['gold', 'legend', 'jack'];
  const RAR_RU = { bronze: 'бронзовые', silver: 'серебряные', gold: 'золотые', legend: 'легенды', jack: '«Джексон»' };
  const PACKNAME = ['Пак', 'Сверхредкий пак', 'Эпический пак', 'Легендарный пак', 'Пак «ДЖЕКСОН!!»'];
  const PACKSHORT = ['Обычный', 'Сверхредкий', 'Эпический', 'Легендарный', 'ДЖЕКСОН!!'];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, k, o) => (el && el.animate && !reduce ? el.animate(k, o) : null);

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const wk = () => Release.weekKey();
  const weekEnd = () => Release.at(new Date(Date.parse(wk()) + 7 * 864e5).toISOString().slice(0, 10));
  const dayEnd = () => Date.parse(Day.key(1)) - 3 * 3600e3;
  const left = (t) => {
    const m = Math.max(0, Math.round((t - Date.now()) / 6e4)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? `${d} дн. ${h} ч.` : h ? `${h} ч. ${m % 60} мин.` : `${m % 60} мин.`;
  };

  const S = () => {
    const d = Store.d;
    if (!d.sbc || typeof d.sbc !== 'object') d.sbc = {};
    if (!d.sbc.done) d.sbc.done = {};
    return d.sbc;
  };
  const doneN = (id) => S().done[id] || 0;

  // ---------- испытания ----------
  let cache = null;
  function defs() {
    const W = wk(), D = Day.key();
    if (cache && cache.key === W + D) return cache.list;
    const L = LEAGUES[hash(W) % LEAGUES.length];
    const jacks = Cards.all().filter((c) => c.rar === 'jack');
    const lgJ = jacks.filter((c) => c.lg === L), pool = lgJ.length ? lgJ : jacks;
    const star = pool.length ? pool[hash(W + 'star') % pool.length] : null;
    const dl = LEAGUES[hash(D) % LEAGUES.length];
    const dayReq = [
      [{ t: 'same', k: 'lg', min: 3 }],
      [{ t: 'from', k: 'lg', v: dl, min: 2 }],
      [{ t: 'rating', v: 74 }],
      [{ t: 'rar', in: GOLDUP, min: 1 }],
      [{ t: 'diff', k: 'club', min: 3 }],
    ][hash(D + 'q') % 5];
    const list = [
      { id: 'day:' + D, cat: 'day', ico: '⏱', title: 'Испытание дня', desc: 'Три карточки — сверхредкий пак. Новое каждый день.', n: 3, req: dayReq, reward: { pack: 1 }, limit: 1, ends: dayEnd() },
      star && { id: 'pl:' + W, cat: 'pl', group: true, ico: '⭐', title: `Игрок недели: ${Cards.surname(star.name)}`, desc: `Пройди три испытания — получи карточку «Джексон» ${star.name}.`, reward: { card: star.key }, ends: weekEnd(), limit: 1,
        items: [
          { id: `pl:${W}:1`, ico: '🏟', title: `Лига недели: ${L}`, desc: `Собери состав с игроками ${L}`, n: 5, req: [{ t: 'from', k: 'lg', v: L, min: 3 }, { t: 'rating', v: 74 }], reward: { coins: 300 }, limit: 1 },
          { id: `pl:${W}:2`, ico: '🔥', title: 'Топ-форма', desc: 'Семь игроков, минимум трое — золото', n: 7, req: [{ t: 'rar', in: GOLDUP, min: 3 }, { t: 'rating', v: 77 }], reward: { pack: 1 }, limit: 1 },
          { id: `pl:${W}:3`, ico: '🌟', title: 'Звёздный состав', desc: 'Полный состав с высоким рейтингом', n: 11, req: [{ t: 'rating', v: 80 }], reward: { pack: 2 }, limit: 1 },
        ] },
      { id: 'up:b', cat: 'up', ico: '🥉', title: 'Бронзовое улучшение', desc: 'Сдай четыре бронзовые — получи пак с гарантированным серебром.', n: 4, req: [{ t: 'only', in: ['bronze'] }], reward: { pack: 1 }, limit: 0 },
      { id: 'up:s', cat: 'up', ico: '🥈', title: 'Серебряное улучшение', desc: 'Четыре серебряные — пак с гарантированным золотом.', n: 4, req: [{ t: 'only', in: ['silver'] }], reward: { pack: 2 }, limit: 0 },
      { id: 'up:g', cat: 'up', ico: '🥇', title: 'Улучшение 80+', desc: 'Пять золотых — пак с гарантированной легендой.', n: 5, req: [{ t: 'only', in: GOLDUP }, { t: 'rating', v: 80 }], reward: { pack: 3 }, limit: 0 },
      { id: 'up:j:' + W, cat: 'up', ico: '🔴', title: 'Пак «ДЖЕКСОН!!»', desc: 'Лучший пак игры. Раз в неделю.', n: 11, req: [{ t: 'rating', v: 82 }, { t: 'rar', in: ['legend', 'jack'], min: 1 }], reward: { pack: 4 }, limit: 1, ends: weekEnd() },
      { id: 'b:first', cat: 'base', ico: '1', title: 'Первый состав', desc: 'Любые три карточки — начни с простого.', n: 3, req: [], reward: { coins: 150 }, limit: 1 },
      { id: 'b:league', cat: 'base', ico: '2', title: 'Одна лига', desc: 'Все пятеро — из одной лиги.', n: 5, req: [{ t: 'same', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:nation', cat: 'base', ico: '3', title: 'Одна сборная', desc: 'Четыре игрока одной страны.', n: 4, req: [{ t: 'same', k: 'nat', min: 4 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:club', cat: 'base', ico: '4', title: 'Клубные связи', desc: 'Трое из одного клуба.', n: 3, req: [{ t: 'same', k: 'club', min: 3 }], reward: { pack: 2 }, limit: 1 },
      { id: 'b:five', cat: 'base', ico: '5', title: 'Пять лиг', desc: 'Пятеро из пяти разных лиг.', n: 5, req: [{ t: 'diff', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:gold', cat: 'base', ico: '6', title: 'Золотой стандарт', desc: 'Полный состав с рейтингом 78.', n: 11, req: [{ t: 'rating', v: 78 }], reward: { pack: 3 }, limit: 1 },
    ].filter(Boolean);
    cache = { key: W + D, list };
    // старые дневные и недельные отметки больше не нужны
    const keep = new Set(); list.forEach((x) => { keep.add(x.id); (x.items || []).forEach((i) => keep.add(i.id)); });
    const done = S().done; Object.keys(done).forEach((k) => { if (/^(day|pl|up:j):/.test(k) && !keep.has(k)) delete done[k]; });
    return list;
  }
  function find(id) {
    for (const x of defs()) { if (x.id === id) return x; const i = (x.items || []).find((y) => y.id === id); if (i) return { ...i, parent: x }; }
    return null;
  }
  const closed = (x) => x.limit && doneN(x.id) >= x.limit;
  const groupDone = (g) => g.items.filter((i) => doneN(i.id)).length;

  // ---------- условия ----------
  function rating(sq) {
    const rs = sq.filter(Boolean).map((c) => c.r); if (!rs.length) return 0;
    const n = rs.length, sum = rs.reduce((a, b) => a + b, 0), avg = sum / n;
    return Math.floor((sum + rs.reduce((s, r) => s + Math.max(0, r - avg), 0)) / n);
  }
  const vals = (sq, k) => sq.filter(Boolean).map((c) => c[k]).filter(Boolean);
  function test(r, sq, n) {
    const f = sq.filter(Boolean);
    if (r.t === 'rating') return { ok: f.length === n && rating(f) >= r.v, now: f.length ? rating(f) : 0 };
    if (r.t === 'only') return { ok: f.length > 0 && f.every((c) => r.in.includes(c.rar)), bad: f.some((c) => !r.in.includes(c.rar)) };
    if (r.t === 'rar') { const k = f.filter((c) => r.in.includes(c.rar)).length; return { ok: k >= r.min, now: k }; }
    if (r.t === 'from') { const k = f.filter((c) => c[r.k] === r.v).length; return { ok: k >= r.min, now: k }; }
    if (r.t === 'same') { const m = {}; vals(f, r.k).forEach((v) => { m[v] = (m[v] || 0) + 1; }); const k = Math.max(0, ...Object.values(m)); return { ok: k >= r.min, now: k }; }
    if (r.t === 'diff') { const k = new Set(vals(f, r.k)).size; return { ok: k >= r.min, now: k }; }
    return { ok: true };
  }
  const KN = { lg: ['одной лиги', 'Разных лиг'], club: ['одного клуба', 'Разных клубов'], nat: ['одной страны', 'Разных стран'] };
  function label(r) {
    if (r.t === 'rating') return `Рейтинг команды: мин. ${r.v}`;
    if (r.t === 'only') return r.in === GOLDUP ? 'Только золотые и выше' : `Только ${r.in.map((x) => RAR_RU[x]).join(', ')}`;
    if (r.t === 'rar') return `${r.in === GOLDUP ? 'Золотые и выше' : r.in.map((x) => RAR_RU[x]).join(' или ').replace(/^./, (s) => s.toUpperCase())}: мин. ${r.min}`;
    if (r.t === 'from') return `Игроки ${r.v}: мин. ${r.min}`;
    if (r.t === 'same') return `Игроки из ${KN[r.k][0]}: мин. ${r.min}`;
    if (r.t === 'diff') return `${KN[r.k][1]}: мин. ${r.min}`;
    return '';
  }
  const allOk = (ch, sq) => sq.filter(Boolean).length === ch.n && ch.req.every((r) => test(r, sq, ch.n).ok);

  // ---------- автосбор: самые «дешёвые» карточки, сначала повторы ----------
  const avail = () => Cards.all().filter((c) => Cards.spare(c.key) > 0);
  const cost = (c) => c.r + (Cards.spare(c.key) > 1 ? -25 : 0) + ({ legend: 40, jack: 60 }[c.rar] || 0);
  function autofill(ch, keep = []) {
    const only = ch.req.find((r) => r.t === 'only');
    let rest = avail().filter((c) => !only || only.in.includes(c.rar)).sort((a, b) => cost(a) - cost(b));
    const sq = keep.filter(Boolean).map((k) => Cards.get(k)).filter(Boolean);
    rest = rest.filter((c) => !sq.some((x) => x.key === c.key));
    const take = (c) => { if (!c || sq.length >= ch.n) return false; sq.push(c); rest.splice(rest.indexOf(c), 1); return true; };
    for (const r of ch.req) {
      if (r.t === 'from') while (test(r, sq, ch.n).now < r.min && take(rest.find((c) => c[r.k] === r.v)));
      if (r.t === 'rar') while (test(r, sq, ch.n).now < r.min && take(rest.find((c) => r.in.includes(c.rar))));
      if (r.t === 'diff') while (test(r, sq, ch.n).now < r.min) { const have = new Set(vals(sq, r.k)); if (!take(rest.find((c) => c[r.k] && !have.has(c[r.k])))) break; }
      if (r.t === 'same') {
        const need = r.min - test(r, sq, ch.n).now; if (need <= 0) continue;
        const groups = {}; rest.forEach((c) => { if (c[r.k]) (groups[c[r.k]] = groups[c[r.k]] || []).push(c); });
        const inSq = {}; vals(sq, r.k).forEach((v) => { inSq[v] = (inSq[v] || 0) + 1; });
        let best = null;
        Object.entries(groups).forEach(([v, cs]) => {
          const want = r.min - (inSq[v] || 0); if (cs.length < want || sq.length + want > ch.n) return;
          const sum = cs.slice(0, want).reduce((s, c) => s + cost(c), 0);
          if (!best || sum < best.sum) best = { sum, cs: cs.slice(0, want) };
        });
        if (best) best.cs.forEach(take);
      }
    }
    while (sq.length < ch.n && take(rest[0]));
    // рейтинг: меняем слабейшего на ближайшего посильнее, пока не хватит
    const rq = ch.req.find((r) => r.t === 'rating'), other = ch.req.filter((r) => r.t !== 'rating');
    let guard = 0;
    while (rq && sq.length === ch.n && rating(sq) < rq.v && guard++ < 300) {
      let best = null;
      const order = sq.map((_, i) => i).sort((a, b) => sq[a].r - sq[b].r);
      for (const i of order) {
        for (const c of rest) {
          if (c.r <= sq[i].r) continue;
          const s2 = sq.slice(); s2[i] = c;
          if (other.every((r) => test(r, s2, ch.n).ok || !test(r, sq, ch.n).ok)) { best = [i, c]; break; }
        }
        if (best) break;
      }
      if (!best) break;
      const [i, c] = best; rest.splice(rest.indexOf(c), 1); rest.push(sq[i]); rest.sort((a, b) => cost(a) - cost(b)); sq[i] = c;
    }
    sq.sort((a, b) => b.r - a.r);
    return sq.map((c) => c.key);
  }

  // ---------- вид ----------
  const packArt = (lv, sm) => `<span class="fpk p${lv} ${sm ? 'sm' : ''}"><i class="fpk-sh"></i><b>JX</b><em>${PACKSHORT[lv]}</em></span>`;
  function art(r, sm) {
    if (r.pack !== undefined) return packArt(r.pack, sm);
    if (r.card) { const c = Cards.get(r.card); return c ? Cards.html(c, { w: sm ? 52 : 104, cls: 'fx-cc' }) : ''; }
    if (r.coins) return `<span class="fx-coins ${sm ? 'sm' : ''}"><i class="coin"></i><i class="coin"></i><i class="coin"></i><b>${r.coins}</b></span>`;
    return '';
  }
  const rewardTxt = (r) => (r.pack !== undefined ? `x1 ${PACKNAME[r.pack]}` : r.card ? `x1 ${(Cards.get(r.card) || {}).name || 'Игрок'} («Джексон»)` : `${r.coins} монет`);

  function card(x, i) {
    const isG = !!x.items, nDone = isG ? groupDone(x) : doneN(x.id), cl = closed(x);
    const prog = isG
      ? `<div class="fx-prog"><span class="fx-bar"><i style="width:${(nDone / x.items.length) * 100}%"></i></span><small>${nDone} из ${x.items.length} ИПК</small></div>`
      : x.limit ? (x.limit > 1 ? `<div class="fx-prog"><small>Выполнено: ${nDone}/${x.limit}</small></div>` : '') : (nDone ? `<div class="fx-prog"><small>Выполнено ${nDone} ${plural(nDone, 'раз', 'раза', 'раз')}</small></div>` : '');
    const reqLine = !isG && x.req.length ? `<div class="fx-req">${x.req.map(label).join(' · ')}</div>` : '';
    return `<button class="fx-card ${cl ? 'done' : ''} ${isG ? 'grp' : ''}" data-sbo="${x.id}" style="--i:${i}">
      <div class="fx-h"><span class="fx-ico">${x.ico}</span><b>${esc(x.title)}</b>${x.limit ? '' : '<i class="fx-rep" title="Повторяется">↻</i>'}</div>
      <div class="fx-m"><div class="fx-l"><p>${esc(x.desc)}</p>${reqLine}${prog}<div class="fx-rw"><small>${isG ? 'Награды группы' : 'Награда'}</small><b>${esc(rewardTxt(x.reward))}</b></div></div>
        <div class="fx-art">${art(x.reward)}</div></div>
      <div class="fx-f">${cl ? '<span class="fx-ok">✓ Выполнено</span>' : `<span><i class="fx-ic">${x.limit ? '⊘' : '↻'}</i>${x.limit ? 'Не повторяется' : 'Повторяется'}</span>`}${x.ends ? `<span><i class="fx-ic">⏱</i>Истекает через: ${left(x.ends)}</span>` : `<span>${x.n ? `${x.n} ${plural(x.n, 'игрок', 'игрока', 'игроков')}` : ''}</span>`}</div>
    </button>`;
  }

  let view = { mode: 'list', tab: 'all' }, cur = null, sheet = null;
  const TABS = [['all', 'Все'], ['pl', 'Игроки'], ['up', 'Улучшения'], ['base', 'Основы']];
  function listHTML() {
    const L = defs().filter((x) => view.tab === 'all' || x.cat === view.tab || (view.tab === 'up' && x.cat === 'day'));
    const sorted = L.slice().sort((a, b) => (closed(a) ? 1 : 0) - (closed(b) ? 1 : 0));
    return `<nav class="fx-tabs">${TABS.map(([k, n]) => `<button class="${view.tab === k ? 'on' : ''}" data-sbt="${k}">${n}</button>`).join('')}</nav>
      <div class="fx-club"><span>В клубе <b>${avail().reduce((s, c) => s + Cards.spare(c.key), 0)}</b> ${plural(avail().length, 'карточка', 'карточки', 'карточек')}</span><small>Сданные игроки остаются в галерее</small></div>
      <div class="fx-list">${sorted.map(card).join('')}</div>`;
  }
  function groupHTML(g) {
    const n = groupDone(g), got = closed(g);
    return `<div class="fx-gh">
        <div class="fx-gl"><b>${esc(g.title)}</b><p>${esc(g.desc)}</p>
          <div class="fx-prog"><span class="fx-bar"><i style="width:${(n / g.items.length) * 100}%"></i></span><small>${n} из ${g.items.length} ИПК</small></div>
          <div class="fx-f"><span><i class="fx-ic">⏱</i>Истекает через: ${left(g.ends)}</span></div></div>
        <div class="fx-gart ${got ? 'got' : ''}">${art(g.reward)}${got ? '<i class="fx-gok">✓</i>' : ''}</div></div>
      <div class="fx-list">${g.items.map((x, i) => card(x, i)).join('')}</div>`;
  }
  const rows = (n) => ({ 3: [3], 4: [2, 2], 5: [3, 2], 7: [3, 2, 2], 11: [3, 3, 4, 1] }[n] || [n]);
  let lastOk = {};
  function chHTML(ch) {
    const sq = cur.sq.map((k) => k && Cards.get(k)), f = sq.filter(Boolean), r = rating(f);
    const R = rows(ch.n), maxRow = Math.max(...R), W = (($('#sbc-body') || {}).clientWidth || innerWidth) - 24 - 12;
    const w = Math.max(50, Math.min(92, Math.floor((W - 8 * (maxRow - 1)) / maxRow)));
    let k = 0;
    const pitch = R.map((cnt) => `<div class="sx-row">${Array.from({ length: cnt }, () => { const i = k++, c = sq[i]; return `<button class="sx-slot ${c ? 'on' : ''}" data-slot="${i}" style="--w:${w}px">${c ? Cards.html(c, { w }) : '<span class="sx-empty"><i>+</i></span>'}</button>`; }).join('')}</div>`).join('');
    const reqs = [{ t: 'n' }, ...ch.req].map((q, i) => {
      const t = q.t === 'n' ? { ok: f.length === ch.n } : test(q, sq, ch.n);
      const txt = q.t === 'n' ? `Игроков в составе: ${ch.n}` : label(q);
      const now = q.t === 'n' ? `${f.length}/${ch.n}` : t.now !== undefined ? t.now : '';
      return `<li class="${t.ok ? 'ok' : t.bad ? 'bad' : ''} ${t.ok && !lastOk[i] ? 'pop' : ''}"><i>${t.ok ? '✓' : t.bad ? '!' : ''}</i><span>${txt}</span><b>${now}</b></li>`;
    });
    lastOk = {}; [{ t: 'n' }, ...ch.req].forEach((q, i) => { lastOk[i] = q.t === 'n' ? f.length === ch.n : test(q, sq, ch.n).ok; });
    const ok = allOk(ch, sq), stars = Math.max(0, Math.min(5, (r - 60) / 5));
    return `<div class="sx-head">
        <div class="sx-stat"><small>Рейтинг</small><span class="sx-stars" style="--s:${stars}"></span><b class="sx-rt">${r || '—'}</b></div>
        <div class="sx-stat"><small>Игроки</small><b>${f.length}/${ch.n}</b></div>
        <div class="sx-rew">${art(ch.reward, true)}</div></div>
      <ul class="sx-req">${reqs.join('')}</ul>
      <div class="sx-pitch"><div class="sx-lines"></div>${pitch}</div>
      <div class="sx-bar"><button class="fx-btn ghost" data-sbx="auto">Автосбор</button>${f.length ? '<button class="fx-btn ghost sm" data-sbx="clear" aria-label="Очистить">✕</button>' : ''}<button class="fx-btn" data-sbx="send" ${ok ? '' : 'disabled'}>Отправить</button></div>`;
  }

  function render(fx) {
    const box = $('#sbc-body'); if (!box) return;
    const t = $('#sbc-title'), sub = $('#sbc-sub');
    if (view.mode === 'list') { t.textContent = 'ИПК'; sub.textContent = 'Сдай карточки — получи паки'; box.innerHTML = listHTML(); }
    else if (view.mode === 'group') { const g = find(view.id); t.textContent = 'Игроки'; sub.textContent = g ? g.title : ''; box.innerHTML = g ? groupHTML(g) : ''; }
    else { const ch = find(view.id); t.textContent = ch.title; sub.textContent = `Награда: ${rewardTxt(ch.reward)}`; box.innerHTML = chHTML(ch); }
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(box);
    if (fx) fx(box);
  }

  // ---------- выбор игрока в слот ----------
  let sortUp = true, filt = 'all';
  function openSheet(i) {
    closeSheet(true);
    const ch = find(view.id), only = ch.req.find((r) => r.t === 'only');
    const inSq = new Set(cur.sq.filter(Boolean));
    let list = avail().filter((c) => !inSq.has(c.key) && (!only || only.in.includes(c.rar)));
    if (filt === 'dup') list = list.filter((c) => Cards.spare(c.key) > 1);
    else if (filt !== 'all') list = list.filter((c) => (filt === 'gold' ? GOLDUP.includes(c.rar) : c.rar === filt));
    list.sort((a, b) => (sortUp ? a.r - b.r : b.r - a.r) || a.name.localeCompare(b.name));
    const W = Math.min(520, innerWidth), w = Math.floor((W - 24 - 4 - 24) / 4);
    const has = cur.sq[i];
    const el = document.createElement('div');
    el.className = 'sx-sheet-wrap';
    el.innerHTML = `<div class="sx-sheet" role="dialog"><div class="sx-grab"></div>
      <div class="sx-sh"><b>${has ? 'Заменить игрока' : 'Выбери игрока'}</b><button class="sx-x" data-sh="close" aria-label="Закрыть">✕</button></div>
      <div class="sx-filt">${[['all', 'Все'], ['dup', 'Повторы'], ['bronze', 'Бронза'], ['silver', 'Серебро'], ['gold', 'Золото+']].filter(([k]) => !only || k === 'all' || k === 'dup' || (k === 'gold' ? only.in.some((x) => GOLDUP.includes(x)) : only.in.includes(k))).map(([k, n]) => `<button class="${filt === k ? 'on' : ''}" data-sf="${k}">${n}</button>`).join('')}<button class="sx-sort" data-sh="sort">ОБЩ ${sortUp ? '↑' : '↓'}</button></div>
      <div class="sx-grid">${list.length ? list.slice(0, 160).map((c) => `<button class="sx-pick" data-pk="${esc(c.key)}">${Cards.html(c, { w })}${Cards.spare(c.key) > 1 ? `<i class="sx-dup">×${Cards.spare(c.key)}</i>` : ''}</button>`).join('') : '<p class="sx-none">Подходящих карточек нет. Открывай паки — они за победы в играх.</p>'}</div>
      ${has ? '<button class="fx-btn ghost sx-rm" data-sh="rm">Убрать из состава</button>' : ''}</div>`;
    document.body.appendChild(el);
    sheet = { el, i };
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
    anim($('.sx-sheet', el), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1)' });
    $$('.sx-pick', el).slice(0, 16).forEach((p, k) => anim(p, [{ transform: 'translateY(30px) rotateX(50deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 120 + k * 22, easing: 'cubic-bezier(.2,1.1,.4,1)', fill: 'backwards' }));
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-sh="close"]')) return closeSheet();
      const f = e.target.closest('[data-sf]'); if (f) { filt = f.dataset.sf; Sound.play('tap'); return openSheet(i); }
      if (e.target.closest('[data-sh="sort"]')) { sortUp = !sortUp; Sound.play('tap'); return openSheet(i); }
      if (e.target.closest('[data-sh="rm"]')) { cur.sq[i] = null; Sound.play('tap'); closeSheet(); return render(); }
      const p = e.target.closest('[data-pk]'); if (p) place(i, p.dataset.pk, p);
    });
  }
  function closeSheet(now) {
    if (!sheet) return;
    const { el } = sheet; sheet = null;
    if (now) { el.remove(); return; }
    el.classList.add('out');
    const a = anim($('.sx-sheet', el), [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
    if (a) a.onfinish = () => el.remove(); else el.remove();
  }
  function place(i, key, from) {
    const r0 = from && $('.cc', from).getBoundingClientRect();
    cur.sq[i] = key; Sound.play('tap'); haptic('tap');
    closeSheet();
    render((box) => {
      const t = $(`.sx-slot[data-slot="${i}"] .cc`, box); if (!t) return;
      const r1 = t.getBoundingClientRect();
      if (r0) {
        const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2), dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2), s = r0.width / r1.width;
        anim(t, [{ transform: `translate(${dx}px,${dy}px) scale(${s}) rotateY(0)`, zIndex: 5 }, { transform: `translate(${dx * 0.4}px,${dy * 0.4 - 40}px) scale(1.15) rotateY(180deg)`, offset: 0.55 }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.3,.8,.3,1)' });
      }
      landFx(t, 560);
    });
  }
  const landFx = (t, delay = 0) => { t.classList.remove('land'); setTimeout(() => { t.classList.add('land'); setTimeout(() => t.classList.remove('land'), 700); }, delay); };

  // ---------- отправка ----------
  function send() {
    const ch = find(view.id), sq = cur.sq.map((k) => k && Cards.get(k));
    if (!allOk(ch, sq) || closed(ch)) return;
    const legend = sq.filter((c) => c && (c.rar === 'legend' || c.rar === 'jack')).length;
    Modal.open(`<div class="cd"><h2>Отправить состав?</h2><p class="cd-m">${ch.n} ${plural(ch.n, 'карточка уйдёт', 'карточки уйдут', 'карточек уйдут')} из клуба${legend ? `, среди них ${legend} ${plural(legend, 'особая', 'особые', 'особых')}` : ''}. В галерее игроки останутся.</p>
      <p class="cd-m">Награда: <b>${esc(rewardTxt(ch.reward))}</b></p></div>`, [
      { label: 'Отправить', onClick: () => submit(ch) },
      { label: 'Отмена', cls: 'ghost' },
    ]);
  }
  function submit(ch) {
    const keys = cur.sq.filter(Boolean);
    Cards.use(keys);
    S().done[ch.id] = doneN(ch.id) + 1; Store.save();
    Sound.play('goal'); haptic('ok');
    const box = $('#sbc-body'), pitch = $('.sx-pitch', box);
    const pr = pitch.getBoundingClientRect(), cx = pr.left + pr.width / 2, cy = pr.top + pr.height / 2;
    let last = null;
    $$('.sx-slot .cc', box).forEach((c, k) => {
      const r = c.getBoundingClientRect(), dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      last = anim(c, [{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * 0.6}px,${dy * 0.6 - 30}px) rotateY(200deg) scale(.9)`, opacity: 1, offset: 0.6 }, { transform: `translate(${dx}px,${dy}px) rotateY(360deg) scale(.2)`, opacity: 0 }], { duration: 760, delay: k * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }) || last;
    });
    const flash = document.createElement('div'); flash.className = 'sx-flash'; pitch.appendChild(flash);
    const go = () => {
      const parent = ch.parent, then = () => {
        cur = null;
        if (parent && groupDone(find(parent.id)) === parent.items.length && !doneN(parent.id)) {
          S().done[parent.id] = 1; Store.save();
          setTimeout(() => { if (typeof confetti === 'function') confetti(); give(parent.reward, `ГРУППА ВЫПОЛНЕНА`, () => { view = { mode: 'group', id: parent.id }; render(); }); }, 300);
          view = { mode: 'group', id: parent.id }; render(); return;
        }
        view = parent ? { mode: 'group', id: parent.id } : { mode: 'list', tab: view.tab || 'all' };
        if (!parent) view.tab = lastTab;
        render(enterFx);
      };
      give(ch.reward, `ИПК: ${ch.title.toUpperCase()}`, then);
    };
    setTimeout(go, reduce ? 0 : 900 + keys.length * 45);
  }
  function give(r, title, then) {
    if (typeof Rewards !== 'undefined') Rewards.refresh();
    if (r.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(r.coins); toast(`ИПК выполнено! +${r.coins} монет`); then && then(); return; }
    if (r.pack !== undefined) { Rewards.openDrop({ title, minLevel: r.pack, onDone: () => then && then() }); return; }
    if (r.card) { const res = Cards.add([r.card]); Cards.reveal(res, () => { const dup = res.reduce((s, x) => s + x.coins, 0); if (dup) Coins.add(dup); Rewards.refresh(); then && then(); }); }
  }

  const enterFx = (box) => $$('.fx-card', box).forEach((c, k) => anim(c, [{ transform: 'translateY(26px) rotateX(-18deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, delay: k * 50, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'backwards' }));
  let lastTab = 'all';
  function openItem(id) {
    const x = find(id); if (!x) return;
    if (x.items) { view = { mode: 'group', id }; Sound.play('tap'); render(enterFx); scrollTo(0, 0); return; }
    if (closed(x)) { toast('Уже выполнено'); return; }
    if (!cur || cur.id !== id) cur = { id, sq: Array(x.n).fill(null) };
    view = { mode: 'ch', id }; lastOk = {}; Sound.play('tap');
    render((box) => $$('.sx-slot', box).forEach((s, k) => anim(s, [{ transform: 'translateY(-30px) rotateX(70deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: k * 35, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' })));
    scrollTo(0, 0);
  }
  function back() {
    closeSheet(true);
    if (view.mode === 'ch') { const x = find(view.id); view = x && x.parent ? { mode: 'group', id: x.parent.id } : { mode: 'list', tab: lastTab }; render(enterFx); return; }
    if (view.mode === 'group') { view = { mode: 'list', tab: lastTab }; render(enterFx); return; }
    Rewards.open();
  }

  function open(id) {
    Modal.close(); Screens.show('sbc');
    view = { mode: 'list', tab: lastTab };
    if (id) openItem(id); else render(enterFx);
  }
  function bind() {
    const box = $('#sbc-body'); if (!box) return;
    $('#sbc-back').addEventListener('click', back);
    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sbt]'); if (t) { view.tab = lastTab = t.dataset.sbt; Sound.play('tap'); return render(enterFx); }
      const o = e.target.closest('[data-sbo]'); if (o) return openItem(o.dataset.sbo);
      const s = e.target.closest('[data-slot]'); if (s) return openSheet(+s.dataset.slot);
      const a = e.target.closest('[data-sbx]'); if (!a) return;
      const ch = find(view.id);
      if (a.dataset.sbx === 'auto') {
        const keys = autofill(ch, cur.sq);
        if (!keys.length) { toast('В клубе нет подходящих карточек'); return; }
        const before = cur.sq.slice();
        cur.sq = Array(ch.n).fill(null).map((_, i) => keys[i] || null);
        Sound.play('tap'); haptic('tap');
        render((b) => $$('.sx-slot', b).forEach((sl, k) => { const c = $('.cc', sl); if (c && before[k] !== cur.sq[k]) { anim(c, [{ transform: 'rotateY(-180deg) scale(.6)', opacity: 0 }, { transform: 'rotateY(0) scale(1)', opacity: 1 }], { duration: 560, delay: k * 60, easing: 'cubic-bezier(.2,1.1,.3,1)', fill: 'backwards' }); landFx(c, 500 + k * 60); } }));
        if (!allOk(ch, cur.sq.map((k) => k && Cards.get(k)))) setTimeout(() => toast('Карточек не хватает — собрал, сколько смог'), 500);
        return;
      }
      if (a.dataset.sbx === 'clear') { cur.sq = Array(ch.n).fill(null); Sound.play('tap'); return render(); }
      if (a.dataset.sbx === 'send') return send();
    });
  }
  // для значка: доступно ли испытание дня
  const ready = () => { try { const d = defs()[0]; return d && d.cat === 'day' && !closed(d) ? 1 : 0; } catch (e) { return 0; } };

  return { open, bind, ready, autofill, test, rating, defs, find, allOk };
})();
