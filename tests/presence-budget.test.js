const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=1000000,calls=0,fail=false,interval=0;
const ctx={Date:{now:()=>now},document:{hidden:false,querySelectorAll:()=>[],addEventListener(){}},setInterval:(f,ms)=>{interval=ms;return 1;},Board:{ready:()=>true,post:async()=>{calls++;if(fail)throw Error('quota');return{ok:true,total:1,modes:{}};}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/online.js','utf8')+';globalThis.api=Online;',ctx);
(async()=>{
  await ctx.api.refreshPresence();assert.equal(calls,1);
  for(let i=0;i<20;i++)await ctx.api.refreshPresence();assert.equal(calls,1,'clicks cannot spam the endpoint');
  ctx.api.setActivity('hub');assert.equal(calls,1,'unchanged navigation does not send heartbeats');
  ctx.api.startPresence();assert.equal(interval,120000);
  now+=120000;fail=true;await ctx.api.refreshPresence();assert.equal(calls,2);
  now+=20000;await ctx.api.refreshPresence();assert.equal(calls,2,'quota failure starts a cooldown');
  now+=100000;await ctx.api.refreshPresence();assert.equal(calls,3);
  now+=120000;await ctx.api.refreshPresence();assert.equal(calls,3,'second failure doubles the cooldown');
  now+=120000;fail=false;await ctx.api.refreshPresence();assert.equal(calls,4);assert.equal(ctx.api.counts().total,1);
  console.log('Presence budget: two-minute interval, duplicate suppression, exponential retry and recovery passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
