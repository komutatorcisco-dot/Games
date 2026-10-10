// Full app entry points, using deterministic counts instead of production accounts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('oldjacksons.hub.v1',JSON.stringify({user:{nick:'QA',emoji:'⚽'},ui:{coach:1},rw:{trophies:11000}})));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/presence') return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,total:2,modes:{duel:1,xdraft:1,trumps:0}})});
      if(url.hostname!=='jackson.test') return route.abort();
      const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
      return route.fulfill({contentType,body:fs.readFileSync(file)});
    });
    await page.goto('http://jackson.test/');
    await page.getByRole('button',{name:'Игры',exact:true}).click();
    await page.getByRole('tab',{name:/Онлайн/}).click();
    await page.waitForFunction(()=>document.querySelector('.h2-sheet [data-presence-total]')?.textContent==='2');
    assert.equal(await page.locator('.h2-sheet [data-online-game]').count(),3);
    assert.equal(await page.locator('.h2-sheet [data-presence-game="duel"]').textContent(),'1');
    assert.equal(await page.locator('.h2-sheet [data-picker-panel="offline"]').isVisible(),false);
    await page.getByRole('tab',{name:'Офлайн',exact:true}).click();
    assert.equal(await page.locator('.h2-sheet [data-picker-panel="offline"]').isVisible(),true);
    await page.getByRole('button',{name:'Закрыть',exact:true}).click();
    const result=await page.evaluate(async()=>{
      const pool=XDraft.pool(), used=new Set();
      const xi=XD.FORMATIONS['4-3-3'].slots.map(s=>{
        const p=pool.find(p=>p.icon&&p.pos.includes(s.pos)&&!used.has(p.name))||pool.find(p=>p.pos.includes(s.pos)&&!used.has(p.name));
        used.add(p.name);return p.name;
      });
      Store.d.xd={cur:{id:1,stage:'draft',sys:'new',form:'4-3-3',xi,bench:Array(XD.BENCH).fill(null),offers:{}},best:{},match:null};
      await XDraft.open();
      return {total:XD.chem('new','4-3-3',XDraft.xiOf()).total,icons:XDraft.xiOf().filter(p=>p.icon).length};
    });
    assert.equal(result.icons,11);assert.equal(result.total,33);
    assert.equal(await page.locator('#xd-body .xd-pitch .fu.legend').count(),11);
    assert.equal(await page.locator('#xd-body .xd-pitch .fu-ch.new .on').count(),33);
    await page.evaluate(()=>{XDraft.A().stage='done';XDraft.A().result={r:1,c:0};XDraft.S().tour={paid:true,over:true};XDraft.render();});
    assert.equal(await page.locator('.xd-rs span').nth(1).locator('b').textContent(),'33/33','finished drafts recalculate stale saved chemistry');
    assert.equal(await page.locator('[data-act2="tour"]').count(),0,'completed draft does not offer another tournament');
    await page.evaluate(()=>{XDraft.A().sys='classic';XDraft.render();});
    assert.equal(await page.locator('#xd-body .xd-pitch .xd-links .red').count(),0);
    assert.equal(await page.evaluate(()=>XD.chem('classic','4-3-3',XDraft.xiOf()).total),100);
    assert.deepEqual(errors,[]);
    console.log('Full mobile app: Games tabs, live count rendering, real draft Icons, 33 modern chemistry and 100 classic chemistry passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
