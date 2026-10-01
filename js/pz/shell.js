// Полка головоломок: общая оболочка для мини-игр с уровнями (экран, прогресс, звёзды, окно победы).
'use strict';

const PZ = (() => {
  const list = [];
  let cur = null, level = 1, cleanup = null;

  const state = (id) => {
    const S = Store.d.pz || (Store.d.pz = {});
    return S[id] || (S[id] = { level: 1, stars: {}, best: 0 });
  };

  const api = {
    area: () => $('#pz-area'),
    level: () => level,
    rng: (salt = 0) => mulberry32(level * 7919 + salt * 104729 + 17),
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
        `<h2>Уровень ${level} пройден!</h2><div class="stars">${starsHtml}</div>
         ${text ? `<p>${text}</p>` : ''}
         ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}`,
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
        `<h2>Не вышло</h2><p>${text}</p>`,
        [
          { label: 'Ещё раз', onClick: () => open(cur.id, level) },
          { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') },
        ],
      ), 400);
    },
  };

  function register(g) { list.push(g); }

  function open(id, lvl) {
    if (cleanup) { try { cleanup(); } catch (e) { /* ничего */ } cleanup = null; }
    cur = list.find((g) => g.id === id);
    const st = state(id);
    level = lvl || st.level;
    Modal.close();
    Screens.show('pz');
    $('#pz-title').textContent = cur.title;
    $('#pz-sub').textContent = cur.endless ? (cur.sub || '') : `Уровень ${level}`;
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
      const meta = g.endless ? (st.best ? `Рекорд ${st.best}` : g.metaNew || 'Без конца') : `Уровень ${st.level}`;
      return `<button class="tile-card pz-tile" data-pz="${g.id}" style="--c1:${g.c1};--c2:${g.c2}">
        <span class="tile-ico" data-ico="${g.id}" data-done="1">${Icons.get(g.id) || g.icon}</span><b>${g.title}</b><small>${meta}</small></button>`;
    }).join('');
  }

  return { register, open, leave, shelf, list };
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
