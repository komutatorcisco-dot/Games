// «2048: Карьера»: соединяй одинаковые плитки и пройди путь от двора до Золотого мяча.
'use strict';

(() => {
  const STAGES = { 2: 'Двор', 4: 'Школа', 8: 'Академия', 16: 'Дубль', 32: 'Дебют', 64: 'Основа', 128: 'Капитан', 256: 'Сборная', 512: 'Трансфер', 1024: 'Лига чемпионов', 2048: 'Золотой мяч', 4096: 'Легенда' };

  PZ.register({
    id: 'g2048', title: '2048: Карьера', icon: '2048', c1: '#ffcf3a', c2: '#ff7a59', endless: true, sub: 'Соединяй плитки свайпом', metaNew: 'До Золотого мяча',
    start(level, api) {
      const n = 4;
      let g = new Array(n * n).fill(0), score = 0, over = false, won = false, fresh = -1, merged = new Set();
      const area = api.area();
      function add() {
        const free = g.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        if (!free.length) return;
        const i = free[Math.floor(Math.random() * free.length)];
        g[i] = Math.random() < 0.9 ? 2 : 4; fresh = i;
      }
      function render() {
        area.innerHTML = `<div class="g48" ${''}>${g.map((v, i) => `<span class="g48-t v${Math.min(v, 4096)} ${i === fresh ? 'new' : ''} ${merged.has(i) ? 'merge' : ''}">${v ? `<b>${v}</b><small>${STAGES[v] || ''}</small>` : ''}</span>`).join('')}</div>`;
        api.hud(`<span class="pz-chip">Очки: <b>${score}</b></span><span class="pz-chip">Рекорд: <b>${Math.max(api.getBest(), score)}</b></span>`);
        fresh = -1; merged = new Set();
      }
      function slide(dir) {
        if (over) return;
        const before = g.join(',');
        for (let a = 0; a < n; a++) {
          const idx = [];
          for (let b = 0; b < n; b++) {
            const [x, y] = dir === 'left' ? [b, a] : dir === 'right' ? [n - 1 - b, a] : dir === 'up' ? [a, b] : [a, n - 1 - b];
            idx.push(y * n + x);
          }
          const vals = idx.map((i) => g[i]).filter(Boolean);
          const out = [];
          for (let k = 0; k < vals.length; k++) {
            if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); score += vals[k] * 2; merged.add(idx[out.length - 1]); k++; }
            else out.push(vals[k]);
          }
          idx.forEach((i, k) => { g[i] = out[k] || 0; });
        }
        if (g.join(',') === before) return;
        Sound.play('tap'); haptic('tap');
        add();
        if (api.best(score)) { /* новый рекорд */ }
        render();
        if (!won && g.includes(2048)) { won = true; Profile.bump('pz', 40); Coins.add(100); toast('Золотой мяч! +100 монет'); confetti(); }
        const canMove = g.includes(0) || g.some((v, i) => (i % n < n - 1 && v === g[i + 1]) || (i + n < n * n && v === g[i + n]));
        if (!canMove) {
          over = true;
          const top = Math.max(...g);
          if (score >= 500) Profile.bump('pz', 5);
          Coins.add(Math.floor(score / 200));
          later(() => Modal.open(
            `<h2>Карьера окончена</h2><p>Дошёл до: <b>${STAGES[top]}</b> (${top})</p><p>Очки: <b>${score}</b> · рекорд: ${api.getBest()}</p>`,
            [{ label: 'Новая карьера', onClick: () => PZ.open('g2048') }, { label: 'Все головоломки', cls: 'ghost', onClick: () => App.home('puzzles') }],
          ), 400);
        }
      }
      add(); add(); render();
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
