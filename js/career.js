// «Угадай карьеру»: показываем клубы игрока по годам, сначала скрытые. Каждая ошибка открывает ещё один клуб.
// Угадал с первой открытой строки — максимум очков.
'use strict';

const Career = (() => {
  const MAX_TRIES = 6;
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, '');

  // У игрока в базе имён может не быть — ищем по name в PLAYERS для поля ввода (подсказки),
  // но угадывать можно любого из CAREERS.
  const NAMES = CAREERS.map((c) => c.name);

  let answer = null, tries = 0, shown = 1, over = false, selIdx = 0, suggestions = [], order = [];

  function next() {
    const C = Store.d.career || (Store.d.career = { idx: 0, solved: {}, streak: 0, best: 0 });
    if (!order.length || C.idx >= order.length) {
      order = shuffle(CAREERS.map((_, i) => i), mulberry32(Date.now() & 0xffff));
      C.idx = 0;
    }
    answer = CAREERS[order[C.idx]];
    tries = 0; shown = 1; over = false;
    Screens.show('career');
    $('#career-sub').textContent = `Серия: ${C.streak} · рекорд: ${C.best}`;
    $('#career-field').value = '';
    $('#career-field').disabled = false;
    hideSuggest();
    renderPath();
    renderTries();
  }

  function renderPath() {
    const box = $('#career-path');
    box.innerHTML = answer.path.map((row, i) => {
      const open = over || i < shown;
      return `<div class="step ${open ? 'open' : 'hidden-step'} ${over && i === answer.path.length - 1 ? 'last' : ''}">
        <span class="yr">${esc(row[1])}</span>
        <span class="club">${open ? esc(row[0]) : '?????'}</span>
      </div>`;
    }).join('');
    $('#career-hidden').textContent = over ? '' : `Скрыто клубов: ${answer.path.length - shown}`;
  }

  function renderTries() {
    $('#career-tries').textContent = `Попыток: ${tries} из ${MAX_TRIES}`;
  }

  function hideSuggest() { $('#career-suggest').hidden = true; suggestions = []; }

  function updateSuggest() {
    const q = norm($('#career-field').value.trim());
    if (q.length < 2) { hideSuggest(); return; }
    const uniq = [...new Set(NAMES)];
    suggestions = uniq.filter((n) => norm(n).includes(q)).slice(0, 6);
    const box = $('#career-suggest');
    if (!suggestions.length) { box.innerHTML = '<button type="button" disabled>Нет в базе</button>'; box.hidden = false; return; }
    selIdx = 0;
    box.innerHTML = suggestions.map((n, i) => `<button type="button" data-n="${esc(n)}" class="${i ? '' : 'sel'}"><span>${esc(n)}</span></button>`).join('');
    box.hidden = false;
  }

  function submit(name) {
    if (over || !name) return;
    hideSuggest();
    $('#career-field').value = '';
    tries++;
    if (norm(name) === norm(answer.name)) { finish(true); return; }
    Sound.play('bad'); haptic('bad');
    toast(`Не ${name}. Открываю ещё клуб.`);
    if (shown < answer.path.length) shown++;
    if (tries >= MAX_TRIES) { finish(false); return; }
    renderPath();
    renderTries();
    $('#career-field').focus();
  }

  function finish(won) {
    over = true;
    $('#career-field').disabled = true;
    const C = Store.d.career;
    renderPath();
    renderTries();
    let reward = 0;
    if (won) {
      reward = Math.max(10, 70 - (tries - 1) * 12);
      C.solved[answer.name] = tries;
      C.streak++;
      if (C.streak > C.best) C.best = C.streak;
      Sound.play('goal'); haptic('ok'); confetti();
    } else {
      C.streak = 0;
      Sound.play('lose'); haptic('bad');
    }
    C.idx++;
    Store.save();
    if (reward) Coins.add(reward);
    setTimeout(() => Modal.open(
      `<h2>${won ? 'Это он!' : 'Не угадал'}</h2>
       <div class="player-card"><div class="pname">${esc(answer.flag)} ${esc(answer.name)}</div>
         <div class="pmeta">${esc(answer.nat)} · клубов в карьере: ${answer.path.length}</div></div>
       <p>${won ? `Угадал с ${tries}-й попытки. Серия: ${C.streak}.` : 'Серия обнулилась. Попробуй следующего.'}</p>
       ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
       ${quoteHtml(won ? 'win' : 'lose')}`,
      [
        { label: 'Следующий →', onClick: next },
        { label: 'В меню', cls: 'ghost', onClick: () => App.home() },
      ],
    ), 500);
  }

  function bind() {
    const field = $('#career-field');
    field.addEventListener('input', updateSuggest);
    field.addEventListener('keydown', (e) => {
      if ($('#career-suggest').hidden || !suggestions.length) { if (e.key === 'Enter') { e.preventDefault(); submit(field.value.trim()); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selIdx = (selIdx + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
        $$('#career-suggest button').forEach((b, i) => b.classList.toggle('sel', i === selIdx));
      } else if (e.key === 'Enter') { e.preventDefault(); submit(suggestions[selIdx]); }
      else if (e.key === 'Escape') hideSuggest();
    });
    $('#career-suggest').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-n]');
      if (b) submit(b.dataset.n);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#career .guess-input')) hideSuggest(); });
  }

  return { bind, start: next, count: CAREERS.length };
})();
