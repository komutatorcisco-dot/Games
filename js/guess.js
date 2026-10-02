// «Угадай футболиста» и «Дуэль»: угадываешь игрока по нации, лиге, клубу, возрасту, позиции и номеру.
'use strict';

const Guess = (() => {
  const LINE = { ГК: 'ГК', ЦЗ: 'ЗАЩ', ЛЗ: 'ЗАЩ', ПЗ: 'ЗАЩ', ЦОП: 'ПЗЩ', ЦП: 'ПЗЩ', ЦАП: 'ПЗЩ', ЛВ: 'АТК', ПВ: 'АТК', ФРВ: 'АТК' };
  const HINT_COST = 15;
  const SHORT = { 'Манчестер Сити': 'Ман Сити', 'Манчестер Юнайтед': 'Ман Юнайтед', 'Атлетик Бильбао': 'Атлетик', 'Лос-Анджелес': 'LAFC', 'Боруссия Д': 'Боруссия' };
  // подсказки от сложных к лёгким
  const HINT_ORDER = ['num', 'age', 'pos', 'lg', 'nat', 'club'];
  const HINT_LABEL = { nat: 'Нация', lg: 'Лига', pos: 'Позиция', club: 'Клуб', age: 'Возраст', num: 'Номер' };
  const YEAR = new Date().getFullYear();
  const age = (p) => YEAR - p.born;

  // Порядок уровней: сначала суперзвёзды, потом звёзды, потом игроки для знатоков.
  const ORDER = (() => {
    const rnd = mulberry32(2024);
    // загадываем только игроков с известным номером: иначе одна колонка подсказок пустая
    return [1, 2, 3].flatMap((t) => shuffle(PLAYERS.filter((p) => p.tier === t && p.num > 0), rnd));
  })();

  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, '');

  let mode = 'career', answer = null, guesses = [], revealed = [], maxTries = 8, over = false, revived = false;
  let turn = 0, roundStarter = 0, score = [0, 0], selIdx = 0, suggestions = [];

  function compare(g, a) {
    const arrow = (x, y) => (x === y ? '' : x < y ? ' ↑' : ' ↓');
    return [
      { v: g.flag, title: g.nat, cls: 'flag', s: g.nat === a.nat ? 'hit' : g.cont === a.cont ? 'near' : 'miss' },
      { v: g.lg, s: g.lg === a.lg ? 'hit' : 'miss' },
      { v: SHORT[g.club] || g.club, title: g.club, cls: 'club', s: g.club === a.club ? 'hit' : 'miss' },
      { v: age(g) + arrow(age(g), age(a)), s: g.born === a.born ? 'hit' : Math.abs(g.born - a.born) <= 2 ? 'near' : 'miss' },
      { v: g.pos, s: g.pos === a.pos ? 'hit' : LINE[g.pos] === LINE[a.pos] ? 'near' : 'miss' },
      g.num ? { v: g.num + arrow(g.num, a.num), s: g.num === a.num ? 'hit' : Math.abs(g.num - a.num) <= 3 ? 'near' : 'miss' } : { v: '—', s: 'miss', title: 'Номер неизвестен' },
    ];
  }

  function hintText(k) {
    const a = answer;
    return {
      nat: `${a.flag} ${a.nat}`, lg: a.lg, pos: a.pos, club: a.club, age: `${age(a)} лет`, num: `№${a.num}`,
    }[k];
  }

  // ---------- старт ----------
  function startCareer() {
    mode = 'career';
    const lvl = Store.d.guess.level;
    answer = lvl <= ORDER.length ? ORDER[lvl - 1] : pick(PLAYERS.filter((p) => p.num > 0 && p.tier <= 3));
    maxTries = 8;
    reset();
    $('#guess-title').textContent = 'Угадай футболиста';
    $('#guess-sub').textContent = lvl <= ORDER.length ? `Уровень ${lvl} из ${ORDER.length}` : `Бесконечный режим · уровень ${lvl}`;
    $('#duel-board').hidden = true;
    $('#duel-turn').hidden = true;
    $('#guess-hint-btn').hidden = false;
  }

  function askDuelNames() {
    const D = Store.d.duel;
    Modal.open(
      `<h2>Дуэль</h2>
       <p>Угадываете по очереди с одного телефона. Кто первым назовёт игрока, тот забирает раунд.</p>
       <label class="field" for="duel-name-a">Игрок 1<input id="duel-name-a" maxlength="14" value="${esc(D.a)}"></label>
       <label class="field" for="duel-name-b">Игрок 2<input id="duel-name-b" maxlength="14" value="${esc(D.b)}"></label>`,
      [
        {
          label: 'Начать', onClick: () => {
            D.a = ($('#duel-name-a').value.trim() || 'Данил').slice(0, 14);
            D.b = ($('#duel-name-b').value.trim() || 'Саша').slice(0, 14);
            Store.save();
            score = [0, 0]; roundStarter = 0;
            startDuelRound();
          },
        },
        { label: 'Назад', cls: 'ghost', onClick: () => Screens.show('hub') },
      ],
    );
  }

  function startDuelRound() {
    mode = 'duel';
    answer = pick(PLAYERS.filter((p) => p.tier <= 2));
    maxTries = 10;
    turn = roundStarter;
    reset();
    $('#guess-title').textContent = 'Дуэль';
    $('#guess-sub').textContent = `Раунд ${score[0] + score[1] + 1} · ${maxTries} попыток на двоих`;
    $('#duel-board').hidden = false;
    $('#duel-turn').hidden = false;
    $('#guess-hint-btn').hidden = true;
    renderDuel();
  }

  function reset() {
    guesses = []; revealed = []; over = false; revived = false;
    Screens.show('guess');
    $('#guess-rows').innerHTML = '';
    $('#guess-field').value = '';
    $('#guess-field').disabled = false;
    hideSuggest();
    renderChips();
    renderAttempts();
  }

  // ---------- отрисовка ----------
  function renderDuel() {
    const D = Store.d.duel;
    const a = $('#duel-a'), b = $('#duel-b');
    a.textContent = `${D.a.toUpperCase()}: ${score[0]}`;
    b.textContent = `${D.b.toUpperCase()}: ${score[1]}`;
    a.classList.toggle('active', turn === 0);
    b.classList.toggle('active', turn === 1);
    $('#duel-turn').textContent = `Ходит ${turn === 0 ? D.a : D.b}`;
  }

  function renderChips() {
    const box = $('#guess-chips');
    if (!revealed.length) {
      box.innerHTML = `<span class="chip dim">${mode === 'career' ? 'Сделай попытку или открой подсказку' : 'Называй любого игрока, цвета подскажут'}</span>`;
      return;
    }
    box.innerHTML = revealed.map((k) => `<span class="chip">${HINT_LABEL[k]}: ${esc(hintText(k))}</span>`).join('');
  }

  function renderAttempts() {
    const left = maxTries - guesses.length;
    $('#guess-attempts').textContent = `Осталось попыток: ${left}`;
    const btn = $('#guess-hint-btn');
    const allOpen = HINT_ORDER.every((k) => revealed.includes(k));
    btn.disabled = over || allOpen;
  }

  function addRow(g, by) {
    const res = compare(g, answer);
    const row = document.createElement('div');
    row.className = 'g-row new';
    let who = `<div class="who">${esc(g.name)}`;
    if (by !== undefined) {
      const D = Store.d.duel;
      who += `<span class="by" style="background:var(${by === 0 ? '--danil' : '--sasha'})">${esc(by === 0 ? D.a : D.b)}</span>`;
    }
    who += '</div>';
    row.innerHTML = who + '<div class="row-tiles">' +
      res.map((c, i) => `<span class="tile ${c.s} ${c.cls || ''}" ${c.title ? `title="${esc(c.title)}"` : ''}>${i === 2 ? crestImg(g.club, 'xs') : ''}${esc(c.v)}</span>`).join('') +
      '</div>';
    $('#guess-rows').prepend(row);
  }

  // ---------- ввод и подсказки поиска ----------
  function hideSuggest() { $('#guess-suggest').hidden = true; suggestions = []; }

  function updateSuggest() {
    const q = norm($('#guess-field').value.trim());
    if (q.length < 2) { hideSuggest(); return; }
    const used = new Set(guesses.map((g) => g.id));
    suggestions = PLAYERS.filter((p) => !used.has(p.id) && (norm(p.name).includes(q) || norm(p.alt).includes(q)))
      .sort((x, y) => (norm(x.name).startsWith(q) ? 0 : 2) + (x.tier > 3 ? 1 : 0) - (norm(y.name).startsWith(q) ? 0 : 2) - (y.tier > 3 ? 1 : 0))
      .slice(0, 6);
    const box = $('#guess-suggest');
    if (!suggestions.length) {
      box.innerHTML = '<button type="button" disabled>Такого игрока нет в базе</button>';
      box.hidden = false;
      return;
    }
    selIdx = 0;
    box.innerHTML = suggestions.map((p, i) =>
      `<button type="button" data-id="${p.id}" class="${i === 0 ? 'sel' : ''}"><span>${esc(p.name)}</span><small>${p.flag} ${esc(p.club)}</small></button>`).join('');
    box.hidden = false;
  }

  function submit(p) {
    if (over || !p) return;
    hideSuggest();
    $('#guess-field').value = '';
    guesses.push(p);
    addRow(p, mode === 'duel' ? turn : undefined);
    Sound.play('tap'); haptic('tap');

    if (p.id === answer.id) { finish(true); return; }
    if (guesses.length >= maxTries) { finish(false); return; }
    if (mode === 'duel') { turn = 1 - turn; renderDuel(); }
    renderAttempts();
    $('#guess-field').focus();
  }

  function hint() {
    if (over || mode !== 'career') return;
    const next = HINT_ORDER.find((k) => !revealed.includes(k));
    if (!next || !Coins.spend(HINT_COST)) return;
    revealed.push(next);
    renderChips();
    renderAttempts();
  }

  // ---------- конец раунда ----------
  function playerCard() {
    const a = answer;
    return `<div class="player-card">${avatar(a.name, 'xl', a.club)}<div class="pname">${esc(a.name)}</div>
      <div class="pmeta">${a.flag} ${esc(a.nat)} · ${esc(a.club)} (${esc(a.lg)})</div>
      <div class="pmeta">${a.pos} · №${a.num} · ${age(a)} лет</div></div>`;
  }

  function finish(won) {
    over = true;
    $('#guess-field').disabled = true;
    renderAttempts();
    if (mode === 'career') finishCareer(won);
    else finishDuel(won);
  }

  function finishCareer(won) {
    // попытки кончились: один раз на игрока можно взять ещё 2 попытки за запасную жизнь
    if (!won && !revived) {
      later(() => Shop.offerLife('Попытки закончились', 'Взять ещё 2 попытки?', () => {
        revived = true; over = false; maxTries += 2;
        $('#guess-field').disabled = false;
        renderAttempts();
        $('#guess-field').focus();
      }, () => { revived = true; finishCareer(false); }), 500);
      return;
    }
    const G = Store.d.guess;
    const lvl = G.level;
    const tries = guesses.length;
    let reward = 0;
    if (won) {
      reward = 5 + (maxTries - tries) * 4;
      G.results[lvl] = tries;
      Profile.bump('guess');
      Sound.play('goal'); haptic('ok'); confetti();
    } else {
      G.results[lvl] = 0;
      Sound.play('lose'); haptic('bad');
    }
    G.level = lvl + 1;
    Store.save();
    reward = Econ.play(reward);
    later(() => Modal.open(
      `<h2>${won ? 'Угадал!' : 'Не угадал'}</h2>
       <p>${won ? `С ${tries}-й попытки.` : 'Это был:'}</p>
       ${playerCard()}
       ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
       ${quoteHtml(won ? 'win' : 'lose')}`,
      [
        { label: 'Следующий игрок →', onClick: startCareer },
        { label: 'В меню', cls: 'ghost', onClick: () => App.home() },
      ],
    ), 600);
  }

  function finishDuel(won) {
    const D = Store.d.duel;
    let title = 'Никто не угадал';
    if (won) {
      score[turn]++;
      Profile.bump('duel', 5);
      title = `${turn === 0 ? D.a : D.b} забирает раунд!`;
      Sound.play('goal'); haptic('ok'); confetti();
    } else {
      Sound.play('lose');
    }
    roundStarter = 1 - roundStarter;
    renderDuel();
    later(() => Modal.open(
      `<h2>${esc(title)}</h2>
       ${playerCard()}
       <div class="scoreboard"><span class="tag tag-danil">${esc(D.a.toUpperCase())}: ${score[0]}</span><span class="tag tag-sasha">${esc(D.b.toUpperCase())}: ${score[1]}</span></div>`,
      [
        { label: 'Следующий раунд →', onClick: startDuelRound },
        { label: 'Закончить дуэль', cls: 'ghost', onClick: () => App.home() },
      ],
    ), 600);
  }

  function bind() {
    const field = $('#guess-field');
    field.addEventListener('input', updateSuggest);
    field.addEventListener('keydown', (e) => {
      if ($('#guess-suggest').hidden || !suggestions.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selIdx = (selIdx + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
        $$('#guess-suggest button').forEach((b, i) => b.classList.toggle('sel', i === selIdx));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit(suggestions[selIdx]);
      } else if (e.key === 'Escape') hideSuggest();
    });
    $('#guess-suggest').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b) submit(PLAYERS[+b.dataset.id]);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.guess-input')) hideSuggest();
    });
  }

  return {
    bind, startCareer, askDuelNames, hint,
    total: ORDER.length,
    solvedCount: () => Object.values(Store.d.guess.results).filter((r) => r > 0).length,
  };
})();
