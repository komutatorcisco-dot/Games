import assert from 'node:assert/strict';
import {createMatch,update,shoot,resetBall} from './training-physics.mjs';
const a=createMatch(),b=createMatch();for(let i=0;i<60;i++){update(a,{x:1,z:0},1/60);update(b,{x:1,z:1},1/60);}assert.ok(Math.abs(Math.hypot(a.player.x,a.player.z-6)-Math.hypot(b.player.x,b.player.z-6))<.001);
const s=createMatch();assert.equal(shoot(s),true);assert.equal(shoot(s),false);assert.equal(s.shots,1);resetBall(s);s.ball.x=8;assert.equal(shoot(s),false);
Object.assign(s.ball,{x:2,y:.3,z:-12.99,vx:0,vy:0,vz:-5});update(s,{},1/60);assert.equal(s.goals,1);for(let i=0;i<110;i++)update(s,{},1/60);assert.equal(s.goals,1);assert.equal(s.player.z,6);
const k=createMatch();Object.assign(k.ball,{x:0,y:.3,z:-11.8,vz:-10});update(k,{},1/60);assert.ok(k.ball.vz>0);assert.equal(k.goals,0);
const wall=createMatch();for(let i=0;i<500;i++)update(wall,{x:1,z:1,sprint:true},1/30);assert.ok(wall.player.x<=9.4&&wall.player.z<=14.4);
console.log('Training: diagonal speed, shot range/cooldown, single goal, reset, keeper and boundaries passed');
