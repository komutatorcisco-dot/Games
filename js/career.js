// «Угадай карьеру»: клубы игрока открываются по одному, ошибка открывает следующий.
// Соло — серия побед. С другом — двое угадывают по очереди, раунд забирает тот, кто назовёт первым.
'use strict';

const Career = (() => {
  const MAX_TRIES = 6;
  const NAMES = [...new Set(CAREERS.map((c) => c.name))];
  let answer = null, tries = 0, shown = 1, over = false, order = [], mode = 'solo';
  let turn = 0, starter = 0, score = [0, 0], picker = null;

  function next() {
    const C = Store.d.career;
    if (!order.length || C.idx >= order.length) {
      order = shuffle(CAREERS.map((_, i) => i), Math.random);
      C.idx = 0;
    }
    answer = CAREERS[order[C.idx]];
    tries = 0; shown = 1; over = false;
    Screens.show('career');
    $('#career-field').disabled = false;
    picker && picker.clear();
    renderHead();
    renderPath();
  }

  function start(m = 'solo') {
    mode = m;
    if (m === 'duel') {
      askNames('Карьера с другом', () => { score = [0, 0]; starter = 0; turn = 0; next(); });
    } else next();
  }

  function renderHead() {
    const C = Store.d.career, D = Store.d.duel;
    const duel = mode === 'duel';
    $('#career-title').textContent = duel ? 'Карьера с другом' : 'Угадай карьеру';
    $('#career-sub').textContent = duel ? `Раунд ${score[0] + score[1] + 1}` : `Серия: ${C.streak} · рекорд: ${C.best}`;
    $('#career-board').hidden = !duel;
    if (duel) {
      $('#career-a').textContent = `${D.a.toUpperCase()}: ${score[0]}`;
      $('#career-b').textContent = `${D.b.toUpperCase()}: ${score[1]}`;
      $('#career-a').classList.toggle('active', turn === 0);
      $('#career-b').classList.toggle('active', turn === 1);
    }
    $('#career-tries').textContent = duel
      ? `Ходит ${turn === 0 ? D.a : D.b} · попыток ${tries} из ${MAX_TRIES}`
      : `Попыток: ${tries} из ${MAX_TRIES}`;
  }

  function renderPath() {
    $('#career-path').innerHTML = answer.path.map((row, i) => {
      const open = over || i < shown;
      const loan = row[0].includes('(аренда)');
      const club = row[0].replace(' (аренда)', '');
      return `<div class="step ${open ? 'open' : 'hidden-step'}">
        <span class="yr">${esc(row[1])}</span>
        <span class="club">${open ? crestImg(club, 's') + esc(club) : '• • •'}${open && loan ? '<em>аренда</em>' : ''}</span>
      </div>`;
    }).join('');
    $('#career-hidden').textContent = over ? '' : `Скрыто клубов: ${answer.path.length - shown}`;
  }

  function submit(name) {
    if (over) return;
    tries++;
    if (name === answer.name) { finish(true); return; }
    Sound.play('bad'); haptic('bad');
    toast(`Не ${name}`);
    if (shown < answer.path.length) shown++;
    if (tries >= MAX_TRIES) { finish(false); return; }
    if (mode === 'duel') turn = 1 - turn;
    renderPath();
    renderHead();
  }

  function finish(won) {
    over = true;
    $('#career-field').disabled = true;
    renderPath();
    const C = Store.d.career, D = Store.d.duel;
    const card = `<div class="player-card">${avatar(answer.name, 'xl', answer.path[answer.path.length - 1][0].replace(' (аренда)', ''))}<div class="pname">${answer.flag} ${esc(answer.name)}</div>
      <div class="pmeta">Клубов в карьере: ${answer.path.length}</div></div>`;
    C.idx++;
    if (mode === 'duel') {
      if (won) score[turn]++;
      starter = 1 - starter;
      const who = won ? (turn === 0 ? D.a : D.b) : null;
      turn = starter;
      Store.save();
      won ? (Sound.play('goal'), confetti()) : Sound.play('lose');
      renderHead();
      later(() => Modal.open(
        resultHtml({ act: 'career-duel', ico: 'career-duel', win: !!who, title: who ? esc(who) + ' угадал!' : 'Никто не угадал',
          big: `${score[0]}:${score[1]}`, extra: card + `<div class="scoreboard"><span class="tag tag-danil">${esc(D.a.toUpperCase())}: ${score[0]}</span><span class="tag tag-sasha">${esc(D.b.toUpperCase())}: ${score[1]}</span></div>` }),
        [{ label: 'Следующий раунд →', onClick: next }, { label: 'Закончить', cls: 'ghost', onClick: () => App.home() }],
      ), 500);
      return;
    }
    let reward = 0;
    if (won) {
      reward = Math.max(5, 40 - (tries - 1) * 8);
      C.streak++;
      C.best = Math.max(C.best, C.streak);
      Profile.bump('career');
      Sound.play('goal'); haptic('ok'); confetti();
    } else {
      C.streak = 0;
      Sound.play('lose'); haptic('bad');
    }
    Store.save();
    reward = Econ.play(reward);
    later(() => Modal.open(
      resultHtml({ act: 'career', ico: 'career', win: won, title: won ? 'Это он!' : 'Не угадал', text: won ? `С ${tries}-й попытки` : 'Серия обнулилась',
        stats: [['Серия', C.streak], ['Рекорд', C.best]], extra: card + quoteHtml(won ? 'win' : 'lose'), reward }),
      [{ label: 'Следующий →', onClick: next }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }],
    ), 500);
  }

  function bind() {
    picker = Picker('#career-field', '#career-suggest',
      (q, norm) => NAMES.filter((n) => norm(n).includes(q)).map((n) => ({ key: n, label: n })),
      submit);
  }

  return { bind, start, count: CAREERS.length };
})();

// Общее окно «как зовут игроков» для режимов вдвоём.
function askNames(title, onStart) {
  const D = Store.d.duel;
  Modal.open(
    `<h2>${esc(title)}</h2>
     <p>Играете по очереди с одного телефона.</p>
     <label class="field" for="duel-name-a">Игрок 1<input id="duel-name-a" maxlength="14" value="${esc(D.a)}"></label>
     <label class="field" for="duel-name-b">Игрок 2<input id="duel-name-b" maxlength="14" value="${esc(D.b)}"></label>`,
    [
      {
        label: 'Начать', onClick: () => {
          D.a = ($('#duel-name-a').value.trim() || 'Данил').slice(0, 14);
          D.b = ($('#duel-name-b').value.trim() || 'Саша').slice(0, 14);
          Store.save();
          onStart();
        },
      },
      { label: 'Назад', cls: 'ghost', onClick: () => App.home() },
    ],
  );
}
