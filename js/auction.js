// «Аукцион» как в видео канала: у каждого 50 монет и 5 мест в команде.
// Игроки выходят по одному, ставки по очереди (+1, +2, +5 или «Пас»). Кто перебил — тот забирает.
// Если у кого-то уже 5 игроков, второй добирает остальных бесплатно.
// В конце сравнивается сумма текущей формы (FORM в form.js): чья пятёрка сейчас в лучшей форме.
'use strict';

const Auction = (() => {
  const BUDGET = 50, SLOTS = 5;
  const POOL = Object.keys(FORM);
  const form = (n) => (FORM[n] ? FORM[n][0] : 75);

  let vsBot = false, names = ['', ''], budget = [0, 0], team = [[], []], deck = [];
  let lot = null, price = 0, leader = null, turn = 0, starter = 0, passes = 0, busy = false, over = false;

  const player = (n) => PLAYERS.find((p) => p.name === n) || { name: n, flag: '', club: '' };

  function start(bot) {
    vsBot = bot;
    if (bot) {
      names = [Store.d.duel.a || 'Ты', 'Бот Саша'];
      begin();
    } else {
      askNames('Аукцион вдвоём', () => { names = [Store.d.duel.a, Store.d.duel.b]; begin(); });
    }
  }

  function begin() { Limits.take('auction', play); }
  function play() {
    budget = [BUDGET, BUDGET]; team = [[], []]; starter = 0; over = false;
    deck = shuffle(POOL, Math.random);
    Screens.show('auction');
    $('#auction-title').textContent = 'Аукцион';
    $('#auction-title').nextElementSibling.textContent = vsBot ? 'Против бота · побеждает форма' : 'Вдвоём · побеждает форма';
    nextLot();
  }

  function full(i) { return team[i].length >= SLOTS; }

  function nextLot() {
    if (full(0) && full(1)) { finish(); return; }
    if (!deck.length) deck = shuffle(POOL.filter((n) => !team[0].some((t) => t.n === n) && !team[1].some((t) => t.n === n)), Math.random);
    lot = deck.pop();
    deck.length && Photos.preload(deck[deck.length - 1]);
    price = 0; leader = null; passes = 0; busy = false;
    // один уже собрал команду: второй забирает бесплатно
    if (full(0) || full(1)) {
      const taker = full(0) ? 1 : 0;
      render(true);
      busy = true;
      $('#auction-status').textContent = `${names[taker]} забирает бесплатно`;
      later(() => win(taker, 0), 900);
      return;
    }
    turn = starter;
    starter = 1 - starter;
    render(true);
    maybeBot();
  }

  function slotHtml(i) {
    let html = '';
    for (let k = 0; k < SLOTS; k++) {
      const t = team[i][k];
      html += t
        ? `<div class="aslot filled ${t.fresh ? 'fresh' : ''}">${avatar(t.n, 'm')}<b class="aprice">${t.p}</b></div>`
        : '<div class="aslot"></div>';
    }
    return html;
  }

  function render(newLot) {
    const p = player(lot);
    if (newLot) {
      $('#auction-lot').innerHTML = `<div class="alot enter">${avatar(lot, 'xl')}
        <div class="alot-name">${p.flag} ${esc(lot)}</div>
        <div class="alot-club">${p.club ? crestImg(p.club, 'xs') + esc(p.club) : ''}</div>
        <div class="alot-form"><b>${form(lot)}</b><span>форма${FORM[lot] && FORM[lot][1] ? ` · ${esc(FORM[lot][1])}` : ''}</span></div></div>`;
      Photos.hydrate($('#auction-lot'));
    }
    $('#auction-price').innerHTML = leader === null
      ? '<span class="muted">Ставок нет</span>'
      : `<b class="abid pop">${price}</b><span>ставит ${esc(names[leader])}</span>`;
    [0, 1].forEach((i) => {
      $(`#auction-team-${i}`).innerHTML = slotHtml(i);
      const tag = $(`#auction-tag-${i}`);
      tag.textContent = `${names[i].toUpperCase()}: ${budget[i]}`;
      tag.classList.toggle('active', !over && turn === i && !busy);
    });
    Photos.hydrate($('#auction-teams'));
    team.forEach((t) => t.forEach((x) => { x.fresh = false; }));
    const myTurn = !busy && !over && !(vsBot && turn === 1);
    $('#auction-status').textContent = over ? '' : busy ? $('#auction-status').textContent : `Ход: ${names[turn]}`;
    $$('#auction-ctrl [data-bid]').forEach((b) => {
      const step = +b.dataset.bid;
      b.disabled = !myTurn || price + step > budget[turn];
    });
    $('#auction-pass').disabled = !myTurn;
  }

  function bid(step) {
    if (busy || over) return;
    if (price + step > budget[turn]) return;
    price += step; leader = turn; passes = 0;
    Sound.play('tap'); haptic('tap');
    turn = 1 - turn;
    // соперник не может перебить — лот уходит сразу
    if (budget[turn] < price + 1) { render(false); busy = true; later(() => win(leader, price), 700); return; }
    render(false);
    maybeBot();
  }

  function pass() {
    if (busy || over) return;
    Sound.play('tap');
    if (leader !== null) { busy = true; render(false); later(() => win(leader, price), 450); return; }
    passes++;
    if (passes >= 2) {
      busy = true;
      $('#auction-status').textContent = 'Никто не взял — игрок уходит';
      render(false);
      later(nextLot, 900);
      return;
    }
    turn = 1 - turn;
    render(false);
    maybeBot();
  }

  function win(i, cost) {
    budget[i] -= cost;
    team[i].push({ n: lot, p: cost, fresh: true });
    Sound.play('coin'); haptic('ok');
    $('#auction-status').textContent = `${names[i]} забирает ${lot} за ${cost}`;
    const card = $('.alot');
    card && card.classList.add(i === 0 ? 'to-left' : 'to-right');
    busy = true;
    render(false);
    later(nextLot, 900);
  }

  // Бот оценивает игрока по рейтингу и по тому, сколько денег осталось на каждое свободное место.
  function maybeBot() {
    if (!vsBot || turn !== 1 || busy || over) return;
    busy = true;
    $('#auction-status').textContent = `${names[1]} думает…`;
    render(false);
    later(() => {
      busy = false;
      const ovr = form(lot);
      const left = SLOTS - team[1].length;
      const perSlot = budget[1] / left;
      const want = Math.max(1, Math.round(((ovr - 80) * 1.4 + 5) * (perSlot / 10) * (0.85 + Math.random() * 0.3)));
      const cap = Math.min(budget[1], want);
      if (price + 1 <= cap) bid(cap - price >= 6 && Math.random() < 0.5 ? 2 : 1);
      else pass();
    }, 700 + Math.random() * 500);
  }

  function strength(i) { return team[i].reduce((s, t) => s + form(t.n), 0); }

  function finish() {
    over = true;
    render(false);
    $('#auction-lot').innerHTML = '';
    const s = [strength(0), strength(1)];
    const w = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
    const best = (i) => team[i].slice().sort((a, b) => (form(b.n) - b.p) - (form(a.n) - a.p))[0];
    const row = (i) => `<div class="ares ${i === 0 ? 'danil' : 'sasha'} ${w === i ? 'win' : ''}">
        <span>${esc(names[i])}</span><b class="ares-num" data-to="${s[i]}">0</b>
        <small>лучшая покупка: ${esc(best(i).n)} за ${best(i).p}</small></div>`;
    let reward = 0;
    if (vsBot && w === 0) { reward = Econ.quote(40); Profile.bump('auction', 25); }
    if (!vsBot && w !== -1) Profile.bump('auction', 10);
    Store.d.auction = Store.d.auction || { wins: 0 };
    if (w === 0 || (!vsBot && w !== -1)) Store.d.auction.wins++;
    Store.save();
    Sound.play(w === -1 ? 'tap' : 'goal');
    if (w !== -1) confetti();
    Modal.open(
      resultHtml({ ico: 'auction', c1: '#ff5f6d', c2: '#7b2b8a', win: w !== -1, title: w === -1 ? 'Ничья!' : esc(names[w]) + ' собрал лучшую команду',
        text: 'Сумма текущей формы пятёрки', extra: `<div class="ares-wrap">${row(0)}${row(1)}</div>`, reward }),
      [
        { label: 'Ещё аукцион', onClick: () => begin() },
        { label: 'В меню', cls: 'ghost', onClick: () => App.home() },
      ],
    );
    $$('.ares-num').forEach((el, k) => later(() => countUp(el, +el.dataset.to, { dur: 1100 }), 300 + k * 250));
    if (reward) later(() => Econ.play(40), 1500);
  }

  function bind() {
    $('#auction-ctrl').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bid]');
      if (b && !b.disabled) bid(+b.dataset.bid);
    });
    $('#auction-pass').addEventListener('click', pass);
  }

  return { bind, start };
})();
