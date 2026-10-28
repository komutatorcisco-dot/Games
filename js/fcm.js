// Новый вид игры «как FC Mobile» (макет, 27.10; только тестовая версия, только лёжа).
// Своя оболочка во весь экран: сверху профиль и валюта, в центре раздел, снизу меню
// «Команда · События · Играть · Задания · Магазин». Ничего не листается под кнопками Telegram — листается
// только содержимое раздела. Кнопки открывают уже существующие игры и покупки (data-act, data-coinpack, data-ss),
// поэтому прогресс, награды и цены не меняются. Событие «Николас Джексон» — макет: награды подключим позже
// с проверкой на сервере.
'use strict';

const FCM = (() => {
  const UI = () => Store.d.ui || (Store.d.ui = {});
  // старого вида больше нет (28.10): новый всегда; старая главная остаётся только для вертикального экрана
  const on = () => true;
  let tab = 'play', sub = { quests: 'day', store: 'top', events: 'jg' };
  let focusI = -1; // игрок, на которого наехала камера в «Команде»
  let bg3 = null; // 3D-стадион за меню (Arena3D.backdrop), null — нет WebGL или ещё грузится

  const TABS = [
    ['team', 'Команда', 'squad'], ['events', 'События', 'daily'], ['play', 'Играть', 'qplay'], ['quests', 'Задания', 'quests'], ['store', 'Магазин', 'shop'],
  ];
  // Свой набор значков в духе FC Mobile (27.10): белые заливки, одна толщина, вместо разнородных картинок-эмодзи
  const IC = {
    team: '<path d="M8.2 3 3 6.1l2.1 5 2-1V21h9.8V10.1l2 1L21 6.1 15.8 3c-.6 1.6-2 2.6-3.8 2.6S8.8 4.6 8.2 3z"/>',
    events: '<path fill-rule="evenodd" d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zM5 9v10h14V9zm7 1 1.4 2.9 3.1.4-2.3 2.2.6 3.1L12 17l-2.8 1.6.6-3.1-2.3-2.2 3.1-.4z"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/>',
    quests: '<path fill-rule="evenodd" d="M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1zm1 2v2h4V4zm5.6 6.2-5 5-2.3-2.3-1.5 1.5 3.8 3.8 6.5-6.5z"/>',
    store: '<path d="M2 3h3.1l.8 2.5H21l-2.3 8a2 2 0 0 1-1.9 1.5H9.3l.5 1.5H19V18.5H8.3a1 1 0 0 1-1-.7L4 5H2z"/><circle cx="9" cy="21" r="1.6"/><circle cx="17" cy="21" r="1.6"/>',
    daily: '<circle cx="10" cy="7.5" r="4"/><path d="M2 21c0-4.4 3.6-7.5 8-7.5 1.8 0 3.4.5 4.7 1.4-.4.8-.7 1.7-.7 2.6 0 1.3.4 2.5 1.2 3.5z"/><path d="M19.2 13.2c1.6 0 2.8 1 2.8 2.4 0 1-.6 1.6-1.4 2.1-.4.3-.6.5-.6 1v.3h-1.7v-.4c0-1 .5-1.5 1.1-1.9.5-.3.8-.6.8-1 0-.5-.4-.9-1-.9s-1.1.4-1.2 1l-1.6-.3c.3-1.4 1.3-2.3 2.8-2.3zm-.9 7.3h1.8V22h-1.8z"/>',
    online: '<path d="M13.5 2 4 13.5h6.2L9 22l10-12.2h-6.3z"/>',
    cards: '<path d="M8.5 3.5h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zm4.5 4.8-1 2.3-2.4.2 1.8 1.6-.5 2.4 2.1-1.3 2.1 1.3-.5-2.4 1.8-1.6-2.4-.2z"/><path d="M4.5 6.5v11a3 3 0 0 0 1 2.2V6.5z" opacity=".6"/>',
    gift: '<path d="M4 11h7v10H5a1 1 0 0 1-1-1zm9 0h7v9a1 1 0 0 1-1 1h-6zM3 7h18v3H3zm8.1-1.2C9.6 5.6 7 5 7 3.6 7 2.7 7.7 2 8.6 2c1.6 0 2.6 2.2 2.9 3.8zm1.8 0c.3-1.6 1.3-3.8 2.9-3.8.9 0 1.6.7 1.6 1.6 0 1.4-2.6 2-4.5 2.2z"/>',
    target: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
    puzzle: '<path d="M10 2.5a2.5 2.5 0 0 1 2.5 2.5V6H17a1 1 0 0 1 1 1v4.5h1a2.5 2.5 0 0 1 0 5h-1V21a1 1 0 0 1-1 1h-4.5v-1.2a2.5 2.5 0 0 0-5 0V22H3a1 1 0 0 1-1-1v-4.5h1.2a2.5 2.5 0 0 0 0-5H2V7a1 1 0 0 1 1-1h4.5V5A2.5 2.5 0 0 1 10 2.5z"/>',
    bolt: '<path d="M13.5 2 4 13.5h6.2L9 22l10-12.2h-6.3z"/>',
    timer: '<path fill-rule="evenodd" d="M9 1h6v2H9zm3 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM11 8h2v5.2l3.4 2-1 1.7L11 14.3z"/>',
    star: '<path d="m12 2 3 6.3 6.9.9-5 4.8 1.2 6.8L12 17.6l-6.1 3.2L7.1 14l-5-4.8 6.9-.9z"/>',
  };
  const ico = (k, cls = '') => `<svg class="fm-ic ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${IC[k] || IC.star}</svg>`;
  const coin = '<i class="coin"></i>';
  const cup = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V5h3zm0 4H5v1a3 3 0 0 0 1.4 2.5A8 8 0 0 1 6 8zm12 0v1a8 8 0 0 1-.4 2.5A3 3 0 0 0 19 8V7z"/></svg>';
  const lock = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
  const trophies = () => (typeof Release !== 'undefined' && Release.trophies ? Release.trophies() : (Rewards.S().trophies || 0));

  // ---------- верх ----------
  function top() {
    const u = Store.d.user || {}, title = tab === 'play' ? '' : tab === 'coll' ? 'Коллекция' : tab === 'modes' ? 'Играть' : (TABS.find((t) => t[0] === tab) || [])[1];
    return `<header class="fm-top">
      ${title ? `<button class="fm-back" data-fm-tab="${tab === 'coll' ? 'team' : 'play'}" aria-label="Назад">‹</button><b class="fm-title">${title}</b>`
        : `<button class="fm-me" data-act="profile"><span class="fm-ava">${esc(u.emoji || '⚽')}</span><span class="fm-who"><b>${esc(u.nick || 'Игрок')}</b><small>${cup}${trophies()}</small></span></button>`}
      <i class="fm-sp"></i>
      <span class="fm-cur">${coin}<b class="coin-count">${Store.d.coins || 0}</b></span>
      <span class="fm-cur fm-tr">${cup}<b>${trophies()}</b></span>
    </header>`;
  }
  function nav() {
    return `<nav class="fm-nav">${TABS.map(([id, t, a]) => `<button class="fm-tab ${id === tab || (id === 'play' && tab === 'modes') ? 'on' : ''} ${id === 'play' ? 'play' : ''}" data-fm-tab="${id === 'play' ? 'modes' : id}">${ico(id, 'fm-ti')}<b>${t}</b>${id === 'quests' && questsReady() ? '<em class="fm-dot"></em>' : ''}</button>`).join('')}</nav>`;
  }

  // ---------- Играть (главная) ----------
  const MODES = [
    { id: 'mom', t: 'Моменты', d: 'Короткие атаки: забей за несколько секунд', ico: 'img/fcm/mode-mom.webp?v=2', cls: 'big lime' },
    { id: '3', t: 'Матч 3 на 3', d: 'Нападающий, защитник и вратарь из твоих карточек', ico: 'img/fcm/mode-three.webp?v=2', cls: 'blue' },
    { id: 'mgr', t: 'Менеджер', d: '«Мой состав» играет сам, ты смотришь', act: 'squad', ico: 'img/fcm/mode-mgr.webp?v=2', cls: 'dark' },
    { id: '11', t: '11 на 11 · тест', d: 'Полное поле, 5 минут', ico: 'img/fcm/mode-eleven.webp?v=2', cls: 'dark' },
    { id: 'train', t: 'Тренировки', d: 'Удары, дриблинг, штрафные', ico: 'img/fcm/mode-train.webp?v=2', cls: 'dark' },
  ];
  // Главная как в FC Mobile (28.10): слева столбик плиток, в центре большой баннер со слайдами, справа карточка
  // предложения, под ней «Клуб» (ОБЩ) и «Играть». Режимы — на отдельной странице «Играть» (modes()).
  const SLIDES = [
    { k: 'jg', small: 'Событие', t: 'Николас Джексон', d: 'Пройди путь главы — в конце особая карточка 84', btn: 'Перейти сейчас', go: 'data-fm-tab="events"', bg: 'jg' },
    { k: 'mom', small: 'Режим', t: 'Моменты', d: 'Короткие атаки своим составом: забей за 14 секунд', btn: 'Играть', go: 'data-fm-mode="mom"', bg: 'mom', img: 'img/fcm/player-kick.webp' },
    { k: 'pk', small: 'Магазин', t: 'Пак «Джексон!!»', d: '30 карт: минимум 1 «Джексон», 2 легенды и 6 золотых', btn: 'В магазин', go: 'data-fm-tab="store"', bg: 'pk', img: 'img/packs/pk4-360.webp' },
  ];
  let slideI = 0, slideT = 0;
  function play() {
    const jg = Cards.get('JG:nicolas-jackson'), inf = Squad.info ? Squad.info() : { r: 0 }, u = Store.d.user || {};
    const day = typeof Wheel !== 'undefined' && Wheel.ready(), dot = (on) => (on ? '<em class="fm-rd"></em>' : '');
    const tile = (attr, ic, t, on, extra = '') => `<button class="fm-lt" ${attr}>${dot(on)}${ic}<b>${t}</b>${extra}</button>`;
    const slide = (x, i) => `<div class="fm-sl ${x.bg} ${i === slideI ? 'on' : ''}" data-i="${i}">
        <i class="fm-sl-bg"></i>
        <span class="fm-sl-art">${x.k === 'jg' ? `${jg ? `<span class="fm-sl-card">${Cards.html(jg, { w: 150 })}</span>` : ''}<img class="fm-sl-man" src="img/fcm/player-stand.webp" alt="">` : `<img src="${x.img}" alt="">`}</span>
        <span class="fm-sl-t"><small>${x.small}</small><b>${x.t}</b><em>${x.d}</em><button class="fm-sl-go" ${x.go}>${x.btn}</button></span></div>`;
    return `<div class="fm-home">
      <div class="fm-hl">
        ${tile('data-fm-tab="events"', ico('events'), 'События', true)}
        ${tile('data-act="dly"', ico('daily'), 'Игрок дня', false)}
        ${typeof Wheel !== 'undefined' ? tile('data-act="wheel"', '<img src="img/packs/pk0-160.webp" alt="">', day ? 'Пак дня' : 'Завтра', day) : ''}
        ${tile('data-act="collection"', ico('cards'), 'Коллекция', false)}
      </div>
      <div class="fm-hero2">${SLIDES.map(slide).join('')}<span class="fm-dots">${SLIDES.map((_, i) => `<i class="${i === slideI ? 'on' : ''}" data-fm-slide="${i}"></i>`).join('')}</span></div>
      <div class="fm-hr">
        <button class="fm-feat" data-fm-tab="store"><b>Паки: открой свой клуб</b><span>${[1, 3, 4].map((l) => `<img src="img/packs/pk${l}-360.webp" alt="">`).join('')}</span></button>
        <div class="fm-hr2">
          <button class="fm-club" data-fm-tab="team"><b>Клуб</b><span><i class="fm-ovr"><small>ОБЩ</small><b>${inf.r || '—'}</b></i><i class="fm-crest">${esc(u.emoji || '⚽')}</i></span></button>
          <button class="fm-playt" data-fm-tab="modes"><b>Играть</b><img src="img/ui3d/ball.webp" alt=""></button>
        </div>
      </div>
    </div>`;
  }
  // страница «Играть»: все режимы плитками (как раньше на главной)
  function modes() {
    return `<div class="fm-play fm-modes-pg">
      <div class="fm-modes">${MODES.map((m) => `<button class="fm-mode ${m.cls}" ${m.act ? `data-act="${m.act}"` : `data-fm-mode="${m.id}"`}>${m.ico ? `<img class="fm-mi" src="${m.ico}" alt="">` : ''}<b>${m.t}</b><small>${m.d}</small></button>`).join('')}</div>
    </div>`;
  }
  function slideTo(i) {
    if (!root) return; slideI = (i + SLIDES.length) % SLIDES.length;
    root.querySelectorAll('.fm-sl').forEach((el) => el.classList.toggle('on', +el.dataset.i === slideI));
    root.querySelectorAll('[data-fm-slide]').forEach((el) => el.classList.toggle('on', +el.dataset.fmSlide === slideI));
  }
  function startMode(id) {
    if (id === 'train') return App.openFootball('fk', 'basics');
    const d = Store.d; if (!d.fb || typeof d.fb !== 'object') d.fb = {};
    d.fb.fmt = id === 'mom' ? 'mom' : +id; Store.save();
    Football.open(); // перед матчем — выбор состава и соперников, как сейчас
  }

  // ---------- Команда ----------
  // Есть 3D-фон — карточки стоят на настоящем газоне (позиции считает Arena3D.project), слева панель как в FC.
  // Нет WebGL — плоское поле, как раньше.
  function teamData() {
    const s = Squad.S(), F = XD.FORMATIONS[s.form], cards = s.xi.map((k) => (k && Cards.get(k) ? Cards.get(k) : null)), have = cards.filter(Boolean);
    const ovr = have.length ? Math.round(have.reduce((a, c) => a + c.r, 0) / have.length) : 0;
    const owned = Cards.all().filter((c) => Cards.spare && Cards.spare(c.key) > 0).length;
    return { s, F, cards, have, ovr, owned };
  }
  function team() {
    const { s, F, cards, have, ovr, owned } = teamData(), u = Store.d.user || {};
    const panel = `<div class="fm-tside">
        <div class="fm-club"><span class="fm-crest">${esc(u.emoji || '⚽')}</span><span class="fm-ovr"><small>ОБЩ</small><b>${ovr || '—'}</b></span></div>
        <div class="fm-stats"><span><small>Схема</small><b>${esc(s.form)}</b></span><span><small>Химия</small><b>${Squad.info ? Squad.info().chem : '—'}</b></span><span><small>Состав</small><b>${have.length}/11</b></span></div>
        <button class="fm-btn gold" data-fm-auto>Лучший состав</button>
        <button class="fm-btn" data-act="collection">Коллекция</button>
        <button class="fm-btn" data-act="sbc">Испытания (ИПК)</button>
      </div>`;
    if (bg3) return `<div class="fm-team is3d ${focusI >= 0 && cards[focusI] ? 'focus' : ''} ${swapI >= 0 ? 'swapping' : ''}">${panel}${swapBar()}${focusI >= 0 && cards[focusI] ? pinfo(cards[focusI], F.slots[focusI]) : ''}<div class="fm-cards">${F.slots.map((sl, i) => { const c = cards[i];
      return `<button class="fm-slot3 ${c ? 'on' : ''} ${i === focusI ? 'sel' : ''}" ${c ? `data-fm-pl="${i}"` : `data-fm-empty="${i}"`} data-i="${i}">${c ? Cards.html(c, { w: 64 }) : '<i>+</i>'}<em>${esc(XD.RU[sl.pos] || sl.pos)}</em></button>`; }).join('')}</div></div>`;
    // поле лёжа: атака вправо — вертикальная координата схемы становится горизонтальной
    return `<div class="fm-team">
      <div class="fm-pitch"><i class="fm-pl"></i>${F.slots.map((sl, i) => { const c = cards[i];
        return `<span class="fm-slot ${c ? 'on' : ''}" style="left:${100 - sl.y}%;top:${sl.x}%">${c ? Cards.html(c, { w: 46 }) : `<i>+</i><small>${esc(XD.RU[sl.pos] || sl.pos)}</small>`}</span>`; }).join('')}</div>
      ${panel}
    </div>`;
  }
  // точка схемы → точка поля (поле вдоль X, атака от камеры)
  const slotWorld = (sl, W, H) => [-W / 2 + 21 + ((93 - sl.y) / 77) * W * 0.47, ((sl.x - 50) / 100) * H * 0.86];
  // панель игрока при наезде камеры: цифры карточки, замена, листание по составу
  function pinfo(c, sl) {
    const gk = sl.pos === 'GK', N = gk ? ['НЫР', 'РУК', 'УДР', 'РЕА', 'СКР', 'ПОЗ'] : ['СКР', 'УДР', 'ПАС', 'ДРБ', 'ЗАЩ', 'ФИЗ'], st = (Cards.stats ? Cards.stats(c) : c.st) || Array(6).fill(c.r);
    return `<div class="fm-pinfo">
      <div class="fm-pi-h"><b class="fm-pi-r">${c.r}</b><span><b>${esc(c.name)}</b><small>${esc(XD.RU[sl.pos] || sl.pos)} · ${esc(c.club || c.series || '')}</small><small>${esc(c.flag || '')} ${esc(c.nat || '')}${c.lg ? ' · ' + esc(c.lg) : ''}</small></span></div>
      <div class="fm-pi-st">${N.map((n, i) => `<span><small>${n}</small><i><u style="width:${Math.max(4, Math.min(100, st[i]))}%" class="${st[i] >= 85 ? 'hi' : st[i] >= 70 ? 'mid' : 'lo'}"></u></i><b>${st[i]}</b></span>`).join('')}</div>
      <div class="fm-pi-btn"><button class="fm-btn" data-fm-step="-1" aria-label="Предыдущий">‹</button><button class="fm-btn gold" data-fm-swap>Заменить</button><button class="fm-btn" data-fm-step="1" aria-label="Следующий">›</button></div>
      <button class="fm-pi-x" data-fm-unfocus>Весь состав</button>
    </div>`;
  }
  function focusOn(i) {
    const s = Squad.S(), F = XD.FORMATIONS[s.form];
    swapI = -1;
    if (i < 0 || !F.slots[i] || !Cards.get(s.xi[i])) { focusI = -1; if (bg3) bg3.unfocus(); render(); return; }
    focusI = i; const [x, z] = slotWorld(F.slots[i], bg3.W, bg3.H); bg3.focus(x, z); render();
  }
  // замена игрока как в FC: снизу выезжает лента подходящих карточек, нажатие — карточка встаёт на место
  let swapI = -1, swapQ = '';
  function swapBar() {
    if (swapI < 0) return '';
    const sl = XD.FORMATIONS[Squad.S().form].slots[swapI], q = swapQ.trim().toLowerCase();
    const L = Squad.candidates(swapI).filter((x) => !q || x.c.name.toLowerCase().includes(q) || (x.c.club || '').toLowerCase().includes(q)).slice(0, 40);
    const cur = Squad.S().xi[swapI];
    return `<div class="fm-swap"><header><b>${esc(XD.RU[sl.pos] || sl.pos)} · выбери игрока</b><input class="fm-swq" type="search" placeholder="Поиск" value="${esc(swapQ)}" autocomplete="off">${cur ? '<button class="fm-btn sm" data-fm-rm>Убрать</button>' : ''}<button class="fm-sh-x" data-fm-swx aria-label="Закрыть">✕</button></header>
      <div class="fm-swl">${L.length ? L.map((x) => `<button class="fm-swc ${x.fit ? '' : 'off'} ${x.c.key === cur ? 'sel' : ''}" data-fm-pick="${esc(x.c.key)}">${Cards.html(x.c, { w: 70 })}${x.fit ? '' : '<em>не его позиция</em>'}</button>`).join('') : '<p class="fm-none">Нет свободных карточек — открывай паки в Магазине</p>'}</div></div>`;
  }
  function openSwap(i) { swapI = i; swapQ = ''; if (bg3) { const [x, z] = slotWorld(XD.FORMATIONS[Squad.S().form].slots[i], bg3.W, bg3.H); bg3.focus(x, z, true); } render(); const b = root.querySelector('.fm-swap'); if (b && typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b); }

  // 3D-игроки на газоне: одна модель assets3d/player.glb, форма/номер/внешность из карточки (js/playerkit.js).
  // Игроки крупнее настоящих (MAN), иначе с высоты камеры их не видно. Нет модели — остаются одни карточки.
  const MAN = 4.2, MAN_TOP = 1.45 * MAN;   // карточка чуть ниже макушки: подпись позиции ложится на голову
  let men = null, menKey = '', menFail = false, mixers = [], menT = 0;
  function syncMen() {
    if (!bg3 || !bg3.scene || typeof PlayerKit === 'undefined' || menFail) return;
    if (men) men.visible = tab === 'team';
    if (tab !== 'team') return;
    const s = Squad.S(), F = XD.FORMATIONS[s.form], key = s.form + '|' + s.xi.join(',');
    if (key === menKey) return;
    menKey = key;
    PlayerKit.load().then((g) => {
      if (menKey !== key || !bg3) return;
      if (men) { bg3.scene.remove(men); men.traverse((o) => { if (o.userData.mixer) PlayerKit.dispose(o); }); }
      mixers = [];
      men = new THREE.Group(); men.visible = tab === 'team';
      const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
      const disc = new THREE.CircleGeometry(0.45 * MAN, 20);
      F.slots.forEach((sl, i) => {
        const c = s.xi[i] && Cards.get(s.xi[i]); if (!c) return;
        const [x, z] = slotWorld(sl, bg3.W, bg3.H);
        const w = new THREE.Group();
        const man = PlayerKit.make(g, PlayerKit.forCard(c), 'stand');   // живая стойка: у каждого своё место анимации
        PlayerKit.play(man, sl.pos === 'GK' ? 'gk_idle' : 'idle', { fade: 0, at: ((i * 0.37) % 1) });
        mixers.push(man.userData.mixer); w.add(man);
        w.scale.setScalar(MAN); w.position.set(x, 0, z);
        w.rotation.y = -Math.PI / 2 + ((i % 3) - 1) * 0.18;   // лицом к камере, чуть вразнобой
        const sh = new THREE.Mesh(disc, shadow); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.02, z);
        men.add(w, sh);
      });
      bg3.scene.add(men); document.body.classList.add('fm-men'); placeCards();
    }).catch(() => { menFail = true; });   // без модели «Команда» работает как раньше — на карточках
  }
  // карточки на 3D-газоне: точка схемы → точка поля → экран; дальние меньше, ближние крупнее.
  // С 3D-игроками карточка висит над головой, у выбранного (наезд камеры) — прячется, виден сам игрок.
  function placeCards() {
    if (!bg3 || tab !== 'team' || !root) return;
    const els = [...root.querySelectorAll('.fm-slot3')]; if (!els.length) return;
    const F = XD.FORMATIONS[Squad.S().form], W = bg3.W, H = bg3.H, up = men && men.visible ? MAN_TOP : 0;
    if (up && mixers.length) { const now = performance.now(), dt = menT ? Math.min(0.1, (now - menT) / 1000) : 0; menT = now; mixers.forEach((m) => m.update(dt)); }
    const P = els.map((el) => { const sl = F.slots[+el.dataset.i]; if (!sl) return null;
      const [x, z] = slotWorld(sl, W, H), sel = +el.dataset.i === focusI, on = el.classList.contains('on'), p = bg3.project(x, z, on ? up : 0);
      return { el, sel, on, x: p.x, y: p.y, d: p.d, k: Math.max(0.62, Math.min(sel ? 1.6 : 0.98, 60 / p.d)) * (up && on ? 0.82 : 1) }; }).filter(Boolean);
    // без 3D-игроков на широких телефонах схема шире свободного места: вписываем её между панелью, шапкой и меню
    // (с игроками так нельзя — карточки уехали бы с голов)
    if (focusI < 0 && !up) {
      const side = root.querySelector('.fm-tside'), topb = root.querySelector('.fm-top'), navb = root.querySelector('.fm-nav');
      const L = (side ? side.getBoundingClientRect().right : 0) + 10, T = (topb ? topb.getBoundingClientRect().bottom : 0) + 4, B = (navb ? navb.getBoundingClientRect().top : innerHeight) - 6, R = innerWidth - 8;
      const cw = 64, ch = 64 * 1.45 + 20; // ширина карточки и высота с подписью позиции
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      P.forEach((q) => { x0 = Math.min(x0, q.x - cw * q.k / 2); x1 = Math.max(x1, q.x + cw * q.k / 2); y0 = Math.min(y0, q.y - ch * 0.92 * q.k); y1 = Math.max(y1, q.y + ch * 0.08 * q.k + 16); });
      const sc = Math.min(1, (R - L) / (x1 - x0), (B - T) / (y1 - y0));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, tx = Math.min(Math.max(cx, L + (x1 - x0) * sc / 2), R - (x1 - x0) * sc / 2), ty = Math.min(Math.max(cy, T + (y1 - y0) * sc / 2), B - (y1 - y0) * sc / 2);
      P.forEach((q) => { q.x = tx + (q.x - cx) * sc; q.y = ty + (q.y - cy) * sc; q.k *= sc; });
    }
    P.forEach((q) => { q.el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) translate(-50%, ${up && q.on ? -100 : -92}%) scale(${q.k.toFixed(3)})`;
      q.el.style.zIndex = String(Math.round(1000 - q.d)); q.el.classList.toggle('hid', !!(up && q.sel)); });
  }

  // ---------- События ----------
  // Путь события по главам, как в FC Mobile. Макет: узлы открывают существующие режимы, награды пока не выдаются.
  const JG = [
    { t: 'Подарок', d: 'Билет события', ico: 'gift', rw: 'Билет', gift: true },
    { t: 'Тренировка', d: 'Основы: бег, пас, удар', ico: 'target', rw: '50 монет', go: { train: 'basics' } },
    { t: 'Головоломка', d: '«Куда перешёл?»', ico: 'puzzle', rw: '50 монет', go: { act: 'transfer' } },
    { t: 'Моменты', d: 'Забей в коротких атаках', ico: 'bolt', rw: '100 монет', go: { mode: 'mom' } },
    { t: 'С 70-й минуты', d: 'Бавария ведёт 1:0 — переверни игру своим составом', ico: 'timer', rw: '100 монет', lock: true },
    { t: 'Николас Джексон', d: 'Особая карточка 84', ico: 'star', rw: 'Карточка', lock: true, fin: true },
  ];
  const DAILY = [
    { t: 'Игрок дня', d: 'Угадай по подсказкам', act: 'dly', art: 'daily' },
    { t: 'Wordle', d: 'Фамилия по буквам', ng: 'wordle', img: 'img/games/ng-wordle.webp' },
    { t: 'Куда перешёл?', d: 'Трансферы', act: 'transfer', img: 'img/games/transfer.webp' },
    { t: 'Тики-Така-Той', d: 'Сетка клубов', act: 'ttt', img: 'img/games/ttt.webp' },
    { t: 'Угадай сборную', d: 'Состав по клубам', act: 'nation', img: 'img/games/nation.webp' },
    { t: 'Связи', d: '4 группы по 4', ng: 'connect', img: 'img/games/ng-connect.webp' },
  ];
  // Экран события как в FC Mobile (27.10): вкладки сверху; слева логотип события, описание и главная награда,
  // справа путь главы «пазлом» (змейкой: 1→2→3, вниз, 4→5→6). Нажатие на узел — окно задания, как в FC.
  const TRAIN = [
    { t: 'Основы', d: 'Бег, пас, удар', lv: 'Новичок', go: { train: 'basics' }, img: 'img/fcm/mode-train.webp?v=2', c: '#19d3b0' },
    { t: 'Дриблинг', d: 'Гонка через фишки', lv: 'Любитель', go: { train: 'dribble' }, img: 'img/fcm/mode-dribble.webp?v=2', c: '#ffb23c' },
    { t: 'Мишени', d: 'Штрафные по мишеням', lv: 'Профи', go: { train: 'targets' }, img: 'img/fcm/mode-targets.webp?v=2', c: '#ff4f66' },
    { t: 'Моменты', d: 'Забей в коротких атаках', lv: 'Матч', go: { mode: 'mom' }, img: 'img/fcm/mode-mom.webp?v=2', c: '#c6ff3d' },
  ];
  const goAttr = (go) => (go.act ? `data-act="${go.act}"` : go.train ? `data-fm-train="${go.train}"` : `data-fm-mode="${go.mode}"`);
  function events() {
    const T = [['jg', 'Основная'], ['train', 'Тренировки'], ['daily', 'Ежедневные']];
    if (!T.some((x) => x[0] === sub.events)) sub.events = 'jg';
    const tabs = `<nav class="fm-evtabs">${T.map(([id, t]) => `<button class="${sub.events === id ? 'on' : ''}" data-fm-sub="events:${id}">${t}</button>`).join('')}</nav>`;
    const jg = Cards.get('JG:nicolas-jackson');
    let body;
    if (sub.events === 'jg') {
      const ord = [0, 1, 2, 5, 4, 3]; // змейка: второй ряд идёт справа налево
      body = `<div class="fm-evm">
        <div class="fm-evl">
          <div class="fm-logo"><small>JACKSON GAMES · СОБЫТИЕ</small><b>ДЖЕКСОН</b><em>Глава 1 · Знакомство</em></div>
          <p class="fm-evd">Пройди путь главы: тренировка, головоломка, моменты и матч с 70-й минуты. В конце — особая карточка Николаса Джексона.</p>
          <button class="fm-evprize" data-fm-node="5"><span class="fm-evcard">${jg ? Cards.html(jg, { w: 84 }) : ''}</span><span><small>Главная награда</small><b>Карточка 84</b><i>Подробнее ›</i></span></button>
        </div>
        <div class="fm-puz"><b class="fm-puz-h">Путь главы</b><div class="fm-puz-g">${ord.map((k) => { const n = JG[k];
          return `<button class="fm-pz ${n.lock ? 'lock' : ''} ${n.fin ? 'fin' : ''} c${k}" data-fm-node="${k}"><i class="fm-pz-m">${ico(n.ico)}</i>${n.lock ? `<u class="fm-pz-l">${lock}</u>` : ''}<b>${n.t}</b><small>${n.rw}</small></button>`; }).join('')}</div></div>
      </div>`;
    } else if (sub.events === 'train') {
      body = `<div class="fm-trs">${TRAIN.map((x) => `<button class="fm-trn" ${goAttr(x.go)} style="--tc:${x.c}"><img src="${x.img}" alt="" loading="lazy"><span class="fm-trn-t"><b>${x.t}</b><small>${x.d}</small></span><em>${x.lv}</em><i class="fm-trn-go">Играть</i></button>`).join('')}</div>`;
    } else {
      body = `<div class="fm-grid">${DAILY.map((g) => `<button class="fm-gc" ${g.act ? `data-act="${g.act}"` : `data-ng="${g.ng}"`}>${g.img ? `<img src="${g.img}" alt="" loading="lazy">` : ico(g.art, 'fm-gi')}<b>${g.t}</b><small>${g.d}</small></button>`).join('')}</div>`;
    }
    return `<div class="fm-evw">${tabs}${body}</div>`;
  }
  // окно задания узла: что сделать, сложность, награды, «Играть» (как «Развитие навыков» в FC)
  const DIFF = ['Подарок', 'Новичок', 'Любитель', 'Любитель', 'Профи', 'Финал'];
  function nodeSheet(k) {
    const n = JG[k]; if (!n) return;
    const el = document.createElement('div'); el.className = 'fm-sheet fm-task-w';
    const act = n.lock ? `<button class="fm-btn off" disabled>${lock} Откроется после прошлых узлов</button>`
      : n.gift ? '<button class="fm-btn gold" data-fm-gift>Забрать</button>' : `<button class="fm-btn gold" data-fm-run="${k}">Играть</button>`;
    el.innerHTML = `<div class="fm-task ${n.fin ? 'fin' : ''}">
      <header><i class="fm-pz-m">${ico(n.ico)}</i><b>${esc(n.t)}</b><button class="fm-sh-x" aria-label="Закрыть">✕</button></header>
      <div class="fm-task-r"><span><small>Задание</small><b>${esc(n.d)}</b></span><em>${DIFF[k]}</em></div>
      <div class="fm-task-p"><span>Выполнено 0/1</span></div>
      <p class="fm-task-h">Награда</p>
      <div class="fm-task-rw">${n.fin ? `<span class="fm-task-card">${Cards.get('JG:nicolas-jackson') ? Cards.html(Cards.get('JG:nicolas-jackson'), { w: 70 }) : ''}</span>` : `<span class="fm-task-coin">${n.gift ? ico('gift') : coin}<b>${esc(n.rw)}</b></span>`}</div>
      <p class="fm-task-n">Макет: прогресс и награды события включим после подтверждения — сейчас узел открывает игру без награды.</p>
      ${act}</div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.fm-sh-x')) { Sound.play('tap'); return close(); }
      if (e.target.closest('[data-fm-gift]')) { close(); Modal.open('<h2>Билет события</h2><p>Здесь будет подарок события: билет, который открывает главу. Награды подключим с проверкой на сервере.</p>', [{ label: 'Понятно' }]); return; }
      const r = e.target.closest('[data-fm-run]'); if (!r) return;
      Sound.play('tap'); close(); const go = n.go;
      if (go.train) App.openFootball('fk', go.train); else if (go.mode) startMode(go.mode); else if (go.act) setTimeout(() => { const b = document.createElement('button'); b.dataset.act = go.act; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); }, 0);
    });
  }
  const rail = (L, key) => `<div class="fm-rail">${L.map(([id, t, d]) => `<button class="${sub[key] === id ? 'on' : ''}" data-fm-sub="${key}:${id}"><b>${t}</b>${d !== undefined ? `<small>${d}</small>` : ''}</button>`).join('')}</div>`;

  // ---------- Задания ----------
  const GO = (ev) => { const p = ev.split(':'); if (p[1] === 'act') return `data-act="${p[2]}"`; if (p[1] === 'ng') return `data-ng="${p[2]}"`; if (p[1] === 'squad') return 'data-act="squad"'; if (ev === 'pack') return 'data-fm-tab="store"'; return 'data-fm-tab="play"'; };
  function questsReady() { try { const q = Rewards.questSync(); return [...q.list, ...q.wlist, ...(q.slist || [])].some((x) => x.done && !x.got); } catch (e) { return false; } }
  function quests() {
    let q; try { q = Rewards.questSync(); } catch (e) { q = { list: [], wlist: [], slist: [] }; }
    const lists = { day: q.list, week: q.wlist, season: q.slist || [] };
    const n = (l) => l.filter((x) => x.done && !x.got).length;
    const L = [['day', 'Ежедневные', n(lists.day) ? `Забрать: ${n(lists.day)}` : ''], ['week', 'Недельные', n(lists.week) ? `Забрать: ${n(lists.week)}` : ''], ['season', 'Сезон', n(lists.season) ? `Забрать: ${n(lists.season)}` : '']];
    const rows = lists[sub.quests].map((x) => { const d = Rewards.qdef(x.id); if (!d) return '';
      return `<div class="fm-q ${x.got ? 'got' : x.done ? 'done' : ''}"><span class="fm-q-t"><b>${esc(d.t)}</b><span class="fm-bar"><i style="width:${Math.round(100 * Math.min(1, x.p / d.n))}%"></i></span><small>${x.p}/${d.n}</small></span>
        <em class="fm-q-rw">+${d.xp}<small>очков пропуска</small></em>
        ${x.got ? '<span class="fm-q-ok">✓</span>' : x.done ? `<button class="fm-btn gold sm" data-fm-claim="${x.id}">Забрать</button>` : `<button class="fm-btn sm" ${GO(d.ev)}>Играть</button>`}</div>`; }).join('');
    return `<div class="fm-split">${rail(L, 'quests')}<div class="fm-body"><div class="fm-qs">${rows || '<p class="fm-none">Заданий пока нет</p>'}</div>
      <button class="fm-btn fm-pass" data-act="rewards">Пропуск и путь трофеев ›</button></div></div>`;
  }

  // ---------- Магазин (как в FC Mobile): слева разделы, паки крупно со свечением, перед покупкой — окно пака ----------
  // Цены, состав и шансы — прежние (StarShop, Cards.PACKS); меняется только вид и путь до покупки.
  function packList() {
    const out = [], by = {};
    StarShop.COIN_PACKS.forEach((x) => { by[x.id] = { ...x }; out.push(by[x.id]); });
    StarShop.ITEMS.filter((x) => x.level !== undefined).forEach((x) => { if (by[x.id]) by[x.id].stars = x.stars; else { by[x.id] = { ...x }; out.push(by[x.id]); } });
    return out;
  }
  const RRU = { bronze: 'бронза', silver: 'серебро', gold: 'золото', legend: 'легенда', jack: '«Джексон»' };
  function chips(x) {
    const P = Cards.PACKS[x.level], n = P.n * (x.count || 1), sure = {};
    P.sure.forEach((r) => { sure[r] = (sure[r] || 0) + (x.count || 1); });
    return [`${n} ${plural(n, 'карта', 'карты', 'карт')}`, ...Object.entries(sure).reverse().map(([r, k]) => `${k} × ${RRU[r] || r}`)];
  }
  const price = (x) => `${x.coins ? `<span class="fm-pr c">${coin}${x.coins}</span>` : ''}${x.stars ? `<span class="fm-pr s">${StarShop.free() ? 0 : x.stars} ⭐</span>` : ''}`;
  const pkCard = (x, big) => `<button class="fm-pk lv${x.level} ${big ? 'big' : ''}" data-fm-pk="${x.id}">
      <i class="fm-pk-glow"></i><img class="fm-pk-img" src="img/packs/pk${x.level}-360.webp" alt="" loading="lazy" draggable="false">
      <span class="fm-pk-t"><b>${esc(x.name)}</b><span class="fm-chips">${chips(x).map((c) => `<em>${esc(c)}</em>`).join('')}</span></span>
      <span class="fm-pk-p">${price(x)}</span></button>`;
  function store() {
    const L = [['top', 'Главное'], ['packs', 'Паки'], ['stars', 'За звёзды'], ['skins', 'Скины']];
    if (!L.some((l) => l[0] === sub.store)) sub.store = 'top';
    const list = packList(), day = typeof Wheel !== 'undefined' && Wheel.ready();
    let body = '';
    if (sub.store === 'top') {
      const jack = list.find((x) => x.id === 'jack'), rest = list.filter((x) => ['basic', 'gold', 'legend'].includes(x.id));
      body = `<div class="fm-st-top">
        ${jack ? `<button class="fm-st-hero" data-fm-pk="jack"><i class="fm-st-rays"></i><img src="img/packs/pk4-360.webp" alt="" draggable="false">
          <span><small>Лучший пак</small><b>${esc(jack.name)}</b><em>${esc(jack.sub)}</em><span class="fm-pk-p">${price(jack)}</span></span></button>` : ''}
        <div class="fm-st-col">
          <button class="fm-daypk ${day ? 'hot' : ''}" data-act="wheel"><img src="img/packs/pk0-160.webp" alt=""><span><b>Пак дня</b><small>${day ? 'Бесплатно — забери сейчас' : 'Новый пак завтра'}</small></span><em>${day ? 'Забрать' : 'Завтра'}</em></button>
          <div class="fm-st-mini">${rest.map((x) => pkCard(x)).join('')}</div>
        </div></div>`;
    } else if (sub.store === 'packs') body = `<div class="fm-pks">${list.map((x) => pkCard(x)).join('')}</div>`;
    else if (sub.store === 'stars') body = `<div class="fm-offers">${StarShop.ITEMS.filter((x) => x.level === undefined).map((x) => `<div class="fm-of"><span class="fm-of-art">${x.art()}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small><button class="fm-btn star" data-ss="${x.id}">${x.stars} ⭐</button></div>`).join('')}</div>`;
    else body = `<div class="fm-skins">${StarShop.skinsHtml()}</div>`;
    return `<div class="fm-split">${rail(L, 'store')}<div class="fm-body">${body}</div></div>`;
  }
  // окно пака: пак крупно, что внутри, шансы, кнопки цены
  function packSheet(id) {
    const x = packList().find((p) => p.id === id); if (!x) return;
    const P = Cards.PACKS[x.level], tot = P.w.reduce((a, w) => a + w[1], 0);
    const el = document.createElement('div'); el.className = `fm-sheet lv${x.level}`;
    el.innerHTML = `<div class="fm-sh-card">
        <div class="fm-sh-art"><i class="fm-st-rays"></i><img src="img/packs/pk${x.level}-360.webp" alt="" draggable="false"></div>
        <div class="fm-sh-info">
          <small>Пак</small><b>${esc(x.name)}</b>
          <span class="fm-chips">${chips(x).map((c) => `<em>${esc(c)}</em>`).join('')}</span>
          <p class="fm-sh-h">Шанс в каждом случайном слоте</p>
          <div class="fm-odds">${P.w.map(([r, n]) => `<span class="${r}"><small>${esc(Cards.RAR[r].n)}</small><i><u style="width:${Math.max(2, (n / tot) * 100)}%"></u></i><b>${n}%</b></span>`).join('')}</div>
          <p class="fm-sh-n">Повторы дают монеты. ИПК-карты из паков не выпадают.</p>
          <div class="fm-sh-buy">${x.coins ? `<button class="fm-btn gold" data-fm-buyc="${x.id}">${coin}${x.coins}</button>` : ''}${x.stars ? `<button class="fm-btn star" data-fm-buys="${x.id}">${StarShop.free() ? 0 : x.stars} ⭐</button>` : ''}</div>
        </div>
        <button class="fm-sh-x" aria-label="Закрыть">✕</button></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.fm-sh-x')) { Sound.play('tap'); return close(); }
      const c = e.target.closest('[data-fm-buyc]'); if (c) { Sound.play('tap'); if (StarShop.buyCoinsNow(c.dataset.fmBuyc)) { close(); setTimeout(render, 400); } return; }
      const st = e.target.closest('[data-fm-buys]'); if (st) { Sound.play('tap'); close(); document.dispatchEvent(new CustomEvent('ss-buy', { detail: st.dataset.fmBuys })); }
    });
  }

  // ---------- Коллекция (28.10): как «Звёздные подписания» в FC — слева счётчик, поиск и фильтры, справа сетка ----------
  // Только вид: карточки и их число берутся из Cards (owned/spare), ничего не начисляется.
  const CQ = { mine: true, rar: '', pos: '', q: '', sort: 'r', n: 48 };
  const RARG = [['', 'Все'], ['silver', 'Серебро'], ['gold', 'Золото'], ['legend', 'Легенды'], ['sp', 'Особые']];
  const POSG = [['', 'Все'], ['gk', 'Вратари'], ['def', 'Защита'], ['mid', 'Полузащита'], ['att', 'Атака']];
  const POSOF = { 'ВРТ': 'gk', 'ЦЗ': 'def', 'ЛЗ': 'def', 'ПЗ': 'def', 'ЦОП': 'mid', 'ЦП': 'mid', 'ЦАП': 'mid', 'ЛП': 'mid', 'ПП': 'mid', 'ФРВ': 'att', 'ЛВ': 'att', 'ПВ': 'att' };
  const SPECIAL = new Set(['jack', 'jg', 'future', 'forgotten']);
  const own = (c) => (Cards.owned ? Cards.owned(c.key) : 0) > 0;
  function collList() {
    const q = CQ.q.trim().toLowerCase();
    let L = Cards.all().filter((c) => (!CQ.mine || own(c))
      && (!CQ.rar || (CQ.rar === 'sp' ? SPECIAL.has(c.rar) : c.rar === CQ.rar))
      && (!CQ.pos || POSOF[c.pos] === CQ.pos)
      && (!q || c.name.toLowerCase().includes(q) || (c.club || '').toLowerCase().includes(q)));
    const nm = (a, b) => a.name.localeCompare(b.name, 'ru');
    L.sort(CQ.sort === 'name' ? nm : (a, b) => b.r - a.r || nm(a, b));
    return L;
  }
  function collGrid() {
    const L = collList(), shown = L.slice(0, CQ.n);
    if (!L.length) return `<p class="fm-none fm-cnone">${CQ.mine ? 'Таких карточек у тебя пока нет — открывай паки в Магазине' : 'Ничего не нашлось'}</p>`;
    return shown.map((c) => { const has = own(c), n = Cards.spare ? Cards.spare(c.key) : 0;
      return `<button class="fm-cc ${has ? '' : 'no'}" data-fm-card="${esc(c.key)}">${Cards.html(c, { w: 96, locked: !has })}${n > 1 ? `<i class="fm-cn">×${n}</i>` : ''}</button>`; }).join('')
      + (L.length > shown.length ? `<button class="fm-btn fm-cmore" data-fm-more>Показать ещё · ${L.length - shown.length}</button>` : '');
  }
  function coll() {
    const A = Cards.all(), mineN = A.filter(own).length;
    const per = (f) => { const t = A.filter(f); return [t.filter(own).length, t.length]; };
    const bars = [['Серебро', (c) => c.rar === 'silver', '#cfd8e6'], ['Золото', (c) => c.rar === 'gold', '#ffcf3a'], ['Легенды', (c) => c.rar === 'legend', '#c89bff'], ['Особые', (c) => SPECIAL.has(c.rar), '#ff4f66']]
      .map(([t, f, col]) => { const [a, b] = per(f); return `<span><small>${t}</small><i><u style="width:${b ? Math.max(a ? 3 : 0, (a / b) * 100) : 0}%;background:${col}"></u></i><b>${a}/${b}</b></span>`; }).join('');
    const chip = (key, list) => list.map(([v, t]) => `<button class="${CQ[key] === v ? 'on' : ''}" data-fm-cf="${key}:${v}">${t}</button>`).join('');
    return `<div class="fm-coll">
      <aside class="fm-cl">
        <div class="fm-cl-n"><small>${CQ.mine ? 'Мои карточки' : 'Все карточки'}</small><b>${mineN}<em>/${A.length}</em></b></div>
        <div class="fm-cl-bars">${bars}</div>
        <input class="fm-cq" type="search" placeholder="Поиск: игрок или клуб" value="${esc(CQ.q)}" autocomplete="off">
        <div class="fm-chips2">${chip('rar', RARG)}</div>
        <div class="fm-chips2">${chip('pos', POSG)}</div>
      </aside>
      <section class="fm-cr">
        <div class="fm-cr-h"><div class="fm-seg"><button class="${CQ.mine ? 'on' : ''}" data-fm-cf="mine:1">Мои</button><button class="${CQ.mine ? '' : 'on'}" data-fm-cf="mine:">Все</button></div>
          <button class="fm-sort" data-fm-sort>${CQ.sort === 'name' ? 'По имени' : 'ОБЩ ↓'}</button></div>
        <div class="fm-cg">${collGrid()}</div>
      </section></div>`;
  }
  // карточка крупно: качается в 3D за пальцем, справа цифры; ‹ › — соседние в текущем списке
  function cardView(key) {
    const L = collList(); let i = Math.max(0, L.findIndex((c) => c.key === key));
    const el = document.createElement('div'); el.className = 'fm-sheet fm-cv-w';
    const draw = () => { const c = L[i] || Cards.get(key), has = own(c), gk = c.pos === 'ВРТ', N = gk ? ['НЫР', 'РУК', 'УДР', 'РЕА', 'СКР', 'ПОЗ'] : ['СКР', 'УДР', 'ПАС', 'ДРБ', 'ЗАЩ', 'ФИЗ'], st = (Cards.stats ? Cards.stats(c) : c.st) || Array(6).fill(c.r);
      const big = Math.min(220, Math.floor((innerHeight - 100) / 1.5));
      el.innerHTML = `<div class="fm-cv ${esc(c.rar)}">
        <div class="fm-cv-stage"><i class="fm-st-rays"></i><div class="fm-cv-card">${Cards.html(c, { w: big, locked: !has })}</div></div>
        <div class="fm-cv-info">
          <small>${esc(Cards.RAR[c.rar] ? Cards.RAR[c.rar].n : '')}</small><b>${esc(c.name)}</b>
          <p>${esc(c.pos)} · ${esc(c.club || c.series || '')}<br>${esc(c.flag || '')} ${esc(c.nat || '')}${c.lg ? ' · ' + esc(c.lg) : ''}</p>
          <div class="fm-pi-st">${N.map((n, k) => `<span><small>${n}</small><i><u style="width:${Math.max(4, Math.min(100, st[k]))}%" class="${st[k] >= 85 ? 'hi' : st[k] >= 70 ? 'mid' : 'lo'}"></u></i><b>${st[k]}</b></span>`).join('')}</div>
          <p class="fm-cv-own">${has ? `В клубе: ×${Cards.spare ? Cards.spare(c.key) : 1}` : 'Ещё нет в клубе — может выпасть из пака'}</p>
          <div class="fm-pi-btn"><button class="fm-btn" data-cv="-1" aria-label="Предыдущая">‹</button><button class="fm-btn gold" data-cv-more>Подробнее</button><button class="fm-btn" data-cv="1" aria-label="Следующая">›</button></div>
        </div><button class="fm-sh-x" aria-label="Закрыть">✕</button></div>`;
      if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el); };
    draw(); document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
    // наклон карточки за пальцем
    el.addEventListener('pointermove', (e) => { const cd = el.querySelector('.fm-cv-card'); if (!cd) return; const r = cd.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      cd.style.setProperty('--rx', `${(-y * 18).toFixed(1)}deg`); cd.style.setProperty('--ry', `${(x * 24).toFixed(1)}deg`); cd.classList.add('hand'); });
    el.addEventListener('pointerleave', () => { const cd = el.querySelector('.fm-cv-card'); if (cd) cd.classList.remove('hand'); });
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.fm-sh-x')) { Sound.play('tap'); return close(); }
      const st = e.target.closest('[data-cv]'); if (st) { Sound.play('tap'); i = (i + +st.dataset.cv + L.length) % L.length; return draw(); }
      if (e.target.closest('[data-cv-more]')) { Sound.play('tap'); const k = (L[i] || {}).key; close(); if (k && Cards.details) Cards.details(k); }
    });
  }

  // ---------- сборка ----------
  let root = null;
  function render() {
    if (!root || !on()) return;
    const body = { play, team, events, quests, store, coll, modes }[tab]();
    root.dataset.view = tab;
    root.innerHTML = `${top()}<main class="fm-main">${body}</main>${nav()}`;
    if (typeof Coins !== 'undefined') Coins.render();
    if (bg3) { bg3.view(tab); bg3.onFrame = tab === 'team' ? placeCards : null; syncMen(); placeCards(); }
  }
  // Telegram во весь экран: сверху ряд его кнопок («Назад»/«Закрыть» слева, «⋁ …» справа). Свою шапку ставим в этот
  // же ряд — между кнопками, чтобы не терять высоту экрана лёжа.
  function insets() {
    let sa = 0, ca = 0;
    try { sa = (TG && TG.safeAreaInset && TG.safeAreaInset.top) || 0; ca = (TG && TG.contentSafeAreaInset && TG.contentSafeAreaInset.top) || 0; } catch (e) { /* не в Telegram */ }
    const st = document.documentElement.style;
    st.setProperty('--fm-sa', sa + 'px'); st.setProperty('--fm-ca', ca + 'px');
    if (root) root.classList.toggle('tgbar', ca > 0);
    document.body.classList.toggle('fm-tgbar', ca > 0); // внутренние экраны тоже ставят шапку в ряд кнопок Telegram
  }
  function init() {
    root = document.createElement('div'); root.id = 'fcm'; root.className = 'fcm';
    insets();
    try { if (TG && TG.onEvent) ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'].forEach((ev) => TG.onEvent(ev, insets)); } catch (e) { /* старый Telegram */ }
    // 3D-стадион — отдельный слой под оболочкой: render() переписывает оболочку, холст остаётся
    const bgHost = document.createElement('div'); bgHost.className = 'fcm-bg'; bgHost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bgHost);
    document.body.appendChild(root);
    document.body.classList.toggle('fcm-on', on());
    const land = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 620px)') : { matches: true };
    const shown = () => on() && land.matches && (!document.body.dataset.scr || document.body.dataset.scr === 'hub') && !(typeof Modal !== 'undefined' && Modal.isOpen);
    if (typeof Arena3D !== 'undefined') Arena3D.backdrop(bgHost, shown).then((b) => {
      if (b) { bg3 = b; b.view(tab, true); document.body.classList.add('fm3d'); render(); }
      window.__fm3d = true; dispatchEvent(new Event('fm3d')); // экран загрузки ждёт стадион (index.html, Boot)
    }).catch((e) => { console.warn('FCM 3D', e); window.__fm3d = true; dispatchEvent(new Event('fm3d')); });
    render();
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-fm-tab]'); if (t) { Sound.play('tap'); tab = t.dataset.fmTab; swapI = -1; if (focusI >= 0) { focusI = -1; if (bg3) bg3.unfocus(); } render(); root.querySelector('.fm-main').scrollTop = 0; return; }
      const s = e.target.closest('[data-fm-sub]'); if (s) { Sound.play('tap'); const [k, v] = s.dataset.fmSub.split(':'); sub[k] = v; render(); return; }
      if (e.target.closest('[data-fm-auto]')) { Sound.play('whistle'); haptic('ok'); Squad.auto(); return render(); }
      if (e.target.closest('[data-fm-swap]')) { Sound.play('tap'); return openSwap(focusI); }
      const em = e.target.closest('[data-fm-empty]'); if (em) { Sound.play('tap'); const i = +em.dataset.fmEmpty; focusI = i; return openSwap(i); }
      if (e.target.closest('[data-fm-swx]')) { Sound.play('tap'); const i = swapI; swapI = -1; return focusOn(Cards.get(Squad.S().xi[i]) ? i : -1); }
      if (e.target.closest('[data-fm-rm]')) { Sound.play('tap'); const s2 = Squad.S(); s2.xi[swapI] = null; Store.save(); swapI = -1; focusI = -1; bg3.unfocus(); return render(); }
      const pk2 = e.target.closest('[data-fm-pick]'); if (pk2) { Sound.play('coin'); haptic('pop'); const i = swapI; Squad.put(i, pk2.dataset.fmPick); swapI = -1; focusOn(i);
        const el = root.querySelector(`.fm-slot3[data-i="${i}"] .cc`); if (el && el.animate) el.animate([{ transform: 'translateY(-80px) rotateY(180deg) scale(1.3)', opacity: 0 }, { transform: 'rotateY(-10deg) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
        return; }
      const pl = e.target.closest('[data-fm-pl]'); if (pl) { Sound.play('tap'); return focusOn(+pl.dataset.fmPl === focusI ? -1 : +pl.dataset.fmPl); }
      if (e.target.closest('[data-fm-unfocus]')) { Sound.play('tap'); return focusOn(-1); }
      const stp = e.target.closest('[data-fm-step]'); if (stp) { Sound.play('tap'); const xi = Squad.S().xi, d = +stp.dataset.fmStep; let i = focusI;
        for (let n = 0; n < 11; n++) { i = (i + d + 11) % 11; if (Cards.get(xi[i])) break; } return focusOn(i); }
      const co = e.target.closest('[data-act="collection"]'); if (co) { e.stopPropagation(); Sound.play('tap'); tab = 'coll'; render(); return; }
      const cf = e.target.closest('[data-fm-cf]'); if (cf) { Sound.play('tap'); const [k, v] = cf.dataset.fmCf.split(':'); CQ[k] = k === 'mine' ? !!v : v; CQ.n = 48; render(); return; }
      if (e.target.closest('[data-fm-sort]')) { Sound.play('tap'); CQ.sort = CQ.sort === 'r' ? 'name' : 'r'; render(); return; }
      if (e.target.closest('[data-fm-more]')) { Sound.play('tap'); CQ.n += 48; const g = root.querySelector('.fm-cg'); if (g) { g.innerHTML = collGrid(); if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(g); } return; }
      const cc = e.target.closest('[data-fm-card]'); if (cc) { Sound.play('tap'); return cardView(cc.dataset.fmCard); }
      const sd = e.target.closest('[data-fm-slide]'); if (sd) { Sound.play('tap'); slideT = Date.now(); return slideTo(+sd.dataset.fmSlide); }
      const nd = e.target.closest('[data-fm-node]'); if (nd) { Sound.play('tap'); return nodeSheet(+nd.dataset.fmNode); }
      const pk = e.target.closest('[data-fm-pk]'); if (pk) { Sound.play('tap'); return packSheet(pk.dataset.fmPk); }
      const m = e.target.closest('[data-fm-mode]'); if (m) { Sound.play('tap'); return startMode(m.dataset.fmMode); }
      const tr = e.target.closest('[data-fm-train]'); if (tr) { Sound.play('tap'); return App.openFootball('fk', tr.dataset.fmTrain); }
      const c = e.target.closest('[data-fm-claim]'); if (c) { Rewards.claimQuest(c.dataset.fmClaim); return render(); }
      if (e.target.closest('[data-fm-gift]')) { Modal.open('<h2>Билет события</h2><p>Здесь будет подарок события: билет, который открывает главу. В макете награды ещё не выдаются — подключим их с проверкой на сервере.</p>', [{ label: 'Понятно' }]); return; }
    });
    root.addEventListener('input', (e) => { if (e.target.matches('.fm-swq')) { swapQ = e.target.value; const l = root.querySelector('.fm-swl'), tmp = document.createElement('div'); tmp.innerHTML = swapBar(); const nl = tmp.querySelector('.fm-swl'); if (l && nl) { l.replaceWith(nl); if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(nl); } return; }
      if (!e.target.matches('.fm-cq')) return; CQ.q = e.target.value; CQ.n = 48; const g = root.querySelector('.fm-cg'); if (g) { g.innerHTML = collGrid(); if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(g); } });
    // слайды главного баннера листаются сами раз в 6 с (после нажатия на точку — пауза)
    setInterval(() => { if (tab === 'play' && document.body.dataset.scr === 'hub' && Date.now() - slideT > 9000 && !document.hidden) slideTo(slideI + 1); }, 6000);
    // вернулись на главную из игры — обновить цифры (монеты, задания)
    new MutationObserver(() => { if (document.body.dataset.scr === 'hub') render(); }).observe(document.body, { attributes: true, attributeFilter: ['data-scr'] });
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { init(); } catch (e) { console.error('FCM', e); } }, 0));
  return { render, insets, get tab() { return tab; } };
})();
