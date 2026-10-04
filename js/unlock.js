// Открытие игр. Новичку сразу доступны лучшие игры (ежедневные, угадайки, история, дуэль, аукцион),
// остальные открываются по одной за сыгранные игры — или сразу за монеты.
// Кто играл до появления замков, получает всё открытым.
'use strict';

const Unlock = (() => {
  // порядок открытия: ключ плитки на главной
  const ORDER = [
    'act:club', 'ng:timemachine', 'act:hl', 'pz:flood', 'ng:numhist', 'ng:whoami', 'act:value', 'ng:rank',
    'ng:bingo', 'pz:slide', 'ng:linkup', 'act:b2b', 'ng:draft', 'pz:memory', 'ng:context', 'act:pick-solo',
    'ng:trumps', 'pz:words', 'ng:vs100', 'ng:darts', 'pz:g2048', 'pz:popit',
  ];
  // сколько всего сыграть игр, чтобы открылась i-я; и цена, чтобы открыть сразу
  const NEED = [2, 4, 6, 8, 10, 13, 16, 19, 22, 25, 29, 33, 37, 41, 45, 50, 55, 60, 65, 70, 75, 80];
  const price = (i) => 100 + i * 20;

  const S = () => {
    const d = Store.d;
    if (!d.unlock) d.unlock = { played: 0, open: {}, fresh: {}, all: (d.stats.xp || 0) > 0 || (d.recent || []).length > 0 };
    return d.unlock;
  };
  const idx = (key) => ORDER.indexOf(key);
  const isOpen = (key) => { const s = S(), i = idx(key); return i < 0 || s.all || !!s.open[key] || s.played >= NEED[i]; };
  const keyOf = (el) => (el.dataset.ng ? 'ng:' + el.dataset.ng : el.dataset.pz ? 'pz:' + el.dataset.pz : el.dataset.act ? 'act:' + el.dataset.act : '');
  const titleOf = (key) => { const [t, id] = key.split(':'); const el = document.querySelector(`#hub [data-${t}="${id}"]:is(.tile-card, .game-card)`); const b = el && (el.querySelector(':scope > b') || el.querySelector('h2')); return b ? b.textContent.trim() : 'новая игра'; };

  // следующая закрытая игра — для подсказки на главной
  function next() {
    const s = S();
    if (s.all) return null;
    const i = ORDER.findIndex((k) => !isOpen(k));
    return i < 0 ? null : { key: ORDER[i], left: NEED[i] - s.played, title: titleOf(ORDER[i]) };
  }

  // Игра закончилась: считаем и празднуем открытие
  function count() {
    const s = S();
    if (s.all) return;
    const before = ORDER.filter(isOpen);
    s.played++;
    const now = ORDER.filter((k) => isOpen(k) && !before.includes(k));
    now.forEach((k) => { s.fresh[k] = true; });
    Store.save();
    if (now.length) later(() => { toast(`🔓 Открыта новая игра: «${titleOf(now[0])}»`); Sound.play('coin'); }, 1400);
  }

  // Плитки на главной: замок, сколько осталось, цена; «НОВОЕ» на только что открытых
  function decorate(root = document.getElementById('hub')) {
    const s = S();
    root.querySelectorAll('[data-ng], [data-act], [data-pz]').forEach((el) => {
      if (!el.matches('.tile-card, .game-card')) return;
      const key = keyOf(el), i = idx(key);
      if (i < 0) return;
      const open = isOpen(key);
      el.classList.toggle('locked', !open);
      el.querySelectorAll('.lock-note, .new-badge').forEach((x) => x.remove());
      // в списке игр видно коротко «🔒 400 🪙», в карусели — полностью
      if (!open) el.insertAdjacentHTML('beforeend', `<em class="lock-note">🔒 <span class="ln-long">ещё ${NEED[i] - s.played} ${plural(NEED[i] - s.played, 'игра', 'игры', 'игр')} · или </span>${price(i)} 🪙</em>`);
      else if (s.fresh[key]) el.insertAdjacentHTML('beforeend', '<em class="new-badge">НОВОЕ</em>');
    });
  }

  // Нажали на закрытую плитку: рассказать, как открыть
  function ask(key, onOpen) {
    const s = S(), i = idx(key), left = NEED[i] - s.played, cost = price(i);
    Modal.open(`<div class="ng-res"><span class="lock-big">🔒</span><h2>${esc(titleOf(key))}</h2>
        <p class="res-text">Откроется сама через <b>${left} ${plural(left, 'игру', 'игры', 'игр')}</b> — сыграй во что угодно.<br>Или открой прямо сейчас.</p></div>`, [
      { label: `Открыть за ${cost} 🪙`, cls: 'gold', onClick: () => {
        if (!Coins.spend(cost)) return;
        s.open[key] = true; s.fresh[key] = true; Store.save();
        confetti(); Sound.play('goal');
        toast(`🔓 «${titleOf(key)}» открыта!`);
        onOpen && onOpen();
      } },
      { label: 'Позже', cls: 'ghost' },
    ]);
  }

  // Открыли игру — значок «НОВОЕ» больше не нужен
  function seen(el) {
    const key = keyOf(el), s = S();
    if (s.fresh[key]) { delete s.fresh[key]; Store.save(); }
  }

  return { isOpen, keyOf, count, decorate, ask, seen, next, ORDER };
})();
