const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'), sql=new DatabaseSync(':memory:');
const db={
  prepare(text){return{bind(...args){let i=0;const values=[];const query=text.replace(/\?(\d+)?/g,(_,n)=>{values.push(args[n?Number(n)-1:i++]);return'?';});const stmt=sql.prepare(query);return{first:async()=>stmt.get(...values)||null,all:async()=>({results:stmt.all(...values)}),run:async()=>{const r=stmt.run(...values);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};},async run(){return this.bind().run();}};},
  async batch(items){sql.exec('BEGIN');try{const out=[];for(const q of items)out.push(await q.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
};
const ctx={console,Date,crypto:require('node:crypto').webcrypto,TextEncoder,URL,Response,Request,fetch:()=>{throw Error('Unexpected network')}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('server/worker.js','utf8').replace(/^export \{[^}]+\};/gm,'').replace('export default {','const worker = {').replace(/^export /gm,'')+'\nglobalThis.testAPI={schema,onlinePresence,draftTour,saveScore,saveData,loadData};',ctx);
(async()=>{
  const api=ctx.testAPI, env={DB:db};
  await api.schema(db);
  let counts=await api.onlinePresence(env,{id:1},{act:'heartbeat',game:'duel'});
  assert.equal(counts.total,1); assert.equal(counts.modes.duel,1);
  counts=await api.onlinePresence(env,{id:2},{act:'heartbeat',game:'xdraft'});
  assert.equal(counts.total,2); assert.equal(counts.modes.xdraft,1);
  const publicCounts = await api.onlinePresence(env,null,{act:'counts'});
  assert.equal(publicCounts.total,2,'reading public totals never creates a fake online visitor');
  await api.onlinePresence(env,{id:1},{act:'leave'});
  counts=await api.onlinePresence(env,{id:3},{act:'count'});
  assert.equal(counts.total,1); assert.equal(counts.modes.duel,0);
  sql.exec('UPDATE presence SET ts=1 WHERE id=2');
  counts=await api.onlinePresence(env,{id:3},{act:'count'});
  assert.equal(counts.total,0,'a disconnected client expires after the heartbeat TTL');

  const players=Array.from({length:11},(_,i)=>'Игрок '+i), initial={round:0,res:[],over:false,paid:false,clubs:['Лидс','Наполи','Интер','Барселона']};
  const started=await api.draftTour(env,{id:7},{act:'start',players,state:JSON.stringify(initial)});
  assert.equal(started.ok,true); assert.equal(started.locked,false);
  const resumed=await api.draftTour(env,{id:7},{act:'start',players,state:JSON.stringify(initial)});
  assert.equal(resumed.attempt,started.attempt,'a second browser resumes the same persistent attempt');
  assert.equal(resumed.state.round,0);
  const completed={...initial,over:true,res:[{s:[2,0],win:true}]};
  assert.equal((await api.draftTour(env,{id:7},{act:'sync',attempt:started.attempt,state:JSON.stringify(completed)})).done,true);
  assert.equal((await api.draftTour(env,{id:7},{act:'start',players,state:JSON.stringify(initial)})).locked,true,'the same roster cannot replay a completed tournament');
  assert.equal((await api.draftTour(env,{id:7},{act:'claim',attempt:started.attempt})).granted,true);
  assert.equal((await api.draftTour(env,{id:7},{act:'claim',attempt:started.attempt})).already,true,'prize claim is one-time across devices');
  const newDraft=await api.draftTour(env,{id:7},{act:'start',players:players.map((p,i)=>i===0?'Новый игрок':p),state:JSON.stringify(initial)});
  assert.notEqual(newDraft.attempt,started.attempt,'a new squad may enter a fresh tournament');

  const user={id:99,username:'test'};
  for(let n=0;n<5;n++) await api.saveScore(env,user,{xp:0,tro:50000});
  assert.equal(sql.prepare('SELECT trophies FROM ustats WHERE id=99').get().trophies,11000,'repeated trophy requests stop at the hard server cap');
  await api.saveData(env,user,{data:JSON.stringify({ts:Date.now(),rw:{trophies:99999}})});
  const loaded=await api.loadData(env,user);
  assert.equal(loaded.tro,11000); assert.equal(JSON.parse(loaded.data).rw.trophies,11000,'cloud save/load is clamped too');
  console.log('Online state: heartbeat expiry, one persistent draft attempt, single prize claim, and 11,000 trophy cap passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
