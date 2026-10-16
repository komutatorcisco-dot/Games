// Модели 3D-иконок. Каждая — функция (kit) => THREE.Group. Единицы: иконка ~ 2×2, смотрит на +Z.
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
let T,FONT;
// палитра Brawl Stars: сочные цвета
export const C={yel:'#ffc21a',org:'#ff8a1a',red:'#ff3b3b',blue:'#2f8cff',sky:'#5cc8ff',grn:'#3fd14a',pur:'#9b4dff',
  wht:'#f4f1ea',gry:'#8a93a6',dk:'#2a3150',navy:'#1b2440',brn:'#a8642a',skin:'#ffcf9e',gold:'#ffcc33'};
const mats={};
const mat=(c,o={})=>{const k=c+JSON.stringify(o);return mats[k]||(mats[k]=new T.MeshPhysicalMaterial({color:c,roughness:.45,metalness:0,clearcoat:.6,clearcoatRoughness:.2,envMapIntensity:.35,...o}));};
const mesh=(geo,c,o)=>new T.Mesh(geo,typeof c==='string'?mat(c,o):c);
const at=(m,x=0,y=0,z=0,rx,ry,rz)=>{m.position.set(x,y,z);if(rx!==undefined)m.rotation.set(rx,ry||0,rz||0);return m;};
export const kit={
  C,
  init(three,font){T=three;FONT=font;},
  group:(...ch)=>{const g=new T.Group();ch.forEach(c=>c&&g.add(c));return g;},
  at,mat,
  box:(w,h,d,r,c,o)=>mesh(new RoundedBoxGeometry(w,h,d,4,Math.min(r,w/2,h/2,d/2)),c,o),
  cyl:(rt,rb,h,c,seg=48,o)=>mesh(new T.CylinderGeometry(rt,rb,h,seg),c,o),
  ball:(r,c,o)=>mesh(new T.SphereGeometry(r,48,32),c,o),
  torus:(R,r,c,arc=Math.PI*2,o)=>mesh(new T.TorusGeometry(R,r,24,64,arc),c,o),
  cone:(r,h,c,seg=40)=>mesh(new T.ConeGeometry(r,h,seg),c),
  // плоская фигура из 2D-контура (массив [x,y]) → объёмная с фаской
  shape(pts,depth,c,bevel=.06){const s=new T.Shape();pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));
    const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:4,curveSegments:24});g.translate(0,0,-depth/2);return mesh(g,c);},
  shapeFrom(build,depth,c,bevel=.06){const s=new T.Shape();build(s);
    const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:4,curveSegments:32});g.translate(0,0,-depth/2);return mesh(g,c);},
  text(str,size,depth,c){const g=new TextGeometry(str,{font:FONT,size,depth,curveSegments:10,bevelEnabled:true,bevelThickness:size*.05,bevelSize:size*.04,bevelSegments:3});
    g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.max.x+b.min.x)/2,-(b.max.y+b.min.y)/2,-depth/2);return mesh(g,c);},
  // тонкая тёмная обводка у каждой детали (как у мультяшных иконок)
  outlineAll(root,w=.12){
    const om=new T.ShaderMaterial({side:T.BackSide,uniforms:{w:{value:w}},
      vertexShader:'uniform float w;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*normal);p.xyz+=n*w;gl_Position=projectionMatrix*p;}',
      fragmentShader:'void main(){gl_FragColor=vec4(.043,.063,.133,1.);}'});
    const list=[];root.traverse(o=>{if(o.isMesh&&!o.userData.noOutline)list.push(o)});
    for(const m of list){let g=m.geometry.clone();g.deleteAttribute('normal');g.deleteAttribute('uv');g=mergeVertices(g,1e-3);g.computeVertexNormals();
      const h=new T.Mesh(g,om);h.userData.noOutline=true;m.add(h);}
  },
};
const k=kit;

// ── детали, которые повторяются ──
const egg=(r,sx,sy,sz,c)=>{const b=k.ball(r,c);b.scale.set(sx,sy,sz);return b;};
// игрок: голова с причёской, плечи в футболке с воротником
const person=(c=C.blue,hair=C.navy)=>k.group(
  at(egg(.62,1,.62,.78,c),0,-.42,0),                       // плечи
  at(k.box(.36,.14,.2,.06,C.wht),0,-.06,.36),              // воротник
  at(k.ball(.4,C.skin),0,.42,0),                           // голова
  at(egg(.42,1.04,.55,1.0,hair),0,.66,-.1),               // волосы
  at(k.ball(.06,C.navy),-.14,.42,.37),at(k.ball(.06,C.navy),.14,.42,.37), // глаза
);
const coin=(r,ch,c=C.gold)=>k.group(
  at(k.cyl(r,r,.22,c),0,0,0,Math.PI/2),
  at(k.cyl(r*.76,r*.76,.24,C.org),0,0,0,Math.PI/2),
  at(k.text(ch,r*1.0,.12,C.wht),0,0,.15));
const X=(s,c)=>{const a=k.box(s,s*.3,s*.3,s*.15,c),b=k.box(s,s*.3,s*.3,s*.15,c);a.rotation.z=Math.PI/4;b.rotation.z=-Math.PI/4;return k.group(a,b);};
const arrow=(R,arc,c)=>{const g=k.group(k.torus(R,.12,c,arc));const t=k.cone(.24,.36,c);
  t.position.set(R*Math.cos(arc),R*Math.sin(arc),0);t.rotation.z=arc;g.add(t);return g;};
const jersey=(c,num,trim=C.wht)=>{const body=k.shape([[-.55,.6],[-.2,.72],[0,.58],[.2,.72],[.55,.6],[.9,.22],[.62,0],[.45,.16],[.45,-.72],[-.45,-.72],[-.45,.16],[-.62,0],[-.9,.22]],.22,c);
  return k.group(body,
    at(k.torus(.2,.05,trim,Math.PI),0,.72,.14,0,0,Math.PI),
    at(k.box(.36,.08,.06,.03,trim),-.72,.1,.12,0,0,-.85),at(k.box(.36,.08,.06,.03,trim),.72,.1,.12,0,0,.85),
    num?at(k.text(num,.4,.1,trim),0,-.15,.17):null);};

export const MODELS={
  ttt(){const g=k.group(at(k.box(2.3,2.3,.34,.26,C.pur),0,0,-.12),at(k.box(2.06,2.06,.1,.16,'#6c2fd1'),0,0,.06));
    const lay=[['x','o','x'],[' ','x','o'],['o',' ','x']];
    lay.forEach((r,i)=>r.forEach((v,j)=>{const x=(j-1)*.66,y=(1-i)*.66;g.add(at(k.box(.58,.58,.14,.12,'#d9ccff'),x,y,.14));
      if(v==='x')g.add(at(X(.5,C.red),x,y,.3));if(v==='o')g.add(at(k.torus(.16,.085,C.blue),x,y,.3));}));
    g.rotation.x=-.3;return g;},
  guess(){const p=person(C.blue);const c=coin(.44,'?');at(c,.66,.78,.42);return k.group(p,c);},
  transfer(){const sh=at(jersey(C.red,'10'),-.62,.1,0);sh.scale.setScalar(.85);
    const ar=at(arrow(.55,Math.PI*.8,C.yel),.25,.55,.3,0,Math.PI,0);
    const pl=person(C.grn);pl.scale.setScalar(.72);at(pl,.95,-.15,.05);
    return k.group(sh,ar,pl);},
  'ng-wordle'(){const g=k.group();const L=[['Г',C.grn],['О',C.yel],['Л',C.gry]];
    L.forEach(([ch,c],i)=>{const x=(i-1)*.8;g.add(at(k.box(.7,.7,.32,.14,c),x,.42,0));g.add(at(k.text(ch,.46,.16,C.wht),x,.42,.22));
      g.add(at(k.box(.7,.7,.2,.14,C.dk),x,-.42,-.05));g.add(at(k.box(.5,.5,.06,.08,'#3a4470'),x,-.42,.06));});
    g.rotation.x=-.2;return g;},
  shop(){const g=k.group(
      at(k.box(1.8,1.15,1,.12,C.wht),0,-.4,0),
      at(k.box(.52,.8,.12,.08,C.sky),0,-.6,.5),at(k.ball(.05,C.navy),.15,-.6,.58),
      at(k.box(.46,.36,.1,.06,C.sky),-.58,-.32,.5),at(k.box(.46,.36,.1,.06,C.sky),.58,-.32,.5),
      at(k.box(1.96,.16,1.1,.06,C.brn),0,-.96,0));
    for(let i=0;i<6;i++){const x=-.85+i*.34,c=i%2?C.wht:C.red;g.add(at(k.box(.34,.5,.12,.04,c),x,.36,.42,.55,0,0));g.add(at(k.cyl(.17,.17,.12,c,24),x,.15,.56,Math.PI/2+.55,0,0));}
    g.add(at(k.box(2.04,.34,.6,.12,C.yel),0,.72,0));g.add(at(k.text('SHOP',.22,.08,C.red),0,.72,.32));return g;},
  chest(){const g=k.group(at(k.box(1.9,.95,1.1,.12,C.brn),0,-.35,0));
    const lid=k.cyl(.55,.55,1.9,'#c27a35',40);g.add(at(lid,0,.1,0,0,0,Math.PI/2));
    for(const x of[-.62,.62]){g.add(at(k.box(.26,1,1.18,.06,C.gold),x,-.35,0));g.add(at(k.cyl(.6,.6,.26,C.gold,40),x,.1,0,0,0,Math.PI/2));
      g.add(at(k.ball(.06,C.org),x,-.65,.6));g.add(at(k.ball(.06,C.org),x,-.1,.6));}
    g.add(at(k.box(.46,.56,.16,.1,C.gold),0,-.12,.6));g.add(at(k.cyl(.07,.07,.1,C.navy,20),0,-.06,.7,Math.PI/2,0,0));g.add(at(k.box(.06,.14,.08,.02,C.navy),0,-.2,.7));
    g.rotation.y=-.18;return g;},
};
