// Disabled unless an explicit staging-only configuration is supplied. Values in Store are display caches.
const EconomyClient = (() => {
  let revision=-1,identity=null,catalogReady=false;
  const configured=()=>typeof CONFIG!=='undefined'&&CONFIG.economyStaging===true&&!!CONFIG.economyApi;
  const pendingKey=()=>`jx-economy-pending:${TG?.initDataUnsafe?.user?.id||'test'}`;
  async function request(path,body={}){
    if(!configured()||!TG?.initData)throw Error('РЎРµСЂРІРµСЂРЅР°СЏ СЌРєРѕРЅРѕРјРёРєР° РЅРµРґРѕСЃС‚СѓРїРЅР°');
    const r=await fetch(CONFIG.economyApi+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,initData:TG.initData})});
    const j=await r.json();if(!r.ok||!j.ok)throw Error('РћРїРµСЂР°С†РёСЏ РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РџРѕРІС‚РѕСЂРё РїРѕСЃР»Рµ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ СЃРІСЏР·Рё.');
    if(j.state)apply(j.state);return j;
  }
  function apply(s){
    if(!catalogReady && typeof FACES_EXTRA!=='undefined') { Object.assign(FACES,FACES_EXTRA); Cards.reset(); catalogReady=true; }
    if(identity!==s.wallet.uid){identity=s.wallet.uid;revision=-1;}
    if(s.wallet.revision<revision)return;revision=s.wallet.revision;
    Store.d.coins=s.wallet.coins;Store.d.rw=Store.d.rw||{};Store.d.rw.trophies=s.wallet.trophies;
    Store.d.cards={...Store.d.cards,own:Object.fromEntries(Object.entries(s.inventory).map(([k,v])=>[k,v.received])),used:Object.fromEntries(Object.entries(s.inventory).map(([k,v])=>[k,v.spent]))};
    Store.d.sbc={...Store.d.sbc,done:Object.fromEntries(s.claims.filter(x=>x.startsWith('sbc:')).map(x=>[x.slice(4),1]))};
    Store.save();Coins.render();if(typeof Rewards!=='undefined')Rewards.refresh();
  }
  let busy=false;
  async function transact(path,payload){
    if(busy)throw Error('Р”РѕР¶РґРёСЃСЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РїСЂРµРґС‹РґСѓС‰РµР№ РїРѕРєСѓРїРєРё');busy=true;
    try{
      const saved=localStorage.getItem(pendingKey());let pending=saved?JSON.parse(saved):null;
      if(pending&&(pending.path!==path||JSON.stringify(pending.payload)!==JSON.stringify(payload)))throw Error('РЎРЅР°С‡Р°Р»Р° РїРѕРІС‚РѕСЂРё РЅРµР·Р°РІРµСЂС€С‘РЅРЅСѓСЋ РѕРїРµСЂР°С†РёСЋ');
      if(!pending){pending={id:crypto.randomUUID(),path,payload};localStorage.setItem(pendingKey(),JSON.stringify(pending));}
      const result=await request(path,{id:pending.id,payload:pending.payload});localStorage.removeItem(pendingKey());return result.result;
    }finally{busy=false;}
  }
  const renderCards=r=>(r.cards||[]).map(x=>({c:Cards.get(x.key),isNew:x.isNew,coins:x.coins})).filter(x=>x.c);
  async function buyPack(product){try{const r=await transact('/pack',{product});Modal.close();PackOpen.reveal(renderCards(r));}catch(e){toast(e.message);}}
  async function sync(){return request('/state');}
  async function restore(){return request('/stars/restore');}
  async function buyStars(item){try{
    const id=crypto.randomUUID();const order=await request('/invoice',{id,item});
    TG.openInvoice(order.link,async status=>{if(status==='paid'){try{const r=await restore();const own=r.results.find(x=>x.id==='stars:'+order.order);if(own?.cards.length)PackOpen.reveal(renderCards(own));}catch{toast('РћРїР»Р°С‚Р° СЃРѕС…СЂР°РЅРµРЅР°. РџРѕРІС‚РѕСЂРё РІС…РѕРґ РїРѕСЃР»Рµ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ СЃРІСЏР·Рё.');}}});
  }catch(e){toast(e.message);}}
  return {configured,sync,restore,buyPack,buyStars,transact,renderCards};
})();
