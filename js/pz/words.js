// «Филворд»: найди в сетке букв фамилии игроков одного клуба. Веди пальцем от первой буквы до последней.
'use strict';

(() => {
  const ABC = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
  const clean = (s) => s.toUpperCase().replace(/Ё/g, 'Е').replace(/Й/g, 'И');
  const surname = (name) => clean(name.replace(/\(.*\)/, '').trim().split(' ').slice(-1)[0]);

  // Темы: клубы, где хватает подходящих фамилий, плюс легенды из карьер.
  const THEMES = (() => {
    const by = {};
    PLAYERS.forEach((p) => {
      const s = surname(p.name);
      if (!/^[А-Я]{3,9}$/.test(s)) return;
      (by[p.club] = by[p.club] || new Set()).add(s);
    });
    const list = Object.entries(by).filter(([, s]) => s.size >= 5).map(([club, s]) => ({ title: club, club, words: [...s] }));
    const legends = new Set(CAREERS.filter((c) => !PLAYERS.some((p) => p.name === c.name)).map((c) => surname(c.name)).filter((s) => /^[А-Я]{3,9}$/.test(s)));
    list.push({ title: 'Легенды', club: null, words: [...legends] });
    return list;
  })();

  PZ.register({
    id: 'words', title: 'Филворд', icon: 'Ф', c1: '#c65bd8', c2: '#7b2b8a',
    start(level, api) {
      const rng = api.rng(6);
      const theme = THEMES[(level - 1) % THEMES.length];
      const n = level <= 4 ? 8 : level <= 12 ? 9 : 10;
      const count = Math.min(4 + Math.floor(level / 4), 7);
      const dirs = level <= 3 ? [[1, 0], [0, 1]] : level <= 10 ? [[1, 0], [0, 1], [1, 1]] : [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [1, -1]];
      const grid = new Array(n * n).fill('');
      const placed = [];
      shuffle(theme.words.filter((w) => w.length <= n), rng).forEach((word) => {
        if (placed.length >= count) return;
        for (let t = 0; t < 120; t++) {
          const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
          const x0 = Math.floor(rng() * n), y0 = Math.floor(rng() * n);
          const x1 = x0 + dx * (word.length - 1), y1 = y0 + dy * (word.length - 1);
          if (x1 < 0 || y1 < 0 || x1 >= n || y1 >= n) continue;
          let ok = true;
          for (let k = 0; k < word.length; k++) {
            const c = grid[(y0 + dy * k) * n + x0 + dx * k];
            if (c && c !== word[k]) { ok = false; break; }
          }
          if (!ok) continue;
          const cells = [];
          for (let k = 0; k < word.length; k++) { const i = (y0 + dy * k) * n + x0 + dx * k; grid[i] = word[k]; cells.push(i); }
          placed.push({ word, cells, found: false });
          return;
        }
      });
      for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ABC[Math.floor(rng() * ABC.length)];

      const area = api.area();
      let hue = 0;
      area.innerHTML = `<div class="ws-theme">${theme.club ? crestImg(theme.club, 's') : ''}<b>${esc(theme.title)}</b></div>
        <div class="ws" style="--n:${n}">${grid.map((c, i) => `<span class="ws-c" data-i="${i}">${c}</span>`).join('')}</div>
        <div class="ws-words">${placed.map((p, k) => `<span class="ws-w" data-k="${k}">${p.word}</span>`).join('')}</div>`;
      const cellsEl = $$('.ws-c', area);
      const hud = () => api.hud(`<span class="pz-chip">Найдено: <b>${placed.filter((p) => p.found).length}/${placed.length}</b></span>`);
      hud();

      // выделение пальцем по прямой
      let startI = -1, line = [];
      const board = $('.ws', area);
      const cellAt = (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        return el && el.classList.contains('ws-c') ? +el.dataset.i : -1;
      };
      function lineTo(a, b) {
        const ax = a % n, ay = Math.floor(a / n), bx = b % n, by = Math.floor(b / n);
        const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
        const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        if (!(ax === bx || ay === by || Math.abs(bx - ax) === Math.abs(by - ay))) return [a];
        return Array.from({ length: len + 1 }, (_, k) => (ay + dy * k) * n + ax + dx * k);
      }
      const paintSel = () => cellsEl.forEach((c, i) => c.classList.toggle('sel', line.includes(i)));
      board.addEventListener('pointerdown', (e) => { startI = cellAt(e); line = startI >= 0 ? [startI] : []; paintSel(); board.setPointerCapture && board.setPointerCapture(e.pointerId); });
      board.addEventListener('pointermove', (e) => { if (startI < 0) return; const i = cellAt(e); if (i >= 0) { line = lineTo(startI, i); paintSel(); } });
      const finish = () => {
        if (startI < 0) return;
        const word = line.map((i) => grid[i]).join('');
        const hit = placed.find((p) => !p.found && (p.word === word || p.word === [...word].reverse().join('')) && p.cells.length === line.length);
        if (hit) {
          hit.found = true;
          hue = (hue + 1) % KIT.length;
          line.forEach((i) => { cellsEl[i].classList.add('found'); cellsEl[i].style.setProperty('--fc', KIT[hue === 2 ? 3 : hue]); });
          $(`.ws-w[data-k="${placed.indexOf(hit)}"]`, area).classList.add('done');
          Sound.play('coin'); haptic('ok');
          hud();
          if (placed.every((p) => p.found)) api.win(3, `Все игроки: ${esc(theme.title)}`);
        } else if (line.length > 1) { Sound.play('bad'); }
        startI = -1; line = []; paintSel();
      };
      board.addEventListener('pointerup', finish);
      board.addEventListener('pointercancel', finish);
    },
  });
})();
