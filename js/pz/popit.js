// «Поп-ит»: антистресс. Лопай пузырьки нажатием или проводя пальцем. Когда лопнули все —
// лист переворачивается и пузырьки снова торчат, как у настоящего поп-ита. Потом новая форма:
// эмблемы клубов (сетки в popcrests.js) вперемешку с классическими фигурами.
'use strict';

(() => {
  const SHAPES = [
    ['Мяч', ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..']],
    ['Футболка', ['##...##', '#######', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.']],
    ['Кубок', ['#######', '#######', '.#####.', '..###..', '...#...', '..###..', '.#####.']],
    ['Бутса', ['#......', '##.....', '###....', '####...', '#######', '#######', '.#.#.#.']],
    ['Сердце', ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...']],
  ];
  const ROW = ['#e2384d', '#ff8a2a', '#ffcf3a', '#34c46a', '#5fd3f3', '#2f6fe4', '#8e44d6'];

  const darken = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

  // Форма листа: имя, эмблема (если есть) и строки, где каждая клетка — цвет или null.
  function shapeAt(k, order) {
    if (k % 3 === 2) {
      const [name, rows] = SHAPES[Math.floor(k / 3) % SHAPES.length];
      return { name, rows: rows.map((r, y) => [...r].map((ch) => (ch === '#' ? ROW[y] : null))) };
    }
    const [club, pal, rows] = POP_CRESTS[order[(k - Math.floor(k / 3)) % order.length]];
    return { name: club, club, rows: rows.map((r) => [...r].map((ch) => (ch === '.' ? null : pal[+ch]))) };
  }

  PZ.register({
    id: 'popit', title: 'Поп-ит', icon: '◉', c1: '#ff6fb5', c2: '#8e44d6', endless: true, sub: 'Антистресс', metaNew: 'Просто лопай',
    start(level, api) {
      const order = shuffle([...POP_CRESTS.keys()], mulberry32(Date.now() % 1e9));
      let k = 0, side = 0, total = 0, sheets = 0, busy = false, down = false, last = null;
      const area = api.area();
      const hud = () => api.hud(`<span class="pz-chip">Лопнуто: <b>${total}</b></span><span class="pz-chip">Листов: <b>${sheets}</b></span>`);

      function render() {
        const s = shapeAt(k, order);
        const cols = s.rows[0].length;
        area.innerHTML = `<p class="pop-name">${s.club ? crestImg(s.club, 'xs') : ''}${esc(s.name)}</p>
          <div class="popit enter" id="popit" style="--cols:${cols}">${s.rows.map((r) => r.map((c) => (c
            ? `<button class="bub" style="--c:${c};--d:${darken(c, 0.72)}" aria-label="пузырёк"></button>` : '<span class="gap"></span>')).join('')).join('')}</div>
          <p class="pop-tip">${side ? 'Обратная сторона — дави обратно' : 'Жми или веди пальцем по пузырькам'}</p>`;
        hud();
      }

      function pop(b) {
        if (busy || !b || b === last || b.classList.contains('popped')) return;
        last = b;
        b.classList.add('popped');
        b.classList.remove('press'); void b.offsetWidth; b.classList.add('press');
        total++;
        Sound.pop(side ? 0.8 + Math.random() * 0.1 : 1 + Math.random() * 0.15);
        haptic('pop');
        if ($$('.bub:not(.popped)', area).length) { hud(); return; }
        // всё лопнуто: переворачиваем лист
        busy = true;
        const sheet = $('#popit');
        later(() => {
          sheet.classList.remove('enter');
          sheet.classList.add('flip-out');
          Sound.play('kick');
          later(() => {
            if (side === 0) {
              side = 1;
              $$('.bub', sheet).forEach((x) => x.classList.remove('popped', 'press'));
              $('.pop-tip', area).textContent = 'Обратная сторона — дави обратно';
              sheet.classList.remove('flip-out');
              sheet.classList.add('flip-in');
            } else {
              side = 0; k++; sheets++;
              api.best(sheets);
              Econ.play(2);
              render();
            }
            busy = false; last = null;
          }, 260);
        }, 250);
      }

      const at = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('.bub'); };
      area.addEventListener('pointerdown', (e) => {
        const b = at(e);
        if (!b) return;
        down = true; last = null;
        e.preventDefault();
        pop(b);
      });
      const move = (e) => { if (down) pop(at(e)); };
      const up = () => { down = false; last = null; };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);

      api.actions([{ label: 'Другая форма', fn: () => { if (!busy) { side = 0; k++; render(); } } }]);
      render();
      return () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    },
  });
})();
