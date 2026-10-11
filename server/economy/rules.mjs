import catalog from './generated/catalog.mjs';
export {catalog};
export const cards=new Map(catalog.cards.map(c=>[c.key,c]));
export const products=new Map(catalog.products.map(p=>[p.id,p]));
export const amount=(n,max=1e12)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export function requireValue(ok,message='invalid request'){if(!ok)throw new Error(message);}
export function random(){const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]/4294967296;}
const order=['bronze','silver','gold','legend','jack','future'];
const decay={bronze:1,silver:.8,gold:.62,legend:.82,jack:1};
function weighted(list,weights,rng){let x=rng()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<list.length;i++){x-=weights[i];if(x<=0)return list[i];}return list.at(-1);}
export function pack(level,owned,rng=random){
 requireValue(Number.isInteger(level)&&level>=0&&level<=4,'invalid pack');
 function draw(rar){let pool=[];for(let i=order.indexOf(rar);!pool.length&&i<order.length;i++){rar=order[i];pool=catalog.cards.filter(c=>c.rar===rar&&!c.sbcOnly);}
  requireValue(pool.length,'empty pool');const min=Math.min(...pool.map(c=>c.r));const fresh=pool.filter(c=>!owned[c.key]?.received);const from=fresh.length&&rng()<.35?fresh:pool;
  return weighted(from,from.map(c=>Math.pow(decay[rar]||1,c.r-min)),rng).key;
 }
 const p=catalog.packSpec[level];const out=p.sure.map(draw);while(out.length<p.n)out.push(draw(weighted(p.w.map(x=>x[0]),p.w.map(x=>x[1]),rng)));return out;
}
export function rewardCards(reward,inventory,rng=random){let out=[];if(reward.card){requireValue(cards.has(reward.card),'unknown reward card');out.push(reward.card);}if(reward.pack!==undefined){requireValue(amount(reward.count??1,10)&&(reward.count??1)>0);for(let i=0;i<(reward.count??1);i++)out.push(...pack(reward.pack,inventory,rng));}return out;}
