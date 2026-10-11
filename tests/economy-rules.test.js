import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {pack,catalog} from '../server/economy/rules.mjs';import {definitions} from '../server/economy/generated/sbc.mjs';import {reconcile,activateReviewed} from '../server/economy/reconcile.mjs';
const math=Object.create(Math);const now=Date.parse('2026-10-11T12:00:00Z');class Clock extends Date{static now(){return now;}}
const c={console,Date:Clock,Math:math,Ui:{get:()=>''},document:{addEventListener(){}},window:{matchMedia:()=>({matches:true})},setTimeout(){},Store:{d:{cards:{own:{},used:{}},sbc:{done:{}}}},Day:{key:(n=0)=>new Date(now+3*3600e3+n*864e5).toISOString().slice(0,10)}};vm.createContext(c);
for(const f of ['js/players.js','js/media.js','js/data/faces2.js','js/data/fcstats.js','js/data/cards.js','js/data/fcpos.js','js/positions.js','js/cards.js','js/release.js','js/sbc.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
vm.runInContext('Object.assign(FACES,FACES_EXTRA);Cards.reset()',c);
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let seed=1;seed<=5;seed++)for(let level=0;level<5;level++){math.random=seeded(seed);assert.deepEqual(pack(level,{},seeded(seed)),JSON.parse(vm.runInContext('JSON.stringify(Cards.packCards('+level+'))',c)));}
const strip=x=>JSON.parse(JSON.stringify(x));const generated=definitions(now),original=strip(vm.runInContext('SBC.defs()',c));
for(const d of generated){const o=original.find(x=>x.id===d.id);for(const k of ['n','req','reward','limit','ends','cost'])assert.deepEqual(d[k],o[k]);if(d.items)for(let i=0;i<d.items.length;i++)for(const k of ['id','n','req','reward','limit'])assert.deepEqual(d.items[i][k],o.items[i][k]);}
const key=catalog.cards[0].key;
const raw=JSON.stringify({coins:12,rw:{trophies:9},cards:{own:{[key]:3,missing:7},used:{[key]:2,missing:1}},sbc:{done:{'old:challenge':1}}});const r=await reconcile(raw);assert.equal(r.raw,raw);assert.deepEqual(r.unresolved.missing,{received:7,spent:1});assert.deepEqual(r.inventory[key],{received:3,spent:2});assert.ok(r.issues.includes('unknown_card'));
const mapped=await reconcile(raw,{missing:{to:key,approved:true,evidenceCommit:'a'.repeat(40)}});assert.deepEqual(mapped.inventory[key],{received:10,spent:3});assert.equal(mapped.issues.length,0);
await assert.rejects(()=>activateReviewed({},1,raw,{approved:true,sourceHash:r.sourceHash,reviewer:'tester'},{environment:'staging'}),/unresolved/);
await assert.rejects(()=>activateReviewed({},1,raw,{approved:true,sourceHash:'wrong',reviewer:'tester'},{environment:'staging'}),/review/);
console.log('Pack RNG parity, existing SBC rules, preservation and reviewed aliases passed');
