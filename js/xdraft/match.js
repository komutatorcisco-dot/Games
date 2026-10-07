// «Драфт»: матч собранным составом против бота. Симуляция — XD.matchStep (engine.js), шаг = 1 игровая минута.
// Тактику игрок меняет когда угодно, она действует со следующего шага. Состояние восстанавливается из зерна и истории
// тактик, поэтому выход из приложения не ломает матч. Те же функции годятся для серверного онлайн-матча (этапы 3–4).
'use strict';

const XMatch = (() => {
  let M = null, timer = null, tac = 2, botTac = 2;
  const S = () => XDraft.S();
  const EV = { goal: ['⚽', 'ГОЛ!'], save: ['🧤', 'Сейв вратаря'], miss: ['💨', 'Удар мимо'] };

  function choose() {
    Modal.open(`<h2>Матч против бота</h2><p>Боты собраны из той же базы и играют по тем же правилам. Сложность — в силе состава и в том, как бот меняет тактику.</p>`,
      Object.entries(XD.BOTS).map(([k, b]) => ({ label: `${b.name}`, cls: k === 'normal' ? '' : 'ghost', onClick: () => start(k) })).concat([{ label: 'Отмена', cls: 'ghost' }]));
  }
  function side(sys, form, xi) { const c = XD.chem(sys, form, xi).total; return { lines: XD.lines(sys, form, xi, c), rating: XD.teamRating(xi), chem: c }; }
  function build(m) {
    const a = XDraft.A(), xi = XDraft.xiOf();
    const bxi = m.bot.xi.map(XDraft.P);
    return XD.matchNew(side(a.sys, a.form, xi), side(a.sys, m.bot.form, bxi), m.seed);
  }
  function start(level) {
    const a = XDraft.A(), seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const bt = XD.botTeam(level, XDraft.pool(), a.sys, XD.rng(seed ^ 0x5bd1));
    S().match = { seed, level, bot: { form: bt.form, xi: bt.xi.map((p) => p && p.name) }, hist: [], done: false };
    Store.save();
    tac = 2; botTac = 2; M = build(S().match);
    intro();
  }
  function resume() {
    const m = S().match; if (!m) return;
    M = build(m); m.hist.forEach((t) => XD.matchStep(M, t));
    const last = m.hist[m.hist.length - 1] || [2, 2]; tac = last[0]; botTac = last[1];
    if (m.done || M.over) return end();
    render(); run();
  }
  function intro() {
    const m = S().match, a = XDraft.A(), b = M.away;
    $('#xd-body').innerHTML = `<div class="xm-intro"><div class="xm-vs"><span><b>${esc(Store.d.user.nick || 'Ты')}</b><small>${a.form} · рейтинг ${M.home.rating} · химия ${M.home.chem}</small></span><i>VS</i>
      <span><b>Бот · ${XD.BOTS[m.level].name}</b><small>${m.bot.form} · рейтинг ${b.rating} · химия ${b.chem}</small></span></div>
      <p class="xm-note">Атака — больше моментов, но больше риска сзади</p>
      <button class="btn gold" data-xm="go">Начать матч</button></div>`;
  }
  function run() {
    clearInterval(timer);
    timer = setInterval(tick, XD.CFG.match.tickMs);
  }
  function tick() {
    if (Screens.current !== 'xdraft' || !M) { clearInterval(timer); return; } // ушли с экрана — пауза, вернёмся — продолжим
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
    const m = S().match, a = XDraft.A();
    const form = side ? m.bot.form : a.form, xi = side ? m.bot.xi.map(XDraft.P) : XDraft.xiOf();
    const R = XD.rng((m.seed ^ (minute * 2654435761)) >>> 0);
    const W = { ST: 6, LW: 4, RW: 4, CAM: 4, LM: 2, RM: 2, CM: 1.5, CDM: 0.6, CB: 0.4, LB: 0.5, RB: 0.5, GK: 0 };
    const sl = XD.FORMATIONS[form].slots, tot = sl.reduce((t, q) => t + (W[q.pos] || 0), 0);
    let x = R() * tot, shooter = xi[0];
    for (let k = 0; k < sl.length; k++) { x -= W[sl[k].pos] || 0; if (x <= 0) { shooter = xi[k]; break; } }
    const oform = side ? a.form : m.bot.form, oxi = side ? XDraft.xiOf() : m.bot.xi.map(XDraft.P);
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
  function dots() {
    const m = S().match, a = XDraft.A(), sh = (ballX - 50) * 0.22;
    const team = (form, side) => XD.FORMATIONS[form].slots.map((q) => {
      const depth = (100 - q.y) / 100; // 0 — ворота, 1 — атака
      let x = side ? 96 - depth * 44 : 4 + depth * 44; x += sh;
      return `<i class="xm-p ${side ? 'them' : 'us'}" style="left:${Math.max(2, Math.min(98, x))}%;top:${8 + q.x * 0.84}%"></i>`;
    }).join('');
    return team(a.form, 0) + team(m.bot.form, 1);
  }
  function render(evs = []) {
    const box = $('#xd-body'), m = S().match, me = Store.d.user.nick || 'Ты';
    const goal = M.ev.filter((e) => e.t === 'goal' && M.min - e.m < 2).pop(), fresh = goal && evs.includes(goal), last = evs[evs.length - 1];
    if (last) { ballX = last.s === 0 ? 90 : 10; ballY = 40 + Math.random() * 20; }
    else { ballX = Math.max(25, Math.min(75, 50 + (tac - botTac) * 5 + (Math.random() - 0.5) * 34)); ballY = 25 + Math.random() * 50; }
    const ab = (n) => esc(String(n).replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').slice(0, 3).toUpperCase() || '?');
    box.innerHTML = `<div class="xm">
      <div class="xm-bug"><span class="xm-tm us"><i>${ab(me)}</i></span><span class="xm-s">${M.score[0]}<em>–</em>${M.score[1]}</span><span class="xm-tm them"><i>${ab(XD.BOTS[m.level].name)}</i></span>
        <span class="xm-clock"><i class="live"></i>${M.min}'</span></div>
      <div class="xm-pitch"><svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="58"/><line x1="50" y1="1" x2="50" y2="59"/><circle cx="50" cy="30" r="8"/>
        <rect x="1" y="16" width="14" height="28"/><rect x="85" y="16" width="14" height="28"/><rect x="1" y="24" width="5" height="12"/><rect x="94" y="24" width="5" height="12"/></svg>
        ${dots()}<i class="xm-ball" style="left:${ballX}%;top:${ballY}%"></i>
        ${goal ? `<div class="xm-goalfx ${goal.s ? 'them' : 'us'} ${fresh ? '' : 'hold'}">ГОЛ!</div>` : ''}<span class="xm-prog" style="width:${(M.min / XD.CFG.match.minutes) * 100}%"></span></div>
      <div class="xm-feed">${feed()}</div>
      <div class="xm-tac"><div class="xm-tt"><span>Тактика</span><b>${SHORT[tac]}</b><small>соперник: ${SHORT[botTac]}</small></div>
        <div class="xm-bar">${XD.TACTICS.map((t, i) => `<button class="z${i} ${i === tac ? 'on' : ''}" data-tac="${i}" aria-label="${t}"></button>`).join('')}<i class="xm-knob" style="left:${tac * 20 + 10}%"></i></div>
        <div class="xm-axis"><span>Защита</span><span>Атака</span></div></div>
      <div class="xm-stats"><span>Моменты <b>${M.stats.ch[0]}:${M.stats.ch[1]}</b></span><span>В створ <b>${M.stats.on[0]}:${M.stats.on[1]}</b></span></div></div>`;
  }
  function setTac(t) { t = Math.max(0, Math.min(4, t)); if (t === tac) return; tac = t; Sound.play('tap'); haptic('pop'); render(); }
  function end() {
    const m = S().match; m.done = true; Store.save();
    const w = M.score[0] > M.score[1] ? 'win' : M.score[0] < M.score[1] ? 'lose' : 'draw';
    $('#xd-body').innerHTML = `<div class="xd-res"><div class="sb"><div class="sb-k">ФИНАЛЬНЫЙ СВИСТОК · БОТ «${XD.BOTS[m.level].name.toUpperCase()}»</div>
      <div class="xm-final ${w}"><b>${M.score[0]}</b><i>:</i><b>${M.score[1]}</b></div><div class="xd-best">${w === 'win' ? 'Победа!' : w === 'lose' ? 'Поражение' : 'Ничья'} · моменты ${M.stats.ch[0]}:${M.stats.ch[1]} · в створ ${M.stats.on[0]}:${M.stats.on[1]}</div></div>
      <div class="xm-feed all">${M.ev.filter((e) => e.t === 'goal').map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-goal"><b>${e.m}'</b><span>⚽</span><em>${esc(who(e.s, e.m).shooter)}</em></div>`).join('') || '<p class="xm-note">Без голов</p>'}</div>
      <div class="xd-act col"><button class="btn gold" data-xm="again">Ещё матч</button><button class="btn ghost" data-xm="share">Поделиться результатом</button><button class="btn ghost" data-xm="squad">К составу</button></div></div>`;
    if (w === 'win' && typeof confetti === 'function') confetti();
  }
  function share() {
    const m = S().match, a = XDraft.A();
    const text = `⚽ Драфт ${a.form} · ${XDraft.SYS[a.sys]}\nМатч с ботом «${XD.BOTS[m.level].name}»: ${M.score[0]}:${M.score[1]}\nСтарики Джексоны`;
    const url = appLink('xdraft');
    try { if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; } } catch (e) { /* не в Telegram */ }
    if (navigator.share) navigator.share({ text, url }).catch(() => {}); else toast(text);
  }
  function bind() {
    const box = $('#xd-body');
    box.addEventListener('click', (e) => {
      const z = e.target.closest('[data-tac]'); if (z) return setTac(+z.dataset.tac);
      const b = e.target.closest('[data-xm]'); if (!b) return;
      const k = b.dataset.xm;
      if (k === 'go') { render(); run(); }
      if (k === 'again') choose();
      if (k === 'share') share();
      if (k === 'squad') { S().match = null; Store.save(); XDraft.render(); }
    });
    box.addEventListener('change', (e) => { if (e.target.classList.contains('xm-range')) setTac(+e.target.value); });
  }
  return { choose, start, resume, bind };
})();
