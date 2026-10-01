// «Поп-ит»: антистресс. Лопай пузырьки, когда все лопнут — лист переворачивается и меняет форму.
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

  PZ.register({
    id: 'popit', title: 'Поп-ит', icon: '◉', c1: '#ff6fb5', c2: '#8e44d6', endless: true, sub: 'Антистресс', metaNew: 'Просто лопай',
    start(level, api) {
      let sheet = 0, total = 0;
      const area = api.area();
      function render() {
        const [name, rows] = SHAPES[sheet % SHAPES.length];
        const flip = sheet % 2 === 1;
        area.innerHTML = `<p class="pop-name">${name}</p><div class="popit">${rows.map((r, y) => [...r].map((ch) => (ch === '#'
          ? `<button class="bub ${flip ? 'in' : ''}" style="--c:${ROW[y]}"></button>` : '<span></span>')).join('')).join('')}</div>`;
        api.hud(`<span class="pz-chip">Лопнуто: <b>${total}</b></span><span class="pz-chip">Листов: <b>${sheet}</b></span>`);
      }
      area.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.bub');
        if (!b || b.classList.contains('popped')) return;
        b.classList.add('popped');
        total++;
        Sound.play('tap'); haptic('tap');
        if (!$$('.bub:not(.popped)', area).length) {
          sheet++;
          if (api.best(sheet)) { /* рекорд листов */ }
          Coins.add(5);
          setTimeout(render, 450);
        } else {
          api.hud(`<span class="pz-chip">Лопнуто: <b>${total}</b></span><span class="pz-chip">Листов: <b>${sheet}</b></span>`);
        }
      });
      render();
    },
  });
})();
