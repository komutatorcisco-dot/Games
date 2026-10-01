// «Кто я?» (одноклубники): угадай футболиста по тем, с кем он играл в одной команде.
// Одноклубники открываются по одному — от ранних клубов карьеры (сложно) к последним (легко).
'use strict';

(() => {
  const MAX = 6;
  function build(rnd) {
    const names = NG.careerNames();
    for (let t = 0; t < 200; t++) {
      const name = names[Math.floor(rnd() * names.length)];
      const c = CAREERS.find((k) => k.name === name);
      const mates = Mates.of(name);
      if (mates.size < MAX) continue;
      // по одному одноклубнику из каждого клуба, по порядку карьеры: сначала ранние клубы
      const clubs = [...new Set(c.path.map(([k]) => k.replace(/ \(аренда\)$/, '')))];
      const byClub = clubs.map((cl) => shuffle([...mates].filter(([, k]) => k === cl).map(([n]) => n), rnd));
      const clues = [];
      for (let round = 0; clues.length < MAX && round < 6; round++) byClub.forEach((arr) => { if (arr[round] && clues.length < MAX) clues.push(arr[round]); });
      if (clubs.length < 2 || clues.length < MAX) continue;
      // сортируем подсказки по порядку клубов
      clues.sort((a, b) => clubs.indexOf(mates.get(a)) - clubs.indexOf(mates.get(b)));
      return { name, c, clues, mates };
    }
    return null;
  }

  NG.register({
    id: 'whoami', group: 'brain', title: 'Кто я?', c1: '#8fd8c4', c2: '#3a8f7c', tag: 'По одноклубникам',
    meta: (s) => (s.wins ? `Угадано: ${s.wins}` : 'Угадай по партнёрам'),
    start(api) {
      const g = build(Math.random);
      if (!g) { toast('Не получилось, попробуй ещё'); return; }
      let open = 1, tries = [], over = false;
      const b = api.body;
      b.innerHTML = `<div class="wa-hero"><span class="wa-mystery">?</span><div><b>Кто я?</b><small>Я играл в одной команде с этими футболистами. Сначала — партнёры из начала карьеры.</small></div></div>
        <div class="wa-pts"></div><div class="wa-list"></div><div class="ng-in"></div>
        <div class="ng-row"><button class="btn ghost" data-a="more">Ещё одноклубник</button><button class="btn ghost" data-a="give">Сдаться</button></div><div class="wa-tries"></div>`;
      const inp = NG.input($('.ng-in', b), { items: (q) => NG.careerItems(q, new Set([...tries, ...g.clues])), onPick: guess });
      function render() {
        api.sub(`Подсказок: ${open}/${MAX} · очки: ${MAX + 1 - open}`);
        $('.wa-list', b).innerHTML = g.clues.map((n, i) => (i < open || over
          ? `<div class="wa-mate" style="--i:${i}">${avatar(n, 's')}<div><b>${esc(n)}</b><small>${crestImg(g.mates.get(n), 'xs')} ${esc(g.mates.get(n))}</small></div></div>`
          : `<div class="wa-mate locked"><span class="ava ava-s"><b>?</b></span><b>Одноклубник ${i + 1}</b></div>`)).join('');
        $('.wa-pts', b).innerHTML = `<small>Очки за угадывание</small>${[...Array(MAX).keys()].map((i) => `<i class="${i < MAX + 1 - open ? 'on' : ''}">⚽</i>`).join('')}`;
        $('.wa-tries', b).innerHTML = tries.map((t) => `<span class="wa-no">✖ ${esc(t)}</span>`).join('');
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function guess(name) {
        if (over) return;
        if (name === g.name) return finish(true);
        tries.push(name); Sound.play('bad'); haptic('bad');
        if (open < MAX) open++; else if (tries.length >= 3) return finish(false);
        render();
      }
      function finish(won) {
        over = true; inp.disable(true); render();
        const s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; api.save(); Profile.bump('whoami', 12); }
        const path = g.c.path.map(([k]) => k).join(' → ');
        NG.end({ title: won ? 'Угадал!' : 'Не угадал', win: won, big: won ? `${MAX + 1 - open}/${MAX}` : '', stats: [['Подсказок', open], ['Ошибок', tries.length]],
          reward: won ? (MAX + 1 - open) * 8 : 0,
          html: `<div class="player-card">${avatar(g.name, 'xl')}<div class="pname">${esc(g.name)}</div><div class="pmeta">${esc(path)}</div></div>`,
          again: { label: 'Следующий', fn: () => NG.open('whoami') } });
      }
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a || over) return;
        if (a.dataset.a === 'give') return finish(false);
        if (open < MAX) { open++; Sound.play('tap'); render(); }
      });
      render();
    },
  });
})();
