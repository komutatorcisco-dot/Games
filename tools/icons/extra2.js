(() => {
const W='#fff',G='#ffcf3a',D='#1b1340',F='rgba(255,255,255,.32)',GR='#34c46a',RD='#e2384d',BL='#4fa3ff';
const svg=(b)=>`<svg viewBox="0 0 56 56">${b}</svg>`;
const ln=(d,c=W,w=3.2,x='')=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${x}/>`;
const ci=(x,y,r,c=W,e='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${e}/>`;
const rc=(x,y,w,h,r,c=W,e='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${e}/>`;
const tx=(x,y,s,t,c=D)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${s}" fill="${c}" class="ic-t">${t}</text>`;
const pa=(d,c=W,e='')=>`<path d="${d}" fill="${c}" ${e}/>`;
const star=(x,y,r,c=G)=>`<polygon points="${[...Array(10).keys()].map(k=>{const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*.45:r;return (x+Math.cos(a)*rr).toFixed(1)+','+(y+Math.sin(a)*rr).toFixed(1)}).join(' ')}" fill="${c}"/>`;
const ball=(x,y,r,c=W,p=D)=>{const pt=(k,rr)=>{const a=-Math.PI/2+k*2*Math.PI/5;return (x+Math.cos(a)*rr).toFixed(1)+','+(y+Math.sin(a)*rr).toFixed(1)};return ci(x,y,r,c)+`<polygon points="${[0,1,2,3,4].map(k=>pt(k,r*.42)).join(' ')}" fill="${p}"/><path d="${[0,1,2,3,4].map(k=>`M${pt(k,r*.42)} L${pt(k,r*.92)}`).join(' ')}" stroke="${p}" stroke-width="${Math.max(1,r*.12)}" fill="none"/>`;};
const person=(x,y,s=1,c=W)=>`<g transform="translate(${x} ${y}) scale(${s})">${ci(0,-9,7,c)}<path d="M-13 12 C-13 2 -7 -1 0 -1 C7 -1 13 2 13 12 Z" fill="${c}"/></g>`;
const shirt=(x,y,s,c=W)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M-8 -14 L-3 -14 C-2 -11 2 -11 3 -14 L8 -14 L16 -8 L12 -1 L9 -3 L9 14 L-9 14 L-9 -3 L-12 -1 L-16 -8 Z" fill="${c}"/>`;
const card=(x,y,w,h,rot,c=W,inner='')=>`<g transform="rotate(${rot} ${x+w/2} ${y+h/2})">${rc(x,y,w,h,4,c)}${inner}</g>`;
const cup=(c=G)=>pa('M16 8 H40 V18 C40 27 34 32 28 32 C22 32 16 27 16 18 Z',c)+ln('M16 11 H11 C11 19 14 22 18 22 M40 11 H45 C45 19 42 22 38 22',c,3.2)+rc(25,31,6,7,1,c)+rc(18,37,20,5,2,W)+rc(15,42,26,6,2,D);
const shield=(c=G)=>pa('M28 6 L46 12 C46 30 40 42 28 50 C16 42 10 30 10 12 Z',c);
window.EXTRA2={
 cup1: svg(cup()+ball(28,19,6)),
 cup3: svg(cup(F)+star(28,19,6,W)),
 daily: svg(pa('M12 7 L40 7 L43 12 L43 42 C43 46 33 50 27.5 51 C22 50 12 46 12 42 Z',G)+tx(19.5,19.5,10,'99')+person(28,35,.7,D)+ci(42,41,10,W)+tx(42,46.5,15,'?')),
 squad: svg(shirt(28,29,1.45,GR)+pa('M18 9 L23 9 C24 13 32 13 33 9 L38 9 L34 14 L22 14 Z',W)+tx(28,40,15,'10',W)),
 road: svg(ln('M12 49 C6 38 44 40 42 30 C40 22 14 26 16 16 C17 11 24 9 30 10',W,7)+ln('M12 49 C6 38 44 40 42 30 C40 22 14 26 16 16 C17 11 24 9 30 10',D,1.6,'stroke-dasharray="3 4"')+ci(12,49,4,G)+ci(41,31,3.4,G)+ci(16,17,3.4,G)
   +ln('M37 4 L37 19',W,2.6)+pa('M37 4 L50 8 L37 12 Z',G)),
 gallery: svg(card(7,12,22,31,-13,F,star(18,27.5,6,W))+card(25,9,23,32,9,G,person(36.5,27,.62,D)+rc(28.5,12,7,2.4,1.2,D,'opacity=".5"'))),
 pass: svg(pa('M5 16 H51 V23 A5 5 0 0 0 51 33 V40 H5 V33 A5 5 0 0 0 5 23 Z',G)+ln('M37 18 L37 38',D,1.8,'stroke-dasharray="2.5 3"')+ci(22,28,8.5,W)+star(22,28,6,G)+rc(41,24,6,8,2,W)),
 quests: svg(rc(9,9,30,41,4,W)+rc(17,5,14,8,3,G)+ln('M14 21 L17 24 L22 18',GR,3)+rc(25,19.5,9,3.5,1.7,D,'opacity=".55"')+ln('M14 32 L17 35 L22 29',GR,3)+rc(25,30.5,9,3.5,1.7,D,'opacity=".55"')
   +ci(40,40,11.5,RD)+ci(40,40,7.5,W)+ci(40,40,3.6,RD)+ln('M41 39 L51 29',D,2.6)+pa('M51 29 L50 24 L54 26 L56 25 L55 30 Z',G)),
 league: svg(shield(G)+pa('M28 12 L41 16.5 C41 30 37 38 28 44 C19 38 15 30 15 16.5 Z',W)+ball(28,27,8.5,G)+pa('M21 4 L24 8 L28 3 L32 8 L35 4 L34 10 L22 10 Z',G)),
 leagues: svg(`<g transform="translate(-9 3) scale(.8)">${shield(F)}</g><g transform="translate(17 3) scale(.8)">${shield(F)}</g><g transform="translate(5 1) scale(.9)">${shield(G)}${ball(28,26,9)}</g>`),
 members: svg(person(19,32,1.15,W)+person(37,34,1.2,G)),
 coin: svg(ci(28,28,20,G)+ci(28,28,15,'none',`stroke="${D}" stroke-width="1.6" opacity=".35"`)+star(28,28,9,W)),
 coins: svg([0,1,2].map(k=>`<ellipse cx="24" cy="${42-k*7}" rx="15" ry="6" fill="${k===2?G:W}"/>`).join('')+ci(40,18,11,G)+star(40,18,6,W)),
 coinpile: svg([[16,44],[30,44],[44,44],[23,37],[37,37],[30,30]].map(([x,y],i)=>`<ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="${i%2?W:G}"/>`).join('')+ci(30,18,11,G)+star(30,18,6.5,W)),
 chest: svg(pa('M8 24 C8 13 48 13 48 24 Z',G)+rc(8,24,40,22,3,G)+rc(8,24,40,5,0,W)+rc(14,13,5,33,1,W)+rc(37,13,5,33,1,W)+rc(23,27,10,11,2,D)+ci(28,31.5,2,G)),
 shop: svg(rc(10,24,36,24,3,W)+pa('M7 12 H49 L49 22 C49 26 42 26 42 22 C42 26 35 26 35 22 C35 26 28 26 28 22 C28 26 21 26 21 22 C21 26 14 26 14 22 C14 26 7 26 7 22 Z',RD)+pa('M14 12 H21 V22 C21 25 14 25 14 22 Z M28 12 H35 V22 C35 25 28 25 28 22 Z M42 12 H49 V22 C49 25 42 25 42 22 Z',W)+rc(22,32,12,16,2,G)+rc(12,6,32,6,2,G)),
 chat: svg(pa('M9 11 H47 C49 11 50 12 50 14 V35 C50 37 49 38 47 38 H24 L14 47 L15 38 H9 C7 38 6 37 6 35 V14 C6 12 7 11 9 11 Z',W)+ci(18,24.5,3.2,D)+ci(28,24.5,3.2,G)+ci(38,24.5,3.2,D)),
 qlist: svg(rc(9,8,36,42,5,W)+[0,1,2].map(k=>ci(17,19+k*10,3,G)+rc(23,17+k*10,15,4,2,D,'opacity=".55"')).join('')),
 qplay: svg(ci(28,28,20,G)+pa('M23 17 L39 28 L23 39 Z',W)),
 qwin: svg(pa('M16 4 L26 4 L31 22 L23 24 Z',BL)+pa('M40 4 L30 4 L25 22 L33 24 Z',RD)+ci(28,34,15,G)+ci(28,34,10.5,'none',`stroke="${D}" stroke-width="1.6" opacity=".35"`)+star(28,34,8,W)),
 qpack: svg(pa('M16 6 H40 L43 11 V50 H13 V11 Z',G)+rc(13,15,30,3,0,D,'opacity=".5"')+ci(28,32,9.5,W)+star(28,32,6.5,G)),
};})();
(() => {
const W='#fff',G='#ffcf3a',D='#1b1340',F='rgba(255,255,255,.32)';
const rc=(x,y,w,h,r,c=W,e='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${e}/>`;
const X=(cx,cy,s,c)=>`<path d="M${cx-s} ${cy-s} L${cx+s} ${cy+s} M${cx+s} ${cy-s} L${cx-s} ${cy+s}" stroke="${c}" stroke-width="4.2" stroke-linecap="round" fill="none"/>`;
const O=(cx,cy,r,c)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="4"/>`;
const board=(marks)=>{let s=rc(6,6,44,44,8,F);for(let i=0;i<9;i++){const x=9+(i%3)*13.3,y=9+Math.floor(i/3)*13.3;s+=rc(x,y,11.3,11.3,3,W);}
  return s+marks.map(([i,m])=>{const x=14.6+(i%3)*13.3,y=14.6+Math.floor(i/3)*13.3;return m==='x'?X(x,y,3.4,'#ffcf3a'):O(x,y,3.6,'#1b1340');}).join('');};
EXTRA2.ttt=`<svg viewBox="0 0 56 56">${board([[0,'x'],[4,'x'],[8,'x'],[2,'o'],[6,'o']])}</svg>`;
EXTRA2['ttt-duo']=`<svg viewBox="0 0 56 56">${board([[0,'x'],[1,'o'],[4,'x'],[7,'o'],[5,'x']])}</svg>`;
EXTRA2['ng-box2box']=`<svg viewBox="0 0 56 56">${board([[0,'x'],[4,'o']])}<circle cx="42" cy="42" r="11" fill="#fff"/><path d="M42 42 L42 35.5 M42 42 L46.5 44.5" stroke="#1b1340" stroke-width="2.6" stroke-linecap="round"/></svg>`;
})();
