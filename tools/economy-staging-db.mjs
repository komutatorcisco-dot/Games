// Explicit staging allowlist. Token is read from a local Wrangler file, never printed.
import fs from 'node:fs/promises';
const ACCOUNT='8545d394db5c2aa73a62fa64890be811';
const STAGING='976c6fbd-83b6-4fbd-b159-f870fbf049d3';
const PRODUCTION='b7b137ed-74e2-4d2f-8639-482dbafd79ef';
export async function stagingDB(){
 if(STAGING===PRODUCTION)throw Error('Production forbidden');
 if(!process.env.ECONOMY_WRANGLER_AUTH)throw Error('Set ECONOMY_WRANGLER_AUTH to the local Wrangler config path. Never paste tokens.');
 const raw=await fs.readFile(process.env.ECONOMY_WRANGLER_AUTH,'utf8');
 const token=raw.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];if(!token)throw Error('Wrangler OAuth unavailable');
 async function api(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${STAGING}${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok||!j.success||(Array.isArray(j.result)&&j.result.some(x=>!x.success)))throw Error('D1 request failed: HTTP '+r.status+' codes '+(j.errors||[]).map(x=>x.code).join(','));return j.result;}
 const info=await api('');if(info.uuid!==STAGING||info.name!=='jackson-economy-staging-20261011')throw Error('Staging identity mismatch');
 return {prepare(sql){return {sql,params:[],bind(...params){this.params=params;return this;},async first(){return (await api('/query',{sql,params:this.params}))[0].results[0]??null;},async all(){return (await api('/query',{sql,params:this.params}))[0];},async run(){return (await api('/query',{sql,params:this.params}))[0];}};},async batch(list){return api('/query',{batch:list.map(({sql,params})=>({sql,params}))});}};
}
