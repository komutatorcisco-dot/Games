// «Ложная девятка»: 9 утверждений о футболе, 3 из них ложные. Найди все три. Ошибиться можно 2 раза.
'use strict';

(() => {
  const LIVES = 2;
  const age = (p) => new Date().getFullYear() - p.born;
  const LINE = { ГК: 'вратарь', ЦЗ: 'защитник', ЛЗ: 'защитник', ПЗ: 'защитник', ЦОП: 'полузащитник', ЦП: 'полузащитник', ЦАП: 'полузащитник', ЛВ: 'нападающий', ПВ: 'нападающий', ФРВ: 'нападающий' };

  // Каждый генератор возвращает {text, fix} — правдивое или ложное утверждение и, для ложного, как на самом деле
  function makers(rnd) {
    const r = (a) => a[Math.floor(rnd() * a.length)];
    const known = PLAYERS.filter((p) => p.tier <= 2);
    const other = (arr, x) => r(arr.filter((y) => y !== x));
    return [
      (lie) => { const p = r(known); const c = lie ? other([...new Set(PLAYERS.filter((q) => q.lg === p.lg).map((q) => q.club))], p.club) : p.club;
        return { text: `${p.name} играет в клубе «${c}»`, fix: `${p.name} — «${p.club}»`, ok: !lie || !c }; },
      (lie) => { const p = r(known); const n = lie ? other([...new Set(PLAYERS.filter((q) => q.cont === p.cont).map((q) => q.nat))], p.nat) : p.nat;
        return { text: `${p.name} выступает за сборную: ${n}`, fix: `${p.name} — ${p.nat}`, ok: !lie || !n }; },
      (lie) => { const p = r(known); const y = lie ? p.born + r([-3, -2, 2, 3]) : p.born;
        return { text: `${p.name} родился в ${y} году`, fix: `${p.name} — ${p.born} г.р.` }; },
      (lie) => { const p = r(known.filter((x) => x.num > 0)); const n = lie ? other([1, 4, 5, 7, 8, 9, 10, 11, 14, 17, 19, 20, 22, 23], p.num) : p.num;
        return { text: `${p.name} играет под номером ${n}`, fix: `${p.name} — №${p.num}` }; },
      (lie) => { const p = r(known); const l = lie ? other(['вратарь', 'защитник', 'полузащитник', 'нападающий'], LINE[p.pos]) : LINE[p.pos];
        return { text: `${p.name} — ${l}`, fix: `${p.name} — ${LINE[p.pos]}` }; },
      (lie) => { const t = r(TR().filter((x) => x[5] >= 20)); const f = lie ? Math.round(t[5] * r([0.55, 0.65, 1.4, 1.6])) : t[5];
        return { text: `${t[0]} перешёл из «${t[2]}» в «${t[3]}» за ${f} млн €`, fix: `На самом деле за ${t[5]} млн €` }; },
      (lie) => { const c = r(CL()); const y = lie ? c[6] + r([-15, -9, 8, 14]) : c[6];
        return { text: `«${c[0]}» основан в ${y} году`, fix: `«${c[0]}» — ${c[6]} год` }; },
      (lie) => { const c = r(CL()); const s = lie ? other(CL().map((k) => k[7]), c[7]) : c[7];
        return { text: `Домашний стадион «${c[0]}» — «${s}»`, fix: `«${c[0]}» играет на «${c[7]}»` }; },
      (lie) => { const c = r(CL()); const s = lie ? other(CL().map((k) => k[5]), c[5]) : c[5];
        return { text: `Прозвище «${c[0]}» — ${s}`, fix: `«${c[0]}» — ${c[5]}` }; },
    ];
  }
  function build(rnd) {
    const ms = makers(rnd), cards = [], used = new Set();
    const lies = new Set(shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rnd).slice(0, 3));
    for (let i = 0; i < 9; i++) {
      for (let t = 0; t < 30; t++) {
        const m = ms[Math.floor(rnd() * ms.length)];
        const c = m(lies.has(i));
        const key = c.text.split(' ').slice(0, 2).join(' ');
        if (used.has(key) || c.ok === false) continue;
        used.add(key); cards.push({ ...c, lie: lies.has(i) }); break;
      }
    }
    return cards;
  }

  NG.register({
    id: 'false9', group: 'daily', title: 'Ложная девятка', c1: '#ff7a59', c2: '#b23d22', tag: 'Найди 3 лжи из 9',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? (s.daily.won ? 'Сегодня ✓' : 'Сегодня не вышло') : '9 утверждений'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const cards = build(practice ? Math.random : Day.rng('false9'));
      const st = practice ? { open: [], wrong: 0, done: false } : api.today(() => ({ open: [], wrong: 0 }));
      const b = api.body;
      // Картинка к утверждению: лицо игрока или эмблема клуба
      const pic = (c) => {
        const p = PLAYERS.find((x) => c.text.startsWith(x.name)) || CAREERS.find((x) => c.text.startsWith(x.name));
        if (p) return avatar(p.name, 's');
        const m = c.text.match(/«([^»]+)»/);
        return m && CRESTS[m[1]] ? crestImg(m[1], 's') : '<span class="f9-q">?</span>';
      };
      let last = -1;
      function render() {
        api.sub(practice ? 'Тренировка' : `#${Day.num()}`);
        const found = st.open.filter((i) => cards[i].lie).length;
        b.innerHTML = `<div class="f9-head"><div class="f9-lies">${[0, 1, 2].map((i) => `<i class="${i < found ? 'on' : ''}">🕵️</i>`).join('')}<small>лжи найдено</small></div>
            <div class="f9-lives">${[...Array(LIVES).keys()].map((i) => `<i class="${i < LIVES - st.wrong ? 'on' : ''}">♥</i>`).join('')}<small>ошибок можно</small></div></div>
          <p class="ng-lead">Три утверждения — ложь. Найди их!</p>
          <div class="f9-grid">${cards.map((c, i) => {
            const shown = st.open.includes(i) || st.done;
            const cls = shown ? (c.lie ? 'lie' : 'truth') : '';
            return `<button class="f9-card ${cls} ${i === last ? 'just' : ''}" data-i="${i}" ${shown ? 'disabled' : ''}>${pic(c)}<span>${esc(c.text)}</span>${shown ? `<small>${c.lie ? `✖ Ложь. ${esc(c.fix)}` : '✓ Правда'}</small>` : ''}</button>`;
          }).join('')}</div>`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
        last = -1;
      }
      function tap(i) {
        if (st.done || st.open.includes(i)) return;
        st.open.push(i); last = i;
        if (cards[i].lie) { Sound.play('kick'); haptic('ok'); } else { st.wrong++; Sound.play('bad'); haptic('bad'); }
        const found = st.open.filter((k) => cards[k].lie).length;
        if (found === 3 || st.wrong >= LIVES) { st.done = true; st.won = found === 3; finish(found); }
        api.save(); render();
      }
      function finish(found) {
        if (!practice) { if (st.won) api.streakWin(); else api.streakLose(); }
        if (st.won) Profile.bump('false9', 12);
        NG.end({
          title: st.won ? 'Все три лжи найдены!' : 'Ложь ускользнула', win: st.won, big: `${found}/3`, stats: [['Ошибки', `${st.wrong}/${LIVES}`]],
          reward: st.won ? (practice ? 10 : 50 - st.wrong * 12) : found * 3, daily: !practice,
          shareText: practice ? '' : `🕵️ Ложная девятка #${Day.num()} — ${st.won ? '✓' : '✗'} (${found}/3, ошибок ${st.wrong})\n${st.open.map((k) => (cards[k].lie ? '🟩' : '🟥')).join('')}\nСтарики Джексоны`,
          again: { label: 'Тренировка', fn: () => NG.open('false9', { practice: true }) },
        });
      }
      b.addEventListener('click', (e) => { const c = e.target.closest('.f9-card'); if (c) tap(+c.dataset.i); });
      render();
      if (st.done && !practice) later(() => Modal.open(`<h2>${st.won ? 'Сегодня ✓' : 'Сегодня не вышло'}</h2><p>Новые утверждения через ${NG.untilTomorrow()}.</p>`,
        [{ label: 'Тренировка', onClick: () => NG.open('false9', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
    },
  });
})();
