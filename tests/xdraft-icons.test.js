const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { console, setTimeout:()=>0, clearTimeout(){}, matchMedia:()=>({matches:true}), document:{addEventListener(){}}, window:{matchMedia:()=>({matches:true})}, Store:{d:{},save(){}}, UI:{}, Ui:{get:()=>''}, Release:{}, Day:{}, Cards:null };
ctx.globalThis = ctx; vm.createContext(ctx);
for (const file of ['js/players.js','js/media.js','js/data/fcstats.js','js/data/fcpos.js','js/positions.js','js/data/cards.js','js/cards.js','js/xdraft/engine.js','js/xdraft/ui.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
}
vm.runInContext('globalThis.testAPI={XDraft,Cards,XD:window.XD};',ctx);
const pool = ctx.testAPI.XDraft.pool(), icons = pool.filter(p=>p.icon), collectionIcons = ctx.testAPI.Cards.all().filter(c=>c.icon && c.face);
assert.equal(icons.length, collectionIcons.length, 'every pictured Icon collection card is in the Draft pool');
assert.ok(icons.some(p=>p.name==='Дани Алвес' && p.pos.includes('RB')), 'Icon positions use the shared position data');
assert.ok(icons.every(p=>p.lg==='Легенды' && p.nat && p.pos.length), 'Icons preserve chemistry nation and positions');
let offered = false;
for (let seed=1; seed<=300 && !offered; seed++) {
  const picks = ctx.testAPI.XD.offer({pool,team:[],slotPos:'CM',sys:'new',rnd:ctx.testAPI.XD.rng(seed)});
  offered = picks.some(p=>p.icon);
}
assert.ok(offered, 'legend cards are eligible to appear in a position candidate offer');
console.log(`Draft Icons: ${icons.length} collectible Icons included with positions, nation chemistry and candidate eligibility`);
