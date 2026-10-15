const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const root=process.cwd(), server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404).end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'}), errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE:',e.message)});
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/social-preview.html`);
  await page.locator('[data-social-slot="0"]').waitFor();
  assert.equal(await page.locator('#social-profile .cc').count(),3);
  const renderCost=await page.evaluate(()=>{const start=performance.now();for(let i=0;i<1000;i++)Social.render();return performance.now()-start});
  console.log('PERF: 1000 unchanged profile renders: '+renderCost.toFixed(1)+' ms (desktop Chrome, mobile viewport)');
  const images = async () => page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>Promise.race([i.decode().catch(()=>{}),new Promise(ok=>setTimeout(ok,5000))])))});
  await images();
  await page.waitForFunction(()=>[...document.querySelectorAll('#social-profile .cc-face')].every(i=>i.naturalWidth>0&&Number(getComputedStyle(i).opacity)===1));
  await page.screenshot({path:'tests/social-mobile-profile.png',fullPage:false});
  const before=await page.evaluate(()=>Social.active().slice());
  await page.locator('[data-social-move="0"]').click();
  assert.equal(await page.evaluate(()=>Social.active()[1]),before[0]);
  await page.locator('[data-social-clear="1"]').click();
  assert.equal(await page.evaluate(()=>Social.active()[1]),null);
  await page.locator('[data-social-slot="1"]').click();
  assert.ok(await page.locator('[data-social-pick]').count()<=18,'bounded picker');
  await images();
  await page.screenshot({path:'tests/social-mobile-picker.png',fullPage:false});
  await page.locator('[data-social-pick]').first().click();
  assert.ok(await page.evaluate(()=>Social.active()[1]));
  const fav=await page.locator('[data-social-fav]').first().getAttribute('data-social-fav');
  const was=await page.evaluate(k=>Social.favorite(k),fav);
  await page.locator('[data-social-fav]').first().click();
  assert.equal(await page.evaluate(k=>Social.favorite(k),fav),!was);
  await page.locator('[data-glfavorites]').click();
  assert.ok(await page.locator('[data-social-fav]').count()>0);
  assert.ok(await page.locator('[data-social-fav]').evaluateAll(bs=>bs.every(b=>b.getAttribute('aria-pressed')==='true')));
  // Lost ownership disappears from the personal showcase, even though the gallery remembers it.
  await page.evaluate(()=>{const k=Social.active()[0];Store.d.cards.used[k]=Store.d.cards.own[k];Social.render()});
  assert.equal(await page.evaluate(()=>Social.active()[0]),null);
  // Public profile renderer tested using an explicit fixture, not a production ownership claim.
  await page.evaluate(async()=>{Board.post=async()=>({ok:true,nick:'<script>unsafe</script>',emoji:'⚽',level:3,trophies:200,achievements:['Игрок дня'],showcase:[],showcaseEnabled:false});await Social.open('a'.repeat(32))});
  assert.equal(await page.locator('.pp-layer .pp-nm b').textContent(),'<script>unsafe</script>','nick is escaped in the full-screen profile');
  assert.equal(await page.locator('.pp-layer script').count(),0);
  assert.equal(await page.locator('.pp-layer .cc').count(),0,'empty showcase shows no cards');
  assert.ok(await page.locator('.pp-layer .pc-st').count()>=2,'stats tiles reuse skin classes');
  await page.screenshot({path:'tests/social-mobile-public.png',fullPage:false});
  // Быстрое открытие нескольких чужих профилей и закрытие во время загрузки: на экране всегда тот, кого открыли последним.
  const race=await page.evaluate(async()=>{
    const wait=ms=>new Promise(ok=>setTimeout(ok,ms)), pending={};
    Board.post=(url,b)=>new Promise(ok=>{pending[b.handle]=ok;});
    const prof=(nick)=>({ok:true,nick,emoji:'⚽',level:2,trophies:10,achievements:[],showcase:[],showcaseEnabled:true});
    const nick=()=>document.querySelector('.pp-layer:not(.out) .pp-nm b')?.textContent||null, out={};
    Social.closeLayer(); await wait(250);
    const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32),D='d'.repeat(32);
    // 1) A, затем B; ответ A приходит последним
    Social.open(A); Social.open(B); pending[B](prof('B')); await wait(0); pending[A](prof('A')); await wait(0);
    out.lateA=nick();
    // 2) C открыт и закрыт во время загрузки, затем D; ответ C приходит после открытия D
    Social.closeLayer(); await wait(250);
    Social.open(C); Social.closeLayer(); Social.open(D); pending[C](prof('C')); await wait(0);
    out.afterCloseLoading=document.querySelector('.pp-layer:not(.out) .pp-msg')?'loading':nick();
    pending[D](prof('D')); await wait(0); out.d=nick();
    // 3) закрыли во время загрузки — слой не появляется снова
    Social.closeLayer(); await wait(250);
    Social.open(A); Social.closeLayer(); pending[A](prof('A')); await wait(300);
    out.layers=document.querySelectorAll('.pp-layer').length; out.bodyOpen=document.body.classList.contains('pp-open');
    // 4) ошибка сети у старого запроса не затирает новый профиль
    Social.open(B); Social.open(C); pending[C](prof('C')); await wait(0);
    Board.post=null; // старый запрос B завершится ошибкой
    pending[B](Promise.reject(Error('net'))); await wait(10); out.afterOldError=nick();
    Social.closeLayer(); await wait(250);
    return out;
  });
  assert.deepEqual(race,{lateA:'B',afterCloseLoading:'loading',d:'D',layers:0,bodyOpen:false,afterOldError:'C'},'stale profile responses are ignored');
  for(const width of [360,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width)}
  assert.deepEqual(errors,[]);console.log('PASS mobile social: favorites, filter, reorder, replace, remove, bounded picker, inactive ownership, escaped public profile, widths 360/390/430');
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1});
