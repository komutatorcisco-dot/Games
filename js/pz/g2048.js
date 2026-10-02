// «2048: Карьера»: соединяй одинаковые плитки и пройди путь от двора до Золотого мяча.
// Плитки — отдельные элементы: при свайпе они едут на новое место, сливаются с «пружинкой», новая появляется после хода.
'use strict';

(() => {
  const STAGES = { 2: 'Двор', 4: 'Школа', 8: 'Академия', 16: 'Дубль', 32: 'Дебют', 64: 'Основа', 128: 'Капитан', 256: 'Сборная', 512: 'Трансфер', 1024: 'Лига чемпионов', 2048: 'Золотой мяч', 4096: 'Легенда' };
  const SLIDE_MS = 130;

  PZ.register({
    id: 'g2048', title: '2048: Карьера', icon: '2048', c1: '#ffcf3a', c2: '#ff7a59', endless: true, sub: 'Соединяй плитки свайпом', metaNew: 'До Золотого мяча',
    start(level, api) {
      const n = 4;
      let tiles = [], seq = 0, score = 0, over = false, won = false, busy = false;
      const area = api.area();
      area.innerHTML = `<div class="g48">${'<span class="g48-cell"></span>'.repeat(n * n)}<div class="g48-layer"></div></div>`;
      const layer = $('.g48-layer', area);
      const at = (x, y) => tiles.find((t) => t.x === x && t.y === y && !t.gone);

      function hud() {
        api.hud(`<span class="pz-chip">Очки: <b>${score}</b></span><span class="pz-chip">Рекорд: <b>${Math.max(api.getBest(), score)}</b></span>`);
      }
      function paint(t) {
        if (!t.el) {
          t.el = document.createElement('span');
          layer.appendChild(t.el);
        }
        t.el.className = `g48-t v${Math.min(t.v, 4096)}${t.isNew ? ' new' : ''}${t.merged ? ' merge' : ''}`;
        t.el.style.setProperty('--x', t.x);
        t.el.style.setProperty('--y', t.y);
        t.el.innerHTML = `<b>${t.v}</b><small>${STAGES[t.v] || ''}</small>`;
        t.isNew = false; t.merged = false;
      }
      function add() {
        const free = [];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!at(x, y)) free.push([x, y]);
        if (!free.length) return;
        const [x, y] = free[Math.floor(Math.random() * free.length)];
        const t = { id: ++seq, v: Math.random() < 0.9 ? 2 : 4, x, y, isNew: true };
        tiles.push(t); paint(t);
      }

      function slide(dir) {
        if (over || busy) return;
        const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
        // обходим с той стороны, куда едем
        const xs = [...Array(n).keys()], ys = [...Array(n).keys()];
        if (vec[0] === 1) xs.reverse();
        if (vec[1] === 1) ys.reverse();
        let moved = false;
        const mergedInto = new Set();
        for (const y of ys) for (const x of xs) {
          const t = at(x, y);
          if (!t) continue;
          let cx = x, cy = y;
          for (;;) {
            const nx = cx + vec[0], ny = cy + vec[1];
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) break;
            const o = at(nx, ny);
            if (!o) { cx = nx; cy = ny; continue; }
            if (o.v === t.v && !mergedInto.has(o.id)) {
              // плитка доезжает до соседа и исчезает, сосед удваивается
              t.x = nx; t.y = ny; t.gone = o; mergedInto.add(o.id);
              moved = true;
            }
            break;
          }
          if (!t.gone && (cx !== x || cy !== y)) { t.x = cx; t.y = cy; moved = true; }
        }
        if (!moved) { tiles.forEach((t) => { t.gone = undefined; }); return; }
        busy = true;
        Sound.play('tap'); haptic('tap');
        tiles.forEach((t) => { t.el.style.setProperty('--x', t.x); t.el.style.setProperty('--y', t.y); if (t.gone) t.el.style.zIndex = 1; });
        later(() => {
          for (const t of tiles.filter((q) => q.gone)) {
            const o = t.gone;
            o.v *= 2; o.merged = true; score += o.v;
            t.el.remove();
            paint(o);
          }
          tiles = tiles.filter((q) => !q.gone);
          if (mergedInto.size) Sound.play('kick');
          add();
          api.best(score);
          hud();
          busy = false;
          after();
        }, SLIDE_MS);
      }

      function after() {
        const vals = tiles.map((t) => t.v);
        if (!won && vals.includes(2048)) { won = true; Profile.bump('pz', 40); Coins.add(100); toast('Золотой мяч! +100 монет'); confetti(); }
        const full = tiles.length === n * n;
        const canMerge = tiles.some((t) => { const r = at(t.x + 1, t.y), d = at(t.x, t.y + 1); return (r && r.v === t.v) || (d && d.v === t.v); });
        if (full && !canMerge) {
          over = true;
          const top = Math.max(...vals);
          if (score >= 500) Profile.bump('pz', 5);
          Econ.play(Math.floor(score / 400));
          later(() => Modal.open(
            `<h2>Карьера окончена</h2><p>Дошёл до: <b>${STAGES[top]}</b> (${top})</p><p>Очки: <b>${score}</b> · рекорд: ${api.getBest()}</p>`,
            [{ label: 'Новая карьера', onClick: () => PZ.open('g2048') }, { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') }],
          ), 400);
        }
      }

      add(); add(); hud();
      onSwipe(area, slide);
      const key = (e) => {
        const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
        if (m && Screens.current === 'pz') { e.preventDefault(); slide(m); }
      };
      document.addEventListener('keydown', key);
      api.actions([{ label: '⟲ Новая карьера', fn: () => PZ.open('g2048') }]);
      return () => document.removeEventListener('keydown', key);
    },
  });
})();
