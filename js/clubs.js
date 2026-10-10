// Клубы игроков — как кланы в Clash Royale, только про футбол:
//  • Чат клуба: сообщения, запросы карточек и вызовы на товарищеский матч;
//  • Обмен карточками: раз в 7 часов просишь карточку (бронза — до 8 штук, серебро — до 4, золото — 1),
//    соклубники дарят свои повторки и получают монеты;
//  • Роли: президент, вице-президенты, капитаны, игроки — кто кого может повысить, понизить, исключить;
//  • Клубный сундук недели: 10 уровней, открываются победами всех участников — награду забирает каждый;
//  • Клубная лига: клубы соревнуются по победам за неделю, лучшие получают паки.
// Данные хранит сервер (POST /club). Вступить — по коду или по ссылке ?startapp=cl_<код>.
// Локально: Store.d.clubChest = { week, got: [уровни] }, Store.d.clubLeague = [недели, за которые приз забран].
'use strict';

const Clubs = (() => {
  const EMO = ['⚽', '🦁', '🦅', '🐺', '🔥', '⚡', '👑', '🐉', '🛡️', '🎯'];
  const ROLE = ['Игрок', 'Капитан', 'Вице-президент', 'Президент'];
  // награды уровней клубного сундука (каждый участник забирает сам)
  const CHEST = [{ coins: 60 }, { pack: 0 }, { coins: 120 }, { pack: 1 }, { coins: 200 }, { pack: 1 }, { pack: 2 }, { coins: 400 }, { pack: 2 }, { pack: 3 }];
  // призы клубной лиги за прошлую неделю
  const LEAGUE = [[1, { pack: 3 }, '1 место'], [3, { pack: 2 }, '2–3 место'], [10, { pack: 1 }, '4–10 место'], [999, { coins: 100 }, 'Участие']];
  const DON_COINS = { bronze: 5, silver: 10, gold: 50 }, NEED = { bronze: 8, silver: 4, gold: 1 };
  const GAMES = { duel: 'Футбольная дуэль', xdraft: 'Драфт', squad: 'Мой состав', trumps: 'Козыри' };
  let data = null, busy = false, loading = false, failed = false, tab = 'chat', poll = null; // data: null — не в клубе
  const api = () => typeof Board !== 'undefined' && Board.ready();
  async function call(body) {
    if (!api()) throw new Error('offline');
    const r = await Board.post('/club', { ...body, giftProtocol:1 });
    if (!r.ok) throw new Error(r.error || 'Ошибка');
    data = r.club;
    // старый сервер (ещё не обновился) присылает клуб без новых разделов
    if (data) data = Object.assign({ chat: [], reqs: [], gifts: [], league: { place: 0, clubs: 0, prevPlace: 0 }, myRole: data.owner ? 3 : 0, trophies: 0, descr: '', mintro: 0, nextReq: 0 }, data, { members: (data.members || []).map((m) => Object.assign({ role: 0, don: 0, seen: 0, uid: 0 }, m)) });
    if (data) data.nextReqAt = Date.now() + data.nextReq;
    gifts(); return data;
  }
  const box = () => $('#club-body');
  const onScreen = () => Screens.current === 'myclub';
  function open() { Modal.close(); Screens.show('myclub'); loading = !data; failed = false; render(); load(); startPoll(); }
  async function load() {
    try { await Promise.race([call({ act: 'get' }), new Promise((_, bad) => setTimeout(() => bad(new Error('timeout')), 10000))]); failed = false; } catch (e) { failed = true; }
    loading = false; if (onScreen()) render();
  }
  // чат обновляется сам, пока открыт экран клуба: раз в 15 секунд и только новые сообщения (бережём лимит базы)
  function startPoll() {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!onScreen()) { clearInterval(poll); poll = null; return; }
      if (!data || busy || document.hidden || tab !== 'chat') return;
      const last = data.chat.length ? data.chat[data.chat.length - 1].id : 0;
      try {
        const r = await Board.post('/club', { act: 'poll', after: last, giftProtocol:1 });
        if (!r || !r.ok || !data) return;
        if (r.club === null) { data = null; return render(); }
        data.reqs = r.reqs || data.reqs;
        data.battles = r.battles || [];
        data.gifts = r.gifts || []; gifts();
        if (r.chat && r.chat.length) data.chat = data.chat.concat(r.chat).slice(-60);
        if (onScreen() && tab === 'chat') renderTab(true);
      } catch (e) { /* нет сети — попробуем позже */ }
    }, 15000);
  }
  // подарки от соклубников приходят с сервера один раз — сразу в коллекцию
  function gifts() {
    if (!data || !data.gifts || !data.gifts.length) return;
    const received = Store.d.clubGiftIds || (Store.d.clubGiftIds = []);
    const pending = data.gifts.filter(g => Cards.get(g.card)); data.gifts = [];
    const list = pending.filter(g => !g.id || !received.includes(g.id));
    list.forEach(g => { if (g.id) received.push(g.id); });
    // Cards.add saves the receipt IDs and inventory together before acknowledgement.
    Cards.add(list.map((g) => g.card));
    const ids = pending.map(g => g.id).filter(Number.isSafeInteger);
    if (ids.length) Board.post('/club', { act:'giftAck', ids }).catch(() => {});
    if (!list.length) return;
    const by = [...new Set(list.map((g) => g.from))].slice(0, 3).join(', ');
    toast(`${Ui.get('gift')} ${list.length} ${plural(list.length, 'карточка', 'карточки', 'карточек')} в подарок от: ${esc(by)}`);
    Sound.play('coin'); haptic('ok');
  }

  // ---------- клубный сундук ----------
  const chestS = () => { const c = Store.d.clubChest; if (!c || c.week !== (data && data.week)) Store.d.clubChest = { week: data ? data.week : '', got: [] }; return Store.d.clubChest; };
  const tierOf = () => (data ? Math.min(10, Math.floor((data.wins / data.goal) * 10 + 1e-9)) : 0);
  const chestReady = () => (data ? Array.from({ length: tierOf() }, (_, i) => i).filter((i) => !chestS().got.includes(i)).length : 0);
  const leaguePrize = () => { if (!data || !data.league.prevPlace) return null; const got = Store.d.clubLeague || []; if (got.includes(data.prevWeek)) return null; return LEAGUE.find(([n]) => data.league.prevPlace <= n); };
  // сколько всего ждёт на главной (красная точка у «Клуба»)
  const pending = () => chestReady() + (leaguePrize() ? 1 : 0) + (data ? data.reqs.filter((r) => !r.me && Cards.spare(r.card) >= 2).length : 0);

  const ago = (t) => { const m = Math.floor((Date.now() - t) / 6e4); return m < 1 ? 'сейчас' : m < 60 ? `${m} мин` : m < 1440 ? `${Math.floor(m / 60)} ч` : `${Math.floor(m / 1440)} д`; };
  const seenTxt = (t) => (!t ? '' : Date.now() - t < 10 * 6e4 ? '<i class="kb-on"></i>в игре' : `был ${ago(t)} назад`);

  function render() {
    const b = box(); if (!b) return;
    if (!api()) { b.innerHTML = `<div class="bd-empty"><span>${Ui.get('users')}</span><h3>Клубы работают в Telegram</h3><p>Открой игры через бота @JacksonGamesbot.</p></div>`; return; }
    if (loading) { b.innerHTML = '<div class="bd-empty"><div class="bd-spin"></div><p>Загружаем клуб…</p></div>'; return; }
    if (failed && !data) { b.innerHTML = `<div class="bd-empty"><span>${Ui.get('signal')}</span><h3>Не удалось загрузить клуб</h3><p>Проверь интернет и попробуй ещё раз.</p><button class="btn gold" data-cl="retry">Обновить</button></div>`; return; }
    if (!data) {
      b.innerHTML = `<div class="cl-hero"><span class="cl-emb">${Ui.get('users')}</span><h3>Играй командой</h3>
          <p>Клуб — до 30 игроков. Чат, обмен карточками, товарищеские матчи, общий сундук недели и клубная лига с призами.</p></div>
        <div class="cl-card"><b>Создать свой клуб</b>
          <input id="cl-name" maxlength="20" placeholder="Название клуба" autocomplete="off">
          <div class="cl-emos">${EMO.map((e, i) => `<button data-clemo="${e}" class="${i ? '' : 'on'}">${e}</button>`).join('')}</div>
          <button class="btn gold" data-cl="create">Создать</button></div>
        <div class="cl-card"><b>Вступить по коду</b><div class="cl-join"><input id="cl-code" maxlength="6" placeholder="КОД" autocomplete="off" autocapitalize="characters"><button class="btn" data-cl="join">Вступить</button></div>
          <small>Код клуба есть у его участников — или вступай по ссылке-приглашению.</small></div>`;
      return;
    }
    const c = data, cr = chestReady(), lp = leaguePrize();
    const TABS = [['chat', 'Чат', 'send', c.reqs.filter((r) => !r.me && Cards.spare(r.card) >= 2).length], ['members', 'Состав', 'users', 0], ['chest', 'Сундук', 'gift', cr], ['league', 'Лига', 'trophy', lp ? 1 : 0]];
    b.innerHTML = `<div class="kb-head"><span class="kb-emb">${esc(c.emoji)}</span><div class="kb-ht"><h3>${esc(c.name)}</h3>
        <small><b>${Ui.get('trophy')} ${c.trophies.toLocaleString('ru-RU')}</b> · ${c.members.length}/${c.max} · код <em>${esc(c.code)}</em></small>
        ${c.descr ? `<p>${esc(c.descr)}</p>` : ''}${c.mintro ? `<small class="kb-min">Вступить: от ${c.mintro} 🏆</small>` : ''}</div>
        ${c.myRole >= 2 ? `<button class="kb-gear" data-cl="settings" aria-label="Настройки">${Ui.get('gear')}</button>` : ''}</div>
      <nav class="kb-tabs">${TABS.map(([k, n, ic, d]) => `<button data-cltab="${k}" class="${tab === k ? 'on' : ''}">${Ui.get(ic)}<span>${n}</span>${d ? `<i>${d}</i>` : ''}</button>`).join('')}</nav>
      <div class="kb-body"></div>`;
    renderTab();
  }

  function renderTab(keepScroll) {
    const b = $('.kb-body', box()); if (!b || !data) return;
    const c = data;
    if (tab === 'chat') {
      const feed = $('.kb-feed', b), atEnd = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
      const reqOf = (h) => c.reqs.find((r) => h.meta && (h.meta.requestId ? r.id === h.meta.requestId : r.uid === h.uid && r.card === h.meta.card && Math.abs(r.ts - h.ts) < 5000));
      const msg = (h) => {
        if (h.kind === 'sys') return `<div class="kb-sys">${esc(h.text)}</div>`;
        const who = `<span class="kb-who">${esc(h.emoji)} ${esc(h.nick)} <small>${ago(h.ts)}</small></span>`;
        if (h.kind === 'req') {
          const r = reqOf(h), card = Cards.get(h.meta.card); if (!card) return '';
          const need = r ? r.need : NEED[h.meta.rar] || 1, got = r ? r.got : 0, sp = Cards.spare(card.key);
          const can = r && !h.me && sp >= 2;
          return `<div class="kb-msg kb-req ${h.me ? 'me' : ''}">${who}<div class="kb-rq">${Cards.html(card, { w: 62 })}<div class="kb-rqb"><b>Просит карточку</b>
              ${r ? `<span class="kb-bar"><i style="width:${Math.min(100, (got / need) * 100)}%"></i><em>${got}/${need}</em></span>` : ''}
              ${!r ? '<small>Запрос закрыт</small>' : h.me ? '<small>Соклубники дарят свои повторки</small>'
                : can ? `<button class="btn gold kb-don" data-don="${r.id}">Подарить · +${DON_COINS[card.rar] || 5} <i class="coin"></i></button><small>У тебя ${sp} шт.</small>`
                : `<small>${sp ? 'Последнюю копию подарить нельзя' : 'У тебя нет такой карточки'}</small>`}</div></div></div>`;
        }
        if (h.kind === 'battle') {
          const active = (c.battles || []).some(r => r.game === h.meta.game && r.code === h.meta.code && r.uid === h.uid);
          return `<div class="kb-msg kb-bt ${h.me ? 'me' : ''}">${who}<div class="kb-btb"><span class="kb-swd">${Ui.get('swords')}</span><div><b>Товарищеский матч</b><small>${esc(GAMES[h.meta.game] || 'Матч')}</small></div>
            ${!active ? '<small>Вызов закрыт</small>' : h.me ? '<small>Ждём соперника</small>' : `<button class="btn gold" data-bt="${esc(h.meta.game)}:${esc(h.meta.code)}">Принять</button>`}</div></div>`;
        }
        return `<div class="kb-msg ${h.me ? 'me' : ''}">${h.me ? '' : who}<p>${esc(h.text)}</p></div>`;
      };
      const left = Math.max(0, Math.ceil(((c.nextReqAt || 0) - Date.now()) / 6e4));
      const chatHTML = `<div class="kb-feed">${c.chat.map(msg).join('') || '<div class="kb-sys">Здесь пока тихо. Напиши первым!</div>'}</div>
        <div class="kb-acts"><button class="btn kb-a" data-cl="req" ${left ? 'disabled' : ''}>${Ui.get('pack')} ${left ? `Через ${Math.floor(left / 60)} ч ${left % 60} мин` : 'Запросить карточку'}</button>
          <button class="btn kb-a" data-cl="battle">${Ui.get('swords')} Товарищеский</button></div>
        <div class="kb-say"><input id="kb-in" maxlength="200" placeholder="Сообщение клубу" autocomplete="off"><button class="btn gold" data-cl="say" aria-label="Отправить">${Ui.get('send')}</button></div>`;
      if (keepScroll && feed) {
        const fresh = document.createElement('div'); fresh.innerHTML = chatHTML;
        const oldTop = feed.scrollTop;
        feed.innerHTML = $('.kb-feed', fresh).innerHTML;
        $('.kb-acts', b).innerHTML = $('.kb-acts', fresh).innerHTML;
        if (!atEnd) feed.scrollTop = oldTop;
      } else b.innerHTML = chatHTML;
      const f = $('.kb-feed', b); if (f && (!keepScroll || atEnd)) f.scrollTop = f.scrollHeight;
      if (typeof Photos !== 'undefined') Photos.hydrate(b);
    } else if (tab === 'members') {
      const mine = c.myRole;
      b.innerHTML = `<div class="kb-sum"><span><b>${c.wins}</b><small>побед за неделю</small></span><span><b>${c.members.reduce((a, m) => a + m.don, 0)}</b><small>карточек подарено</small></span><span><b>${c.league.place || '—'}</b><small>место в лиге</small></span></div>
        <div class="kb-list">${c.members.map((m, i) => `<button class="kb-m ${m.me ? 'me' : ''}" data-mem="${m.uid}"><b class="kb-n">${i + 1}</b><span class="kb-me">${esc(m.emoji)}</span>
          <span class="kb-mi"><em>${esc(m.nick)}</em><small class="r${m.role}">${ROLE[m.role]}</small><small class="kb-seen">${m.me ? 'это ты' : seenTxt(m.seen)}</small></span>
          <span class="kb-ms"><b>${m.trophies} ${Ui.get('trophy')}</b><small>${m.wins} побед · ${m.don} подарено</small></span></button>`).join('')}</div>
        <button class="btn gold kb-wide" data-cl="invite">${Ui.get('send')} Позвать в клуб</button>
        <p class="kb-note">${mine >= 1 ? 'Нажми на игрока, чтобы повысить, понизить или исключить.' : 'Капитаны и выше могут исключать игроков, вице-президенты — повышать.'}</p>
        <button class="btn ghost kb-wide" data-cl="leave">Выйти из клуба</button>`;
    } else if (tab === 'chest') {
      const t = tierOf(), got = chestS().got, step = c.goal / 10;
      b.innerHTML = `<div class="kb-chest"><div class="kb-ch-top"><span class="kb-chi">${Ui.get('gift')}</span><div><b>Клубный сундук недели</b><small>Уровень ${t} из 10 · ${c.wins} / ${c.goal} побед</small></div></div>
          <span class="kb-bar big"><i style="width:${Math.min(100, (c.wins / c.goal) * 100)}%"></i></span>
          <p class="kb-note">Каждая победа любого участника двигает сундук. Каждый уровень открывает награду — её забирает каждый в клубе. Новый сундук — в понедельник.</p></div>
        <div class="kb-tiers">${CHEST.map((r, i) => { const L = Rewards.rewardLabel(r), open = i < t, mine = got.includes(i);
          return `<div class="kb-tier ${open ? 'open' : ''} ${mine ? 'got' : ''}"><span class="kb-tn">${i + 1}</span><span class="kb-ta">${L.art}</span><span class="kb-tt"><b>${esc(L.name)}</b><small>${Math.ceil(step * (i + 1))} побед</small></span>
            ${mine ? '<i class="kb-ok">✓</i>' : open ? `<button class="btn gold" data-chest="${i}">Забрать</button>` : `<i class="kb-lk">${Ui.get('lock')}</i>`}</div>`; }).join('')}</div>`;
    } else {
      const L = c.league, p = leaguePrize();
      b.innerHTML = `<div class="kb-lg"><span class="kb-lgp">${L.place ? `<b>${L.place}</b><small>место</small>` : '—'}</span><div><b>Клубная лига недели</b><small>${L.clubs} ${plural(L.clubs, 'клуб', 'клуба', 'клубов')} · очки — победы всех участников с понедельника</small></div></div>
        ${p ? `<div class="kb-prize"><b>Итог прошлой недели: ${data.league.prevPlace} место</b><small>Приз: ${esc(Rewards.rewardLabel(p[1]).name)}</small><button class="btn gold" data-cl="lprize">Забрать приз</button></div>` : ''}
        <div class="kb-tiers">${LEAGUE.map(([n, r, t]) => { const lb = Rewards.rewardLabel(r); return `<div class="kb-tier open"><span class="kb-tn">${n === 999 ? '·' : n}</span><span class="kb-ta">${lb.art}</span><span class="kb-tt"><b>${t}</b><small>${esc(lb.name)}</small></span></div>`; }).join('')}</div>
        <p class="kb-note">Призы раздаются каждому участнику клуба в понедельник — забери их здесь.</p>
        <button class="btn kb-wide" data-act="board-clubs">${Ui.get('trophy')} Таблица клубов</button>`;
    }
    if (typeof Icons !== 'undefined' && Icons.fill) Icons.fill(b);
  }

  // ---------- выбор карточки для запроса ----------
  function pickRequest() {
    const own = Object.keys(Store.d.cards && Store.d.cards.own || {}).map((k) => Cards.get(k)).filter((x) => x && NEED[x.rar])
      .sort((a, b2) => ['gold', 'silver', 'bronze'].indexOf(a.rar) - ['gold', 'silver', 'bronze'].indexOf(b2.rar) || b2.r - a.r);
    if (!own.length) { toast('Запросить можно только карточку, которая у тебя уже есть. Открой пак!'); return; }
    Modal.open(`<h3 class="sk-h">Какую карточку попросить?</h3><p class="sk-p">Бронза — соберёшь до 8 штук, серебро — до 4, золото — 1. Повторки потом можно сдать в ИПК.</p>
      <div class="kb-request-filter"><input id="kb-search" placeholder="Имя или клуб" autocomplete="off"><select id="kb-rarity" aria-label="Редкость"><option value="">Все редкости</option value="bronze">Бронза · 8 шт.</option value="silver">Серебро · 4 шт.</option value="gold">Золото · 1 шт.</option></select></div><p id="kb-found" class="sk-p"></p><div class="kb-pick" id="kb-request-cards"></div><button class="btn ghost" id="kb-more">Показать ещё</button>`, [{ label: 'Отмена', cls: 'ghost' }]);
    let limit = 48;
    const draw = () => {
      const q = $('#kb-search').value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim(), rarity = $('#kb-rarity').value;
      const found = own.filter(x => (!rarity || x.rar === rarity) && (!q || (x.name + ' ' + x.club).toLocaleLowerCase('ru').replace(/ё/g, 'е').includes(q)));
      $('#kb-found').textContent = `Найдено: ${found.length}. Выбери карточку для запроса.`;
      $('#kb-request-cards').innerHTML = found.slice(0, limit).map(x => `<button data-reqcard="${esc(x.key)}">${Cards.html(x, { w:70 })}<small>${esc(x.name)} · есть ${Cards.spare(x.key)}</small></button>`).join('');
      $('#kb-more').hidden = found.length <= limit;
      if (typeof Photos !== 'undefined') Photos.hydrate($('#modal') || document);
    };
    $('#kb-search').oninput = $('#kb-rarity').onchange = () => { limit = 48; draw(); };
    $('#kb-more').onclick = () => { limit += 48; draw(); }; draw();
    if (typeof Photos !== 'undefined') Photos.hydrate($('#modal') || document);
  }
  // ---------- товарищеский матч: создаём комнату и зовём весь клуб ----------
  function battle() {
    const post = game => async code => {
      await call({ act:'battle', game, code });
      toast('Вызов в чате клуба. Оставайся на экране ожидания!');
      const timer = setInterval(() => Board.post('/club', { act:'battlePulse', game, code }).catch(() => {}), 15000);
      return () => { clearInterval(timer); Board.post('/club', { act:'battleClose', game, code }).catch(() => {}); };
    };
    const opts = [{ label: 'Футбольная дуэль · вопросы', onClick: () => { Modal.close(); NG.open('duel', { mode: 'host', onCode: post('duel') }); } }];
    opts.push({ label:'Мой состав · против соклубника', onClick: () => { Modal.close(); Promise.resolve(Squad.open()).then(() => XMatch.online(Squad.CTX, undefined, post('squad'))); } });
    if (typeof Release === 'undefined' || Release.isOut('act:xdraft')) opts.push({ label: 'Драфт · матч составами', onClick: () => {
      Modal.close(); Promise.resolve(XDraft.open()).then(() => { if (XDraft.xiOf().every(Boolean)) XMatch.online(XMatch.DRAFT, undefined, post('xdraft')); else toast('Сначала собери драфт до конца'); }); } });
    if (typeof Release === 'undefined' || Release.isOut('ng:trumps')) opts.push({ label: 'Козыри · карточки', onClick: () => { Modal.close(); NG.open('trumps', { online: true, onCode: post('trumps') }); } });
    opts.push({ label: 'Отмена', cls: 'ghost' });
    Modal.open('<h3 class="sk-h">Товарищеский матч</h3><p class="sk-p">Вызов появится в чате клуба. Оставайся на экране ожидания, пока соклубник принимает его. Выход или отмена закрывают комнату.</p>', opts);
  }
  async function accept(v) {
    const [game, code] = v.split(':');
    if (busy) return;
    busy = true;
    try {
      const check = await Board.post('/club', { act:'battleCheck', game, code });
      if (!check.ok) { toast(check.error || 'Вызов уже закрыт'); await load(); return; }
    } catch (e) { toast('Не удалось проверить вызов. Попробуй ещё раз'); return; }
    finally { busy = false; }
    if (game === 'duel') return NG.open('duel', { mode: 'join', code });
    if (game === 'squad') return Promise.resolve(Squad.open()).then(() => XMatch.online(Squad.CTX, code));
    if (game === 'xdraft') return Promise.resolve(XDraft.open()).then(() => XMatch.online(XMatch.DRAFT, code));
    if (game === 'trumps') return NG.open('trumps', { online: code });
  }
  // ---------- игрок: повысить / понизить / исключить ----------
  function member(uid) {
    const m = data.members.find((x) => x.uid === uid); if (!m || m.me) return;
    const me = data.myRole, opts = [];
    if (me >= 2 && m.role < me && (m.role + 1 < me || me === 3)) opts.push({ label: m.role === 2 ? 'Передать президентство' : `Повысить: ${ROLE[m.role + 1]}`, onClick: () => run({ act: 'promote', uid }, 'Готово') });
    if (me >= 2 && m.role > 0 && m.role < me) opts.push({ label: `Понизить: ${ROLE[m.role - 1]}`, cls: 'ghost', onClick: () => run({ act: 'demote', uid }, 'Готово') });
    if (me >= 1 && m.role < me) opts.push({ label: 'Исключить из клуба', cls: 'ghost', onClick: () => run({ act: 'kick', uid }, `${m.nick} исключён`) });
    opts.push({ label: 'Закрыть', cls: 'ghost' });
    Modal.open(`<h3 class="sk-h">${esc(m.emoji)} ${esc(m.nick)}</h3><p class="sk-p">${ROLE[m.role]} · ${m.trophies} 🏆 · ${m.wins} побед за неделю · подарил ${m.don} ${plural(m.don, 'карточку', 'карточки', 'карточек')}</p>`, opts);
  }
  function settings() {
    const c = data;
    Modal.open(`<h3 class="sk-h">Настройки клуба</h3><div class="kb-set"><label>Описание<textarea id="kb-descr" maxlength="120" rows="3">${esc(c.descr)}</textarea></label>
      <label>Минимум трофеев для вступления<input id="kb-min" type="number" min="0" max="5000" step="10" value="${c.mintro}"></label>
      <div class="cl-emos">${EMO.map((e) => `<button data-clemo="${e}" class="${e === c.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>`, [
      { label: 'Сохранить', onClick: () => { const em = $('#modal .cl-emos .on'); run({ act: 'settings', descr: $('#kb-descr').value, mintro: +$('#kb-min').value || 0, emoji: em ? em.dataset.clemo : c.emoji }, 'Сохранено'); } },
      { label: 'Отмена', cls: 'ghost' }]);
  }

  async function run(body, ok) {
    if (busy) return; busy = true; Modal.close();
    try { await call(body); if (ok) toast(ok); } catch (e) { toast(e.message === 'offline' ? 'Нет связи с сервером' : e.message); }
    busy = false; render(); return data;
  }

  async function act(k) {
    if (busy) return;
    if (k === 'retry') { loading = true; render(); return load(); }
    if (k === 'create') {
      const name = ($('#cl-name').value || '').trim(); if (name.length < 2) { toast('Название — от 2 букв'); return; }
      const em = $('#club-body .cl-emos .on');
      tab = 'chat'; return run({ act: 'create', name, emoji: em ? em.dataset.clemo : '⚽' }, 'Клуб создан! Позови друзей');
    }
    if (k === 'join') { const code = ($('#cl-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 6) { toast('В коде 6 символов'); return; } tab = 'chat'; return run({ act: 'join', code }, 'Ты в клубе!'); }
    if (!data) return;
    if (k === 'leave') { Modal.open('<h3 class="sk-h">Выйти из клуба?</h3><p class="sk-p">Вернуться можно по коду или ссылке.</p>', [{ label: 'Выйти', onClick: () => run({ act: 'leave' }, 'Ты вышел из клуба') }, { label: 'Остаться', cls: 'ghost' }]); return; }
    if (k === 'invite') { Duel.share(`cl_${data.code}`, `${data.emoji} Вступай в мой клуб «${data.name}» в футбольных играх «Стариков Джексонов»! Код: ${data.code}`); return; }
    if (k === 'say') {
      const inp = $('#kb-in'), text = (inp && inp.value || '').trim(); if (!text) return;
      inp.value = ''; busy = true;
      try { await call({ act: 'say', text }); Sound.play('tap'); } catch (e) { toast(e.message); inp.value = text; }
      busy = false; renderTab(); return;
    }
    if (k === 'req') return pickRequest();
    if (k === 'battle') return battle();
    if (k === 'settings') return settings();
    if (k === 'lprize') {
      const p = leaguePrize(); if (!p) return;
      (Store.d.clubLeague = Store.d.clubLeague || []).push(data.prevWeek); Store.save();
      Rewards.giveReward(p[1], `КЛУБНАЯ ЛИГА · ${data.league.prevPlace} МЕСТО`); render(); return;
    }
  }
  async function donate(id) {
    const r = data.reqs.find((x) => x.id === id); if (!r) return;
    const card = Cards.get(r.card); if (!card || Cards.spare(card.key) < 2) { toast('Нужна лишняя копия этой карточки'); return; }
    if (busy) return; busy = true;
    try {
      const res = await Board.post('/club', { act: 'don', id });
      if (!res.ok) throw new Error(res.error || 'Ошибка');
      Cards.use([card.key]);
      Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(DON_COINS[card.rar] || 5);
      Store.save(); haptic('ok'); toast(`Подарено: ${card.name}`);
      await call({ act: 'get' });
    } catch (e) { toast(e.message); }
    busy = false; renderTab(true);
  }

  function bind() {
    const b = box(); if (!b) return;
    b.addEventListener('click', (e) => {
      const em = e.target.closest('[data-clemo]'); if (em) { $$('.cl-emos button', b).forEach((x) => x.classList.toggle('on', x === em)); Sound.play('tap'); return; }
      const t = e.target.closest('[data-cltab]'); if (t) { tab = t.dataset.cltab; Sound.play('tap'); render(); return; }
      const d = e.target.closest('[data-don]'); if (d) return donate(+d.dataset.don);
      const bt = e.target.closest('[data-bt]'); if (bt) { Sound.play('tap'); return accept(bt.dataset.bt); }
      const ch = e.target.closest('[data-chest]'); if (ch) {
        const i = +ch.dataset.chest, s = chestS(); if (s.got.includes(i) || i >= tierOf()) return;
        s.got.push(i); Store.save(); Rewards.giveReward(CHEST[i], `КЛУБНЫЙ СУНДУК · УРОВЕНЬ ${i + 1}`); renderTab(); render(); return;
      }
      const m = e.target.closest('[data-mem]'); if (m) { Sound.play('tap'); return member(+m.dataset.mem); }
      const a = e.target.closest('[data-cl]'); if (a && !a.disabled) { Sound.play('tap'); act(a.dataset.cl); }
    });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'kb-in') { e.preventDefault(); act('say'); } });
    // выбор карточки для запроса и эмблема в настройках — в окне Modal
    document.addEventListener('click', (e) => {
      const rc = e.target.closest('[data-reqcard]');
      if (rc) { const card = Cards.get(rc.dataset.reqcard); if (card) run({ act: 'req', card: card.key, rar: card.rar }, 'Запрос отправлен в чат клуба'); return; }
      const em = e.target.closest('#modal [data-clemo]'); if (em) { $$('#modal .cl-emos button').forEach((x) => x.classList.toggle('on', x === em)); }
    });
  }
  // ссылка-приглашение: cl_ABC123
  function deep(p) {
    const m = /^cl_([A-Z0-9]{6})$/.exec(p || ''); if (!m) return false;
    open(); setTimeout(() => { if (!data || data.code !== m[1]) call({ act: 'join', code: m[1] }).then(() => { toast('Ты вступил в клуб!'); render(); }).catch((e) => toast(e.message)); }, 600);
    return true;
  }
  // фоновая проверка для красной точки на главной
  function peek() {
    if (!api()) return Promise.resolve(0);
    // не чаще раза в час — красная точка не стоит лишних запросов к базе
    const u = Store.d.ui || (Store.d.ui = {}); if (Date.now() - (u.clubPeek || 0) < 36e5) return Promise.resolve(0);
    u.clubPeek = Date.now(); Store.save(true);
    return call({ act: 'get' }).then(() => pending()).catch(() => 0);
  }
  return { open, bind, deep, load, peek, pending: () => pending() };
})();
