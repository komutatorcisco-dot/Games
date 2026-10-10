const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>!localStorage.getItem('oldjacksons.hub.v1') && localStorage.setItem('oldjacksons.hub.v1',JSON.stringify({coins:30000,user:{nick:'QA',emoji:'⚽'},ui:{coach:1},rw:{trophies:11000}})));
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

    await page.emulateMedia({reducedMotion:'no-preference'});
    const session=await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    for (const reduced of [false,true]) {
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      // Reload so the module captures the selected motion preference.
      await page.reload();await page.waitForFunction(()=>!document.querySelector('#boot'));
      await page.evaluate(()=>{
        window.packDone=0;
        const cards=Cards.all().filter(c=>c.rar==='legend').slice(0,30);
        PackOpen.reveal(cards.map(c=>({c,isNew:true,coins:0})),()=>window.packDone++);
      });
      await page.waitForFunction(()=>document.querySelector('.po-hint')?.textContent.includes('увидеть все'));
      // tapOnce deliberately arms its listener after 250 ms.
      await page.waitForTimeout(300);
      await page.locator('.po-stage').click();
      await page.waitForFunction(()=>document.querySelector('.po')?.dataset.phase==='done');
      assert.equal(await page.locator('.po-grid .cc').count(),30);
      assert.equal(await page.locator('.po-grid .po-flip').count(),0,'no per-card 3D layers');
      const effects=await page.evaluate(()=>({
        animations:document.querySelector('.po-grid').getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity).length,
        rays:getComputedStyle(document.querySelector('.po-rays')).animationName,
        face:getComputedStyle(document.querySelector('.po-grid .cc')).visibility
      }));
      assert.equal(effects.animations,0,'grid settles without persistent animations');
      assert.equal(effects.rays,'none');assert.equal(effects.face,'visible');
      if(!reduced)await page.screenshot({path:'tests/pack-performance-qa.png'});
      await page.locator('.po-take').click();
      await page.waitForFunction(()=>!document.querySelector('.po'));
      assert.equal(await page.evaluate(()=>window.packDone),1);
    }
    assert.deepEqual(errors,[]);
    console.log('Pack reveal: 30 Icons, 4x CPU throttling, normal/reduced motion, visible cards, no persistent grid effects, single completion passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
