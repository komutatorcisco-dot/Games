// Экономика Jackson Games — ВСЕ цены, налоги, шансы паков и награды в одном месте (29.10).
// Блок между ECON:BEGIN и ECON:END дословно копируется в server/worker.js: node tools/sync-econ.js
// (тест tests/economy-config.test.js падает, если копии разошлись). Обоснование цифр — docs/economy.md.
'use strict';
// ECON:BEGIN
const ECON = {
  v: 1,
  // новый аккаунт: стартовые монеты (стартовый пак 4/6/8 выдаётся отдельно, один раз — в обучении)
  start: { coins: 5000 },
  // ---- цена карточки (наша модель; форма кривой как в FC: золото дорожает по экспоненте от OVR) ----
  // быстрая продажа: бронза и серебро a + (OVR − начало) × b, золото a × b^(OVR − 75)
  qs: { bronze: [10, 1, 45], silver: [40, 8, 65], gold: [150, 1.15, 75] },
  // ориентир рынка (без продаж): так же, но выше; дальше цену двигают сделки
  base: { bronze: [200, 8, 45], silver: [400, 40, 65], gold: [800, 1.28, 75] },
  // особые версии одного игрока — своя цена (ключ версии отдельный): множитель к цене и быстрой продаже
  ver: { bronze: 1, silver: 1, gold: 1, legend: 3, jack: 5, jg: 4, future: 4, forgotten: 6 },
  // полезность позиции (спрос): вратарей на рынке берут реже
  pos: { 'ВРТ': 0.8 },
  market: {
    tax: 0.05,                 // налог с продажи, как на ПК и консолях (в FC Mobile — 10%)
    minPrice: 200, maxPrice: 15000000,
    durH: [1, 3, 6, 12, 24, 72], // срок лота: 1 ч … 3 дня
    maxLots: 30,               // одновременно выставлено у одного игрока
    floorQs: 1.5,              // низ рамки ≥ быстрая продажа × 1.5 — купить и сразу сдать в быструю продажу всегда в минус
    floorBase: 0.35,           // и ≥ 35% ориентира — 95 OVR не уйдёт за символическую сумму
    capBase: 10,               // верх рамки ≤ ориентир × 10
    refLo: 0.5, refHi: 3,      // текущая цена (по сделкам) держится в пределах 0.5…3 ориентира
    rangeLo: 0.5, rangeHi: 5,  // рамка от текущей цены: 0.5…5
    ema: 0.2, emaMin: 3,       // сделка сдвигает текущую цену на 20%; рамка начинает «ходить» после 3 сделок
    // шаг ставки (наша настройка в духе FC; точные шаги FC не подтверждены источниками): до 1000 — 50, до 10 000 — 100 …
    steps: [[1000, 50], [10000, 100], [50000, 250], [100000, 500], [1e15, 1000]],
  },
  // ---- паки: состав и шансы (как раньше), новые цены — расчёт в docs/economy.md ----
  packs: [
    { id: 'basic', lv: 0, name: 'Обычный пак', price: 2500, n: 3, sure: [], w: [['bronze', 62], ['silver', 30], ['gold', 7.5], ['legend', 0.5]] },
    { id: 'rare', lv: 1, name: 'Сверхредкий пак', price: 6000, n: 5, sure: ['gold'], w: [['bronze', 40], ['silver', 44], ['gold', 15], ['legend', 1]] },
    { id: 'epic', lv: 2, name: 'Эпический пак', price: 11000, n: 8, sure: ['gold', 'gold'], w: [['bronze', 28], ['silver', 44], ['gold', 26], ['legend', 2]] },
    { id: 'legend', lv: 3, name: 'Легендарный пак', price: 22000, n: 15, sure: ['legend', 'gold', 'gold', 'gold'], w: [['bronze', 20], ['silver', 40], ['gold', 37], ['legend', 3]] },
    { id: 'jack', lv: 4, name: 'Пак «ДЖЕКСОН!!»', price: 48000, n: 30, sure: ['jack', 'legend', 'legend', 'gold', 'gold', 'gold', 'gold', 'gold', 'gold'], w: [['silver', 40], ['gold', 52], ['legend', 8]] },
  ],
  // вероятность «чем выше OVR, тем реже» внутри редкости (как было в js/cards.js)
  decay: { bronze: 1, silver: 0.8, gold: 0.75, legend: 0.82, jack: 1 },
  // ---- заработок: награды игр умножаются на k; в день полностью платятся первые full, следующие half — вполовину, дальше 10% ----
  earn: {
    k: 10,                     // все прежние награды ×10 (прежняя шкала 20–100 монет за игру → 200–1000)
    full: 4000, half: 8000,    // повторяемые игры: 4000 в день полностью, до 8000 — вполовину
    // потолки по источникам (в день, после ×k): защита от накрутки одной игрой и от подделанных клиентом наград
    cap: { game: 12000, match: 9000, daily: 6000, login: 1000, quest: 6000, pass: 15000, event: 10000, dup: 8000, club: 2000, other: 4000 },
    // матчи и главы — серверная таблица (за один матч / главу)
    match: { win: 900, draw: 400, loss: 200, online: 1.5 },
  },
  // награды, которые выдаёт игра (пропуск, события, испытания): паков-наград в день по уровню 0…4 и карточек в день
  rewardPacks: [10, 6, 4, 2, 1],
  rewardCards: { low: 40, gold: 8 },
  // Jackson Points — отдельная валюта: только косметика и особые предметы, не паки и не рынок
  jp: { start: 0 },
  // ---- боты рынка (только проверочный сервер, выключаются в настройках) ----
  bots: { on: true, n: 12, budgetDay: 600000, maxShare: 0.08, buyBelow: 0.9, bidUpTo: 0.85, listMax: 140, tickSec: 60, actions: 6, durH: [1, 3, 6, 12] },
};
// Цены карточек: одни и те же функции на сервере и в игре
const Price = {
  _f(t, c) { // особые версии (легенды, «Джексон»…) — по кривой золота и со своим множителем
    const k = t[c.rar] ? c.rar : 'gold', [a, b, from] = t[k], d = Math.max(0, c.r - from);
    return (k === 'gold' ? a * Math.pow(b, d) : a + d * b) * (ECON.ver[c.rar] || 1) * (ECON.pos[c.pos] || 1);
  },
  base: (c) => Price.round(Price._f(ECON.base, c)),
  qs: (c) => Math.max(1, Math.round(Price._f(ECON.qs, c))),
  step(p) { for (const [to, s] of ECON.market.steps) if (p < to) return s; return 1000; },
  round(p) { p = Math.max(ECON.market.minPrice, Math.min(ECON.market.maxPrice, Math.round(p))); const s = Price.step(p); return Math.round(p / s) * s; },
  // текущая цена: по сделкам (ema) в пределах refLo…refHi ориентира
  ref(c, ema, sales) { const b = Price.base(c), M = ECON.market; return Price.round(sales >= M.emaMin && ema ? Math.min(b * M.refHi, Math.max(b * M.refLo, ema)) : b); },
  // рамка цены для выставления: [мин, макс]
  range(c, ema, sales) {
    const M = ECON.market, b = Price.base(c), r = Price.ref(c, ema, sales);
    const lo = Math.max(M.minPrice, Price.qs(c) * M.floorQs, b * M.floorBase, r * M.rangeLo);
    const hi = Math.max(lo, Math.min(b * M.capBase, r * M.rangeHi));
    return [Price.up(lo), Price.round(hi)];
  },
  up(p) { const s = Price.step(p); return Math.max(ECON.market.minPrice, Math.ceil(p / s) * s); },
  nextBid(bid, start) { return bid ? bid + Price.step(bid) : start; },
  net: (p) => Math.floor(p * (1 - ECON.market.tax)),
};
// ECON:END
if (typeof module !== 'undefined') module.exports = { ECON, Price };
