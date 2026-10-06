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
      <p class="xd-lead">Матч длится ${XD.CFG.match.minutes} игровых минут — около ${Math.max(1, Math.round((XD.CFG.match.minutes / XD.CFG.match.stepMin) * XD.CFG.match.tickMs / 6000) / 10)} мин. Двигай регулятор «Защита ↔ Атака»: атака даёт больше моментов, но открывает тебя для контратак.</p>
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
  function feed() {
    return M.ev.slice(-6).reverse().map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-${e.t}"><b>${e.m}'</b><span>${EV[e.t][0]}</span><em>${EV[e.t][1]}</em><small>${e.s ? 'соперник' : 'твоя команда'}</small></div>`).join('') || '<p class="xd-lead">Матч начался</p>';
  }
  function render(evs = []) {
    const box = $('#xd-body'), m = S().match;
    const goal = evs.find((e) => e.t === 'goal');
    box.innerHTML = `<div class="xm">
      <div class="xm-board ${goal ? 'flash' : ''}"><span class="xm-t"><b>${esc(Store.d.user.nick || 'Ты')}</b><small>${XD.TACTICS[tac]}</small></span>
        <span class="xm-sc"><b>${M.score[0]}</b><i>:</i><b>${M.score[1]}</b><small>${M.min}'</small></span>
        <span class="xm-t r"><b>Бот · ${XD.BOTS[m.level].name}</b><small>${XD.TACTICS[botTac]}</small></span></div>
      <span class="xm-time"><i style="width:${(M.min / XD.CFG.match.minutes) * 100}%"></i></span>
      <div class="xm-tac"><div class="xm-tl"><span>Защита</span><b>${XD.TACTICS[tac]}</b><span>Атака</span></div>
        <div class="xm-zones">${XD.TACTICS.map((t, i) => `<button class="z${i} ${i === tac ? 'on' : ''}" data-tac="${i}" aria-label="${t}"><i></i></button>`).join('')}</div>
        <input type="range" min="0" max="4" step="1" value="${tac}" class="xm-range" aria-label="Тактика">
        <p class="xm-hint">${['Почти без моментов, но и сзади надёжно', 'Меньше риска, меньше угрозы', 'Поровну атаки и защиты', 'Больше моментов, но ловим контратаки', 'Всё вперёд: много моментов и много риска'][tac]}</p></div>
      <div class="xm-stats"><span>Моменты <b>${M.stats.ch[0]} : ${M.stats.ch[1]}</b></span><span>В створ <b>${M.stats.on[0]} : ${M.stats.on[1]}</b></span></div>
      <div class="xm-feed">${feed()}</div></div>`;
  }
  function setTac(t) { t = Math.max(0, Math.min(4, t)); if (t === tac) return; tac = t; Sound.play('tap'); haptic('pop'); render(); }
  function end() {
    const m = S().match; m.done = true; Store.save();
    const w = M.score[0] > M.score[1] ? 'win' : M.score[0] < M.score[1] ? 'lose' : 'draw';
    $('#xd-body').innerHTML = `<div class="xd-res"><div class="sb"><div class="sb-k">ФИНАЛЬНЫЙ СВИСТОК · БОТ «${XD.BOTS[m.level].name.toUpperCase()}»</div>
      <div class="xm-final ${w}"><b>${M.score[0]}</b><i>:</i><b>${M.score[1]}</b></div><div class="xd-best">${w === 'win' ? 'Победа!' : w === 'lose' ? 'Поражение' : 'Ничья'} · моменты ${M.stats.ch[0]}:${M.stats.ch[1]} · в створ ${M.stats.on[0]}:${M.stats.on[1]}</div></div>
      <div class="xm-feed all">${M.ev.filter((e) => e.t === 'goal').map((e) => `<div class="xm-ev ${e.s ? 'them' : 'us'} k-goal"><b>${e.m}'</b><span>⚽</span><em>Гол</em><small>${e.s ? 'соперник' : 'твоя команда'}</small></div>`).join('') || '<p class="xd-lead">Без голов</p>'}</div>
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
