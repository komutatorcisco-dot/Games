// NODE_PATH may point to bundled Playwright; TEST_BROWSER can select a local executable.
const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({...(process.env.TEST_BROWSER ? {executablePath:process.env.TEST_BROWSER} : {channel:'chrome'}),headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await page.route('**/*',r=>r.abort());
    await page.setContent('<div id="sq-body"></div><div id="sq-sub"></div>');
    await page.addStyleTag({path:'css/style.css'});
    await page.addScriptTag({content:`
      const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
      const Store={d:{},save(){}}, Ui={get:()=>''}, esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
      const Sound={play(){}}, haptic=()=>{}, plural=()=>'', Screens={current:'squad'};
      const Release={weekKey:()=> '2026-10-05',at:Date.parse}, Day={key:()=> '2026-10-10'};
    `});
    for(const f of ['players','media','data/fcstats','data/cards','data/fcpos','positions','cards','xdraft/engine','xdraft/ui'])
      await page.addScriptTag({path:'js/'+f+'.js'});
    await page.addScriptTag({content:fs.readFileSync('js/squad.js','utf8').replace('return { open, bind, render, S, CTX }','return { pickFor, open, bind, render, S, CTX }')});
    await page.addScriptTag({content:fs.readFileSync('js/sbc.js','utf8').replace('return { open, bind, ready,','return { qaOpen(){const x=find("fs:espart").items[0]; view={mode:"ch",id:x.id};cur={id:x.id,sq:Array(x.n).fill(null)};openSheet(0);}, open, bind, ready,')});
    await page.evaluate(()=>{Store.d.cards={own:Object.fromEntries(Cards.all().map(c=>[c.key,3])),used:{},fresh:[]};Store.d.squad={form:'4-3-3',xi:Array(11).fill(null)};Squad.pickFor(4);});
    assert.equal(await page.locator('.sq-grid .cc').count(),24);
    const first=await page.locator('.sq-grid [data-card]').first().getAttribute('data-card');
    await page.locator('[data-page="1"]').click();
    assert.equal(await page.locator('.sq-grid .cc').count(),24);
    assert.notEqual(await page.locator('.sq-grid [data-card]').first().getAttribute('data-card'),first);
    await page.locator('.card-search').fill('Дани Алвес');
    assert.equal(await page.locator('.sq-grid .cc').count(),1);
    await page.locator('.sq-grid button').click();
    assert.equal(await page.evaluate(()=>Store.d.squad.xi[4]),'Дани Алвес');
    await page.evaluate(()=>{document.querySelectorAll('.sx-sheet-wrap').forEach(e=>e.remove());SBC.qaOpen();});
    assert.equal(await page.locator('.sx-grid .cc').count(),24);
    await page.locator('[data-page="1"]').click();
    assert.equal(await page.locator('.sx-grid .cc').count(),24);
    await page.locator('.card-search').fill('Витинья');
    assert.ok(await page.locator('.sx-grid .cc').count()>0);
    assert.ok(await page.locator('.sx-grid .cc').count()<=24);
    await page.locator('.card-search').fill('несуществующий футболист');
    assert.equal(await page.locator('.sx-grid .cc').count(),0);
    await page.locator('.card-search').fill('');
    await page.locator('[data-sf="gold"]').click();
    assert.equal(await page.locator('.sx-grid .cc').count(),24);
    await page.locator('[data-sh="sort"]').click();
    assert.equal(await page.locator('.sx-grid .cc').count(),24);
    console.log('Mobile pickers: full collection, bounded DOM, paging, search, selection, filters and sorting passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
