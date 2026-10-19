// Футбол: перед матчем — формат (3 на 3 или пробный 11 на 11), сложность соперников и состав ПО ПОЗИЦИЯМ.
// 3 на 3 — нападающий, защитник и вратарь из своих карточек; 11 на 11 — «Мой состав» на схеме (тот же, что в
// разделе «Мой состав»: схема и места общие). Карточки не тратятся и не меняются; выбор запоминается (Store.d.fb,
// Store.d.squad). В игру уходят имя, характеристики и место на поле — игрок держит свою позицию в матче.
// Характеристики влияют мягко: быстрый бегает чуть быстрее, сильный удар — чуть сильнее, хороший вратарь — реагирует раньше.
// Если своих карточек не хватает, место занимает «Игрок клуба» (рейтинг 65).
'use strict';

const Football = (() => {
  const S = () => { const d = Store.d; if (!d.fb || typeof d.fb !== 'object') d.fb = {}; const s = d.fb; if (!Array.isArray(s.xi)) s.xi = [null, null, null]; if (s.fmt !== 11) s.fmt = 3; if (![0, 1, 2].includes(s.diff)) s.diff = 1; return s; };
  const SQ = () => (typeof Squad !== 'undefined' && Squad.S ? Squad.S() : (Store.d.squad || { form: '4-3-3', xi: Array(11).fill(null) }));
  const posOf = (c) => (typeof PlayerPositions !== 'undefined' ? PlayerPositions.get(c.name, c.pos) : [c.pos === 'ВРТ' ? 'GK' : 'CM']);
  const isGK = (c) => !!c && (c.pos === 'ВРТ' || posOf(c)[0] === 'GK');
  const mine = () => Cards.all().filter((c) => Cards.spare(c.key) > 0);
  const DIFF = ['Лёгкие', 'Средние', 'Сильные'];
  // шесть характеристик карточки: полевой — скорость, удар, пас, дриблинг, защита, физика; вратарь — свои шесть
  function stats(c) {
    if (c.st) return c.st.slice();
    const f = typeof FC_STATS !== 'undefined' && FC_STATS[c.name];
    if (f) return f.slice(1, 7).map((v) => Math.min(99, v + (c.rar === 'jack' ? 4 : 0)));
    return Array(6).fill(c.r);
  }

  // ---------- 3 на 3: нападающий, защитник, вратарь ----------
  const LBL3 = ['Нападающий', 'Защитник', 'Вратарь'];
  const SHORT3 = ['НАП', 'ЗАЩ', 'ВРТ'];
  const FIT3 = [['ST', 'CF', 'LW', 'RW', 'CAM', 'LM', 'RM', 'LF', 'RF'], ['CB', 'LB', 'RB', 'CDM', 'CM', 'LWB', 'RWB'], ['GK']];
  const fit3 = (c, i) => !!c && posOf(c).some((p) => FIT3[i].includes(p));
  const ok3 = (k, i) => { const c = k && Cards.get(k); return !!c && Cards.spare(k) > 0 && (i === 2 ? isGK(c) : !isGK(c)); };
  // по умолчанию — лучшие на своих позициях (сначала из «Моего состава»), иначе лучшие полевые
  function auto3() {
    const s = S(), sq = (SQ().xi || []).map((k) => k && Cards.get(k)).filter((c) => c && Cards.spare(c.key) > 0);
    const pool = [...sq, ...mine().sort((a, b) => b.r - a.r)].filter((c, i, a) => a.indexOf(c) === i);
    const used = new Set(), take = (f) => { const c = pool.find((x) => !used.has(x.key) && f(x)); if (c) used.add(c.key); return c || null; };
    const gk = take(isGK), st = take((c) => fit3(c, 0)) , df = take((c) => fit3(c, 1));
    const st2 = st || take((c) => !isGK(c)), df2 = df || take((c) => !isGK(c));
    s.xi = [st2 ? st2.key : null, df2 ? df2.key : null, gk ? gk.key : null];
  }

  // ---------- 11 на 11: схема и места из «Моего состава» ----------
  const FORM = () => XD.FORMATIONS[SQ().form] || XD.FORMATIONS['4-3-3'];
  const fitPos = (c, pos) => { const p = posOf(c); return p.includes(pos) ? 2 : ((p[0] === 'GK') !== (pos === 'GK') ? -1 : 0); };
  // своя карточка на месте или (если места пусты) лучшая подходящая из коллекции — «авто»
  function lineup11() {
    const sq = SQ(), F = FORM(), xi = (sq.xi || []).slice(0, 11).map((k) => (k && Cards.spare(k) > 0 ? Cards.get(k) : null));
    const used = new Set(xi.filter(Boolean).map((c) => c.key)), pool = mine().sort((a, b) => b.r - a.r), auto = [];
    F.slots.forEach((sl, i) => {
      if (xi[i]) return;
      let best = null, bv = -1e9;
      for (const c of pool) { if (used.has(c.key)) continue; const f = fitPos(c, sl.pos); if (f < 0) continue; const v = f * 100 + c.r; if (v > bv) { bv = v; best = c; } }
      if (best) { xi[i] = best; used.add(best.key); auto[i] = true; }
    });
    return { F, xi, auto };
  }

  let slot = 0;
  function open() {
    const s = S(); if (!s.xi.some((k, i) => ok3(k, i))) auto3();
    s.xi = s.xi.map((k, i) => (ok3(k, i) ? k : null));
    slot = s.xi.findIndex((k) => !k); if (slot < 0) slot = 0;
    render(); Screens.show('fbpick');
  }
  // тренировки для новичка (игра сама запоминает лучший результат — тот же сайт, localStorage 'shot.lessons')
  const LESSONS = [['basics', 'Основы', 'Бег, пас, удар'], ['dribble', 'Дриблинг', 'Гонка через фишки'], ['targets', 'Мишени', 'Штрафные по мишеням']];
  function lessons() {
    let st = {}; try { st = JSON.parse(localStorage.getItem('shot.lessons') || '{}'); } catch (e) { /* без памяти */ }
    return `<p class="fbp-h">Тренировки для новичка</p><div class="fbp-les">${LESSONS.map(([id, t, d], i) => { const r = st[id];
      return `<button class="fbp-l ${r && r.ok ? 'ok' : ''}" data-fblesson="${id}"><i>${r && r.ok ? '✓' : i + 1}</i><b>${t}</b><small>${r ? `${r.best} оч.` : d}</small></button>`; }).join('')}</div>`;
  }
  function head(s) {
    return `<div class="fbp-seg">${[3, 11].map((n) => `<button data-fbfmt="${n}" class="${s.fmt === n ? 'on' : ''}">${n} на ${n}${n === 11 ? ' · тест' : ''}</button>`).join('')}</div>
      <div class="fbp-seg sm"><span>Соперники</span>${DIFF.map((t, i) => `<button data-fbdiff="${i}" class="${s.diff === i ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  }
  // список карточек для выбранного места: подходящие по позиции — впереди, чужие помечены
  function cells(fit, gk, cur, used) {
    const list = mine().filter((c) => (gk ? isGK(c) : !isGK(c))).map((c) => ({ c, f: fit(c) })).sort((a, b) => (b.f - a.f) || (b.c.r - a.c.r)).slice(0, 48);
    return list.map(({ c, f }) => `<button class="sq-pc fbp-pc ${cur === c.key ? 'sel' : ''} ${used.has(c.key) && cur !== c.key ? 'off' : ''}" data-fbcard="${esc(c.key)}">${Cards.html(c, { w: 70 })}${f ? '' : '<em>не своя позиция</em>'}</button>`).join('');
  }
  const PITCH = '<svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="3" width="94" height="134" rx="2"/><line x1="3" y1="70" x2="97" y2="70"/><circle cx="50" cy="70" r="12"/><rect x="25" y="3" width="50" height="20"/><rect x="25" y="117" width="50" height="20"/></svg>';
  function render() {
    const s = S(), el = $('#fbp'); if (!el) return;
    if (s.fmt === 11) {
      const { F, xi, auto } = lineup11(), sq = SQ();
      if (slot > 10) slot = 0;
      const pos = F.slots[slot].pos, own = xi.filter((c, i) => c && !auto[i]).length;
      const pts = F.slots.map((sl, i) => {
        const c = xi[i];
        return `<button class="sq-slot fbp-pt ${c ? 'on' : ''} ${auto[i] ? 'auto' : ''} ${i === slot ? 'sel' : ''}" data-fbslot="${i}" style="left:${sl.x}%;top:${sl.y}%">${c ? Cards.html(c, { w: 46, cls: 'sq-mini' }) : '<span class="sq-plus">+</span>'}<small>${esc(XD.RU[sl.pos] || sl.pos)}</small></button>`;
      }).join('');
      const used = new Set(xi.filter((c, i) => c && !auto[i]).map((c) => c.key));
      el.innerHTML = `${head(s)}
        <div class="fbp-forms">${Object.keys(XD.FORMATIONS).map((f) => `<button data-fbform="${f}" class="${f === sq.form ? 'on' : ''}">${f}</button>`).join('')}</div>
        <div class="sq-pitch fbp-pitch">${PITCH}${pts}</div>
        <p class="fbp-h">${esc(XD.RU[pos] || pos)} — выбери игрока <small>${own} из 11 своих${own < 11 ? ' · бледные подобраны сами' : ''}</small></p>
        <div class="fbp-list">${cells((c) => (fitPos(c, pos) > 0 ? 1 : 0), pos === 'GK', sq.xi[slot], used) || `<p class="fbp-none">Карточек пока нет — на поле выйдет игрок клуба.</p>`}</div>
        <p class="fbp-none">Пробный режим: 11 на 11 на полном поле, 5 минут. Состав общий с «Моим составом».</p>${lessons()}
        <div class="fbp-go"><button class="btn" data-act="football-go">На поле!</button></div>`;
      return;
    }
    const slots = s.xi.map((k, i) => {
      const c = k && Cards.get(k);
      return `<button class="fbp-slot ${i === slot ? 'sel' : ''}" data-fbslot="${i}">${c ? Cards.html(c, { w: 96 }) : '<span class="fbp-empty">Игрок клуба<small>65</small></span>'}<b>${LBL3[i]}</b>${c && !fit3(c, i) ? '<em>не своя позиция</em>' : ''}</button>`;
    }).join('');
    const used = new Set(s.xi.filter(Boolean));
    el.innerHTML = `${head(s)}<div class="fbp-slots">${slots}</div>
      <p class="fbp-h">${LBL3[slot]} — ${slot === 2 ? 'вратари' : 'полевые'} из твоей коллекции</p>
      <div class="fbp-list">${cells((c) => (fit3(c, slot) ? 1 : 0), slot === 2, s.xi[slot], used) || `<p class="fbp-none">${slot === 2 ? 'Вратарей пока нет' : 'Полевых пока нет'} — на поле выйдет игрок клуба. Карточки — из паков и испытаний.</p>`}</div>${lessons()}
      <div class="fbp-go"><button class="btn" data-act="football-go">На поле!</button></div>`;
  }
  function bind() {
    const el = $('#fbp'); if (!el) return;
    el.addEventListener('click', (e) => {
      const fm = e.target.closest('[data-fbfmt]'); if (fm) { S().fmt = +fm.dataset.fbfmt; slot = 0; Store.save(); Sound.play('tap'); return render(); }
      const df = e.target.closest('[data-fbdiff]'); if (df) { S().diff = +df.dataset.fbdiff; Store.save(); Sound.play('tap'); return render(); }
      const le = e.target.closest('[data-fblesson]'); if (le) { Sound.play('tap'); return App.openFootball('fk', le.dataset.fblesson); }
      const fo = e.target.closest('[data-fbform]'); if (fo) { SQ().form = fo.dataset.fbform; Store.save(); Sound.play('tap'); return render(); }
      const sl = e.target.closest('[data-fbslot]'); if (sl) { slot = +sl.dataset.fbslot; Sound.play('tap'); return render(); }
      const pc = e.target.closest('[data-fbcard]'); if (!pc) return;
      e.stopPropagation();
      const k = pc.dataset.fbcard;
      if (S().fmt === 11) {
        const sq = SQ(); if (!Array.isArray(sq.xi) || sq.xi.length !== 11) sq.xi = Array(11).fill(null);
        const other = sq.xi.indexOf(k);
        if (other >= 0 && other !== slot) sq.xi[other] = sq.xi[slot]; // уже стоит на другом месте — меняются местами
        sq.xi[slot] = k; Store.save(); Sound.play('tap');
        const next = sq.xi.findIndex((x) => !x); if (next >= 0) slot = next;
        return render();
      }
      const s = S(), other = s.xi.indexOf(k);
      if (other >= 0 && other !== slot) s.xi[other] = s.xi[slot];
      s.xi[slot] = k; Store.save(); Sound.play('tap');
      const next = s.xi.findIndex((x) => !x); if (next >= 0) slot = next;
      render();
    }, true);
  }
  // игрок для игры: «имя|рейтинг|6 характеристик|позиция|x%|y%» (x, y — место на схеме; без карточки — игрок клуба)
  // рост (см) — из базы карточек (Transfermarkt), если нашёлся; иначе игра возьмёт рост по позиции
  const heightOf = (c) => { const f = c && typeof FC_STATS !== 'undefined' && FC_STATS[c.name]; return f && f[9] ? f[9] : ''; };
  // игровой номер — из базы игроков (js/players.js), если есть
  let NUMS = null;
  const numOf = (c) => { if (!NUMS) { NUMS = new Map(); if (typeof PLAYERS !== 'undefined') PLAYERS.forEach((p) => { if (p.num) NUMS.set(p.name, p.num); }); } return (c && NUMS.get(c.name)) || ''; };
  // строка игрока для игры: имя|рейтинг|6 характеристик|позиция|x|y|рост|номер
  function row(c, sl, pos) {
    const tail = sl ? [sl.pos, sl.x, sl.y] : [pos || '', '', ''];
    if (!c) return sl ? ['Игрок клуба', 65, ...Array(6).fill(65), ...tail, '', ''].join('|') : '';
    return [Cards.surname ? Cards.surname(c.name) : c.name, c.r, ...stats(c), ...tail, heightOf(c), numOf(c)].join('|');
  }
  function team() {
    const s = S();
    if (s.fmt === 11) {
      const { F, xi } = lineup11();
      const idx = F.slots.map((sl, i) => i).filter((i) => F.slots[i].pos !== 'GK');
      const gi = F.slots.findIndex((sl) => sl.pos === 'GK');
      // первым — тот, кем управляешь на старте: нападающий (или самый передний), дальше — от атаки к защите
      const st = idx.find((i) => F.slots[i].pos === 'ST') ?? idx.reduce((a, i) => (F.slots[i].y < F.slots[a].y ? i : a), idx[0]);
      const rest = idx.filter((i) => i !== st).sort((a, b) => F.slots[a].y - F.slots[b].y);
      return [st, ...rest, gi].map((i) => row(xi[i], F.slots[i]));
    }
    return s.xi.map((k, i) => { const c = k && Cards.get(k); return c ? row(c, null, i < 2 ? FIT3[i][0] : 'GK') : ''; });
  }
  // параметры игры: состав (p0…, вратарь последний), размер команды, сложность
  function params() {
    const s = S(), q = { n: String(s.fmt), diff: String(s.diff) };
    team().forEach((p, i) => { if (p) q['p' + i] = p; });
    return q;
  }
  return { open, render, bind, team, params, auto: auto3 };
})();
document.addEventListener('DOMContentLoaded', () => Football.bind());
