// Игровые плашки (14.11): всё, что раньше было короткой строкой-тостом про награды и успехи, теперь — стеклянная
// плашка (js/plate.js). Тексты и цвета — здесь, в одном месте. Нет Plate — обычный тост.
'use strict';

const Notify = (() => {
  const on = () => typeof Plate !== 'undefined';
  // во время обучения плашки не перекрывают его карточки — ждут, пока оно закончится (до ~3 минут)
  const P = (o, fb, tries = 0) => {
    if (typeof Onboard !== 'undefined' && Onboard.active) { if (tries < 60) setTimeout(() => P(o, fb, tries + 1), 3000); return null; }
    return on() ? Plate.show(o) : (typeof toast === 'function' && fb ? toast(fb) : null);
  };
  // лаймовое очко — нарисованное (своей картинки нет): круг с бликом и листиком
  const LIME = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="34%" cy="30%" r="75%"><stop offset="0" stop-color="#fbffd8"/><stop offset=".3" stop-color="#d8ff6a"/><stop offset=".65" stop-color="#8fe61e"/><stop offset="1" stop-color="#3f7a00"/></radialGradient></defs><circle cx="32" cy="36" r="24" fill="url(#g)"/><path d="M33 13c6-6 14-6 16-5-1 6-7 11-15 10z" fill="#3fbf2a"/></svg>');
  const face = (key) => { try { const c = Cards.get(key); if (!c) return ''; const src = c.faceUrl || (c.face && typeof faceSrc === 'function' ? faceSrc(c.face) : ''); return src || ''; } catch (e) { return ''; } };
  return {
    LIME,
    pass: (lv, max) => P({ caption: 'Пропуск', counter: `${lv}/${max}`, title: 'Новый уровень', image: 'img/packs/pk2-160.webp?v=b4', tint: 'purple' }, `Пропуск: уровень ${lv}!`),
    quest: (t, n) => P({ caption: 'Задание выполнено', counter: n > 1 ? `${n}/${n}` : '', title: t, tint: 'green' }, `Задание выполнено: ${t} ✓`),
    division: (name) => P({ caption: 'Повышение', title: name, tint: 'gold', fonts: 'sport', duration: 3200 }, `Новый дивизион: ${name}!`),
    record: (v) => P({ caption: 'Новый рекорд', title: String(v), tint: 'green', fonts: 'sport' }, `Новый рекорд: ${v}`),
    angry: (n = 1) => P({ caption: 'Получен предмет', counter: n > 1 ? `×${n}` : '', title: 'Злой мяч', image: 'img/packs/angry-160.webp?v=a2', tint: 'red' }, 'Злой мяч! Открой его на главной'),
    lime: (n) => P({ caption: 'Лаймовые очки', title: `+${n}`, image: LIME, tint: 'lime' }, `+${n} лаймовых очков прокачки`),
    rank: (name) => P({ caption: 'Новое звание', title: name, tint: 'blue' }, `Новое звание: ${name}!`),
    opp: (o) => P({ caption: 'Соперник найден', counter: o.ovr ? `ОБЩ ${o.ovr}` : '', title: o.nick, image: o.face || '', tint: 'red' }, `Соперник: ${o.nick}`),
    card: (key) => { const c = Cards.get(key); if (!c) return null; return P({ caption: 'Новая карточка', counter: String(c.r), title: c.name.split(' ').slice(-1)[0], image: face(key), tint: 'blue' }, `Новая карточка: ${c.name}`); },
    // «сейчас играет» — не поверх обучения и окон: ждёт, пока они закроются (до ~3 минут)
    music: (tries = 0) => { const busy = (typeof Onboard !== 'undefined' && Onboard.active) || (typeof Modal !== 'undefined' && Modal.isOpen) || document.querySelector('.po, .dvs, .lm-sheet');
      if (busy) { if (tries < 60) setTimeout(() => Notify.music(tries + 1), 3000); return null; }
      return P({ variant: 'track', title: 'Джексоны Lo-Fi', artist: 'Старики Джексоны', cover: 'img/brand/channel.jpg', analyser: typeof Music !== 'undefined' && Music.analyser ? Music.analyser() : null, duration: 4200 }, ''); },
  };
})();
