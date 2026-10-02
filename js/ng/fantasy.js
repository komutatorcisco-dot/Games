// «Фэнтези-пятёрка»: собери пятёрку АПЛ в бюджет (на всех звёзд не хватит) — вратарь, два защитника, полузащитник, нападающий.
// Очки — настоящие очки Fantasy Premier League за первые 7 туров сезона 2026/27. Обыграй бота.
'use strict';

(() => {
  const SLOTS = ['ВРТ', 'ЗАЩ', 'ЗАЩ', 'ПЗ', 'НАП'];
  const NAMES = { ВРТ: 'Вратарь', ЗАЩ: 'Защитник', ПЗ: 'Полузащитник', НАП: 'Нападающий' };
  const f1 = (x) => x.toFixed(1);

  NG.register({
    id: 'fantasy', group: 'hist', title: 'Фэнтези-пятёрка', c1: '#00ff85', c2: '#38003c', tag: 'Очки FPL 2026/27',
    meta: (s) => (s.wins ? `Побед над ботом: ${s.wins}` : 'Очки FPL после 7 туров'),
    start(api) {
      const b = api.body;
      // для каждого слота — 4 кандидата разной цены
      // по позиции: звезда из дорогой трети, середняк и двое из дешёвых — как в настоящем FPL
      const usedNames = new Set();
      const market = SLOTS.map((pos) => {
        const all = FPL.filter((p) => p[2] === pos && !usedNames.has(p[0])).sort((x, y) => y[3] - x[3]);
        const t = Math.ceil(all.length / 3);
        const ps = [pick(all.slice(0, t)), pick(all.slice(t, 2 * t)), ...shuffle(all.slice(2 * t), Math.random).slice(0, 2)].filter(Boolean)
          .filter((p, i, a) => a.indexOf(p) === i).sort((x, y) => y[3] - x[3]);
        ps.forEach((p) => usedNames.add(p[0]));
        return ps;
      });
      // бюджет посередине между самой дешёвой и самой дорогой пятёркой — на всех звёзд не хватит
      const lo = market.reduce((a, ps) => a + ps[ps.length - 1][3], 0), hi = market.reduce((a, ps) => a + ps[0][3], 0);
      const BUDGET = Math.round(((lo + hi) / 2) * 2) / 2;
      const pickIdx = SLOTS.map(() => -1);
      let shown = false;
      const spent = () => pickIdx.reduce((a, k, i) => a + (k >= 0 ? market[i][k][3] : 0), 0);
      const best = () => {
        // лучшая пятёрка рынка в бюджет — перебор 4^5
        let top = null;
        const rec = (i, cost, pts, sel) => {
          if (cost > BUDGET + 1e-9) return;
          if (i === SLOTS.length) { if (!top || pts > top.pts) top = { pts, sel: [...sel] }; return; }
          market[i].forEach((p, k) => { sel.push(k); rec(i + 1, cost + p[3], pts + p[4], sel); sel.pop(); });
        };
        rec(0, 0, 0, []);
        return top;
      };
      // бот: случайная пятёрка в бюджет
      const bot = (() => {
        for (let t = 0; t < 500; t++) {
          const sel = SLOTS.map((_, i) => Math.floor(Math.random() * market[i].length));
          if (sel.reduce((a, k, i) => a + market[i][k][3], 0) <= BUDGET) return sel;
        }
        return SLOTS.map((_, i) => market[i].length - 1);
      })();
      const pts = (sel) => sel.reduce((a, k, i) => a + (k >= 0 ? market[i][k][4] : 0), 0);

      function render() {
        const left = BUDGET - spent(), full = pickIdx.every((k) => k >= 0);
        api.sub(`Бюджет: осталось ${f1(left)} млн £`);
        b.innerHTML = `<div class="fp-budget ${left < 0 ? 'over' : ''}"><i style="width:${Math.min(100, (spent() / BUDGET) * 100)}%"></i><span>${f1(spent())} / ${BUDGET} млн £</span></div>
          ${SLOTS.map((pos, i) => `<div class="fp-slot"><small>${NAMES[pos]}</small><div class="fp-row">${market[i].map((p, k) => {
            const on = pickIdx[i] === k, botOn = shown && bot[i] === k;
            return `<button class="fp-card ${on ? 'on' : ''} ${botOn ? 'bot' : ''}" data-i="${i}" data-k="${k}" ${shown ? 'disabled' : ''}>${avatar(p[0], 's')}<b>${esc(surname(p[0]))}</b><em>${f1(p[3])}</em>${shown ? `<span class="fp-pts">${p[4]}</span>` : ''}</button>`;
          }).join('')}</div></div>`).join('')}
          ${shown ? '' : `<div class="ng-row"><button class="btn gold" data-a="go" ${full && left >= -1e-9 ? '' : 'disabled'}>${left < 0 ? 'Перебор бюджета' : full ? 'Сыграть против бота' : 'Выбери пятерых'}</button></div>`}`;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function go() {
        shown = true; render();
        const me = pts(pickIdx), bt = pts(bot), top = best();
        const won = me > bt, s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; Profile.bump('fantasy', 10); }
        s.best = Math.max(s.best || 0, me); api.save();
        const line = (sel) => sel.map((k, i) => `${esc(surname(market[i][k][0]))} ${market[i][k][4]}`).join(' · ');
        NG.end({ title: won ? 'Ты собрал команду лучше!' : me === bt ? 'Ничья' : 'Бот угадал лучше', big: `${me}:${bt}`, win: won,
          stats: [['Твоя', `${me} очк.`], ['Бот', `${bt} очк.`], ['Максимум', `${top.pts} очк.`]],
          html: `<p class="fp-line"><b>Твоя:</b> ${line(pickIdx)}</p><p class="fp-line"><b>Бот:</b> ${line(bot)}</p><p class="fp-line"><b>Идеал:</b> ${line(top.sel)}</p>`,
          reward: won ? 20 + Math.round(me / 4) : 5, again: { label: 'Новый рынок', fn: () => NG.open('fantasy') } });
      }
      b.addEventListener('click', (e) => {
        const c = e.target.closest('.fp-card');
        if (c && !shown) { const i = +c.dataset.i, k = +c.dataset.k; pickIdx[i] = pickIdx[i] === k ? -1 : k; Sound.play('tap'); render(); return; }
        if (e.target.closest('[data-a="go"]')) go();
      });
      render();
    },
  });
})();
