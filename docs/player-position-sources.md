# Player positions — checked 2026-10-10

Positions are explicit per player. No adjacency expansion, real-life role guesses,
or calculated positional ratings. First code is the main position. Existing
`js/data/fcpos.js` contains 4,995 imported FC 27 position lists from the supplied
archive ([upstream dataset](https://github.com/LakshmiKanth11/EA_FC_ANALYSIS));
this change preserves those lists, rather than claiming to refresh every entry.

For additional players use FC 27 base cards, otherwise the last found FIFA/FC
edition. Use base Icon/Hero/normal cards, not the union of every promo card.
Older editions without FUT alternate positions use listed career positions.
Our formations do not have CF/LWB/RWB: they map to ST/LB/RB respectively,
deduplicated. This conversion adds no extra role. Espart's 91 Future Stars SBC
is a custom community card with the user-requested LB position, not an EA item.

## FC 27 Icons

[FC 27 Icon database](https://www.fifplay.com/fc-27/players/club/112658/icons/).
The individual primary and alternate fields were read; calculated suitability
ratings for other positions are not used.

| Player | Positions |
|---|---|
| Рауль | ST CAM |
| Тони Кроос | CM CDM CAM |
| Марсело | LB |
| Роберто Карлос | LB LM |
| Пепе | CB |
| Рафаэль Варан | CB |
| Икер Касильяс | GK |
| Роналдиньо | LW LM CAM |
| Самюэль Это’о | ST |
| Хави | CM CDM CAM |
| Андрес Иньеста | CM LM CAM LW |
| Карлес Пуйоль | CB RB |
| Уэйн Руни | ST CAM |
| Дэвид Бекхэм | RM CM RW |
| Неманья Видич | CB |
| Андрей Шевченко | ST RW |
| Златан Ибрагимович | ST |
| Андреа Пирло | CM CDM |
| Дженнаро Гаттузо | CDM CM |
| Кака | CAM |
| Алессандро Неста | CB |
| Стивен Джеррард | CM CDM CAM |
| Хаби Алонсо | CDM CM |
| Бастиан Швайнштайгер | CM CDM RM LM |
| Франк Рибери | LM LW |
| Филипп Лам | RB LB CDM |
| Джорджо Кьеллини | CB |
| Джанлуиджи Буффон | GK |
| Дидье Дрогба | ST |
| Фрэнк Лэмпард | CM CDM CAM |
| Эшли Коул | LB |
| Петр Чех | GK |
| Тьерри Анри | ST LM LW |
| Хавьер Санетти | RB LB CDM RM |

Гарет Бэйл: RW RM LM ST LW, from [WeFUT's complete alternate list](https://wefut.com/player/27/20833/gareth-bale).
FIFPlay's compact card displays only three alternates; do not truncate WeFUT's list.

## FC 27 Heroes

[Hero database](https://www.fifplay.com/fc-27/players/hero/) and
[page 2](https://www.fifplay.com/fc-27/players/hero/?page=2).

| Player | Positions |
|---|---|
| Хавьер Маскерано | CB CDM |
| Эден Азар | LM CAM LW |
| Сеск Фабрегас | CM CDM CAM ST |
| Диего Милито | ST |
| Эстебан Камбьяссо | CDM CM |
| Уэсли Снейдер | CAM CM LM LW |

Гути: CM CAM, [base Hero](https://www.fut.gg/players/262285-guti/27-262285/).

## Other legends and historical editions

| Player | Edition | Source positions | Source |
|---|---|---|---|
| Гонсало Игуаин | FIFA 23 | ST CF | [normal](https://www.futwiz.com/fifa23/player/gonzalo-higuain/17039) |
| Серхио Рамос | FC 24 | CB | [normal](https://www.fut.gg/players/155862-sergio-ramos/24-155862/) |
| Давид Вилья | FIFA 20 | ST | [normal](https://www.fifplay.com/fifa-20/players/113422/david-villa/) |
| Серхио Бускетс | FC 26 | CDM CB CM | [normal](https://www.fut.gg/players/189511-sergio-busquets/26-189511/) |
| Иван Ракитич | FC 25 | CM CDM | [normal](https://www.fut.gg/players/168651-ivan-rakitic/25-168651/) |
| Жерар Пике | FIFA 23 | CB | [database](https://www.fifacm.com/players?position=CB&teams=241&vid=283) |
| Дани Алвес | FIFA 23 | RB RWB | [World Cup base](https://www.futwiz.com/fifa23/player/dani-alves/18140) |
| Жорди Альба | FC 26 | LB | [normal](https://www.fut.gg/players/189332-jordi-alba/26-189332/) |
| Майкл Каррик | FIFA 18 | CDM | [career](https://fifaindex.com/players/21146-michael-carrick/fifa18) |
| Патрис Эвра | FIFA 18 | LB | [career](https://fifaindex.com/players/52091-patrice-evra/fifa18) |
| Филиппо Индзаги | FIFA 22 | ST | [last edition history](https://www.fut.gg/players/1198-filippo-inzaghi/) |
| Кларенс Зеедорф | FC 24 | CAM RM LM | [base Icon](https://www.futwiz.com/fc24/player/clarence-seedorf/17782) |
| Дида | FIFA 14 | GK | [normal](https://wefut.com/player/14/12389/dida) |
| Мартин Шкртел | FIFA 21 | CB | [career](https://www.fifacm.com/21/player/166706) |
| Даниэль Аггер | FIFA 16 | CB | [career](https://fifaindex.com/players/152039-daniel-agger/fifa16) |
| Пепе Рейна | FC 25 | GK | [normal](https://www.fifplay.com/fc-25/players/24630/pepe-reina/) |
| Арьен Роббен | FIFA 21 | RM CAM | [career](https://fifaindex.com/players/9014-arjen-robben/fifa21) |
| Давид Алаба | FC 27 | CB | [career, free agent](https://fifaindex.com/players/197445-david-alaba/fc27) |
| Жером Боатенг | FC 25 | CB | [career](https://www.fifacm.com/25/player/183907?vid=417) |
| Леонардо Бонуччи | FC 24 | CB | [career](https://www.fifacm.com/24/player/184344/leonardo-bonucci) |
| Джон Терри | FIFA 18 | CB | [career](https://fifaindex.com/players/13732-john-terry/fifa18) |
| Бранислав Иванович | FIFA 21 | CB | [career](https://www.fifacm.com/21/player/178372/branislav-ivanovic) |
| Самир Ханданович | FIFA 23 | GK | [normal](https://www.fifplay.com/fifa-23/players/162835/samir-handanovic/) |
| Жулио Сезар | FIFA 18 | GK | [normal](https://www.fifplay.com/fifa-18/players/48717/julio-cesar/) |

## Players missed by the original name matching

All FC 27 except Neymar. EA links below identify the exact player, including
diacritics which the original import missed. Localized position abbreviations
are translated to the English codes used by the engine.

| Player | Positions | Source |
|---|---|---|
| Нико О’Райли | LB CM CDM | [EA](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/nico-o-reilly/277427) |
| Неймар | CAM CM ST LW | [FC 26 normal](https://www.fut.gg/players/190871-neymar-jr/26-190871/) |
| Джейк О’Брайен | RB CB | [EA](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/jake-o-brien/253510) |
| Лукас Хёгсберг | CB | [EA](https://www.ea.com/es/games/ea-sports-fc/ratings/player-ratings/lucas-h-gsberg/276377) |
| Никлас Рёйкйер | CM CDM | [EA](https://www.privacyappendix.ea.com/nb/games/ea-sports-fc/ratings/player-ratings/nicklas-r-jkj-r/238132) |
| Оскар Хёйлун | CM CDM | [EA](https://www.ea.com/nb/games/ea-sports-fc/ratings/player-ratings/oscar-h-jlund/274952) |
| Оуз Айдын | LM RM LW RW | [EA](https://www.ea.com/es-mx/games/ea-sports-fc/ratings/player-ratings/oguz-ayd-n/264001) |
| Семих Кылычсой | ST CAM | [EA](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/semih-k-l-csoy/274616) |
| Фредрик Шёволд | RB RM | [EA](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/fredrik-sj-vold/268375) |
| Гонсалу Франку | CDM CM | [EA](https://www.ea.com/es/games/ea-sports-fc/ratings/player-ratings/goncalo-franco/258596) |
| Демир Эге Тыкназ | CDM CM | [EA](https://www.ea.com/es/games/ea-sports-fc/ratings/player-ratings/demir-ege-t-knaz/277871) |
| Лукас Роса | RB LB CDM | [EA](https://careers.ea.com/es/games/ea-sports-fc/ratings/player-ratings/lucas-rosa/272357) |
| Оливер Сёренсен | CM CAM | [EA](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/oliver-s-rensen/257972) |
| Сондре Эрйасетер | LW LM | [EA](https://www.ea.com/nl/games/ea-sports-fc/ratings/player-ratings/sondre-rjas-ter/70801) |
| Гонсалу Боргеш | RW LW RM LM | [EA](https://www.ea.com/es/games/ea-sports-fc/ratings/player-ratings/goncalo-borges/266453) |
| Жоау Мендеш | LB LM LW | [EA](https://www.ea.com/es-mx/games/ea-sports-fc/ratings/player-ratings/joao-mendes/266461) |
| Симоне Д’Уффици | LM LW | [EA](https://www.ea.com/fr/games/ea-sports-fc/ratings/player-ratings/simone-d-uffizi/276701) |
| Алберт Посядала | GK | [EA](https://www.privacyappendix.ea.com/tr/games/ea-sports-fc/ratings/player-ratings/albert-posiada-a/269971) |
| Берту Йылдырым | ST | [EA](https://www.ea.com/es/games/ea-sports-fc/ratings/player-ratings/bertug-y-ld-r-m/267905) |
| Матиас Хёлё | CDM CM | [EA](https://www.ea.com/nb/games/ea-sports-fc/ratings/player-ratings/mathias-kj-l/259478) |
| Филип Йагелло | CM CAM | [EA](https://www.privacyappendix.ea.com/es/games/ea-sports-fc/ratings/player-ratings/filip-jagie-o/220912) |

Spot check of the existing import: [Vitinha, CM CDM](https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/vitinha/255253).
