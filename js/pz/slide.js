// «Пятнашки»: собери эмблему клуба из перемешанных кусочков. Кусочки можно тянуть пальцем или нажимать,
// за один ход двигается весь ряд до пустой клетки. Уровни 1–10 — 3×3, дальше 4×4, с 31-го — 5×5.
'use strict';

(() => {
  PZ.register({
    id: 'slide', title: 'Пятнашки', icon: '▦', c1: '#5b8cff', c2: '#2c4bb0',
    start(level, api) {
      const rng = api.rng(2);
      const n = level <= 10 ? 3 : level <= 30 ? 4 : 5;
      // клубы из базы игроков — узнаваемые эмблемы, без экзотики
      const clubs = [...new Set(PLAYERS.map((p) => p.club))].filter((c) => CRESTS[c]).sort();
      const club = clubs[Math.floor(rng() * clubs.length)];
      const src = crestSrc(CRESTS[club]);
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

      // Кусочки между p и пустой клеткой (в одной строке или столбце), начиная с ближнего к пустой.
      function line(p) {
        const px = p % n, py = Math.floor(p / n), bx = blank % n, by = Math.floor(blank / n);
        if (p === blank || (px !== bx && py !== by)) return null;
        const step = px === bx ? (by > py ? n : -n) : (bx > px ? 1 : -1);
        const list = [];
        for (let q = blank - step; ; q -= step) { list.push(q); if (q === p) break; }
        return { list, dx: Math.sign(bx - px), dy: Math.sign(by - py) };
      }

      function move(p) {
        const ln = !done && line(p);
        if (!ln) return;
        for (const q of ln.list) { [cells[blank], cells[q]] = [cells[q], cells[blank]]; blank = q; }
        moves++;
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

      // Перетаскивание: кусочки едут за пальцем к пустой клетке. Дотянул больше чем на треть — ход засчитан.
      let drag = null;
      area.addEventListener('pointerdown', (e) => {
        const t = e.target.closest('.sl-tile[data-p]');
        if (!t || done) return;
        const ln = line(+t.dataset.p);
        if (!ln) { t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); return; }
        const els = ln.list.map((q) => $(`.sl-tile[data-p="${q}"]`, area));
        const size = ln.dx ? t.offsetWidth + 3 : t.offsetHeight + 3;
        drag = { p: +t.dataset.p, ln, els, size, sx: e.clientX, sy: e.clientY, d: 0, moved: false };
        els.forEach((el) => { el.style.transition = 'none'; el.classList.add('held'); });
        try { t.setPointerCapture(e.pointerId); } catch (err) { /* без захвата */ }
      });
      area.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const raw = (e.clientX - drag.sx) * drag.ln.dx + (e.clientY - drag.sy) * drag.ln.dy;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
        drag.d = Math.max(0, Math.min(drag.size, raw));
        const tr = `translate(${drag.d * drag.ln.dx}px, ${drag.d * drag.ln.dy}px)`;
        drag.els.forEach((el) => { el.style.transform = tr; });
      });
      const release = () => {
        if (!drag) return;
        const g = drag; drag = null;
        const go = !g.moved || g.d > g.size * 0.33;
        const tr = go ? `translate(${g.size * g.ln.dx}px, ${g.size * g.ln.dy}px)` : '';
        g.els.forEach((el) => { el.style.transition = 'transform .12s ease-out'; el.style.transform = tr; el.classList.remove('held'); });
        if (go) later(() => move(g.p), 120);
      };
      area.addEventListener('pointerup', release);
      area.addEventListener('pointercancel', release);
      render();
    },
  });
})();
