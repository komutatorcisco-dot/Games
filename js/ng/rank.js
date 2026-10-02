// «Рейтинг» (как Club Rank): расставь пятёрку по порядку — клубы по году основания, игроков по рейтингу FC 27,
// по стоимости или трансферы по сумме. 5 раундов, очко за каждую позицию на своём месте.
'use strict';

(() => {
  const ROUNDS = 5;
  const MODES = [
    () => {
      const cs = shuffle(CL(), Math.random).filter((c, i, a) => a.findIndex((x) => x[6] === c[6]) === i).slice(0, 5);
      return { title: 'Клубы по году основания: от самого старого', items: cs.map((c) => ({ key: c[0], html: `${crestImg(c[0], 's')}${esc(c[0])}`, v: -c[6], show: `${c[6]}` })) };
    },
    () => {
      const ps = shuffle(Object.keys(FC27), Math.random).filter((n, i, a) => a.findIndex((x) => FC27[x] === FC27[n]) === i).slice(0, 5);
      return { title: 'Игроки по рейтингу FC 27: от самого высокого', items: ps.map((n) => ({ key: n, html: `${avatar(n, 's')}${esc(n)}`, v: FC27[n], show: `${FC27[n]}` })) };
    },
    () => {
      const ps = shuffle(Object.keys(VALUES), Math.random).filter((n, i, a) => a.findIndex((x) => VALUES[x] === VALUES[n]) === i).slice(0, 5);
      return { title: 'Игроки по стоимости (Transfermarkt): от самого дорогого', items: ps.map((n) => ({ key: n, html: `${avatar(n, 's')}${esc(n)}`, v: VALUES[n], show: `${VALUES[n]} млн €` })) };
    },
    () => {
      const ts = shuffle(TR().filter((t) => t[5] > 0), Math.random).filter((t, i, a) => a.findIndex((x) => x[5] === t[5]) === i).slice(0, 5);
      return { title: 'Трансферы по сумме: от самого дорогого', items: ts.map((t) => ({ key: t[0] + t[4], html: `${t[1]} ${esc(t[0])}<small>${esc(t[2])} → ${esc(t[3])}, ${t[4]}</small>`, v: t[5], show: `${t[5]} млн €` })) };
    },
  ];

  NG.register({
    id: 'rank', group: 'brain', title: 'Рейтинг', c1: '#34c46a', c2: '#b98d00', tag: 'Расставь по порядку',
    meta: (s) => (s.best ? `Рекорд ${s.best}/25` : '5 раундов'),
    start(api) {
      let round = 0, total = 0, cur = null, order = [], checked = false, roundPts = [];
      const b = api.body;
      function next() {
        if (round >= ROUNDS) return finish();
        cur = MODES[round % MODES.length]();
        cur.items = shuffle(cur.items, Math.random);
        order = []; checked = false; round++;
        render();
      }
      function render() {
        api.sub(`Раунд ${round}/${ROUNDS} · очки: ${total}`);
        const correct = [...cur.items].sort((a, c) => c.v - a.v).map((x) => x.key);
        b.innerHTML = `<div class="rk-rounds">${[...Array(ROUNDS).keys()].map((i) => `<i class="${i < roundPts.length ? 'done' : i === round - 1 ? 'now' : ''}">${i < roundPts.length ? roundPts[i] : i + 1}</i>`).join('')}<b>${total} очк.</b></div>
          <h3 class="ng-q">${esc(cur.title)}</h3><p class="ng-lead">${checked ? `Раунд: <b>${roundPts[roundPts.length - 1]}/5</b> на своих местах` : 'Нажимай по порядку: первый — №1. Нажми ещё раз, чтобы убрать.'}</p>
          <div class="rk-list">${cur.items.map((it) => {
            const pos = order.indexOf(it.key);
            const st = checked ? (correct.indexOf(it.key) === pos ? 'ok' : 'bad') : '';
            return `<button class="rk-item ${pos >= 0 ? 'on' : ''} ${st}" data-k="${esc(it.key)}"><em>${pos >= 0 ? pos + 1 : ''}</em><span>${it.html}</span>${checked ? `<b>${esc(it.show)} · №${correct.indexOf(it.key) + 1}</b>` : ''}</button>`;
          }).join('')}</div>
          <div class="ng-row">${checked ? '<button class="btn gold" data-a="next">Дальше →</button>' : `<button class="btn ghost" data-a="reset">Сбросить</button><button class="btn gold" data-a="check" ${order.length === 5 ? '' : 'disabled'}>Проверить</button>`}</div>`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function check() {
        const correct = [...cur.items].sort((a, c) => c.v - a.v).map((x) => x.key);
        const pts = order.filter((k, i) => correct[i] === k).length;
        total += pts; checked = true; roundPts.push(pts);
        Sound.play(pts >= 3 ? 'kick' : 'bad'); haptic(pts >= 3 ? 'ok' : 'bad');
        if (pts === 5) toast('Идеально! 5 из 5');
        render();
      }
      function finish() {
        const s = api.st();
        s.best = Math.max(s.best || 0, total); api.save();
        if (total >= 18) Profile.bump('rank', 12);
        NG.end({ title: total >= 18 ? 'Знаток!' : total >= 12 ? 'Неплохо' : 'Можно лучше', big: `${total}/${ROUNDS * 5}`, stats: [['Раунды', roundPts.join(' · ')]], win: total >= 18, reward: Math.round(total * 1.5), again: { label: 'Ещё раз', fn: () => NG.open('rank') } });
      }
      b.addEventListener('click', (e) => {
        const it = e.target.closest('.rk-item');
        if (it && !checked) {
          const k = it.dataset.k, i = order.indexOf(k);
          if (i >= 0) order.splice(i, 1); else order.push(k);
          Sound.play('tap'); render(); return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'reset') { order = []; render(); }
        if (a.dataset.a === 'check') check();
        if (a.dataset.a === 'next') next();
      });
      next();
    },
  });
})();
