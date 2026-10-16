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
  outlineAll(root,w=.05){
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
const person=(c=C.blue,skin=C.skin)=>k.group(
  at(k.ball(.42,skin),0,.55,0),
  (()=>{const b=k.ball(.62,c);b.scale.set(1,.7,.75);return at(b,0,-.25,0);})(),
);
const coin=(r,ch,c=C.gold)=>k.group(at(k.cyl(r,r,.18,c),0,0,0,Math.PI/2),at(k.cyl(r*.78,r*.78,.2,C.org),0,0,.0,Math.PI/2),at(k.text(ch,r*1.05,.12,C.wht),0,0,.12));
const X=(s,c)=>{const a=k.box(s,s*.28,s*.28,s*.12,c),b=k.box(s,s*.28,s*.28,s*.12,c);a.rotation.z=Math.PI/4;b.rotation.z=-Math.PI/4;return k.group(a,b);};

export const MODELS={
  ttt(){const g=k.group(at(k.box(2.2,2.2,.3,.22,C.pur),0,0,-.1));
    const lay=[['x','o','x'],[' ','x','o'],['o',' ','x']];
    lay.forEach((r,i)=>r.forEach((v,j)=>{const x=(j-1)*.68,y=(1-i)*.68;g.add(at(k.box(.6,.6,.16,.1,'#c9b8ff'),x,y,.08));
      if(v==='x')g.add(at(X(.5,C.red),x,y,.24));if(v==='o')g.add(at(k.torus(.17,.075,C.blue),x,y,.24));}));
    g.rotation.x=-.25;return g;},
  guess(){const p=person(C.blue);const c=coin(.42,'?');at(c,.62,.72,.35);return k.group(p,c);},
  transfer(){
    const shirt=k.shape([[-.55,.6],[-.2,.72],[0,.6],[.2,.72],[.55,.6],[.85,.25],[.6,.05],[.45,.2],[.45,-.7],[-.45,-.7],[-.45,.2],[-.6,.05],[-.85,.25]],.22,C.red);
    const num=at(k.text('10',.36,.08,C.wht),0,-.12,.18);
    const sh=at(k.group(shirt,num),-.55,.25,0);
    const arc=at(k.torus(.55,.1,C.yel,Math.PI*.8),.35,.25,.3,0,0,Math.PI*.1);
    const tip=at(k.cone(.2,.32,C.yel),.95,-.05,.3,0,0,Math.PI);
    const pl=person(C.grn);pl.scale.setScalar(.62);at(pl,.75,-.35,.1);
    return k.group(sh,arc,tip,pl);},
  'ng-wordle'(){const g=k.group();const L=[['Г',C.grn],['О',C.yel],['Л',C.gry]];
    L.forEach(([ch,c],i)=>{const x=(i-1)*.78;g.add(at(k.box(.68,.68,.3,.12,c),x,.42,0));g.add(at(k.text(ch,.44,.16,C.wht),x,.42,.2));
      g.add(at(k.box(.68,.68,.22,.12,C.dk),x,-.4,-.04));});
    g.rotation.x=-.15;return g;},
  shop(){const g=k.group(at(k.box(1.8,1.2,1,.1,C.wht),0,-.35,0),at(k.box(.5,.75,.1,.06,C.sky),0,-.58,.5),at(k.box(.45,.35,.08,.05,C.sky),-.55,-.3,.5),at(k.box(.45,.35,.08,.05,C.sky),.55,-.3,.5));
    for(let i=0;i<6;i++){const x=-.85+i*.34,c=i%2?C.wht:C.red;g.add(at(k.box(.34,.5,.12,.04,c),x,.38,.42,.55,0,0));const s=k.cyl(.17,.17,.12,c,24);g.add(at(s,x,.16,.56,Math.PI/2+.55,0,0));}
    g.add(at(k.box(2,.24,.5,.08,C.yel),0,.68,0));g.add(at(k.text('$',.3,.08,C.org),0,.68,.27));return g;},
  chest(){const g=k.group(at(k.box(1.9,.95,1.1,.1,C.brn),0,-.35,0));
    const lid=k.cyl(.55,.55,1.9,C.brn,40);lid.rotation.z=Math.PI/2;g.add(at(lid,0,.12,0));
    for(const x of[-.62,.62]){g.add(at(k.box(.24,1,1.18,.05,C.gold),x,-.35,0));const b=k.cyl(.6,.6,.24,C.gold,40);b.rotation.z=Math.PI/2;g.add(at(b,x,.12,0));}
    g.add(at(k.box(.42,.5,.14,.08,C.gold),0,-.1,.58));g.add(at(k.ball(.08,C.navy),0,-.12,.66));
    g.rotation.y=-.15;return g;},
};
