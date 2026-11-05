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

  // матч: сложность по дивизиону, состав 3 на 3 — из своих карточек (Football)
  function play() {
    const s = S(), i = idx(); s.live = Date.now(); Store.save();
    const fb = Store.d.fb || (Store.d.fb = {}); fb.fmt = 3; fb.diff = diff(i);
    if (typeof Football !== 'undefined' && Football.auto) { const x = fb.xi; if (!Array.isArray(x) || !x.some(Boolean)) Football.auto(); }
    App.openFootball('match');
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
    Store.save();
    if (typeof Rewards !== 'undefined') safe('rewards', () => Rewards.onEnd(res === 'win', 'div:match', t));
    return true;
  }
  return { S, START, WEEK, idx, num, name, tier: TIER, diff, week, claimWeek, play, result, PTS, tro };
})();
