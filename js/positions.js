// Shared positions for collection, squad and draft. No inferred adjacent roles.
// Sources and edition selection: docs/player-position-sources.md.
'use strict';
const PlayerPositions = (() => {
  const RU = { GK:'ВРТ', CB:'ЦЗ', LB:'ЛЗ', RB:'ПЗ', CDM:'ЦОП', CM:'ЦП', CAM:'ЦАП', LM:'ЛП', RM:'ПП', LW:'ЛВ', RW:'ПВ', ST:'НАП' };
  const FROM = { ...Object.fromEntries(Object.entries(RU).map(([k,v]) => [v,k])), ГК:'GK', ФРВ:'ST', ЗАЩ:'CB' };
  const LEGENDS = {
    'Гарет Бэйл':'RW RM LM ST LW', 'Рауль':'ST CAM', 'Гонсало Игуаин':'ST CF', 'Тони Кроос':'CM CDM CAM', 'Гути':'CM CAM',
    'Серхио Рамос':'CB', 'Марсело':'LB', 'Роберто Карлос':'LB LM', 'Пепе':'CB', 'Рафаэль Варан':'CB', 'Икер Касильяс':'GK',
    'Роналдиньо':'LW LM CAM', 'Самюэль Это’о':'ST', 'Давид Вилья':'ST', 'Хави':'CM CDM CAM', 'Андрес Иньеста':'CM LM CAM LW',
    'Серхио Бускетс':'CDM CB CM', 'Иван Ракитич':'CM CDM', 'Карлес Пуйоль':'CB RB', 'Жерар Пике':'CB', 'Дани Алвес':'RB RWB',
    'Жорди Альба':'LB', 'Хавьер Маскерано':'CB CDM', 'Уэйн Руни':'ST CAM', 'Дэвид Бекхэм':'RM CM RW', 'Майкл Каррик':'CDM',
    'Неманья Видич':'CB', 'Патрис Эвра':'LB', 'Андрей Шевченко':'ST RW', 'Филиппо Индзаги':'ST', 'Златан Ибрагимович':'ST',
    'Андреа Пирло':'CM CDM', 'Кларенс Зеедорф':'CAM RM LM', 'Дженнаро Гаттузо':'CDM CM', 'Кака':'CAM', 'Алессандро Неста':'CB', 'Дида':'GK',
    'Стивен Джеррард':'CM CDM CAM', 'Хаби Алонсо':'CDM CM', 'Мартин Шкртел':'CB', 'Даниэль Аггер':'CB', 'Пепе Рейна':'GK',
    'Арьен Роббен':'RM CAM', 'Бастиан Швайнштайгер':'CM CDM RM LM', 'Франк Рибери':'LM LW', 'Филипп Лам':'RB LB CDM',
    'Давид Алаба':'CB', 'Жером Боатенг':'CB', 'Джорджо Кьеллини':'CB', 'Леонардо Бонуччи':'CB', 'Джанлуиджи Буффон':'GK',
    'Дидье Дрогба':'ST', 'Эден Азар':'LM CAM LW', 'Фрэнк Лэмпард':'CM CDM CAM', 'Джон Терри':'CB', 'Бранислав Иванович':'CB',
    'Эшли Коул':'LB', 'Петр Чех':'GK', 'Тьерри Анри':'ST LM LW', 'Сеск Фабрегас':'CM CDM CAM ST', 'Диего Милито':'ST',
    'Эстебан Камбьяссо':'CDM CM', 'Уэсли Снейдер':'CAM CM LM LW', 'Хавьер Санетти':'RB LB CDM RM', 'Самир Ханданович':'GK', 'Жулио Сезар':'GK',
  };
  // Espart is the community's custom SBC card; its requested primary role stays LB.
  const SPECIAL = { 'Нико О’Райли':'LB CM CDM', 'Хави Эспарт':'LB' };
  // Names missed by the original archive import; checked against EA's profiles.
  const SUPPLEMENT = {
    'Неймар':'CAM CM ST LW', // FC 26: absent from the FC 27 launch pool.
    'Джейк О’Брайен':'RB CB', 'Лукас Хёгсберг':'CB', 'Никлас Рёйкйер':'CM CDM',
    'Оскар Хёйлун':'CM CDM', 'Оуз Айдын':'LM RM LW RW', 'Семих Кылычсой':'ST CAM',
    'Фредрик Шёволд':'RB RM', 'Гонсалу Франку':'CDM CM', 'Демир Эге Тыкназ':'CDM CM',
    'Лукас Роса':'RB LB CDM', 'Оливер Сёренсен':'CM CAM', 'Сондре Эрйасетер':'LW LM',
    'Гонсалу Боргеш':'RW LW RM LM', 'Жоау Мендеш':'LB LM LW', 'Симоне Д’Уффици':'LM LW',
    'Алберт Посядала':'GK', 'Берту Йылдырым':'ST', 'Матиас Хёлё':'CDM CM', 'Филип Йагелло':'CM CAM',
  };
  function expand(base) {
    const normal = base.map(p => p === 'LWB' ? 'LB' : p === 'RWB' ? 'RB' : p === 'CF' ? 'ST' : p).filter(p => RU[p]);
    // Legacy FIFA roles map to the slots supported by our formations, never
    // to extra roles. Keep the historical source codes in LEGENDS for auditing.
    return [...new Set(normal)];
  }
  function get(name, fallback) {
    const raw = SPECIAL[name] || LEGENDS[name] || SUPPLEMENT[name] || (typeof FC_POS !== 'undefined' && FC_POS[name]);
    return expand(raw ? raw.split(/\s+/) : [FROM[fallback] || fallback || 'CM']);
  }
  return { get, expand, RU, LEGENDS, SUPPLEMENT, SPECIAL, labels: positions => positions.map(p => RU[p]).join(' · ') };
})();
