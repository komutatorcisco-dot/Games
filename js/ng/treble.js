// «Требл дня»: три вопроса за день — эмблема клуба, трансфер, рейтинг FC 27. Собери «требл» из трёх побед.
'use strict';

(() => {
  function build(rnd) {
    const r = (arr) => arr[Math.floor(rnd() * arr.length)];
    const mix = (arr) => shuffle(arr, rnd);
    // 1. эмблема
    const clubs = CL().map((c) => c[0]).filter((c) => CRESTS[c]);
    const club = r(clubs);
    const q1 = { kind: 'crest', club, opts: mix([club, ...mix(clubs.filter((c) => c !== club)).slice(0, 3)]), ans: club };
    // 2. трансфер
    const t = r(TR());
    const dests = [...new Set(TR().map((x) => x[3]))].filter((c) => c !== t[3] && c !== t[2]);
    const q2 = { kind: 'transfer', t, opts: mix([t[3], ...mix(dests).slice(0, 3)]), ans: t[3] };
    // 3. рейтинг
    const rated = Object.keys(FC27);
    let a, c;
    do { a = r(rated); c = r(rated); } while (a === c || FC27[a] === FC27[c]);
    const q3 = { kind: 'fc', opts: [a, c], ans: FC27[a] > FC27[c] ? a : c };
    return [q1, q2, q3];
  }

  NG.register({
    id: 'treble', group: 'daily', title: 'Требл дня', c1: '#c65bd8', c2: '#7b2b8a', tag: '3 вопроса в день',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? `Сегодня: ${s.daily.res.filter(Boolean).length}/3` : 'Собери требл'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const qs = build(practice ? Math.random : Day.rng('treble'));
      const st = practice ? { res: [], done: false } : api.today(() => ({ res: [] }));
      const b = api.body;
      const CUPS = [['🏆', 'Лига'], ['🥇', 'Кубок'], ['⭐', 'ЛЧ']];
      const TIME = 15000;
      let token = 0;
      const cups = () => `<div class="tb-cups">${CUPS.map(([ic, n], i) => `<span class="${st.res[i] === true ? 'win' : st.res[i] === false ? 'lose' : i === st.res.length ? 'now' : ''}"><i>${ic}</i><small>${n}</small></span>`).join('')}</div>`;

      function render() {
        api.sub(practice ? 'Тренировка' : `#${Day.num()}`);
        const i = st.res.length;
        if (st.done || i >= 3) return;
        const q = qs[i];
        const title = ['Чья это эмблема?', 'Куда перешёл?', 'У кого выше рейтинг в FC 27?'][i];
        let stage = '';
        if (q.kind === 'crest') stage = `<div class="tb-crest">${crestImg(q.club, 'xl')}</div>`;
        if (q.kind === 'transfer') stage = `<div class="tb-tr">${avatar(q.t[0], 'l')}<b>${q.t[1]} ${esc(q.t[0])}</b>
          <span class="tb-route">${crestImg(q.t[2], 'm')}<i class="tb-arrow">➜</i><span class="tb-q">?</span></span><small>${q.t[4]} год · ${q.t[5] ? q.t[5] + ' млн €' : 'бесплатно'}</small></div>`;
        const opts = q.kind === 'fc'
          ? q.opts.map((o) => `<button class="ng-opt tb-fut" data-o="${esc(o)}"><em class="tb-r">??</em>${avatar(o, 'l')}<b>${esc(o)}</b></button>`).join('')
          : q.opts.map((o) => `<button class="btn ghost ng-opt" data-o="${esc(o)}">${q.kind === 'transfer' ? crestImg(o, 'xs') : ''}${esc(o)}</button>`).join('');
        b.innerHTML = `${cups()}<h3 class="ng-q">${title}</h3><div class="tb-timer"><i></i></div>${stage}
          <div class="opts ${q.kind === 'fc' ? 'tb-two' : ''}">${opts}</div>`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
        // таймер: не успел — вопрос проигран
        const my = ++token;
        later(() => { if (my === token && st.res.length === i && !st.done) { toast('Время вышло!'); answer('', null); } }, TIME);
      }
      function answer(o, btn) {
        const i = st.res.length, q = qs[i];
        if (i >= 3) return;
        token++;
        const ok = o === q.ans;
        st.res.push(ok); api.save();
        $('.tb-timer', b).classList.add('stop');
        $$('.ng-opt', b).forEach((x) => { x.disabled = true; if (x.dataset.o === q.ans) x.classList.add('right'); });
        if (!ok && btn) btn.classList.add('wrong');
        if (q.kind === 'fc') $$('.tb-fut', b).forEach((x) => { const r = $('.tb-r', x); r.textContent = FC27[x.dataset.o]; r.classList.add('show'); });
        if (q.kind === 'transfer') { const qq = $('.tb-q', b); qq.innerHTML = crestImg(q.ans, 'm'); qq.classList.add('show'); }
        if (q.kind === 'crest') $('.tb-crest', b).classList.add('show');
        $('.tb-cups', b).outerHTML = cups();
        Sound.play(ok ? 'kick' : 'bad'); haptic(ok ? 'ok' : 'bad');
        later(() => (st.res.length >= 3 ? finish() : render()), 1600);
      }
      function finish() {
        st.done = true; api.save();
        const n = st.res.filter(Boolean).length;
        b.innerHTML = cups();
        if (!practice) { if (n === 3) api.streakWin(); else api.streakLose(); }
        if (n === 3) Profile.bump('treble', 15);
        NG.end({
          title: n === 3 ? 'Требл!' : n === 2 ? 'Дубль' : n === 1 ? 'Один трофей' : 'Сезон без трофеев', win: n === 3, big: `${n}/3`,
          reward: practice ? n * 2 : n * 12 + (n === 3 ? 14 : 0), daily: !practice,
          shareText: practice ? '' : `🏆 Требл дня #${Day.num()} — ${n}/3\n${st.res.map((x) => (x ? '🟩' : '🟥')).join('')}\nСтарики Джексоны`,
          again: { label: 'Тренировка', fn: () => NG.open('treble', { practice: true }) },
        });
      }
      b.addEventListener('click', (e) => { const o = e.target.closest('.ng-opt'); if (o && !o.disabled) answer(o.dataset.o, o); });
      if (st.done && !practice) {
        b.innerHTML = cups();
        later(() => Modal.open(`<h2>Сегодня: ${st.res.filter(Boolean).length}/3</h2><p>Новый требл через ${NG.untilTomorrow()}.</p>`,
          [{ label: 'Тренировка', onClick: () => NG.open('treble', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
      } else render();
    },
  });
})();
