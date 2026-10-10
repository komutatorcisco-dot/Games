// ИПК — испытания по комплектованию состава, как в FUT: сдай карточки из клуба по условиям — получи пак или игрока.
// Сданные карточки уходят из клуба (свободные копии), но в галерее игрок остаётся навсегда.
'use strict';

// Наклон в 3D за пальцем и блик: для больших карточек и паков. Без касания — лёгкое «дыхание».
const Tilt = (() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function attach(el, { max = 14, idle = false } = {}) {
    if (!el || el._tilt) return;
    el._tilt = 1; el.classList.add('tilt');
    let tx = 0, ty = 0, cx = 0, cy = 0, touch = false;
    const t0 = performance.now();
    const move = (e) => {
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)) * max;
      ty = -Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)) * max;
      touch = true;
    };
    const off = () => { touch = false; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerdown', move);
    ['pointerleave', 'pointerup', 'pointercancel'].forEach((ev) => el.addEventListener(ev, off));
    const loop = (t) => {
      if (!el.isConnected) return;
      if (!touch) { if (idle && !reduce) { const k = (t - t0) / 1000; tx = Math.sin(k * 0.8) * max * 0.5; ty = Math.cos(k * 0.6) * max * 0.3; } else { tx = 0; ty = 0; } }
      cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
      el.style.setProperty('--ry', cx.toFixed(2) + 'deg'); el.style.setProperty('--rx', cy.toFixed(2) + 'deg');
      el.style.setProperty('--gx', (50 + (cx / max) * 45).toFixed(1) + '%'); el.style.setProperty('--gy', (50 - (cy / max) * 45).toFixed(1) + '%');
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // карточку крутят пальцем: влево-вправо — полный оборот с инерцией, вверх-вниз — наклон; отпустил — встаёт лицом
  function spin(cc) {
    if (!cc || cc.closest('.spin3d')) return;
    const wrap = document.createElement('div'); wrap.className = 'spin3d';
    const inner = document.createElement('div'); inner.className = 'spin-in';
    const back = document.createElement('div'); back.className = 'spin-back ' + (['bronze', 'silver', 'gold', 'legend', 'jack', 'future'].find((r) => cc.classList.contains(r)) || '');
    back.innerHTML = '<b>ДЖ</b>';
    cc.parentNode.insertBefore(wrap, cc); inner.appendChild(cc); inner.appendChild(back); wrap.appendChild(inner);
    let ry = 0, rx = 0, vy = 0, drag = null, raf = 0, settle = false;
    const apply = () => { inner.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`; const k = ((ry % 360) + 360) % 360; wrap.style.setProperty('--gx', (50 + Math.sin((k * Math.PI) / 180) * 45).toFixed(1) + '%'); };
    const loop = () => {
      if (!wrap.isConnected) return;
      if (!drag) {
        if (Math.abs(vy) > 0.15 && !settle) { ry += vy; vy *= 0.94; rx *= 0.9; }
        else { settle = true; const target = Math.round(ry / 360) * 360; ry += (target - ry) * 0.12; rx *= 0.85; if (Math.abs(target - ry) < 0.1 && Math.abs(rx) < 0.1) { ry = target; rx = 0; apply(); raf = 0; return; } }
      }
      apply(); raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    wrap.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ry, rx, t: performance.now(), lx: e.clientX }; vy = 0; settle = false; wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); kick(); });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      ry = drag.ry + dx * 0.9; rx = Math.max(-25, Math.min(25, drag.rx - dy * 0.35));
      vy = ((e.clientX - drag.lx) * 0.9) / Math.max(1, (now - drag.t) / 16); drag.lx = e.clientX; drag.t = now;
    });
    const up = () => { if (!drag) return; drag = null; vy = Math.max(-40, Math.min(40, vy)); kick(); };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    // подсказка движением: лёгкий поворот туда-обратно при открытии
    if (!reduce) { vy = 9; settle = false; kick(); }
    apply();
  }
  return { attach, spin };
})();

const SBC = (() => {
  const LEAGUES = ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'Лига 1'];
  const GOLDUP = ['gold', 'legend', 'jack'];
  const RAR_RU = { bronze: 'бронзовые', silver: 'серебряные', gold: 'золотые', legend: 'легенды', jack: '«Джексон»' };
  const PACKNAME = ['Обычный пак', 'Сверхредкий пак', 'Эпический пак', 'Легендарный пак', 'Пак «ДЖЕКСОН!!»'];
  const PACKSHORT = ['Обычный', 'Сверхредкий', 'Эпический', 'Легендарный', 'Джексон!!'];
  const PACK_N = [3, 5, 8, 15, 30];
  const PACK_SURE = ['', 'одно золото', 'два золота', 'легенда и три золота', '«Джексон», две легенды и шесть золотых'];
  const DIFF = ['', 'Лёгкое', 'Среднее', 'Сложное', 'Элитное'];
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
  // Цены выверены симуляцией паков (≈7 паков в день у активного игрока, «Джексон» выпадает примерно раз на 67 паков):
  // дневное — бонус за вход; улучшения — честный обмен; игрок недели — около 80 паков, это главная цель недели.
  let cache = null;
  function defs() {
    const W = wk(), D = Day.key();
    if (cache && cache.key === W + D) return cache.list;
    const L = LEAGUES[hash(W) % LEAGUES.length];
    const jacks = Cards.all().filter((c) => c.rar === 'jack');
    const lgJ = jacks.filter((c) => c.lg === L), pool = lgJ.length ? lgJ : jacks;
    const star = pool.length ? pool[hash(W + 'star') % pool.length] : null;
    const tier = star ? (star.r >= 97 ? 1 : star.r <= 94 ? -1 : 0) : 0;
    const dl = LEAGUES[hash(D) % LEAGUES.length];
    const dayReq = [
      [{ t: 'same', k: 'lg', min: 3 }],
      [{ t: 'from', k: 'lg', v: dl, min: 2 }],
      [{ t: 'rating', v: 75 }],
      [{ t: 'rar', in: GOLDUP, min: 1 }],
      [{ t: 'diff', k: 'club', min: 3 }],
    ][hash(D + 'q') % 5];
    const list = [
      { id: 'day:' + D, cat: 'day', ico: 'clock', diff: 1, title: 'Испытание дня', desc: 'Три карточки за сверхредкий пак. Новое каждый день.', n: 3, req: dayReq, reward: { pack: 1 }, limit: 1, ends: dayEnd() },
      star && { id: 'pl:' + W, cat: 'pl', group: true, ico: 'star', diff: 4, cost: 70 + tier * 15, title: `Игрок недели: ${Cards.surname(star.name)}`, desc: `Пройди три испытания и забери ${star.name} ${star.r}. За каждый этап тоже дают пак.`, reward: { card: star.key }, ends: weekEnd(), limit: 1,
        items: [
          { id: `pl:${W}:1`, ico: 'stadium', diff: 3, title: `Лига недели: ${L}`, desc: `Пятеро из ${L} в составе на ${80 + tier}`, n: 11, req: [{ t: 'from', k: 'lg', v: L, min: 5 }, { t: 'rating', v: 80 + tier }], reward: { pack: 2 }, limit: 1 },
          { id: `pl:${W}:2`, ico: 'flame', diff: 3, title: 'Топ-форма', desc: 'Сильный полный состав', n: 11, req: [{ t: 'rating', v: 82 + tier }], reward: { pack: 2 }, limit: 1 },
          { id: `pl:${W}:3`, ico: 'crown', diff: 4, title: 'Состав мечты', desc: 'С легендой и рейтингом элиты', n: 11, req: [{ t: 'rating', v: 84 + tier }, { t: 'rar', in: ['legend', 'jack'], min: 1 }], reward: { pack: 3 }, limit: 1 },
        ] },
      { id: 'fs:espart', cat: 'pl', group: true, ico: 'star', diff: 4, title: 'Будущие звёзды: Хави Эспарт', desc: '10 составов — уникальный левый защитник Барселоны с рейтингом 91. Без срока окончания. За каждый этап — 100 монет.', reward: { card: 'FS:xavi-espart' }, limit: 1,
        items: [75, 76, 77, 78, 79, 80, 81, 82, 83, 85].map((r, i) => ({
          id: 'fs:espart:' + (i + 1), ico: 'star', diff: i < 3 ? 2 : i < 7 ? 3 : 4,
          title: ['Первый шаг', 'Испанские корни', 'Ла Масия', 'Ла Лига', 'Командная игра', 'Новая надежда', 'Большая сцена', 'Звёздный состав', 'Путь к вершине', 'Будущая звезда'][i],
          desc: 'Состав ' + (i + 1) + ' из 10', n: 11,
          req: [{ t: 'rating', v: r }, ...(i === 1 ? [{ t: 'from', k: 'nat', v: 'Испания', min: 2 }] : i === 2 ? [{ t: 'from', k: 'club', v: 'Барселона', min: 1 }] : i === 3 ? [{ t: 'from', k: 'lg', v: 'Ла Лига', min: 3 }] : [])],
          reward: { coins: 100 }, limit: 1,
        })) },
      { id: 'up:b', cat: 'up', ico: 'medal:#d9905a', diff: 1, title: 'Бронзовое улучшение', desc: 'Сдай пять бронзовых, получи пак с гарантированным серебром.', n: 5, req: [{ t: 'only', in: ['bronze'] }], reward: { pack: 1 }, limit: 0 },
      { id: 'up:s', cat: 'up', ico: 'medal:#d6dde6', diff: 1, title: 'Серебряное улучшение', desc: 'Сдай пять серебряных, получи пак с гарантированным золотом.', n: 5, req: [{ t: 'only', in: ['silver'] }], reward: { pack: 2 }, limit: 0 },
      { id: 'up:g', cat: 'up', ico: 'medal:#ffcf3a', diff: 3, title: 'Улучшение 82+', desc: 'Сдай семь золотых, получи пак с гарантированной легендой.', n: 7, req: [{ t: 'only', in: GOLDUP }, { t: 'rating', v: 82 }], reward: { pack: 3 }, limit: 0 },
      { id: 'up:j:' + W, cat: 'up', ico: 'pack:#ff4f66', diff: 4, title: 'Пак «ДЖЕКСОН!!»', desc: 'Лучший пак игры: внутри точно «Джексон». Раз в неделю.', n: 11, req: [{ t: 'rating', v: 85 }, { t: 'rar', in: ['legend', 'jack'], min: 2 }], reward: { pack: 4 }, limit: 1, ends: weekEnd() },
      { id: 'b:first', cat: 'base', ico: '1', diff: 1, title: 'Первый состав', desc: 'Любые три карточки. Начни с простого.', n: 3, req: [], reward: { coins: 150 }, limit: 1 },
      { id: 'b:league', cat: 'base', ico: '2', diff: 1, title: 'Одна лига', desc: 'Все пятеро из одной лиги.', n: 5, req: [{ t: 'same', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:nation', cat: 'base', ico: '3', diff: 2, title: 'Одна сборная', desc: 'Четверо из одной страны.', n: 4, req: [{ t: 'same', k: 'nat', min: 4 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:club', cat: 'base', ico: '4', diff: 2, title: 'Одноклубники', desc: 'Двое из одного клуба в пятёрке.', n: 5, req: [{ t: 'same', k: 'club', min: 2 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:five', cat: 'base', ico: '5', diff: 1, title: 'Пять лиг', desc: 'Пятеро из пяти разных лиг.', n: 5, req: [{ t: 'diff', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:gold', cat: 'base', ico: '6', diff: 2, title: 'Золотой стандарт', desc: 'Полный состав с рейтингом 78.', n: 11, req: [{ t: 'rating', v: 78 }], reward: { pack: 2 }, limit: 1 },
      { id: 'b:nat11', cat: 'base', ico: '7', diff: 2, title: 'Костяк сборной', desc: 'Трое соотечественников в составе на 79.', n: 11, req: [{ t: 'same', k: 'nat', min: 3 }, { t: 'rating', v: 79 }], reward: { pack: 2 }, limit: 1 },
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
  const fitsOnly = (ch, c) => { const o = ch.req.find((r) => r.t === 'only'); return !o || o.in.includes(c.rar); };

  // ---------- автосбор: самые «дешёвые» карточки, сначала повторы ----------
  const avail = () => Cards.all().filter((c) => !c.sbcOnly && Cards.spare(c.key) > 0);
  const clubCount = () => avail().reduce((s, c) => s + Cards.spare(c.key), 0);
  // P — свой набор карточек (для расчёта экономики): { cards, spare(key) }
  function autofill(ch, keep = [], P = null) {
    const spare = P ? P.spare : Cards.spare;
    // «цена» карточки по редкости: 84-е золото в паках встречается так же редко, как легенда, — тратим его неохотно
    const cost = (c) => {
      const base = c.rar === 'bronze' ? c.r - 62 : c.rar === 'silver' ? c.r - 60 : c.rar === 'gold' ? 18 + 3 * Math.pow(1.55, c.r - 78) : c.rar === 'legend' ? 110 + 3 * Math.pow(1.35, c.r - 80) : 400 + c.r;
      return base * (spare(c.key) > 1 ? 0.55 : 1);
    };
    const exact = (sq) => { const rs = sq.map((c) => c.r), n = rs.length, sum = rs.reduce((a, b) => a + b, 0), avg = sum / n; return (sum + rs.reduce((s, r) => s + Math.max(0, r - avg), 0)) / n; };
    const only = ch.req.find((r) => r.t === 'only');
    let rest = (P ? P.cards : avail()).filter((c) => !only || only.in.includes(c.rar)).sort((a, b) => cost(a) - cost(b));
    const sq = keep.filter(Boolean).map((k) => Cards.get(k)).filter((c) => c && (!only || only.in.includes(c.rar)));
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
    const rq = ch.req.find((r) => r.t === 'rating'), other = ch.req.filter((r) => r.t !== 'rating');
    const keepsOther = (s2) => other.every((r) => test(r, s2, ch.n).ok || !test(r, sq, ch.n).ok);
    // кандидаты на замену: по одному лучшему на каждый рейтинг и редкость — так быстро и без потерь
    const ladder = () => { const m = new Map(); rest.forEach((c) => { const k = c.rar + c.r; if (!m.has(k) || cost(c) < cost(m.get(k))) m.set(k, c); }); return [...m.values()]; };
    const ladderFor = (i) => { const m = new Map(); rest.forEach((c) => { const k = c.rar + c.r + (c.lg === sq[i].lg ? 'L' : '') + (c.nat === sq[i].nat ? 'N' : '') + (c.club === sq[i].club ? 'C' : ''); if (!m.has(k) || cost(c) < cost(m.get(k))) m.set(k, c); }); return [...m.values()]; };
    // рейтинг: каждый раз берём замену с наименьшей ценой за прирост
    let guard = 0;
    while (rq && sq.length === ch.n && rating(sq) < rq.v && guard++ < 120) {
      const base = exact(sq), cands = other.length ? null : ladder();
      let best = null;
      for (let i = 0; i < sq.length; i++) {
        for (const c of cands || ladderFor(i)) {
          if (c.r <= sq[i].r) continue;
          const s2 = sq.slice(); s2[i] = c;
          const gain = exact(s2) - base; if (gain <= 0) continue;
          if (!keepsOther(s2)) continue;
          const score = (cost(c) - cost(sq[i])) / gain;
          if (!best || score < best.score) best = { i, c, score };
        }
      }
      if (!best) break;
      const { i, c } = best; rest.splice(rest.indexOf(c), 1); rest.push(sq[i]); sq[i] = c;
    }
    // и обратно: где можно подешевле без потери условий — подешевле
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < sq.length; i++) {
        const cheaper = rest.filter((c) => cost(c) < cost(sq[i])).sort((a, b) => cost(a) - cost(b));
        for (const c of cheaper.slice(0, 60)) {
          const s2 = sq.slice(); s2[i] = c;
          if (ch.req.every((r) => !test(r, sq, ch.n).ok || test(r, s2, ch.n).ok)) {
            rest.splice(rest.indexOf(c), 1); rest.push(sq[i]); sq[i] = c; break;
          }
        }
      }
    }
    sq.sort((a, b) => b.r - a.r);
    return sq.map((c) => c.key);
  }

  // ---------- модели: пак-коробка с толщиной, обжимом и голографией ----------
  const packArt = (lv, sz = '') => (typeof PackOpen !== 'undefined' ? PackOpen.art(lv, sz) : '');
  const packArtOld = (lv, sz = '') => `<span class="fpk p${lv} ${sz}"><span class="fpk-b">
      <i class="fpk-f"><i class="fpk-holo"></i><i class="fpk-sh"></i><i class="fpk-crest"></i><b>ДЖ</b><em>${PACKSHORT[lv]}</em></i>
      <i class="fpk-s"></i><i class="fpk-k"></i></span></span>`;
  function art(r, sz = '') {
    if (r.pack !== undefined) return packArt(r.pack, sz);
    if (r.card) { const c = Cards.get(r.card); return c ? `<span class="fx-cardart ${sz}">${Cards.html(c, { w: sz === 'sm' ? 46 : sz === 'xl' ? 170 : 104 })}</span>` : ''; }
    if (r.coins) return `<span class="fx-coins ${sz}"><i class="coin"></i><i class="coin"></i><i class="coin"></i><b>${r.coins}</b></span>`;
    return '';
  }
  const rewardTxt = (r) => (r.pack !== undefined ? PACKNAME[r.pack] : r.card ? `${(Cards.get(r.card) || {}).name || 'Игрок'} · ${(Cards.RAR[(Cards.get(r.card) || {}).rar] || {}).n || ''}` : `${r.coins} монет`);
  const icoHTML = (ico) => { if (/^\d$/.test(ico)) return `<b class="fx-num">${ico}</b>`; const [n, col] = ico.split(':'); return `<span class="fx-ig"${col ? ` style="--ic-a:${col};color:${col}"` : ''}>${Ui.get(n)}</span>`; };
  const diffChip = (d, cost) => (d ? `<span class="fx-diff d${d}"><i></i><i></i><i></i><i></i>${DIFF[d]}${cost ? ` · ≈${cost} паков` : ''}</span>` : '');

  function card(x, i) {
    const isG = !!x.items, nDone = isG ? groupDone(x) : doneN(x.id), cl = closed(x);
    const prog = isG
      ? `<div class="fx-prog"><span class="fx-seg">${x.items.map((it) => `<i class="${doneN(it.id) ? 'on' : ''}"></i>`).join('')}</span><small>${nDone} из ${x.items.length} ИПК</small></div>`
      : !x.limit && nDone ? `<div class="fx-prog"><small>Выполнено ${nDone} ${plural(nDone, 'раз', 'раза', 'раз')}</small></div>` : '';
    const reqLine = !isG && x.req.length ? `<div class="fx-req">${x.req.map((r) => `<span>${label(r)}</span>`).join('')}</div>` : '';
    return `<div class="fx-card ${cl ? 'done' : ''} ${isG ? 'grp' : ''} c-${x.cat || ''}" data-sbo="${x.id}" role="button" tabindex="0" style="--i:${i}">
      <div class="fx-h"><span class="fx-ico">${icoHTML(x.ico)}</span><b>${esc(x.title)}</b><button class="fx-info" data-sbi="${x.id}" aria-label="Подробнее">i</button></div>
      <div class="fx-m"><div class="fx-l"><p>${esc(x.desc)}</p>${reqLine}${prog}<div class="fx-rw"><small>${isG ? 'Награда группы' : 'Награда'}</small><b>${esc(rewardTxt(x.reward))}</b></div></div>
        <div class="fx-art">${art(x.reward)}${cl ? '<i class="fx-gok">✓</i>' : ''}</div></div>
      <div class="fx-f">${cl ? '<span class="fx-ok">✓ Выполнено</span>' : `<span><i class="fx-ic">${x.limit ? '⊘' : '↻'}</i>${x.limit ? 'Один раз' : 'Повторяется'}</span>`}
        ${diffChip(x.diff, x.cost)}${x.ends && !cl ? `<span class="fx-left"><i class="fx-ic">${Ui.get('clock')}</i><b data-left="${x.ends}">${left(x.ends)}</b></span>` : ''}</div>
    </div>`;
  }

  let view = { mode: 'list', tab: 'all' }, cur = null, sheet = null, lastTab = 'all';
  const TABS = [['all', 'Все'], ['pl', 'Игроки'], ['up', 'Улучшения'], ['base', 'Основы']];
  function listHTML() {
    const L = defs().filter((x) => view.tab === 'all' || x.cat === view.tab || (view.tab === 'up' && x.cat === 'day'));
    const sorted = L.slice().sort((a, b) => (closed(a) ? 1 : 0) - (closed(b) ? 1 : 0));
    const n = clubCount(), pend = Rewards.S().pending;
    return `<nav class="fx-tabs">${TABS.map(([k, t]) => `<button class="${view.tab === k ? 'on' : ''}" data-sbt="${k}">${t}</button>`).join('')}</nav>
      <div class="fx-club"><span class="fx-cl-ico"></span><span><b>${n}</b> ${plural(n, 'карточка', 'карточки', 'карточек')} в клубе<small>Сданные игроки остаются в галерее</small></span>
        ${pend ? `<button class="fx-mini" data-act="rw-packs">Паки: ${pend}</button>` : `<button class="fx-mini" data-act="collection">Галерея</button>`}</div>
      <div class="fx-list">${sorted.map(card).join('')}</div>`;
  }
  function groupHTML(g) {
    const n = groupDone(g), got = closed(g);
    return `<div class="fx-gh ${got ? 'got' : ''}">
        <div class="fx-gart">${art(g.reward, 'xl')}${got ? '<i class="fx-gok">✓</i>' : ''}</div>
        <div class="fx-gl"><b>${esc(g.title)}</b><p>${esc(g.desc)}</p>
          <div class="fx-prog"><span class="fx-seg">${g.items.map((it) => `<i class="${doneN(it.id) ? 'on' : ''}"></i>`).join('')}</span><small>${n} из ${g.items.length} ИПК</small></div>
          <div class="fx-f">${diffChip(g.diff, g.cost)}${g.ends ? `<span class="fx-left"><i class="fx-ic">${Ui.get('clock')}</i><b data-left="${g.ends}">${left(g.ends)}</b></span>` : '<span class="fx-left">Без срока</span>'}</div></div></div>
      <div class="fx-list">${g.items.map((x, i) => card(x, i)).join('')}</div>`;
  }
  const rows = (n) => ({ 3: [3], 4: [2, 2], 5: [3, 2], 7: [3, 2, 2], 11: [3, 3, 4, 1] }[n] || [n]);
  let lastOk = {};
  function chHTML(ch) {
    const sq = cur.sq.map((k) => k && Cards.get(k)), f = sq.filter(Boolean), r = rating(f);
    const R = rows(ch.n), maxRow = Math.max(...R), W = (($('#sbc-body') || {}).clientWidth || innerWidth) - 24 - 12;
    const w = Math.max(50, Math.min(92, Math.floor((W - 8 * (maxRow - 1)) / maxRow)));
    let k = 0;
    const pitch = R.map((cnt) => `<div class="sx-row">${Array.from({ length: cnt }, () => {
      const i = k++, c = sq[i];
      return `<button class="sx-slot ${c ? 'on' : ''} ${c && !fitsOnly(ch, c) ? 'bad' : ''}" data-slot="${i}" style="--w:${w}px">${c ? Cards.html(c, { w }) : '<span class="sx-empty"><i>+</i></span>'}</button>`;
    }).join('')}</div>`).join('');
    const list = [{ t: 'n' }, ...ch.req];
    const reqs = list.map((q, i) => {
      const t = q.t === 'n' ? { ok: f.length === ch.n } : test(q, sq, ch.n);
      const txt = q.t === 'n' ? `Игроков в составе: ${ch.n}` : label(q);
      const now = q.t === 'n' ? `${f.length}/${ch.n}` : q.t === 'only' ? '' : q.t === 'rating' ? (f.length ? r : '—') : `${t.now}/${q.min}`;
      return `<li class="${t.ok ? 'ok' : t.bad ? 'bad' : ''} ${t.ok && !lastOk[i] ? 'pop' : ''}"><i>${t.ok ? '✓' : t.bad ? '!' : ''}</i><span>${txt}</span><b>${now}</b></li>`;
    });
    lastOk = {}; list.forEach((q, i) => { lastOk[i] = q.t === 'n' ? f.length === ch.n : test(q, sq, ch.n).ok; });
    const ok = allOk(ch, sq), stars = Math.max(0, Math.min(5, (r - 60) / 5));
    const rq = ch.req.find((q) => q.t === 'rating');
    const have = avail().filter((c) => fitsOnly(ch, c)).length;
    const short = have + f.length < ch.n ? `<div class="sx-warn"><b>Не хватает карточек</b><span>Нужно ${ch.n}, подходящих в клубе ${have + f.length}. Побеждай в играх — за победы дают паки.</span></div>` : '';
    return `<div class="sx-head">
        <div class="sx-stat"><small>Рейтинг</small><span class="sx-stars" style="--s:${stars}"></span><b class="sx-rt ${rq && f.length === ch.n ? (r >= rq.v ? 'ok' : 'low') : ''}">${r || '—'}</b></div>
        <div class="sx-stat"><small>Игроки</small><b>${f.length}/${ch.n}</b></div>
        <button class="sx-rew" data-sbi="${ch.id}" aria-label="Награда">${art(ch.reward, 'sm')}</button></div>
      <ul class="sx-req">${reqs.join('')}</ul>${short}
      <div class="sx-pitch"><div class="sx-lines"></div>${pitch}</div>
      <p class="sx-tip">${f.length ? 'Нажми на игрока, чтобы заменить или убрать' : 'Нажми на «+», чтобы выбрать игрока, или доверься автосбору'}</p>
      <div class="sx-bar"><button class="fx-btn ghost" data-sbx="auto"><i class="sx-wand">${Ui.get('bolt')}</i>Автосбор</button>${f.length ? '<button class="fx-btn ghost sm" data-sbx="clear" aria-label="Очистить состав">✕</button>' : ''}<button class="fx-btn ${ok ? 'go' : ''}" data-sbx="send" ${ok ? '' : 'disabled'}>Отправить</button></div>`;
  }

  function title() {
    const t = $('#sbc-title'), sub = $('#sbc-sub');
    if (view.mode === 'list') { t.textContent = 'ИПК'; sub.textContent = 'Сдавай карточки, получай паки'; }
    else if (view.mode === 'group') { const g = find(view.id); t.textContent = g ? g.title : 'Игрок'; sub.textContent = g && g.ends ? `Истекает через ${left(g.ends)}` : 'Без срока окончания'; }
    else { const ch = find(view.id); t.textContent = ch.title; sub.textContent = `Награда: ${rewardTxt(ch.reward)}`; }
  }
  function paint(fx) {
    const box = $('#sbc-body'); if (!box) return;
    title();
    box.innerHTML = view.mode === 'list' ? listHTML() : view.mode === 'group' ? (find(view.id) ? groupHTML(find(view.id)) : '') : chHTML(find(view.id));
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(box);
    $$('.fx-gart', box).forEach((el) => Tilt.attach(el, { max: 16 }));
    if (fx) fx(box);
  }
  // переход между экранами ИПК: старый уезжает в глубину, новый выезжает с поворотом
  function go(next, dir = 1, fx = enterFx) {
    const box = $('#sbc-body');
    if (!box || reduce || !box.firstElementChild) { view = next; paint(fx); return; }
    const a = anim(box, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-30 * dir}px) rotateY(${8 * dir}deg) scale(.97)`, opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    const done = () => {
      view = next; paint(fx); scrollTo(0, 0);
      const b = anim(box, [{ transform: `translateX(${30 * dir}px) rotateY(${-8 * dir}deg) scale(.97)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' });
      if (a) a.cancel();
      return b;
    };
    if (a) a.onfinish = done; else done();
  }
  const enterFx = (box) => $$('.fx-card, .fx-gh', box).forEach((c, k) => anim(c, [{ transform: 'translateY(28px) rotateX(-20deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: 60 + k * 55, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'backwards' }));
  const slotFx = (box) => $$('.sx-slot', box).forEach((s, k) => anim(s, [{ transform: 'translateY(-34px) rotateX(75deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: 80 + k * 35, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' }));
  const render = (fx) => paint(fx);

  // ---------- подробности: что внутри награды ----------
  function info(id) {
    const x = find(id); if (!x) return;
    const r = x.reward;
    let what = '';
    if (r.pack !== undefined) what = `<p class="cd-m"><b>${PACK_N[r.pack]} ${plural(PACK_N[r.pack], 'карточка', 'карточки', 'карточек')}</b>${PACK_SURE[r.pack] ? `, гарантированно ${PACK_SURE[r.pack]}` : ''}. Пак может «прокачаться» до более редкого прямо при открытии.</p>`;
    else if (r.card) { const c = Cards.get(r.card); what = c ? `<p class="cd-m">${esc(Cards.RAR[c.rar].n)}: ${esc(c.name)}, рейтинг <b>${c.r}</b>. ${c.sbcOnly ? 'Только за 10 составов этого ИПК. В паках и магазине недоступна.' : 'Особая награда за выполнение группы.'}</p>` : ''; }
    else what = `<p class="cd-m">${r.coins} монет сразу на счёт.</p>`;
    const reqs = x.items ? `<ol class="fx-steps">${x.items.map((it) => `<li class="${doneN(it.id) ? 'ok' : ''}"><b>${esc(it.title)}</b><span>${it.n} игроков · ${it.req.map(label).join(' · ')}</span><em>${esc(rewardTxt(it.reward))}</em></li>`).join('')}</ol>`
      : `<ul class="fx-rl">${[`Игроков в составе: ${x.n}`, ...x.req.map(label)].map((t) => `<li>${t}</li>`).join('')}</ul>`;
    Modal.open(`<div class="cd fx-info-m"><div class="fx-info-art">${art(r)}</div><h2>${esc(x.title)}</h2>${diffChip(x.diff, x.cost)}${what}${reqs}
      <p class="cd-m fx-note">${x.limit ? (x.ends ? `Можно один раз, истекает через ${left(x.ends)}` : 'Можно выполнить один раз.') : 'Можно повторять сколько угодно.'} Сданные карточки уходят из клуба, но остаются в галерее.</p></div>`,
    [closed(x) || view.mode === 'ch' ? { label: 'Понятно', cls: 'ghost' } : { label: x.items ? 'К испытаниям' : 'Собрать состав', onClick: () => openItem(id) }, ...(closed(x) || view.mode === 'ch' ? [] : [{ label: 'Закрыть', cls: 'ghost' }])]);
    Tilt.attach($('#modal-card .fx-info-art'), { max: 18 });
  }

  // ---------- выбор игрока в слот ----------
  let sortUp = null, filt = 'all';
  function openSheet(i) {
    closeSheet(true);
    const ch = find(view.id);
    const inSq = new Set(cur.sq.filter(Boolean));
    const sq = cur.sq.map((k) => k && Cards.get(k));
    const goal = ch.req.find((r) => r.t === 'rating');
    // карточка помогает, если двигает невыполненное условие
    const open = ch.req.filter((r) => r.t !== 'rating' && r.t !== 'only' && !test(r, sq, ch.n).ok);
    const helps = (c) => { const s2 = sq.slice(); s2[i] = c; return open.some((r) => test(r, s2, ch.n).now > test(r, sq, ch.n).now); };
    let list = avail().filter((c) => !inSq.has(c.key) && fitsOnly(ch, c));
    if (filt === 'dup') list = list.filter((c) => Cards.spare(c.key) > 1);
    else if (filt !== 'all') list = list.filter((c) => (filt === 'gold' ? GOLDUP.includes(c.rar) : c.rar === filt));
    const H = new Map(list.map((c) => [c.key, helps(c)]));
    const up = sortUp === null ? !(goal && goal.v >= 80) : sortUp;
    list.sort((a, b) => (H.get(b.key) - H.get(a.key)) || (up ? a.r - b.r : b.r - a.r) || a.name.localeCompare(b.name));
    const W = Math.min(520, innerWidth), w = Math.floor((W - 24 - 4 - 24) / 4);
    const has = cur.sq[i];
    const others = sq.filter((c, k) => c && k !== i).length;
    const preview = (c) => { if (!goal || !others) return ''; const s2 = sq.slice(); s2[i] = c; const v = rating(s2); return `<i class="sx-pr ${goal && s2.filter(Boolean).length === ch.n ? (v >= goal.v ? 'ok' : 'low') : ''}">→ ${v}</i>`; };
    const only = ch.req.find((r) => r.t === 'only');
    const el = document.createElement('div');
    el.className = 'sx-sheet-wrap';
    el.innerHTML = `<div class="sx-sheet" role="dialog"><div class="sx-grab"></div>
      <div class="sx-sh"><b>${has ? 'Заменить игрока' : 'Выбери игрока'}</b><button class="sx-x" data-sh="close" aria-label="Закрыть">✕</button></div>
      ${open.length || (goal && others) ? `<div class="sx-legend">${open.length ? '<span><i class="sx-hl"></i>помогает с условием</span>' : ''}${goal && others ? '<span><b>→ 80</b> рейтинг с ним</span>' : ''}</div>` : ''}
      <div class="sx-filt">${[['all', 'Все'], ['dup', 'Повторы'], ['bronze', 'Бронза'], ['silver', 'Серебро'], ['gold', 'Золото+']].filter(([k]) => !only || k === 'all' || k === 'dup' || (k === 'gold' ? only.in.some((x) => GOLDUP.includes(x)) : only.in.includes(k))).map(([k, n]) => `<button class="${filt === k ? 'on' : ''}" data-sf="${k}">${n}</button>`).join('')}<button class="sx-sort" data-sh="sort">ОБЩ ${up ? '↑' : '↓'}</button></div>
      <div class="sx-grid">${list.length ? list.slice(0, 160).map((c) => `<button class="sx-pick ${H.get(c.key) ? 'hlp' : ''}" data-pk="${esc(c.key)}">${Cards.html(c, { w })}${Cards.spare(c.key) > 1 ? `<i class="sx-dup">×${Cards.spare(c.key)}</i>` : ''}${preview(c)}</button>`).join('') : '<p class="sx-none">Подходящих карточек нет. Открывай паки — их дают за победы в играх.</p>'}</div>
      ${has ? '<button class="fx-btn ghost sx-rm" data-sh="rm">Убрать из состава</button>' : ''}</div>`;
    document.body.appendChild(el);
    sheet = { el, i };
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
    anim($('.sx-sheet', el), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1)' });
    $$('.sx-pick', el).slice(0, 16).forEach((p, k) => anim(p, [{ transform: 'translateY(34px) rotateX(55deg) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 140 + k * 24, easing: 'cubic-bezier(.2,1.1,.4,1)', fill: 'backwards' }));
    // смахнуть шторку вниз
    const sh = $('.sx-sheet', el), grab = $('.sx-grab', el);
    let y0 = null;
    const down = (e) => { y0 = e.clientY; sh.style.transition = 'none'; };
    grab.parentElement.querySelector('.sx-sh').addEventListener('pointerdown', down); grab.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', (e) => { if (y0 === null) return; const dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; });
    el.addEventListener('pointerup', (e) => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; sh.style.transition = 'transform .25s'; if (dy > 90) closeSheet(); else sh.style.transform = ''; });
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-sh="close"]')) return closeSheet();
      const f = e.target.closest('[data-sf]'); if (f) { filt = f.dataset.sf; Sound.play('tap'); return openSheet(i); }
      if (e.target.closest('[data-sh="sort"]')) { sortUp = !(sortUp === null ? !(goal && goal.v >= 80) : sortUp); Sound.play('tap'); return openSheet(i); }
      if (e.target.closest('[data-sh="rm"]')) {
        const t = $(`.sx-slot[data-slot="${i}"] .cc`);
        cur.sq[i] = null; Sound.play('tap'); closeSheet();
        const a = anim(t, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) rotateX(-80deg) scale(.8)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
        if (a) a.onfinish = () => render(); else render();
        return;
      }
      const p = e.target.closest('[data-pk]'); if (p) place(i, p.dataset.pk, p);
    });
  }
  function closeSheet(now) {
    if (!sheet) return;
    const { el } = sheet; sheet = null;
    if (now) { el.remove(); return; }
    el.classList.add('out');
    const a = anim($('.sx-sheet', el), [{ transform: getComputedStyle($('.sx-sheet', el)).transform === 'none' ? 'none' : getComputedStyle($('.sx-sheet', el)).transform }, { transform: 'translateY(100%)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
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
        anim(t, [{ transform: `translate(${dx}px,${dy}px) scale(${s}) rotateY(0)` }, { transform: `translate(${dx * 0.4}px,${dy * 0.4 - 50}px) scale(1.2) rotateY(180deg) rotateX(12deg)`, offset: 0.55 }, { transform: 'none' }], { duration: 640, easing: 'cubic-bezier(.3,.8,.3,1)' });
      }
      landFx(t, 580);
      pulseHead(box);
    });
  }
  const landFx = (t, delay = 0) => { t.classList.remove('land'); setTimeout(() => { t.classList.add('land'); setTimeout(() => t.classList.remove('land'), 700); }, delay); };
  const pulseHead = (box) => { const rt = $('.sx-rt', box); anim(rt, [{ transform: 'scale(1.35)', color: '#7af0c8' }, { transform: 'none' }], { duration: 500, delay: 450, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'backwards' }); };

  // ---------- отправка ----------
  function send() {
    const ch = find(view.id), sq = cur.sq.map((k) => k && Cards.get(k));
    if (!allOk(ch, sq) || closed(ch)) return;
    const special = sq.filter((c) => c && (c.rar === 'legend' || c.rar === 'jack')).length;
    const last = sq.filter((c) => c && Cards.spare(c.key) === 1).length;
    Modal.open(`<div class="cd fx-send"><h2>Отправить состав?</h2>
      <div class="fx-send-row">${sq.map((c) => Cards.html(c, { w: 40 })).join('')}</div>
      <p class="cd-m">${ch.n} ${plural(ch.n, 'карточка уйдёт', 'карточки уйдут', 'карточек уйдут')} из клуба${special ? `, среди них ${special} ${plural(special, 'особая', 'особые', 'особых')}` : ''}${last ? `. Последних копий: ${last}` : ''}. В галерее все останутся.</p>
      <div class="fx-send-rw">${art(ch.reward, 'sm')}<span><small>Награда</small><b>${esc(rewardTxt(ch.reward))}</b></span></div></div>`, [
      { label: 'Отправить', onClick: () => submit(ch) },
      { label: 'Отмена', cls: 'ghost' },
    ]);
  }
  function submit(ch) {
    if (!cur || closed(ch)) return;
    const keys = cur.sq.filter(Boolean);
    if (new Set(keys).size !== ch.n || !allOk(ch, keys.map(Cards.get)) || keys.some((k) => !Cards.spare(k) || Cards.get(k).sbcOnly)) return;
    Cards.use(keys);
    S().done[ch.id] = doneN(ch.id) + 1; Store.save();
    const groupRes = claimGroup(ch.parent);
    Sound.play('goal'); haptic('ok');
    const box = $('#sbc-body'), rew = $('.sx-rew', box), pitch = $('.sx-pitch', box);
    const tr = (rew || pitch).getBoundingClientRect(), cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
    $('.sx-bar', box).classList.add('gone');
    $$('.sx-slot .cc', box).forEach((c, k) => {
      const r = c.getBoundingClientRect(), dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      anim(c, [{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * 0.35}px,${dy * 0.35 + 40}px) rotateY(160deg) rotateX(20deg) scale(1.05)`, opacity: 1, offset: 0.45 }, { transform: `translate(${dx}px,${dy}px) rotateY(360deg) scale(.15)`, opacity: 0.2 }], { duration: 820, delay: k * 55, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    });
    const t = 820 + keys.length * 55;
    if (rew) { rew.classList.add('charge'); setTimeout(() => { rew.classList.remove('charge'); rew.classList.add('burst'); }, t - 120); }
    const after = () => {
      const parent = ch.parent;
      const then = () => {
        cur = null;
        if (groupRes.length) {
          view = { mode: 'group', id: parent.id }; paint(enterFx);
          Cards.reveal(groupRes, () => paint(enterFx));
          return;
        }
        view = parent ? { mode: 'group', id: parent.id } : { mode: 'list', tab: lastTab };
        paint(enterFx); scrollTo(0, 0);
      };
      give(ch.reward, `ИПК: ${ch.title.toUpperCase()}`, then);
    };
    setTimeout(after, reduce ? 0 : t + 200);
  }
  function claimGroup(parent) {
    if (!parent || closed(parent) || groupDone(parent) !== parent.items.length) return [];
    S().done[parent.id] = 1;
    const res = parent.reward.card ? Cards.add([parent.reward.card]) : [];
    const dup = res.reduce((sum, item) => sum + item.coins, 0);
    if (dup) Coins.add(dup);
    Store.save();
    return res;
  }
  function give(r, ttl, then) {
    if (typeof Rewards !== 'undefined') Rewards.refresh();
    if (r.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(r.coins); toast(`ИПК выполнено! +${r.coins} монет`); then && then(); return; }
    if (r.pack !== undefined) { Rewards.openDrop({ title: ttl, minLevel: r.pack, label: 'И П К', onDone: () => then && then() }); return; }
    if (r.card) { const res = Cards.add([r.card]); const dup = res.reduce((s, x) => s + x.coins, 0); if (dup) Coins.add(dup); Cards.reveal(res, () => { Rewards.refresh(); then && then(); }); }
  }

  function openItem(id) {
    const x = find(id); if (!x) return;
    if (x.items) { go({ mode: 'group', id }, 1); Sound.play('tap'); return; }
    if (closed(x)) { info(id); return; }
    if (!cur || cur.id !== id) cur = { id, sq: Array(x.n).fill(null) };
    lastOk = {}; Sound.play('tap');
    go({ mode: 'ch', id }, 1, slotFx);
  }
  function back() {
    closeSheet(true);
    if (view.mode === 'ch') { const x = find(view.id); go(x && x.parent ? { mode: 'group', id: x.parent.id } : { mode: 'list', tab: lastTab }, -1); return; }
    if (view.mode === 'group') { go({ mode: 'list', tab: lastTab }, -1); return; }
    Rewards.open();
  }

  function open(id) {
    Modal.close(); Screens.show('sbc');
    view = { mode: 'list', tab: lastTab };
    if (id) openItem(id); else paint(enterFx);
    if (typeof Howto !== 'undefined') Howto.auto('sbc');
  }
  function bind() {
    const box = $('#sbc-body'); if (!box) return;
    $('#sbc-back').addEventListener('click', back);
    box.addEventListener('click', (e) => {
      const inf = e.target.closest('[data-sbi]'); if (inf) { Sound.play('tap'); return info(inf.dataset.sbi); }
      const t = e.target.closest('[data-sbt]'); if (t) {
        if (t.dataset.sbt === view.tab) return;
        const dir = TABS.findIndex(([k]) => k === t.dataset.sbt) > TABS.findIndex(([k]) => k === view.tab) ? 1 : -1;
        lastTab = t.dataset.sbt; Sound.play('tap'); return go({ mode: 'list', tab: lastTab }, dir);
      }
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
        render((b) => {
          $$('.sx-slot', b).forEach((sl, k) => { const c = $('.cc', sl); if (c && before[k] !== cur.sq[k]) { anim(c, [{ transform: 'translateZ(120px) rotateY(-180deg) scale(.5)', opacity: 0 }, { transform: 'rotateY(0) scale(1)', opacity: 1 }], { duration: 600, delay: k * 60, easing: 'cubic-bezier(.2,1.1,.3,1)', fill: 'backwards' }); landFx(c, 520 + k * 60); } });
          pulseHead(b);
        });
        if (!allOk(ch, cur.sq.map((k) => k && Cards.get(k)))) setTimeout(() => toast('Карточек не хватает, собрал сколько смог'), 500);
        return;
      }
      if (a.dataset.sbx === 'clear') {
        Sound.play('tap');
        $$('.sx-slot .cc', box).forEach((c, k) => anim(c, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px) rotateX(-70deg)', opacity: 0 }], { duration: 260, delay: k * 20, easing: 'ease-in', fill: 'forwards' }));
        setTimeout(() => { cur.sq = Array(ch.n).fill(null); render(); }, 280);
        return;
      }
      if (a.dataset.sbx === 'send') return send();
    });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const o = e.target.closest('[data-sbo]'); if (o) openItem(o.dataset.sbo); } });
    // таймеры «истекает через» живые
    setInterval(() => { if (Screens.current !== 'sbc') return; $$('[data-left]', box).forEach((el) => { el.textContent = left(+el.dataset.left); }); }, 30000);
  }
  // для значка: доступно ли испытание дня
  const ready = () => { try { const d = defs()[0]; return d && d.cat === 'day' && !closed(d) ? 1 : 0; } catch (e) { return 0; } };

  return { open, bind, ready, autofill, test, rating, defs, find, allOk, art };
})();
