const fs=require('fs');const {chromium}=require(process.env.PW||'/opt/node-tools/node_modules/playwright');
const KEYS=process.argv.slice(2);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const p=await b.newPage({viewport:{width:400,height:400}});
const src=fs.readFileSync('/home/user/Games/js/icons.js','utf8').replace("const get = (id) => art(id) || MAP[id] || '';","const get = (id) => MAP[id] || '';");
await p.setContent(`<html><body style="margin:0;background:transparent"><div id=box></div><script>const $$=(s,r=document)=>[...r.querySelectorAll(s)];${src.replace(/const Ui = [\s\S]*$/,'')};window.Icons=Icons;</script></body></html>`);
for(const e of ['extra.js','extra2.js']) if(fs.existsSync(e)) await p.addScriptTag({content:fs.readFileSync(e,'utf8')});
const OUTD=process.env.OUTD||'gen';fs.mkdirSync(OUTD,{recursive:true});
for(const k of KEYS){
  const ok=await p.evaluate((k)=>{
    let s=(window.EXTRA2&&EXTRA2[k])||(window.EXTRA&&EXTRA[k])||Icons.get(k); if(!s) return false;
    // перекраска под новый стиль
    s=s.replace(/fill="#fff"/g,'fill="url(#gw)"').replace(/fill="#ffcf3a"/g,'fill="url(#gg)"').replace(/fill="rgba\(255,255,255,\.32\)"/g,'fill="url(#gs)"')
       .replace(/fill="#1b1340"/g,'fill="#141a2b"').replace(/stroke="#1b1340"/g,'stroke="#141a2b"')
       .replace(/stroke="#fff"/g,'stroke="#ece7dd"').replace(/stroke="#ffcf3a"/g,'stroke="#f0c445"').replace(/stroke="rgba\(255,255,255,\.32\)"/g,'stroke="#8d97a8"')
       .replace(/fill="#34c46a"/g,'fill="url(#ggr)"').replace(/fill="#4fa3ff"/g,'fill="url(#gbl)"').replace(/stroke="#34c46a"/g,'stroke="#3fa84a"').replace(/fill="#e2384d"|fill="#ff5a6a"|fill="#e3243f"|fill="#ff5a3c"/g,'fill="url(#grd)"');
    const defs=`<defs>
     <linearGradient id="gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f2"/><stop offset=".5" stop-color="#ebe5da"/><stop offset=".5" stop-color="#d6cfc3"/><stop offset="1" stop-color="#bdb5a8"/></linearGradient>
     <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe17a"/><stop offset=".5" stop-color="#f2c143"/><stop offset=".5" stop-color="#dba633"/><stop offset="1" stop-color="#b98422"/></linearGradient>
     <linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8c1d0"/><stop offset=".5" stop-color="#9aa4b6"/><stop offset=".5" stop-color="#848ea1"/><stop offset="1" stop-color="#697387"/></linearGradient>
     <linearGradient id="ggr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fcf68"/><stop offset=".5" stop-color="#43b04d"/><stop offset=".5" stop-color="#379a40"/><stop offset="1" stop-color="#287a31"/></linearGradient>
     <linearGradient id="gbl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#72adf2"/><stop offset=".5" stop-color="#4f95e8"/><stop offset=".5" stop-color="#4180d0"/><stop offset="1" stop-color="#2f62a8"/></linearGradient>
     <linearGradient id="grd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4675a"/><stop offset=".5" stop-color="#e5483a"/><stop offset=".5" stop-color="#cc3c30"/><stop offset="1" stop-color="#a42d24"/></linearGradient>
     <filter id="ol" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation=".75" result="bump"/>
      <feSpecularLighting in="bump" surfaceScale="1.9" specularConstant=".6" specularExponent="22" lighting-color="#fff" result="spec"><feDistantLight azimuth="225" elevation="38"/></feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feDiffuseLighting in="bump" surfaceScale="1.6" diffuseConstant="1.04" lighting-color="#fff" result="dif"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="dif" operator="arithmetic" k1="1.12" k2="0" k3="0" k4="0" result="lit"/>
      <feComposite in="lit" in2="SourceAlpha" operator="in" result="litIn"/>
      <feComposite in="specIn" in2="litIn" operator="arithmetic" k2=".55" k3="1" result="shiny"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.9" result="d"/>
      <feFlood flood-color="#0c111d"/><feComposite in2="d" operator="in" result="o"/>
      <feGaussianBlur in="d" stdDeviation="1.4" result="b"/><feOffset in="b" dy="2" result="bo"/>
      <feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="bo" operator="in" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="o"/><feMergeNode in="shiny"/></feMerge></filter></defs>`;
    s=s.replace(/<svg viewBox="0 0 56 56"[^>]*>/,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 64 64" width="256" height="256">${defs}<g filter="url(#ol)" style="paint-order:stroke">`).replace(/<\/svg>$/,'</g></svg>');
    s=s.replace(/class="ic-t"/g,'class="ic-t" font-family="Rubik, Arial Black, sans-serif" font-weight="900"');
    document.getElementById('box').innerHTML=s; return true;},k);
  if(!ok){console.log('miss',k);continue;}
  await p.locator('#box svg').screenshot({path:`${OUTD}/${k}.png`,omitBackground:true});
}
await b.close();})();
