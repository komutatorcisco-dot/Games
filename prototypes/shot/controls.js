// Кнопки с жестами: нажал, удерживаешь, оттянул палец. Работает несколькими пальцами одновременно (джойстик + кнопки).
// • Палец захватывается кнопкой: можно увести его за её край, кнопка не отпустится.
// • Жест фиксируется один раз, когда палец ушёл дальше порога в ясном направлении (вверх, вниз, влево, вправо);
//   в диагональной «мёртвой зоне» и при дрожании пальца тип действия не меняется.
// • «Быстрый» жест (раньше flick секунд после касания) — отдельный признак: им включаются финты.
// • Отпускание, отмена касания системой и потеря фокуса окна всегда заканчивают нажатие — ничего не «зависает».
const all = new Set();

export function gestureButton(el, { threshold = 26, flick = 0.3, onDown, onGesture, onUp } = {}) {
  let id = null, x0 = 0, y0 = 0, t0 = 0, mode = null;
  const end = (e, cancel) => {
    if (id === null || (e && e.pointerId !== id)) return;
    const held = (performance.now() - t0) / 1000, m = mode, pid = id;
    id = null; mode = null; el.classList.remove('on'); delete el.dataset.g; // сначала сбрасываем: отпускание захвата может вызвать end ещё раз
    try { if (el.hasPointerCapture && el.hasPointerCapture(pid)) el.releasePointerCapture(pid); } catch (err) { /* уже отпущен */ }
    if (onUp) onUp(m, held, !!cancel);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); if (id !== null) return;
    id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* без захвата тоже работает */ }
    x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); mode = null; el.classList.add('on');
    if (onDown) onDown();
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || mode) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; if (Math.hypot(dx, dy) < threshold) return;
    const dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? (dx > 0 ? 'right' : 'left') : Math.abs(dy) > Math.abs(dx) * 1.3 ? (dy < 0 ? 'up' : 'down') : null;
    if (!dir) return; // диагональ — ждём, пока направление станет ясным
    mode = dir; el.dataset.g = dir;
    if (onGesture) onGesture(dir, (performance.now() - t0) / 1000 < flick);
  });
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('lostpointercapture', (e) => end(e, true));
  const api = { cancel: () => end(null, true), active: () => id !== null };
  all.add(api); return api;
}
// окно потеряло фокус (звонок, свернули) — отпускаем всё
export function cancelAll() { for (const b of all) b.cancel(); }
addEventListener('blur', cancelAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });
