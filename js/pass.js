// «Пас в ворота»: мяч катится, пока не упрётся в защитника, бровку или не завязнет в луже.
// Ворота стоят над полем: гол засчитывается, если мяч катится вверх по линии ворот и пересекает лицевую.
// Уровни генерируются из номера, поэтому у всех уровень N одинаковый, а уровней бесконечно много.
'use strict';

const Pass = (() => {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const TOURS = ['Дворовая лига', 'Районный кубок', 'Первая лига', 'Премьер-лига', 'Лига чемпионов', 'Чемпионат мира'];
  const HINT_COST = 15;
  const EMPTY = 0, DEF = 1, MUD = 2;
  const cache = new Map();

  const tourOf = (n) => Math.floor((n - 1) / 10);
  const tourName = (t) => (t < TOURS.length ? TOURS[t] : `Легенда ${t - TOURS.length + 1}`);
  const isFinal = (n) => n % 10 === 0;

  // Один удар. Возвращает конечную клетку, путь и признак гола.
  function slide(lv, from, dir) {
    const [dx, dy] = DIRS[dir];
    let x = from % lv.w, y = Math.floor(from / lv.w);
    const path = [];
    for (;;) {
      const nx = x + dx, ny = y + dy;
      if (ny < 0 && dir === 'up' && x === lv.goal) return { to: -1, path, steps: path.length + 1, goal: true };
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) break;
      const i = ny * lv.w + nx;
      if (lv.cells[i] === DEF) break;
      x = nx; y = ny;
      path.push(i);
      if (lv.cells[i] === MUD) break;
    }
    return { to: y * lv.w + x, path, steps: path.length, goal: false };
  }

  // Кратчайшее решение из позиции (поиск в ширину): список направлений.
  function solve(lv, from) {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const s = q.shift();
      for (const d of Object.keys(DIRS)) {
        const r = slide(lv, s, d);
        if (r.steps === 0) continue;
        if (r.goal) {
          const out = [d];
          for (let c = s; prev.get(c); c = prev.get(c).s) out.unshift(prev.get(c).d);
          return out;
        }
        if (!prev.has(r.to)) { prev.set(r.to, { s, d }); q.push(r.to); }
      }
    }
    return null;
  }

  function generate(n) {
    if (cache.has(n)) return cache.get(n);
    const rnd = mulberry32(n * 7919 + 4242);
    const w = Math.min(5 + Math.floor(n / 15), 8);
    const h = Math.min(6 + Math.floor(n / 8), 10);
    let target = Math.min(2 + Math.floor(n / 4), 14);
    if (isFinal(n)) target += 2;
    const mudRate = n >= 16 ? Math.min(0.03 + (n - 16) * 0.002, 0.08) : 0;
    let best = null;

    for (let attempt = 0; attempt < 500; attempt++) {
      const dens = 0.1 + Math.min(0.12, n * 0.003) + rnd() * 0.07;
      const cells = Array.from({ length: w * h }, () => {
        const r = rnd();
        return r < dens ? DEF : r < dens + mudRate ? MUD : EMPTY;
      });
      // мяч стартует в своей половине поля
      const starts = [];
      cells.forEach((c, i) => { if (c === EMPTY && Math.floor(i / w) >= Math.floor(h * 0.6)) starts.push(i); });
      if (!starts.length) continue;
      const start = pick(starts, rnd);
      const probe = { w, h, cells, goal: -99 };

      // Для каждой колонки: за сколько ударов мяч может уйти за лицевую по этой колонке.
      const depth = new Map([[start, 0]]);
      const colDepth = new Array(w).fill(Infinity);
      const q = [start];
      while (q.length) {
        const s = q.shift();
        const k = depth.get(s);
        for (const d of Object.keys(DIRS)) {
          const r = slide(probe, s, d);
          if (d === 'up') {
            const x = s % w;
            const end = r.steps ? r.to : s;
            const blocked = r.path.some((i) => cells[i] === MUD);
            if (Math.floor(end / w) === 0 && !blocked && colDepth[x] > k + 1) colDepth[x] = k + 1;
          }
          if (r.steps && !depth.has(r.to)) { depth.set(r.to, k + 1); q.push(r.to); }
        }
      }
      const depths = colDepth.filter((d) => d !== Infinity);
      if (!depths.length) continue;
      const under = depths.filter((d) => d <= target);
      const want = under.length ? Math.max(...under) : Math.min(...depths);
      const cols = [];
      colDepth.forEach((d, x) => { if (d === want) cols.push(x); });
      cols.sort((a, b) => Math.abs(a - (w - 1) / 2) - Math.abs(b - (w - 1) / 2)); // ворота ближе к центру
      const lv = { n, w, h, cells, start, goal: pick(cols.slice(0, 2), rnd), par: want };
      lv.score = Math.min(want, target) * 10 - Math.abs(lv.goal - (w - 1) / 2) * 3;
      if (!best || lv.score > best.score) best = lv;
      if (want >= target && Math.abs(lv.goal - (w - 1) / 2) <= 1) break;
    }
    const sol = solve(best, best.start);
    best.par = sol ? sol.length : best.par;
    best.shirts = best.cells.map(() => 2 + Math.floor(rnd() * 22));
    cache.set(n, best);
    return best;
  }

  // ---------- экран уровней ----------
  function renderLevels() {
    const P = Store.d.pass;
    const lastTour = tourOf(P.unlocked) + 1;
    let html = '';
    for (let t = lastTour; t >= 0; t--) {
      let stars = 0, cells = '';
      for (let n = t * 10 + 1; n <= t * 10 + 10; n++) {
        const st = P.stars[n] || 0;
        stars += st;
        const locked = n > P.unlocked;
        const cls = ['lvl', isFinal(n) ? 'final' : '', locked ? 'locked' : '', n === P.unlocked ? 'current' : ''].join(' ');
        cells += `<button class="${cls}" data-level="${n}" ${locked ? 'disabled' : ''} aria-label="Уровень ${n}">
          ${locked ? '🔒' : n}<span class="st">${locked ? '' : '★'.repeat(st) || '·'}</span></button>`;
      }
      html += `<section class="tour"><h3>${tourName(t)}<small>★ ${stars}/30</small></h3><div class="level-grid">${cells}</div></section>`;
    }
    $('#tours').innerHTML = html;
  }

  // ---------- игра ----------
  let lv = null, pos = 0, moves = 0, busy = false, done = false, history = [], hinted = false, hintDir = null;

  // координаты в процентах: строка 0 — зона ворот, поле начинается со строки 1
  const cx = (x) => (x * 100) / lv.w;
  const cy = (y) => ((y + 1) * 100) / (lv.h + 1);
  const at = (i) => `left:${cx(i % lv.w)}%;top:${cy(Math.floor(i / lv.w))}%`;

  function start(n) {
    lv = generate(n);
    pos = lv.start; moves = 0; busy = false; done = false; history = []; hinted = false; hintDir = null;
    Screens.show('pass-game');
    $('#pass-tour').textContent = tourName(tourOf(n));
    $('#pass-num').textContent = `Уровень ${n}${isFinal(n) ? ' · финал тура' : ''}`;
    $('#pass-par').textContent = lv.par;
    const best = Store.d.pass.best[n];
    $('#pass-best').textContent = best || '—';
    const hasMud = lv.cells.includes(MUD);
    $('#pass-tip').textContent = n <= 2
      ? 'Тапни по жёлтой точке или свайпни. Мяч катится до упора. Забей вверх в ворота.'
      : hasMud && n <= 18 ? 'Новое: в луже мяч вязнет и останавливается.' : '';
    drawBoard();
    update();
  }

  function drawBoard() {
    const b = $('#board');
    b.style.setProperty('--w', lv.w);
    b.style.setProperty('--h', lv.h + 1);
    const cw = 100 / lv.w, ch = 100 / (lv.h + 1);
    let html = `<div class="pitch-field" style="top:${ch}%;height:${100 - ch}%;--rows:${lv.h}"></div>`;
    // штрафная вокруг ворот
    const bx = Math.max(0, lv.goal - 1), bw = Math.min(lv.w, lv.goal + 2) - bx;
    html += `<div class="box" style="left:${bx * cw}%;width:${bw * cw}%;top:${ch}%;height:${ch * 1.4}%"></div>`;
    // картинка ворот шире клетки: ставим её по центру колонки ворот
    html += `<div class="goal" style="left:${(lv.goal - 0.45) * cw}%;top:${-ch * 0.15}%;width:${cw * 1.9}%;height:${ch * 1.15}%"></div>`;
    lv.cells.forEach((c, i) => {
      if (c === DEF) html += `<div class="piece def" style="${at(i)}"></div>`;
      if (c === MUD) html += '<div class="piece mud" style="' + at(i) + '"></div>';
    });
    html += '<div class="marks" id="marks"></div><div class="piece ball" id="ball"></div>';
    b.innerHTML = html;
    placeBall(pos, 0);
  }

  function placeBall(i, ms) {
    const ball = $('#ball');
    ball.style.transitionDuration = ms + 'ms';
    if (i === -1) ball.style.transform = `translate(${lv.goal * 100}%, 0%)`;
    else ball.style.transform = `translate(${(i % lv.w) * 100}%, ${(Math.floor(i / lv.w) + 1) * 100}%)`;
  }

  // Подсветка: куда можно ударить и где мяч остановится.
  function drawMarks() {
    const box = $('#marks');
    if (done) { box.innerHTML = ''; return; }
    let html = '';
    for (const d of Object.keys(DIRS)) {
      const r = slide(lv, pos, d);
      if (!r.steps) continue;
      r.path.slice(0, -1).forEach((i) => { html += `<i class="trail" style="${at(i)}"></i>`; });
      const end = r.goal ? `left:${cx(lv.goal)}%;top:0%` : at(r.to);
      if (r.goal && r.path.length) html += `<i class="trail" style="${at(r.path[r.path.length - 1])}"></i>`;
      html += `<button class="mark ${r.goal ? 'scores' : ''} ${hintDir === d ? 'hinted' : ''}" data-dir="${d}" style="${end}" aria-label="Удар ${d}"></button>`;
    }
    box.innerHTML = html;
  }

  function update() {
    $('#pass-moves').textContent = moves;
    drawMarks();
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
    pos = r.to; moves++; busy = true; hintDir = null;
    $('#marks').innerHTML = '';
    const ms = 70 + r.steps * 70;
    const ball = $('#ball');
    ball.classList.add('rolling');
    placeBall(pos, ms);
    Sound.play('kick'); haptic('tap');
    $('#pass-moves').textContent = moves;
    setTimeout(() => {
      ball.classList.remove('rolling');
      busy = false;
      if (r.goal) win();
      else update();
    }, ms + 20);
  }

  const starsFor = (m) => (m <= lv.par ? 3 : m <= lv.par + 2 ? 2 : 1);

  function win() {
    done = true;
    $('#ball').classList.add('scored');
    $('.goal').classList.add('net-hit');
    Sound.play('goal'); haptic('ok');
    const P = Store.d.pass;
    const n = lv.n;
    const st = starsFor(moves);
    const prev = P.stars[n] || 0;
    let reward = 0;
    if (st > prev) { reward = (st - prev) * 10 + (prev === 0 && isFinal(n) ? 30 : 0); P.stars[n] = st; }
    if (!P.best[n] || moves < P.best[n]) P.best[n] = moves;
    if (n >= P.unlocked) P.unlocked = n + 1;
    Profile.bump('pass');
    Store.save();
    if (reward) Coins.add(reward);
    if (st === 3) confetti();
    update();

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
    }, 650);
  }

  function undo() {
    if (busy || done || !history.length) return;
    pos = history.pop();
    moves--;
    hintDir = null;
    placeBall(pos, 150);
    update();
  }

  function hint() {
    if (busy || done) return;
    const sol = solve(lv, pos);
    if (!sol) { toast('Отсюда не забить. Нажми «Заново».'); return; }
    if (!hinted && !Coins.spend(HINT_COST)) return;
    hinted = true; // на этом уровне дальше подсказки бесплатные
    hintDir = sol[0];
    drawMarks();
    $('#pass-tip').textContent = `Подсказка: бей по мигающей точке. До гола ${sol.length} ${plural(sol.length, 'удар', 'удара', 'ударов')}.`;
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
    const wrap = $('#board-wrap');
    let sx = 0, sy = 0, active = false;
    wrap.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; active = true; });
    wrap.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // короткое касание обработает click
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    wrap.addEventListener('click', (e) => {
      const m = e.target.closest('.mark');
      if (m) move(m.dataset.dir);
    });
    wrap.addEventListener('pointercancel', () => { active = false; });
    document.addEventListener('keydown', (e) => {
      if (Screens.current !== 'pass-game') return;
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
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
