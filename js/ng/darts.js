// «Дартс 170»: сбей 170 очков до нуля за 9 дротиков. Каждый бросок — назови игрока под категорию,
// из счёта вычитается его номер на футболке. Ушёл в минус — «перебор», бросок сгорает. Финиш ровно в ноль.
'use strict';

(() => {
  const START = 170, DARTS = 9;
  const LINE = { ГК: 'Вратарь', ЦЗ: 'Защитник', ЛЗ: 'Защитник', ПЗ: 'Защитник', ЦОП: 'Полузащитник', ЦП: 'Полузащитник', ЦАП: 'Полузащитник', ЛВ: 'Нападающий', ПВ: 'Нападающий', ФРВ: 'Нападающий' };
  function cats() {
    const out = [];
    const add = (label, test) => { const ps = PLAYERS.filter(test); if (ps.length >= 6) out.push({ label, test, ps }); };
    [...new Set(PLAYERS.map((p) => p.lg))].forEach((l) => add(`Лига: ${l}`, (p) => p.lg === l));
    [...new Set(PLAYERS.map((p) => p.nat))].forEach((n) => add(`Сборная: ${n}`, (p) => p.nat === n));
    ['Вратарь', 'Защитник', 'Полузащитник', 'Нападающий'].forEach((l) => add(l, (p) => LINE[p.pos] === l));
    return out;
  }

  NG.register({
    id: 'darts', group: 'cards', title: 'Дартс 170', c1: '#2fb35a', c2: '#e2384d', tag: 'Номера на футболках',
    meta: (s) => (s.best ? `Лучший финиш: ${s.best} дрот.` : 'Сбей 170 до нуля'),
    start(api) {
      const C = cats();
      let score = START, prev = START, darts = 0, cat = null, log = [], over = false, used = new Set(), hit = 0;
      const b = api.body;
      function newCat() {
        // категория, в которой есть хотя бы один игрок с номером не больше остатка
        const ok = C.filter((c) => c.ps.some((p) => p.num <= score && !used.has(p.name)));
        cat = pick(ok.length ? ok : C);
      }
      function render() {
        api.sub(`Дротик ${Math.min(darts + 1, DARTS)}/${DARTS}`);
        b.innerHTML = `<div class="dt-board ${hit ? 'hit' : ''}"><b>${prev}</b><span>осталось</span>${hit ? `<em class="dt-pop">−${hit}</em>` : ''}</div>
          <div class="dt-darts">${[...Array(DARTS).keys()].map((i) => `<i class="${i < darts ? 'used' : ''}">➶</i>`).join('')}</div>
          <h3 class="ng-q">${esc(cat.label)}</h3><p class="ng-lead">Назови игрока — вычтем его номер. Финиш ровно в 0.</p>
          <div class="ng-in"></div><div class="dt-log">${log.map((l) => `<span class="${l.c}">${l.t}</span>`).join('')}</div>
          <div class="ng-row"><button class="btn ghost" data-a="skip">Сменить категорию (−1 дротик)</button></div>`;
        NG.input($('.ng-in', b), { items: (q) => NG.playerItems(q, used), onPick: throwDart }).focus();
        if (prev !== score) countUp($('.dt-board b', b), score, { from: prev, dur: 600 });
        prev = score; hit = 0;
      }
      function throwDart(name) {
        if (over) return;
        const p = PLAYERS.find((x) => x.name === name);
        darts++;
        if (!cat.test(p)) { log.unshift({ c: 'miss', t: `✖ ${surname(name)} — не подходит` }); Sound.play('bad'); }
        else if (p.num > score) { log.unshift({ c: 'bust', t: `💥 ${surname(name)} №${p.num} — перебор` }); Sound.play('bad'); used.add(name); }
        else { score -= p.num; hit = p.num; used.add(name); log.unshift({ c: 'hit', t: `🎯 ${surname(name)} −${p.num}` }); Sound.play('kick'); haptic('tap'); }
        if (score === 0) return finish(true);
        if (darts >= DARTS) return finish(false);
        newCat(); render();
      }
      function finish(won) {
        over = true;
        const s = api.st();
        if (won) { s.best = s.best ? Math.min(s.best, darts) : darts; api.save(); Profile.bump('darts', 15); }
        NG.end({ title: won ? 'Чек-аут!' : `Не добил: осталось ${score}`, big: won ? `${darts} ${plural(darts, 'дротик', 'дротика', 'дротиков')}` : `${score}`, stats: [['Лучший', s.best ? `${s.best} дрот.` : '—']], win: won,
          reward: won ? 20 + (DARTS - darts) * 6 : Math.max(0, Math.round((START - score) / 10)),
          html: `<div class="dt-log">${log.map((l) => `<span class="${l.c}">${l.t}</span>`).join('')}</div>`, again: { label: 'Ещё лег', fn: () => NG.open('darts') } });
      }
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="skip"]') && !over) {
          darts++; log.unshift({ c: 'miss', t: '↻ смена категории' });
          if (darts >= DARTS) return finish(false);
          newCat(); render();
        }
      });
      newCat(); render();
    },
  });
})();
