// Таблица лидеров канала: опыт за неделю, за всё время и «Игрок дня» сегодня.
// Очки хранит сервер (server/worker.js); кто прислал результат, он узнаёт по подписи Telegram,
// поэтому рейтинг работает только внутри Telegram и когда в js/config.js указан адрес сервера.
'use strict';

const Board = (() => {
  const api = () => CONFIG.api || CONFIG.donateApi || '';
  const ready = () => !!(api() && TG && TG.initData);
  let timer = null, scope = 'week', cache = {};
  const SCOPES = [['week', 'Неделя'], ['all', 'Всё время'], ['day', 'Игрок дня']];

  const post = (path, body) => fetch(api() + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData, ...body }),
  }).then((r) => r.json());

  // Отправить свои очки: после каждой игры (раз в пару секунд, не чаще)
  function submit() {
    if (!ready()) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const d = Store.d, s = d.dly;
      const body = { xp: d.stats.xp, nick: d.user.nick, emoji: d.user.emoji };
      if (s && s.done && s.day) body.dly = { day: s.day, tries: s.ev.length, won: !!s.won };
      try { await post('/score', body); cache = {}; } catch (e) { /* нет сети — отправим в следующий раз */ }
    }, 2000);
  }

  const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
  const unit = (sc, v) => (sc === 'day' ? `с ${v}-й попытки` : `${v.toLocaleString('ru-RU')} ${sc === 'week' ? 'оч.' : 'опыта'}`);
  function left(t) {
    const ms = t - Date.now();
    if (ms <= 0) return '';
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return d ? `${d} д ${h} ч` : `${h} ч ${Math.floor((ms % 36e5) / 6e4)} мин`;
  }

  function render(data) {
    const box = $('#board-body');
    const bt = $('#bd-tour'); if (bt) bt.textContent = `Тур ${Release.tour()}${data && data.weekEnd ? ` · до конца ${left(data.weekEnd)}` : ''}`;
    const tabs = `<nav class="bd-tabs">${SCOPES.map(([k, n]) => `<button data-bd="${k}" class="${k === scope ? 'on' : ''}">${n}</button>`).join('')}</nav>`;
    if (!api()) {
      box.innerHTML = `${tabs}<div class="bd-empty"><span>🏆</span><h3>Рейтинг канала скоро запустится</h3><p>Здесь будут лучшие игроки недели и всех времён. Играй — опыт уже копится и попадёт в таблицу.</p></div>`;
      return;
    }
    if (!TG || !TG.initData) {
      box.innerHTML = `${tabs}<div class="bd-empty"><span>📱</span><h3>Рейтинг работает в Telegram</h3><p>Открой игры через бота <b>@JacksonGamesbot</b> — там твои очки попадут в таблицу канала.</p></div>`;
      return;
    }
    if (!data) { box.innerHTML = `${tabs}<div class="bd-empty"><div class="bd-spin"></div><p>Загружаем таблицу…</p></div>`; return; }
    if (data.error) { box.innerHTML = `${tabs}<div class="bd-empty"><span>📡</span><h3>Не удалось загрузить</h3><p>Проверь интернет и попробуй ещё раз.</p><button class="btn gold" data-bd="${scope}">Обновить</button></div>`; return; }
    const head = scope === 'week' ? `Неделя закончится через ${left(data.weekEnd)}. Очки — опыт за победы с понедельника 10:00 (по Европе).`
      : scope === 'day' ? 'Кто быстрее всех угадал сегодняшнего «Игрока дня». Подсказки тоже считаются попыткой.'
        : 'Весь опыт за победы во всех играх.';
    const rows = data.rows.map((r, i) => `<div class="bd-row ${r.me ? 'me' : ''} ${i < 3 ? 'top' : ''}" style="--i:${Math.min(i, 15)}">
        <b class="bd-place">${medal(i + 1)}</b><span class="bd-emo">${esc(r.emoji || '⚽')}</span><span class="bd-nick">${esc(r.nick)}</span><em>${unit(scope, r.score)}</em></div>`).join('');
    const mine = data.me && !data.rows.some((r) => r.me)
      ? `<div class="bd-row me pinned"><b class="bd-place">${data.me.place}</b><span class="bd-emo">${esc(Store.d.user.emoji)}</span><span class="bd-nick">${esc(Store.d.user.nick || 'Ты')}</span><em>${unit(scope, data.me.score)}</em></div>` : '';
    const you = data.me ? `<div class="bd-you">Ты <b>${data.me.place}-й</b> из ${data.total}</div>`
      : `<div class="bd-you muted">${scope === 'day' ? 'Угадай «Игрока дня», чтобы попасть в таблицу' : 'Выиграй любую игру, чтобы попасть в таблицу'}</div>`;
    box.innerHTML = `${tabs}<p class="bd-head">${head}</p>${you}
      ${data.rows.length ? `<div class="bd-list">${rows}</div>` : '<div class="bd-empty"><span>🌱</span><p>Пока никого — будь первым!</p></div>'}${mine}`;
  }

  async function load(sc = scope, force = false) {
    scope = sc;
    if (!ready()) return render();
    if (cache[sc] && !force) return render(cache[sc]);
    render(null);
    try {
      const r = await post('/top', { scope: sc });
      if (!r.ok) throw new Error(r.error);
      cache[sc] = r;
      if (sc === 'week') { Store.d.boardPlace = r.me ? { place: r.me.place, total: r.total, week: r.weekEnd } : null; Store.save(true); }
      if (scope === sc && Screens.current === 'board') render(r);
    } catch (e) { if (scope === sc) render({ error: true }); }
  }

  function open() {
    Modal.close();
    Screens.show('board');
    load(scope);
  }

  function bind() {
    $('#board-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bd]');
      if (b) { Sound.play('tap'); load(b.dataset.bd, b.classList.contains('btn')); }
    });
  }

  // Плашка на главной: твоё место в рейтинге недели (по последней загрузке)
  function teaser() {
    const p = Store.d.boardPlace;
    if (!ready() || !p || p.week < Date.now()) return '';
    return `🏆 Ты <b>${p.place}-й</b> в рейтинге недели из ${p.total}`;
  }

  return { submit, open, bind, teaser, ready };
})();
