// Футбол 3 на 3 в хабе (только тестовая версия): кнопка «3 на 3» на главной, игра во фрейме грузится при входе
// (матч; тренировки — внутри игры; звук — по настройке хаба), «Назад» Telegram передаётся игре, выход из игры возвращает
// на главную и выгружает фрейм. На обычном сайте карточки нет. Сама 3D-игра здесь подменена заглушкой.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const STUB=`<!doctype html><meta charset="utf-8"><body>stub<script>
addEventListener('message',e=>{if(e.data&&e.data.jg==='back'){parent.__backs=(parent.__backs||0)+1;parent.postMessage({jg:'haptic',kind:'tap'},location.origin);parent.postMessage({jg:'football-exit'},location.origin);}});
</script>`;
const tg=()=>{const noop=new Proxy(function(){},{get:(t,k)=>k==='isVisible'?false:noop,apply:()=>undefined});
  const bb={shown:false,h:null,show(){this.shown=true;},hide(){this.shown=false;},onClick(f){this.h=f;},isVisible:false};
  const base={initData:'query_id=1&user=%7B%22id%22%3A1%7D&hash=0',initDataUnsafe:{user:{id:1}},version:'8.0',platform:'ios',BackButton:bb,
    unlockOrientation(){window.__unlocked=(window.__unlocked||0)+1;},isVersionAtLeast:()=>true,colorScheme:'dark',themeParams:{},viewportHeight:844,viewportStableHeight:844,
    CloudStorage:{getItems:(ks,cb)=>setTimeout(()=>cb(null,{}),5),setItem:(k,v,cb)=>cb&&cb(null,true),getItem:(k,cb)=>cb(null,''),removeItem:(k,cb)=>cb&&cb(null,true)}};
  window.Telegram={WebApp:new Proxy(base,{get:(t,k)=>k in t?t[k]:noop})};};
(async()=>{
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{channel:'chrome',headless:true});
  const open=async(query)=>{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(tg);
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.hostname!=='jackson.test')return route.abort();
      if(url.pathname==='/prototypes/shot/index.html')return route.fulfill({contentType:'text/html',body:STUB});
      const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
      return route.fulfill({contentType,body:fs.readFileSync(file)});
    });
    await page.goto('http://jackson.test/index.html'+query);await page.waitForFunction(()=>document.body.dataset.scr==='hub'||document.querySelector('#hub:not([hidden])'),null,{timeout:30000});
    return {page,errors};
  };
  try {
    const {page,errors}=await open('?stage=1');
    await page.waitForSelector('#home2 [data-act="football"]',{timeout:15000});
    // в коллекции — один вратарь и двое полевых (проверочные карточки; монеты и награды не трогаются)
    const picked=await page.evaluate(()=>{Store.d.sound=false;const all=Cards.all();const gk=all.find(c=>c.pos==='ВРТ'&&!c.sbcOnly),of=all.filter(c=>c.pos!=='ВРТ'&&!c.sbcOnly).slice(0,2);Cards.add([gk.key,...of.map(c=>c.key)]);return [gk.name,of[0].name];});
    await page.evaluate(()=>document.querySelector('#home2 [data-act="football"]').click()); // приветствие новичка не мешает
    await page.waitForFunction(()=>document.body.dataset.scr==='fbpick');
    assert.equal(await page.$$eval('#fbp .fbp-slot .cc',a=>a.length),3,'состав собран сам: двое полевых и вратарь');
    await page.evaluate(()=>document.querySelector('[data-act="football-go"]').click());
    await page.waitForFunction(()=>document.body.dataset.scr==='football');
    const src=await page.getAttribute('#football-frame','src');
    assert.match(src,/^prototypes\/shot\/index\.html\?mode=match&embed=1&snd=0/,src);
    const q=new URLSearchParams(src.split('?')[1]);assert.ok(q.get('p0')&&q.get('p1')&&q.get('p2'),'в игру ушли три карточки');
    assert.equal(q.get('p2').split('|').length,8);
    assert.equal(await page.evaluate(()=>window.__unlocked||0)>0,true,'ориентация не закреплена');
    assert.equal(await page.evaluate(()=>Telegram.WebApp.BackButton.shown),true);
    await page.waitForTimeout(300);
    await page.evaluate(()=>Telegram.WebApp.BackButton.h()); // «Назад» → игра → «выйти»
    await page.waitForFunction(()=>document.body.dataset.scr==='hub');
    assert.equal(await page.evaluate(()=>window.__backs),1,'«Назад» передан игре');
    assert.equal(await page.getAttribute('#football-frame','src'),null,'фрейм выгружен');
    assert.deepEqual(errors,[]);await page.close();
    const prod=await open('');await prod.page.waitForTimeout(500);
    await prod.page.waitForSelector('#home2',{timeout:15000});
    assert.equal(await prod.page.$('#home2 [data-act="football"]'),null,'на основном сайте кнопки нет');
    await prod.page.close();
    console.log('Football in hub: stage-only button, lineup 2+1 from own cards, framed match, Telegram Back → game, exit unloads frame');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
