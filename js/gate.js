// Играть могут только подписчики канала «Старики Джексоны». Проверку делает сервер по подписи Telegram.
// Вне Telegram, без сервера или при сбое проверки не мешаем играть: из-за наших неполадок игрок страдать не должен.
'use strict';

const Gate = (() => {
  const LINK = 'https://t.me/oldjacksons', KEY = 'jx-sub', FRESH = 3 * 864e5;
  const api = () => CONFIG.api || CONFIG.donateApi || '';
  let el = null, busy = false;

  const remembered = () => { try { return Date.now() - (+localStorage.getItem(KEY) || 0) < FRESH; } catch (e) { return false; } };
  const remember = (yes) => { try { if (yes) localStorage.setItem(KEY, String(Date.now())); else localStorage.removeItem(KEY); } catch (e) { /* ок */ } };

  // true — подписан (или проверить нельзя), false — точно не подписан
  async function member() {
    if (!api() || typeof TG === 'undefined' || !TG || !TG.initData) return true;
    try {
      const r = await fetch(api() + '/member', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData }) }).then((x) => x.json());
      return r && r.ok ? !!r.member : true;
    } catch (e) { return true; }
  }

  function show(state = 'ask') {
    if (!el) {
      el = document.createElement('div');
      el.className = 'gate';
      el.innerHTML = `<div class="gate-card">
          <img class="gate-ava" src="img/brand/bot-avatar-a.png" alt="">
          <small class="gate-k">Игры канала</small>
          <h2>Старики Джексоны</h2>
          <p class="gate-t">Игры открыты для подписчиков канала. Подпишись, это бесплатно, и возвращайся.</p>
          <button class="btn gold gate-go" data-gate="sub">Подписаться на канал</button>
          <button class="btn ghost gate-ok" data-gate="check">Я подписался</button>
          <p class="gate-msg" aria-live="polite"></p>
        </div>`;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-gate]'); if (!b) return;
        if (b.dataset.gate === 'sub') { try { TG.openTelegramLink(LINK); } catch (x) { window.open(LINK, '_blank'); } }
        else recheck(true);
      });
      document.body.appendChild(el);
    }
    el.dataset.state = state;
    document.body.classList.add('gated');
  }
  function hide() {
    if (!el) return;
    document.body.classList.remove('gated');
    el.classList.add('out');
    const x = el; el = null;
    setTimeout(() => x.remove(), 350);
  }
  async function recheck(manual) {
    if (busy) return; busy = true;
    if (el) { el.dataset.state = 'wait'; $('.gate-msg', el).textContent = 'Проверяем…'; }
    const ok = await member();
    busy = false;
    remember(ok);
    if (ok) { if (el) { haptic('ok'); hide(); } return; }
    show('ask');
    if (manual) { $('.gate-msg', el).textContent = 'Пока не видим подписку. Подпишись на канал и нажми ещё раз.'; bump($('.gate-card', el)); haptic('bad'); }
    else $('.gate-msg', el).textContent = '';
  }

  function start() {
    if (typeof TG === 'undefined' || !TG || !TG.initData || !api()) return;
    if (remembered()) { recheck(false); return; } // недавно проверяли: пускаем сразу, перепроверяем тихо
    show('wait');
    recheck(false);
    // вернулся из канала — проверяем сами, без лишнего нажатия
    document.addEventListener('visibilitychange', () => { if (!document.hidden && el) recheck(false); });
    try { TG.onEvent('activated', () => { if (el) recheck(false); }); } catch (e) { /* старый клиент */ }
  }
  return { start, member };
})();
