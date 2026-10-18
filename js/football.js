// Футбол 3 на 3: перед матчем выбираешь из своих карточек двух полевых и вратаря.
// Карточки не тратятся и не меняются; выбор запоминается (Store.d.fb). В игру уходят имена и характеристики —
// они влияют мягко: быстрый бегает чуть быстрее, сильный удар — чуть сильнее, хороший вратарь — чуть раньше реагирует.
// Если своих карточек не хватает, место занимает «Игрок клуба» (рейтинг 65).
'use strict';

const Football = (() => {
  const S = () => { const d = Store.d; if (!d.fb || typeof d.fb !== 'object') d.fb = {}; const s = d.fb; if (!Array.isArray(s.xi)) s.xi = [null, null, null]; return s; };
  const isGK = (c) => c && (c.pos === 'ВРТ' || (c.positions && c.positions[0] === 'GK'));
  const mine = () => Cards.all().filter((c) => Cards.spare(c.key) > 0);
  // шесть характеристик карточки: полевой — скорость, удар, пас, дриблинг, защита, физика; вратарь — свои шесть
  function stats(c) {
    if (c.st) return c.st.slice();
    const f = typeof FC_STATS !== 'undefined' && FC_STATS[c.name];
    if (f) return f.slice(1, 7).map((v) => Math.min(99, v + (c.rar === 'jack' ? 4 : 0)));
    return Array(6).fill(c.r);
  }
  // по умолчанию — из «Моего состава», иначе лучшие свои карточки
  function auto() {
    const s = S(), own = mine().sort((a, b) => b.r - a.r), sq = (Store.d.squad && Store.d.squad.xi) || [];
    const fromSq = sq.map((k) => k && Cards.get(k)).filter((c) => c && Cards.spare(c.key) > 0);
    const gk = fromSq.find(isGK) || own.find(isGK) || null;
    const of = [...fromSq.filter((c) => !isGK(c)).sort((a, b) => b.r - a.r), ...own.filter((c) => !isGK(c))].filter((c, i, a) => a.indexOf(c) === i).slice(0, 2);
    s.xi = [of[0] ? of[0].key : null, of[1] ? of[1].key : null, gk ? gk.key : null];
  }
  const valid = (k, slot) => { const c = k && Cards.get(k); return !!c && Cards.spare(k) > 0 && (slot === 2 ? isGK(c) : !isGK(c)); };
  let slot = 0;
  function open() {
    const s = S(); if (!s.xi.some((k, i) => valid(k, i))) auto();
    s.xi = s.xi.map((k, i) => (valid(k, i) ? k : null));
    slot = s.xi.findIndex((k) => !k); if (slot < 0) slot = 0;
    render(); Screens.show('fbpick');
  }
  const LBL = ['Полевой', 'Полевой', 'Вратарь'];
  function render() {
    const s = S(), el = $('#fbp'); if (!el) return;
    const slots = s.xi.map((k, i) => {
      const c = k && Cards.get(k);
      return `<button class="fbp-slot ${i === slot ? 'sel' : ''}" data-fbslot="${i}">${c ? Cards.html(c, { w: 96 }) : '<span class="fbp-empty">Игрок клуба<small>65</small></span>'}<b>${LBL[i]}</b></button>`;
    }).join('');
    const list = mine().filter((c) => (slot === 2 ? isGK(c) : !isGK(c))).sort((a, b) => b.r - a.r).slice(0, 40);
    const used = new Set(s.xi.filter(Boolean));
    const cells = list.map((c) => `<button class="sq-pc fbp-pc ${s.xi[slot] === c.key ? 'sel' : ''} ${used.has(c.key) && s.xi[slot] !== c.key ? 'off' : ''}" data-fbcard="${esc(c.key)}">${Cards.html(c, { w: 70 })}</button>`).join('');
    el.innerHTML = `<div class="fbp-slots">${slots}</div>
      <p class="fbp-h">${slot === 2 ? 'Вратари' : 'Полевые'} из твоей коллекции</p>
      <div class="fbp-list">${cells || `<p class="fbp-none">${slot === 2 ? 'Вратарей пока нет' : 'Полевых пока нет'} — на поле выйдет игрок клуба. Карточки — из паков и испытаний.</p>`}</div>
      <div class="fbp-go"><button class="btn" data-act="football-go">На поле!</button></div>`;
  }
  function bind() {
    const el = $('#fbp'); if (!el) return;
    el.addEventListener('click', (e) => {
      const sl = e.target.closest('[data-fbslot]'); if (sl) { slot = +sl.dataset.fbslot; Sound.play('tap'); return render(); }
      const pc = e.target.closest('[data-fbcard]'); if (!pc) return;
      e.stopPropagation();
      const s = S(), k = pc.dataset.fbcard, other = s.xi.indexOf(k);
      if (other >= 0 && other !== slot) s.xi[other] = s.xi[slot]; // уже стоит на другом месте — меняются местами
      s.xi[slot] = k; Store.save(); Sound.play('tap');
      const next = s.xi.findIndex((x) => !x); if (next >= 0) slot = next;
      render();
    }, true);
  }
  // состав для игры: «имя|рейтинг|ск|уд|пас|дрб|защ|физ» (вратарь — его шесть характеристик)
  function team() {
    return S().xi.map((k) => { const c = k && Cards.get(k); return c ? [Cards.surname ? Cards.surname(c.name) : c.name, c.r, ...stats(c)].join('|') : ''; });
  }
  return { open, render, bind, team, auto };
})();
document.addEventListener('DOMContentLoaded', () => Football.bind());
