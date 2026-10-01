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
      else h.impactOccurred('light');
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'ok' ? [20, 40, 20] : kind === 'bad' ? 40 : 8);
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
      pass: { unlocked: 1, stars: {}, best: {} },
      guess: { level: 1, results: {} },
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
    $$('.coin-count').forEach((el) => { el.textContent = Store.d.coins; });
    if (bump) $$('.coins').forEach((el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); });
  },
  add(n) {
    Store.d.coins += n;
    Store.save();
    this.render(true);
    Sound.play('coin');
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
  show(id) {
    $$('.screen').forEach((s) => { s.hidden = s.id !== id; });
    this.current = id;
    window.scrollTo(0, 0);
  },
};

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
    $('#modal').hidden = false;
    const first = $('input', card) || $('button', box);
    if (first) setTimeout(() => first.focus(), 50);
  },
  close() { $('#modal').hidden = true; },
  get isOpen() { return !$('#modal').hidden; },
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
