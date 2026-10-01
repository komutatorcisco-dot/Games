// «Бинго» (как Football Bingo): карточка 4×4 с категориями. Футболисты выходят по одному —
// поставь каждого в подходящую клетку или пропусти. Ошибка стоит жизни. Собери линию или всю карточку.
'use strict';

(() => {
  const LIVES = 3, SKIPS = 5;
  const LINES = (() => {
    const L = [];
    for (let i = 0; i < 4; i++) { L.push([0, 1, 2, 3].map((j) => i * 4 + j)); L.push([0, 1, 2, 3].map((j) => j * 4 + i)); }
    L.push([0, 5, 10, 15], [3, 6, 9, 12]);
    return L;
  })();

  function build(rnd) {
    const C = TTT.cats, G = TTT.groups;
    for (let t = 0; t < 200; t++) {
      const ids = [...new Set([...shuffle(G.BIG, rnd).slice(0, 9), ...shuffle(G.NATS, rnd).slice(0, 4), ...shuffle(G.OTHER, rnd).slice(0, 3)])];
      if (ids.length < 16) continue;
      // у каждой клетки — свой «гарантированный» игрок, чтобы карточку можно было собрать
      const used = new Set(), deck = [];
      let ok = true;
      for (const id of ids) {
        const n = shuffle([...C.get(id).set], rnd).find((x) => !used.has(x));
        if (!n) { ok = false; break; }
        used.add(n); deck.push(n);
      }
      if (!ok) continue;
      const extra = shuffle(NG.careerNames().filter((n) => !used.has(n)), rnd).slice(0, 6);
      return { cells: shuffle(ids, rnd), deck: shuffle([...deck, ...extra], rnd) };
    }
    return null;
  }

  NG.register({
    id: 'bingo', group: 'grid', title: 'Бинго', c1: '#ff6fb5', c2: '#8e44d6', tag: 'Карточка 4×4',
    meta: (s) => (s.best ? `Рекорд ${s.best}/16` : 'Карточка 4×4'),
    start(api) {
      const g = build(Math.random);
      if (!g) { toast('Не получилось собрать карточку'); return; }
      const C = TTT.cats;
      let filled = Array(16).fill(null), lives = LIVES, skips = SKIPS, k = 0, over = false;
      const b = api.body;
      const lines = () => LINES.filter((l) => l.every((i) => filled[i])).length;
      let just = -1, wrong = -1;
      function render() {
        const cur = g.deck[k];
        const car = cur && CAREERS.find((c) => c.name === cur);
        api.sub(`${'♥'.repeat(lives)}${'♡'.repeat(LIVES - lives)} · пропусков ${skips}`);
        const inLine = new Set(LINES.filter((l) => l.every((i) => filled[i])).flat());
        b.innerHTML = `<div class="bg-deck"><i style="width:${(k / g.deck.length) * 100}%"></i><small>Игрок ${Math.min(k + 1, g.deck.length)} из ${g.deck.length}</small></div>
          <div class="bg-card-now">${cur && !over ? `<div class="bg-fut" key="${k}">${avatar(cur, 'l')}<div><b>${esc(cur)}</b><small>${car ? car.flag : ''} Куда его поставить?</small></div></div>
            <button class="btn ghost" data-a="skip" ${skips ? '' : 'disabled'}>Пропуск · ${skips}</button>` : '<b>Карточка закрыта</b>'}</div>
          <div class="bg-grid">${g.cells.map((id, i) => {
            const c = C.get(id), v = filled[i];
            const icon = c.t === 'club' ? crestImg(id, 's') : `<b class="tg-flag">${(c.html.match(/tg-flag">([^<]+)</) || [, ''])[1]}</b>`;
            return `<button class="bg-cell ${v ? 'on' : ''} ${inLine.has(i) ? 'line' : ''} ${i === just ? 'just' : ''} ${i === wrong ? 'ng-bad bad' : ''} ${c.t}" data-i="${i}" ${v || over ? 'disabled' : ''}>
              ${v ? avatar(v, 's') : icon}<span>${v ? esc(surname(v)) : esc(c.t === 'club' ? id : c.label.replace(/^сборная /, ''))}</span></button>`;
          }).join('')}</div><p class="ng-lead">Линий: <b>${lines()}</b> · клеток: <b>${filled.filter(Boolean).length}/16</b></p>`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
        just = -1; wrong = -1;
      }
      function place(i) {
        const cur = g.deck[k];
        if (over || !cur || filled[i]) return;
        if (C.get(g.cells[i]).set.has(cur)) { const before = lines(); filled[i] = cur; just = i; Sound.play('kick'); haptic('ok'); if (lines() > before) { toast('Линия! +8'); Sound.play('goal'); } }
        else { lives--; wrong = i; Sound.play('bad'); haptic('bad'); toast(`${surname(cur)} не подходит: ${C.get(g.cells[i]).t === 'club' ? 'не играл за ' + g.cells[i] : C.get(g.cells[i]).label}`); }
        k++;
        if (filled.every(Boolean) || lives <= 0 || k >= g.deck.length) return finish();
        render();
      }
      function finish() {
        over = true; render();
        const n = filled.filter(Boolean).length, s = api.st();
        s.best = Math.max(s.best || 0, n); api.save();
        if (n === 16) Profile.bump('bingo', 25);
        NG.end({ title: n === 16 ? 'БИНГО! Вся карточка!' : lines() ? `Линий: ${lines()}` : 'Без линии', big: `${n}/16`, stats: [['Линии', lines()], ['Жизни', lives]], win: n === 16 || lines() >= 2,
          reward: n * 2 + lines() * 8 + (n === 16 ? 50 : 0), again: { label: 'Новая карточка', fn: () => NG.open('bingo') } });
      }
      b.addEventListener('click', (e) => {
        const c = e.target.closest('.bg-cell');
        if (c) return place(+c.dataset.i);
        if (e.target.closest('[data-a="skip"]') && skips && !over) {
          skips--; k++;
          if (k >= g.deck.length) return finish();
          Sound.play('tap'); render();
        }
      });
      render();
    },
  });
})();
