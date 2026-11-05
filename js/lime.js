// Лаймовые очки прокачки (5.11): +1 к рейтингу своей карточки за очки и монеты. Цена шага растёт с рейтингом (LimeCost в
// js/economy.js): бронзу растить дёшево, 80+ — очень дорого. Потолок — 99. Прокачанную карточку нельзя выставить на рынок.
// На превью очки и прокачку хранит сервер (/eco: lime, upgrade); без сервера — на телефоне (Store.d.lime).
'use strict';

const Lime = (() => {
  const S = () => { const d = Store.d; if (!d.lime || typeof d.lime !== 'object') d.lime = { n: 0, up: {}, day: '', got: 0 }; if (!d.lime.up) d.lime.up = {}; return d.lime; };
  const srv = () => typeof Eco !== 'undefined' && Eco.on();
  const up = (key) => Math.max(0, Math.floor(S().up[key] || 0));
  const r = (c) => (c ? Math.min(ECON.lime.max, c.r + up(c.key)) : 0);
  const cost = (rr) => LimeCost(rr);
  const n = () => S().n || 0;
  const ico = (cls = '') => `<i class="lime ${cls}"></i>`;
  const F = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render() { document.querySelectorAll('.lime-count').forEach((el) => { el.textContent = F(n()); }); }
  function apply(st) {
    if (!st) return;
    if (typeof st.lime === 'number') S().n = st.lime;
    if (Array.isArray(st.up)) S().up = Object.fromEntries(st.up.map(([k, v]) => [k, v]));
    Store.save(true); render();
  }
  const day = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  // начислить очки (мяч-дроп, злой мяч и т. п.): потолок в день — как на сервере
  async function add(v, src = 'drop') {
    v = Math.max(0, Math.floor(v)); if (!v) return 0;
    const s = S(), cs = ECON.lime.capSrc || {}; if (!cs[src]) src = 'drop';
    if (s.day !== day() || typeof s.got !== 'object') { s.day = day(); s.got = {}; }
    const got = Math.min(v, (cs[src] || ECON.lime.cap) - (s.got[src] || 0)); if (got <= 0) return 0;
    s.got[src] = (s.got[src] || 0) + got; s.n = n() + got; Store.save(); render();
    if (srv()) { const res = await Eco.post('lime', { n: got, src, op: Eco.opid() }); if (res && typeof res.lime === 'number') apply(res); }
    return got;
  }
  // один шаг прокачки; true — получилось
  async function upgrade(key) {
    const c = Cards.get(key); if (!c || !(Cards.owned ? Cards.owned(key) : 1)) return { ok: false, error: 'Карточки нет в клубе' };
    const rr = r(c); if (rr >= ECON.lime.max) return { ok: false, error: 'Уже максимум — 99' };
    const k = cost(rr);
    if (n() < k.pts) return { ok: false, error: `Не хватает лаймовых очков: нужно ${F(k.pts)}` };
    if ((Store.d.coins || 0) < k.coins) return { ok: false, error: `Не хватает монет: нужно ${F(k.coins)}` };
    if (srv()) {
      const res = await Eco.post('upgrade', { key, op: Eco.opid() });
      if (res && (typeof res.coins === 'number')) { Store.d.coins = res.coins; try { Coins.render(); } catch (e) { /* нет экрана */ } }
      apply(res);
      return res && res.ok ? { ok: true, r: res.r } : { ok: false, error: res && res.error === 'not enough' ? 'Не хватает очков или монет' : 'Не получилось, попробуй ещё раз' };
    }
    // без сервера: монеты через Coins (без умножения экономики превью), очки и уровень — на телефоне
    Store.d.coins -= k.coins; S().n -= k.pts; S().up[key] = up(key) + 1; Store.save(); render(); try { Coins.render(); } catch (e) { /* нет экрана */ }
    return { ok: true, r: rr + 1 };
  }

  // ---------- окно прокачки: карточка в 3D на подиуме, лаймовые искры летят в карточку, рейтинг перещёлкивается ----------
  let el = null, busy = false;
  function open(key) {
    close(true);
    el = document.createElement('div'); el.className = 'lm-sheet';
    document.body.appendChild(el); draw(key);
    requestAnimationFrame(() => el && el.classList.add('in'));
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.lm-x')) { Sound.play('tap'); return close(); }
      if (e.target.closest('[data-lm-up]')) go(key);
    });
    el.addEventListener('pointermove', (e) => { const cd = el && el.querySelector('.lm-card'); if (!cd || busy) return; const b = cd.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
      cd.style.setProperty('--rx', `${(-y * 16).toFixed(1)}deg`); cd.style.setProperty('--ry', `${(x * 22).toFixed(1)}deg`); });
  }
  function close(now) { if (!el) return; const e = el; el = null; if (now) return e.remove(); e.classList.remove('in'); setTimeout(() => e.remove(), 250); }
  function draw(key) {
    if (!el) return;
    const c = Cards.get(key); if (!c) return close(true);
    const rr = r(c), u = up(key), max = rr >= ECON.lime.max, k = max ? null : cost(rr);
    const okP = k && n() >= k.pts, okC = k && (Store.d.coins || 0) >= k.coins;
    const big = Math.min(200, Math.floor((innerHeight - 110) / 1.45));
    const next = [1, 2, 3].map((i) => rr + i + 1 <= ECON.lime.max ? `<span><b>${rr + i}→${rr + i + 1}</b>${ico()}${F(cost(rr + i).pts)}</span>` : '').join('');
    el.innerHTML = `<div class="lm">
      <div class="lm-stage"><i class="lm-rays"></i><i class="lm-ring"></i><i class="lm-ring r2"></i><div class="lm-card">${Cards.html(c, { w: big })}</div><i class="lm-floor"></i></div>
      <div class="lm-info">
        <small>Прокачка карточки</small><b>${esc(c.name)}</b>
        <div class="lm-r"><span class="lm-big">${rr}</span>${max ? '<em>максимум</em>' : `<i>→</i><span class="lm-big nx">${rr + 1}</span>`}${u ? `<u>+${u} прокачано</u>` : ''}</div>
        ${max ? '<p class="lm-note">Карточка прокачана до предела.</p>' : `<div class="lm-cost"><span class="${okP ? '' : 'no'}">${ico('big')}<b>${F(k.pts)}</b><small>у тебя ${F(n())}</small></span><span class="${okC ? '' : 'no'}"><i class="coin"></i><b>${F(k.coins)}</b><small>у тебя ${F(Store.d.coins || 0)}</small></span></div>
        <button class="fm-btn lm-go" data-lm-up ${okP && okC ? '' : 'disabled'}>${okP && okC ? 'Прокачать +1' : okP ? 'Не хватает монет' : 'Не хватает лаймовых очков'}</button>
        <div class="lm-next"><small>Дальше дороже</small>${next}</div>`}
        <p class="lm-note">Каждый уровень +1 к рейтингу и характеристикам. Прокачанную карточку нельзя продать на рынке. Лаймовые очки — из мяч-дропов.</p>
      </div><button class="lm-x" aria-label="Закрыть">✕</button></div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
  }
  async function go(key) {
    if (busy || !el) return; busy = true;
    const btn = el.querySelector('[data-lm-up]'), card = el.querySelector('.lm-card'), stage = el.querySelector('.lm-stage');
    btn.disabled = true; Sound.play('tap'); haptic('tap');
    const res = upgrade(key);
    // искры летят от кнопки в карточку
    if (!reduce()) {
      const a = btn.getBoundingClientRect(), b = card.getBoundingClientRect();
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('i'); s.className = 'lime lm-fly'; document.body.appendChild(s);
        const x0 = a.left + a.width * (0.2 + Math.random() * 0.6), y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height * 0.4;
        const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 160, my = Math.min(y0, y1) - 40 - Math.random() * 80;
        s.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 }, { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.5 }, { transform: `translate(${x1}px, ${y1}px) scale(.3)`, opacity: 0.2 }],
          { duration: 620 + i * 25, delay: i * 30, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).onfinish = () => s.remove();
      }
      stage.classList.add('charge');
    }
    await new Promise((ok) => setTimeout(ok, reduce() ? 0 : 900));
    const out = await res;
    if (!el) { busy = false; return; }
    stage.classList.remove('charge');
    if (!out.ok) { busy = false; toast(out.error); draw(key); return; }
    Sound.play('goal'); haptic('ok');
    draw(key);
    const st = el.querySelector('.lm-stage'), cd = el.querySelector('.lm-card');
    st.classList.add('boom'); cd.classList.add('spin');
    if (typeof FX !== 'undefined') { const b = cd.getBoundingClientRect(); FX.burst(b.left + b.width / 2, b.top + b.height * 0.4, 24, true); }
    const big = el.querySelector('.lm-big'); if (big) big.classList.add('pop');
    setTimeout(() => { busy = false; if (el) { el.querySelector('.lm-stage').classList.remove('boom'); const c2 = el.querySelector('.lm-card'); if (c2) c2.classList.remove('spin'); } }, 1100);
  }
  return { n, up, r, cost, add, upgrade, apply, open, render, ico };
})();
