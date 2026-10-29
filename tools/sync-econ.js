// Копирует блок ECON:BEGIN … ECON:END из js/economy.js в server/worker.js (одна настройка экономики на сервер и игру).
// Запуск: node tools/sync-econ.js   (проверка без записи: node tools/sync-econ.js --check)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), A = path.join(ROOT, 'js/economy.js'), W = path.join(ROOT, 'server/worker.js');
const block = (s) => { const a = s.indexOf('// ECON:BEGIN'), b = s.indexOf('// ECON:END'); if (a < 0 || b < 0) throw new Error('нет меток ECON'); return [a, b + '// ECON:END'.length]; };
const src = fs.readFileSync(A, 'utf8'), w = fs.readFileSync(W, 'utf8');
const [a, b] = block(src), [c, d] = block(w), want = src.slice(a, b);
if (w.slice(c, d) === want) { console.log('ECON: копии совпадают'); process.exit(0); }
if (process.argv.includes('--check')) { console.error('ECON в server/worker.js устарел: node tools/sync-econ.js'); process.exit(1); }
fs.writeFileSync(W, w.slice(0, c) + want + w.slice(d)); console.log('ECON скопирован в server/worker.js');
