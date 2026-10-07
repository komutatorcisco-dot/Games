// Какие игры видны игрокам: открываются за трофеи (см. UNLOCKS). Порядок поздних игр — по QUEUE.
// Неделя (weekKey) по-прежнему нужна рейтингу: он обнуляется в понедельник в 10:00 по Европе.
// Чтобы поменять порядок или выпустить игру раньше — переставь строки в QUEUE или поменяй дату.
// Сервер (server/worker.js) держит копию названий и дат для сообщения бота — при правке обнови и там.
'use strict';

const Release = (() => {
  // ключ плитки на главной: 'ng:<id>' — новые игры, 'act:<действие>' — старые, 'pz:<id>' — головоломки
  const START = ['ng:wordle', 'act:nation', 'act:pick-duo', 'act:auction-bot', 'act:auction-duo', 'ng:duel', 'ng:trumps', 'act:ttt', 'act:ttt-duo', 'act:guess-career', 'act:guess-duel'];
  // [дата понедельника, название для баннера, ключи плиток, которые открываются вместе]
  const QUEUE = [
    ['2026-10-12', 'Угадай карьеру', ['act:career', 'act:career-duel']],
    ['2026-10-19', 'Угадай счёт', ['ng:score']],
    ['2026-10-26', 'Топ-10', ['ng:top10']],
    ['2026-11-02', 'Связи', ['ng:connect']],
    ['2026-11-09', 'Кто легендарнее?', ['act:pick-solo']],
    ['2026-11-16', 'Куда перешёл?', ['act:transfer']],
    ['2026-11-23', 'Машина времени', ['ng:timemachine']],
    ['2026-11-30', 'Тепло-холодно', ['ng:context']],
    ['2026-12-07', 'Кто выше в FC 27?', ['act:fc']],
    ['2026-12-14', 'Состав дня', ['ng:lineup']],
    ['2026-12-21', 'Пас в ворота', ['act:pass-levels']],
    ['2026-12-28', 'Сортировка мячей', ['pz:sort']],
    ['2027-01-04', 'Требл дня', ['ng:treble']],
    ['2027-01-11', 'Угадай клуб', ['act:club']],
    ['2027-01-18', 'Кто я?', ['ng:whoami']],
    ['2027-02-01', 'Дороже или дешевле', ['act:hl']],
    ['2027-02-08', 'Номер в истории', ['ng:numhist']],
    ['2027-02-15', 'Розыгрыш', ['pz:pipes']],
    ['2027-02-22', 'Связка', ['ng:linkup']],
    ['2027-03-01', 'Кто дороже?', ['act:value']],
    ['2027-03-08', 'Ложная девятка', ['ng:false9']],
    ['2027-03-15', 'Дартс 170', ['ng:darts']],
    ['2027-03-22', 'VS 100', ['ng:vs100']],
    ['2027-03-29', 'Бинго', ['ng:bingo']],
    ['2027-04-05', 'Box2Box на время', ['act:b2b']],
    ['2027-04-12', 'Рейтинг', ['ng:rank']],
    ['2027-04-19', '2048: Карьера', ['pz:g2048']],
    ['2027-04-26', 'Филворд', ['pz:words']],
    ['2027-05-03', 'Найди пару', ['pz:memory']],
    ['2027-05-10', 'Перекрась поле', ['pz:flood']],
    ['2027-05-17', 'Пятнашки', ['pz:slide']],
    ['2027-05-24', 'Поп-ит', ['pz:popit']],
    ['2027-05-31', 'Повтор гола', ['ng:replay']],
  ];
  const TZ = 'Europe/Berlin', HOUR = 10;

  // на сколько часы в Европе впереди UTC в момент t
  function tzOffset(t) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
    } catch (e) { return 2 * 3600e3; }
  }
  // неделя = дата её понедельника; новая неделя начинается в понедельник в 10:00 по Европе
  function weekKey(t = Date.now()) {
    const d = new Date(t + tzOffset(t) - HOUR * 3600e3), wd = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - wd * 864e5).toISOString().slice(0, 10);
  }
  // момент выхода игры с датой понедельника date
  function at(date) { const local = Date.parse(date) + HOUR * 3600e3; return local - tzOffset(local - tzOffset(local)); }

  // Игры и разделы открываются за трофеи, как в Brawl Stars: сначала немного, дальше по шагу.
  // [трофеи, название, ключи] — 'feat:cards' (паки и галерея) и 'feat:pass' (пропуск и задания) — разделы, не игры.
  const UNLOCKS = [
    [0, 'Первые игры', ['act:auction-bot', 'act:auction-duo', 'ng:wordle', 'act:nation', 'act:pick-duo']],
    [40, 'Тики-така', ['act:ttt', 'act:ttt-duo']],
    [80, 'Паки и Галерея', ['feat:cards']],
    [120, 'Козыри', ['ng:trumps']],
    [170, 'Угадай игрока и Дуэль', ['act:guess-career', 'act:guess-duel', 'ng:duel']],
    [230, 'Драфт', ['act:xdraft']],
    [300, 'ИПК', ['act:sbc']],
    [400, 'Пропуск и задания', ['feat:pass']],
    ...QUEUE.map((q, i) => [500 + i * 100, q[1], q[2]]),
  ];
  const trophies = () => { try { return (Store.d.rw && Store.d.rw.trophies) || 0; } catch (e) { return 0; } };
  const out = new Set();
  let cur = null, nxt = null;
  function refresh() {
    const t = trophies();
    out.clear(); cur = null; nxt = null;
    for (const u of UNLOCKS) { if (u[0] <= t) { u[2].forEach((k) => out.add(k)); cur = u; } else if (!nxt) nxt = u; }
  }
  refresh();

  // админ видит все игры (чтобы проверить заранее); игрокам — только открытые
  const isAdmin = () => !!(Store.d && Store.d.admin);
  const known = (key) => START.includes(key) || UNLOCKS.some((u) => u[2].includes(key));
  const isOut = (key) => { refresh(); return !known(key) || out.has(key) || isAdmin(); };
  const soon = (key) => known(key) && !out.has(key);
  const need = (key) => { const u = UNLOCKS.find((x) => x[2].includes(key)); return u ? u[0] : 0; };
  return {
    isOut, soon, refresh, weekKey, at, known, need, trophies, UNLOCKS,
    feature: (f) => isOut('feat:' + f),
    current: () => { refresh(); return cur ? { title: cur[1], keys: cur[2], at: cur[0] } : null; },
    next: () => { refresh(); return nxt ? { title: nxt[1], keys: nxt[2], need: nxt[0] } : null; },
    count: () => out.size,
    // номер «тура»: первая неделя игр (с 5 октября 2026) — тур 1
    tour: () => Math.max(1, Math.round((Date.parse(weekKey()) - Date.parse('2026-10-05')) / 6048e5) + 1),
  };
})();
