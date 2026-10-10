const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { console, setTimeout:()=>0, clearTimeout(){}, matchMedia:()=>({matches:true}), document:{addEventListener(){}}, window:{matchMedia:()=>({matches:true})}, Store:{d:{},save(){}}, UI:{}, Ui:{get:()=>''}, Release:{}, Day:{}, Cards:null };
ctx.esc = s => String(s);
ctx.globalThis = ctx; vm.createContext(ctx);
for (const file of ['js/players.js','js/media.js','js/data/fcstats.js','js/data/fcpos.js','js/positions.js','js/data/cards.js','js/cards.js','js/xdraft/engine.js','js/xdraft/ui.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
}
vm.runInContext('globalThis.testAPI={XDraft,Cards,XD:window.XD};',ctx);
ctx.XD = ctx.testAPI.XD;
const pool = ctx.testAPI.XDraft.pool(), icons = pool.filter(p=>p.icon), collectionIcons = ctx.testAPI.Cards.all().filter(c=>c.icon && c.rar==='legend' && c.face);
assert.equal(new Set(pool.map(p=>p.name)).size,pool.length,'saved player names resolve to exactly one candidate');
assert.ok(icons.every(p=>ctx.testAPI.XDraft.P(p.name).r===p.r),'resolving an Icon never substitutes an upgraded card');
assert.equal(icons.length, collectionIcons.length, 'every pictured Icon collection card is in the Draft pool');
assert.ok(icons.some(p=>p.name==='Дани Алвес' && p.pos.includes('RB')), 'Icon positions use the shared position data');
assert.ok(icons.every(p=>p.lg==='Легенды' && p.nat && p.pos.length), 'Icons preserve chemistry nation and positions');
let offered = false;
for (let seed=1; seed<=300 && !offered; seed++) {
  const picks = ctx.testAPI.XD.offer({pool,team:[],slotPos:'CM',sys:'new',rnd:ctx.testAPI.XD.rng(seed)});
  offered = picks.some(p=>p.icon);
}
assert.ok(offered, 'legend cards are eligible to appear in a position candidate offer');
const icon = icons.find(p=>p.pos.includes('CM'));
const xi = Array(11).fill(null); xi[5] = ctx.testAPI.XDraft.P(icon.name);
assert.equal(ctx.testAPI.XD.chem('new','4-3-3',xi).per[5].chem,3,'real saved Icon retains full modern chemistry');
const other = {name:'Other',pos:['CM'],club:'Other',lg:'Other',nat:'Other',r:80};
assert.equal(ctx.testAPI.XD.ChemClassic.link(icon,other).color,'orange','classic Icon links even without shared nation or club');
assert.equal(ctx.testAPI.XD.ChemClassic.link(icon,{...other,nat:icon.nat}).color,'green');
assert.equal(ctx.testAPI.XD.ChemClassic.link(icon,icons[0]).color,'green');
const html=ctx.testAPI.XDraft.mini(icon,{zone:'xi',idx:5,slotPos:'CM',sys:'new',ch:{chem:3}});
assert.match(html,/fu legend/,'Icon artwork is preserved on the pitch');
assert.equal((html.match(/class="on"/g)||[]).length,3,'rendered Icon displays three chemistry markers');
console.log(`Draft Icons: ${icons.length} collectible Icons included with positions, nation chemistry and candidate eligibility`);
