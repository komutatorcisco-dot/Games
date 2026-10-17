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
    rollLin: 0.32,    // … и часть, растущая со скоростью (трава), 1/с
    spinDecay: 3,     // вращение вокруг вертикали гаснет о траву, доля в секунду
    restSpeed: 0.06,  // медленнее — мяч останавливается совсем (нет вечного микродвижения)
  },
  post: { r: 0.06, e: 0.6, friction: 0.18, spinKeep: 0.35 },     // штанги и перекладина: металл, упругий удар с трением
  net: { k: 900, c: 16, maxPen: 0.5, maxBack: 1.2, friction: 4 }, // сетка: пружина, вязкость, предел прогиба, «обратно не выталкивает»
  keeper: {
    catchHands: 21,     // поймать двумя руками можно мяч не быстрее, м/с (относительно рук)
    catchChest: 15,     // принять на корпус — не быстрее, м/с
    twoHands: 0.24,     // «двумя руками» — обе кисти не дальше этого от поверхности мяча, м
  },
  body: { e: 0.3, friction: 0.4 },    // мяч о тело игрока (ноги, корпус) — мягко
  hands: { e: 0.35, friction: 0.3 },  // отбивание руками вратаря

  player: {
    jog: 3.9, sprint: 6.6,  // скорость бега и рывка, м/с
    withBall: 0.93,         // с мячом бежит чуть медленнее
    charging: 0.55,         // пока копишь удар — медленнее (джойстик в это время целится)
    accel: 3.2, decel: 5.5, // разгон и торможение (скорость приближения к желаемой, 1/с) — у игрока есть вес
    turn: 9,                // скорость разворота корпуса, 1/с
    turnAtSprint: 0.55,     // на полном ходу разворачивается медленнее (доля)
    bounds: { x: 30, zMin: 1.2, zMax: 42 },
  },
  control: {
    reach: 0.38,            // мяч перед стопой, м (от центра игрока)
    reachPerSpeed: 0.035,   // на бегу — чуть дальше, с на м/с
    side: 0.09,             // смещение к ведущей (правой) ноге, м
    gain: 9,                // как быстро мяч догоняет точку контроля, 1/с
    maxCorr: 5.5,           // но не быстрее этой добавки к скорости игрока, м/с — пружина не бесконечная
    resp: 22,               // инерция мяча: скорость меняется не мгновенно, 1/с
    touchPush: 0.1,         // касание: мяч отходит вперёд на столько…
    touchPushPerSpeed: 0.04,// … плюс столько на каждый м/с (на рывке — дальше)
    pushDecay: 5,           // как быстро касание «гаснет», 1/с
    touchMin: 0.3,          // касания не чаще, с
    touchMax: 0.6,          // и не реже (если нога в анимации не дотянулась)
    bodyR: 0.27,            // ближе к центру игрока мяч не проходит (сквозь ноги)
    loseDist: 1.3,          // мяч оттеснили от точки контроля дальше этого (соперник) — владение потеряно
    captureR: 0.6,          // принять мяч можно в этом радиусе от точки контроля…
    captureH: 0.32,         // … если мяч не выше (ногой с земли высокий мяч не взять)
    captureVrel: 9,         // … и летит относительно игрока не быстрее, м/с
    trapBase: 0.1,          // приём: сколько секунд мяч «гасится» минимум…
    trapPerV: 0.035,        // … плюс столько на каждый м/с скорости прилёта
    regrab: 0.45,           // после своего удара тот же игрок не берёт мяч столько секунд…
    clearDist: 1.1,         // … и пока мяч не отойдёт от него хотя бы на столько метров
    stopTrap: 1.8,          // остановка: мяч гасится быстрее во столько раз
  },
  shot: {
    vMin: 13, vMax: 31,       // скорость мяча при слабом и сильном ударе, м/с (сила 0…1 — линейно)
    runBonus: 0.3,            // скорость бега вдоль удара добавляет столько от себя…
    runBonusMax: 1.8,         // … но не больше, м/с
    height: 0.9,              // обычный удар идёт на высоте ≈ 0,9 м у линии ворот (без сопротивления воздуха; на деле чуть ниже)
    finesseHeight: 1.35,      // удар щёчкой с подкруткой — чуть выше
    overPower: 0.92,          // сила выше этой — удар «перебран»…
    overLift: 22,             // … и уходит выше: +столько метров высоты на единицу перебора
    topspin: 7,               // верхнее вращение сильного удара (мяч «ныряет»), рад/с при силе 1
    finesseSpeed: 0.85,       // удар с подкруткой медленнее
    finesseSpin: 36,          // вращение подкрутки, рад/с (≈ 6 оборотов в секунду)
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
  Object.assign(b, { state: 'free', owner: null, lockOwner: null, lockUntil: 0, mustClear: false, push: 0, touchCd: 0, trapT: 1, trapDur: 0, inGoal: false, goal: false, stopped: false });
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
  const { n, vn } = c, R = CFG.R;
  let rx = b.v.x - (s.vx || 0), ry = b.v.y - (s.vy || 0), rz = b.v.z - (s.vz || 0);
  rx -= (1 + mat.e) * vn * n.x; ry -= (1 + mat.e) * vn * n.y; rz -= (1 + mat.e) * vn * n.z;
  const vn2 = rx * n.x + ry * n.y + rz * n.z;
  rx -= mat.friction * (rx - vn2 * n.x); ry -= mat.friction * (ry - vn2 * n.y); rz -= mat.friction * (rz - vn2 * n.z);
  set(b.v, rx + (s.vx || 0), ry + (s.vy || 0), rz + (s.vz || 0));
  const push = R + s.r - c.L; b.p.x += n.x * push; b.p.y += n.y * push; b.p.z += n.z * push;
  b.w.x *= 0.5; b.w.y *= 0.5; b.w.z *= 0.5;
}

// ---------- шаг свободного мяча ----------
// world: { goal, spheres: [...], onSphere(s, contact) → 'bounce' | 'stop' }
// возвращает события: [{ type: 'bounce', v } | { type: 'post'|'bar' } | { type: 'net', v } | { type: 'goal' } | { type: 'side' } | { type: 'touch', s, c }]
export function stepFree(b, h, world, ev = []) {
  const goal = world.goal, z0 = b.p.z;
  integrate(b, h);
  const imp = ground(b, h); if (imp > 1.2) ev.push({ type: 'bounce', v: imp });
  if (goal) {
    // мяч целиком прошёл линию между штангами и под перекладиной — гол (один раз)
    if (z0 > 0 && b.p.z <= 0 && Math.abs(b.p.x) < goal.w - CFG.post.r - CFG.R * 0.5 && b.p.y < goal.h) b.inGoal = true;
    if (b.inGoal && !b.goal && b.p.z < -(CFG.R + CFG.post.r) && Math.abs(b.p.x) < goal.w - CFG.post.r && b.p.y < goal.h - CFG.post.r) { b.goal = true; ev.push({ type: 'goal' }); }
    const pst = posts(b, goal); if (pst) ev.push({ type: pst });
    if (b.inGoal) { const nv = netInside(b, goal, h); if (nv) ev.push({ type: 'net', v: nv }); }
    else if (netOutside(b, goal)) ev.push({ type: 'side' });
  }
  if (world.spheres) for (const s of world.spheres) {
    const c = sphereHit(b, s); if (!c) continue;
    const r = world.onSphere ? world.onSphere(s, c) : 'bounce';
    if (r === 'stop') return ev; // мяч забрал вратарь
    if (r !== 'pass') { sphereBounce(b, s, c, s.kind === 'hand' ? CFG.hands : CFG.body); ev.push({ type: 'touch', s, c }); }
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
  const max = (P.sprint ? C.sprint : C.jog) * (withBall ? C.withBall : 1) * (P.charging ? C.charging : 1);
  const wx = inp.x * max, wz = -inp.y * max, want = Math.hypot(wx, wz), sp0 = Math.hypot(P.v.x, P.v.z);
  const k = 1 - Math.exp(-h * (want > sp0 ? C.accel : C.decel));
  P.v.x += (wx - P.v.x) * k; P.v.z += (wz - P.v.z) * k;
  P.p.x = Math.max(-C.bounds.x, Math.min(C.bounds.x, P.p.x + P.v.x * h));
  P.p.z = Math.max(C.bounds.zMin, Math.min(C.bounds.zMax, P.p.z + P.v.z * h));
  const sp = Math.hypot(P.v.x, P.v.z);
  P.acc = (sp - sp0) / h;
  P.stopping = want < 0.3 && sp > 0.4;
  P.yawRate = 0;
  if (sp > 0.3) {
    let d = Math.atan2(P.v.x, P.v.z) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const rate = C.turn * (1 - (1 - C.turnAtSprint) * Math.min(1, sp / C.sprint)), step = d * (1 - Math.exp(-h * rate));
    P.yaw += step; P.yawRate = step / h;
  }
  return P;
}
const fwd = (P) => vec(Math.sin(P.yaw), 0, Math.cos(P.yaw));
// точка контроля: перед стопой ведущей (правой) ноги по направлению ведения
export function controlPoint(P, b, out = vec()) {
  const C = CFG.control, f = fwd(P), sp = Math.hypot(P.v.x, P.v.z);
  const reach = C.reach + C.reachPerSpeed * sp + (b ? b.push : 0);
  // правая сторона: при взгляде вдоль +z правая рука — это −x, т. е. вектор (−cos yaw, 0, sin yaw)
  const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
  return set(out, P.p.x + f.x * reach + rx * C.side, CFG.R, P.p.z + f.z * reach + rz * C.side);
}

// ---------- владение ----------
export function canCapture(b, P, who, t) {
  const C = CFG.control;
  if (b.state !== 'free') return false;
  if (b.lockOwner === who && (t < b.lockUntil || b.mustClear)) return false; // свой удар обратно не берём
  if (b.p.y > C.captureH) return false; // высокий мяч ногой с земли не взять
  const cp = controlPoint(P, null), d = Math.hypot(b.p.x - cp.x, b.p.z - cp.z);
  if (d > C.captureR) return false;
  const rel = Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z, b.v.y);
  return rel <= C.captureVrel; // быстрый мяч мимо ноги — не идеальный приём, а рикошет
}
export function capture(b, P, who) {
  const C = CFG.control, rel = Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z, b.v.y);
  b.state = 'owned'; b.owner = who; b.trapT = 0; b.trapDur = C.trapBase + C.trapPerV * rel; b.push = 0; b.touchCd = C.touchMin;
  b.p.y = CFG.R; b.v.y = 0; b.stopped = false;
  return rel;
}
// снять «запрет на свой мяч», когда мяч отошёл от игрока
export function updateClear(b, P, who) {
  if (b.lockOwner === who && b.mustClear && Math.hypot(b.p.x - P.p.x, b.p.z - P.p.z) > CFG.control.clearDist) b.mustClear = false;
}
// касание при ведении: мяч отходит вперёд (на рывке дальше)
export function touch(b, P) {
  const C = CFG.control, sp = Math.hypot(P.v.x, P.v.z);
  b.push = C.touchPush + C.touchPushPerSpeed * sp;
  b.touchCd = Math.max(C.touchMin, Math.min(C.touchMax, 0.62 - sp * 0.045));
}
// шаг ведения: мяч мягко следует за точкой контроля (демпфированная «пружина» с ограничением), без телепортаций.
// obstacles — шары тел соперника: мяч в них упирается, а не проходит насквозь. Возвращает 'lost', если владение потеряно.
const cpTmp = vec();
export function controlStep(b, P, h, obstacles) {
  const C = CFG.control, R = CFG.R;
  b.touchCd -= h;
  b.push *= Math.exp(-h * C.pushDecay * (P.stopping ? 3 : 1)); // остановка: касание сразу гасится
  b.trapT += h;
  const trapK = b.trapDur > 0 ? Math.min(1, b.trapT / b.trapDur) : 1, ease = trapK * trapK * (3 - 2 * trapK);
  const cp = controlPoint(P, b, cpTmp);
  let ex = cp.x - b.p.x, ez = cp.z - b.p.z;
  // желаемая скорость = скорость игрока + ограниченная поправка к точке контроля
  let cx = ex * C.gain * (P.stopping ? C.stopTrap : 1), cz = ez * C.gain * (P.stopping ? C.stopTrap : 1);
  const cl = Math.hypot(cx, cz); if (cl > C.maxCorr) { cx *= C.maxCorr / cl; cz *= C.maxCorr / cl; }
  const dvx = P.v.x + cx, dvz = P.v.z + cz;
  // приём: сначала мяч живёт своей скоростью, контроль включается плавно (сильный прилёт гасится дольше)
  const k = 1 - Math.exp(-h * C.resp * (0.15 + 0.85 * ease));
  b.v.x += (dvx - b.v.x) * k; b.v.z += (dvz - b.v.z) * k; b.v.y = 0;
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
  if (Math.hypot(cp.x - b.p.x, cp.z - b.p.z) > C.loseDist) return release(b, null, 0, 0.25), 'lost';
  return null;
}
// отпустить мяч (удар, потеря); lock — сколько секунд бывший владелец не может его снова взять
export function release(b, who, t, lock = CFG.control.regrab, mustClear = true) {
  b.lockOwner = who ?? b.owner; b.lockUntil = t + lock; b.mustClear = mustClear;
  b.state = 'free'; b.owner = null; b.push = 0; b.stopped = false; b.trapT = 1;
}

// ---------- удар ----------
// Направление и высота считаются отдельно. Сила (0…1) линейно задаёт скорость. Никакого скрытого наведения и случайного разброса:
// одинаковые действия — одинаковый результат.
// aim: { x, y } — джойстик в момент удара. Наклонён — удар в сторону ворот по углу джойстика (вверх — в центр,
// на stickAngle вбок — в штангу); не наклонён — туда, куда смотрит корпус.
export function shotVelocity(b, P, aim, pw, fin, goal) {
  const S = CFG.shot, R = CFG.R;
  let dx, dz;
  const L = Math.hypot(aim.x, aim.y);
  if (L > 0.25) {
    const a = Math.atan2(aim.x, Math.max(aim.y, -0.2)) / S.stickAngle, tx = Math.max(-1.7, Math.min(1.7, a)) * goal.w;
    dx = tx - b.p.x; dz = -b.p.z; // к точке на линии ворот
    if (dz > -0.5) dz = -0.5;
  } else { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
  const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
  // скорость: сила + ограниченная добавка от бега вдоль удара
  const along = Math.max(0, P.v.x * dx + P.v.z * dz);
  let speed = S.vMin + (S.vMax - S.vMin) * pw + Math.min(S.runBonusMax, along * S.runBonus);
  if (fin) speed *= S.finesseSpeed;
  // высота: целимся на height у линии ворот (сопротивление воздуха не учитываем — на деле мяч чуть ниже);
  // перебор силы — выше
  let hT = (fin ? S.finesseHeight : S.height) + Math.max(0, pw - S.overPower) * S.overLift;
  const dist = dz < -0.05 ? Math.min(40, b.p.z / -dz) : 20, tt = dist / speed;
  let vy = (hT - R + 0.5 * CFG.g * tt * tt) / tt; vy = Math.max(0.4, Math.min(speed * 0.6, vy));
  const vh = Math.sqrt(Math.max(1, speed * speed - vy * vy));
  const v = vec(dx * vh, vy, dz * vh);
  // вращение: сильный удар — верхнее (ныряет); подкрутка — вокруг вертикали, уводит мяч к центру ворот (плавно, физикой)
  const top = S.topspin * pw * (fin ? 0.3 : 1);
  const w = vec(dz * top, 0, -dx * top);
  if (fin) { const side = Math.abs(b.p.x + dx * dist) > 0.3 ? Math.sign(b.p.x + dx * dist) : 1; w.y = side * S.finesseSpin; }
  return { v, w, speed };
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

// ---------- фиксированный шаг ----------
// накопитель времени: вызывай add(dt) раз в кадр, step() — сколько вернёт steps; alpha — для плавной картинки между шагами
export function clockFixed() {
  return { acc: 0, add(dt) { this.acc = Math.min(this.acc + Math.max(0, dt), CFG.maxFrame); let n = 0; while (this.acc >= CFG.dt) { this.acc -= CFG.dt; n++; } return n; }, get alpha() { return this.acc / CFG.dt; } };
}
