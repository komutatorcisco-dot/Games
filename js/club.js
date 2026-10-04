// «Угадай клуб»: подсказки открываются от сложной к простой. Чем меньше подсказок понадобилось, тем больше монет.
'use strict';

const Club = (() => {
  const CLUES = [
    ['country', 'Страна', (c) => `${c.flag} ${c.country}`],
    ['colors', 'Цвета', (c) => c.colors],
    ['founded', 'Основан', (c) => `${c.founded} год`],
    ['nick', 'Прозвище', (c) => c.nick],
    ['fact', 'Факт', (c) => c.fact],
    ['stadium', 'Стадион', (c) => c.stadium],
    ['city', 'Город', (c) => c.city],
    ['crest', 'Эмблема', null],
  ];
  let answer = null, shown = 2, tries = 0, over = false, order = [], idx = 0, picker = null;

  function start() {
    if (!order.length || idx >= order.length) { order = shuffle(CLUBS, Math.random); idx = 0; }
    answer = order[idx++];
    shown = 2; tries = 0; over = false;
    Screens.show('club');
    $('#club-field').disabled = false;
    picker && picker.clear();
    render();
  }

  function render() {
    const S = Store.d.club;
    $('#club-sub').textContent = `Серия: ${S.streak} · рекорд: ${S.best}`;
    $('#club-clues').innerHTML = CLUES.map(([, label, fn], i) => {
      const open = over || i < shown;
      const val = !fn ? (CRESTS[answer.name] ? crestImg(answer.name, over ? 'm' : 'm blur') : 'нет картинки') : esc(fn(answer));
      return `<div class="clue ${open ? 'open' : ''}"><span>${label}</span><b>${open ? val : '• • •'}</b></div>`;
    }).join('');
    $('#club-left').textContent = over ? '' : `Подсказок открыто: ${shown} из ${CLUES.length}`;
  }

  function submit(id) {
    if (over) return;
    tries++;
    const c = CLUBS[id];
    if (c.id === answer.id) { finish(true); return; }
    Sound.play('bad'); haptic('bad');
    toast(`Не ${c.name}`);
    if (shown < CLUES.length) shown++;
    else { finish(false); return; }
    render();
  }

  function finish(won) {
    over = true;
    $('#club-field').disabled = true;
    render();
    const S = Store.d.club;
    let reward = 0;
    if (won) {
      reward = Math.max(5, 35 - (shown - 2) * 6);
      S.streak++;
      S.best = Math.max(S.best, S.streak);
      Profile.bump('club');
      Sound.play('goal'); haptic('ok'); confetti();
    } else {
      S.streak = 0;
      Sound.play('lose'); haptic('bad');
    }
    Store.save();
    reward = Econ.play(reward);
    later(() => Modal.open(
      resultHtml({ act: 'club', ico: 'club', win: won, title: won ? 'Верно!' : 'Не угадал', reward, extra: `<div class="player-card">${crestImg(answer.name, 'xl')}<div class="pname">${answer.flag} ${esc(answer.name)}</div>
       <div class="pmeta">${esc(answer.city)} · ${esc(answer.stadium)} · с ${answer.founded} года</div></div>${quoteHtml(won ? 'win' : 'lose')}` }),
      [{ label: 'Следующий клуб →', onClick: start }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }],
    ), 450);
  }

  function bind() {
    picker = Picker('#club-field', '#club-suggest',
      (q, norm) => CLUBS.filter((c) => norm(c.name).includes(q) || norm(c.alt).includes(q))
        .map((c) => ({ key: c.id, label: c.name, sub: `${c.flag} ${c.country}` })),
      submit);
  }

  return { bind, start, count: CLUBS.length };
})();
