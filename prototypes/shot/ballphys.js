// Физика мяча и контроль мяча игроком для «Удара». Чистый модуль без three.js и без DOM — его проверяют тесты (tests/shot-physics.test.js).
// Единицы настоящие: метры, секунды, м/с, вращение — радианы в секунду. Поле: ворота на z = 0, атака в сторону −z, y — вверх.
// Векторы — любые объекты с полями x, y, z (подходят и THREE.Vector3).
//
// Состояния мяча (b.state):
//   'free'   — свободный: летит, отскакивает или катится по своей физике;
//   'owned'  — ведение: мяч «на поводке» у ноги владельца (только при подтверждённом владении);
//   'strike' — идёт замах: контроль ещё держит мяч у ударной ноги, импульс будет один раз в момент касания;
//   'held'   — в руках вратаря;
//   'dead'   — вне игры (эпизод закончен, ждём сброса).

export const CFG = {
  dt: 1 / 240,        // фиксированный шаг физики, с (240 Гц: быстрый мяч за шаг проходит ≤ 14 см — не пролетает сквозь штангу)
  maxFrame: 0.1,      // больше этого времени за кадр не накапливаем: при просадке игра замедляется, а не прыгает
  g: 9.81,
  R: 0.11,            // радиус мяча (размер 5 по правилам FIFA) — и для картинки, и для столкновений
  mass: 0.43,
  air: {
    rho: 1.2,         // плотность воздуха, кг/м³
    cdLow: 0.45,      // коэффициент сопротивления на малой скорости
    cdHigh: 0.2,      // … и на большой (после «кризиса сопротивления»)
    cdMid: 12,        // скорость перехода, м/с
    cdWidth: 1.6,     // плавность перехода, м/с
    spinDecay: 0.15,  // затухание вращения в воздухе, доля в секунду
  },
  grass: {
    eMax: 0.74,       // упругость отскока при слабом ударе о газон
    eMin: 0.42,       // … и не меньше этой при сильном
    eDrop: 0.014,     // насколько упругость падает на каждый 1 м/с скорости удара о землю
    bounceMin: 0.6,   // медленнее этого (м/с вниз) мяч уже не подпрыгивает — переходит к качению (без дребезга)
    muBounce: 0.45,   // трение в момент отскока (переводит скольжение во вращение)
    muSlide: 0.5,     // трение скольжения по траве
    rollSlip: 0.04,   // разница скорости точки касания, ниже которой мяч считается катящимся, м/с
    rollConst: 0.55,  // сопротивление качению: постоянная часть, м/с²
    rollLin: 0.2,     // … и часть, растущая со скоростью (трава), 1/с — газон «быстрый»: пас не вылетает и не гаснет резко
    spinDecay: 3,     // вращение вокруг вертикали гаснет о траву, доля в секунду
    restSpeed: 0.06,  // медленнее — мяч останавливается совсем (нет вечного микродвижения)
  },
  post: { r: 0.06, e: 0.6, friction: 0.18, spinKeep: 0.35 },     // штанги и перекладина: металл, упругий удар с трением
  net: { k: 900, c: 16, maxPen: 0.5, maxBack: 1.2, friction: 4 }, // сетка: пружина, вязкость, предел прогиба, «обратно не выталкивает»
  keeper: {               // вратарь средней сложности; всё ниже можно подкрутить
    catchHands: 21,     // поймать двумя руками можно мяч не быстрее, м/с (относительно рук)
    catchChest: 15,     // принять на корпус — не быстрее, м/с
    catchLegs: 13,      // в движении ловли мяч в ноги/бёдра — прижимает, если не быстрее; сильнее — отскок
    gather: 7,          // медленный мяч (относительно руки не быстрее, м/с, и ниже gatherH) забирает и одной рукой — не отскакивает
    gatherH: 1.2,
    scoopAt: 0.85,      // подбор катящегося/лежащего мяча начинает, когда до мяча не дальше, м (руки достают)
    twoHands: 0.24,     // «двумя руками» — обе кисти не дальше этого от поверхности мяча, м
    reaction: 0.2,      // реакция после удара, с (он не знает направление до удара)…
    reactionJitter: 0.1,// … плюс до стольких секунд случайно
    readError: 0.16,    // ошибка в оценке, куда летит мяч: м на каждые 10 м/с скорости мяча
    nearReach: 0.65,    // руками без прыжка достаёт вбок, м
    diveReach: 2.7,     // в полном прыжке руки уходят вбок на столько, м (от центра)
    diveTime: 0.55,     // от толчка до полного вытяжения, с
    hopeless: 1.1,      // если не хватает больше этого, м, — не прыгает впустую
    lateral: 3.0, forward: 4.6, back: 2.6, rush: 5.8, accel: 9, // скорости перемещения, м/с; разгон, м/с²
    maxOut: 5.5, outStart: 24,   // насколько выходит из ворот и с какого расстояния начинает сокращать угол
    rushBox: { x: 18, z: 16 },   // выходит на свободный мяч только в штрафной
    rushMargin: 0.85,            // … и только если успевает раньше соперника с запасом
    sweep: 3.5,                  // мяч у чужих ворот (матч) — стоит выше линии ворот до стольких метров
    smother: 1.5,                // в ноги бросается с такого расстояния, м
    getUp: 1.1,                  // лежит после прыжка, с (потом встаёт — повторного прыжка не бывает)
    bite: 0.4,                   // «покупается» на ложный замах с такой вероятностью
  },
  body: { e: 0.3, friction: 0.4 },    // мяч о тело игрока (ноги, корпус) — мягко
  hands: { e: 0.35, friction: 0.3 },  // отбивание руками вратаря
  // вратарь: мах руки/тела передаёт мячу только часть своей скорости (carry) — отбив мягче и предсказуемее, без «выстрела» рукой
  gkHands: { e: 0.3, friction: 0.35, carry: 0.35 }, gkBody: { e: 0.22, friction: 0.45, carry: 0.4 },

  player: {
    jog: 3.9, sprint: 6.6,  // скорость бега и рывка, м/с
    withBall: 0.93,         // с мячом бежит чуть медленнее
    charging: 0.55,         // пока копишь удар — медленнее (джойстик в это время целится)
    accel: 3.2, decel: 5.5, // разгон и торможение (скорость приближения к желаемой, 1/с) — у игрока есть вес
    turn: 9,                // скорость разворота корпуса, 1/с
    turnMax: 7.5,           // но не быстрее, рад/с (на рывке — на 40 % медленнее)
    curve: 11, curveMin: 4, // на бегу направление скорости поворачивается не быстрее (curve − скорость), но не медленнее curveMin, рад/с
    turnAtSprint: 0.55,     // на полном ходу разворачивается медленнее (доля)
    turnSlow: 0.3,          // резкий поворот на скорости: вес — темп падает до (1 − turnSlow) на 90° и больше на рывке
                            // (на месте и на малой скорости почти не падает); после поворота — обычный разгон
    bounds: { x: 30, zMin: 1.2, zMax: 42 },
  },
  control: {
    // точка ведения подобрана по замеру расстояния от поверхности мяча до носка (tests + ?trace=1):
    // стоя ноги широко — мяч у правой стопы; на бегу правый носок выходит на 0,33 м перед тазом — мяч чуть дальше
    reach: 0.27,            // мяч перед игроком стоя, м (от центра) — было 0,38
    reachPerSpeed: 0.03,    // на бегу дальше: бег 3,6 м/с → 0,38, рывок 6,1 → 0,45
    side: 0.19,             // смещение к правой ноге стоя, м (было 0,09)
    sidePerSpeed: 0.012,    // на бегу ноги уже — смещение меньше…
    sideMin: 0.12,          // … но не меньше этого
    gain: 9,                // как быстро мяч догоняет точку контроля, 1/с
    maxCorr: 5.5,           // но не быстрее этой добавки к скорости игрока, м/с — пружина не бесконечная
    resp: 22,               // инерция мяча: скорость меняется не мгновенно, 1/с
    touchPush: 0.04,        // касание: мяч отходит вперёд на столько…
    touchPushPerSpeed: 0.032,// … плюс столько на каждый м/с (бег — 0,16, рывок — 0,24)
    pushDecay: 4,           // как быстро касание «гаснет», 1/с
    rollTime: 0.12,         // после касания мяч столько секунд катится почти сам…
    rollGain: 0.4,          // … контроль в это время слабее (видно касание и короткое свободное качение)
    // касание в такт шагу (вид ведения; движение игрока не меняет): стопа толкает мяч, он сразу уходит вперёд быстрее
    // игрока, катится, тормозит и к следующему шагу той же ноги снова у стопы. Вынос вперёд от точки у ноги (пик в
    // середине шага) — touchA0 + touchAPerV·скорость, не больше touchAMax (шаг ~0,12 м, бег и рывок до 0,22 м).
    // Вбок мяч, как и раньше, держится у ноги — на повороте не убегает.
    touchA0: 0.06, touchAPerV: 0.055, touchAMax: 0.22,
    touchMin: 0.3,          // касания не чаще, с
    touchMax: 0.6,          // и не реже (если нога в анимации не дотянулась)
    bodyR: 0.22,            // ближе к центру игрока мяч не проходит (сквозь ноги)
    loseDist: 1.3,          // мяч оттеснили от точки контроля дальше этого (соперник) — владение потеряно
    captureR: 0.6,          // принять мяч можно в этом радиусе от точки контроля…
    captureH: 0.32,         // … если мяч не выше (ногой с земли высокий мяч не взять)
    captureVrel: 9,         // … и летит относительно игрока не быстрее, м/с
    besideR: 0.55, besideVrel: 3, // или мяч рядом с игроком (не за спиной) и почти с его скоростью — бежит рядом
    trapBase: 0.1,          // приём: сколько секунд мяч «гасится» минимум…
    trapPerV: 0.035,        // … плюс столько на каждый м/с скорости прилёта
    regrab: 0.45,           // после своего удара тот же игрок не берёт мяч столько секунд…
    clearDist: 1.1,         // … и пока мяч не отойдёт от него хотя бы на столько метров
    stopTrap: 1.8,          // остановка: мяч гасится быстрее во столько раз
    // ведение под обе ноги: мяч у правой или левой стопы (b.foot = +1 / −1). Нога меняется только на заметном повороте
    // (джойстик уводит больше чем на footTurn рад ≈ 49° от корпуса; 45° — ещё та же нога): поворот влево — мяч под левую, вправо — под правую;
    // мелкие поправки ногу не меняют, и не чаще раза в footHold с. Мяч переходит под другую ногу непрерывно —
    // перед корпусом (b.sideK плавно от +1 к −1 за ~2/footRate с), а не скачком и не сквозь ноги.
    footTurn: 0.85, footHold: 0.35, footRate: 7, footCross: 0.07,
    // перекладывание (вид; движение игрока не меняется): мяч под другую ногу переводит внутренней стороной стопы та
    // нога, у которой он был, — в её шаг (касание): мяч сразу уходит вбок перед корпусом и за xferT с (~0,28) оказывается у
    // другой стопы. Шага этой ноги нет дольше xferWait с (шагом, стоя) — мяч переходит плавно, как раньше
    xferT: 0.28, xferWait: 0.7,
    // первое касание при приёме паса (firstTouch): стопа гасит скорость прилёта и направляет мяч дальше — по джойстику,
    // а без джойстика — туда, куда смотрит корпус (мягкая подушка). Потом мяч катится сам и лишь затем плавно
    // переходит в ведение — без «магнита» к стопе
    touchOut: 1.1,          // мяч уходит от стопы быстрее игрока на столько, м/с (при полном джойстике; без него — 40 %)
    touchSoft: 0.3,         // без джойстика (подушка) — столько, м/с, плюс половина доли прилёта…
    touchSoftCarry: 0.55,   // … плюс такая доля скорости игрока вперёд (он тормозит — мяч катится с ним, а не остаётся за спиной)
    turnWindow: 0.7,        // джойстик нажат вскоре после мягкого приёма (за столько секунд, мяч у ноги) — стопа ещё раз уводит мяч туда
    touchKeep: 0.12,        // плюс такая доля скорости прилёта (сильный пас — «тяжелее» касание, мяч отскакивает дальше)
    touchFree: 0.2,         // после касания мяч катится сам столько секунд…
    touchFreePerV: 0.02,    // … плюс столько на каждый м/с прилёта
    touchDecel: 2.2,        // торможение мяча в это время, м/с² (трение травы)
    touchBlend: 0.3,        // и ещё столько секунд ведение включается плавно (пружина набирает силу)
    touchLose: 2.2,         // в это время мяч считается своим, пока он не дальше этого от точки контроля, м
  },
  pass: {
    // темп — по уроку FC Mobile (замер по кадрам): короткий пас ≈14 м за ≈1,1 с, с удержанием ≈20 м за ≈1,2 с
    // (было 4,2 и 8,5 м/с — пас шёл в 2 раза дольше: 14 м за 2,2 с)
    arrive: 10,           // обычный пас (короткое нажатие) приходит к партнёру со скоростью, м/с
    arriveStrong: 15,     // полная сила (удержание) — так, м/с; между ними — по силе
    vMin: 6, vMax: 26,    // пределы скорости паса низом, м/с
    lead: 0.5,            // пас бегущему: насколько учитывать его бег (получатель выходит к мячу навстречу — полный упреждающий пас улетал за спину)
    throughAhead: 4.5, throughPerSpeed: 0.7, // «На ход»: в зону перед получателем на столько м (+ за каждый м/с его бега)
    loftTime0: 0.55, loftTimePerM: 0.04, loftTimeMin: 0.8, loftTimeMax: 1.9, // верховой: время полёта
    loftDrag: 1.08,       // запас горизонтальной скорости на сопротивление воздуха
    loftBackspin: 12,     // обратное вращение верховой передачи, рад/с
  },
  shot: {
    vMin: 13, vMax: 31,       // скорость мяча при слабом и сильном ударе, м/с (сила 0…1 — линейно)
    runBonus: 0.3,            // скорость бега вдоль удара добавляет столько от себя…
    runBonusMax: 1.8,         // … но не больше, м/с
    height: 0.9,              // (для справки) средний удар у линии ворот на высоте ≈ 0,9 м
    hLow: 0.3, hHigh: 1.65,   // высота у линии ворот растёт с силой: слабый — низом, полный — под перекладину (как в уроке FC Mobile)
    finesseHeight: 1.35,      // удар щёчкой с подкруткой — чуть выше
    overPower: 0.92,          // сила выше этой — удар «перебран»…
    overLift: 10,             // … и уходит выше: +столько метров высоты на единицу перебора (полная сила — у перекладины, риск выше)
    topspin: 7,               // верхнее вращение сильного удара (мяч «ныряет»), рад/с при силе 1
    finesseSpeed: 0.85,       // удар с подкруткой медленнее
    finesseSpin: 36,          // вращение подкрутки, рад/с (≈ 6 оборотов в секунду)
    chipSpeed: 0.6, chipMin: 11, // переброс: скорость от обычной и не меньше, м/с
    chipHeight: 2.15,         // переброс у линии ворот на такой высоте (уже опускается)
    chipBackspin: 9,          // обратное вращение переброса, рад/с
    contactR: 0.55,           // в момент касания мяч должен быть не дальше этого от ударной точки, иначе нога не достала
    stickAngle: Math.PI / 3,  // джойстик на столько вбок от «вверх» — удар в штангу; дальше — мимо
  },
};

// ---------- маленькая векторная математика ----------
const len3 = (v) => Math.hypot(v.x, v.y, v.z);
const set = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });

export function newBall(p = vec(0, CFG.R, 0)) {
  return { p: vec(p.x, p.y, p.z), v: vec(), w: vec(), state: 'free', owner: null, lockOwner: null, lockUntil: 0, mustClear: false,
    push: 0, touchCd: 0, trapT: 1, trapDur: 0, inGoal: false, goal: false, stopped: false };
}
export function resetBall(b, p) {
  set(b.p, p.x, p.y, p.z); set(b.v, 0, 0, 0); set(b.w, 0, 0, 0);
  Object.assign(b, { state: 'free', owner: null, lockOwner: null, lockUntil: 0, mustClear: false, push: 0, touchCd: 0, trapT: 1, trapDur: 0, inGoal: false, goal: false, stopped: false, strikeAt: null, feintOff: null });
}

// ---------- полёт ----------
export const cdOf = (sp) => CFG.air.cdLow - (CFG.air.cdLow - CFG.air.cdHigh) / (1 + Math.exp(-(sp - CFG.air.cdMid) / CFG.air.cdWidth));
const KA = () => (0.5 * CFG.air.rho * Math.PI * CFG.R * CFG.R) / CFG.mass;
const I_M = () => (2 / 3) * CFG.R * CFG.R; // полый шар: I = 2/3·m·R², делённое на массу

// ускорение в воздухе: тяжесть, сопротивление, эффект Магнуса (подъёмная сила по Гоффу и Карре: CL = S / (2,022·S + 0,981), S = R·ω / v)
export function airAccel(v, w, out) {
  const sp = len3(v); set(out, 0, -CFG.g, 0); if (sp < 1e-4) return out;
  const ka = KA(), d = ka * cdOf(sp) * sp;
  out.x -= d * v.x; out.y -= d * v.y; out.z -= d * v.z;
  const wl = len3(w);
  if (wl > 0.05) {
    const S = (CFG.R * wl) / sp, CL = S / (2.022 * S + 0.981);
    const cx = w.y * v.z - w.z * v.y, cy = w.z * v.x - w.x * v.z, cz = w.x * v.y - w.y * v.x, c = Math.hypot(cx, cy, cz);
    if (c > 1e-6) { const k = (ka * CL * sp * sp) / c; out.x += cx * k; out.y += cy * k; out.z += cz * k; }
  }
  return out;
}
const tmpAcc = vec();
function integrate(b, h) { // полунеявный Эйлер
  airAccel(b.v, b.w, tmpAcc);
  b.v.x += tmpAcc.x * h; b.v.y += tmpAcc.y * h; b.v.z += tmpAcc.z * h;
  b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
  const k = 1 - CFG.air.spinDecay * h; b.w.x *= k; b.w.y *= k; b.w.z *= k;
}

// ---------- газон ----------
// трение в точке касания: импульс jt против скорости точки касания (ux, uz); вращение меняется по моменту силы
function friction(b, jt, ux, uz) {
  b.v.x -= jt * ux; b.v.z -= jt * uz;
  b.w.x += (CFG.R * jt * uz) / I_M(); b.w.z -= (CFG.R * jt * ux) / I_M();
}
// возвращает силу удара о землю (м/с) — для звука; 0 — если не было отскока
export function ground(b, h) {
  const G = CFG.grass, R = CFG.R;
  if (b.p.y > R) return 0;
  b.p.y = R; let imp = 0;
  // скорость точки касания: v + w × (0, −R, 0) = (v.x + R·w.z, 0, v.z − R·w.x)
  const cx = b.v.x + R * b.w.z, cz = b.v.z - R * b.w.x, cs = Math.hypot(cx, cz);
  if (b.v.y < -G.bounceMin) { // отскок: каждый следующий ниже
    imp = -b.v.y; const e = Math.max(G.eMin, G.eMax - G.eDrop * imp), jn = (1 + e) * imp;
    b.v.y = e * imp;
    if (cs > 1e-4) friction(b, Math.min(G.muBounce * jn, cs / 2.5), cx / cs, cz / cs); // 2,5 = 1 + m·R²/I для полого шара
    b.w.y *= 0.85;
  } else { // на земле
    b.v.y = 0;
    if (cs > G.rollSlip) friction(b, Math.min(G.muSlide * CFG.g * h, cs / 2.5), cx / cs, cz / cs); // скользит
    else { // катится: тормозит трава, вращение ровно по качению
      const sp = Math.hypot(b.v.x, b.v.z), dec = (G.rollConst + G.rollLin * sp) * h, k = sp > dec ? (sp - dec) / sp : 0;
      b.v.x *= k; b.v.z *= k; b.w.x = b.v.z / R; b.w.z = -b.v.x / R;
    }
    b.w.y *= 1 - G.spinDecay * h;
    if (Math.hypot(b.v.x, b.v.z) < G.restSpeed && Math.hypot(cx, cz) < G.restSpeed * 2) { set(b.v, 0, 0, 0); set(b.w, 0, 0, 0); b.stopped = true; } // покой
  }
  if (imp || Math.hypot(b.v.x, b.v.z) > 0) b.stopped = false;
  return imp;
}

// ---------- штанги, перекладина ----------
function cylinder(b, cx, cy, cz, axis) {
  const P = CFG.post, R = CFG.R;
  let dx, dy, dz;
  if (axis === 'y') { dx = b.p.x - cx; dy = 0; dz = b.p.z - cz; } else { dx = 0; dy = b.p.y - cy; dz = b.p.z - cz; }
  const L = Math.hypot(dx, dy, dz); if (L > R + P.r || L < 1e-6) return false;
  dx /= L; dy /= L; dz /= L;
  const vn = b.v.x * dx + b.v.y * dy + b.v.z * dz; if (vn >= 0) return false; // уже отходит — второй раз не бьём
  b.v.x -= (1 + P.e) * vn * dx; b.v.y -= (1 + P.e) * vn * dy; b.v.z -= (1 + P.e) * vn * dz;
  const vn2 = b.v.x * dx + b.v.y * dy + b.v.z * dz; // трение по касательной
  b.v.x -= P.friction * (b.v.x - vn2 * dx); b.v.y -= P.friction * (b.v.y - vn2 * dy); b.v.z -= P.friction * (b.v.z - vn2 * dz);
  const push = R + P.r - L; b.p.x += dx * push; b.p.y += dy * push; b.p.z += dz * push; // выталкиваем без лишнего импульса
  b.w.x *= P.spinKeep; b.w.y *= P.spinKeep; b.w.z *= P.spinKeep;
  return true;
}
// goal: { w: половина ширины (до оси штанги), h: высота (ось перекладины), d: глубина сетки внизу, top: глубина под крышей }
export function posts(b, goal) {
  if (Math.abs(b.p.z) > 0.4) return null;
  if (b.p.y < goal.h + CFG.R && (cylinder(b, -goal.w, 0, 0, 'y') || cylinder(b, goal.w, 0, 0, 'y'))) return 'post';
  if (Math.abs(b.p.x) < goal.w + CFG.R && cylinder(b, 0, goal.h, 0, 'x')) return 'bar';
  return null;
}

// ---------- сетка ----------
// внутри ворот: пружинит (задник, крыша, бока) и гасит мяч; возвращает скорость удара в задник (для звука и волны), если был первый удар
function netInside(b, goal, h) {
  const N = CFG.net, R = CFG.R;
  const spring = (pen, v) => (pen > 0 ? (N.k * Math.min(pen, N.maxPen) - N.c * v) * h : 0);
  const back = -goal.d + (goal.d - goal.top) * Math.min(1, Math.max(0, b.p.y / goal.h));
  let hit = 0;
  const pz = back + R - b.p.z;
  if (pz > 0) {
    if (!b.netHit && b.v.z < -2) { hit = -b.v.z; b.netHit = true; }
    b.v.z += spring(pz, b.v.z); if (b.v.z > N.maxBack) b.v.z = N.maxBack;
    b.v.x *= 1 - N.friction * h; b.v.y *= 1 - N.friction * 0.7 * h;
    const k = 1 - 6 * h; b.w.x *= k; b.w.y *= k; b.w.z *= k;
  }
  const py = b.p.y - (goal.h - R); if (py > 0) b.v.y -= spring(py, -b.v.y);
  const px = Math.abs(b.p.x) - (goal.w - CFG.post.r - R); if (px > 0) { const s = Math.sign(b.p.x); b.v.x -= s * spring(px, s * b.v.x); }
  return hit;
}
// снаружи: удар в боковую сетку или на крышу ворот — гола нет, мяч гаснет и отскакивает
function netOutside(b, goal) {
  if (b.inGoal || b.p.z > 0 || b.p.z < -goal.d) return false;
  const R = CFG.R, ax = Math.abs(b.p.x);
  if (b.p.y < goal.h + R && ax > goal.w - 0.02 && ax < goal.w + R) { const s = Math.sign(b.p.x); b.p.x = s * (goal.w + R); b.v.x = s * Math.abs(b.v.x) * 0.15; b.v.z *= 0.5; b.v.y *= 0.6; return true; }
  if (ax < goal.w && b.p.z > -goal.top && b.p.y < goal.h + R && b.p.y > goal.h - 0.15 && b.v.y < 0) { b.p.y = goal.h + R; b.v.y = -b.v.y * 0.15; b.v.x *= 0.7; b.v.z *= 0.7; return true; }
  return false;
}

// ---------- тела игроков (шары по костям) ----------
// s: { x, y, z, r, vx, vy, vz, kind: 'hand'|'body', who } — возвращает true, если было касание
export function sphereHit(b, s) {
  const R = CFG.R; let dx = b.p.x - s.x, dy = b.p.y - s.y, dz = b.p.z - s.z;
  const L = Math.hypot(dx, dy, dz); if (L > R + s.r || L < 1e-6) return null;
  dx /= L; dy /= L; dz /= L;
  const rx = b.v.x - (s.vx || 0), ry = b.v.y - (s.vy || 0), rz = b.v.z - (s.vz || 0), vn = rx * dx + ry * dy + rz * dz;
  if (vn >= 0) return null; // расходятся — повторно не обрабатываем
  return { n: vec(dx, dy, dz), vn, rel: Math.hypot(rx, ry, rz), L };
}
export function sphereBounce(b, s, c, mat = CFG.body) {
  const { n } = c, R = CFG.R, k = mat.carry ?? 1, svx = (s.vx || 0) * k, svy = (s.vy || 0) * k, svz = (s.vz || 0) * k;
  let rx = b.v.x - svx, ry = b.v.y - svy, rz = b.v.z - svz;
  const vn = Math.min(0, rx * n.x + ry * n.y + rz * n.z); // относительная скорость по нормали (с учётом доли скорости тела)
  rx -= (1 + mat.e) * vn * n.x; ry -= (1 + mat.e) * vn * n.y; rz -= (1 + mat.e) * vn * n.z;
  const vn2 = rx * n.x + ry * n.y + rz * n.z;
  rx -= mat.friction * (rx - vn2 * n.x); ry -= mat.friction * (ry - vn2 * n.y); rz -= mat.friction * (rz - vn2 * n.z);
  set(b.v, rx + svx, ry + svy, rz + svz);
  const push = R + s.r - c.L; b.p.x += n.x * push; b.p.y += n.y * push; b.p.z += n.z * push;
  b.w.x *= 0.5; b.w.y *= 0.5; b.w.z *= 0.5;
}

// ---------- ворота: гол, штанги, сетка (ворота на линии z = 0, сетка в сторону −z) ----------
function goalStep(b, z0, goal, h, ev, end) {
  // мяч целиком прошёл линию между штангами и под перекладиной — гол (один раз)
  if (z0 > 0 && b.p.z <= 0 && Math.abs(b.p.x) < goal.w - CFG.post.r - CFG.R * 0.5 && b.p.y < goal.h) b.inGoal = true;
  if (b.inGoal && !b.goal && b.p.z < -(CFG.R + CFG.post.r) && Math.abs(b.p.x) < goal.w - CFG.post.r && b.p.y < goal.h - CFG.post.r) { b.goal = true; ev.push({ type: 'goal', end }); }
  const pst = posts(b, goal); if (pst) ev.push({ type: pst, end });
  if (b.inGoal) { const nv = netInside(b, goal, h); if (nv) ev.push({ type: 'net', v: nv, end }); }
  else if (netOutside(b, goal)) ev.push({ type: 'side', end });
}
// поворот на 180° вокруг вертикали через середину поля длины L (второй раз — обратно)
export function flipBall(b, L) {
  b.p.x = -b.p.x; b.p.z = L - b.p.z; b.v.x = -b.v.x; b.v.z = -b.v.z; b.w.x = -b.w.x; b.w.z = -b.w.z;
}
// у каждых ворот свои отметки «в воротах / гол / удар в сетку»
function swapGoalFlags(b) {
  const g = b.g2 || (b.g2 = { inGoal: false, goal: false, netHit: false });
  [b.inGoal, g.inGoal] = [g.inGoal, b.inGoal]; [b.goal, g.goal] = [g.goal, b.goal]; [b.netHit, g.netHit] = [g.netHit, b.netHit];
}
export function clearGoalFlags(b) { b.inGoal = false; b.goal = false; b.netHit = false; if (b.g2) { b.g2.inGoal = false; b.g2.goal = false; b.g2.netHit = false; } }
// ---------- шаг свободного мяча ----------
// world: { goal, spheres: [...], onSphere(s, contact) → 'bounce' | 'stop' }
// возвращает события: [{ type: 'bounce', v } | { type: 'post'|'bar' } | { type: 'net', v } | { type: 'goal' } | { type: 'side' } | { type: 'touch', s, c }]
export function stepFree(b, h, world, ev = []) {
  const goal = world.goal, z0 = b.p.z;
  integrate(b, h);
  const imp = ground(b, h); if (imp > 1.2) ev.push({ type: 'bounce', v: imp });
  if (goal) goalStep(b, z0, goal, h, ev, 0);
  // вторые ворота (матч): на линии z = goal2.L, сетка за ней. Считаются теми же функциями в повёрнутых на 180° координатах
  // (x → −x, z → L − z — поворот, а не зеркало: подкрутка и отскоки ведут себя так же, как у первых ворот)
  const g2 = world.goal2;
  if (g2) {
    flipBall(b, g2.L); swapGoalFlags(b);
    goalStep(b, g2.L - z0, g2, h, ev, 1);
    swapGoalFlags(b); flipBall(b, g2.L);
  }
  if (world.spheres) for (const s of world.spheres) {
    const c = sphereHit(b, s); if (!c) continue;
    const r = world.onSphere ? world.onSphere(s, c) : 'bounce';
    if (r === 'stop') return ev; // мяч забрал вратарь
    if (r !== 'pass') { sphereBounce(b, s, c, s.who === 'gk' ? (s.kind === 'hand' ? CFG.gkHands : CFG.gkBody) : s.kind === 'hand' ? CFG.hands : CFG.body); ev.push({ type: 'touch', s, c }); }
  }
  return ev;
}

// где и когда мяч пересечёт плоскость z = zp (только воздух и газон — без игроков и ворот); для прыжка вратаря и прицела свайпом
export function predict(p0, v0, w0, zp = 0, tMax = 3) {
  const b = newBall(p0); set(b.v, v0.x, v0.y, v0.z); set(b.w, w0.x, w0.y, w0.z);
  let t = 0; const h = 1 / 120;
  while (b.p.z > zp && t < tMax) { integrate(b, h); ground(b, h); t += h; }
  return { p: b.p, v: b.v, t };
}

// ---------- игрок ----------
export function newPlayer(p, yaw = Math.PI) { return { p: vec(p.x, 0, p.z), v: vec(), yaw, yawRate: 0, acc: 0, sprint: false, charging: false, stopping: false }; }
// inp: { x, y } — джойстик (вверх — к воротам, т. е. −z)
export function playerStep(P, inp, h, withBall) {
  const C = CFG.player;
  const max = (P.sprint ? C.sprint : C.jog) * (withBall ? C.withBall : 1) * (P.charging ? C.charging : 1) * (P.spd || 1); // spd — характеристика «скорость» карточки (матч)
  const wx = inp.x * max, wz = -inp.y * max, want = Math.hypot(wx, wz), sp0 = Math.hypot(P.v.x, P.v.z);
  P.wx = wx; P.wz = wz; // чего хочет игрок (по нему видно резкий разворот)
  if (P.drive) { P.v.x = P.drive.x; P.v.z = P.drive.z; } // скорость задаёт запись движения (подкат, разворот), джойстик в это время не действует
  else { const k = 1 - Math.exp(-h * (want > sp0 ? C.accel * (P.boost || 1) * (P.accK || 1) : C.decel)); // boost — рывок к свободному мячу (автоподбор)
    // на бегу поворот — дугой: направление скорости поворачивается не быстрее curve (на рывке медленнее), а не «ломается»;
    // разворот больше ~120° — как раньше (торможение и разворот)
    let d = 0; if (sp0 > 1.8 && want > 0.5) { d = Math.atan2(wx, wz) - Math.atan2(P.v.x, P.v.z); d = Math.atan2(Math.sin(d), Math.cos(d)); }
    if (d !== 0 && Math.abs(d) < 2.1) {
      const slow = 1 - (C.turnSlow || 0) * Math.min(1, Math.abs(d) / 1.57) * Math.min(1, sp0 / C.sprint), want2 = want * slow; // вес: на крутом повороте темп ниже
      const k2 = 1 - Math.exp(-h * (want2 > sp0 ? C.accel * (P.boost || 1) * (P.accK || 1) : C.decel));
      const maxW = Math.max(C.curveMin, C.curve - sp0), a = Math.atan2(P.v.x, P.v.z) + Math.max(-maxW * h, Math.min(maxW * h, d)), m = sp0 + (want2 - sp0) * k2;
      P.v.x = Math.sin(a) * m; P.v.z = Math.cos(a) * m;
    } else { P.v.x += (wx - P.v.x) * k; P.v.z += (wz - P.v.z) * k; } }
  const nx = P.p.x + P.v.x * h, nz = P.p.z + P.v.z * h;
  P.p.x = Math.max(-C.bounds.x, Math.min(C.bounds.x, nx));
  P.p.z = Math.max(C.bounds.zMin, Math.min(C.bounds.zMax, nz));
  if (P.p.x !== nx) P.v.x = 0; if (P.p.z !== nz) P.v.z = 0; // упёрся в край поля — остановился (иначе мяч у ноги «уезжал» дальше)
  const sp = Math.hypot(P.v.x, P.v.z);
  P.acc = (sp - sp0) / h;
  P.stopping = want < 0.3 && sp > 0.4;
  P.yawRate = 0;
  if (P.lockYaw > 0) { P.lockYaw -= h; return P; } // финт: корпус не разворачивается за скоростью (шаг вбок)
  // face — точка, к которой игрок без мяча держит корпус (обычно мяч): смещается боком и спиной, как настоящий игрок
  const face = P.face && !withBall && !P.sprint && sp < C.jog * 1.15 ? P.face : null;
  if (face || sp > 0.3) {
    let d = (face ? Math.atan2(face.x - P.p.x, face.z - P.p.z) : Math.atan2(P.v.x, P.v.z)) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const rate = C.turn * (1 - (1 - C.turnAtSprint) * Math.min(1, sp / C.sprint));
    // не быстрее, чем может повернуться человек: ~430°/с стоя, ~260°/с на рывке (было без предела — разворот на 180° за
    // ~0,1 с, корпус на экране «щёлкал»; замер: 6 таких поворотов в секунду на поле)
    const wMax = C.turnMax * (1 - 0.4 * Math.min(1, sp / C.sprint)), step = Math.max(-wMax * h, Math.min(wMax * h, d * (1 - Math.exp(-h * rate))));
    P.yaw += step; P.yawRate = step / h;
  }
  return P;
}
const fwd = (P) => vec(Math.sin(P.yaw), 0, Math.cos(P.yaw));
// точка контроля: перед стопой ведущей ноги (правой или левой — b.sideK) по направлению ведения
export function controlPoint(P, b, out = vec()) {
  const C = CFG.control, f = fwd(P), sp = Math.hypot(P.v.x, P.v.z);
  // во время замаха мяч ведётся туда, где окажется ударная стопа в момент касания (b.strikeAt — из анимации удара)
  if (b && b.strikeAt) { const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw); return set(out, P.p.x + f.x * b.strikeAt.f + rx * b.strikeAt.s, CFG.R, P.p.z + f.z * b.strikeAt.f + rz * b.strikeAt.s); }
  const sk = b && b.sideK !== undefined ? b.sideK : 1; // +1 — у правой стопы, −1 — у левой; между ними — мяч переходит перед корпусом
  const reach = C.reach + C.reachPerSpeed * sp + (b ? b.push + (b.tpOff || 0) : 0) + C.footCross * (1 - Math.abs(sk)), side = Math.max(C.sideMin ?? C.side, C.side - (C.sidePerSpeed || 0) * sp) * sk;
  // правая сторона: при взгляде вдоль +z правая рука — это −x, т. е. вектор (−cos yaw, 0, sin yaw)
  const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw), fo = b && b.feintOff; // финт: стопа уводит мяч в сторону (плавно, без телепорта)
  return set(out, P.p.x + f.x * reach + rx * side + (fo ? fo.x : 0), CFG.R, P.p.z + f.z * reach + rz * side + (fo ? fo.z : 0));
}

// ---------- владение ----------
export function canCapture(b, P, who, t) {
  const C = CFG.control;
  if (b.state !== 'free') return false;
  if (b.lockOwner === who && (t < b.lockUntil || b.mustClear)) return false; // свой удар обратно не берём
  if (b.p.y > C.captureH) return false; // высокий мяч ногой с земли не взять
  const cp = controlPoint(P, null), d = Math.hypot(b.p.x - cp.x, b.p.z - cp.z);
  const rel = Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z, b.v.y);
  if (d > C.captureR) { // мяч катится рядом с игроком почти с его скоростью (сбоку, не за спиной) — тоже можно взять
    const rx = b.p.x - P.p.x, rz = b.p.z - P.p.z;
    if (!(rel < C.besideVrel && Math.hypot(rx, rz) < C.besideR && rx * Math.sin(P.yaw) + rz * Math.cos(P.yaw) > -0.2)) return false;
  }
  return rel <= C.captureVrel; // быстрый мяч мимо ноги — не идеальный приём, а рикошет
}
export function capture(b, P, who) {
  const C = CFG.control, rel = Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z, b.v.y);
  b.state = 'owned'; b.owner = who; b.trapT = 0; b.trapDur = C.trapBase + C.trapPerV * rel; b.push = 0; b.tp = null; b.tpOff = 0; b.tpV = 0; b.ffx = 0; b.ffz = 0; b.xfer = null; b.xferV = 0; b.footNext = undefined; b.touchCd = C.touchMin;
  b.p.y = CFG.R; b.v.y = 0; b.stopped = false; b.touchFirst = false;
  // нога, к которой пришёл мяч: с какой стороны от игрока он (без скачка точки контроля через корпус)
  const lat = (b.p.x - P.p.x) * -Math.cos(P.yaw) + (b.p.z - P.p.z) * Math.sin(P.yaw);
  b.foot = lat >= 0 ? 1 : -1; b.sideK = Math.max(-1, Math.min(1, lat / C.side)); b.footT = 0;
  return rel;
}
// мяч догоняет бегущего игрока сзади (или сзади-сбоку, почти по его следу): ещё не у ноги — приём ждёт, пока мяч выкатится
// вперёд (иначе касание «в ход» шло бы сквозь тело, и мяч гасился бы за спиной — убегающий игрок его терял)
export function overtaking(b, P) {
  const sp = Math.hypot(P.v.x, P.v.z), fx = sp > 1 ? P.v.x / sp : Math.sin(P.yaw), fz = sp > 1 ? P.v.z / sp : Math.cos(P.yaw);
  const rx = b.p.x - P.p.x, rz = b.p.z - P.p.z, along = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
  return along < 0.05 && along > -1.5 && lat < 0.45 && (b.v.x - P.v.x) * fx + (b.v.z - P.v.z) * fz > 1;
}
// мяч у пяток: позади на линии хода и не быстрее игрока — это не приём (ногой его не достать, касание ушло бы сквозь тело)
export function atHeels(b, P) {
  const sp = Math.hypot(P.v.x, P.v.z); if (sp < 1.5) return false;
  const fx = P.v.x / sp, fz = P.v.z / sp, rx = b.p.x - P.p.x, rz = b.p.z - P.p.z;
  return rx * fx + rz * fz < 0.05 && Math.abs(rx * fz - rz * fx) < 0.25;
}
// первое касание при приёме: мяч остаётся там, где его встретила стопа (никаких сдвигов), меняется только скорость —
// гасится прилёт, мяч уходит в сторону intent (вектор на поле x, z; null — куда смотрит корпус). Сквозь себя мяч не
// направляется: такой вектор уводится вбок, мяч обходит игрока по касательной.
export function firstTouch(b, P, who, intent, again = false) {
  const C = CFG.control, rel = again ? Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z) : capture(b, P, who), il = intent ? Math.hypot(intent.x, intent.z) : 0;
  let dx = Math.sin(P.yaw), dz = Math.cos(P.yaw);
  if (il > 0.2) { dx = intent.x / il; dz = intent.z / il; }
  else { const ps = Math.hypot(P.v.x, P.v.z); if (ps > 1) { dx = P.v.x / ps; dz = P.v.z / ps; } } // без ввода — мяч гасится по ходу игрока, а не «от груди» вперёд
  let rx = b.p.x - P.p.x, rz = b.p.z - P.p.z; const rl = Math.hypot(rx, rz) || 1, lat = Math.abs(rx * dz - rz * dx); rx /= rl; rz /= rl;
  const into = dx * rx + dz * rz;
  // сквозь тело — только если мяч позади и почти на линии нового хода (сбоку дальше 0,25 м он проходит мимо ноги)
  // первое касание джойстиком назад, сквозь себя: мягко гасим у ноги (как без джойстика), дальше — разворот с мячом
  // (stepToBall: повторное касание в сторону джойстика, пока корпус разворачивается). Раньше мяч отлетал вбок, а
  // игрок с тем же джойстиком убегал от него.
  let back = false;
  const front = (rx * Math.sin(P.yaw) + rz * Math.cos(P.yaw)) > 0.2; // мяч перед корпусом (джойстик назад — разворот, а не толчок мимо себя)
  if (into < -0.2 && (lat < 0.25 || front) && !again) { back = true; dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); } // гасим перед собой
  else if (into < -0.2 && lat < 0.25) { dx -= into * rx; dz -= into * rz; const l = Math.hypot(dx, dz); if (l < 1e-3) { dx = -rz; dz = rx; } else { dx /= l; dz /= l; } }
  // с джойстиком — мяч уходит вперёд по ходу (игрок бежит следом); без него — гасится у ноги (игрок тормозит)
  // без джойстика — подушка: мяч гасится у ноги, не быстрее 1,6 м/с (раньше быстрый пас после касания откатывался
  // на 3–4 м/с, игрок тормозил, мяч уходил от него — его подбирал другой). Замер цепочки пасов: 27 из 27, потерь 0;
  // вариант «мяч катится с бегущим игроком» — 9 потерь из 26
  // с джойстиком: мяч уходит не дальше чем на ~2 м/с быстрее игрока; если игрок бежит в другую сторону — короткое касание
  // (он развернётся и заберёт), иначе мяч уезжал от него на 5+ м/с и сразу считался потерянным
  // приём на бегу: мяч уходит в ход с запасом к скорости, которую игрок набирает по джойстику (P.wx, P.wz — чего он хочет
  // в этом шаге), а не к той, что была в момент касания: раньше разгоняющийся игрок сразу обгонял мяч, тот оставался
  // за спиной, и ведение «дотягивало» его пружиной — мяч прыгал вперёд (тот самый «отскок» на бегу)
  // (не быстрее, чем он может бежать с мячом: с мячом медленнее, иначе мяч уходил на 2 м/с вперёд и ведение «тянуло» его назад)
  const PC = CFG.player, vBall = (P.sprint ? PC.sprint : PC.jog) * PC.withBall * (P.spd || 1);
  const pv = P.v.x * dx + P.v.z * dz, pw = Math.max(pv, Math.min(vBall, il > 0.2 ? (P.wx || 0) * dx + (P.wz || 0) * dz : 0));
  const s = il > 0.2 && !back ? (pw < 0.5 ? Math.min(1.2, 0.5 + C.touchOut * 0.5 * Math.min(1, il)) : Math.min(pw + 0.8, Math.max(pv, pw * 0.85) + C.touchOut * Math.min(1, il) + C.touchKeep * Math.min(rel, 8))) : Math.min(1.2, Math.max(0, P.v.x * dx + P.v.z * dz) * 0.45 + C.touchSoft * 0.5); // скорость прилёта гасится целиком: мяч и тормозящий игрок останавливаются вместе
  b.v.x = dx * s; b.v.z = dz * s; b.w.x = b.v.z / CFG.R; b.w.y = 0; b.w.z = -b.v.x / CFG.R;
  b.trapT = 0; b.trapDur = C.touchFree + C.touchFreePerV * rel; b.touchFirst = true; b.touchSoft = !(il > 0.2) || back;
  return rel;
}
// снять «запрет на свой мяч», когда мяч отошёл от игрока
export function updateClear(b, P, who) {
  if (b.lockOwner === who && b.mustClear && Math.hypot(b.p.x - P.p.x, b.p.z - P.p.z) > CFG.control.clearDist) b.mustClear = false;
}
// касание при ведении: мяч отходит вперёд (на рывке дальше)
export function touch(b, P, T) {
  const C = CFG.control, sp = Math.hypot(P.v.x, P.v.z);
  // поворот ждёт перекладывания: этот шаг ноги с мячом — внутренней стороной стопы мяч уходит к другой ноге
  if (b.footNext !== undefined) { b.xfer = { t: 0, T: C.xferT, s0: b.sideK, s1: b.footNext }; b.foot = b.footNext; b.footNext = undefined; b.xferN = (b.xferN || 0) + 1; }
  // T — через сколько секунд следующий шаг этой ноги (из анимации бега): толчок с качением до него
  if (T > 0) { b.tp = { t: 0, T: Math.min(0.9, Math.max(0.25, T)), A: Math.min(C.touchAMax, C.touchA0 + C.touchAPerV * sp) * (P.dribK || 1) * (b.xfer && b.xfer.t === 0 ? 0.5 : 1) }; // перекладывание — мяч больше вбок, чем вперёд b.push = 0; b.roll = 0;
    b.touchCd = Math.max(C.touchMin, Math.min(C.touchMax, 0.62 - sp * 0.045)); return; }
  b.push = (C.touchPush + C.touchPushPerSpeed * sp) * (P.dribK || 1); b.roll = C.rollTime || 0; // dribK — дриблинг карточки
  b.touchCd = Math.max(C.touchMin, Math.min(C.touchMax, 0.62 - sp * 0.045));
}
// шаг ведения: мяч мягко следует за точкой контроля (демпфированная «пружина» с ограничением), без телепортаций.
// obstacles — шары тел соперника: мяч в них упирается, а не проходит насквозь. Возвращает 'lost', если владение потеряно.
const cpTmp = vec();
// выбор ноги ведения (см. footTurn): по тому, куда игрок хочет повернуть (P.wx, P.wz — желаемая скорость этого шага)
export function footStep(b, P, h) {
  const C = CFG.control; if (b.foot === undefined) { b.foot = 1; b.sideK = 1; b.footT = 9; }
  b.footT += h; const wl = Math.hypot(P.wx || 0, P.wz || 0);
  if (wl > 0.8 && b.footT > C.footHold && !b.strikeAt) {
    let a = Math.atan2(P.wx, P.wz) - P.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); // > 0 — поворот влево
    // заметный поворот: нога — по стороне поворота, и касание сразу (мяч меняет направление касанием, а не сам).
    // Решение одно на весь поворот (b.turning): пока корпус не довернул, нога не перевыбирается — иначе на развороте
    // 180° мяч метался от ноги к ноге. Разворот почти на 180°: сторона — та же, что у записи разворота (через какое плечо).
    if (b.turning && Math.abs(a) < 0.35) b.turning = false;
    if (Math.abs(a) > C.footTurn && !b.turning) {
      const cr = P.v.x * P.wz - P.v.z * P.wx; // как и запись разворота (autoMoves): > 0 — через левое плечо
      const side = Math.abs(a) > 2.6 ? (Math.abs(cr) > 0.3 ? Math.sign(cr) : -b.foot) : Math.sign(a); // > 0 — влево
      const nf = side > 0 ? -1 : 1; b.footT = 0; b.turning = true; b.touchCd = Math.min(b.touchCd, 0);
      if (nf !== b.foot && !b.xfer) { b.footNext = nf; b.footNextT = 0; } else if (nf === b.foot) b.footNext = undefined; }
  }
  // ждём шага ноги с мячом (перекладывание касанием, touch); не дождались, замах паса/удара — мяч переходит сам, плавно
  if (b.footNext !== undefined && ((b.footNextT += h) > C.xferWait || b.strikeAt)) { b.foot = b.footNext; b.footNext = undefined; }
  if (b.xfer) { const X = b.xfer; X.t += h; const u = Math.min(1, X.t / X.T); b.sideK = X.s0 + (X.s1 - X.s0) * (1 - (1 - u) * (1 - u)); // быстро от стопы, к другой — замедляясь (катится)
    b.xferV = u < 1 ? (X.s1 - X.s0) * 2 * (1 - u) / X.T : 0; if (u >= 1) b.xfer = null; return; }
  b.xferV = 0; const d = b.foot - b.sideK, m = C.footRate * h; b.sideK += Math.max(-m, Math.min(m, d));
}
export function controlStep(b, P, h, obstacles) {
  const C = CFG.control, R = CFG.R;
  footStep(b, P, h);
  b.touchCd -= h;
  b.push *= Math.exp(-h * C.pushDecay * (P.stopping ? 3 : 1)); // остановка: касание сразу гасится
  b.trapT += h; if (b.roll > 0) b.roll -= h;
  const trapK = b.trapDur > 0 ? Math.min(1, b.trapT / b.trapDur) : 1, ease = trapK * trapK * (3 - 2 * trapK);
  // касание в такт шагу: вынос мяча вперёд по «качению» — скорость сразу после толчка, равномерное торможение, к
  // следующему шагу мяч снова у стопы (вынос = A·4s(1−s), s — доля пути до следующего касания). Остановка, приём,
  // замах — касание гасится (мяч обычной «пружиной» у ноги)
  let tpV = 0; if (b.tp && (P.stopping || b.touchFirst || b.strikeAt)) b.tp = null;
  if (b.tp) { b.tp.t += h; const s = b.tp.t / b.tp.T; if (s >= 1) { b.tp = null; b.tpOff = 0; } else { b.tpOff = b.tp.A * 4 * s * (1 - s); tpV = b.tp.A * 4 * (1 - 2 * s) / b.tp.T; } } else b.tpOff = 0;
  const cp = controlPoint(P, b, cpTmp);
  let ex = cp.x - b.p.x, ez = cp.z - b.p.z;
  // первое касание: сначала мяч катится сам (только трение), потом ведение плавно набирает силу
  let free = false, blend = 1;
  // мягкий приём (без джойстика): скорость прилёта уже погашена — мяч сразу у ноги под обычным контролем (без фазы, где он
  // катится сам и игрок «танцует» вокруг него); сила поправки умеренная — без «магнита» издалека
  const soft = b.touchFirst && b.touchSoft && !b.strikeAt;
  if (b.touchFirst && !b.strikeAt && !soft) { // замах (пас/удар сразу после приёма) — мяч сразу ведётся к ударной ноге
    if (b.trapT < b.trapDur) free = true;
    else { const u = Math.min(1, (b.trapT - b.trapDur) / C.touchBlend); blend = u * u * (3 - 2 * u);
      if (u >= 1 && (Math.hypot(ex, ez) < 0.3 || b.trapT > 1.8)) b.touchFirst = false; } // мяч ещё не у ноги — ведение не включается в полную силу
  }
  let ffx = 0, ffz = 0;
  if (free) {
    const sp = Math.hypot(b.v.x, b.v.z), ns = Math.max(0, sp - C.touchDecel * h), f = sp > 1e-6 ? ns / sp : 0; b.v.x *= f; b.v.z *= f; b.v.y = 0;
  } else {
    // желаемая скорость = скорость игрока + ограниченная поправка к точке контроля
    const g = C.gain * (P.stopping ? C.stopTrap : 1) * (b.roll > 0 && !P.stopping ? (C.rollGain ?? 1) : 1); // сразу после касания мяч катится почти сам
    let cx = ex * g, cz = ez * g;
    // после первого касания мяч не «догоняет» игрока издалека: пружина сильна только у самой стопы
    const far = b.touchFirst && !soft ? Math.max(0.15, Math.min(1, 1 - (Math.hypot(ex, ez) - 0.3) / 0.45)) : 1;
    const mc = C.maxCorr * (soft ? 0.6 : (0.25 + 0.75 * blend) * far), cl = Math.hypot(cx, cz); if (cl > mc) { cx *= mc / cl; cz *= mc / cl; }
    if (soft && Math.hypot(ex, ez) < 0.3) b.touchFirst = false; // мяч у ноги — обычное ведение
    // скорость от касаний: вперёд (качение tpV) и вбок (перекладывание: ширина постановки ноги × скорость перехода sideK)
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), sw = Math.max(C.sideMin ?? C.side, C.side - (C.sidePerSpeed || 0) * Math.hypot(P.v.x, P.v.z)), latV = sw * (b.xferV || 0);
    ffx = fx * tpV - Math.cos(P.yaw) * latV; ffz = fz * tpV + Math.sin(P.yaw) * latV; const dvx = P.v.x + cx + ffx, dvz = P.v.z + cz + ffz;
    // толчок виден сразу: изменение скорости от касания передаётся мячу без сглаживания (стопа ударила — мяч поехал);
    // торможение — тоже сразу; иначе (касание запоздало) мяч плавно, без рывка
    const kick = (b.tp && b.tp.t <= h * 1.5) || (b.xfer && b.xfer.t <= h * 1.5), dX = ffx - (b.ffx || 0), dZ = ffz - (b.ffz || 0);
    if (kick || Math.hypot(ffx, ffz) < Math.hypot(b.ffx || 0, b.ffz || 0)) { b.v.x += dX; b.v.z += dZ; }
    // приём: сначала мяч живёт своей скоростью, контроль включается плавно (сильный прилёт гасится дольше)
    const k = 1 - Math.exp(-h * C.resp * (soft ? 0.6 : b.touchFirst ? 0.1 + 0.9 * blend : 0.15 + 0.85 * ease));
    b.v.x += (dvx - b.v.x) * k; b.v.z += (dvz - b.v.z) * k; b.v.y = 0;
  }
  b.tpV = free ? 0 : tpV; if (free) { b.ffx = 0; b.ffz = 0; } else { b.ffx = ffx; b.ffz = ffz; }
  b.p.x += b.v.x * h; b.p.z += b.v.z * h; b.p.y = R;
  // не сквозь ноги: мяч не ближе bodyR к центру игрока
  let rx = b.p.x - P.p.x, rz = b.p.z - P.p.z, rl = Math.hypot(rx, rz);
  if (rl < C.bodyR) {
    if (rl < 1e-4) { rx = Math.sin(P.yaw); rz = Math.cos(P.yaw); rl = 1; }
    rx /= rl; rz /= rl; b.p.x = P.p.x + rx * C.bodyR; b.p.z = P.p.z + rz * C.bodyR;
    const vn = (b.v.x - P.v.x) * rx + (b.v.z - P.v.z) * rz; if (vn < 0) { b.v.x -= vn * rx; b.v.z -= vn * rz; }
  }
  // соперник: мяч упирается в его тело (его нельзя протащить насквозь)
  if (obstacles) for (const s of obstacles) {
    if (s.y - s.r > R * 2) continue;
    // мяч катится по земле — выталкиваем по горизонтали ровно до касания шаров
    const dy = b.p.y - s.y, need = (R + s.r) ** 2 - dy * dy; if (need <= 0) continue;
    let nx = b.p.x - s.x, nz = b.p.z - s.z, hd = Math.hypot(nx, nz); const want = Math.sqrt(need);
    if (hd >= want) continue;
    if (hd < 1e-6) { nx = -Math.sin(P.yaw); nz = -Math.cos(P.yaw); hd = 1; } nx /= hd; nz /= hd;
    b.p.x = s.x + nx * want; b.p.z = s.z + nz * want;
    const vn = (b.v.x - (s.vx || 0)) * nx + (b.v.z - (s.vz || 0)) * nz; if (vn < 0) { b.v.x -= vn * nx; b.v.z -= vn * nz; }
  }
  // качение: вращение ровно по скорости
  b.w.x = b.v.z / R; b.w.y = 0; b.w.z = -b.v.x / R;
  // покой у ноги: без микродрожания
  if (Math.hypot(P.v.x, P.v.z) < 0.05 && Math.hypot(ex, ez) < 0.004 && Math.hypot(b.v.x, b.v.z) < 0.05) { b.v.x = 0; b.v.z = 0; b.w.x = 0; b.w.z = 0; }
  // мяч ушёл после приёма сам (без соперника) — свободен, и тот же игрок может сразу снова его взять
  if (Math.hypot(cp.x - b.p.x, cp.z - b.p.z) > (b.touchFirst ? C.touchLose : C.loseDist)) return release(b, null, 0, 0.25, !b.touchFirst), 'lost';
  return null;
}
// отпустить мяч (удар, потеря); lock — сколько секунд бывший владелец не может его снова взять
export function release(b, who, t, lock = CFG.control.regrab, mustClear = true) {
  b.lockOwner = who ?? b.owner; b.lockUntil = t + lock; b.mustClear = mustClear;
  b.state = 'free'; b.owner = null; b.push = 0; b.tp = null; b.tpOff = 0; b.tpV = 0; b.ffx = 0; b.ffz = 0; b.xfer = null; b.xferV = 0; b.footNext = undefined; b.stopped = false; b.trapT = 1; b.strikeAt = null; b.feintOff = null; b.touchFirst = false;
}

// ---------- удар ----------
// Направление и высота считаются отдельно. Сила (0…1) линейно задаёт скорость. Никакого скрытого наведения и случайного разброса:
// одинаковые действия — одинаковый результат.
// aim: { x, y } — джойстик в момент удара. Наклонён — удар в сторону ворот по углу джойстика (вверх — в центр,
// на stickAngle вбок — в штангу); не наклонён — туда, куда смотрит корпус.
// kind: 'drive' — обычный удар (как раньше); 'curl' — щёчкой с подкруткой (curlSide: +1 — закрутить влево, −1 — вправо,
// 0 — к дальней штанге); 'chip' — переброс: медленнее, выше, с обратным вращением (мяч опускается под перекладину)
export function shotVelocity(b, P, aim, pw, kind, goal, curlSide = 0) {
  if (kind === true) kind = 'curl'; else if (!kind) kind = 'drive';
  const fin = kind === 'curl', chip = kind === 'chip';
  const S = CFG.shot, R = CFG.R;
  const L = Math.hypot(aim.x, aim.y);
  let tx = null; // точка на линии ворот, куда целимся (null — по корпусу)
  if (L > 0.25) {
    const a = Math.atan2(aim.x, Math.max(aim.y, -0.2)) / S.stickAngle; tx = Math.max(-1.7, Math.min(1.7, a)) * goal.w;
    // подкрутка «по центру» (или без выбора стороны) — в дальнюю штангу, как finesse в FC Mobile
    if (fin && !curlSide && Math.abs(a) < 0.3 && Math.abs(b.p.x) > 1) tx = -Math.sign(b.p.x) * goal.w * 0.7;
  } else if (fin && !curlSide) tx = -Math.sign(b.p.x || 1) * goal.w * 0.7;
  const build = (ax) => { // ax — куда направлена нога по линии ворот (без учёта вращения)
    let dx, dz;
    if (ax !== null) { dx = ax - b.p.x; dz = -b.p.z; if (dz > -0.5) dz = -0.5; } else { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
    const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    // скорость: сила + ограниченная добавка от бега вдоль удара
    const along = Math.max(0, P.v.x * dx + P.v.z * dz);
    let speed = S.vMin + (S.vMax - S.vMin) * pw + Math.min(S.runBonusMax, along * S.runBonus);
    if (fin) speed *= S.finesseSpeed;
    if (chip) speed = Math.max(S.chipMin, speed * S.chipSpeed);
    // высота у линии ворот: растёт с силой (слабый — низом, полный — под перекладину); перебор силы — выше
    const hT = (chip ? S.chipHeight : fin ? S.finesseHeight : S.hLow + (S.hHigh - S.hLow) * Math.pow(Math.max(0, pw), 1.5)) + Math.max(0, pw - S.overPower) * S.overLift;
    const dist = dz < -0.05 ? Math.min(40, b.p.z / -dz) : 20, tt = dist / speed;
    let vy = (hT - R + 0.5 * CFG.g * tt * tt) / tt; vy = Math.max(0.4, Math.min(speed * 0.6, vy));
    const vh = Math.sqrt(Math.max(1, speed * speed - vy * vy));
    const v = vec(dx * vh, vy, dz * vh);
    // вращение: сильный удар — верхнее (ныряет); подкрутка — вокруг вертикали, уводит мяч к центру ворот (плавно, физикой)
    const top = chip ? -S.chipBackspin : S.topspin * pw * (fin ? 0.3 : 1); // у переброса — обратное вращение
    const w = vec(dz * top, 0, -dx * top);
    if (fin) { const ref = tx !== null ? tx : b.p.x + dx * dist, side = curlSide || (Math.abs(ref) > 0.3 ? Math.sign(ref) : 1); w.y = side * S.finesseSpin; } // w.y > 0 — мяч уходит влево (−x)
    return { v, w, speed };
  };
  let ax = tx, sv = build(ax);
  // подкрутка: нога целит с поправкой на дугу, чтобы мяч пришёл в выбранную точку (после удара мяч летит сам, без доводки)
  if (fin && tx !== null && b.p.z > 1) for (let i = 0; i < 3; i++) {
    const cr = predict(b.p, sv.v, sv.w, 0); if (!(cr.t < 2.9)) break;
    const e = cr.p.x - tx; if (Math.abs(e) < 0.05) break;
    ax = Math.max(-goal.w * 4, Math.min(goal.w * 4, ax - e)); sv = build(ax);
  }
  return sv;
}
// импульс удара — ровно один раз; если мяч далеко от ударной точки — нога не достала (промах)
export function applyShot(b, shotV, contact, who, t) {
  if (b.state !== 'strike' && b.state !== 'owned') return false;
  if (Math.hypot(b.p.x - contact.x, b.p.z - contact.z) > CFG.shot.contactR || b.p.y > 0.5) { release(b, who, t, 0.2, false); return false; }
  set(b.v, shotV.v.x, shotV.v.y, shotV.v.z); set(b.w, shotV.w.x, shotV.w.y, shotV.w.z);
  b.p.y = CFG.R + 0.001;
  release(b, who, t);
  return true;
}

// ---------- пас ----------
// Пас низом катится и тормозит о траву ровно по модели ground() (dv/dt = −(a + b·v)), поэтому скорость удара подбирается
// так, чтобы мяч дошёл до точки с нужной скоростью. Верховой — дуга (без самонаведения: после касания мяч свободен).
// торможение катящегося мяча — то же, что в ground() и integrate(): трава (a + b·v) плюс воздух (KA·Cd(v)·v²)
const rollDecel = (v) => CFG.grass.rollConst + CFG.grass.rollLin * v + KA() * cdOf(v) * v * v;
function rollRun(v0, v1) { let v = v0, x = 0, t = 0; const h = 1 / 240; while (v > v1 && t < 20) { x += v * h; v -= rollDecel(v) * h; t += h; } return { x, t }; }
export function rollDistance(v0, v1) { return rollRun(v0, v1).x; }
export function rollTime(v0, v1) { return rollRun(v0, v1).t; }
export function passSpeedFor(dist, arrive) { let lo = arrive, hi = 45; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (rollDistance(m, arrive) < dist) lo = m; else hi = m; } return (lo + hi) / 2; }
// kind: 'ground' — низом в ноги или на ход; 'lofted' — верхом. power 0…1: сильнее — быстрее приходит (труднее принять)
export function passVelocity(b, target, kind = 'ground', power = 0) {
  const S = CFG.pass, dx = target.x - b.p.x, dz = target.z - b.p.z, d = Math.max(0.5, Math.hypot(dx, dz)), ux = dx / d, uz = dz / d;
  if (kind === 'lofted') {
    const t = Math.min(S.loftTimeMax, Math.max(S.loftTimeMin, S.loftTime0 + d * S.loftTimePerM)), vh = (d / t) * S.loftDrag, vy = 0.5 * CFG.g * t;
    return { v: vec(ux * vh, vy, uz * vh), w: vec(-uz * S.loftBackspin, 0, ux * S.loftBackspin), speed: Math.hypot(vh, vy), time: t };
  }
  const arrive = S.arrive + (S.arriveStrong - S.arrive) * power;
  const v0 = Math.min(S.vMax, Math.max(S.vMin, passSpeedFor(d, arrive)));
  return { v: vec(ux * v0, 0, uz * v0), w: vec(uz * v0 / CFG.R, 0, -ux * v0 / CFG.R), speed: v0, time: rollTime(v0, Math.max(0.3, Math.min(arrive, v0 - 0.01))) };
}

// ---------- фиксированный шаг ----------
// накопитель времени: вызывай add(dt) раз в кадр, step() — сколько вернёт steps; alpha — для плавной картинки между шагами
export function clockFixed() {
  return { acc: 0, add(dt) { this.acc = Math.min(this.acc + Math.max(0, dt), CFG.maxFrame); let n = 0; while (this.acc >= CFG.dt) { this.acc -= CFG.dt; n++; } return n; }, get alpha() { return this.acc / CFG.dt; } };
}

// ---------- автоподбор свободного мяча (активный игрок) ----------
// chaseDecide — включать ли преследование с учётом ввода (гистерезис: включается при отпущенном джойстике или вводе
// к мячу, выключается только при явном вводе в другую сторону). chaseVel — желаемая скорость игрока, м/с (x, z):
// далеко — сразу полный рывок к точке перехвата meet; у самой точки — торможение; у мяча — скорость мяча плюс мягкое
// сближение (не проскакивает и не кружит). boost — во сколько раз быстрее разгон. Отпускает при отклонении джойстика
// больше ~60° от мяча (было ~83°: ручной ввод почти не перебивал автоподбор), подправка к мячу — 40 % (было 65 %).
export const CHASE = { plan: 0.1, boost: 2.6, neutral: 0.25, off: 0.45, cosOn: Math.cos(0.8), cosOff: Math.cos(1.05), near: 2.4, close: 2.6, assist: 0.4, brake: 3 };
export function chaseDecide(on, mag, cosA, C = CHASE) {
  if (on) return !(mag > C.off && cosA < C.cosOff);
  return mag < C.neutral || cosA > C.cosOn;
}
export function chaseVel(P, b, meet, C = CHASE) {
  const pl = CFG.player, bx = b.p.x - P.p.x, bz = b.p.z - P.p.z, dBall = Math.hypot(bx, bz);
  if (dBall < C.near && b.p.y < 0.5) {
    // мяч у пяток и катится туда же, куда бежит игрок, — игрок чуть притормаживает, мяч выкатывается к ноге
    // (раньше автоматика держала скорость мяча, и мяч секунду «висел» за спиной, пока не ударялся в ноги)
    const ps = Math.hypot(P.v.x, P.v.z), bs = Math.hypot(b.v.x, b.v.z);
    if (ps > 1.5 && bs > 1.5 && (P.v.x * b.v.x + P.v.z * b.v.z) / (ps * bs) > 0.7) {
      const fx = P.v.x / ps, fz = P.v.z / ps, al = bx * fx + bz * fz;
      if (al < 0.1 && al > -1.5 && Math.abs(bx * fz - bz * fx) < 0.45) { const k = Math.max(0, bs - 1.6) / bs; return { x: b.v.x * k, z: b.v.z * k, boost: 1, near: true }; }
    }
    const px = bx + b.v.x * 0.12, pz = bz + b.v.z * 0.12, l = Math.hypot(px, pz) || 1e-6, cl = Math.min(C.close, l * 2.2);
    // подстраиваемся под скорость мяча, только если он убегает или катится вбок; мяч, который катится НА игрока, —
    // не повод бежать назад (раньше получатель паса пятился от мяча, и анимация разворота уводила его спиной к мячу)
    const nx = bx / (dBall || 1e-6), nz = bz / (dBall || 1e-6), va = b.v.x * nx + b.v.z * nz, cut = va < 0 ? va : 0;
    return { x: b.v.x - nx * cut + (px / l) * cl, z: b.v.z - nz * cut + (pz / l) * cl, boost: 1, near: true };
  }
  const tx = meet.x - P.p.x, tz = meet.z - P.p.z, d = Math.hypot(tx, tz) || 1e-6, sp = d > C.brake ? pl.sprint : Math.max(2, d * 2.2);
  return { x: (tx / d) * sp, z: (tz / d) * sp, boost: C.boost, near: false };
}

