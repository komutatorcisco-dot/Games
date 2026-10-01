// Картинки: эмблемы клубов (лежат в img/clubs) и фото игроков (грузятся с Википедии в браузере игрока).
// Эмблемы: набор football-logos (github.com/luukhopman/football-logos).
'use strict';

const CRESTS = {
  'АИК': 'aik.webp',
  'Айнтрахт': 'ayntraht.webp',
  'Андерлехт': 'anderleht.webp',
  'Арсенал': 'arsenal.webp',
  'Астон Вилла': 'aston-villa.webp',
  'Аталанта': 'atalanta.webp',
  'Атлетик Бильбао': 'atletik-bilbao.webp',
  'Атлетико': 'atletiko.webp',
  'Аякс': 'ayaks.webp',
  'Бавария': 'bavariya.webp',
  'Базель': 'bazel.webp',
  'Байер': 'bayer.webp',
  'Барселона': 'barselona.webp',
  'Бенфика': 'benfika.webp',
  'Бешикташ': 'beshiktash.webp',
  'Борнмут': 'bornmut.webp',
  'Боруссия Дортмунд': 'borussiya-dortmund.webp',
  'Боруссия Мёнхенгладбах': 'borussiya-menhengladbah.webp',
  'Бохум': 'bohum.webp',
  'Брайтон': 'brayton.webp',
  'Брентфорд': 'brentford.webp',
  'Броммапойкарна': 'brommapoykarna.webp',
  'Валенсия': 'valensiya.webp',
  'Вердер': 'verder.webp',
  'Верона': 'verona.webp',
  'Вест Хэм': 'vest-hem.webp',
  'Виллем II': 'villem-ii.webp',
  'Вильярреал': 'vilyarreal.webp',
  'Вольфсбург': 'volfsburg.webp',
  'Вулверхэмптон': 'vulverhempton.webp',
  'Гавр': 'gavr.webp',
  'Галатасарай': 'galatasaray.webp',
  'Гамбург': 'gamburg.webp',
  'Генк': 'genk.webp',
  'Герта': 'gerta.webp',
  'Гронинген': 'groningen.webp',
  'Данди Юнайтед': 'dandi-yunayted.webp',
  'Динамо Загреб': 'dinamo-zagreb.webp',
  'Зальцбург': 'zaltsburg.webp',
  'Зенит': 'zenit.webp',
  'Интер': 'inter.webp',
  'Ковентри': 'koventri.webp',
  'Комо': 'komo.webp',
  'Копенгаген': 'kopengagen.webp',
  'Краснодар': 'krasnodar.webp',
  'Кристал Пэлас': 'kristal-pelas.webp',
  'Лас-Пальмас': 'las-palmas.webp',
  'Лацио': 'latsio.webp',
  'Ле-Ман': 'le-man.webp',
  'Лестер': 'lester.webp',
  'Лех': 'leh.webp',
  'Ливерпуль': 'liverpul.webp',
  'Лилль': 'lill.webp',
  'Лион': 'lion.webp',
  'Локомотив': 'lokomotiv.webp',
  'Локомотив Москва': 'lokomotiv-moskva.webp',
  'Мальмё': 'malme.webp',
  'Манчестер Сити': 'manchester-siti.webp',
  'Манчестер Юнайтед': 'manchester-yunayted.webp',
  'Марсель': 'marsel.webp',
  'Мец': 'mets.webp',
  'Милан': 'milan.webp',
  'Мольде': 'molde.webp',
  'Монако': 'monako.webp',
  'Наполи': 'napoli.webp',
  'Ницца': 'nitstsa.webp',
  'Ноттингем Форест': 'nottingem-forest.webp',
  'Ньюкасл': 'nyukasl.webp',
  'ПСВ': 'psv.webp',
  'ПСЖ': 'pszh.webp',
  'Парма': 'parma.webp',
  'Партизан': 'partizan.webp',
  'Порту': 'portu.webp',
  'РБ Лейпциг': 'rb-leyptsig.webp',
  'Реал Мадрид': 'real-madrid.webp',
  'Реал Сосьедад': 'real-sosedad.webp',
  'Реймс': 'reyms.webp',
  'Ренн': 'renn.webp',
  'Рома': 'roma.webp',
  'Рубин': 'rubin.webp',
  'Сампдория': 'sampdoriya.webp',
  'Санкт-Паули': 'sankt-pauli.webp',
  'Саутгемптон': 'sautgempton.webp',
  'Севилья': 'sevilya.webp',
  'Селтик': 'seltik.webp',
  'Сент-Этьен': 'sent-eten.webp',
  'Спартак': 'spartak.webp',
  'Спортинг': 'sporting.webp',
  'Сьон': 'son.webp',
  'Тоттенхэм': 'tottenhem.webp',
  'Трабзонспор': 'trabzonspor.webp',
  'Труа': 'trua.webp',
  'Удинезе': 'udineze.webp',
  'Фейеноорд': 'feyenoord.webp',
  'Фенербахче': 'fenerbahche.webp',
  'Фиорентина': 'fiorentina.webp',
  'Халл Сити': 'hall-siti.webp',
  'Хетафе': 'hetafe.webp',
  'ЦСКА': 'tsska.webp',
  'Челси': 'chelsi.webp',
  'Шальке': 'shalke.webp',
  'Шарлеруа': 'sharlerua.webp',
  'Шахтёр': 'shahter.webp',
  'Штурм': 'shturm.webp',
  'Штутгарт': 'shtutgart.webp',
  'Эвертон': 'everton.webp',
  'Эспаньол': 'espanol.webp',
  'Ювентус': 'yuventus.webp',
};

// Лица игроков (img/players/<id>.webp) из набора FIFA-Player-Faces (github.com/saihari/FIFA-Player-Faces).
const FACES = {
  // Легенды для «Возьмёшь этого или другого?»
  'Марсело': 176676,
  'Кейлор Навас': 193041,
  'Пепе': 120533,
  'Рафаэль Варан': 201535,
  'Рауль': 45661,
  'Гути': 9593,
  'Роберто Карлос': 1040,
  'Жерар Пике': 152729,
  'Дани Алвес': 146530,
  'Жорди Альба': 189332,
  'Хавьер Маскерано': 142754,
  'Хави': 10535,
  'Андрес Иньеста': 41,
  'Серхио Бускетс': 189511,
  'Иван Ракитич': 168651,
  'Самюэль Это’о': 9676,
  'Ривалдо': 4231,
  'Давид Вилья': 113422,
  'Карлес Пуйоль': 13038,
  'Давид де Хеа': 193080,
  'Неманья Видич': 140601,
  'Патрис Эвра': 52091,
  'Майкл Каррик': 21146,
  'Уэйн Руни': 54050,
  'Дида': 3712,
  'Алессандро Неста': 1088,
  'Кларенс Зеедорф': 1256,
  'Дженнаро Гаттузо': 4202,
  'Андрей Шевченко': 13128,
  'Филиппо Индзаги': 1198,
  'Пепе Рейна': 24630,
  'Даниэль Аггер': 152039,
  'Мартин Шкртел': 166706,
  'Стивен Джеррард': 13743,
  'Хаби Алонсо': 45197,
  'Джордан Хендерсон': 183711,
  'Икер Касильяс': 5479,
  'Александер Исак': 233731,
  'Александер Сёрлот': 216549,
  'Алексис Мак Аллистер': 239837,
  'Алексис Санчес': 184941,
  'Алессандро Бастони': 237383,
  'Алехандро Бальде': 263578,
  'Алиссон': 212831,
  'Альфонсо Дэвис': 234396,
  'Андреа Пирло': 7763,
  'Андреас Кристенсен': 213661,
  'Андрий Лунин': 243952,
  'Антонио Рюдигер': 205452,
  'Антуан Гризманн': 194765,
  'Анхель Ди Мария': 183898,
  'Арьен Роббен': 9014,
  'Ашраф Хакими': 235212,
  'Бен Уайт': 231936,
  'Беньямин Шешко': 260592,
  'Бернарду Силва': 218667,
  'Браим Диас': 231410,
  'Брайан Мбемо': 243014,
  'Бруну Гимарайнш': 247851,
  'Бруну Фернандеш': 212198,
  'Букайо Сака': 246669,
  'Ватару Эндо': 232487,
  'Виктор Дьёкереш': 241651,
  'Виктор Осимхен': 232293,
  'Вильям Салиба': 243715,
  'Вильян Пачо': 256196,
  'Винисиус Жуниор': 238794,
  'Вирджил ван Дейк': 203376,
  'Витинья': 255253,
  'Войцех Щенсны': 186153,
  'Габриэл Жезус': 230666,
  'Габриэл Магальяйнс': 232580,
  'Габриэл Мартинелли': 251566,
  'Гави': 264240,
  'Гарет Бэйл': 173731,
  'Гарри Кейн': 202126,
  'Гарри Магуайр': 203263,
  'Гиорги Мамардашвили': 262621,
  'Глейсон Бремер': 239580,
  'Гонсало Игуаин': 167664,
  'Гонсалу Рамуш': 256903,
  'Давид Райя': 220901,
  'Дайо Упамекано': 229558,
  'Дани Ольмо': 244260,
  'Деклан Райс': 234378,
  'Дензел Дюмфрис': 233096,
  'Джамал Мусиала': 256790,
  'Джанлуиджи Буффон': 1179,
  'Джанлуиджи Доннарумма': 230621,
  'Джек Грилиш': 206517,
  'Джереми Фримпонг': 253149,
  'Джо Гомес': 225100,
  'Джуд Беллингем': 252371,
  'Дидье Дрогба': 31432,
  'Диогу Далот': 234574,
  'Доминик Собослаи': 236772,
  'Душан Влахович': 246430,
  'Дэвид Бекхэм': 250,
  'Жоан Гарсия': 259532,
  'Жоау Педро': 252042,
  'Жоау Феликс': 242444,
  'Жоржиньо': 205498,
  'Жуан Канселу': 210514,
  'Жюль Кунде': 241486,
  'Златан Ибрагимович': 41236,
  'Ибраима Конате': 237678,
  'Илья Забарный': 258781,
  'Иньяки Уильямс': 216201,
  'Йозуа Киммих': 212622,
  'Йонатан Та': 213331,
  'Йошко Гвардиол': 251517,
  'Каземиро': 200145,
  'Кай Хаверц': 235790,
  'Кака': 138449,
  'Карим Адейеми': 251852,
  'Карим Бензема': 165153,
  'Кевин Де Брюйне': 192985,
  'Кепа Аррисабалага': 206585,
  'Кертис Джонс': 242434,
  'Килиан Мбаппе': 231747,
  'Коди Гакпо': 242516,
  'Коке': 193747,
  'Конрад Лаймер': 225375,
  'Коул Палмер': 257534,
  'Кристиан Пулишич': 227796,
  'Криштиану Роналду': 20801,
  'Лаутаро Мартинес': 231478,
  'Леви Колуилл': 262859,
  'Леон Горецка': 209658,
  'Лерой Сане': 222492,
  'Лионель Месси': 158023,
  'Луис Диас': 241084,
  'Луис Суарес': 176580,
  'Луиш Фигу': 5589,
  'Лука Модрич': 177003,
  'Люка Шевалье': 251752,
  'Люка Эрнандес': 220814,
  'Майкл Олисе': 247827,
  'Мануэль Локателли': 222077,
  'Мануэль Нойер': 167495,
  'Марк Гэи': 241159,
  'Марк Кукурелья': 239231,
  'Марк-Андре тер Штеген': 192448,
  'Маркиньос': 207865,
  'Маркюс Тюрам': 228093,
  'Мартин Субименди': 248148,
  'Мартин Эдегор': 222665,
  'Матвей Сафонов': 240225,
  'Матео Ковачич': 207410,
  'Матеус Кунья': 240243,
  'Матеус Нунес': 253124,
  'Микель Мерино': 225193,
  'Мики ван де Вен': 264453,
  'Михаил Мудрик': 246340,
  'Мойсес Кайседо': 256079,
  'Морган Роджерс': 260247,
  'Мохамед Салах': 209331,
  'Неймар': 190871,
  'Нико Уильямс': 256516,
  'Николо Барелла': 224232,
  'Нони Мадуэке': 254796,
  'Нуну Мендеш': 252145,
  'Олли Уоткинс': 221697,
  'Омар Мармуш': 256675,
  'Орельен Чуамени': 241637,
  'Патрик Шик': 234236,
  'Пауло Дибала': 211110,
  'Педри': 251854,
  'Педру Нету': 238616,
  'Поль Погба': 195864,
  'Пьеро Инкапье': 256197,
  'Райан Гравенберх': 246104,
  'Райан Шерки': 251570,
  'Расмус Хёйлунн': 259399,
  'Рафаэл Леау': 241721,
  'Рафинья': 233419,
  'Рахим Стерлинг': 202652,
  'Риккардо Калафьори': 257711,
  'Рис Джеймс': 238074,
  'Рияд Марез': 204485,
  'Роберт Левандовски': 188545,
  'Роберт Санчес': 228789,
  'Робин ван Перси': 7826,
  'Родри': 231866,
  'Родриго': 243812,
  'Ромелу Лукаку': 192505,
  'Роналдиньо': 28130,
  'Рубен Диаш': 239818,
  'Садио Мане': 208722,
  'Сандро Тонали': 241096,
  'Серж Гнабри': 206113,
  'Серхио Рамос': 155862,
  'Сеск Фабрегас': 162895,
  'Скотт Мактоминей': 237238,
  'Сон Хын Мин': 200104,
  'Станислав Лоботка': 216435,
  'Тибо Куртуа': 192119,
  'Томас Мюллер': 189596,
  'Тони Кроос': 182521,
  'Трент Александер-Арнольд': 231281,
  'Тьерри Анри': 1625,
  'Уго Экитике': 257289,
  'Усман Дембеле': 231443,
  'Уэсли Снейдер': 139869,
  'Фабиан Руис': 226271,
  'Федерико Вальверде': 239053,
  'Федерико Димарко': 226268,
  'Федерико Кьеза': 235805,
  'Ферлан Менди': 228618,
  'Ферран Торрес': 241461,
  'Фил Фоден': 237692,
  'Филиппе Коутиньо': 189242,
  'Флориан Вирц': 256630,
  'Френки де Йонг': 228702,
  'Хави Симонс': 245367,
  'Херонимо Рульи': 215316,
  'Христос Цолис': 256948,
  'Хулиан Альварес': 246191,
  'Эберечи Эзе': 235794,
  'Эден Азар': 183277,
  'Эдер Милитао': 240130,
  'Эдинсон Кавани': 179813,
  'Эдуардо Камавинга': 248243,
  'Эндрю Робертсон': 216267,
  'Энтони': 255475,
  'Энтони Гордон': 242964,
  'Энцо Фернандес': 247090,
  'Эрик Гарсия': 245037,
  'Эрлинг Холанд': 239085,
  'Юрриен Тимбер': 251805,
  'Ян Облак': 200389,
};

// Английские названия статей Википедии для тех, у кого имя неоднозначное или кого нет в базе игроков.
const WIKI = {
  'Родри': 'Rodri (footballer, born 1996)', 'Гави': 'Gavi (footballer)', 'Алиссон': 'Alisson Becker',
  'Витинья': 'Vitinha (footballer, born 2000)', 'Маркиньос': 'Marquinhos', 'Эндрик': 'Endrick (footballer)',
  'Жоау Педро': 'João Pedro (footballer, born 2001)', 'Сон Хын Мин': 'Son Heung-min', 'Луис Диас': 'Luis Díaz (footballer, born 1997)',
  'Фабиан Руис': 'Fabián Ruiz', 'Педри': 'Pedri', 'Коке': 'Koke', 'Неймар': 'Neymar', 'Родриго': 'Rodrygo', 'Рафинья': 'Raphinha',
  'Жоан Гарсия': 'Joan García', 'Эрик Гарсия': 'Eric García (footballer, born 2001)', 'Роберт Санчес': 'Robert Sánchez (footballer)',
  'Габриэл Магальяйнс': 'Gabriel Magalhães', 'Габриэл Жезус': 'Gabriel Jesus', 'Габриэл Мартинелли': 'Gabriel Martinelli',
  'Бруну Гимарайнш': 'Bruno Guimarães', 'Энтони': 'Antony (footballer, born 2000)',
  'Тони Кроос': 'Toni Kroos', 'Серхио Рамос': 'Sergio Ramos', 'Луис Суарес': 'Luis Suárez', 'Поль Погба': 'Paul Pogba',
  'Гарет Бэйл': 'Gareth Bale', 'Златан Ибрагимович': 'Zlatan Ibrahimović', 'Эден Азар': 'Eden Hazard', 'Анхель Ди Мария': 'Ángel Di María',
  'Ромелу Лукаку': 'Romelu Lukaku', 'Гонсало Игуаин': 'Gonzalo Higuaín', 'Сеск Фабрегас': 'Cesc Fàbregas', 'Тьерри Анри': 'Thierry Henry',
  'Дэвид Бекхэм': 'David Beckham', 'Роналдиньо': 'Ronaldinho', 'Роналдо (Феномен)': 'Ronaldo (Brazilian footballer)', 'Кака': 'Kaká',
  'Андреа Пирло': 'Andrea Pirlo', 'Джанлуиджи Буффон': 'Gianluigi Buffon', 'Дидье Дрогба': 'Didier Drogba', 'Фернандо Торрес': 'Fernando Torres',
  'Уэсли Снейдер': 'Wesley Sneijder', 'Робин ван Перси': 'Robin van Persie', 'Арьен Роббен': 'Arjen Robben', 'Эдинсон Кавани': 'Edinson Cavani',
  'Алексис Санчес': 'Alexis Sánchez', 'Рияд Марез': 'Riyad Mahrez', 'Филиппе Коутиньо': 'Philippe Coutinho', 'Леон Горецка': 'Leon Goretzka',
  'Жоржиньо': 'Jorginho (footballer, born 1991)', 'Каземиро': 'Casemiro', 'Жоау Феликс': 'João Félix', 'Джек Грилиш': 'Jack Grealish',
  'Гарри Магуайр': 'Harry Maguire', 'Кепа Аррисабалага': 'Kepa Arrizabalaga', 'Зинедин Зидан': 'Zinedine Zidane', 'Луиш Фигу': 'Luís Figo',
  'Михаил Мудрик': 'Mykhailo Mudryk', 'Рахим Стерлинг': 'Raheem Sterling', 'Мохамед Салах': 'Mohamed Salah',
};

function crestImg(club, size = 's') {
  const f = CRESTS[club];
  if (f) return `<img class="crest crest-${size}" src="img/clubs/${f}" alt="${esc(club)}" loading="lazy">`;
  const ini = club.split(/[\s-]+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return `<span class="crest crest-${size} crest-none" aria-hidden="true">${esc(ini)}</span>`;
}

// Фото игрока: своё фото из img/players, а для тех, кого нет в наборе, — с Википедии (на GitHub Pages и в Telegram).
// Картинка появляется плавно, без прыжков: до загрузки виден кружок с инициалами.
const Photos = (() => {
  const KEY = 'oldjacksons.photos.v2';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* без кэша */ } };
  const pending = new Map();

  function title(name) {
    if (WIKI[name]) return WIKI[name];
    const p = PLAYERS.find((x) => x.name === name);
    return p ? p.alt.split(' ').slice(0, name.split(' ').length).join(' ') : null;
  }
  async function summary(t) {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`);
    return r.ok ? r.json() : null;
  }
  async function wiki(name) {
    if (name in cache) return cache[name];
    if (pending.has(name)) return pending.get(name);
    const job = (async () => {
      let url = null;
      try {
        const t = title(name);
        if (t) {
          const ok = (x) => x && x.type !== 'disambiguation' && /football|soccer/i.test(x.description || '');
          let s = await summary(t);
          if (!ok(s)) s = await summary(t + ' (footballer)').catch(() => null);
          if (ok(s) && s.thumbnail) url = s.thumbnail.source;
        }
        cache[name] = url;
        save();
      } catch (e) { /* сеть недоступна: остаются инициалы */ }
      pending.delete(name);
      return url;
    })();
    pending.set(name, job);
    return job;
  }

  function show(el, url) {
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    if (img.complete && img.naturalWidth) { el.appendChild(img); el.classList.add('loaded', 'instant'); return; }
    img.onload = () => { if (el.isConnected) { el.appendChild(img); requestAnimationFrame(() => el.classList.add('loaded')); } };
  }

  function hydrate(root = document) {
    $$('[data-ph]:not(.hyd)', root).forEach(async (el) => {
      el.classList.add('hyd');
      const name = el.dataset.ph;
      if (FACES[name]) return show(el, `img/players/${FACES[name]}.webp`);
      const url = await wiki(name);
      if (url) show(el, url);
    });
  }

  // Заранее подгрузить фото, чтобы карточка появилась уже с лицом.
  function preload(name) {
    if (FACES[name]) { const i = new Image(); i.src = `img/players/${FACES[name]}.webp`; }
  }

  return { hydrate, preload };
})();

function avatar(name, size = 'm') {
  const ini = name.replace(/\(.*\)/, '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('');
  return `<span class="ava ava-${size}" data-ph="${esc(name)}"><b>${esc(ini)}</b></span>`;
}
