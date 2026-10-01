// Общие штуки для всех игр: сохранение, монеты, экраны, звук, модалки.
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

// Telegram Mini App: если игра открыта внутри Telegram, разворачиваем на весь экран.
const TG = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined) ? window.Telegram.WebApp : null;
try { if (TG) { TG.ready(); TG.expand(); } } catch (e) { /* открыто не в Telegram */ }

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
    };
  },
  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { raw = null; }
    const d = this.defaults();
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(d)) {
        if (raw[k] === undefined) continue;
        d[k] = (d[k] && typeof d[k] === 'object') ? Object.assign(d[k], raw[k]) : raw[k];
      }
    }
    this.d = d;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.d)); } catch (e) { /* приватный режим */ }
  },
};

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
  const colors = ['#8fd8c4', '#c65bd8', '#ffcf3a', '#eef8f0', '#34c46a'];
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
