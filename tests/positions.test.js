const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const ctx={ console, setTimeout(){}, document:{addEventListener(){}}, window:{}, Ui:{get:()=>''}, Store:{d:{},save(){}}, esc:String };
vm.createContext(ctx);
for(const f of ['js/players.js','js/media.js','js/data/fcstats.js','js/data/fcpos.js','js/data/cards.js','js/positions.js','js/cards.js','js/xdraft/engine.js']) vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
vm.runInContext('globalThis.api={PlayerPositions,Cards,CARD_LEGENDS,PLAYERS,FC_POS}',ctx);
const {PlayerPositions:P,Cards,CARD_LEGENDS,PLAYERS,FC_POS}=ctx.api;
assert.equal(Cards.get('Дани Алвес').pos,'ПЗ');
assert.ok(Cards.get('Дани Алвес').positions.includes('RB'));
assert.equal(Cards.get('Роберто Карлос').pos,'ЛЗ');
for(const [name] of CARD_LEGENDS) assert.ok(P.LEGENDS[name],name+' has precise legend role');
for(const p of PLAYERS) {
  assert.ok(FC_POS[p.name] || P.SUPPLEMENT[p.name] || P.SPECIAL[p.name] || P.LEGENDS[p.name],p.name+' has sourced roles, not fallback');
  assert.ok(P.get(p.name,p.pos).length,p.name+' has usable roles');
}
for(const c of Cards.all()) { assert.ok(c.positions.length,c.name); assert.notEqual(c.pos,'ЗАЩ'); }
assert.deepEqual([...P.get('Нико О’Райли','ЛЗ')],['LB','CM','CDM']);
assert.deepEqual([...P.get('Unknown','ЦАП')],['CAM']);
assert.deepEqual([...P.get('Витинья')],['CM','CDM']);
assert.deepEqual([...P.get('Стивен Джеррард')],['CM','CDM','CAM']);
assert.deepEqual([...P.get('Дани Алвес')],['RB']);
assert.deepEqual([...P.get('Гонсало Игуаин')],['ST']);
assert.deepEqual([...P.get('Хави Эспарт')],['LB']);
// Every imported player must keep exactly the dataset's positions and order.
for(const [name,raw] of Object.entries(FC_POS)) {
  if(P.LEGENDS[name] || name==='Нико О’Райли' || name==='Хави Эспарт') continue;
  const expected=[...new Set(raw.split(/\s+/).map(p=>({LWB:'LB',RWB:'RB',CF:'ST'}[p]||p)))];
  assert.deepEqual([...P.get(name)],expected,name+' must not gain inferred positions');
}
for(const role of Object.keys(P.RU)) assert.deepEqual([...P.expand([role])],[role]);
for (const name of ['Витинья','Стивен Джеррард','Тони Кроос','Андрес Иньеста','Арьен Роббен','Франк Рибери','Гарет Бэйл']) {
  for (const pos of ['CB','LB','RB']) assert.ok(!P.get(name).includes(pos),`${name} must not gain ${pos} through a secondary role`);
}
for (const role of ['CDM','CM','CAM','LM','RM','LW','RW','ST']) {
  for (const pos of ['CB','LB','RB']) assert.ok(!P.expand([role]).includes(pos),`${role} must not automatically become ${pos}`);
}
assert.ok(P.get('Орельен Чуамени','ЦОП').includes('CB'),'explicit defensive alternative is preserved');
assert.deepEqual([...P.get('Unknown','ГК')],['GK']);
assert.ok(!P.get('Unknown','ЦЗ').includes('ST'),'expansion does not chain through every role');
// A right-back icon now counts as in-position in the actual chemistry engine.
const p={name:'Дани Алвес',pos:P.get('Дани Алвес'),club:'Барселона',nat:'Бразилия',lg:'Легенды',r:89};
const xi=Array(11).fill(null); xi[4]=p;
const chem=ctx.window.XD.chem('new','4-3-3',xi);
assert.equal(ctx.window.XD.ChemNew.onPos(p,'RB'),true);
assert.equal(ctx.window.XD.ChemNew.onPos(p,'GK'),false);
ctx.XD=ctx.window.XD;
vm.runInContext(fs.readFileSync('js/xdraft/ui.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('js/squad.js','utf8')+'\nglobalThis.squad=Squad;',ctx);
ctx.Store.d.squad={form:'4-3-3',xi:Array(11).fill(null)};
ctx.Store.d.squad.xi[4]='Дани Алвес';
ctx.Store.d.squad.xi[1]='Роберто Карлос';
assert.ok(ctx.squad.CTX.xi()[4].pos.includes('RB'),'actual squad conversion preserves right-back');
assert.ok(ctx.squad.CTX.xi()[1].pos.includes('LB'),'actual squad conversion preserves left-back');
ctx.Store.d.squad.xi[2]='Витинья';
assert.equal(ctx.window.XD.ChemNew.onPos(ctx.squad.CTX.xi()[2],'CB'),false,'saved squad must not retain invented CB');
assert.deepEqual([...vm.runInContext("XDraft.P('Витинья').pos",ctx)],['CM','CDM'],'draft and collection share exact positions');
const sources=fs.readFileSync('docs/player-position-sources.md','utf8');
for(const [name] of CARD_LEGENDS) { assert.ok(Cards.get(name).icon); assert.ok(Cards.get(name).nat,name+' national team'); }
assert.ok(Cards.get('J:Тьерри Анри').icon,'Jackson legend keeps icon chemistry');
assert.ok(!Cards.get('FS:xavi-espart').icon,'custom rarity does not imply icon');
assert.ok(ctx.squad.CTX.xi()[4].icon,'squad keeps icon flag');
assert.equal(ctx.squad.CTX.xi()[4].nat,'Бразилия');
for(const name of Object.keys(P.LEGENDS)) assert.ok(sources.includes(name),name+' has a source record');
console.log(`Positions: ${Cards.all().length} cards, ${PLAYERS.length} players, ${Object.keys(FC_POS).length} exact imported position lists, legends and chemistry passed`);
