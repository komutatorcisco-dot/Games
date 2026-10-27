// Новый вид игры «как FC Mobile» (макет, 27.10; только тестовая версия, только лёжа).
// Своя оболочка во весь экран: сверху профиль и валюта, в центре раздел, снизу меню
// «Команда · События · Играть · Задания · Магазин». Ничего не листается под кнопками Telegram — листается
// только содержимое раздела. Кнопки открывают уже существующие игры и покупки (data-act, data-coinpack, data-ss),
// поэтому прогресс, награды и цены не меняются. Событие «Николас Джексон» — макет: награды подключим позже
// с проверкой на сервере.
'use strict';

const FCM = (() => {
  const UI = () => Store.d.ui || (Store.d.ui = {});
  const on = () => !UI().fcmOff;
  let tab = 'play', sub = { quests: 'day', store: 'coins', events: 'jg' };
  let focusI = -1; // игрок, на которого наехала камера в «Команде»
  let bg3 = null; // 3D-стадион за меню (Arena3D.backdrop), null — нет WebGL или ещё грузится

  const TABS = [
    ['team', 'Команда', 'squad'], ['events', 'События', 'daily'], ['play', 'Играть', 'qplay'], ['quests', 'Задания', 'quests'], ['store', 'Магазин', 'shop'],
  ];
  const coin = '<i class="coin"></i>';
  const cup = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V5h3zm0 4H5v1a3 3 0 0 0 1.4 2.5A8 8 0 0 1 6 8zm12 0v1a8 8 0 0 1-.4 2.5A3 3 0 0 0 19 8V7z"/></svg>';
  const lock = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
  const trophies = () => (typeof Release !== 'undefined' && Release.trophies ? Release.trophies() : (Rewards.S().trophies || 0));

  // ---------- верх ----------
  function top() {
    const u = Store.d.user || {}, title = tab === 'play' ? '' : (TABS.find((t) => t[0] === tab) || [])[1];
    return `<header class="fm-top">
      ${title ? `<button class="fm-back" data-fm-tab="play" aria-label="На главную">‹</button><b class="fm-title">${title}</b>`
        : `<button class="fm-me" data-act="profile"><span class="fm-ava">${esc(u.emoji || '⚽')}</span><span class="fm-who"><b>${esc(u.nick || 'Игрок')}</b><small>${cup}${trophies()}</small></span></button>`}
      <i class="fm-sp"></i>
      <span class="fm-cur">${coin}<b class="coin-count">${Store.d.coins || 0}</b></span>
      <span class="fm-cur fm-tr">${cup}<b>${trophies()}</b></span>
      <button class="fm-old" data-fm-old title="Старый вид">Старый вид</button>
    </header>`;
  }
  function nav() {
    return `<nav class="fm-nav">${TABS.map(([id, t, a]) => `<button class="fm-tab ${id === tab ? 'on' : ''} ${id === 'play' ? 'play' : ''}" data-fm-tab="${id}">${Art.img(a, 'fm-ti', 96)}<b>${t}</b>${id === 'quests' && questsReady() ? '<em class="fm-dot"></em>' : ''}</button>`).join('')}</nav>`;
  }

  // ---------- Играть (главная) ----------
  const MODES = [
    { id: 'mom', t: 'Моменты', d: 'Короткие атаки: забей за несколько секунд', art: 'img/ui3d/play_ball_bg.webp', ico: 'img/ui/goal.webp', cls: 'big lime' },
    { id: '3', t: 'Матч 3 на 3', d: 'Нападающий, защитник и вратарь из твоих карточек', ico: 'img/ui3d/shield_blue.webp', cls: 'blue' },
    { id: 'mgr', t: 'Менеджер', d: '«Мой состав» играет сам, ты смотришь', act: 'squad', ico: 'img/ui2/squad.webp', cls: 'dark' },
    { id: '11', t: '11 на 11 · тест', d: 'Полное поле, 5 минут', ico: 'img/ui3d/shield_red.webp', cls: 'dark' },
    { id: 'train', t: 'Тренировки', d: 'Удары, дриблинг, штрафные', ico: 'img/ui3d/ball.webp', cls: 'dark' },
  ];
  function play() {
    const jg = Cards.get('JG:nicolas-jackson');
    return `<div class="fm-play">
      <button class="fm-hero" data-fm-tab="events">
        <span class="fm-hero-card">${jg ? Cards.html(jg, { w: 112 }) : ''}</span>
        <span class="fm-hero-t"><small>Событие</small><b>Николас Джексон</b><em>Пройди путь и получи особую карточку 84</em><i class="fm-go">Открыть ›</i></span>
      </button>
      <div class="fm-modes">${MODES.map((m) => `<button class="fm-mode ${m.cls}" ${m.act ? `data-act="${m.act}"` : `data-fm-mode="${m.id}"`}${m.art ? ` style="--art:url(${m.art})"` : ''}>${m.ico ? `<img class="fm-mi" src="${m.ico}" alt="">` : ''}<b>${m.t}</b><small>${m.d}</small></button>`).join('')}</div>
      <div class="fm-side">
        <button class="fm-sq" data-act="dly">${Art.img('daily', '', 96)}<b>Игрок дня</b></button>
        ${typeof Wheel !== 'undefined' ? `<button class="fm-sq ${Wheel.ready() ? 'hot' : ''}" data-act="wheel">${Art.img('qpack', '', 96)}<b>${Wheel.ready() ? 'Пак дня' : 'Завтра'}</b></button>` : ''}
        <button class="fm-sq" data-act="online">${Art.img('online', '', 96)}<b>Онлайн</b></button>
      </div>
    </div>`;
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
        <div class="fm-stats"><span><small>Схема</small><b>${esc(s.form)}</b></span><span><small>Состав</small><b>${have.length}/11</b></span><span><small>Карточек</small><b>${owned}</b></span></div>
        <button class="fm-btn gold" data-act="squad">Изменить состав</button>
        <button class="fm-btn" data-act="collection">Коллекция</button>
        <button class="fm-btn" data-act="sbc">Испытания (ИПК)</button>
      </div>`;
    if (bg3) return `<div class="fm-team is3d ${focusI >= 0 && cards[focusI] ? 'focus' : ''}">${panel}${focusI >= 0 && cards[focusI] ? pinfo(cards[focusI], F.slots[focusI]) : ''}<div class="fm-cards">${F.slots.map((sl, i) => { const c = cards[i];
      return `<button class="fm-slot3 ${c ? 'on' : ''} ${i === focusI ? 'sel' : ''}" ${c ? `data-fm-pl="${i}"` : 'data-act="squad"'} data-i="${i}">${c ? Cards.html(c, { w: 64 }) : '<i>+</i>'}<em>${esc(XD.RU[sl.pos] || sl.pos)}</em></button>`; }).join('')}</div></div>`;
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
    const gk = sl.pos === 'GK', N = gk ? ['НЫР', 'РУК', 'УДР', 'РЕА', 'СКР', 'ПОЗ'] : ['СКР', 'УДР', 'ПАС', 'ДРБ', 'ЗАЩ', 'ФИЗ'], st = c.st || Array(6).fill(c.r);
    return `<div class="fm-pinfo">
      <div class="fm-pi-h"><b class="fm-pi-r">${c.r}</b><span><b>${esc(c.name)}</b><small>${esc(XD.RU[sl.pos] || sl.pos)} · ${esc(c.club || c.series || '')}</small><small>${esc(c.flag || '')} ${esc(c.nat || '')}${c.lg ? ' · ' + esc(c.lg) : ''}</small></span></div>
      <div class="fm-pi-st">${N.map((n, i) => `<span><small>${n}</small><i><u style="width:${Math.max(4, Math.min(100, st[i]))}%" class="${st[i] >= 85 ? 'hi' : st[i] >= 70 ? 'mid' : 'lo'}"></u></i><b>${st[i]}</b></span>`).join('')}</div>
      <div class="fm-pi-btn"><button class="fm-btn" data-fm-step="-1" aria-label="Предыдущий">‹</button><button class="fm-btn gold" data-act="squad">Заменить</button><button class="fm-btn" data-fm-step="1" aria-label="Следующий">›</button></div>
      <button class="fm-pi-x" data-fm-unfocus>Весь состав</button>
    </div>`;
  }
  function focusOn(i) {
    const s = Squad.S(), F = XD.FORMATIONS[s.form];
    if (i < 0 || !F.slots[i] || !Cards.get(s.xi[i])) { focusI = -1; if (bg3) bg3.unfocus(); render(); return; }
    focusI = i; const [x, z] = slotWorld(F.slots[i], bg3.W, bg3.H); bg3.focus(x, z); render();
  }
  // карточки на 3D-газоне: точка схемы → точка поля → экран; дальние меньше, ближние крупнее
  function placeCards() {
    if (!bg3 || tab !== 'team' || !root) return;
    const els = root.querySelectorAll('.fm-slot3'); if (!els.length) return;
    const F = XD.FORMATIONS[Squad.S().form], W = bg3.W, H = bg3.H;
    els.forEach((el) => {
      const sl = F.slots[+el.dataset.i]; if (!sl) return;
      const [x, z] = slotWorld(sl, W, H), sel = +el.dataset.i === focusI;
      const p = bg3.project(x, z), k = Math.max(0.62, Math.min(sel ? 1.6 : 0.98, 60 / p.d));
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -92%) scale(${k.toFixed(3)})`;
      el.style.zIndex = String(Math.round(1000 - p.d));
    });
  }

  // ---------- События ----------
  // Путь события по главам, как в FC Mobile. Макет: узлы открывают существующие режимы, награды пока не выдаются.
  const JG = [
    { t: 'Подарок', d: 'Билет события', ico: '🎁', rw: 'Билет', gift: true },
    { t: 'Тренировка', d: 'Основы: бег, пас, удар', ico: '🎯', rw: '50 монет', go: { train: 'basics' } },
    { t: 'Головоломка', d: '«Куда перешёл?»', ico: '🧩', rw: '50 монет', go: { act: 'transfer' } },
    { t: 'Моменты', d: 'Забей в коротких атаках', ico: '⚡', rw: '100 монет', go: { mode: 'mom' } },
    { t: 'С 70-й минуты', d: 'Бавария ведёт 1:0 — переверни игру своим составом', ico: '⏱', rw: '100 монет', lock: true },
    { t: 'Николас Джексон', d: 'Особая карточка 84', ico: '★', rw: 'Карточка', lock: true, fin: true },
  ];
  const DAILY = [
    { t: 'Игрок дня', d: 'Угадай по подсказкам', act: 'dly', art: 'daily' },
    { t: 'Wordle', d: 'Фамилия по буквам', ng: 'wordle', img: 'img/games/ng-wordle.webp' },
    { t: 'Куда перешёл?', d: 'Трансферы', act: 'transfer', img: 'img/games/transfer.webp' },
    { t: 'Тики-Така-Той', d: 'Сетка клубов', act: 'ttt', img: 'img/games/ttt.webp' },
    { t: 'Угадай сборную', d: 'Состав по клубам', act: 'nation', img: 'img/games/nation.webp' },
    { t: 'Связи', d: '4 группы по 4', ng: 'connect', img: 'img/games/ng-connect.webp' },
  ];
  function events() {
    const L = [['jg', 'Николас Джексон', 'Особое событие'], ['daily', 'Ежедневные', 'Мини-игры дня']];
    const jg = Cards.get('JG:nicolas-jackson');
    const body = sub.events === 'jg'
      ? `<div class="fm-ev">
          <div class="fm-ev-head"><span class="fm-ev-card">${jg ? Cards.html(jg, { w: 92 }) : ''}</span>
            <span class="fm-ev-t"><small>Глава 1 · Знакомство</small><b>Николас Джексон</b><em>Пройди путь — в конце особая карточка 84. Макет: награды и прогресс включим на следующем шаге.</em></span></div>
          <div class="fm-path">${JG.map((n, i) => {
            const attr = n.go ? (n.go.act ? `data-act="${n.go.act}"` : n.go.train ? `data-fm-train="${n.go.train}"` : `data-fm-mode="${n.go.mode}"`) : n.gift ? 'data-fm-gift' : '';
            return `<button class="fm-node ${n.lock ? 'lock' : ''} ${n.fin ? 'fin' : ''}" ${n.lock ? 'disabled' : attr}><i class="fm-n-ico">${n.lock ? lock : n.ico}</i><b>${n.t}</b><small>${n.d}</small><em>${n.rw}</em>${i < JG.length - 1 ? '<u></u>' : ''}</button>`; }).join('')}</div>
        </div>`
      : `<div class="fm-grid">${DAILY.map((g) => `<button class="fm-gc" ${g.act ? `data-act="${g.act}"` : `data-ng="${g.ng}"`}>${g.img ? `<img src="${g.img}" alt="" loading="lazy">` : Art.img(g.art, '', 96)}<b>${g.t}</b><small>${g.d}</small></button>`).join('')}</div>`;
    return `<div class="fm-split">${rail(L, 'events')}<div class="fm-body">${body}</div></div>`;
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

  // ---------- Магазин ----------
  function store() {
    const L = [['coins', 'За монеты'], ['stars', 'За звёзды'], ['skins', 'Скины']];
    let body = '';
    if (sub.store === 'coins') body = `<div class="fm-offers">${StarShop.COIN_PACKS.map((x) => `<div class="fm-of lv${x.level}"><span class="fm-of-art">${x.art()}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small><button class="fm-btn gold" data-coinpack="${x.id}">${coin}${x.coins}</button></div>`).join('')}</div>`;
    else if (sub.store === 'stars') body = `<div class="fm-offers">${StarShop.ITEMS.map((x) => `<div class="fm-of lv${x.level === undefined ? 0 : x.level}"><span class="fm-of-art">${x.art()}</span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small><button class="fm-btn star" data-ss="${x.id}">${x.stars} ⭐</button></div>`).join('')}</div>`;
    else body = `<div class="fm-skins">${StarShop.skinsHtml()}</div>`;
    const day = typeof Wheel !== 'undefined' && Wheel.ready();
    return `<div class="fm-split">${rail(L, 'store')}<div class="fm-body">
      ${sub.store === 'coins' ? `<button class="fm-daypk ${day ? 'hot' : ''}" data-act="wheel">${Art.img('qpack', '', 96)}<span><b>Пак дня</b><small>${day ? 'Бесплатно — забери сейчас' : 'Новый пак завтра'}</small></span><em>${day ? 'Забрать' : 'Завтра'}</em></button>` : ''}
      ${body}</div></div>`;
  }

  // ---------- сборка ----------
  let root = null;
  function render() {
    if (!root || !on()) return;
    const body = { play, team, events, quests, store }[tab]();
    root.dataset.view = tab;
    root.innerHTML = `${top()}<main class="fm-main">${body}</main>${nav()}`;
    if (typeof Coins !== 'undefined') Coins.render();
    if (bg3) { bg3.view(tab); bg3.onFrame = tab === 'team' ? placeCards : null; placeCards(); }
  }
  function setOn(v) {
    UI().fcmOff = !v; Store.save();
    document.body.classList.toggle('fcm-on', v);
    if (v) render();
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
      if (!b) return; bg3 = b; b.view(tab, true); document.body.classList.add('fm3d'); render();
    }).catch((e) => console.warn('FCM 3D', e));
    // старый вид: маленькая кнопка «Новый вид» поверх старой главной
    const back = document.createElement('button'); back.className = 'fcm-back-new'; back.textContent = 'Новый вид'; back.dataset.fmNew = '1'; document.body.appendChild(back);
    render();
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-fm-tab]'); if (t) { Sound.play('tap'); tab = t.dataset.fmTab; if (focusI >= 0) { focusI = -1; if (bg3) bg3.unfocus(); } render(); root.querySelector('.fm-main').scrollTop = 0; return; }
      const s = e.target.closest('[data-fm-sub]'); if (s) { Sound.play('tap'); const [k, v] = s.dataset.fmSub.split(':'); sub[k] = v; render(); return; }
      const pl = e.target.closest('[data-fm-pl]'); if (pl) { Sound.play('tap'); return focusOn(+pl.dataset.fmPl === focusI ? -1 : +pl.dataset.fmPl); }
      if (e.target.closest('[data-fm-unfocus]')) { Sound.play('tap'); return focusOn(-1); }
      const stp = e.target.closest('[data-fm-step]'); if (stp) { Sound.play('tap'); const xi = Squad.S().xi, d = +stp.dataset.fmStep; let i = focusI;
        for (let n = 0; n < 11; n++) { i = (i + d + 11) % 11; if (Cards.get(xi[i])) break; } return focusOn(i); }
      const m = e.target.closest('[data-fm-mode]'); if (m) { Sound.play('tap'); return startMode(m.dataset.fmMode); }
      const tr = e.target.closest('[data-fm-train]'); if (tr) { Sound.play('tap'); return App.openFootball('fk', tr.dataset.fmTrain); }
      const c = e.target.closest('[data-fm-claim]'); if (c) { Rewards.claimQuest(c.dataset.fmClaim); return render(); }
      if (e.target.closest('[data-fm-gift]')) { Modal.open('<h2>Билет события</h2><p>Здесь будет подарок события: билет, который открывает главу. В макете награды ещё не выдаются — подключим их с проверкой на сервере.</p>', [{ label: 'Понятно' }]); return; }
      if (e.target.closest('[data-fm-old]')) { setOn(false); toast('Старый вид. Вернуть новый — кнопка «Новый вид» справа сверху'); }
    });
    back.addEventListener('click', () => setOn(true));
    // вернулись на главную из игры — обновить цифры (монеты, задания)
    new MutationObserver(() => { if (document.body.dataset.scr === 'hub') render(); }).observe(document.body, { attributes: true, attributeFilter: ['data-scr'] });
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { init(); } catch (e) { console.error('FCM', e); } }, 0));
  return { render, setOn, insets, get tab() { return tab; } };
})();
