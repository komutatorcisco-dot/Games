// «Забытые легенды»: испытания за особые карточки (первая — Марио Балотелли 89).
// Задания считает и карточку выдаёт сервер (/legend), один раз на игрока. Устройство только показывает прогресс
// и после подтверждения сервера кладёт карточку в коллекцию. Без ответа сервера карточка не выдаётся.
// Если связь оборвалась после выдачи, при следующей проверке сервер ответит «уже выдана» — карточка вернётся.
// Walkout — полноэкранный выход игрока; повторный просмотр ничего не выдаёт.
// Сохранение: Store.d.legends = { st: последний ответ сервера, draftSent: [id драфтов] }.
'use strict';

const Walkout = (() => {
  let el = null, onDone = null, fallback = 0;
  const ROOT = '../../'; // страница выхода лежит в prototypes/balotelli/
  // Кнопки — в самой игре поверх iframe: в Telegram на iPhone касания внутри iframe иногда не доходят.
  // Сцене уходят только команды (skip/replay), назад приходит состояние (play/end).
  function setUI(ui) { if (el) el.dataset.ui = ui; }
  function send(cmd) { const f = el && $('.wo-frame', el); if (f && f.contentWindow) f.contentWindow.postMessage({ wo: cmd }, '*'); }
  function play(key, done) {
    const c = Cards.get(key); if (!c || !c.walkout || el) return;
    onDone = done || null;
    const q = new URLSearchParams({ v: '20261013-fc1', embed: '1', n: c.name, r: String(c.r), pos: c.pos, nat: c.nat || '', rar: c.rar, series: c.series || '', crest: c.crestUrl ? ROOT + c.crestUrl : '', face: c.faceUrl ? ROOT + c.faceUrl : '' });
    el = document.createElement('div');
    el.className = 'wo-wrap'; el.dataset.ui = 'play';
    el.innerHTML = `<iframe class="wo-frame" title="Выход игрока" allow="autoplay" src="prototypes/${esc(c.walkout)}/index.html?${q}"></iframe>
      <button class="wo-x" data-wo="close" aria-label="Закрыть">✕</button>
      <div class="wo-bar"><button class="wo-b" data-wo="skip">Пропустить</button><button class="wo-b" data-wo="replay">Повторить</button><button class="wo-b gold" data-wo="close">К карточке</button></div>`;
    document.body.appendChild(el); Cover.on();
    // если сцена не сообщила о конце (не загрузилась, старая версия) — всё равно дать выйти
    clearTimeout(fallback); fallback = setTimeout(() => setUI('end'), 15000);
    if (typeof Music !== 'undefined' && Music.duck) Music.duck(true);
  }
  function close() {
    if (!el) return;
    clearTimeout(fallback); Cover.off();
    el.classList.add('out'); const e = el; el = null;
    setTimeout(() => e.remove(), 250);
    if (typeof Music !== 'undefined' && Music.duck) Music.duck(false);
    const cb = onDone; onDone = null; if (cb) cb();
  }
  function act(e) {
    const b = e.target.closest('.wo-wrap [data-wo]'); if (!b || !el) return;
    e.preventDefault();
    const a = b.dataset.wo;
    if (a === 'close') close();
    else if (a === 'skip') { send('skip'); setUI('end'); }
    else if (a === 'replay') { send('replay'); setUI('play'); clearTimeout(fallback); fallback = setTimeout(() => setUI('end'), 15000); }
  }
  document.addEventListener('click', act);
  addEventListener('message', (e) => {
    if (!el || !e.data || e.source !== $('.wo-frame', el).contentWindow) return;
    if (e.data.walkout === 'done') close();
    else if (e.data.walkout === 'state' && (e.data.ui === 'play' || e.data.ui === 'end')) { setUI(e.data.ui); if (e.data.ui === 'end') clearTimeout(fallback); }
  });
  return { play, close, open: () => !!el };
})();

const Legends = (() => {
  const CH = {
    'fl:balotelli': {
      card: 'FL:mario-balotelli', title: 'Забытые легенды: Марио Балотелли',
      desc: 'Три задания в турнирах драфта — уникальная карточка 89 с полноценным выходом. Без срока, из паков не выпадает.',
      tasks: [
        { k: 'matches', t: 'Сыграй 10 матчей в турнирах драфта', hint: 'Засчитывается каждый доигранный матч турнира' },
        { k: 'wins', t: 'Одержи 5 побед в турнирах драфта', hint: 'Победа по пенальти тоже считается' },
        { k: 'italians', t: 'Заверши драфт с 7+ итальянцами в стартовых 11', hint: 'Запасные не считаются' },
      ],
    },
  };
  const ID = 'fl:balotelli';
  const S = () => { const d = Store.d; if (!d.legends || typeof d.legends !== 'object') d.legends = {}; if (!Array.isArray(d.legends.draftSent)) d.legends.draftSent = []; return d.legends; };
  let busy = false, loading = null;

  // ---------- сервер ----------
  const online = () => typeof Board !== 'undefined' && Board.ready();
  async function call(body) {
    if (!online()) return { ok: false, offline: true, error: 'Открой игру в Telegram — прогресс считает сервер' };
    try { const r = await Board.post('/legend', body); return r || { ok: false, error: 'Пустой ответ сервера' }; }
    catch (e) { return { ok: false, offline: true, error: 'Нет связи с сервером' }; }
  }
  // сервер подтвердил выдачу — карточка должна быть в коллекции (идемпотентно)
  function ensureCard(key) {
    if (Cards.owned(key) > 0) return false;
    Cards.add([key]); return true;
  }
  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      await flushDraft();
      const r = await call({ act: 'status' });
      if (r.ok) { S().st = { tasks: r.tasks, need: r.need, done: r.done, claimed: r.claimed, at: Date.now() }; if (r.claimed && ensureCard(r.card)) toast('Карточка Балотелли восстановлена с сервера'); Store.save(); }
      else if (r.disabled) { S().st = null; Store.save(); }
      const old = document.querySelector('.fx-list [data-legend]'); if (old) { const html = listCard(); if (html) old.outerHTML = html; }
      loading = null; return r;
    })();
    return loading;
  }

  // ---------- задание «7 итальянцев»: отправляем завершённый драфт (стартовые 11) ----------
  function onDraft(draftId, xi) {
    const names = xi.map((p) => p && p.name), ita = xi.filter((p) => p && p.nat === 'Италия').length;
    if (names.some((n) => !n) || ita < 7) return; // на сервер — только кандидаты в задание
    const L = S(); L.pendingDraft = { id: draftId, players: names }; Store.save();
    flushDraft().then(() => { if (S().st && S().st.tasks && S().st.tasks.italians) toast('Задание «Забытых легенд»: 7 итальянцев — выполнено'); });
  }
  async function flushDraft() {
    const L = S(), p = L.pendingDraft; if (!p) return;
    if (L.draftSent.includes(p.id)) { L.pendingDraft = null; Store.save(); return; }
    const r = await call({ act: 'draft', players: p.players });
    if (r.ok) { L.draftSent = L.draftSent.concat(p.id).slice(-20); L.pendingDraft = null; L.st = { tasks: r.tasks, need: r.need, done: r.done, claimed: r.claimed, at: Date.now() }; Store.save(); }
    else if (r.disabled) { L.pendingDraft = null; Store.save(); }
  }

  // ---------- выдача: один раз, только после ответа сервера ----------
  async function claim(id = ID) {
    const ch = CH[id]; if (!ch || busy) return;
    busy = true; paint(id);
    const r = await call({ act: 'claim' });
    busy = false;
    if (!r.ok) { paint(id); return toast(r.error || 'Пока нельзя забрать'); }
    S().st = { tasks: r.tasks, need: r.need, done: r.done, claimed: true, at: Date.now() };
    const fresh = ensureCard(ch.card); Store.save();
    Modal.close();
    if (!fresh && r.already) toast('Карточка уже у тебя — можно посмотреть выход ещё раз');
    Sound.play('goal'); haptic('ok');
    Walkout.play(ch.card, () => { if (typeof Rewards !== 'undefined') Rewards.refresh(); Cards.details(ch.card); });
  }

  // ---------- экран испытания ----------
  const bar = (v, n) => `<span class="gl-bar"><i style="width:${n ? Math.round(Math.min(1, v / n) * 100) : 0}%"></i></span>`;
  function body(id) {
    const ch = CH[id], c = Cards.get(ch.card), st = S().st, got = Cards.owned(ch.card) > 0 && st && st.claimed;
    const need = (st && st.need) || { matches: 10, wins: 5, italians: 7 }, t = (st && st.tasks) || null;
    const rows = ch.tasks.map((x) => {
      const n = x.k === 'italians' ? 1 : need[x.k], v = t ? t[x.k] : null, ok = v !== null && v >= n;
      return `<li class="${ok ? 'ok' : ''}"><i>${ok ? '✓' : ''}</i><span><b>${esc(x.t)}</b><small>${esc(x.hint)}</small>${x.k === 'italians' ? '' : bar(v || 0, n)}</span><em>${v === null ? '—' : x.k === 'italians' ? (ok ? 'готово' : 'нет') : `${Math.min(v, n)}/${n}`}</em></li>`;
    }).join('');
    const note = !online() ? '<p class="fl-note">Прогресс считает сервер — открой игру в Telegram.</p>'
      : !st ? '<p class="fl-note">Проверяем прогресс на сервере…</p>' : '';
    const btn = got ? '<button class="btn gold" data-fl="watch">Посмотреть выход</button><button class="btn ghost" data-fl="card">К карточке</button>'
      : st && st.done ? `<button class="btn gold fl-claim" data-fl="claim" ${busy ? 'disabled' : ''}>${busy ? 'Проверяем…' : 'Забрать Балотелли'}</button>`
      : '';
    return `<div class="cd fl-ch"><div class="fl-art">${Cards.html(c, { w: 150, locked: false })}</div><h2>${esc(ch.title)}</h2><p class="cd-m">${esc(ch.desc)}</p>
      <ul class="fl-tasks">${rows}</ul>${note}<p class="cd-m fl-small">Задания выполняются в любом порядке, прогресс хранится на сервере. Выход из недоигранного матча не засчитывается.</p>
      <div class="fl-act">${btn}</div></div>`;
  }
  let openId = null;
  function paint(id) { if (openId !== id || $('#modal').hidden) return; const box = $('#modal-card .fl-ch'); if (box) box.outerHTML = body(id); }
  function open(id = ID) {
    if (!CH[id]) return;
    openId = id;
    Modal.open(body(id), [{ label: 'Закрыть', cls: 'ghost' }]);
    if (typeof Tilt !== 'undefined') Tilt.attach($('#modal-card .fl-art'), { max: 16 });
    refresh().then(() => paint(id));
  }
  // карточка в списке испытаний (рядом с «Будущими звёздами»)
  function listCard() {
    const ch = CH[ID], st = S().st;
    // карточка испытания видна, только когда сервер его включил (или в отладке ?fl=1)
    if (!st && !/[?&]fl=1/.test(location.search)) return '';
    const c = Cards.get(ch.card), t = (st && st.tasks) || { matches: 0, wins: 0, italians: 0 }, got = st && st.claimed;
    const n = (t.matches >= 10 ? 1 : 0) + (t.wins >= 5 ? 1 : 0) + (t.italians ? 1 : 0);
    return `<div class="fx-card grp c-pl fl-card ${got ? 'done' : ''}" data-legend="${ID}" role="button" tabindex="0">
      <div class="fx-h"><span class="fx-ico"><img class="gl-series" src="img/brand/forgotten-legends.svg" alt=""></span><b>${esc(ch.title)}</b></div>
      <div class="fx-m"><div class="fx-l"><p>${esc(ch.desc)}</p><div class="fx-prog"><span class="fx-seg"><i class="${t.matches >= 10 ? 'on' : ''}"></i><i class="${t.wins >= 5 ? 'on' : ''}"></i><i class="${t.italians ? 'on' : ''}"></i></span><small>${n} из 3 заданий</small></div>
        <div class="fx-rw"><small>Награда</small><b>${esc(c.name)} · ${esc(Cards.RAR[c.rar].n)}</b></div></div>
        <div class="fx-art"><span class="fx-cardart">${Cards.html(c, { w: 104 })}</span>${got ? '<i class="fx-gok">✓</i>' : ''}</div></div>
      <div class="fx-f">${got ? '<span class="fx-ok">✓ Получено</span>' : st && st.done ? '<span class="fx-ok">Можно забрать</span>' : '<span><i class="fx-ic">⊘</i>Один раз</span>'}<span class="fx-left">Без срока</span></div></div>`;
  }
  // готова ли награда (для значков)
  const ready = () => { const st = S().st; return st && st.done && !st.claimed ? 1 : 0; };

  document.addEventListener('click', (e) => {
    const lg = e.target.closest('[data-legend]'); if (lg) { Sound.play('tap'); return open(lg.dataset.legend); }
    const wo = e.target.closest('[data-walkout]'); if (wo) { Modal.close(); return Walkout.play(wo.dataset.walkout, () => Cards.details(wo.dataset.walkout)); }
    const a = e.target.closest('#modal-card [data-fl]'); if (!a) return;
    const ch = CH[openId || ID];
    if (a.dataset.fl === 'claim') return claim(openId || ID);
    if (a.dataset.fl === 'watch') { Modal.close(); return Walkout.play(ch.card, () => Cards.details(ch.card)); }
    if (a.dataset.fl === 'card') { Modal.close(); return Cards.details(ch.card); }
  });
  // при запуске: подтянуть прогресс и вернуть карточку, если выдача прошла, а ответ потерялся
  setTimeout(() => { if (online()) refresh(); }, 4000);
  const enabled = () => !!S().st || /[?&]fl=1/.test(location.search);
  return { open, claim, refresh, onDraft, listCard, ready, enabled, CH };
})();
