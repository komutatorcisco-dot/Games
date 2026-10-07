// «Связка» (как Link Up): соедини двух футболистов цепочкой одноклубников.
// Каждый следующий игрок должен был играть в одной команде с предыдущим. Чем короче цепочка — тем больше очков.
'use strict';

(() => {
  const LIVES = 3, MAXLINKS = 4;
  function build(rnd) {
    const famous = new Set(PLAYERS.filter((p) => p.tier <= 2).map((p) => p.name));
    const names = NG.careerNames().filter((n) => famous.has(n) || Mates.of(n).size >= 25);
    for (let t = 0; t < 300; t++) {
      const a = names[Math.floor(rnd() * names.length)], z = names[Math.floor(rnd() * names.length)];
      if (a === z || Mates.of(a).has(z)) continue;
      const p = Mates.path(a, z, 3);
      if (p && p.length >= 3) return { a, z, best: p };
    }
    return null;
  }

  NG.register({
    id: 'linkup', group: 'brain', title: 'Связка', c1: '#2fd3e0', c2: '#1a7f9a', tag: 'Цепочка одноклубников',
    meta: (s) => (s.wins ? `Связок: ${s.wins}` : 'Соедини двоих'),
    start(api) {
      const g = build(Math.random);
      if (!g) { toast('Не получилось, попробуй ещё'); return; }
      let chain = [g.a], lives = LIVES, over = false;
      const b = api.body;
      b.innerHTML = `<p class="ng-lead">Соедини <b>${esc(g.a)}</b> и <b>${esc(g.z)}</b>: назови игрока, который играл с последним в цепочке. Когда дойдёшь до одноклубника ${esc(surname(g.z))} — связка готова.</p>
        <div class="lu-chain"></div><div class="ng-in"></div><div class="ng-row"><button class="btn ghost" data-a="undo">↶ Убрать</button><button class="btn ghost" data-a="hint">💡 Подсказка</button><button class="btn ghost" data-a="give">Ответ</button></div>`;
      let hinted = false;
      const inp = NG.input($('.ng-in', b), { items: (q) => NG.careerItems(q, new Set(chain)), onPick: add });
      function link(x, y) { const k = Mates.of(x).get(y); return k ? `<span class="lu-link">${crestImg(k, 'xs')}${esc(k)}</span>` : '<span class="lu-link">…</span>'; }
      function render() {
        api.sub(`Звеньев: ${chain.length - 1}/${MAXLINKS} · лучшая связка: ${g.best.length - 1} · ${'♥'.repeat(lives)}${'♡'.repeat(LIVES - lives)}`);
        const all = over && chain[chain.length - 1] === g.z ? chain : chain;
        let html = '';
        all.forEach((n, i) => { if (i) html += link(all[i - 1], n); html += `<div class="lu-node ${i === 0 ? 'start' : ''}">${avatar(n, 's')}<b>${esc(n)}</b></div>`; });
        if (chain[chain.length - 1] !== g.z) html += '<span class="lu-link gap">⋯</span>' + `<div class="lu-node end">${avatar(g.z, 's')}<b>${esc(g.z)}</b></div>`;
        $('.lu-chain', b).innerHTML = html;
        if (typeof Photos !== 'undefined' && Photos.hydrate) Photos.hydrate(b);
      }
      function add(name) {
        if (over) return;
        const last = chain[chain.length - 1];
        if (!Mates.of(last).has(name)) {
          lives--; Sound.play('bad'); haptic('bad'); toast(`${name} не играл вместе с ${surname(last)} (по нашей базе карьер)`);
          if (lives <= 0) return finish(false);
          return render();
        }
        chain.push(name); Sound.play('kick');
        if (name === g.z || Mates.of(name).has(g.z)) { if (name !== g.z) chain.push(g.z); return finish(true); }
        if (chain.length - 1 >= MAXLINKS) return finish(false);
        render();
      }
      function finish(won) {
        over = true; inp.disable(true); render();
        const links = chain.length - 1, s = api.st();
        if (won) { s.wins = (s.wins || 0) + 1; api.save(); Profile.bump('linkup', 12); }
        NG.end({ title: won ? 'Связка готова!' : 'Связка не сложилась', win: won, big: won ? `${links} ${plural(links, 'звено', 'звена', 'звеньев')}` : '', stats: [['Лучшая', g.best.length - 1], ['Подсказка', hinted ? 'да' : 'нет']],
          reward: won ? Math.max(10, 40 - (links - (g.best.length - 1)) * 10 - (hinted ? 15 : 0)) : 0,
          html: `<p>Кратчайшая: ${g.best.map(esc).join(' → ')}</p>`, again: { label: 'Новая связка', fn: () => NG.open('linkup') } });
      }
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a || over) return;
        if (a.dataset.a === 'give') return finish(false);
        if (a.dataset.a === 'hint') {
          if (hinted) return toast('Подсказка уже была');
          const p = Mates.path(chain[chain.length - 1], g.z, 4);
          if (!p || p.length < 3) return toast('Отсюда не дотянуться, убери последнего');
          hinted = true; toast(`Попробуй: ${p[1]} (${Mates.of(chain[chain.length - 1]).get(p[1])})`); return;
        }
        if (chain.length > 1) { chain.pop(); render(); }
      });
      render();
    },
  });
})();
