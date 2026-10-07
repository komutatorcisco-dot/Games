// Проверки химии на понятных примерах + баланс матча. Запуск: node chem.test.js (из корня репозитория)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/xdraft/engine.js', 'utf8'), ctx);
const XD = ctx.XD;
const P = (name, pos, club, lg, nat, r = 80) => ({ name, r, pos: pos.split(' '), club, lg, nat, st: [r, r, r, r, r, r] });
let ok = 0; const t = (msg, f) => { f(); ok++; console.log('✓', msg); };

// ---- КЛАССИКА ----
const C = XD.ChemClassic;
t('связь: один клуб (= клуб+лига) — зелёная', () => assert.strictEqual(C.link(P('a', 'ST', 'Реал', 'Ла Лига', 'Испания'), P('b', 'ST', 'Реал', 'Ла Лига', 'Бразилия')).color, 'green'));
t('связь: одна лига, разные сборные — оранжевая', () => assert.strictEqual(C.link(P('a', 'ST', 'Реал', 'Ла Лига', 'Испания'), P('b', 'ST', 'Барса', 'Ла Лига', 'Бразилия')).color, 'orange'));
t('связь: одна сборная в разных лигах — оранжевая', () => assert.strictEqual(C.link(P('a', 'ST', 'Реал', 'Ла Лига', 'Франция'), P('b', 'ST', 'ПСЖ', 'Лига 1', 'Франция')).color, 'orange'));
t('связь: лига + сборная — зелёная', () => assert.strictEqual(C.link(P('a', 'ST', 'Реал', 'Ла Лига', 'Испания'), P('b', 'ST', 'Барса', 'Ла Лига', 'Испания')).color, 'green'));
t('связь: ничего общего — красная', () => assert.strictEqual(C.link(P('a', 'ST', 'Реал', 'Ла Лига', 'Испания'), P('b', 'ST', 'Интер', 'Серия А', 'Италия')).color, 'red'));
const form = '4-4-2', slots = XD.FORMATIONS[form].slots;
const sameClub = slots.map((s, i) => P('p' + i, s.pos, 'Реал', 'Ла Лига', 'Испания'));
t('весь клуб на своих позициях: 10 у каждого, команда 100', () => { const r = C.calc(form, sameClub); assert.strictEqual(r.total, 100); assert(r.per.every((x) => x.chem === 10)); });
t('чужая позиция режет химию (ST в воротах)', () => { const xi = sameClub.slice(); xi[0] = P('x', 'ST', 'Реал', 'Ла Лига', 'Испания'); const r = C.calc(form, xi); assert.strictEqual(r.per[0].fit, 'wrong'); assert.strictEqual(r.per[0].chem, 4); });
t('смежная позиция (CM на CDM) — максимум 9 (8 + лояльность)', () => { const f = '4-2-3-1', xi = XD.FORMATIONS[f].slots.map((s, i) => P('q' + i, s.pos, 'Реал', 'Ла Лига', 'Испания')); xi[5] = P('cm', 'CM', 'Реал', 'Ла Лига', 'Испания'); assert.strictEqual(C.calc(f, xi).per[5].chem, 9); });
t('все красные связи: своя позиция = 3 + лояльность = 4', () => { const xi = slots.map((s, i) => P('r' + i, s.pos, 'К' + i, 'Л' + i, 'С' + i)); const r = C.calc(form, xi); assert(r.per.every((x) => x.chem === 4)); assert.strictEqual(r.total, 44); });
t('своя позиция и все жёлтые связи = 10 (9 + лояльность)', () => { const xi = slots.map((s, i) => P('y' + i, s.pos, 'К' + i, 'Л' + i, 'Испания')); const r = C.calc(form, xi); assert(r.per.every((x) => x.chem === 10)); assert.strictEqual(r.total, 100); });
t('граф связей задан явно: у вратаря 4-4-2 две связи', () => { const r = C.calc(form, sameClub); assert.strictEqual(r.per[0].links.length, 2); });

// ---- НОВАЯ ----
const N = XD.ChemNew, f3 = '4-3-3', s3 = XD.FORMATIONS[f3].slots;
const loner = (i, extra = {}) => Object.assign(P('n' + i, s3[i].pos, 'K' + i, 'L' + i, 'N' + i), extra);
const base = () => s3.map((s, i) => loner(i));
t('никого общего — 0', () => assert.strictEqual(N.calc(f3, base()).total, 0));
t('клуб: 2 игрока — по 1, 4 — по 2, 7 — по 3', () => {
  for (const [n, exp] of [[2, 1], [3, 1], [4, 2], [6, 2], [7, 3]]) { const xi = base(); for (let i = 0; i < n; i++) Object.assign(xi[i], { club: 'Реал' }); assert.strictEqual(N.calc(f3, xi).per[0].chem, exp, `club ${n}`); }
});
t('сборная: 2/5/8', () => { for (const [n, exp] of [[2, 1], [4, 1], [5, 2], [7, 2], [8, 3]]) { const xi = base(); for (let i = 0; i < n; i++) xi[i].nat = 'Бразилия'; assert.strictEqual(N.calc(f3, xi).per[0].chem, exp, `nat ${n}`); } });
t('лига: 3/5/8 (одна лига, разные сборные)', () => { for (const [n, exp] of [[2, 0], [3, 1], [5, 2], [8, 3]]) { const xi = base(); for (let i = 0; i < n; i++) xi[i].lg = 'АПЛ'; assert.strictEqual(N.calc(f3, xi).per[0].chem, exp, `lg ${n}`); } });
t('сумма категорий ограничена 3', () => { const xi = base(); for (let i = 0; i < 4; i++) Object.assign(xi[i], { club: 'Реал', lg: 'Ла Лига', nat: 'Испания' }); assert.strictEqual(N.calc(f3, xi).per[0].chem, 3); });
t('альтернативная позиция засчитывается', () => { const xi = base(); xi[8] = P('alt', 'ST LW', 'Реал', 'L', 'N'); xi[9] = P('st', 'ST', 'Реал', 'L2', 'N2'); assert.strictEqual(N.calc(f3, xi).per[8].chem, 1); });
t('вне позиции: 0 и не идёт в пороги', () => { const xi = base(); xi[0] = P('gk?', 'ST', 'Реал', 'LA', 'NA'); xi[9] = P('st', 'ST', 'Реал', 'LB', 'NB'); const r = N.calc(f3, xi); assert.strictEqual(r.per[0].chem, 0); assert.strictEqual(r.per[9].chem, 0); assert.strictEqual(r.counts.club['Реал'], 1); });
t('запасной не считается, пока не в основе; замена меняет химию', () => {
  const xi = base(); xi[9] = P('st', 'ST', 'Реал', 'LC', 'NC'); const sub = P('sub', 'ST', 'Реал', 'LD', 'ND');
  assert.strictEqual(N.calc(f3, xi).total, 0); xi[8] = Object.assign(sub, { pos: ['LW'] }); assert.strictEqual(N.calc(f3, xi).total, 2);
});
t('максимум 33', () => { const xi = s3.map((s, i) => P('m' + i, s.pos, 'Реал', 'Ла Лига', 'Испания')); assert.strictEqual(N.calc(f3, xi).total, 33); });

// ---- рейтинг ----
t('рейтинг FUT: 11×80 = 80; одна звезда поднимает выше среднего', () => { assert.strictEqual(XD.teamRating(Array(11).fill({ r: 80 })), 80); const x = Array(10).fill({ r: 80 }).concat([{ r: 91 }]); assert.strictEqual(XD.teamRating(x), 81); });

// ---- подборка: без дублей ----
const pool = []; for (let i = 0; i < 400; i++) pool.push(P('pl' + i, ['ST', 'CB', 'CM', 'GK', 'LB', 'RB', 'LW', 'RW', 'CDM', 'CAM', 'LM', 'RM'][i % 12], 'C' + (i % 30), 'L' + (i % 5), 'N' + (i % 9), 70 + (i % 22)));
t('5 разных кандидатов, без уже взятых, позиция подходит', () => {
  const R = XD.rng(7); const team = pool.slice(0, 6);
  for (let k = 0; k < 200; k++) { const o = XD.offer({ pool, team, slotPos: 'ST', sys: 'new', rnd: R }); assert.strictEqual(new Set(o.map((p) => p.name)).size, o.length); assert(o.every((p) => !team.includes(p) && p.pos.includes('ST'))); assert.strictEqual(o.length, 5); }
});
t('мало подходящих — подборка короче, без дублей и выдумок', () => { const tiny = pool.filter((p) => p.pos[0] === 'GK').slice(0, 3); const o = XD.offer({ pool: tiny, team: [], slotPos: 'GK', sys: 'new', rnd: XD.rng(3) }); assert.strictEqual(o.length, 3); });
console.log(`\nхимия и подбор: ${ok} проверок пройдено`);
