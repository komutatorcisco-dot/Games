const {chromium}=require(process.env.PW_MODULE || 'playwright');
(async()=>{const b=await chromium.launch({...(process.env.PW_CHROMIUM ? {executablePath:process.env.PW_CHROMIUM} : {}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1024,height:1024}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://127.0.0.1:8765/prototypes/player/face-frame.html');await p.waitForFunction(()=>window.done,null,{timeout:60000});
console.log(JSON.stringify(await p.evaluate(()=>window.FRAME)));await (await p.$('#c')).screenshot({path:process.argv[2],omitBackground:true});await b.close();})();
