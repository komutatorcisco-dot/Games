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
    clearInterval(timer); waiting = false; Sim.ensure();
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
    const fin = () => { clearInterval(timer); Sound.play('whistle'); Store.save(); setTimeout(end, 900); };
    if (evs.length && Sim.on()) { // момент разыгрывается на поле: часы ждут, пока мяч не дойдёт до ворот
      clearInterval(timer); waiting = true; update([]);
      return Sim.play(evs, () => { waiting = false; if (!M) return; if (M.over) fin(); else if (Screens.current === C.screen) run(); });
    }
    update(evs, false, true);
    if (M.over) return fin();
    // опасный момент в 3D: останавливаем часы, пока он не доиграется (страховка — 12 секунд)
    if (evs.length && A3 && view() === 'moments') {
      clearInterval(timer); waiting = true;
      const st = $('.xm-stage', BODY()); if (st) st.classList.remove('idle');
      let resumed = false; const go = () => { if (resumed || !M || M.over) return; resumed = true; if (Screens.current === C.screen) run(); };
      A3.events(evs, go); setTimeout(go, 12000);
    }
  }
  // комментарий между моментами: кто владеет мячом и что делает (в режиме «Комментарии» — чаще)
  const PH = {
    pass: ['{a} раздаёт на фланг', '{a} ищет передачей {b}', 'Короткий розыгрыш: {a} — {b}', '{a} переводит игру на другой фланг', '{a} спокойно держит мяч'],
    press: ['{a} отбирает мяч в центре', '{a} прессингует высоко', 'Перехват! {a} прочитал передачу', '{a} выигрывает борьбу наверху'],
    att: ['{a} обыгрывает {b}', '{a} уходит в обводку', '{a} тащит мяч вперёд'],
    clear: ['{a} выносит мяч из штрафной', '{a} выбивает подальше', '{a} забирает навес'],
    build: ['{a} начинает атаку', '{a} ищет пас вразрез на {b}', 'Опасно! {a} врывается в штрафную'],
  };
  // строка комментария от того, что сейчас видно на поле
  function say(sideK, kind, a, b) {
    const box = BODY(), fd = box && $('.xm-feed', box); if (!fd || !M) return;
    const arr = PH[kind], txt = arr[(Math.random() * arr.length) | 0].replace('{a}', esc(a || '')).replace('{b}', esc(b || ''));
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
  let shown = [0, 0]; // счёт на табло: гол появляется, когда мяч в сетке, а не когда его посчитал движок

  const SHORT = ['Оборона', 'Осторожно', 'Баланс', 'Атака', 'Ва-банк'];
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
    let k = xi.indexOf(shooter); if (k < 0) k = 0;
    return { shooter: shooter ? sur(shooter.name) : '', gk: gk ? sur(gk.name) : 'вратарь', k };
  }
  function line(e) {
    const w = who(e.s, e.m);
    return e.t === 'goal' ? `<b>ГОЛ!</b> ${esc(w.shooter)}` : e.t === 'save' ? `${esc(w.gk)} тащит удар ${esc(w.shooter)}` : `${esc(w.shooter)} — мимо`;
  }
  function feed() {
    return M.ev.slice(-3).reverse().map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-${e.t}"><b>${e.m}'</b><span>${EV[e.t][0]}</span><em>${line(e)}</em></div>`).join('');
  }
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, kf, o) => { if (el && el.animate && !RM) return el.animate(kf, o); return null; };

  // ---------- 2D-трансляция: игроки держат строй и смещаются за мячом, мяч у ног или в передаче ----------
  // каждый момент из движка сначала разыгрывается (2–3 передачи к штрафной), потом удар; часы ждут
  const Sim = (() => {
    let G = null, raf = 0, prev = 0;
    const R = Math.random, cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const own = (s, x, y) => (s ? [100 - x, 100 - y] : [x, y]); // в «свою» систему: команда атакует вправо
    const dist = (a, b) => Math.hypot((a.x - b.x) * 1.75, a.y - b.y);
    function init(box) {
      const m = S().match, T = [{ form: C.form(), xi: C.xi() }, { form: m.bot.form, xi: m.bot.xi.map(XDraft.P) }], pl = [];
      T.forEach((t, s) => XD.FORMATIONS[t.form].slots.forEach((q, k) => {
        const p = t.xi[k];
        pl.push({ s, k, gk: q.pos === 'GK', d: cl(((100 - q.y) / 100 - 0.12) / 0.72, 0, 1), lat: 8 + q.x * 0.84, name: p ? sur(p.name) : '', x: 50, y: 50, force: null, n: R() * 6 });
      }));
      const L = [M.home.lines, M.away.lines], share = (L[0].mid ** 2) / (L[0].mid ** 2 + L[1].mid ** 2);
      G = { pl, box, share, t: 0, ball: { x: 50, y: 50, h: 0, fl: null }, owner: -1, poss: 0, loose: 0, wait: 0.8, q: [], cb: null, push: -1, said: -9,
        els: $$('.xm-p', box), bEl: $('.xm-ball', box), shEl: $('.xm-bsh', box), tag: $('.xm-tag', box) };
      pl.forEach((p) => { const t = target(p, true); p.x = t[0]; p.y = t[1]; });
      const kits = colors(); G.els.forEach((e, i) => { const k = kits[pl[i].s]; e.style.background = k[0]; e.style.borderColor = k[1]; });
      kickoff(0); draw();
    }
    // цвета формы; если похожи — у соперника запасная
    function colors() {
      const m = S().match, home = kitOf(C.xi(), ['#ffc21f', '#1a1446']);
      let away = (m.club && typeof CLUB_COL !== 'undefined' && CLUB_COL[m.club]) || kitOf(m.bot.xi.map(XDraft.P), ['#e3243f', '#ffffff']);
      const rgb = (x) => { const v = String(x).replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0); };
      const df = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
      if (df(home[0], away[0]) < 120) away = df(home[0], '#ffffff') > 160 ? ['#f4f4f4', '#222'] : ['#e3243f', '#fff'];
      return [home, away];
    }
    function kickoff(s) {
      const b = G.ball; b.x = 50; b.y = 50; b.h = 0; b.fl = null;
      G.owner = -1; G.poss = s; G.loose = s + 1; G.wait = 0.5;
    }
    // куда бежит игрок: линия обороны и вся команда сдвигаются за мячом, при владении — растягиваются
    function target(p, init) {
      if (p.force) return p.force;
      const b = G.ball, att = G.poss === p.s, [bx, by] = own(p.s, b.fl ? b.fl.tx : b.x, b.fl ? b.fl.ty : b.y);
      let x, y;
      if (p.gk) { x = 4 + cl((bx - 30) * 0.05, 0, 5); y = 50 + (by - 50) * 0.18; }
      else {
        const push = G.push === p.s ? 14 : 0;
        const back = att ? cl(bx - 36 + push, 14, 58) : cl(bx - 26, 9, 44), span = att ? 46 + push * 0.6 : 32;
        x = back + p.d * span;
        y = att ? p.lat + (by - 50) * 0.12 : 50 + (p.lat - 50) * 0.78 + (by - 50) * 0.25;
        if (!init) { x += Math.sin(G.t * 0.6 + p.n) * 1.4; y += Math.cos(G.t * 0.5 + p.n) * 1.6; }
      }
      return own(p.s, cl(x, 2, 98), cl(y, 4, 96));
    }
    const team = (s) => G.pl.filter((p) => p.s === s);
    const near = (s, pt, skip) => team(s).filter((p) => p !== skip && !p.gk).sort((a, b) => dist(a, pt) - dist(b, pt))[0];
    // полёт мяча: передача, удар, вынос
    function fly(tx, ty, dur, h, done) { const b = G.ball; b.fl = { fx: b.x, fy: b.y, tx, ty, t: 0, dur, h, done }; G.owner = -1; }
    function give(p) { G.owner = G.pl.indexOf(p); G.poss = p.s; G.loose = 0; }
    function pass(c, r, lead, then) {
      const [ox, oy] = own(r.s, r.x, r.y), [tx, ty] = own(r.s, cl(ox + (lead || 4), 3, 97), oy);
      r.force = [tx, ty];
      const d = Math.hypot((tx - c.x) * 1.75, ty - c.y);
      fly(tx, ty, 0.25 + d / 70, d > 40 ? 6 : 1.5, () => { r.force = null; give(r); if (then) then(); });
    }
    // обычная игра без моментов
    function act() {
      const c = G.pl[G.owner], s = c.s, o = 1 - s, [cx] = own(s, c.x, c.y), opp = near(o, c);
      const lossP = 0.2 * (s ? G.share : 1 - G.share) * 2 * (1 + (s ? botTac - tac : tac - botTac) * 0.05);
      G.wait = 0.55 + R() * 0.6;
      if (c.gk) { const r = team(s).filter((p) => !p.gk).sort(() => R() - 0.5)[0]; return pass(c, r, 6); }
      // в штрафную без момента не пускаем: защитник выбивает
      if (cx > 76) { const d = near(o, c); give(d); talk(o, 'clear', d.name); const [, dy] = own(o, d.x, d.y); const [tx, ty] = own(o, 55 + R() * 15, cl(dy + (R() - 0.5) * 40, 10, 90)); G.owner = -1; return fly(tx, ty, 0.9, 9, () => { G.loose = 3; }); }
      if (R() < lossP && opp && dist(opp, c) < 16) { give(opp); talk(o, 'press', opp.name); return; }
      if (R() < 0.25) { G.wait = 0.9; c.drib = 0.9; if (opp && R() < 0.4) talk(s, 'att', c.name, opp.name); return; }
      const mates = team(s).filter((p) => p !== c && !p.gk).map((p) => { const [px] = own(s, p.x, p.y), d = dist(p, c); return { p, w: d < 7 || d > 48 ? 0 : 1 + Math.max(0, px - cx) * 0.08 + (R() * 0.8) }; }).filter((m) => m.w).sort((a, b) => b.w - a.w);
      const r = (mates[0] || {}).p; if (!r) return;
      // перехват на линии передачи
      if (R() < lossP * 0.6) {
        const mid = { x: (c.x + r.x) / 2, y: (c.y + r.y) / 2 }, d = near(o, mid);
        if (d) { d.force = [mid.x, mid.y]; return fly(mid.x, mid.y, 0.35, 1, () => { d.force = null; give(d); talk(o, 'press', d.name); }); }
      }
      if (R() < 0.35) talk(s, 'pass', c.name, r.name);
      pass(c, r, 4);
    }
    // розыгрыш момента из движка
    function script(e) {
      const s = e.s, o = 1 - s, w = who(s, e.m), sh = team(s)[w.k] || team(s)[10], gk = team(o).find((p) => p.gk);
      const steps = [];
      steps.push(() => {
        G.push = s;
        const o = G.pl[G.owner];
        if (!o || o.s !== s) { const n = near(s, G.ball) || sh; if (o) fly(G.ball.x, G.ball.y, 0.01, 0, () => {}); G.wait = 0.3; G.need = n; G.stuck = 0; return; }
        G.wait = 0.2;
      });
      steps.push(() => {
        const c = G.pl[G.owner], mates = team(s).filter((p) => p !== c && p !== sh && !p.gk).sort((a, b) => own(s, b.x, b.y)[0] - own(s, a.x, a.y)[0]);
        const r = mates[1] || mates[0]; talk(s, 'build', c.name, r.name, true); pass(c, r, 8); G.wait = 0.25;
      });
      steps.push(() => {
        const c = G.pl[G.owner]; const [x, y] = own(s, 82 + R() * 6, 32 + R() * 36); sh.force = [x, y];
        const d = Math.hypot((x - c.x) * 1.75, y - c.y); fly(x, y, 0.3 + d / 70, 2, () => { give(sh); }); G.wait = 0.2;
      });
      steps.push(() => {
        const c = G.pl[G.owner] || sh, [cx, cy] = own(s, c.x, c.y); let tx, ty, h = 2;
        if (e.t === 'goal') { tx = 100.8; ty = 44 + R() * 12; }
        else if (e.t === 'save') { tx = 4.5; ty = 46 + R() * 8; gk.force = own(o, 4, cl(100 - ty, 42, 58)); }
        else { tx = 100.8; ty = R() < 0.5 ? 34 + R() * 6 : 60 + R() * 6; h = R() < 0.4 ? 12 : 3; }
        if (e.t === 'save') { const [gx, gy] = gk.force; return fly(gx, gy, 0.32, h, () => { gk.force = null; give(gk); update([e]); flash(s); after(1.1); }); }
        const [x, y] = own(s, tx, ty);
        fly(x, y, 0.34, h, () => { G.owner = -1; G.ball.fl = null; update([e]); flash(s); if (e.t === 'goal') { G.hold = 1.8; G.after = () => { reset(); kickoff(o); }; } else { G.hold = 0.9; G.after = () => { const b = G.ball; [b.x, b.y] = own(o, 6, 50); give(gk); }; } after(e.t === 'goal' ? 2.4 : 1.2); });
      });
      return steps;
    }
    function after(t) { G.wait = t; G.endScript = true; }
    function reset() { G.pl.forEach((p) => { p.force = null; }); G.push = -1; }
    function flash(s) { const pt = $('.xm-pitch', G.box); if (pt) anim(pt, [{ boxShadow: `inset 0 0 0 0 ${s ? '#ff5872' : '#ffcf3a'}` }, { boxShadow: `inset 0 0 0 4px ${s ? '#ff5872' : '#ffcf3a'}` }, { boxShadow: 'inset 0 0 0 0 transparent' }], { duration: 700 }); }
    function talk(s, kind, a, b, force) { if (!force && G.t - G.said < 2.4) return; G.said = G.t; say(s, kind, a, b); }
    function play(evs, cb) {
      G.q = []; evs.forEach((e) => G.q.push(...script(e))); G.cb = cb; G.endScript = false;
    }
    function step(dt) {
      G.t += dt;
      const b = G.ball;
      // мяч
      if (b.fl) {
        const f = b.fl; f.t += dt / f.dur; const k = Math.min(1, f.t), e = 1 - (1 - k) * (1 - k);
        b.x = f.fx + (f.tx - f.fx) * e; b.y = f.fy + (f.ty - f.fy) * e; b.h = Math.sin(Math.PI * k) * f.h;
        if (k >= 1) { b.fl = null; b.h = 0; f.done && f.done(); }
      } else if (G.owner >= 0) { const c = G.pl[G.owner]; b.x = c.x + (c.s ? -1 : 1) * 1.1; b.y = c.y + 0.6; }
      else if (G.hold > 0) { G.hold -= dt; if (G.hold <= 0 && G.after) { const a = G.after; G.after = null; a(); } }
      else if (G.loose && !G.need) { // ничей мяч: ближайший (своей команды на розыгрыше) бежит к нему
        const s = G.loose === 3 ? null : G.loose - 1, cands = G.pl.filter((p) => !p.gk && (s === null || p.s === s)).sort((p, q) => dist(p, b) - dist(q, b)), n = cands[0];
        if (n) { n.force = [b.x, b.y]; if (dist(n, b) < 2) { n.force = null; give(n); G.wait = 0.4; } }
      }
      if (G.need) { // на розыгрыше мяч должен оказаться у атакующей команды
        const n = G.need, o = G.pl[G.owner];
        if (o && o.s === n.s) { n.force = null; G.need = null; }
        else if (!b.fl) { n.force = [b.x, b.y]; G.stuck = (G.stuck || 0) + dt; if (dist(n, b) < 2.5 || G.stuck > 3) { n.force = null; give(n); G.need = null; } }
        if (!G.need) G.stuck = 0;
      }
      // игроки
      const pr = G.owner >= 0 ? near(1 - G.pl[G.owner].s, G.pl[G.owner]) : null;
      G.pl.forEach((p, i) => {
        let [tx, ty] = target(p);
        if (p === pr && !p.force) { const c = G.pl[G.owner]; tx = c.x + (c.s ? -1 : 1) * 3; ty = c.y; }
        if (i === G.owner && p.drib > 0) { p.drib -= dt; const [x] = own(p.s, p.x, p.y); [tx, ty] = own(p.s, x + 8, own(p.s, p.x, p.y)[1]); }
        const dx = (tx - p.x) * 1.75, dy = ty - p.y, d = Math.hypot(dx, dy), v = (p.force ? 26 : i === G.owner ? 12 : 16) * dt;
        if (d > 0.05) { const k = Math.min(1, v / d); p.x += (dx / 1.75) * k; p.y += dy * k; }
      });
      // решения
      if (b.fl || G.hold > 0) return;
      G.wait -= dt; if (G.wait > 0) return;
      if (G.endScript && !G.q.length) { G.endScript = false; reset(); const cb = G.cb; G.cb = null; if (cb) cb(); return; }
      if (G.q.length) { if (G.need) return; return G.q.shift()(); }
      if (G.owner >= 0) act();
    }
    function draw() {
      const b = G.ball;
      G.els.forEach((e, i) => { const p = G.pl[i]; e.style.left = p.x + '%'; e.style.top = p.y + '%'; e.classList.toggle('own', i === G.owner); });
      G.bEl.style.left = b.x + '%'; G.bEl.style.top = b.y + '%'; G.bEl.style.transform = `translateY(${-b.h * 1.6}px) scale(${1 + b.h * 0.05})`;
      G.shEl.style.left = b.x + '%'; G.shEl.style.top = b.y + '%';
      const c = G.pl[G.owner];
      if (c) { G.tag.textContent = c.name; G.tag.className = 'xm-tag on ' + (c.s ? 'them' : 'us'); G.tag.style.left = c.x + '%'; G.tag.style.top = c.y + '%'; }
      else G.tag.classList.remove('on');
    }
    function loop(ts) {
      raf = 0;
      if (!G || !G.box.isConnected || Screens.current !== C.screen || !M) return;
      const dt = Math.min(0.05, (ts - (prev || ts)) / 1000) * speed(); prev = ts;
      step(dt); draw();
      raf = requestAnimationFrame(loop);
    }
    function ensure() {
      const box = BODY(); if (!box || !$('.xm-pitch', box)) return;
      if (!G || G.box !== box || !G.els[0].isConnected) init(box);
      if (G.cb) { G.q = []; G.cb = null; G.endScript = false; G.need = null; reset(); } // розыгрыш прервали уходом с экрана — счёт и ленту уже синхронизировал render()
      if (!raf) { prev = 0; raf = requestAnimationFrame(loop); }
    }
    return { dbg: () => G && { owner: G.owner, q: G.q.length, cb: !!G.cb, need: !!G.need, wait: G.wait, hold: G.hold, fl: !!G.ball.fl, loose: G.loose, end: G.endScript, raf: !!raf }, init: (box) => { init(box); }, ensure, play, on: () => !!(G && raf && !RM), stop: () => { G = null; } };
  })();
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
        ${Array.from({ length: 22 }, (_, k) => `<i class="xm-p ${k < 11 ? 'us' : 'them'}"></i>`).join('')}<i class="xm-bsh"></i><i class="xm-ball"></i><span class="xm-tag"></span><span class="xm-prog"></span></div><div class="xm-wait"><b>⏩</b><span>Ждём опасный момент…</span></div></div>
      <div class="xm-feed">${feed()}</div>
      <div class="xm-tac"><div class="xm-tt"><span>Тактика</span><b class="xm-tn"></b><small class="xm-bn"></small></div>
        <div class="xm-bar">${XD.TACTICS.map((t, i) => `<button class="z${i}" data-tac="${i}" aria-label="${t}"></button>`).join('')}<i class="xm-knob"></i></div>
        <div class="xm-axis"><span>Защита</span><span>Атака</span></div></div>
      <div class="xm-stats"><span>Моменты <b class="xm-ch"></b></span><span>В створ <b class="xm-on"></b></span></div></div>`;
    anim($('.xm-pitch', box), [{ transform: 'rotateX(55deg) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1)' });
    shownEv = M.ev.length; shown = M.score.slice();
    Sim.init(box);
    update([], true);
    if (view() === 'moments') mount3d(box);
  }
  let shownEv = 0;
  function update(evs = [], first = false, sync = false) {
    const box = BODY(); if (!$('.xm-pitch', box)) return buildView();
    evs.forEach((e) => { if (e.t === 'goal') { shown[e.s]++; Sound.play(e.s === 0 ? 'goal' : 'lose'); haptic(e.s === 0 ? 'ok' : 'bad'); } });
    if (sync || first) shown = M.score.slice();
    $('.xm-prog', box).style.width = (M.min / XD.CFG.match.minutes) * 100 + '%';
    $('.xm-clock b', box).textContent = M.min;
    [0, 1].forEach((k) => { const el = $('.d' + k, box); if (+el.textContent !== shown[k]) { el.textContent = shown[k]; anim(el, [{ transform: 'rotateX(90deg) scale(1.6)', color: '#ffcf3a' }, { transform: 'rotateX(-20deg) scale(1.2)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,1.4,.4,1)' }); } });
    $('.xm-ch', box).textContent = `${M.stats.ch[0]}:${M.stats.ch[1]}`; $('.xm-on', box).textContent = `${M.stats.on[0]}:${M.stats.on[1]}`;
    $('.xm-tn', box).textContent = SHORT[tac]; $('.xm-bn', box).textContent = 'соперник: ' + SHORT[botTac];
    $$('.xm-bar button', box).forEach((b, k) => b.classList.toggle('on', k === tac));
    $('.xm-knob', box).style.left = tac * 20 + 10 + '%';
    // новые события въезжают сверху, старые уходят
    const fd = $('.xm-feed', box);
    (sync ? M.ev.slice(shownEv) : evs).forEach((e) => {
      fd.insertAdjacentHTML('afterbegin', `<div class="xm-ev ${e.s ? 'them' : 'us'} k-${e.t}"><b>${e.m}'</b><span>${EV[e.t][0]}</span><em>${line(e)}</em></div>`);
      anim(fd.firstElementChild, [{ transform: 'translateY(-14px) rotateX(-70deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      while (fd.children.length > 6) fd.lastElementChild.remove();
    });
    if (sync) shownEv = M.ev.length; else shownEv += evs.length;
    const goal = evs.find((e) => e.t === 'goal');
    if (goal) {
      const st = $('.xm-stage', box);
      st.insertAdjacentHTML('beforeend', `<div class="xm-goalfx ${goal.s ? 'them' : 'us'}">ГОЛ!</div>`);
      const g = st.lastElementChild;
      anim(g, [{ transform: 'translate(-50%,-50%) perspective(400px) rotateX(80deg) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) perspective(400px) rotateX(-12deg) scale(1.25)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-50%) perspective(400px) rotateX(0) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }], { duration: 1500, easing: 'ease-out' });
      setTimeout(() => g.remove(), 1500);
      if (goal.s === 0 && typeof confetti === 'function') confetti();
    }
  }
  function render(evs = []) { update(evs, false, true); }
  function setTac(t) { t = Math.max(0, Math.min(4, t)); if (t === tac) return; tac = t; Sound.play('tap'); haptic('pop'); const box = BODY(); $('.xm-tn', box).textContent = SHORT[tac]; $$('.xm-bar button', box).forEach((b, k) => b.classList.toggle('on', k === tac)); $('.xm-knob', box).style.left = tac * 20 + 10 + '%'; }
  function end() {
    stop3d(); Sim.stop();
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
  return { Sim, choose, start, resume, bind, use, DRAFT, tourStart, tourScreen, tourState };
})();
