// «Куда перешёл?» — угадай клуб, куда ушёл игрок (4 варианта, 3 жизни).
// «Дороже или дешевле» — сравни сумму трансфера с предыдущим. Одна ошибка — конец серии.
'use strict';

const Transfer = (() => {
  const fee = (t) => (t.fee === 0 ? 'бесплатно' : `€${t.fee} млн`);
  const CLUB_POOL = [...new Set(TRANSFERS.flatMap((t) => [t.from, t.to]))];
  let mode = 'where', cur = null, prev = null, streak = 0, lives = 3, lock = false, deck = [];

  function draw() {
    if (!deck.length) deck = shuffle(TRANSFERS, Math.random);
    return deck.pop();
  }

  function start(m) {
    mode = m; streak = 0; lives = 3; lock = false; deck = [];
    prev = null;
    Screens.show('transfer');
    $('#transfer-title').textContent = m === 'where' ? 'Куда перешёл?' : 'Дороже или дешевле';
    if (m === 'hl') { prev = draw(); }
    round();
  }

  function head() {
    const T = Store.d.transfer;
    const best = mode === 'where' ? T.best : T.hlBest;
    $('#transfer-sub').textContent = `Серия: ${streak} · рекорд: ${best}`;
    $('#transfer-lives').textContent = mode === 'where' ? '♥'.repeat(lives) + '♡'.repeat(3 - lives) : '';
  }

  function card(t, showFee, showTo, extraCls = '') {
    return `<div class="tcard ${extraCls}">
      <div class="tplayer">${avatar(t.player, 'm')}<span>${t.flag} ${esc(t.player)}</span></div>
      <div class="troute"><span>${crestImg(t.from, 'xs')}${esc(t.from)}</span><i>→</i><span class="${showTo ? '' : 'q'}">${showTo ? crestImg(t.to, 'xs') + esc(t.to) : '?'}</span></div>
      <div class="tmeta"><span>${t.year}</span><b class="tfee">${showFee ? fee(t) : '€ ? млн'}</b></div>
    </div>`;
  }

  function round() {
    lock = false;
    head();
    cur = draw();
    if (mode === 'hl') {
      while (cur.id === prev.id) cur = draw();
      $('#transfer-stage').innerHTML = card(prev, true, true, 'known' + (streak ? ' stay' : '')) + '<div class="vs-mid">VS</div>' + card(cur, false, true, 'enter');
      Photos.hydrate($('#transfer-stage'));
      $('#transfer-opts').innerHTML = `<button class="btn" data-hl="up">▲ Дороже</button><button class="btn sasha" data-hl="down">▼ Дешевле</button>`;
      return;
    }
    const wrong = shuffle(CLUB_POOL.filter((c) => c !== cur.to && c !== cur.from), Math.random).slice(0, 3);
    const opts = shuffle([cur.to, ...wrong], Math.random);
    $('#transfer-stage').innerHTML = card(cur, true, false, 'enter');
    Photos.hydrate($('#transfer-stage'));
    $('#transfer-opts').innerHTML = opts.map((o) => `<button class="btn ghost opt" data-club="${esc(o)}">${esc(o)}</button>`).join('');
  }

  function answerWhere(club, btn) {
    if (lock) return;
    lock = true;
    const ok = club === cur.to;
    $$('#transfer-opts .opt').forEach((b) => {
      if (b.dataset.club === cur.to) b.classList.add('right');
      else if (b === btn) b.classList.add('wrong');
    });
    const tc = $('#transfer-stage .tcard');
    const q = $('.troute .q', tc);
    q.classList.remove('q'); q.classList.add('pop');
    q.innerHTML = crestImg(cur.to, 'xs') + esc(cur.to);
    tc.classList.add(ok ? 'ok' : 'bad');
    if (ok) { streak++; Econ.play(3); Sound.play('kick'); haptic('ok'); }
    else { lives--; Sound.play('bad'); haptic('bad'); later(() => bump($('#transfer-lives')), 50); }
    const T = Store.d.transfer;
    if (streak > T.best) { T.best = streak; Store.save(); }
    head();
    later(() => (lives <= 0 ? end() : shiftStage($('#transfer-stage'), round)), ok ? 900 : 1400);
  }

  function answerHL(dir) {
    if (lock) return;
    lock = true;
    const ok = cur.fee === prev.fee || (dir === 'up' ? cur.fee > prev.fee : cur.fee < prev.fee);
    const second = $$('#transfer-stage .tcard')[1];
    $$('#transfer-opts .btn').forEach((x) => { x.disabled = true; });
    countUp($('.tfee', second), cur.fee, {
      dur: 800, fmt: (v) => (cur.fee === 0 ? 'бесплатно' : `€${v} млн`),
      onDone: () => {
        second.classList.add(ok ? 'ok' : 'bad');
        if (ok) {
          streak++; Econ.play(3); Sound.play('kick'); haptic('ok');
          const T = Store.d.transfer;
          if (streak > T.hlBest) { T.hlBest = streak; Store.save(); }
          head();
          later(() => shiftStage($('#transfer-stage'), () => { prev = cur; round(); }), 650);
        } else {
          Sound.play('bad'); haptic('bad');
          later(end, 900);
        }
      },
    });
  }

  function end() {
    if (streak >= 5) Profile.bump(mode === 'where' ? 'transfer' : 'higherlower', streak * 2);
    const T = Store.d.transfer;
    const best = mode === 'where' ? T.best : T.hlBest;
    Sound.play(streak >= 5 ? 'goal' : 'lose');
    Modal.open(
      resultHtml({ act: mode === 'where' ? 'transfer' : 'hl', ico: mode === 'where' ? 'transfer' : 'hl', win: streak >= 5, big: streak,
        title: streak >= 5 ? 'Отличная серия!' : 'Серия прервалась', record: streak >= best && streak > 0, stats: [['Рекорд', best]], extra: quoteHtml(streak >= 5 ? 'win' : 'lose') }),
      [{ label: 'Ещё раз', onClick: () => start(mode) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }],
    );
  }

  function bind() {
    $('#transfer-opts').addEventListener('click', (e) => {
      const o = e.target.closest('[data-club]');
      if (o) answerWhere(o.dataset.club, o);
      const h = e.target.closest('[data-hl]');
      if (h) answerHL(h.dataset.hl);
    });
  }

  return { bind, start, count: TRANSFERS.length };
})();
