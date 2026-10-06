// Баланс матча серией симуляций на реальной базе. Запуск из корня репозитория.
const fs = require('fs'), vm = require('vm');
const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/players.js', 'js/data/fcstats.js', 'js/data/fcpos.js']) vm.runInContext(fs.readFileSync(f, 'utf8').replace(/^const (\w+)/gm, 'var $1'), ctx);
vm.runInContext(fs.readFileSync('js/xdraft/engine.js', 'utf8'), ctx);
const XD = ctx.XD;
const pool = ctx.PLAYERS.filter((p) => ctx.FC_STATS[p.name] && ctx.FC_POS[p.name]).map((p) => ({ name: p.name, r: ctx.FC_STATS[p.name][0], st: ctx.FC_STATS[p.name].slice(1, 7), pos: ctx.FC_POS[p.name].split(' '), club: p.club, lg: p.lg, nat: p.nat }));
console.log('пул', pool.length);
const side = (t, sys) => { const c = XD.chem(sys, t.form, t.xi); return { lines: XD.lines(sys, t.form, t.xi, c.total), rating: XD.teamRating(t.xi), chem: c.total }; };
function play(A, B, tacA, tacB, seed) { const M = XD.matchNew(A, B, seed); let ta = 2, tb = 2; while (!M.over) { ta = typeof tacA === 'function' ? tacA(M, 0, ta) : tacA; tb = typeof tacB === 'function' ? tacB(M, 1, tb) : tacB; XD.matchStep(M, [ta, tb]); } return M; }
function series(A, B, n, tacA = 2, tacB = 2, seed0 = 1) {
  const r = { w: 0, d: 0, l: 0, gf: 0, ga: 0, chA: 0, chB: 0 };
  for (let i = 0; i < n; i++) { const M = play(A, B, tacA, tacB, seed0 * 100003 + i); r.gf += M.score[0]; r.ga += M.score[1]; r.chA += M.stats.ch[0]; r.chB += M.stats.ch[1]; M.score[0] > M.score[1] ? r.w++ : M.score[0] < M.score[1] ? r.l++ : r.d++; }
  const pct = (x) => Math.round((x / n) * 100) + '%';
  return { П: pct(r.w), Н: pct(r.d), Пр: pct(r.l), голы: (r.gf / n).toFixed(2) + ':' + (r.ga / n).toFixed(2), моменты: (r.chA / n).toFixed(1) + ':' + (r.chB / n).toFixed(1) };
}
const R = XD.rng(42);
const mk = (lvl, sys = 'new') => { const t = XD.botTeam(lvl, pool, sys, R); const s = side(t, sys); return { t, s }; };
const N = 2000;
const e = mk('easy'), n = mk('normal'), h = mk('hard');
console.log('составы: лёгкий', e.s.rating, 'хим', e.s.chem, '| средний', n.s.rating, n.s.chem, '| сложный', h.s.rating, h.s.chem);
console.log('1) одинаковые команды (зеркало):', series(n.s, n.s, N));
console.log('   зеркало, стороны наоборот:', series(n.s, n.s, N, 2, 2, 7));
console.log('2) сильнее против слабее (сложный vs лёгкий):', series(h.s, e.s, N));
console.log('   средний vs сложный:', series(n.s, h.s, N));
console.log('3) тактика (равные составы, соперник в балансе):');
for (let t = 0; t < 5; t++) console.log('   ', XD.TACTICS[t].padEnd(16), series(n.s, n.s, N, t, 2, 11));
// химия: одинаковые игроки, полная против нулевой — эффект в классике и новой должен совпадать
const full = { ...n.s }, zeroN = { ...n.s, lines: XD.lines('new', n.t.form, n.t.xi, 0) }, fullN = { ...n.s, lines: XD.lines('new', n.t.form, n.t.xi, 33) };
const zeroC = { ...n.s, lines: XD.lines('classic', n.t.form, n.t.xi, 0) }, fullC = { ...n.s, lines: XD.lines('classic', n.t.form, n.t.xi, 100) };
console.log('4) полная химия против нулевой, новая 33 vs 0:', series(fullN, zeroN, N));
console.log('   классика 100 vs 0:', series(fullC, zeroC, N));
// бот меняет тактику по счёту и минуте
console.log('5) сложный бот с тактикой vs сложный в балансе:', series(h.s, h.s, N, (M, s, c) => XD.botTactic('hard', M, s, c), 2, 5));
