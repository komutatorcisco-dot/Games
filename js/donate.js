// Донат звёздами Telegram (Stars). Счёт создаёт наш сервер (server/worker.js), игра открывает его в Telegram.
// За донат — рамка «Спонсор» и спасибо от бота. Пока сервер не подключён (CONFIG.api пуст), кнопки не показываются.
'use strict';

const Donate = (() => {
  const AMOUNTS = [50, 100, 250, 500];
  const api = () => CONFIG.api || CONFIG.donateApi || '';
  const ready = () => !!(api() || CONFIG.donateUrl);

  function thank(stars) {
    const u = Store.d.user;
    u.donor = (u.donor || 0) + stars;
    Store.d.shop.owned['frame:sponsor'] = true;
    Store.d.shop.frame = 'sponsor';
    Store.save();
    if (typeof Shop !== 'undefined') Shop.apply();
    confetti(); Sound.play('goal');
    Modal.open(`<h2>Спасибо! 🙌</h2><p>${stars} ⭐ — это очень помогает каналу. Тебе открыта золотая рамка «Спонсор».</p>`, [{ label: 'Круто', onClick: () => {} }]);
  }

  async function pay(stars) {
    const base = api();
    if (base && TG && TG.openInvoice && stars > 0) {
      try {
        const nick = encodeURIComponent((Store.d.user && Store.d.user.nick) || '');
        const r = await fetch(`${base}/invoice?stars=${stars}&nick=${nick}`).then((x) => x.json());
        if (!r.ok) throw new Error(r.error || 'invoice');
        Modal.close();
        TG.openInvoice(r.link, (status) => {
          if (status === 'paid') thank(stars);
          else if (status === 'failed') toast('Платёж не прошёл');
        });
      } catch (e) { toast(`Не получилось открыть оплату${e && e.message && e.message !== 'invoice' ? `: ${e.message}` : ''}. Попробуй позже`); }
      return;
    }
    if (CONFIG.donateUrl) { try { TG && TG.openLink ? TG.openLink(CONFIG.donateUrl) : window.open(CONFIG.donateUrl, '_blank'); } catch (e) { window.open(CONFIG.donateUrl, '_blank'); } return; }
    toast('Открой игры в Telegram, чтобы поддержать звёздами');
  }

  function open() {
    const u = Store.d.user || {};
    const stars = !!api(); // есть сервер — выбираем сумму в звёздах, иначе запасная ссылка
    Modal.open(`<h2>Поддержать канал ⭐</h2>
      <p>Игры бесплатные и без рекламы. Если нравится — поддержи «Стариков Джексонов» звёздами Telegram.</p>
      ${u.donor ? `<p class="muted">Ты уже поддержал на ${u.donor} ⭐ — спасибо!</p>` : '<p class="muted">Взамен — золотая рамка «Спонсор» в профиле.</p>'}
      ${stars ? `<div class="don-grid">${AMOUNTS.map((a) => `<button class="don-btn" data-stars="${a}"><b>${a}</b><span>⭐</span></button>`).join('')}</div>` : ''}`,
    [stars ? { label: 'Закрыть', cls: 'ghost', onClick: () => {} } : { label: 'Поддержать', onClick: () => pay(0) }, ...(stars ? [] : [{ label: 'Закрыть', cls: 'ghost', onClick: () => {} }])]);
    const g = $('.don-grid');
    if (g) g.addEventListener('click', (e) => { const b = e.target.closest('[data-stars]'); if (b) { Modal.close(); pay(+b.dataset.stars); } });
  }

  function render() { $$('.donate-entry').forEach((el) => { el.hidden = !ready(); }); }

  return { open, render, ready };
})();
