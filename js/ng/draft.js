// «Драфт» (как SuperDraft): собери 11 по схеме 4-3-3. На каждую позицию — выбор из трёх игроков.
// Итог = средний рейтинг + сыгранность (общий клуб, сборная или лига у соседей по линиям).
'use strict';

(() => {
  const SLOTS = [
    ['ГК', ['ГК']], ['ЛЗ', ['ЛЗ']], ['ЦЗ', ['ЦЗ']], ['ЦЗ', ['ЦЗ']], ['ПЗ', ['ПЗ']],
    ['ЦП', ['ЦП', 'ЦОП']], ['ЦОП', ['ЦОП', 'ЦП']], ['ЦАП', ['ЦАП', 'ЦП']], ['ЛВ', ['ЛВ', 'ФРВ']], ['ФРВ', ['ФРВ']], ['ПВ', ['ПВ', 'ФРВ']],
  ];
  const ROWS = [[0], [1, 2, 3, 4], [5, 6, 7], [8, 9, 10]];
  const lineOf = (i) => ROWS.findIndex((r) => r.includes(i));

  function chem(team) {
    let total = 0;
    const per = team.map(() => 0);
    for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) {
      const a = team[i], c = team[j];
      if (!a || !c || Math.abs(lineOf(i) - lineOf(j)) > 1) continue;
      const v = (a.club === c.club ? 3 : 0) + (a.nat === c.nat ? 2 : 0) + (a.lg === c.lg ? 1 : 0);
      per[i] += v; per[j] += v;
    }
    per.forEach((v, i) => { per[i] = Math.min(10, v); total += per[i]; });
    return { total, per };
  }

  NG.register({
    id: 'draft', group: 'cards', title: 'Драфт', c1: '#34c46a', c2: '#2f6fe4', tag: 'Собери свою 11',
    meta: (s) => (s.best ? `Рекорд ${s.best}` : 'Схема 4-3-3'),
    start(api) {
      const team = Array(11).fill(null), used = new Set();
      let rerolls = 1, offer = null, slot = -1;
      const b = api.body;
      const score = () => {
        const ps = team.filter(Boolean);
        const avg = ps.length ? ps.reduce((s, p) => s + Power.rating(p), 0) / ps.length : 0;
        const c = chem(team);
        return { avg: Math.round(avg * 10) / 10, chem: c.total, per: c.per, final: Math.round(avg + c.total / 4) };
      };
      function options(i) {
        const [, poss] = SLOTS[i];
        const LINE = { ГК: 0, ЦЗ: 1, ЛЗ: 1, ПЗ: 1, ЦОП: 2, ЦП: 2, ЦАП: 2, ЛВ: 3, ПВ: 3, ФРВ: 3 };
        let pool = shuffle(PLAYERS.filter((p) => poss.includes(p.pos) && !used.has(p.name)), Math.random);
        // мало игроков на позиции — добираем с той же линии
        if (pool.length < 3) pool = pool.concat(shuffle(PLAYERS.filter((p) => LINE[p.pos] === LINE[poss[0]] && !poss.includes(p.pos) && !used.has(p.name)), Math.random));
        return pool.slice(0, 3);
      }
      function render() {
        const sc = score();
        api.sub(`Рейтинг ${sc.avg || '—'} · сыгранность ${sc.chem} · итог ${sc.final || '—'}`);
        b.innerHTML = `<div class="nat-pitch dr-pitch">${[...ROWS].reverse().map((r) => `<div class="nat-row">${r.map((i) => {
          const p = team[i];
          return `<button class="dr-slot ${p ? 'on' : ''} ${slot === i ? 'sel' : ''}" data-i="${i}">${p ? `${avatar(p.name, 'm')}<b>${esc(surname(p.name))}</b><small>${Power.rating(p)} · ${'★'.repeat(Math.min(3, Math.floor(sc.per[i] / 3)))}</small>` : `<span class="dr-plus">+</span><small>${SLOTS[i][0]}</small>`}</button>`;
        }).join('')}</div>`).join('')}</div>
        ${offer ? `<h3 class="ng-q">Выбери: ${SLOTS[slot][0]}</h3><div class="dr-offer">${offer.map((p) => `<button class="dr-card" data-n="${esc(p.name)}">${avatar(p.name, 'l')}<b>${esc(p.name)}</b><small>${p.flag} ${esc(p.club)}</small><em>${Power.rating(p)}</em></button>`).join('')}</div>
          <div class="ng-row"><button class="btn ghost" data-a="reroll" ${rerolls ? '' : 'disabled'}>Других троих (${rerolls})</button></div>` : '<p class="ng-lead">Нажми на пустую позицию. Игроки из одного клуба, сборной или лиги рядом на поле дают сыгранность ★.</p>'}`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function finish() {
        const sc = score(), s = api.st();
        const rec = sc.final > (s.best || 0);
        s.best = Math.max(s.best || 0, sc.final); api.save();
        Profile.bump('draft', 8);
        NG.end({ title: `Итог: ${sc.final}${rec ? ' — рекорд!' : ''}`, win: rec, reward: Math.max(5, Math.round((sc.final - 70) * 2)),
          html: `<p>Средний рейтинг ${sc.avg}, сыгранность ${sc.chem} из 110.</p>`, again: { label: 'Новый драфт', fn: () => NG.open('draft') } });
      }
      b.addEventListener('click', (e) => {
        const s = e.target.closest('.dr-slot');
        if (s && !team[+s.dataset.i]) { slot = +s.dataset.i; offer = options(slot); Sound.play('tap'); return render(); }
        const c = e.target.closest('.dr-card');
        if (c && offer) {
          const p = PLAYERS.find((x) => x.name === c.dataset.n);
          team[slot] = p; used.add(p.name); offer = null; slot = -1; Sound.play('kick');
          if (team.every(Boolean)) { render(); return finish(); }
          return render();
        }
        if (e.target.closest('[data-a="reroll"]') && rerolls && offer) { rerolls--; offer = options(slot); render(); }
      });
      render();
    },
  });
})();
