// «Тепло-холодно» (как Contextinho): загадан футболист. Каждая догадка показывает температуру — насколько он похож
// на загаданного (клуб, сборная, лига, позиция, возраст), и значки того, что совпало. 100° — это он.
// Подсказки открывают признаки по очереди: континент → лига → позиция → сборная → клуб.
'use strict';

(() => {
  const LINE = { ГК: 0, ЦЗ: 1, ЛЗ: 1, ПЗ: 1, ЦОП: 2, ЦП: 2, ЦАП: 2, ЛВ: 3, ПВ: 3, ФРВ: 3 };
  const LINE_NAME = ['вратарь', 'защитник', 'полузащитник', 'нападающий'];
  function sim(p, s) {
    if (p === s) return 1e9;
    return (p.club === s.club ? 50 : 0) + (p.nat === s.nat ? 28 : p.cont === s.cont ? 6 : 0) + (p.lg === s.lg ? 16 : 0)
      + (p.pos === s.pos ? 12 : LINE[p.pos] === LINE[s.pos] ? 6 : 0) + Math.max(0, 10 - Math.abs(p.born - s.born) * 2) + (p.num && p.num === s.num ? 3 : 0);
  }
  // место в рейтинге похожести → температура: №1 = 100°, самый непохожий ≈ −30°
  const temp = (r, n) => (r === 1 ? 100 : Math.max(-30, Math.round(96 - (Math.log(r) / Math.log(n)) * 126)));
  const heat = (t) => (t >= 100 ? 'win' : t >= 60 ? 'hot' : t >= 30 ? 'warm' : t >= 5 ? 'cool' : 'cold');
  const WORD = { win: 'Это он!', hot: 'Горячо 🔥', warm: 'Тепло ☀️', cool: 'Прохладно 🌥', cold: 'Холодно 🧊' };
  const deg = (t) => `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}°`;

  NG.register({
    id: 'context', group: 'brain', title: 'Тепло-холодно', c1: '#ff4d4d', c2: '#2f6fe4', tag: 'Угадай по температуре',
    meta: (s) => (s.daily && s.daily.day === Day.key() && s.daily.done ? `Сегодня за ${s.daily.g.length}` : 'Игрок дня'),
    start(api, opts = {}) {
      const practice = !!opts.practice;
      const pool = PLAYERS.filter((p) => p.tier <= 2);
      const secret = practice ? pick(pool) : pool[Math.floor(Day.rng('context')() * pool.length)];
      const N = PLAYERS.length;
      const rank = new Map([...PLAYERS].sort((a, b) => sim(b, secret) - sim(a, secret)).map((p, i) => [p.name, i + 1]));
      const byName = new Map(PLAYERS.map((p) => [p.name, p]));
      const st = practice ? { g: [], hints: 0, done: false } : api.today(() => ({ g: [], hints: 0 }));
      const age = (p) => 2026 - p.born;
      const HINTS = [
        ['🌍', 'Континент', () => secret.cont],
        ['🏆', 'Лига', () => secret.lg],
        ['📍', 'Позиция', () => LINE_NAME[LINE[secret.pos]] || secret.pos],
        ['🏳️', 'Сборная', () => `${secret.flag} ${secret.nat}`],
        ['🏟', 'Клуб', () => secret.club],
      ];
      const b = api.body;
      b.innerHTML = `<div class="cx-card"><div class="cx-temp"><b>?</b><small>Назови любого футболиста</small></div><div class="cx-scale"><i></i><em></em></div></div>
        <div class="cx-hints"></div>
        <div class="ng-in"></div>
        <div class="ng-row"><button class="btn ghost" data-a="hint">💡 Подсказка</button><button class="btn ghost" data-a="give">Сдаться</button></div>
        <div class="cx-list"></div>`;
      const inp = NG.input($('.ng-in', b), { items: (q) => NG.playerItems(q, new Set(st.g)), onPick: guess });

      // что у догадки совпало с загаданным
      function badges(p) {
        const out = [];
        if (p.club === secret.club) out.push(['ok', `🏟 ${p.club}`]);
        if (p.nat === secret.nat) out.push(['ok', `${p.flag} сборная`]); else if (p.cont === secret.cont) out.push(['near', '🌍 континент']);
        if (p.lg === secret.lg) out.push(['ok', `🏆 лига`]);
        if (p.pos === secret.pos) out.push(['ok', '📍 позиция']); else if (LINE[p.pos] === LINE[secret.pos]) out.push(['near', '📍 линия']);
        const d = age(p) - age(secret);
        if (Math.abs(d) <= 1) out.push(['ok', '🎂 возраст']); else if (Math.abs(d) <= 4) out.push(['near', `🎂 ${d > 0 ? 'младше' : 'старше'}`]);
        else out.push(['no', `🎂 ${d > 0 ? 'сильно младше' : 'сильно старше'}`]);
        return out;
      }

      let shownTemp = null;
      function render(fresh) {
        api.sub(`${practice ? 'Тренировка · ' : `#${Day.num()} · `}догадок: ${st.g.length}`);
        const last = st.g[st.g.length - 1];
        const best = st.g.length ? Math.min(...st.g.map((n) => rank.get(n))) : N;
        const tl = last ? temp(rank.get(last), N) : null, tb = temp(best, N);
        // градусник: текущая догадка крупно, лучшая — отметкой на шкале
        const card = $('.cx-card', b);
        card.className = `cx-card ${tl == null ? '' : heat(tl)}`;
        const tEl = $('.cx-temp b', card);
        if (tl == null) tEl.textContent = '?';
        else if (fresh && !matchMedia('(prefers-reduced-motion: reduce)').matches) countUp(tEl, tl, { from: shownTemp == null ? 0 : shownTemp, dur: 600, fmt: (v) => deg(Math.round(v)) });
        else tEl.textContent = deg(tl);
        shownTemp = tl;
        $('.cx-temp small', card).textContent = last ? `${last} — ${WORD[heat(tl)]}` : 'Назови любого футболиста';
        const pct = (t) => ((t + 30) / 130) * 100;
        $('.cx-scale i', card).style.width = `${tl == null ? 0 : pct(tl)}%`;
        const mark = $('.cx-scale em', card);
        mark.style.left = `${pct(tb)}%`; mark.hidden = !st.g.length; mark.title = `Лучшая: ${deg(tb)}`;
        if (fresh) bump(card, 'cx-pulse');
        // подсказки: открытые и закрытые
        $('.cx-hints', b).innerHTML = HINTS.map(([ico, name, val], i) => (i < st.hints || st.done
          ? `<span class="on" style="--i:${i}">${ico} <b>${esc(val())}</b></span>` : `<span>${ico} ${name}</span>`)).join('');
        $('[data-a="hint"]', b).textContent = st.hints < HINTS.length ? `💡 Подсказка ${st.hints + 1}/${HINTS.length}` : '💡 Подсказок больше нет';
        $('[data-a="hint"]', b).disabled = st.done || st.hints >= HINTS.length;
        // список: последняя догадка сверху, дальше по теплоте
        const sorted = [...st.g].sort((x, y) => rank.get(x) - rank.get(y)).filter((n) => n !== last);
        $('.cx-list', b).innerHTML = (last ? [last, ...sorted] : []).map((n) => {
          const t = temp(rank.get(n), N), p = byName.get(n);
          return `<div class="cx-row ${heat(t)} ${n === last && fresh ? 'last' : ''}"><i style="width:${Math.max(4, pct(t))}%"></i>
            ${avatar(n, 's')}<div class="cx-who"><b>${esc(n)}</b><div class="cx-tags">${badges(p).map(([c, x]) => `<em class="${c}">${esc(x)}</em>`).join('')}</div></div><span class="cx-deg">${deg(t)}</span></div>`;
        }).join('');
        Photos.hydrate(b);
        inp.disable(!!st.done);
      }
      function guess(name) {
        if (st.done || st.g.includes(name)) return;
        st.g.push(name);
        const t = temp(rank.get(name), N);
        Sound.play(t >= 60 ? 'kick' : 'tap'); haptic(t >= 60 ? 'ok' : 'tap');
        if (t >= 100) { render(true); return finish(true); }
        api.save(); render(true);
      }
      function hint() {
        if (st.done || st.hints >= HINTS.length) return;
        st.hints++; api.save(); Sound.play('tap'); render(false);
      }
      function finish(won) {
        st.done = true; st.won = won; api.save(); render(false);
        if (!practice) { if (won) api.streakWin(); else api.streakLose(); }
        if (won) Profile.bump('context', 12);
        const n = st.g.length;
        NG.end({
          title: won ? 'Нашёл!' : 'Сдался', win: won, big: won ? `${n}` : '', stats: won ? [['Догадок', n], ['Подсказок', st.hints]] : [],
          reward: won ? Math.max(10, (practice ? 25 : 70) - n * 3 - st.hints * 8) : 0, daily: !practice,
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
      render(false);
      if (st.done && !practice) later(() => Modal.open(`<h2>Сегодня: ${st.won ? `за ${st.g.length}` : 'сдался'}</h2><p>Это был ${esc(secret.name)}. Новый игрок через ${NG.untilTomorrow()}.</p>`,
        [{ label: 'Тренировка', onClick: () => NG.open('context', { practice: true }) }, { label: 'В меню', cls: 'ghost', onClick: () => App.home() }]), 300);
    },
  });
})();
