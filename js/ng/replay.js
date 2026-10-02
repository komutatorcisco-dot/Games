// «Повтор гола»: на поле по данным StatsBomb проигрывается вся атака — пасы, проходы, удар.
// Угадай автора гола из четырёх. Подсказки от трудной к лёгкой: турнир → матч → минута и как забит.
'use strict';

(() => {
  const ROUNDS = 5;
  const SPEED = { P: 650, C: 750, D: 450, S: 520 };

  const pitch = () => `
    <rect x="-2" y="-2" width="124" height="84" fill="#1f7a3a"/>
    ${[...Array(6).keys()].map((i) => `<rect x="${i * 20}" y="0" width="10" height="80" fill="rgba(255,255,255,.04)"/>`).join('')}
    <g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".5">
      <rect x="0" y="0" width="120" height="80"/><line x1="60" y1="0" x2="60" y2="80"/><circle cx="60" cy="40" r="10"/>
      <rect x="0" y="18" width="18" height="44"/><rect x="0" y="30" width="6" height="20"/>
      <rect x="102" y="18" width="18" height="44"/><rect x="114" y="30" width="6" height="20"/>
      <path d="M18 32 A10 10 0 0 1 18 48"/><path d="M102 32 A10 10 0 0 0 102 48"/>
    </g>
    <rect x="120" y="36" width="2.2" height="8" fill="rgba(255,255,255,.85)"/><rect x="-2.2" y="36" width="2.2" height="8" fill="rgba(255,255,255,.5)"/>`;

  function makeRound(used) {
    let i, g;
    do { i = Math.floor(Math.random() * GOALS.length); g = GOALS[i]; } while (used.has(i));
    used.add(i);
    const ans = GOAL_SCORERS[g[9]];
    // обманки: авторы голов того же турнира и сезона, потом того же турнира, потом любые
    const pool = (f) => [...new Set(GOALS.filter(f).map((x) => GOAL_SCORERS[x[9]]))].filter((n) => n !== ans);
    let opts = shuffle(pool((x) => x[0] === g[0] && x[1] === g[1]), Math.random).slice(0, 3);
    if (opts.length < 3) opts = opts.concat(shuffle(pool((x) => x[0] === g[0] && !opts.includes(GOAL_SCORERS[x[9]])), Math.random).slice(0, 3 - opts.length));
    if (opts.length < 3) opts = opts.concat(shuffle(GOAL_SCORERS.filter((n) => n !== ans && !opts.includes(n)), Math.random).slice(0, 3 - opts.length));
    return { g, ans, opts: shuffle([ans, ...opts], Math.random) };
  }

  NG.register({
    id: 'replay', group: 'hist', title: 'Повтор гола', c1: '#1f7a3a', c2: '#ffcf3a', tag: 'Угадай автора по атаке', wide: true,
    meta: (s) => (s.best ? `Рекорд ${s.best}/${ROUNDS * 3}` : `${GOALS.length} голов из истории`),
    start(api) {
      const used = new Set();
      let round = 0, total = 0, cur = null, hints = 0, answered = false, raf = 0, results = [];
      const b = api.body;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

      function hintLines() {
        const g = cur.g, team = g[7] ? g[4] : g[3];
        return [
          `🏆 ${g[0]} ${g[1]}${g[2] ? ', ' + g[2] : ''}`,
          `⚔️ ${g[3]} — ${g[4]} ${g[5]}:${g[6]} · забивает ${team}`,
          `⏱ ${g[8]}-я минута${g[10] ? ' · ' + g[10] : ''} · xG ${g[11]}`,
        ];
      }
      function render() {
        api.sub(`Раунд ${round}/${ROUNDS} · очки: ${total}`);
        const hl = hintLines();
        b.innerHTML = `<div class="rk-rounds">${[...Array(ROUNDS).keys()].map((i) => `<i class="${i < results.length ? 'done' : i === round - 1 ? 'now' : ''}">${i < results.length ? results[i] : i + 1}</i>`).join('')}<b>${total} очк.</b></div>
          <div class="rp-pitch"><svg viewBox="-3 -3 126 86" class="rp-svg">${pitch()}<g class="rp-lines"></g><g class="rp-dots"></g><circle class="rp-ball" r="1.4" cx="-10" cy="-10"/></svg>
            <div class="rp-goal" hidden>ГОЛ!</div><button class="rp-again" data-a="replay" aria-label="Повтор">↻</button></div>
          <div class="rp-hints">${hl.map((t, i) => `<span class="${i < hints || answered ? 'on' : ''}">${i < hints || answered ? esc(t) : `🔒 Подсказка ${i + 1}`}</span>`).join('')}</div>
          <h3 class="ng-q">Кто забил этот гол?</h3>
          <div class="ng-opts rp-opts">${cur.opts.map((o) => `<button class="btn ghost ng-opt ${answered ? (o === cur.ans ? 'right' : o === cur.pick ? 'wrong' : '') : ''}" data-o="${esc(o)}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
          <div class="ng-row">${answered ? '<button class="btn gold" data-a="next">Дальше →</button>'
            : `<button class="btn ghost" data-a="hint" ${hints >= 3 ? 'disabled' : ''}>💡 Подсказка (−1 очко)</button>`}</div>
          <p class="ng-lead rp-note">${answered ? '' : `Сейчас за ответ: <b>${3 - hints}</b> ${plural(3 - hints, 'очко', 'очка', 'очков')}`}</p>`;
      }

      // Анимация: линии действий рисуются по очереди, мяч летит по ним
      function play() {
        cancelAnimationFrame(raf);
        const svg = $('.rp-svg', b); if (!svg) return;
        const lines = $('.rp-lines', svg), dots = $('.rp-dots', svg), ball = $('.rp-ball', svg), goal = $('.rp-goal', b);
        lines.innerHTML = ''; dots.innerHTML = ''; goal.hidden = true;
        const a = cur.g[13], segs = [];
        let t = 0;
        for (let i = 0; i < a.length; i += 6) {
          const s = { k: a[i], x1: a[i + 1], y1: a[i + 2], x2: a[i + 3], y2: a[i + 4], me: a[i + 5], t0: t };
          s.dur = SPEED[s.k] || 600; t += s.dur + 90; segs.push(s);
        }
        const NS = 'http://www.w3.org/2000/svg';
        const add = (s) => {
          const ln = document.createElementNS(NS, 'line');
          ['x1', 'y1', 'x2', 'y2'].forEach((k) => ln.setAttribute(k, s[k]));
          ln.setAttribute('class', `rp-${s.k}`);
          const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
          ln.style.setProperty('--L', L); ln.style.animationDuration = s.dur + 'ms';
          lines.appendChild(ln);
          const d = document.createElementNS(NS, 'circle');
          d.setAttribute('cx', s.x1); d.setAttribute('cy', s.y1); d.setAttribute('r', s.k === 'S' ? 2.4 : 1.9);
          d.setAttribute('class', s.k === 'S' ? 'rp-dot rp-shooter' : 'rp-dot');
          dots.appendChild(d);
        };
        if (reduce) { segs.forEach(add); ball.setAttribute('cx', segs[segs.length - 1].x2); ball.setAttribute('cy', segs[segs.length - 1].y2); goal.hidden = false; return; }
        let k = -1;
        const start = performance.now();
        const tick = (now) => {
          if (!svg.isConnected) return;
          const el = now - start;
          while (k + 1 < segs.length && el >= segs[k + 1].t0) { k++; add(segs[k]); if (segs[k].k === 'S') Sound.play('kick'); }
          const s = segs[Math.max(k, 0)], p = Math.min(1, Math.max(0, (el - s.t0) / s.dur)), e = 1 - (1 - p) * (1 - p);
          ball.setAttribute('cx', s.x1 + (s.x2 - s.x1) * e); ball.setAttribute('cy', s.y1 + (s.y2 - s.y1) * e);
          if (k === segs.length - 1 && p >= 1) { goal.hidden = false; return; }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }

      function next() {
        if (round >= ROUNDS) return finish();
        cur = makeRound(used); hints = 0; answered = false; round++;
        render(); play();
      }
      function answer(o) {
        if (answered) return;
        answered = true; cur.pick = o;
        const ok = o === cur.ans, pts = ok ? 3 - hints : 0;
        total += pts; results.push(pts);
        Sound.play(ok ? 'goal' : 'bad'); haptic(ok ? 'ok' : 'bad');
        toast(ok ? `Верно! +${pts}` : `Это ${cur.ans}`);
        render(); play();
      }
      function finish() {
        cancelAnimationFrame(raf);
        const s = api.st(), max = ROUNDS * 3;
        s.best = Math.max(s.best || 0, total); api.save();
        if (total >= 10) Profile.bump('replay', 12);
        NG.end({ title: total >= 12 ? 'Видишь футбол насквозь!' : total >= 7 ? 'Хорошее чутьё' : 'Пересмотри хайлайты', big: `${total}/${max}`,
          stats: [['Раунды', results.join(' · ')], ['Рекорд', s.best]], win: total >= 10, reward: total * 2,
          again: { label: 'Ещё 5 голов', fn: () => NG.open('replay') } });
      }
      b.addEventListener('click', (e) => {
        const o = e.target.closest('[data-o]');
        if (o && !answered) return answer(o.dataset.o);
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'replay') play();
        if (a.dataset.a === 'hint' && hints < 3) { hints++; Sound.play('tap'); render(); play(); }
        if (a.dataset.a === 'next') next();
      });
      next();
      return () => cancelAnimationFrame(raf);
    },
  });
})();
