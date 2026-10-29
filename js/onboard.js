// Первый выход в игру (29.10): короткий путь новичка, один шаг за другим, всё в стиле логотипа канала.
//   1 тренировка (урок «Основы») → 2 испытание «Кто сильнее в FC 27?» → 3 «Моменты» (3 атаки) →
//   4 матч с 75-й минуты при 0:1 → выбор сборной → стартовый пак (4 золотых, 6 серебряных, 8 бронзовых;
//   часть — игроки выбранной сборной) → короткий показ разделов меню.
// Состояние: Store.d.ob = { step, nat, res: {…}, done }. Только для новых игроков (нет карточек и трофеев);
// старые игроки его не видят. ?ob=1 — пройти заново (проверка). Каждый шаг можно пропустить.
'use strict';

const Onboard = (() => {
  const S = () => Store.d.ob || (Store.d.ob = { step: 0, res: {} });
  const STEPS = ['intro', 'train', 'quiz', 'mom', 'match', 'nation', 'pack', 'tour'];
  const PLAY = { train: 1, quiz: 2, mom: 3, match: 4 }; // номер шага «из 4» на экране
  let el = null, waiting = null;
  const forced = /[?&]ob=1(&|$)/.test(location.search);
  const isNew = () => { const own = (Store.d.cards && Store.d.cards.own) || {}; return !Object.keys(own).some((k) => own[k] > 0) && !((Store.d.rw && Store.d.rw.trophies) > 0); };

  function layer() {
    if (el) return el;
    el = document.createElement('div'); el.className = 'ob'; document.body.appendChild(el);
    el.addEventListener('click', onClick);
    return el;
  }
  function close() { if (el) { el.remove(); el = null; } }
  const save = () => Store.save();
  const go = (step) => { S().step = STEPS.indexOf(step); save(); show(); };
  const next = () => { S().step = Math.min(STEPS.length - 1, S().step + 1); save(); show(); };
  const skipAll = () => { const s = S(); if (!s.packGot) { s.step = STEPS.indexOf('nation'); save(); show(); } else finish(); };
  // старый «тренер» (js/coach.js) больше не нужен: новый первый вход его заменяет
  const coachOff = () => { const u = Store.d.ui || (Store.d.ui = {}); u.tut = 99; };
  function finish() { const s = S(); s.done = true; coachOff(); save(); close(); if (typeof FCM !== 'undefined') FCM.render(); }

  // ---------- экраны ----------
  const logo = '<img class="ob-logo" src="img/brand/logo-white.png?v=1" alt="Джексоны">';
  const dots = (n) => `<div class="ob-steps">${[1, 2, 3, 4].map((i) => `<i class="${i < n ? 'done' : i === n ? 'on' : ''}"></i>`).join('')}</div>`;
  const card = (n, kicker, title, text, btn, extra = '') => `<div class="ob-card">${dots(n)}<small>${kicker}</small><b>${title}</b><p>${text}</p>${extra}<button class="ob-go" data-ob="run">${btn}</button><button class="ob-skip" data-ob="skip">Пропустить обучение</button></div>`;
  function show() {
    const s = S(), step = STEPS[s.step] || 'intro', L = layer(); L.dataset.step = step;
    if (step === 'intro') L.innerHTML = `<div class="ob-intro">${logo}<p>Добро пожаловать в клуб. Пройди первый выход —<br>и получи стартовый пак на 18 карточек.</p><button class="ob-go" data-ob="next">Начать</button><button class="ob-skip" data-ob="skip">Пропустить</button></div>`;
    else if (step === 'train') L.innerHTML = card(1, 'Шаг 1 из 4 · Тренировка', 'Бег, пас и удар', 'Джойстик слева — бег. Кнопки справа — пас и удар. Пройди короткую тренировку.', 'На тренировку');
    else if (step === 'quiz') { quiz(); return; }
    else if (step === 'mom') L.innerHTML = card(3, 'Шаг 3 из 4 · Моменты', 'Три атаки', 'Короткие атаки: выход один на один, двое против одного и атака с фланга. Забей хотя бы раз.', 'В атаку');
    else if (step === 'match') L.innerHTML = card(4, 'Шаг 4 из 4 · Матч', 'С 75-й минуты', 'Мы проигрываем 0:1, осталось 15 минут. Переверни игру.', 'На поле', `<div class="ob-score"><span>Джексоны</span><em>0 : 1</em><span>Гости</span><i>75'</i></div>`);
    else if (step === 'nation') nation();
    else if (step === 'pack') pack();
    else if (step === 'tour') tour(0);
  }
  // испытание: кто сильнее в FC 27 — три пары карточек, выбрать игрока с бо́льшим рейтингом
  function quiz() {
    const s = S(), q = s.q || (s.q = { i: 0, ok: 0, pairs: null });
    if (!q.pairs) { const G = Cards.all().filter((c) => c.rar === 'gold' && c.r >= 80 && c.face); const pick = () => G[(Math.random() * G.length) | 0];
      q.pairs = []; while (q.pairs.length < 3) { const a = pick(), b = pick(); if (a && b && a.key !== b.key && Math.abs(a.r - b.r) >= 3) q.pairs.push([a.key, b.key]); } save(); }
    if (q.i >= 3) { el.innerHTML = card(2, 'Шаг 2 из 4 · Испытание', q.ok >= 2 ? 'Знаток!' : 'Неплохо', `Угадано ${q.ok} из 3. Рейтинг решает многое — дальше на поле.`, 'Дальше'); el.querySelector('[data-ob="run"]').dataset.ob = 'next'; return; }
    const [a, b] = q.pairs[q.i].map((k) => Cards.get(k));
    el.innerHTML = `<div class="ob-quiz">${dots(2)}<small>Шаг 2 из 4 · Испытание · ${q.i + 1}/3</small><b>Кто сильнее в FC 27?</b>
      <div class="ob-pair">${[a, b].map((c) => `<button class="ob-pc" data-ob="pick" data-k="${esc(c.key)}">${Cards.html(c, { w: 112, cls: 'ob-hide' })}</button>`).join('<span class="ob-vs">VS</span>')}</div>
      <button class="ob-skip" data-ob="skip">Пропустить обучение</button></div>`;
    if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(el);
  }
  function pickQuiz(k, btn) {
    const q = S().q, [a, b] = q.pairs[q.i].map((x) => Cards.get(x)), win = a.r >= b.r ? a : b, ok = k === win.key;
    el.querySelectorAll('.ob-pc').forEach((x) => { x.disabled = true; x.classList.add(x.dataset.k === win.key ? 'win' : 'lose'); x.querySelector('.cc').classList.remove('ob-hide'); });
    btn.classList.add(ok ? 'right' : 'wrong'); Sound.play(ok ? 'coin' : 'tap'); haptic(ok ? 'ok' : 'bad');
    q.i++; if (ok) q.ok++; save(); setTimeout(quiz, 1300);
  }
  // выбор сборной: страны, у которых больше всего карточек
  function nation() {
    const cnt = {}; Cards.all().forEach((c) => { if (c.nat && c.flag && ['gold', 'silver', 'bronze'].includes(c.rar)) cnt[c.nat] = cnt[c.nat] || { n: 0, flag: c.flag }, cnt[c.nat].n++; });
    const top = Object.entries(cnt).sort((x, y) => y[1].n - x[1].n).slice(0, 18);
    el.innerHTML = `<div class="ob-nat"><small>Твой клуб</small><b>За какую сборную болеешь?</b><p>В стартовом паке будут её игроки.</p>
      <div class="ob-flags">${top.map(([n, v]) => `<button data-ob="nat" data-n="${esc(n)}"><i>${v.flag}</i><span>${esc(n)}</span></button>`).join('')}</div></div>`;
  }
  // стартовый пак: 4 золотых, 6 серебряных, 8 бронзовых — примерно половина из выбранной сборной
  function starterKeys(nat) {
    const A = Cards.all(), out = [], used = new Set();
    const take = (rar, n) => { const pool = A.filter((c) => c.rar === rar && !c.sbcOnly && !used.has(c.name)), mine = pool.filter((c) => c.nat === nat), other = pool.filter((c) => c.nat !== nat);
      const half = Math.ceil(n / 2), shuf = (L) => L.sort(() => Math.random() - 0.5);
      for (const c of [...shuf(mine).slice(0, half), ...shuf(other)]) { if (out.filter((k) => Cards.get(k).rar === rar).length >= n) break; if (!used.has(c.name)) { used.add(c.name); out.push(c.key); } } };
    // вратарь в каждом цвете, чтобы «Лучший состав» собрался сразу
    const gk = (rar) => { const c = A.filter((x) => x.rar === rar && x.pos === 'ВРТ' && !used.has(x.name)).sort((x, y) => (y.nat === nat) - (x.nat === nat))[0]; if (c) { used.add(c.name); out.push(c.key); } };
    gk('silver'); take('gold', 4); take('silver', 6); take('bronze', 8);
    return out.slice(0, 18);
  }
  function pack() {
    const s = S();
    el.innerHTML = `<div class="ob-pack"><small>Награда за первый выход</small><b>Стартовый пак</b><p>18 карточек: 4 золотых, 6 серебряных, 8 бронзовых</p>
      <img class="ob-pk" src="img/packs/pk3-360.webp?v=b1" alt=""><button class="ob-go" data-ob="open">Открыть</button></div>`;
    if (s.packGot) { el.querySelector('[data-ob="open"]').textContent = 'Дальше'; el.querySelector('[data-ob="open"]').dataset.ob = 'next'; }
  }
  let ecoTry = false; // запрос стартового пака уже ушёл (не сохраняется)
  function openPack() {
    const s = S(); if (s.packGot) return next();
    // превью: стартовый пак собирает сервер (один раз на аккаунт), иначе — телефон
    if (typeof Eco !== 'undefined' && Eco.on() && !ecoTry) {
      ecoTry = true;
      Eco.starter(s.nat).then((r) => { if (r && r.ok) { Eco.apply(r); s.packGot = true; save(); close(); afterPack(r.keys.map((k) => ({ c: Cards.get(k), isNew: true, coins: 0 })).filter((x) => x.c)); } else { ecoTry = false; toast(r && r.error === 'already' ? 'Стартовый пак уже получен' : 'Сервер не ответил — попробуй ещё раз'); if (r && r.error === 'already') { s.packGot = true; save(); next(); } } });
      return;
    }
    const keys = starterKeys(s.nat); s.packGot = true;
    const res = Cards.add(keys); save(); close();
    afterPack(res);
  }
  function afterPack(res) {
    close(); if (typeof Squad !== 'undefined' && Squad.auto) try { Squad.auto(); } catch (e) { /* состав соберётся позже */ }
    PackOpen.reveal(res, () => { S().step = STEPS.indexOf('tour'); save(); setTimeout(show, 200); }, { pack: 3, name: 'Стартовый пак' });
  }
  // показ разделов: подсветка элемента меню и короткая подпись
  const TOUR = [
    ['.fm-nav [data-fm-tab="team"]', 'Команда', 'Твой состав на поле. Нажми на игрока — увидишь его цифры и сможешь заменить.'],
    ['.fm-hl .fm-lt', 'События', 'Особые события с главами и наградами. Сейчас — «Николас Джексон» с карточкой 84.'],
    ['.fm-nav [data-fm-tab="quests"]', 'Задания', 'Ежедневные и недельные задания — очки пропуска и паки.'],
    ['.fm-nav [data-fm-tab="store"]', 'Магазин', 'Паки за монеты и звёзды. Здесь же трансферный рынок: покупай и продавай игроков, ставки и «купить сразу».'],
    ['.fm-playt', 'Играть', 'Моменты, матч 3 на 3, менеджер и тренировки. Удачи, тренер!'],
  ];
  function tour(i) {
    const L = layer(); if (typeof FCM !== 'undefined') FCM.render();
    if (i >= TOUR.length) return finish();
    const [sel, t, d] = TOUR[i], target = document.querySelector('#fcm ' + sel);
    const r = target ? target.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: innerHeight / 2 - 30, width: 80, height: 60 };
    const pad = 6, x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
    const below = y + h + 130 < innerHeight, tx = Math.max(12, Math.min(innerWidth - 292, x + w / 2 - 140));
    L.innerHTML = `<div class="ob-spot" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>
      <div class="ob-tip" style="left:${tx}px;${below ? `top:${y + h + 12}px` : `bottom:${innerHeight - y + 12}px`}"><small>${i + 1} из ${TOUR.length}</small><b>${t}</b><p>${d}</p>
      <button class="ob-go sm" data-ob="tour" data-i="${i + 1}">${i + 1 < TOUR.length ? 'Дальше' : 'Начать игру'}</button></div>`;
  }

  // ---------- нажатия ----------
  function onClick(e) {
    const b = e.target.closest('[data-ob]'); if (!b) return;
    Sound.play('tap'); const a = b.dataset.ob, step = STEPS[S().step];
    if (a === 'next') return next();
    if (a === 'skip') return skipAll();
    if (a === 'pick') return pickQuiz(b.dataset.k, b);
    if (a === 'nat') { S().nat = b.dataset.n; save(); return go('pack'); }
    if (a === 'open') return openPack();
    if (a === 'tour') return tour(+b.dataset.i);
    if (a === 'run') {
      waiting = step; close();
      if (step === 'train') App.openFootball('fk', 'basics');
      else if (step === 'mom') App.openFootball('moments', null, { mode: 'moments', n: '3', ep: '1v1,2v1,flank' });
      else if (step === 'match') App.openFootball('match', null, { mode: 'match', n: '3', mt: '120', min: '75', sc: '0-1' });
      else next();
    }
  }
  // из футбола: результат шага и возвращение в меню — следующий шаг
  function result(d) { if (!waiting) return; const s = S(); s.res = s.res || {}; s.res[waiting] = d; save(); }
  function back() { if (!waiting) return; waiting = null; setTimeout(next, 300); }

  function start() {
    const s = S(); if (forced && !sessionStorage.getItem('ob-forced')) { sessionStorage.setItem('ob-forced', '1'); Store.d.ob = { step: 0, res: {} }; save(); }
    if (S().done) return;
    if (!forced && !isNew() && !s.step) { s.done = true; coachOff(); save(); return; } // старые игроки — без обучения
    show();
  }
  // ждём экран загрузки, ник и главную (окно ника — первым)
  document.addEventListener('DOMContentLoaded', () => {
    const t = setInterval(() => {
      if (document.getElementById('boot') || (typeof Modal !== 'undefined' && Modal.isOpen) || document.body.dataset.scr !== 'hub' || !(Store.d.user && Store.d.user.nick)) return;
      clearInterval(t); try { start(); } catch (e) { console.error('Onboard', e); }
    }, 400);
  });
  return { result, back, start, show, get state() { return S(); }, get active() { return !!el || (!S().done && (forced || isNew())); } };
})();
