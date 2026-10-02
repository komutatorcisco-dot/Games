// «Машина времени»: кто был сильнее — «Валенсия»-2001 или «Арсенал»-2004? Рейтинг Эло клубов на май каждого года.
// Играем на серию: известен рейтинг левой команды, угадай, правая сильнее или слабее.
'use strict';

(() => {
  const MONTH = 'май';
  const card = (x, show) => `<div class="tm-card">${crestImg(x[0], 'xl')}<b>${esc(x[0])}</b><span class="tm-year">${MONTH} ${x[1]}</span>
    <em class="tm-elo">${show ? x[2] : '?'}</em></div>`;

  // чем длиннее серия, тем ближе рейтинги пары
  function pair(prev, streak) {
    const a = prev || pick(ELO_HIST);
    const gap = Math.max(25, 160 - streak * 12);
    let b, tries = 0;
    do { b = pick(ELO_HIST); tries++; } while ((b === a || b[2] === a[2] || Math.abs(b[2] - a[2]) > gap || (b[0] === a[0] && Math.abs(b[1] - a[1]) < 2)) && tries < 400);
    return [a, b];
  }

  NG.register({
    id: 'timemachine', group: 'hist', title: 'Машина времени', c1: '#8e44d6', c2: '#2fd3e0', tag: 'Кто был сильнее по Эло',
    meta: (s) => (s.best ? `Рекорд серии: ${s.best}` : 'Клубы 2001–2026'),
    start(api) {
      let streak = 0, cur = pair(null, 0), shown = false;
      const b = api.body;
      function render() {
        api.sub(`Серия: ${streak}`);
        const [a, c] = cur;
        b.innerHTML = `<p class="ng-lead">Рейтинг Эло — сила клуба по всем его матчам. Чем больше, тем сильнее.</p>
          <div class="tm-duel ${shown ? (c[2] > a[2] ? 'up' : 'down') : ''}">${card(a, true)}<i class="tm-vs">VS</i>${card(c, shown)}</div>
          ${shown ? `<p class="ng-lead tm-res">${c[2] > a[2] ? `«${esc(c[0])}»-${c[1]} сильнее на ${c[2] - a[2]}` : `«${esc(c[0])}»-${c[1]} слабее на ${a[2] - c[2]}`}</p>`
            : `<div class="ng-row tm-btns"><button class="btn gold" data-a="hi">⬆ Сильнее</button><button class="btn ghost" data-a="lo">⬇ Слабее</button></div>`}`;
      }
      function guess(up) {
        const [a, c] = cur, ok = (c[2] > a[2]) === up;
        shown = true; render();
        Sound.play(ok ? 'kick' : 'bad'); haptic(ok ? 'ok' : 'bad');
        if (!ok) return later(finish, 1400);
        streak++;
        later(() => { cur = pair(c, streak); shown = false; render(); }, 1200);
      }
      function finish() {
        const s = api.st(); s.best = Math.max(s.best || 0, streak); api.save();
        if (streak >= 8) Profile.bump('timemachine', 10);
        NG.end({ title: streak >= 10 ? 'Историк Эло!' : streak >= 5 ? 'Чувствуешь силу' : 'Время запутало', big: `${streak}`, stats: [['Рекорд', s.best]],
          win: streak >= 8, reward: streak * 3, again: { label: 'Новая серия', fn: () => NG.open('timemachine') } });
      }
      b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-a]');
        if (!x || shown) return;
        guess(x.dataset.a === 'hi');
      });
      render();
    },
  });
})();
