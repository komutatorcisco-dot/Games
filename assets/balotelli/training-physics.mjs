export const field={width:20,length:30,goalZ:-13,goalHalf:2.7};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createMatch(){return {player:{x:0,z:6,dx:0,dz:-1},ball:{x:0,y:.22,z:5.1,vx:0,vy:0,vz:0},keeper:{x:0,z:-12},goals:0,shots:0,cooldown:0,scored:0};}
export function resetBall(s){Object.assign(s.player,{x:0,z:6,dx:0,dz:-1});Object.assign(s.ball,{x:0,y:.22,z:5.1,vx:0,vy:0,vz:0});s.keeper.x=0;s.cooldown=0;s.scored=0;}
export function shoot(s,power=.5){const {player:p,ball:b}=s;if(s.cooldown>0||s.scored>0||Math.hypot(p.x-b.x,p.z-b.z)>1.5||b.y>1)return false;power=clamp(power,0,1);b.vx=p.dx*(12+power*8);b.vz=p.dz*(12+power*8);b.vy=2+power*3;s.cooldown=.6;s.shots++;return true;}
export function update(s,input,dt){dt=clamp(dt,0,.033);const {player:p,ball:b,keeper:k}=s;s.cooldown=Math.max(0,s.cooldown-dt);if(s.scored>0){s.scored-=dt;if(s.scored<=0)resetBall(s);return;}
let x=input.x||0,z=input.z||0;const len=Math.hypot(x,z);if(len>0){x/=Math.max(1,len);z/=Math.max(1,len);p.dx=x/Math.hypot(x,z);p.dz=z/Math.hypot(x,z);const speed=input.sprint?6:4;p.x=clamp(p.x+x*speed*dt,-9.4,9.4);p.z=clamp(p.z+z*speed*dt,-12.3,14.4);}
const distance=Math.hypot(p.x-b.x,p.z-b.z),speed=Math.hypot(b.vx,b.vz);
if(distance<1.25&&b.y<.5&&s.cooldown===0&&speed<8){const tx=p.x+p.dx*.8,tz=p.z+p.dz*.8;b.vx=(tx-b.x)*9;b.vz=(tz-b.z)*9;}
k.x+=clamp(clamp(b.x,-2.25,2.25)-k.x,-3*dt,3*dt);
const priorZ=b.z;b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.vy-=9.81*dt;
if(b.y<.22){b.y=.22;b.vy=Math.abs(b.vy)>.7?-b.vy*.35:0;b.vx*=Math.exp(-1.2*dt);b.vz*=Math.exp(-1.2*dt);}
if(Math.hypot(b.x-k.x,b.z-k.z)<.7&&b.y<1.9&&b.vz<0){b.vz=Math.abs(b.vz)*.65+2;b.vx+=(b.x-k.x)*5;b.vy=1.5;}
if(priorZ>field.goalZ&&b.z<=field.goalZ&&Math.abs(b.x)<field.goalHalf-.22&&b.y<2.25){s.goals++;s.scored=1.6;return;}
if(Math.abs(b.x)>9.78){b.x=clamp(b.x,-9.78,9.78);b.vx*=-.65;}if(b.z>14.78||b.z<-14.78){b.z=clamp(b.z,-14.78,14.78);b.vz*=-.65;}
}
