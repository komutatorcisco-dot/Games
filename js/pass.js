// «Пас в ворота»: мяч катится, пока не упрётся в защитника или бровку.
// Уровни генерируются из номера уровня, поэтому у всех игроков уровень N одинаковый, и уровней бесконечно много.
'use strict';

const Pass = (() => {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const TOURS = ['Дворовая лига', 'Районный кубок', 'Первая лига', 'Премьер-лига', 'Лига чемпионов', 'Чемпионат мира'];
  const HINT_COST = 15;
  const cache = new Map();

  const tourOf = (n) => Math.floor((n - 1) / 10);
  const tourName = (t) => (t < TOURS.length ? TOURS[t] : `Легенда ${t - TOURS.length + 1}`);
  const isFinal = (n) => n % 10 === 0;

  // Один удар: куда остановится мяч. Ворота ловят мяч, даже если он катится через них.
  function slide(lv, from, dir) {
    const [dx, dy] = DIRS[dir];
    let x = from % lv.w, y = Math.floor(from / lv.w), steps = 0;
    for (;;) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) break;
      const i = ny * lv.w + nx;
      if (lv.cells[i] === 1) break;
      x = nx; y = ny; steps++;
      if (i === lv.goal) return { to: i, steps, goal: true };
    }
    return { to: y * lv.w + x, steps, goal: false };
  }

  // Кратчайшее решение из позиции (поиск в ширину). Возвращает список направлений.
  function solve(lv, from) {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const s = q.shift();
      for (const d of Object.keys(DIRS)) {
        const r = slide(lv, s, d);
        if (r.steps === 0) continue;
        if (r.goal) {
          const path = [d];
          for (let c = s; prev.get(c); c = prev.get(c).s) path.unshift(prev.get(c).d);
          return path;
        }
        if (!prev.has(r.to)) { prev.set(r.to, { s, d }); q.push(r.to); }
      }
    }
    return null;
  }

  function generate(n) {
    if (cache.has(n)) return cache.get(n);
    const rnd = mulberry32(n * 7919 + 1337);
    const w = Math.min(5 + Math.floor(n / 12), 8);
    const h = Math.min(6 + Math.floor(n / 7), 11);
    let target = Math.min(2 + Math.floor(n / 4), 14);
    if (isFinal(n)) target += 2;
    let best = null;

    for (let attempt = 0; attempt < 400; attempt++) {
      const dens = 0.1 + Math.min(0.12, n * 0.003) + rnd() * 0.08;
      const cells = Array.from({ length: w * h }, () => (rnd() < dens ? 1 : 0));
      const empty = [];
      cells.forEach((c, i) => { if (!c) empty.push(i); });
      if (empty.length < 5) continue;
      const start = pick(empty, rnd);

      // Для каждой клетки ищем минимальное число ударов, за которое мяч через неё прокатится.
      const depth = new Map([[start, 0]]);
      const cap = new Array(w * h).fill(Infinity);
      const q = [start];
      while (q.length) {
        const s = q.shift();
        const k = depth.get(s);
        for (const [dx, dy] of Object.values(DIRS)) {
          let x = s % w, y = Math.floor(s / w);
          for (;;) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || cells[ny * w + nx] === 1) break;
            x = nx; y = ny;
            const i = y * w + x;
            if (cap[i] > k + 1) cap[i] = k + 1;
          }
          const e = y * w + x;
          if (!depth.has(e)) { depth.set(e, k + 1); q.push(e); }
        }
      }
      let maxd = 0;
      cap.forEach((d, i) => { if (i !== start && d !== Infinity && d > maxd) maxd = d; });
      if (!maxd) continue;
      const want = Math.min(target, maxd);
      const cand = [];
      cap.forEach((d, i) => { if (i !== start && d === want) cand.push(i); });
      const lv = { n, w, h, cells, start, goal: pick(cand, rnd), par: want };
      if (!best || lv.par > best.par) best = lv;
      if (want >= target) break;
    }
    const sol = solve(best, best.start);
    best.par = sol ? sol.length : best.par;
    // номера на футболках соперников, чтобы поле не выглядело одинаковым
    best.shirts = best.cells.map(() => 2 + Math.floor(rnd() * 22));
    cache.set(n, best);
    return best;
  }

  // ---------- экран уровней ----------
  function renderLevels() {
    const P = Store.d.pass;
    const lastTour = tourOf(P.unlocked) + 1; // показываем ещё один закрытый тур впереди
    const box = $('#tours');
    let html = '';
    for (let t = lastTour; t >= 0; t--) {
      let stars = 0;
      let cells = '';
      for (let n = t * 10 + 1; n <= t * 10 + 10; n++) {
        const st = P.stars[n] || 0;
        stars += st;
        const locked = n > P.unlocked;
        const cls = ['lvl', isFinal(n) ? 'final' : '', locked ? 'locked' : '', n === P.unlocked ? 'current' : ''].join(' ');
        cells += `<button class="${cls}" data-level="${n}" ${locked ? 'disabled aria-disabled="true"' : ''} aria-label="Уровень ${n}">
          ${locked ? '🔒' : n}<span class="st">${locked ? '' : '★'.repeat(st) || '·'}</span></button>`;
      }
      html += `<section class="tour"><h3>${tourName(t)}<small>★ ${stars}/30</small></h3><div class="level-grid">${cells}</div></section>`;
    }
    box.innerHTML = html;
  }

  // ---------- игра ----------
  let lv = null, pos = 0, moves = 0, busy = false, done = false, history = [], hinted = false;

  function start(n) {
    lv = generate(n);
    pos = lv.start; moves = 0; busy = false; done = false; history = []; hinted = false;
    Screens.show('pass-game');
    $('#pass-tour').textContent = tourName(tourOf(n));
    $('#pass-num').textContent = `Уровень ${n}${isFinal(n) ? ' · финал тура' : ''}`;
    $('#pass-par').textContent = lv.par;
    const best = Store.d.pass.best[n];
    $('#pass-best').textContent = best ? best : '—';
    $('#pass-tip').textContent = n <= 2 ? 'Свайпай по полю или жми стрелки. Мяч катится до упора.' : '';
    drawBoard();
    updateHud();
  }

  function drawBoard() {
    const b = $('#board');
    b.style.setProperty('--w', lv.w);
    b.style.setProperty('--h', lv.h);
    let html = '';
    for (let i = 0; i < lv.w * lv.h; i++) {
      const y = Math.floor(i / lv.w);
      html += `<div class="cell${y % 2 ? ' alt' : ''}" data-i="${i}">`;
      if (lv.cells[i] === 1) html += `<div class="def" data-n="${lv.shirts[i]}"></div>`;
      if (i === lv.goal) html += '<div class="goal-cell"></div>';
      html += '</div>';
    }
    html += '<div class="ball" id="ball"></div>';
    b.innerHTML = html;
    placeBall(pos, 0);
  }

  function placeBall(i, ms) {
    const ball = $('#ball');
    ball.style.transitionDuration = ms + 'ms';
    ball.style.transform = `translate(${(i % lv.w) * 100}%, ${Math.floor(i / lv.w) * 100}%)`;
  }

  function updateHud() {
    $('#pass-moves').textContent = moves;
    $$('.pad-btn').forEach((b) => b.classList.remove('hinted'));
  }

  function move(dir) {
    if (!lv || busy || done || Modal.isOpen) return;
    const r = slide(lv, pos, dir);
    if (r.steps === 0) {
      const b = $('#board');
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      Sound.play('bad'); haptic('tap');
      return;
    }
    history.push(pos);
    pos = r.to; moves++; busy = true;
    const ms = 60 + r.steps * 65;
    const ball = $('#ball');
    ball.classList.add('rolling');
    placeBall(pos, ms);
    Sound.play('kick'); haptic('tap');
    updateHud();
    setTimeout(() => {
      ball.classList.remove('rolling');
      busy = false;
      if (r.goal) win();
    }, ms + 20);
  }

  function starsFor(m) { return m <= lv.par ? 3 : m <= lv.par + 2 ? 2 : 1; }

  function win() {
    done = true;
    $('#ball').classList.add('scored');
    Sound.play('goal'); haptic('ok');
    const P = Store.d.pass;
    const n = lv.n;
    const st = starsFor(moves);
    const prev = P.stars[n] || 0;
    let reward = 0;
    if (st > prev) { reward = (st - prev) * 10 + (prev === 0 && isFinal(n) ? 30 : 0); P.stars[n] = st; }
    if (!P.best[n] || moves < P.best[n]) P.best[n] = moves;
    if (n >= P.unlocked) P.unlocked = n + 1;
    Store.save();
    if (reward) Coins.add(reward);
    if (st === 3) confetti();

    const starsHtml = [1, 2, 3].map((i) => (i <= st ? '★' : '<span class="off">★</span>')).join('');
    const msg = st === 3 ? 'Идеальная атака!' : `На 3 звезды хватит ${lv.par} ${plural(lv.par, 'удара', 'ударов', 'ударов')}`;
    setTimeout(() => {
      Modal.open(
        `<h2>${isFinal(n) ? 'Финал взят!' : 'Гол!'}</h2>
         <div class="stars">${starsHtml}</div>
         <p>Ударов: <b>${moves}</b>. ${msg}</p>
         ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
         ${quoteHtml(st === 3 ? 'win' : 'lose')}`,
        [
          { label: `Уровень ${n + 1} →`, onClick: () => start(n + 1) },
          { label: 'Переиграть', cls: 'ghost', onClick: () => start(n) },
          { label: 'Все уровни', cls: 'ghost', onClick: openLevels },
        ],
      );
    }, 450);
  }

  function undo() {
    if (busy || done || !history.length) return;
    pos = history.pop();
    moves++; // отмена тоже стоит удара, чтобы звёзды были честными
    placeBall(pos, 120);
    updateHud();
    toast('Отмена засчитана как удар');
  }

  function hint() {
    if (busy || done) return;
    const sol = solve(lv, pos);
    if (!sol) { toast('Отсюда не забить. Нажми «Заново».'); return; }
    if (!hinted && !Coins.spend(HINT_COST)) return;
    hinted = true; // повторная подсказка на этом же уровне бесплатна
    const btn = $(`.pad-btn[data-dir="${sol[0]}"]`);
    btn.classList.add('hinted');
    $('#pass-tip').textContent = `Подсказка: ${{ up: 'вверх', down: 'вниз', left: 'влево', right: 'вправо' }[sol[0]]}. До гола ${sol.length} ${plural(sol.length, 'удар', 'удара', 'ударов')}.`;
  }

  function openLevels() {
    renderLevels();
    Screens.show('pass-levels');
    const cur = $('.lvl.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function bind() {
    $('#tours').addEventListener('click', (e) => {
      const b = e.target.closest('.lvl');
      if (b && !b.disabled) start(+b.dataset.level);
    });
    $$('.pad-btn').forEach((b) => b.addEventListener('click', () => move(b.dataset.dir)));

    // свайпы по полю
    const wrap = $('#board-wrap');
    let sx = 0, sy = 0, active = false;
    wrap.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; active = true; });
    wrap.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    wrap.addEventListener('pointercancel', () => { active = false; });

    document.addEventListener('keydown', (e) => {
      if (Screens.current !== 'pass-game') return;
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    });
  }

  return {
    bind, openLevels, start, undo, hint, generate, solve,
    restart: () => lv && start(lv.n),
    totalStars: () => Object.values(Store.d.pass.stars).reduce((a, b) => a + b, 0),
  };
})();

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
