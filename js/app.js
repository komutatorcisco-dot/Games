// Хаб: главное меню, профиль, бонус дня, навигация.
'use strict';

const App = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  // Серия входов: 1-й день 40 монет, каждый следующий +10, на 7-й — 150, дальше снова с начала.
  const dailyReward = (d) => (d >= 7 ? 150 : 30 + d * 10);
  const nextDay = () => (Store.d.lastDaily === yesterday() ? (Store.d.dailyStreak % 7) + 1 : 1);

  const ACHIEVEMENTS = [
    ['Первый гол', 'Пройди уровень в «Пас в ворота»', () => Store.d.pass.unlocked > 1],
    ['Хет-трик звёзд', '10 уровней на три звезды', () => Object.values(Store.d.pass.stars).filter((s) => s === 3).length >= 10],
    ['Финал тура', 'Пройди 10 уровней пазла', () => Store.d.pass.unlocked > 10],
    ['Скаут', 'Угадай 10 футболистов', () => Profile.wins('guess') >= 10],
    ['Историк', 'Угадай 10 карьер', () => Profile.wins('career') >= 10],
    ['Клубный эксперт', 'Угадай 10 клубов', () => Profile.wins('club') >= 10],
    ['Трансферный гуру', 'Серия 10 в «Куда перешёл?»', () => Store.d.transfer.best >= 10],
    ['Финансист', 'Серия 10 в «Дороже или дешевле»', () => Store.d.transfer.hlBest >= 10],
    ['Тики-така', 'Заполни всю сетку Тики-Така-Тоу', () => Store.d.ttt.wins >= 1],
    ['Геймер', 'Серия 10 в «Кто выше в FC 27?»', () => Store.d.compare.fcBest >= 10],
    ['Скаут-оценщик', 'Серия 10 в «Кто дороже?»', () => Store.d.compare.valBest >= 10],
    ['Богач', 'Накопи 1000 монет', () => Store.d.coins >= 1000],
    ['Головоломщик', 'Пройди 30 уровней головоломок', () => Profile.wins('pz') >= 30],
    ['Неделя с нами', 'Заходи 7 дней подряд', () => Store.d.dailyStreak >= 7],
    ['Агент', 'Выиграй аукцион', () => Store.d.auction.wins >= 1],
    ['Суперагент', 'Выиграй 10 аукционов', () => Store.d.auction.wins >= 10],
    ['Профи', 'Получи звание «Профи»', () => Store.d.stats.xp >= 800],
    ['Старик Джексон', 'Высшее звание', () => Store.d.stats.xp >= 4000],
  ];

  function rankUi(nameSel, barSel, nextSel) {
    const r = Profile.rank();
    $(nameSel).textContent = r.name;
    const pct = r.to ? Math.round(((r.xp - r.from) / (r.to - r.from)) * 100) : 100;
    $(barSel).style.width = pct + '%';
    $(nextSel).textContent = r.to ? `${r.xp} / ${r.to} опыта до звания «${r.nextName}»` : `${r.xp} опыта · максимум`;
  }

  function renderHub() {
    const P = Store.d.pass, G = Store.d.guess, C = Store.d.career, T = Store.d.transfer;
    $('#meta-pass').textContent = P.unlocked > 1 ? `Уровень ${P.unlocked} · ★ ${Pass.totalStars()}` : 'Начни с уровня 1';
    $('#meta-guess').textContent = G.level > 1 ? `Уровень ${G.level}` : `${PLAYERS.length} игроков`;
    $('#meta-career').textContent = C.best ? `Рекорд ${C.best}` : `${Career.count} карьер`;
    $('#meta-club').textContent = Store.d.club.best ? `Рекорд ${Store.d.club.best}` : `${Club.count} клубов`;
    $('#meta-transfer').textContent = T.best ? `Рекорд ${T.best}` : `${Transfer.count} трансферов`;
    $('#meta-hl').textContent = T.hlBest ? `Рекорд ${T.hlBest}` : 'Сколько стоил?';
    $('#meta-fc').textContent = Store.d.compare.fcBest ? `Рекорд ${Store.d.compare.fcBest}` : `${Compare.countFc} игроков`;
    $('#meta-value').textContent = Store.d.compare.valBest ? `Рекорд ${Store.d.compare.valBest}` : 'Transfermarkt';
    $('#meta-ttt').textContent = Store.d.ttt.wins ? `Побед: ${Store.d.ttt.wins}` : 'Как на box2box';
    $('#pz-shelf').innerHTML = PZ.shelf();
    $('#daily').hidden = Store.d.lastDaily === today();
    if (!$('#daily').hidden) {
      const day = nextDay();
      $('#daily-text').textContent = `день ${day}, забери +${dailyReward(day)}`;
      $('#daily-days').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) =>
        `<i class="${d < day ? 'got' : d === day ? 'now' : ''}"><small>${d}</small>${dailyReward(d)}</i>`).join('');
    }
    rankUi('#hub-rank', '#hub-xp', '#hub-next');
    Coins.render();
  }

  function renderProfile() {
    rankUi('#prof-rank', '#prof-xp', '#prof-next');
    $('#prof-badge').textContent = Profile.rank().name.slice(0, 1);
    const P = Store.d.pass, T = Store.d.transfer;
    const stats = [
      ['Монеты', Store.d.coins],
      ['Опыт', Store.d.stats.xp],
      ['Пазл: уровень', P.unlocked],
      ['Пазл: звёзды', Pass.totalStars()],
      ['Угадано игроков', Profile.wins('guess')],
      ['Угадано карьер', Profile.wins('career')],
      ['Угадано клубов', Profile.wins('club')],
      ['Рекорд трансферов', T.best],
      ['Рекорд «дороже/дешевле»', T.hlBest],
      ['Сетки Тики-Така-Тоу', Store.d.ttt.wins],
      ['Рекорд FC 27', Store.d.compare.fcBest],
      ['Рекорд «кто дороже»', Store.d.compare.valBest],
    ];
    $('#prof-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('#prof-achs').innerHTML = ACHIEVEMENTS.map(([name, desc, test]) => {
      const ok = test();
      return `<div class="ach ${ok ? 'ok' : ''}"><i>${ok ? '★' : '☆'}</i><div><b>${name}</b><small>${desc}</small></div></div>`;
    }).join('');
    $('#set-music').textContent = Store.d.music ? 'Вкл' : 'Выкл';
    $('#set-sound').textContent = Store.d.sound ? 'Вкл' : 'Выкл';
    Coins.render();
  }

  function home(anchor) {
    Modal.close();
    PZ.leave();
    renderHub();
    Screens.show('hub');
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ block: 'start' }); }
  }

  function profile() {
    Modal.close();
    renderProfile();
    Screens.show('profile');
  }

  const actions = {
    home,
    profile,
    'pass-levels': () => Pass.openLevels(),
    'pass-undo': () => Pass.undo(),
    'pass-restart': () => Pass.restart(),
    'pass-hint': () => Pass.hint(),
    'guess-career': () => Guess.startCareer(),
    'guess-duel': () => { Screens.show('guess'); Guess.askDuelNames(); },
    'guess-hint': () => Guess.hint(),
    career: () => Career.start('solo'),
    'career-duel': () => Career.start('duel'),
    club: () => Club.start(),
    transfer: () => Transfer.start('where'),
    hl: () => Transfer.start('hl'),
    ttt: () => TTT.start('solo'),
    'auction-bot': () => Auction.start(true),
    puzzles: () => home('puzzles'),
    'auction-duo': () => Auction.start(false),
    fc: () => Compare.start('fc'),
    value: () => Compare.start('value'),
    'ttt-duo': () => TTT.start('duo'),
    'ttt-skip': () => TTT.skip(),
    'coins-info': () => toast('Монеты дают за победы. Трать их на подсказки.'),
    daily: () => {
      if (Store.d.lastDaily === today()) return;
      const day = nextDay();
      Store.d.dailyStreak = day;
      Store.d.lastDaily = today();
      Store.save();
      Coins.add(dailyReward(day));
      toast(`День ${day}: +${dailyReward(day)} монет. Заходи завтра — будет больше`);
      renderHub();
    },
    music: () => { Music.toggle(); renderProfile(); },
    sound: () => { Store.d.sound = !Store.d.sound; Store.save(); renderProfile(); Sound.play('tap'); },
  };

  function init() {
    Store.load();
    Pass.bind(); Guess.bind(); Career.bind(); Club.bind(); Transfer.bind(); TTT.bind(); Compare.bind(); Auction.bind();
    Music.arm();
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && actions[el.dataset.act]) { actions[el.dataset.act](); return; }
      const pz = e.target.closest('[data-pz]');
      if (pz) PZ.open(pz.dataset.pz);
    });
    // Нижнее меню видно только на главной и в профиле
    const orig = Screens.show.bind(Screens);
    Screens.show = (id) => {
      orig(id);
      $('#tabbar').hidden = !(id === 'hub' || id === 'profile');
      $('#tab-home').classList.toggle('on', id === 'hub');
      $('#tab-profile').classList.toggle('on', id === 'profile');
      try { if (TG && TG.BackButton) id === 'hub' ? TG.BackButton.hide() : TG.BackButton.show(); } catch (e) { /* не в Telegram */ }
    };
    try {
      if (TG && TG.BackButton) TG.BackButton.onClick(() => (Screens.current === 'pass-game' ? Pass.openLevels() : home()));
    } catch (e) { /* не в Telegram */ }
    // Ссылка вида ...#pass открывает игру сразу
    const h = location.hash.replace('#', '');
    const deep = { puzzles: 'puzzles', pass: 'pass-levels', guess: 'guess-career', duel: 'guess-duel', career: 'career', club: 'club', transfer: 'transfer', hl: 'hl', ttt: 'ttt', auction: 'auction-bot', fc: 'fc', value: 'value', profile: 'profile' };
    renderHub();
    if (deep[h]) actions[deep[h]]();
    else Screens.show('hub');
  }

  return { init, home };
})();

App.init();
