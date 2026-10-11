import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {suite} from './economy-stage-two-suite.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(fs.readFileSync('server/economy/staging/002-economy.sql','utf8'));
const db={prepare(text){return {text,args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(text).get(...this.args)||null;},async all(){return {results:sql.prepare(text).all(...this.args)};},async run(){return sql.prepare(text).run(...this.args);}};},async batch(list){sql.exec('BEGIN');try{const out=list.map(s=>({results:sql.prepare(s.text).all(...s.args)}));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
try{console.log(await suite(db));}finally{sql.close();}
