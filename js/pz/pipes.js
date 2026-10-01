// «Розыгрыш»: поворачивай плитки, чтобы пас от мяча дошёл до каждого игрока.
// Поле строится как случайное дерево линий, потом плитки разворачиваются — решение всегда есть.
'use strict';

(() => {
  const U = 1, R = 2, D = 4, L = 8;
  const rot = (m, r) => ((m << r) | (m >> (4 - r))) & 15;
  const DIR = [[U, 0, -1, D], [R, 1, 0, L], [D, 0, 1, U], [L, -1, 0, R]];

  PZ.register({
    id: 'pipes', title: 'Розыгрыш', icon: '┼', c1: '#34c46a', c2: '#1f7a3a',
    start(level, api) {
      const rng = api.rng(4);
      const w = Math.min(4 + Math.floor(level / 6), 7);
      const h = Math.min(4 + Math.floor(level / 4), 9);
      const N = w * h;
      const base = new Array(N).fill(0);
      // случайный обход в глубину строит дерево
      const src = Math.floor(h / 2) * w + Math.floor(w / 2);
      const seen = new Array(N).fill(false);
      const stack = [src]; seen[src] = true;
      while (stack.length) {
        const c = stack[stack.length - 1];
        const x = c % w, y = Math.floor(c / w);
        const opts = DIR.filter(([, dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
        });
        if (!opts.length) { stack.pop(); continue; }
        // чуть чаще продолжаем прямо, чтобы были длинные передачи
        const [bit, dx, dy, back] = opts[Math.floor(rng() * opts.length)];
        const n = (y + dy) * w + (x + dx);
        base[c] |= bit; base[n] |= back; seen[n] = true;
        stack.push(n);
      }
      const r = base.map(() => Math.floor(rng() * 4));
      const mask = (i) => rot(base[i], r[i]);
      let moves = 0, done = false;

      function linked() {
        const ok = new Array(N).fill(false);
        const q = [src]; ok[src] = true;
        while (q.length) {
          const c = q.shift();
          const x = c % w, y = Math.floor(c / w), m = mask(c);
          DIR.forEach(([bit, dx, dy, back]) => {
            if (!(m & bit)) return;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
            const n = ny * w + nx;
            if (!ok[n] && (mask(n) & back)) { ok[n] = true; q.push(n); }
          });
        }
        return ok;
      }
      // не даём уровню начаться уже решённым
      if (linked().every(Boolean)) r[0] = (r[0] + 1) % 4;

      const area = api.area();
      const degree = (m) => [U, R, D, L].filter((b) => m & b).length;
      const turns = r.slice(); // сколько раз повернули (не по модулю — чтобы плитка всегда крутилась по часовой)
      const SEG = { [U]: 'M50 50V-2', [R]: 'M50 50H102', [D]: 'M50 50V102', [L]: 'M50 50H-2' };
      const tile = (b) => `<svg viewBox="0 0 100 100" aria-hidden="true">${[U, R, D, L].filter((k) => b & k).map((k) => `<path d="${SEG[k]}"/>`).join('')}<circle cx="50" cy="50" r="11"/></svg>`;

      area.innerHTML = `<div class="pipes" style="--w:${w};--h:${h}">${base.map((b, i) => {
        const leaf = degree(b) === 1 && i !== src;
        return `<button class="pipe" data-i="${i}" aria-label="Повернуть">
          <span class="pipe-in" style="--r:${turns[i] * 90}deg">${tile(b)}</span>
          ${i === src ? '<img class="pball" src="img/ui/ball.webp" alt="">' : leaf ? '<em class="pman"></em>' : ''}
        </button>`;
      }).join('')}</div>`;
      const tiles = $$('.pipe', area);
      const players = base.filter((b, i) => degree(b) === 1 && i !== src).length;

      function update() {
        const ok = linked();
        tiles.forEach((t, i) => t.classList.toggle('on', ok[i]));
        const got = tiles.filter((t, i) => ok[i] && t.querySelector('.pman')).length;
        api.hud(`<span class="pz-chip">Повороты: <b>${moves}</b></span><span class="pz-chip">Получили пас: <b>${got}/${players}</b></span>`);
        return ok;
      }

      // победа: пас бежит по цепочке от мяча — плитки вспыхивают по очереди
      function celebrate() {
        const depth = new Array(N).fill(-1); depth[src] = 0;
        const q = [src];
        while (q.length) {
          const c = q.shift(), x = c % w, y = Math.floor(c / w), m = mask(c);
          DIR.forEach(([bit, dx, dy, back]) => {
            const nx = x + dx, ny = y + dy, n = ny * w + nx;
            if (!(m & bit) || nx < 0 || ny < 0 || nx >= w || ny >= h || depth[n] >= 0 || !(mask(n) & back)) return;
            depth[n] = depth[c] + 1; q.push(n);
          });
        }
        tiles.forEach((t, i) => { t.style.setProperty('--d', depth[i] * 45 + 'ms'); t.classList.add('pass'); });
      }

      area.addEventListener('click', (e) => {
        const t = e.target.closest('.pipe');
        if (!t || done) return;
        const i = +t.dataset.i;
        r[i] = (r[i] + 1) % 4; turns[i]++; moves++;
        t.querySelector('.pipe-in').style.setProperty('--r', turns[i] * 90 + 'deg');
        Sound.play('tap'); haptic('tap');
        const before = t.classList.contains('on');
        const ok = update();
        if (!before && ok[i]) Sound.play('kick');
        if (ok.every(Boolean)) {
          done = true;
          celebrate();
          const par = Math.round(N * 1.2); // примерно столько поворотов нужно в среднем
          later(() => api.win(moves <= par ? 3 : moves <= par * 1.6 ? 2 : 1, `Поворотов: ${moves}`), 700);
        }
      });
      update();
    },
  });
})();
