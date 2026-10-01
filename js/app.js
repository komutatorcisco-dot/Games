// Хаб: главное меню, бонус дня, кнопки.
'use strict';

const App = (() => {
  const today = () => new Date().toISOString().slice(0, 10);

  function renderHub() {
    const P = Store.d.pass;
    $('#meta-pass').textContent = P.unlocked > 1
      ? `Уровень ${P.unlocked} · ★ ${Pass.totalStars()}`
      : 'Начни с уровня 1';
    const G = Store.d.guess;
    $('#meta-guess').textContent = G.level > 1
      ? `Угадано ${Guess.solvedCount()} · уровень ${G.level}`
      : `${Guess.total} игроков в базе`;
    $('#daily').hidden = Store.d.lastDaily === today();
    $('#sound-btn').textContent = `Звук: ${Store.d.sound ? 'вкл' : 'выкл'}`;
    Coins.render();
  }

  function home() {
    Modal.close();
    renderHub();
    Screens.show('hub');
  }

  const actions = {
    home,
    'pass-levels': () => Pass.openLevels(),
    'pass-undo': () => Pass.undo(),
    'pass-restart': () => Pass.restart(),
    'pass-hint': () => Pass.hint(),
    'guess-career': () => Guess.startCareer(),
    'guess-duel': () => { Screens.show('guess'); Guess.askDuelNames(); },
    'guess-hint': () => Guess.hint(),
    'coins-info': () => toast('Монеты дают за победы. Трать их на подсказки.'),
    daily: () => {
      if (Store.d.lastDaily === today()) return;
      Store.d.lastDaily = today();
      Store.save();
      Coins.add(50);
      toast('+50 монет. Заходи завтра за новым бонусом');
      renderHub();
    },
    sound: () => {
      Store.d.sound = !Store.d.sound;
      Store.save();
      renderHub();
      Sound.play('tap');
    },
  };

  function init() {
    Store.load();
    Pass.bind();
    Guess.bind();
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && actions[el.dataset.act]) actions[el.dataset.act]();
    });
    // Кнопка «Назад» в Telegram
    try {
      if (TG && TG.BackButton) {
        TG.BackButton.onClick(() => (Screens.current === 'pass-game' ? Pass.openLevels() : home()));
        const orig = Screens.show.bind(Screens);
        Screens.show = (id) => { orig(id); id === 'hub' ? TG.BackButton.hide() : TG.BackButton.show(); };
      }
    } catch (e) { /* не в Telegram */ }
    // Ссылка вида ...#pass или #guess открывает игру сразу
    const h = location.hash.replace('#', '');
    if (h === 'pass') Pass.openLevels();
    else if (h === 'guess') Guess.startCareer();
    else if (h === 'duel') actions['guess-duel']();
    renderHub();
  }

  return { init, home };
})();

App.init();
