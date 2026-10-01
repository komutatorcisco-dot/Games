// «Тики-Така-Тоу» (как на box2box): сетка 3×3, у строк и столбцов — клубы.
// В клетку нужно вписать игрока, который подходит под строку и столбец: клуб, сборная, страна чемпионата
// или особое условие (был в аренде, 6+ клубов). Каждого игрока можно назвать один раз.
// Соло: заполни все 9 клеток, 3 ошибки — конец. Вдвоём: крестики-нолики, неверный ответ передаёт ход.
'use strict';

const TTT = (() => {
  const clubOf = (s) => s.replace(' (аренда)', '');
  const NAMES = [...new Set(CAREERS.map((c) => c.name))];

  // Категории: клуб, сборная, страна чемпионата, особые. У каждой — множество подходящих игроков.
  const CATS = new Map();
  const add = (id, t, label, html, test) => {
    const set = new Set(CAREERS.filter(test).map((c) => c.name));
    CATS.set(id, { id, t, label, html, set });
  };
  const clubsOf = (c) => new Set(c.path.map(([k]) => clubOf(k)));
  new Set(CAREERS.flatMap((c) => [...clubsOf(c)])).forEach((club) =>
    add(club, 'club', club, `${crestImg(club, 'm')}<span>${esc(club)}</span>`, (c) => clubsOf(c).has(club)));
  Object.entries(NATION_NAMES).forEach(([flag, nat]) =>
    add('nat:' + nat, 'nat', `сборная ${nat}`, `<b class="tg-flag">${flag}</b><span>Сборная: ${esc(nat)}</span>`, (c) => c.flag === flag));
  const COUNTRY_OF = new Map();
  Object.entries(LEAGUE_COUNTRY).forEach(([where, [flag, list]]) => {
    const clubs = new Set(list.split(', '));
    clubs.forEach((k) => COUNTRY_OF.set(k, where));
    add('cnt:' + where, 'cnt', `играл в ${where}`, `<b class="tg-flag">${flag}</b><span>Играл в ${esc(where)}</span>`,
      (c) => [...clubsOf(c)].some((k) => clubs.has(k)));
  });
  add('loan', 'special', 'был в аренде', '<b class="tg-flag">🔁</b><span>Был в аренде</span>', (c) => c.path.some(([k]) => k.includes('(аренда)')));
  add('many', 'special', '6+ клубов в карьере', '<b class="tg-flag">🧳</b><span>6+ клубов в карьере</span>', (c) => clubsOf(c).size >= 6);

  const cat = (id) => CATS.get(id);
  const BIG = [...CATS.values()].filter((k) => k.t === 'club' && k.set.size >= 4).map((k) => k.id);
  const NATS = [...CATS.values()].filter((k) => k.t === 'nat' && k.set.size >= 5).map((k) => k.id);
  const OTHER = [...CATS.values()].filter((k) => (k.t === 'cnt' || k.t === 'special') && k.set.size >= 5).map((k) => k.id);
  const both = (a, b) => [...cat(a).set].filter((n) => cat(b).set.has(n));
  // Пары, которые не ставим друг против друга: две сборные, две особые, клуб и его же страна.
  function clash(a, b) {
    const A = cat(a), B = cat(b);
    if (a === b || (A.t === B.t && A.t !== 'club' && A.t !== 'cnt')) return true;
    if (A.t === 'club' && B.t === 'cnt') return COUNTRY_OF.get(a) === b.slice(4);
    if (B.t === 'club' && A.t === 'cnt') return COUNTRY_OF.get(b) === a.slice(4);
    return false;
  }
  const MODES = [
    ['Клубы', () => shuffle(BIG, Math.random).slice(0, 6)],
    ['Клубы и сборные', () => [...shuffle(BIG, Math.random).slice(0, 3), ...shuffle([...NATS, ...BIG], Math.random).slice(0, 3)]],
    ['Микс', () => [...shuffle(BIG, Math.random).slice(0, 3), ...shuffle([...NATS, ...OTHER, ...BIG.slice(0, 20)], Math.random).slice(0, 3)]],
  ];
  let gridMode = MODES[0][0];

  let rows = [], cols = [], cells = [], sel = -1, used = new Set(), mode = 'solo', lives = 3, turn = 0, over = false, picker = null;
  // Box2Box: соло на время — 3 минуты, ошибка отнимает 10 секунд, остаток времени идёт в очки
  const TIME = 180;
  let timeLeft = 0, timer = 0;

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
    const order = shuffle([0, 0, 1, 1, 2, 2, 2], Math.random);
    for (const mi of order) {
      for (let t = 0; t < 2500; t++) {
        const six = MODES[mi][1]();
        if (new Set(six).size < 6) continue;
        // в смешанной сетке категории раскладываем по строкам и столбцам случайно
        const pick = mi === 0 ? six : shuffle(six, Math.random);
        const r = pick.slice(0, 3), c = pick.slice(3);
        let ok = true;
        for (const a of r) for (const b of c) if (clash(a, b) || !both(a, b).length) ok = false;
        if (ok && solvable(r, c)) { gridMode = MODES[mi][0]; return [r, c]; }
      }
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
    used = new Set(); lives = mode === 'timed' ? 99 : 3; turn = 0; over = false; sel = -1;
    Screens.show('ttt');
    clearInterval(timer);
    if (mode === 'timed') {
      timeLeft = TIME;
      timer = setInterval(() => {
        if (Screens.current !== 'ttt' || over) { clearInterval(timer); return; }
        timeLeft--;
        if (timeLeft <= 0) { timeLeft = 0; clearInterval(timer); finish(0); return; }
        renderSub();
      }, 1000);
    }
    $('#ttt-field').disabled = true;
    picker && picker.clear();
    render();
  }

  function render() {
    const D = Store.d.duel;
    $('#ttt-title').textContent = mode === 'duo' ? 'Тики-Така-Тоу вдвоём' : mode === 'timed' ? 'Box2Box на время' : 'Тики-Така-Тоу';
    renderSub();
    let html = '<div class="tg-corner"></div>';
    cols.forEach((c) => { html += `<div class="tg-head ${cat(c).t}">${cat(c).html}</div>`; });
    rows.forEach((r, ri) => {
      html += `<div class="tg-head row ${cat(r).t}">${cat(r).html}</div>`;
      cols.forEach((c, ci) => {
        const i = ri * 3 + ci, v = cells[i];
        const cls = ['tg-cell', v ? `filled p${v.by}` : '', sel === i ? 'sel' : ''].join(' ');
        const mark = v ? (mode === 'duo' ? (v.by === 0 ? '✕' : '○') : '') : '';
        const reveal = over && !v ? `<small class="ans">${esc(both(r, c)[0])}</small>` : '';
        html += `<button class="${cls}" data-i="${i}" ${v || over ? 'disabled' : ''}>${mark ? `<b>${mark}</b>` : ''}${v ? `<span>${esc(v.name)}</span>` : reveal}</button>`;
      });
    });
    $('#ttt-grid').innerHTML = html;
    $('#ttt-hint').textContent = over ? '' : sel < 0 ? 'Выбери клетку' : `Кто подходит: ${phrase(rows[Math.floor(sel / 3)])} + ${phrase(cols[sel % 3])}?`;
  }

  function renderSub() {
    const D = Store.d.duel;
    const mmss = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    $('#ttt-sub').textContent = mode === 'duo'
      ? (over ? 'Игра окончена' : `Ходит ${turn === 0 ? D.a + ' (✕)' : D.b + ' (○)'}`)
      : mode === 'timed' ? `⏱ ${mmss} · ${cells.filter(Boolean).length}/9 · ошибка −10 сек`
        : `${gridMode} · ${'♥'.repeat(lives)}${'♡'.repeat(3 - lives)} · ${cells.filter(Boolean).length}/9`;
  }

  const phrase = (id) => (cat(id).t === 'club' ? `играл за ${id}` : cat(id).label);

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
    const ok = !used.has(name) && cat(r).set.has(name) && cat(c).set.has(name);
    if (ok) {
      cells[sel] = { by: turn, name };
      used.add(name);
      Sound.play('kick'); haptic('tap');
    } else {
      Sound.play('bad'); haptic('bad');
      toast(used.has(name) ? `${name} уже был` : `${name} не подходит под обе подсказки`);
      if (mode === 'solo') lives--;
      if (mode === 'timed') { timeLeft = Math.max(1, timeLeft - 10); bump($('#ttt-sub'), 'shake'); }
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
    } else if (mode === 'timed') {
      clearInterval(timer);
      const n = cells.filter(Boolean).length, pts = n * 10 + (result === 1 ? timeLeft : 0);
      Store.d.ttt.b2bBest = Math.max(Store.d.ttt.b2bBest || 0, pts);
      title = result === 1 ? `Сетка за ${TIME - timeLeft} сек! ${pts} очков` : `${timeLeft > 0 ? "Сдался" : "Время вышло"}: ${n}/9, ${pts} очков`;
      reward = Math.round(pts / 3);
      if (result === 1) Profile.bump('ttt', 30);
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
    if (mode === 'timed') title += ` · рекорд ${Store.d.ttt.b2bBest}`;
    later(() => Modal.open(
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

  return { bind, start, skip, clubs: BIG.length, cats: CATS, groups: { BIG, NATS, OTHER } };
})();
