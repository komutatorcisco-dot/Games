// Какие игры видны игрокам. На старте — 8 лучших, остальные выходят по одной каждую неделю:
// в понедельник в 10:00 по центральноевропейскому времени (тогда же обнуляется рейтинг недели).
// Чтобы поменять порядок или выпустить игру раньше — переставь строки в QUEUE или поменяй дату.
// Сервер (server/worker.js) держит копию названий и дат для сообщения бота — при правке обнови и там.
'use strict';

const Release = (() => {
  // ключ плитки на главной: 'ng:<id>' — новые игры, 'act:<действие>' — старые, 'pz:<id>' — головоломки
  const START = ['ng:wordle', 'act:nation', 'act:pick-duo', 'act:auction-bot', 'act:auction-duo', 'ng:duel', 'ng:trumps'];
  // [дата понедельника, название для баннера, ключи плиток, которые открываются вместе]
  const QUEUE = [
    ['2026-10-12', 'Тики-Така-Тоу', ['act:ttt', 'act:ttt-duo']],
    ['2026-10-19', 'Угадай футболиста', ['act:guess-career', 'act:guess-duel']],
    ['2026-10-26', 'Угадай карьеру', ['act:career', 'act:career-duel']],
    ['2026-11-02', 'Угадай счёт', ['ng:score']],
    ['2026-11-09', 'Топ-10', ['ng:top10']],
    ['2026-11-16', 'Связи', ['ng:connect']],
    ['2026-11-23', 'Кто легендарнее?', ['act:pick-solo']],
    ['2026-11-30', 'Куда перешёл?', ['act:transfer']],
    ['2026-12-07', 'Машина времени', ['ng:timemachine']],
    ['2026-12-14', 'Тепло-холодно', ['ng:context']],
    ['2026-12-21', 'Кто выше в FC 27?', ['act:fc']],
    ['2026-12-28', 'Состав дня', ['ng:lineup']],
    ['2027-01-04', 'Пас в ворота', ['act:pass-levels']],
    ['2027-01-11', 'Сортировка мячей', ['pz:sort']],
    ['2027-01-18', 'Требл дня', ['ng:treble']],
    ['2027-01-25', 'Угадай клуб', ['act:club']],
    ['2027-02-01', 'Кто я?', ['ng:whoami']],
    ['2027-02-08', 'Драфт', ['ng:draft']],
    ['2027-02-15', 'Дороже или дешевле', ['act:hl']],
    ['2027-02-22', 'Номер в истории', ['ng:numhist']],
    ['2027-03-01', 'Розыгрыш', ['pz:pipes']],
    ['2027-03-08', 'Связка', ['ng:linkup']],
    ['2027-03-15', 'Кто дороже?', ['act:value']],
    ['2027-03-22', 'Ложная девятка', ['ng:false9']],
    ['2027-03-29', 'Дартс 170', ['ng:darts']],
    ['2027-04-05', 'VS 100', ['ng:vs100']],
    ['2027-04-12', 'Бинго', ['ng:bingo']],
    ['2027-04-19', 'Box2Box на время', ['act:b2b']],
    ['2027-04-26', 'Рейтинг', ['ng:rank']],
    ['2027-05-03', '2048: Карьера', ['pz:g2048']],
    ['2027-05-10', 'Филворд', ['pz:words']],
    ['2027-05-17', 'Найди пару', ['pz:memory']],
    ['2027-05-24', 'Перекрась поле', ['pz:flood']],
    ['2027-05-31', 'Пятнашки', ['pz:slide']],
    ['2027-06-07', 'Поп-ит', ['pz:popit']],
    ['2027-06-14', 'Повтор гола', ['ng:replay']],
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

  const out = new Set(START);
  let cur = null, nxt = null;
  function refresh() {
    const wk = weekKey();
    out.clear(); START.forEach((k) => out.add(k)); cur = null; nxt = null;
    for (const q of QUEUE) {
      if (q[0] <= wk) { q[2].forEach((k) => out.add(k)); if (q[0] === wk) cur = q; } else if (!nxt) nxt = q;
    }
  }
  refresh();

  // админ видит все игры (чтобы проверить заранее); игрокам — только вышедшие
  const isAdmin = () => !!(Store.d && Store.d.admin);
  const known = (key) => START.includes(key) || QUEUE.some((q) => q[2].includes(key));
  const isOut = (key) => !known(key) || out.has(key) || isAdmin();
  const soon = (key) => known(key) && !out.has(key);
  return {
    isOut, soon, refresh, weekKey, at, known,
    current: () => (cur ? { title: cur[1], keys: cur[2] } : null),
    next: () => (nxt ? { title: nxt[1], keys: nxt[2], at: at(nxt[0]) } : null),
    count: () => out.size,
  };
})();
