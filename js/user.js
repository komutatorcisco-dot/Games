// Игрок: ник и аватарка-эмодзи (при первом входе берём имя из Telegram), недавние игры для быстрого входа.
'use strict';

const User = (() => {
  const EMOJI = ['⚽', '🧤', '🔥', '👑', '🐐', '🦁', '🚀', '🎯', '⚡', '🏆', '🧠', '😎'];
  const MAX_NICK = 16;
  const U = () => Store.d.user;

  function tgName() {
    try {
      const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
      if (u) return (u.username || [u.first_name, u.last_name].filter(Boolean).join(' ') || '').slice(0, MAX_NICK);
    } catch (e) { /* не в Telegram */ }
    return '';
  }
  const clean = (s) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NICK);

  // Окно ника: при первом входе (first) нельзя закрыть без ника
  function edit(first) {
    let emoji = U().emoji || '⚽';
    Modal.open(`<h2>${first ? 'Добро пожаловать!' : 'Профиль'}</h2>
      <p>${first ? 'Как тебя называть в играх? Ник увидят друзья, когда поделишься результатом.' : 'Ник и аватарка'}</p>
      <input class="nick-input" id="nick-in" maxlength="${MAX_NICK}" placeholder="Твой ник" value="${esc(U().nick || tgName())}" autocomplete="off">
      <div class="nick-emoji">${EMOJI.map((e) => `<button class="${e === emoji ? 'on' : ''}" data-emo="${e}">${e}</button>`).join('')}</div>`,
    [{ label: first ? 'Играть' : 'Сохранить', keepOpen: true, onClick: () => {
      const nick = clean($('#nick-in').value);
      if (!nick) { toast('Напиши ник'); return false; }
      Object.assign(U(), { nick, emoji, since: U().since || new Date().toISOString().slice(0, 10) });
      Store.save(); Modal.close(); render(); toast(`Привет, ${nick}!`);
      return true;
    } }].concat(first ? [] : [{ label: 'Отмена', cls: 'ghost', onClick: () => Modal.close() }]));
    const box = $('.nick-emoji');
    if (box) box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-emo]'); if (!b) return;
      emoji = b.dataset.emo; $$('.nick-emoji button').forEach((x) => x.classList.toggle('on', x === b));
    });
  }

  function ensure() { if (!U().nick) edit(true); }

  // Недавние игры: запоминаем плитку, по которой нажали
  function remember(el) {
    const k = el.dataset.ng ? 'ng:' + el.dataset.ng : el.dataset.act ? 'act:' + el.dataset.act : el.dataset.pz ? 'pz:' + el.dataset.pz : '';
    if (!k || /^act:(profile|daily|wheel|coins-info|home|shop|dly|music|sound)$/.test(k)) return;
    const title = ($('b', el) || {}).textContent || '', ico = ($('[data-ico]', el) || {}).dataset?.ico || '';
    if (!title) return;
    const r = Store.d.recent.filter((x) => x.k !== k);
    r.unshift({ k, t: title.trim(), ico, c1: el.style.getPropertyValue('--c1'), c2: el.style.getPropertyValue('--c2') });
    Store.d.recent = r.slice(0, 6); Store.save();
  }

  function render() {
    const u = U();
    const hi = $('#hub-hello');
    if (hi) hi.textContent = u.nick || 'Игрок';
    const av = $('#hub-ava');
    if (av) av.textContent = u.emoji || '⚽';
    const pn = $('#prof-nick');
    if (pn) pn.innerHTML = u.nick ? `<span class="hub-emo">${u.emoji}</span> <b>${esc(u.nick)}</b>${u.since ? `<small>в игре с ${u.since.split('-').reverse().join('.')}</small>` : ''}` : '';
    const box = $('#recent');
    if (box) {
      const r = Store.d.recent.filter((x) => typeof Release === 'undefined' || Release.isOut(x.k)).slice(0, 4);
      box.parentElement.hidden = !r.length;
      box.innerHTML = r.map((x) => {
        const [type, id] = x.k.split(':');
        const attr = type === 'ng' ? `data-ng="${id}"` : type === 'pz' ? `data-pz="${id}"` : `data-act="${id}"`;
        return `<button class="recent-tile" ${attr} style="--c1:${x.c1 || '#463c78'};--c2:${x.c2 || '#261b57'}"><span class="tile-ico" data-ico="${x.ico}"></span><b>${esc(x.t)}</b></button>`;
      }).join('');
      Icons.fill(box);
    }
  }

  // Подпись для «Поделиться»
  const sign = () => (U().nick ? `\n${U().emoji} ${U().nick}` : '');

  return { ensure, edit, render, remember, sign };
})();
