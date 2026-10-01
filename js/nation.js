// «Угадай сборную по клубам»: на поле эмблемы клубов, где играют футболисты одной сборной. Какая это страна?
// Данные — из базы игроков (сезон 2026/27): берём сборные, у которых в базе не меньше 7 игроков.
'use strict';

const Nation = (() => {
  const LINES = [['ГК'], ['ЛЗ', 'ЦЗ', 'ПЗ'], ['ЦОП', 'ЦП', 'ЦАП'], ['ЛВ', 'ФРВ', 'ПВ']];
  const HINT_COST = 10;
  let pool = {}, nations = [], all = [], cur = null, lives = 3, streak = 0, lock = false, last = '';

  function prepare() {
    if (nations.length) return;
    for (const p of PLAYERS) (pool[p.nat] = pool[p.nat] || []).push(p);
    nations = Object.keys(pool).filter((n) => pool[n].length >= 7);
    all = Object.keys(pool);
  }
  const flagOf = (nat) => pool[nat][0].flag;
  const lineOf = (pos) => LINES.findIndex((l) => l.includes(pos));

  function start() {
    prepare();
    lives = 3; streak = 0;
    Screens.show('nation');
    round();
  }

  function round() {
    lock = false;
    let nat;
    do nat = pick(nations); while (nat === last && nations.length > 1);
    last = nat;
    // до 11 игроков: вратарь, если есть, остальные случайно
    const ps = shuffle(pool[nat], Math.random);
    const gk = ps.find((p) => p.pos === 'ГК');
    const team = (gk ? [gk] : []).concat(ps.filter((p) => p !== gk && p.pos !== 'ГК')).slice(0, 11);
    // нападение сверху, вратарь снизу — как на схеме в видео
    const rows = [3, 2, 1, 0].map((li) => team.filter((p) => lineOf(p.pos) === li)).filter((r) => r.length);
    const others = shuffle(all.filter((n) => n !== nat && pool[n].length >= 2), Math.random);
    const decoys = shuffle(nations.filter((n) => n !== nat), Math.random).slice(0, 2).concat(others.filter((n) => !nations.includes(n)).slice(0, 1));
    cur = { nat, team, opts: shuffle([nat, ...decoys], Math.random) };
    const S = Store.d.nation;
    $('#nation-sub').textContent = `Серия: ${streak} · рекорд: ${S.best}`;
    $('#nation-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    $('#nation-stage').innerHTML = `<div class="nat-pitch">${rows.map((r) => `<div class="nat-row">${r.map((p) => `
      <div class="nat-slot" data-id="${p.id}">${crestImg(p.club, 'm')}<small>${esc(p.club)}</small><b class="nat-name">${esc(p.name.split(' ').slice(-1)[0])}</b></div>`).join('')}</div>`).join('')}</div>`;
    $('#nation-opts').innerHTML = cur.opts.map((n) => `<button class="btn ghost nat-opt" data-nat="${esc(n)}"><span class="nat-flag">${flagOf(n)}</span>${esc(n)}</button>`).join('')
      + `<button class="btn ghost nat-hint" data-act="nation-hint">Подсказка · ${HINT_COST}</button>`;
  }

  function hint() {
    if (lock) return;
    const hidden = $$('#nation-stage .nat-slot:not(.named)');
    if (!hidden.length) return;
    if (!Coins.spend(HINT_COST)) return;
    pick(hidden).classList.add('named');
    Sound.play('tap');
  }

  function answer(n) {
    if (lock) return;
    lock = true;
    const ok = n === cur.nat;
    $$('#nation-stage .nat-slot').forEach((el, i) => setTimeout(() => el.classList.add('named'), i * 60));
    $$('#nation-opts .nat-opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.nat === cur.nat) b.classList.add('right');
      else if (b.dataset.nat === n) b.classList.add('wrong');
    });
    if (ok) {
      streak++;
      const S = Store.d.nation;
      if (streak > S.best) { S.best = streak; Store.save(); }
      Coins.add(5); Sound.play('kick'); haptic('ok');
      setTimeout(round, 1600);
    } else {
      lives--;
      Sound.play('bad'); haptic('bad');
      $('#nation-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
      setTimeout(lives > 0 ? round : end, 1900);
    }
  }

  function end() {
    if (streak >= 3) Profile.bump('nation', streak * 3);
    Sound.play(streak >= 5 ? 'goal' : 'lose');
    Modal.open(`<h2>Серия: ${streak}</h2><p>Рекорд: <b>${Store.d.nation.best}</b>.</p>${quoteHtml(streak >= 5 ? 'win' : 'lose')}`, [
      { label: 'Ещё раз', onClick: start },
      { label: 'На главную', cls: 'ghost', onClick: () => App.home() },
    ]);
  }

  function bind() {
    $('#nation-opts').addEventListener('click', (e) => { const b = e.target.closest('.nat-opt'); if (b) answer(b.dataset.nat); });
  }

  return { start, hint, bind, get count() { prepare(); return nations.length; } };
})();
