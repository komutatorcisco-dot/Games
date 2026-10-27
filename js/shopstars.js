// Магазин за Telegram Stars: паки, монеты, скины. Цены — как в server/worker.js (SHOP).
// Оплату подтверждает сервер (successful_payment). Выданные покупки помним по номеру n: Store.d.paid = ['legend:123', …].
'use strict';

const StarShop = (() => {
  const ITEMS = [
    { id: 'legend', stars: 39, coins: 7500, level: 3, count: 1, name: 'Легендарный пак', sub: '15 карт · минимум 1 легенда и 3 золотых', art: () => PackOpen.art(3, 'rs') },
    { id: 'epic3', stars: 49, coins: 6000, level: 2, count: 3, name: '3 эпических пака', sub: '24 карты · минимум 6 золотых', art: () => PackOpen.art(2, 'rs') },
    { id: 'jack', stars: 99, coins: 20000, level: 4, count: 1, name: 'Пак «ДЖЕКСОН!!»', sub: '30 карт · минимум 1 «Джексон», 2 легенды и 6 золотых', art: () => PackOpen.art(4, 'rs') },
    { id: 'coins', stars: 49, name: '2000 монет', sub: 'Сразу на счёт', art: () => '<span class="rs-coins"><i class="coin"></i><i class="coin"></i><i class="coin"></i></span>' },
  ];
  const COIN_PACKS = [
    { id: 'basic', coins: 400, level: 0, count: 1, name: 'Обычный пак', sub: '3 случайные карты', art: () => PackOpen.art(0, 'rs') },
    { id: 'gold', coins: 1000, level: 1, count: 1, name: 'Золотой пак', sub: '5 карт · минимум 1 золотая', art: () => PackOpen.art(1, 'rs') },
    { id: 'epic', coins: 2000, level: 2, count: 1, name: 'Эпический пак', sub: '8 карт · минимум 2 золотых', art: () => PackOpen.art(2, 'rs') },
    ...ITEMS.filter(x => x.coins),
  ];
  const keysFor = (x) => Array.from({ length: x.count }, () => Cards.packCards(x.level)).flat();
  function showCards(keys, beforeCommit) {
    // Баланс/номер покупки и карты попадают в одно сохранение Cards.add до анимации.
    beforeCommit();
    const res = Cards.add(keys);
    const dup = res.reduce((n, x) => n + x.coins, 0);
    if (dup) Coins.add(dup);
    Coins.render(); Rewards.refresh();
    PackOpen.reveal(res);
  }
  function buyCoins(id) {
    const x = COIN_PACKS.find(x => x.id === id); if (!x) return;
    let used = false;
    Modal.open(`<h2>${esc(x.name)}</h2><p>${esc(x.sub)}</p><p>Цена: ${x.coins} монет. Карты могут повторяться.</p>`, [
      { label: `Купить · ${x.coins} монет`, onClick: () => {
        if (used) return;
        if (Store.d.coins < x.coins) { toast('Недостаточно монет'); return; }
        const keys = keysFor(x); used = true; Modal.close();
        showCards(keys, () => { Store.d.coins -= x.coins; });
      } }, { label: 'Отмена', cls: 'ghost' },
    ]);
  }
  function odds(x) {
    const p = Cards.PACKS[x.level];
    return `Шанс редкости в каждом случайном слоте: ${p.w.map(([r, n]) => `${Cards.RAR[r].n} ${n}%`).join(' · ')}. Гарантированные слоты указаны выше. ИПК-карты не выпадают.`;
  }
  const SKINS = ['brawl', 'ut', 'fcm', 'ef', 'kit', 'cyber'];
  const paid = () => Store.d.paid || (Store.d.paid = []);
  // выдать покупку (один раз на номер n)
  function grant(item, n) {
    const key = `${item}:${n}`; if (paid().includes(key)) return false;
    const pack = ITEMS.find(x => x.id === item && x.level !== undefined);
    if (pack) showCards(keysFor(pack), () => paid().push(key));
    else if (item === 'coins') { paid().push(key); Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(2000); }
    else if (item.startsWith('skin:') && SKINS.includes(item.slice(5))) { paid().push(key); Skins.grant(item.slice(5)); Store.save(); toast('Скин включён — сменить можно в Магазине → Скины'); }
    else return false;
    return true;
  }
  // сервер прислал список покупок (ответ /hello): выдаём то, что ещё не выдали
  function sync(list) { (list || []).forEach((p) => { if (p && p.item && p.n) grant(p.item, p.n); }); }
  // админу всё бесплатно (кроме режима «как обычный игрок»): выдаём сразу, без счёта в Telegram
  const free = () => !!(Store.d.admin && !(Store.d.ui && Store.d.ui.asPlayer));
  async function buy(item) {
    if (free()) { Modal.close(); confetti(); Sound.play('goal'); grant(item, 'adm' + Date.now()); return; }
    if (typeof CONFIG !== 'undefined' && CONFIG.stage) { toast('В превью покупки отключены — это проверочная версия'); return; } // превью ходит на проверочный сервер: настоящие Stars не списываем
    const base = CONFIG.api;
    if (!(base && TG && TG.openInvoice && TG.initData)) { toast('Покупки работают в Telegram через бота @JacksonGamesbot'); return; }
    try {
      const r = await fetch(`${base}/invoice?item=${encodeURIComponent(item)}&initData=${encodeURIComponent(TG.initData)}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || 'invoice');
      TG.openInvoice(r.link, async (status) => {
        if (status === 'paid') {
          Modal.close();
          try {
            const confirmed = await fetch(`${base}/shop/purchase`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData, item, n: r.n }) }).then(x => x.json());
            if (confirmed.ok && confirmed.paid) grant(item, r.n);
            else toast('Платёж обрабатывается. Покупка придёт при следующем входе в игру.');
          } catch (_) { toast('Покупка сохранена в Telegram. Открой игру снова после восстановления связи.'); }
        }
        else if (status === 'failed') toast('Платёж не прошёл');
      });
    } catch (e) { toast('Не получилось открыть оплату. Попробуй позже'); }
  }
  const own = (k) => Skins.has(k);
  // паки за монеты и звёзды — и в окне, и во вкладке «Магазин»
  function packsHtml() {
    return `<h4 class="ss-h">За монеты</h4>
      <div class="ss-grid">${COIN_PACKS.map(x => `<div class="ss-c"><span class="ss-art">${x.art()}</span><b>${x.name}</b><small>${x.sub}</small><button class="btn gold" data-coinpack="${x.id}">${x.coins} монет</button><details><summary>Шансы</summary><small>${odds(x)}</small></details></div>`).join('')}</div>
      <h4 class="ss-h">За звёзды Telegram</h4>
      <div class="ss-grid">${ITEMS.map((x) => `<button class="ss-c" data-ss="${x.id}"><span class="ss-art">${x.art()}</span><b>${x.name}</b><small>${x.sub}</small><em>${free() ? '0 ⭐ · админ' : `${x.stars} ⭐`}</em></button>`).join('')}</div>
      <p class="sk-p">Для одинаковых паков за монеты и ⭐ состав и шансы одинаковые. Повторы возможны. Шансы указаны в разделе выше.</p>`;
  }
  function skinsHtml() {
    return `<h4 class="ss-h">Скины навсегда за звёзды</h4>
      <div class="ss-grid">${SKINS.map((k) => { const s = Skins.LIST.find((x) => x.id === k); return `<button class="ss-c sk ${own(k) ? 'own' : ''}" ${own(k) ? '' : `data-ss="skin:${k}"`}><img src="img/skins/${k}.webp" alt="" loading="lazy"><b>${esc(s.name)}</b><em>${own(k) ? 'Есть' : free() ? '0 ⭐' : '29 ⭐'}</em></button>`; }).join('')}</div>`;
  }
  function open() {
    Modal.open(`<h3 class="sk-h">Магазин паков</h3><p class="sk-p">Собирай клуб: выбирай пак за монеты или звёзды Telegram.</p>${packsHtml()}${skinsHtml()}`,
    [{ label: 'Закрыть', cls: 'ghost' }]);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-ss]'); if (b) { Sound.play('tap'); buy(b.dataset.ss); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-coinpack]'); if (b) buyCoins(b.dataset.coinpack); });
  document.addEventListener('ss-buy', (e) => buy(e.detail));
  return { COIN_PACKS, odds, open, packsHtml, skinsHtml, sync, grant, ITEMS };
})();
