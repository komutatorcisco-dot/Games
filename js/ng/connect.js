// «Связи» (как Connections): 16 футболистов, разбей их на 4 группы по 4 — общий клуб, сборная или страна.
// Выбери четверых и нажми «Проверить». 4 ошибки — конец.
'use strict';

(() => {
  const MISTAKES = 4;
  const COLORS = ['#ffcf3a', '#34c46a', '#5b8cff', '#c65bd8'];

  function build(rnd) {
    const C = TTT.cats, G = TTT.groups;
    for (let t = 0; t < 400; t++) {
      const pickN = (arr, n) => shuffle(arr, rnd).slice(0, n);
      const ids = [...pickN(G.BIG, 2), ...pickN(G.NATS, 1), ...pickN([...G.OTHER, ...G.BIG], 1)];
      if (new Set(ids).size < 4) continue;
      const sets = ids.map((id) => C.get(id).set);
      // в группу берём только тех, кто подходит ровно под одну из четырёх категорий
      const groups = sets.map((s, i) => shuffle([...s].filter((n) => sets.every((o, j) => j === i || !o.has(n))), rnd).slice(0, 4));
      if (groups.some((g) => g.length < 4)) continue;
      return ids.map((id, i) => ({ id, label: C.get(id).t === 'club' ? `Играли за «${id}»` : C.get(id).label.replace(/^./, (c) => c.toUpperCase()), names: groups[i] }));
    }
    return null;
  }

  NG.register({
    id: 'connect', group: 'brain', title: 'Связи', c1: '#5b8cff', c2: '#2c4bb0', tag: '4 группы по 4',
    meta: (s) => (s.wins ? `Побед: ${s.wins}` : '16 игроков'),
    start(api) {
      const groups = build(Math.random);
      if (!groups) { toast('Не получилось собрать связи, попробуй ещё'); return; }
      let left = shuffle(groups.flatMap((g) => g.names), Math.random), sel = new Set(), solved = [], mistakes = 0, over = false;
      const b = api.body;
      const groupOf = (n) => groups.findIndex((g) => g.names.includes(n));
      function render() {
        api.sub(`Ошибок осталось: ${MISTAKES - mistakes}`);
        b.innerHTML = `<p class="ng-lead">Найди 4 группы по 4 игрока. Что их объединяет — клуб, сборная или страна?</p>
          ${solved.map((gi) => `<div class="cn-solved" style="--c:${COLORS[gi]}"><b>${esc(groups[gi].label)}</b><span>${groups[gi].names.map(esc).join(', ')}</span></div>`).join('')}
          <div class="cn-grid">${left.map((n) => `<button class="cn-tile ${sel.has(n) ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
          <div class="ng-row"><button class="btn ghost" data-a="mix">Перемешать</button><button class="btn ghost" data-a="clear">Сбросить</button><button class="btn gold" data-a="check" ${sel.size === 4 ? '' : 'disabled'}>Проверить</button></div>`;
      }
      function check() {
        const arr = [...sel], gs = arr.map(groupOf);
        const counts = {};
        gs.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
        const best = Math.max(...Object.values(counts));
        if (best === 4) {
          solved.push(gs[0]); left = left.filter((n) => !sel.has(n)); sel = new Set();
          Sound.play('kick'); haptic('ok');
          if (solved.length === 4) return finish(true);
        } else {
          mistakes++; Sound.play('bad'); haptic('bad');
          toast(best === 3 ? 'Почти! Трое из одной группы' : 'Не та группа');
          bump($('.cn-grid', b), 'shake');
          if (mistakes >= MISTAKES) return finish(false);
        }
        render();
      }
      function finish(won) {
        over = true;
        groups.forEach((g, i) => { if (!solved.includes(i)) solved.push(i); });
        left = []; render();
        const s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; api.save(); Profile.bump('connect', 15); }
        NG.end({ title: won ? 'Все связи найдены!' : 'Ошибки закончились', win: won, reward: won ? 40 - mistakes * 8 : solved.length * 2,
          html: '<p>Все группы открыты на экране.</p>', again: { label: 'Новые связи', fn: () => NG.open('connect') } });
      }
      b.addEventListener('click', (e) => {
        if (over) return;
        const t = e.target.closest('.cn-tile');
        if (t) { const n = t.dataset.n; if (sel.has(n)) sel.delete(n); else if (sel.size < 4) sel.add(n); Sound.play('tap'); render(); return; }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'mix') left = shuffle(left, Math.random);
        if (a.dataset.a === 'clear') sel = new Set();
        if (a.dataset.a === 'check') return check();
        render();
      });
      render();
    },
  });
})();
