// Картинки: эмблемы клубов (лежат в img/clubs) и фото игроков (грузятся с Википедии в браузере игрока).
// Эмблемы: набор football-logos (github.com/luukhopman/football-logos).
'use strict';

const CRESTS = {
  'АИК': 'aik.png',
  'Айнтрахт': 'ayntraht.png',
  'Андерлехт': 'anderleht.png',
  'Арсенал': 'arsenal.png',
  'Астон Вилла': 'aston-villa.png',
  'Аталанта': 'atalanta.png',
  'Атлетик Бильбао': 'atletik-bilbao.png',
  'Атлетико': 'atletiko.png',
  'Аякс': 'ayaks.png',
  'Бавария': 'bavariya.png',
  'Базель': 'bazel.png',
  'Байер': 'bayer.png',
  'Барселона': 'barselona.png',
  'Бенфика': 'benfika.png',
  'Бешикташ': 'beshiktash.png',
  'Борнмут': 'bornmut.png',
  'Боруссия Дортмунд': 'borussiya-dortmund.png',
  'Боруссия Мёнхенгладбах': 'borussiya-menhengladbah.png',
  'Бохум': 'bohum.png',
  'Брайтон': 'brayton.png',
  'Брентфорд': 'brentford.png',
  'Броммапойкарна': 'brommapoykarna.png',
  'Валенсия': 'valensiya.png',
  'Вердер': 'verder.png',
  'Верона': 'verona.png',
  'Вест Хэм': 'vest-hem.png',
  'Виллем II': 'villem-ii.png',
  'Вильярреал': 'vilyarreal.png',
  'Вольфсбург': 'volfsburg.png',
  'Вулверхэмптон': 'vulverhempton.png',
  'Гавр': 'gavr.png',
  'Галатасарай': 'galatasaray.png',
  'Гамбург': 'gamburg.png',
  'Генк': 'genk.png',
  'Герта': 'gerta.png',
  'Гронинген': 'groningen.png',
  'Данди Юнайтед': 'dandi-yunayted.png',
  'Динамо Загреб': 'dinamo-zagreb.png',
  'Зальцбург': 'zaltsburg.png',
  'Зенит': 'zenit.png',
  'Интер': 'inter.png',
  'Ковентри': 'koventri.png',
  'Комо': 'komo.png',
  'Копенгаген': 'kopengagen.png',
  'Краснодар': 'krasnodar.png',
  'Кристал Пэлас': 'kristal-pelas.png',
  'Лас-Пальмас': 'las-palmas.png',
  'Лацио': 'latsio.png',
  'Ле-Ман': 'le-man.png',
  'Лестер': 'lester.png',
  'Лех': 'leh.png',
  'Ливерпуль': 'liverpul.png',
  'Лилль': 'lill.png',
  'Лион': 'lion.png',
  'Локомотив': 'lokomotiv.png',
  'Локомотив Москва': 'lokomotiv-moskva.png',
  'Мальмё': 'malme.png',
  'Манчестер Сити': 'manchester-siti.png',
  'Манчестер Юнайтед': 'manchester-yunayted.png',
  'Марсель': 'marsel.png',
  'Мец': 'mets.png',
  'Милан': 'milan.png',
  'Мольде': 'molde.png',
  'Монако': 'monako.png',
  'Наполи': 'napoli.png',
  'Ницца': 'nitstsa.png',
  'Ноттингем Форест': 'nottingem-forest.png',
  'Ньюкасл': 'nyukasl.png',
  'ПСВ': 'psv.png',
  'ПСЖ': 'pszh.png',
  'Парма': 'parma.png',
  'Партизан': 'partizan.png',
  'Порту': 'portu.png',
  'РБ Лейпциг': 'rb-leyptsig.png',
  'Реал Мадрид': 'real-madrid.png',
  'Реал Сосьедад': 'real-sosedad.png',
  'Реймс': 'reyms.png',
  'Ренн': 'renn.png',
  'Рома': 'roma.png',
  'Рубин': 'rubin.png',
  'Сампдория': 'sampdoriya.png',
  'Санкт-Паули': 'sankt-pauli.png',
  'Саутгемптон': 'sautgempton.png',
  'Севилья': 'sevilya.png',
  'Селтик': 'seltik.png',
  'Сент-Этьен': 'sent-eten.png',
  'Спартак': 'spartak.png',
  'Спортинг': 'sporting.png',
  'Сьон': 'son.png',
  'Тоттенхэм': 'tottenhem.png',
  'Трабзонспор': 'trabzonspor.png',
  'Труа': 'trua.png',
  'Удинезе': 'udineze.png',
  'Фейеноорд': 'feyenoord.png',
  'Фенербахче': 'fenerbahche.png',
  'Фиорентина': 'fiorentina.png',
  'Халл Сити': 'hall-siti.png',
  'Хетафе': 'hetafe.png',
  'ЦСКА': 'tsska.png',
  'Челси': 'chelsi.png',
  'Шальке': 'shalke.png',
  'Шарлеруа': 'sharlerua.png',
  'Шахтёр': 'shahter.png',
  'Штурм': 'shturm.png',
  'Штутгарт': 'shtutgart.png',
  'Эвертон': 'everton.png',
  'Эспаньол': 'espanol.png',
  'Ювентус': 'yuventus.png',
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

// Фото игрока: сначала показываем инициалы, потом подменяем на фото, если оно загрузилось.
const Photos = (() => {
  const KEY = 'oldjacksons.photos.v1';
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* без кэша */ } };
  const pending = new Map();

  function title(name) {
    if (WIKI[name]) return WIKI[name];
    const p = PLAYERS.find((x) => x.name === name);
    if (!p) return null;
    return p.alt.split(' ').slice(0, name.split(' ').length).join(' ');
  }

  async function summary(t) {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`);
    if (!r.ok) return null;
    return r.json();
  }

  async function load(name) {
    if (name in cache) return cache[name];
    if (pending.has(name)) return pending.get(name);
    const job = (async () => {
      const t = title(name);
      let url = null;
      try {
        if (t) {
          let s = await summary(t);
          const isFootballer = (x) => x && x.type !== 'disambiguation' && /football|soccer/i.test(x.description || '');
          if (!isFootballer(s)) s = await summary(t + ' (footballer)').catch(() => null);
          if (isFootballer(s) && s.thumbnail) url = s.thumbnail.source;
        }
        cache[name] = url;
        save();
      } catch (e) { /* сеть недоступна: оставим инициалы и попробуем в другой раз */ }
      pending.delete(name);
      return url;
    })();
    pending.set(name, job);
    return job;
  }

  // Найти все [data-ph] внутри root и подставить фото.
  function hydrate(root = document) {
    $$('[data-ph]', root).forEach(async (el) => {
      const url = await load(el.dataset.ph);
      if (!url || !el.isConnected) return;
      const img = new Image();
      img.alt = '';
      img.onload = () => { el.innerHTML = ''; el.appendChild(img); el.classList.add('has-photo'); };
      img.src = url;
    });
  }

  return { hydrate, load };
})();

function avatar(name, size = 'm', club = null) {
  const ini = name.replace(/\(.*\)/, '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('');
  return `<span class="ava ava-${size}" data-ph="${esc(name)}">${club && CRESTS[club] ? crestImg(club, 'xs') : ''}<b>${esc(ini)}</b></span>`;
}
