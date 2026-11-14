// Дивизионы (5.11): главный режим, где растут трофеи. Матч 3 на 3 своим составом против бота; 10 дивизионов
// (10 → 1, первый — «Элита»). Победа даёт очки дивизиона и трофеи; ниже начала своего дивизиона не опускаешься.
// Раз в неделю — награда по лучшему дивизиону недели: злые мячи, лаймовые очки, монеты.
// Сохранение: Store.d.div = { pts, w, dr, l, best, week, wbest, prize, live, last }.
'use strict';

const Division = (() => {
  const START = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2750]; // очки начала дивизиона 10 … 1
  const PTS = { win: 30, draw: 10, loss: -15 };
  const TIER = (i) => (i >= 9 ? 'elite' : i >= 6 ? 'gold' : i >= 3 ? 'silver' : 'bronze');
  // недельная награда по лучшему дивизиону: [злых мячей, лаймовых очков, монет]
  const WEEK = [[1, 50, 200], [1, 70, 300], [1, 90, 400], [2, 120, 500], [2, 150, 650], [2, 180, 800], [3, 220, 1000], [3, 260, 1200], [3, 320, 1500], [4, 400, 2000]];
  const S = () => { const d = Store.d; if (!d.div || typeof d.div !== 'object') d.div = { pts: 0, w: 0, dr: 0, l: 0, best: 0, week: '', wbest: 0, prize: null, live: 0, last: null }; return d.div; };
  const idx = (p = S().pts) => { let i = 0; while (i < START.length - 1 && p >= START[i + 1]) i++; return i; };
  const num = (i) => 10 - i;
  const name = (i) => (i >= 9 ? 'Элита' : `Дивизион ${num(i)}`);
  const diff = (i) => (i < 3 ? 0 : i < 7 ? 1 : 2);
  const tro = (res, i) => (res === 'win' ? 20 + i * 3 : res === 'draw' ? 8 : 0);
  const wk = () => (typeof Release !== 'undefined' && Release.weekKey ? Release.weekKey() : new Date().toISOString().slice(0, 10));

  // новая неделя: награда за лучший дивизион прошлой недели ждёт, пока её заберут
  function week() {
    const s = S(), w = wk();
    if (s.week !== w) { if (s.week) s.prize = { week: s.week, i: s.wbest }; s.week = w; s.wbest = idx(); Store.save(); }
    return s;
  }
  function claimWeek() {
    const s = week(), p = s.prize; if (!p) return;
    const [a, lime, coins] = WEEK[p.i]; s.prize = null; Store.save();
    if (typeof Rewards !== 'undefined' && Rewards.angry) Rewards.angry(a);
    if (typeof Lime !== 'undefined') Lime.add(lime, 'road');
    Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(coins, 'game');
    Sound.play('goal'); haptic('ok'); toast(`Награда недели: ${a} злых мяча, ${lime} лаймовых очков`);
  }

  // ---- онлайн (14.11): соперник — состав живого игрока своего или соседнего дивизиона (сервер /div), его командой играет
  // компьютер — поэтому без ожидания и без обрывов. Никого нет или нет связи — соперник-бот того же уровня.
  const BOTS = ['ФК Дворовые', 'Олимп Север', 'Ржавые бутсы', 'Ночная лига', 'Спартак-2007', 'Пыльный газон', 'Кривой пас', 'Старый двор'];
  function squad() {
    const fb = Store.d.fb || (Store.d.fb = {}); fb.fmt = 3;
    if (typeof Football !== 'undefined' && Football.auto) { const x = fb.xi; if (!Array.isArray(x) || !x.some(Boolean)) Football.auto(); }
    const q = Football.params(), sq = [0, 1, 2].map((i) => q['p' + i]).filter(Boolean), keys = Football.keys ? Football.keys() : [];
    const rs = sq.map((r) => +r.split('|')[1] || 65), ovr = rs.length ? Math.round(rs.reduce((x, y) => x + y, 0) / rs.length) : 60;
    return { sq, keys, ovr };
  }
  function botOpp(i) {
    const want = 60 + i * 3, all = Cards.all().filter((c) => !c.sbcOnly && (c.rar === 'gold' || c.rar === 'silver' || c.rar === 'bronze'));
    const near = (gk) => { const L = all.filter((c) => (c.pos === 'ВРТ') === gk && Math.abs(c.r - want) <= 3); return L.length ? L[Math.floor(Math.random() * L.length)] : all.find((c) => (c.pos === 'ВРТ') === gk); };
    const cs = [near(false), near(false), near(true)].filter(Boolean);
    const st = (c) => (Cards.stats ? Cards.stats(c) : null) || Array(6).fill(c.r);
    return { bot: true, nick: BOTS[Math.floor(Math.random() * BOTS.length)], emo: '🤖', ovr: Math.round(cs.reduce((x, c) => x + c.r, 0) / cs.length), keys: cs.map((c) => c.key),
      sq: cs.map((c, k) => [Cards.surname ? Cards.surname(c.name) : c.name, c.r, ...st(c), k === 2 ? 'GK' : ''].join('|')) };
  }
  async function find() {
    const i = idx(), me = squad(), u = Store.d.user || {};
    let opp = null;
    try {
      if (typeof Board !== 'undefined' && Board.ready && Board.ready()) {
        const r = await Promise.race([Board.post('/div', { act: 'find', di: i, sq: me.sq, keys: me.keys, ovr: me.ovr, nick: u.nick, emo: u.emoji, avoid: S().lastOpp || 0 }), new Promise((ok) => setTimeout(() => ok(null), 4000))]);
        if (r && r.ok && r.opp && Array.isArray(r.opp.sq) && r.opp.sq.length >= 3) opp = r.opp;
      }
    } catch (e) { opp = null; }
    return { me, opp: opp || botOpp(i) };
  }
  // экран «Соперник найден»: ты против него, по три карточки, отсчёт 3…2…1 — и матч
  let vs = null;
  async function play() {
    if (vs) return;
    vs = document.createElement('div'); vs.className = 'dvs';
    vs.innerHTML = '<div class="dvs-find"><i class="dvs-radar"></i><b>Ищем соперника…</b><small>в твоём дивизионе</small></div>';
    document.body.appendChild(vs); requestAnimationFrame(() => vs && vs.classList.add('in'));
    const t0 = Date.now(), { me, opp } = await find();
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1100 - (Date.now() - t0)))); // поиск виден хотя бы секунду — не мигает
    if (!vs) return;
    const u = Store.d.user || {}, i = idx();
    const cards = (keys, sq) => [0, 1, 2].map((k) => { const c = keys && keys[k] && Cards.get(keys[k]); return c ? Cards.html(c, { w: 58 }) : `<span class="dvs-nc"><b>${esc((sq[k] || '').split('|')[1] || '')}</b>${esc((sq[k] || '').split('|')[0] || '')}</span>`; }).join('');
    vs.innerHTML = `<div class="dvs-box">
        <div class="dvs-side me"><span class="dvs-ava">${esc(u.emoji || '⚽')}</span><b>${esc(u.nick || 'Ты')}</b><em>ОБЩ ${me.ovr}</em><div class="dvs-cards">${cards(me.keys, me.sq)}</div></div>
        <div class="dvs-mid"><i>VS</i><small>${esc(name(i))}</small><b class="dvs-cd">3</b></div>
        <div class="dvs-side op"><span class="dvs-ava">${esc(opp.emo || '⚽')}</span><b>${esc(opp.nick || 'Соперник')}</b><em>ОБЩ ${opp.ovr}${opp.bot ? ' · бот' : ''}</em><div class="dvs-cards">${cards(opp.keys, opp.sq)}</div></div>
      </div>
      <div class="dvs-btns"><button class="fm-btn" data-dvs="again">Другой соперник</button><button class="fm-btn gold" data-dvs="go">Играть</button><button class="dvs-x" data-dvs="x" aria-label="Закрыть">✕</button></div>`;
    Sound.play('whistle'); haptic('ok');
    if (typeof Notify !== 'undefined' && !opp.bot) Notify.opp({ nick: opp.nick, ovr: opp.ovr, face: '' });
    let n = 3, timer = 0;
    const close = () => { clearInterval(timer); if (!vs) return; const e = vs; vs = null; e.classList.remove('in'); setTimeout(() => e.remove(), 250); };
    const go = () => {
      close(); const s = S(); s.live = Date.now(); s.lastOpp = opp.uid || 0; Store.save();
      const fb = Store.d.fb || (Store.d.fb = {}); fb.fmt = 3; fb.diff = diff(i);
      const extra = { oname: String(opp.nick || 'Соперник').slice(0, 18) }; opp.sq.slice(0, 3).forEach((r, k) => { extra['q' + k] = r; });
      App.openFootball('match', null, extra);
    };
    timer = setInterval(() => { n--; const el = vs && vs.querySelector('.dvs-cd'); if (el) { el.textContent = n > 0 ? n : '⚽'; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); } if (n <= 0) go(); }, 1000);
    vs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dvs]'); if (!b) return; Sound.play('tap');
      if (b.dataset.dvs === 'go') go();
      else if (b.dataset.dvs === 'x') close();
      else { S().lastOpp = opp.uid || 0; close(); setTimeout(play, 280); }
    });
  }
  // результат матча из футбола (app.js): true — это был матч дивизиона
  function result(score) {
    const s = S(); if (!s.live || Date.now() - s.live > 30 * 60e3) { s.live = 0; return false; }
    s.live = 0;
    const res = score[0] > score[1] ? 'win' : score[0] === score[1] ? 'draw' : 'loss';
    const i0 = idx(), p0 = s.pts, floor = START[i0];
    s.pts = Math.max(floor, s.pts + PTS[res]);
    if (res === 'win') s.w++; else if (res === 'draw') s.dr++; else s.l++;
    const i1 = idx(); s.best = Math.max(s.best, i1); week(); s.wbest = Math.max(s.wbest, i1);
    const t = tro(res, i0);
    s.last = { res, score, dp: s.pts - p0, tro: t, up: i1 > i0, i: i1, at: Date.now() };
    if (i1 > i0 && typeof Notify !== 'undefined') setTimeout(() => Notify.division(name(i1)), 1500);
    Store.save();
    if (typeof Rewards !== 'undefined') safe('rewards', () => Rewards.onEnd(res === 'win', 'div:match', t));
    return true;
  }
  return { S, START, WEEK, idx, num, name, tier: TIER, diff, week, claimWeek, play, result, PTS, tro };
})();
