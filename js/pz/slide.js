// «Пятнашки»: собери эмблему клуба из перемешанных кусочков. Уровни 1–10 — 3×3, дальше 4×4, с 31-го — 5×5.
'use strict';

(() => {
  PZ.register({
    id: 'slide', title: 'Пятнашки', icon: '▦', c1: '#5b8cff', c2: '#2c4bb0',
    start(level, api) {
      const rng = api.rng(2);
      const n = level <= 10 ? 3 : level <= 30 ? 4 : 5;
      const clubs = Object.keys(CRESTS);
      const club = clubs[Math.floor(rng() * clubs.length)];
      const src = `img/clubs/${CRESTS[club]}`;
      const N = n * n;
      let cells = Array.from({ length: N }, (_, i) => i); // cells[pos] = номер кусочка, N-1 — пустая
      let blank = N - 1;
      const nb = (p) => [p - n, p + n, p % n ? p - 1 : -1, (p + 1) % n ? p + 1 : -1].filter((q) => q >= 0 && q < N);
      // перемешиваем случайными ходами — так головоломка всегда решаема
      const shuffleMoves = 20 + level * 6;
      let prev = -1;
      for (let k = 0; k < shuffleMoves; k++) {
        const opts = nb(blank).filter((q) => q !== prev);
        const q = opts[Math.floor(rng() * opts.length)];
        [cells[blank], cells[q]] = [cells[q], cells[blank]];
        prev = blank; blank = q;
      }
      let moves = 0, done = false;
      const area = api.area();
      api.hud(`<span class="pz-chip">Ходы: <b id="sl-moves">0</b></span><span class="pz-chip">${crestImg(club, 'xs')}${esc(club)}</span>`);

      function render() {
        area.innerHTML = `<div class="slide" style="--n:${n}">${cells.map((t, p) => {
          if (t === N - 1 && !done) return '<span class="sl-tile blank"></span>';
          const x = t % n, y = Math.floor(t / n);
          return `<button class="sl-tile" data-p="${p}" style="background-image:url('${src}');background-position:${(x * 100) / (n - 1)}% ${(y * 100) / (n - 1)}%"><small>${t + 1}</small></button>`;
        }).join('')}</div>`;
      }

      function move(p) {
        if (done || !nb(blank).includes(p)) return;
        [cells[blank], cells[p]] = [cells[p], cells[blank]];
        blank = p; moves++;
        $('#sl-moves').textContent = moves;
        Sound.play('tap'); haptic('tap');
        if (cells.every((t, i) => t === i)) {
          done = true; render();
          const par = shuffleMoves;
          api.win(moves <= par ? 3 : moves <= par * 2 ? 2 : 1, `Ходов: ${moves}`);
          return;
        }
        render();
      }

      area.addEventListener('click', (e) => { const t = e.target.closest('.sl-tile[data-p]'); if (t) move(+t.dataset.p); });
      render();
    },
  });
})();
