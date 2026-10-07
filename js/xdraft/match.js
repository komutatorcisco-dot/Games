// «Драфт»: матч собранным составом против бота. Симуляция — XD.matchStep (engine.js), шаг = 1 игровая минута.
// Тактику игрок меняет когда угодно, она действует со следующего шага. Состояние восстанавливается из зерна и истории
// тактик, поэтому выход из приложения не ломает матч. Те же функции годятся для серверного онлайн-матча (этапы 3–4).
'use strict';

const XMatch = (() => {
  let M = null, timer = null, tac = 2, botTac = 2;
  // откуда матч: драфт (по умолчанию) или «Мой состав» из карточек — у каждого свой экран, состав и сохранение
  const DRAFT = { screen: 'xdraft', body: '#xd-body', st: () => XDraft.S(), form: () => XDraft.A().form, sys: () => XDraft.A().sys, xi: () => XDraft.xiOf(), back: () => { XDraft.S().match = null; Store.save(); XDraft.render(); }, title: () => `Драфт ${XDraft.A().form} · ${XDraft.SYS[XDraft.A().sys]}`, link: 'xdraft' };
  let C = DRAFT;
  const S = () => C.st();
  const BODY = () => $(C.body);
  const EV = { goal: [Ui.get('ball'), 'ГОЛ!'], save: [Ui.get('shield'), 'Сейв вратаря'], miss: [Ui.get('target'), 'Удар мимо'] };

  function use(ctx) { C = ctx || DRAFT; }
  function choose(ctx) {
    if (ctx) C = ctx;
    Modal.open(`<h2>Матч против бота</h2><p>Боты собраны из той же базы и играют по тем же правилам. Сложность — в силе состава и в том, как бот меняет тактику.</p>`,
      Object.entries(XD.BOTS).map(([k, b]) => ({ label: `${b.name}`, cls: k === 'normal' ? '' : 'ghost', onClick: () => start(k) })).concat([{ label: 'Отмена', cls: 'ghost' }]));
  }
  function side(sys, form, xi) { const c = XD.chem(sys, form, xi).total; return { lines: XD.lines(sys, form, xi, c), rating: XD.teamRating(xi), chem: c }; }
  function build(m) {
    const xi = C.xi();
    const bxi = m.bot.xi.map(XDraft.P);
    return XD.matchNew(side(C.sys(), C.form(), xi), side(C.sys(), m.bot.form, bxi), m.seed);
  }
  function start(level) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const bt = XD.botTeam(level, XDraft.pool(), C.sys(), XD.rng(seed ^ 0x5bd1));
    S().match = { seed, level, bot: { form: bt.form, xi: bt.xi.map((p) => p && p.name) }, hist: [], done: false };
    Store.save();
    tac = 2; botTac = 2; M = build(S().match);
    intro();
  }
  function resume(ctx) {
    if (ctx) C = ctx;
    const m = S().match; if (!m) return;
    M = build(m); m.hist.forEach((t) => XD.matchStep(M, t));
    const last = m.hist[m.hist.length - 1] || [2, 2]; tac = last[0]; botTac = last[1];
    if (m.done || M.over) return end();
    render(); run();
  }
  function intro() {
    const m = S().match, b = M.away;
    BODY().innerHTML = `<div class="xm-intro"><div class="xm-vs"><span><b>${esc(Store.d.user.nick || 'Ты')}</b><small>${C.form()} · рейтинг ${M.home.rating} · химия ${M.home.chem}</small></span><i>VS</i>
      <span><b>Бот · ${XD.BOTS[m.level].name}</b><small>${m.bot.form} · рейтинг ${b.rating} · химия ${b.chem}</small></span></div>
      <p class="xm-note">Атака — больше моментов, но больше риска сзади</p>
      <button class="btn gold" data-xm="go">Начать матч</button></div>`;
  }
  function run() {
    clearInterval(timer);
    timer = setInterval(tick, XD.CFG.match.tickMs);
  }
  function tick() {
    if (Screens.current !== C.screen || !M) { clearInterval(timer); return; } // ушли с экрана — пауза, вернёмся — продолжим
    const m = S().match;
    botTac = XD.botTactic(m.level, M, 1, botTac);
    const evs = XD.matchStep(M, [tac, botTac]);
    m.hist.push([tac, botTac]);
    if (M.over) m.done = true;
    Store.save(true);
    evs.forEach((e) => { if (e.t === 'goal') { Sound.play(e.s === 0 ? 'goal' : 'lose'); haptic(e.s === 0 ? 'ok' : 'bad'); } });
    if (M.over) { clearInterval(timer); Sound.play('whistle'); Store.save(); return setTimeout(end, 900); }
    render(evs);
  }

  const SHORT = ['Оборона', 'Осторожно', 'Баланс', 'Атака', 'Ва-банк'];
  let ballX = 50, ballY = 50;
  const sur = (n) => { const w = String(n || '').split(' '); return w.length > 1 ? w.slice(1).join(' ') : n; };
  // кто бил и кто тащил: только для текста, выбор детерминирован (зерно + минута), поэтому после перезапуска тот же
  function who(side, minute) {
    const m = S().match;
    const form = side ? m.bot.form : C.form(), xi = side ? m.bot.xi.map(XDraft.P) : C.xi();
    const R = XD.rng((m.seed ^ (minute * 2654435761)) >>> 0);
    const W = { ST: 6, LW: 4, RW: 4, CAM: 4, LM: 2, RM: 2, CM: 1.5, CDM: 0.6, CB: 0.4, LB: 0.5, RB: 0.5, GK: 0 };
    const sl = XD.FORMATIONS[form].slots, tot = sl.reduce((t, q) => t + (W[q.pos] || 0), 0);
    let x = R() * tot, shooter = xi[0];
    for (let k = 0; k < sl.length; k++) { x -= W[sl[k].pos] || 0; if (x <= 0) { shooter = xi[k]; break; } }
    const oform = side ? C.form() : m.bot.form, oxi = side ? C.xi() : m.bot.xi.map(XDraft.P);
    const gk = oxi[XD.FORMATIONS[oform].slots.findIndex((q) => q.pos === 'GK')];
    return { shooter: shooter ? sur(shooter.name) : '', gk: gk ? sur(gk.name) : 'вратарь' };
  }
  function line(e) {
    const w = who(e.s, e.m);
    return e.t === 'goal' ? `<b>ГОЛ!</b> ${esc(w.shooter)}` : e.t === 'save' ? `${esc(w.gk)} тащит удар ${esc(w.shooter)}` : `${esc(w.shooter)} — мимо`;
  }
  function feed() {
    return M.ev.slice(-3).reverse().map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-${e.t}"><b>${e.m}'</b><span>${EV[e.t][0]}</span><em>${line(e)}</em></div>`).join('');
  }
  // вид сверху: наши атакуют вправо, соперник — влево; линии смещаются за мячом
  function dotPos() {
    const m = S().match, sh = (ballX - 50) * 0.22;
    const team = (form, side) => XD.FORMATIONS[form].slots.map((q) => {
      const depth = (100 - q.y) / 100;
      const x = (side ? 96 - depth * 44 : 4 + depth * 44) + sh + (Math.random() - 0.5) * 2.5;
      return [Math.max(2, Math.min(98, x)), 8 + q.x * 0.84 + (Math.random() - 0.5) * 3];
    });
    return [...team(C.form(), 0), ...team(m.bot.form, 1)];
  }
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, kf, o) => { if (el && el.animate && !RM) return el.animate(kf, o); return null; };
  // экран матча строится один раз; дальше двигаются только игроки, мяч, счёт и лента — отсюда плавность
  function buildView() {
    const box = BODY(), m = S().match, me = Store.d.user.nick || 'Ты';
    const ab = (n) => esc(String(n).replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').slice(0, 3).toUpperCase() || '?');
    box.innerHTML = `<div class="xm">
      <div class="xm-bug"><span class="xm-tm us"><i>${ab(me)}</i></span><span class="xm-s"><b class="d0">${M.score[0]}</b><em>–</em><b class="d1">${M.score[1]}</b></span><span class="xm-tm them"><i>${ab(XD.BOTS[m.level].name)}</i></span>
        <span class="xm-clock"><i class="live"></i><b>${M.min}</b>'</span></div>
      <div class="xm-stage"><div class="xm-pitch"><svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="58"/><line x1="50" y1="1" x2="50" y2="59"/><circle cx="50" cy="30" r="8"/>
        <rect x="1" y="16" width="14" height="28"/><rect x="85" y="16" width="14" height="28"/><rect x="1" y="24" width="5" height="12"/><rect x="94" y="24" width="5" height="12"/></svg>
        ${Array.from({ length: 22 }, (_, k) => `<i class="xm-p ${k < 11 ? 'us' : 'them'}"></i>`).join('')}<i class="xm-ball"></i><span class="xm-prog"></span></div></div>
      <div class="xm-feed">${feed()}</div>
      <div class="xm-tac"><div class="xm-tt"><span>Тактика</span><b class="xm-tn"></b><small class="xm-bn"></small></div>
        <div class="xm-bar">${XD.TACTICS.map((t, i) => `<button class="z${i}" data-tac="${i}" aria-label="${t}"></button>`).join('')}<i class="xm-knob"></i></div>
        <div class="xm-axis"><span>Защита</span><span>Атака</span></div></div>
      <div class="xm-stats"><span>Моменты <b class="xm-ch"></b></span><span>В створ <b class="xm-on"></b></span></div></div>`;
    anim($('.xm-pitch', box), [{ transform: 'rotateX(55deg) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1)' });
    shownEv = M.ev.length;
    update([], true);
  }
  let shownEv = 0;
  function update(evs = [], first = false) {
    const box = BODY(); if (!$('.xm-pitch', box)) return buildView();
    const last = evs[evs.length - 1];
    const ball = $('.xm-ball', box), from = [parseFloat(ball.style.left) || 50, parseFloat(ball.style.top) || 50];
    if (last) { ballX = last.s === 0 ? 91 : 9; ballY = 38 + Math.random() * 24; }
    else { ballX = Math.max(22, Math.min(78, 50 + (tac - botTac) * 5 + (Math.random() - 0.5) * 36)); ballY = 22 + Math.random() * 56; }
    const dur = Math.max(200, XD.CFG.match.tickMs * 0.9);
    // мяч летит дугой: середина пути чуть выше и мяч «больше» (ближе к камере)
    anim(ball, [{ left: from[0] + '%', top: from[1] + '%', transform: 'scale(1)' }, { left: (from[0] + ballX) / 2 + '%', top: Math.min(from[1], ballY) - 10 + '%', transform: 'scale(1.6)' }, { left: ballX + '%', top: ballY + '%', transform: 'scale(1)' }], { duration: first ? 0 : dur, easing: 'cubic-bezier(.45,.05,.35,1)' });
    ball.style.left = ballX + '%'; ball.style.top = ballY + '%';
    $$('.xm-p', box).forEach((d, k) => { const p = dotPos()[k]; d.style.transitionDuration = dur + 'ms'; d.style.left = p[0] + '%'; d.style.top = p[1] + '%'; });
    $('.xm-prog', box).style.width = (M.min / XD.CFG.match.minutes) * 100 + '%';
    $('.xm-clock b', box).textContent = M.min;
    [0, 1].forEach((k) => { const el = $('.d' + k, box); if (+el.textContent !== M.score[k]) { el.textContent = M.score[k]; anim(el, [{ transform: 'rotateX(90deg) scale(1.6)', color: '#ffcf3a' }, { transform: 'rotateX(-20deg) scale(1.2)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,1.4,.4,1)' }); } });
    $('.xm-ch', box).textContent = `${M.stats.ch[0]}:${M.stats.ch[1]}`; $('.xm-on', box).textContent = `${M.stats.on[0]}:${M.stats.on[1]}`;
    $('.xm-tn', box).textContent = SHORT[tac]; $('.xm-bn', box).textContent = 'соперник: ' + SHORT[botTac];
    $$('.xm-bar button', box).forEach((b, k) => b.classList.toggle('on', k === tac));
    $('.xm-knob', box).style.left = tac * 20 + 10 + '%';
    // новые события въезжают сверху, старые уходят
    const fd = $('.xm-feed', box);
    M.ev.slice(shownEv).forEach((e) => {
      fd.insertAdjacentHTML('afterbegin', `<div class="xm-ev ${e.s ? 'them' : 'us'} k-${e.t}"><b>${e.m}'</b><span>${EV[e.t][0]}</span><em>${line(e)}</em></div>`);
      anim(fd.firstElementChild, [{ transform: 'translateY(-14px) rotateX(-70deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      while (fd.children.length > 3) fd.lastElementChild.remove();
    });
    shownEv = M.ev.length;
    const goal = evs.find((e) => e.t === 'goal');
    if (goal) {
      const st = $('.xm-stage', box);
      st.insertAdjacentHTML('beforeend', `<div class="xm-goalfx ${goal.s ? 'them' : 'us'}">ГОЛ!</div>`);
      const g = st.lastElementChild;
      anim(g, [{ transform: 'translate(-50%,-50%) perspective(400px) rotateX(80deg) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) perspective(400px) rotateX(-12deg) scale(1.25)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-50%) perspective(400px) rotateX(0) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' });
      setTimeout(() => g.remove(), 1500);
      anim($('.xm-pitch', box), [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px) rotate(-.6deg)' }, { transform: 'translateX(5px) rotate(.5deg)' }, { transform: 'none' }], { duration: 420 });
      if (goal.s === 0 && typeof confetti === 'function') confetti();
    }
  }
  function render(evs = []) { update(evs); }
  function setTac(t) { t = Math.max(0, Math.min(4, t)); if (t === tac) return; tac = t; Sound.play('tap'); haptic('pop'); const box = BODY(); $('.xm-tn', box).textContent = SHORT[tac]; $$('.xm-bar button', box).forEach((b, k) => b.classList.toggle('on', k === tac)); $('.xm-knob', box).style.left = tac * 20 + 10 + '%'; }
  function end() {
    const m = S().match, first = !m.done; m.done = true; Store.save();
    const w = M.score[0] > M.score[1] ? 'win' : M.score[0] < M.score[1] ? 'lose' : 'draw';
    if (first && C.onEnd) C.onEnd(w, m.level);
    BODY().innerHTML = `<div class="xd-res"><div class="sb"><div class="sb-k">ФИНАЛЬНЫЙ СВИСТОК · БОТ «${XD.BOTS[m.level].name.toUpperCase()}»</div>
      <div class="xm-final ${w}"><b>${M.score[0]}</b><i>:</i><b>${M.score[1]}</b></div><div class="xd-best">${w === 'win' ? 'Победа!' : w === 'lose' ? 'Поражение' : 'Ничья'} · моменты ${M.stats.ch[0]}:${M.stats.ch[1]} · в створ ${M.stats.on[0]}:${M.stats.on[1]}</div></div>
      <div class="xm-feed all">${M.ev.filter((e) => e.t === 'goal').map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-goal"><b>${e.m}'</b><span>${Ui.get('ball')}</span><em>${esc(who(e.s, e.m).shooter)}</em></div>`).join('') || '<p class="xm-note">Без голов</p>'}</div>
      <div class="xd-act col"><button class="btn gold" data-xm="again">Ещё матч</button><button class="btn ghost" data-xm="share">Поделиться результатом</button><button class="btn ghost" data-xm="squad">К составу</button></div></div>`;
    if (w === 'win' && typeof confetti === 'function') confetti();
  }
  function share() {
    const m = S().match;
    const text = `⚽ ${C.title()}\nМатч с ботом «${XD.BOTS[m.level].name}»: ${M.score[0]}:${M.score[1]}\nСтарики Джексоны`;
    const url = appLink(C.link);
    try { if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (e) { /* не в Telegram */ }
    if (navigator.share) navigator.share({ text, url }).catch(() => {}); else toast(text);
  }
  function bind(sel = '#xd-body', ctx = DRAFT) {
    const box = $(sel); if (!box || box.dataset.xmb) return; box.dataset.xmb = 1;
    box.addEventListener('click', (e) => {
      C = ctx;
      const z = e.target.closest('[data-tac]'); if (z) return setTac(+z.dataset.tac);
      const b = e.target.closest('[data-xm]'); if (!b) return;
      const k = b.dataset.xm;
      if (k === 'go') { render(); run(); }
      if (k === 'again') choose();
      if (k === 'share') share();
      if (k === 'squad') C.back();
    });
    box.addEventListener('change', (e) => { if (e.target.classList.contains('xm-range')) setTac(+e.target.value); });
  }
  return { choose, start, resume, bind, use, DRAFT };
})();
