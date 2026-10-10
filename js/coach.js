// Обучение новичка: 3 подсказки на главной при первом заходе (после выбора ника).
// Подсвечиваем элемент «дыркой» в затемнении, рядом — пузырь с текстом. Показываем один раз: Store.d.ui.coach = 1.
'use strict';

const Coach = (() => {
  const STEPS = [
    ['.h2-play', 'Играть', 'Жми сюда, чтобы начать игру. Сменить игру — кнопка «Игры» справа.'],
    ['.h2-road', 'Трофеи', 'За матчи и победы получаешь трофеи. Они открывают игры и награды. Нажми на эту шкалу, чтобы увидеть ближайшую цель. Монеты можно тратить в магазине.'],
    ['#tab-rewards', 'Награды', 'Здесь задания дня, сезонный пропуск и дорога трофеев с паками.'],
  ];
  let el = null, i = 0;
  function maybe() {
    const ui = Store.d.ui || (Store.d.ui = {});
    if (ui.coach || !Store.d.user.nick || Screens.current !== 'hub' || Modal.isOpen || document.getElementById('boot') || $('.po, .h2-un, .sx-sheet-wrap') || el) return;
    if (!$('.h2-play')) return;
    if (typeof Rewards !== 'undefined' && Rewards.S().trophies >= 100) { ui.coach = 1; Store.save(); return; } // опытным не показываем
    i = 0; show();
  }
  function show() {
    if (Screens.current !== 'hub' || Modal.isOpen || $('.po, .h2-un, .sx-sheet-wrap')) return close();
    const [sel, title, text] = STEPS[i] || [];
    const t = sel && $(sel);
    if (!t || !t.offsetParent) { if (i < STEPS.length - 1) { i++; return show(); } return close(); }
    const r = t.getBoundingClientRect(), pad = 6;
    if (!el) { el = document.createElement('div'); el.className = 'co'; document.body.appendChild(el); el.addEventListener('click', next); }
    const below = r.top < innerHeight / 2;
    el.innerHTML = `<i class="co-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></i>
      <div class="co-tip ${below ? 'below' : 'above'}" style="${below ? `top:${r.bottom + 16}px` : `bottom:${innerHeight - r.top + 16}px`}">
        <small>${i + 1} из ${STEPS.length}</small><b>${title}</b><p>${text}</p><button class="btn gold">${i < STEPS.length - 1 ? 'Дальше' : 'Понятно, играем!'}</button></div>`;
    Sound.play('tap'); haptic('tap');
  }
  function next() {
    i++;
    if (i >= STEPS.length) { Store.d.ui.coach = 1; Store.save(); close(); }
    else show();
  }
  function close() { if (el) { el.remove(); el = null; } }
  return { maybe, close };
})();
