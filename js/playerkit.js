// Внешность 3D-футболиста из assets3d/player.glb: форма, номер, кожа, волосы, причёска, телосложение,
// рост, вариант бега/удара — всё кодом из одного файла модели. Тысячи разных игроков без новых файлов.
//
//   const look = PlayerKit.forCard(card);          // карточка из Cards.all(): клуб → форма, номер из истории,
//                                                  // внешность — по card.key (у игрока всегда одна и та же)
//   const p = THREE.SkeletonUtils.clone(gltf.scene);
//   PlayerKit.apply(p, look);                      // краска, причёска, морфы, рост (p.scale)
//   mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, look.run)).play();   // look.kick — удар
//
// Модель: материалы skin, hair, shirt, shorts, socks, boots, eyes, brows, hair_<стиль>;
// причёски — сетки JG_Hair_short|medium|afro (видна одна или ни одной); морфы slim, heavy, muscular;
// анимации-позы stand, run, run2, kick, kick2 (run+run2 — два шага бега, kick2 — замах, kick — удар).
// Развёртка майки (tools/art/player/build_player.py): верх 75% текстуры — туловище по кругу
// (x: 0.25 грудь, 0.75 спина), y 0 — ворот, 0.75 — подол; рукава — полоса y 0.78..0.98.
'use strict';

const PlayerKit = (() => {
  const PATTERNS = ['plain', 'stripes', 'pinstripes', 'hoops', 'halves', 'sash', 'sleeves', 'band'];
  const SKIN = ['#ffe3cc', '#f0c39f', '#d9a27a', '#b07850', '#8a5636', '#5e3a24'];   // множитель к светлой коже
  const HAIR = ['#120c08', '#2b1a10', '#4a2e18', '#8a5a2b', '#c9a05a', '#1a1a1a'];
  const STYLES = ['buzz', 'short', 'medium', 'afro', 'shaved'];   // buzz — «ёжик», shaved — почти под ноль
  const SIZE = 512;

  // Домашние формы известных клубов: только цвета и узор (без гербов и спонсоров).
  const K = (pattern, c1, c2, shorts, socks) => ({ pattern, c1, c2, shorts, socks });
  const KITS = {
    'Реал Мадрид': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'Барселона': K('stripes', '#0a2a73', '#7a0a26', '#0a1a4a', '#7a0a26'),
    'Атлетико': K('stripes', '#ffffff', '#c8102e', '#1b2a5e', '#c8102e'),
    'Атлетик Бильбао': K('stripes', '#ffffff', '#d0102a', '#111111', '#111111'),
    'Ливерпуль': K('plain', '#c8102e', '#c8102e', '#c8102e', '#c8102e'),
    'Манчестер Сити': K('plain', '#6cabdd', '#6cabdd', '#ffffff', '#6cabdd'),
    'Арсенал': K('sleeves', '#db0007', '#ffffff', '#ffffff', '#db0007'),
    'Челси': K('plain', '#034694', '#034694', '#034694', '#ffffff'),
    'Манчестер Юнайтед': K('plain', '#da291c', '#da291c', '#ffffff', '#111111'),
    'Тоттенхэм': K('plain', '#ffffff', '#ffffff', '#132257', '#ffffff'),
    'Бавария': K('plain', '#dc052d', '#dc052d', '#dc052d', '#dc052d'),
    'Байер': K('plain', '#e32221', '#111111', '#111111', '#e32221'),
    'ПСЖ': K('band', '#0b1f45', '#d0102a', '#0b1f45', '#0b1f45'),
    'Наполи': K('plain', '#12a0d7', '#12a0d7', '#ffffff', '#12a0d7'),
    'Милан': K('stripes', '#111111', '#fb090b', '#ffffff', '#111111'),
    'Интер': K('stripes', '#111111', '#0068a8', '#111111', '#111111'),
    'Ювентус': K('stripes', '#111111', '#ffffff', '#ffffff', '#ffffff'),
    'Рома': K('plain', '#8e1f2f', '#8e1f2f', '#8e1f2f', '#8e1f2f'),
    'Галатасарай': K('halves', '#fdb912', '#a90432', '#ffffff', '#a90432'),
    'Фенербахче': K('stripes', '#163962', '#ffed00', '#ffffff', '#163962'),
    'Бешикташ': K('plain', '#ffffff', '#ffffff', '#111111', '#111111'),
    'Аякс': K('band', '#ffffff', '#d2122e', '#ffffff', '#ffffff'),
    'Астон Вилла': K('sleeves', '#670e36', '#95bfe5', '#ffffff', '#670e36'),
    'Эвертон': K('plain', '#003399', '#003399', '#ffffff', '#ffffff'),
    'Ньюкасл': K('stripes', '#ffffff', '#111111', '#111111', '#111111'),
    'Боруссия Дортмунд': K('plain', '#fde100', '#fde100', '#111111', '#fde100'),
    'Порту': K('stripes', '#ffffff', '#1a4ea2', '#1a4ea2', '#ffffff'),
    'Аталанта': K('stripes', '#111111', '#1e71b8', '#111111', '#111111'),
    'Аль-Хиляль': K('plain', '#005eb8', '#005eb8', '#ffffff', '#005eb8'),
    'Аль-Наср': K('plain', '#fbe122', '#fbe122', '#1d3b8a', '#fbe122'),
    'Интер Майами': K('plain', '#f7b5cd', '#f7b5cd', '#f7b5cd', '#f7b5cd'),
    'Бенфика': K('plain', '#e30613', '#e30613', '#ffffff', '#e30613'),
    'Спортинг': K('hoops', '#00845a', '#ffffff', '#111111', '#00845a'),
    'Селтик': K('hoops', '#018749', '#ffffff', '#ffffff', '#ffffff'),
    'Рейнджерс': K('plain', '#1b458f', '#1b458f', '#ffffff', '#111111'),
    'Бока Хуниорс': K('plain', '#103f79', '#f3b229', '#103f79', '#103f79'),
    'Ривер Плейт': K('sash', '#ffffff', '#d0102a', '#111111', '#ffffff'),
    'ПСВ': K('stripes', '#ffffff', '#ed1c24', '#111111', '#ed1c24'),
    'Фейеноорд': K('halves', '#ffffff', '#d2122e', '#111111', '#111111'),
    'Вест Хэм': K('sleeves', '#7a263a', '#1bb1e7', '#ffffff', '#ffffff'),
    'Лацио': K('plain', '#87d8f7', '#87d8f7', '#ffffff', '#87d8f7'),
    'Фиорентина': K('plain', '#482e92', '#482e92', '#482e92', '#482e92'),
    'Севилья': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'Валенсия': K('plain', '#ffffff', '#ffffff', '#111111', '#111111'),
    'Бетис': K('stripes', '#ffffff', '#00954c', '#00954c', '#00954c'),
    'Марсель': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'Лион': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'РБ Лейпциг': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'Брайтон': K('stripes', '#ffffff', '#0057b8', '#0057b8', '#ffffff'),
    'Кристал Пэлас': K('stripes', '#1b458f', '#c4122e', '#1b458f', '#1b458f'),
    'Вулверхэмптон': K('plain', '#fdb913', '#fdb913', '#231f20', '#fdb913'),
    'Ноттингем Форест': K('plain', '#e53233', '#e53233', '#ffffff', '#e53233'),
    'Фулхэм': K('plain', '#ffffff', '#ffffff', '#111111', '#ffffff'),
    'Брентфорд': K('stripes', '#ffffff', '#e30613', '#111111', '#e30613'),
    'Сандерленд': K('stripes', '#ffffff', '#eb172b', '#111111', '#111111'),
    'Лидс': K('plain', '#ffffff', '#ffffff', '#ffffff', '#ffffff'),
    'Борнмут': K('stripes', '#111111', '#da291c', '#111111', '#111111'),
  };

  const kit = (o = {}) => Object.assign({ pattern: 'plain', c1: '#e3243f', c2: '#ffffff', shorts: '#ffffff', socks: '#e3243f',
    boots: '#111111', number: null, ink: null, skin: 2, hair: HAIR[0], style: 'buzz',
    build: { slim: 0, heavy: 0, muscular: 0 }, height: 1, run: 'run', kick: 'kick' }, o);

  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };

  // ---------- текстура майки: узор + номер на спине ----------
  function shirtCanvas(k) {
    const c = document.createElement('canvas'); c.width = c.height = SIZE;
    const x = c.getContext('2d'), S = SIZE, B = S * 0.75;   // B — подол (низ туловища на текстуре)
    x.fillStyle = k.c1; x.fillRect(0, 0, S, S);
    x.fillStyle = k.c2;
    if (k.pattern === 'stripes') for (let i = 1; i < 10; i += 2) x.fillRect((i * S) / 10, 0, S / 10, S);
    if (k.pattern === 'pinstripes') for (let i = 0; i < 24; i++) x.fillRect((i * S) / 24, 0, S / 160, S);
    if (k.pattern === 'hoops') for (let i = 1; i < 8; i += 2) x.fillRect(0, (i * B) / 8, S, B / 8);
    if (k.pattern === 'halves') { x.fillRect(0, 0, S * 0.25, B); x.fillRect(S * 0.75, 0, S * 0.25, B); }
    if (k.pattern === 'sash') { x.beginPath(); x.moveTo(S * 0.12, 0); x.lineTo(S * 0.22, 0); x.lineTo(S * 0.38, B); x.lineTo(S * 0.28, B); x.closePath(); x.fill(); }
    if (k.pattern === 'sleeves') x.fillRect(0, B + 2, S, S - B);
    if (k.pattern === 'band') { x.fillRect(S * 0.18, 0, S * 0.14, B); x.fillRect(S * 0.68, 0, S * 0.14, B); }
    if (k.number != null && k.number !== '') {
      const ink = k.ink || (lum(k.pattern === 'band' || k.pattern === 'halves' ? k.c2 : k.c1) > 0.55 ? '#141414' : '#ffffff');
      x.font = `900 ${Math.round(S * 0.2)}px "Arial Black", Arial, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = S * 0.012; x.strokeStyle = lum(ink) > 0.5 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.45)';
      x.strokeText(String(k.number), S * 0.75, S * 0.33);
      x.fillStyle = ink; x.fillText(String(k.number), S * 0.75, S * 0.33);
    }
    return c;
  }

  // ---------- покрасить и настроить клон модели ----------
  function apply(root, k) {
    k = kit(k);
    let tex = null;
    const skin = typeof k.skin === 'number' ? SKIN[Math.max(0, Math.min(SKIN.length - 1, k.skin))] : k.skin;
    const hair = k.style === 'shaved' ? new THREE.Color(skin).lerp(new THREE.Color(k.hair), 0.35).getStyle() : k.hair;
    root.traverse((o) => {
      if (o.name && o.name.startsWith('JG_Hair_')) o.visible = o.name === 'JG_Hair_' + k.style;
      if (o.morphTargetDictionary && o.morphTargetInfluences) {
        for (const [n, i] of Object.entries(o.morphTargetDictionary)) o.morphTargetInfluences[i] = (k.build && k.build[n]) || 0;
      }
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => {
        const n = (m.name || '').toLowerCase();
        const role = n.startsWith('hair') ? 'hair' : n;
        if (!['skin', 'hair', 'shirt', 'shorts', 'socks', 'boots'].includes(role)) return m;
        m = m.clone();
        if (role === 'shirt') {
          if (!tex) {
            tex = new THREE.CanvasTexture(shirtCanvas(k));
            tex.flipY = false; tex.wrapS = THREE.RepeatWrapping; tex.encoding = THREE.sRGBEncoding;
          }
          m.map = tex; m.color.set('#ffffff');
        } else if (role === 'skin') m.color.set(skin).convertSRGBToLinear();   // r128: hex — это sRGB
        else if (role === 'hair') m.color.set(hair).convertSRGBToLinear();
        else m.color.set(k[role]).convertSRGBToLinear();
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    root.scale.setScalar(k.height || 1);
    return root;
  }

  // ---------- случайная внешность по seed (одна и та же для одного seed) ----------
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); };
  const hash = (str) => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const pick = (r, list, w) => { if (!w) return list[Math.floor(r() * list.length)]; let t = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < list.length; i++) if ((t -= w[i]) < 0) return list[i]; return list[0]; };

  // pos — позиция карточки (ВРТ, ЦЗ, …): вратари и центральные защитники выше и крупнее, крайние — ниже и легче
  function random(seed, base = {}, pos = '') {
    const r = rng(seed);
    const big = /ВРТ|ЦЗ|ЗАЩ/.test(pos) ? 1 : /ЛВ|ПВ|ЛП|ПП|ЦАП/.test(pos) ? -1 : 0;
    const build = { slim: 0, heavy: 0, muscular: 0 };
    const b = pick(r, ['none', 'slim', 'heavy', 'muscular'], big > 0 ? [3, 1, 2, 3] : big < 0 ? [3, 3, 0.5, 1] : [4, 2, 1, 2]);
    if (b !== 'none') build[b] = 0.35 + r() * 0.65;
    return kit(Object.assign({
      skin: Math.floor(r() * SKIN.length),
      hair: pick(r, HAIR, [5, 4, 3, 1, 1, 2]),
      style: pick(r, STYLES, [3, 3, 2, 2, 1]),
      build,
      height: +(1 + big * 0.025 + (r() - 0.5) * 0.08).toFixed(3),   // ±4% вокруг 185 см
      run: r() < 0.5 ? 'run' : 'run2',
      kick: r() < 0.6 ? 'kick' : 'kick2',
      number: r() < 0.8 ? 2 + Math.floor(r() * 29) : 31 + Math.floor(r() * 69),   // чаще 2–30, как в жизни
    }, base));
  }

  // ---------- номер из истории номеров (js/data/numhist.js): последний сезон, сначала в этом же клубе ----------
  let NUM = null;
  function numberOf(name, club, pos) {
    if (typeof NUMH !== 'undefined' && typeof NUMH_P !== 'undefined') {
      if (!NUM) { NUM = new Map(); NUMH_P.forEach((n, i) => NUM.set(n, i)); }
      const p = NUM.get(name);
      if (p != null) {
        const c = typeof NUMH_C !== 'undefined' ? NUMH_C.indexOf(club) : -1;
        let best = null;
        for (let i = 0; i < NUMH.length; i += 4) {
          if (NUMH[i] !== p) continue;
          const score = (NUMH[i + 1] === c ? 1000 : 0) + NUMH[i + 2];
          if (!best || score > best[0]) best = [score, NUMH[i + 3]];
        }
        if (best) return best[1];
      }
    }
    return null;
  }

  // Типичные номера позиций — если в истории номера нет (выбор по игроку, всегда один и тот же)
  const POS_NUMS = { 'ВРТ': [1, 1, 1, 13, 25], 'ПЗ': [2, 2, 12, 22], 'ЛЗ': [3, 3, 15, 23], 'ЦЗ': [4, 5, 4, 5, 6, 15, 24],
    'ЗАЩ': [2, 3, 4, 5, 6, 12, 15, 22, 23, 24], 'ЦОП': [6, 6, 8, 16, 18], 'ЦП': [8, 8, 6, 10, 14, 16, 18, 20],
    'ЦАП': [10, 10, 8, 20, 22], 'ПВ': [7, 7, 17, 11], 'ПП': [7, 17], 'ЛВ': [11, 11, 7, 19], 'ЛП': [11, 19], 'ФРВ': [9, 9, 9, 7, 10, 11, 19, 21] };
  const posNumber = (pos, seed) => { const l = POS_NUMS[pos]; return l ? l[seed % l.length] : null; };

  // ---------- форма клуба ----------
  function clubKit(club, gk) {
    if (gk) return K('plain', '#2ee66b', '#1a9e48', '#111111', '#2ee66b');
    if (KITS[club]) return KITS[club];
    const col = (typeof CLUB_COL !== 'undefined' && CLUB_COL[club]) || ['#3b4f8f', '#141a3a'];
    return K('plain', col[0], col[1], col[1], col[0]);
  }

  // Игрок из карточки (Cards.all()): форма клуба, номер, внешность по card.key
  function forCard(card, extra = {}) {
    const gk = card.pos === 'ВРТ';
    // у легенд позиции крупные: ЗАЩ, ПЗ (= полузащитник), ФРВ; у действующих ПЗ — правый защитник
    const pos = (card.icon || card.rar === 'legend') && card.pos === 'ПЗ' ? 'ЦП' : card.pos || '';
    const base = Object.assign({}, clubKit(card.club, gk));
    const seed = hash(card.key || card.name);
    const n = numberOf(card.name, card.club, pos) ?? posNumber(pos, seed >>> 8);
    if (n != null) base.number = n;
    return random(seed, Object.assign(base, extra), pos);
  }

  // Из формы клуба, как её считает Arena3D.parts.kitFrom (shirt/sleeve/shorts/socks — THREE.Color)
  function fromArena(a, extra = {}) {
    const hex = (c) => '#' + (c.getHexString ? c.getHexString() : new THREE.Color(c).getHexString());
    return kit(Object.assign({ pattern: 'sleeves', c1: hex(a.shirt), c2: hex(a.sleeve), shorts: hex(a.shorts), socks: hex(a.socks), ink: a.inkCss }, extra));
  }

  // ---------- загрузка модели (лениво, после three.js) ----------
  // Загрузчики three r128 — свои копии в vendor/three-ext, декодер Draco — vendor/draco.
  const MODEL = 'assets3d/player.glb?v=20261028';
  let loading = null;
  const addScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  function load(base = '') {   // base — путь до корня сайта (для генераторов в tools/art: '../../')
    if (loading) return loading;
    loading = (window.THREE ? Promise.resolve() : Promise.reject(new Error('three.js не загружен')))
      .then(() => THREE.GLTFLoader || addScript(base + 'vendor/three-ext/GLTFLoader.js'))
      .then(() => THREE.DRACOLoader || addScript(base + 'vendor/three-ext/DRACOLoader.js'))
      .then(() => THREE.SkeletonUtils || addScript(base + 'vendor/three-ext/SkeletonUtils.js'))
      .then(() => new Promise((ok, bad) => {
        const draco = new THREE.DRACOLoader(); draco.setDecoderPath(base + 'vendor/draco/');
        const gl = new THREE.GLTFLoader(); gl.setDRACOLoader(draco);
        gl.load(base + MODEL, ok, undefined, bad);
      }));
    loading.catch(() => { loading = null; });   // сеть подвела — в следующий раз попробуем снова
    return loading;
  }
  // Готовый игрок: клон модели, внешность, поза (stand | run | run2 | kick | kick2)
  function make(gltf, look, pose = 'stand') {
    const p = THREE.SkeletonUtils.clone(gltf.scene);
    apply(p, look);
    const clip = THREE.AnimationClip.findByName(gltf.animations, pose) || THREE.AnimationClip.findByName(gltf.animations, 'stand');
    if (clip) { const m = new THREE.AnimationMixer(p); m.clipAction(clip).play(); m.update(0); p.userData.mixer = m; }
    return p;
  }
  // Освободить материалы и текстуры майки клона (геометрия общая с моделью — её не трогаем)
  function dispose(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); });
    });
  }

  return { PATTERNS, SKIN, HAIR, STYLES, KITS, kit, apply, random, forCard, fromArena, numberOf, posNumber, clubKit, shirtCanvas, hash, load, make, dispose };
})();
