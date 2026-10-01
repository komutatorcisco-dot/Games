// «Козыри» (как Pack 11): карточная игра против бота. Выбери характеристику своей верхней карты —
// у кого больше, тот забирает обе. Побеждает тот, у кого через 12 раундов больше карт (или у соперника кончились).
'use strict';

(() => {
  const ROUNDS = 12;
  const STATS = [
    ['r', 'Рейтинг FC', (p) => Power.rating(p)],
    ['v', 'Стоимость, млн €', (p) => Power.value(p)],
    ['a', 'Возраст', (p) => new Date().getFullYear() - p.born],
    ['n', 'Номер', (p) => p.num],
  ];

  function card(p, open = true, hl = '') {
    if (!open) return '<div class="tr-card back"><b>?</b></div>';
    return `<div class="tr-card">${avatar(p.name, 'l')}<b>${esc(p.name)}</b><small>${p.flag} ${esc(p.club)}</small>
      <div class="tr-stats">${STATS.map(([k, l, f]) => `<span class="${hl === k ? 'hl' : ''}"><i>${l}</i><em>${f(p)}</em></span>`).join('')}</div></div>`;
  }

  NG.register({
    id: 'trumps', group: 'cards', title: 'Козыри', c1: '#ffcf3a', c2: '#2a2a35', tag: 'Карты против бота',
    meta: (s) => (s.wins ? `Побед: ${s.wins}` : 'Карты против бота'),
    start(api) {
      const deck = shuffle(PLAYERS.filter((p) => p.tier <= 2), Math.random).slice(0, 20);
      let me = deck.slice(0, 10), bot = deck.slice(10), round = 1, myTurn = true, reveal = null, over = false;
      const b = api.body;
      function render() {
        api.sub(`Раунд ${round}/${ROUNDS} · у тебя ${me.length} · у бота ${bot.length}`);
        const ask = myTurn ? 'Твой ход: выбери характеристику' : 'Ход бота';
        b.innerHTML = `<div class="tr-table"><div><small>Ты</small>${card(me[0], true, reveal && reveal.k)}</div><div><small>Бот</small>${card(bot[0], !!reveal, reveal && reveal.k)}</div></div>
          ${reveal ? `<p class="ng-lead tr-res ${reveal.res}">${reveal.text}</p><div class="ng-row"><button class="btn gold" data-a="next">Дальше →</button></div>`
            : myTurn ? `<p class="ng-lead">${ask}</p><div class="tr-pick">${STATS.map(([k, l]) => `<button class="btn ghost" data-k="${k}">${l}</button>`).join('')}</div>`
              : `<p class="ng-lead">${ask}…</p>`}`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      // бот выбирает характеристику, где его карта сильнее всего относительно средней
      function botTurn() {
        const p = bot[0];
        const norm = { r: (v) => (v - 80) / 6, v: (v) => (v - 40) / 40, a: (v) => (v - 27) / 4, n: (v) => (v - 12) / 8 };
        const best = STATS.map(([k, , f]) => [k, norm[k](f(p))]).sort((x, y) => y[1] - x[1])[0][0];
        later(() => playBot(best), 900);
      }
      // Ход: показываем обе карты с выбранной характеристикой, потом победитель забирает карты под низ колоды
      function playStat(k, byBot) {
        const [, label, f] = STATS.find((x) => x[0] === k);
        const a = f(me[0]), c = f(bot[0]);
        const res = a > c ? 'win' : a < c ? 'lose' : 'draw';
        const who = byBot ? `Бот выбрал «${label}»` : label;
        reveal = { k, res, text: res === 'draw' ? `${who}: ${a} = ${c} — ничья` : `${who}: ${a} против ${c} — ${res === 'win' ? 'карта твоя!' : 'забирает бот'}` };
        Sound.play(res === 'win' ? 'kick' : res === 'lose' ? 'bad' : 'tap');
        render();
        const mine = me.shift(), his = bot.shift();
        if (res === 'win') { me.push(mine, his); myTurn = true; }
        else if (res === 'lose') { bot.push(his, mine); myTurn = false; }
        else { me.push(mine); bot.push(his); }
      }
      const playBot = (k) => playStat(k, true);
      function next() {
        reveal = null; round++;
        if (!me.length || !bot.length || round > ROUNDS) return finish();
        render();
        if (!myTurn) botTurn();
      }
      function finish() {
        over = true;
        const won = me.length > bot.length, s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; api.save(); Profile.bump('trumps', 12); }
        NG.end({ title: won ? `Победа ${me.length}:${bot.length}!` : me.length === bot.length ? 'Ничья' : `Бот выиграл ${bot.length}:${me.length}`,
          win: won, reward: won ? 30 + me.length : 5, again: { label: 'Новая раздача', fn: () => NG.open('trumps') } });
      }
      b.addEventListener('click', (e) => {
        if (over) return;
        const k = e.target.closest('[data-k]');
        if (k && myTurn && !reveal) return playStat(k.dataset.k, false);
        if (e.target.closest('[data-a="next"]')) next();
      });
      render();
    },
  });
})();
