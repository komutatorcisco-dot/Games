// «Угадай сборную по клубам»: на поле эмблемы клубов, где играют футболисты одной сборной. Какая это страна?
// Составы — реальные стартовые одиннадцать (js/nationxi.js), клубы сезона 2026/27. Подсказок нет.
'use strict';

const Nation = (() => {
  // составы: NATION_XI (js/nationxi.js) — реальные стартовые одиннадцать сборных
  let teams = [], cur = null, lives = 3, streak = 0, lock = false, recent = [], revived = false;

  function prepare() {
    if (teams.length) return;
    teams = NATION_XI.map(([nat, flag, scheme, ...xi]) => {
      const sizes = [1, ...scheme.split('-').map(Number)];
      const players = xi.map((e) => { const [name, club] = e.split('|'); return { name, club }; });
      const rows = [];
      let k = 0;
      for (const n of sizes) { rows.push(players.slice(k, k + n)); k += n; }
      return { nat, flag, scheme, rows };
    });
  }

  function start() {
    prepare();
    lives = 3; streak = 0; recent = []; revived = false;
    Screens.show('nation');
    round();
  }

  function round() {
    lock = false;
    // не повторяем последние сборные, пока есть из чего выбрать
    const fresh = teams.filter((t) => !recent.includes(t.nat));
    const team = pick(fresh.length ? fresh : teams);
    recent = [...recent, team.nat].slice(-Math.floor(teams.length / 2));
    const decoys = shuffle(teams.filter((t) => t !== team), Math.random).slice(0, 3);
    cur = { team, opts: shuffle([team, ...decoys], Math.random) };
    const S = Store.d.nation;
    $('#nation-sub').textContent = `Серия: ${streak} · рекорд: ${S.best}`;
    $('#nation-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    // нападение сверху, вратарь снизу — как на схеме в видео
    $('#nation-stage').innerHTML = `<div class="nat-pitch"><span class="nat-scheme">${team.scheme}</span>${[...team.rows].reverse().map((r) => `<div class="nat-row">${r.map((p) => `
      <div class="nat-slot">${crestImg(p.club, 'm')}<small>${esc(p.club)}</small><b class="nat-name">${esc(p.name)}</b></div>`).join('')}</div>`).join('')}</div>`;
    $('#nation-opts').innerHTML = cur.opts.map((t) => `<button class="btn ghost nat-opt" data-nat="${esc(t.nat)}"><span class="nat-flag">${t.flag}</span>${esc(t.nat)}</button>`).join('');
  }

  function answer(n) {
    if (lock) return;
    lock = true;
    const ok = n === cur.team.nat;
    $$('#nation-stage .nat-slot').forEach((el, i) => later(() => el.classList.add('named'), i * 60));
    $$('#nation-opts .nat-opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.nat === cur.team.nat) b.classList.add('right');
      else if (b.dataset.nat === n) b.classList.add('wrong');
    });
    if (ok) {
      streak++;
      const S = Store.d.nation;
      if (streak > S.best) { S.best = streak; Store.save(); }
      Econ.play(3); Sound.play('kick'); haptic('ok');
      later(round, 1600);
    } else {
      lives--;
      Sound.play('bad'); haptic('bad');
      $('#nation-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
      bump($('#nation-lives'));
      later(lives > 0 ? round : lastChance, 1900);
    }
  }

  // Жизни кончились: один раз за игру можно продолжить запасной жизнью
  function lastChance() {
    if (revived || streak < 1) return end();
    Shop.offerLife(`Серия ${streak} под угрозой!`, 'Жизни закончились. Продолжить с одной жизнью?', () => {
      revived = true; lives = 1;
      $('#nation-lives').textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
      round();
    }, end);
  }

  function end() {
    if (streak >= 3) Profile.bump('nation', streak * 3);
    Sound.play(streak >= 5 ? 'goal' : 'lose');
    Modal.open(resultHtml({ act: 'nation', ico: 'nation', win: streak >= 5, big: streak, title: streak >= 5 ? 'Знаешь сборные!' : 'Серия прервалась',
      record: streak >= Store.d.nation.best && streak > 0, stats: [['Рекорд', Store.d.nation.best]], extra: quoteHtml(streak >= 5 ? 'win' : 'lose') }), [
      { label: 'Ещё раз', onClick: start },
      { label: 'На главную', cls: 'ghost', onClick: () => App.home() },
    ]);
  }

  function bind() {
    $('#nation-opts').addEventListener('click', (e) => { const b = e.target.closest('.nat-opt'); if (b) answer(b.dataset.nat); });
  }

  return { start, bind, get count() { prepare(); return teams.length; } };
})();
