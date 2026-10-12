import assert from 'node:assert/strict';
import {cards,products,catalog,pack} from '../server/economy/rules.mjs';
import {seedTestAccount,state,operate,entitle} from '../server/economy/engine.mjs';
import {createOrder,recordPayment} from '../server/economy/payments.mjs';
import {reconcile,activateReviewed} from '../server/economy/reconcile.mjs';
import worker from '../server/economy/worker.mjs';
export async function suite(db,base=8000000000000000+Date.now()){
 const bronze=catalog.cards.filter(c=>c.rar==='bronze').slice(0,11).map(c=>c.key);
 const inventory=Object.fromEntries(bronze.map(k=>[k,1]));
 await seedTestAccount(db,base,{coins:400,trophies:10999,inventory});
 const before=await state(db,base);
 await assert.rejects(()=>operate(db,base,'forged-money','pack',{product:'basic',coins:999999}));
 await assert.rejects(()=>operate(db,base,'forged-cards','sbc',{challenge:'b:first',keys:['unknown',...bronze.slice(0,2)]}));
 assert.deepEqual(await state(db,base),before);
 const race=await Promise.allSettled(['device-one','device-two'].map(id=>operate(db,base,id,'pack',{product:'basic'})));
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1,'only one device can spend the same coins');
 const winner=race.find(x=>x.status==='fulfilled').value;
 // Simulate lost HTTP response: discard it, then resend identical transaction.
 assert.deepEqual(await operate(db,base,winner.id,'pack',{product:'basic'}),winner);
 await assert.rejects(()=>operate(db,base,winner.id,'pack',{product:'gold'}),/conflict/);
 const bought=await state(db,base);assert.equal(bought.wallet.revision,1);
 const submission={challenge:'b:first',keys:bronze.slice(0,3)};
 const sr=await Promise.allSettled(['sbc-device-one','sbc-device-two'].map(id=>operate(db,base,id,'sbc',submission)));
 assert.equal(sr.filter(x=>x.status==='fulfilled').length,1);
 const after=await state(db,base);for(const k of submission.keys)assert.equal(after.inventory[k].spent,1);
 assert.equal(after.wallet.revision,2);
 await assert.rejects(()=>operate(db,base,'arbitrary-reward','reward',{entitlement:'unverified-claim'}));
 await entitle(db,base,'verified-match-1',{coins:10,trophies:50},'server-match-fixture');
 const rr=await operate(db,base,'claim-operation-1','reward',{entitlement:'verified-match-1'});assert.equal(rr.trophiesDelta,1);
 await assert.rejects(()=>operate(db,base,'claim-operation-2','reward',{entitlement:'verified-match-1'}));
 assert.equal((await state(db,base)).wallet.trophies,11000);
 const order=await createOrder(db,base,'jack','order-'+base);
 const payment={currency:'XTR',total_amount:99,invoice_payload:JSON.stringify({v:2,uid:base,order:order.id}),telegram_payment_charge_id:'fixture-charge-'+base};
 await assert.rejects(()=>recordPayment(db,base,{...payment,total_amount:1}));
 await assert.rejects(()=>recordPayment(db,base+1,payment));
 await recordPayment(db,base,payment);await recordPayment(db,base,payment);
 const paid=await operate(db,base,'stars:'+order.id,'stars',{order:order.id});
 assert.equal(paid.cards.length,30);assert.deepEqual(await operate(db,base,'stars:'+order.id,'stars',{order:order.id}),paid);
 await assert.rejects(()=>operate(db,base,'second-paid-grant','stars',{order:order.id}));
 // Same-ID race must persist one result including random outcomes.
 await entitle(db,base,'verified-match-2',{coins:5000},'server-match-fixture');await operate(db,base,'claim-operation-3','reward',{entitlement:'verified-match-2'});
 const twins=await Promise.all([operate(db,base,'same-pack-request','pack',{product:'gold'}),operate(db,base,'same-pack-request','pack',{product:'gold'})]);assert.deepEqual(twins[0],twins[1]);
 const final=await state(db,base);
 const ledger=(await db.prepare("SELECT asset,SUM(delta) AS n,SUM(spent_delta) AS spent FROM econ_ledger WHERE uid=? GROUP BY asset").bind(base).all()).results;
 assert.equal(final.wallet.coins,400+ledger.find(x=>x.asset==='coins').n);
 assert.equal(final.wallet.trophies,10999+ledger.find(x=>x.asset==='trophies').n);
 for(const l of ledger.filter(x=>x.asset.startsWith('card:'))){const key=l.asset.slice(5);assert.equal(final.inventory[key].received,(inventory[key]||0)+l.n);assert.equal(final.inventory[key].spent,l.spent);}
 await assert.rejects(()=>db.prepare('DELETE FROM econ_operations WHERE uid=?').bind(base).run());
 await assert.rejects(()=>db.prepare('UPDATE econ_ledger SET delta=999 WHERE uid=?').bind(base).run());
 const previous=await state(db,base);
 await assert.rejects(()=>db.batch([db.prepare('UPDATE econ_wallets SET coins=coins+123 WHERE uid=?').bind(base),db.prepare('INSERT INTO econ_assert VALUES (0)').bind()]));
 assert.deepEqual(await state(db,base),previous,'mid-transaction error must roll back balance');
 // Strict DB constraints also stop fractional and overflowing values from privileged code.
 await assert.rejects(()=>db.prepare('UPDATE econ_wallets SET coins=1.5 WHERE uid=?').bind(base).run());
 await assert.rejects(()=>db.prepare('UPDATE econ_inventory SET spent=received+1 WHERE uid=?').bind(base).run());
 // HTTP layer rejects unauthenticated and flag-disabled requests, regardless of client balances.
 const disabled=await worker.fetch(new Request('https://test/pack',{method:'POST',body:'{}'}),{DB:db});assert.equal(disabled.status,404);
 const forbidden=await worker.fetch(new Request('https://test/pack',{method:'POST',body:JSON.stringify({uid:base,coins:1e9,initData:'forged'})}),{DB:db,ECONOMY_ENV:'staging',ECONOMY_ENABLED:'true',ECONOMY_TEST_UIDS:String(base),BOT_TOKEN:'test-only'});assert.equal(forbidden.status,403);
 // Signed requests exercise the actual Worker handler with this database adapter.
 const token='stage-two-test-token',te=new TextEncoder();
 const hmac=async(key,data)=>{const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,te.encode(data)));};
 const auth=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:base,first_name:'Synthetic'})});
 const secret=await hmac(te.encode('WebAppData'),token);const signature=await hmac(secret,[...auth].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n'));auth.set('hash',[...signature].map(x=>x.toString(16).padStart(2,'0')).join(''));
 const env={DB:db,BOT_TOKEN:token,ECONOMY_ENV:'staging',ECONOMY_ENABLED:'true',ECONOMY_TEST_UIDS:String(base)};
 const call=async path=>{const response=await worker.fetch(new Request('https://test'+path,{method:'POST',body:JSON.stringify({initData:auth.toString(),uid:base+99,coins:999999999})}),env);assert.equal(response.status,200);return response.json();};
 const httpState=await call('/state');assert.equal(httpState.state.wallet.uid,base);assert.equal(httpState.state.wallet.coins,final.wallet.coins);
 const restored=await call('/stars/restore');assert.equal(restored.results.length,1);assert.deepEqual(restored.results[0],paid);assert.equal(restored.state.wallet.revision,final.wallet.revision);
 // Explicit reviewed activation is replay-safe and carries spent cards / completed SBCs.
 const raw=JSON.stringify({coins:12,rw:{trophies:7},cards:{own:{[bronze[0]]:3},used:{[bronze[0]]:2}},sbc:{done:{'b:first':1,'old-repeatable-sbc':3}},paid:['jack:historical']});
 const review=await reconcile(raw),approval={approved:true,sourceHash:review.sourceHash,reviewer:'synthetic-review'};
 await activateReviewed(db,base+1,raw,approval,{environment:'staging'});await activateReviewed(db,base+1,raw,approval,{environment:'staging'});
 const migrated=await state(db,base+1);assert.equal(migrated.inventory[bronze[0]].spent,2);assert.ok(migrated.claims.includes('sbc:b:first'));assert.ok(migrated.claims.includes('sbc:old-repeatable-sbc'));
 await assert.rejects(()=>operate(db,base+1,'old-paid-restore','stars',{order:'historical-order'}));
 // Guarantees and current prices are asserted independently of outputs.
 assert.equal(products.get('basic').coins,400);assert.equal(products.get('jack').coins,20000);
 for(let level=0;level<5;level++){const keys=pack(level,{},()=>.5);assert.equal(keys.length,[3,5,8,15,30][level]);for(let i=0;i<catalog.packSpec[level].sure.length;i++)assert.equal(cards.get(keys[i]).rar,catalog.packSpec[level].sure[i]);assert.ok(keys.every(k=>!cards.get(k).sbcOnly));}
 return {uid:base,passed:true,revision:final.wallet.revision,checks:['forged balances','unknown cards','cross-device competing spend','lost response replay','same-id concurrent pack','SBC double spend','repeated rewards','trophy cap','Stars receipt validation and restore','immutable ledger','batch rollback','integer constraints','flags and authentication','pack guarantees','signed Worker HTTP','Stars HTTP restore','reviewed migration replay']};
}
