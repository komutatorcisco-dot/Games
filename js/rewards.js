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
    // новая дорога (v2): что уже забрано по старой — считаем забранным до того же порога, чтобы не выдать дважды
    if (r.rv !== 2) { const max = Math.max(0, ...r.road.map((i) => OLD_ROAD[i] || 0)); r.road = ROAD.map(([t], i) => (t <= max ? i : -1)).filter((i) => i >= 0); r.rv = 2; }
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
    const R = PackOpen.LV[lv];
    const coins = R.prize[0] + Math.round((Math.random() * (R.prize[1] - R.prize[0])) / 5) * 5;
    // главное в паке — карточки футболистов; монеты идут довеском
    return { coins, cards: Cards.packCards(lv) };
  }
  // записать содержимое пака: монеты, карточки (повторы — монетами); вернуть, что выпало
  function commit(c) {
    if (c.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(c.coins); }
    const res = Cards.add(c.cards || []);
    const dup = res.reduce((s, x) => s + x.coins, 0);
    if (dup) Coins.add(dup);
    quest('pack'); refresh();
    return res;
  }
  // карточки без пака (дорога трофеев, награды): в коллекцию и показать
  function giveCards(keys, then) {
    const res = Cards.add(keys);
    const dup = res.reduce((s, x) => s + x.coins, 0);
    if (dup) Coins.add(dup);
    refresh();
    PackOpen.reveal(res, () => { refresh(); then && then(); });
  }
  // открыть пак: minLevel — гарантированная редкость (с пути трофеев и пропуска)
  async function openDrop({ title, minLevel = 0, onStart, onDone, label } = {}) {
    PackOpen.drop({ title, minLevel, label, contents, commit, onStart, onDone });
  }

  // ---------- путь трофеев ----------
  // до 80 🏆 паков и карточек ещё нет (раздел открывается на 80) — ранние награды монетами
  const ROAD = [
    [10, { coins: 50 }], [25, { coins: 80 }], [50, { coins: 100 }], [80, { pack: 1 }], [100, { lives: 2 }],
    [120, { pack: 1 }], [170, { card: 'gold' }], [230, { pack: 2 }], [300, { pack: 2 }], [400, { card: 'legend' }],
    [500, { pack: 3 }], [600, { coins: 500 }], [700, { pack: 2 }], [800, { card: 'legend' }], [950, { pack: 3 }],
    [1100, { pack: 2 }], [1300, { card: 'jack' }], [1500, { pack: 3 }], [1750, { coins: 800 }], [2000, { pack: 4 }],
  ];
  const OLD_ROAD = [10, 25, 50, 80, 120, 170, 230, 300, 380, 470, 570, 680, 800, 950, 1100, 1300, 1500, 1750, 2000];
  const PACKNAME = ['Обычный пак', 'Сверхредкий пак', 'Эпический пак', 'Легендарный пак', 'Пак «ДЖЕКСОН!!»'];
  const PACKCOL = ['#7fe0a0', '#56d4ff', '#b98bff', '#f2cb5c', '#ff4f66'];
  const CARDNAME = { gold: 'Золотая карточка', legend: 'Карточка-легенда', jack: 'Карточка «Джексон»' };
  function rewardLabel(r) {
    if (r.coins) return { ico: '<i class="coin"></i>', txt: `${r.coins}`, art: '<span class="rs-coins"><i class="coin"></i><i class="coin"></i><i class="coin"></i></span>', name: `+${r.coins}` };
    if (r.lives) return { ico: `<span class="ui-red">${Ui.get('heart')}</span>`, txt: `×${r.lives}`, art: `<span class="rs-heart">${Ui.get('heart')}</span>`, name: `Жизни ×${r.lives}` };
    if (r.card) return { ico: `<span class="rs-card sm ${r.card}">?</span>`, txt: CARDNAME[r.card].split(' ')[0], art: `<span class="rs-card ${r.card}">?</span>`, name: CARDNAME[r.card].replace('Карточка-', '').replace('Карточка ', '') };
    if (r.pack !== undefined) return { ico: `<span class="rw-pk" style="--c:${PACKCOL[r.pack]}"></span>`, txt: PACKNAME[r.pack].replace(' пак', '').replace('Пак «', '«'), art: PackOpen.art(r.pack, 'rs'), name: PACKNAME[r.pack].replace(' пак', '').replace('Пак «', '«') };
    return { ico: Ui.get('gift'), txt: '', art: Ui.get('gift'), name: '' };
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
    giveReward(ROAD[i][1], `ДОРОГА ТРОФЕЕВ · ${ROAD[i][0]}`);
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
    let note = `<span>${Ui.get('trophy')} +${WIN_TROPHIES}</span>`;
    if (Release.feature('cards') && s.drops.n < DROPS_PER_DAY) { s.drops.n++; s.pending++; note += `<span class="rw-new"><i class="rw-pk"></i>+1 пак · ${s.drops.n}/${DROPS_PER_DAY} сегодня</span>`; }
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
  let tab = 'road', scrolled = false;
  function claimable() {
    const s = S(), p = passSync(), q = questSync(), L = passLevel();
    const road = ROAD.filter(([t], i) => s.trophies >= t && !s.road.includes(i)).length;
    let pass = 0; for (let i = 0; i < L; i++) { if (!p.free.includes(i)) pass++; if (p.premium && !p.prem.includes(i)) pass++; }
    const qs = [...q.list, ...q.wlist].filter((x) => x.done && !x.got).length;
    const sets = safe('sets', () => Cards.readySets()) || 0;
    return { road, pass, qs, sets, packs: s.pending, all: road + pass + qs + sets + s.pending };
  }
  function header() {
    const u = Store.d.user || {};
    $$('.mh-nick').forEach((el) => { el.textContent = u.nick || 'Игрок'; });
    $$('.mh-ava').forEach((el) => { el.textContent = u.emoji || '⚽'; });
    $$('.mh-tro').forEach((el) => { el.innerHTML = `${Ui.get('trophy')} ${S().trophies}`; });
    $$('.mh-cn').forEach((el) => { el.textContent = Cards.count(); });
    const cardsOn = Release.feature('cards');
    $$('.mh-cards').forEach((el) => { el.hidden = !cardsOn; });
    $$('.mh-cards').forEach((el) => el.classList.toggle('fresh', Cards.freshN() > 0));
  }
  function refresh() {
    const c = claimable();
    $$('.rw-dot').forEach((el) => { el.textContent = c.all > 9 ? '9+' : c.all; el.hidden = !c.all; });
    const ch = $('#hub-packs'); if (ch) { ch.hidden = !S().pending; ch.querySelector('b').textContent = S().pending; }
    header();
    if (Screens.current === 'rewards') render();
    if (Screens.current === 'hub' && typeof Home !== 'undefined') safe('home2', () => Home.render());
  }
  function cell(r, state, i, line) {
    const l = rewardLabel(r);
    return `<button class="rw-cell ${state}" ${state === 'ready' ? `data-${line}="${i}"` : ''}><span class="rw-ico">${l.ico}</span><b>${l.txt}</b>${state === 'got' ? '<i class="rw-ok">✓</i>' : state === 'lock' ? `<i class="rw-lock">${Ui.get('lock')}</i>` : ''}</button>`;
  }
  function road(s) {
    const next = ROAD.find(([t]) => s.trophies < t);
    const items = [...ROAD.map(([t, r], i) => ({ t, r, i })), ...Release.UNLOCKS.filter((u) => u[0] > 0 && u[0] <= 2000).map((u) => ({ t: u[0], u }))].sort((a, b) => a.t - b.t || (a.u ? -1 : 1));
    let prev = 0;
    const steps = items.map((x) => {
      const fill = s.trophies >= x.t ? 100 : s.trophies <= prev ? 0 : Math.round(((s.trophies - prev) / (x.t - prev)) * 100);
      prev = x.t;
      if (x.u) {
        const k = x.u[2][0], g = Home.catalog().get(k), on = s.trophies >= x.t;
        const ic = k === 'feat:cards' ? Ui.get('pack') : k === 'feat:pass' ? Ui.get('star') : g && typeof Icons !== 'undefined' ? Icons.get(g.ico) : Ui.get('lock');
        return `<div class="rs un ${on ? 'got' : 'lock'}" style="--c1:${(g && g.c1) || '#ffcf3a'};--c2:${(g && g.c2) || '#ff8a2a'}">
          <span class="rs-art"><span class="rs-hex">${ic}</span>${on ? '' : `<i class="rs-lk">${Ui.get('lock')}</i>`}</span><span class="rs-name">${esc(x.u[1])}</span>
          <span class="rs-seg"><i style="width:${fill}%"></i></span><span class="rs-t">${x.t}</span></div>`;
      }
      const l = rewardLabel(x.r), got = s.road.includes(x.i), ready = !got && s.trophies >= x.t;
      return `<button class="rs ${got ? 'got' : ready ? 'ready' : 'lock'}" ${ready ? `data-road="${x.i}"` : ''}>
        <span class="rs-art">${l.art}</span><span class="rs-name">${ready ? 'Забрать!' : l.name}</span>${got ? '<i class="rs-ok">✓</i>' : ''}
        <span class="rs-seg"><i style="width:${fill}%"></i></span><span class="rs-t">${x.t}</span></button>`;
    }).join('');
    return `<div class="rw-sec"><div class="rw-row"><b>Дорога трофеев</b><small>${Ui.get('trophy')} ${s.trophies}${next ? ` → ${next[0]}` : ' · пройдена!'}</small></div>
      <div class="rs-strip">${steps}</div><p class="rw-sub">Победа +${WIN_TROPHIES} ${Ui.get('trophy')}, матч +${PLAY_TROPHIES}</p></div>`;
  }
  // ---------- дорога трофеев: вертикальный путь как в Brawl Stars ----------
  const PACK_CARDS = [3, 5, 8, 15, 30];
  function roadTitle(r) {
    if (r.coins) return [`${r.coins} монет`, 'На счёт сразу'];
    if (r.lives) return [`${r.lives} ${plural(r.lives, 'жизнь', 'жизни', 'жизней')}`, 'Продолжить серию в играх'];
    if (r.card) return [CARDNAME[r.card], 'Случайный игрок этой редкости'];
    if (r.pack !== undefined) return [PACKNAME[r.pack], `${PACK_CARDS[r.pack]} ${plural(PACK_CARDS[r.pack], 'карточка', 'карточки', 'карточек')} внутри`];
    return ['Награда', ''];
  }
  const RDCOL = { coins: ['#ffd84a', '#e59a12'], lives: ['#ff6b7d', '#c9223e'], gold: ['#ffd84a', '#c98a12'], legend: ['#c99bff', '#6a3fd0'], jack: ['#ff6b7d', '#b0123a'] };
  function trophyRoad(s) {
    const t = s.trophies;
    const items = [...ROAD.map(([th, r], i) => ({ t: th, r, i })), ...Release.UNLOCKS.filter((u) => u[0] > 0).slice(0, 14).map((u) => ({ t: u[0], u }))]
      .filter((x) => x.t <= Math.max(2000, (ROAD[ROAD.length - 1] || [0])[0])).sort((a, b) => a.t - b.t || (a.u ? -1 : 1));
    const next = items.find((x) => x.t > t);
    const prevT = [...items].reverse().find((x) => x.t <= t), from = prevT ? prevT.t : 0;
    const pct = next ? Math.round(((t - from) / (next.t - from)) * 100) : 100;
    const nextName = next ? (next.u ? next.u[1] : roadTitle(next.r)[0]) : '';
    const hero = `<div class="rd-hero"><span class="rd-cup">${Ui.get('trophy')}</span><b class="rd-n">${t}</b>
      <div class="rd-hn">${next ? `<small>До «${esc(nextName)}» — ещё <b>${next.t - t}</b></small><span class="rd-bar"><i style="width:${pct}%"></i></span>` : '<small><b>Дорога пройдена!</b></small>'}</div>
      <div class="rd-how"><span>Победа <b>+${WIN_TROPHIES}</b></span><span>Матч <b>+${PLAY_TROPHIES}</b></span></div></div>`;
    let hereDone = false, side = 0;
    const here = () => `<div class="rd-here"><span class="rd-me">${esc((Store.d.user || {}).emoji || '⚽')}</span><b>Ты здесь</b></div>`;
    const rows = items.map((x) => {
      let out = '';
      if (!hereDone && x.t > t) { hereDone = true; out += here(); }
      const reached = t >= x.t;
      if (x.u) {
        const k = x.u[2][0], g = Home.catalog().get(k), feat = k.startsWith('feat:');
        const ic = k === 'feat:cards' ? Ui.get('pack') : k === 'feat:pass' ? Ui.get('star') : g && typeof Icons !== 'undefined' ? Icons.get(g.ico) : Ui.get('lock');
        out += `<div class="rd-gate ${reached ? 'got' : 'lock'}" style="--c1:${(g && g.c1) || '#ffcf3a'};--c2:${(g && g.c2) || '#ff8a2a'}">
          <span class="rd-hex"><span>${ic}</span></span>
          <span class="rd-gt"><small>${feat ? 'Новый раздел' : 'Новая игра'} · ${x.t} ${Ui.get('trophy')}</small><b>${esc(x.u[1])}</b></span>
          <span class="rd-gs">${reached ? Ui.get('star') : Ui.get('lock')}</span></div>`;
      } else {
        const got = s.road.includes(x.i), ready = !got && reached, l = rewardLabel(x.r), [ti] = roadTitle(x.r);
        const col = x.r.pack !== undefined ? [PACKCOL[x.r.pack], `color-mix(in srgb, ${PACKCOL[x.r.pack]} 45%, #1a1446)`] : RDCOL[x.r.card || (x.r.coins ? 'coins' : 'lives')] || RDCOL.coins;
        const st = got ? 'got' : ready ? 'ready' : 'lock';
        out += `<div class="rd-row ${side++ % 2 ? 'r' : 'l'} ${st}">
          <button class="rd-tile" style="--t1:${col[0]};--t2:${col[1]}" ${ready ? `data-road="${x.i}"` : ''}>
            <span class="rd-art">${l.art}</span><b class="rd-nm">${esc(ti)}</b>
            ${got ? '<i class="rd-ok">✓</i>' : ready ? '<i class="rd-take">Забрать</i>' : ''}</button>
          <span class="rd-sh">${x.t}</span></div>`;
      }
      return out;
    }).join('') + (hereDone ? '' : here());
    return hero + `<div class="rd-path">${rows}</div>`;
  }

  function render() {
    const s = S(), p = passSync(), q = questSync(), c = claimable();
    const packs = s.pending && Release.feature('cards') ? `<button class="rw-packs" data-act="rw-packs"><span class="rw-pkart">${PackOpen.art(0, 'rs')}</span><span><b>${s.pending} ${plural(s.pending, 'пак', 'пака', 'паков')} за победы</b><small>Внутри карточки футболистов</small></span><em>Открыть</em></button>` : '';
    const TB = [['road', 'Путь', c.road], Release.feature('cards') && ['cards', 'Галерея', c.sets || (Cards.freshN() ? 'NEW' : '')], Release.feature('pass') && ['pass', 'Пропуск', c.pass], Release.feature('pass') && ['quests', 'Задания', c.qs]].filter(Boolean);
    if (TB.length && !TB.some(([k]) => k === tab)) tab = TB[0][0];
    const sbcOn = Release.isOut('act:sbc');
    const tabs = !TB.length ? '' : `<nav class="rw-tabs" style="--n:${TB.length + (sbcOn ? 1 : 0)}">${TB.map(([k, n, k2]) => `<button data-rwtab="${k}" class="${tab === k ? 'on' : ''}">${n}${k2 ? `<i>${k2}</i>` : ''}</button>`).join('')}${sbcOn ? `<button data-act="sbc" class="rw-sbc">ИПК${typeof SBC !== 'undefined' && SBC.ready() ? '<i>1</i>' : ''}</button>` : ''}</nav>`;
    let body = '';
    const nx = Release.next();
    if (tab === 'road') body = trophyRoad(s);
    else if (!TB.length) body = nx ? `<div class="rw-soon"><span>${Ui.get('lock')}</span><b>${esc(nx.title)}</b><small>Откроется на ${nx.need} ${Ui.get('trophy')}. Побеждай в играх!</small></div>` : '';
    else if (tab === 'cards') body = `<div class="rw-coll">${Cards.album()}</div>`;
    else if (tab === 'pass') {
      const L = passLevel(), left = Math.max(0, Math.ceil((seasonEnd() - Date.now()) / 864e5));
      body = `<div class="rw-head"><span class="rw-tro">Сезон ${season()} · ур. <b>${L}</b></span><small>${L < PASS_LEVELS ? `${p.xp % PASS_STEP}/${PASS_STEP} до уровня ${L + 1} · ` : ''}до конца сезона ${left} ${plural(left, 'день', 'дня', 'дней')}</small>
          <span class="rw-bar"><i style="width:${L >= PASS_LEVELS ? 100 : (p.xp % PASS_STEP)}%"></i></span>
          ${p.premium ? `<span class="rw-prem on">Премиум открыт ${Ui.get('star')}</span>` : `<button class="btn gold rw-buy" data-act="rw-buy">Премиум-пропуск · ${PASS_STARS} ⭐</button>`}</div>
        <div class="rw-pass"><div class="rw-ph"><span></span><b>Бесплатно</b><b class="pr">Премиум ${Ui.get('star')}</b></div>
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
    box.innerHTML = packs + tabs + body;
    if (tab === 'road') {
      const here = box.querySelector('.rd-here');
      if (here && !scrolled) { scrolled = true; requestAnimationFrame(() => scrollTo(0, Math.max(0, here.getBoundingClientRect().top + scrollY - innerHeight * 0.42))); }
      if (!box.dataset.roadIn) { box.dataset.roadIn = 1; $$('.rd-row, .rd-gate, .rd-here, .rd-hero', box).forEach((n, i) => n.animate && n.animate([{ transform: 'translateY(18px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: Math.min(600, i * 30), easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' })); }
    }
    header();
  }
  function open(t) { if (t) tab = t; scrolled = false; delete $('#rewards-body').dataset.roadIn; Modal.close(); Screens.show('rewards'); window.scrollTo(0, 0); render(); }
  function bind() {
    $('#rewards-body').addEventListener('click', (e) => {
      const t = e.target.closest('[data-rwtab]'); if (t) { tab = t.dataset.rwtab; Sound.play('tap'); render(); return; }
      const cl = Cards.onClick(e); if (cl === true) { render(); if (Cards.takeJump()) { const g = $('#rewards-body .rw-coll'); if (g) scrollTo(0, g.getBoundingClientRect().top + scrollY - 70); } return; } if (cl) return;
      const r = e.target.closest('[data-road]'); if (r) return claimRoad(+r.dataset.road);
      const f = e.target.closest('[data-free]'); if (f) return claimPass(+f.dataset.free, 'free');
      const pr = e.target.closest('[data-prem]'); if (pr) return claimPass(+pr.dataset.prem, 'prem');
      const q = e.target.closest('[data-quest]'); if (q) return claimQuest(q.dataset.quest);
    });
    header();
  }

  return { onEnd, quest, openPending, openDrop, open, bind, refresh, buyPass, serverPass, claimable, contents, season, S };
})();
