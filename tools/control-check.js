// Проверка управляемости (этап 1): старт из покоя в 8 сторон, прямой бег, повороты 45–180 в обе стороны,
// остановка, «дрожащий» джойстик, приём → сразу движение / пас / удар, смена ввода посреди разворота.
// Матч 11×11, соперники отставлены (__park), виртуальные часы. Выход: сводка по сценарию + ctl_out.json.
const fs=require('fs'),path=require('path');const {chromium}=require(process.env.PW||'playwright');
const ROOT=process.env.ROOT||'/home/user/Games',SEED=+(process.argv[2]||5),FPS=+(process.env.FPS||30),TAG=process.env.TAG||'cur';
const F433=[['ST',50,16],['LW',16,22],['RW',84,22],['CM',24,50],['CM',76,50],['CM',50,54],['LB',12,69],['RB',88,69],['CB',36,73],['CB',64,73],['GK',50,93]];
const q=F433.map((s,i)=>`&p${i}=`+encodeURIComponent(['Игрок'+i,80,80,80,80,80,80,80,...s].join('|'))).join('');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await b.newPage({viewport:{width:844,height:390}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.addInitScript(([seed,fps])=>{let s=seed;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};let t=1000;const raf=window.requestAnimationFrame.bind(window);performance.now=()=>t;window.__f=0;window.requestAnimationFrame=(cb)=>raf(()=>{t+=1000/fps;window.__f++;cb(t);});try{localStorage.setItem('shot.match.hint1','1')}catch(e){}},[SEED,FPS]);
await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='jackson.test')return r.abort();const f=path.join(ROOT,decodeURIComponent(u.pathname));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
 return r.fulfill({contentType:{'.js':'text/javascript','.html':'text/html','.webp':'image/webp','.glb':'model/gltf-binary'}[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});});
await page.goto(`http://jackson.test/prototypes/shot/index.html?mode=match&n=11&trace=1&q=low&nr=1&mt=1800${q}`);
await page.waitForFunction(()=>window.ready,null,{timeout:200000});
const K=FPS/30;const F=async(n)=>{n=Math.round(n*K);const f0=await page.evaluate(()=>window.__f);await page.waitForFunction((x)=>window.__f>=x,f0+n,{timeout:300000,polling:20});};
const btn=async(sel)=>await page.$eval(sel,e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];});
const tap=async(sel,hold=3)=>{const bb=await btn(sel);await page.mouse.move(bb[0],bb[1]);await page.mouse.down();await F(hold);await page.mouse.up();};
const joy=(x,z)=>page.evaluate(([x,z])=>window.__joyTo(x,z),[x,z]);const joy0=()=>page.evaluate(()=>window.__joy(0,0));
// один кадр: время, позиция и скорость «меня», курс корпуса, мяч, владелец, клип
const fr=()=>page.evaluate(()=>{const s=window.__state(),d=window.__dbgMe();return {t:s.t,x:s.me[1],z:s.me[2],vx:d.vx,vz:d.vz,yaw:d.yaw,bx:s.ball[0],bz:s.ball[1],bs:s.bs,ow:s.owner,mv:d.mv,src:d.src,nick:s.me[0]};});
const rec=async(n)=>{const r=[];for(let i=0;i<n;i++){await F(1);r.push(await fr());}return r;};
const give=async(x,z,fx,fz)=>{await joy0();await page.evaluate(()=>window.__sprint(false));await page.evaluate(()=>window.__park());
 await page.evaluate(([x,z,fx,fz])=>{window.__give(x,z);},[x,z,fx,fz]);
 // повернуть корпус к fx,fz стоя: короткий толчок джойстиком и отпустить
 await joy(fx,fz);await F(8);await joy0();await F(25);await page.evaluate(()=>window.__park());};
const ang=(x,z)=>Math.atan2(x,z);const dA=(a,b)=>{let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};const deg=(r)=>Math.round(r*180/Math.PI);
const sp=(f)=>Math.hypot(f.vx,f.vz);const sep=(f)=>Math.hypot(f.bx-f.x,f.bz-f.z);
const kept=(r)=>r.every(f=>f.ow==='me');const maxSep=(r)=>+Math.max(...r.map(sep)).toFixed(2);
// метрики по отрезку при постоянном вводе (fx,fz)
function seg(r,fx,fz){const a=ang(fx,fz),t0=r[0].t,vEnd=Math.max(0.8,sp(r[r.length-1]));let tGo=null,tAl=null,back=0,maxLat=0;const x0=r[0].x,z0=r[0].z,ux=fx/Math.hypot(fx,fz),uz=fz/Math.hypot(fx,fz);
 for(const f of r){const v=sp(f);if(tGo===null&&v>=0.6*vEnd)tGo=+(f.t-t0).toFixed(2);if(tAl===null&&v>=0.5*vEnd&&Math.abs(dA(ang(f.vx,f.vz),a))<0.35)tAl=+(f.t-t0).toFixed(2);
  const along=(f.x-x0)*ux+(f.z-z0)*uz,lat=(f.x-x0)*uz-(f.z-z0)*ux;back=Math.min(back,along);maxLat=Math.max(maxLat,Math.abs(lat));}
 const last=r[r.length-1],own=r.filter(f=>f.ow==='me'),alien=own.filter(f=>f.src&&f.src!=='joy');return {alienSrc:alien.length?[...new Set(alien.map(f=>f.src))].join(',')+':'+alien.length:'',tGo,tAl,back:+back.toFixed(2),lat:+maxLat.toFixed(2),errEnd:deg(Math.abs(dA(ang(last.vx,last.vz),a))),spEnd:+sp(last).toFixed(1),kept:kept(r),sep:maxSep(r)};}
// «топтание»/«кружение»: смены знака угловой скорости корпуса и падения скорости при постоянном вводе
function wobble(r){let flips=0,pr=0,dips=0,ysum=0;for(let i=1;i<r.length;i++){const w=dA(r[i].yaw,r[i-1].yaw);ysum+=Math.abs(w);if(Math.abs(w)>0.02){if(pr&&Math.sign(w)!==Math.sign(pr))flips++;pr=w;}if(sp(r[i])<sp(r[i-1])-0.6)dips++;}return {yawFlips:flips,yawTravel:deg(ysum),speedDips:dips};}
const OUT={},log=(k,v)=>{OUT[k]=v;console.log(k.padEnd(18),JSON.stringify(v));};
await F(60);
if(!process.env.LATE){
// 1) старт из покоя: корпус смотрит на -z (вперёд), ввод в 8 сторон
for(const dg of [0,45,90,135,180,-135,-90,-45]){const a=dg*Math.PI/180,fx=Math.sin(a)*-1,fz=-Math.cos(a);
 await give(0,30,0,-1);await joy(fx,fz);const r=await rec(36);log('start'+dg,{...seg(r,fx,fz),...wobble(r.slice(12))});}
await joy0();
// 1b) старт из покоя половиной хода (обычный палец на телефоне ~30–40 px из 62)
for(const dg of [0,90,180,-90]){const a=dg*Math.PI/180,m=0.5,fx=-Math.sin(a)*m,fz=-Math.cos(a)*m;
 await give(0,30,0,-1);await joy(fx,fz);const r=await rec(36);log('half-start'+dg,{...seg(r,fx,fz),...wobble(r.slice(12))});}
for(const dg of [45,90,135,180]){const a=dg*Math.PI/180,m=0.5,fx=-Math.sin(a)*m,fz=-Math.cos(a)*m;
 await give(0,45,0,-1);await joy(0,-m);await rec(36);await joy(fx,fz);const r=await rec(45);log('half-turn'+dg,{...seg(r,fx,fz),...wobble(r.slice(25))});}
// 2) прямой бег 2,5 с, обычный и рывок
for(const spr of [false,true]){await give(-20,40,0,-1);await page.evaluate((s)=>window.__sprint(s),spr);await joy(0,-1);const r=await rec(75);log('straight'+(spr?'S':''),{...seg(r.slice(20),0,-1),...wobble(r.slice(20))});await page.evaluate(()=>window.__sprint(false));}
// 3) повороты на бегу: 1,2 с вперёд, затем ввод под углом; влево и вправо, обычный и рывок
for(const spr of [false,true])for(const dg of [45,90,135,180]) for(const sgn of [1,-1]){if(dg===180&&sgn<0)continue;
 const a=sgn*dg*Math.PI/180,fx=-Math.sin(a),fz=-Math.cos(a);await give(0,45,0,-1);await page.evaluate((s)=>window.__sprint(s),spr);await joy(0,-1);await rec(36);
 await joy(fx,fz);const r=await rec(45);await page.evaluate(()=>window.__sprint(false));log(`turn${spr?'S':''}${sgn>0?'L':'R'}${dg}`,{...seg(r,fx,fz),...wobble(r.slice(25))});}
// 4) остановка: бег 1,2 с, отпустить
for(const spr of [false,true]){await give(0,45,0,-1);await page.evaluate((s)=>window.__sprint(s),spr);await joy(0,-1);await rec(36);await joy0();await page.evaluate(()=>window.__sprint(false));
 const r=await rec(45);let tStop=null;for(const f of r)if(tStop===null&&sp(f)<0.3)tStop=+(f.t-r[0].t).toFixed(2);const w=wobble(r.slice(15));
 log('stop'+(spr?'S':''),{tStop,dist:+Math.hypot(r[44].x-r[0].x,r[44].z-r[0].z).toFixed(2),kept:kept(r),sep:maxSep(r),...w,spEnd:+sp(r[44]).toFixed(2)});}
// 5) «дрожащий» палец: ввод вперёд ±12° каждые 4 кадра
{await give(0,45,0,-1);await joy(0,-1);await rec(20);const r=[];for(let i=0;i<15;i++){const a=(i%2?1:-1)*0.21;await joy(-Math.sin(a),-Math.cos(a));r.push(...await rec(4));}log('jitter',{...seg(r,0,-1),...wobble(r)});}
// 6) медленный ход (половина джойстика) и поворот 90
{await give(0,45,0,-1);await page.evaluate(()=>window.__joy(0,0));const m=0.45;await joy(0,-m);await rec(36);await joy(-m,0);const r=await rec(45);log('slowTurn90',{...seg(r,-1,0),...wobble(r.slice(25))});}
// 7) смена ввода посреди разворота (анимация не должна держать): 180 → через 6 кадров 90
{await give(0,45,0,-1);await joy(0,-1);await rec(36);await joy(0,1);await rec(6);await joy(-1,0);const r=await rec(40);log('midTurnChange',{...seg(r,-1,0),...wobble(r.slice(20))});}
}
// 7b) с живыми соперниками: веду мяч 3 с вперёд, соперники играют (кто задаёт движение, потери)
for(const z0 of [60,40]){await give(0,z0,0,-1);await page.evaluate(([z])=>{window.__pos('o1',-3,z-9);window.__pos('o2',4,z-14);window.__pos('o3',0,z-22);window.__unpark();},[z0]);await joy(0,-1);const r=await rec(90);const lost=r.findIndex(f=>f.ow!=='me');if(lost===0){log('live'+z0,{error:'потерян сразу',ow:r[0].ow,bs:r[0].bs});continue;}
 log('live'+z0,{lostAt:lost<0?null:+(r[lost].t-r[0].t).toFixed(2),...seg(r.slice(0,lost<0?90:lost),0,-1)});}
// 8) приём паса и сразу действие: пас партнёру (переключение на получателя), затем a) джойстик вбок b) пас c) удар
const passTo=async()=>{await give(0,40,0,-1);const s=await page.evaluate(()=>window.__state());const me=[s.me[1],s.me[2]];
 const m=s.mates.map(t=>({id:t[0],x:t[1],z:t[2],d:Math.hypot(t[1]-me[0],t[2]-me[1])})).filter(t=>t.d>9&&t.d<22).sort((a,b)=>a.d-b.d)[0];if(!m)return null;
 await joy((m.x-me[0])/m.d,(m.z-me[1])/m.d);await F(2);await tap('#b-pass',3);await joy0();return m;};
for(const act of ['move','pass','shoot']){const m=await passTo();if(!m){log('recv-'+act,{error:'нет партнёра'});continue;}
 let cap=null,nick0=(await fr()).nick,seenFree=false;for(let i=0;i<90;i++){await F(1);const f=await fr();if(f.bs==='free')seenFree=true;if(seenFree&&f.ow==='me'&&f.bs!=='free'&&f.nick!==nick0){cap=f;break;}}
 if(!cap){log('recv-'+act,{error:'не принял за 3 с'});continue;}
 if(act==='move'){await joy(1,0);const r=await rec(30);log('recv-move',{...seg(r,1,0),...wobble(r.slice(10))});await joy0();}
 else{const t0=cap.t;await tap(act==='pass'?'#b-pass':'#b-shot',act==='pass'?3:8);let tOut=null;for(let i=0;i<30;i++){const f=await fr();if(f.ow!=='me'||f.bs==='free'){tOut=+(f.t-t0).toFixed(2);break;}await F(1);}log('recv-'+act,{tOut});}}
// 9) для сравнения: пас и удар на ходу без приёма; пас нажат заранее (за ~0,3 с до мяча)
for(const act of ['pass','shoot']){await give(0,50,0,-1);await joy(0,-0.6);await rec(20);const t0=(await fr()).t;await tap(act==='pass'?'#b-pass':'#b-shot',act==='pass'?3:8);let tOut=null;for(let i=0;i<30;i++){const f=await fr();if(f.ow!=='me'||f.bs==='free'){tOut=+(f.t-t0).toFixed(2);break;}await F(1);}await joy0();log('base-'+act,{tOut});}
{const m=await passTo();if(m){let nick0=(await fr()).nick,done=false;for(let i=0;i<90&&!done;i++){await F(1);const f=await fr();if(f.bs==='free'&&f.nick!==nick0&&Math.hypot(f.bx-f.x,f.bz-f.z)<2.2){const t0=f.t;await tap('#b-pass',2);
 let cap=null,out=null;for(let k=0;k<40;k++){await F(1);const g=await fr();if(cap===null&&g.ow==='me'&&g.bs!=='free')cap=+(g.t-t0).toFixed(2);if(cap!==null&&(g.ow!=='me'||g.bs==='free')){out=+(g.t-t0).toFixed(2);break;}}log('buffer-pass',{pressedAtDist:+Math.hypot(f.bx-f.x,f.bz-f.z).toFixed(2),cap,out});done=true;}}if(!done)log('buffer-pass',{error:'мяч не подошёл'});}}
fs.writeFileSync(`ctl_${TAG}.json`,JSON.stringify(OUT));if(errs.length)console.log('ERR',errs.slice(0,3));await b.close();})();
