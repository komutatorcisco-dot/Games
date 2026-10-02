// «Номер в истории»: под каким номером звезда играла в прошлом клубе — или кто носил номер в клубе в том сезоне.
// 10 вопросов, по составам на матчи с Transfermarkt (2012–2026).
'use strict';

(() => {
  const Q = 10;
  const rows = () => {
    if (rows.c) return rows.c;
    const out = [];
    for (let i = 0; i < NUMH.length; i += 4) out.push({ p: NUMH_P[NUMH[i]], c: NUMH_C[NUMH[i + 1]], s: 2000 + NUMH[i + 2], n: NUMH[i + 3] });
    return (rows.c = out);
  };
  const season = (y) => `${y}/${String(y + 1).slice(2)}`;
  const COMMON = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 17, 19, 20, 21, 22, 23, 25];

  function question() {
    // текущий сезон слишком лёгкий — спрашиваем в основном про прошлые
    const R = rows(), past = R.filter((x) => x.s < 2025), r = pick(Math.random() < 0.85 ? past : R);
    if (Math.random() < 0.5) {
      // Тип A: какой номер
      const own = [...new Set(R.filter((x) => x.p === r.p && x.n !== r.n).map((x) => x.n))];
      const opts = new Set([r.n]);
      shuffle(own, Math.random).forEach((n) => { if (opts.size < 4) opts.add(n); });
      shuffle(COMMON, Math.random).forEach((n) => { if (opts.size < 4) opts.add(n); });
      return { kind: 'n', r, text: `Под каким номером <b>${esc(r.p)}</b> играл за «${esc(r.c)}» в сезоне ${season(r.s)}?`, ans: String(r.n), opts: shuffle([...opts].map(String), Math.random) };
    }
    // Тип B: кто носил номер
    const same = R.filter((x) => x.c === r.c && Math.abs(x.s - r.s) <= 2 && x.p !== r.p);
    const bad = new Set(R.filter((x) => x.c === r.c && x.s === r.s && x.n === r.n).map((x) => x.p));
    const pool = [...new Set(same.map((x) => x.p))].filter((p) => !bad.has(p));
    if (pool.length < 3) return question();
    return { kind: 'p', r, text: `Кто играл под <b>№${r.n}</b> в «${esc(r.c)}» в сезоне ${season(r.s)}?`, ans: r.p, opts: shuffle([r.p, ...shuffle(pool, Math.random).slice(0, 3)], Math.random) };
  }

  NG.register({
    id: 'numhist', group: 'hist', title: 'Номер в истории', c1: '#5b8cff', c2: '#ffcf3a', tag: 'Номера звёзд в прошлых клубах',
    meta: (s) => (s.best ? `Рекорд ${s.best}/${Q}` : `${NUMH.length / 4} номеров с 2012 года`),
    start(api) {
      let i = 0, ok = 0, cur = null, done = false, marks = [];
      const b = api.body;
      function render() {
        api.sub(`Вопрос ${i}/${Q} · верно: ${ok}`);
        const r = cur.r;
        b.innerHTML = `<div class="nh-dots">${[...Array(Q).keys()].map((k) => `<i class="${marks[k] === 1 ? 'ok' : marks[k] === 0 ? 'bad' : k === i - 1 ? 'now' : ''}"></i>`).join('')}</div>
          <div class="nh-card">${crestImg(r.c, 'l')}${cur.kind === 'n' ? avatar(r.p, 'l') : `<span class="nh-num">${r.n}</span>`}</div>
          <p class="nh-q">${cur.text}</p>
          <div class="ng-opts nh-opts ${cur.kind === 'n' ? 'nums' : ''}">${cur.opts.map((o) => `<button class="btn ghost ng-opt ${done ? (o === cur.ans ? 'right' : o === cur.pick ? 'wrong' : '') : ''}" data-o="${esc(o)}" ${done ? 'disabled' : ''}>${cur.kind === 'p' ? `${avatar(o, 's')}${esc(o)}` : `<b class="nh-big">${esc(o)}</b>`}</button>`).join('')}</div>
          ${done ? `<p class="ng-lead nh-fact">${cur.kind === 'n' ? `${esc(r.p)} — №${r.n} в «${esc(r.c)}» ${season(r.s)}` : `№${r.n} — ${esc(r.p)}`}</p><div class="ng-row"><button class="btn gold" data-a="next">${i >= Q ? 'Итоги' : 'Дальше →'}</button></div>` : ''}`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function next() {
        if (i >= Q) return finish();
        cur = question(); done = false; i++;
        render();
      }
      function answer(o) {
        done = true; cur.pick = o;
        const good = o === cur.ans;
        if (good) ok++;
        marks.push(good ? 1 : 0);
        Sound.play(good ? 'kick' : 'bad'); haptic(good ? 'ok' : 'bad');
        render();
      }
      function finish() {
        const s = api.st();
        s.best = Math.max(s.best || 0, ok); api.save();
        if (ok >= 7) Profile.bump('numhist', 10);
        NG.end({ title: ok >= 9 ? 'Помнишь каждую футболку!' : ok >= 6 ? 'Крепко' : 'Номера путаются', big: `${ok}/${Q}`,
          stats: [['Рекорд', s.best]], win: ok >= 7, reward: ok * 3, again: { label: 'Ещё 10', fn: () => NG.open('numhist') } });
      }
      b.addEventListener('click', (e) => {
        const o = e.target.closest('[data-o]');
        if (o && !done) return answer(o.dataset.o);
        if (e.target.closest('[data-a="next"]')) next();
      });
      next();
    },
  });
})();
