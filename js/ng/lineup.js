// «Состав дня» (как Missing 11): на поле стартовый состав сборной с ЧМ-2026, видны только клубы и число букв.
// Впиши фамилии всех одиннадцати. 5 промахов — конец. Подсказка открывает букву у выбранного игрока.
'use strict';

(() => {
  const MISSES = 5, HINTS = 3;
  const parse = ([nat, flag, scheme, ...xi]) => {
    const sizes = [1, ...scheme.split('-').map(Number)];
    const ps = xi.map((e, i) => { const [name, club] = e.split('|'); return { name, club, i }; });
    const rows = []; let k = 0;
    for (const n of sizes) { rows.push(ps.slice(k, k + n)); k += n; }
    return { nat, flag, scheme, ps, rows };
  };
  const variants = (name) => [name, surname(name), name.replace(/^(де|ван|ди|ле|эль)\s+/i, '')];

  NG.register({
    id: 'lineup', group: 'daily', title: 'Состав дня', c1: '#2fb35a', c2: '#155c32', tag: 'Missing 11',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? `Сегодня: ${s.daily.found.length}/11` : 'Новый состав'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const team = parse(practice ? pick(NATION_XI) : NATION_XI[Math.floor(Day.rng('lineup')() * NATION_XI.length)]);
      const st = practice ? { found: [], misses: 0, hints: 0, open: {}, done: false } : api.today(() => ({ found: [], misses: 0, hints: 0, open: {} }));
      let sel = -1;
      const b = api.body;
      b.innerHTML = `<p class="ng-lead">${team.flag} <b>Сборная: ${esc(team.nat)}</b> · ЧМ-2026 · схема ${team.scheme}</p>
        <div class="nat-pitch ng-pitch"></div><div class="ng-misses"></div><div class="ng-in"></div>
        <div class="ng-row"><button class="btn ghost" data-a="hint">Открыть букву</button><button class="btn ghost" data-a="give">Сдаться</button></div>`;
      const inp = NG.input($('.ng-in', b), { placeholder: 'Впиши фамилию и нажми Enter', button: 'Ввод', onPick: guess });

      function blanks(p) {
        const shown = st.open[p.i] || 0;
        let n = 0;
        return [...p.name].map((ch) => (ch === ' ' || ch === '-' ? ch : n++ < shown ? ch : '_')).join('');
      }
      function render() {
        api.sub(practice ? 'Тренировка' : `#${Day.num()} · найдено ${st.found.length}/11`);
        $('.ng-pitch', b).innerHTML = [...team.rows].reverse().map((r) => `<div class="nat-row">${r.map((p) => {
          const ok = st.found.includes(p.i) || st.done;
          return `<button class="nat-slot ng-slot ${st.found.includes(p.i) ? 'ok' : st.done ? 'miss' : ''} ${sel === p.i ? 'sel' : ''}" data-i="${p.i}">${crestImg(p.club, 'm')}
            <small>${esc(p.club)}</small><b class="ng-name">${ok ? esc(p.name) : esc(blanks(p))}</b></button>`;
        }).join('')}</div>`).join('');
        $('.ng-misses', b).innerHTML = `Промахи: ${'✖'.repeat(st.misses)}${'·'.repeat(MISSES - st.misses)} · подсказок: ${HINTS - st.hints}`;
        inp.disable(st.done);
      }
      function guess(text) {
        if (st.done) return;
        const hit = team.ps.find((p) => !st.found.includes(p.i) && variants(p.name).some((v) => nameMatch(text, v)));
        if (hit) {
          st.found.push(hit.i); Sound.play('kick'); haptic('ok');
          if (st.found.length === 11) return finish();
        } else if (team.ps.some((p) => variants(p.name).some((v) => nameMatch(text, v)))) {
          toast('Этот игрок уже на поле');
        } else {
          st.misses++; Sound.play('bad'); haptic('bad'); toast(`«${text}» нет в этом составе`);
          if (st.misses >= MISSES) return finish();
        }
        api.save(); render();
      }
      function finish() {
        st.done = true; api.save(); render();
        const n = st.found.length;
        const reward = practice ? Math.floor(n / 2) * 2 : n * 8 + (n === 11 ? 40 : 0);
        if (!practice) { if (n >= 8) api.streakWin(); else api.streakLose(); }
        if (n >= 6) Profile.bump('lineup', n * 2);
        const grid = [...team.rows].reverse().map((r) => r.map((p) => (st.found.includes(p.i) ? '🟩' : '⬜')).join('')).join('\n');
        NG.end({
          title: n === 11 ? 'Весь состав!' : `Найдено ${n} из 11`, win: n >= 8, reward,
          html: `<p>${team.flag} ${esc(team.nat)}: ${team.ps.map((p) => esc(p.name)).join(', ')}</p>`,
          shareText: practice ? '' : `⚽ Состав дня #${Day.num()} — ${n}/11\n${grid}\nСтарики Джексоны`,
          again: { label: 'Тренировка: другой состав', fn: () => NG.open('lineup', { practice: true }) },
        });
      }
      b.addEventListener('click', (e) => {
        const s = e.target.closest('.ng-slot');
        if (s && !st.done) { sel = +s.dataset.i; render(); inp.focus(); return; }
        const a = e.target.closest('[data-a]');
        if (!a || st.done) return;
        if (a.dataset.a === 'give') return finish();
        if (st.hints >= HINTS) return toast('Подсказки кончились');
        const target = team.ps.find((p) => p.i === sel && !st.found.includes(p.i)) || team.ps.find((p) => !st.found.includes(p.i));
        st.open[target.i] = (st.open[target.i] || 0) + 1; st.hints++;
        api.save(); render(); Sound.play('tap');
      });
      if (st.done && !practice) {
        render();
        later(() => Modal.open(`<h2>Сегодня: ${st.found.length}/11</h2><p>Новый состав через ${NG.untilTomorrow()}.</p>`,
          [{ label: 'Тренировка: другой состав', onClick: () => NG.open('lineup', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
      } else render();
    },
  });
})();
