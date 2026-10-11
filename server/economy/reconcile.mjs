// Operator-only reconciliation. No fuzzy matching or maximum-balance merge.
import {cards,amount,requireValue} from './rules.mjs';
import {canonical,digest} from './engine.mjs';
export async function reconcile(raw,aliases={}){
 requireValue(typeof raw==='string'&&new TextEncoder().encode(raw).length<=900000,'invalid snapshot');
 const sourceHash=await digest(raw);let save;try{save=JSON.parse(raw);}catch{return {sourceHash,raw,issues:['malformed_snapshot'],inventory:{},unresolved:{}};}
 const inventory=Object.create(null),unresolved=Object.create(null),issues=[];
 if(!save||typeof save!=='object'||Array.isArray(save))return {sourceHash,raw,issues:['malformed_snapshot'],inventory,unresolved};
 const coins=save.coins,trophies=save.rw?.trophies??0;
 if(!amount(coins))issues.push('invalid_coins');if(!amount(trophies,11000))issues.push('invalid_trophies');
 const own=save.cards?.own??{},used=save.cards?.used??{};
 requireValue(own&&used&&typeof own==='object'&&typeof used==='object'&&!Array.isArray(own)&&!Array.isArray(used),'invalid inventory');
 for(const key of new Set([...Object.keys(own),...Object.keys(used)])){
  const entry={received:own[key]??0,spent:used[key]??0};
  if(!amount(entry.received,1e9)||!amount(entry.spent,1e9)||entry.spent>entry.received){issues.push('invalid_inventory');unresolved[key]=entry;continue;}
  const alias=Object.hasOwn(aliases,key)?aliases[key]:null;
  // An alias requires an explicitly reviewed, versioned repository evidence reference.
  const target=cards.has(key)?key:alias&&/^[a-f0-9]{40}$/.test(alias.evidenceCommit)&&alias.approved===true&&cards.has(alias.to)?alias.to:null;
  if(!target){unresolved[key]=entry;issues.push('unknown_card');continue;}
  const prior=inventory[target]||{received:0,spent:0};inventory[target]={received:prior.received+entry.received,spent:prior.spent+entry.spent};
  if(!amount(inventory[target].received,1e9)||!amount(inventory[target].spent,1e9))issues.push('inventory_overflow');
 }
 return {sourceHash,raw,coins,trophies,inventory,unresolved,issues:[...new Set(issues)],legacy:save};
}
// Staging-only explicit reviewer decision. NEVER called from the public Worker.
export async function activateReviewed(db,uid,raw,approval,{aliases={},environment}={}){
 requireValue(environment==='staging','staging required');requireValue(Number.isSafeInteger(uid)&&uid>0,'invalid identity');
 const r=await reconcile(raw,aliases);
 requireValue(approval?.approved===true&&approval.sourceHash===r.sourceHash&&typeof approval.reviewer==='string'&&approval.reviewer.length>=3,'explicit matching review required');
 requireValue(!r.issues.length,'unresolved migration evidence');
 const old=await db.prepare('SELECT evidence FROM econ_wallets WHERE uid=?').bind(uid).first();
 const evidence=canonical({reviewer:approval.reviewer,sourceHash:r.sourceHash,policy:'manual-source-review-v1'});
 if(old){requireValue(old.evidence===evidence,'activation conflict');return;}
 const now=Date.now(),id='migration:'+r.sourceHash.slice(0,48);const result={id,kind:'migration',revision:0,cards:[],coinsDelta:0,trophiesDelta:0,claims:[]};
 const sql=(s,...v)=>db.prepare(s).bind(...v);
 const batch=[sql('INSERT INTO econ_wallets VALUES (?,?,?,?,?,?,?)',uid,r.coins,r.trophies,0,now,evidence,'reviewed'),sql('INSERT INTO econ_legacy_evidence VALUES (?,?,?,?)',uid,'reviewed_snapshot',r.sourceHash,raw),sql('INSERT INTO econ_openings VALUES (?,?,?,?)',uid,evidence,canonical({coins:r.coins,trophies:r.trophies,inventory:r.inventory}),now),sql('INSERT INTO econ_operations VALUES (?,?,?,?,?,?,?)',uid,id,r.sourceHash,'migration',JSON.stringify(result),0,now)];
 for(const [key,v] of Object.entries(r.inventory))batch.push(sql('INSERT INTO econ_inventory VALUES (?,?,?,?)',uid,key,v.received,v.spent));
 for(const [challenge,n] of Object.entries(r.legacy.sbc?.done||{})){requireValue(amount(n)&&n<=1,'invalid SBC evidence');if(n)batch.push(sql('INSERT INTO econ_claims VALUES (?,?,?)',uid,'sbc:'+challenge,id));}
 // Existing paid markers, pass state and purchases remain in the raw immutable evidence.
 // They are NOT converted to fresh receipt entitlements. Only new v2 orders can grant rewards.
 await db.batch(batch);
}
