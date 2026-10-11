// Separate opt-in Worker entrypoint; never deployed by the production workflow.
import {verifyInit} from '../worker.js';
import {state,operate} from './engine.mjs';
import {products} from './rules.mjs';
import {createOrder,validatePayment,recordPayment} from './payments.mjs';
const response=(body,status=200)=>Response.json(body,{status});
function allowed(env,uid){return env.ECONOMY_ENABLED==='true'&&env.ECONOMY_ENV==='staging'&&String(env.ECONOMY_TEST_UIDS||'').split(',').includes(String(uid));}
async function telegram(env,method,body){const r=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!j.ok)throw Error('Telegram unavailable');return j.result;}
export async function handle(request,env){
 if(env.ECONOMY_ENABLED!=='true'||env.ECONOMY_ENV!=='staging')return response({ok:false,error:'disabled'},404);
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if(request.method!=='POST')return response({ok:false,error:'method'},405);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return response({ok:false,error:'too large'},413);
 let body;try{body=JSON.parse(raw);}catch{return response({ok:false,error:'bad JSON'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return response({ok:false,error:'bad JSON'},400);
 const path=new URL(request.url).pathname;
 if(path==='/webhook'){
  if(!env.ECONOMY_WEBHOOK_SECRET||request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.ECONOMY_WEBHOOK_SECRET)return response({ok:false},403);
  const m=body.message,q=body.pre_checkout_query,uid=m?.from?.id||q?.from?.id;
  if(!allowed(env,uid))return response({ok:false},403);
  if(q){let ok=false;try{const order=await validatePayment(env.DB,uid,q);ok=!(await env.DB.prepare('SELECT charge FROM econ_receipts WHERE order_id=?').bind(order.id).first());}catch{}
   await telegram(env,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,...(!ok?{error_message:'Заказ недоступен'}:{})});return response({ok:true});}
  if(m?.successful_payment){const order=await recordPayment(env.DB,uid,m.successful_payment);await operate(env.DB,uid,'stars:'+order.id,'stars',{order:order.id});return response({ok:true});}
  return response({ok:true});
 }
 const user=await verifyInit(body.initData,env.BOT_TOKEN,3600);
 if(!user||!allowed(env,user.id))return response({ok:false,error:'forbidden'},403);
 const uid=user.id;
 if(path==='/state')return response({ok:true,active:true,state:await state(env.DB,uid)});
 if(path==='/invoice'){
  // Only a dedicated test bot may be configured. No production webhook changes.
  await state(env.DB,uid);const order=await createOrder(env.DB,uid,body.item,body.id);
  const link=await telegram(env,'createInvoiceLink',{title:'Jackson Games · '+order.item,description:'Тест серверного магазина',payload:JSON.stringify({v:2,uid,order:order.id}),currency:'XTR',prices:[{label:order.item,amount:order.stars}]});return response({ok:true,link,order:order.id});
 }
 if(path==='/stars/restore'){
  const rows=await env.DB.prepare('SELECT o.id FROM econ_orders o JOIN econ_receipts r ON r.order_id=o.id WHERE o.uid=? ORDER BY o.created_ms LIMIT 1000').bind(uid).all();
  const results=[];for(const r of rows.results)results.push(await operate(env.DB,uid,'stars:'+r.id,'stars',{order:r.id}));
  return response({ok:true,results,state:await state(env.DB,uid)});
 }
 const kind={'/pack':'pack','/sbc':'sbc','/reward':'reward'}[path];if(!kind)return response({ok:false,error:'not found'},404);
 const result=await operate(env.DB,uid,body.id,kind,body.payload);
 return response({ok:true,result,state:await state(env.DB,uid)});
}
export default {async fetch(request,env){let res;try{res=await handle(request,env);}catch(e){res=response({ok:false,error:'operation rejected; retry with the same transaction id'},409);}
 const origin=request.headers.get('Origin');if(origin&&origin===env.ECONOMY_ORIGIN){res.headers.set('Access-Control-Allow-Origin',origin);res.headers.set('Vary','Origin');res.headers.set('Access-Control-Allow-Headers','Content-Type');res.headers.set('Access-Control-Allow-Methods','POST, OPTIONS');}
 res.headers.set('Cache-Control','no-store');return res;}};
