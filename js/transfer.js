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
      <div class="tplayer">${t.flag} ${esc(t.player)}</div>
      <div class="troute"><span>${esc(t.from)}</span><i>→</i><span class="${showTo ? '' : 'q'}">${showTo ? esc(t.to) : '?'}</span></div>
      <div class="tmeta"><span>${t.year}</span><b class="tfee">${showFee ? fee(t) : '€ ? млн'}</b></div>
    </div>`;
  }

  function round() {
    lock = false;
    head();
    cur = draw();
    if (mode === 'hl') {
      while (cur.id === prev.id) cur = draw();
      $('#transfer-stage').innerHTML = card(prev, true, true, 'known') + '<div class="vs-mid">VS</div>' + card(cur, false, true);
      $('#transfer-opts').innerHTML = `<button class="btn" data-hl="up">▲ Дороже</button><button class="btn sasha" data-hl="down">▼ Дешевле</button>`;
      return;
    }
    const wrong = shuffle(CLUB_POOL.filter((c) => c !== cur.to && c !== cur.from), Math.random).slice(0, 3);
    const opts = shuffle([cur.to, ...wrong], Math.random);
    $('#transfer-stage').innerHTML = card(cur, true, false);
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
    $('#transfer-stage').innerHTML = card(cur, true, true, ok ? 'ok' : 'bad');
    if (ok) { streak++; Coins.add(5); Sound.play('kick'); haptic('ok'); }
    else { lives--; Sound.play('bad'); haptic('bad'); }
    const T = Store.d.transfer;
    if (streak > T.best) { T.best = streak; Store.save(); }
    head();
    setTimeout(() => (lives <= 0 ? end() : round()), ok ? 700 : 1300);
  }

  function answerHL(dir) {
    if (lock) return;
    lock = true;
    const ok = cur.fee === prev.fee || (dir === 'up' ? cur.fee > prev.fee : cur.fee < prev.fee);
    const cards = $$('#transfer-stage .tcard');
    cards[1].outerHTML = card(cur, true, true, ok ? 'ok' : 'bad');
    countUp($$('#transfer-stage .tcard')[1].querySelector('.tfee'), cur.fee);
    if (ok) {
      streak++; Coins.add(5); Sound.play('kick'); haptic('ok');
      const T = Store.d.transfer;
      if (streak > T.hlBest) { T.hlBest = streak; Store.save(); }
      head();
      setTimeout(() => { prev = cur; round(); }, 1100);
    } else {
      Sound.play('bad'); haptic('bad');
      setTimeout(end, 1300);
    }
  }

  function countUp(el, to) {
    if (!el || to === 0) return;
    const t0 = performance.now();
    const stepFn = (t) => {
      const k = Math.min(1, (t - t0) / 600);
      el.textContent = `€${Math.round(to * k)} млн`;
      if (k < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }

  function end() {
    if (streak >= 5) Profile.bump(mode === 'where' ? 'transfer' : 'higherlower', streak * 2);
    const T = Store.d.transfer;
    const best = mode === 'where' ? T.best : T.hlBest;
    Sound.play(streak >= 5 ? 'goal' : 'lose');
    Modal.open(
      `<h2>Серия: ${streak}</h2>
       <p>${streak >= best && streak > 0 ? 'Это твой новый рекорд!' : `Рекорд: ${best}`}</p>
       ${quoteHtml(streak >= 5 ? 'win' : 'lose')}`,
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
