const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
function client(saved = {}) {
  const ctx = { console, setTimeout: () => 0, clearTimeout() {}, window: { addEventListener() {}, matchMedia: () => ({ matches: true }) },
    document: { addEventListener() {}, getElementById: () => null }, Store: { d: saved, save() {} }, Ui: { get: () => '' }, esc: String,
    Release: { weekKey: () => '2026-10-12' }, Day: { key: () => '2026-10-14' }, toast() {}, Board: { ready: () => false } };
  vm.createContext(ctx);
  for (const f of ['players', 'media', 'data/fcstats', 'data/fcpos', 'positions', 'data/cards', 'cards', 'social', 'sbc']) {
    let source = fs.readFileSync('js/' + f + '.js', 'utf8');
    if (f === 'sbc') source = source.replace('return { open, bind, ready,', 'return { qaSubmit(ch, keys) { cur = { id: ch.id, sq: keys }; submitChecked(ch); }, open, bind, ready,');
    vm.runInContext(source, ctx);
  }
  vm.runInContext('globalThis.T = { Cards, Social, SBC };', ctx); return ctx;
}
const c = client(), { Cards, Social, SBC } = c.T;
const keys = Cards.all().filter(c => !c.sbcOnly).slice(0, 15).map(c => c.key), [a,b,d] = keys;
c.Store.d.cards = { own: Object.fromEntries(keys.map(k => [k,1])), used: {}, fresh: [] };
Social.toggle(a); assert.equal(Social.available(a), 0);
assert.equal(Cards.use([a,b]), false, 'failed batch must not consume any card'); assert.equal(Cards.spare(b),1);
c.Store.d.cards.own[a] = 3;
assert.equal(Cards.use([a,a]),true); assert.equal(Cards.spare(a),1); assert.equal(Cards.use([a]),false);
Social.toggle(a); assert.equal(Cards.use([a]),true);
Social.toggle(a); assert.equal(Social.favorite(a),false,'cannot favorite surrendered historical entry');
Social.toggle(b);
SBC.qaSubmit({id:'qa:protected',n:2,req:[],limit:1,reward:{coins:100}},[b,d]);
assert.equal(Cards.spare(b),1);assert.equal(Cards.spare(d),1,'final manual confirmation revalidates protection without partial consumption');
const result = SBC.autofill({ n: 2, req: [] });
assert.ok(!result.some(x => (typeof x === 'string' ? x : x.key) === b), 'autofill excludes protected last copy');
const kept = SBC.autofill({ n: 2, req: [] }, [b]);
assert.ok(!kept.some(x => (typeof x === 'string' ? x : x.key) === b), 'autofill removes a newly protected preselection');
Social.state().showcase = [b,d,null]; assert.equal(Social.active()[1],d);
Cards.use([d]); assert.equal(Social.active()[1],null,'spent card disappears from active showcase');
const restored = client(JSON.parse(JSON.stringify(c.Store.d)));
assert.equal(restored.T.Social.favorite(b),true,'favorite survives local restart');
assert.equal(restored.T.Social.active()[1],null);

const sql = new DatabaseSync(':memory:');
let reads=0,writes=0;
const db = { prepare(text) { return { bind(...args) {
  let i=0; const values=[]; const query=text.replace(/\?(\d+)?/g,(_,n)=>{values.push(args[n?+n-1:i++]);return '?';});
  const stmt=sql.prepare(query);
  return { first:async()=>{reads++;return stmt.get(...values)||null}, all:async()=>{reads++;return {results:stmt.all(...values)}}, run:async()=>{writes++;return {meta:{changes:Number(stmt.run(...values).changes)}}} };
}, run(){return this.bind().run()}, first(){return this.bind().first()}, all(){return this.bind().all()} }; },
async batch(items){sql.exec('BEGIN');try{const out=[];for(const x of items)out.push(await x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}} };
const server = { console, Date, crypto: require('node:crypto').webcrypto, TextEncoder, URL, URLSearchParams, Response, Request, fetch:()=>{throw Error('Unexpected network')} };
vm.createContext(server);
vm.runInContext(fs.readFileSync('server/worker.js','utf8').replace(/^export \{[^}]+\};/gm,'').replace('export default {','const worker = {').replace(/^export /gm,'')+'\nglobalThis.S={social, socialHandles, schema, verifyInit, saveData};',server);
(async()=>{
  const env={DB:db,SOCIAL_ENABLED:'1'}, api=(id,body)=>server.S.social(env,{id},body);
  assert.equal((await server.S.social({DB:db,SOCIAL_ENABLED:'0'},{id:1},{act:'self'})).disabled,true);
  let one=await api(1,{act:'self'}), other=await api(2,{act:'self'});
  assert.match(one.handle,/^[a-f0-9]{32}$/); assert.notEqual(one.handle,other.handle);
  const read=await api(2,{act:'profile',handle:one.handle});assert.equal(read.private,true);
  const op={type:'favorite',key:b,value:true};
  const race=await Promise.all([api(1,{act:'edit',revision:0,op}),api(1,{act:'edit',revision:0,op:{type:'privacy',value:true}})]);
  assert.equal(race.filter(r=>r.ok).length,1,'CAS: only one simultaneous writer succeeds');
  assert.equal(race.filter(r=>r.conflict).length,1);
  one=await api(1,{act:'self'}); assert.equal(one.favorites[b],true);
  assert.equal((await api(1,{act:'edit',revision:one.revision,op:{type:'favorite',key:'__proto__',value:true}})).ok,false);
  assert.equal((await api(1,{act:'edit',revision:one.revision,op:{type:'showcase',keys:[a,a,null]}})).ok,false);
  one=await api(1,{act:'edit',revision:one.revision,op:{type:'showcase',keys:['FAKE:999',null,null]}});
  one=await api(1,{act:'edit',revision:one.revision,op:{type:'privacy',value:true}});
  await db.prepare('INSERT INTO users(id,nick,emoji,xp) VALUES (1,?,?,?)').bind('<script>alert(1)</script>','⚽',200).run();
  const pub=await api(2,{act:'profile',handle:one.handle});
  assert.equal(pub.level,3); assert.ok(pub.showcase.every(k=>k===null),'forged private showcase never becomes public ownership');
  assert.equal(pub.showcaseEnabled,true);
  for(const k of ['uid','id','data','favorites','initData','handle','telegramId'])assert.ok(!(k in pub),'private data excluded: '+k);
  const before=(await api(1,{act:'self'})).revision;
  await api(2,{act:'edit',revision:other.revision,uid:1,op:{type:'privacy',value:true}});
  assert.equal((await api(1,{act:'self'})).revision,before,'client uid cannot edit another player');
  one=await api(1,{act:'edit',revision:one.revision,op:{type:'privacy',value:false}});
  assert.deepEqual(JSON.parse(JSON.stringify(await api(2,{act:'profile',handle:one.handle}))),{ok:true,private:true},'privacy change applies immediately');
  assert.equal(await server.S.verifyInit('user={"id":1}','fake-token'),null,'unsigned Telegram session rejected');
  // Two real client state machines share a server: independent changes merge via fresh read/CAS.
  const deviceA=client({}), deviceB=client({});
  for(const device of [deviceA,deviceB]) { device.Board.ready=()=>true; device.Board.post=(_,body)=>api(3,body); }
  await deviceA.T.Social.sync(); await deviceB.T.Social.sync();
  deviceA.Store.d.cards={own:{[b]:1},used:{},fresh:[]}; deviceA.T.Social.toggle(b); await deviceA.T.Social.sync();
  await deviceB.T.Social.sync(); assert.equal(deviceB.T.Social.favorite(b),true,'favorites sync across devices');
  deviceA.T.Social.state().pending.push({type:'showcase',keys:[b,null,null]});
  await deviceA.T.Social.sync(); await deviceB.T.Social.sync();
  assert.equal(deviceB.T.Social.state().showcase[0],b,'showcase order syncs across devices');
  // Lost response: same absolute preference may be replayed without duplicate inventory grants.
  deviceA.Board.post=async(_,body)=>{const r=await api(3,body);if(body.act==='edit')throw Error('lost response');return r;};
  deviceA.T.Social.toggle(b); await deviceA.T.Social.sync(); assert.equal(deviceA.T.Social.state().pending.length,1);
  deviceA.Board.post=(_,body)=>api(3,body); await deviceA.T.Social.sync(); await deviceB.T.Social.sync();
  assert.equal(deviceB.T.Social.favorite(b),false); assert.equal(deviceA.T.Social.state().pending.length,0);
  let load=await api(10,{act:'self'});
  const ops=Array.from({length:50},(_,i)=>({type:'favorite',key:'load:'+i,value:true}));
  reads=0;writes=0;
  load=await api(10,{act:'edit',revision:load.revision,ops});
  assert.equal(writes,1);assert.equal(reads,3);
  reads=0;writes=0;
  await api(10,{act:'edit',revision:load.revision,ops});
  assert.equal(writes,0,'identical replay does not write');assert.equal(reads,2);
  reads=0;writes=0;
  for(let i=0;i<100;i++)await server.S.socialHandles(env,[1,2,10]);
  assert.equal(reads,1,'100 repeated handle lookups use one indexed query');assert.equal(writes,0);
  let calls=0;const original=deviceB.Board.post;deviceB.Board.post=(...args)=>{calls++;return original(...args)};
  for(let i=0;i<100;i++)await deviceB.T.Social.sync(false);
  assert.equal(calls,0,'rapid visibility events do not poll');
  // Server-verified showcase: only cards found in the server-stored save; special cards need a server grant.
  const save=(id,own,used={})=>server.S.saveData(env,{id},{data:JSON.stringify({ts:Date.now()+Math.random(),rw:{trophies:10},cards:{own,used,fresh:[]}})});
  let v=await api(20,{act:'self'});
  v=await api(20,{act:'edit',revision:v.revision,op:{type:'privacy',value:true}});
  v=await api(20,{act:'edit',revision:v.revision,op:{type:'showcase',keys:[a,b,'FL:mario-balotelli']}});
  assert.deepEqual(JSON.parse(JSON.stringify(v.shown)),[null,null,null],'nothing public before the server has a save');
  await save(20,{[a]:1,[b]:2,'FL:mario-balotelli':1});
  let p20=await api(2,{act:'profile',handle:v.handle});
  assert.deepEqual(JSON.parse(JSON.stringify(p20.showcase)),[a,b,null],'owned cards shown; special card hidden without server grant record');
  await db.prepare('INSERT INTO legend_claims (uid, card, created) VALUES (20, ?, 1)').bind('FL:mario-balotelli').run();
  await save(20,{[a]:1,[b]:2,'FL:mario-balotelli':1});
  p20=await api(2,{act:'profile',handle:v.handle});
  assert.deepEqual(JSON.parse(JSON.stringify(p20.showcase)),[a,b,'FL:mario-balotelli'],'server-granted special card shown');
  await save(20,{[a]:1,[b]:2,'FL:mario-balotelli':1},{[a]:1});
  p20=await api(2,{act:'profile',handle:v.handle});
  assert.deepEqual(JSON.parse(JSON.stringify(p20.showcase)),[null,b,'FL:mario-balotelli'],'card spent in SBC disappears after the next save');
  const ts0=sql.prepare('SELECT ts FROM social_shown WHERE uid = 20').get().ts;
  await new Promise(r=>setTimeout(r,5));
  await save(20,{[a]:1,[b]:2,'FL:mario-balotelli':1},{[a]:1});
  assert.equal(sql.prepare('SELECT ts FROM social_shown WHERE uid = 20').get().ts,ts0,'unchanged showcase is not rewritten on save');
  console.log('PASS showcase: server save ownership, special-card grant, SBC removal, no extra writes');
  console.log('PASS load: 50 edits = 1 write/3 reads; replay = 0 writes; 100 handle lookups = 1 read; 100 resume events = 0 requests');
  console.log('PASS social: protected copies, atomic batch, autofill, active showcase, CAS, privacy, forged ownership, device sync, lost response');
})().catch(e=>{console.error(e);process.exitCode=1});
