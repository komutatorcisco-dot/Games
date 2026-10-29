// Файл: js/clubpath.js (модуль ClubPath). Не путать с js/career.js — это игра «Угадай по карьере».
// «Карьера» (29.10): путь клуба от двора до легенд, главы как в FC Mobile. В главе — задания в разных режимах
// (футбол, драфт, «Мой состав», викторины, паки, ИПК, сила состава). Задание даёт жетоны главы, за жетоны —
// награды-ступени, за финальное задание — главная награда и следующая глава. Всё считается по уже существующим
// событиям игры (Rewards.onEnd, открытие паков, ИПК), отдельной системы наград нет: монеты и паки — Rewards.giveReward.
'use strict';

const ClubPath = (() => {
  // задание: ev — событие ('win', 'end', 'win:<игра>', 'end:<игра>', 'pack', 'sbc'), либо ovr — сила состава
  // go — куда ведёт «Играть»: { fb: режим футбола } | { act } | { ng } | { tab } (вкладка нового меню)
  const CH = [
    { id: 1, t: 'Дворовая команда', d: 'Первый состав, первые матчи. Покажи, что ты тренер.', col: '#7fe0a0',
      tasks: [
        { t: 'Сыграй матч в футболе', ev: 'end:football:match', n: 1, tok: 20, ic: 'play', go: { fb: 'match' } },
        { t: 'Выиграй «Моменты»', ev: 'win:football:moments', n: 1, tok: 20, ic: 'bolt', go: { fb: 'moments' } },
        { t: 'Угадай «Игрока дня»', ev: 'win:act:dly', n: 1, tok: 15, ic: 'daily', go: { act: 'dly' } },
        { t: 'Открой пак', ev: 'pack', n: 1, tok: 15, ic: 'store', go: { tab: 'store' } },
        { t: 'Собери состав с ОБЩ 65+', ovr: 65, tok: 20, ic: 'team', go: { tab: 'team' } },
        { t: 'Выиграй 2 любые игры', ev: 'win', n: 2, tok: 20, ic: 'star', go: { tab: 'modes' } },
        { t: 'Финал: выиграй матч «Моим составом»', ev: 'win:squad', n: 1, tok: 40, ic: 'cup', go: { act: 'squad-match' }, boss: true },
      ],
      steps: [[40, { coins: 200 }], [80, { pack: 0 }], [150, { pack: 1 }]], prize: { pack: 1, coins: 300, name: 'Сверхредкий пак и 3 000 монет' } },
    { id: 2, t: 'Первые победы', d: 'Соревнования, усиление состава и новые карточки.', col: '#56d4ff',
      tasks: [
        { t: 'Отгадай слово в Wordle', ev: 'win:ng:wordle', n: 1, tok: 20, ic: 'puzzle', go: { ng: 'wordle' } },
        { t: 'Выиграй аукцион', ev: 'win:act:auction-bot', n: 1, tok: 25, ic: 'target', go: { act: 'auction-bot' } },
        { t: 'Сдай карточки в ИПК', ev: 'sbc', n: 1, tok: 25, ic: 'cards', go: { act: 'sbc' } },
        { t: 'Сыграй матч в «Драфте»', ev: 'end:act:xdraft', n: 1, tok: 20, ic: 'team', go: { act: 'xdraft' } },
        { t: 'Собери состав с ОБЩ 72+', ovr: 72, tok: 25, ic: 'team', go: { tab: 'team' } },
        { t: 'Выиграй матч в футболе', ev: 'win:football:match', n: 1, tok: 25, ic: 'play', go: { fb: 'match' } },
        { t: 'Финал: выиграй матч в «Драфте»', ev: 'win:act:xdraft', n: 1, tok: 50, ic: 'cup', go: { act: 'xdraft' }, boss: true },
      ],
      steps: [[50, { coins: 300 }], [110, { pack: 1 }], [190, { pack: 2 }]], prize: { pack: 2, coins: 500, name: 'Эпический пак и 5 000 монет' } },
    { id: 3, t: 'Новый уровень', d: 'Сложнее соперники, ограниченные испытания.', col: '#b98bff',
      tasks: [
        { t: 'Угадай сборную', ev: 'win:act:nation', n: 2, tok: 25, ic: 'target', go: { act: 'nation' } },
        { t: 'Выиграй в «Козыри»', ev: 'win:ng:trumps', n: 1, tok: 25, ic: 'cards', go: { ng: 'trumps' } },
        { t: 'Пройди 2 испытания ИПК', ev: 'sbc', n: 2, tok: 30, ic: 'cards', go: { act: 'sbc' } },
        { t: 'Открой 5 паков', ev: 'pack', n: 5, tok: 25, ic: 'store', go: { tab: 'store' } },
        { t: 'Собери состав с ОБЩ 78+', ovr: 78, tok: 30, ic: 'team', go: { tab: 'team' } },
        { t: 'Выиграй 3 матча в футболе', ev: 'win:football:match', n: 3, tok: 35, ic: 'play', go: { fb: 'match' } },
        { t: 'Финал: 2 победы в «Драфте»', ev: 'win:act:xdraft', n: 2, tok: 60, ic: 'cup', go: { act: 'xdraft' }, boss: true },
      ],
      steps: [[60, { coins: 400 }], [130, { pack: 2 }], [230, { pack: 2 }]], prize: { pack: 3, name: 'Легендарный пак' } },
    { id: 4, t: 'Против сильнейших', d: 'Редкие соперники и турнирные задачи.', col: '#ffd23c',
      tasks: [
        { t: 'Обыграй бота в «Этого или того»', ev: 'win:act:pick-bot', n: 2, tok: 25, ic: 'target', go: { act: 'pick-bot' } },
        { t: 'Угадай игрока по карьере', ev: 'win:act:guess-career', n: 2, tok: 25, ic: 'daily', go: { act: 'guess-career' } },
        { t: 'Выиграй «Моменты» 3 раза', ev: 'win:football:moments', n: 3, tok: 30, ic: 'bolt', go: { fb: 'moments' } },
        { t: 'Пройди 3 испытания ИПК', ev: 'sbc', n: 3, tok: 35, ic: 'cards', go: { act: 'sbc' } },
        { t: 'Собери состав с ОБЩ 82+', ovr: 82, tok: 35, ic: 'team', go: { tab: 'team' } },
        { t: 'Выиграй 15 игр', ev: 'win', n: 15, tok: 35, ic: 'star', go: { tab: 'modes' } },
        { t: 'Финал: 3 победы «Моим составом»', ev: 'win:squad', n: 3, tok: 70, ic: 'cup', go: { act: 'squad-match' }, boss: true },
      ],
      steps: [[70, { coins: 500 }], [150, { pack: 2 }], [255, { pack: 3 }]], prize: { pack: 3, coins: 800, name: 'Легендарный пак и 8 000 монет' } },
    { id: 5, t: 'Путь к легендам', d: 'Особые испытания и особая карточка.', col: '#ff4f66',
      tasks: [
        { t: 'Выиграй 5 матчей в футболе', ev: 'win:football:match', n: 5, tok: 35, ic: 'play', go: { fb: 'match' } },
        { t: 'Выиграй 5 матчей в «Драфте»', ev: 'win:act:xdraft', n: 5, tok: 40, ic: 'team', go: { act: 'xdraft' } },
        { t: 'Открой 10 паков', ev: 'pack', n: 10, tok: 30, ic: 'store', go: { tab: 'store' } },
        { t: 'Пройди 5 испытаний ИПК', ev: 'sbc', n: 5, tok: 40, ic: 'cards', go: { act: 'sbc' } },
        { t: 'Собери состав с ОБЩ 85+', ovr: 85, tok: 40, ic: 'team', go: { tab: 'team' } },
        { t: 'Выиграй 30 игр', ev: 'win', n: 30, tok: 40, ic: 'star', go: { tab: 'modes' } },
        { t: 'Финал: 5 побед «Моим составом»', ev: 'win:squad', n: 5, tok: 90, ic: 'cup', go: { act: 'squad-match' }, boss: true },
      ],
      steps: [[80, { pack: 2 }], [170, { pack: 3 }], [295, { pack: 4 }]], prize: { card: 'JG:nicolas-jackson', name: 'Особая карточка «Николас Джексон» 84' } },
  ];
  const S = () => { const d = Store.d; if (!d.car || typeof d.car !== 'object') d.car = { ch: 1, p: {}, tok: {}, st: {}, done: [] }; const c = d.car; ['p', 'tok', 'st'].forEach((k) => (c[k] = c[k] || {})); c.done = c.done || []; return c; };
  const key = (ch, i) => ch + ':' + i;
  const ovrNow = () => { try { return Squad.info().r || 0; } catch (e) { return 0; } };
  const prog = (ch, i) => { const t = CH[ch - 1].tasks[i]; return t.ovr ? Math.min(1, ovrNow() >= t.ovr ? 1 : 0) : Math.min(t.n, S().p[key(ch, i)] || 0); };
  const need = (t) => (t.ovr ? 1 : t.n);
  const isDone = (ch, i) => prog(ch, i) >= need(CH[ch - 1].tasks[i]);
  const open = (ch) => ch <= S().ch;
  const bossOpen = (ch) => CH[ch - 1].tasks.filter((t, i) => !t.boss && isDone(ch, i)).length >= 4; // финал — после 4 заданий главы
  // жетоны выдаются один раз за задание: при выполнении
  function settle(silent) {
    const s = S(); let gained = 0;
    CH.forEach((c) => { if (!open(c.id)) return; c.tasks.forEach((t, i) => {
      const k = key(c.id, i); if (s.tok[k] || !isDone(c.id, i) || (t.boss && !bossOpen(c.id))) return;
      s.tok[k] = t.tok; gained += t.tok;
      if (!silent) setTimeout(() => toast(`Карьера · глава ${c.id}: «${t.t}» — +${t.tok} жетонов`), 900);
    }); });
    if (gained) Store.save();
    return gained;
  }
  const tokens = (ch) => CH[ch - 1].tasks.reduce((s, t, i) => s + (S().tok[key(ch, i)] || 0), 0);
  // засчитать событие игры
  function bump(ev, game) {
    const s = S(); let hit = false;
    const evs = [ev, game ? `${ev}:${game}` : null].filter(Boolean);
    CH.forEach((c) => { if (!open(c.id)) return; c.tasks.forEach((t, i) => {
      if (t.ovr || !evs.includes(t.ev)) return; if (t.boss && !bossOpen(c.id)) return;
      const k = key(c.id, i); if ((s.p[k] || 0) >= t.n) return; s.p[k] = (s.p[k] || 0) + 1; hit = true; }); });
    if (hit) { Store.save(); settle(); }
  }
  function claimStep(ch, j) {
    const c = CH[ch - 1], s = S(), k = ch + ':' + j, [need2, r] = c.steps[j];
    if (s.st[k] || tokens(ch) < need2) return false;
    s.st[k] = 1; Store.save(); Rewards.giveReward(r, `КАРЬЕРА · ГЛАВА ${ch} · ${need2} ЖЕТОНОВ`); return true;
  }
  // глава пройдена: все задания выполнены → главная награда и следующая глава
  function claimChapter(ch) {
    const c = CH[ch - 1], s = S();
    if (s.done.includes(ch) || !c.tasks.every((t, i) => isDone(ch, i))) return false;
    s.done.push(ch); if (s.ch === ch && ch < CH.length) s.ch = ch + 1; Store.save();
    const p = c.prize;
    if (p.card) { if (typeof Rewards.giveCards === 'function' && Cards.get(p.card)) Rewards.giveCards([p.card]); }
    else { if (p.coins) Rewards.giveReward({ coins: p.coins }, `ГЛАВА ${ch} ПРОЙДЕНА`); if (p.pack !== undefined) setTimeout(() => Rewards.giveReward({ pack: p.pack }, `ГЛАВА ${ch} ПРОЙДЕНА`), p.coins ? 900 : 0); }
    return true;
  }
  const ready = () => { settle(true); let n = 0; CH.forEach((c) => { if (!open(c.id)) return; c.steps.forEach(([t], j) => { if (!S().st[c.id + ':' + j] && tokens(c.id) >= t) n++; }); if (!S().done.includes(c.id) && c.tasks.every((t, i) => isDone(c.id, i))) n++; }); return n; };

  // ---------- вид (новое меню, вкладка «События» → «Карьера») ----------
  let sel = 0;
  function view(ico, cup, lock) {
    settle(true);
    const s = S(); if (!sel) sel = Math.min(s.ch, CH.length);
    const c = CH[sel - 1], tk = tokens(sel), max = c.steps[c.steps.length - 1][0], all = c.tasks.every((t, i) => isDone(sel, i)), got = s.done.includes(sel);
    const chips = CH.map((x) => `<button class="cr-ch ${x.id === sel ? 'on' : ''} ${open(x.id) ? '' : 'lock'} ${s.done.includes(x.id) ? 'ok' : ''}" data-cr-ch="${x.id}" style="--cc:${x.col}"><small>Глава</small><b>${x.id}</b>${open(x.id) ? '' : lock}</button>`).join('');
    const steps = c.steps.map(([t, r], j) => { const st = s.st[sel + ':' + j] ? 'got' : tk >= t ? 'ready' : 'lock', l = Rewards.rewardLabel(r);
      const art = r.pack !== undefined ? `<img src="img/packs/pk${r.pack}-160.webp?v=b1" alt="">` : r.coins ? '<i class="coin big"></i>' : l.ico;
      return `<button class="cr-st ${st}" style="left:${(t / max) * 100}%" ${st === 'ready' ? `data-cr-st="${j}"` : ''}><span>${art}</span><b>${esc(l.txt || l.name)}</b><em>${t}</em></button>`; }).join('');
    const tasks = c.tasks.map((t, i) => { const p = prog(sel, i), n = need(t), dn = p >= n, bl = t.boss && !bossOpen(sel), lk = !open(sel);
      return `<div class="cr-t ${dn ? 'done' : ''} ${t.boss ? 'boss' : ''} ${bl || lk ? 'lock' : ''}">
        <i class="cr-ic">${ico(t.ic)}</i><span class="cr-tt"><b>${esc(t.t)}</b><span class="fm-bar"><i style="width:${Math.round(100 * p / n)}%"></i></span><small>${t.ovr ? `ОБЩ ${ovrNow()} / ${t.ovr}` : `${p}/${n}`}</small></span>
        <em class="cr-tok">+${t.tok}</em>
        ${dn ? '<span class="cr-ok">✓</span>' : bl ? `<span class="cr-lk">${lock} после 4 заданий</span>` : lk ? '' : `<button class="fm-btn sm" data-cr-go="${i}">Играть ›</button>`}</div>`; }).join('');
    return `<div class="cr">
      <div class="cr-chs">${chips}</div>
      <div class="cr-main">
        <aside class="cr-l" style="--cc:${c.col}">
          <small>Карьера · глава ${c.id}</small><b>${esc(c.t)}</b><p>${esc(c.d)}</p>
          <div class="cr-tk"><i class="cr-tok-ic"></i><b>${tk}</b><small>жетонов главы</small></div>
          <div class="cr-road"><i class="cr-fill" style="width:${Math.min(100, (tk / max) * 100)}%"></i>${steps}</div>
          <div class="cr-prize ${got ? 'got' : all ? 'ready' : ''}"><small>Главная награда</small><b>${esc(c.prize.name)}</b>
            ${got ? '<em>Получено ✓</em>' : all ? '<button class="fm-btn gold sm" data-cr-done>Забрать</button>' : `<em>${c.tasks.filter((t, i) => isDone(sel, i)).length}/${c.tasks.length} заданий</em>`}</div>
        </aside>
        <div class="cr-ts">${open(sel) ? tasks : `<p class="fm-none">${lock} Глава откроется после главы ${sel - 1}</p>`}</div>
      </div></div>`;
  }
  // клики внутри вида; go(t) — куда вести «Играть»
  function click(e, go, rerender) {
    const ch = e.target.closest('[data-cr-ch]'); if (ch) { sel = +ch.dataset.crCh; Sound.play('tap'); rerender(); return true; }
    const st = e.target.closest('[data-cr-st]'); if (st) { if (claimStep(sel, +st.dataset.crSt)) setTimeout(rerender, 80); return true; }
    if (e.target.closest('[data-cr-done]')) { if (claimChapter(sel)) { if (typeof confetti === 'function') confetti(); setTimeout(rerender, 80); } return true; }
    const g = e.target.closest('[data-cr-go]'); if (g) { Sound.play('tap'); go(CH[sel - 1].tasks[+g.dataset.crGo].go); return true; }
    return false;
  }
  // ---------- подключение к событиям игры ----------
  function hook() {
    if (typeof Rewards !== 'undefined') { const end0 = Rewards.onEnd; Rewards.onEnd = (win, game = '') => { const r = end0(win, game); try { bump('end', game); if (win) bump('win', game); } catch (e) { /* карьера не мешает игре */ } return r; }; }
    if (typeof PackOpen !== 'undefined' && PackOpen.reveal) { const rv = PackOpen.reveal; PackOpen.reveal = (res, cb, opts) => { if (opts && opts.pack !== undefined) bump('pack'); return rv(res, cb, opts); }; }
    if (typeof Cards !== 'undefined' && Cards.use) { const u = Cards.use; Cards.use = (keys) => { const ok = u(keys); if (ok && keys.length > 1) bump('sbc'); return ok; }; }
  }
  return { CH, view, click, hook, bump, ready, settle, S };
})();
