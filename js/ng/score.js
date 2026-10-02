// «Угадай счёт»: матчи чемпионатов мира 1930–2026. Поставь счёт — точный счёт 3 очка,
// верная разница 2, верный исход 1. Подсказка «первый гол» стоит очко. После ответа — авторы голов.
'use strict';

(() => {
  const ROUNDS = 5;
  const W = { 'Финал': 6, 'Полуфинал': 3, 'Матч за 3-е место': 1, '1/4 финала': 2 };

  function pickMatch(used) {
    const items = WC_MATCHES.map((m, i) => [i, W[m[1]] || 1]).filter(([i]) => !used.has(i));
    let r = Math.random() * items.reduce((a, x) => a + x[1], 0);
    for (const [i, w] of items) { r -= w; if (r <= 0) { used.add(i); return WC_MATCHES[i]; } }
    const i = items[0][0]; used.add(i); return WC_MATCHES[i];
  }
  const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

  NG.register({
    id: 'score', group: 'hist', title: 'Угадай счёт', c1: '#e2384d', c2: '#1b1340', tag: 'Матчи чемпионатов мира',
    meta: (s) => (s.best ? `Рекорд ${s.best}/${ROUNDS * 3}` : 'Легендарные матчи ЧМ'),
    start(api) {
      const used = new Set();
      let round = 0, total = 0, m = null, h = 1, a = 1, hint = false, done = false, results = [];
      const b = api.body;
      function render() {
        api.sub(`Раунд ${round}/${ROUNDS} · очки: ${total}`);
        const pen = m[8] >= 0 ? ` <small>пен. — ${m[8] ? m[4] : m[2]}</small>` : '';
        const first = m[9][0];
        const sc = (side) => m[9].filter((g) => g[0] === side).map((g) => `<span>${esc(g[1])} ${g[2] || ''}'${g[4] ? ' (пен.)' : ''}${g[3] ? ' (авт.)' : ''}</span>`).join('') || '<span class="muted">—</span>';
        b.innerHTML = `<div class="rk-rounds">${[...Array(ROUNDS).keys()].map((i) => `<i class="${i < results.length ? 'done' : i === round - 1 ? 'now' : ''}">${i < results.length ? results[i] : i + 1}</i>`).join('')}<b>${total} очк.</b></div>
          <div class="sc-card"><div class="sc-meta">🏆 Чемпионат мира ${m[0]} · ${esc(m[1])}</div>
            <div class="sc-teams">
              <div class="sc-team"><span class="sc-flag">${m[3]}</span><b>${esc(m[2])}</b></div>
              <div class="sc-mid">${done ? `<div class="sc-real">${m[6]}:${m[7]}</div>${pen}<div class="sc-mine">твой: ${h}:${a}</div>`
                : `<div class="sc-pick"><div class="sc-st"><button data-s="h+">+</button><b>${h}</b><button data-s="h-">−</button></div><i>:</i><div class="sc-st"><button data-s="a+">+</button><b>${a}</b><button data-s="a-">−</button></div></div>`}</div>
              <div class="sc-team"><span class="sc-flag">${m[5]}</span><b>${esc(m[4])}</b></div>
            </div>
            ${done ? `<div class="sc-goals"><div>${sc(0)}</div><div>${sc(1)}</div></div>` : hint && first ? `<p class="sc-hint">Первый гол: ${esc(first[1])}, ${first[2]}' (${first[0] ? esc(m[4]) : esc(m[2])})</p>` : hint ? '<p class="sc-hint">Голов не было…</p>' : ''}
          </div>
          <div class="ng-row">${done ? `<button class="btn gold" data-a="next">${round >= ROUNDS ? 'Итоги' : 'Дальше →'}</button>`
            : `<button class="btn ghost" data-a="hint" ${hint ? 'disabled' : ''}>💡 Первый гол (−1)</button><button class="btn gold" data-a="go">Ответить</button>`}</div>
          <p class="ng-lead sc-rule">Точный счёт — 3 очка, разница — 2, исход — 1. Счёт после доп. времени.</p>`;
      }
      function next() {
        if (round >= ROUNDS) return finish();
        m = pickMatch(used); h = 1; a = 1; hint = false; done = false; round++;
        render();
      }
      function go() {
        const exact = h === m[6] && a === m[7], diff = h - a === m[6] - m[7], out = sign(h - a) === sign(m[6] - m[7]);
        let pts = exact ? 3 : diff ? 2 : out ? 1 : 0;
        if (hint && pts) pts--;
        total += pts; results.push(pts); done = true;
        Sound.play(pts >= 2 ? 'goal' : pts ? 'kick' : 'bad'); haptic(pts ? 'ok' : 'bad');
        toast(exact ? `Точный счёт! +${pts}` : pts ? `+${pts}` : 'Мимо');
        render();
      }
      function finish() {
        const s = api.st(), max = ROUNDS * 3;
        s.best = Math.max(s.best || 0, total); api.save();
        if (total >= 9) Profile.bump('score', 10);
        NG.end({ title: total >= 11 ? 'Ходячая энциклопедия' : total >= 6 ? 'Помнишь историю' : 'Есть что пересмотреть', big: `${total}/${max}`,
          stats: [['Раунды', results.join(' · ')], ['Рекорд', s.best]], win: total >= 9, reward: total * 2,
          again: { label: 'Ещё 5 матчей', fn: () => NG.open('score') } });
      }
      b.addEventListener('click', (e) => {
        const s = e.target.closest('[data-s]');
        if (s && !done) {
          const k = s.dataset.s;
          if (k === 'h+') h = Math.min(12, h + 1); if (k === 'h-') h = Math.max(0, h - 1);
          if (k === 'a+') a = Math.min(12, a + 1); if (k === 'a-') a = Math.max(0, a - 1);
          Sound.play('tap'); render(); return;
        }
        const x = e.target.closest('[data-a]');
        if (!x) return;
        if (x.dataset.a === 'hint') { hint = true; render(); }
        if (x.dataset.a === 'go') go();
        if (x.dataset.a === 'next') next();
      });
      next();
    },
  });
})();
