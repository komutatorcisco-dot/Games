// «Козыри» (как Top Trumps на карточках FC): у тебя и у бота по колоде настоящих карточек FC 27.
// Ходящий выбирает характеристику своей верхней карты — у кого больше, тот забирает обе карты.
// Ничья — карты уходят «в банк» и достаются победителю следующего розыгрыша. 15 розыгрышей или пока у кого-то не кончатся карты.
'use strict';

(() => {
  const ROUNDS = 15, HAND = 10;
  const STATS = [['СКР', 'Скорость'], ['УДР', 'Удар'], ['ПАС', 'Пас'], ['ДРБ', 'Дриблинг'], ['ЗАЩ', 'Защита'], ['ФИЗ', 'Физика']];
  const POS = { ГК: 'ВР', ЦЗ: 'ЦЗ', ЛЗ: 'ЛЗ', ПЗ: 'ПЗ', ЦОП: 'ЦОП', ЦП: 'ЦП', ЦАП: 'ЦАП', ЛВ: 'ЛВ', ПВ: 'ПВ', ФРВ: 'ФРВ' };
  const st = (p) => FC_STATS[p.name];
  // цвет карточки по рейтингу: бронза → серебро → золото → «топ»
  const tier = (o) => (o >= 87 ? 'icon' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze');

  function card(p, { open = true, hl = -1, res = '', pick = false } = {}) {
    if (!open) return '<div class="tc-card back"><span class="tc-logo">⚽</span><small>Старики<br>Джексоны</small></div>';
    const s = st(p);
    return `<div class="tc-card ${tier(s[0])} ${res}">
      <div class="tc-top"><b class="tc-ovr">${s[0]}</b><span class="tc-pos">${POS[p.pos] || p.pos}</span><span class="tc-flag">${p.flag}</span>${crestImg(p.club, 's')}</div>
      ${avatar(p.name, 'l')}<b class="tc-name">${esc(surname(p.name))}</b>
      <div class="tc-stats">${STATS.map(([k], i) => `<${pick ? 'button' : 'span'} class="tc-st ${hl === i ? 'hl' : ''}" data-s="${i}"><em>${s[i + 1]}</em><i>${k}</i></${pick ? 'button' : 'span'}>`).join('')}</div></div>`;
  }

  // Бот выбирает характеристику, где его карта сильнее всего относительно обычной карты (и иногда ошибается)
  const AVG = [74, 64, 68, 72, 55, 70];
  function botPick(p) {
    const s = st(p);
    const score = STATS.map((_, i) => (s[i + 1] - AVG[i]) + Math.random() * 6);
    return score.indexOf(Math.max(...score));
  }

  NG.register({
    id: 'trumps', group: 'cards', title: 'Козыри', c1: '#ffcf3a', c2: '#2a2a35', tag: 'Карточки FC против бота',
    meta: (s) => (s.wins ? `Побед: ${s.wins}` : 'Карточки FC против бота'),
    start(api) {
      // колода: известные полевые игроки с карточкой FC; раздаём по очереди от сильных к слабым, чтобы было поровну
      const pool = shuffle(PLAYERS.filter((p) => p.tier <= 3 && p.pos !== 'ГК' && st(p)), Math.random).slice(0, HAND * 2)
        .sort((a, b) => st(b)[0] - st(a)[0]);
      let me = shuffle(pool.filter((_, i) => i % 2 === 0), Math.random), bot = shuffle(pool.filter((_, i) => i % 2 === 1), Math.random);
      let round = 1, myTurn = Math.random() < 0.5, phase = 'pick', last = null, pot = [], over = false;
      const b = api.body;

      function render() {
        api.sub(`Розыгрыш ${Math.min(round, ROUNDS)}/${ROUNDS}`);
        const tot = me.length + bot.length + pot.length;
        const show = phase !== 'pick' || !myTurn ? last : null;
        b.innerHTML = `<div class="tc-score"><span class="tc-me">Ты <b>${me.length}</b></span>
            <div class="tr-bar"><i style="width:${(me.length / tot) * 100}%"></i></div><span class="tc-bot"><b>${bot.length}</b> Бот</span></div>
          ${pot.length ? `<p class="tc-pot">🏦 В банке ${pot.length} ${plural(pot.length, 'карта', 'карты', 'карт')} — заберёт победитель следующего розыгрыша</p>` : ''}
          <div class="tc-table ${phase}">
            <div class="tc-side"><small>Твоя карта</small>${card(me[0], { hl: show ? show.i : -1, res: show ? show.mine : '', pick: phase === 'pick' && myTurn })}</div>
            <div class="tc-side"><small>Бот</small>${card(bot[0], { open: phase === 'shown', hl: show ? show.i : -1, res: show ? show.his : '' })}</div>
          </div>
          <div class="tc-foot">${phase === 'shown' ? `<p class="tc-res ${last.res}">${last.text}</p><button class="btn gold" data-a="next">${me.length && bot.length && round < ROUNDS ? 'Дальше →' : 'Итоги'}</button>`
            : myTurn ? '<p class="ng-lead">Твой ход: нажми на характеристику, которой бьёшь</p>'
              : '<p class="ng-lead tr-think">Бот выбирает<i>.</i><i>.</i><i>.</i></p>'}</div>`;
        Photos.hydrate(b);
        if (phase === 'shown') {
          $$('.tc-st.hl em', b).forEach((el) => countUp(el, +el.textContent, { from: 40, dur: 500 }));
        }
      }

      function play(i, byBot) {
        if (phase !== 'pick') return;
        const a = st(me[0])[i + 1], c = st(bot[0])[i + 1];
        const res = a > c ? 'win' : a < c ? 'lose' : 'draw';
        const label = STATS[i][1];
        last = {
          i, res, mine: res === 'win' ? 'won' : res === 'lose' ? 'lost' : '', his: res === 'lose' ? 'won' : res === 'win' ? 'lost' : '',
          text: `${byBot ? `Бот выбрал «${label}»: ` : `${label}: `}${a} против ${c} — ${res === 'win' ? 'карта твоя!' : res === 'lose' ? 'забирает бот' : 'ничья, карты в банк'}`,
        };
        phase = 'shown';
        Sound.play(res === 'win' ? 'kick' : res === 'lose' ? 'bad' : 'tap'); haptic(res === 'win' ? 'ok' : res === 'lose' ? 'bad' : 'tap');
        render();
      }
      // забрать карты: проигравшая улетает к победителю
      function settle() {
        const mine = me.shift(), his = bot.shift();
        if (last.res === 'win') { me.push(mine, his, ...pot); pot = []; myTurn = true; }
        else if (last.res === 'lose') { bot.push(his, mine, ...pot); pot = []; myTurn = false; }
        else pot.push(mine, his);
      }
      function next() {
        if (phase !== 'shown') return;
        const table = $('.tc-table', b);
        if (table) table.classList.add(last.res === 'win' ? 'fly-me' : last.res === 'lose' ? 'fly-bot' : 'fly-pot');
        later(() => {
          settle();
          round++; phase = 'pick'; last = null;
          if (!me.length || !bot.length || round > ROUNDS) return finish();
          render();
          if (!myTurn) later(() => play(botPick(bot[0]), true), 1100);
        }, 420);
      }
      function finish() {
        over = true;
        // карты, оставшиеся в банке, не считаются никому
        const won = me.length > bot.length, s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; api.save(); Profile.bump('trumps', 12); }
        NG.end({ title: won ? 'Победа!' : me.length === bot.length ? 'Ничья' : 'Бот оказался сильнее', big: `${me.length}:${bot.length}`,
          stats: [['Побед всего', s.wins || 0]], win: won, reward: won ? 20 + Math.floor(me.length / 2) : 3, again: { label: 'Новая раздача', fn: () => NG.open('trumps') } });
      }
      b.addEventListener('click', (e) => {
        if (over) return;
        const s = e.target.closest('button.tc-st');
        if (s && myTurn && phase === 'pick') return play(+s.dataset.s, false);
        if (e.target.closest('[data-a="next"]')) next();
      });
      render();
      if (!myTurn) later(() => play(botPick(bot[0]), true), 1200);
    },
  });
})();
