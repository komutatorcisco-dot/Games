// «VS 100»: ты против 100 соперников. Назови футболиста под категорию, но не самого очевидного:
// кто назвал самый популярный ответ толпы — вылетает. Ошибся с категорией — тоже вылет. Переживи всех.
'use strict';

(() => {
  const LINE = { ГК: 'Вратари', ЦЗ: 'Защитники', ЛЗ: 'Защитники', ПЗ: 'Защитники', ЦОП: 'Полузащитники', ЦП: 'Полузащитники', ЦАП: 'Полузащитники', ЛВ: 'Нападающие', ПВ: 'Нападающие', ФРВ: 'Нападающие' };
  const YEAR = new Date().getFullYear();
  function cats() {
    const out = [];
    const add = (label, test) => { const ps = PLAYERS.filter(test); if (ps.length >= 8) out.push({ label, ps }); };
    [...new Set(PLAYERS.map((p) => p.lg))].forEach((l) => add(`Играет в лиге: ${l}`, (p) => p.lg === l));
    [...new Set(PLAYERS.map((p) => p.nat))].forEach((n) => add(`Сборная: ${n}`, (p) => p.nat === n));
    [...new Set(PLAYERS.map((p) => p.club))].forEach((c) => add(`Играет за «${c}»`, (p) => p.club === c));
    ['Вратари', 'Защитники', 'Полузащитники', 'Нападающие'].forEach((l) => add(`${l} из АПЛ`, (p) => LINE[p.pos] === l && p.lg === 'АПЛ'));
    add('Старше 32 лет', (p) => YEAR - p.born > 32);
    add('Младше 22 лет', (p) => YEAR - p.born < 22);
    add('Играет под номером 10', (p) => p.num === 10);
    add('Играет под номером 7', (p) => p.num === 7);
    return out;
  }
  // популярность у «толпы»: звёзды называют чаще
  const pop = (p) => ({ 1: 100, 2: 30, 3: 8 }[p.tier] || 5) + (FC27[p.name] ? (FC27[p.name] - 80) * 4 : 0);

  NG.register({
    id: 'vs100', group: 'cards', title: 'VS 100', c1: '#e2384d', c2: '#2a2a35', tag: 'Не будь как все',
    meta: (s) => (s.best ? `Рекорд: обошёл ${s.best}` : '100 соперников'),
    start(api) {
      const all = shuffle(cats(), Math.random);
      let rivals = 100, prevRivals = 100, round = 0, cat = null, over = false, last = '';
      const b = api.body;
      function nextRound() {
        cat = all[round % all.length]; round++;
        b.innerHTML = `<div class="vs-count"><b>${rivals}</b><span>соперников осталось</span><div class="vs-dots">${[...Array(100).keys()].map((i) => `<i class="${i < rivals ? 'on' : i < prevRivals ? 'out' : ''}"></i>`).join('')}</div></div>
          <h3 class="ng-q">Раунд ${round}: ${esc(cat.label)}</h3><p class="ng-lead">Назови игрока под категорию. Самый популярный ответ толпы вылетает!</p>
          <div class="ng-in"></div><div class="vs-res">${last}</div>`;
        NG.input($('.ng-in', b), { items: (q) => NG.playerItems(q), onPick: answer }).focus();
        api.sub(`Раунд ${round}`);
      }
      function answer(name) {
        if (over) return;
        const p = PLAYERS.find((x) => x.name === name);
        const ok = cat.ps.includes(p);
        // толпа: каждый оставшийся соперник называет игрока пропорционально популярности, ~5% ошибаются
        const w = cat.ps.map(pop), sum = w.reduce((a, x) => a + x, 0), votes = new Map();
        let wrong = 0;
        for (let i = 0; i < rivals; i++) {
          if (Math.random() < 0.05) { wrong++; continue; }
          let r = Math.random() * sum, k = 0;
          while (r > w[k]) { r -= w[k]; k++; }
          const n = cat.ps[Math.min(k, cat.ps.length - 1)].name;
          votes.set(n, (votes.get(n) || 0) + 1);
        }
        const top = [...votes.entries()].sort((a, c) => c[1] - a[1]);
        const [topName, topCnt] = top[0] || ['', 0];
        const out = (topCnt || 0) + wrong;
        prevRivals = rivals;
        rivals = Math.max(0, rivals - out);
        const mine = votes.get(name) || 0;
        const mx = top.length ? top[0][1] : 1;
        last = `<div class="vs-chart"><small>Что называла толпа в прошлом раунде</small>${top.slice(0, 5).map(([n, c], i) => `<div class="vs-b ${i === 0 ? 'out' : ''} ${n === name ? 'me' : ''}"><span>${esc(surname(n))}${n === name ? ' (ты)' : ''}</span><i style="width:${(c / mx) * 100}%"></i><b>${c}</b></div>`).join('')}
          <p>Вылетело ${out}: ${topCnt} за «${esc(surname(topName))}» и ${wrong} ошиблись</p></div>`;
        if (!ok) return finish(false, `${name} не подходит под «${cat.label}»`);
        if (name === topName) return finish(false, `${surname(name)} — самый популярный ответ, ты вылетел вместе с толпой`);
        Sound.play('kick'); haptic('ok');
        toast(mine ? `Ещё ${mine} ${plural(mine, 'соперник', 'соперника', 'соперников')} назвали так же` : 'Уникальный ответ!');
        if (rivals <= 0) return finish(true, 'Ты пережил всех соперников!');
        nextRound();
      }
      function finish(won, why) {
        over = true;
        const beaten = 100 - rivals, s = api.st();
        s.best = Math.max(s.best || 0, beaten); api.save();
        if (won) Profile.bump('vs100', 20);
        NG.end({ title: won ? 'Победа! 1 против 100' : 'Вылет', big: `${beaten}/100`, stats: [['Раундов', round], ['Рекорд', s.best]], win: won, reward: Math.round(beaten / 2) + (won ? 40 : 0),
          html: `<p>${esc(why)}</p>${last}`, again: { label: 'Ещё раз', fn: () => NG.open('vs100') } });
      }
      nextRound();
    },
  });
})();
