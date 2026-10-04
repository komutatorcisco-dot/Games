// Общая оболочка для новых игр: один экран #ng, ежедневное «зерно», поле ввода имени, «Поделиться».
'use strict';

// День по Москве: ежедневные задания меняются в полночь МСК у всех одновременно
const Day = {
  key: (shift = 0) => new Date(Date.now() + 3 * 3600e3 + shift * 864e5).toISOString().slice(0, 10),
  num: () => Math.floor((Date.parse(Day.key()) - Date.parse('2026-10-01')) / 864e5) + 1,
  rng(salt = '') {
    let h = 2166136261;
    for (const ch of Day.key() + salt) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return mulberry32(h >>> 0);
  },
};

// Сравнение имён без регистра, ё/е, дефисов и пробелов
const normName = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
// Мягкое совпадение: опечатка в одну букву прощается для длинных слов
function nameMatch(input, target) {
  const a = normName(input), b = normName(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
const surname = (name) => name.split(' ').slice(-1)[0];

const NG = (() => {
  const list = [];
  let cur = null, cleanup = null;

  const store = (id) => { const S = Store.d.ng || (Store.d.ng = {}); return S[id] || (S[id] = {}); };

  function api(body) {
    const id = cur.id;
    return {
      body,
      sub(t) { $('#ng-sub').textContent = t; },
      st: () => store(id),
      save: () => Store.save(),
      // Состояние сегодняшнего ежедневного задания (сбрасывается в полночь МСК)
      today(init) {
        const s = store(id);
        if (!s.daily || s.daily.day !== Day.key()) s.daily = Object.assign({ day: Day.key(), done: false }, init());
        return s.daily;
      },
      // Серия дней подряд: вызывать при победе в ежедневном задании
      streakWin() {
        const s = store(id);
        s.streak = s.last === Day.key(-1) ? (s.streak || 0) + 1 : 1;
        s.last = Day.key(); s.best = Math.max(s.best || 0, s.streak);
        Store.save();
        return s.streak;
      },
      streakLose() { store(id).streak = 0; Store.save(); },
    };
  }

  function register(g) { list.push(g); }

  // Список подсказок закрывается при нажатии в любом другом месте
  document.addEventListener('pointerdown', (e) => {
    $$('.ng-input .suggest').forEach((box) => { if (!box.hidden && !box.parentNode.contains(e.target)) box.hidden = true; });
  }, true);

  function open(id, opts) {
    leave();
    cur = list.find((g) => g.id === id);
    Modal.close();
    Screens.show('ng');
    $('#ng-title').textContent = cur.title;
    $('#ng-sub').textContent = '';
    const old = $('#ng-body'), body = old.cloneNode(false);
    old.replaceWith(body);
    body.className = 'ng-body ng-' + id;
    cleanup = cur.start(api(body), opts) || null;
  }

  function leave() {
    if (cleanup) { try { cleanup(); } catch (e) { /* ничего */ } cleanup = null; }
  }

  // Плитки игр: группа ('brain') или список id
  function tiles(group) {
    const games = Array.isArray(group) ? group.map((id) => list.find((g) => g.id === id)).filter(Boolean) : list.filter((g) => g.group === group);
    return games.map((g) => {
      const s = store(g.id);
      const meta = g.meta ? g.meta(s) : '';
      const doneToday = g.group === 'daily' && s.daily && s.daily.day === Day.key() && s.daily.done;
      return `<button class="tile-card ${g.wide ? 'wide' : ''}" ${g.act ? `data-act="${g.act}"` : `data-ng="${g.id}"`} style="--c1:${g.c1};--c2:${g.c2}">
        ${doneToday ? '<i class="tile-done">✓</i>' : ''}<span class="tile-ico" data-ico="ng-${g.id}"></span><b>${g.title}</b><small>${meta || g.tag || ''}</small></button>`;
    }).join('');
  }

  // Поле ввода с подсказками. items(q) → [{key, label, sub}]. Без items — свободный ввод по Enter.
  function input(host, { items, onPick, placeholder = 'Начни вводить фамилию…', button = '' }) {
    host.innerHTML = `<div class="guess-input ng-input"><input type="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${esc(placeholder)}">
      ${button ? `<button class="btn gold ng-go" type="button">${button}</button>` : ''}<div class="suggest" hidden></div></div>`;
    const inp = $('input', host), box = $('.suggest', host);
    let opts = [], sel = 0;
    const hide = () => { box.hidden = true; opts = []; };
    const choose = (it) => { hide(); inp.value = ''; onPick(it.key, it); };
    function render() {
      if (!items) return;
      const q = normName(inp.value);
      if (q.length < 2) return hide();
      opts = items(q).slice(0, 6);
      if (!opts.length) { box.innerHTML = '<button type="button" disabled>Нет в базе</button>'; box.hidden = false; return; }
      sel = 0;
      box.innerHTML = opts.map((it, i) => `<button type="button" data-i="${i}" class="${i ? '' : 'sel'}"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('');
      box.hidden = false;
    }
    const submitFree = () => { const v = inp.value.trim(); if (v) { inp.value = ''; hide(); onPick(v, null); } };
    inp.addEventListener('input', render);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (items && opts.length) choose(opts[sel]); else if (!items) submitFree();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        $$('button', box).forEach((b, i) => b.classList.toggle('sel', i === sel));
      } else if (e.key === 'Escape') hide();
    });
    inp.addEventListener('blur', () => setTimeout(hide, 180));
    box.addEventListener('pointerdown', (e) => { const b = e.target.closest('button[data-i]'); if (b) { e.preventDefault(); choose(opts[+b.dataset.i]); } });
    const go = $('.ng-go', host);
    if (go) go.addEventListener('click', () => (items ? opts.length && choose(opts[sel]) : submitFree()));
    return { focus: () => inp.focus(), disable(v) { inp.disabled = v; if (go) go.disabled = v; }, el: inp };
  }

  // Подборки игроков для поля ввода
  const nn = (p) => p._n || (p._n = normName(p.name)), na = (p) => p._a || (p._a = normName(p.alt));
  // сначала совпадение с начала имени, потом известные игроки (уровень 1–3), потом остальные
  const playerItems = (q, skip = new Set()) => PLAYERS.filter((p) => !skip.has(p.name) && (nn(p).includes(q) || na(p).includes(q)))
    .sort((x, y) => (nn(x).startsWith(q) ? 0 : 2) + (x.tier > 3 ? 1 : 0) - (nn(y).startsWith(q) ? 0 : 2) - (y.tier > 3 ? 1 : 0))
    .map((p) => ({ key: p.name, label: p.name, sub: `${p.flag} ${p.club}` }));
  const careerNames = () => [...new Set(CAREERS.map((c) => c.name))];
  const careerItems = (q, skip = new Set()) => careerNames().filter((n) => !skip.has(n) && normName(n).includes(q))
    .sort((x, y) => (normName(x).startsWith(q) ? 0 : 1) - (normName(y).startsWith(q) ? 0 : 1))
    .map((n) => { const c = CAREERS.find((k) => k.name === n); return { key: n, label: n, sub: `${c.flag} ${c.path[c.path.length - 1][0]}` }; });

  function share(text) {
    text += User.sign();
    const url = appLink(cur && cur.id);
    try {
      if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; }
    } catch (e) { /* не в Telegram */ }
    if (navigator.share) { navigator.share({ text, url }).catch(() => {}); return; }
    const done = () => toast('Результат скопирован — вставь в комментарии канала');
    if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(done, () => toast(text)); else toast(text);
  }

  // Окно конца игры
  // Окно конца игры: иконка игры, большая цифра, плашки статистики, квадратики для «Поделиться»
  function end({ title, html = '', reward = 0, again, shareText, win = false, big = '', stats = [], daily = false, record = false }) {
    const g = cur, s = store(g.id);
    if (daily) { if (reward) later(() => Coins.add(reward), 300); } else reward = Econ.play(reward);
    if (win) { Sound.play('goal'); haptic('ok'); confetti(); } else Sound.play('lose');
    const btns = [];
    if (shareText) btns.push({ label: '📤 Поделиться', cls: 'gold', keepOpen: true, onClick: () => share(shareText) });
    if (again) btns.push({ label: again.label || 'Ещё раз', onClick: again.fn });
    btns.push({ label: 'В меню', cls: 'ghost', onClick: () => App.home() });
    const sq = shareText ? (shareText.match(/[🟩🟨🟥⬛⬜]+/gu) || []).join('\n') : '';
    if (s.streak > 1 && !stats.some(([k]) => k === 'Серия')) stats = [...stats, ['Серия', `${s.streak} 🔥`]];
    later(() => Modal.open(resultHtml({ ico: 'ng-' + g.id, c1: g.c1, c2: g.c2, win, big, title, stats, reward, record,
      extra: `${sq ? `<pre class="ng-res-sq">${sq}</pre>` : ''}${html}` }), btns), 500);
  }

  // Короткая подсветка элемента: верно / неверно
  function flash(el, ok) {
    if (!el) return;
    el.classList.remove('ng-ok', 'ng-bad'); void el.offsetWidth;
    el.classList.add(ok ? 'ng-ok' : 'ng-bad');
  }

  // Ежедневные задания на сегодня: [название, сделано?]
  function dailyStatus() {
    const dly = Store.d.dly;
    const out = [['Игрок дня', dly.day === Day.key() && dly.done]];
    list.filter((g) => g.group === 'daily').forEach((g) => { const d = store(g.id).daily; out.push([g.title, !!(d && d.day === Day.key() && d.done)]); });
    return out;
  }

  // Время до следующего ежедневного задания
  function untilTomorrow() {
    const m = new Date(Date.now() + 3 * 3600e3);
    const left = 864e5 - ((m.getUTCHours() * 3600 + m.getUTCMinutes() * 60 + m.getUTCSeconds()) * 1000);
    return `${Math.floor(left / 36e5)} ч ${Math.floor((left % 36e5) / 6e4)} мин`;
  }

  return { register, open, leave, tiles, input, playerItems, careerItems, careerNames, share, end, flash, dailyStatus, untilTomorrow, list };
})();

// Одноклубники по карьерам: два игрока пересекались в одном клубе в одни и те же годы
const Mates = (() => {
  let graph = null;
  const span = (yrs) => {
    const m = String(yrs).match(/(\d{4})\s*[–-]\s*(\d{4})?/);
    if (!m) { const y = String(yrs).match(/\d{4}/); return y ? [+y[0], +y[0]] : null; }
    return [+m[1], m[2] ? +m[2] : 2026];
  };
  function build() {
    if (graph) return graph;
    graph = new Map();
    const stints = [];
    for (const c of CAREERS) for (const [club, yrs] of c.path) { const s = span(yrs); if (s) stints.push([c.name, club.replace(/ \(аренда\)$/, ''), s[0], s[1]]); }
    for (const c of CAREERS) graph.set(c.name, new Map());
    for (let i = 0; i < stints.length; i++) for (let j = i + 1; j < stints.length; j++) {
      const a = stints[i], b = stints[j];
      if (a[0] === b[0] || a[1] !== b[1]) continue;
      // пересечение хотя бы в один сезон (годы сезона: 2015–2017 — это два сезона)
      if (Math.min(a[3], b[3]) - Math.max(a[2], b[2]) < 1) continue;
      graph.get(a[0]).set(b[0], a[1]); graph.get(b[0]).set(a[0], a[1]);
    }
    return graph;
  }
  const of = (name) => build().get(name) || new Map();
  // Кратчайшая цепочка одноклубников (BFS)
  function path(a, b, max = 4) {
    const g = build(), prev = new Map([[a, null]]), q = [a];
    while (q.length) {
      const x = q.shift();
      if (x === b) break;
      for (const y of g.get(x).keys()) if (!prev.has(y)) { prev.set(y, x); q.push(y); }
    }
    if (!prev.has(b)) return null;
    const out = [];
    for (let x = b; x; x = prev.get(x)) out.unshift(x);
    return out.length - 1 <= max ? out : null;
  }
  return { of, path, build };
})();

// Сила игрока для драфта и козырей: рейтинг FC 27, а у кого его нет — оценка по известности и возрасту
const Power = {
  rating(p) {
    if (FC27[p.name]) return FC27[p.name];
    const base = { 1: 85, 2: 80, 3: 75 }[p.tier] || 74;
    const age = new Date().getFullYear() - p.born;
    return base - (age >= 34 ? 3 : age >= 32 ? 1 : 0) + (p.id % 3) - 1;
  },
  value(p) {
    if (VALUES[p.name]) return VALUES[p.name];
    const r = this.rating(p), age = new Date().getFullYear() - p.born;
    return Math.min(200, Math.max(1, Math.round(((r - 68) ** 2) * 0.3 * (age <= 23 ? 1.4 : age >= 31 ? 0.45 : 1))));
  },
};

// Трансферы и клубы в виде массивов (в quizdata.js они после загрузки становятся объектами)
// TR: [игрок, флаг, откуда, куда, год, сумма]; CL: [название, латиницей, страна, флаг, цвета, прозвище, основан, стадион, город, факт]
const TR = () => TRANSFERS.map((t) => (Array.isArray(t) ? t : [t.player, t.flag, t.from, t.to, t.year, t.fee]));
const CL = () => CLUBS.map((c) => (Array.isArray(c) ? c : [c.name, c.alt, c.country, c.flag, c.colors, c.nick, c.founded, c.stadium, c.city, c.fact]));
