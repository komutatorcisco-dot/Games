// «Тики-Така-Тоу» (как на box2box): сетка 3×3, у строк и столбцов — клубы.
// В клетку нужно вписать игрока, который играл за оба клуба. Каждого игрока можно назвать один раз.
// Соло: заполни все 9 клеток, 3 ошибки — конец. Вдвоём: крестики-нолики, неверный ответ передаёт ход.
'use strict';

const TTT = (() => {
  const clubOf = (s) => s.replace(' (аренда)', '');
  const NAMES = [...new Set(CAREERS.map((c) => c.name))];
  // клуб → множество игроков
  const BY_CLUB = new Map();
  CAREERS.forEach((c) => c.path.forEach(([club]) => {
    const k = clubOf(club);
    if (!BY_CLUB.has(k)) BY_CLUB.set(k, new Set());
    BY_CLUB.get(k).add(c.name);
  }));
  const BIG = [...BY_CLUB.keys()].filter((k) => BY_CLUB.get(k).size >= 4);
  const both = (a, b) => [...BY_CLUB.get(a)].filter((n) => BY_CLUB.get(b).has(n));

  let rows = [], cols = [], cells = [], sel = -1, used = new Set(), mode = 'solo', lives = 3, turn = 0, over = false, picker = null;

  // Есть ли способ заполнить все 9 клеток разными игроками (перебор с возвратом).
  function solvable(r, c) {
    const opts = [];
    for (const a of r) for (const b of c) opts.push(both(a, b));
    const taken = new Set();
    const go = (i) => {
      if (i === 9) return true;
      for (const n of opts[i]) {
        if (taken.has(n)) continue;
        taken.add(n);
        if (go(i + 1)) return true;
        taken.delete(n);
      }
      return false;
    };
    return go(0);
  }

  function makeGrid() {
    for (let t = 0; t < 4000; t++) {
      const six = shuffle(BIG, Math.random).slice(0, 6);
      const r = six.slice(0, 3), c = six.slice(3);
      let ok = true;
      for (const a of r) for (const b of c) if (!both(a, b).length) ok = false;
      if (ok && solvable(r, c)) return [r, c];
    }
    return null;
  }

  function start(m = 'solo') {
    mode = m;
    if (m === 'duo') askNames('Тики-Така-Тоу вдвоём', () => begin());
    else begin();
  }

  function begin() {
    const g = makeGrid();
    if (!g) { toast('Не получилось собрать сетку, попробуй ещё раз'); return; }
    [rows, cols] = g;
    cells = Array(9).fill(null); // {by: 0|1, name}
    used = new Set(); lives = 3; turn = 0; over = false; sel = -1;
    Screens.show('ttt');
    $('#ttt-field').disabled = true;
    picker && picker.clear();
    render();
  }

  function render() {
    const D = Store.d.duel;
    $('#ttt-title').textContent = mode === 'duo' ? 'Тики-Така-Тоу вдвоём' : 'Тики-Така-Тоу';
    $('#ttt-sub').textContent = mode === 'duo'
      ? (over ? 'Игра окончена' : `Ходит ${turn === 0 ? D.a + ' (✕)' : D.b + ' (○)'}`)
      : `Ошибок осталось: ${lives} · заполнено ${cells.filter(Boolean).length}/9`;
    let html = '<div class="tg-corner"></div>';
    cols.forEach((c) => { html += `<div class="tg-head">${esc(c)}</div>`; });
    rows.forEach((r, ri) => {
      html += `<div class="tg-head row">${esc(r)}</div>`;
      cols.forEach((c, ci) => {
        const i = ri * 3 + ci, v = cells[i];
        const cls = ['tg-cell', v ? `filled p${v.by}` : '', sel === i ? 'sel' : ''].join(' ');
        const mark = v ? (mode === 'duo' ? (v.by === 0 ? '✕' : '○') : '') : '';
        const reveal = over && !v ? `<small class="ans">${esc(both(r, c)[0])}</small>` : '';
        html += `<button class="${cls}" data-i="${i}" ${v || over ? 'disabled' : ''}>${mark ? `<b>${mark}</b>` : ''}${v ? `<span>${esc(v.name)}</span>` : reveal}</button>`;
      });
    });
    $('#ttt-grid').innerHTML = html;
    $('#ttt-hint').textContent = over ? '' : sel < 0 ? 'Выбери клетку' : `Кто играл за ${rows[Math.floor(sel / 3)]} и ${cols[sel % 3]}?`;
  }

  function choose(i) {
    if (over || cells[i]) return;
    sel = i;
    $('#ttt-field').disabled = false;
    render();
    $('#ttt-field').focus();
  }

  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function submit(name) {
    if (over || sel < 0) return;
    const r = rows[Math.floor(sel / 3)], c = cols[sel % 3];
    const ok = !used.has(name) && BY_CLUB.get(r).has(name) && BY_CLUB.get(c).has(name);
    if (ok) {
      cells[sel] = { by: turn, name };
      used.add(name);
      Sound.play('kick'); haptic('tap');
    } else {
      Sound.play('bad'); haptic('bad');
      toast(used.has(name) ? `${name} уже был` : `${name} не играл за оба клуба`);
      if (mode === 'solo') lives--;
    }
    sel = -1;
    $('#ttt-field').disabled = true;

    if (mode === 'duo') {
      const win = LINES.find((l) => l.every((i) => cells[i] && cells[i].by === turn));
      if (win) return finish(turn);
      if (cells.every(Boolean)) return finish(-1);
      turn = 1 - turn;
    } else {
      if (cells.every(Boolean)) return finish(1);
      if (lives <= 0) return finish(0);
    }
    render();
  }

  function finish(result) {
    over = true;
    render();
    const D = Store.d.duel;
    let title, reward = 0;
    if (mode === 'duo') {
      title = result === -1 ? 'Ничья' : `${result === 0 ? D.a : D.b} победил!`;
    } else if (result === 1) {
      title = 'Вся сетка твоя!';
      reward = 100;
      Store.d.ttt.wins++;
      Profile.bump('ttt', 30);
    } else {
      title = `Заполнено ${cells.filter(Boolean).length} из 9`;
      reward = cells.filter(Boolean).length * 5;
    }
    Store.save();
    if (reward) Coins.add(reward);
    if (result === 1 || (mode === 'duo' && result !== -1)) { Sound.play('goal'); confetti(); } else Sound.play('lose');
    setTimeout(() => Modal.open(
      `<h2>${esc(title)}</h2><p>В пустых клетках показан один из правильных ответов.</p>
       ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}`,
      [{ label: 'Новая сетка', onClick: () => begin() }, { label: 'Посмотреть ответы', cls: 'ghost' }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }],
    ), 600);
  }

  function skip() {
    if (over) return;
    if (mode === 'duo') { turn = 1 - turn; sel = -1; $('#ttt-field').disabled = true; render(); }
    else finish(0);
  }

  function bind() {
    $('#ttt-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.tg-cell');
      if (b && !b.disabled) choose(+b.dataset.i);
    });
    picker = Picker('#ttt-field', '#ttt-suggest',
      (q, norm) => NAMES.filter((n) => norm(n).includes(q)).map((n) => ({ key: n, label: n })),
      submit);
  }

  return { bind, start, skip, clubs: BIG.length };
})();
