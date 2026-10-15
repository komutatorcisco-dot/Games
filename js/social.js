// Social preferences never grant cards. Public ownership is checked separately on the server.
'use strict';
const Social = (() => {
  let pendingSync = null, enabled = false, backendDisabled = false, handle = '', syncTimer = null, lastRead = 0;
  const state = () => {
    if (!Store.d.social || typeof Store.d.social !== 'object') Store.d.social = {};
    const s = Store.d.social;
    if (!s.favorites || typeof s.favorites !== 'object') s.favorites = {};
    if (!Array.isArray(s.showcase)) s.showcase = [null, null, null];
    if (!Array.isArray(s.pending)) s.pending = [];
    return s;
  };
  const favorite = key => state().favorites[key] === true;
  const available = key => Math.max(0, Cards.spare(key) - (favorite(key) ? 1 : 0));
  const active = () => state().showcase.slice(0, 3).map(k => k && Cards.get(k) && Cards.spare(k) > 0 ? k : null);
  function apply(s, op) {
    if (op.type === 'favorite') { if (op.value) s.favorites[op.key] = true; else delete s.favorites[op.key]; }
    if (op.type === 'showcase') s.showcase = op.keys.slice();
    if (op.type === 'privacy') s.public = op.value;
  }
  function change(op) {
    const s = state();
    apply(s, op); s.pending.push(op); Store.save(true);
    clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 500); render();
  }
  function toggle(key) {
    if (!Cards.get(key) || (!favorite(key) && Cards.spare(key) < 1)) return;
    change({ type: 'favorite', key, value: !favorite(key) });
  }
  async function sync(force = true) {
    if (pendingSync) return pendingSync;
    if (!force && !state().pending.length && Date.now() - lastRead < 30000) return true;
    if (typeof Board === 'undefined' || !Board.ready()) return false;
    pendingSync = (async () => {
      try {
        let r = await Board.post('/social', { act: 'self' });
        if (!r || !r.ok) { backendDisabled = !!(r && r.disabled); return false; }
        enabled = true; backendDisabled = false; handle = r.handle;
        // Absolute operations are safe to replay after a lost response. CAS protects other devices.
        let tries = 0;
        while (state().pending.length && tries++ < 5) {
          const ops = state().pending.slice(0, 100);
          const next = await Board.post('/social', { act: 'edit', revision: r.revision, ops });
          if (next.conflict) { r = next; continue; }
          if (!next.ok) return false;
          state().pending.splice(0, ops.length); r = next;
        }
        const s = state(); s.favorites = { ...r.favorites }; s.showcase = r.showcase.slice(); s.public = r.public; s.shown = Array.isArray(r.shown) ? r.shown.slice(0, 3) : [null, null, null];
        s.pending.forEach(op => apply(s, op)); Store.save(true); render(); lastRead = Date.now();
        if (s.pending.length) { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 1000); }
        return !s.pending.length;
      } catch (_) { return false; }
      finally { pendingSync = null; }
    })();
    return pendingSync;
  }
  async function beforeSpend() {
    // In Telegram do not consume cards with potentially stale protection from another device.
    if (typeof Board !== 'undefined' && Board.ready()) {
      if (!await sync() && !backendDisabled) { toast('Не удалось проверить защиту карточек. Проверь подключение и повтори.'); return false; }
    }
    return true;
  }
  function slots(keys, editable) {
    return `<div class="social-slots">${[0, 1, 2].map(i => {
      const c = keys[i] && Cards.get(keys[i]);
      return `<div class="social-slot">${editable ? `<button data-social-slot="${i}" aria-label="Выбрать карточку ${i + 1}">` : `<button ${c ? `data-social-card="${esc(c.key)}"` : 'disabled'} aria-label="${c ? esc(c.name) : 'Пустое место'}">`}${c ? Cards.html(c, { w: 94 }) : '<span class="social-empty">＋</span>'}</button>${editable ? `<div class="social-order"><button data-social-move="${i}" aria-label="Переместить карточку вправо">→</button><button data-social-clear="${i}" aria-label="Убрать карточку">×</button></div>` : ''}</div>`;
    }).join('')}</div>`;
  }
  // что видят другие: сервер показывает только карточки, найденные в сохранении игрока
  function publicNote() {
    const s = state();
    if (s.public === false) return 'Профиль закрыт — витрину видишь только ты.';
    const shown = Array.isArray(s.shown) ? s.shown : [];
    const waiting = active().filter(k => k && !shown.includes(k)).length;
    return waiting ? 'Новые карточки появятся у других после сохранения прогресса.' : 'Витрину видят другие игроки.';
  }
  function render() {
    const host = document.getElementById('social-profile'); if (!host) return;
    const signature = JSON.stringify([active(), state().public !== false, enabled, !!state().pending.length, state().shown || null]);
    if (host.dataset.socialRender === signature && host.children.length) return;
    host.dataset.socialRender = signature;
    const ph = document.getElementById('pp-hero'); if (ph) ph.innerHTML = hero(active().find(Boolean), Store.d.user && Store.d.user.emoji);
    host.innerHTML = `<h3>Моя витрина</h3><p class="social-note">Выбери три карточки из своего клуба</p>${slots(active(), true)}<label class="social-privacy"><input type="checkbox" data-social-privacy ${state().public !== false ? 'checked' : ''}> Публичный профиль</label><p class="social-note">${enabled ? (state().pending.length ? 'Изменения ожидают синхронизации' : 'Настройки сохранены') : 'Изменения сохранены на этом устройстве'}. ${publicNote()}</p>`;
  }
  function choose(index, query = '', page = 0) {
    const picked = active();
    const list = Cards.all().filter(c => Cards.spare(c.key) > 0 && (!picked.includes(c.key) || picked[index] === c.key) && c.name.toLowerCase().includes(query.toLowerCase()));
    const count = Math.ceil(list.length / 18); page = Math.min(page, Math.max(0, count - 1));
    Modal.open(`<h2>Карточка ${index + 1}</h2><input class="social-search" placeholder="Найти игрока" value="${esc(query)}"><div class="social-picker">${list.slice(page * 18, page * 18 + 18).map(c => `<button data-social-pick="${esc(c.key)}">${Cards.html(c, { w: 84 })}</button>`).join('') || '<p>Доступных карточек нет</p>'}</div><div class="social-pages"><button data-social-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Назад</button><span>${page + 1} / ${Math.max(1, count)}</span><button data-social-page="${page + 1}" ${page + 1 >= count ? 'disabled' : ''}>Далее</button></div>`, [{ label: 'Закрыть', cls: 'ghost' }]);
    const box = document.getElementById('modal-card');
    box.querySelector('.social-search').addEventListener('change', e => choose(index, e.target.value));
    box.querySelectorAll('[data-social-page]').forEach(b => b.onclick = () => choose(index, query, +b.dataset.socialPage));
    box.querySelectorAll('[data-social-pick]').forEach(b => b.onclick = () => {
      const key = b.dataset.socialPick; if (Cards.spare(key) < 1) return;
      const keys = active(); if (keys.some((k, i) => i !== index && k === key)) return;
      keys[index] = key; change({ type: 'showcase', keys }); Modal.close();
    });
  }
  function detail(key) {
    const c = Cards.get(key); if (!c) return;
    // Read only: no Cards.details(), which changes local fresh flags and adds owner controls.
    Modal.open(`${Cards.html(c, { w: 180 })}<h2>${esc(c.name)}</h2><p>${esc(c.pos)} · ${esc(c.nat || '')} · ${c.r}</p>`, [{ label: 'Закрыть', cls: 'ghost' }]);
  }
  // ---------- профиль: одна компоновка для своего и чужого (как в Brawl Stars, но вертикально) ----------
  // Слева крупно любимый футболист — первая карточка витрины; справа аватар, ник, звание, трофеи; ниже статистика,
  // витрина и достижения. Собрано из тех же классов панелей (.pc, .pc-st), что красят скины, — своего оформления нет.
  const RANK_NAMES = ['Новичок', 'Дворовый игрок', 'Любитель', 'Полупрофи', 'Профи', 'Звезда', 'Легенда', 'Старик Джексон'];
  const num = (x) => Number(x || 0).toLocaleString('ru-RU');
  function hero(key, emoji) {
    const c = key && Cards.get(key);
    if (!c) return `<div class="pp-hero empty"><span class="pp-ph">${esc(emoji || '⚽')}</span><small>Любимый игрок не выбран</small></div>`;
    return `<button class="pp-hero" data-social-card="${esc(c.key)}" aria-label="Любимый игрок: ${esc(c.name)}">${Cards.html(c, { w: 150 })}<small>Любимый игрок</small></button>`;
  }
  function stats(list) { return `<div class="pc-stats pp-stats">${list.map(([ic, k, v]) => `<span class="pc-st"><i>${Ui.get(ic)}</i><b>${v}</b><small>${k}</small></span>`).join('')}</div>`; }
  function layout(r) {
    const rank = RANK_NAMES[Math.max(0, Math.min(RANK_NAMES.length - 1, (r.level || 1) - 1))];
    const list = [['star', 'уровень', r.level || 1]];
    if (r.wins !== undefined) list.push(['swords', 'побед в играх', num(r.wins)], ['shirt', 'турниров драфта', num(r.drafts)], ['flame', 'дней в игре', num(r.days)]);
    list.push(['medal', 'достижений', r.achievements.length]);
    return `<div class="pc pp">${hero(r.showcase && r.showcase.find(Boolean), r.emoji)}
        <div class="pp-side"><div class="pp-id"><span class="pc-ava prof-badge">${esc(r.emoji)}</span><span class="pp-nm"><b>${esc(r.nick)}</b><span class="pc-rk">${esc(rank)}</span></span></div>
          <div class="pc-big pp-big"><div><span>${Ui.get('trophy')}</span><b>${num(r.trophies)}</b><small>трофеев</small></div></div>
          <div class="pp-club">${r.club ? `${esc(r.club.emoji)} ${esc(r.club.name)}` : 'Без клуба'}</div></div></div>
      ${stats(list)}
      <h3 class="section-label pp-h">Витрина</h3>${slots(r.showcase || [], false)}
      <h3 class="section-label pp-h">Достижения</h3>${r.achievements.length ? `<div class="pp-ach">${r.achievements.map((a) => `<span class="pc-st"><i>${Ui.get('medal')}</i><small>${esc(a)}</small></span>`).join('')}</div>` : '<p class="social-note">Пока нет достижений</p>'}`;
  }
  // чужой профиль — полноэкранный слой поверх игры: экран не меняется, поэтому онлайн-матч в лобби не обрывается
  let layer = null;
  function closeLayer() { if (!layer) return; const l = layer; layer = null; l.classList.add('out'); document.body.classList.remove('pp-open'); setTimeout(() => l.remove(), 200); }
  function showLayer(html) {
    if (!layer) {
      layer = document.createElement('div'); layer.className = 'pp-layer';
      layer.innerHTML = `<header class="pp-top"><button class="back" data-pp-close="1" aria-label="Назад">←</button><b>Профиль</b><span></span></header><div class="pp-body"></div>`;
      document.body.appendChild(layer); document.body.classList.add('pp-open');
    }
    $('.pp-body', layer).innerHTML = html; $('.pp-body', layer).scrollTop = 0;
  }
  async function open(profile) {
    if (!/^[a-f0-9]{32}$/.test(profile || '')) return;
    Modal.close();
    showLayer('<div class="pp-msg"><div class="bd-spin"></div><p>Загружаем профиль…</p></div>');
    try {
      const r = await Board.post('/social', { act: 'profile', handle: profile });
      if (!layer) return;
      if (!r.ok) throw Error('unavailable');
      if (r.private) { showLayer('<div class="pp-msg"><span class="pp-ph">🔒</span><h2>Профиль закрыт</h2><p>Игрок ограничил просмотр своего профиля.</p></div>'); return; }
      showLayer(layout(r) + (!r.showcaseEnabled ? '<p class="social-note">Витрина появится после серверной проверки коллекции.</p>' : ''));
    } catch (_) { if (layer) showLayer('<div class="pp-msg"><h2>Профиль недоступен</h2><p>Попробуй позже.</p></div>'); }
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-pp-close]')) { e.preventDefault(); closeLayer(); } });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-social-fav],[data-social-slot],[data-social-clear],[data-social-move],[data-profile],[data-social-card],[data-social-room]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.hasAttribute('data-social-fav')) { toggle(b.dataset.socialFav); b.setAttribute('aria-pressed', String(favorite(b.dataset.socialFav))); b.classList.toggle('on', favorite(b.dataset.socialFav)); if (!favorite(b.dataset.socialFav) && document.querySelector('[data-glfavorites].on')) b.closest('.cl-cell')?.remove(); }
    if (b.hasAttribute('data-social-slot')) choose(+b.dataset.socialSlot);
    if (b.hasAttribute('data-social-clear')) { const keys = active(); keys[+b.dataset.socialClear] = null; change({ type: 'showcase', keys }); }
    if (b.hasAttribute('data-social-move')) { const keys = active(), i = +b.dataset.socialMove, j = (i + 1) % 3; [keys[i], keys[j]] = [keys[j], keys[i]]; change({ type: 'showcase', keys }); }
    if (b.dataset.profile) open(b.dataset.profile);
    if (b.dataset.socialCard) detail(b.dataset.socialCard);
    if (b.dataset.socialRoom) Board.post('/room', { act: 'profile', room: b.dataset.socialRoom }).then(r => r.profile ? open(r.profile) : toast('Профиль пока недоступен')).catch(() => toast('Не удалось загрузить профиль'));
  }, true);
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-profile][role="button"]')) { e.preventDefault(); open(e.target.dataset.profile); } });
  document.addEventListener('change', e => { if (e.target.matches('[data-social-privacy]')) change({ type: 'privacy', value: e.target.checked }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(false); });
  window.addEventListener('online', () => sync(false));
  return { favorite, available, active, toggle, sync, render, open, beforeSpend, handle: () => handle, state, hero, closeLayer, layerOpen: () => !!layer };
})();
