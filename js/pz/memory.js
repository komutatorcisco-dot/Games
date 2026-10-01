// «Найди пару»: переворачивай карточки с лицами игроков и находи одинаковые.
'use strict';

(() => {
  PZ.register({
    id: 'memory', title: 'Найди пару', icon: '◧', c1: '#8fd8c4', c2: '#3a8f7c',
    start(level, api) {
      const rng = api.rng(3);
      const pairs = Math.min(3 + level, 12);
      const faces = shuffle(Object.keys(FACES), rng).slice(0, pairs);
      const deck = shuffle([...faces, ...faces], rng);
      const cols = deck.length <= 8 ? 4 : deck.length <= 12 ? 4 : deck.length <= 20 ? 5 : 6;
      let open = [], found = new Set(), mistakes = 0, lock = false;
      const area = api.area();
      area.innerHTML = `<div class="mem" style="--cols:${cols}">${deck.map((name, i) => `
        <button class="mem-card" data-i="${i}"><span class="mem-back">★</span><span class="mem-face">${avatar(name, 'l')}<small>${esc(name.split(' ').slice(-1)[0])}</small></span></button>`).join('')}</div>`;
      Photos.hydrate(area);
      const hud = () => api.hud(`<span class="pz-chip">Пар: <b>${found.size}/${pairs}</b></span><span class="pz-chip">Ошибки: <b>${mistakes}</b></span>`);
      hud();

      area.addEventListener('click', (e) => {
        const c = e.target.closest('.mem-card');
        if (!c || lock || c.classList.contains('open') || c.classList.contains('done')) return;
        c.classList.add('open');
        Sound.play('tap');
        open.push(c);
        if (open.length < 2) return;
        const [a, b] = open;
        open = [];
        if (deck[a.dataset.i] === deck[b.dataset.i]) {
          found.add(deck[a.dataset.i]);
          later(() => { a.classList.add('done'); b.classList.add('done'); Sound.play('coin'); }, 250);
          hud();
          if (found.size === pairs) api.win(mistakes <= pairs / 2 ? 3 : mistakes <= pairs ? 2 : 1, `Ошибок: ${mistakes}`);
        } else {
          mistakes++; lock = true; hud();
          later(() => { a.classList.remove('open'); b.classList.remove('open'); lock = false; }, 750);
        }
      });
    },
  });
})();
