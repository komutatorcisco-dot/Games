const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>!localStorage.getItem('oldjacksons.hub.v1') && localStorage.setItem('oldjacksons.hub.v1',JSON.stringify({coins:30000,user:{nick:'QA',emoji:'⚽'},ui:{coach:1,tut:99},rw:{trophies:11000}})));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='jackson.test')return route.abort();
      const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
      let body=fs.readFileSync(file);
      if(url.pathname==='/js/sbc.js')body=body.toString().replace('return { open, bind, ready,','return { submit, qaFill: keys => { cur.sq = keys; render(); }, open, bind, ready,');
      return route.fulfill({contentType,body});
    });
    await page.goto('http://jackson.test/');
    await page.waitForFunction(()=>!document.querySelector('#boot'));
    await page.evaluate(()=>StarShop.open());
    assert.equal(await page.locator('[data-coinpack]').count(),6);
    await page.screenshot({path:'tests/economy-shop-qa.png'});
    await page.locator('[data-coinpack="gold"]').click();
    await page.getByRole('button',{name:'Купить · 1000 монет',exact:true}).click();
    const first=await page.evaluate(()=>({coins:Store.d.coins,n:Object.values(Store.d.cards.own).reduce((a,b)=>a+b,0),gold:Cards.all().filter(c=>c.rar==='gold'&&Cards.owned(c.key)).length}));
    assert.equal(first.n,5);assert.ok(first.gold>=1);assert.ok(first.coins>=29000&&first.coins<29100);
    await page.reload();
    assert.equal(await page.evaluate(()=>Object.values(Store.d.cards.own).reduce((a,b)=>a+b,0)),5,'cards survive reload during animation');
    const paid=await page.evaluate(()=>{
      PackOpen.reveal=()=>{};
      const total=()=>Object.values(Store.d.cards.own).reduce((a,b)=>a+b,0);
      const before=total();StarShop.sync([{item:'epic3',n:123456}]);const after=total();
      StarShop.sync([{item:'epic3',n:123456}]);
      return {delta:after-before,repeated:total()-after,weekend:Rewards.weekend()};
    });
    assert.equal(paid.delta,24);assert.equal(paid.repeated,0);assert.equal(paid.weekend,false);
    const sbc=await page.evaluate(async()=>{
      Store.d.cards={own:Object.fromEntries(Cards.all().filter(c=>!c.sbcOnly).map(c=>[c.key,3])),used:{},fresh:[]};
      const ch=SBC.defs().find(c=>c.id.startsWith('up:g:'));
      SBC.open(ch.id);const keys=SBC.autofill(ch);SBC.qaFill(keys);
      const before=keys.map(k=>Cards.spare(k));
      await SBC.submit(ch);const used={...Store.d.cards.used};const own={...Store.d.cards.own};
      await SBC.submit(ch);
      return {n:ch.n,r:ch.req.find(r=>r.t==='rating').v,limit:ch.limit,valid:SBC.allOk(ch,keys.map(Cards.get)),consumed:keys.every(k=>used[k]===1),same:JSON.stringify(own)===JSON.stringify(Store.d.cards.own),done:Store.d.sbc.done[ch.id]};
    });
    assert.deepEqual(sbc,{n:11,r:85,limit:1,valid:true,consumed:true,same:true,done:1});
    assert.deepEqual(errors,[]);
    console.log('Economy UI: coin pack debit, reload persistence, paid bundle idempotency, SBC consumption and double submit passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
