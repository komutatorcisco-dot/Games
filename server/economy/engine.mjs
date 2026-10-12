import {catalog,cards,products,amount,requireValue,random,rewardCards} from './rules.mjs';
import {definitions} from './generated/sbc.mjs';
export const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
export async function digest(x){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9:_-]{8,120}$/.test(x);
export async function state(db,uid){
 requireValue(Number.isSafeInteger(uid)&&uid>0,'invalid identity');
 const r=await db.batch([stmt(db,'SELECT * FROM econ_wallets WHERE uid=?',uid),stmt(db,'SELECT card,received,spent FROM econ_inventory WHERE uid=?',uid),stmt(db,'SELECT claim FROM econ_claims WHERE uid=?',uid)]);
 const wallet=r[0].results[0];requireValue(wallet,'account not activated');
 return {wallet,inventory:Object.fromEntries(r[1].results.map(x=>[x.card,{received:x.received,spent:x.spent}])),claims:r[2].results.map(x=>x.claim)};
}
function sbcValid(ch,keys){
 requireValue(Array.isArray(keys)&&keys.length===ch.n&&new Set(keys).size===keys.length,'invalid squad');
 const list=keys.map(k=>cards.get(k));requireValue(list.every(c=>c&&!c.sbcOnly),'invalid card');
 const avg=list.reduce((s,c)=>s+c.r,0)/list.length;
 for(const r of ch.req){let ok=false;
  if(r.t==='rating')ok=Math.floor(avg+list.reduce((s,c)=>s+Math.max(0,c.r-avg),0)/list.length)>=r.v;
  if(r.t==='only')ok=list.every(c=>r.in.includes(c.rar));
  if(r.t==='rar')ok=list.filter(c=>r.in.includes(c.rar)).length>=r.min;
  if(r.t==='from')ok=list.filter(c=>c[r.k]===r.v).length>=r.min;
  const vals=list.map(c=>c[r.k]).filter(Boolean);
  if(r.t==='diff')ok=new Set(vals).size>=r.min;
  if(r.t==='same')ok=vals.some(v=>vals.filter(x=>x===v).length>=r.min);
  requireValue(ok,'SBC requirements not met');
 }
}
async function plan(db,uid,kind,payload,s,now,rng){
 const p={coins:0,trophies:0,spend:[],keys:[],claims:[]};
 let reward={};
 if(kind==='pack'){
  const product=products.get(payload.product);requireValue(product,'unknown product');requireValue(s.wallet.coins>=product.coins,'insufficient coins');p.coins-=product.coins;reward={pack:product.level,count:product.count};
 }else if(kind==='sbc'){
  const defs=definitions(now);let ch,parent;
  for(const d of defs){if(d.id===payload.challenge)ch=d;for(const c of d.items||[])if(c.id===payload.challenge){ch=c;parent=d;}}
  requireValue(ch&&!ch.group&&!(ch.ends&&ch.ends<=now)&&!(parent?.ends&&parent.ends<=now),'unknown or expired SBC');
  sbcValid(ch,payload.keys);p.spend=payload.keys;
  const claim='sbc:'+ch.id;requireValue(!s.claims.includes(claim),'already claimed');p.claims.push(claim);reward=ch.reward;
  if(parent&&parent.items.every(c=>c.id===ch.id||s.claims.includes('sbc:'+c.id))){const group='sbc:'+parent.id;requireValue(!s.claims.includes(group),'already claimed');p.claims.push(group);p.keys.push(...rewardCards(parent.reward,s.inventory,rng));p.coins+=parent.reward.coins??0;}
 }else if(kind==='reward'){
  requireValue(idOK(payload.entitlement),'invalid entitlement');
  const e=await stmt(db,'SELECT reward FROM econ_entitlements WHERE uid=? AND id=?',uid,payload.entitlement).first();requireValue(e,'unverified reward');
  const claim='reward:'+payload.entitlement;requireValue(!s.claims.includes(claim),'already claimed');p.claims.push(claim);reward=JSON.parse(e.reward);
 }else if(kind==='stars'){
  requireValue(idOK(payload.order),'invalid order');
  const row=await stmt(db,'SELECT o.*,r.charge,r.stars AS paid FROM econ_orders o JOIN econ_receipts r ON r.order_id=o.id AND r.uid=o.uid WHERE o.id=? AND o.uid=?',payload.order,uid).first();
  requireValue(row&&row.paid===row.stars&&row.created_ms>=s.wallet.activated_ms,'unverified payment');
  const claim='stars:'+row.id;requireValue(!s.claims.includes(claim),'already claimed');p.claims.push(claim);
  if(row.item==='coins')reward={coins:2000};else {const product=products.get(row.item);requireValue(product?.stars===row.stars,'unknown paid product');reward={pack:product.level,count:product.count};}
 }else throw Error('unsupported operation');
 requireValue(amount(reward.coins??0)&&amount(reward.trophies??0,11000),'invalid reward');
 p.coins+=reward.coins??0;p.trophies=Math.min(11000,s.wallet.trophies+(reward.trophies??0))-s.wallet.trophies;
 p.keys.push(...rewardCards(reward,s.inventory,rng));
 const delta=new Map();const change=k=>{if(!delta.has(k))delta.set(k,{received:0,spent:0});return delta.get(k);};
 for(const k of p.spend){requireValue(cards.has(k),'unknown card');change(k).spent++;}
 const results=[];
 for(const k of p.keys){requireValue(cards.has(k),'unknown card');const d=change(k);const isNew=!(s.inventory[k]?.received||d.received);const coins=isNew?0:catalog.duplicates[cards.get(k).rar].dup;d.received++;p.coins+=coins;results.push({key:k,isNew,coins});}
 for(const [k,d] of delta){const old=s.inventory[k]||{received:0,spent:0};requireValue(amount(old.received+d.received,1e9)&&amount(old.spent+d.spent,1e9)&&old.spent+d.spent<=old.received+d.received,'insufficient cards');
  // Spend is checked against pre-operation stock, never against this operation's reward.
  requireValue(d.spent<=old.received-old.spent,'insufficient cards');}
 requireValue(amount(s.wallet.coins+p.coins),'invalid balance');
 return {...p,delta,results};
}
export async function operate(db,uid,id,kind,payload,{now=Date.now(),rng=random}={}){
 requireValue(idOK(id),'invalid transaction id');requireValue(Number.isSafeInteger(uid)&&uid>0,'invalid identity');
 const allowed={pack:['product'],sbc:['challenge','keys'],reward:['entitlement'],stars:['order']}[kind];
 requireValue(allowed&&payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.keys(payload).every(k=>allowed.includes(k)),'invalid payload');
 const hash=await digest(canonical({uid,kind,payload}));
 const previous=()=>stmt(db,'SELECT request_hash,result FROM econ_operations WHERE uid=? AND id=?',uid,id).first();
 const replay=r=>{requireValue(r.request_hash===hash,'transaction conflict');return JSON.parse(r.result);};
 for(let attempt=0;attempt<5;attempt++){
  const old=await previous();if(old)return replay(old);
  const s=await state(db,uid);let p;
  try{p=await plan(db,uid,kind,payload,s,now,rng);}catch(e){const won=await previous();if(won)return replay(won);throw e;}
  const revision=s.wallet.revision+1;
  const result={id,kind,revision,catalogVersion:catalog.version,cards:p.results,coinsDelta:p.coins,trophiesDelta:p.trophies,claims:p.claims};
  const statements=[
   stmt(db,'UPDATE econ_wallets SET coins=?,trophies=?,revision=? WHERE uid=? AND revision=?',s.wallet.coins+p.coins,s.wallet.trophies+p.trophies,revision,uid,s.wallet.revision),
   stmt(db,'INSERT INTO econ_assert(ok) VALUES (CASE WHEN changes()=1 THEN 1 ELSE 0 END)'),
   stmt(db,'DELETE FROM econ_assert'),
   stmt(db,'INSERT INTO econ_operations VALUES (?,?,?,?,?,?,?)',uid,id,hash,kind,JSON.stringify(result),revision,now),
   stmt(db,'INSERT INTO econ_ledger VALUES (?,?,?,?,?)',uid,id,'coins',p.coins,0),
   stmt(db,'INSERT INTO econ_ledger VALUES (?,?,?,?,?)',uid,id,'trophies',p.trophies,0),
  ];
  for(const [key,d] of p.delta){const old=s.inventory[key]||{received:0,spent:0};statements.push(stmt(db,'INSERT INTO econ_inventory VALUES (?,?,?,?) ON CONFLICT(uid,card) DO UPDATE SET received=excluded.received,spent=excluded.spent',uid,key,old.received+d.received,old.spent+d.spent),stmt(db,'INSERT INTO econ_ledger VALUES (?,?,?,?,?)',uid,id,'card:'+key,d.received,d.spent));}
  for(const claim of p.claims)statements.push(stmt(db,'INSERT INTO econ_claims VALUES (?,?,?)',uid,claim,id));
  try{await db.batch(statements);return result;}catch(e){const won=await previous();if(won)return replay(won);if(attempt===4)throw Error('transaction unavailable; retry same id');}
 }
}
// Trusted operator/verified game service only. Never expose a route accepting arbitrary rewards.
export async function entitle(db,uid,id,reward,evidence){
 requireValue(idOK(id)&&typeof evidence==='string'&&evidence.length>=8,'invalid evidence');
 requireValue(reward&&Object.keys(reward).every(k=>['coins','trophies','card','pack','count'].includes(k)),'invalid reward');
 requireValue(amount(reward.coins??0)&&amount(reward.trophies??0,11000),'invalid reward');rewardCards(reward,{},()=>.5);
 const old=await stmt(db,'SELECT reward,evidence FROM econ_entitlements WHERE uid=? AND id=?',uid,id).first();
 if(old){requireValue(old.reward===canonical(reward)&&old.evidence===evidence,'entitlement conflict');return;}
 await stmt(db,'INSERT INTO econ_entitlements VALUES (?,?,?,?)',uid,id,canonical(reward),evidence).run();
}
// New synthetic accounts only in this stage. Reviewed legacy activation remains explicit and separate.
export async function seedTestAccount(db,uid,{coins=0,trophies=0,inventory={}}={}){
 requireValue(Number.isSafeInteger(uid)&&uid>=8000000000000000,'test identity required');requireValue(amount(coins)&&amount(trophies,11000),'invalid seed');
 const a=[stmt(db,'INSERT INTO econ_wallets VALUES (?,?,?,?,?,?,?)',uid,coins,trophies,0,Date.now(),'synthetic-stage-two','test')];
 for(const [key,n] of Object.entries(inventory)){requireValue(cards.has(key)&&amount(n,1e9),'invalid seed inventory');a.push(stmt(db,'INSERT INTO econ_inventory VALUES (?,?,?,0)',uid,key,n));}
 a.push(stmt(db,'INSERT INTO econ_openings VALUES (?,?,?,?)',uid,'synthetic-stage-two',canonical({coins,trophies,inventory}),Date.now()));
 await db.batch(a);
}
