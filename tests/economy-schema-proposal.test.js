// Architecture-only validation: never touches production or staging D1.
// Node >= 22 with node:sqlite (CI uses Node 24).
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const sql = fs.readFileSync('docs/economy-schema-proposal.sql', 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(sql);
db.prepare('INSERT INTO econ_accounts(uid,coins,trophies,updated_ms) VALUES (?,?,?,?)').run(1, 500, 100, 1);
db.prepare('INSERT INTO econ_accounts(uid,coins,trophies,updated_ms) VALUES (?,?,?,?)').run(2, 100, 20, 1);
db.prepare('INSERT INTO econ_inventory(uid,card_key,owned_total,consumed_total) VALUES (?,?,?,?)').run(1,'player:x',2,1);
db.prepare('INSERT INTO econ_inventory(uid,card_key,owned_total,consumed_total) VALUES (?,?,?,?)').run(2,'player:x',0,0);

assert.throws(()=>db.prepare('UPDATE econ_accounts SET coins=-1 WHERE uid=1').run(), /constraint/i);
assert.throws(()=>db.prepare('UPDATE econ_accounts SET trophies=11001 WHERE uid=1').run(), /constraint/i);
assert.throws(()=>db.prepare('UPDATE econ_inventory SET consumed_total=3 WHERE uid=1 AND card_key=?').run('player:x'), /constraint/i);

const action='pack:abc', hash='same-request-hash';
const insertAction=db.prepare("INSERT INTO econ_actions(uid,action_id,action_type,request_hash,status,result_json,created_ms) VALUES (?,?,?,?,'applied',?,?)");
insertAction.run(1,action,'open_pack',hash,'{\"cards\":[\"player:x\"]}',2);
assert.throws(()=>insertAction.run(1,action,'open_pack',hash,'{}',2), /constraint/i);
db.prepare('INSERT INTO econ_ledger(uid,action_id,asset_type,asset_key,delta,created_ms) VALUES (?,?,?,?,?,?)').run(1,action,'coins','',100,2);
assert.throws(()=>db.prepare('INSERT INTO econ_ledger(uid,action_id,asset_type,asset_key,delta,created_ms) VALUES (?,?,?,?,?,?)').run(1,action,'coins','',100,2), /constraint/i);

// Demonstrate conditional debit/credit in one transaction. Implement D1 version after staging verification.
const before=db.prepare("SELECT consumed_total FROM econ_inventory WHERE uid=1 AND card_key='player:x'").get().consumed_total;
db.exec('BEGIN');
try {
  const debit=db.prepare('UPDATE econ_inventory SET consumed_total = consumed_total + 1 WHERE uid=? AND card_key=? AND owned_total-consumed_total >= 1').run(1,'player:x');
  assert.equal(Number(debit.changes),1);
  db.prepare('UPDATE econ_inventory SET owned_total=owned_total + 1 WHERE uid=? AND card_key=?').run(2,'player:x');
  db.exec('COMMIT');
} catch(e) {db.exec('ROLLBACK');throw e;}
assert.equal(db.prepare("SELECT consumed_total FROM econ_inventory WHERE uid=1 AND card_key='player:x'").get().consumed_total,before+1);
assert.equal(db.prepare("SELECT owned_total FROM econ_inventory WHERE uid=2 AND card_key='player:x'").get().owned_total,1);
const insufficient=db.prepare('UPDATE econ_inventory SET consumed_total = consumed_total + 1 WHERE uid=? AND card_key=? AND owned_total-consumed_total >= 1').run(1,'player:x');
assert.equal(Number(insufficient.changes),0);
assert.equal(db.prepare("SELECT consumed_total FROM econ_inventory WHERE uid=1 AND card_key='player:x'").get().consumed_total,2);

// Reject unreferenced ledger actions.
assert.throws(()=>db.prepare('INSERT INTO econ_ledger(uid,action_id,asset_type,asset_key,delta,created_ms) VALUES (?,?,?,?,?,?)').run(2,'absent','coins','',10,3), /constraint/i);

console.log('Draft economy schema constraints and SQLite transaction demonstration passed. No production D1 changes.');
