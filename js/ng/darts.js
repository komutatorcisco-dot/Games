// «Дартс 170»: сбей 170 очков до нуля за 9 дротиков. Каждый бросок — назови игрока под категорию,
// из счёта вычитается его номер на футболке (номер виден в подсказке — игра про то, как ровно «закрыть» счёт).
// Ушёл в минус — «перебор», бросок сгорает. Финиш ровно в ноль. Дротики остаются в мишени.
'use strict';

(() => {
  const START = 170, DARTS = 9;
  const LINE = { ГК: 'Вратарь', ЦЗ: 'Защитник', ЛЗ: 'Защитник', ПЗ: 'Защитник', ЦОП: 'Полузащитник', ЦП: 'Полузащитник', ЦАП: 'Полузащитник', ЛВ: 'Нападающий', ПВ: 'Нападающий', ФРВ: 'Нападающий' };
  function cats() {
    const out = [];
    // только категории, где хватает известных игроков с номерами (чтобы было кого вспомнить)
    const add = (label, test) => { const ps = PLAYERS.filter((p) => p.num > 0 && test(p)); if (ps.filter((p) => p.tier <= 2).length >= 6) out.push({ label, test, ps }); };
    [...new Set(PLAYERS.map((p) => p.lg))].forEach((l) => add(`Лига: ${l}`, (p) => p.lg === l));
    [...new Set(PLAYERS.map((p) => p.nat))].forEach((n) => add(`Сборная: ${n}`, (p) => p.nat === n));
    ['Вратарь', 'Защитник', 'Полузащитник', 'Нападающий'].forEach((l) => add(l, (p) => LINE[p.pos] === l));
    return out;
  }

  NG.register({
    id: 'darts', group: 'cards', title: 'Дартс 170', c1: '#2fb35a', c2: '#e2384d', tag: 'Закрой счёт номерами',
    meta: (s) => (s.best ? `Лучший финиш: ${s.best} дрот.` : 'Сбей 170 до нуля'),
    start(api) {
      const C = cats();
      let score = START, prev = START, darts = 0, cat = null, log = [], over = false, used = new Set(), hit = 0;
      const stuck = []; // куда воткнулись дротики: [угол, радиус, номер, попал?]
      // мишень: сектора как у настоящей доски, кольца удвоения и утроения
      const SEG = 20, R = 100;
      const arc = (r0, r1, a0, a1, fill) => {
        const p = (r, a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
        return `<path d="M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z" fill="${fill}"/>`;
      };
      const board = (() => {
        let out = '';
        for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * Math.PI * 2 - Math.PI / 2 - Math.PI / SEG, a1 = a0 + (Math.PI * 2) / SEG, odd = i % 2;
          out += arc(10, 58, a0, a1, odd ? '#f1e4c3' : '#1d1d24') + arc(58, 64, a0, a1, odd ? '#2e9a4c' : '#e2384d')
            + arc(64, 92, a0, a1, odd ? '#f1e4c3' : '#1d1d24') + arc(92, 98, a0, a1, odd ? '#2e9a4c' : '#e2384d');
        }
        return `<circle r="${R + 6}" fill="#111"/>${out}<circle r="10" fill="#2e9a4c"/><circle r="4.5" fill="#e2384d"/>`;
      })();
      const dartSvg = ([a, r, n, ok], k, fresh) => {
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        return `<g class="dt-dart ${fresh ? 'fresh' : ''} ${ok ? '' : 'bad'}" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <line x1="0" y1="0" x2="14" y2="18" stroke="#c9c9d6" stroke-width="2.4" stroke-linecap="round"/><path d="M14 18 l9 3 -3 -9z" fill="${ok ? '#ffcf3a' : '#ff6b6b'}"/>
          <circle r="2.2" fill="#fff"/>${ok ? `<text x="-4" y="-6" class="dt-n">${n}</text>` : ''}</g>`;
      };
      const b = api.body;
      function newCat() {
        // категория, в которой есть хотя бы один игрок с номером не больше остатка
        const ok = C.filter((c) => c.ps.some((p) => p.num <= score && !used.has(p.name)));
        cat = pick(ok.length ? ok : C);
      }
      const byName = new Map(PLAYERS.map((p) => [p.name, p]));
      let noNum = new Set(PLAYERS.filter((p) => !p.num).map((p) => p.name)), fresh = false;
      const throwAt = (n, ok) => {
        // попадание — в сектор поближе к центру при большом номере, промах — у края доски
        const a = Math.random() * Math.PI * 2, r = ok ? 18 + Math.random() * 70 : 98 + Math.random() * 6;
        stuck.push([a, r, n, ok]); fresh = true;
      };
      function render() {
        api.sub(`Дротик ${Math.min(darts + 1, DARTS)}/${DARTS}`);
        b.innerHTML = `<div class="dt-wrap ${hit ? 'hit' : ''}"><svg class="dt-svg" viewBox="-110 -110 220 220">${board}${stuck.map((d, k) => dartSvg(d, k, k === stuck.length - 1 && fresh)).join('')}</svg>
            <div class="dt-score"><b>${prev}</b><span>осталось</span></div>${hit ? `<em class="dt-pop">−${hit}</em>` : ''}</div>
          <div class="dt-darts">${[...Array(DARTS).keys()].map((i) => `<i class="${i < darts ? 'used' : ''}">➶</i>`).join('')}</div>
          <h3 class="ng-q">${esc(cat.label)}</h3><p class="ng-lead">Назови игрока — вычтем его номер. Финиш ровно в 0.</p>
          <div class="ng-in"></div><div class="dt-log">${log.map((l) => `<span class="${l.c}">${l.t}</span>`).join('')}</div>
          <div class="ng-row"><button class="btn ghost" data-a="skip">Сменить категорию (−1 дротик)</button></div>`;
        // в подсказке виден номер: игра в том, чтобы подобрать игроков и закрыть счёт ровно в ноль
        NG.input($('.ng-in', b), { items: (q) => NG.playerItems(q, noNum).map((it) => {
          const p = byName.get(it.key);
          return { ...it, label: `${it.label} · №${p.num}`, sub: `${it.sub}${p.num > score ? ' · перебор' : ''}` };
        }), onPick: throwDart }).focus();
        if (prev !== score) countUp($('.dt-score b', b), score, { from: prev, dur: 600 });
        prev = score; hit = 0; fresh = false;
      }
      function throwDart(name) {
        if (over) return;
        const p = PLAYERS.find((x) => x.name === name);
        darts++;
        if (!cat.test(p)) { log.unshift({ c: 'miss', t: `✖ ${surname(name)} — не подходит` }); Sound.play('bad'); haptic('bad'); throwAt(0, false); }
        else if (p.num > score) { log.unshift({ c: 'bust', t: `💥 ${surname(name)} №${p.num} — перебор` }); Sound.play('bad'); haptic('bad'); used.add(name); throwAt(p.num, false); }
        else { score -= p.num; hit = p.num; used.add(name); log.unshift({ c: 'hit', t: `🎯 ${surname(name)} −${p.num}` }); Sound.play('kick'); haptic('ok'); throwAt(p.num, true); }
        noNum = new Set([...noNum, ...used]);
        if (score === 0) { newCat(); render(); return later(() => finish(true), 700); }
        if (darts >= DARTS) return finish(false);
        newCat(); render();
      }
      function finish(won) {
        over = true;
        const s = api.st();
        if (won) { s.best = s.best ? Math.min(s.best, darts) : darts; api.save(); Profile.bump('darts', 15); }
        NG.end({ title: won ? 'Чек-аут!' : `Не добил: осталось ${score}`, big: won ? `${darts} ${plural(darts, 'дротик', 'дротика', 'дротиков')}` : `${score}`, stats: [['Лучший', s.best ? `${s.best} дрот.` : '—']], win: won,
          reward: won ? 15 + (DARTS - darts) * 4 : Math.max(0, Math.round((START - score) / 20)),
          html: `<div class="dt-log">${log.map((l) => `<span class="${l.c}">${l.t}</span>`).join('')}</div>`, again: { label: 'Ещё лег', fn: () => NG.open('darts') } });
      }
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="skip"]') && !over) {
          darts++; log.unshift({ c: 'miss', t: '↻ смена категории' });
          if (darts >= DARTS) return finish(false);
          newCat(); render();
        }
      });
      newCat(); render();
    },
  });
})();
