// Колесо удачи: раз в день крутишь и забираешь монеты.
'use strict';

const Wheel = (() => {
  const PRIZES = [10, 50, 20, 100, 15, 30, 250, 25];
  const WEIGHTS = [18, 10, 16, 5, 18, 12, 2, 14];
  const COLORS = ['#8fd8c4', '#c65bd8', '#5b8cff', '#ffcf3a', '#8fd8c4', '#c65bd8', '#e2384d', '#5b8cff'];
  const today = () => new Date().toISOString().slice(0, 10);
  const ready = () => Store.d.lastWheel !== today();

  function svg() {
    const n = PRIZES.length, R = 100;
    let out = '';
    PRIZES.forEach((p, i) => {
      const a0 = ((i - 0.5) / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
      const pt = (a) => `${(R * Math.cos(a)).toFixed(2)} ${(R * Math.sin(a)).toFixed(2)}`;
      const mid = (i / n) * 360;
      out += `<path d="M0 0 L${pt(a0)} A${R} ${R} 0 0 1 ${pt(a1)} Z" fill="${COLORS[i]}" stroke="#1b1240" stroke-width="2"/>
        <text transform="rotate(${mid}) translate(0 -66)" text-anchor="middle" dominant-baseline="middle">${p}</text>`;
    });
    return `<svg viewBox="-104 -104 208 208" class="wheel-svg" id="wheel-svg">${out}<circle r="16" fill="#1b1240" stroke="#ffcf3a" stroke-width="4"/></svg>`;
  }

  function open() {
    if (!ready()) { toast('Колесо уже крутили сегодня. Приходи завтра!'); return; }
    Modal.open(`<h2>Колесо удачи</h2><p>Раз в день. Джекпот — 250 монет.</p>
      <div class="wheel"><i class="wheel-pin"></i>${svg()}</div>`, [
      { label: 'Крутить!', keepOpen: true, onClick: spin },
    ]);
  }

  function spin() {
    if (!ready()) return;
    Store.d.lastWheel = today();
    Store.save();
    const btn = $('#modal-card .btns button');
    if (btn) btn.disabled = true;
    let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= WEIGHTS[i]) > 0) i++;
    const deg = 360 * 6 - (i / PRIZES.length) * 360 + (Math.random() - 0.5) * 30;
    const el = $('#wheel-svg');
    el.style.transform = `rotate(${deg}deg)`;
    // щелчки по секторам, пока колесо крутится
    let ticks = 0;
    const tick = () => { if (ticks++ < 26) { Sound.play('tap'); haptic('tap'); setTimeout(tick, 40 + ticks * ticks * 0.9); } };
    tick();
    setTimeout(() => {
      const prize = PRIZES[i];
      Coins.last = { x: innerWidth / 2, y: innerHeight / 2 };
      Modal.open(`<h2>+${prize} монет!</h2><p>${prize >= 100 ? 'Вот это занос! Данил в шоке.' : 'Неплохо. Завтра крутим снова.'}</p>`,
        [{ label: 'Забрать', onClick: () => { Coins.add(prize); App.home(); } }]);
      if (prize >= 100) confetti();
      Sound.play('goal');
    }, 4300);
  }

  return { open, ready };
})();
