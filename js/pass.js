// «Пас в ворота»: мяч катится, пока не упрётся в защитника, бровку или не завязнет в луже.
// Ворота стоят над полем: гол засчитывается, если мяч катится вверх по линии ворот и пересекает лицевую.
// С 4-го уровня на поле есть партнёры (синие манекены): ворота открываются, только когда мяч побывал у всех.
// С 8-го — отбойники: мяч отскакивает от них под прямым углом.
// Уровни генерируются из номера, поэтому у всех уровень N одинаковый, а уровней бесконечно много.
'use strict';

const Pass = (() => {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const TOURS = ['Дворовая лига', 'Районный кубок', 'Первая лига', 'Премьер-лига', 'Лига чемпионов', 'Чемпионат мира'];
  const HINT_COST = 15;
  const EMPTY = 0, DEF = 1, MUD = 2, MATE = 3, DL = 4, DR = 5; // DL = «/», DR = «\»
  const cache = new Map();

  const tourOf = (n) => Math.floor((n - 1) / 10);
  const tourName = (t) => (t < TOURS.length ? TOURS[t] : `Легенда ${t - TOURS.length + 1}`);
  const isFinal = (n) => n % 10 === 0;

  // Один удар. mask — у каких партнёров мяч уже побывал.
  // Возвращает конечную клетку, путь, новую маску, гол и колонку, где мяч ушёл за лицевую (exit).
  function slide(lv, from, dir, mask = 0) {
    let [dx, dy] = DIRS[dir];
    let x = from % lv.w, y = Math.floor(from / lv.w), m = mask, guard = 0, exit = -1;
    const path = [];
    for (;;) {
      if (++guard > 300) return { to: from, path: [], steps: 0, goal: false, mask, exit: -1 }; // мяч зациклился
      const nx = x + dx, ny = y + dy;
      if (ny < 0 && dy === -1) {
        exit = x;
        if (x === lv.goal && m === lv.full) return { to: -1, path, steps: path.length + 1, goal: true, mask: m, exit };
        break;
      }
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) break;
      const i = ny * lv.w + nx, c = lv.cells[i];
      if (c === DEF) break;
      x = nx; y = ny;
      path.push(i);
      if (c === MATE) m |= lv.bit[i];
      if (c === MUD) break;
      if (c === DL) [dx, dy] = [-dy, -dx];
      else if (c === DR) [dx, dy] = [dy, dx];
    }
    return { to: y * lv.w + x, path, steps: path.length, goal: false, mask: m, exit };
  }

  // Кратчайшее решение (поиск в ширину по «клетка + партнёры»): список направлений.
  function solve(lv, from, mask = 0) {
    const key = (p, m) => p * 16 + m;
    const prev = new Map([[key(from, mask), null]]);
    const q = [[from, mask]];
    while (q.length) {
      const [s, sm] = q.shift();
      for (const d of Object.keys(DIRS)) {
        const r = slide(lv, s, d, sm);
        if (r.steps === 0) continue;
        if (r.goal) {
          const out = [d];
          for (let k = key(s, sm); prev.get(k); k = prev.get(k).k) out.unshift(prev.get(k).d);
          return out;
        }
        const k2 = key(r.to, r.mask);
        if (!prev.has(k2)) { prev.set(k2, { k: key(s, sm), d }); q.push([r.to, r.mask]); }
      }
    }
    return null;
  }

  function generate(n) {
    if (cache.has(n)) return cache.get(n);
    const rnd = mulberry32(n * 7919 + 4242);
    const w = Math.min(5 + Math.floor(n / 10), 8);
    const h = Math.min(7 + Math.floor(n / 6), 11);
    let target = Math.min(3 + Math.floor(n / 3), 18);
    if (isFinal(n)) target += 3;
    const mates = n >= 4 ? Math.min(1 + Math.floor((n - 4) / 8), 3) : 0;
    const defl = n >= 8 ? Math.min(1 + Math.floor((n - 8) / 6), 5) : 0;
    const mudRate = n >= 16 ? Math.min(0.03 + (n - 16) * 0.002, 0.07) : 0;
    let best = null;

    for (let attempt = 0; attempt < 400; attempt++) {
      const dens = 0.1 + Math.min(0.1, n * 0.003) + rnd() * 0.06;
      const cells = Array.from({ length: w * h }, () => {
        const r = rnd();
        return r < dens ? DEF : r < dens + mudRate ? MUD : EMPTY;
      });
      const empties = () => cells.map((c, i) => (c === EMPTY ? i : -1)).filter((i) => i >= 0);
      const starts = empties().filter((i) => Math.floor(i / w) >= Math.floor(h * 0.6));
      if (!starts.length) continue;
      const start = pick(starts, rnd);
      const bit = {};
      let ok = true;
      for (let k = 0; k < mates; k++) {
        const e = empties().filter((i) => i !== start && Math.floor(i / w) < h - 1);
        if (!e.length) { ok = false; break; }
        const i = pick(e, rnd); cells[i] = MATE; bit[i] = 1 << k;
      }
      for (let k = 0; k < defl; k++) {
        const e = empties().filter((i) => i !== start);
        if (!e.length) break;
        cells[pick(e, rnd)] = rnd() < 0.5 ? DL : DR;
      }
      if (!ok) continue;
      const full = (1 << mates) - 1;
      const probe = { w, h, cells, bit, full, goal: -99 };

      // Один обход: для каждой колонки — за сколько ударов можно уйти за лицевую, собрав всех партнёров.
      const key = (p, m) => p * 16 + m;
      const depth = new Map([[key(start, 0), 0]]);
      const colDepth = new Array(w).fill(Infinity);
      const q = [[start, 0]];
      while (q.length) {
        const [s, sm] = q.shift();
        const k = depth.get(key(s, sm));
        for (const d of Object.keys(DIRS)) {
          const r = slide(probe, s, d, sm);
          if (r.exit >= 0 && r.mask === full && colDepth[r.exit] > k + 1) colDepth[r.exit] = k + 1;
          if (!r.steps) continue;
          const k2 = key(r.to, r.mask);
          if (!depth.has(k2)) { depth.set(k2, k + 1); q.push([r.to, r.mask]); }
        }
      }
      const depths = colDepth.filter((d) => d !== Infinity);
      if (!depths.length) continue;
      const under = depths.filter((d) => d <= target);
      const want = under.length ? Math.max(...under) : Math.min(...depths);
      const cols = [];
      colDepth.forEach((d, x) => { if (d === want) cols.push(x); });
      cols.sort((a, b) => Math.abs(a - (w - 1) / 2) - Math.abs(b - (w - 1) / 2));
      const lv = { n, w, h, cells, start, bit, full, mates, goal: pick(cols.slice(0, 2), rnd), par: want };
      lv.score = Math.min(want, target) * 10 - Math.abs(lv.goal - (w - 1) / 2) * 3;
      if (!best || lv.score > best.score) best = lv;
      if (want >= target && Math.abs(lv.goal - (w - 1) / 2) <= 1) break;
    }
    const sol = solve(best, best.start);
    best.par = sol ? sol.length : best.par;
    cache.set(n, best);
    return best;
  }

  // ---------- экран уровней ----------
  function renderLevels() {
    const P = Store.d.pass;
    const lastTour = tourOf(P.unlocked) + 1;
    let html = '';
    for (let t = 0; t <= lastTour; t++) {
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
  let lv = null, pos = 0, mask = 0, moves = 0, busy = false, done = false, history = [], hinted = false, hintDir = null;

  // координаты в процентах: строка 0 — зона ворот, поле начинается со строки 1
  const cx = (x) => (x * 100) / lv.w;
  const cy = (y) => ((y + 1) * 100) / (lv.h + 1);
  const at = (i) => `left:${cx(i % lv.w)}%;top:${cy(Math.floor(i / lv.w))}%`;

  function start(n) {
    lv = generate(n);
    pos = lv.start; mask = 0; moves = 0; busy = false; done = false; history = []; hinted = false; hintDir = null;
    Screens.show('pass-game');
    $('#pass-tour').textContent = tourName(tourOf(n));
    $('#pass-num').textContent = `Уровень ${n}${isFinal(n) ? ' · финал тура' : ''}`;
    const best = Store.d.pass.best[n];
    $('#pass-best').textContent = best || '—';
    const has = (c) => lv.cells.includes(c);
    $('#pass-tip').textContent = n <= 2
      ? 'Тапни по жёлтой точке или свайпни. Мяч катится до упора. Забей вверх в ворота.'
      : n <= 6 && has(MATE) ? 'Новое: сначала отдай пас каждому синему партнёру — потом откроются ворота.'
        : n <= 10 && (has(DL) || has(DR)) ? 'Новое: отбойник поворачивает мяч на 90°.'
          : n <= 18 && has(MUD) ? 'Новое: в луже мяч вязнет и останавливается.' : '';
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
      if (c === MATE) html += `<div class="piece mate" data-i="${i}" style="${at(i)}"></div>`;
      if (c === DL || c === DR) html += `<div class="piece defl ${c === DL ? 'dl' : 'dr'}" style="${at(i)}"><i></i></div>`;
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
      const r = slide(lv, pos, d, mask);
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
    const got = lv.mates ? [...Array(lv.mates).keys()].filter((k) => mask & (1 << k)).length : 0;
    $('#pass-mates').textContent = lv.mates ? `${got}/${lv.mates}` : '—';
    $$('#board .mate').forEach((el) => el.classList.toggle('got', !!(mask & lv.bit[el.dataset.i])));
    const g = $('#board .goal');
    if (g) g.classList.toggle('locked', mask !== lv.full);
    drawMarks();
  }

  function move(dir) {
    if (!lv || busy || done || Modal.isOpen) return;
    const r = slide(lv, pos, dir, mask);
    if (r.steps === 0) {
      const b = $('#board');
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      Sound.play('bad'); haptic('tap');
      return;
    }
    history.push([pos, mask]);
    const gained = r.mask !== mask;
    pos = r.to; mask = r.mask; moves++; busy = true; hintDir = null;
    $('#marks').innerHTML = '';
    const ball = $('#ball');
    ball.classList.add('rolling');
    Sound.play('kick'); haptic('tap');
    $('#pass-moves').textContent = moves;
    // делим путь на прямые отрезки (повороты на отбойниках) и катим мяч по ним
    const pts = r.path.slice();
    const legs = [];
    let prev = history[history.length - 1][0];
    let seg = [];
    pts.forEach((i) => {
      seg.push(i);
      if (lv.cells[i] === DL || lv.cells[i] === DR) { legs.push(seg); seg = []; }
    });
    if (seg.length) legs.push(seg);
    const total = legs.reduce((t, l) => t + 60 + l.length * 70, 0);
    let t = 0;
    legs.forEach((l, k) => {
      const ms = 60 + l.length * 70;
      later(() => {
        const last = l[l.length - 1];
        if (k === legs.length - 1 && r.goal) placeBall(-1, ms);
        else placeBall(last, ms);
        if (lv.cells[last] === MATE) { Sound.play('coin'); }
      }, t);
      t += ms;
    });
    if (!legs.length && r.goal) placeBall(-1, 130);
    later(() => {
      ball.classList.remove('rolling');
      busy = false;
      if (gained) haptic('ok');
      if (r.goal) win();
      else update();
    }, Math.max(total, 130) + 20);
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
    const msg = st === 3 ? 'Идеальная атака!' : 'Можно забить быстрее — попробуй найти путь короче.';
    later(() => {
      Modal.open(
        resultHtml({ ico: 'pass', c1: '#2e9a4c', c2: '#1b1340', win: st === 3, title: isFinal(n) ? 'Финал взят!' : 'Гол!',
          extra: `<div class="stars">${starsHtml}</div>${quoteHtml(st === 3 ? 'win' : 'lose')}`, text: `Ударов: <b>${moves}</b>. ${msg}`, reward }),
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
    [pos, mask] = history.pop();
    moves--;
    hintDir = null;
    placeBall(pos, 150);
    update();
  }

  function hint() {
    if (busy || done) return;
    const sol = solve(lv, pos, mask);
    if (!sol) { toast('Отсюда не забить. Нажми «Заново».'); return; }
    if (!hinted && !Coins.spend(HINT_COST)) return;
    hinted = true; // на этом уровне дальше подсказки бесплатные
    hintDir = sol[0];
    drawMarks();
    $('#pass-tip').textContent = 'Подсказка: бей по мигающей точке.';
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
