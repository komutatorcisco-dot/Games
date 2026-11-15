const assert = require('node:assert/strict'), fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
(async()=>{
  const {preview,savePreview}=await import('../server/economy/migration-preview.mjs');
  const sql=new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync('server/economy/staging/001-shadow.sql','utf8'));
  // D1 batch contract emulation; real D1 still requires a staging drill.
  const db={prepare(text){return {bind(...args){return {
    first:async()=>sql.prepare(text).get(...args),
    run:()=>sql.prepare(text).run(...args)
  };}};},async batch(statements){sql.exec('BEGIN');try{const r=statements.map(x=>x.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const save={coins:500,rw:{trophies:100},cards:{own:{x:2},used:{x:1}},paid:['legend:9'],sbc:{done:{first:1}},shop:{owned:{gold:true}}};
  const input={uid:42,catalog:new Set(['x']),snapshots:[{source:'d1_save',raw:JSON.stringify(save)}]};
  const first=await savePreview(db,'review-0001',input);
  assert.equal(first.status,'pending');assert.equal(first.canActivate,false);assert.equal(first.canGrant,false);
  assert.deepEqual(await savePreview(db,'review-0001',input),first);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM shadow_reviews').get().n,1);
  const conflicting={...input,snapshots:[{source:'local_only',raw:JSON.stringify({...save,coins:999999})}]};
  await assert.rejects(savePreview(db,'review-0001',conflicting),/conflict/);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM shadow_snapshots').get().n,1);
  const mismatch=await savePreview(db,'review-0002',{...input,snapshots:[...input.snapshots,...conflicting.snapshots]});
  assert.ok(mismatch.issues.includes('device_disagreement'));assert.equal(mismatch.status,'review');
  assert.equal(sql.prepare('SELECT count(*) AS n FROM shadow_snapshots').get().n,2,'both sources retained, no overwrite');
  assert.throws(()=>sql.exec('DELETE FROM shadow_snapshots'),/immutable/);
  assert.throws(()=>sql.exec("UPDATE shadow_reviews SET result_json='{}'"),/immutable/);
  assert.throws(()=>sql.prepare('INSERT INTO shadow_snapshots VALUES (?,?,?,?,?)').run(1.5,'d1_save','a'.repeat(64),'{}',1),/constraint/);
  for (const changed of [
    {...save,coins:-1},{...save,coins:1.5},{...save,coins:'500'},
    {...save,cards:{own:{x:1},used:{x:2}}}, {...save,cards:{own:{unknown:1}}},
    {...save,rw:{trophies:11001}}, {...save,paid:'fake'},
  ]) {const r=await preview({...input,snapshots:[{source:'local_only',raw:JSON.stringify(changed)}]});assert.equal(r.status,'review');assert.equal(r.canActivate,false);}
  assert.equal((await preview({...input,snapshots:[{source:'d1_save',raw:'null'}]})).status,'review');
  assert.equal((await preview({...input,snapshots:[{source:'d1_save',raw:'{'}]})).status,'review');
  const payment={id:42,item:'legend',season:9,stars:39};
  const receipt={id:42,item:'legend',purchase:9,stars:39,charge:'tg-charge'};
  const confirmed=await preview({...input,purchases:[payment],receipts:[receipt]});
  assert.equal(confirmed.paymentEvidence[0].matched,true);assert.equal(confirmed.canGrant,false,'receipt must not re-grant a legacy reward');
  assert.ok((await preview({...input,purchases:[payment]})).issues.includes('legacy_purchase_without_receipt'));
  assert.ok((await preview({...input,purchases:[payment],receipts:[{...receipt,id:99}]})).issues.includes('invalid_receipt_evidence'));
  assert.ok((await preview({...input,receipts:[receipt,receipt]})).issues.includes('duplicate_charge'));
  await Promise.all([savePreview(db,'review-race',input),savePreview(db,'review-race',input)]);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM shadow_reviews WHERE review_id='review-race'").get().n,1);
  const badDb={...db,batch:async statements=>{sql.exec('BEGIN');try{statements[0].run();throw Error('injected failure');}finally{sql.exec('ROLLBACK');}}};
  await assert.rejects(savePreview(badDb,'review-fail',input),/injected/);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM shadow_reviews WHERE review_id='review-fail'").get().n,0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('econ_accounts','saves','purchases','payment_receipts')").get().n,0,'no production tables touched');
  sql.close(); console.log('Migration preview: conflicts, immutable evidence, payments, retries and rollback passed');
  const {reviewDatabase,cardCatalog}=await import('../tools/economy-review.mjs');
  assert.ok(cardCatalog().size>3000);
  fs.mkdirSync('private-economy',{recursive:true});
  const path=require('node:path'),dir=fs.mkdtempSync(path.resolve('private-economy/test-'));
  assert.ok(dir.startsWith(path.resolve('private-economy')+path.sep));
  try {
    const file=path.join(dir,'legacy.sqlite'),out=path.join(dir,'shadow.sqlite');
    const source=new DatabaseSync(file);
    source.exec('CREATE TABLE saves(id INTEGER PRIMARY KEY,data TEXT); CREATE TABLE purchases(id INTEGER,item TEXT,season INTEGER,stars INTEGER); CREATE TABLE payment_receipts(id INTEGER,item TEXT,purchase INTEGER,stars INTEGER,charge TEXT);');
    source.prepare('INSERT INTO saves VALUES (?,?)').run(42,JSON.stringify(save));
    source.prepare('INSERT INTO purchases VALUES (?,?,?,?)').run(99,'legend',7,39);
    source.close();const before=fs.readFileSync(file);
    const report=await reviewDatabase(file,out,new Set(['x']));
    assert.equal(report.players,2);assert.equal(report.pending,1);assert.equal(report.review,1);assert.equal(report.activated,0);
    assert.deepEqual(fs.readFileSync(file),before,'legacy export remains byte-identical');
    await assert.rejects(reviewDatabase(file,out,new Set(['x'])),/exist/i);
    assert.equal(JSON.stringify(report).includes('42'),false,'no player identifiers in aggregate report');
  } finally {fs.rmSync(dir,{recursive:true});}
  console.log('Restored-export baseline: read-only source, payment-only players, no activation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
