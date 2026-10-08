// «Драфт»: матч собранным составом против бота. Симуляция — XD.matchStep (engine.js), шаг = 1 игровая минута.
// Тактику игрок меняет когда угодно, она действует со следующего шага. Состояние восстанавливается из зерна и истории
// тактик, поэтому выход из приложения не ломает матч. Те же функции годятся для серверного онлайн-матча (этапы 3–4).
'use strict';

const XMatch = (() => {
  let M = null, timer = null, tac = 2, botTac = 2, A3 = null;
  const stop3d = () => { if (A3) { A3.stop(); A3 = null; } };
  // цвета формы: клуб, из которого больше всего игроков; если формы похожи — гости в белом
  function kitOf(xi, fallback) {
    const n = {}; xi.filter(Boolean).forEach((p) => { n[p.club] = (n[p.club] || 0) + 1; });
    const club = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return (typeof CLUB_COL !== 'undefined' && CLUB_COL[club]) || fallback;
  }
  function mount3d(box) {
    stop3d();
    return; // 3D в матче убрано: по отзыву неиграбельно — остаётся вид сверху и комментарий
    if (typeof Arena3D === 'undefined' || !Arena3D.supported()) return;
    const stage = $('.xm-stage', box), m = S().match, ctx = C;
    const home = kitOf(C.xi(), ['#ffc21f', '#1a1446']);
    let away = (m.club && typeof CLUB_COL !== 'undefined' && CLUB_COL[m.club]) || kitOf(m.bot.xi.map(XDraft.P), ['#e3243f', '#ffffff']);
    const rgb = (x) => { const v = String(x).replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0); };
    const dist = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
    if (dist(home[0], away[0]) < 150) away = dist(home[0], '#f4f4f4') < 150 ? ['#e3243f', '#ffffff'] : ['#f4f4f4', '#1a1446'];
    Arena3D.match(stage, { form: [C.form(), m.bot.form], slots: XD.FORMATIONS, kits: [home, away], ball: Arena3D.ballState().ball, names: [String(Store.d.user.nick || 'ДЖЕКСОНЫ').toUpperCase()], players: [C.xi().map((p) => sur(p && p.name)), m.bot.xi.map((n) => sur(n))], visible: () => Screens.current === ctx.screen })
      .then((a) => { if (!a) return; if (!stage.isConnected || !M || M.over) { a.stop(); return; } A3 = a; stage.classList.add('is3d'); if (!waiting && timer) run(); })
      .catch(() => { /* без 3D — остаётся вид сверху */ });
  }
  // откуда матч: драфт (по умолчанию) или «Мой состав» из карточек — у каждого свой экран, состав и сохранение
  const DRAFT = { screen: 'xdraft', body: '#xd-body', st: () => XDraft.S(), form: () => XDraft.A().form, sys: () => XDraft.A().sys, xi: () => XDraft.xiOf(), back: () => { XDraft.S().match = null; Store.save(); XDraft.render(); }, title: () => `Драфт ${XDraft.A().form} · ${XDraft.SYS[XDraft.A().sys]}`, link: 'xdraft' };
  let C = DRAFT;
  const S = () => C.st();
  const BODY = () => $(C.body);
  const opp = (m) => (m.club ? m.club : `Бот · ${XD.BOTS[m.level].name}`);
  const oppShort = (m) => (m.club ? m.club : XD.BOTS[m.level].name);
  // соперник — настоящий клуб: лучшие игроки клуба по позициям (кого нет — добираем из его лиги)
  function clubTeam(club, pool) {
    const own = pool.filter((p) => p.club === club), lg = (own[0] || {}).lg;
    let best = null;
    Object.keys(XD.FORMATIONS).forEach((form) => {
      const taken = new Set(), xi = XD.FORMATIONS[form].slots.map((sl) => {
        const fit = (list) => list.filter((p) => !taken.has(p.name) && p.pos.includes(sl.pos)).sort((a, b) => b.r - a.r)[0];
        const p = fit(own) || fit(pool.filter((q) => q.lg === lg && q.r <= 84)) || fit(pool);
        if (p) taken.add(p.name); return p;
      });
      const r = XD.teamRating(xi), n = xi.filter((p) => p && p.club === club).length;
      if (!best || n * 10 + r > best.n * 10 + best.r) best = { form, xi, r, n };
    });
    return best;
  }
  const EV = { goal: [Ui.get('ball'), 'ГОЛ!'], save: [Ui.get('shield'), 'Сейв вратаря'], miss: [Ui.get('target'), 'Удар мимо'] };

  function use(ctx) { C = ctx || DRAFT; }
  function choose(ctx) {
    if (ctx) C = ctx;
    const cl = tourClubs(), pick3 = [[cl[0], 'easy', 'попроще'], [cl[1], 'normal', 'на равных'], [cl[3], 'hard', 'топ-клуб']];
    Modal.open(`<h2>Товарищеский матч</h2><p>Соперник — настоящий клуб: лучшие игроки его состава по позициям.</p>`,
      pick3.map(([c, lv, t], i) => ({ label: `${c} · ${t}`, cls: i === 1 ? '' : 'ghost', onClick: () => start(lv, undefined, c) })).concat([{ label: 'Отмена', cls: 'ghost' }]));
  }
  function side(sys, form, xi) { const c = XD.chem(sys, form, xi).total; return { lines: XD.lines(sys, form, xi, c), rating: XD.teamRating(xi), chem: c }; }
  function build(m) {
    const xi = C.xi();
    const bxi = m.bot.xi.map(XDraft.P);
    return XD.matchNew(side(C.sys(), C.form(), xi), side(C.sys(), m.bot.form, bxi), m.seed);
  }
  function start(level, tourRound, club) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const bt = club ? clubTeam(club, XDraft.pool()) : XD.botTeam(level, XDraft.pool(), C.sys(), XD.rng(seed ^ 0x5bd1));
    S().match = { seed, level, club: club || null, bot: { form: bt.form, xi: bt.xi.map((p) => p && p.name) }, hist: [], done: false };
    if (tourRound !== undefined) S().match.tour = tourRound;
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
    const tr = m.tour !== undefined ? `<div class="xt-round">${Ui.get('trophy')} Турнир драфта · ${TOUR[m.tour][1]}</div>` : '';
    BODY().innerHTML = `<div class="xm-intro">${tr}<div class="xm-vs"><span><b>${esc(Store.d.user.nick || 'Ты')}</b><small>${C.form()} · рейтинг ${M.home.rating} · химия ${M.home.chem}</small></span><i>VS</i>
      <span><b>${m.club ? `${crestImg(m.club, 's')} ` : ''}${esc(opp(m))}</b><small>${m.bot.form} · рейтинг ${b.rating} · химия ${b.chem}</small></span></div>
      <p class="xm-note">Атака — больше моментов, но больше риска сзади</p>
      ${typeof Arena3D !== 'undefined' ? ballPicker() : ''}
      <button class="btn gold" data-xm="go">Начать матч</button></div>`;
  }
  // мяч матча: открытые — выбрать, закрытые — подсказка, как получить
  const BALLCSS = { classic: ['#f5f5f2', '#15151a'], noir: ['#18181d', '#d8a51f'], ivory: ['#f5f5f2', '#d8a51f'], gold: ['#e6b62a', '#15151a'] };
  function ballPicker() {
    const u = Arena3D.ballState();
    return `<div class="xm-balls"><small>Мяч</small><div>${Object.entries(Arena3D.BALLS).map(([k, b]) => {
      const own = u.balls.includes(k), [c1, c2] = BALLCSS[k];
      return `<button class="xm-ball3 ${u.ball === k ? 'on' : ''} ${own ? '' : 'lock'}" data-ball="${k}" style="--b1:${c1};--b2:${c2}" aria-label="${esc(b.name)}"><i></i><span>${own ? esc(b.name) : `${Ui.get('lock')} ${Arena3D.BALL_NEED[k] === 4 ? 'чемпион' : Arena3D.BALL_NEED[k] + ' победы'}`}</span></button>`;
    }).join('')}</div></div>`;
  }
  // как смотреть матч: «Моменты» (3D, часы ждут, пока доиграется опасный момент) или «Комментарии» (текст), и скорость
  const UIS = () => Store.d.ui || (Store.d.ui = {});
  const view = () => 'comm';
  const speed = () => [1, 2, 4].includes(UIS().xmSpeed) ? UIS().xmSpeed : 1;
  let waiting = false;
  function run() {
    clearInterval(timer); waiting = false;
    // «Моменты»: между опасными моментами время бежит быстро, поле притушено; в момент — розыгрыш в 3D
    const hl = view() === 'moments' && A3;
    const st = BODY() && $('.xm-stage', BODY()); if (st) st.classList.toggle('idle', !!hl);
    timer = setInterval(tick, (XD.CFG.match.tickMs / speed()) / (hl ? 4 : 1));
  }
  function tick() {
    if (Screens.current !== C.screen || !M) { clearInterval(timer); stop3d(); return; } // ушли с экрана — пауза, вернёмся — продолжим
    const m = S().match;
    botTac = XD.botTactic(m.level, M, 1, botTac);
    const evs = XD.matchStep(M, [tac, botTac]);
    m.hist.push([tac, botTac]);
    Store.save(true);
    evs.forEach((e) => { if (e.t === 'goal') { Sound.play(e.s === 0 ? 'goal' : 'lose'); haptic(e.s === 0 ? 'ok' : 'bad'); } });
    if (M.over) { clearInterval(timer); Sound.play('whistle'); Store.save(); return setTimeout(end, 900); }
    render(evs);
    // опасный момент в 3D: останавливаем часы, пока он не доиграется (страховка — 12 секунд)
    if (evs.length && A3 && view() === 'moments') {
      clearInterval(timer); waiting = true;
      const st = $('.xm-stage', BODY()); if (st) st.classList.remove('idle');
      let resumed = false; const go = () => { if (resumed || !M || M.over) return; resumed = true; if (Screens.current === C.screen) run(); };
      A3.events(evs, go); setTimeout(go, 12000);
    } else if (!evs.length) commentary();
  }
  // комментарий между моментами: кто владеет мячом и что делает (в режиме «Комментарии» — чаще)
  const PH = {
    pass: ['{a} раздаёт на фланг', '{a} ищет передачей {b}', 'Короткий розыгрыш: {a} — {b}', '{a} переводит игру на другой фланг', '{a} спокойно держит мяч'],
    press: ['{a} отбирает мяч в центре', '{a} прессингует высоко', 'Перехват! {a} прочитал передачу', '{a} выигрывает борьбу наверху'],
    att: ['Атака по флангу: {a} обыгрывает защитника', '{a} врывается в штрафную, но пас неточный', '{a} навешивает — вратарь забирает', 'Угловой: подаёт {a}', '{a} пробует издали, блок'],
  };
  function commentary() {
    const box = BODY(), fd = box && $('.xm-feed', box); if (!fd) return;
    const p = view() === 'comm' ? 0.55 : 0.12; if (Math.random() > p) return;
    const m = S().match, sideK = Math.random() < 0.5 + (tac - botTac) * 0.05 ? 0 : 1;
    const xi = (sideK ? m.bot.xi.map(XDraft.P) : C.xi()).filter(Boolean), pick = () => sur((xi[(Math.random() * xi.length) | 0] || {}).name || '');
    const kind = Math.random() < 0.45 ? 'pass' : Math.random() < 0.5 ? 'press' : 'att', arr = PH[kind];
    const txt = arr[(Math.random() * arr.length) | 0].replace('{a}', esc(pick())).replace('{b}', esc(pick()));
    fd.insertAdjacentHTML('afterbegin', `<div class="xm-ev cm ${sideK ? 'them' : 'us'}"><b>${M.min}'</b><span>${Ui.get(kind === 'att' ? 'bolt' : kind === 'press' ? 'shield' : 'send')}</span><em>${txt}</em></div>`);
    anim(fd.firstElementChild, [{ transform: 'translateY(-10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
    while (fd.children.length > 6) fd.lastElementChild.remove();
  }
  function setView(v) {
    UIS().xmView = v; Store.save();
    const box = BODY(); $('.xm', box).classList.toggle('comm', v === 'comm');
    $$('[data-view]', box).forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    if (v === 'comm') stop3d(); else if (!A3) mount3d(box);
    if (waiting) run();
  }
  function setSpeed(x) { UIS().xmSpeed = x; Store.save(); $$('[data-spd]', BODY()).forEach((b) => b.classList.toggle('on', +b.dataset.spd === x)); if (!waiting) run(); }

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
    box.innerHTML = `<div class="xm ${view() === 'comm' ? 'comm' : ''}">
      <div class="xm-bug"><span class="xm-tm us"><i>${ab(me)}</i></span><span class="xm-s"><b class="d0">${M.score[0]}</b><em>–</em><b class="d1">${M.score[1]}</b></span><span class="xm-tm them"><i>${ab(oppShort(m))}</i></span>
        <span class="xm-clock"><i class="live"></i><b>${M.min}</b>'</span></div>
      <div class="xm-ctl"><span class="xm-ctl-t">Скорость</span>
        <div class="xm-seg">${[1, 2, 4].map((x) => `<button data-spd="${x}" class="${speed() === x ? 'on' : ''}">×${x}</button>`).join('')}</div></div>
      <div class="xm-stage"><div class="xm-pitch"><svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="58"/><line x1="50" y1="1" x2="50" y2="59"/><circle cx="50" cy="30" r="8"/>
        <rect x="1" y="16" width="14" height="28"/><rect x="85" y="16" width="14" height="28"/><rect x="1" y="24" width="5" height="12"/><rect x="94" y="24" width="5" height="12"/></svg>
        ${Array.from({ length: 22 }, (_, k) => `<i class="xm-p ${k < 11 ? 'us' : 'them'}"></i>`).join('')}<i class="xm-ball"></i><span class="xm-prog"></span></div><div class="xm-wait"><b>⏩</b><span>Ждём опасный момент…</span></div></div>
      <div class="xm-feed">${feed()}</div>
      <div class="xm-tac"><div class="xm-tt"><span>Тактика</span><b class="xm-tn"></b><small class="xm-bn"></small></div>
        <div class="xm-bar">${XD.TACTICS.map((t, i) => `<button class="z${i}" data-tac="${i}" aria-label="${t}"></button>`).join('')}<i class="xm-knob"></i></div>
        <div class="xm-axis"><span>Защита</span><span>Атака</span></div></div>
      <div class="xm-stats"><span>Моменты <b class="xm-ch"></b></span><span>В створ <b class="xm-on"></b></span></div></div>`;
    anim($('.xm-pitch', box), [{ transform: 'rotateX(55deg) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1)' });
    shownEv = M.ev.length;
    update([], true);
    if (view() === 'moments') mount3d(box);
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
      while (fd.children.length > 6) fd.lastElementChild.remove();
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
    stop3d();
    const m = S().match, first = !m.done; m.done = true; Store.save();
    const w = M.score[0] > M.score[1] ? 'win' : M.score[0] < M.score[1] ? 'lose' : 'draw';
    if (first && C.onEnd) C.onEnd(w, m.level);
    if (m.tour !== undefined && C === DRAFT) return tourAfter(m, first);
    BODY().innerHTML = `<div class="xd-res"><div class="sb"><div class="sb-k">ФИНАЛЬНЫЙ СВИСТОК · ${esc(oppShort(m).toUpperCase())}</div>
      <div class="xm-final ${w}"><b>${M.score[0]}</b><i>:</i><b>${M.score[1]}</b></div><div class="xd-best">${w === 'win' ? 'Победа!' : w === 'lose' ? 'Поражение' : 'Ничья'} · моменты ${M.stats.ch[0]}:${M.stats.ch[1]} · в створ ${M.stats.on[0]}:${M.stats.on[1]}</div></div>
      <div class="xm-feed all">${M.ev.filter((e) => e.t === 'goal').map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-goal"><b>${e.m}'</b><span>${Ui.get('ball')}</span><em>${esc(who(e.s, e.m).shooter)}</em></div>`).join('') || '<p class="xm-note">Без голов</p>'}</div>
      <div class="xd-act col"><button class="btn gold" data-xm="again">Ещё матч</button><button class="btn ghost" data-xm="share">Поделиться результатом</button><button class="btn ghost" data-xm="squad">К составу</button></div></div>`;
    if (w === 'win' && typeof confetti === 'function') confetti();
  }
  function share() {
    const m = S().match;
    const text = `⚽ ${C.title()}\nМатч против «${oppShort(m)}»: ${M.score[0]}:${M.score[1]}\nСтарики Джексоны`;
    const url = appLink(C.link);
    try { if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (e) { /* не в Telegram */ }
    if (navigator.share) navigator.share({ text, url }).catch(() => {}); else toast(text);
  }
  // ---------- турнир драфта: 4 матча, соперники сильнее с каждым раундом; ничья — пенальти ----------
  const TOUR = [['easy', '1/8 финала'], ['normal', 'Четвертьфинал'], ['hard', 'Полуфинал'], ['hard', 'Финал']];
  // соперники по кругам — настоящие клубы, от середняков к топам
  const TOUR_CLUBS = [['Лидс', 'Эвертон', 'Фулхэм', 'Севилья', 'Вольфсбург', 'Торино', 'Брентфорд'], ['Тоттенхэм', 'Атлетико', 'Наполи', 'Боруссия Дортмунд', 'Астон Вилла', 'Ювентус'],
    ['Бавария', 'Ливерпуль', 'Интер', 'Арсенал', 'Челси'], ['Барселона', 'Реал Мадрид', 'Манчестер Сити', 'ПСЖ']];
  const tourClubs = () => { const have = new Set(XDraft.pool().map((p) => p.club)); return TOUR_CLUBS.map((l) => { const ok = l.filter((c) => have.has(c)); return ok[(Math.random() * ok.length) | 0] || l[0]; }); };
  const PRIZE = [{ coins: 60 }, { pack: 0, coins: 40 }, { pack: 1, ball: 'noir' }, { pack: 2, ball: 'ivory' }, { pack: 3, coins: 300, ball: 'gold' }];
  const TROPHY = [3, 8, 14, 22, 40];
  const prizeLine = (p) => [p.pack !== undefined ? ['Обычный', 'Сверхредкий', 'Эпический', 'Легендарный'][p.pack] + ' пак' : '', p.coins ? `${p.coins} монет` : '', p.ball ? `мяч «${Arena3D.BALLS[p.ball].name}»` : ''].filter(Boolean).join(' + ');
  function tourStart() { C = DRAFT; const cl = tourClubs(); S().tour = { round: 0, res: [], over: false, paid: false, clubs: cl }; Store.save(); start(TOUR[0][0], 0, cl[0]); }
  function penalties() {
    const rA = M.home.rating, rB = M.away.rating, pA = Math.min(0.9, Math.max(0.6, 0.75 + (rA - rB) * 0.01)), pB = Math.min(0.9, Math.max(0.6, 0.75 + (rB - rA) * 0.01));
    const a = [], b = [];
    for (let i = 0; i < 5 || a.filter(Boolean).length === b.filter(Boolean).length; i++) { a.push(Math.random() < pA); b.push(Math.random() < pB); if (i > 14) break; }
    return { a, b, sa: a.filter(Boolean).length, sb: b.filter(Boolean).length };
  }
  function tourAfter(m, first) {
    const T = S().tour; if (!T) return;
    if (first && T.res.length === m.tour) {
      let win = M.score[0] > M.score[1], pens = null;
      if (M.score[0] === M.score[1]) { pens = penalties(); win = pens.sa > pens.sb; }
      T.res.push({ s: M.score.slice(), pens: pens ? { a: pens.a, b: pens.b } : null, win });
      if (!win || m.tour === 3) T.over = true; else T.round = m.tour + 1;
      Store.save();
      if (win && typeof confetti === 'function') confetti();
      Sound.play(win ? 'goal' : 'lose');
    }
    tourScreen();
  }
  function tourScreen() {
    const T = S().tour, wins = T.res.filter((r) => r.win).length;
    const last = T.res[T.res.length - 1];
    const dots = (arr) => arr.map((x) => `<i class="${x ? 'in' : 'out'}"></i>`).join('');
    const rows = TOUR.map(([lv, name], i) => {
      const r = T.res[i], st = r ? (r.win ? 'win' : 'lose') : i === T.round && !T.over ? 'next' : 'wait';
      return `<div class="xt-r ${st}"><b>${name}</b><small>${T.clubs ? `${crestImg(T.clubs[i], 'xs')} ${esc(T.clubs[i])}` : `Бот · ${XD.BOTS[lv].name}`}</small><span>${r ? `${r.s[0]}:${r.s[1]}${r.pens ? ` <em>пен. ${r.pens.a.filter(Boolean).length}:${r.pens.b.filter(Boolean).length}</em>` : ''}` : st === 'next' ? 'следующий' : '—'}</span></div>`;
    }).join('');
    const ladder = PRIZE.map((p, i) => `<div class="xt-p ${T.over && wins === i ? 'got' : ''}"><b>${i}</b><span>${i === 4 ? 'Чемпион' : `${i} ${i === 1 ? 'победа' : i > 1 && i < 5 ? 'победы' : 'побед'}`}</span><small>${prizeLine(p)} · +${TROPHY[i]} ${Ui.get('trophy')}</small></div>`).join('');
    const head = last ? `<div class="sb"><div class="sb-k">ТУРНИР ДРАФТА · ${TOUR[T.res.length - 1][1].toUpperCase()}</div>
      <div class="xm-final ${last.win ? 'win' : 'lose'}"><b>${last.s[0]}</b><i>:</i><b>${last.s[1]}</b></div>
      ${last.pens ? `<div class="xt-pens"><span>Ты ${dots(last.pens.a)}</span><span>${esc(T.clubs ? T.clubs[T.res.length - 1] : 'Бот')} ${dots(last.pens.b)}</span></div>` : ''}
      <div class="xd-best">${T.over ? (wins === 4 ? 'Чемпион турнира!' : `Турнир окончен · побед: ${wins}`) : 'Победа! Проходишь дальше'}</div></div>` : '';
    const btn = T.over ? (T.paid ? '<button class="btn gold" data-xm="tnew">Новый драфт</button>' : '<button class="btn gold" data-xm="tprize">Забрать награду</button>') : `<button class="btn gold" data-xm="tnext">Играть: ${TOUR[T.round][1]}</button>`;
    BODY().innerHTML = `<div class="xd-res xt">${head}<div class="xt-br">${rows}</div><h3 class="gl-h">Награды за турнир</h3><div class="xt-ladder">${ladder}</div>
      <div class="xd-act col">${btn}<button class="btn ghost" data-xm="squad">К составу</button></div></div>`;
    if (T.over && wins === 4 && typeof confetti === 'function') confetti();
  }
  function tourNext() { const T = S().tour; if (!T || T.over) return; start(TOUR[T.round][0], T.round, T.clubs && T.clubs[T.round]); }
  function tourPrize() {
    const T = S().tour; if (!T || !T.over || T.paid) return;
    const wins = T.res.filter((r) => r.win).length, p = PRIZE[wins];
    T.paid = true;
    const u = Arena3D.ballState(); if (p.ball && !u.balls.includes(p.ball)) { u.balls.push(p.ball); u.ball = p.ball; }
    const rs = Rewards.S(); rs.trophies += TROPHY[wins]; Store.save();
    if (p.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(p.coins); }
    if (p.pack !== undefined) Rewards.openDrop({ title: wins === 4 ? 'ЧЕМПИОН ТУРНИРА ДРАФТА' : `ТУРНИР ДРАФТА · ПОБЕД: ${wins}`, minLevel: p.pack });
    toast(`+${TROPHY[wins]} трофеев${p.ball ? ` · новый мяч «${Arena3D.BALLS[p.ball].name}»` : ''}`);
    Rewards.refresh(); tourScreen();
  }
  const tourState = () => S().tour;

  function bind(sel = '#xd-body', ctx = DRAFT) {
    const box = $(sel); if (!box || box.dataset.xmb) return; box.dataset.xmb = 1;
    box.addEventListener('click', (e) => {
      C = ctx;
      const z = e.target.closest('[data-tac]'); if (z) return setTac(+z.dataset.tac);
      const vw = e.target.closest('[data-view]'); if (vw) { Sound.play('tap'); return setView(vw.dataset.view); }
      const sp = e.target.closest('[data-spd]'); if (sp) { Sound.play('tap'); return setSpeed(+sp.dataset.spd); }
      const bl = e.target.closest('[data-ball]');
      if (bl) { const u = Arena3D.ballState(), k = bl.dataset.ball; if (!u.balls.includes(k)) { toast(`Открывается в турнире драфта: ${Arena3D.BALL_NEED[k] === 4 ? 'стань чемпионом' : `${Arena3D.BALL_NEED[k]} победы подряд`}`); return; } u.ball = k; Store.save(); Sound.play('tap'); return intro(); }
      const b = e.target.closest('[data-xm]'); if (!b) return;
      const k = b.dataset.xm;
      if (k === 'go') { render(); run(); }
      if (k === 'again') choose();
      if (k === 'share') share();
      if (k === 'squad') C.back();
      if (k === 'tnext') tourNext();
      if (k === 'tprize') tourPrize();
      if (k === 'tnew') { S().tour = null; S().match = null; Store.save(); C.back(); }
    });
    box.addEventListener('change', (e) => { if (e.target.classList.contains('xm-range')) setTac(+e.target.value); });
  }
  return { choose, start, resume, bind, use, DRAFT, tourStart, tourScreen, tourState };
})();
