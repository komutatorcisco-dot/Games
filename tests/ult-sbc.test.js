// «Ультимейт Джексон»: все 5 составов собираются из реальных карточек; без сервера карточка не выдаётся.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { console, setTimeout(){}, document:{addEventListener(){}}, window:{matchMedia:()=>({matches:true})}, Ui:{get:()=>''}, Store:{d:{},save(){}}, Release:{weekKey:()=> '2026-10-05', at:Date.parse}, Day:{key:()=> '2026-10-09'}, FC_STATS:{}, FACES:{}, PLAYERS:[], CARD_LEGENDS:[], CRESTS:{}, Coins:{add(){}}, esc:String };
vm.createContext(ctx);
for (const file of ['js/players.js','js/media.js','js/data/fcstats.js','js/data/cards.js','js/data/fcpos.js','js/positions.js']) {
  // Full real player pools for feasibility, not invented test players.
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
}
vm.runInContext(fs.readFileSync('js/cards.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('js/sbc.js','utf8').replace('return { open, bind, ready,','return { claimGroup, open, bind, ready,'),ctx);
vm.runInContext(`
const g=SBC.find('ul:jackson');
if(!g || g.items.length !== 5 || g.ends || g.reward.card !== 'UL:nicolas-jackson') throw Error('challenge structure');
const available=Cards.all().filter(c=>!c.sbcOnly);
Store.d.cards={own:Object.fromEntries(available.map(c=>[c.key,12])),used:{},fresh:[]};
Store.d.sbc={done:{}};
for(const [i,stage] of g.items.entries()) {
  const keys=SBC.autofill(stage);
  if(keys.length !== 11 || !SBC.allOk(stage,keys.map(Cards.get))) throw Error('unsolvable stage '+(i+1));
  Cards.use(keys); Store.d.sbc.done[stage.id]=1;
  if(SBC.claimGroup(g).length || Cards.owned('UL:nicolas-jackson')) throw Error('card without server claim');
}
`,ctx);
console.log('Ultimate Jackson SBC: 5 feasible squads, card only after server claim');
