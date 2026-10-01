// «Возьмёшь этого или другого?» — рубрика канала. Версии по клубам: на каждую позицию две легенды клуба.
// Вдвоём: по очереди выбираете, второй игрок позиции уходит сопернику. Против себя: угадай, кто сыграл за клуб больше матчей.
// Число — официальные матчи за клуб во всех турнирах (по данным Transfermarkt, округлённо; у действующих игроков могло вырасти).
'use strict';

const Pick = (() => {
  const ROWS = [['ФРВ', 'Нападение'], ['ЦП', 'Полузащита'], ['ЗАЩ', 'Защита'], ['ВРТ', 'Вратарь']];
  const DATA = {
    'Реал Мадрид': {
      ФРВ: [['Карим Бензема', 648], ['Гарет Бэйл', 258], ['Криштиану Роналду', 438], ['Рауль', 741], ['Гонсало Игуаин', 264]],
      ЦП: [['Тони Кроос', 465], ['Лука Модрич', 597], ['Каземиро', 336], ['Гути', 542]],
      ЗАЩ: [['Серхио Рамос', 671], ['Марсело', 546], ['Роберто Карлос', 527], ['Пепе', 334], ['Рафаэль Варан', 360]],
      ВРТ: [['Икер Касильяс', 725], ['Кейлор Навас', 162]],
    },
    'Барселона': {
      ФРВ: [['Лионель Месси', 778], ['Неймар', 186], ['Луис Суарес', 283], ['Роналдиньо', 207], ['Самюэль Это’о', 199], ['Давид Вилья', 119]],
      ЦП: [['Хави', 767], ['Андрес Иньеста', 674], ['Серхио Бускетс', 722], ['Иван Ракитич', 310]],
      ЗАЩ: [['Карлес Пуйоль', 593], ['Жерар Пике', 616], ['Дани Алвес', 408], ['Жорди Альба', 459], ['Хавьер Маскерано', 334]],
      ВРТ: [['Виктор Вальдес', 535], ['Андони Субисаррета', 410]],
    },
    'Манчестер Юнайтед': {
      ФРВ: [['Уэйн Руни', 559], ['Криштиану Роналду', 346], ['Эрик Кантона', 185], ['Руд ван Нистелрой', 219], ['Бобби Чарльтон', 758]],
      ЦП: [['Пол Скоулз', 718], ['Райан Гиггз', 963], ['Рой Кин', 480], ['Дэвид Бекхэм', 394], ['Майкл Каррик', 464]],
      ЗАЩ: [['Рио Фердинанд', 455], ['Неманья Видич', 300], ['Гари Невилл', 602], ['Патрис Эвра', 379]],
      ВРТ: [['Петер Шмейхель', 398], ['Эдвин ван дер Сар', 266], ['Давид де Хеа', 545]],
    },
    'Милан': {
      ФРВ: [['Андрей Шевченко', 322], ['Филиппо Индзаги', 300], ['Марко ван Бастен', 201], ['Златан Ибрагимович', 163]],
      ЦП: [['Андреа Пирло', 401], ['Кларенс Зеедорф', 432], ['Дженнаро Гаттузо', 468], ['Кака', 307]],
      ЗАЩ: [['Паоло Мальдини', 902], ['Франко Барези', 719], ['Алессандро Неста', 326], ['Алессандро Костакурта', 663]],
      ВРТ: [['Дида', 302], ['Джанлуиджи Доннарумма', 251]],
    },
    'Ливерпуль': {
      ФРВ: [['Иан Раш', 660], ['Робби Фаулер', 369], ['Фернандо Торрес', 142], ['Луис Суарес', 133], ['Майкл Оуэн', 297], ['Кенни Далглиш', 515]],
      ЦП: [['Стивен Джеррард', 710], ['Хаби Алонсо', 143], ['Джордан Хендерсон', 492], ['Хавьер Маскерано', 139]],
      ЗАЩ: [['Джейми Каррагер', 737], ['Сами Хююпя', 464], ['Трент Александер-Арнольд', 354], ['Мартин Шкртел', 320], ['Даниэль Аггер', 232]],
      ВРТ: [['Пепе Рейна', 394], ['Брюс Гроббелар', 628]],
    },
  };
  let mode = 'duo', club = null, rows = [], step = 0, teams = null, score = 0, lock = false;
  const names = () => [Store.d.duel.a || 'Данил', Store.d.duel.b || 'Саша'];
  const surname = (n) => n.split(' ').slice(-1)[0];

  function start(m) {
    mode = m;
    Screens.show('pick');
    $('#pick-title').textContent = mode === 'duo' ? 'Возьмёшь этого или другого?' : 'Кто легендарнее?';
    $('#pick-sub').textContent = 'Выбери версию';
    $('#pick-opts').innerHTML = '';
    $('#pick-stage').innerHTML = `<div class="pick-clubs">${Object.keys(DATA).map((c) => `
      <button class="pick-club" data-club="${esc(c)}">${crestImg(c, 'xl')}<b>${esc(c)}</b></button>`).join('')}</div>`;
  }

  function begin(c) {
    club = c; step = 0; score = 0;
    rows = ROWS.map(([k]) => shuffle(DATA[c][k], Math.random).slice(0, 2));
    teams = [[], []];
    $('#pick-sub').textContent = `Версия ${club}`;
    render();
  }

  function slot(entry, show) {
    if (!entry) return '<div class="tb-slot empty"></div>';
    const [n, apps] = entry;
    return `<div class="tb-slot">${avatar(n, 'm')}<span><b>${esc(surname(n))}</b>${show ? `<i class="tb-apps" data-v="${apps}">0</i>` : ''}</span></div>`;
  }

  function render(show = false) {
    lock = false;
    const [A, B] = names();
    const board = mode === 'duo' ? `<div class="tb">
        <div class="tb-head danil">${esc(A)}</div><div class="tb-crest">${crestImg(club, 'xs')}</div><div class="tb-head sasha">${esc(B)}</div>
        ${ROWS.map(([k], i) => `${slot(teams[0][i], show)}<div class="tb-pos">${k}</div>${slot(teams[1][i], show)}`).join('')}
      </div>` : `<p class="pick-score">Угадано: <b>${score}</b> из ${step}</p>`;
    let offer = '';
    if (step < ROWS.length) {
      const chooser = step % 2;
      const who = mode === 'duo' ? `<span class="tag ${chooser ? 'tag-sasha' : 'tag-danil'}">${esc(names()[chooser])} выбирает</span>` : '<span class="tag tag-gold">Кто сыграл за клуб больше матчей?</span>';
      offer = `<div class="pick-ask">${who}<small>${ROWS[step][1]}</small></div>
        <div class="pick-pair">${rows[step].map(([n], i) => `
          <button class="pick-card" data-i="${i}">${avatar(n, 'xl')}<b>${esc(n)}</b>${crestImg(club, 'xs')}</button>`).join('<span class="pick-or">или</span>')}</div>`;
    }
    $('#pick-stage').innerHTML = board + offer;
    Photos.hydrate($('#pick-stage'));
  }

  function choose(i) {
    if (lock) return;
    lock = true;
    const pair = rows[step];
    haptic('tap'); Sound.play('tap');
    if (mode === 'duo') {
      const chooser = step % 2;
      teams[chooser][step] = pair[i];
      teams[1 - chooser][step] = pair[1 - i];
      $$('.pick-card')[i].classList.add('chosen');
      setTimeout(() => { step++; step < ROWS.length ? render() : finishDuo(); }, 380);
    } else {
      const ok = pair[i][1] >= pair[1 - i][1];
      if (ok) score++;
      const cards = $$('.pick-card');
      cards.forEach((c, k) => {
        c.insertAdjacentHTML('beforeend', `<i class="pick-apps">0</i>`);
        countUp($('.pick-apps', c), pair[k][1], { dur: 700, fmt: (v) => `${v} матчей` });
      });
      cards[i].classList.add(ok ? 'ok' : 'bad');
      Sound.play(ok ? 'kick' : 'bad'); haptic(ok ? 'ok' : 'bad');
      setTimeout(() => { step++; step < ROWS.length ? render() : finishSolo(); }, 1700);
    }
  }

  function finishDuo() {
    render(true);
    const sum = teams.map((t) => t.reduce((s, e) => s + e[1], 0));
    $$('.tb-apps').forEach((el, k) => setTimeout(() => countUp(el, +el.dataset.v, { dur: 600 }), k * 120));
    const [A, B] = names();
    const win = sum[0] === sum[1] ? -1 : sum[0] > sum[1] ? 0 : 1;
    $('#pick-opts').innerHTML = '';
    setTimeout(() => {
      if (win >= 0) confetti();
      Sound.play('goal');
      Store.d.pick.games++; Store.save();
      Profile.bump('pick', 8);
      Modal.open(`<h2>${win < 0 ? 'Ничья!' : `Побеждает ${esc(win ? B : A)}!`}</h2>
        <p>Матчей за ${esc(club)} у состава: <b>${esc(A)} — ${sum[0]}</b>, <b>${esc(B)} — ${sum[1]}</b>.</p>
        <p class="muted">А в комментариях пусть решат, чей состав сильнее 😉</p>`, [
        { label: 'Ещё раз', onClick: () => begin(club) },
        { label: 'Другой клуб', cls: 'ghost', onClick: () => start(mode) },
      ]);
    }, 1400);
  }

  function finishSolo() {
    render();
    const reward = score * 5;
    if (reward) Coins.add(reward);
    if (score === 4) confetti();
    Profile.bump('pick', score * 2);
    Sound.play(score >= 3 ? 'goal' : 'lose');
    Modal.open(`<h2>${score} из 4</h2><p>${score === 4 ? 'Знаешь историю клуба как свои пять пальцев.' : 'Цифры матчей за клуб бывают неожиданными.'}</p>
      ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}`, [
      { label: 'Ещё раз', onClick: () => begin(club) },
      { label: 'Другой клуб', cls: 'ghost', onClick: () => start(mode) },
    ]);
  }

  function bind() {
    $('#pick-stage').addEventListener('click', (e) => {
      const c = e.target.closest('.pick-club');
      if (c) { begin(c.dataset.club); return; }
      const p = e.target.closest('.pick-card');
      if (p) choose(+p.dataset.i);
    });
  }

  return { start, bind };
})();
