// «Кто выше в FC 27?» и «Кто дороже?» — две карточки игроков, у второй значение скрыто: больше или меньше?
'use strict';

const Compare = (() => {
  const MODES = {
    fc: { title: 'Кто выше в FC 27?', data: FC27, fmt: (v) => `${v}`, unit: 'рейтинг FC 27', up: 'Выше', down: 'Ниже', key: 'fcBest' },
    value: { title: 'Кто дороже?', data: VALUES, fmt: (v) => `€${v} млн`, unit: 'стоимость', up: 'Дороже', down: 'Дешевле', key: 'valBest' },
  };
  let mode = 'fc', cfg = null, a = null, b = null, streak = 0, lock = false, deck = [];

  const playerOf = (name) => PLAYERS.find((p) => p.name === name) || { name, flag: '', club: '' };
  function draw() {
    if (!deck.length) deck = shuffle(Object.keys(cfg.data), Math.random);
    return deck.pop();
  }

  function start(m) {
    mode = m; cfg = MODES[m]; streak = 0; lock = false; deck = [];
    a = draw();
    Screens.show('compare');
    $('#compare-title').textContent = cfg.title;
    round();
  }

  function card(name, show, extra = '') {
    const p = playerOf(name);
    return `<div class="pcard ${extra}">
      ${avatar(name, 'l')}
      <div class="pcard-body">
        <div class="pname-s">${p.flag} ${esc(name)}</div>
        <div class="pclub">${p.club ? crestImg(p.club, 'xs') : ''}${esc(p.club || '')}</div>
      </div>
      <div class="pval ${mode === 'fc' ? 'ovr' : ''}"><b>${show ? cfg.fmt(cfg.data[name]) : '?'}</b><small>${cfg.unit}</small></div>
    </div>`;
  }

  function round() {
    lock = false;
    b = draw();
    while (b === a) b = draw();
    const S = Store.d.compare;
    $('#compare-sub').textContent = `Серия: ${streak} · рекорд: ${S[cfg.key]}`;
    $('#compare-stage').innerHTML = card(a, true, 'known' + (streak ? ' stay' : '')) + '<div class="vs-mid">VS</div>' + card(b, false, 'enter');
    if (deck.length) Photos.preload(deck[deck.length - 1]);
    $('#compare-opts').innerHTML = `<button class="btn" data-cmp="up">▲ ${cfg.up}</button><button class="btn sasha" data-cmp="down">▼ ${cfg.down}</button>`;
    Photos.hydrate($('#compare-stage'));
  }

  function answer(dir) {
    if (lock) return;
    lock = true;
    const va = cfg.data[a], vb = cfg.data[b];
    const ok = va === vb || (dir === 'up' ? vb > va : vb < va);
    const second = $$('#compare-stage .pcard')[1];
    $$('#compare-opts .btn').forEach((x) => { x.disabled = true; });
    const S = Store.d.compare;
    countUp($('.pval b', second), vb, {
      from: mode === 'fc' ? 60 : 0, dur: 800, fmt: cfg.fmt,
      onDone: () => {
        second.classList.add(ok ? 'ok' : 'bad');
        if (ok) {
          streak++;
          if (streak > S[cfg.key]) { S[cfg.key] = streak; Store.save(); }
          Econ.play(3); Sound.play('kick'); haptic('ok');
          later(() => shiftStage($('#compare-stage'), () => { a = b; round(); }), 650);
        } else {
          Sound.play('bad'); haptic('bad');
          later(end, 900);
        }
      },
    });
  }

  function end() {
    if (streak >= 5) Profile.bump('compare', streak * 2);
    const best = Store.d.compare[cfg.key];
    Sound.play(streak >= 5 ? 'goal' : 'lose');
    Modal.open(
      resultHtml({ act: mode, ico: mode, win: streak >= 5, big: streak, title: streak >= 5 ? 'Отличная серия!' : 'Серия прервалась',
        text: `${esc(b)}: <b>${cfg.fmt(cfg.data[b])}</b>, ${esc(a)}: <b>${cfg.fmt(cfg.data[a])}</b>`, record: streak >= best && streak > 0,
        stats: [['Рекорд', best]], extra: quoteHtml(streak >= 5 ? 'win' : 'lose') }),
      [{ label: 'Ещё раз', onClick: () => start(mode) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }],
    );
  }

  function bind() {
    $('#compare-opts').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmp]');
      if (btn) answer(btn.dataset.cmp);
    });
  }

  return { bind, start, countFc: Object.keys(FC27).length, countVal: Object.keys(VALUES).length };
})();
