// «Футбольный Wordle»: угадай фамилию футболиста за 6 попыток. Зелёная буква — на месте, жёлтая — есть в слове.
// После 3-го промаха открывается сборная, после 5-го — клуб (подсказки от сложных к лёгким).
'use strict';

(() => {
  const TRIES = 6;
  const KB = ['ЙЦУКЕНГШЩЗХ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮ'];
  let POOL = null;
  function pool() {
    if (POOL) return POOL;
    const seen = new Set(), out = [];
    const addP = (name, flag, nat, club) => {
      const w = surname(name).toUpperCase().replace(/Ё/g, 'Е');
      if (!/^[А-Я]{4,8}$/.test(w) || seen.has(w)) return;
      seen.add(w); out.push({ w, name, flag, nat, club });
    };
    PLAYERS.filter((p) => p.tier <= 2).forEach((p) => addP(p.name, p.flag, p.nat, p.club));
    CAREERS.forEach((c) => addP(c.name, c.flag, '', c.path[c.path.length - 1][0].replace(/ \(аренда\)$/, '')));
    POOL = out.sort((a, b) => (a.w < b.w ? -1 : 1));
    return POOL;
  }
  // все известные фамилии: догадка должна быть настоящей фамилией, а не набором букв
  let DICT = null;
  function dict() {
    if (DICT) return DICT;
    DICT = new Set();
    const add = (name) => DICT.add(surname(name).toUpperCase().replace(/Ё/g, 'Е'));
    PLAYERS.forEach((p) => add(p.name)); CAREERS.forEach((c) => add(c.name));
    return DICT;
  }
  function score(guess, ans) {
    const res = Array(ans.length).fill('miss'), left = {};
    [...ans].forEach((ch, i) => { if (guess[i] === ch) res[i] = 'hit'; else left[ch] = (left[ch] || 0) + 1; });
    [...guess].forEach((ch, i) => { if (res[i] !== 'hit' && left[ch]) { res[i] = 'near'; left[ch]--; } });
    return res;
  }

  NG.register({
    id: 'wordle', group: 'daily', title: 'Футбольный Wordle', c1: '#ffcf3a', c2: '#c98f00', tag: 'Фамилия за 6 попыток',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? (s.daily.won ? `Сегодня: ${s.daily.rows.length}/6 ✓` : 'Сегодня не вышло') : 'Новое слово'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const P = pool();
      const ans = practice ? pick(P) : P[Math.floor(Day.rng('wordle')() * P.length)];
      const L = ans.w.length;
      const st = practice ? { rows: [], done: false } : api.today(() => ({ rows: [] }));
      let cur = '', fresh = -1, bad = false;
      const b = api.body;
      b.innerHTML = `<p class="ng-lead">Фамилия из <b>${L}</b> ${plural(L, 'буквы', 'букв', 'букв')}</p><div class="wd-grid" style="--l:${L}"></div><p class="ng-clue"></p><div class="wd-kb"></div>`;

      function render() {
        api.sub(practice ? 'Тренировка' : `#${Day.num()}`);
        // только что отправленный ряд переворачивается по одной букве
        const rows = st.rows.map((g, ri) => { const r = score(g, ans.w); return [...g].map((ch, i) => `<i class="${r[i]} ${ri === fresh ? 'flip' : 'done'}" style="--d:${i * 110}ms">${ch}</i>`).join(''); });
        const curRow = rows.length;
        if (!st.done && rows.length < TRIES) rows.push([...cur.padEnd(L)].map((ch) => `<i class="${ch.trim() ? 'typed' : ''}">${ch.trim()}</i>`).join(''));
        while (rows.length < TRIES) rows.push('<i></i>'.repeat(L));
        $('.wd-grid', b).innerHTML = rows.map((r, i) => `<div class="wd-row ${i === curRow && bad ? 'ng-bad' : ''} ${st.won && i === st.rows.length - 1 && fresh === i ? 'win' : ''}">${r}</div>`).join('');
        fresh = -1; bad = false;
        const miss = st.rows.length - (st.won ? 1 : 0);
        $('.ng-clue', b).innerHTML = [miss >= 3 ? `Сборная: ${ans.flag} ${esc(ans.nat || '')}` : '', miss >= 5 ? `Клуб: ${esc(ans.club)}` : ''].filter(Boolean).join(' · ') || 'После 3-го промаха — сборная, после 5-го — клуб';
        const keyState = {};
        st.rows.forEach((g) => score(g, ans.w).forEach((s, i) => { const ch = g[i]; if (keyState[ch] !== 'hit') keyState[ch] = s === 'hit' ? 'hit' : keyState[ch] === 'near' ? 'near' : s; }));
        $('.wd-kb', b).innerHTML = KB.map((r, ri) => `<div>${ri === 2 ? '<button data-k="enter" class="wide">ВВОД</button>' : ''}${[...r].map((ch) => `<button data-k="${ch}" class="${keyState[ch] || ''}">${ch}</button>`).join('')}${ri === 2 ? '<button data-k="del" class="wide">⌫</button>' : ''}</div>`).join('');
      }
      function key(k) {
        if (st.done || st.won || st.rows.length >= TRIES) return;
        if (k === 'del') cur = cur.slice(0, -1);
        else if (k === 'enter') {
          if (cur.length < L) { toast(`Нужно ${L} ${plural(L, 'буква', 'буквы', 'букв')}`); bad = true; haptic('bad'); render(); return; }
          if (!dict().has(cur)) { toast('Нет такого футболиста — попробуй другую фамилию'); bad = true; haptic('bad'); render(); return; }
          st.rows.push(cur); cur = ''; fresh = st.rows.length - 1;
          if (st.rows[st.rows.length - 1] === ans.w) { st.won = true; render(); return later(finish, L * 110 + 400); }
          Sound.play('tap');
          if (st.rows.length >= TRIES) { render(); return later(finish, L * 110 + 400); }
          api.save();
        } else if (cur.length < L) { cur += k; Sound.play('tap'); }
        render();
      }
      function finish() {
        st.done = true; api.save(); fresh = -2; render();
        const n = st.rows.length;
        const reward = st.won ? (practice ? 10 : [0, 60, 50, 40, 30, 22, 15][n]) : 0;
        if (!practice) { if (st.won) api.streakWin(); else api.streakLose(); }
        if (st.won) Profile.bump('wordle', 10);
        const sq = st.rows.map((g) => score(g, ans.w).map((s) => ({ hit: '🟩', near: '🟨', miss: '⬛' }[s])).join('')).join('\n');
        NG.end({
          title: st.won ? 'Угадал!' : 'Не угадал', win: st.won, reward, daily: !practice, big: `${st.won ? n : 'X'}/6`,
          html: `<div class="player-card">${avatar(ans.name, 'xl')}<div class="pname">${esc(ans.name)}</div><div class="pmeta">${ans.flag} ${esc(ans.club)}</div></div>`,
          shareText: practice ? '' : `⚽ Футбольный Wordle #${Day.num()} — ${st.won ? n : 'X'}/6\n${sq}\nСтарики Джексоны`,
          again: { label: 'Тренировка: другое слово', fn: () => NG.open('wordle', { practice: true }) },
        });
      }
      b.addEventListener('click', (e) => { const k = e.target.closest('[data-k]'); if (k) key(k.dataset.k); });
      const onKey = (e) => {
        if (Screens.current !== 'ng' || Modal.isOpen) return;
        if (e.key === 'Enter') key('enter'); else if (e.key === 'Backspace') key('del');
        else { const ch = e.key.toUpperCase().replace('Ё', 'Е'); if (/^[А-Я]$/.test(ch)) key(ch); }
      };
      document.addEventListener('keydown', onKey);
      render();
      if (st.done && !practice) later(() => Modal.open(`<h2>${st.won ? 'Сегодня угадано ✓' : 'Сегодня не вышло'}</h2><p>Это ${esc(ans.name)}. Новое слово через ${NG.untilTomorrow()}.</p>`,
        [{ label: 'Тренировка: другое слово', onClick: () => NG.open('wordle', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
      return () => document.removeEventListener('keydown', onKey);
    },
  });
})();
