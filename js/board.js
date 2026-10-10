// Таблица лидеров канала: опыт за неделю, за всё время и «Игрок дня» сегодня.
// Очки хранит сервер (server/worker.js); кто прислал результат, он узнаёт по подписи Telegram,
// поэтому рейтинг работает только внутри Telegram и когда в js/config.js указан адрес сервера.
'use strict';

const Board = (() => {
  const api = () => CONFIG.api || CONFIG.donateApi || '';
  const ready = () => !!(api() && TG && TG.initData);
  let timer = null, scope = 'tro', cache = {};
  const SCOPES = [['tro', 'Трофеи'], ['week', 'Неделя'], ['game', 'По играм'], ['cup', 'Кубок драфта'], ['clubs', 'Клубы'], ['friends', 'Друзья'], ['all', 'Опыт'], ['day', 'Игрок дня']];
  let gsel = 'ng:wordle'; // какая игра выбрана в «По играм»

  const post = (path, body) => fetch(api() + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData, ...body }),
  }).then((r) => r.json());

  // Отправить свои очки: после каждой игры (раз в пару секунд, не чаще)
  function submit() {
    if (!ready()) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const d = Store.d, s = d.dly;
      const body = { xp: d.stats.xp, nick: d.user.nick, emoji: d.user.emoji, tro: typeof Rewards !== 'undefined' ? Rewards.S().trophies : Math.min(11000, (d.rw && d.rw.trophies) || 0) };
      // победы по играм — только те, что изменились с прошлой отправки (меньше записей в базу)
      const sent = (d.ui && d.ui.gwSent) || {}, gw = {};
      Object.entries(d.gw || {}).forEach(([k, v]) => { if (sent[k] !== v) gw[k] = v; });
      if (Object.keys(gw).length) body.gw = gw;
      if (d.cup && d.cup.week === Release.weekKey()) body.cup = d.cup;
      if (s && s.done && s.day) body.dly = { day: s.day, tries: s.ev.length, won: !!s.won };
      // ничего не поменялось с прошлой отправки — не дёргаем сервер
      const sig = JSON.stringify(body), u = d.ui || (d.ui = {});
      if (sig === u.scoreSig && Date.now() - (u.scoreAt || 0) < 6 * 3600e3) return;
      try { await post('/score', body); cache = {}; u.scoreSig = sig; u.scoreAt = Date.now(); u.gwSent = Object.assign({}, sent, gw); Store.save(true); } catch (e) { /* нет сети — отправим в следующий раз */ }
    }, 2000);
  }

  const medal = (n) => n;
  const unit = (sc, v) => (sc === 'day' ? `с ${v}-й попытки` : sc === 'tro' ? `${v.toLocaleString('ru-RU')} 🏆` : sc === 'game' ? `${v} ${plural(v, 'победа', 'победы', 'побед')}` : sc === 'cup' ? `${v} ${plural(v, 'кубок', 'кубка', 'кубков')}` : sc === 'clubs' ? `${v} ${plural(v, 'победа', 'победы', 'побед')}` : `${v.toLocaleString('ru-RU')} ${sc === 'week' || sc === 'friends' ? 'оч.' : 'опыта'}`);
  function left(t) {
    const ms = t - Date.now();
    if (ms <= 0) return '';
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return d ? `${d} д ${h} ч` : `${h} ч ${Math.floor((ms % 36e5) / 6e4)} мин`;
  }

  function render(data) {
    const box = $('#board-body');
    const bt = $('#bd-tour'); if (bt) bt.textContent = `Тур ${Release.tour()}${data && data.weekEnd ? ` · до конца ${left(data.weekEnd)}` : ''}`;
    const IC = { tro: 'trophy', week: 'clock', game: 'gamepad', cup: 'crown', clubs: 'shield', friends: 'users', all: 'bolt', day: 'eye' };
    const tabs = `<nav class="sr-rail bd-rail">${SCOPES.map(([k, n]) => `<button data-bd="${k}" class="sr-b ${k === scope ? 'on' : ''}"><span class="sr-i">${Ui.get(IC[k])}</span><small>${n}</small></button>`).join('')}</nav>`;
    const set = (html) => { box.innerHTML = `<div class="srw">${tabs}<div class="sr-main">${html}</div></div>`; };
    if (!api()) {
      set(`<div class="bd-empty"><span>${Ui.get('trophy')}</span><h3>Рейтинг канала скоро запустится</h3><p>Здесь будут лучшие игроки недели и всех времён. Играй — опыт уже копится и попадёт в таблицу.</p></div>`);
      return;
    }
    if (!TG || !TG.initData) {
      set(`<div class="bd-empty"><span>${Ui.get('phone')}</span><h3>Рейтинг работает в Telegram</h3><p>Открой игры через бота <b>@JacksonGamesbot</b> — там твои очки попадут в таблицу канала.</p></div>`);
      return;
    }
    if (!data) { set(`<div class="bd-empty"><div class="bd-spin"></div><p>Загружаем таблицу…</p></div>`); return; }
    if (data.error) { set(`<div class="bd-empty"><span>${Ui.get('signal')}</span><h3>Не удалось загрузить</h3><p>Проверь интернет и попробуй ещё раз.</p><button class="btn gold" data-bd="${scope}">Обновить</button></div>`); return; }
    const gname = (k) => { const g = typeof Home !== 'undefined' && Home.catalog().get(k); return g ? g.title.split(':')[0] : k; };
    const games = [...new Set(['ng:wordle', 'act:auction-bot', 'act:nation', 'act:pick-bot', 'ng:duel', 'act:ttt', 'ng:trumps', 'act:guess-career', 'act:xdraft', 'squad', ...Object.keys(Store.d.gw || {})])];
    const gpick = scope === 'game' ? `<div class="bd-games">${games.map((k) => `<button data-bdg="${esc(k)}" class="${k === gsel ? 'on' : ''}">${esc(k === 'act:pick-bot' ? 'Этого или того' : k === 'squad' ? 'Мой состав' : gname(k))}</button>`).join('')}</div>` : '';
    const head = scope === 'tro' ? 'У кого больше всего трофеев. Победа +12, матч +3, на выходных — ×2.'
      : scope === 'game' ? `Больше всех побед в игре «${esc(gsel === 'act:pick-bot' ? 'Этого или того' : gsel === 'squad' ? 'Мой состав' : gname(gsel))}».`
      : scope === 'cup' ? 'Кубок драфта недели: кто выиграл больше турниров драфта (до финала с Барселоной и Реалом). Первое место в понедельник получает легендарный пак.'
      : scope === 'clubs' ? 'Клубы недели: сумма побед всех игроков клуба с понедельника.'
      : scope === 'week' ? `Неделя закончится через ${left(data.weekEnd)}. Очки начисляются за победы с понедельника 10:00 (по Европе).`
      : scope === 'day' ? 'Кто быстрее всех угадал сегодняшнего «Игрока дня». Подсказки тоже считаются попыткой.'
        : scope === 'friends' ? 'Ты и друзья: те, кого ты позвал по своей ссылке, и тот, кто позвал тебя. Очки за эту неделю.'
          : 'Весь опыт за победы во всех играх.';
    const rows = data.rows.map((r, i) => `<div class="bd-row ${r.me ? 'me' : ''} ${i < 3 ? 'top' : ''}" style="--i:${Math.min(i, 15)}">
        <b class="bd-place">${medal(i + 1)}</b><span class="bd-emo">${esc(r.emoji || '⚽')}</span><span class="bd-nick">${esc(r.nick)}</span><em>${unit(scope, r.score)}</em></div>`).join('');
    const mine = data.me && !data.rows.some((r) => r.me)
      ? `<div class="bd-row me pinned"><b class="bd-place">${data.me.place}</b><span class="bd-emo">${esc(Store.d.user.emoji)}</span><span class="bd-nick">${esc(Store.d.user.nick || 'Ты')}</span><em>${unit(scope, data.me.score)}</em></div>` : '';
    const you = data.me ? `<div class="bd-you">Ты <b>${data.me.place}-й</b> из ${data.total}</div>`
      : `<div class="bd-you muted">${scope === 'day' ? 'Угадай «Игрока дня», чтобы попасть в таблицу' : 'Выиграй любую игру, чтобы попасть в таблицу'}</div>`;
    const inv = scope === 'friends' ? `<button class="btn gold bd-invite" data-act="invite">${data.rows.length <= 1 ? 'Позови друга и соревнуйтесь' : 'Позвать ещё друга'}</button>` : '';
    set(`${gpick}<p class="bd-head">${head}</p>${scope === 'friends' ? inv : scope === 'clubs' ? `<button class="btn gold bd-invite" data-act="myclub">${Ui.get('users')} Мой клуб</button>` : you}
      ${data.rows.length ? `<div class="bd-list">${rows}</div>` : `<div class="bd-empty"><span>${Ui.get('ball')}</span><p>Пока никого. Будь первым!</p></div>`}${mine}`);
  }

  async function load(sc = scope, force = false) {
    scope = sc;
    if (!ready()) return render();
    const ck = sc === 'game' ? 'game:' + gsel : sc;
    if (cache[ck] && !force) return render(cache[ck]);
    render(null);
    try {
      const r = await post('/top', { scope: sc, game: gsel });
      if (!r.ok) throw new Error(r.error);
      cache[ck] = r;
      if (sc === 'week') { Store.d.boardPlace = r.me ? { place: r.me.place, total: r.total, week: r.weekEnd } : null; Store.save(true); }
      if (scope === sc && Screens.current === 'board') render(r);
    } catch (e) { if (scope === sc) render({ error: true }); }
  }

  function open(sc) {
    Modal.close();
    Screens.show('board');
    load(typeof sc === 'string' ? sc : scope);
  }

  function bind() {
    $('#board-body').addEventListener('click', (e) => {
      const g = e.target.closest('[data-bdg]'); if (g) { gsel = g.dataset.bdg; Sound.play('tap'); load('game'); return; }
      const b = e.target.closest('[data-bd]');
      if (b) { Sound.play('tap'); load(b.dataset.bd, b.classList.contains('btn')); }
    });
  }

  // Плашка на главной: твоё место в рейтинге недели (по последней загрузке)
  function teaser() {
    const p = Store.d.boardPlace;
    if (!ready() || !p || p.week < Date.now()) return '';
    return `${Ui.get('trophy')} Ты <b>${p.place}-й</b> в рейтинге недели из ${p.total}`;
  }

  return { submit, open, bind, teaser, ready, post };
})();
