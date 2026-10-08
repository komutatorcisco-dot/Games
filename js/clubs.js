// Клубы игроков, как в Brawl Stars: до 30 человек, общая цель недели — победы всех участников.
// Данные хранит сервер (POST /club). Вступить — по коду или по ссылке ?startapp=cl_<код>.
// Награда за цель недели (эпический пак) выдаётся каждому участнику один раз за неделю: Store.d.clubGot = [неделя…].
'use strict';

const Clubs = (() => {
  const EMO = ['⚽', '🦁', '🦅', '🐺', '🔥', '⚡', '👑', '🐉', '🛡️', '🎯'];
  let data = null, busy = false, loading = false, failed = false; // data: null — не в клубе
  const api = () => typeof Board !== 'undefined' && Board.ready();
  async function call(body) {
    if (!api()) throw new Error('offline');
    const r = await Board.post('/club', body);
    if (!r.ok) throw new Error(r.error || 'Ошибка');
    data = r.club; return data;
  }
  const box = () => $('#club-body');
  function open() { Modal.close(); Screens.show('myclub'); loading = true; failed = false; render(); load(); }
  async function load() {
    try { await Promise.race([call({ act: 'get' }), new Promise((_, bad) => setTimeout(() => bad(new Error('timeout')), 10000))]); failed = false; } catch (e) { failed = true; }
    loading = false; render();
  }

  function render() {
    const b = box(); if (!b) return;
    if (!api()) { b.innerHTML = `<div class="bd-empty"><span>${Ui.get('users')}</span><h3>Клубы работают в Telegram</h3><p>Открой игры через бота @JacksonGamesbot.</p></div>`; return; }
    if (loading) { b.innerHTML = '<div class="bd-empty"><div class="bd-spin"></div><p>Загружаем клуб…</p></div>'; return; }
    if (failed && !data) { b.innerHTML = `<div class="bd-empty"><span>${Ui.get('signal')}</span><h3>Не удалось загрузить клуб</h3><p>Проверь интернет и попробуй ещё раз.</p><button class="btn gold" data-cl="retry">Обновить</button></div>`; return; }
    if (!data) {
      b.innerHTML = `<div class="cl-hero"><span class="cl-emb">${Ui.get('users')}</span><h3>Играй командой</h3>
          <p>Клуб — до 30 игроков. Каждую неделю у клуба общая цель: победы всех участников. Дошли до цели — каждый получает эпический пак.</p></div>
        <div class="cl-card"><b>Создать свой клуб</b>
          <input id="cl-name" maxlength="20" placeholder="Название клуба" autocomplete="off">
          <div class="cl-emos">${EMO.map((e, i) => `<button data-clemo="${e}" class="${i ? '' : 'on'}">${e}</button>`).join('')}</div>
          <button class="btn gold" data-cl="create">Создать</button></div>
        <div class="cl-card"><b>Вступить по коду</b><div class="cl-join"><input id="cl-code" maxlength="6" placeholder="КОД" autocomplete="off" autocapitalize="characters"><button class="btn" data-cl="join">Вступить</button></div>
          <small>Код клуба есть у его участников — или вступай по ссылке-приглашению.</small></div>`;
      return;
    }
    const c = data, pct = Math.min(100, Math.round((c.wins / c.goal) * 100)), got = (Store.d.clubGot || []).includes(c.week);
    b.innerHTML = `<div class="cl-top"><span class="cl-big">${esc(c.emoji)}</span><div><h3>${esc(c.name)}</h3><small>Код <b>${esc(c.code)}</b> · ${c.members.length}/${c.max} игроков</small></div></div>
      <div class="cl-goal"><div class="cl-gh"><b>Цель недели</b><small>${c.wins} / ${c.goal} побед</small></div><span class="cl-bar"><i style="width:${pct}%"></i></span>
        ${c.wins >= c.goal ? (got ? '<p class="cl-ok">Награда получена ✓ Новая цель — в понедельник</p>' : '<button class="btn gold" data-cl="claim">Забрать эпический пак</button>') : `<p class="cl-note">Ещё ${c.goal - c.wins} побед всем клубом — и каждый получит эпический пак</p>`}</div>
      <button class="btn gold cl-inv" data-cl="invite">${Ui.get('send')} Позвать в клуб</button>
      <h4 class="cl-h">Участники</h4>
      <div class="cl-list">${c.members.map((m, i) => `<div class="cl-m ${m.me ? 'me' : ''}"><b>${i + 1}</b><span>${esc(m.emoji)}</span><em>${esc(m.nick)}</em><small>${m.trophies} 🏆</small><strong>${m.wins}<i>побед</i></strong></div>`).join('')}</div>
      <button class="btn ghost cl-leave" data-cl="leave">Выйти из клуба</button>`;
  }

  async function act(k, el) {
    if (busy) return;
    const run = async (body, ok) => { busy = true; try { await call(body); if (ok) toast(ok); Sound.play('coin'); } catch (e) { toast(e.message === 'offline' ? 'Нет связи с сервером' : e.message); } busy = false; render(); };
    if (k === 'retry') { loading = true; render(); return load(); }
    if (k === 'create') {
      const name = ($('#cl-name').value || '').trim(); if (name.length < 2) { toast('Название — от 2 букв'); return; }
      const emo = ($('.cl-emos .on') || {}).dataset ? $('.cl-emos .on').dataset.clemo : '⚽';
      return run({ act: 'create', name, emoji: emo }, 'Клуб создан! Позови друзей');
    }
    if (k === 'join') { const code = ($('#cl-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 6) { toast('В коде 6 символов'); return; } return run({ act: 'join', code }, 'Ты в клубе!'); }
    if (k === 'leave') {
      Modal.open('<h3 class="sk-h">Выйти из клуба?</h3><p class="sk-p">Вернуться можно по коду или ссылке.</p>', [{ label: 'Выйти', onClick: () => run({ act: 'leave' }, 'Ты вышел из клуба') }, { label: 'Остаться', cls: 'ghost' }]);
      return;
    }
    if (k === 'invite' && data) { Duel.share(`cl_${data.code}`, `${data.emoji} Вступай в мой клуб «${data.name}» в футбольных играх «Стариков Джексонов»! Код: ${data.code}`); return; }
    if (k === 'claim' && data && data.wins >= data.goal) {
      const g = Store.d.clubGot || (Store.d.clubGot = []); if (g.includes(data.week)) return;
      g.push(data.week); Store.save(); render();
      Rewards.openDrop({ title: `КЛУБ «${data.name.toUpperCase()}» · ЦЕЛЬ НЕДЕЛИ`, minLevel: 2 });
    }
  }
  function bind() {
    const b = box(); if (!b) return;
    b.addEventListener('click', (e) => {
      const em = e.target.closest('[data-clemo]'); if (em) { $$('.cl-emos button', b).forEach((x) => x.classList.toggle('on', x === em)); Sound.play('tap'); return; }
      const a = e.target.closest('[data-cl]'); if (a) { Sound.play('tap'); act(a.dataset.cl, a); }
    });
  }
  // ссылка-приглашение: cl_ABC123
  function deep(p) {
    const m = /^cl_([A-Z0-9]{6})$/.exec(p || ''); if (!m) return false;
    open(); setTimeout(() => { if (!data || data.code !== m[1]) call({ act: 'join', code: m[1] }).then(() => { toast('Ты вступил в клуб!'); render(); }).catch((e) => toast(e.message)); }, 600);
    return true;
  }
  return { open, bind, deep, load };
})();
