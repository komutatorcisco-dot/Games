// «Перекрась поле»: начиная с левого верхнего угла, перекрашивай свою зону, пока всё поле не станет одного цвета.
// Лимит ходов считается жадным решателем, так что уложиться всегда можно.
'use strict';

(() => {
  function region(g, n) {
    const c0 = g[0], seen = new Set([0]), q = [0];
    while (q.length) {
      const i = q.pop(), x = i % n, y = Math.floor(i / n);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
        const j = ny * n + nx;
        if (!seen.has(j) && g[j] === c0) { seen.add(j); q.push(j); }
      });
    }
    return seen;
  }
  function paint(g, n, c) {
    const out = g.slice();
    region(g, n).forEach((i) => { out[i] = c; });
    return out;
  }
  function greedy(g, n, k) {
    let cur = g.slice(), steps = 0;
    while (region(cur, n).size < n * n && steps < 200) {
      let best = -1, bestSize = -1;
      for (let c = 0; c < k; c++) {
        if (c === cur[0]) continue;
        const s = region(paint(cur, n, c), n).size;
        if (s > bestSize) { bestSize = s; best = c; }
      }
      cur = paint(cur, n, best); steps++;
    }
    return steps;
  }

  PZ.register({
    id: 'flood', title: 'Перекрась поле', icon: '◩', c1: '#ffcf3a', c2: '#b98d00',
    start(level, api) {
      const rng = api.rng(5);
      const n = Math.min(6 + Math.floor(level / 3), 14);
      const k = Math.min(3 + Math.floor(level / 4), 6);
      let g = Array.from({ length: n * n }, () => Math.floor(rng() * k));
      const limit = greedy(g, n, k) + (level <= 5 ? 2 : level <= 15 ? 1 : 0);
      let used = 0, done = false;
      const area = api.area();
      function render() {
        const own = region(g, n);
        area.innerHTML = `<div class="flood" style="--n:${n}">${g.map((c, i) => `<i class="fl ${own.has(i) ? 'own' : ''}" style="--c:${KIT[c]}"></i>`).join('')}</div>
          <div class="fl-pal">${Array.from({ length: k }, (_, c) => `<button class="fl-btn ${c === g[0] ? 'cur' : ''}" data-c="${c}" style="--c:${KIT[c]}" aria-label="Цвет ${c + 1}"></button>`).join('')}</div>`;
        api.hud(`<span class="pz-chip">Ходы: <b>${used} / ${limit}</b></span><span class="pz-chip">Поле ${n}×${n}</span>`);
      }
      area.addEventListener('click', (e) => {
        const b = e.target.closest('.fl-btn');
        if (!b || done) return;
        const c = +b.dataset.c;
        if (c === g[0]) return;
        g = paint(g, n, c); used++;
        Sound.play('tap'); haptic('tap');
        render();
        if (region(g, n).size === n * n) {
          done = true;
          api.win(used < limit ? 3 : 2, `Ходов: ${used} из ${limit}`);
        } else if (used >= limit) {
          done = true;
          api.lose(`Ходы закончились: ${limit}. Попробуй начать с цвета, который захватит больше клеток.`);
        }
      });
      render();
    },
  });
})();
