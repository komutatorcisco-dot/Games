// Движение игрока для выхода из пака: шаги, остановка, празднование, ожидание — всё скелетной анимацией.
//
// Почему так, а не клипом из FBX: перенесённый клип — работа с мячом на месте (корень не движется вперёд),
// 30 ключей в секунду с поворотом кистей/стоп до 25° за ключ — на 60 к/с это видно как рывки.
//
// Как устроена ходьба (без скольжения стоп):
//  1. Заранее раскладываем следы на полу: короткий первый шаг, полные шаги, укороченный последний и приставной.
//  2. Опорная стопа стоит на своём следе неподвижно; переносимая летит дугой от старого следа к новому.
//  3. Таз проходит через середину между стопами в моменты постановки — гладкая монотонная кривая (Фриц—Карлсон),
//     поэтому скорость меняется плавно, без рывков, и движение вперёд точно соответствует шагам.
//  4. Ноги ставятся решением обратной кинематики (бедро—голень—лодыжка), колено смотрит вперёд.
//  5. Фазы (ходьба → остановка → празднование → ожидание) — веса, плавно перетекающие друг в друга.
//
// Все функции зависят только от времени t: перемотка, пропуск и повтор дают ровно ту же позу.
import * as THREE from 'three';

const deg = THREE.MathUtils.degToRad;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const ramp = (t, a, b) => smoother((t - a) / (b - a));
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const NAMES = ['root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'clavicle.L', 'upper_arm.L', 'forearm.L', 'hand.L', 'clavicle.R', 'upper_arm.R', 'forearm.R', 'hand.R', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R'];
const CHILD = { 'upper_arm.L': 'forearm.L', 'forearm.L': 'hand.L', 'upper_arm.R': 'forearm.R', 'forearm.R': 'hand.R', 'thigh.L': 'shin.L', 'shin.L': 'foot.L', 'thigh.R': 'shin.R', 'shin.R': 'foot.R' };

// ---------- скелет ----------
export function createRig(model) {
  // поза привязки из скина: узлы GLB могут хранить кадр анимации, а не исходную позу
  model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); });
  const all = {};
  model.traverse((o) => { if (o.isBone) { all[o.name] = o; all[o.name.replace(/\./g, '')] = o; } });
  const B = {}, missing = [];
  NAMES.forEach((n) => { const b = all[n] || all[n.replace(/\./g, '')]; if (b) B[n] = b; else missing.push(n); });
  if (missing.length) throw new Error('В модели нет костей: ' + missing.join(', '));
  model.updateMatrixWorld(true);
  const rest = {};
  NAMES.forEach((n) => { const b = B[n]; rest[n] = { q: b.quaternion.clone(), p: b.position.clone(), wq: b.getWorldQuaternion(new THREE.Quaternion()), wp: b.getWorldPosition(new THREE.Vector3()) }; });
  const localDir = {};
  Object.entries(CHILD).forEach(([n, c]) => { localDir[n] = B[c].position.clone().normalize(); });
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const sideL = Math.sign(rest['thigh.L'].wp.x - rest['thigh.R'].wp.x) || 1;
  const len = (a, b) => rest[a].wp.distanceTo(rest[b].wp);
  return {
    model, B, rest, localDir, height, sideL, groundY: box.min.y,
    thighLen: len('thigh.L', 'shin.L'), shinLen: len('shin.L', 'foot.L'),
    ankleY: (rest['foot.L'].wp.y + rest['foot.R'].wp.y) / 2,
    footX: { L: rest['foot.L'].wp.x, R: rest['foot.R'].wp.x },
    pelvisY: rest.pelvis.wp.y,
    restRootInv: rest.root.wq.clone().invert(),
  };
}

// ---------- план шагов ----------
// startZ → endZ (к камере, +Z). Возвращает следы и кривую таза; время в секундах от t0.
export function planWalk(rig, { t0 = 0, startZ = -3.2, endZ = 0, cadence = 0.56 } = {}) {
  const H = rig.height / 1.9, D = endZ - startZ;
  // длины шагов в долях полного: разгон, полные, торможение
  const shape = [0.42, 0.78];
  const tail = [0.72];
  let n = Math.max(1, Math.round((D / (0.58 * H) - shape.reduce((a, b) => a + b) - tail.reduce((a, b) => a + b))));
  const fr = [...shape, ...Array(n).fill(1), ...tail];
  const L = D / fr.reduce((a, b) => a + b); // точная длина полного шага, чтобы прийти ровно в endZ
  const steps = []; // { side, t, from, to, lift }
  const pos = { R: startZ, L: startZ };
  let t = t0, side = 'R';
  fr.forEach((f, i) => {
    const dur = cadence * (0.72 + 0.28 * f); // короткие шаги чуть быстрее
    const other = side === 'R' ? 'L' : 'R';
    const target = pos[other] + f * L; // нога выносится на f·L вперёд от опорной
    steps.push({ side, from: pos[side], to: target, lift: t + (i === 0 ? 0.04 : cadence * 0.16), t: t + dur, len: target - pos[side] });
    pos[side] = target; t += dur; side = other;
  });
  // приставной шаг: задняя нога встаёт рядом с передней
  const lastSide = side, other = lastSide === 'R' ? 'L' : 'R';
  const dur = cadence * 0.85;
  steps.push({ side: lastSide, from: pos[lastSide], to: pos[other], lift: t + cadence * 0.12, t: t + dur, len: pos[other] - pos[lastSide], close: true });
  pos[lastSide] = pos[other]; t += dur;
  const tEnd = t;
  // опорные точки таза: старт, середина между стопами в каждой постановке, финал над стопами
  const keys = [[t0 - 0.0001, startZ]];
  const feet = { R: startZ, L: startZ };
  steps.forEach((s) => { feet[s.side] = s.to; keys.push([s.t, (feet.R + feet.L) / 2 + (s.close ? 0 : 0.025 * H)]); });
  keys.push([tEnd + 0.45, pos.R]);
  const pelvisZ = monotone(keys);
  const plan = { t0, tEnd, steps, pelvisZ, L, cadence, startZ, endZ: pos.R, H };
  plan.pelvisY = pelvisCurve(rig, plan);
  return plan;
}

// Высота таза заранее на сетке 1/120 с: желаемая высота, ограниченная длиной ног, затем «эрозия»
// (минимум в окне ±0,08 с) и гауссово сглаживание. Так провал таза в двойной опоре получается
// плавной волной нужной глубины, а не резким нырком в последний момент.
function pelvisCurve(rig, plan) {
  const dt = 1 / 120, a = plan.t0 - 0.5, b = plan.tEnd + 1.2, n = Math.ceil((b - a) / dt) + 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = pelvisRaw(rig, plan, a + i * dt).py;
  const w = Math.round(0.08 / dt), ero = new Float32Array(n), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) m = Math.min(m, raw[j]); ero[i] = m; }
  const sg = 0.045 / dt, r = Math.ceil(sg * 3), ker = [];
  for (let j = -r; j <= r; j++) ker.push(Math.exp(-(j * j) / (2 * sg * sg)));
  for (let i = 0; i < n; i++) { let s = 0, ws = 0; ker.forEach((k, j) => { const idx = Math.min(n - 1, Math.max(0, i + j - r)); s += ero[idx] * k; ws += k; }); out[i] = s / ws; }
  return (t) => { if (t <= a) return out[0]; if (t >= b) return null; const x = (t - a) / dt, i = Math.floor(x), f = x - i; return out[i] + (out[Math.min(n - 1, i + 1)] - out[i]) * f; };
}

// монотонный кубический сплайн (Фриц—Карлсон): без перелётов, скорость непрерывна, на концах — ноль
function monotone(pts) {
  const n = pts.length, x = pts.map((p) => p[0]), y = pts.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], u = (t - x[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

// состояние одной стопы в момент t: позиция по Z, высота подъёма, наклон стопы
function footState(plan, side, t) {
  const H = plan.H;
  // у каждого шага свой отрыв пятки (offP) и угол постановки на пятку (landP); у приставного — мягче.
  // Перенос идёт ровно от offP к landP, опора — от landP к нулю и к offP следующего шага: угол стопы непрерывен.
  const offP = (s) => (s.close ? deg(-12) : deg(-22)), landP = (s) => (s.close ? deg(6) : deg(14));
  let z = plan.startZ, lift = 0, pitch = 0, swinging = false, lastLand = -1e9, lastStep = null, next = null;
  for (const s of plan.steps) {
    if (s.side !== side) continue;
    if (t >= s.t) { z = s.to; lastLand = s.t; lastStep = s; continue; }
    if (t >= s.lift) {
      // перенос: дуга, носок → пятка
      const u = (t - s.lift) / (s.t - s.lift), e = smoother(u);
      z = s.from + (s.to - s.from) * e;
      const clear = (s.close ? 0.05 : 0.085) * H * Math.min(1, Math.abs(s.len) / (0.5 * plan.L) + 0.3);
      lift = clear * Math.pow(Math.sin(Math.PI * u), 1.15);
      pitch = offP(s) + (landP(s) - offP(s)) * smooth(u);
      swinging = true;
      return { z, lift, pitch, swinging };
    }
    next = s; break;
  }
  // опора: пятка опускается после постановки, перед отрывом пятка поднимается
  const land = lastStep ? landP(lastStep) * (1 - smooth((t - lastLand) / 0.13)) : 0;
  const off = next ? offP(next) * smooth((t - (next.lift - 0.17)) / 0.17) : 0;
  pitch = land + off;
  return { z, lift, pitch, swinging };
}

// ---------- работа с костями ----------
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function parentWorldQ(b) { return b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(); }
function aim(rig, name, dir) {
  const b = rig.B[name]; b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b), base = Qp.clone().multiply(rig.rest[name].q);
  const cur = _v.copy(rig.localDir[name]).applyQuaternion(base).normalize();
  const world = _q.setFromUnitVectors(cur, dir.clone().normalize()).multiply(base);
  b.quaternion.copy(Qp.invert().multiply(world)); b.updateMatrixWorld(true);
}
function turn(rig, name, axis, angle) {
  if (!angle) return;
  const b = rig.B[name]; b.parent && b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b);
  const world = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(Qp.clone().multiply(b.quaternion));
  b.quaternion.copy(Qp.invert().multiply(world)); b.updateMatrixWorld(true);
}
function footWorld(rig, name, yaw, pitch) {
  const b = rig.B[name]; b.parent.updateMatrixWorld(true);
  const Qp = parentWorldQ(b);
  const rootQ = rig.B.root.getWorldQuaternion(new THREE.Quaternion());
  const latAxis = X.clone().applyAxisAngle(Y, yaw);
  const world = new THREE.Quaternion().setFromAxisAngle(latAxis, -pitch).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw)).multiply(rootQ.multiply(rig.restRootInv.clone().multiply(rig.rest[name].wq)));
  b.quaternion.copy(Qp.invert().multiply(world)); b.updateMatrixWorld(true);
}
// две кости ноги: колено по закону косинусов, плоскость сгиба — вперёд
function legIK(rig, s, ankle, forward) {
  const hip = rig.B['thigh.' + s].getWorldPosition(new THREE.Vector3());
  const a = rig.thighLen, b = rig.shinLen;
  const v = ankle.clone().sub(hip); let d = v.length();
  d = Math.min(d, (a + b) * 0.9995); const n = v.normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  const pole = forward.clone().sub(n.clone().multiplyScalar(forward.dot(n))).normalize();
  const knee = hip.clone().add(n.clone().multiplyScalar(x)).add(pole.multiplyScalar(h));
  aim(rig, 'thigh.' + s, knee.clone().sub(hip));
  aim(rig, 'shin.' + s, hip.clone().add(n.clone().multiplyScalar(d)).sub(knee));
  return { reachRatio: v.length ? d / (a + b) : 0 };
}
const armDir = (rig, side, fwd, out, up = 0) => new THREE.Vector3(Math.sin(out) * side * rig.sideL, -Math.cos(out) * Math.cos(fwd) + up, Math.sin(fwd) * Math.cos(out)).normalize();

// ---------- поза в момент t ----------
// opts: { plan, celebrate: время начала празднования }
export function pose(rig, plan, t) {
  const B = rig.B, H = plan.H;
  NAMES.forEach((n) => { B[n].quaternion.copy(rig.rest[n].q); if (n !== 'root') B[n].position.copy(rig.rest[n].p); });

  const tc = plan.tEnd + 0.2; // празднование начинается сразу после приставного шага
  const walkW = ramp(t, plan.t0, plan.t0 + plan.cadence * 1.1) * (1 - ramp(t, plan.tEnd - plan.cadence * 1.3, plan.tEnd + 0.1));
  const celIn = ramp(t, tc, tc + 0.85), celOut = ramp(t, tc + 2.0, tc + 3.1);
  const celArms = celIn * (1 - celOut); // руки разведены, потом спокойно опускаются
  const pride = celIn * (1 - 0.55 * celOut); // расправленные плечи остаются немного
  const idle = ramp(t, tc + 1.8, tc + 3.4);
  const ti = t - (tc + 1.8);

  // текущий шаг: фаза внутри шага (0 — постановка предыдущей стопы, 1 — следующей) и кто опора
  let p = 0, swingSide = 'R', k = 0, prevT = plan.t0;
  for (; k < plan.steps.length; k++) { const s = plan.steps[k]; if (t < s.t) { p = clamp01((t - prevT) / (s.t - prevT)); swingSide = s.side; break; } prevT = s.t; }
  const stance = swingSide === 'R' ? 'L' : 'R';
  const sgn = (s) => (s === 'L' ? rig.sideL : -rig.sideL); // знак X для стороны
  const phaseCum = k + p; // непрерывная фаза: целое — постановка

  // ----- таз: вперёд по кривой, вниз-вверх по шагу, вбок к опорной ноге -----
  const z = plan.pelvisZ(t);
  const P = pelvisRaw(rig, plan, t), sway = P.sway, fs = P.fs, breath = P.breath;
  const pyS = plan.pelvisY && plan.pelvisY(t);
  // после сглаживания ещё раз мягко ограничиваем длиной ног (на случай, если сглаживание приподняло таз)
  const pyT = pyS == null ? P.py : P.lims.reduce((y, lim) => y - softPlus(y - lim, 0.006), pyS);
  const back = ramp(t, plan.tEnd + 0.5, plan.tEnd + 1.1); // после остановки сетка не нужна: плавно возвращаемся к прямому расчёту
  const py = pyT + (P.py - pyT) * back;
  B.root.position.set(rig.rest.root.p.x + sway, rig.rest.root.p.y + (py - rig.pelvisY), rig.rest.root.p.z + z);
  B.root.updateMatrixWorld(true);

  // повороты таза и корпуса: таз крутится за выносимой ногой, грудь — в противоход
  // поворот вокруг +Y на +θ уводит сторону +X назад, поэтому выносимое бедро вперёд — знак минус; таз опускается со стороны выносимой ноги
  const yawP = -sgn(swingSide) * deg(5.5) * Math.sin(Math.PI * p) * walkW;
  const rollP = -sgn(swingSide) * deg(2.2) * Math.sin(Math.PI * p) * walkW + deg(1.6) * Math.sin(ti * 2 * Math.PI * 0.11) * idle;
  turn(rig, 'pelvis', Y, yawP);
  turn(rig, 'pelvis', Z, rollP);
  turn(rig, 'spine', X, deg(3.5) * walkW - deg(4) * pride);
  turn(rig, 'spine', Z, -rollP * 0.6);
  turn(rig, 'chest', Y, -yawP * 1.5);
  turn(rig, 'chest', X, -deg(7) * pride - deg(1.4) * breath);
  // голова смотрит вперёд (гасит покачивания), в празднике — подбородок чуть вверх, в ожидании — оглядывается
  turn(rig, 'neck', Y, -yawP * 0.4);
  turn(rig, 'head', X, deg(2) * walkW - deg(6) * celArms - deg(2) * idle);
  turn(rig, 'head', Y, Math.sin(ti * 2 * Math.PI * 0.07) * deg(12) * idle);

  // ключицы: расправить плечи (назад и чуть вниз)
  ['L', 'R'].forEach((s) => { const sd = s === 'L' ? 1 : -1; turn(rig, 'clavicle.' + s, Y, sd * rig.sideL * deg(9) * pride); });

  // ----- ноги: обратная кинематика к следам -----
  const fwd = Z.clone();
  ['L', 'R'].forEach((s) => {
    const f = fs[s];
    // точка опоры лодыжки: при подъёме пятки лодыжка поднимается вокруг носка, при постановке на пятку — вокруг пятки
    const pivot = f.pitch < 0 ? 0.13 * H * Math.sin(-f.pitch) : 0.05 * H * Math.sin(f.pitch);
    const ankle = new THREE.Vector3(rig.footX[s], rig.ankleY + f.lift + pivot, f.z + (f.pitch < 0 ? -0.13 * H * (1 - Math.cos(f.pitch)) : 0));
    legIK(rig, s, ankle, fwd.clone().add(new THREE.Vector3(sgn(s) * 0.08, 0, 0)).normalize());
    footWorld(rig, 'foot.' + s, 0, f.pitch);
  });

  // ----- руки -----
  const swingA = deg(19) * walkW;
  ['L', 'R'].forEach((s) => {
    const sd = s === 'L' ? 1 : -1;
    const arm = (s === 'L' ? 1 : -1) * -Math.cos(Math.PI * phaseCum) * swingA; // противоход ногам: правая нога впереди — левая рука впереди
    const walkUp = armDir(rig, sd, arm, deg(11));
    const celUp = armDir(rig, sd, deg(-4), deg(40) + deg(1.5) * breath, 0.04); // «Why always me?»: в стороны и чуть назад
    const idleUp = armDir(rig, sd, deg(3) + deg(1) * breath, deg(10) + deg(1.5) * Math.sin(ti * 1.2 + sd));
    const up = walkUp.clone().multiplyScalar(1 - Math.max(celArms, idle)).add(celUp.clone().multiplyScalar(celArms)).add(idleUp.clone().multiplyScalar(idle * (1 - celArms))).normalize();
    aim(rig, 'upper_arm.' + s, up);
    // локоть: в ходьбе согнут вперёд сильнее при выносе руки, в празднике — раскрыт ладонями к зрителю
    const bend = deg(16) + Math.max(0, arm) * 0.7;
    const walkFore = up.clone().applyAxisAngle(X, -bend);
    const celFore = armDir(rig, sd, deg(18), deg(52), 0.12);
    const idleFore = up.clone().applyAxisAngle(X, -deg(14));
    const fore = walkFore.multiplyScalar(1 - Math.max(celArms, idle)).add(celFore.multiplyScalar(celArms)).add(idleFore.multiplyScalar(idle * (1 - celArms))).normalize();
    aim(rig, 'forearm.' + s, fore);
  });
  rig.model.updateMatrixWorld(true);
  return { walkW, celArms, idle, z, tc };
}
// желаемая высота таза в момент t (без сглаживания) + ограничения по длине ног
function pelvisRaw(rig, plan, t) {
  const H = plan.H, tc = plan.tEnd + 0.2;
  const walkW = ramp(t, plan.t0, plan.t0 + plan.cadence * 1.1) * (1 - ramp(t, plan.tEnd - plan.cadence * 1.3, plan.tEnd + 0.1));
  const celIn = ramp(t, tc, tc + 0.85), idle = ramp(t, tc + 1.8, tc + 3.4), ti = t - (tc + 1.8);
  let p = 0, swingSide = 'R', prevT = plan.t0;
  for (let k = 0; k < plan.steps.length; k++) { const s = plan.steps[k]; if (t < s.t) { p = clamp01((t - prevT) / (s.t - prevT)); swingSide = s.side; break; } prevT = s.t; }
  const stance = swingSide === 'R' ? 'L' : 'R';
  const sgn = (s) => (s === 'L' ? rig.sideL : -rig.sideL);
  const z = plan.pelvisZ(t);
  const bob = -0.016 * H * Math.cos(2 * Math.PI * p) * walkW;
  const sway = sgn(stance) * 0.022 * H * Math.sin(Math.PI * p) * walkW
    + Math.sin(ti * 2 * Math.PI * 0.11) * 0.022 * H * idle; // в ожидании — медленный перенос веса
  const breath = Math.sin(Math.max(0, t - tc) * 2 * Math.PI * 0.24) * (0.4 + 0.6 * idle);
  let py = rig.pelvisY - 0.01 * H - 0.024 * H * walkW + bob + 0.008 * H * celIn * (1 - idle) - 0.01 * H * idle;
  // стопы в этот момент
  const fs = { L: footState(plan, 'L', t), R: footState(plan, 'R', t) };
  const lims = [];
  // таз не выше, чем позволяют ноги (иначе колено «выстреливает» в прямую)
  const hipW = Math.abs(rig.rest['thigh.L'].wp.x - rig.rest.pelvis.wp.x);
  const hipDrop = rig.pelvisY - rig.rest['thigh.L'].wp.y;
  ['L', 'R'].forEach((s) => {
    // лодыжка выше на подъёме пятки (опора на носок) и при постановке на пятку — нога «длиннее», таз проваливается меньше
    const pv = fs[s].pitch < 0 ? 0.13 * H * Math.sin(-fs[s].pitch) : 0.05 * H * Math.sin(fs[s].pitch);
    const ay = rig.ankleY + fs[s].lift + pv, dz = fs[s].z - z, dx = rig.footX[s] - (sway + sgn(s) * hipW);
    const maxV = Math.sqrt(Math.max(0.01, Math.pow((rig.thighLen + rig.shinLen) * 0.996, 2) - dz * dz - dx * dx));
    const lim = ay + maxV + hipDrop;
    lims.push(lim);
    py = py - softPlus(py - lim, 0.012);
  });
  return { py, sway, fs, breath, lims };
}
function softPlus(x, k) { return k * Math.log1p(Math.exp(x / k)); } // мягкий max(0, x): без излома
