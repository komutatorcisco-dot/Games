// Превью (?stage=1) на iPhone в Telegram: облако Telegram общее у всех Mini App одного бота, поэтому превью
// стартует с копии настоящего сохранения, но пишет только под своими ключами pv_*; покупки за Stars в превью отключены.
// Обычный режим по-прежнему пишет в настоящие ключи.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const tgMock=(real)=>{
  const store=Object.assign({},real);window.__cs=store;window.__invoices=0;
  const cs={getItems:(ks,cb)=>setTimeout(()=>cb(null,Object.fromEntries(ks.map(k=>[k,store[k]||'']))),5),
    setItem:(k,v,cb)=>{store[k]=v;setTimeout(()=>cb&&cb(null,true),1);},getItem:(k,cb)=>cb(null,store[k]||''),removeItem:(k,cb)=>{delete store[k];cb&&cb(null,true);}};
  const noop=new Proxy(function(){},{get:(t,k)=>k==='isVisible'?false:noop,apply:()=>undefined});
  const base={initData:'query_id=1&user=%7B%22id%22%3A1%7D&hash=0',initDataUnsafe:{user:{id:1}},version:'7.0',platform:'ios',CloudStorage:cs,isVersionAtLeast:()=>true,
    openInvoice:()=>{window.__invoices++;},colorScheme:'dark',themeParams:{},viewportHeight:844,viewportStableHeight:844};
  window.Telegram={WebApp:new Proxy(base,{get:(t,k)=>k in t?t[k]:noop})};
};
(async()=>{
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{channel:'chrome',headless:true});
  try {
    const realSave=JSON.stringify({coins:777,user:{nick:'Owner',emoji:'⚽'},ui:{coach:1,tut:99},rw:{trophies:5000},ts:1});
    const real={s0:realSave,sn:'1',st:'1'};
    const run=async(query)=>{
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      const errors=[],invoiceCalls=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(tgMock,real);
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.pathname.endsWith('/invoice')){invoiceCalls.push(url.href);return route.fulfill({contentType:'application/json',body:'{"ok":false}'});}
        if(url.hostname!=='jackson.test')return route.abort();
        const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
        if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
        const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
        return route.fulfill({contentType,body:fs.readFileSync(file)});
      });
      await page.goto('http://jackson.test/'+query);
      await page.waitForFunction(()=>!document.querySelector('#boot'));
      await page.waitForFunction(()=>Store.d.rw&&Store.d.rw.trophies===5000,null,{timeout:10000});
      await page.evaluate(()=>{Store.d.coins=4242;Store.save();});
      await page.waitForFunction(()=>Object.keys(window.__cs).some(k=>(window.__cs[k]||'').includes('4242')),null,{timeout:10000});
      const cs=await page.evaluate(()=>window.__cs);
      const buy=await page.evaluate(async()=>{await Rewards.buyPass();StarShop.open();document.querySelector('[data-ss]').click();document.dispatchEvent(new CustomEvent('ss-buy',{detail:'skin:gold'}));await new Promise(ok=>setTimeout(ok,300));return window.__invoices;});
      await page.close();
      return {cs,errors,invoiceCalls,opened:buy};
    };
    const pv=await run('?stage=1');
    assert.equal(pv.cs.s0,realSave,'preview never overwrites the real Telegram save');
    assert.equal(pv.cs.sn,'1');
    assert.ok(pv.cs.pv_s0&&pv.cs.pv_s0.includes('4242')&&pv.cs.pv_s0.includes('"trophies":5000'),'preview starts from the real save copy and writes pv_* keys');
    assert.deepEqual(pv.invoiceCalls,[],'no invoice is requested in preview');assert.equal(pv.opened,0);
    assert.deepEqual(pv.errors,[]);
    const prod=await run('');
    assert.ok(prod.cs.s0.includes('4242'),'normal mode still writes the real save');
    assert.ok(!Object.keys(prod.cs).some(k=>k.startsWith('pv_')),'normal mode never writes preview keys');
    assert.ok(prod.invoiceCalls.length>=2,'normal mode still requests invoices (pass and shop)');
    assert.deepEqual(prod.errors,[]);
    console.log('Preview isolation: real Telegram save read-only in ?stage=1, preview keys pv_*, no Stars invoices; normal mode unchanged');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
