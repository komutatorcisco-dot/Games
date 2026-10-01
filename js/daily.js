// «Игрок дня»: один футболист на день, одинаковый у всех. Подсказки открываются по одной,
// фото становится чётче. Одна попытка в день, вторая — за монеты. Результатом можно поделиться.
'use strict';

const Daily = (() => {
  const START = '2026-10-01';           // день №1
  const MAX = 6;                         // ступеней подсказок и попыток
  const RETRY_COST = 50, RETRY_TRIES = 3;
  const REWARD = [0, 120, 90, 70, 50, 35, 20];
  const BLUR = [0, 26, 20, 15, 10, 6, 3];
  const LINE = { ГК: 0, ЦЗ: 1, ЛЗ: 1, ПЗ: 1, ЦОП: 2, ЦП: 2, ЦАП: 2, ЛВ: 3, ПВ: 3, ФРВ: 3 };
  const YEAR = new Date().getFullYear();

  // День считаем по Москве: новый игрок появляется в полночь по МСК у всех сразу
  const mskNow = () => new Date(Date.now() + 3 * 3600e3);
  const dayKey = (shift = 0) => new Date(mskNow().getTime() + shift * 864e5).toISOString().slice(0, 10);
  const dayNum = () => Math.floor((Date.parse(dayKey()) - Date.parse(START)) / 864e5) + 1;

  let pool = null, answer = null, picker = null, timer = 0;

  // Узнаваемые игроки, у которых есть своё фото: иначе вместо фото были бы инициалы — это подсказка
  function poolList() {
    if (!pool) pool = PLAYERS.filter((p) => FACES[p.name] && p.tier <= 2).sort((a, b) => a.id - b.id);
    return pool;
  }
  function playerOf(n) {
    const list = poolList(), len = list.length;
    const cycle = Math.floor((n - 1) / len);
    const order = shuffle(list, mulberry32(7777 + cycle));
    return order[((n - 1) % len + len) % len];
  }

  const S = () => Store.d.dly;
  function syncDay() {
    const s = S();
    if (s.day === dayKey()) return;
    Object.assign(s, { day: dayKey(), ev: [], level: 1, done: false, won: false, retry: false, tries: MAX, guessed: [] });
    Store.save();
  }
  const used = () => S().ev.filter((e) => e !== 'h').length;  // сколько догадок уже потрачено

  function careerOf(p) {
    const c = CAREERS.find((x) => x.name === p.name);
    if (!c) return [];
    // прошлые клубы, без текущего (он — отдельная подсказка)
    return c.path.map(([club]) => club.replace(/ \(аренда\)$/, '')).filter((club, i, arr) => club !== p.club && arr.indexOf(club) === i);
  }
  function surnameMask(p) {
    const last = p.name.split(' ').slice(-1)[0];
    return `${last[0]}${'•'.repeat(Math.max(0, last.length - 1))} (${last.length} ${plural(last.length, 'буква', 'буквы', 'букв')})`;
  }
  function clues(p) {
    const past = careerOf(p);
    return [
      ['Страна и позиция', `${p.flag} ${esc(p.nat)} · ${esc(p.pos)}`],
      ['Возраст и номер', `${YEAR - p.born} лет · №${p.num}`],
      ['Лига', esc(p.lg)],
      ['Где играл раньше', past.length ? past.map((c) => `<span class="dly-club">${crestImg(c, 'xs')}${esc(c)}</span>`).join('') : 'Всю карьеру в одном клубе'],
      ['Клуб сейчас', `<span class="dly-club">${crestImg(p.club, 'xs')}${esc(p.club)}</span>`],
      ['Фамилия', surnameMask(p)],
    ];
  }

  // ---------- экран ----------
  function start() {
    syncDay();
    answer = playerOf(dayNum());
    Screens.show('dly');
    render();
  }

  function render() {
    const s = S(), p = answer;
    const lvl = s.done ? MAX : s.level;
    $('#dly-sub').textContent = `#${dayNum()} · серия ${s.streak}${s.streak ? ' 🔥' : ''}`;
    $('#dly-photo').style.setProperty('--b', (s.done ? 0 : BLUR[lvl]) + 'px');
    $('#dly-photo').innerHTML = `<img src="img/players/${FACES[p.name]}.webp" alt="">`;
    $('#dly-clues').innerHTML = clues(p).map(([k, v], i) => (i < lvl
      ? `<div class="dly-clue open" style="--i:${i}"><span>${k}</span><b>${v}</b></div>`
      : `<div class="dly-clue"><span>${k}</span><b>🔒 Подсказка ${i + 1}</b></div>`)).join('');
    $('#dly-tries').innerHTML = s.ev.map((e) => `<i class="ev-${e}"></i>`).join('') + '<i></i>'.repeat(Math.max(0, MAX - s.ev.length));
    $('#dly-guesses').innerHTML = s.guessed.map((id) => guessRow(PLAYERS[id])).join('');
    const playing = !s.done && s.tries > used();
    $('#dly-play').hidden = !playing;
    $('#dly-hint').disabled = s.level >= MAX;
    $('#dly-hint').textContent = s.level >= MAX ? 'Все подсказки открыты' : 'Открыть подсказку';
    $('#dly-left').textContent = playing ? `Догадок осталось: ${s.tries - used()}` : '';
    $('#dly-result').hidden = playing;
    if (!playing) renderResult();
  }

  function guessRow(g) {
    const a = answer, ok = (b) => (b ? 'hit' : 'miss');
    const ag = YEAR - g.born, aa = YEAR - a.born;
    return `<div class="dly-g"><b>${esc(g.name)}</b>
      <span class="${ok(g.nat === a.nat)}" title="Сборная">${g.flag}</span>
      <span class="${ok(g.lg === a.lg)}" title="Лига">${esc(g.lg)}</span>
      <span class="${g.pos === a.pos ? 'hit' : LINE[g.pos] === LINE[a.pos] ? 'near' : 'miss'}" title="Позиция">${esc(g.pos)}</span>
      <span class="${ag === aa ? 'hit' : 'miss'}" title="Возраст">${ag}${ag === aa ? '' : ag < aa ? '↑' : '↓'}</span></div>`;
  }

  function renderResult() {
    const s = S(), p = answer;
    const box = $('#dly-result');
    if (s.done) {
      box.innerHTML = `
        <div class="player-card"><img class="dly-face" src="img/players/${FACES[p.name]}.webp" alt=""><div class="pname">${esc(p.name)}</div>
          <div class="pmeta">${p.flag} ${esc(p.nat)} · ${esc(p.club)}</div></div>
        <p class="dly-verdict">${s.won ? `Угадал с ${s.level}-й подсказки! +${REWARD[s.level]} монет` : 'Сегодня не вышло.'}</p>
        <div class="dly-share-row">${shareSquares()}</div>
        <button class="btn gold" data-act="dly-share">Поделиться результатом</button>
        <p class="muted dly-next">Новый игрок через <b id="dly-timer"></b></p>`;
      tick();
    } else {
      // попытки кончились, но вторую попытку ещё можно купить
      box.innerHTML = `
        <p class="dly-verdict">Догадки закончились.</p>
        <button class="btn gold" data-act="dly-retry">Вторая попытка · ${RETRY_COST} монет (+${RETRY_TRIES} догадки)</button>
        <button class="btn ghost" data-act="dly-giveup">Показать ответ</button>`;
    }
  }

  function tick() {
    clearInterval(timer);
    const upd = () => {
      const el = $('#dly-timer');
      if (!el || Screens.current !== 'dly') { clearInterval(timer); return; }
      const m = mskNow(), left = 864e5 - ((m.getUTCHours() * 3600 + m.getUTCMinutes() * 60 + m.getUTCSeconds()) * 1000);
      const h = Math.floor(left / 36e5), mi = Math.floor((left % 36e5) / 6e4), se = Math.floor((left % 6e4) / 1e3);
      el.textContent = `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
      if (left < 1500) { clearInterval(timer); later(start, 1600); }
    };
    upd();
    timer = setInterval(upd, 1000);
  }

  // ---------- ходы ----------
  function guess(id) {
    const s = S();
    if (s.done || s.tries <= used()) return;
    const g = PLAYERS[id];
    if (s.guessed.includes(id)) return;
    s.guessed.push(id);
    if (g.id === answer.id) {
      s.ev.push('w');
      return finish(true);
    }
    s.ev.push('x');
    if (s.level < MAX) s.level++;
    Store.save();
    Sound.play('bad'); haptic('bad');
    if (s.tries <= used()) {
      if (s.retry) return finish(false);
      Store.save();
    }
    render();
    bump($('#dly-photo'), 'shake');
  }

  function hint() {
    const s = S();
    if (s.done || s.level >= MAX) return;
    s.level++;
    s.ev.push('h');
    Store.save();
    Sound.play('tap'); haptic('tap');
    render();
  }

  function retry() {
    const s = S();
    if (s.done || s.retry || !Coins.spend(RETRY_COST)) return;
    s.retry = true;
    s.tries = used() + RETRY_TRIES;
    Store.save();
    render();
  }

  function finish(won) {
    const s = S();
    s.done = true; s.won = won;
    s.played = (s.played || 0) + 1;
    if (won) {
      s.wins = (s.wins || 0) + 1;
      s.streak = s.lastWin === dayKey(-1) ? s.streak + 1 : 1;
      s.lastWin = dayKey();
      s.best = Math.max(s.best, s.streak);
      Profile.bump('daily', 30 - s.level * 3);
      Sound.play('goal'); haptic('ok'); confetti();
      later(() => Coins.add(REWARD[s.level]), 500);
    } else {
      s.streak = 0;
      Sound.play('lose');
    }
    Store.save();
    render();
  }

  // ---------- поделиться ----------
  function shareSquares() {
    const s = S();
    const sq = s.ev.map((e) => ({ x: '🟥', h: '🟨', w: '🟩' }[e]));
    while (sq.length < MAX) sq.push('⬜');
    return sq.join('');
  }
  function shareText() {
    const s = S();
    const res = s.won ? `угадал с ${s.level}-й подсказки` : 'не угадал';
    return `⚽ Игрок дня #${dayNum()} — ${res}\n${shareSquares()}${s.streak > 1 ? `\n🔥 Серия: ${s.streak}` : ''}\nСтарики Джексоны · угадаешь быстрее?`;
  }
  function share() {
    const text = shareText(), url = location.href.split('#')[0] + '#daily';
    try {
      if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; }
    } catch (e) { /* не в Telegram */ }
    if (navigator.share) { navigator.share({ text, url }).catch(() => {}); return; }
    const done = () => toast('Результат скопирован — вставь в комментарии канала');
    if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(done, () => toast(text));
    else toast(text);
  }

  function bind() {
    picker = Picker('#dly-field', '#dly-suggest',
      (q, norm) => PLAYERS.filter((p) => !S().guessed.includes(p.id) && (norm(p.name).includes(q) || norm(p.alt).includes(q)))
        .sort((x, y) => (norm(x.name).startsWith(q) ? 0 : 1) - (norm(y.name).startsWith(q) ? 0 : 1))
        .map((p) => ({ key: p.id, label: p.name, sub: `${p.flag} ${p.club}` })),
      (id) => guess(id));
  }

  // Карточка на главной
  function hubCard() {
    syncDay();
    const s = S();
    $('#dly-card-num').textContent = `#${dayNum()}`;
    $('#dly-card-state').textContent = s.done
      ? (s.won ? `Угадал с ${s.level}-й подсказки ✓` : 'Сегодня не угадал') + ' · новый завтра'
      : s.ev.length ? `Догадок: ${s.ev.filter((e) => e !== 'h').length}, подсказок: ${s.level}` : 'Новый футболист уже ждёт';
    $('#dly-card-streak').textContent = s.streak ? `🔥 ${s.streak}` : '';
    $('#dly-card').classList.toggle('done', s.done);
  }

  return { start, bind, hint, retry, share, hubCard, giveup: () => finish(false), dayKey, get answer() { return answer; } };
})();
