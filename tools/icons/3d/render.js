// 3D-иконки в стиле Brawl Stars: модели из models.js, свет/блики three.js, толстая тёмная обводка.
// Запуск: OUTD=out node render.js ttt guess ...   (нужен пакет three: THREE_DIR=.../node_modules/three)
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PW||'/opt/node-tools/node_modules/playwright');
const THREE_DIR=process.env.THREE_DIR||path.join(__dirname,'node_modules/three');
const FONT=process.env.FONT||'/usr/share/fonts/opentype/inter/Inter-Black.otf';
const KEYS=process.argv.slice(2),OUTD=process.env.OUTD||'out',SIZE=+process.env.SIZE||256;
(async()=>{
  fs.mkdirSync(OUTD,{recursive:true});
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:SIZE,height:SIZE}});
  p.on('console',m=>{if(m.type()==='error')console.log('page:',m.text())});
  await p.route('http://icons.local/**',r=>{
    const u=new URL(r.request().url()).pathname;let f;
    if(u.startsWith('/three/'))f=path.join(THREE_DIR,u.slice(7));else if(u==='/font')f=FONT;else f=path.join(__dirname,u.slice(1));
    r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});
  });
  await p.goto('http://icons.local/scene.html?size='+SIZE);
  await p.waitForFunction('window.ready===true',null,{timeout:60000});
  for(const k of KEYS){
    const url=await p.evaluate(k=>window.draw(k),k);
    if(!url){console.log('miss',k);continue;}
    fs.writeFileSync(`${OUTD}/${k}.png`,Buffer.from(url.split(',')[1],'base64'));
  }
  await b.close();
})();
