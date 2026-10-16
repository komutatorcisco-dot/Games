// Горизонтальный сезонный пропуск: премиум сверху, бесплатная линия снизу, при открытии виден текущий уровень,
// после «Забрать» прокрутка остаётся на месте, повторно та же награда не выдаётся.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const SHOTS=process.env.PASS_SHOTS||'';
(async()=>{
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>!localStorage.getItem('oldjacksons.hub.v1') && localStorage.setItem('oldjacksons.hub.v1',JSON.stringify({coins:500,user:{nick:'QA',emoji:'⚽'},ui:{coach:1,tut:99},rw:{trophies:11000}})));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='jackson.test')return route.abort();
      const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
      return route.fulfill({contentType,body:fs.readFileSync(file)});
    });
    await page.goto('http://jackson.test/');
    await page.waitForFunction(()=>!document.querySelector('#boot'));
    // уровень 12, без премиума, бесплатные 1–3 уже забраны
    const open=async(st,skin)=>{
      await page.evaluate(([st,skin])=>{ const p=Rewards.S().pass; Rewards.open('pass'); Object.assign(Rewards.S().pass,st); Store.d.skin.on=skin; Store.d.skin.own=['pill','classic','brawl','gold']; Skins.apply(); Rewards.open('pass'); },[st,skin]);
      await page.waitForTimeout(150);
    };
    await open({xp:12*300+40,free:[0,1,2],prem:[],premium:false},'pill');
    const s1=await page.evaluate(()=>{ const tr=document.querySelector('.ps-track'),rows=[...tr.children],cur=tr.querySelector('.ps-row.cur'),r=cur.getBoundingClientRect(),t=tr.getBoundingClientRect();
      const first=rows[0],kids=[...first.children].map(x=>x.className.split(' ')[0]+(x.classList.contains('prem')?':prem':x.classList.contains('free')?':free':''));
      return {n:rows.length,cur:+cur.querySelector('.ps-node').textContent,visible:r.left>=t.left-1&&r.right<=t.right+1,scroll:tr.scrollLeft,horiz:tr.scrollWidth>tr.clientWidth,kids,
        got:document.querySelectorAll('.ps-cell.free.got').length,ready:document.querySelectorAll('.ps-cell.free.ready').length,buy:document.querySelectorAll('.ps-cell.prem.buy').length,lock:document.querySelectorAll('.ps-cell.lock').length,
        overflowX:document.documentElement.scrollWidth>innerWidth}; });
    assert.equal(s1.n,30,'30 уровней');
    assert.deepEqual(s1.kids,['ps-cell:prem','ps-node','ps-cell:free'],'премиум сверху, номер посередине, бесплатно снизу');
    assert.equal(s1.cur,12);assert.ok(s1.visible,'текущий уровень виден при открытии');assert.ok(s1.scroll>0);assert.ok(s1.horiz,'дорожка листается вбок');
    assert.equal(s1.got,3);assert.equal(s1.ready,9);assert.equal(s1.buy,12);assert.equal(s1.lock,36);
    assert.ok(!s1.overflowX,'страница не уезжает вбок');
    if(SHOTS)await page.screenshot({path:`${SHOTS}/pass-l12-free-pill.png`});
    // будущая награда — подробности без выдачи
    const coins0=await page.evaluate(()=>Store.d.coins);
    await page.locator('.ps-cell.free.lock').nth(5).click();
    await page.waitForSelector('.ps-info-m');
    assert.match(await page.locator('.ps-info-m').innerText(),/Откроется на уровне/);
    if(SHOTS)await page.screenshot({path:`${SHOTS}/pass-info.png`});
    await page.evaluate(()=>Modal.close());
    // забираем награду 4 уровня: прокрутка не сбрасывается, повторно не выдаётся
    await page.evaluate(()=>{ const tr=document.querySelector('.ps-track'); tr.scrollLeft=Math.round(tr.scrollWidth*0.15); });
    await page.waitForTimeout(200);
    const before=await page.evaluate(()=>document.querySelector('.ps-track').scrollLeft);
    await page.evaluate(()=>document.querySelector('.ps-cell.free.ready').click()); // нажатие как пальцем, без прокрутки к кнопке
    await page.waitForTimeout(300);
    await page.evaluate(()=>{ Modal.close(); document.querySelectorAll('.po').forEach(x=>x.remove()); Cover.off(); });
    await page.waitForTimeout(150);
    const after=await page.evaluate(()=>({sx:document.querySelector('.ps-track').scrollLeft,free:[...Rewards.S().pass.free],coins:Store.d.coins}));
    assert.ok(after.free.includes(3),'награда 4 уровня забрана');
    assert.ok(Math.abs(after.sx-before)<=2,`прокрутка сохранилась (${before} → ${after.sx})`);
    const twice=await page.evaluate(()=>{ const c=Store.d.coins,n=Rewards.S().pass.free.length; document.querySelector('.ps-row:nth-child(4) .ps-cell.free').click(); return {dc:Store.d.coins-c,dn:Rewards.S().pass.free.length-n}; });
    assert.deepEqual(twice,{dc:0,dn:0},'повторное нажатие ничего не выдаёт');
    assert.ok(after.coins>=coins0);
    // премиум, уровень 25, часть премиум-наград забрана — разные скины
    for(const skin of ['pill','brawl','gold']){
      await page.evaluate(()=>{ const tr=document.querySelector('.ps-track'); if(tr) tr.remove(); });
      await open({xp:25*300,free:[0,1,2,3,4,5],prem:[0,1,2],premium:true},skin);
      const s=await page.evaluate(()=>({cur:+document.querySelector('.ps-row.cur .ps-node').textContent,ready:document.querySelectorAll('.ps-cell.prem.ready').length,got:document.querySelectorAll('.ps-cell.prem.got').length,buy:document.querySelectorAll('.ps-cell.buy').length}));
      assert.deepEqual(s,{cur:25,ready:22,got:3,buy:0});
      if(SHOTS)await page.screenshot({path:`${SHOTS}/pass-l25-prem-${skin}.png`});
    }
    // начало сезона: уровень 0
    await page.evaluate(()=>{ const tr=document.querySelector('.ps-track'); if(tr) tr.remove(); });
    await open({xp:0,free:[],prem:[],premium:false},'brawl');
    assert.equal(await page.locator('.ps-cell.ready').count(),0);
    assert.equal(await page.evaluate(()=>document.querySelector('.ps-track').scrollLeft),0);
    if(SHOTS)await page.screenshot({path:`${SHOTS}/pass-l0-brawl.png`});
    // маленький iPhone
    await page.setViewportSize({width:320,height:568});
    await page.evaluate(()=>{ document.querySelector('.ps-track').remove(); });
    await open({xp:30*300,free:[],prem:[],premium:true},'gold');
    assert.ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'нет горизонтального скролла страницы на 320px');
    if(SHOTS)await page.screenshot({path:`${SHOTS}/pass-l30-se-gold.png`});
    assert.deepEqual(errors,[]);
    console.log('pass browser ok');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
