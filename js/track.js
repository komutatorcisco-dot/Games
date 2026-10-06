// Связь с сервером для статистики: вход в приложение, какие игры открывают и доигрывают, «Нашёл ошибку»,
// разрешение боту писать в личку и экран «Админка» (виден только админу — его назначает команда /admin в боте).
// Всё работает только в Telegram и когда в js/config.js указан адрес сервера; иначе тихо ничего не делает.
'use strict';

const Track = (() => {
  const api = () => CONFIG.api || '';
  const on = () => !!(api() && TG && TG.initData);
  const post = (path, body) => fetch(api() + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData, ...body }),
  }).then((r) => r.json());
  const ver = () => ((document.querySelector('script[src*="js/app.js"]') || {}).src || '').split('v=')[1] || '';

  // ---------- события игр ----------
  let queue = [], timer = null, cur = null;
  function push(e) {
    if (!on()) return;
    queue.push(e);
    clearTimeout(timer);
    timer = setTimeout(flush, queue.length >= 10 ? 0 : 8000);
  }
  function flush() {
    if (!on() || !queue.length) return;
    const batch = queue.splice(0, 40);
    post('/event', { events: batch }).catch(() => { queue = batch.concat(queue).slice(0, 80); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  // игру открыли: game — ключ плитки ('ng:wordle', 'act:nation'…), title — название
  function open(game, title) {
    if (!game) return;
    cur = { game, t: Date.now() };
    push({ game, kind: 'open', title: String(title || '').trim().slice(0, 40) });
  }
  // партия закончилась (вызывается из общего экрана итога)
  function end(win) {
    if (!cur) return;
    const ms = Date.now() - cur.t;
    push({ game: cur.game, kind: 'end', ms });
    if (win) push({ game: cur.game, kind: 'win', ms });
    cur.t = Date.now(); // «Ещё раз» без выхода в меню — новая партия той же игры
    Track.games = (Track.games || 0) + 1;
    if (win) wantAsk = true; // спросим про сообщения бота, когда игрок вернётся на главную
  }
  let wantAsk = false;
  function maybeAsk() { if (wantAsk) { wantAsk = false; setTimeout(askWrite, 700); } }

  // ---------- вход ----------
  async function hello(extra = {}) {
    if (!on()) return;
    try {
      const r = await post('/hello', { nick: Store.d.user.nick, platform: (TG && TG.platform) || '', version: ver(), ...extra });
      if (r && r.ok) safe('pass', () => Rewards.serverPass(r.pass));
      if (r && r.ok && !!r.admin !== !!Store.d.admin) { Store.d.admin = !!r.admin; Store.save(true); if (typeof App !== 'undefined') App.refresh(); }
    } catch (e) { /* нет сети */ }
  }

  // ---------- бот может писать в личку ----------
  // Один раз после первой победы спрашиваем, присылать ли новую игру недели и итоги рейтинга
  function askWrite() {
    const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
    const s = Store.d.ui || (Store.d.ui = {});
    if (!on() || s.askedWrite || (u && u.allows_write_to_pm) || Modal.isOpen || !TG.requestWriteAccess) return;
    s.askedWrite = true; Store.save();
    Modal.open(`<div class="ng-res"><span class="ask-ico">🔔</span><h2>Присылать новости?</h2>
        <p class="res-text">Раз в неделю бот напишет, какая новая игра вышла и кто забрал первое место в рейтинге. Без спама.</p></div>`, [
      { label: 'Да, присылать', cls: 'gold', onClick: () => {
        try { TG.requestWriteAccess((ok) => { if (ok) { hello({ writeOk: true }); toast('Готово! Бот напишет в понедельник'); } }); } catch (e) { /* старый Telegram */ }
      } },
      { label: 'Не надо', cls: 'ghost' },
    ]);
  }

  // ---------- «Нашёл ошибку» ----------
  function report() {
    if (!on()) { toast('Открой игры через бота @JacksonGamesbot, чтобы отправить сообщение'); return; }
    const last = cur ? cur.game : '';
    Modal.open(`<h2>Нашёл ошибку? 🐞</h2><p>Опиши, что случилось и что ты нажимал. Сообщение получит админ канала.</p>
      <textarea class="nick-input rep-text" id="rep-text" maxlength="1200" rows="5" placeholder="Например: в «Wordle» после третьей попытки пропала клавиатура"></textarea>`, [
      { label: 'Отправить', cls: 'gold', keepOpen: true, onClick: async () => {
        const text = ($('#rep-text').value || '').trim();
        if (text.length < 5) { toast('Напиши чуть подробнее'); return; }
        const info = [`${(TG && TG.platform) || '?'} · Telegram ${(TG && TG.version) || '?'}`, `экран: ${Screens.current}`, last && `игра: ${last}`, `версия ${ver()}`,
          `${innerWidth}×${innerHeight}`, navigator.userAgent.slice(0, 160)].filter(Boolean).join(' · ');
        try {
          const r = await post('/report', { text, info, nick: Store.d.user.nick });
          if (!r.ok) throw new Error();
          Modal.close(); toast('Спасибо! Сообщение отправлено 🙌');
        } catch (e) { toast('Не получилось отправить. Попробуй позже'); }
      } },
      { label: 'Отмена', cls: 'ghost' },
    ]);
  }

  // ---------- Админка ----------
  const sec = (ms) => (ms ? (ms >= 60000 ? `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с` : `${Math.round(ms / 1000)} с`) : '—');
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
  async function admin() {
    Modal.close();
    Screens.show('admin');
    const box = $('#admin-body');
    box.innerHTML = '<div class="bd-empty"><div class="bd-spin"></div><p>Считаем…</p></div>';
    let st;
    try { st = await post('/admin/stats', {}); if (!st.ok) throw new Error(st.error); } catch (e) { box.innerHTML = `<div class="bd-empty"><span>📡</span><p>Не удалось загрузить: ${esc(String(e.message || e))}</p></div>`; return; }
    const max = Math.max(1, ...st.dau.map((d) => d.n));
    const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    box.innerHTML = `
      <div class="ad-kpis">
        <div><b>${st.total}</b><small>игроков всего</small></div>
        <div><b>${st.dau[6].n}</b><small>заходили сегодня</small></div>
        <div><b>${st.wau}</b><small>за 7 дней</small></div>
        <div><b>+${st.new7}</b><small>новых за неделю</small></div>
        <div><b>${st.returnRate}%</b><small>вернулись хотя бы раз</small></div>
        <div><b>${st.reach}</b><small>бот может написать</small></div>
      </div>
      <h3 class="section-label">Игроки по дням</h3>
      <div class="ad-bars">${st.dau.map((d) => `<div><em>${d.n}</em><i style="height:${Math.round((d.n / max) * 100)}%"></i><small>${wd[new Date(d.day).getUTCDay()]}</small></div>`).join('')}</div>
      <h3 class="section-label">Игры за 7 дней</h3>
      ${st.games.length ? `<div class="ad-table"><div class="ad-row head"><span>Игра</span><span>Открыли</span><span>Доиграли</span><span>Игроков</span><span>Партия</span></div>
        ${st.games.map((g) => `<div class="ad-row"><span>${esc(g.title || g.game)}</span><span>${g.opens}</span><span>${g.opens ? Math.round((g.ends / g.opens) * 100) : 0}%</span><span>${g.players}</span><span>${sec(g.avgms)}</span></div>`).join('')}</div>
        <p class="ad-note">«Доиграли» — сколько открытий закончились экраном итога. Если мало — игру бросают на середине.</p>`
    : '<p class="ad-note">Пока нет данных — они появятся, когда игроки начнут играть.</p>'}
      <h3 class="section-label">Лучшие по опыту</h3>
      <div class="ad-list">${st.topXp.map((u, i) => `<div>${i + 1}. ${esc(u.emoji || '')} ${esc(u.nick)} — ${u.xp}</div>`).join('') || '<div>—</div>'}</div>
      <h3 class="section-label">Устройства</h3>
      <div class="ad-list">${st.platforms.map((p) => `<div>${esc(p.platform || 'неизвестно')} — ${p.n}</div>`).join('') || '<div>—</div>'}</div>
      <h3 class="section-label">Ошибки от игроков</h3>
      <div class="ad-reports">${st.reports.map((r) => `<div><b>${esc(r.nick || 'Игрок')}</b> <small>${ago(r.ts)}</small><p>${esc(r.text)}</p><small>${esc(r.info || '')}</small></div>`).join('') || '<p class="ad-note">Пока никто не писал 👍</p>'}</div>
      <p class="ad-note">В боте: /stats — эта же сводка, /broadcast текст — написать всем, кто разрешил.</p>`;
  }

  const game = () => (cur ? cur.game : '');
  return { game, open, end, flush, hello, report, admin, askWrite, maybeAsk, on };
})();
