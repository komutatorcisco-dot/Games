// Общие штуки для всех игр: сохранение, монеты, экраны, звук, модалки.
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

// Telegram Mini App: если игра открыта внутри Telegram, разворачиваем на весь экран.
// В обычном браузере скрипт Telegram тоже создаёт WebApp, но с пустым initData — тогда считаем, что мы не в Telegram.
const TG = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp : null;
try { if (TG) { TG.ready(); TG.expand(); } } catch (e) { /* открыто не в Telegram */ }
// Свайп вниз в Telegram сворачивал мини-приложение, когда листаешь страницу вверх. Отключаем (Telegram 7.7+).
try { if (TG && TG.disableVerticalSwipes) TG.disableVerticalSwipes(); } catch (e) { /* старый Telegram */ }

// Гасит следующий клик по странице: нужен, когда выбор делается по отпусканию пальца,
// а исчезающий список иначе «пропускает» нажатие на кнопку под ним.
function swallowNextClick(ms = 600) {
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); off(); };
  const off = () => { document.removeEventListener('click', stop, true); clearTimeout(t); };
  const t = setTimeout(off, ms);
  document.addEventListener('click', stop, true);
}
// Ссылка на игры в боте: открывает Mini App прямо в Telegram. start — экран, который откроется сразу (как #daily).
const APP_LINK = 'https://t.me/JacksonGamesbot/games';
const appLink = (start) => APP_LINK + (start ? `?startapp=${start}` : '');

function haptic(kind) {
  try {
    const h = TG && TG.HapticFeedback;
    if (h && TG.platform && TG.platform !== 'unknown') {
      if (kind === 'ok') h.notificationOccurred('success');
      else if (kind === 'bad') h.notificationOccurred('error');
      else h.impactOccurred(kind === 'pop' ? 'rigid' : 'light');
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? [20, 40, 20] : kind === 'bad' ? 40 : kind === 'pop' ? 14 : 8);
    }
  } catch (e) { /* без вибрации */ }
}

// Сохранение прогресса в браузере игрока.
const Store = {
  KEY: 'oldjacksons.hub.v1',
  d: null,
  defaults() {
    return {
      coins: 100,
      sound: true,
      lastDaily: '',
      lastWheel: '',
      pass: { unlocked: 1, stars: {}, best: {} },
      guess: { level: 1, results: {} },
      career: { idx: 0, solved: {}, streak: 0, best: 0 },
      club: { streak: 0, best: 0 },
      transfer: { best: 0, hlBest: 0 },
      ttt: { wins: 0 },
      compare: { fcBest: 0, valBest: 0 },
      auction: { wins: 0 },
      nation: { best: 0 },
      pick: { games: 0 },
      howto: {},
      dailyStreak: 0,
      stats: { xp: 0, wins: {} },
      music: true,
      duel: { a: 'Данил', b: 'Саша' },
      dly: { day: '', ev: [], level: 1, done: false, won: false, retry: false, tries: 6, guessed: [], streak: 0, best: 0, lastWin: '', played: 0, wins: 0 },
      limits: { day: '', auction: 0, pick: 0 },
      econ: { day: '', earned: 0 },
      user: { nick: '', emoji: '⚽', since: '' },
      recent: [],
      ng: {},
      shop: { lives: 0, owned: {}, frame: 'none', cards: 'classic', balls: 'classic', packs: {} },
    };
  },
  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { raw = null; }
    this.d = this.merge(raw);
    this.loadedTs = (raw && raw.ts) || 0; // время сохранения на момент запуска: с ним сравниваем облако
  },
  // Сохранение поверх значений по умолчанию; новые разделы (дуэли, настройки) тоже сохраняются
  merge(raw) {
    const d = this.defaults();
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) {
        if (raw[k] === undefined) continue;
        d[k] = (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? Object.assign(d[k], raw[k]) : raw[k];
      }
    }
    return d;
  },
  save(local) {
    this.d.ts = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.d)); } catch (e) { /* приватный режим */ }
    if (!local) Cloud.schedule();
  },
};

// Облачное сохранение в Telegram (CloudStorage): прогресс не теряется и одинаковый на телефоне и компьютере.
// Значение одного ключа — до 4096 символов, поэтому сохранение режется на куски s0, s1, … ; в sn — число кусков, в st — время.
const Cloud = (() => {
  const CHUNK = 4000;
  let timer = null, busy = false, again = false, ready = false;
  const cs = () => {
    try { return TG && TG.CloudStorage && TG.isVersionAtLeast && TG.isVersionAtLeast('6.9') ? TG.CloudStorage : null; } catch (e) { return null; }
  };
  const call = (fn, ...args) => new Promise((ok) => { try { cs()[fn](...args, (err, res) => ok(err ? null : res)); } catch (e) { ok(null); } });

  async function push() {
    if (!cs()) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const str = JSON.stringify(Store.d), n = Math.ceil(str.length / CHUNK);
      for (let i = 0; i < n; i++) await call('setItem', 's' + i, str.slice(i * CHUNK, (i + 1) * CHUNK));
      await call('setItem', 'sn', String(n));
      await call('setItem', 'st', String(Store.d.ts || 0));
    } finally { busy = false; }
    if (again) { again = false; push(); }
  }
  // сохраняем не чаще раза в 3 секунды
  function schedule() {
    if (!cs() || !ready) return; // пока не сверились с облаком, не перезаписываем его
    clearTimeout(timer);
    timer = setTimeout(push, 3000);
  }
  // При запуске: если в облаке сохранение новее — берём его, иначе отправляем своё
  async function pull() {
    if (!cs()) return false;
    const meta = await call('getItems', ['sn', 'st']);
    if (!meta) { ready = true; return false; } // облако недоступно — не трогаем его
    const n = +meta.sn, ts = +meta.st;
    ready = true;
    if (!n || !(ts > Store.loadedTs)) { push(); return false; }
    const keys = Array.from({ length: n }, (_, i) => 's' + i);
    const parts = await call('getItems', keys);
    if (!parts) return false;
    try {
      const raw = JSON.parse(keys.map((k) => parts[k] || '').join(''));
      Store.d = Store.merge(raw);
      Store.d.ts = ts;
      try { localStorage.setItem(Store.KEY, JSON.stringify(Store.d)); } catch (e) { /* без локальной копии */ }
      return true;
    } catch (e) { return false; }
  }
  // при сворачивании Mini App сохраняем сразу
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); timer = null; push(); } });
  return { schedule, pull, push, on: () => !!cs() };
})();

const Coins = {
  render(bump) {
    $$('.coin-count').forEach((el) => {
      const from = parseInt(el.textContent, 10);
      if (bump && !Number.isNaN(from) && from !== Store.d.coins) countUp(el, Store.d.coins, { from, dur: 500 });
      else el.textContent = Store.d.coins;
    });
    if (bump) $$('.coins').forEach((el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); });
  },
  add(n) {
    Store.d.coins += n;
    Store.save();
    const flew = this.fly(n);
    setTimeout(() => { this.render(true); Sound.play('coin'); }, flew ? 650 : 0);
  },
  // Монетки летят от места последнего нажатия к кошельку на текущем экране.
  last: { x: innerWidth / 2, y: innerHeight / 2 },
  fly(n) {
    const wallet = $$('.coins').find((el) => el.offsetParent);
    if (!wallet || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return false;
    const r = wallet.getBoundingClientRect();
    const tx = r.left + 18, ty = r.top + r.height / 2;
    const count = Math.min(8, 2 + Math.ceil(n / 15));
    for (let i = 0; i < count; i++) {
      const c = document.createElement('span');
      c.className = 'coin fly-coin';
      const x = this.last.x + (Math.random() - 0.5) * 50, y = this.last.y + (Math.random() - 0.5) * 30;
      c.style.left = x + 'px'; c.style.top = y + 'px';
      document.body.appendChild(c);
      const a = c.animate([
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 40}px), calc(-50% - 40px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${tx - x}px), calc(-50% + ${ty - y}px)) scale(.6)`, opacity: 1 },
      ], { duration: 520 + i * 50, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      a.onfinish = () => c.remove();
    }
    return true;
  },
  spend(n) {
    if (Store.d.coins < n) {
      toast(`Не хватает монет: нужно ${n}. Проходи уровни, чтобы заработать.`);
      haptic('bad');
      return false;
    }
    Store.d.coins -= n;
    Store.save();
    this.render(true);
    return true;
  },
};

// Простые звуки без файлов: синтез через WebAudio.
const Sound = {
  ctx: null,
  play(kind) {
    if (!Store.d || !Store.d.sound) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      const t = c.currentTime;
      const notes = {
        kick: [[160, 0, .09, 'triangle']],
        bad: [[110, 0, .14, 'sawtooth']],
        tap: [[520, 0, .05, 'sine']],
        token: [[330, 0, .05, 'triangle'], [660, .03, .06, 'sine']],
        whistle: [[2800, 0, .14, 'sine'], [2650, .18, .12, 'sine'], [2900, .34, .42, 'sine']],
        coin: [[988, 0, .07, 'square'], [1319, .07, .12, 'square']],
        goal: [[523, 0, .12, 'square'], [659, .12, .12, 'square'], [784, .24, .12, 'square'], [1047, .36, .3, 'square']],
        lose: [[392, 0, .18, 'triangle'], [330, .18, .18, 'triangle'], [262, .36, .35, 'triangle']],
      }[kind] || [[440, 0, .05, 'sine']];
      for (const [f, at, dur, type] of notes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t + at);
        g.gain.setValueAtTime(.06, t + at);
        g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
        o.connect(g).connect(c.destination);
        o.start(t + at);
        o.stop(t + at + dur + .02);
      }
    } catch (e) { /* звук недоступен */ }
  },  // Звук пузырька поп-ита: сухой щелчок (короткий шум) и глухой «чпок» с падающей высотой.
  pop(v = 1) {
    if (!Store.d || !Store.d.sound) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, t = c.currentTime;
      if (!this.noise) {
        const len = Math.floor(c.sampleRate * 0.03);
        this.noise = c.createBuffer(1, len, c.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      }
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), g1 = c.createGain();
      n.buffer = this.noise;
      bp.type = 'bandpass'; bp.frequency.value = 2200 * v; bp.Q.value = 1.4;
      g1.gain.value = 0.18;
      n.connect(bp).connect(g1).connect(c.destination);
      n.start(t);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(380 * v, t);
      o.frequency.exponentialRampToValueAtTime(120 * v, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.12);
    } catch (e) { /* звук недоступен */ }
  },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Screens = {
  current: 'hub',
  gen: 0, // растёт при каждой смене экрана: отложенные действия прошлой игры по нему понимают, что устарели
  show(id) {
    this.gen++;
    $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
    // плавное появление экрана и каскад карточек
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
      $$('.tile-card, .game-card, .auction-hero, .runner-hero, .wheel-card, .daily, .rank-card, .stat, .ach, .tour, .pick-club', el)
        .forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
    }
    this.current = id;
    window.scrollTo(0, 0);
  },
};

// Встряхнуть элемент (потеря жизни и т.п.)
function bump(el, cls = 'hit') {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

// Отложенное действие внутри игры. Если игрок ушёл с экрана или начал заново, оно не сработает.
function later(fn, ms) {
  const g = Screens.gen;
  return setTimeout(() => { if (Screens.gen === g) fn(); }, ms);
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// Модалка: html-содержимое + список кнопок [{label, cls, onClick}].
const Modal = {
  open(html, buttons = []) {
    const card = $('#modal-card');
    card.innerHTML = html + '<div class="btns"></div>';
    const box = $('.btns', card);
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', () => {
        if (b.keepOpen !== true) this.close();
        b.onClick && b.onClick();
      });
      box.appendChild(el);
    });
    clearTimeout(this.closing);
    $('#modal').classList.remove('closing');
    $('#modal').hidden = false;
    if (typeof Photos !== 'undefined') Photos.hydrate(card);
    const first = $('button', box); // не фокусируем поле ввода: на iPhone клавиатура ломает окно
    if (first) setTimeout(() => first.focus(), 50);
  },
  // Закрытие с короткой анимацией. Если сразу открыть новое окно, оно отменит скрытие.
  close() {
    const m = $('#modal');
    if (m.hidden || m.classList.contains('closing')) return;
    m.classList.add('closing');
    clearTimeout(this.closing);
    this.closing = setTimeout(() => { m.hidden = true; m.classList.remove('closing'); }, 170);
  },
  get isOpen() { const m = $('#modal'); return !m.hidden && !m.classList.contains('closing'); },
};

function confetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ffffff', '#ffcf3a', '#ffe58a', '#c9c9d1', '#ffb020'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = pick(colors);
    p.style.animationDuration = 1.4 + Math.random() * 1.6 + 's';
    p.style.animationDelay = Math.random() * .4 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3600);
}

// Реплики ведущих канала после побед и поражений.
const QUOTES = {
  win: [
    ['danil', 'Данил', 'Ну это уровень. Я бы так же сделал, честно.'],
    ['sasha', 'Саша', 'Даже я бы дольше думал. Респект.'],
    ['danil', 'Данил', 'Записываем в состав мечты.'],
    ['sasha', 'Саша', 'Чисто, без шансов для защиты.'],
    ['danil', 'Данил', 'Вот это я понимаю футбольный IQ.'],
    ['sasha', 'Саша', 'Скинь это в комменты, пусть все видят.'],
  ],
  lose: [
    ['danil', 'Данил', 'Бывает. Даже у Месси бывают пустые матчи.'],
    ['sasha', 'Саша', 'Я бы угадал. Наверное. Попробуй ещё.'],
    ['danil', 'Данил', 'Тренер недоволен, но шанс ещё будет.'],
    ['sasha', 'Саша', 'Ничего, на следующем отыграешься.'],
  ],
};
function quoteHtml(kind) {
  const [cls, name, text] = pick(QUOTES[kind]);
  return `<div class="quote ${cls}"><b>${name}:</b>${esc(text)}</div>`;
}

// Единый экран итога для всех игр: иконка, большая цифра, заголовок, плашки, награда.
// act — действие плитки на главной (оттуда берутся цвета иконки), ico — ключ иконки в Icons.
function resultHtml({ act = '', ico = '', c1 = '', c2 = '', win = false, big = '', title = '', text = '', stats = [], extra = '', reward = 0, record = false, score = null, labels = null }) {
  if (typeof Board !== 'undefined') Board.submit(); // и отправляет опыт в рейтинг канала
  // награды: трофеи, паки за победы, задания (подпись покажем на табло)
  const rw = typeof Rewards !== 'undefined' ? Rewards.onEnd(win, typeof Track !== 'undefined' ? Track.game() : '') : '';
  if (typeof Track !== 'undefined') Track.end(win); // статистика: партию доиграли
  // итог любой игры — табло стадиона: счёт «верно : ошибки», число (серия, очки) или просто исход
  const led = score ? `<b>${score[0]}</b><i>:</i><b class="${labels ? '' : 'bad'}">${score[1]}</b>`
    : big !== '' ? `<b class="ng-res-big">${big}</b>` : `<b class="word">${win ? 'ПОБЕДА' : 'НЕ ВЫШЛО'}</b>`;
  return `<div class="ng-res ${win ? 'win' : 'lose'}">
    <div class="sb"><div class="sb-k">Финальный свисток${ico ? `<span class="sb-ico">${Icons.get(ico)}</span>` : ''}</div>
      <div class="sb-led ${String(score ? score.join('') : big).length > 5 ? 'long' : ''}">${led}</div>${score ? `<div class="sb-lb"><span>${labels ? labels[0] : 'верно'}</span><span>${labels ? labels[1] : 'ошибки'}</span></div>` : ''}
      ${record ? '<span class="res-record">Новый рекорд</span>' : ''}
      ${stats.length ? `<div class="ng-res-stats">${stats.map(([k, v]) => `<span><b>${v}</b><small>${k}</small></span>`).join('')}</div>` : ''}
      ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}${rw}</div>
    <h2>${title}</h2>${text ? `<p class="res-text">${text}</p>` : ''}${extra}</div>`;
}

// Профиль игрока: опыт, звания, победы по играм.
const RANKS = [
  [0, 'Новичок'], [60, 'Дворовый игрок'], [180, 'Любитель'], [400, 'Полупрофи'],
  [800, 'Профи'], [1400, 'Звезда'], [2400, 'Легенда'], [4000, 'Старик Джексон'],
];
const Profile = {
  bump(game, xp = 10) {
    const S = Store.d.stats;
    S.wins[game] = (S.wins[game] || 0) + 1;
    const before = this.rank().name;
    S.xp += xp;
    Store.save();
    const after = this.rank().name;
    if (after !== before) setTimeout(() => toast(`Новое звание: ${after}!`), 900);
  },
  wins: (game) => Store.d.stats.wins[game] || 0,
  rank() {
    const xp = Store.d.stats.xp;
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    const next = RANKS[i + 1];
    return { name: RANKS[i][1], xp, from: RANKS[i][0], to: next ? next[0] : null, nextName: next ? next[1] : null };
  },
};

// Дневные лимиты: в аукцион и «Возьмёшь этого или другого?» 5 бесплатных игр в день, дальше — за монеты.
// День меняется в полночь по Москве.
const Limits = {
  FREE: 5, COST: 20,
  NAMES: { auction: 'Аукцион', pick: '«Возьмёшь этого или другого?»' },
  day: () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10),
  sync() {
    const L = Store.d.limits;
    if (L.day !== this.day()) { L.day = this.day(); L.auction = 0; L.pick = 0; Store.save(); }
    return L;
  },
  left(k) { return Math.max(0, this.FREE - this.sync()[k]); },
  label(k) { const n = this.left(k); return n ? `Бесплатно сегодня: ${n} из ${this.FREE}` : `Сегодня за ${this.COST} монет`; },
  take(k, go) {
    const L = this.sync();
    if (L[k] < this.FREE) { L[k]++; Store.save(); go(); return; }
    Modal.open(
      `<h2>Бесплатные игры закончились</h2><p>${this.NAMES[k]}: ${this.FREE} бесплатных игр в день. Новые — в полночь по Москве.</p>`,
      [
        { label: `Сыграть за ${this.COST} монет`, onClick: () => { if (Coins.spend(this.COST)) { Modal.close(); go(); } } },
        { label: 'В меню', cls: 'ghost', onClick: () => App.home() },
      ],
    );
  },
};

// Экономика монет. Ежедневное (вход, колесо, сундук, игры дня, первые звёзды уровней) платится полностью.
// Повторяемые игры платят полностью первые 200 монет за день, следующие 200 — наполовину, дальше — 10%.
// Так монеты нельзя бесконечно фармить одной быстрой игрой, а косметика остаётся целью на недели.
const Econ = {
  TIERS: [[200, 1], [400, 0.5], [Infinity, 0.1]],
  sync() {
    const e = Store.d.econ;
    if (e.day !== Limits.day()) { e.day = Limits.day(); e.earned = 0; }
    return e;
  },
  // Сколько реально начислить за повторяемую игру с наградой n (без начисления)
  quote(n) {
    let left = n, at = this.sync().earned, out = 0;
    for (const [to, k] of this.TIERS) {
      const take = Math.min(left, Math.max(0, to - at));
      out += take * k; left -= take; at += take;
    }
    return Math.max(n > 0 ? 1 : 0, Math.round(out));
  },
  // Начисляет награду за повторяемую игру и возвращает фактическую сумму
  play(n) {
    if (!n) return 0;
    const e = this.sync(), was = this.mult(), got = this.quote(n);
    e.earned += n; Store.save();
    Coins.add(got);
    const now = this.mult();
    if (now < was) later(() => toast(now === 0.5 ? 'За игры сегодня уже 200 монет: дальше награда вполовину. Игры дня платят полностью' : 'Дневной запас монет за игры исчерпан: дальше 10% награды. Новый день — в полночь по МСК'), 1200);
    return got;
  },
  mult() { const at = this.sync().earned; return this.TIERS.find(([to]) => at < to)[1]; },
  left() { return Math.max(0, this.TIERS[0][0] - this.sync().earned); },
};

// Поле ввода с подсказками: имена футболистов или клубов.
// items(q) возвращает [{key, label, sub}], onPick(key) вызывается при выборе.
function Picker(inputSel, boxSel, items, onPick) {
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, '');
  const input = $(inputSel), box = $(boxSel);
  let list = [], sel = 0;
  const hide = () => { box.hidden = true; list = []; };
  function render() {
    const q = norm(input.value.trim());
    if (q.length < 2) { hide(); return; }
    list = items(q, norm).slice(0, 6);
    if (!list.length) { box.innerHTML = '<button type="button" disabled>Нет в базе</button>'; box.hidden = false; return; }
    sel = 0;
    box.innerHTML = list.map((it, i) => `<button type="button" data-i="${i}" class="${i ? '' : 'sel'}"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('');
    box.hidden = false;
  }
  function choose(it) {
    if (!it) return;
    hide();
    input.value = '';
    onPick(it.key);
  }
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (box.hidden || !list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      $$('button', box).forEach((b, i) => b.classList.toggle('sel', i === sel));
    } else if (e.key === 'Enter') { e.preventDefault(); choose(list[sel]); }
    else if (e.key === 'Escape') hide();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) choose(list[+b.dataset.i]);
  });
  document.addEventListener('click', (e) => { if (e.target !== input && !box.contains(e.target)) hide(); });
  return { hide, clear() { input.value = ''; hide(); } };
}

// Плавная «накрутка» числа: 0 → значение, с замедлением в конце, потом короткий «щелчок».
function countUp(el, to, { from = 0, dur = 750, fmt = (v) => v, onDone } = {}) {
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gen = Screens.gen;
  const finish = () => {
    el.textContent = fmt(to);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    // игрок уже ушёл с экрана — продолжение прошлой игры не запускаем
    if (onDone && Screens.gen === gen && el.isConnected) onDone();
  };
  if (reduce || to === from) { finish(); return; }
  const t0 = performance.now();
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * ease(k)));
    if (k < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
}

// Смена пары карточек: верхняя уезжает, нижняя поднимается на её место, новая выезжает снизу.
function shiftStage(stage, render) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { render(); return; }
  stage.classList.add('shifting');
  setTimeout(() => { stage.classList.remove('shifting'); render(); }, 380);
}
