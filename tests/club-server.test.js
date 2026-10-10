const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
// Execute the production SQL against SQLite, including transactional D1 batches.
const db = {
  prepare(text) {
    return { bind(...args) {
      let i = 0; const values = [];
      const query = text.replace(/\?(\d+)?/g, (_, n) => { values.push(args[n ? Number(n)-1 : i++]); return '?'; });
      const stmt = sql.prepare(query);
      return {
        first: async () => stmt.get(...values) || null,
        all: async () => ({ results:stmt.all(...values) }),
        run: async () => { const r = stmt.run(...values); return { meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
      };
    }, async run() { return this.bind().run(); } };
  },
  async batch(items) { sql.exec('BEGIN'); try { const r = []; for (const x of items) r.push(await x.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
};
const ctx = { console, Date, crypto:require('node:crypto').webcrypto, TextEncoder, URL, Response, Request, fetch:() => { throw Error('Unexpected network'); } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('server/worker.js','utf8').replace(/^export \{[^}]+\};/gm,'').replace('export default {','const worker = {').replace(/^export /gm,'') + '\nglobalThis.testAPI = { schema, club };', ctx);
(async () => {
  await ctx.testAPI.schema(db);
  sql.exec("INSERT INTO clubs VALUES (1,'ABCDEF','Test','⚽',1,0); INSERT INTO cmembers VALUES (1,1,0),(2,1,0),(3,2,0); INSERT INTO users(id,nick) VALUES (1,'Host'),(2,'Guest'),(3,'Other');");
  const call = (id, body) => ctx.testAPI.club({DB:db},{id},body);
  // Keep unrelated leaderboard work out of these lifecycle tests.
  vm.runInContext('clubInfo = async () => ({club:{}})',ctx);
  assert.equal((await call(1,{act:'battle',game:'squad',code:'ABCDE'})).ok,true);
  assert.equal((await call(2,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,true);
  assert.equal((await call(3,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,false);
  await call(2,{act:'battleClose',game:'squad',code:'ABCDE'});
  assert.equal((await call(2,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,true, 'only host can close');
  sql.exec('UPDATE croom SET ts = 1');
  assert.equal((await call(2,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,false,'stale room rejected');
  await call(1,{act:'battlePulse',game:'squad',code:'ABCDE'});
  assert.equal((await call(2,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,true);
  await call(1,{act:'battleClose',game:'squad',code:'ABCDE'});
  assert.equal((await call(2,{act:'battleCheck',game:'squad',code:'ABCDE'})).ok,false);
  await call(1,{act:'req',card:'Example',rar:'gold'});
  const req = sql.prepare('SELECT * FROM creq').get();
  const meta = JSON.parse(sql.prepare("SELECT meta FROM cchat WHERE kind='req'").get().meta);
  assert.equal(meta.requestId, req.id);
  assert.equal((await call(2,{act:'don',id:req.id})).ok,true);
  assert.equal((await call(2,{act:'don',id:req.id})).ok,false);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM cgift').get().n,1);
  const gifts = (await call(1,{act:'poll',after:0})).gifts;
  assert.equal(gifts.length,1);
  assert.equal((await call(1,{act:'poll',after:0})).gifts.length,1,'not consumed before acknowledgement');
  await call(2,{act:'giftAck',ids:[gifts[0].id]});
  assert.equal((await call(1,{act:'poll',after:0})).gifts.length,1,'other user cannot acknowledge');
  await call(1,{act:'giftAck',ids:[gifts[0].id]});
  assert.equal((await call(1,{act:'poll',after:0})).gifts.length,0);
  sql.exec('UPDATE creq SET got=0, ts=1');
  assert.equal((await call(2,{act:'don',id:req.id})).ok,false,'expired donation rejected');
  console.log('Club server: live/closed/stale rooms, membership, requests, donation limit and gift acknowledgement passed');
})().catch(e => { console.error(e); process.exitCode=1; });
