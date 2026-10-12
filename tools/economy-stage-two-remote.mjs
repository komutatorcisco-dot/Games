import fs from 'node:fs/promises';import {stagingDB} from './economy-staging-db.mjs';import {suite} from '../tests/economy-stage-two-suite.mjs';
const db=await stagingDB();
if(process.argv.includes('--apply')){
 const old=await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'econ_%'").all();if(old.results.length)throw Error('Economy schema exists; refusing automatic reapply');
 await db.prepare(await fs.readFile('server/economy/staging/002-economy.sql','utf8')).run();console.log('Applied stage two schema to verified staging only');
}
const report=await suite(db);report.transport='D1 REST batches, Worker handler executed locally; no deployed Worker';report.at=new Date().toISOString();
await fs.writeFile('private-economy/stage-two-remote-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
