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
      function render() {
        const ok = linked();
        area.innerHTML = `<div class="pipes" style="--w:${w};--h:${h}">${base.map((b, i) => {
          const leaf = degree(b) === 1 && i !== src;
          return `<button class="pipe ${ok[i] ? 'on' : ''}" data-i="${i}">
            <span class="pipe-in" style="transform:rotate(${r[i] * 90}deg)">
              ${b & U ? '<i class="ln u"></i>' : ''}${b & R ? '<i class="ln r"></i>' : ''}${b & D ? '<i class="ln d"></i>' : ''}${b & L ? '<i class="ln l"></i>' : ''}
              <i class="hub"></i>
            </span>
            ${i === src ? '<em class="pball"></em>' : leaf ? '<em class="pman"></em>' : ''}
          </button>`;
        }).join('')}</div>`;
        const got = ok.filter(Boolean).length;
        api.hud(`<span class="pz-chip">Повороты: <b>${moves}</b></span><span class="pz-chip">В игре: <b>${got}/${N}</b></span>`);
        return ok;
      }

      area.addEventListener('click', (e) => {
        const t = e.target.closest('.pipe');
        if (!t || done) return;
        const i = +t.dataset.i;
        r[i] = (r[i] + 1) % 4; moves++;
        Sound.play('tap'); haptic('tap');
        const ok = render();
        if (ok.every(Boolean)) {
          done = true;
          const par = N; // примерно столько поворотов нужно в среднем
          api.win(moves <= par ? 3 : moves <= par * 1.6 ? 2 : 1, `Поворотов: ${moves}`);
        }
      });
      render();
    },
  });
})();
