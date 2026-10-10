const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), {EventEmitter}=require('node:events');
const peers=new Map(); let guestId=0;
class Conn extends EventEmitter {
  send(m) { queueMicrotask(() => this.other.emit('data',m)); }
  close() { this.open=false; this.emit('close'); }
}
class Peer extends EventEmitter {
  constructor(id) { super(); this.id=typeof id==='string'?id:'guest'+(++guestId); peers.set(this.id,this); queueMicrotask(()=>this.emit('open',this.id)); }
  connect(id) {
    const a=new Conn(),b=new Conn(); a.other=b;b.other=a;
    queueMicrotask(()=> { const host=peers.get(id); if(!host) return this.emit('error',{type:'peer-unavailable'}); host.emit('connection',b); a.open=b.open=true; a.emit('open'); b.emit('open'); });
    return a;
  }
  destroy() { peers.delete(this.id); this.emit('close'); }
}
function client() {
  const box={innerHTML:'', listeners:new Set(), addEventListener(_,f){this.listeners.add(f)},removeEventListener(_,f){this.listeners.delete(f)}, click(action){for(const fn of [...this.listeners]) fn({stopPropagation(){},target:{closest:()=>({dataset:{on:action}})}});}};
  const ctx={window:{Peer},Screens:{current:'xdraft'},Store:{d:{user:{nick:'Test'}}},Sound:{play(){}},haptic(){},toast(){},Ui:{get:()=>''},esc:String,Board:{post:async()=>({ok:true}),ready:()=>true},setTimeout:()=>1,clearTimeout(){},navigator:{},console};
  vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/online.js','utf8')+'\nglobalThis.online=Online;',ctx);
  return {online:ctx.online,box};
}
const flush=async()=> { for(let i=0;i<6;i++) await new Promise(setImmediate); };
(async()=> {
  const a=client(),b=client();let code,closed=0,posted=0,hostLink,guestLink;
  const options={game:'xdraft',title:'Club',host:true,onCode:async c=>{code=c;posted++;return ()=>closed++;},hello:()=>({team:'host'}),onReady:l=>hostLink=l};
  a.online.open(a.box,options);await flush(); assert.equal(posted,1);
  b.online.open(b.box,{game:'xdraft',join:code,hello:()=>({team:'guest'}),onReady:l=>guestLink=l});await flush();
  assert.ok(hostLink&&guestLink,'two clients complete handshake');assert.equal(hostLink.seed,guestLink.seed);assert.equal(hostLink.op.data.team,'guest');assert.equal(closed,1,'invitation closes on connection');
  let received;guestLink.onMsg=m=>received=m;hostLink.send({t:'tac',v:3});await flush();assert.equal(received.v,3);
  a.online.stop();b.online.stop();assert.equal(closed,1);
  a.online.open(a.box,options);await flush();a.box.click('menu');await flush();assert.equal(closed,2,'cancel closes invitation');a.box.click('host');await flush();assert.equal(posted,3,'retry publishes a new room');
  a.online.leaveScreen('hub');assert.equal(closed,3,'navigation closes invitation');
  let resolvePublication;
  a.online.open(a.box,{...options,onCode:()=>new Promise(r=>resolvePublication=r)});await flush();a.online.stop();resolvePublication(()=>closed++);await flush();assert.equal(closed,4,'late publication cannot leave a ghost room');
  console.log('Club online: two-player handshake/messages, cancellation, retry, navigation and late publication passed');
})().catch(e=>{console.error(e);process.exitCode=1});
