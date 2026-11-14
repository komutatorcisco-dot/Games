// Плашки «матовое стекло» (14.11): всплывают сбоку, держатся 2–3 с, уезжают обратно; несколько — встают друг под другом.
// showPlate({ variant, caption, counter, title, image, tint, fonts, duration, side, cover, artist, analyser }) → { el, close }
//   variant: 'info' (по умолчанию) | 'light' | 'track'
//   caption — мелкая серая подпись сверху, counter — белый счётчик рядом («1/3»), title — крупный заголовок (всё КАПСОМ)
//   image — вырезанный PNG/WebP без фона справа (у мячей-паков пустой верх обрезается сам)
//   tint — 'blue' | 'purple' | 'red' | 'green' | 'lime' | 'gold' или «r,g,b» — цветной отлив слева
//   fonts — 'inter' (по умолчанию) | 'montserrat' | 'sport'
//   duration — мс показа (по умолчанию 2600; 0 — до close()); side — 'left' (по умолчанию) | 'right'
//   track: cover — обложка слева, title — название, artist — исполнитель, analyser — AnalyserNode Web Audio (иначе живая имитация)
// Ограничения: одновременно не больше 3 размытых плашек (остальные ждут), анимируются только transform и opacity.
'use strict';

const Plate = (() => {
  const TINT = { blue: '40,70,170', purple: '120,50,190', red: '170,50,30', green: '40,230,110', lime: '150,230,40', gold: '210,160,30' };
  const MAX = 3;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let box = { left: null, right: null }; const queue = []; let live = 0;

  // безопасные отступы Telegram (кнопки сверху, вырез, «домой» снизу) + env(safe-area-inset-*)
  function insets() {
    let t = 0, l = 0, r = 0;
    try {
      const W = window.Telegram && Telegram.WebApp, a = (W && W.safeAreaInset) || {}, c = (W && W.contentSafeAreaInset) || {};
      t = (+a.top || 0) + (+c.top || 0); l = (+a.left || 0) + (+c.left || 0); r = (+a.right || 0) + (+c.right || 0);
    } catch (e) { /* не в Telegram */ }
    const st = document.documentElement.style;
    st.setProperty('--pl-tg-t', t + 'px'); st.setProperty('--pl-tg-l', l + 'px'); st.setProperty('--pl-tg-r', r + 'px');
  }
  function host(side) {
    if (box[side] && box[side].isConnected) return box[side];
    insets();
    try { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.onEvent) ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged'].forEach((e) => Telegram.WebApp.onEvent(e, insets)); } catch (e) { /* старый Telegram */ }
    const el = document.createElement('div'); el.className = `pl-stack ${side}`; el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el); box[side] = el; return el;
  }
  const rgb = (t) => TINT[t] || (/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(String(t || '')) ? String(t).replace(/\s/g, '') : TINT.blue);

  function build(o) {
    const v = ['info', 'light', 'track'].includes(o.variant) ? o.variant : 'info';
    const el = document.createElement('div');
    el.className = `pl pl-${v} pl-f-${['inter', 'montserrat', 'sport'].includes(o.fonts) ? o.fonts : 'inter'} ${o.side === 'right' ? 'from-r' : ''}`;
    el.style.setProperty('--pl-tint', rgb(o.tint || (v === 'track' ? 'green' : 'blue')));
    if (o.accent) el.style.setProperty('--pl-acc', o.accent);
    el.setAttribute('role', 'status');
    if (v === 'track') {
      el.innerHTML = `${o.cover ? `<img class="pl-cover" src="${esc(o.cover)}" alt="">` : '<i class="pl-cover"></i>'}
        <span class="pl-t"><b>${esc(o.title)}</b><small>${esc(o.artist || o.caption || '')}</small></span><canvas class="pl-eq" aria-hidden="true"></canvas>`;
    } else {
      const ball = o.image && /\/packs\//.test(o.image);
      el.innerHTML = `<span class="pl-t"><small>${esc(o.caption || '')}${o.counter ? ` <em>${esc(o.counter)}</em>` : ''}</small><b>${esc(o.title)}</b></span>${o.image ? `<img class="pl-img ${ball ? 'pl-ball' : ''}" src="${esc(o.image)}" alt="">` : ''}`;
      if (!o.image) el.classList.add('noimg');
    }
    return el;
  }

  // эквалайзер: ~120 тонких столбиков по нижнему краю, с AnalyserNode — от звука, без — низкий фон и бегущие пики
  function eq(el, analyser) {
    const cv = el.querySelector('.pl-eq'); if (!cv) return () => {};
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0, t0 = performance.now(), data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const col = getComputedStyle(el).getPropertyValue('--pl-acc').trim() || '#28E66E';
    const peaks = Array.from({ length: 4 }, () => ({ x: Math.random(), w: 0.03 + Math.random() * 0.05, sp: (Math.random() - 0.5) * 0.08, ph: Math.random() * 6 }));
    function frame(now) {
      if (!el.isConnected) return;
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) { raf = requestAnimationFrame(frame); return; }
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const N = Math.max(60, Math.min(150, Math.round(w / 3))), gap = 1, bw = Math.max(1, (w - gap * (N - 1)) / N), t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = col;
      if (data) analyser.getByteFrequencyData(data);
      for (let i = 0; i < N; i++) {
        const x = i / N; let a;
        if (data) { const k = Math.floor(Math.pow(x, 1.6) * data.length * 0.7); a = data[k] / 255; }
        else { a = 0.1 + 0.07 * Math.sin(i * 0.9 + t * 7) * Math.sin(i * 0.37 - t * 3);
          peaks.forEach((p) => { const px = (p.x + p.sp * t + 1) % 1, d = Math.abs(x - px); if (d < p.w) a += (1 - d / p.w) * (0.45 + 0.35 * Math.sin(t * 4 + p.ph)); }); }
        const bh = Math.max(1.5, Math.min(1, a) * h);
        ctx.fillRect(i * (bw + gap), h - bh, bw, bh);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  function show(o = {}) {
    const side = o.side === 'right' ? 'right' : 'left';
    if (live >= MAX) { // не больше 3 размытых плашек сразу: эта ждёт своей очереди
      const h = { el: null, close: () => { h.cancelled = true; if (h.real) h.real.close(); } };
      queue.push(() => { if (h.cancelled) { const next = queue.shift(); if (next) next(); return; } h.real = show(o); h.el = h.real.el; });
      return h;
    }
    live++;
    const el = build(o), stack = host(side); stack.appendChild(el);
    const stop = o.variant === 'track' ? eq(el, o.analyser) : () => {};
    let done = false, timer = 0;
    const close = () => {
      if (done) return; done = true; clearTimeout(timer); el.classList.remove('in'); el.classList.add('out');
      setTimeout(() => { stop(); el.remove(); live--; const next = queue.shift(); if (next) next(); }, reduce() ? 0 : 210);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    const dur = o.duration === undefined ? 2600 : o.duration;
    if (dur > 0) timer = setTimeout(close, dur + 250);
    el.addEventListener('click', () => { if (o.onClick) o.onClick(); close(); });
    return { el, close };
  }
  // статичная плашка без въезда (демо, витрины): сразу видна, эквалайзер живой
  function render(o = {}) { const el = build(o); el.classList.add('in', 'static'); if (o.variant === 'track') eq(el, o.analyser); return el; }
  return { show, render, TINT };
})();
function showPlate(o) { return Plate.show(o); }
