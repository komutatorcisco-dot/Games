// Меню «Старики Джексоны» (prototypes/shot/menu.html): имя из Telegram или «Гость», кнопка «Назад» Telegram только
// на вложенных экранах, настройки сохраняются в тех же ключах, что читает игра, «Играть» открывает матч.
// Тестовая версия (jackson-games-preview.pages.dev): корень сразу открывает меню и передаёт данные запуска Telegram (#…),
// ?hub=1 — прежний набор игр; на любом другом адресе корень не меняется.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const tg=()=>{const bb={shown:false,h:null,show(){this.shown=true;},hide(){this.shown=false;},onClick(f){this.h=f;}};
  window.Telegram={WebApp:{initData:'query_id=1',initDataUnsafe:{user:{id:1,first_name:'Иван'}},BackButton:bb,ready(){},expand(){},disableVerticalSwipes(){},setHeaderColor(){},HapticFeedback:{impactOccurred(){}}}};};
(async()=>{
  const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{channel:'chrome',headless:true});
  const serve=(page,hosts)=>page.route('**/*',async route=>{
    const url=new URL(route.request().url());if(!hosts.includes(url.hostname))return route.abort();
    const file=path.join(process.cwd(),url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const contentType={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType,body:fs.readFileSync(file)});
  });
  try {
    // браузер: гость
    let page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await serve(page,['jackson.test']);await page.goto('http://jackson.test/prototypes/shot/menu.html');
    assert.equal(await page.textContent('#nick'),'Гость');
    await page.click('#bSets');await page.click('#sSound');await page.click('#sCam');
    assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('sj.sound'),localStorage.getItem('shot.match.cam')]),['0','behind']);
    await page.click('#scrSets [data-back]');await page.click('#bPlay');await page.waitForURL(/index\.html\?mode=match&from=menu/);
    await page.close();
    // Telegram: имя, «Назад» только на вложенных экранах
    page=await browser.newPage({viewport:{width:844,height:390}});page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(tg);await serve(page,['jackson.test']);await page.goto('http://jackson.test/prototypes/shot/menu.html');
    assert.equal(await page.textContent('#nick'),'Иван');
    assert.equal(await page.evaluate(()=>Telegram.WebApp.BackButton.shown),false,'на главном экране — закрыть, не «Назад»');
    await page.click('#bTrain');assert.equal(await page.evaluate(()=>Telegram.WebApp.BackButton.shown),true);
    await page.evaluate(()=>Telegram.WebApp.BackButton.h());
    assert.equal(await page.evaluate(()=>document.querySelector('#scrMain').classList.contains('on')),true);
    assert.equal(await page.evaluate(()=>Telegram.WebApp.BackButton.shown),false);
    await page.close();
    // тестовая версия: корень → меню (с данными запуска), ?hub=1 — прежний набор игр
    page=await browser.newPage();await serve(page,['jackson-games-preview.pages.dev']);
    await page.goto('https://jackson-games-preview.pages.dev/#tgWebAppData=abc&tgWebAppVersion=7.0');await page.waitForURL(/menu\.html#tgWebAppData=abc/);
    await page.goto('https://jackson-games-preview.pages.dev/index.html?hub=1');await page.waitForTimeout(500);assert.match(page.url(),/index\.html\?hub=1$/);
    await page.close();
    page=await browser.newPage();await serve(page,['jackson.test']);await page.goto('http://jackson.test/index.html');await page.waitForTimeout(500);
    assert.equal(new URL(page.url()).pathname,'/index.html','на основном сайте корень не меняется');await page.close();
    assert.deepEqual(errors,[]);
    console.log('Football menu: guest/Telegram name, nested Back, saved settings, Play → match; preview root → menu, ?hub=1 → hub');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
