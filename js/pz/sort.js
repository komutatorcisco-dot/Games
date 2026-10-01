// «Сортировка мячей»: разложи мячи по колбам, чтобы в каждой был один цвет.
// Каждая раскладка проверяется решателем, так что нерешаемых уровней нет.
'use strict';

(() => {
  const CAP = 4;

  // Поиск в глубину с запоминанием состояний: есть ли решение.
  function solvable(tubes, limit = 150000) {
    const seen = new Set();
    let nodes = 0;
    const key = (t) => t.map((x) => x.join('')).sort().join('|');
    const done = (t) => t.every((x) => x.length === 0 || (x.length === CAP && x.every((c) => c === x[0])));
    function dfs(t) {
      if (done(t)) return true;
      if (++nodes > limit) return false;
      const k = key(t);
      if (seen.has(k)) return false;
      seen.add(k);
      for (let a = 0; a < t.length; a++) {
        const A = t[a];
        if (!A.length) continue;
        const top = A[A.length - 1];
        const uniform = A.every((c) => c === top);
        if (uniform && A.length === CAP) continue;
        for (let b = 0; b < t.length; b++) {
          if (a === b) continue;
          const B = t[b];
          if (B.length >= CAP) continue;
          if (B.length && B[B.length - 1] !== top) continue;
          if (!B.length && uniform) continue; // бессмысленно переливать одноцветную колбу в пустую
          const n = t.map((x) => x.slice());
          while (n[a].length && n[a][n[a].length - 1] === top && n[b].length < CAP) n[b].push(n[a].pop());
          if (dfs(n)) return true;
        }
      }
      return false;
    }
    return dfs(tubes.map((x) => x.slice()));
  }

  function generate(level, rng) {
    const colors = Math.min(3 + Math.floor((level - 1) / 3), 9);
    const empty = level > 20 ? 1 : 2;
    for (let tries = 0; tries < 60; tries++) {
      const balls = [];
      for (let c = 0; c < colors; c++) for (let k = 0; k < CAP; k++) balls.push(c);
      const mix = shuffle(balls, rng);
      const tubes = [];
      for (let c = 0; c < colors; c++) tubes.push(mix.slice(c * CAP, c * CAP + CAP));
      for (let e = 0; e < empty; e++) tubes.push([]);
      if (tubes.some((t) => t.length === CAP && t.every((x) => x === t[0]))) continue;
      if (solvable(tubes)) return tubes;
    }
    // запасной вариант: две пустые колбы
    const balls = [];
    for (let c = 0; c < colors; c++) for (let k = 0; k < CAP; k++) balls.push(c);
    const mix = shuffle(balls, rng);
    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(mix.slice(c * CAP, c * CAP + CAP));
    tubes.push([], []);
    return tubes;
  }

  PZ.register({
    id: 'sort', title: 'Сортировка мячей', icon: '●', c1: '#ff8a2a', c2: '#b23d22',
    start(level, api) {
      const start = generate(level, api.rng(1));
      let tubes = start.map((t) => t.slice()), sel = -1, moves = 0, undos = 0, history = [], done = false;
      const area = api.area();

      function render(dropTo = -1) {
        area.innerHTML = `<div class="tubes" style="--n:${tubes.length}">${tubes.map((t, i) => `
          <button class="tube ${sel === i ? 'sel' : ''} ${t.length === CAP && t.every((c) => c === t[0]) ? 'full' : ''}" data-i="${i}">
            ${t.map((c, k) => `<i class="sball ${sel === i && k === t.length - 1 ? 'up' : ''} ${dropTo === i && k === t.length - 1 ? 'drop' : ''}" style="--c:${KIT[c]}"></i>`).join('')}
          </button>`).join('')}</div>`;
        api.hud(`<span class="pz-chip">Ходы: <b>${moves}</b></span><span class="pz-chip">Цветов: <b>${start.length - (level > 20 ? 1 : 2)}</b></span>`);
      }

      function tap(i) {
        if (done) return;
        if (sel === -1) {
          if (!tubes[i].length) return;
          sel = i; Sound.play('tap'); render(); return;
        }
        if (sel === i) { sel = -1; render(); return; }
        const A = tubes[sel], B = tubes[i];
        const top = A[A.length - 1];
        if (B.length >= CAP || (B.length && B[B.length - 1] !== top)) {
          Sound.play('bad'); haptic('bad');
          sel = tubes[i].length ? i : -1; render(); return;
        }
        history.push(tubes.map((t) => t.slice()));
        // запоминаем, где были верхние мячи, — потом они перелетят по дуге
        const from = sel;
        const srcEls = [...$$(`.tube[data-i="${from}"] .sball`, area)].reverse();
        // переносим все одинаковые верхние мячи, сколько поместится
        let k = 0;
        while (A.length && A[A.length - 1] === top && B.length < CAP) { B.push(A.pop()); k++; }
        const srcRects = srcEls.slice(0, k).map((el) => el.getBoundingClientRect());
        moves++; sel = -1;
        Sound.play('kick'); haptic('tap');
        render();
        fly(i, srcRects);
        if (tubes.every((t) => !t.length || (t.length === CAP && t.every((c) => c === t[0])))) {
          done = true;
          api.win(undos === 0 ? 3 : undos <= 3 ? 2 : 1, `Ходов: ${moves}`);
        }
      }

      // Полёт: мяч поднимается над своей пробиркой, по дуге перелетает к новой и падает внутрь с отскоком
      function fly(to, srcRects) {
        const dst = [...$$(`.tube[data-i="${to}"] .sball`, area)].slice(-srcRects.length).reverse();
        const tubeTop = $(`.tube[data-i="${to}"]`, area).getBoundingClientRect().top;
        dst.forEach((el, j) => {
          const r = el.getBoundingClientRect(), s0 = srcRects[j];
          const dx = s0.left - r.left, dy = s0.top - r.top;
          const peak = Math.min(s0.top, tubeTop) - 46 - r.top;      // высота дуги над пробирками
          const above = tubeTop - 44 - r.top;                        // над горлышком новой пробирки
          el.classList.add('flying');
          const a = el.animate([
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx * 0.55}px, ${peak}px)`, offset: 0.32 },
            { transform: `translate(0px, ${above}px)`, offset: 0.58 },
            { transform: 'translate(0px, 3px) scale(1.06, .92)', offset: 0.86 },
            { transform: 'translate(0px, -2px)', offset: 0.94 },
            { transform: 'none' },
          ], { duration: 520, delay: j * 70, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'backwards' });
          a.onfinish = () => el.classList.remove('flying');
        });
        later(() => Sound.play('tap'), 430);
      }

      area.addEventListener('click', (e) => { const t = e.target.closest('.tube'); if (t) tap(+t.dataset.i); });
      api.actions([
        { label: '↶ Отмена', fn: () => { if (history.length && !done) { tubes = history.pop(); undos++; moves++; sel = -1; render(); } } },
        { label: '⟲ Заново', fn: () => { tubes = start.map((t) => t.slice()); history = []; moves = 0; sel = -1; render(); } },
      ]);
      render();
    },
  });
})();
