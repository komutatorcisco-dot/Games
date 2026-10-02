// «Машина времени»: какая команда была сильнее — «Барселона» 2010/11 или «Реал» 2016/17?
// Сила — рейтинг Эло клуба на конец сезона (clubelo). Нажми на сильнейшую; играем на серию.
'use strict';

(() => {
  const TOP = ['Барселона', 'Реал Мадрид', 'Бавария', 'Манчестер Сити', 'Ливерпуль', 'Манчестер Юнайтед', 'Челси', 'Арсенал', 'Ювентус', 'Милан',
    'Интер', 'Атлетико', 'ПСЖ', 'Боруссия Дортмунд', 'Тоттенхэм', 'Наполи', 'Рома', 'Валенсия', 'Севилья', 'Порту', 'Бенфика', 'Аякс', 'Лион', 'Байер',
    'Зенит', 'ЦСКА', 'Спартак', 'Лестер', 'Марсель', 'Монако'];
  const season = (y) => `${y - 1}/${String(y).slice(2)}`;
  let pool = null;
  const P = () => pool || (pool = ELO_HIST.filter((x) => TOP.includes(x[0])));

  // чем длиннее серия, тем ближе по силе пара
  function pair(streak) {
    const gap = Math.max(20, 170 - streak * 15), min = streak < 3 ? 40 : 0;
    let a, b, t = 0;
    do {
      a = pick(P()); b = pick(P()); t++;
    } while ((a[0] === b[0] || Math.abs(a[2] - b[2]) > gap || Math.abs(a[2] - b[2]) < min) && t < 500);
    return [a, b];
  }

  NG.register({
    id: 'timemachine', group: 'hist', title: 'Машина времени', c1: '#8e44d6', c2: '#2fd3e0', tag: 'Чья команда была сильнее',
    meta: (s) => (s.best ? `Рекорд серии: ${s.best}` : 'Великие команды 2001–2026'),
    start(api) {
      let streak = 0, cur = pair(0), picked = -1;
      const b = api.body;
      function render() {
        api.sub(`Серия: ${streak}`);
        const win = cur[0][2] > cur[1][2] ? 0 : 1, shown = picked >= 0;
        const card = (x, i) => `<button class="tm-card ${shown ? (i === win ? 'win' : 'lose') : ''} ${i === picked ? 'picked' : ''}" data-i="${i}" ${shown ? 'disabled' : ''}>
            ${crestImg(x[0], 'xl')}<b>${esc(x[0])}</b><span class="tm-year">сезон ${season(x[1])}</span>
            ${shown ? `<em class="tm-elo">${x[2]}</em>` : ''}</button>`;
        b.innerHTML = `<h3 class="ng-q tm-ask ${shown ? '' : 'tm-new'}">Какая команда была сильнее?</h3>
          <div class="tm-duel">${card(cur[0], 0)}<i class="tm-vs">VS</i>${card(cur[1], 1)}</div>
          ${shown ? `<p class="ng-lead tm-res">${picked === win ? '✅ Верно!' : '❌ Нет'} Разница — ${Math.abs(cur[0][2] - cur[1][2])} очков Эло</p>`
            : '<p class="ng-lead tm-hint">Нажми на команду. Сила — рейтинг Эло на конец сезона: он растёт за победы над сильными соперниками.</p>'}`;
      }
      function choose(i) {
        picked = i; render();
        // рейтинги «набегают» до настоящих значений
        $$('.tm-elo', b).forEach((el, k) => countUp(el, cur[k][2], { from: 1500, dur: 700 }));
        const ok = i === (cur[0][2] > cur[1][2] ? 0 : 1);
        Sound.play(ok ? 'kick' : 'bad'); haptic(ok ? 'ok' : 'bad');
        if (!ok) return later(finish, 1600);
        streak++;
        later(() => { cur = pair(streak); picked = -1; render(); }, 1300);
      }
      function finish() {
        const s = api.st(); s.best = Math.max(s.best || 0, streak); api.save();
        if (streak >= 8) Profile.bump('timemachine', 10);
        NG.end({ title: streak >= 10 ? 'Знаешь историю великих команд!' : streak >= 5 ? 'Хорошее чутьё' : 'Время запутало', big: `${streak}`, stats: [['Рекорд', s.best]],
          win: streak >= 8, reward: streak * 3, again: { label: 'Новая серия', fn: () => NG.open('timemachine') } });
      }
      b.addEventListener('click', (e) => {
        const c = e.target.closest('.tm-card');
        if (c && picked < 0) choose(+c.dataset.i);
      });
      render();
    },
  });
})();
