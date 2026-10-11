// Generated from existing SBC rules by tools/economy-catalog.mjs.
import catalog from './catalog.mjs';
const TZ='Europe/Berlin',HOUR=10;
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


export function definitions(now=Date.now()){
  const LEAGUES = ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'Лига 1'];
  const GOLDUP = ['gold', 'legend', 'jack'];
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
 const Cards={all:()=>catalog.cards,surname:n=>n};
 const Day={key:(offset=0)=>new Date(now+3*3600e3+offset*864e5).toISOString().slice(0,10)};
 const wk=()=>weekKey(now);
 const weekEnd=()=>at(new Date(Date.parse(wk())+7*864e5).toISOString().slice(0,10));
 const dayEnd=()=>Date.parse(Day.key(1))-3*3600e3;
 let cache;
  function defs() {
    const W = wk(), D = Day.key();
    if (cache && cache.key === W + D) return cache.list;
    const L = LEAGUES[hash(W) % LEAGUES.length];
    const jacks = Cards.all().filter((c) => c.rar === 'jack');
    const lgJ = jacks.filter((c) => c.lg === L), pool = lgJ.length ? lgJ : jacks;
    const star = pool.length ? pool[hash(W + 'star') % pool.length] : null;
    const tier = star ? (star.r >= 97 ? 1 : star.r <= 94 ? -1 : 0) : 0;
    const dl = LEAGUES[hash(D) % LEAGUES.length];
    const dayReq = [
      [{ t: 'same', k: 'lg', min: 3 }],
      [{ t: 'from', k: 'lg', v: dl, min: 2 }],
      [{ t: 'rating', v: 75 }],
      [{ t: 'rar', in: GOLDUP, min: 1 }],
      [{ t: 'diff', k: 'club', min: 3 }],
    ][hash(D + 'q') % 5];
    const list = [
      { id: 'day:' + D, cat: 'day', ico: 'clock', diff: 1, title: 'Испытание дня', desc: 'Три карточки за сверхредкий пак. Новое каждый день.', n: 3, req: dayReq, reward: { pack: 1 }, limit: 1, ends: dayEnd() },
      star && { id: 'pl:' + W, cat: 'pl', group: true, ico: 'star', diff: 4, cost: 70 + tier * 15, title: `Игрок недели: ${Cards.surname(star.name)}`, desc: `Пройди три испытания и забери ${star.name} ${star.r}. За каждый этап тоже дают пак.`, reward: { card: star.key }, ends: weekEnd(), limit: 1,
        items: [
          { id: `pl:${W}:1`, ico: 'stadium', diff: 3, title: `Лига недели: ${L}`, desc: `Пятеро из ${L} в составе на ${80 + tier}`, n: 11, req: [{ t: 'from', k: 'lg', v: L, min: 5 }, { t: 'rating', v: 80 + tier }], reward: { pack: 2 }, limit: 1 },
          { id: `pl:${W}:2`, ico: 'flame', diff: 3, title: 'Топ-форма', desc: 'Сильный полный состав', n: 11, req: [{ t: 'rating', v: 82 + tier }], reward: { pack: 2 }, limit: 1 },
          { id: `pl:${W}:3`, ico: 'crown', diff: 4, title: 'Состав мечты', desc: 'С легендой и рейтингом элиты', n: 11, req: [{ t: 'rating', v: 84 + tier }, { t: 'rar', in: ['legend', 'jack'], min: 1 }], reward: { pack: 3 }, limit: 1 },
        ] },
      { id: 'fs:espart', cat: 'pl', group: true, ico: 'star', diff: 4, title: 'Будущие звёзды: Хави Эспарт', desc: '10 составов — уникальный левый защитник Барселоны с рейтингом 91. Без срока окончания. За каждый этап — 100 монет.', reward: { card: 'FS:xavi-espart' }, limit: 1,
        items: [75, 76, 77, 78, 79, 80, 81, 82, 83, 85].map((r, i) => ({
          id: 'fs:espart:' + (i + 1), ico: 'star', diff: i < 3 ? 2 : i < 7 ? 3 : 4,
          title: ['Первый шаг', 'Испанские корни', 'Ла Масия', 'Ла Лига', 'Командная игра', 'Новая надежда', 'Большая сцена', 'Звёздный состав', 'Путь к вершине', 'Будущая звезда'][i],
          desc: 'Состав ' + (i + 1) + ' из 10', n: 11,
          req: [{ t: 'rating', v: r }, ...(i === 1 ? [{ t: 'from', k: 'nat', v: 'Испания', min: 2 }] : i === 2 ? [{ t: 'from', k: 'club', v: 'Барселона', min: 1 }] : i === 3 ? [{ t: 'from', k: 'lg', v: 'Ла Лига', min: 3 }] : [])],
          reward: { coins: 100 }, limit: 1,
        })) },
      { id: 'up:b:' + D, cat: 'up', ico: 'medal:#d9905a', diff: 1, title: 'Бронзовое улучшение', desc: '11 бронзовых за 5 карточек, включая золотую. Раз в день.', n: 11, req: [{ t: 'only', in: ['bronze'] }], reward: { pack: 1 }, limit: 1, ends: dayEnd() },
      { id: 'up:s:' + D, cat: 'up', ico: 'medal:#d6dde6', diff: 2, title: 'Серебряное улучшение', desc: '11 серебряных за 8 карточек, включая две золотые. Раз в день.', n: 11, req: [{ t: 'only', in: ['silver'] }], reward: { pack: 2 }, limit: 1, ends: dayEnd() },
      { id: 'up:g:' + W, cat: 'up', ico: 'medal:#ffcf3a', diff: 4, title: 'Улучшение 85+', desc: '11 золотых или особых карт, рейтинг состава 85. Пак с легендой — раз в неделю.', n: 11, req: [{ t: 'only', in: GOLDUP }, { t: 'rating', v: 85 }], reward: { pack: 3 }, limit: 1, ends: weekEnd() },
      { id: 'up:j:' + W, cat: 'up', ico: 'pack:#ff4f66', diff: 4, title: 'Пак «ДЖЕКСОН!!»', desc: 'Состав на 88 с четырьмя легендами или «Джексонами». Гарантированный «Джексон» — раз в неделю.', n: 11, req: [{ t: 'rating', v: 88 }, { t: 'rar', in: ['legend', 'jack'], min: 4 }], reward: { pack: 4 }, limit: 1, ends: weekEnd() },
      { id: 'b:first', cat: 'base', ico: '1', diff: 1, title: 'Первый состав', desc: 'Любые три карточки. Начни с простого.', n: 3, req: [], reward: { coins: 150 }, limit: 1 },
      { id: 'b:league', cat: 'base', ico: '2', diff: 1, title: 'Одна лига', desc: 'Все пятеро из одной лиги.', n: 5, req: [{ t: 'same', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:nation', cat: 'base', ico: '3', diff: 2, title: 'Одна сборная', desc: 'Четверо из одной страны.', n: 4, req: [{ t: 'same', k: 'nat', min: 4 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:club', cat: 'base', ico: '4', diff: 2, title: 'Одноклубники', desc: 'Двое из одного клуба в пятёрке.', n: 5, req: [{ t: 'same', k: 'club', min: 2 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:five', cat: 'base', ico: '5', diff: 1, title: 'Пять лиг', desc: 'Пятеро из пяти разных лиг.', n: 5, req: [{ t: 'diff', k: 'lg', min: 5 }], reward: { pack: 1 }, limit: 1 },
      { id: 'b:gold', cat: 'base', ico: '6', diff: 2, title: 'Золотой стандарт', desc: 'Полный состав с рейтингом 78.', n: 11, req: [{ t: 'rating', v: 78 }], reward: { pack: 2 }, limit: 1 },
      { id: 'b:nat11', cat: 'base', ico: '7', diff: 2, title: 'Костяк сборной', desc: 'Трое соотечественников в составе на 79.', n: 11, req: [{ t: 'same', k: 'nat', min: 3 }, { t: 'rating', v: 79 }], reward: { pack: 2 }, limit: 1 },
    ].filter(Boolean);
    cache = { key: W + D, list };
    return list;
  }

return defs();
}
