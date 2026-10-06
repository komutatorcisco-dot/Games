// Награды как в Brawl Stars:
//  • паки за победы — первые 5 побед за день дают по паку (открывается как старр-дроп);
//  • путь трофеев — за победы растут трофеи, на ступенях пути лежат награды;
//  • сезонный пропуск — 4 недели, 30 уровней; бесплатная линия всем, премиум — за звёзды Telegram;
//  • задания — 3 на день и 3 на неделю, дают очки пропуска.
// Всё хранится в Store.d.rw и уезжает в облако Telegram вместе с остальным сохранением.
'use strict';

const Rewards = (() => {
  const DROPS_PER_DAY = 5, WIN_TROPHIES = 8, PLAY_TROPHIES = 1;
  const PASS_LEVELS = 30, PASS_STEP = 100, PASS_STARS = 100;
  const SEASON_START = Date.parse('2026-10-05T08:00:00Z'), SEASON_DAYS = 28;

  const S = () => {
    const d = Store.d;
    if (!d.rw) d.rw = {};
    const r = d.rw;
    r.trophies = r.trophies || 0; r.road = r.road || []; r.pending = r.pending || 0;
    r.drops = r.drops || { day: '', n: 0 };
    r.pass = r.pass || { season: 0, xp: 0, free: [], prem: [], premium: false };
    r.q = r.q || { day: '', list: [], week: '', wlist: [] };
    r.games = r.games || { week: '', ids: [] };
    return r;
  };
  const dayKey = () => Day.key();
  const weekKey = () => Release.weekKey();
  const season = () => Math.max(1, Math.floor((Date.now() - SEASON_START) / (SEASON_DAYS * 864e5)) + 1);
  const seasonEnd = () => SEASON_START + season() * SEASON_DAYS * 864e5;

  // ---------- что может выпасть ----------
  // Содержимое пака по итоговой редкости: монеты и иногда предмет
  function contents(lv) {
    const R = Pack3D.RAR[lv];
    const coins = R.prize[0] + Math.round((Math.random() * (R.prize[1] - R.prize[0])) / 5) * 5;
    // главное в паке — карточки футболистов; монеты идут довеском
    return { coins, cards: Cards.packCards(lv) };
  }
  // карточки: в коллекцию и показать по одной; повторы — монетами
  function giveCards(keys, then) {
    const res = Cards.add(keys);
    Cards.reveal(res, () => {
      const dup = res.reduce((s, x) => s + x.coins, 0);
      if (dup) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(dup); }
      refresh(); then && then();
    });
  }
  function grant(c, then) {
    if (c.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(c.coins); }
    if (c.cards && c.cards.length) { quest('pack'); refresh(); giveCards(c.cards, then); return; }
    if (c.item) {
      if (c.item.kind === 'life') Store.d.shop.lives += c.item.n || 1;
      else { Store.d.shop.owned[`${c.item.kind}:${c.item.id}`] = true; setTimeout(() => toast(`${c.item.name} — теперь твоя! Выбери в магазине`), 900); }
      Store.save();
    }
    quest('pack');
    refresh();
    then && then();
  }
  // открыть пак: minLevel — гарантированная редкость (с пути трофеев и пропуска)
  async function openDrop({ title, minLevel = 0, onStart, onDone } = {}) {
    try {
      await Pack3D.drop({ title, minLevel, contents, onStart, onTake: (c) => grant(c, () => onDone && onDone(c)) });
    } catch (e) { // нет 3D — просто выдаём содержимое
      onStart && onStart();
      const c = contents(minLevel);
      toast(`Пак: +${c.coins} монет`); grant(c, () => onDone && onDone(c));
    }
  }

  // ---------- путь трофеев ----------
  const ROAD = [
    [10, { coins: 50 }], [25, { pack: 1 }], [50, { card: 'gold' }], [80, { lives: 2 }], [120, { pack: 2 }],
    [170, { coins: 150 }], [230, { pack: 1 }], [300, { card: 'legend' }], [380, { coins: 250 }], [470, { pack: 3 }],
    [570, { pack: 2 }], [680, { card: 'legend' }], [800, { pack: 3 }], [950, { coins: 500 }], [1100, { pack: 2 }],
    [1300, { card: 'jack' }], [1500, { pack: 3 }], [1750, { coins: 800 }], [2000, { pack: 4 }],
  ];
  const PACKNAME = ['Пак', 'Сверхредкий пак', 'Эпический пак', 'Легендарный пак', 'Пак «ДЖЕКСОН!!»'];
  const PACKCOL = ['#3ee66b', '#4fc3ff', '#c27bff', '#ffcf3a', '#ff3b5c'];
  const CARDNAME = { gold: 'Золотая карточка', legend: 'Карточка-легенда', jack: 'Карточка «Джексон»' };
  function rewardLabel(r) {
    if (r.coins) return { ico: '<i class="coin"></i>', txt: `${r.coins}`, art: '<span class="rs-coins"><i class="coin"></i><i class="coin"></i><i class="coin"></i></span>', name: `+${r.coins}` };
    if (r.lives) return { ico: '❤️', txt: `×${r.lives}`, art: '<span class="rs-heart">❤️</span>', name: `Жизни ×${r.lives}` };
    if (r.card) return { ico: `<span class="rs-card sm ${r.card}">?</span>`, txt: CARDNAME[r.card].split(' ')[0], art: `<span class="rs-card ${r.card}">?</span>`, name: CARDNAME[r.card].replace('Карточка-', '').replace('Карточка ', '') };
    if (r.pack !== undefined) return { ico: `<span class="rw-pk" style="--c:${PACKCOL[r.pack]}"></span>`, txt: PACKNAME[r.pack].replace(' пак', '').replace('Пак «', '«'), art: `<span class="rs-pack" style="--c:${PACKCOL[r.pack]}"><b>Д</b></span>`, name: PACKNAME[r.pack].replace(' пак', '').replace('Пак «', '«') };
    return { ico: '🎁', txt: '', art: '🎁', name: '' };
  }
  function giveReward(r, title) {
    if (r.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(r.coins); }
    if (r.lives) { Store.d.shop.lives += r.lives; Store.save(); toast(`+${r.lives} ${plural(r.lives, 'жизнь', 'жизни', 'жизней')}`); }
    if (r.pack !== undefined) openDrop({ title, minLevel: r.pack });
    if (r.card) giveCards([Cards.draw(r.card).key]);
    refresh();
  }
  function claimRoad(i) {
    const s = S(); if (s.road.includes(i) || s.trophies < ROAD[i][0]) return;
    s.road.push(i); Store.save(); Sound.play('coin'); haptic('ok');
    giveReward(ROAD[i][1], `ПУТЬ ТРОФЕЕВ · ${ROAD[i][0]} 🏆`);
  }

  // ---------- сезонный пропуск ----------
  // [бесплатная, премиум] на каждом уровне
  const PASS = Array.from({ length: PASS_LEVELS }, (_, i) => {
    const L = i + 1;
    const free = L % 10 === 0 ? { pack: 3 } : L % 5 === 0 ? { pack: 2 } : L % 2 === 0 ? { pack: 0 } : { coins: 30 + L * 2 };
    const prem = L === PASS_LEVELS ? { pack: 4 } : L % 5 === 0 ? { pack: 3 } : L % 3 === 0 ? { lives: 1 } : L % 2 === 0 ? { pack: 1 } : { coins: 60 + L * 4 };
    return [free, prem];
  });
  function passSync() {
    const p = S().pass, sn = season();
    if (p.season !== sn) { p.season = sn; p.xp = 0; p.free = []; p.prem = []; p.premium = false; Store.save(); }
    return p;
  }
  const passLevel = () => Math.min(PASS_LEVELS, Math.floor(passSync().xp / PASS_STEP));
  function addPassXp(n) {
    const p = passSync(), before = passLevel();
    p.xp += n; Store.save();
    const after = passLevel();
    if (after > before) setTimeout(() => toast(`Пропуск: уровень ${after}! Забери награду во вкладке «Награды»`), 1400);
  }
  function claimPass(i, line) {
    const p = passSync(), L = i + 1;
    if (passLevel() < L) return;
    if (line === 'prem' && !p.premium) return buyPass();
    if (p[line].includes(i)) return;
    p[line].push(i); Store.save(); Sound.play('coin'); haptic('ok');
    giveReward(PASS[i][line === 'free' ? 0 : 1], `ПРОПУСК · УРОВЕНЬ ${L}`);
  }
  async function buyPass() {
    const base = CONFIG.api;
    if (!(base && TG && TG.openInvoice && TG.initData)) { toast('Купить пропуск можно в Telegram через бота @JacksonGamesbot'); return; }
    try {
      const r = await fetch(`${base}/invoice?item=pass&season=${season()}&initData=${encodeURIComponent(TG.initData)}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || 'invoice');
      TG.openInvoice(r.link, (status) => {
        if (status === 'paid') { passSync().premium = true; Store.save(); confetti(); Sound.play('goal'); toast('Премиум-пропуск открыт! Забирай награды'); refresh(); }
        else if (status === 'failed') toast('Платёж не прошёл');
      });
    } catch (e) { toast('Не получилось открыть оплату. Попробуй позже'); }
  }
  // сервер подтверждает покупку (ответ /hello) — на случай, если оплатил с другого устройства
  function serverPass(seasons) { if (Array.isArray(seasons) && seasons.includes(season())) { const p = passSync(); if (!p.premium) { p.premium = true; Store.save(); refresh(); } } }

  // ---------- задания ----------
  const DAILY = [
    { id: 'play3', t: 'Сыграй 3 матча', ev: 'end', n: 3, xp: 100 },
    { id: 'win2', t: 'Выиграй 2 раза', ev: 'win', n: 2, xp: 120 },
    { id: 'win4', t: 'Выиграй 4 раза', ev: 'win', n: 4, xp: 180 },
    { id: 'dly', t: 'Угадай «Игрока дня»', ev: 'win:act:dly', n: 1, xp: 150 },
    { id: 'pack', t: 'Открой пак', ev: 'pack', n: 1, xp: 80 },
    { id: 'duel', t: 'Сыграй «Футбольную дуэль»', ev: 'end:ng:duel', n: 1, xp: 120 },
    { id: 'wordle', t: 'Сыграй в Wordle', ev: 'end:ng:wordle', n: 1, xp: 100 },
    { id: 'auction', t: 'Выиграй аукцион', ev: 'win:act:auction-bot', n: 1, xp: 130 },
    { id: 'nation', t: 'Сыграй «Угадай сборную»', ev: 'end:act:nation', n: 1, xp: 100 },
  ];
  const WEEKLY = [
    { id: 'w-win15', t: 'Выиграй 15 раз', ev: 'win', n: 15, xp: 450 },
    { id: 'w-play30', t: 'Сыграй 30 матчей', ev: 'end', n: 30, xp: 400 },
    { id: 'w-dly4', t: 'Угадай «Игрока дня» 4 раза', ev: 'win:act:dly', n: 4, xp: 500 },
    { id: 'w-games5', t: 'Сыграй в 5 разных игр', ev: 'game', n: 5, xp: 450 },
  ];
  // выбор заданий детерминирован по дню, чтобы при перезапуске не менялись
  function pick(pool, k, seed) {
    let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const a = pool.slice(); const out = [];
    while (out.length < k && a.length) { h = (h * 1103515245 + 12345) >>> 0; out.push(a.splice(h % a.length, 1)[0]); }
    return out;
  }
  function questSync() {
    const q = S().q, d = dayKey(), w = weekKey();
    const avail = DAILY.filter((x) => { const g = x.ev.split(':').slice(1).join(':'); return !g || g === 'act:dly' || Release.isOut(g); });
    if (q.day !== d) { q.day = d; q.list = pick(avail, 3, d).map((x) => ({ id: x.id, p: 0, done: false, got: false })); }
    if (q.week !== w) { q.week = w; q.wlist = pick(WEEKLY, 3, w).map((x) => ({ id: x.id, p: 0, done: false, got: false })); S().games = { week: w, ids: [] }; }
    return q;
  }
  const qdef = (id) => DAILY.find((x) => x.id === id) || WEEKLY.find((x) => x.id === id);
  function quest(ev, game = '') {
    const q = questSync();
    const hit = (def) => def.ev === ev || (game && def.ev === `${ev}:${game}`);
    let changed = false;
    [...q.list, ...q.wlist].forEach((x) => {
      const def = qdef(x.id); if (!def || x.done) return;
      if (hit(def)) { x.p = Math.min(def.n, x.p + 1); changed = true; if (x.p >= def.n) { x.done = true; setTimeout(() => toast(`Задание выполнено: ${def.t} ✓`), 1200); } }
    });
    if (changed) Store.save();
  }
  function claimQuest(id) {
    const q = questSync(), x = [...q.list, ...q.wlist].find((y) => y.id === id);
    if (!x || !x.done || x.got) return;
    x.got = true; addPassXp(qdef(id).xp); Sound.play('coin'); haptic('ok'); refresh();
  }

  // ---------- сыграли партию ----------
  // win — победа, game — ключ игры ('ng:wordle', 'act:dly'…). Возвращает подпись для экрана итога.
  function onEnd(win, game = '') {
    const s = S();
    quest('end', game);
    const g = s.games; if (g.week !== weekKey()) { g.week = weekKey(); g.ids = []; }
    if (game && !g.ids.includes(game)) { g.ids.push(game); quest('game'); }
    addPassXp(win ? 20 : 5);
    if (!win) { s.trophies += PLAY_TROPHIES; Store.save(); refresh(); return ''; }
    quest('win', game);
    s.trophies += WIN_TROPHIES;
    if (s.drops.day !== dayKey()) s.drops = { day: dayKey(), n: 0 };
    let note = `<span>🏆 +${WIN_TROPHIES}</span>`;
    if (s.drops.n < DROPS_PER_DAY) { s.drops.n++; s.pending++; note += `<span class="rw-new"><i class="rw-pk"></i>+1 пак · ${s.drops.n}/${DROPS_PER_DAY} сегодня</span>`; }
    Store.save(); refresh();
    return `<div class="rw-earn">${note}</div>`;
  }
  // открыть накопленные паки по одному
  function openPending() {
    const s = S(); if (!s.pending) return;
    openDrop({ title: `ПАК ЗА ПОБЕДУ · ОСТАЛОСЬ ${s.pending}`, onStart: () => { s.pending = Math.max(0, s.pending - 1); Store.save(); refresh(); },
      onDone: () => { if (S().pending) setTimeout(openPending, 500); } });
  }

  // ---------- экран «Награды»: дорога трофеев лентой, ниже коллекция / пропуск / задания ----------
  let tab = 'cards';
  function claimable() {
    const s = S(), p = passSync(), q = questSync(), L = passLevel();
    const road = ROAD.filter(([t], i) => s.trophies >= t && !s.road.includes(i)).length;
    let pass = 0; for (let i = 0; i < L; i++) { if (!p.free.includes(i)) pass++; if (p.premium && !p.prem.includes(i)) pass++; }
    const qs = [...q.list, ...q.wlist].filter((x) => x.done && !x.got).length;
    return { road, pass, qs, packs: s.pending, all: road + pass + qs + s.pending };
  }
  function header() {
    const u = Store.d.user || {};
    $$('.mh-nick').forEach((el) => { el.textContent = u.nick || 'Игрок'; });
    $$('.mh-ava').forEach((el) => { el.textContent = u.emoji || '⚽'; });
    $$('.mh-tro').forEach((el) => { el.textContent = `🏆 ${S().trophies}`; });
    $$('.mh-cn').forEach((el) => { el.textContent = Cards.count(); });
    $$('.mh-cards').forEach((el) => el.classList.toggle('fresh', Cards.freshN() > 0));
  }
  function refresh() {
    const c = claimable();
    $$('.rw-dot').forEach((el) => { el.textContent = c.all > 9 ? '9+' : c.all; el.hidden = !c.all; });
    const ch = $('#hub-packs'); if (ch) { ch.hidden = !S().pending; ch.querySelector('b').textContent = S().pending; }
    header();
    if (Screens.current === 'rewards') render();
  }
  function cell(r, state, i, line) {
    const l = rewardLabel(r);
    return `<button class="rw-cell ${state}" ${state === 'ready' ? `data-${line}="${i}"` : ''}><span class="rw-ico">${l.ico}</span><b>${l.txt}</b>${state === 'got' ? '<i class="rw-ok">✓</i>' : state === 'lock' ? '<i class="rw-lock">🔒</i>' : ''}</button>`;
  }
  function road(s) {
    const next = ROAD.find(([t]) => s.trophies < t);
    const steps = ROAD.map(([t, r], i) => {
      const l = rewardLabel(r), got = s.road.includes(i), ready = !got && s.trophies >= t;
      const prev = i ? ROAD[i - 1][0] : 0;
      const fill = s.trophies >= t ? 100 : s.trophies <= prev ? 0 : Math.round(((s.trophies - prev) / (t - prev)) * 100);
      return `<button class="rs ${got ? 'got' : ready ? 'ready' : 'lock'}" ${ready ? `data-road="${i}"` : ''}>
        <span class="rs-art">${l.art}</span><span class="rs-name">${ready ? 'Забрать!' : l.name}</span>${got ? '<i class="rs-ok">✓</i>' : ''}
        <span class="rs-seg"><i style="width:${fill}%"></i></span><span class="rs-t">${t}</span></button>`;
    }).join('');
    return `<div class="rw-sec"><div class="rw-row"><b>Дорога трофеев</b><small>🏆 ${s.trophies}${next ? ` → ${next[0]}` : ' · пройдена!'}</small></div>
      <div class="rs-strip">${steps}</div><p class="rw-sub">За победу +${WIN_TROPHIES} 🏆, за матч +${PLAY_TROPHIES}</p></div>`;
  }
  function render() {
    const s = S(), p = passSync(), q = questSync(), c = claimable();
    const packs = s.pending ? `<button class="rw-packs" data-act="rw-packs"><span class="rw-pk big"></span><span><b>${s.pending} ${plural(s.pending, 'пак', 'пака', 'паков')} за победы</b><small>Внутри карточки футболистов</small></span><em>Открыть</em></button>` : '';
    const tabs = `<nav class="rw-tabs">${[['cards', `Коллекция`, Cards.freshN() ? 'NEW' : ''], ['pass', 'Пропуск', c.pass], ['quests', 'Задания', c.qs]].map(([k, n, k2]) => `<button data-rwtab="${k}" class="${tab === k ? 'on' : ''}">${n}${k2 ? `<i>${k2}</i>` : ''}</button>`).join('')}</nav>`;
    let body = '';
    if (tab === 'cards') body = `<div class="rw-coll">${Cards.album()}</div>`;
    else if (tab === 'pass') {
      const L = passLevel(), left = Math.max(0, Math.ceil((seasonEnd() - Date.now()) / 864e5));
      body = `<div class="rw-head"><span class="rw-tro">Сезон ${season()} · ур. <b>${L}</b></span><small>${L < PASS_LEVELS ? `${p.xp % PASS_STEP}/${PASS_STEP} до уровня ${L + 1} · ` : ''}до конца сезона ${left} ${plural(left, 'день', 'дня', 'дней')}</small>
          <span class="rw-bar"><i style="width:${L >= PASS_LEVELS ? 100 : (p.xp % PASS_STEP)}%"></i></span>
          ${p.premium ? '<span class="rw-prem on">Премиум открыт ⭐</span>' : `<button class="btn gold rw-buy" data-act="rw-buy">Премиум-пропуск · ${PASS_STARS} ⭐</button>`}</div>
        <div class="rw-pass"><div class="rw-ph"><span></span><b>Бесплатно</b><b class="pr">Премиум ⭐</b></div>
        ${PASS.map(([f, pr], i) => `<div class="rw-prow ${L > i ? 'reach' : ''}"><span class="rw-lv">${i + 1}</span>${cell(f, p.free.includes(i) ? 'got' : L > i ? 'ready' : 'lock', i, 'free')}${cell(pr, p.prem.includes(i) ? 'got' : L > i && p.premium ? 'ready' : 'lock', i, 'prem')}</div>`).join('')}</div>
        <p class="rw-note">Очки пропуска: за победу +20, за матч +5, за задания — больше всего.</p>`;
    } else {
      const row = (x) => { const d = qdef(x.id); return `<div class="rw-q ${x.got ? 'got' : x.done ? 'done' : ''}"><div><b>${d.t}</b><span class="rw-bar sm"><i style="width:${(x.p / d.n) * 100}%"></i></span><small>${x.p}/${d.n} · +${d.xp} очков пропуска</small></div>
        ${x.got ? '<i class="rw-ok">✓</i>' : x.done ? `<button class="btn gold" data-quest="${x.id}">Забрать</button>` : ''}</div>`; };
      body = `<h3 class="section-label">На сегодня</h3>${q.list.map(row).join('')}<h3 class="section-label">На неделю</h3>${q.wlist.map(row).join('')}
        <p class="rw-note">Новые задания каждый день в полночь по МСК, недельные — в понедельник.</p>`;
    }
    const box = $('#rewards-body');
    const keep = box.querySelector('.rs-strip'), sx = keep ? keep.scrollLeft : null;
    box.innerHTML = road(s) + packs + tabs + body;
    // лента: к ближайшей награде (готовой или следующей)
    const strip = box.querySelector('.rs-strip');
    if (sx !== null) strip.scrollLeft = sx;
    else { const t = strip.querySelector('.rs.ready') || strip.querySelector('.rs.lock'); if (t) strip.scrollLeft = Math.max(0, t.offsetLeft - 16); }
    header();
  }
  function open(t) { if (t) tab = t; Modal.close(); Screens.show('rewards'); render(); window.scrollTo(0, 0); }
  function bind() {
    $('#rewards-body').addEventListener('click', (e) => {
      const t = e.target.closest('[data-rwtab]'); if (t) { tab = t.dataset.rwtab; Sound.play('tap'); render(); return; }
      const cl = Cards.onClick(e); if (cl === true) { render(); return; } if (cl) return;
      const r = e.target.closest('[data-road]'); if (r) return claimRoad(+r.dataset.road);
      const f = e.target.closest('[data-free]'); if (f) return claimPass(+f.dataset.free, 'free');
      const pr = e.target.closest('[data-prem]'); if (pr) return claimPass(+pr.dataset.prem, 'prem');
      const q = e.target.closest('[data-quest]'); if (q) return claimQuest(q.dataset.quest);
    });
    header();
  }

  return { onEnd, quest, openPending, openDrop, open, bind, refresh, buyPass, serverPass, claimable, contents, season, S };
})();
