// 2D-иконки в стиле Brawl Stars: рисунки из js/icons.js / extra2.js / extra.js,
// у каждой детали своя тёмная обводка, жёсткая тень снизу-справа и блик сверху-слева, общая толстая обводка.
// Запуск: OUTD=out node render2d.js ttt squad shop → PNG 256×256
const fs=require('fs');const {chromium}=require(process.env.PW||'/opt/node-tools/node_modules/playwright');
const KEYS=process.argv.slice(2);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage({viewport:{width:400,height:400}});
const src=fs.readFileSync(__dirname+'/../../js/icons.js','utf8').replace("const get = (id) => art(id) || MAP[id] || '';","const get = (id) => MAP[id] || '';");
await p.setContent(`<html><body style="margin:0;background:transparent"><div id=box></div><script>const $$=(s,r=document)=>[...r.querySelectorAll(s)];${src.replace(/const Ui = [\s\S]*$/,'')};window.Icons=Icons;</script></body></html>`);
for(const e of ['extra.js','extra2.js']) if(fs.existsSync(__dirname+'/'+e)) await p.addScriptTag({content:fs.readFileSync(__dirname+'/'+e,'utf8')});
const OUTD=process.env.OUTD||'gen';fs.mkdirSync(OUTD,{recursive:true});
for(const k of KEYS){
  const ok=await p.evaluate((k)=>{
    let s=(window.EXTRA2&&EXTRA2[k])||(window.EXTRA&&EXTRA[k])||Icons.get(k); if(!s) return false;
    // яркая палитра Brawl Stars
    const pal=[[/#fff\b|#ffffff/gi,'#ffffff'],[/#ffcf3a/gi,'#ffc21a'],[/#1b1340/gi,'#1c2140'],[/rgba\(255,255,255,\.32\)/g,'#a9b8d8'],
      [/#34c46a/gi,'#3fd14a'],[/#e2384d|#ff5a6a|#e3243f|#ff5a3c/gi,'#ff3b3b'],[/#4fa3ff/gi,'#2f8cff']];
    for(const [a,b] of pal) s=s.replace(a,b);
    const defs=`<defs>
     <filter id="cel" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feOffset in="SourceAlpha" dx="-2.2" dy="-2.6" result="up"/>
      <feComposite in="SourceAlpha" in2="up" operator="out" result="rimS"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values=".6 0 0 0 0  0 .55 0 0 0  0 0 .7 0 .04  0 0 0 1 0" result="dk"/>
      <feComposite in="dk" in2="rimS" operator="in" result="shade"/>
      <feOffset in="SourceAlpha" dx="1.1" dy="1.3" result="dn"/>
      <feComposite in="SourceAlpha" in2="dn" operator="out" result="rimL"/>
      <feFlood flood-color="#fff" flood-opacity=".6"/><feComposite in2="rimL" operator="in" result="light"/>
      <feMerge result="body"><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="light"/></feMerge>
      <feComposite in="body" in2="SourceAlpha" operator="in" result="bodyIn"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.05" result="d"/>
      <feFlood flood-color="#0b0f1c"/><feComposite in2="d" operator="in" result="ring"/>
      <feMerge><feMergeNode in="ring"/><feMergeNode in="bodyIn"/></feMerge></filter>
     <filter id="ol" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.9" result="d"/>
      <feFlood flood-color="#0b0f1c"/><feComposite in2="d" operator="in" result="o"/>
      <feOffset in="o" dy="2" result="od0"/><feColorMatrix in="od0" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .45 0" result="od"/>
      <feMerge><feMergeNode in="od"/><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    s=s.replace(/<svg viewBox="0 0 56 56"[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 66 68" width="256" height="264">${defs}<g filter="url(#ol)">`).replace(/<\/svg>$/,'</g></svg>');
    s=s.replace(/class="ic-t"/g,'class="ic-t" font-family="Rubik, Arial Black, sans-serif" font-weight="900"');
    const box=document.getElementById('box');box.innerHTML=s;
    // фильтр на каждую деталь отдельно (кроме полупрозрачных подложек)
    box.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line,text').forEach(e=>{if(e.closest('defs'))return;if(+(e.getAttribute('opacity')||1)<1)return;e.setAttribute('filter','url(#cel)');});
    return true;},k);
  if(!ok){console.log('miss',k);continue;}
  await p.locator('#box svg').screenshot({path:`${OUTD}/${k}.png`,omitBackground:true});
}
await b.close();})();
