// Хаб: главное меню, профиль, бонус дня, навигация.
'use strict';

const App = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  // Серия входов: 1-й день 30 монет, каждый следующий +10, на 7-й — 100, дальше снова с начала.
  const dailyReward = (d) => (d >= 7 ? 100 : 20 + d * 10);
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
    ['Сборник', 'Серия 10 в «Угадай сборную»', () => Store.d.nation.best >= 10],
    ['Игрок дня', 'Угадай игрока дня', () => Store.d.dly.wins >= 1],
    ['Неделя без промаха', 'Серия 7 в «Игроке дня»', () => Store.d.dly.best >= 7],
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
    $('#meta-guess').textContent = G.level > 1 ? `Уровень ${G.level}` : `${PLAYERS.length} ${plural(PLAYERS.length, 'игрок', 'игрока', 'игроков')}`;
    $('#meta-career').textContent = C.best ? `Рекорд ${C.best}` : `${Career.count} ${plural(Career.count, 'карьера', 'карьеры', 'карьер')}`;
    $('#meta-club').textContent = Store.d.club.best ? `Рекорд ${Store.d.club.best}` : `${Club.count} ${plural(Club.count, 'клуб', 'клуба', 'клубов')}`;
    $('#meta-transfer').textContent = T.best ? `Рекорд ${T.best}` : `${Transfer.count} ${plural(Transfer.count, 'трансфер', 'трансфера', 'трансферов')}`;
    $('#meta-hl').textContent = T.hlBest ? `Рекорд ${T.hlBest}` : 'Сколько стоил?';
    $('#meta-fc').textContent = Store.d.compare.fcBest ? `Рекорд ${Store.d.compare.fcBest}` : `${Compare.countFc} ${plural(Compare.countFc, 'игрок', 'игрока', 'игроков')}`;
    $('#meta-value').textContent = Store.d.compare.valBest ? `Рекорд ${Store.d.compare.valBest}` : 'Transfermarkt';
    $('#meta-nation').textContent = Store.d.nation.best ? `Рекорд ${Store.d.nation.best}` : `${Nation.count} ${plural(Nation.count, 'сборная', 'сборные', 'сборных')}`;
    $('#meta-ttt').textContent = Store.d.ttt.wins ? `Побед: ${Store.d.ttt.wins}` : 'Как на box2box';
    $('#pz-shelf').innerHTML = PZ.shelf();
    Daily.hubCard();
    ['daily', 'brain', 'grid', 'cards', 'hist'].forEach((g) => { $('#ng-' + g).innerHTML = NG.tiles(g); });
    $('#featured').innerHTML = NG.tiles(featured());
    const dh = (Store.d.fduel && Store.d.fduel.hist) || [];
    $('#duel-stat').textContent = dh.length ? `Сыграно дуэлей: ${dh.length} · побед: ${dh.filter((x) => x.res === 'win').length}` : '';
    if (!cat) cat = (Store.d.ui && Store.d.ui.cat) || 'guess';
    $$('#cat-nav [data-cat]').forEach((c) => {
      const n = $$(`.cat[data-cat="${c.dataset.cat}"] :is(.tile-card, .game-card, .auction-hero)`).length;
      c.dataset.n = n;
    });
    const total = $$('#panel-games :is(.tile-card, .game-card, .auction-hero)').length + $$('#panel-friends .tile-card').length + 1;
    $('#all-count').textContent = `${total} ${plural(total, 'игра', 'игры', 'игр')} по разделам`;
    setCat(cat, false);
    Unlock.decorate();
    const bt = Board.teaser();
    $('#board-teaser').hidden = !bt; $('#board-teaser').innerHTML = bt;
    const nx = Unlock.next();
    $('#unlock-next').innerHTML = nx ? `🔒 Следующая игра — <b>«${esc(nx.title)}»</b> — откроется через ${nx.left} ${plural(nx.left, 'игру', 'игры', 'игр')}` : '';
    renderDailyProgress();
    $('#lim-auction').textContent = Limits.label('auction');
    $('#lim-pick').textContent = Limits.label('pick');
    Icons.fill($('#hub'));
    $('#daily').hidden = Store.d.lastDaily === today();
    $('#wheel-btn').hidden = !Wheel.ready();
    if (!$('#daily').hidden) {
      const day = nextDay();
      $('#daily-text').textContent = `день ${day}, забери +${dailyReward(day)}`;
      $('#daily-days').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) =>
        `<i class="${d < day ? 'got' : d === day ? 'now' : ''}"><small>${d}</small>${dailyReward(d)}</i>`).join('');
    }
    rankUi('#hub-rank', '#hub-xp', '#hub-next');
    User.render(); Donate.render();
    Coins.render();
  }

  // Ежедневные задания: прогресс и сундук за все пять
  const CHEST = 100;
  function renderDailyProgress() {
    const st = NG.dailyStatus(), done = st.filter(([, d]) => d).length, all = done === st.length;
    const claimed = (Store.d.ng.chest || '') === Day.key();
    $('#dly-progress').innerHTML = `<div class="dp-head"><b>Ежедневные</b><span>${done}/${st.length} сегодня</span></div>
      <div class="dp-bar"><i style="width:${(done / st.length) * 100}%"></i></div>
      <div class="dp-items">${st.map(([n, d]) => `<span class="${d ? 'ok' : ''}">${d ? '✓' : '○'} ${esc(n)}</span>`).join('')}</div>
      ${all && !claimed ? `<button class="btn gold dp-chest" data-act="chest">🎁 Все задания сделаны — забрать сундук +${CHEST}</button>`
        : `<small class="dp-note">${claimed ? 'Сундук получен ✓ Новые задания в полночь по МСК' : `Пройди все ${st.length} — получишь сундук +${CHEST} монет`}</small>`}`;
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
      ['Игрок дня: угадано', Store.d.dly.wins || 0],
      ['Игрок дня: лучшая серия', Store.d.dly.best],
    ];
    $('#prof-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('#prof-achs').innerHTML = ACHIEVEMENTS.map(([name, desc, test]) => {
      const ok = test();
      return `<div class="ach ${ok ? 'ok' : ''}"><i>${ok ? '★' : '☆'}</i><div><b>${name}</b><small>${desc}</small></div></div>`;
    }).join('');
    $('#set-music').textContent = Store.d.music ? 'Вкл' : 'Выкл';
    $('#set-sound').textContent = Store.d.sound ? 'Вкл' : 'Выкл';
    Coins.render();
    User.render();
  }

  // Главная разбита на вкладки: «Главная», «Игры» (по разделам) и «С другом»
  const PANELS = ['home', 'games', 'friends'];
  const CATS = ['guess', 'hist', 'brain', 'puzzles', 'grid', 'cards', 'channel'];
  let panel = 'home', cat = null; // раздел игр берём из сохранения после Store.load()
  const scrollMem = {};

  // Подборка дня: 4 игры, у всех одинаковые, меняются в полночь МСК
  function featured() {
    const pool = NG.list.filter((g) => ['brain', 'grid', 'cards', 'hist'].includes(g.group) && Unlock.isOpen(g.act ? 'act:' + g.act : 'ng:' + g.id)).map((g) => g.id);
    return shuffle(pool, Day.rng('featured')).slice(0, 4);
  }

  function showPanel(name, animate = true) {
    if (!PANELS.includes(name)) name = 'home';
    const from = PANELS.indexOf(panel), to = PANELS.indexOf(name);
    panel = name;
    PANELS.forEach((p) => {
      const el = $('#panel-' + p);
      el.hidden = p !== name;
      if (p === name && animate && from !== to) {
        el.classList.remove('slide-l', 'slide-r'); void el.offsetWidth;
        el.classList.add(to > from ? 'slide-l' : 'slide-r');
        $$('.tile-card, .game-card, .auction-hero, .runner-hero, .rank-card, .friends-teaser, .all-games', el).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 12)));
      }
    });
    tabs();
  }

  function setCat(c, animate = true) {
    if (!CATS.includes(c)) c = 'guess';
    cat = c;
    (Store.d.ui || (Store.d.ui = {})).cat = c; Store.save();
    $$('#cat-nav [data-cat]').forEach((b) => b.classList.toggle('on', b.dataset.cat === c));
    $$('#panel-games .cat').forEach((el) => {
      el.hidden = el.dataset.cat !== c;
      if (!el.hidden && animate) {
        el.classList.remove('cat-in'); void el.offsetWidth; el.classList.add('cat-in');
        $$('.tile-card, .game-card, .auction-hero', el).forEach((t, i) => t.style.setProperty('--i', Math.min(i, 12)));
      }
    });
    const on = $('#cat-nav .on');
    if (on && animate) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function tabs() {
    const id = Screens.current;
    $('#tab-home').classList.toggle('on', id === 'hub' && panel === 'home');
    $('#tab-games').classList.toggle('on', id === 'hub' && panel === 'games');
    $('#tab-friends').classList.toggle('on', id === 'hub' && panel === 'friends');
    $('#tab-board').classList.toggle('on', id === 'board');
    $('#tab-profile').classList.toggle('on', id === 'profile');
  }

  // where: вкладка ('games'), раздел игр ('puzzles') или ничего — вернуться туда, где был
  function home(where) {
    Modal.close();
    PZ.leave();
    renderHub();
    Screens.show('hub');
    if (CATS.includes(where)) { showPanel('games', false); setCat(where, false); }
    else if (PANELS.includes(where)) showPanel(where, false);
    else { showPanel(panel, false); if (scrollMem[panel]) window.scrollTo(0, scrollMem[panel]); }
    if (!Store.d.user.nick) later(() => User.ensure(), 250);
  }

  // нажатие на вкладку внизу: на главной просто листаем панели
  function tab(name) {
    if (Screens.current !== 'hub') return home(name);
    if (panel === name) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    scrollMem[panel] = scrollY;
    showPanel(name);
    window.scrollTo(0, 0);
  }

  function profile() {
    Modal.close();
    renderProfile();
    Screens.show('profile');
  }

  const actions = {
    home: () => tab('home'),
    games: () => tab('games'),
    friends: () => tab('friends'),
    board: () => Board.open(),
    'duel-live': () => NG.open('duel', { mode: 'live' }),
    'duel-link': () => NG.open('duel', { mode: 'link' }),
    'duel-hot': () => NG.open('duel', { mode: 'hot' }),
    profile,
    nick: () => User.edit(false),
    donate: () => Donate.open(),
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
    wheel: () => Wheel.open(),
    runner: () => {
      const f = $('#runner-frame');
      if (!f.getAttribute('src')) f.src = 'runner.html';
      Screens.show('runner');
    },
    nation: () => Nation.start(),
    dly: () => Daily.start(),
    'dly-hint': () => Daily.hint(),
    'dly-retry': () => Daily.retry(),
    'dly-share': () => Daily.share(),
    'dly-giveup': () => Daily.giveup(),
    'pick-duo': () => Pick.start('duo'),
    'pick-solo': () => Pick.start('solo'),
    'coins-info': () => Shop.open(),
    shop: () => Shop.open(),
    chest: () => {
      if ((Store.d.ng.chest || '') === Day.key() || NG.dailyStatus().some(([, d]) => !d)) return;
      Store.d.ng.chest = Day.key(); Store.save();
      Coins.add(CHEST); confetti(); Sound.play('goal');
      toast(`Сундук открыт: +${CHEST} монет!`);
      renderDailyProgress();
    },
    b2b: () => TTT.start('timed'),
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
    Pass.bind(); Guess.bind(); Career.bind(); Club.bind(); Transfer.bind(); TTT.bind(); Compare.bind(); Auction.bind(); Nation.bind(); Pick.bind(); Daily.bind(); Shop.bind(); Board.bind();
    Howto.addButtons();
    Music.arm();
    document.addEventListener('pointerdown', (e) => {
      Coins.last = { x: e.clientX, y: e.clientY };
      // блик плитки из точки касания
      const t = e.target.closest && e.target.closest('.tile-card');
      if (t) { const r = t.getBoundingClientRect(); t.style.setProperty('--px', `${e.clientX - r.left}px`); t.style.setProperty('--py', `${e.clientY - r.top}px`); }
    }, true);
    document.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { Sound.play('tap'); tab(tb.dataset.tab); return; }
      const ct = e.target.closest('#cat-nav [data-cat]');
      if (ct) { Sound.play('tap'); haptic('tap'); setCat(ct.dataset.cat); return; }
      const lockedTile = e.target.closest('.locked');
      if (lockedTile) { Sound.play('tap'); Unlock.ask(Unlock.keyOf(lockedTile), renderHub); return; }
      const tile = e.target.closest('.tile-card, .card, .recent-tile, .runner-hero');
      if (tile) { Unlock.seen(tile); User.remember(tile); if (Screens.current === 'hub') scrollMem[panel] = scrollY; }
      const el = e.target.closest('[data-act]');
      if (el && el.tagName === 'A') e.preventDefault();
      if (el && actions[el.dataset.act]) { actions[el.dataset.act](); Howto.forAct(el.dataset.act); return; }
      const ng = e.target.closest('[data-ng]');
      if (ng) { NG.open(ng.dataset.ng); Howto.auto('ng-' + ng.dataset.ng); return; }
      const pz = e.target.closest('[data-pz]');
      if (pz) { PZ.choose(pz.dataset.pz); Howto.auto(pz.dataset.pz); }
    });
    // Нижнее меню видно только на главной и в профиле
    const orig = Screens.show.bind(Screens);
    Screens.show = (id) => {
      if (Screens.current === 'runner' && id !== 'runner') $('#runner-frame').removeAttribute('src');
      if (Screens.current === 'ng' && id !== 'ng') NG.leave();
      orig(id);
      document.body.classList.toggle('in-runner', id === 'runner');
      $('#tabbar').hidden = !(id === 'hub' || id === 'profile' || id === 'shop' || id === 'board');
      tabs();
      try { if (TG && TG.BackButton) id === 'hub' ? TG.BackButton.hide() : TG.BackButton.show(); } catch (e) { /* не в Telegram */ }
    };
    try {
      if (TG && TG.BackButton) TG.BackButton.onClick(() => (Screens.current === 'pass-game' ? Pass.openLevels() : home()));
    } catch (e) { /* не в Telegram */ }
    // Ссылка вида ...#pass открывает игру сразу
    let h = location.hash.replace('#', '');
    try { if (TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param) h = TG.initDataUnsafe.start_param; } catch (e) { /* не в Telegram */ }
    const deep = { board: 'board', top: 'board', puzzles: 'puzzles', pass: 'pass-levels', guess: 'guess-career', duel: 'guess-duel', career: 'career', club: 'club', transfer: 'transfer', hl: 'hl', ttt: 'ttt', auction: 'auction-bot', fc: 'fc', value: 'value', runner: 'runner', nation: 'nation', daily: 'dly', pick: 'pick-duo', legend: 'pick-solo', profile: 'profile', shop: 'shop' };
    renderHub();
    if (Duel.deep(h)) { /* вызов на дуэль или комната */ }
    else if (h !== 'puzzles' && (PANELS.includes(h) || CATS.includes(h))) { home(h); }
    else if (deep[h]) { actions[deep[h]](); Howto.forAct(deep[h]); }
    else if (NG.list.some((g) => g.id === h)) { if (h === 'box2box') actions.b2b(); else NG.open(h); Howto.auto('ng-' + h); }
    else { Screens.show('hub'); User.ensure(); }
    // облако Telegram: если там сохранение новее (зашёл с другого устройства) — подхватываем его
    Cloud.pull().then((got) => {
      Board.submit();
      if (!got) return;
      Shop.apply(); Coins.render();
      if (Screens.current === 'hub') { renderHub(); if (Store.d.user.nick && $('#nick-in')) Modal.close(); }
      toast('Прогресс загружен из облака Telegram ☁️');
    });
  }

  return { init, home };
})();

App.init();
