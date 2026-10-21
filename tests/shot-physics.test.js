// node --test tests/shot-physics.test.js — физика мяча и ведение в «Ударе» (prototypes/shot/ballphys.js)
const test = require('node:test');
const assert = require('node:assert/strict');

let M;
test.before(async () => { M = await import('../prototypes/shot/ballphys.js'); });

const GOAL = { w: 3.66, h: 2.44, d: 1.5, top: 1.5 };
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// игрок с мячом у ноги; program(t) → { x, y, sprint } — джойстик во времени
function dribble(program, T, { start = { x: 0, z: 30 }, yaw = Math.PI, frame = 1 / 60 } = {}) {
  const { CFG } = M, P = M.newPlayer(start, yaw), b = M.newBall(M.controlPoint(P, null));
  M.capture(b, P, 'me'); b.trapT = 1; b.trapDur = 0;
  const clock = M.clockFixed(), stat = { maxErr: 0, minBody: 9, maxJump: 0, lost: 0, maxBallSpeed: 0, samples: [] };
  let t = 0, prev = { ...b.p };
  for (let f = 0; t < T; f++) {
    const steps = clock.add(frame);
    for (let i = 0; i < steps; i++) {
      const inp = program(t); P.sprint = !!inp.sprint;
      M.playerStep(P, inp, CFG.dt, true);
      if (b.state === 'owned') {
        if (b.touchCd <= 0 && Math.hypot(P.v.x, P.v.z) > 0.6) M.touch(b, P);
        if (M.controlStep(b, P, CFG.dt) === 'lost') stat.lost++;
      }
      const jump = hyp(b.p, prev) / CFG.dt; stat.maxJump = Math.max(stat.maxJump, jump); prev = { ...b.p };
      t += CFG.dt;
      if (t > 0.6) { // после разгона: расстояние от точки контроля и от центра игрока
        const cp = M.controlPoint(P, null);
        stat.maxErr = Math.max(stat.maxErr, hyp(b.p, cp));
        stat.minBody = Math.min(stat.minBody, hyp(b.p, P.p));
      }
    }
  }
  stat.P = P; stat.b = b; return stat;
}

test('1. стоит — мяч спокойно у ноги, без дрожания', () => {
  const s = dribble(() => ({ x: 0, y: 0 }), 3);
  assert.equal(s.lost, 0);
  assert.ok(s.maxErr < 0.05, `мяч уходит от ноги на ${s.maxErr}`);
  assert.equal(Math.hypot(s.b.v.x, s.b.v.z), 0, 'в покое скорость ровно 0');
});
test('2–3. медленный бег и длинный рывок — мяч под контролем, игрок не убегает от мяча', () => {
  const slow = dribble(() => ({ x: 0, y: 0.5 }), 4);
  const fast = dribble(() => ({ x: 0, y: 1, sprint: true }), 4, { start: { x: 0, z: 40 } });
  for (const s of [slow, fast]) { assert.equal(s.lost, 0); assert.ok(s.minBody >= M.CFG.control.bodyR - 0.005, 'не сквозь ноги'); }
  assert.ok(slow.maxErr < 0.35, `на медленном беге мяч дальше ${slow.maxErr}`);
  // ведение касаниями (запись EA «The Art of Dribbling», 34,6–35,4 с): на рывке толчок через шаг, мяч уходит до ~1 м
  assert.ok(fast.maxErr < 1.3, `на рывке мяч дальше ${fast.maxErr}`);
  assert.ok(fast.P.p.z < 40 - 20, 'игрок действительно бежал');
});
test('4. резкая остановка — мяч гасится и остаётся у ноги', () => {
  const s = dribble((t) => (t < 2 ? { x: 0, y: 1, sprint: true } : { x: 0, y: 0 }), 4, { start: { x: 0, z: 40 } });
  assert.equal(s.lost, 0);
  const cp = M.controlPoint(s.P, null);
  assert.ok(hyp(s.b.p, cp) < 0.06, `после остановки мяч в ${hyp(s.b.p, cp)} м от ноги`);
  assert.ok(Math.hypot(s.b.v.x, s.b.v.z) < 0.05);
});
test('5. повороты на 90° и 180° — без телепортаций и сквозь ноги', () => {
  const t90 = dribble((t) => (t < 1.5 ? { x: 0, y: 1 } : { x: 1, y: 0 }), 3);
  const t180 = dribble((t) => (t < 1.5 ? { x: 0, y: 1 } : { x: 0, y: -1 }), 3.5, { start: { x: 0, z: 25 } });
  for (const s of [t90, t180]) {
    assert.equal(s.lost, 0); assert.ok(s.minBody >= M.CFG.control.bodyR - 0.005, `мяч прошёл у центра игрока: ${s.minBody}`);
    assert.ok(s.maxJump < 13, `скачок скорости мяча ${s.maxJump} м/с`);
  }
  assert.ok(t180.maxErr < 1.3, `при развороте мяч описал большой круг: ${t180.maxErr}`);
});
test('6. назад и вбок — контроль сохраняется', () => {
  const s = dribble((t) => (t < 1.2 ? { x: -0.7, y: -0.7 } : { x: 1, y: 0 }), 3, { start: { x: 0, z: 20 } });
  assert.equal(s.lost, 0); assert.ok(s.maxErr < 1.3);
});

function shoot(pw, fin = false, aim = { x: 0, y: 1 }, run = 0) {
  const P = M.newPlayer({ x: 0, z: 20 }, Math.PI); P.v.z = -run;
  const b = M.newBall(M.controlPoint(P, null)); M.capture(b, P, 'me');
  const sv = M.shotVelocity(b, P, aim, pw, fin, GOAL);
  const ok = M.applyShot(b, sv, M.controlPoint(P, null), 'me', 0);
  return { P, b, sv, ok };
}
test('7–8. сила удара предсказуема, импульс ровно один раз', () => {
  const sp = [0, 0.5, 1].map((p) => shoot(p).sv.speed);
  assert.ok(sp[0] < sp[1] && sp[1] < sp[2]);
  assert.equal(shoot(0.5).sv.speed, shoot(0.5).sv.speed, 'одинаковые действия — одинаковый результат');
  const runShot = shoot(0.5, false, { x: 0, y: 1 }, 6.6).sv.speed;
  assert.ok(runShot - sp[1] <= M.CFG.shot.runBonusMax + 1e-9, 'рывок не даёт абсурдной силы');
  const s = shoot(0.7);
  assert.ok(s.ok); const v1 = { ...s.b.v };
  assert.equal(M.applyShot(s.b, s.sv, M.controlPoint(s.P, null), 'me', 0), false, 'второй импульс не применяется');
  assert.deepEqual(s.b.v, v1);
  // сильный удар не обязан лететь высоко: высота у ворот почти одинакова
  const hy = [0.3, 0.8].map((p) => { const r = shoot(p); return M.predict(r.b.p, r.b.v, r.b.w).p.y; });
  assert.ok(Math.abs(hy[0] - hy[1]) < 0.6, `высота зависит от силы: ${hy}`);
});
test('9. после удара мяч не притягивается обратно к тому же игроку', () => {
  const s = shoot(0.1);
  assert.equal(M.canCapture(s.b, s.P, 'me', 0.01), false);
  const far = shoot(0.1); far.b.v.x = far.b.v.y = far.b.v.z = 0; // даже остановленный рядом — пока не отошёл
  assert.equal(M.canCapture(far.b, far.P, 'me', 5), false);
});
test('10–11. приём медленного и быстрого мяча различается; высокий мяч ногой не взять', () => {
  const P = M.newPlayer({ x: 0, z: 10 }, Math.PI), cp = M.controlPoint(P, null);
  const slow = M.newBall(cp); slow.v.z = 3; assert.ok(M.canCapture(slow, P, 'me', 0));
  const d1 = M.capture(slow, P, 'me'), dur1 = slow.trapDur;
  const mid = M.newBall(cp); mid.v.z = 8; M.capture(mid, P, 'me'); assert.ok(mid.trapDur > dur1, 'сильный прилёт гасится дольше');
  const fast = M.newBall(cp); fast.v.z = 20; assert.equal(M.canCapture(fast, P, 'me', 0), false, 'быстрый мяч не идеальный приём');
  const high = M.newBall({ x: cp.x, y: 1.2, z: cp.z }); assert.equal(M.canCapture(high, P, 'me', 0), false);
  assert.ok(d1 < 9);
});
test('12. соперник на пути — мяч не проходит сквозь него, владение теряется', () => {
  const keeper = [{ x: 0, y: 0.25, z: 24, r: 0.35 }];
  const { CFG } = M, P = M.newPlayer({ x: 0, z: 30 }, Math.PI), b = M.newBall(M.controlPoint(P, null)); M.capture(b, P, 'me'); b.trapDur = 0;
  let lost = false, minD = 9;
  for (let t = 0; t < 3 && !lost; t += CFG.dt) {
    M.playerStep(P, { x: 0, y: 1 }, CFG.dt, true); if (P.p.z < 24.7) P.p.z = 24.7; // игрок упёрся в соперника
    lost = M.controlStep(b, P, CFG.dt, keeper) === 'lost';
    minD = Math.min(minD, Math.hypot(b.p.x - 0, b.p.y - 0.25, b.p.z - 24) - 0.35 - CFG.R);
  }
  assert.ok(minD > -0.005, `мяч прошёл внутрь соперника на ${-minD} м`);
  assert.ok(!lost || minD > -0.005);
  // соперник проходит сквозь точку контроля (подкат вбок) — мяч уходит вместе с ним, владение теряется
  const P2 = M.newPlayer({ x: 0, z: 30 }, Math.PI), b2 = M.newBall(M.controlPoint(P2, null)); M.capture(b2, P2, 'me'); b2.trapDur = 0;
  const foe = { x: -1.5, y: 0.2, z: b2.p.z, r: 0.3, vx: 5, vy: 0, vz: 0 }; let lost2 = false;
  for (let t = 0; t < 1.5 && !lost2; t += CFG.dt) { foe.x += foe.vx * CFG.dt; M.playerStep(P2, { x: 0, y: 0 }, CFG.dt, true); lost2 = M.controlStep(b2, P2, CFG.dt, [foe]) === 'lost'; }
  assert.ok(lost2, 'отобрали — владение потеряно, а не протащено сквозь соперника');
  assert.equal(b2.state, 'free');
});
test('13. штанга, перекладина, сетка — корректно', () => {
  const { CFG } = M, world = { goal: GOAL };
  const run = (p, v, T = 2) => { const b = M.newBall(p); Object.assign(b.v, v); b.p.y = p.y; const ev = []; for (let t = 0; t < T; t += CFG.dt) M.stepFree(b, CFG.dt, world, ev); return { b, ev }; };
  const post = run({ x: 3.66, y: 1, z: 3 }, { x: 0, y: 2, z: -25 });
  assert.ok(post.ev.some((e) => e.type === 'post')); assert.ok(!post.ev.some((e) => e.type === 'goal'));
  const glance = run({ x: 3.66 - 0.15, y: 1, z: 3 }, { x: 0, y: 2, z: -25 }); // касательно — рикошет внутрь
  assert.ok(glance.ev.some((e) => e.type === 'post'));
  const bar = run({ x: 0, y: 2.44, z: 3 }, { x: 0, y: 1, z: -22 });
  assert.ok(bar.ev.some((e) => e.type === 'bar'));
  const net = run({ x: 0, y: 1.2, z: 3 }, { x: 0, y: 2, z: -25 }, 3);
  assert.equal(net.ev.filter((e) => e.type === 'goal').length, 1, 'ровно один гол');
  assert.ok(net.ev.some((e) => e.type === 'net'));
  assert.ok(net.b.p.z < 0 && net.b.p.z > -GOAL.d - 0.6, `сетка не удержала мяч: z=${net.b.p.z}`);
  assert.ok(Math.hypot(net.b.v.x, net.b.v.y, net.b.v.z) < 1, 'сетка погасила мяч');
});
test('15. мимо створа, в боковую сетку и сверху на ворота — не гол', () => {
  const { CFG } = M, world = { goal: GOAL };
  const run = (p, v) => { const b = M.newBall(p); Object.assign(b.v, v); b.p.y = p.y; const ev = []; for (let t = 0; t < 3; t += CFG.dt) M.stepFree(b, CFG.dt, world, ev); return ev; };
  assert.ok(!run({ x: 5, y: 1, z: 3 }, { x: 0, y: 1, z: -20 }).some((e) => e.type === 'goal'), 'мимо');
  assert.ok(!run({ x: 6, y: 0.5, z: -0.8 }, { x: -12, y: 0, z: 0 }).some((e) => e.type === 'goal'), 'в боковую сетку снаружи');
  assert.ok(!run({ x: 0, y: 5, z: -0.7 }, { x: 0, y: -2, z: 0 }).some((e) => e.type === 'goal'), 'сверху на крышу');
  assert.ok(!run({ x: 0, y: 3, z: 3 }, { x: 0, y: 1.5, z: -20 }).some((e) => e.type === 'goal'), 'над перекладиной');
});
test('отскоки ниже и ниже, потом качение и полная остановка', () => {
  const { CFG } = M, b = M.newBall({ x: 0, y: 3, z: 0 }); b.p.y = 3; b.v.z = 4;
  const peaks = []; let up = false, top = 0;
  for (let t = 0; t < 12; t += CFG.dt) { M.stepFree(b, CFG.dt, {}); if (b.v.y > 0) { up = true; top = Math.max(top, b.p.y); } else if (up) { peaks.push(top); up = false; top = 0; } }
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], 'каждый отскок ниже');
  assert.ok(b.p.y >= CFG.R - 1e-9, 'не проваливается под газон');
  assert.deepEqual([b.v.x, b.v.y, b.v.z], [0, 0, 0], 'остановился совсем');
  assert.ok(b.p.z > 4 && b.p.z < 30, `прокатился ${b.p.z} м`);
});
test('16. 30, 60 и 120 кадров в секунду — тот же полёт', () => {
  const { CFG } = M;
  const fly = (fps) => { const b = M.newBall({ x: 0, y: 0.11, z: 20 }); Object.assign(b.v, { x: 2, y: 6, z: -22 }); Object.assign(b.w, { x: -3, y: 20, z: 0 }); const c = M.clockFixed();
    for (let t = 0; t < 1.5 - 1e-9; t += 1 / fps) { const n = c.add(1 / fps); for (let i = 0; i < n; i++) M.stepFree(b, CFG.dt, {}); } return b.p; };
  const a = fly(30), b = fly(60), c = fly(120);
  assert.ok(hyp(a, b) < 0.15 && hyp(b, c) < 0.15, `разное место: ${JSON.stringify([a, b, c])}`);
  const d30 = dribble(() => ({ x: 0, y: 1 }), 3, { frame: 1 / 30 }), d120 = dribble(() => ({ x: 0, y: 1 }), 3, { frame: 1 / 120 });
  assert.ok(Math.abs(d30.P.p.z - d120.P.p.z) < 0.15, 'игрок пробегает одинаково');
  const c2 = M.clockFixed(); assert.ok(c2.add(1) <= Math.round(CFG.maxFrame / CFG.dt), 'долгий кадр не даёт огромного скачка');
});
test('18. сброс эпизода — владелец, скорости, вращение и запреты обнулены', () => {
  const s = shoot(0.8); M.resetBall(s.b, { x: 1, y: 0.11, z: 30 });
  assert.equal(s.b.state, 'free'); assert.equal(s.b.owner, null); assert.equal(s.b.lockOwner, null);
  assert.deepEqual([s.b.v.x, s.b.v.y, s.b.v.z, s.b.w.x, s.b.w.y, s.b.w.z], [0, 0, 0, 0, 0, 0]);
  assert.equal(s.b.mustClear, false); assert.equal(s.b.goal, false);
});
test('подкрутка: мяч приходит туда же, куда целишь, но летит заметной плавной дугой', () => {
  const plain = shoot(0.6, false, { x: -0.5, y: 1 }), fin = shoot(0.6, true, { x: -0.5, y: 1 });
  const a = M.predict(plain.b.p, plain.b.v, plain.b.w).p, b = M.predict(fin.b.p, fin.b.v, fin.b.w).p;
  assert.ok(Math.abs(a.x - b.x) < 0.6, `подкрутка пришла не в цель: ${a.x} против ${b.x}`);
  // дуга: наибольшее отклонение траектории от прямой «точка удара — точка у ворот»
  const q = M.newBall(fin.b.p); Object.assign(q.v, fin.b.v); Object.assign(q.w, fin.b.w); const p0 = { x: q.p.x, z: q.p.z };
  let dev = 0; for (let t = 0; t < 3 && q.p.z > 0; t += M.CFG.dt) { M.stepFree(q, M.CFG.dt, {}); const ux = b.x - p0.x, uz = b.z - p0.z, ul = Math.hypot(ux, uz);
    dev = Math.max(dev, Math.abs(((q.p.x - p0.x) * uz - (q.p.z - p0.z) * ux) / ul)); }
  assert.ok(dev > 0.4 && dev < 3.5, `дуга подкрутки ${dev} м`);
});
test('край поля у ворот: игрок останавливается, мяч у ноги не уезжает за линию', () => {
  const { CFG } = M, P = M.newPlayer({ x: 4, z: 6 }, Math.PI), b = M.newBall(M.controlPoint(P, null)); M.capture(b, P, 'me'); b.trapDur = 0;
  for (let t = 0; t < 4; t += CFG.dt) { P.sprint = true; M.playerStep(P, { x: 0, y: 1 }, CFG.dt, true); if (b.touchCd <= 0) M.touch(b, P); M.controlStep(b, P, CFG.dt); }
  assert.equal(P.p.z, CFG.player.bounds.zMin); assert.equal(P.v.z, 0, 'упёрся — скорость к воротам ноль');
  assert.ok(b.p.z > 0.2, `мяч ушёл за линию ворот: z=${b.p.z}`); assert.equal(b.state, 'owned');
});
test('пас низом доходит до цели с нужной скоростью, сильный — быстрее; верховой — по дуге, после паса мяч свободен', () => {
  const { CFG } = M;
  const roll = (kind, power, d) => { const b = M.newBall({ x: 0, y: CFG.R, z: 20 }), tgt = { x: d, z: 20 }; const pv = M.passVelocity(b, tgt, kind, power);
    Object.assign(b.v, pv.v); Object.assign(b.w, pv.w); let t = 0, at = null, maxY = 0;
    while (t < 6) { M.stepFree(b, CFG.dt, {}); t += CFG.dt; maxY = Math.max(maxY, b.p.y); if (at === null && b.p.x >= d) at = { t, v: Math.hypot(b.v.x, b.v.z) }; }
    return { pv, at, maxY, end: b.p.x }; };
  for (const d of [8, 15, 25]) {
    const n = roll('ground', 0, d), s = roll('ground', 1, d);
    assert.ok(n.at && Math.abs(n.at.v - CFG.pass.arrive) < 0.6, `пас ${d} м пришёл со скоростью ${n.at && n.at.v}`);
    assert.ok(s.at.t < n.at.t, 'сильный пас приходит раньше');
    assert.ok(n.maxY < CFG.R + 0.02, 'пас низом не подпрыгивает');
  }
  const l = roll('lofted', 0, 20); assert.ok(l.maxY > 2, `верховой поднимается: ${l.maxY}`); assert.ok(l.end > 17, `верховой долетает: ${l.end}`);
});
test('подкрутка по жесту: влево — мяч уходит влево, вправо — вправо; переброс выше и медленнее обычного', () => {
  const run = (kind, side) => { const P = M.newPlayer({ x: 0, z: 18 }, Math.PI), b = M.newBall(M.controlPoint(P, null)); M.capture(b, P, 'me');
    const sv = M.shotVelocity(b, P, { x: 0, y: 0 }, 0.6, kind, { w: 3.66, h: 2.44 }, side); const end = M.predict(b.p, sv.v, sv.w).p;
    let apex = 0; { const q = M.newBall(b.p); Object.assign(q.v, sv.v); Object.assign(q.w, sv.w); for (let t = 0; t < 2.5 && q.p.z > 0; t += M.CFG.dt) { M.stepFree(q, M.CFG.dt, {}); apex = Math.max(apex, q.p.y); } }
    return { x: end.x - b.p.x, speed: sv.speed, apex }; };
  const L = run('curl', 1), Rt = run('curl', -1), D = run('drive'), C = run('chip');
  assert.ok(L.x < -0.4 && Rt.x > 0.4, `подкрутка: влево ${L.x}, вправо ${Rt.x}`);
  assert.ok(C.speed < D.speed && C.apex > D.apex + 0.5, `переброс: скорость ${C.speed} против ${D.speed}, высота ${C.apex} против ${D.apex}`);
});

// ---------- автоподбор свободного мяча ----------
test('автоподбор: пороги включения и выключения (гистерезис)', () => {
  const C = M.CHASE;
  assert.equal(M.chaseDecide(false, 0, 0), true, 'джойстик отпущен — преследует');
  assert.equal(M.chaseDecide(false, 1, 0.9), true, 'ввод к мячу — преследует');
  assert.equal(M.chaseDecide(true, 0.35, -1), true, 'лёгкое движение пальца в сторону — не сбрасывает');
  assert.equal(M.chaseDecide(true, 1, -0.9), false, 'явно в другую сторону — отпускает');
  assert.equal(M.chaseDecide(false, 1, 0.3), false, 'между порогами — остаётся выключенным');
  assert.ok(C.cosOn > C.cosOff && C.off > C.neutral);
});

test('автоподбор: сразу полная скорость, подбор катящегося мяча без проскока', () => {
  const C = M.CFG.player, P = M.newPlayer({ x: 0, z: 30 }, Math.PI), b = M.newBall();
  b.p.x = 1; b.p.y = M.CFG.R; b.p.z = 22; b.v.x = 0.5; b.v.z = -4; b.state = 'free';
  const h = 1 / 240, plan = M.newBall();
  const meet = () => { // где мяч будет, когда игрок успеет туда (как в игре)
    Object.assign(plan.p, b.p); Object.assign(plan.v, b.v); Object.assign(plan.w, b.w); plan.state = 'free';
    for (let t = 1 / 30; t < 3; t += 1 / 30) { for (let k = 0; k < 4; k++) M.stepFree(plan, 1 / 120, {}); if (Math.hypot(plan.p.x - P.p.x, plan.p.z - P.p.z) - 0.45 <= C.sprint * 0.92 * t) return { x: plan.p.x, z: plan.p.z }; }
    return { x: plan.p.x, z: plan.p.z };
  };
  let mp = meet(), sp06 = 0, caught = -1, minAhead = 9, rel = 0;
  for (let i = 0; i < 240 * 4; i++) {
    const t = i * h; if (i % 24 === 0) mp = meet();
    const v = M.chaseVel(P, b, mp), s = Math.hypot(v.x, v.z); P.boost = v.boost; P.sprint = s > C.jog * 1.02;
    const k = Math.min(1, s / (P.sprint ? C.sprint : C.jog)); M.playerStep(P, s > 1e-3 ? { x: (v.x / s) * k, y: (-v.z / s) * k } : { x: 0, y: 0 }, h, false);
    M.stepFree(b, h, {});
    if (Math.abs(t - 0.6) < h / 2) sp06 = Math.hypot(P.v.x, P.v.z);
    minAhead = Math.min(minAhead, (P.p.z - b.p.z)); // игрок не должен пробежать мяч (мяч катится к −z, игрок догоняет со стороны +z)
    if (M.canCapture(b, P, 'me', t)) { caught = t; rel = Math.hypot(b.v.x - P.v.x, b.v.z - P.v.z); break; }
  }
  assert.ok(sp06 > C.sprint * 0.8, `через 0,6 с скорость ${sp06.toFixed(2)} — почти полная (${C.sprint})`);
  assert.ok(caught > 0 && caught < 3.5, `мяч подобран за ${caught.toFixed(2)} с`);
  assert.ok(rel <= M.CFG.control.captureVrel, `относительная скорость при касании ${rel.toFixed(2)}`);
  assert.ok(minAhead > -0.6, `не проскочил мяч (${minAhead.toFixed(2)} м)`);
});

test('первое касание: мяч не сдвигается, прилёт гасится, мяч уходит по джойстику; без джойстика — у ноги', () => {
  const P = M.newPlayer({ x: 0, z: 20 }, Math.PI), cp = M.controlPoint(P, null);
  const b = M.newBall({ x: cp.x, y: M.CFG.R, z: cp.z }); b.v.z = 6; // летит навстречу игроку
  const x0 = b.p.x, z0 = b.p.z; M.firstTouch(b, P, 'me', { x: 1, z: 0 });
  assert.equal(b.p.x, x0); assert.equal(b.p.z, z0);
  assert.ok(b.v.x > 0.8 && Math.abs(b.v.z) < 1e-9, 'уходит вправо по джойстику');
  assert.ok(Math.hypot(b.v.x, b.v.z) < 3, 'скорость прилёта погашена');
  const b2 = M.newBall({ x: cp.x, y: M.CFG.R, z: cp.z }); b2.v.z = 6; M.firstTouch(b2, P, 'me', null);
  assert.ok(Math.hypot(b2.v.x, b2.v.z) < 1, 'подушка: мяч почти остановлен');
  // дальше мяч сам к ноге не притягивается: за время свободного качения он не ближе, чем докатился бы
  for (let i = 0; i < 40; i++) M.controlStep(b2, P, 1 / 240);
  assert.ok(Math.hypot(b2.v.x, b2.v.z) < 1, 'без рывка');
});

test('вторые ворота (матч): гол, штанга и сетка — так же, как в первых', () => {
  const L = 48, world = { goal: { w: 3.66, h: 2.44, d: 1.5, top: 1.5 }, goal2: { w: 3.66, h: 2.44, d: 1.5, top: 1.5, L } };
  const run = (b) => { const ev = []; for (let i = 0; i < 240 * 3; i++) M.stepFree(b, 1 / 240, world, ev); return ev; };
  const a = M.newBall({ x: 1, y: 0.5, z: 40 }); a.v.z = 15; a.v.y = 1;
  const ea = run(a); assert.ok(ea.some((e) => e.type === 'goal' && e.end === 1), 'гол во вторые'); assert.ok(a.p.z > L && a.p.z < L + 1.6, 'мяч в сетке');
  const b = M.newBall({ x: 1, y: 0.5, z: 8 }); b.v.z = -15; b.v.y = 1;
  const eb = run(b); assert.ok(eb.some((e) => e.type === 'goal' && e.end === 0), 'гол в первые'); assert.ok(!eb.some((e) => e.end === 1));
  const c = M.newBall({ x: -3.66, y: 0.5, z: 40 }); c.v.z = 15; c.v.y = 0.5; // точно в штангу
  const ec = run(c); assert.ok(ec.some((e) => e.type === 'post' && e.end === 1), 'штанга вторых'); assert.ok(c.p.z < L, 'отскочил в поле');
});

// ведение касаниями: шаг → касание → мяч катится и тормозит → следующее касание (запись EA, 28,5–35,4 с)
function touchRun(prog, T, start = { x: 0, z: 35 }) {
  const { CFG } = M, P = M.newPlayer(start, Math.PI), b = M.newBall(M.controlPoint(P, null)); M.capture(b, P, 'me'); b.trapT = 1; b.trapDur = 0;
  let t = 0, tn = 0, last = 0, lost = 0, jumps = [], gaps = [], g = 0, prevV = 0;
  while (t < T) { const inp = prog(t); P.sprint = !!inp.sprint; M.playerStep(P, inp, CFG.dt, true);
    if (b.state === 'owned') { if (!b.tm && b.touchCd <= 0 && Math.hypot(P.v.x, P.v.z) > 0.6) M.touch(b, P); if (M.controlStep(b, P, CFG.dt) === 'lost') lost++; }
    const bv = Math.hypot(b.v.x, b.v.z), d = Math.hypot(b.p.x - P.p.x, b.p.z - P.p.z); g = Math.max(g, d);
    if ((b.touchN || 0) !== last) { last = b.touchN; tn++; if (t > 1) { jumps.push(bv - prevV); gaps.push(g); } g = 0; }
    prevV = bv; t += CFG.dt; }
  return { tn, lost, jumps, gaps };
}
test('ведение касаниями: касания регулярные, толчок виден, мяч уходит по скорости', () => {
  const jog = touchRun(() => ({ x: 0, y: 1 }), 4), spr = touchRun(() => ({ x: 0, y: 1, sprint: true }), 4, { x: 0, z: 40 });
  assert.equal(jog.lost + spr.lost, 0);
  assert.ok(jog.tn >= 6 && jog.tn <= 9, `бегом касаний за 4 с: ${jog.tn}`); // ~раз в 0,58 с
  assert.ok(Math.min(...jog.jumps) > 1, `касание должно толкать мяч: ${jog.jumps}`);
  assert.ok(Math.max(...jog.gaps) < 0.9, `бегом мяч уходит дальше 0,9 м: ${jog.gaps}`);
  assert.ok(Math.max(...spr.gaps) > 1.1 && Math.max(...spr.gaps) < 1.6, `на рывке вынос: ${spr.gaps}`);
});
test('ведение касаниями: дрожащий палец и зигзаг — без потерь', () => {
  const jit = touchRun((t) => ({ x: Math.sin(Math.floor(t * 10) * 1.7) * 0.45, y: 0.9 }), 4);
  const zig = touchRun((t) => (Math.floor(t / 0.8) % 2 ? { x: -0.7, y: 0.7 } : { x: 0.7, y: 0.7 }), 4);
  assert.equal(jit.lost + zig.lost, 0);
});
