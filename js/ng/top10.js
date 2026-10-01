// «Топ-10» (как Tenable): назови всех из списка. Три промаха — конец.
// Списки: исторические (порядок не важен) и из нашей базы (составы клубов 2026/27, самые дорогие трансферы).
'use strict';

(() => {
  const LIVES = 3;
  // [название, [[ответ, ...варианты написания]]]
  const FIXED = [
    ['Лучшие бомбардиры АПЛ за всё время (топ-10)', [['Алан Ширер', 'Ширер'], ['Гарри Кейн', 'Кейн'], ['Уэйн Руни', 'Руни'], ['Мохамед Салах', 'Салах'], ['Энди Коул', 'Коул'],
      ['Серхио Агуэро', 'Агуэро'], ['Фрэнк Лэмпард', 'Лэмпард', 'Лампард'], ['Тьерри Анри', 'Анри'], ['Робби Фаулер', 'Фаулер'], ['Джермейн Дефо', 'Дефо']]],
    ['Сборные — чемпионы мира', [['Бразилия'], ['Германия', 'ФРГ'], ['Италия'], ['Аргентина'], ['Франция'], ['Уругвай'], ['Англия'], ['Испания']]],
    ['Сборные — чемпионы Европы', [['Германия', 'ФРГ'], ['Испания'], ['Франция'], ['Италия'], ['СССР', 'Советский Союз'], ['Чехословакия'], ['Нидерланды', 'Голландия'],
      ['Дания'], ['Греция'], ['Португалия']]],
    ['Клубы — чемпионы АПЛ (с 1992 года)', [['Манчестер Юнайтед', 'МЮ', 'Юнайтед'], ['Блэкберн'], ['Арсенал'], ['Челси'], ['Манчестер Сити', 'Сити', 'Ман Сити'], ['Лестер'], ['Ливерпуль']]],
    ['Обладатели «Золотого мяча» с 2000 года', [['Луиш Фигу', 'Фигу'], ['Майкл Оуэн', 'Оуэн'], ['Роналдо', 'Роналдо Феномен'], ['Павел Недвед', 'Недвед'], ['Андрей Шевченко', 'Шевченко'],
      ['Роналдиньо'], ['Фабио Каннаваро', 'Каннаваро'], ['Кака'], ['Криштиану Роналду', 'Роналду', 'Криштиану'], ['Лионель Месси', 'Месси'], ['Лука Модрич', 'Модрич'],
      ['Карим Бензема', 'Бензема'], ['Родри'], ['Усман Дембеле', 'Дембеле']]],
    ['Клубы, ни разу не вылетавшие из АПЛ', [['Арсенал'], ['Челси'], ['Эвертон'], ['Ливерпуль'], ['Манчестер Юнайтед', 'МЮ', 'Юнайтед'], ['Тоттенхэм', 'Тоттенхем']]],
    ['Страны — хозяйки чемпионатов мира с 1990 года', [['Италия'], ['США'], ['Франция'], ['Япония'], ['Южная Корея', 'Корея'], ['Германия'], ['ЮАР'], ['Бразилия'], ['Россия'], ['Катар'], ['Канада'], ['Мексика']]],
  ];

  function lists() {
    const out = FIXED.map(([title, ans]) => ({ title, ans, ordered: false }));
    // самые дорогие трансферы из нашей базы
    const seen = new Set(), top = [];
    [...TR()].sort((a, b) => b[5] - a[5]).forEach((t) => { if (!seen.has(t[0]) && top.length < 10) { seen.add(t[0]); top.push(t); } });
    out.push({ title: 'Самые дорогие трансферы в истории (по игроку, топ-10)', ans: top.map((t) => [t[0], surname(t[0])]), extra: top.map((t) => `${t[5]} млн € · ${t[2]} → ${t[3]}`), ordered: true });
    // составы клубов 2026/27
    const by = {};
    PLAYERS.forEach((p) => { (by[p.club] = by[p.club] || []).push(p); });
    Object.entries(by).filter(([, ps]) => ps.length >= 8).forEach(([club, ps]) => out.push({
      title: `Игроки «${club}» в сезоне 2026/27`, club, ans: ps.map((p) => [p.name, surname(p.name)]), extra: ps.map((p) => `${p.flag} ${p.pos}`), ordered: false,
    }));
    return out;
  }

  NG.register({
    id: 'top10', group: 'brain', title: 'Топ-10', c1: '#ff8a2a', c2: '#b23d22', tag: 'Назови всех из списка',
    meta: (s) => (s.best ? `Лучший: ${s.best}%` : `${lists().length} списков`),
    start(api) {
      const L = lists(), s = api.st();
      // по очереди, чтобы списки не повторялись подряд
      s.order = s.order && s.order.length === L.length ? s.order : shuffle([...L.keys()], Math.random);
      s.pos = ((s.pos || 0) + 1) % L.length; api.save();
      const list = L[s.order[s.pos]];
      let found = new Set(), lives = LIVES, over = false;
      const b = api.body;
      b.innerHTML = `<h3 class="ng-q">${list.club ? crestImg(list.club, 's') : ''}${esc(list.title)}</h3><div class="t10-lives"></div><div class="ng-in"></div><ol class="t10-list"></ol>
        <div class="ng-row"><button class="btn ghost" data-a="give">Сдаться</button><button class="btn ghost" data-a="next">Другой список</button></div>`;
      const inp = NG.input($('.ng-in', b), { placeholder: list.ordered || list.club ? 'Фамилия игрока' : 'Твой ответ', button: 'Ввод', onPick: guess });
      function render() {
        api.sub(`Найдено ${found.size} из ${list.ans.length}`);
        $('.t10-lives', b).textContent = `Промахи: ${'✖'.repeat(LIVES - lives)}${'·'.repeat(lives)}`;
        $('.t10-list', b).innerHTML = list.ans.map((a, i) => {
          const ok = found.has(i);
          return `<li class="${ok ? 'ok' : over ? 'miss' : ''}"><b>${ok || over ? esc(a[0]) : '• • •'}</b>${(ok || over) && list.extra ? `<small>${esc(list.extra[i])}</small>` : ''}</li>`;
        }).join('');
      }
      function guess(text) {
        if (over) return;
        const i = list.ans.findIndex((a) => a.some((v) => nameMatch(text, v)));
        if (i >= 0 && !found.has(i)) { found.add(i); Sound.play('kick'); haptic('ok'); if (found.size === list.ans.length) return finish(); }
        else if (i >= 0) toast('Уже есть');
        else { lives--; Sound.play('bad'); haptic('bad'); toast(`«${text}» — нет в списке`); if (lives <= 0) return finish(); }
        render();
      }
      function finish() {
        over = true; inp.disable(true); render();
        const pct = Math.round((found.size / list.ans.length) * 100);
        s.best = Math.max(s.best || 0, pct); api.save();
        if (pct === 100) Profile.bump('top10', 15);
        NG.end({ title: pct === 100 ? 'Весь список!' : `${found.size} из ${list.ans.length}`, win: pct === 100, reward: found.size * 4 + (pct === 100 ? 30 : 0),
          html: '<p>Ответы открыты на экране.</p>', again: { label: 'Следующий список', fn: () => NG.open('top10') } });
      }
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'next') return NG.open('top10');
        if (!over) finish();
      });
      render();
      inp.focus();
    },
  });
})();
