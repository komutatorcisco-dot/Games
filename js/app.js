// Хаб: главное меню, профиль, бонус дня, навигация.
'use strict';

const App = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  // Серия входов: 1-й день 30 монет, каждый следующий +10, на 7-й — 100, дальше снова с начала.
  const dailyReward = (d) => (d >= 7 ? 100 : 20 + d * 10);
  const nextDay = () => (Store.d.lastDaily === yesterday() ? (Store.d.dailyStreak % 7) + 1 : 1);

  const ACHIEVEMENTS = [
    ['Первый гол', 'Пройди уровень в «Пас в ворота»', () => Store.d.pass.unlocked > 1, 'act:pass-levels'],
    ['Хет-трик звёзд', '10 уровней на три звезды', () => Object.values(Store.d.pass.stars).filter((s) => s === 3).length >= 10, 'act:pass-levels'],
    ['Финал тура', 'Пройди 10 уровней пазла', () => Store.d.pass.unlocked > 10, 'act:pass-levels'],
    ['Скаут', 'Угадай 10 футболистов', () => Profile.wins('guess') >= 10, 'act:guess-career'],
    ['Историк', 'Угадай 10 карьер', () => Profile.wins('career') >= 10, 'act:career'],
    ['Клубный эксперт', 'Угадай 10 клубов', () => Profile.wins('club') >= 10, 'act:club'],
    ['Трансферный гуру', 'Серия 10 в «Куда перешёл?»', () => Store.d.transfer.best >= 10, 'act:transfer'],
    ['Финансист', 'Серия 10 в «Дороже или дешевле»', () => Store.d.transfer.hlBest >= 10, 'act:hl'],
    ['Тики-така', 'Заполни всю сетку Тики-Така-Тоу', () => Store.d.ttt.wins >= 1, 'act:ttt'],
    ['Геймер', 'Серия 10 в «Кто выше в FC 27?»', () => Store.d.compare.fcBest >= 10, 'act:fc'],
    ['Скаут-оценщик', 'Серия 10 в «Кто дороже?»', () => Store.d.compare.valBest >= 10, 'act:value'],
    ['Богач', 'Накопи 1000 монет', () => Store.d.coins >= 1000],
    ['Головоломщик', 'Пройди 30 уровней головоломок', () => Profile.wins('pz') >= 30, 'pz:sort'],
    ['Неделя с нами', 'Заходи 7 дней подряд', () => Store.d.dailyStreak >= 7],
    ['Сборник', 'Серия 10 в «Угадай сборную»', () => Store.d.nation.best >= 10],
    ['Игрок дня', 'Угадай игрока дня', () => Store.d.dly.wins >= 1],
    ['Неделя без промаха', 'Серия 7 в «Игроке дня»', () => Store.d.dly.best >= 7],
    ['Агент', 'Выиграй аукцион', () => Store.d.auction.wins >= 1],
    ['Суперагент', 'Выиграй 10 аукционов', () => Store.d.auction.wins >= 10],
    ['Дуэлянт', 'Выиграй футбольную дуэль', () => ((Store.d.fduel && Store.d.fduel.hist) || []).some((x) => x.res === 'win')],
    ['Профи', 'Получи звание «Профи»', () => Store.d.stats.xp >= 800],
    ['Старик Джексон', 'Высшее звание', () => Store.d.stats.xp >= 4000],
  ];

  const TROPHY = { 'Первый гол': 'ball', 'Хет-трик звёзд': 'star', 'Финал тура': 'finish', 'Скаут': 'search', 'Историк': 'scroll', 'Клубный эксперт': 'shield', 'Трансферный гуру': 'plane',
    'Финансист': 'coin', 'Тики-така': 'hash', 'Геймер': 'gamepad', 'Скаут-оценщик': 'gem', 'Богач': 'coin', 'Головоломщик': 'puzzle', 'Неделя с нами': 'flame', 'Сборник': 'flag',
    'Игрок дня': 'trophy', 'Неделя без промаха': 'target', 'Агент': 'medal1', 'Суперагент': 'crown', 'Дуэлянт': 'bolt', 'Профи': 'medal', 'Старик Джексон': 'elder' };
  function rankUi(nameSel, barSel, nextSel) {
    const r = Profile.rank();
    $(nameSel).textContent = r.name;
    const pct = r.to ? Math.round(((r.xp - r.from) / (r.to - r.from)) * 100) : 100;
    $(barSel).style.width = pct + '%';
    $(nextSel).textContent = r.to ? `${r.xp} / ${r.to} опыта до звания «${r.nextName}»` : `${r.xp} опыта · максимум`;
  }

  function renderHub() {
    safe('meta', () => {
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
    });
    safe('daily-card', () => { Daily.hubCard(); });
    safe('ng-tiles', () => { ['daily', 'brain', 'grid', 'cards', 'hist'].forEach((g) => { $('#ng-' + g).innerHTML = NG.tiles(g); }); });
    const dh = (Store.d.fduel && Store.d.fduel.hist) || [];
    $('#duel-stat').textContent = dh.length ? `Сыграно дуэлей: ${dh.length} · побед: ${dh.filter((x) => x.res === 'win').length}` : '';
    if (!cat) cat = (Store.d.ui && Store.d.ui.cat) || 'guess';
    $$('#cat-nav [data-cat]').forEach((c) => {
      const n = $$(`.cat[data-cat="${c.dataset.cat}"] :is(.tile-card, .game-card, .auction-hero)`).length;
      c.dataset.n = n;
    });
    const total = $$('#panel-games :is(.tile-card, .game-card, .auction-hero)').length + $$('#panel-friends .tile-card').length + 1;
    $('#all-count').textContent = `${total} ${plural(total, 'игра', 'игры', 'игр')} по разделам`;
    safe('release', () => { applyRelease(); });
    setCat(cat, false);
    safe('board', () => { const bt = Board.teaser(); $('#board-teaser').hidden = !bt; $('#board-teaser').innerHTML = bt; });
    safe('daily-progress', () => { renderDailyProgress(); });
    $('#lim-auction').textContent = Limits.label('auction');
    $('#lim-pick').textContent = Limits.label('pick');
    safe('icons', () => { Icons.fill($('#hub')); });
    $('#daily').hidden = Store.d.lastDaily === today();
    safe('wheel', () => { $('#wheel-btn').hidden = !Wheel.ready(); });
    if (!$('#daily').hidden) {
      const day = nextDay();
      $('#daily-text').textContent = `день ${day}, забери +${dailyReward(day)}`;
      $('#daily-days').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) =>
        `<i class="${d < day ? 'got' : d === day ? 'now' : ''}"><small>${d}</small>${dailyReward(d)}</i>`).join('');
    }
    // шапка: звание и опыт коротко (подробно — в профиле)
    const rk = Profile.rank();
    $('#hub-rank').textContent = rk.name;
    $('#hub-next').textContent = rk.to ? `${rk.xp}/${rk.to}` : `${rk.xp}`;
    $('#hub-xp').style.width = `${rk.to ? Math.round(((rk.xp - rk.from) / (rk.to - rk.from)) * 100) : 100}%`;
    safe('user', () => { User.render(); Donate.render(); });
    Coins.render();
    safe('Rewards.refresh', () => Rewards.refresh());
  }

  // Ежедневные задания: прогресс и сундук за все пять
  const CHEST = 100;
  function renderDailyProgress() {
    const st = NG.dailyStatus(), done = st.filter(([, d]) => d).length, all = done === st.length;
    const claimed = (Store.d.ng.chest || '') === Day.key();
    // ежедневные игры — ряд маленьких плиток с галочкой; «Игрок дня» стоит отдельной карточкой выше
    const games = NG.list.filter((g) => g.group === 'daily' && Release.isOut('ng:' + g.id));
    const doneOf = (g) => { const d = (Store.d.ng[g.id] || {}).daily; return !!(d && d.day === Day.key() && d.done); };
    $('#dly-progress').innerHTML = `<div class="dp-row ${games.length <= 2 ? 'few' : ''}">${games.map((g) => `<button class="dp-game ${doneOf(g) ? 'ok' : ''}" data-ng="${g.id}" style="--c1:${g.c1};--c2:${g.c2}">
        <span class="tile-ico" data-ico="ng-${g.id}"></span><b>${esc(games.length <= 2 ? g.title : g.title.replace(/ дня$/, '').replace('Футбольный ', ''))}</b>${doneOf(g) ? '<i>✓</i>' : ''}</button>`).join('')}</div>
      <div class="dp-foot"><div class="dp-bar"><i style="width:${(done / st.length) * 100}%"></i></div><span>${done}/${st.length}</span></div>
      ${all && !claimed ? `<button class="btn gold dp-chest" data-act="chest">${Ui.get('gift')} Все задания сделаны — забрать сундук +${CHEST}</button>`
        : `<small class="dp-note">${claimed ? 'Сундук получен ✓ Новые задания в полночь по МСК' : `Сделай все ${st.length} задания дня и получи сундук: +${CHEST} монет`}</small>`}`;
    Icons.fill($('#dly-progress'));
    paint($('#dly-progress'));
  }

  function renderProfile() {
    rankUi('#prof-rank', '#prof-xp', '#prof-next');
    $('#prof-badge').textContent = Store.d.user.emoji || '⚽';
    // абонемент: с какого дня в игре, тур, опыт и место в таблице недели; ниже — настоящая статистика
    const xp = Store.d.stats.xp || 0, fd = (Store.d.fduel && Store.d.fduel.hist) || [], bp = Store.d.boardPlace;
    const since = Store.d.user.since; $('#tk-since').textContent = since ? since.slice(5).split('-').reverse().join('.') : '—';
    $('#tk-tour').textContent = Release.tour();
    $('#tk-xp').textContent = xp;
    $('#tk-place').textContent = bp && bp.week > Date.now() ? bp.place : '—';
    $('#pf-fstats').innerHTML = [
      ['угадано', (Store.d.dly && Store.d.dly.wins) || 0], ['лучшая серия', (Store.d.dly && Store.d.dly.best) || 0],
      ['побед в дуэлях', fd.filter((x) => x.res === 'win').length], ['аукционов', (Store.d.auction && Store.d.auction.wins) || 0],
      ['рекорд сборной', (Store.d.nation && Store.d.nation.best) || 0], ['тики-така', (Store.d.ttt && Store.d.ttt.wins) || 0],
    ].map(([k, v], i) => `<span class="pc-st"><i>${Ui.get(['eye', 'flame', 'swords', 'coin', 'flag', 'hash'][i])}</i><b>${v}</b><small>${k}</small></span>`).join('');
    $('#pc-tro').textContent = Rewards.S().trophies;
    $('#prof-nick').textContent = Store.d.user.nick || 'Игрок';
    const dh = (Store.d.fduel && Store.d.fduel.hist) || [];
    const stats = [
      ['опыт', Store.d.stats.xp],
      ['игроков дня', Store.d.dly.wins || 0],
      ['серия', Store.d.dly.best || 0],
      ['побед в дуэлях', dh.filter((x) => x.res === 'win').length],
    ];
    $('#prof-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    let got = 0;
    const achs = ACHIEVEMENTS.filter((a) => !a[3] || Release.isOut(a[3])); // только для вышедших игр
    $('#prof-achs').innerHTML = achs.map(([name, desc, test]) => {
      const ok = test(); if (ok) got++;
      return `<div class="ach ${ok ? 'ok' : ''}"><i>${Ui.get(TROPHY[name] || 'trophy')}</i><div><b>${name}</b><small>${desc}</small></div></div>`;
    }).join('');
    $('#pf-ach').textContent = `${got} из ${achs.length}`;
    $('#ach-sub').textContent = `${got} из ${achs.length}`;
    $('#prof-admin').hidden = !Store.d.admin;
    $('#prof-asplayer').hidden = !Store.d.admin;
    $('#set-asplayer').textContent = Store.d.ui && Store.d.ui.asPlayer ? 'Вкл' : 'Выкл';
    $('#set-wheel').textContent = safe('wheel', () => Wheel.ready()) ? 'Открыть' : 'Завтра';
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

  // ---------- какие игры видны (js/release.js): стартовые + вышедшие по неделям ----------
  const keyOf = (el) => (el.dataset.ng ? 'ng:' + el.dataset.ng : el.dataset.pz ? 'pz:' + el.dataset.pz : el.dataset.act ? 'act:' + el.dataset.act : '');
  let compact = false; // игр немного — все разделы подряд, без переключателя
  function applyRelease() {
    Release.refresh();
    $$('#hub :is(.tile-card, .game-card, .auction-hero)').forEach((el) => {
      if (el.closest('#featured, #recent')) return;
      const k = keyOf(el); if (!k) return;
      el.hidden = !Release.isOut(k);
      el.classList.toggle('is-soon', Release.soon(k)); // видно только админу: игра ещё не вышла
    });
    let visible = 0;
    $$('#panel-games .cat').forEach((c) => { const n = $$(':is(.tile-card, .game-card, .auction-hero):not([hidden])', c).length; c.dataset.n = n; visible += n; });
    $$('#cat-nav [data-cat]').forEach((b) => { const n = +$(`.cat[data-cat="${b.dataset.cat}"]`).dataset.n; b.dataset.n = n; b.hidden = !n; });
    compact = visible <= 14;
    $('#cat-nav').hidden = compact;
    $('#panel-games').classList.toggle('compact', compact);
    // «Игры» на главной: короткий список всех вышедших игр (ежедневные — выше, в заданиях дня)
    const src = $$('#panel-games .cat .tile-card:not([hidden]), #panel-friends > .tiles .tile-card:not([hidden])')
      .filter((el) => !['act:auction-duo', 'act:ttt-duo', 'act:guess-duel', 'act:career-duel'].includes(keyOf(el)));
    const extra = [
      `<button class="tile-card" data-act="auction-bot" style="--c1:#ff5f6d;--c2:#7b2b8a"><span class="tile-ico" data-ico="auction"></span><b>Аукцион</b><small>Против бота или вдвоём</small></button>`,
      `<button class="tile-card" data-ng="duel" style="--c1:#ff8a5c;--c2:#c2348d"><span class="tile-ico" data-ico="ng-duel"></span><b>Футбольная дуэль</b><small>С другом онлайн или рядом</small></button>`,
      `<button class="tile-card" data-act="xdraft" style="--c1:#34c46a;--c2:#2f6fe4"><span class="tile-ico" data-ico="ng-draft"></span><b>Драфт</b><small>Собери состав и сыграй матч</small></button>`,
      `<button class="tile-card" data-act="sbc" style="--c1:#5fe0d0;--c2:#5a46c8"><span class="tile-ico" data-ico="ng-draft"></span><b>ИПК</b><small>Сдавай карточки, получай паки</small></button>`,
    ];
    $('#featured').innerHTML = extra.join('');
    src.forEach((el) => { const c = el.cloneNode(true); c.classList.remove('wide', 'duo'); $$('.limit-note', c).forEach((x) => x.remove()); $('#featured').appendChild(c); });
    paint();
    safe('pitch', renderPitch);
    safe('home2', () => Home.render());
    // новинка недели и следующая игра
    const cur = Release.current(), nx = Release.next();
    const wk = $('#week-game');
    wk.hidden = !cur;
    if (cur) {
      const t = src.find((el) => cur.keys.includes(keyOf(el))) || $$('#hub :is(.tile-card, .game-card, .auction-hero)').find((el) => cur.keys.includes(keyOf(el)));
      wk.dataset.key = cur.keys[0];
      wk.innerHTML = `<span class="wg-tag">Новинка недели</span><b>${esc(cur.title)}</b><small>Новая игра этой недели. Сыграй первым</small>${t ? `<span class="tile-ico" data-ico="${esc(($('[data-ico]', t) || {}).dataset.ico || '')}"></span>` : ''}`;
    }
    const days = nx ? Math.ceil((nx.at - Date.now()) / 864e5) : 0;
    $('#unlock-next').innerHTML = nx ? `Следующая игра — <b>«${esc(nx.title)}»</b> — ${days <= 1 ? 'завтра' : `через ${days} ${plural(days, 'день', 'дня', 'дней')}`}, в понедельник в 10:00` : '';
    $('#all-count').textContent = `${visible + 1} ${plural(visible + 1, 'игра', 'игры', 'игр')}`;
  }

  // ---------- Поле: каждая вышедшая игра — фишка, «Игрок дня» — вратарь ----------
  const SHORT = { 'act:xdraft': 'Драфт', 'act:sbc': 'ИПК', 'ng:wordle': 'Wordle', 'act:nation': 'Сборная', 'act:pick-duo': 'Этого или того', 'act:pick-bot': 'Этого или того', 'act:auction-bot': 'Аукцион', 'ng:duel': 'Дуэль',
    'ng:trumps': 'Козыри', 'act:ttt': 'Тики-така', 'act:guess-career': 'Угадай игрока', 'act:career': 'Карьера', 'act:club': 'Клуб', 'act:transfer': 'Трансфер',
    'act:pick-solo': 'Легенды', 'act:fc': 'FC 27', 'act:value': 'Кто дороже', 'act:hl': 'Дороже?', 'act:pass-levels': 'Пас' };
  // сколько фишек в каждой линии — от защиты к атаке (как схема 4-3-3)
  function formation(n) {
    const rows = Math.max(1, Math.ceil(n / 3)), base = Math.floor(n / rows), extra = n % rows;
    return Array.from({ length: rows }, (_, i) => base + (i >= rows - extra ? 1 : 0));
  }
  addEventListener('resize', () => { if (Screens.current === 'hub' && panel === 'home') renderPitch(); });
  function renderPitch() {
    const box = $('#pitch'); if (!box) return;
    const doneDaily = (id) => { const d = (Store.d.ng[id] || {}).daily; return !!(d && d.day === Day.key() && d.done); };
    const cur = Release.current(), curKeys = cur ? cur.keys : [];
    const items = NG.list.filter((g) => g.group === 'daily' && Release.isOut('ng:' + g.id))
      .map((g) => ({ data: { ng: g.id }, key: 'ng:' + g.id, ico: 'ng-' + g.id, title: g.title, badge: doneDaily(g.id) ? ['ok', '✓'] : null }));
    $$('#featured > *').forEach((el) => {
      const k = keyOf(el); if (!k || items.some((x) => x.key === k)) return;
      const note = (($('.limit-note', el) || {}).textContent || '').match(/(\d+)\s*из\s*(\d+)/);
      items.push({ data: { ...el.dataset }, key: k, ico: (($('[data-ico]', el) || {}).dataset || {}).ico || '', title: ($(':scope > b', el) || {}).textContent || '',
        badge: curKeys.includes(k) ? ['new', 'NEW'] : note ? ['', `${note[1]}/${note[2]}`] : null, soon: el.classList.contains('is-soon') });
    });
    // на поле — как в футболе — максимум 11; остальные сидят на скамейке запасных под полем
    const bench = items.splice(11);
    const nx = Release.next();
    const all = nx ? [...items, { soon: true, next: nx }] : items;
    const rows = formation(all.length);
    $('#pitch-form').textContent = `${[...rows].join('-')}`;
    // высота поля разная на разных телефонах: делим её на линии (+ вратарь) и уменьшаем фишки, если тесно
    const H = box.clientHeight || 520, slot = H / (rows.length + 1);
    const sc = Math.max(0.62, Math.min(1, (slot - 30) / 84));
    box.style.setProperty('--ts', sc.toFixed(3));
    const yOf = (k) => ((k + 0.5) * slot / H) * 100; // k = 0 — верхняя линия (атака)
    let i = 0;
    const html = rows.map((cnt, r) => {
      const y = yOf(rows.length - 1 - r);
      return Array.from({ length: cnt }, (_, j) => {
        const it = all[i++], x = cnt === 1 ? 50 : 13 + (74 * j) / (cnt - 1);
        if (it.next) {
          const d = Math.max(1, Math.ceil((it.next.at - Date.now()) / 864e5));
          return `<div class="tk soon" style="left:${x}%;top:${y}%"><span class="tok"><i>${items.length + 1}</i></span><b>${d <= 1 ? 'Завтра' : `Через ${d} дн`}</b></div>`;
        }
        const attrs = Object.entries(it.data).map(([a, v]) => `data-${a.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${esc(v)}"`).join(' ');
        return `<button class="tk ${it.badge && it.badge[0] === 'ok' ? 'done' : ''} ${it.soon ? 'is-soon' : ''}" ${attrs} style="left:${x}%;top:${y}%;--k:${kolor(it.key)}">
          <span class="tok"><span class="tile-ico" data-ico="${esc(it.ico)}"></span></span>${it.badge ? `<em class="${it.badge[0]}">${it.badge[1]}</em>` : ''}<b>${esc(SHORT[it.key] || it.title)}</b></button>`;
      }).join('');
    }).join('');
    box.innerHTML = html + `<button class="tk gk" data-act="dly" style="left:50%;top:${yOf(rows.length)}%"><span class="tok"><img src="img/players/239085.webp" alt=""><i>?</i></span><b>Игрок дня</b></button>`;
    const bb = $('#bench');
    bb.hidden = !bench.length;
    $('#bench-row').innerHTML = bench.map((it) => {
      const attrs = Object.entries(it.data).map(([a, v]) => `data-${a.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${esc(v)}"`).join(' ');
      return `<button class="tk bn ${it.soon ? 'is-soon' : ''}" ${attrs} style="--k:${kolor(it.key)}"><span class="tok"><span class="tile-ico" data-ico="${esc(it.ico)}"></span></span>${it.badge ? `<em class="${it.badge[0]}">${it.badge[1]}</em>` : ''}<b>${esc(SHORT[it.key] || it.title)}</b></button>`;
    }).join('');
    $('#bench-n').textContent = bench.length;
    Icons.fill(box); Icons.fill(bb);
    const s = Store.d.dly || {};
    $('#hub-streak').textContent = `🔥 ${s.streak || 0}`;
    $('#pitch-tour').textContent = `Тур ${Release.tour()}`;
  }
  // Новая игра недели: один раз за неделю — табло замены
  let giftShown = false; // подарочный пак сам открывается один раз за запуск
  function maybeSub() {
    const cur = Release.current(), ui = Store.d.ui || (Store.d.ui = {}), wk = Release.weekKey();
    if (!cur || ui.subWeek === wk || Modal.isOpen || !Store.d.user.nick) return;
    ui.subWeek = wk; Store.save();
    Sound.play('whistle'); haptic('ok');
    const t = $$('#hub :is(.tile-card, .game-card, .auction-hero)').find((el) => cur.keys.includes(keyOf(el)));
    const ico = t && $('[data-ico]', t) ? $('[data-ico]', t).dataset.ico : '';
    Modal.open(`<div class="sub-led"><span>▲</span><b>${$$('#pitch .tk:not(.gk):not(.soon)').length || ''}</b><small>Замена · новая игра недели</small></div>
      <h2 class="sub-h">На поле выходит «${esc(cur.title)}»</h2>${ico ? `<span class="sub-tok" style="--k:${kolor(cur.keys[0])}"><span class="tile-ico" data-ico="${esc(ico)}"></span></span>` : ''}`, [
      { label: 'Сыграть первым', cls: 'gold', onClick: () => { if (t) t.click(); } },
      { label: 'Позже', cls: 'ghost' },
    ]);
    Icons.fill($('.modal-card') || document);
  }

  // у каждой игры свой сочный цвет — одинаковый на главной, во вкладках и в заданиях дня
  const KOLORS = ['#c6f432', '#ff7a2f', '#ff5fa2', '#4fc3ff', '#ffd23f', '#a98bff', '#3ee6a8', '#ff4d4d'];
  const FIXED = { 'act:xdraft': '#34c46a', 'act:sbc': '#5fe0d0', 'ng:wordle': '#ffd23f', 'act:nation': '#3ee6a8', 'act:pick-duo': '#4fc3ff', 'act:auction-bot': '#ff7a2f', 'ng:duel': '#ff5fa2', 'ng:trumps': '#a98bff', 'act:ttt': '#4fc3ff', 'act:guess-career': '#c6f432' };
  function kolor(k) {
    if (FIXED[k]) return FIXED[k];
    let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return KOLORS[h % KOLORS.length];
  }
  function paint(root = document) {
    $$('#hub :is(.tile-card, .dp-game)', root).forEach((el) => { const k = el.classList.contains('dp-game') ? 'ng:' + el.dataset.ng : keyOf(el); if (k) el.style.setProperty('--k', kolor(k)); });
  }

  function showPanel(name, animate = true) {
    if (!PANELS.includes(name)) name = 'home';
    const from = PANELS.indexOf(panel), to = PANELS.indexOf(name);
    panel = name;
    document.body.dataset.panel = name; // газон — только на поле
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
    if (compact) { $$('#panel-games .cat').forEach((el) => { el.hidden = !+el.dataset.n; }); return; }
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
    $('#tab-rewards').classList.toggle('on', id === 'rewards');
    $('#tab-profile').classList.toggle('on', id === 'profile' || id === 'achievements');
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
    else { Track.maybeAsk(); claimDaily(); later(maybeSub, 1600); later(() => { if (!giftShown && Release.feature('cards') && Wheel.gift() && !Modal.isOpen && Screens.current === 'hub') { giftShown = true; Wheel.open(); } }, 2600); }
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
    rewards: () => Rewards.open(),
    road: () => Rewards.open('road'),
    collection: () => Rewards.open('cards'),
    xdraft: () => XDraft.open(),
    sbc: () => SBC.open(),
    squad: () => Squad.open(),
    'rw-packs': () => Rewards.openPending(),
    'rw-buy': () => Rewards.buyPass(),
    // позвать друга: ссылка с твоим id — кто откроет игры по ней, попадёт к тебе в «Друзья» в таблице
    invite: () => {
      const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
      if (!u) { toast('Открой игры через бота @JacksonGamesbot, чтобы позвать друга'); return; }
      Duel.share(`ref_${u.id}`, `${Store.d.user.emoji || '⚽'} ${Store.d.user.nick || 'Я'} зовёт тебя в футбольные игры «Стариков Джексонов» — посмотрим, кто выше в таблице!`);
    },
    achievements: () => { Modal.close(); renderProfile(); Screens.show('achievements'); window.scrollTo(0, 0); },
    report: () => Track.report(),
    // админ: посмотреть приложение глазами обычного игрока (открытия по трофеям, без скрытых игр)
    'as-player': () => {
      const ui = Store.d.ui || (Store.d.ui = {}); ui.asPlayer = !ui.asPlayer; Store.save();
      Release.refresh(); renderProfile();
      toast(ui.asPlayer ? 'Режим игрока: всё как у обычного игрока' : 'Режим админа: видны все игры');
    },
    terms: () => Modal.open(`<div class="terms"><h2>Условия</h2>
      <p>Игры бесплатные. За звёзды Telegram можно купить премиум-пропуск сезона и поддержать канал. Это цифровые товары внутри игры, на деньги они не обмениваются.</p>
      <p>Пропуск действует до конца сезона (28 дней) и появляется сразу после оплаты.</p>
      <p>Если покупка не пришла или списалась дважды, вернём звёзды. Напиши боту <b>/paysupport</b> и опиши, что случилось.</p>
      <p>Мы храним ник, прогресс и Telegram ID для таблицы лидеров. Никому их не передаём, удалим по просьбе через <b>/paysupport</b>.</p></div>`, [{ label: 'Понятно' }]),
    admin: () => Track.admin(),
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
    'pick-bot': () => Pick.start('bot'),
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
      toast(`Бонус за вход: +${dailyReward(day)} монет (день ${day} из 7)`);
      renderHub();
    },
    music: () => { Music.toggle(); renderProfile(); },
    sound: () => { Store.d.sound = !Store.d.sound; Store.save(); renderProfile(); Sound.play('tap'); },
  };

  function init() {
    Store.load();
    // каждый модуль подключаем отдельно: ошибка в одном не должна ломать весь экран
    [['Pass', () => Pass.bind()], ['Guess', () => Guess.bind()], ['Career', () => Career.bind()], ['Club', () => Club.bind()], ['Transfer', () => Transfer.bind()],
      ['TTT', () => TTT.bind()], ['Compare', () => Compare.bind()], ['Auction', () => Auction.bind()], ['Nation', () => Nation.bind()], ['Pick', () => Pick.bind()],
      ['Daily', () => Daily.bind()], ['Shop', () => Shop.bind()], ['Board', () => Board.bind()], ['Rewards', () => Rewards.bind()], ['XDraft', () => { XDraft.bind(); XMatch.bind(); }], ['SBC', () => SBC.bind()], ['Squad', () => Squad.bind()], ['Home', () => Home.bind()],
      ['Howto', () => Howto.addButtons()], ['Music', () => Music.arm()], ['Gate', () => Gate.start()]].forEach(([n, f]) => safe(n, f));
    document.addEventListener('pointerdown', (e) => {
      Coins.last = { x: e.clientX, y: e.clientY };
      // блик плитки из точки касания
      const t = e.target.closest && e.target.closest('.tile-card');
      if (t) { const r = t.getBoundingClientRect(); t.style.setProperty('--px', `${e.clientX - r.left}px`); t.style.setProperty('--py', `${e.clientY - r.top}px`); }
    }, true);
    document.addEventListener('click', (e) => {
      if (e.target.closest('#pitch .tk:not(.soon), #bench .tk')) { Sound.play('token'); haptic('tap'); }
      const tb = e.target.closest('[data-tab]');
      if (tb) { Sound.play('tap'); tab(tb.dataset.tab); return; }
      const ct = e.target.closest('#cat-nav [data-cat]');
      if (ct) { Sound.play('tap'); haptic('tap'); setCat(ct.dataset.cat); return; }
      const wg = e.target.closest('#week-game');
      if (wg) { const t = $$('#hub :is(.tile-card, .game-card, .auction-hero)').find((el) => keyOf(el) === wg.dataset.key); if (t) t.click(); return; }
      const tile = e.target.closest('.tile-card, .card, .recent-tile, .runner-hero');
      if (tile) { User.remember(tile); if (Screens.current === 'hub') scrollMem[panel] = scrollY; }
      // статистика: какую игру открыли
      const g = Screens.current === 'hub' && e.target.closest('[data-ng], [data-act], [data-pz]');
      if (g) {
        let k = keyOf(g);
        if (/^act:duel-/.test(k)) k = 'ng:duel';
        if (k === 'act:dly' || Release.known(k)) {
          const host = g.closest('.tile-card, .game-card, .auction-hero, .dp-game, .recent-tile, .dly-card') || g;
          const t = (host.querySelector(':scope > b, h2, .dly-card-title') || {}).textContent || (k === 'ng:duel' ? 'Футбольная дуэль' : '');
          Track.open(k, k === 'act:dly' ? 'Игрок дня' : t);
        }
      }
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
      document.body.dataset.scr = id;
      document.body.classList.toggle('in-runner', id === 'runner');
      $('#tabbar').hidden = !(id === 'hub' || id === 'profile' || id === 'shop' || id === 'board' || id === 'achievements' || id === 'rewards');
      tabs();
      try { if (TG && TG.BackButton) id === 'hub' ? TG.BackButton.hide() : TG.BackButton.show(); } catch (e) { /* не в Telegram */ }
    };
    try {
      if (TG && TG.BackButton) TG.BackButton.onClick(() => (Screens.current === 'pass-game' ? Pass.openLevels() : home()));
    } catch (e) { /* не в Telegram */ }
    // Ссылка вида ...#pass открывает игру сразу
    let h = location.hash.replace('#', '');
    try { if (TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param) h = TG.initDataUnsafe.start_param; } catch (e) { /* не в Telegram */ }
    const deep = { board: 'board', top: 'board', puzzles: 'puzzles', pass: 'pass-levels', guess: 'guess-career', duel: 'guess-duel', career: 'career', club: 'club', transfer: 'transfer', hl: 'hl', ttt: 'ttt', auction: 'auction-bot', fc: 'fc', value: 'value', runner: 'runner', nation: 'nation', daily: 'dly', pick: 'pick-duo', legend: 'pick-solo', profile: 'profile', shop: 'shop', xdraft: 'xdraft', sbc: 'sbc' };
    safe('renderHub', renderHub);
    if (Duel.deep(h)) { /* вызов на дуэль или комната */ }
    else if (h !== 'puzzles' && (PANELS.includes(h) || CATS.includes(h))) { home(h); }
    else if (deep[h]) { actions[deep[h]](); Howto.forAct(deep[h]); }
    else if (NG.list.some((g) => g.id === h)) { if (h === 'box2box') actions.b2b(); else NG.open(h); Howto.auto('ng-' + h); }
    else { Screens.show('hub'); User.ensure(); }
    claimDaily();
    // облако Telegram: если там сохранение новее (зашёл с другого устройства) — подхватываем его
    Cloud.pull().then((got) => {
      Board.submit();
      Track.hello();
      if (!got) return;
      Shop.apply(); Coins.render();
      if (Screens.current === 'hub') { renderHub(); if (Store.d.user.nick && $('#nick-in')) Modal.close(); }
      toast('Прогресс загружен из облака Telegram');
    });
  }

  // перерисовать главную/профиль (например, когда сервер сообщил, что это админ)
  // бонус за вход начисляется сам при первом заходе за день — без лишней кнопки на главной
  function claimDaily() { if (Store.d.lastDaily !== today()) later(() => actions.daily(), 900); }

  function refresh() { if (Screens.current === 'hub') renderHub(); if (Screens.current === 'profile') renderProfile(); }

  return { init, home, refresh };
})();

App.init();
