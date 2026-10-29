// Серверная экономика на превью (29.10): монеты и карточки хранит проверочный сервер (/eco), игра — их копия.
// На рабочей версии (не CONFIG.stage) модуль ничего не меняет — экономика прежняя, на телефоне.
// Здесь же экраны «Рынок» (поиск, лот, ставка, «купить сразу», мои лоты, ставки, избранное) и «История».
'use strict';

const Eco = (() => {
  const stage = () => typeof CONFIG !== 'undefined' && !!CONFIG.stage;
  let srv = false, busy = 0;           // srv — сервер ответил и экономика на нём
  const opid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  // транспорт: в Telegram — подписанный запрос; тест может подменить Eco.transport
  let transport = (body) => (typeof Board !== 'undefined' && Board.ready() ? Board.post('/eco', body) : Promise.resolve({ ok: false, error: 'offline' }));
  async function post(act, body = {}) {
    busy++;
    try { return await transport({ act, ...body }); } catch (e) { return { ok: false, error: 'network' }; } finally { busy--; }
  }
  // множитель наград: на превью новая шкала (×ECON.earn.k), на рабочей — прежняя
  const K = () => (stage() && typeof ECON !== 'undefined' ? ECON.earn.k : 1);
  // применить ответ сервера: баланс и (если пришли) карточки
  function apply(r) {
    if (!r) return;
    if (typeof r.coins === 'number') { Store.d.coins = r.coins; }
    if (Array.isArray(r.cards)) {
      const s = Store.d.cards || (Store.d.cards = { own: {}, fresh: [] }), was = s.own || {};
      s.own = {}; s.lock = {}; r.cards.forEach(([k, n, lk]) => { if (n > 0) s.own[k] = n; if (lk > 0) s.lock[k] = lk; }); // lock — копии из наград, на рынок нельзя
      s.fresh = (s.fresh || []).filter((k) => s.own[k]);
      Object.keys(s.own).forEach((k) => { if (!was[k] && !s.fresh.includes(k)) s.fresh.push(k); });
    }
    Store.save(true);
    try { Coins.render(); } catch (e) { /* ещё нет экрана */ }
  }
  async function sync() {
    const r = await post('state');
    if (!r || !r.ok) { srv = false; return false; }
    srv = true; apply(r);
    if ((Store.d.admin || !r.catalog) && typeof Cards !== 'undefined') uploadCatalog(r).catch(() => {}); // пустой каталог может залить любой (первый вход)
    if (typeof App !== 'undefined') App.refresh();
    if (typeof FCM !== 'undefined' && FCM.refresh) FCM.refresh();
    return true;
  }
  // каталог карточек на сервер (только админ, когда в игре поменялась база)
  const CATV = () => { const A = Cards.all(); return A.length + ':' + A.reduce((h, c) => (h * 31 + c.r + c.key.length) >>> 0, 7); };
  async function uploadCatalog(st) {
    const v = CATV(); if (st.catv === v && st.catalog > 0) return;
    const rows = Cards.all().map((c) => [c.key, c.name, c.r, c.rar, c.pos || '', c.club || '', c.nat || '', c.retired || c.sbcOnly || ['jg', 'future', 'forgotten'].includes(c.rar) ? 0 : 1]);
    for (let i = 0; i < rows.length; i += 550) await post('a_catalog', { rows: rows.slice(i, i + 550), done: i + 550 >= rows.length, ver: v });
    toast(`Каталог карточек на сервере обновлён: ${rows.length}`);
  }
  // ---- заработок и траты: игра считает, сервер ограничивает и хранит ----
  let pend = Promise.resolve();
  const chain = (f) => (pend = pend.then(f, f));
  function earn(n, src) {
    if (!srv || !(n > 0)) return;
    chain(async () => { const r = await post('earn', { n, src: src || 'game', op: opid() }); if (r && typeof r.coins === 'number') apply(r); if (r && r.capped && r.got === 0) toast('Дневной запас монет за это уже собран — завтра снова'); });
  }
  function spend(n, src) {
    if (!srv || !(n > 0)) return;
    chain(async () => { const r = await post('spend', { n, src: src || 'shop', op: opid() }); if (r) apply(r); });
  }
  function grant(keys, src) {
    if (!srv || !keys || !keys.length) return;
    chain(async () => { const r = await post('grant', { keys, src: src || 'reward', op: opid() }); if (!r || !r.ok) { const s = await post('state'); if (s && s.ok) apply(s); } else apply(r); });
  }
  // ---- паки, стартовый пак, быстрая продажа — карточки выбирает сервер ----
  async function pack(id) { const r = await post('pack', { pack: id, op: opid() }); if (r && typeof r.coins === 'number') Store.d.coins = r.coins; return r; }
  async function starter(nat) { const r = await post('starter', { nat, op: opid() }); return r; }
  async function quick(key, n = 1) { const r = await post('quick', { key, n, op: opid() }); if (r && r.ok) { const s = Store.d.cards.own; s[key] = Math.max(0, (s[key] || 0) - n); if (!s[key]) delete s[key]; apply(r); } return r; }
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // ---- подмена старых путей монет и карточек (только превью) ----
  function hook() {
    if (!stage()) return;
    if (typeof Econ !== 'undefined' && typeof ECON !== 'undefined') Econ.TIERS = [[ECON.earn.full / ECON.earn.k, 1], [ECON.earn.half / ECON.earn.k, 0.5], [Infinity, 0.1]];
    const add0 = Coins.add.bind(Coins), spend0 = Coins.spend.bind(Coins);
    // награды по-прежнему в старой шкале — умножаем здесь; второй аргумент — источник для потолков сервера
    Coins.add = (n, src) => { const v = Math.round(n * K()); add0(v); earn(v, src || Eco.src); };
    Coins.spend = (n, src) => { const v = Math.round(n * K()); if (!spend0(v)) return false; spend(v, src); return true; };
    const cadd = Cards.add;
    Cards.add = (keys, opt = {}) => { const res = cadd(keys); if (srv) { res.forEach((x) => (x.coins = 0)); if (!opt.server) grant(keys, opt.src || Eco.src || 'reward'); } return res; };
    // цены и состав паков — из ECON
    if (typeof StarShop !== 'undefined') [...StarShop.COIN_PACKS, ...StarShop.ITEMS].forEach((x) => { const P = ECON.packs.find((p) => p.lv === x.level); if (P && x.coins) x.coins = P.price * (x.count || 1); });
    // в сезоне 1 легенды и «Джексон» из паков не выпадают — их слоты дают золото; описание без обещаний легенд
    if (typeof StarShop !== 'undefined') { const SUB = { legend: '15 карт · минимум 4 золотых', jack: '30 карт · минимум 9 золотых' }; StarShop.ITEMS.forEach((x) => { if (SUB[x.id]) x.sub = SUB[x.id]; }); }
  }
  return { stage, on: () => srv, sync, post, apply, earn, spend, grant, pack, starter, quick, hook, opid, fmt, K, src: '', get busy() { return busy; }, set transport(f) { transport = f; } };
})();

// =========================== Рынок ===========================
const Market = (() => {
  const S = { tab: 'search', f: { q: '', rar: '', rmin: 0, pos: '', sort: 'ends' }, lots: null, mine: null, hist: null, loading: false, err: '' };
  const coin = '<i class="coin"></i>';
  const RAR = [['', 'Все'], ['bronze', 'Бронза'], ['silver', 'Серебро'], ['gold', 'Золото'], ['jg', 'Особые']];
  const OVR = [[0, 'Любой'], [75, '75+'], [80, '80+'], [84, '84+'], [88, '88+']];
  const POS = ['', 'ВРТ', 'ЦЗ', 'ЛЗ', 'ПЗ', 'ЦОП', 'ЦП', 'ЦАП', 'ЛП', 'ПП', 'ЛВ', 'ПВ', 'ФРВ'];
  const left = (t) => { const s = Math.max(0, Math.floor((t - Date.now()) / 1000)); if (s <= 0) return 'Завершён'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)} д ${h % 24} ч` : h ? `${h} ч ${m} мин` : m ? `${m} мин` : `${s} с`; };
  const F = Eco.fmt;
  function tile(x) {
    const c = Cards.get(x.key) || { key: x.key, name: x.name, r: x.r, rar: x.rar, pos: x.pos, club: x.club };
    const now = x.bid ? `<small>Ставка</small><b>${coin}${F(x.bid)}</b>` : `<small>Старт</small><b>${coin}${F(x.start)}</b>`;
    const st = x.status !== 'open' ? `<em class="mk-st ${x.won ? 'win' : ''}">${x.status === 'sold' ? (x.won ? 'Твой ✓' : x.mine ? `Продано · ${F(x.price)}` : 'Продано') : x.status === 'expired' ? 'Не продано' : 'Снято'}</em>` : `<em class="mk-t">${left(x.ends)}</em>`;
    return `<button class="mk-lot ${x.top ? 'top' : ''} ${x.mine ? 'mine' : ''}" data-mk-lot="${x.id}">
      <span class="mk-c">${Cards.html(c, { w: 84 })}</span>
      <span class="mk-i"><span class="mk-now">${now}</span><span class="mk-bin"><small>Сразу</small><b>${coin}${F(x.bin)}</b></span>${st}${x.top && x.status === 'open' ? '<em class="mk-lead">Ты лидер</em>' : ''}${x.bot ? '' : ''}</span></button>`;
  }
  const grid = (L, empty) => (L && L.length ? `<div class="mk-grid">${L.map(tile).join('')}</div>` : `<p class="fm-none">${empty}</p>`);
  function filters() {
    const f = S.f, ch = (k, list) => list.map(([v, t]) => `<button class="${String(f[k]) === String(v) ? 'on' : ''}" data-mk-f="${k}:${v}">${t}</button>`).join('');
    return `<div class="mk-flt">
      <input class="mk-q" type="search" placeholder="Игрок" value="${esc(f.q)}" autocomplete="off">
      <span class="fm-chips2">${ch('rar', RAR)}</span>
      <span class="fm-chips2">${ch('rmin', OVR)}</span>
      <select class="mk-pos">${POS.map((p) => `<option value="${p}" ${f.pos === p ? 'selected' : ''}>${p || 'Позиция'}</option>`).join('')}</select>
      <button class="fm-sort" data-mk-sort>${{ ends: 'Скоро конец', cheap: 'Дешевле', ovr: 'ОБЩ ↓' }[f.sort]}</button></div>`;
  }
  const HK = { earn: ['Заработано', '+'], spend: ['Потрачено', ''], pack: ['Пак', ''], card: ['Карточка', ''], 'card-': ['Карточка ушла', ''], quick: ['Быстрая продажа', '+'], sell: ['Продано на рынке', '+'], buy: ['Куплено на рынке', ''], bid: ['Ставка', ''], refund: ['Возврат ставки', '+'], list: ['Выставлено', ''], unlist: ['Вернулось', ''], wipe: ['Сброс прогресса', ''] };
  const SRC = { start: 'стартовые монеты', login: 'вход', daily: 'игра дня', game: 'игры', match: 'матч', quest: 'задание', pass: 'пропуск', event: 'событие', dup: 'повторы', club: 'клуб', starter: 'стартовый пак', market: 'рынок', quick: 'быстрая продажа', reward: 'награда', shop: 'магазин' };
  function histRows() {
    if (!S.hist) return '<p class="fm-none">Загрузка…</p>';
    if (!S.hist.length) return '<p class="fm-none">Пока пусто</p>';
    return `<div class="mk-hist">${S.hist.map((r) => { const [t] = HK[r.kind] || [r.kind], c = r.card && Cards.get(r.card), src = String(r.src || '').split(':')[0];
      const d = new Date(r.ts), when = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<div class="mk-h k-${esc(r.kind.replace('-', 'm'))}"><span class="mk-h-t"><b>${esc(t)}${c ? ' · ' + esc(c.name) + ' ' + c.r : ''}</b><small>${esc(r.ref || SRC[src] || src || '')} · ${when}</small></span>${r.coins ? `<em class="${r.coins > 0 ? 'p' : 'm'}">${r.coins > 0 ? '+' : '−'}${F(Math.abs(r.coins))}</em>` : ''}</div>`; }).join('')}
      ${S.hist.length >= 50 ? '<button class="fm-btn sm mk-more" data-mk-more>Ещё</button>' : ''}</div>`;
  }
  function body() {
    if (!Eco.on()) return `<div class="mk-off"><b>Рынок работает в Telegram</b><p>Открой превью через бота — рынок, история и монеты хранятся на проверочном сервере.</p></div>`;
    if (S.tab === 'search') return filters() + `<div class="mk-res">${S.lots ? grid(S.lots, 'Ничего не нашлось — смени фильтры') : '<p class="fm-none">Загрузка…</p>'}</div>`;
    if (S.tab === 'hist') return histRows();
    const m = S.mine; if (!m) return '<p class="fm-none">Загрузка…</p>';
    if (S.tab === 'lots') return `<p class="mk-note">Выставить карточку: Команда → Коллекция → карточка → «Продать». Налог с продажи — ${Math.round(ECON.market.tax * 100)}%.</p>` + grid(m.lots, 'Ты ещё ничего не выставил');
    if (S.tab === 'bids') return grid(m.bids, 'Ставок нет');
    return grid(m.favs, 'Нажми ☆ в лоте, чтобы следить за ним');
  }
  function render() {
    const L = [['search', 'Поиск'], ['lots', 'Мои лоты'], ['bids', 'Ставки'], ['favs', 'Избранное'], ['hist', 'История']];
    return `<div class="fm-split mk">${`<div class="fm-rail">${L.map(([id, t]) => `<button class="${S.tab === id ? 'on' : ''}" data-mk-tab="${id}"><b>${t}</b></button>`).join('')}</div>`}<div class="fm-body mk-body">${body()}</div></div>`;
  }
  const paint = () => { const b = document.querySelector('.mk-body'); if (b) b.innerHTML = body(); if (typeof Photos !== 'undefined' && Photos.hydrate && b) Photos.hydrate(b); };
  async function load() {
    if (!Eco.on()) return;
    if (S.tab === 'search') { const f = S.f, r = await Eco.post('m_search', { q: f.q, rar: f.rar === 'jg' ? '' : f.rar, rmin: f.rmin, pos: f.pos, sort: f.sort }); S.lots = r && r.ok ? (f.rar === 'jg' ? r.lots.filter((x) => !['bronze', 'silver', 'gold'].includes(x.rar)) : r.lots) : []; }
    else if (S.tab === 'hist') { const r = await Eco.post('history', {}); S.hist = r && r.ok ? r.rows : []; }
    else { const r = await Eco.post('m_mine', {}); S.mine = r && r.ok ? r : { lots: [], bids: [], favs: [] }; }
    paint();
  }
  const all = () => [...(S.lots || []), ...((S.mine && [...S.mine.lots, ...S.mine.bids, ...S.mine.favs]) || [])];
  // ---- окно лота: ставка, «купить сразу», избранное, снять ----
  async function lotSheet(id) {
    const x = all().find((l) => l.id === id); if (!x) return;
    const c = Cards.get(x.key) || { key: x.key, name: x.name, r: x.r, rar: x.rar, pos: x.pos };
    const pi = await Eco.post('m_price', { key: x.key });
    let amt = Price.nextBid(x.bid, x.start);
    const el = document.createElement('div'); el.className = 'fm-sheet mk-sheet';
    const draw = () => {
      const open = x.status === 'open' && x.ends > Date.now(), fav = (S.mine && S.mine.favs.some((f) => f.id === x.id));
      el.innerHTML = `<div class="mk-sh">
        <div class="mk-sh-card">${Cards.html(c, { w: 150 })}</div>
        <div class="mk-sh-info"><small>${esc((Cards.RAR[c.rar] || {}).n || '')} · ${open ? 'до конца ' + left(x.ends) : 'торги завершены'}</small><b>${esc(c.name)}</b>
          <div class="mk-pr">
            <span><small>${x.bid ? 'Ставка сейчас' : 'Стартовая'}</small><b>${coin}${F(x.bid || x.start)}</b></span>
            <span><small>Купить сразу</small><b>${coin}${F(x.bin)}</b></span>
            ${pi && pi.ok ? `<span><small>Рыночная цена</small><b>${coin}${F(pi.ref)}</b></span><span><small>Рамка</small><b>${F(pi.range[0])}–${F(pi.range[1])}</b></span>` : ''}
          </div>
          ${pi && pi.ok && pi.last && pi.last.length ? `<p class="mk-last">Последние сделки: ${pi.last.slice(0, 5).map((s) => F(s.price)).join(' · ')}</p>` : '<p class="mk-last">Сделок с этой карточкой ещё не было</p>'}
          ${open && !x.mine ? `<div class="mk-bid"><button class="fm-btn" data-mk-step="-1">−</button><span>${coin}<b>${F(amt)}</b></span><button class="fm-btn" data-mk-step="1">+</button>
            <button class="fm-btn" data-mk-bid ${x.top || amt >= x.bin ? 'disabled' : ''}>${x.top ? 'Ты лидер' : 'Ставка'}</button></div>
            <button class="fm-btn gold mk-buy" data-mk-buy>Купить сразу · ${coin}${F(x.bin)}</button>` : ''}
          ${open && x.mine ? `<p class="mk-last">${x.bid ? 'Есть ставка — снять уже нельзя' : 'Пока без ставок'}</p>${x.bid ? '' : '<button class="fm-btn" data-mk-cancel>Снять с продажи</button>'}` : ''}
          <button class="mk-fav ${fav ? 'on' : ''}" data-mk-fav>${fav ? '★ В избранном' : '☆ В избранное'}</button>
        </div><button class="fm-sh-x" aria-label="Закрыть">✕</button></div>`;
      if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
    };
    draw(); document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
    const done = async (r, ok, bad) => { if (r && r.ok) { toast(ok); haptic('ok'); Sound.play('coin'); close(); await Eco.sync(); load(); } else { toast(bad || 'Не получилось — лот изменился, обновляю'); haptic('bad'); close(); load(); } };
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('.fm-sh-x')) return close();
      const st = e.target.closest('[data-mk-step]');
      if (st) { const d = +st.dataset.mkStep, min = Price.nextBid(x.bid, x.start); amt = d > 0 ? Math.min(x.bin - Price.step(x.bin), amt + Price.step(amt)) : Math.max(min, amt - Price.step(amt - 1)); return draw(); }
      if (e.target.closest('[data-mk-bid]')) { if (Store.d.coins < amt) return toast('Не хватает монет'); const r = await Eco.post('m_bid', { lot: x.id, amount: amt, op: Eco.opid() }); return done(r, `Ставка ${F(amt)} принята — монеты в резерве`, 'Ставку перебили или лот закрылся'); }
      if (e.target.closest('[data-mk-buy]')) { if (Store.d.coins < x.bin) return toast('Не хватает монет'); const r = await Eco.post('m_buy', { lot: x.id, op: Eco.opid() }); return done(r, `${c.name} в твоём клубе!`, 'Лот уже купили'); }
      if (e.target.closest('[data-mk-cancel]')) { const r = await Eco.post('m_cancel', { lot: x.id, op: Eco.opid() }); return done(r, 'Снято — карточка вернулась в клуб'); }
      if (e.target.closest('[data-mk-fav]')) { const on = !(S.mine && S.mine.favs.some((f) => f.id === x.id)); await Eco.post('m_fav', { lot: x.id, on }); const r = await Eco.post('m_mine', {}); if (r && r.ok) S.mine = r; draw(); }
    });
  }
  // ---- продать свою карточку: рамка цены, старт и «купить сразу», срок; или быстрая продажа ----
  async function sellSheet(key) {
    const c = Cards.get(key); if (!c) return;
    if (!Eco.on()) return toast('Продажа работает в Telegram (превью)');
    const pi = await Eco.post('m_price', { key });
    if (!pi || !pi.ok) return toast('Сервер не знает эту карточку — каталог обновляется');
    const own = Store.d.cards.own[key] || 0, free = own - ((Store.d.cards.lock || {})[key] || 0);
    const [lo, hi] = pi.range; let start = Price.up(Math.max(lo, pi.ref * 0.8)), bin = Price.round(Math.min(hi, Math.max(start + Price.step(start), pi.ref))), dur = 24;
    const el = document.createElement('div'); el.className = 'fm-sheet mk-sheet';
    const row = (k, v) => `<div class="mk-row"><small>${k === 'start' ? 'Стартовая цена' : 'Купить сразу'}</small><button class="fm-btn" data-ms="${k}:-1">−</button><b>${coin}${F(v)}</b><button class="fm-btn" data-ms="${k}:1">+</button></div>`;
    const draw = () => {
      el.innerHTML = `<div class="mk-sh">
        <div class="mk-sh-card">${Cards.html(c, { w: 150 })}</div>
        <div class="mk-sh-info"><small>Продать на рынке · у тебя ×${own}${own - free ? `, из них непередаваемых ${own - free}` : ''}</small><b>${esc(c.name)}</b>
          <div class="mk-pr"><span><small>Рыночная цена</small><b>${coin}${F(pi.ref)}</b></span><span><small>Можно от и до</small><b>${F(lo)}–${F(hi)}</b></span><span><small>Быстрая продажа</small><b>${coin}${F(pi.qs)}</b></span></div>
          ${row('start', start)}${row('bin', bin)}
          <div class="mk-dur">${ECON.market.durH.map((h) => `<button class="${h === dur ? 'on' : ''}" data-md="${h}">${h < 24 ? h + ' ч' : h / 24 + ' д'}</button>`).join('')}</div>
          <p class="mk-last">Получишь при продаже за «купить сразу»: ${coin}${F(Price.net(bin))} (налог ${Math.round(ECON.market.tax * 100)}%)</p>
          ${free > 0 ? '' : '<p class="mk-last">Карточка из награды — непередаваемая: на рынок нельзя, только быстрая продажа (как в FC)</p>'}<div class="mk-act"><button class="fm-btn gold" data-ms-go ${free > 0 ? '' : 'disabled'}>Выставить</button><button class="fm-btn" data-ms-qs>Быстрая продажа · ${F(pi.qs)}</button></div>
        </div><button class="fm-sh-x" aria-label="Закрыть">✕</button></div>`;
      if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
    };
    draw(); document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('.fm-sh-x')) return close();
      const s = e.target.closest('[data-ms]');
      if (s) { const [k, d] = s.dataset.ms.split(':'), v = k === 'start' ? start : bin, nv = +d > 0 ? Price.round(v + Price.step(v)) : Price.up(Math.max(lo, v - Price.step(v - 1)));
        if (k === 'start') start = Math.min(nv, bin); else bin = Math.max(start, Math.min(hi, nv)); return draw(); }
      const m = e.target.closest('[data-md]'); if (m) { dur = +m.dataset.md; return draw(); }
      if (e.target.closest('[data-ms-go]')) {
        const r = await Eco.post('m_list', { key, start, bin, dur, op: Eco.opid() });
        if (r && r.ok) { toast('Выставлено на рынок'); haptic('ok'); close(); await Eco.sync(); S.tab = 'lots'; S.mine = null; if (typeof FCM !== 'undefined') FCM.open('market'); }
        else toast(r && r.error === 'not owned or too many lots' ? `Не больше ${ECON.market.maxLots} лотов одновременно` : 'Цена вне рамки или карточки уже нет');
        return;
      }
      if (e.target.closest('[data-ms-qs]')) {
        Modal.open(`<h3>Быстрая продажа</h3><p>${esc(c.name)} уйдёт из клуба за ${F(pi.qs)} монет. На рынке можно получить больше: от ${F(Price.net(lo))}.</p>`, [
          { label: `Продать за ${F(pi.qs)}`, cls: 'gold', onClick: async () => { const r = await Eco.quick(key); if (r && r.ok) { toast(`+${F(r.got)} монет`); Sound.play('coin'); close(); if (typeof FCM !== 'undefined') FCM.refresh(); } else toast('Не получилось'); } },
          { label: 'Отмена', cls: 'ghost' }]);
      }
    });
  }
  function click(e) {
    const t = e.target.closest('[data-mk-tab]'); if (t) { S.tab = t.dataset.mkTab; Sound.play('tap'); document.querySelectorAll('[data-mk-tab]').forEach((b) => b.classList.toggle('on', b === t)); paint(); load(); return true; }
    const f = e.target.closest('[data-mk-f]'); if (f) { const [k, v] = f.dataset.mkF.split(':'); S.f[k] = k === 'rmin' ? +v : v; S.lots = null; paint(); load(); return true; }
    if (e.target.closest('[data-mk-sort]')) { S.f.sort = { ends: 'cheap', cheap: 'ovr', ovr: 'ends' }[S.f.sort]; S.lots = null; paint(); load(); return true; }
    const l = e.target.closest('[data-mk-lot]'); if (l) { Sound.play('tap'); lotSheet(+l.dataset.mkLot); return true; }
    if (e.target.closest('[data-mk-more]')) { const last = S.hist[S.hist.length - 1]; Eco.post('history', { before: last.id }).then((r) => { if (r && r.ok) { S.hist = S.hist.concat(r.rows); paint(); } }); return true; }
    return false;
  }
  let qt = null;
  function input(e) {
    if (e.target.matches('.mk-q')) { clearTimeout(qt); qt = setTimeout(() => { S.f.q = e.target.value.trim(); load(); }, 400); return true; }
    if (e.target.matches('.mk-pos')) { S.f.pos = e.target.value; S.lots = null; load(); return true; }
    return false;
  }
  return { render, load, click, input, sellSheet, open: (tab) => { if (tab) S.tab = tab; }, S };
})();
