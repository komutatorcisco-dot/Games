// Обучение новичка в духе Supercell: не читаем правила, а сразу играем — палец показывает, куда жать.
// Шаги: привет тренера → «Играть» → первый матч «Угадай игрока» (подсказки по ходу) → трофеи → все игры → первый пак в подарок → готово.
// Пропустить нельзя. Шаг хранится в Store.d.ui.tut (99 — пройдено): закрыл игру посреди — продолжит с того же места.
// Показывается всем, в том числе тем, кто уже играл (старое обучение из 3 подсказок — флаг ui.coach — больше не учитывается).
'use strict';

const Coach = (() => {
  const DONE = 99;
  let el = null, rowsObs = null, tick = 0;
  const UI = () => Store.d.ui || (Store.d.ui = {});
  const step = () => UI().tut || 0;
  const go = (n) => { UI().tut = n; Store.save(); };
  const active = () => step() !== DONE && !!(Store.d.user && Store.d.user.nick) && !(document.body && document.body.classList && document.body.classList.contains('fcm-on')); // новый вид: вместо тренера — первый вход (js/onboard.js)
  const coachImg = '<img class="co-face" src="img/ui2/coach.webp?v=1" alt="" decoding="async">';
  const finger = '<img class="co-fng" src="img/ui2/finger.webp?v=1" alt="" decoding="async">';
  const busy = () => Modal.isOpen || document.getElementById('boot') || $('.po, .h2-un, .sx-sheet-wrap, .ob');

  function close() { if (el) { el.remove(); el = null; } }
  function layer(cls = '') {
    close();
    el = document.createElement('div'); el.className = 'co ' + cls; document.body.appendChild(el);
    return el;
  }

  // экран тренера по центру: картинка, текст, одна кнопка
  function talk(title, text, btn, onTap) {
    const o = layer('co-talk');
    o.innerHTML = `<div class="co-card">${coachImg}<small>Тренер</small><b>${title}</b><p>${text}</p><button class="btn gold co-go">${btn}</button></div>`;
    $('.co-go', o).addEventListener('click', () => { Sound.play('tap'); haptic('tap'); close(); onTap(); });
    Sound.play('whistle'); haptic('tap');
  }

  // подсветить элемент «дыркой» и показать палец; нажать можно только на него
  function spot(sel, title, text, onTap, keep = false) {
    const t = $(sel);
    if (!t || !t.offsetParent) return false;
    const r = t.getBoundingClientRect(), pad = 6, below = r.top < innerHeight / 2;
    const o = layer();
    o.innerHTML = `<i class="co-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></i>
      <i class="co-hand ${below ? 'up' : ''}" style="left:${r.left + r.width / 2 - 28}px;top:${below ? r.bottom - 6 : r.top - 62}px">${finger}</i>
      <div class="co-tip ${below ? 'below' : 'above'}" style="${below ? `top:${r.bottom + 66}px` : `bottom:${innerHeight - r.top + 66}px`}">
        <span class="co-who">${coachImg}<small>Тренер</small></span><b>${title}</b><p>${text}</p></div>`;
    o.addEventListener('click', (e) => {
      const inHole = e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
      if (!inHole) { haptic('bad'); const h = $('.co-hand', o); if (h && h.animate) h.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], { duration: 300 }); return; }
      e.stopPropagation(); Sound.play('tap'); haptic('tap');
      if (!keep) close();
      onTap();
    });
    Sound.play('tap');
    return true;
  }

  // маленькая подсказка поверх игры: не мешает играть, закрывается касанием
  function bubble(title, text) {
    const o = layer('co-free');
    o.innerHTML = `<div class="co-tip top"><span class="co-who">${coachImg}<small>Тренер</small></span><b>${title}</b><p>${text}</p><button class="btn gold">Понятно</button></div>`;
    $('.co-tip', o).addEventListener('click', () => close());
  }

  // ---------- первый матч ----------
  function startMatch() {
    go(3);
    // своё правило игры покажем по ходу — стандартное окно «Как играть» не нужно
    (Store.d.howto || (Store.d.howto = {})).guess = 1; Store.save();
    Guess.startCareer();
    later(() => {
      if (Screens.current !== 'guess' || step() !== 3) return;
      spot('#guess-field', 'Угадай футболиста', 'Напиши фамилию любого футболиста, например «Месси», и выбери его из списка. Я покажу, чем он похож на загаданного.',
        () => { const f = $('#guess-field'); if (f) f.focus(); });
      watchRows();
    }, 700);
  }
  function watchRows() {
    if (rowsObs) rowsObs.disconnect();
    const rows = $('#guess-rows'); if (!rows || !window.MutationObserver) return;
    rowsObs = new MutationObserver(() => {
      if (step() !== 3 || !rows.children.length) return;
      rowsObs.disconnect(); rowsObs = null;
      later(() => { if (step() === 3 && Screens.current === 'guess' && !Modal.isOpen) bubble('Смотри на цвета', 'Зелёное — совпало с загаданным, жёлтое — близко. Стрелки подсказывают: больше или меньше. Угадай за 8 попыток!'); }, 900);
    });
    rowsObs.observe(rows, { childList: true });
  }
  // игра сообщает: матч закончен (победа или нет — неважно, трофеи даются за игру)
  function matchDone() { if (step() === 3) { go(4); close(); } }
  // кнопки окна результата во время обучения: только «Дальше» на главную
  const inMatch = () => step() === 3;

  // ---------- шаги на главной ----------
  function maybe() {
    if (!active()) { if (tick) { clearInterval(tick); tick = 0; } return; }
    // сами заглядываем раз в полторы секунды: главную могло перекрыть окно (бонус за вход) или игра вернула на главную без перерисовки
    if (!tick) tick = setInterval(maybe, 1500);
    if (Screens.current !== 'hub' || el || busy()) return;
    if (!$('#home2 .h2-play')) return;
    const s = step();
    if (s <= 1) return talk('Привет! Я твой тренер', 'Здесь десятки футбольных мини-игр. Давай сразу сыграем первый матч!', 'Поехали!', () => { go(2); later(maybe, 300); });
    if (s === 2 || s === 3) { // 3 — игру закрыли посреди матча: начнём заново
      go(2);
      return spot('#home2 .h2-play', 'Первый матч', 'Жми «Играть»!', startMatch);
    }
    if (s === 4) return spot('#home2 .h2-road', 'Трофеи', 'За каждую игру получаешь трофеи, за победу — больше. Они открывают новые игры и награды.', () => { go(5); later(maybe, 300); }) || (go(5), later(maybe, 300));
    if (s === 5) return spot('#home2 .h2-all', 'Все игры', 'Здесь выбираешь, во что играть. Новые игры открываются за трофеи.', () => { go(6); later(maybe, 300); }) || (go(6), later(maybe, 300));
    if (s === 6) return talk('Подарок новичку!', 'Держи первый пак с карточками футболистов. Открывай!', 'Открыть пак', () => {
      // шаг сдвигаем, только когда пак реально начали открывать — закрыл игру раньше, подарок не пропадёт
      Rewards.openDrop({ title: 'ПЕРВЫЙ ПАК · ПОДАРОК', minLevel: 0, onStart: () => go(7), onDone: () => later(maybe, 600) });
    });
    if (s === 7) return talk('Готово!', 'Ты знаешь главное. Играй, копи трофеи и открывай новые игры. Удачи!', 'Играть!', () => { go(DONE); if (typeof Home !== 'undefined') Home.checkUnlocks(); });
  }

  return { maybe, close, active, matchDone, inMatch };
})();
