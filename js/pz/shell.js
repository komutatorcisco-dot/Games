// Полка головоломок: общая оболочка для мини-игр с уровнями (экран, прогресс, звёзды, окно победы).
'use strict';

const PZ = (() => {
  const list = [];
  let cur = null, level = 1, cleanup = null, ch = 0; // ch — номер испытания из пака (0 — обычный уровень)
  const PACK = 10;
  const packLevel = (k) => 30 + k * 5;            // испытания — как поздние уровни, но со своими раскладками
  const pack = (id) => Store.d.shop.packs[id];

  const state = (id) => {
    const S = Store.d.pz || (Store.d.pz = {});
    return S[id] || (S[id] = { level: 1, stars: {}, best: 0 });
  };

  const api = {
    area: () => $('#pz-area'),
    level: () => level,
    rng: (salt = 0) => mulberry32(level * 7919 + salt * 104729 + 17 + (ch ? 99991 * ch : 0)),
    hud(html) { $('#pz-hud').innerHTML = html; },
    sub(text) { $('#pz-sub').textContent = text; },
    actions(btns) {
      const box = $('#pz-actions');
      box.innerHTML = '';
      btns.forEach((b) => {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || 'ghost');
        el.textContent = b.label;
        el.addEventListener('click', b.fn);
        box.appendChild(el);
      });
    },
    best(v) {
      const st = state(cur.id);
      if (v > st.best) { st.best = v; Store.save(); return true; }
      return false;
    },
    getBest: () => state(cur.id).best,
    win(stars = 3, text = '') {
      if (ch) return winPack(stars, text);
      const st = state(cur.id);
      const prev = st.stars[level] || 0;
      let reward = 0;
      if (stars > prev) { reward = (stars - prev) * 5 + (prev ? 0 : 10); st.stars[level] = stars; }
      if (level >= st.level) st.level = level + 1;
      Profile.bump('pz', 6);
      Store.save();
      Sound.play('goal'); haptic('ok');
      if (stars === 3) confetti();
      if (reward) later(() => Coins.add(reward), 400);
      const starsHtml = [1, 2, 3].map((i) => (i <= stars ? '★' : '<span class="off">★</span>')).join('');
      later(() => Modal.open(
        resultHtml({ ico: cur.id, c1: cur.c1, c2: cur.c2, win: true, title: `Уровень ${level} пройден!`, text, extra: `<div class="stars">${starsHtml}</div>`, reward }),
        [
          { label: `Уровень ${level + 1} →`, onClick: () => open(cur.id, level + 1) },
          { label: 'Переиграть', cls: 'ghost', onClick: () => open(cur.id, level) },
          { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') },
        ],
      ), 500);
    },
    lose(text) {
      Sound.play('lose'); haptic('bad');
      later(() => Modal.open(
        resultHtml({ ico: cur.id, c1: cur.c1, c2: cur.c2, title: 'Не вышло', text }),
        [
          { label: 'Ещё раз', onClick: () => open(cur.id, level, ch) },
          { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') },
        ],
      ), 400);
    },
  };

  // Победа в испытании: монеты ×2, после 10-го — бонус за весь пак
  function winPack(stars, text) {
    const P = pack(cur.id), k = ch;
    const prev = P.done[k] || 0;
    let reward = stars > prev ? (stars - prev) * 10 + (prev ? 0 : 20) : 0;
    if (stars > prev) P.done[k] = stars;
    const all = Object.keys(P.done).length >= PACK && !P.bonus;
    if (all) { P.bonus = true; reward += 100; }
    Profile.bump('pz', 12);
    Store.save();
    Sound.play('goal'); haptic('ok'); confetti();
    if (reward) later(() => Coins.add(reward), 400);
    const starsHtml = [1, 2, 3].map((i) => (i <= stars ? '★' : '<span class="off">★</span>')).join('');
    later(() => Modal.open(
      resultHtml({ ico: cur.id, c1: cur.c1, c2: cur.c2, win: true, title: all ? 'Пак испытаний пройден!' : `Испытание ${k} из ${PACK}!`, text, extra: `<div class="stars">${starsHtml}</div>`, reward }),
      [
        ...(k < PACK ? [{ label: `Испытание ${k + 1} →`, onClick: () => open(cur.id, 0, k + 1) }] : []),
        { label: 'Переиграть', cls: 'ghost', onClick: () => open(cur.id, 0, k) },
        { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') },
      ],
    ), 500);
  }

  function register(g) { list.push(g); }

  // Нажатие на головоломку: если куплен пак — выбор между обычными уровнями и испытаниями
  function choose(id) {
    const g = list.find((x) => x.id === id), P = pack(id);
    if (!P || g.endless) { open(id); return; }
    const next = [...Array(PACK).keys()].map((i) => i + 1).find((k) => !P.done[k]) || 1;
    Modal.open(
      `<h2>${g.title}</h2><p>Обычные уровни или пак испытаний?</p>
       <div class="pack-dots">${[...Array(PACK).keys()].map((i) => `<button class="${P.done[i + 1] ? 'ok' : ''}" data-ch="${i + 1}">${i + 1}</button>`).join('')}</div>`,
      [
        { label: `Уровень ${state(id).level} →`, onClick: () => open(id) },
        { label: `🔥 Испытание ${next} из ${PACK}`, cls: 'gold', onClick: () => open(id, 0, next) },
      ],
    );
    $$('.pack-dots [data-ch]').forEach((b) => b.addEventListener('click', () => open(id, 0, +b.dataset.ch)));
  }

  function open(id, lvl, k = 0) {
    if (cleanup) { try { cleanup(); } catch (e) { /* ничего */ } cleanup = null; }
    cur = list.find((g) => g.id === id);
    const st = state(id);
    ch = k && pack(id) ? k : 0;
    level = ch ? packLevel(ch) : lvl || st.level;
    Modal.close();
    Screens.show('pz');
    $('#pz-title').textContent = cur.title;
    $('#pz-sub').textContent = cur.endless ? (cur.sub || '') : ch ? `🔥 Испытание ${ch} из ${PACK}` : `Уровень ${level}`;
    $('#pz-hud').innerHTML = '';
    $('#pz-actions').innerHTML = '';
    // Новое поле на каждый запуск: старые обработчики прошлого уровня уходят вместе со старым элементом
    const oldArea = $('#pz-area');
    const area = oldArea.cloneNode(false);
    oldArea.replaceWith(area);
    area.className = 'pz-area pz-' + id;
    cleanup = cur.start(level, api) || null;
  }

  function leave() {
    if (cleanup) { try { cleanup(); } catch (e) { /* ничего */ } cleanup = null; }
  }

  function shelf() {
    return list.map((g) => {
      const st = state(g.id);
      const P = pack(g.id);
      const meta = g.endless ? (st.best ? `Рекорд ${st.best}` : g.metaNew || 'Без конца') : `Уровень ${st.level}${P ? ` · 🔥 ${Object.keys(P.done).length}/${PACK}` : ''}`;
      return `<button class="tile-card pz-tile" data-pz="${g.id}" style="--c1:${g.c1};--c2:${g.c2}">
        <span class="tile-ico" data-ico="${g.id}" data-done="1">${Icons.get(g.id) || g.icon}</span><b>${g.title}</b><small>${meta}</small></button>`;
    }).join('');
  }

  return { register, open, choose, leave, shelf, list };
})();

// Свайп по элементу: cb('up' | 'down' | 'left' | 'right').
function onSwipe(el, cb, min = 24) {
  let sx = 0, sy = 0, on = false;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; on = true; });
  el.addEventListener('pointerup', (e) => {
    if (!on) return;
    on = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  el.addEventListener('pointercancel', () => { on = false; });
}

// Цвета мячей и формы клубов.
const KIT = ['#e2384d', '#2f6fe4', '#f5f5f5', '#ffcf3a', '#2fb35a', '#8e44d6', '#ff8a2a', '#5fd3f3', '#2a2a35', '#ff6fb5'];
