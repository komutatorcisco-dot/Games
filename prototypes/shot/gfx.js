// Настройки графики «Удара»: профили качества и «внешний вид» сцены. Игровая логика сюда не заглядывает.
// Профиль выбирается так: ?q=low|medium|high → сохранённый выбор игрока → «Авто» (по замеру скорости кадров).

export const PROFILES = {
  // слабый телефон: без карты теней (мягкие пятна под игроками), меньше людей на трибунах, без мелких деталей стадиона
  low: { label: 'Низкая', pixelRatio: 1, shadows: false, shadowMap: 0, blobs: true, crowd: 0.45, detail: 0, sheen: false, netShadow: false, aniso: 4, pitchRes: 12 },
  // большинство телефонов: одна тень от солнца 1024² на игровую зону, разрешение ×1,5
  medium: { label: 'Средняя', pixelRatio: 1.5, shadows: true, shadowMap: 1024, blobs: false, crowd: 0.8, detail: 1, sheen: false, netShadow: false, aniso: 8, pitchRes: 16 },
  // мощные: тень 2048², тень сетки ворот, «ворс» ткани, разрешение до ×1,75 (дальше разница почти не видна, а нагрузка растёт квадратом)
  high: { label: 'Высокая', pixelRatio: 1.75, shadows: true, shadowMap: 2048, blobs: false, crowd: 1, detail: 2, sheen: true, netShadow: true, aniso: 16, pitchRes: 20 },
};
export const ORDER = ['low', 'medium', 'high'];

export const LOOK = {
  // тональная компрессия Khronos «PBR Neutral»: белая форма и ворота не теряют детали, газон не становится кислотным
  toneMapping: 'neutral',
  exposure: 1.2,
  // солнце: высота взята из самой картинки неба (DaySkyHDRI069B — солнце на 25° над горизонтом);
  // небо поворачиваем так, чтобы солнце светило сзади-слева от камеры: игроки объёмные, тени ложатся к воротам
  // azimuth: 0 — солнце прямо за камерой штрафного (+z), −45 — сзади-слева
  sun: { elevation: 25.3, azimuth: -45, color: '#fff0d8', intensity: 2.7 },
  sunTV: { elevation: 48, azimuth: 60 }, // «2 на 1» (камера сбоку, с +x): солнце из-за камеры и чуть справа — свет спереди, тени от зрителя
  skyAzimuth: 0,          // по какому азимуту солнце на исходной картинке (+x), градусы
  env: 0.7,               // рассеянный свет и отражения от неба (заменяет лишние «заполняющие» лампы)
  shadow: {
    bias: -0.0004,        // против «полос» на поверхностях
    normalBias: 0.025,    // м: против полос на игроках, но без отрыва тени от стоп
    radius: 2.5,          // мягкость края (PCF)
    pad: 7,               // м: запас вокруг игровой зоны
    min: 18, max: 46,     // м: размер области тени — от одного игрока до «мяч — ворота» в штрафном
  },
  // газон: две полосы стрижки отличаются умеренно, крупная мягкая вариация цвета против повторяемости
  pitch: {
    stripeA: '#4d7b3b', stripeB: '#56853f', stripeWidth: 5.5,
    paint: 'rgba(238,241,232,0.93)',  // разметка — краска на траве, не чистый белый
    detailMean: 0.0917,   // средняя яркость (линейная) текстуры травы assets/grass.webp — делим на неё, без «×2,7 на глаз»
    detail: 0.55,         // насколько видна мелкая текстура травы (0 — гладко)
    paintDetail: 0.3,     // … и сквозь краску разметки
    normal: 0.3,          // мелкий рельеф травы
    roughness: 0.93,
    macro: 0.07,          // ± крупная вариация цвета (пятна по 20–60 м)
  },
  // газон для «2 на 1» (камера сверху-сбоку, издалека): полосы стрижки читаются, зелёный спокойнее, мелкой ряби меньше
  pitchTV: { stripeA: '#4a7a3d', stripeB: '#5b8c4a', macro: 0.05, detail: 0.38, paintDetail: 0.2 },
  // материалы игрока (Mixamo Ch38): карта, подключённая как «шероховатость», на деле — карта глянца (зелёный канал),
  // а синий канал в ней — «металл» = 1. Металл убираем, глянец переворачиваем и переводим в шероховатость для каждой части отдельно.
  mats: {
    cloth: { rough: [0.68, 0.95], spec: 0.35, normal: 0.85, env: 0.6, sheen: 0.35 },   // футболка, шорты, гетры
    skin: { rough: [0.42, 0.72], spec: 0.5, normal: 0.6, env: 0.7 },                   // кожа: умеренный естественный блик
    shoes: { rough: [0.3, 0.6], spec: 0.6, normal: 1, env: 0.8 },                       // бутсы — чуть глянцевее ткани
    hair: { rough: 0.55, spec: 0.3, specColor: '#c9b49a', env: 0.4 },                   // волосы: без пластикового блеска
  },
  ball: { white: { color: '#f4f4f0', rough: 0.4 }, black: { color: '#1a1b1f', rough: 0.45 }, env: 0.6 },
  posts: { color: '#f3f4f1', rough: 0.38, env: 0.5 },   // окрашенный металл: краска, не хром
  // сетка: вблизи — объёмные нити модели, вдали (плавно между fadeFrom и fadeTo, м) — полотно с узором сот (не рябит)
  net: { color: '#e8ebe6', rough: 0.9, opacity: 0.8, panelOpacity: 0.9, fadeFrom: 14, fadeTo: 24 },
  led: { brightness: 0.82, speed: 0.015 },             // рекламные щиты днём не ярче всего кадра, бегут медленно
  vignette: 0.22,
};

// --- выбор профиля ---
const KEY = 'shot.gfx';
export function savedChoice() {
  const q = new URLSearchParams(location.search).get('q');
  if (q && PROFILES[q]) return q;
  try { const s = localStorage.getItem(KEY); if (s === 'auto' || PROFILES[s]) return s; } catch (e) { /* без памяти */ }
  return 'auto';
}
export function saveChoice(c) { try { localStorage.setItem(KEY, c); } catch (e) { /* без памяти */ } }
// «Авто» начинает со средней (кроме совсем слабых: экран без плотных пикселей и 2 ядра — низкая),
// а дальше решает замер кадров (AutoQuality)
export function autoStart() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  return cores <= 2 || mem <= 2 ? 'low' : 'medium';
}

// Автонастройка по замеру: окна по 3 с. Если два окна подряд средний кадр > 26 мс (< ~38 к/с) — ступень ниже.
// Если три окна подряд < 11 мс (> ~90 к/с), один раз пробуем ступень выше; не удержалась — больше не поднимаемся.
// После любого переключения 6 с не меряем (шейдеры пересобираются, первые кадры долгие).
export class AutoQuality {
  constructor(start, onChange) { this.level = ORDER.indexOf(start); this.onChange = onChange; this.reset(6); this.slow = 0; this.fast = 0; this.triedUp = false; this.failedUp = false; }
  reset(hold) { this.t = 0; this.n = 0; this.sum = 0; this.hold = hold; }
  frame(dt) {
    if (this.hold > 0) { this.hold -= dt; return; }
    if (dt > 0.25) return; // вкладка была скрыта — не считаем
    this.t += dt; this.sum += dt; this.n++;
    if (this.t < 3) return;
    const avg = this.sum / this.n; this.reset(0);
    this.last = avg;
    if (avg > 0.026) { this.slow++; this.fast = 0; } else if (avg < 0.011) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
    if (this.slow >= 2 && this.level > 0) { if (this.triedUp) this.failedUp = true; this.set(this.level - 1); }
    else if (this.fast >= 3 && this.level < ORDER.length - 1 && !this.failedUp && !this.triedUp) { this.triedUp = true; this.set(this.level + 1); }
  }
  set(l) { this.level = l; this.slow = 0; this.fast = 0; this.reset(6); this.onChange(ORDER[l]); }
}

// Виды «2 на 1» (камера с трибуны). Ориентир — тренировочные кадры мобильного футбола: камера сбоку-сверху ~36°,
// развёрнута к воротам по диагонали; светлый жёлто-зелёный газон (тон ~80°) с широкими мягкими полосами; яркий
// рассеянный дневной свет с короткими мягкими тенями; за воротами — сетка тренировочной базы, а не трибуна.
// a — максимально близко к ориентиру, b — чуть сочнее и контрастнее. ?look=old — прежний вид (стадион, прежние цвета).
// Меняются только настройки (свет, цвет газона, камера, окружение) — геометрия и модели общие.
const LOOK_A = {
  cam: { side: 32.7, h: 23.7, fov: 20, yaw: 25, look: 0 }, // ~36° сверху, ~40 м; разворот к воротам на 25°
  exposure: 1.16, env: 0.95, hemi: 0.32,                  // больше рассеянного света — мягкие тени, детали в тени формы
  sun: { elevation: 58, azimuth: 55, color: '#fff4e4', intensity: 2.45 },
  shadowRadius: 3.5,                                      // мягкий край тени
  pitch: { stripeA: '#596f30', stripeB: '#6a8039', macro: 0.035, detail: 0.28, paintDetail: 0.12 }, // на экране ≈ ориентиру: #5b7529 / #647c2f
  paint: 0.97, envKind: 'training',
};
export const TV_LOOKS = {
  a: LOOK_A,
  b: Object.assign({}, LOOK_A, {
    exposure: 1.12, env: 0.8, hemi: 0.24,
    sun: { elevation: 55, azimuth: 55, color: '#ffefd6', intensity: 2.85 },
    shadowRadius: 3,
    pitch: { stripeA: '#566e2a', stripeB: '#6b8636', macro: 0.045, detail: 0.32, paintDetail: 0.12 },
  }),
};

