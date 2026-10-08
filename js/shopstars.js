// Магазин за Telegram Stars: паки, монеты, скины. Цены — как в server/worker.js (SHOP).
// Оплату подтверждает сервер (successful_payment). Выданные покупки помним по номеру n: Store.d.paid = ['legend:123', …].
'use strict';

const StarShop = (() => {
  const ITEMS = [
    { id: 'legend', stars: 39, name: 'Легендарный пак', sub: 'Гарантированная легенда', art: () => PackOpen.art(3, 'rs') },
    { id: 'epic3', stars: 49, name: '3 эпических пака', sub: 'Три пака подряд', art: () => PackOpen.art(2, 'rs') },
    { id: 'jack', stars: 99, name: 'Пак «ДЖЕКСОН!!»', sub: 'Самый редкий пак', art: () => PackOpen.art(4, 'rs') },
    { id: 'coins', stars: 49, name: '2000 монет', sub: 'Сразу на счёт', art: () => '<span class="rs-coins"><i class="coin"></i><i class="coin"></i><i class="coin"></i></span>' },
  ];
  const SKINS = ['brawl', 'ut', 'fcm', 'ef', 'kit', 'cyber'];
  const paid = () => Store.d.paid || (Store.d.paid = []);
  // выдать покупку (один раз на номер n)
  function grant(item, n) {
    const key = `${item}:${n}`; if (paid().includes(key)) return false;
    paid().push(key); Store.save();
    const chain = (k, lv, title) => { if (k <= 0) return; Rewards.openDrop({ title, minLevel: lv, onDone: () => setTimeout(() => chain(k - 1, lv, title), 400) }); };
    if (item === 'legend') chain(1, 3, 'ПОКУПКА · ЛЕГЕНДАРНЫЙ ПАК');
    else if (item === 'epic3') chain(3, 2, 'ПОКУПКА · ЭПИЧЕСКИЙ ПАК');
    else if (item === 'jack') chain(1, 4, 'ПОКУПКА · ПАК «ДЖЕКСОН!!»');
    else if (item === 'coins') { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(2000); }
    else if (item.startsWith('skin:')) { Skins.grant(item.slice(5)); toast('Скин включён — сменить можно в Профиле → Оформление'); }
    return true;
  }
  // сервер прислал список покупок (ответ /hello): выдаём то, что ещё не выдали
  function sync(list) { (list || []).forEach((p) => { if (p && p.item && p.n) grant(p.item, p.n); }); }
  async function buy(item) {
    const base = CONFIG.api;
    if (!(base && TG && TG.openInvoice && TG.initData)) { toast('Покупки работают в Telegram через бота @JacksonGamesbot'); return; }
    try {
      const r = await fetch(`${base}/invoice?item=${encodeURIComponent(item)}&initData=${encodeURIComponent(TG.initData)}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || 'invoice');
      TG.openInvoice(r.link, (status) => {
        if (status === 'paid') { Modal.close(); confetti(); Sound.play('goal'); grant(item, r.n); }
        else if (status === 'failed') toast('Платёж не прошёл');
      });
    } catch (e) { toast('Не получилось открыть оплату. Попробуй позже'); }
  }
  function open() {
    const own = (k) => Skins.has(k);
    Modal.open(`<h3 class="sk-h">Магазин ⭐</h3><p class="sk-p">Покупки за звёзды Telegram. Всё, что есть в магазине, можно получить и бесплатно — играя.</p>
      <div class="ss-grid">${ITEMS.map((x) => `<button class="ss-c" data-ss="${x.id}"><span class="ss-art">${x.art()}</span><b>${x.name}</b><small>${x.sub}</small><em>${x.stars} ⭐</em></button>`).join('')}</div>
      <h4 class="ss-h">Скины навсегда</h4>
      <div class="ss-grid">${SKINS.map((k) => { const s = Skins.LIST.find((x) => x.id === k); return `<button class="ss-c sk ${own(k) ? 'own' : ''}" ${own(k) ? '' : `data-ss="skin:${k}"`}><img src="img/skins/${k}.webp" alt="" loading="lazy"><b>${esc(s.name)}</b><em>${own(k) ? 'Есть' : '29 ⭐'}</em></button>`; }).join('')}</div>`,
    [{ label: 'Закрыть', cls: 'ghost' }]);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-ss]'); if (b) { Sound.play('tap'); buy(b.dataset.ss); } });
  document.addEventListener('ss-buy', (e) => buy(e.detail));
  return { open, sync, grant, ITEMS };
})();
