// Движение и объём нового вида (29.10): наклон плиток за пальцем с бликом, плавное появление раздела с глубиной,
// бегущая подсветка в нижнем меню, вспышка частиц на «Забрать», лёгкий параллакс главной. Только transform и opacity —
// без перерисовки фона; при «уменьшить движение» в системе всё выключено.
'use strict';

const FX = (() => {
  const calm = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ---- наклон за пальцем ----
  const TILT = '.fm-feat, .fm-club, .fm-playt, .fm-lt, .fm-pk, .fm-q, .mk-lot, .fm-ps-c, .fm-mode, .fm-gc, .fm-of, .fm-st-hero, .fm-daypk, .fm-qpass, .fx-card';
  let cur = null, raf = 0, last = null;
  function sheen(el) {
    if (el.querySelector(':scope > .fx-sheen')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const s = document.createElement('i'); s.className = 'fx-sheen'; el.appendChild(s);
  }
  function apply() {
    raf = 0; if (!cur || !last) return;
    const r = cur.getBoundingClientRect(), x = Math.min(1, Math.max(0, (last.x - r.left) / r.width)), y = Math.min(1, Math.max(0, (last.y - r.top) / r.height));
    const big = r.width * r.height > 60000 ? 0.5 : 1; // большие плитки качаются мягче
    cur.style.setProperty('--rx', `${((0.5 - y) * 12 * big).toFixed(2)}deg`);
    cur.style.setProperty('--ry', `${((x - 0.5) * 16 * big).toFixed(2)}deg`);
    cur.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); cur.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }
  function enter(el) { if (cur === el) return; leave(); cur = el; sheen(el); el.classList.add('fx-tilt'); }
  function leave() { if (!cur) return; const el = cur; cur = null; el.classList.remove('fx-tilt'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); }
  function move(e) {
    if (calm() || !document.body.classList.contains('fcm-on')) return;
    const el = e.target.closest && e.target.closest(TILT);
    if (!el) return leave();
    enter(el); last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  }
  // ---- вспышка частиц ----
  const COL = ['#c6ff3d', '#ffd23c', '#ffffff', '#7fe0a0', '#56d4ff'];
  function burst(x, y, n = 18, big = false) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.className = 'fx-bit' + (i % 4 === 0 ? ' coin' : '');
      if (!p.classList.contains('coin')) p.style.background = COL[i % COL.length];
      p.style.left = x + 'px'; p.style.top = y + 'px'; document.body.appendChild(p);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5, d = (big ? 120 : 70) + Math.random() * (big ? 90 : 50);
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 30, rot = (Math.random() - 0.5) * 720;
      p.animate([
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 70}px)) rotate(${rot}deg) scale(.6)`, opacity: 0 },
      ], { duration: 700 + Math.random() * 350, easing: 'cubic-bezier(.15,.7,.3,1)' }).onfinish = () => p.remove();
    }
    const ring = document.createElement('i'); ring.className = 'fx-ring'; ring.style.left = x + 'px'; ring.style.top = y + 'px'; document.body.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => ring.remove();
  }
  const CLAIM = '[data-fm-claim], [data-fm-ps], [data-fm-road], [data-fm-buyc], [data-ms-go], [data-mk-buy], .fm-btn.gold, .ob-go';
  function claim(e) {
    const b = e.target.closest && e.target.closest(CLAIM); if (!b || b.disabled) return;
    burst(e.clientX || 0, e.clientY || 0, b.matches('[data-fm-claim], [data-fm-ps], [data-fm-road]') ? 22 : 12, b.matches('[data-fm-ps], [data-fm-road]'));
  }
  // ---- появление раздела и подсветка меню ----
  const STAG = '.fm-lt, .fm-sl.on, .fm-feat, .fm-club, .fm-playt, .fm-q, .fm-qh, .fm-qpass, .fm-pk, .fm-mode, .fm-rail > button, .mk-lot, .mk-flt, .fm-ps-col, .fm-of, .fm-gc, .fm-node, .fx-card, .bd-row, .sr-b, .fm-st-hero, .fm-daypk, .fm-coll .fm-cl, .fm-cg > *, .fm-tside, .fm-ev-head, .fm-evtabs';
  let view = '', navAt = -1;
  function onRender(root) {
    const v = root.dataset.view || '';
    const main = root.querySelector('.fm-main');
    if (main && v !== view && !calm()) {
      const els = main.querySelectorAll(STAG); let i = 0;
      els.forEach((el) => { if (i < 28) { el.style.setProperty('--fi', i++); el.classList.add('fx-in'); } });
      main.classList.add('fx-enter'); setTimeout(() => { main.classList.remove('fx-enter'); els.forEach((el) => el.classList.remove('fx-in')); }, 1100);
    }
    view = v;
    // бегущая лаймовая полоска под вкладкой: едет от прежней вкладки к новой
    const nav = root.querySelector('.fm-nav'), tabs = nav ? [...nav.querySelectorAll('.fm-tab')] : [], k = tabs.findIndex((t) => t.classList.contains('on'));
    if (nav && k >= 0) {
      const bar = document.createElement('i'); bar.className = 'fx-navi'; nav.appendChild(bar); nav.classList.add('fx-nav');
      const to = tabs[k], from = tabs[navAt] || to;
      const place = (t) => `translateX(${t.offsetLeft}px) scaleX(${t.offsetWidth / 100})`;
      bar.style.transform = place(to);
      if (from !== to && !calm()) bar.animate([{ transform: place(from) }, { transform: place(to) }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.4,1)' });
      navAt = k;
    }
  }
  // ---- параллакс главной: карточка события и паки чуть смещаются за пальцем (глубина) ----
  let px = 0, py = 0, pr = 0;
  function para(e) {
    if (calm() || !document.body.classList.contains('fcm-on')) return;
    px = (e.clientX / innerWidth - 0.5); py = (e.clientY / innerHeight - 0.5);
    if (!pr) pr = requestAnimationFrame(() => { pr = 0; const st = document.documentElement.style; st.setProperty('--px', px.toFixed(3)); st.setProperty('--py', py.toFixed(3)); });
  }
  // ---- безопасная зона и автоподгонка окон под экран телефона ----
  // зона без кнопок Telegram сверху, выреза камеры по бокам и полоски «домой» снизу (переменные --fm-t/l/r/b из css/fcm.css)
  function safe() {
    const p = document.createElement('i');
    p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:var(--fm-t,6px);left:var(--fm-l,10px);right:var(--fm-r,10px);bottom:var(--fm-b,0px)';
    document.body.appendChild(p); const r = p.getBoundingClientRect(); p.remove();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  // окно больше экрана — уменьшаем его целиком (не обрезаем и не заставляем листать)
  const FIT = '.ob-intro, .ob-card, .ob-quiz, .ob-nat, .ob-pack, .fm-sh-card, .mk-sh, .fm-prf, .fm-cv, .fm-task, #modal-card';
  let fitQ = 0;
  function fitAll() {
    fitQ = 0; const B = safe(), W = B.r - B.l - 8, H = B.b - B.t - 8; if (W < 50 || H < 50) return;
    document.querySelectorAll(FIT).forEach((el) => {
      if (!el.isConnected || el.closest('[hidden]')) return;
      el.style.zoom = '';
      const w = Math.max(el.scrollWidth, el.offsetWidth), h = Math.max(el.scrollHeight, el.offsetHeight); if (!w || !h) return;
      const k = Math.max(0.62, Math.min(1, W / w, H / h));
      if (k < 0.985) el.style.zoom = k.toFixed(3);
    });
  }
  const fitSoon = () => { if (!fitQ) fitQ = requestAnimationFrame(() => requestAnimationFrame(fitAll)); };
  function init() {
    new MutationObserver(fitSoon).observe(document.body, { childList: true, subtree: true });
    addEventListener('resize', fitSoon);
    try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.onEvent) ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'].forEach((ev) => Telegram.WebApp.onEvent(ev, fitSoon)); } catch (e) { /* не в Telegram */ }
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', (e) => { move(e); para(e); }, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') setTimeout(leave, 120); }, { passive: true });
    document.addEventListener('pointercancel', leave);
    document.addEventListener('pointermove', para, { passive: true });
    document.addEventListener('click', claim, true);
    const watch = () => { const root = document.getElementById('fcm'); if (!root) return setTimeout(watch, 300); onRender(root); new MutationObserver(() => onRender(root)).observe(root, { childList: true }); };
    watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { burst, safe, fit: fitAll };
})();
