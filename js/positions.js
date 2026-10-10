// Shared positions for collection, squad and draft. Adjacent roles are a game
// rule requested by the community, not a claim about official EA card data.
'use strict';
const PlayerPositions = (() => {
  const RU = { GK:'ВРТ', CB:'ЦЗ', LB:'ЛЗ', RB:'ПЗ', CDM:'ЦОП', CM:'ЦП', CAM:'ЦАП', LM:'ЛП', RM:'ПП', LW:'ЛВ', RW:'ПВ', ST:'НАП' };
  const FROM = { ...Object.fromEntries(Object.entries(RU).map(([k,v]) => [v,k])), ГК:'GK', ФРВ:'ST', ЗАЩ:'CB' };
  const NEAR = { GK:[], CB:[], LB:['LM'], RB:['RM'], CDM:['CM'], CM:['CDM','CAM'], CAM:['CM'], LM:['LW'], RM:['RW'], LW:['LM','ST'], RW:['RM','ST'], ST:['CAM'] };
  const LEGENDS = {
    'Гарет Бэйл':'RW LW LM', 'Рауль':'ST CAM', 'Гонсало Игуаин':'ST', 'Тони Кроос':'CM CDM', 'Гути':'CAM CM',
    'Серхио Рамос':'CB RB', 'Марсело':'LB LM', 'Роберто Карлос':'LB LM', 'Пепе':'CB', 'Рафаэль Варан':'CB', 'Икер Касильяс':'GK',
    'Роналдиньо':'LW CAM', 'Самюэль Это’о':'ST', 'Давид Вилья':'ST LW', 'Хави':'CM', 'Андрес Иньеста':'CM CAM LM',
    'Серхио Бускетс':'CDM', 'Иван Ракитич':'CM CDM', 'Карлес Пуйоль':'CB RB', 'Жерар Пике':'CB', 'Дани Алвес':'RB RM',
    'Жорди Альба':'LB LM', 'Хавьер Маскерано':'CDM CB', 'Уэйн Руни':'ST CAM', 'Дэвид Бекхэм':'RM CM', 'Майкл Каррик':'CDM CM',
    'Неманья Видич':'CB', 'Патрис Эвра':'LB', 'Андрей Шевченко':'ST', 'Филиппо Индзаги':'ST', 'Златан Ибрагимович':'ST',
    'Андреа Пирло':'CM CDM', 'Кларенс Зеедорф':'CM CAM', 'Дженнаро Гаттузо':'CDM CM', 'Кака':'CAM', 'Алессандро Неста':'CB', 'Дида':'GK',
    'Стивен Джеррард':'CM CDM CAM', 'Хаби Алонсо':'CDM CM', 'Мартин Шкртел':'CB', 'Даниэль Аггер':'CB', 'Пепе Рейна':'GK',
    'Арьен Роббен':'RW RM', 'Бастиан Швайнштайгер':'CM CDM', 'Франк Рибери':'LW LM', 'Филипп Лам':'RB LB CDM',
    'Давид Алаба':'CB LB CM', 'Жером Боатенг':'CB RB', 'Джорджо Кьеллини':'CB LB', 'Леонардо Бонуччи':'CB', 'Джанлуиджи Буффон':'GK',
    'Дидье Дрогба':'ST', 'Эден Азар':'LW CAM', 'Фрэнк Лэмпард':'CM CAM', 'Джон Терри':'CB', 'Бранислав Иванович':'RB CB',
    'Эшли Коул':'LB', 'Петр Чех':'GK', 'Тьерри Анри':'ST LW', 'Сеск Фабрегас':'CM CAM', 'Диего Милито':'ST',
    'Эстебан Камбьяссо':'CDM CM', 'Уэсли Снейдер':'CAM CM', 'Хавьер Санетти':'RB LB CDM', 'Самир Ханданович':'GK', 'Жулио Сезар':'GK',
  };
  const SPECIAL = { 'Нико О’Райли':'LB CB CDM CAM CM', 'Хави Эспарт':'LB RB' };
  function expand(base) {
    const normal = base.map(p => p === 'LWB' ? 'LB' : p === 'RWB' ? 'RB' : p === 'CF' ? 'ST' : p).filter(p => RU[p]);
    // Only the primary role adds neighbours. Defensive roles must be explicit
    // in the player's data; a secondary CDM/LM/RM must never invent CB/LB/RB.
    return [...new Set([...normal, ...(NEAR[normal[0]] || [])])];
  }
  function get(name, fallback) {
    const raw = SPECIAL[name] || LEGENDS[name] || (typeof FC_POS !== 'undefined' && FC_POS[name]);
    return expand(raw ? raw.split(/\s+/) : [FROM[fallback] || fallback || 'CM']);
  }
  return { get, expand, RU, LEGENDS, labels: positions => positions.map(p => RU[p]).join(' · ') };
})();
