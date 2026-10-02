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
      let rerolls = 2, slot = -1, justPicked = -1;
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
        let pool = shuffle(PLAYERS.filter((p) => p.tier <= 3 && poss.includes(p.pos) && !used.has(p.name)), Math.random);
        // мало игроков на позиции — добираем с той же линии
        if (pool.length < 3) pool = pool.concat(shuffle(PLAYERS.filter((p) => p.tier <= 3 && LINE[p.pos] === LINE[poss[0]] && !poss.includes(p.pos) && !used.has(p.name)), Math.random));
        return pool.slice(0, 3);
      }
      // связь двух игроков: 3 — общий клуб, 2 — сборная, 1 — лига
      const link = (x, y) => (x.club === y.club ? 3 : x.nat === y.nat ? 2 : x.lg === y.lg ? 1 : 0);
      function render() {
        const sc = score();
        api.sub(`Выбрано ${team.filter(Boolean).length}/11 · замен: ${rerolls}`);
        b.innerHTML = `<div class="dr-score"><span><b>${sc.avg || '—'}</b><small>Рейтинг</small></span><span><b>${sc.chem}</b><small>Сыгранность</small></span><span class="fin"><b>${sc.final || '—'}</b><small>Итог</small></span></div>
          <div class="nat-pitch dr-pitch"><svg class="dr-links"></svg>${[...ROWS].reverse().map((r) => `<div class="nat-row">${r.map((i) => {
          const p = team[i];
          return `<button class="dr-slot ${p ? 'on' : ''} ${i === justPicked ? 'just' : ''}" data-i="${i}">${p ? `<em class="dr-rt">${Power.rating(p)}</em>${avatar(p.name, 'm')}<b>${esc(surname(p.name))}</b><small>${'★'.repeat(Math.min(3, Math.floor(sc.per[i] / 3))) || '·'}</small>` : `<span class="dr-plus">+</span><small>${SLOTS[i][0]}</small>`}</button>`;
        }).join('')}</div>`).join('')}</div>
          <p class="ng-lead">Нажми на пустую позицию. Линии на поле — сыгранность: <b style="color:#ffcf3a">клуб</b>, <b style="color:#34c46a">сборная</b>, <b style="color:#8fd8c4">лига</b>.</p>`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
        justPicked = -1;
        requestAnimationFrame(drawLinks);
      }
      // линии сыгранности поверх поля
      function drawLinks() {
        const pitch = $('.dr-pitch', b), svgEl = $('.dr-links', b);
        if (!pitch || !svgEl) return;
        const pr = pitch.getBoundingClientRect();
        const c = (i) => { const r = $(`.dr-slot[data-i="${i}"] .ava`, b); if (!r) return null; const q = r.getBoundingClientRect(); return [q.left + q.width / 2 - pr.left, q.top + q.height / 2 - pr.top]; };
        svgEl.setAttribute('viewBox', `0 0 ${pr.width} ${pr.height}`);
        let out = '';
        for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) {
          const x = team[i], y = team[j];
          if (!x || !y || Math.abs(lineOf(i) - lineOf(j)) > 1) continue;
          const v = link(x, y);
          if (!v) continue;
          const A = c(i), B = c(j);
          if (A && B) out += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="l${v}"/>`;
        }
        svgEl.innerHTML = out;
      }
      // выбор из трёх — во всплывающем окне
      function offerModal() {
        const offer = options(slot);
        Modal.open(`<h2>${SLOTS[slot][0]}: выбери игрока</h2><div class="dr-offer">${offer.map((p) => {
          const bonus = team.reduce((s2, t, j) => s2 + (t && Math.abs(lineOf(j) - lineOf(slot)) <= 1 ? link(p, t) : 0), 0);
          return `<button class="dr-card" data-n="${esc(p.name)}"><em>${Power.rating(p)}</em>${avatar(p.name, 'l')}<b>${esc(p.name)}</b><small>${p.flag} ${esc(p.club)}</small>${bonus ? `<span class="dr-bonus">+${bonus} сыгр.</span>` : ''}</button>`;
        }).join('')}</div>`, [
          ...(rerolls ? [{ label: `🔄 Других троих (${rerolls})`, cls: 'ghost', keepOpen: true, onClick: () => { rerolls--; offerModal(); } }] : []),
          { label: 'Отмена', cls: 'ghost', onClick: () => { slot = -1; render(); } },
        ]);
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate($('#modal-card'));
        $$('#modal-card .dr-card').forEach((el) => el.addEventListener('click', () => {
          const p = PLAYERS.find((x) => x.name === el.dataset.n);
          team[slot] = p; used.add(p.name); justPicked = slot; slot = -1; Sound.play('kick');
          Modal.close();
          render();
          if (team.every(Boolean)) finish();
        }));
      }
      function finish() {
        const sc = score(), s = api.st();
        const rec = sc.final > (s.best || 0);
        s.best = Math.max(s.best || 0, sc.final); api.save();
        Profile.bump('draft', 8);
        NG.end({ title: rec ? 'Новый рекорд!' : 'Команда собрана', win: rec, big: sc.final, stats: [['Рейтинг', sc.avg], ['Сыгранность', `${sc.chem}/110`], ['Рекорд', s.best]], reward: Math.max(5, Math.round((sc.final - 70) * 2)), again: { label: 'Новый драфт', fn: () => NG.open('draft') } });
      }
      b.addEventListener('click', (e) => {
        const sl = e.target.closest('.dr-slot');
        if (sl && !team[+sl.dataset.i]) { slot = +sl.dataset.i; Sound.play('tap'); offerModal(); }
      });
      render();
    },
  });
})();
