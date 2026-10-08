// Перетаскивание пальцем: зажал карточку → тянешь → отпускаешь на другое место.
// Обычное нажатие продолжает работать как раньше (выбор/замена тапом).
const Drag = (() => {
  let swallow = false;
  // клик после перетаскивания не должен открывать выбор игрока
  document.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);

  // root — контейнер, sel — селектор перетаскиваемых элементов, ok(el) — можно ли тянуть, drop(from, to) — что сделать
  function swap(root, sel, { ok = () => true, drop }) {
    let st = null;
    const clear = () => {
      if (!st) return;
      clearTimeout(st.t);
      if (st.el) { st.el.classList.remove('dg-src'); st.el.style.translate = ''; if (st.el.parentElement) st.el.parentElement.classList.remove('dg-par'); }
      if (st.over) st.over.classList.remove('dg-over');
      document.body.classList.remove('dg-on');
      st = null;
    };
    const begin = () => {
      // тянем саму карточку (через translate — не ломает её собственный transform и стили)
      st.on = true; st.el.classList.add('dg-src'); if (st.el.parentElement !== root) st.el.parentElement.classList.add('dg-par'); document.body.classList.add('dg-on');
      if (typeof haptic === 'function') haptic('pop');
    };
    const move = (x, y) => {
      st.el.style.translate = `${x - st.x}px ${y - st.y}px`;
      const t = document.elementFromPoint(x, y), to = t && t.closest(sel);
      const over = to && to !== st.el && root.contains(to) ? to : null;
      if (over !== st.over) { if (st.over) st.over.classList.remove('dg-over'); if (over) over.classList.add('dg-over'); st.over = over; }
    };
    root.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const el = e.target.closest(sel); if (!el || !root.contains(el) || !ok(el)) return;
      clear();
      st = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
      st.t = setTimeout(() => { if (st && !st.on) begin(); }, 180);
    });
    window.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.on) {
        // мышью — начинаем сразу при сдвиге; пальцем — только после короткого удержания (иначе это прокрутка)
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { if (e.pointerType === 'mouse') begin(); else return clear(); } else return;
      }
      move(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.on) { swallow = true; setTimeout(() => { swallow = false; }, 400); const a = st.el, b = st.over; clear(); if (b) drop(a, b); return; }
      clear();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', (e) => { if (st && e.pointerId === st.id) clear(); });
    // пока тянем — страница не прокручивается
    document.addEventListener('touchmove', (e) => { if (st && st.on) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', (e) => { if (e.target.closest(sel)) e.preventDefault(); });
    root.addEventListener('dragstart', (e) => { if (e.target.closest(sel)) e.preventDefault(); });
  }

  // ползунок: тянешь по полосе — значение меняется по положению пальца
  function slider(root, sel, n, set) {
    let on = null;
    const val = (bar, x) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n))); };
    root.addEventListener('pointerdown', (e) => {
      const bar = e.target.closest(sel); if (!bar) return;
      on = { bar, id: e.pointerId }; e.preventDefault();
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* старые браузеры */ }
      set(val(bar, e.clientX));
    });
    root.addEventListener('pointermove', (e) => { if (on && e.pointerId === on.id) set(val(on.bar, e.clientX)); });
    const end = (e) => { if (on && e.pointerId === on.id) { on = null; swallow = true; setTimeout(() => { swallow = false; }, 300); } };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  }
  return { swap, slider };
})();
