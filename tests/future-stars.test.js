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
const card = Cards.get('FS:xavi-espart');
if(card.r !== 91 || card.pos !== 'ЛЗ' || card.club !== 'Барселона') throw Error('card identity');
if(Cards.draw('future') !== null) throw Error('exclusive card in random pool');
for(let lv=0;lv<5;lv++) for(let i=0;i<50;i++) if(Cards.packCards(lv).includes(card.key)) throw Error('pack leak');
const challenge=SBC.find('fs:espart');
if(challenge.items.length !== 10 || new Set(challenge.items.map(x=>x.id)).size !== 10 || challenge.ends) throw Error('challenge structure');
const available=Cards.all().filter(c=>!c.sbcOnly);
Store.d.cards={own:Object.fromEntries(available.map(c=>[c.key,12])),used:{},fresh:[]};
Store.d.sbc={done:{}};
for(const [i,stage] of challenge.items.entries()) {
  const keys=SBC.autofill(stage);
  if(keys.length !== 11 || !SBC.allOk(stage,keys.map(Cards.get))) throw Error('unsolvable stage '+(i+1));
  Cards.use(keys); Store.d.sbc.done[stage.id]=1;
  const result=SBC.claimGroup(challenge);
  if(i<9 && (result.length || Cards.owned(card.key))) throw Error('early award');
  if(i===9 && (result.length!==1 || Cards.spare(card.key)!==1)) throw Error('missing final reward');
}
if(SBC.claimGroup(challenge).length || Cards.owned(card.key)!==1) throw Error('repeat reward');
if(!Cards.album().includes('Будущие звёзды')) throw Error('missing gallery category');
`,ctx);
console.log('Future Stars: identity, pack exclusion, 10 feasible squads, final reward and replay checks passed');
