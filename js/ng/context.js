// «Тепло-холодно» (как Contextinho): загадан футболист. Каждая догадка получает место в рейтинге похожести:
// №1 — это он, чем меньше номер — тем теплее. Похожесть: клуб, сборная, лига, позиция, возраст.
'use strict';

(() => {
  const LINE = { ГК: 0, ЦЗ: 1, ЛЗ: 1, ПЗ: 1, ЦОП: 2, ЦП: 2, ЦАП: 2, ЛВ: 3, ПВ: 3, ФРВ: 3 };
  function sim(p, s) {
    if (p === s) return 1e9;
    return (p.club === s.club ? 50 : 0) + (p.nat === s.nat ? 28 : p.cont === s.cont ? 6 : 0) + (p.lg === s.lg ? 16 : 0)
      + (p.pos === s.pos ? 12 : LINE[p.pos] === LINE[s.pos] ? 6 : 0) + Math.max(0, 10 - Math.abs(p.born - s.born) * 2) + (p.num && p.num === s.num ? 3 : 0);
  }

  NG.register({
    id: 'context', group: 'brain', title: 'Тепло-холодно', c1: '#ff4d4d', c2: '#2f6fe4', tag: 'Угадай по «похожести»',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? `Сегодня за ${s.daily.g.length}` : 'Игрок дня'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const pool = PLAYERS.filter((p) => p.tier <= 2);
      const secret = practice ? pick(pool) : pool[Math.floor(Day.rng('context')() * pool.length)];
      const rank = new Map([...PLAYERS].sort((a, b) => sim(b, secret) - sim(a, secret)).map((p, i) => [p.name, i + 1]));
      const st = practice ? { g: [], hints: 0, done: false } : api.today(() => ({ g: [], hints: 0 }));
      const b = api.body;
      b.innerHTML = `<p class="ng-lead">Загадан футболист из базы (${PLAYERS.length} игроков). Чем меньше номер у догадки — тем теплее. №1 — победа.</p>
        <div class="cx-thermo"></div><div class="ng-in"></div><div class="ng-row"><button class="btn ghost" data-a="hint">💡 Подсказка</button><button class="btn ghost" data-a="give">Сдаться</button></div><div class="cx-list"></div>`;
      const inp = NG.input($('.ng-in', b), { items: (q) => NG.playerItems(q, new Set(st.g)), onPick: guess });
      const heat = (r) => (r === 1 ? 'win' : r <= 10 ? 'hot' : r <= 40 ? 'warm' : r <= 120 ? 'cool' : 'cold');
      const WORD = { win: 'Он!', hot: 'Горячо 🔥', warm: 'Тепло', cool: 'Прохладно', cold: 'Лёд 🧊' };
      function render() {
        api.sub(`${practice ? 'Тренировка · ' : `#${Day.num()} · `}догадок: ${st.g.length}`);
        const sorted = [...st.g].sort((x, y) => rank.get(x) - rank.get(y));
        const last = st.g[st.g.length - 1];
        const best = st.g.length ? Math.min(...st.g.map((n) => rank.get(n))) : PLAYERS.length;
        const bw = Math.max(3, 100 - Math.log2(best) * 12.5);
        $('.cx-thermo', b).innerHTML = `<div class="cx-bar"><i class="${heat(best)}" style="width:${bw}%"></i></div><div class="cx-tl"><span>🧊</span><b>${st.g.length ? `Лучшая догадка: №${best} · ${WORD[heat(best)]}` : 'Назови любого игрока'}</b><span>🔥</span></div>`;
        $('.cx-list', b).innerHTML = (last ? [last] : []).concat(sorted.filter((n) => n !== last)).map((n, k) => {
          const r = rank.get(n), w = Math.max(4, 100 - Math.log2(r) * 12);
          return `<div class="cx-row ${heat(r)} ${n === last ? 'last' : ''}">${k === 1 ? '' : ''}<i style="width:${w}%"></i>${avatar(n, 's')}<b>${esc(n)}</b><span>${WORD[heat(r)]} · №${r}</span></div>`;
        }).join('');
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
        inp.disable(!!st.done);
      }
      function guess(name) {
        if (st.done || st.g.includes(name)) return;
        st.g.push(name);
        const r = rank.get(name);
        Sound.play(r <= 10 ? 'kick' : 'tap');
        if (r === 1) return finish(true);
        api.save(); render();
      }
      function hint() {
        if (st.done) return;
        // подсказка: игрок вдвое «теплее» лучшей догадки
        const best = st.g.length ? Math.min(...st.g.map((n) => rank.get(n))) : 300;
        const target = Math.max(2, Math.floor(best / 2));
        const n = [...rank.entries()].find(([k, v]) => v === target && !st.g.includes(k));
        if (!n) return;
        st.hints++; st.g.push(n[0]); api.save(); render(); toast(`Подсказка: ${n[0]} — №${n[1]}`);
      }
      function finish(won) {
        st.done = true; st.won = won; api.save(); render();
        if (!practice) { if (won) api.streakWin(); else api.streakLose(); }
        if (won) Profile.bump('context', 12);
        const n = st.g.length;
        NG.end({
          title: won ? 'Нашёл!' : 'Сдался', win: won, big: won ? `${n}` : '', stats: won ? [['Догадок', n], ['Подсказок', st.hints]] : [],
          reward: won ? Math.max(10, (practice ? 25 : 70) - n * 3 - st.hints * 10) : 0, daily: !practice,
          html: `<div class="player-card">${avatar(secret.name, 'xl')}<div class="pname">${esc(secret.name)}</div><div class="pmeta">${secret.flag} ${esc(secret.club)}</div></div>`,
          shareText: practice || !won ? '' : `🌡 Тепло-холодно #${Day.num()} — угадал за ${n}${st.hints ? ` (подсказок: ${st.hints})` : ''}\nСтарики Джексоны`,
          again: { label: 'Тренировка', fn: () => NG.open('context', { practice: true }) },
        });
      }
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a || st.done) return;
        if (a.dataset.a === 'hint') hint(); else finish(false);
      });
      render();
      if (st.done && !practice) later(() => Modal.open(`<h2>Сегодня: ${st.won ? `за ${st.g.length}` : 'сдался'}</h2><p>Это был ${esc(secret.name)}. Новый игрок через ${NG.untilTomorrow()}.</p>`,
        [{ label: 'Тренировка', onClick: () => NG.open('context', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
    },
  });
})();
