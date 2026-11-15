// Local baseline of a restored export. Never connects to Cloudflare or Telegram.
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { savePreview } from '../server/economy/migration-preview.mjs';

export function cardCatalog() {
  const ctx={console,Ui:{get:()=>''},document:{addEventListener(){}},window:{matchMedia:()=>({matches:true})},setTimeout(){}};
  vm.createContext(ctx);
  for(const file of ['js/players.js','js/media.js','js/data/fcstats.js','js/data/cards.js','js/data/fcpos.js','js/positions.js','js/cards.js']) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return new Set(vm.runInContext('Cards.all().map(c=>c.key)',ctx));
}

export async function reviewDatabase(source, staging, catalog=cardCatalog()) {
  const original=new DatabaseSync(source,{readOnly:true});
  let target;
  try {
    for(const table of ['saves','purchases','payment_receipts']) if(!original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw Error('required legacy table missing: '+table);
    fs.closeSync(fs.openSync(staging,'wx',0o600));
    target=new DatabaseSync(staging);
    target.exec(fs.readFileSync('server/economy/staging/001-shadow.sql','utf8'));
    const db={prepare(text){return {bind(...values){return {
      first:async()=>target.prepare(text).get(...values),run:()=>target.prepare(text).run(...values)
    };}};},async batch(list){target.exec('BEGIN');try{const out=list.map(x=>x.run());target.exec('COMMIT');return out;}catch(e){target.exec('ROLLBACK');throw e;}}};
    const summary={version:1,players:0,pending:0,review:0,issues:{},activated:0};
    for(const {id} of original.prepare('SELECT id FROM saves UNION SELECT id FROM purchases UNION SELECT id FROM payment_receipts').iterate()) {
      const save=original.prepare('SELECT data FROM saves WHERE id=?').get(id);
      const result=await savePreview(db,'baseline-v1',{
        uid:id,catalog,snapshots:save?[{source:'d1_save',raw:save.data}]:[],
        purchases:original.prepare('SELECT * FROM purchases WHERE id=?').all(id),
        receipts:original.prepare('SELECT * FROM payment_receipts WHERE id=?').all(id),
      });
      summary.players++;summary[result.status]++;
      for(const issue of result.issues)summary.issues[issue]=(summary.issues[issue]||0)+1;
    }
    return summary;
  } finally {target?.close();original.close();}
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source,staging]=process.argv.slice(2);
  if(!source||!staging)throw Error('Usage: node tools/economy-review.mjs restored.sqlite NEW-shadow.sqlite');
  console.log(JSON.stringify(await reviewDatabase(source,staging),null,2));
}
