// Стадион «Удара»: замкнутая чаша из четырёх трибун и четырёх угловых секторов-«вееров», два яруса, проходы с лестницами,
// ограждения, крыша на фермах, рекламные щиты, болельщики. Всё процедурно (своих картинок не нужно).
// Сколько вызовов отрисовки: бетон, сиденья, крыша, фермы, перила, ступени проходов, болельщики, щиты — по одному на материал.
// Динамических теней стадион не отбрасывает и не принимает (это дорого и почти не видно).
import * as THREE from 'three';

// ---------- общий вид ----------
export const STAND = {
  pitchHalfW: 42,         // передний край боковых трибун (x = ±42) — 8 м от бровки
  north: -9, south: 64,   // передний край трибун за воротами (z)
  lower: { rows: 12, depth: 0.8, rise: 0.34, y0: 1.15 },   // нижний ярус
  concourse: { depth: 1.8, gap: 1.25, wall: 1.5 },         // проход между ярусами: пол, тёмный проём выходов, стенка
  upper: { rows: 8, depth: 0.82, rise: 0.46 },             // верхний ярус круче
  aisle: { every: 9, width: 1.1 },                          // проход-лестница каждые 9 м
  roof: { over: 5.5, lift: 1.4, thick: 0.4, back: 1.8 },     // крыша нависает над верхним ярусом (небо над полем видно)
  truss: { every: 12 },
  colors: { concrete: '#8f949c', seat: '#26406a', seatHi: '#3a5a8c', aisle: '#80868f', roofTop: '#dfe3e8', roofUnder: '#8a919c',
    steel: '#c4c9d1', rail: '#d8dce2', gap: '#1d2129' },
};
// палитры секторов: за воротами — «домашние» (красно-белые), напротив — гостевые (синие), сбоку — смешанные.
// Насыщенность умеренная, плюс много нейтральной одежды — без «конфетти» из случайных ярких цветов.
const PAL = {
  home: ['#a8242e', '#c9c6c0', '#7e1b23', '#b8333a', '#d8d6d0'],
  away: ['#2b4f92', '#cfd2d6', '#1f3666', '#3a62a8'],
  mix: ['#a8242e', '#2b4f92', '#cfcac2', '#3b3f47', '#6d7179'],
  neutral: ['#2e3138', '#4a4e57', '#6b6f78', '#9a958c', '#c8c4bc', '#3b4a5e', '#5a4a3e'],
};
const rand = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // своё зерно: одинаковый стадион

// ---------- профиль трибуны (сечение) ----------
// точки (d — глубина от переднего края, y — высота) и тип каждого отрезка между ними
function profile() {
  const S = STAND, P = []; let d = 0, y = 0;
  const to = (nd, ny, kind, row) => { P.push({ d0: d, y0: y, d1: nd, y1: ny, kind, row }); d = nd; y = ny; };
  to(0, S.lower.y0, 'wall');                                  // передняя стенка за щитами
  const rows = [];
  for (let i = 0; i < S.lower.rows; i++) { rows.push({ d, y, depth: S.lower.depth, tier: 0, i }); to(d + S.lower.depth, y, 'seat', i); to(d, y + S.lower.rise, 'riser'); }
  const yLow = y;
  to(d + S.concourse.depth, y, 'walk');                       // проход между ярусами
  to(d, y + S.concourse.gap, 'gap');                          // тёмные проёмы выходов
  to(d, y + S.concourse.wall, 'wall');                        // парапет верхнего яруса
  for (let i = 0; i < S.upper.rows; i++) { rows.push({ d, y, depth: S.upper.depth, tier: 1, i }); to(d + S.upper.depth, y, 'seat', i); to(d, y + S.upper.rise, 'riser'); }
  const yTop = y + 1.2; to(d, yTop, 'wall');                  // задняя стенка над последним рядом
  const dBack = d; to(d + 0.6, yTop, 'walk'); to(d, 0, 'wall'); // верх стены и фасад до земли (снаружи чаша закрыта)
  return { segs: P, rows, yLow, yTop, dBack };
}

// ---------- построитель сеток (по материалу) ----------
class Mesher {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  quad(a, b, c, d, uva, uvb, uvc, uvd, col) { // a-b-c-d против часовой со стороны лица
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const [v, t] of [[a, uva], [b, uvb], [c, uvc], [a, uva], [c, uvc], [d, uvd]]) { this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.uv.push(t[0], t[1]); const k = col(v); this.c.push(k[0], k[1], k[2]); }
  }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); return g; }
}

// ---------- сиденья: плитка 9 м = 16 кресел и проход ----------
function seatTexture(maxAniso) {
  const S = STAND.colors, W = 512, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const aisle = (STAND.aisle.width / STAND.aisle.every) * W;
  g.fillStyle = S.concrete; g.fillRect(0, 0, W, H);
  const n = 16, sw = (W - aisle) / n;
  for (let i = 0; i < n; i++) {
    const x = aisle + i * sw;
    g.fillStyle = S.seat; g.fillRect(x + sw * 0.1, H * 0.35, sw * 0.8, H * 0.5);   // сиденье
    g.fillStyle = S.seatHi; g.fillRect(x + sw * 0.12, H * 0.1, sw * 0.76, H * 0.28); // спинка (виднее сверху)
  }
  g.fillStyle = S.aisle; g.fillRect(0, 0, aisle, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
}

// ---------- болельщики: атлас 8 силуэтов × 2 тона кожи; одежда перекрашивается по маске ----------
function crowdAtlas() {
  const CW = 64, CH = 96, NV = 8, c = document.createElement('canvas'), m = document.createElement('canvas');
  c.width = m.width = CW * NV; c.height = m.height = CH * 2;
  const g = c.getContext('2d'), k = m.getContext('2d');
  const skins = ['#e2b896', '#8d5a3b'], hairs = ['#2a211b', '#5b3d26', '#141414', '#7a6a55'];
  for (let row = 0; row < 2; row++) for (let v = 0; v < NV; v++) {
    const ox = v * CW, oy = row * CH, cx = ox + CW / 2, skin = skins[row], hair = hairs[(v + row) % hairs.length];
    const kid = v === 6, scale = kid ? 0.82 : 1, headY = oy + (kid ? 34 : 26), r = 12.5 * scale;
    const body = (ctx, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, oy + CH + 6, (v === 5 ? 30 : 27) * scale, (CH - headY + oy - 2) * 1.0, 0, Math.PI, 0); ctx.fill(); };
    // тело (одежда — перекрашивается): на маске белое
    body(g, '#d8d8d8'); body(k, '#ffffff');
    if (v === 3) { g.fillStyle = '#d8d8d8'; k.fillStyle = '#fff'; for (const ctx of [g, k]) { ctx.beginPath(); ctx.ellipse(cx, headY + 2, r + 3, r + 4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); } } // капюшон
    if (v === 7) { // руки вверх (шарф над головой)
      for (const ctx of [g, k]) { ctx.fillStyle = ctx === g ? '#d8d8d8' : '#fff'; ctx.fillRect(cx - 27, oy + 10, 7, 46); ctx.fillRect(cx + 20, oy + 10, 7, 46); }
      g.fillStyle = '#c03030'; g.fillRect(cx - 27, oy + 6, 54, 7); k.fillStyle = '#000'; k.fillRect(cx - 27, oy + 6, 54, 7);
    }
    // шея и голова
    g.fillStyle = skin; g.fillRect(cx - 5 * scale, headY + r - 4, 10 * scale, 9); g.beginPath(); g.arc(cx, headY, r, 0, 7); g.fill();
    k.fillStyle = '#000'; k.fillRect(cx - 5 * scale, headY + r - 4, 10 * scale, 9); k.beginPath(); k.arc(cx, headY, r, 0, 7); k.fill();
    // волосы / головной убор
    g.fillStyle = hair;
    if (v === 1) { g.beginPath(); g.ellipse(cx, headY + 3, r + 2.5, r + 6, 0, Math.PI, 0); g.fill(); g.fillRect(cx - r - 2.5, headY, 5, 15); g.fillRect(cx + r - 2.5, headY, 5, 15); } // длинные
    else if (v === 2) { g.fillStyle = '#d8d8d8'; k.fillStyle = '#fff'; for (const ctx of [g, k]) { ctx.beginPath(); ctx.ellipse(cx, headY - 3, r + 1, r * 0.75, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - 2, headY - 5, r + 10, 4); } } // кепка (в цвет одежды)
    else if (v === 4) { g.fillStyle = '#2b2f36'; g.beginPath(); g.ellipse(cx, headY - 2, r + 1.5, r * 0.85, 0, Math.PI, 0); g.fill(); } // шапка
    else if (v !== 3) { g.beginPath(); g.ellipse(cx, headY - 2, r + 0.8, r * (v === 0 ? 0.6 : 0.7), 0, Math.PI, 0); g.fill(); }
  }
  const tc = new THREE.CanvasTexture(c), tm = new THREE.CanvasTexture(m); tc.colorSpace = THREE.SRGBColorSpace;
  return { tc, tm, NV };
}

export function buildStadium(scene, opts = {}) {
  const S = STAND, prof = profile(), maxAniso = opts.aniso || 8;
  const conc = new Mesher(), seats = new Mesher(), roof = new Mesher();
  const C = (h) => new THREE.Color(h).toArray();
  const cConc = C(S.colors.concrete), cGap = C(S.colors.gap), cWalk = C(S.colors.aisle);
  // «затенение» под крышей и в глубине верхнего яруса — дешёвый запечённый объём (крыша не отбрасывает настоящих теней)
  const shade = (y, d) => { const u = THREE.MathUtils.smoothstep(y, prof.yLow + 2, prof.yTop), back = THREE.MathUtils.smoothstep(d, prof.dBack - 6, prof.dBack); return 1 - 0.38 * u - 0.12 * back * u; };
  const tint = (base, k) => [base[0] * k, base[1] * k, base[2] * k];
  const seatsPlaced = []; // места для болельщиков
  const rails = [], steps = [], beams = [];

  // кусок трибуны: frame(d, x) → мировая точка; len — длина вдоль трибуны; straight — есть ли проходы-лестницы
  function standPiece(frame, x0, x1, straight, sector) {
    const N = straight ? 1 : 10;
    for (let k = 0; k < N; k++) {
      const a0 = x0 + ((x1 - x0) * k) / N, a1 = x0 + ((x1 - x0) * (k + 1)) / N;
      for (const s of prof.segs) {
        const A = frame(s.d0, s.y0, a0), B = frame(s.d0, s.y0, a1), Cc = frame(s.d1, s.y1, a1), D = frame(s.d1, s.y1, a0);
        const len0 = straight ? a0 : a0 * Math.max(0.5, s.d0), len1 = straight ? a1 : a1 * Math.max(0.5, s.d0); // вдоль дуги — длина по радиусу
        if (s.kind === 'seat') {
          const u0 = len0 / S.aisle.every, u1 = len1 / S.aisle.every;
          seats.quad(A, B, Cc, D, [u0, 1], [u1, 1], [u1, 0], [u0, 0], (v) => { const k2 = shade(v.y, s.d0); return [k2, k2, k2]; });
        } else {
          const base = s.kind === 'gap' ? cGap : s.kind === 'walk' ? cWalk : cConc;
          conc.quad(A, B, Cc, D, [0, 0], [1, 0], [1, 1], [0, 1], (v) => tint(base, shade(v.y, s.d0)));
        }
      }
    }
    // болельщики: по рядам, кресло 0,55 м, в проходах никого
    for (const r of prof.rows) {
      const dd = r.d + r.depth * 0.45, radius = straight ? 1 : dd, L = (x1 - x0) * radius;
      for (let t = 0.3; t < L - 0.3; t += 0.55) {
        const along = x0 + t / radius;
        if (straight) { const m = ((along % S.aisle.every) + S.aisle.every) % S.aisle.every; if (m < S.aisle.width + 0.2) continue; }
        const p = frame(dd, r.y + 0.42, along);
        seatsPlaced.push({ p, row: r.i + r.tier * 20, tier: r.tier, sector, shade: shade(r.y + 1, dd) });
      }
    }
    // ограждения: по краю каждого яруса и по верху (перила)
    for (const [d, y] of [[0, S.lower.y0 + 0.55], [prof.rows[S.lower.rows].d - 0.05, prof.rows[S.lower.rows].y + 0.5]]) {
      const segN = straight ? Math.max(1, Math.round((x1 - x0) / 4)) : 6;
      for (let k = 0; k < segN; k++) rails.push([frame(d, y, x0 + ((x1 - x0) * k) / segN), frame(d, y, x0 + ((x1 - x0) * (k + 1)) / segN)]);
    }
    if (!straight) return;
    // проходы: ступени-полушаги и поручни по центру прохода
    for (let a = Math.ceil(x0 / S.aisle.every) * S.aisle.every; a < x1; a += S.aisle.every) {
      const ax = a + S.aisle.width / 2;
      for (const r of prof.rows) { const h = (r.tier ? S.upper.rise : S.lower.rise) * 0.5; steps.push({ p: frame(r.d + r.depth * 0.75, r.y + h * 0.5, ax), fwd: frame(1, 0, ax).sub(frame(0, 0, ax)), w: S.aisle.width, h, d: r.depth * 0.5 }); } // промежуточная ступень в каждом ряду прохода
      for (const tier of [0, 1]) {
        const rs = prof.rows.filter((r) => r.tier === tier), r0 = rs[0], r1 = rs[rs.length - 1];
        rails.push([frame(r0.d + 0.3, r0.y + 0.95, ax), frame(r1.d + r1.depth, r1.y + 0.95, ax)]);
      }
    }
    // крыша на фермах: колонна сзади + наклонная балка к переднему краю крыши
    for (let a = Math.ceil(x0 / S.truss.every) * S.truss.every; a <= x1 - 2; a += S.truss.every) {
      const back = frame(prof.dBack + 0.3, 0, a), top = frame(prof.dBack + 0.3, prof.yTop + S.roof.back, a);
      const front = frame(prof.dBack - S.roof.over, prof.yTop + S.roof.back + S.roof.lift, a);
      beams.push([back, top, 0.35], [top, front, 0.28], [frame(prof.dBack + 0.3, prof.yTop + 0.3, a), front, 0.16]);
    }
  }
  // крыша — для любого куска (прямого и угла)
  function roofPiece(frame, x0, x1, straight) {
    const N = straight ? 1 : 10, yb = prof.yTop + S.roof.back, yf = yb + S.roof.lift, dB = prof.dBack + 0.6, dF = prof.dBack - S.roof.over;
    const top = C(S.colors.roofTop), under = C(S.colors.roofUnder);
    for (let k = 0; k < N; k++) {
      const a0 = x0 + ((x1 - x0) * k) / N, a1 = x0 + ((x1 - x0) * (k + 1)) / N;
      roof.quad(frame(dB, yb + S.roof.thick, a0), frame(dB, yb + S.roof.thick, a1), frame(dF, yf + S.roof.thick, a1), frame(dF, yf + S.roof.thick, a0), [0, 0], [1, 0], [1, 1], [0, 1], () => top);
      roof.quad(frame(dF, yf, a0), frame(dF, yf, a1), frame(dB, yb, a1), frame(dB, yb, a0), [0, 0], [1, 0], [1, 1], [0, 1], () => under);
      roof.quad(frame(dF, yf, a0), frame(dF, yf + S.roof.thick, a0), frame(dF, yf + S.roof.thick, a1), frame(dF, yf, a1), [0, 0], [1, 0], [1, 1], [0, 1], () => top); // торец
    }
  }

  // четыре прямые трибуны и четыре угла-веера. Направления: вдоль трибуны (ax) и вглубь (dz)
  const W = S.pitchHalfW, N = S.north, So = S.south;
  const straight = (origin, along, depth) => (d, y, a) => new THREE.Vector3(origin.x + along.x * a + depth.x * d, y, origin.z + along.z * a + depth.z * d);
  const V = (x, z) => new THREE.Vector3(x, 0, z);
  const stands = [
    { f: straight(V(0, N), V(1, 0), V(0, -1)), x0: -W, x1: W, sector: 'home' },          // за воротами (в кадре чаще всего)
    { f: straight(V(0, So), V(1, 0), V(0, 1)), x0: -W, x1: W, sector: 'away' },          // напротив
    { f: straight(V(W, 0), V(0, 1), V(1, 0)), x0: N, x1: So, sector: 'mix' },            // справа
    { f: straight(V(-W, 0), V(0, 1), V(-1, 0)), x0: N, x1: So, sector: 'mix' },          // слева
  ];
  // угол: центр — точка встречи передних краёв, ряды — дуги вокруг неё (стыкуются с прямыми трибунами без щелей)
  const corner = (cx, cz, d1, d2) => (d, y, a) => { const c = Math.cos(a), s = Math.sin(a); return new THREE.Vector3(cx + (d1.x * c + d2.x * s) * (d + 0), y, cz + (d1.z * c + d2.z * s) * (d + 0)); };
  const corners = [
    { f: corner(W, N, V(0, -1), V(1, 0)), sector: 'home' }, { f: corner(-W, N, V(-1, 0), V(0, -1)), sector: 'home' },
    { f: corner(W, So, V(1, 0), V(0, 1)), sector: 'away' }, { f: corner(-W, So, V(0, 1), V(-1, 0)), sector: 'away' },
  ];
  for (const s of stands) { standPiece(s.f, s.x0, s.x1, true, s.sector); roofPiece(s.f, s.x0, s.x1, true); }
  for (const c of corners) { standPiece((d, y, a) => c.f(d + 0.001, y, a), 0, Math.PI / 2, false, c.sector); roofPiece(c.f, 0, Math.PI / 2, false); }

  const group = new THREE.Group(); scene.add(group);
  const lam = (o) => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o));
  const mConc = new THREE.Mesh(conc.geo(), lam({ color: '#ffffff', side: THREE.DoubleSide }));
  const mSeat = new THREE.Mesh(seats.geo(), lam({ map: seatTexture(maxAniso), side: THREE.DoubleSide }));
  const mRoof = new THREE.Mesh(roof.geo(), lam({ side: THREE.DoubleSide }));
  group.add(mConc, mSeat, mRoof);
  // детали: фермы, перила, ступени — экземплярами (по одному вызову на вид)
  const detail = new THREE.Group(); group.add(detail);
  const box = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const segInst = (list, mat, thick) => {
    const im = new THREE.InstancedMesh(box, mat, list.length);
    list.forEach(([a, b, t], i) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); q.setFromUnitVectors(up, d.normalize());
      m4.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(t || thick, L, t || thick)); im.setMatrixAt(i, m4); });
    im.frustumCulled = false; return im;
  };
  detail.add(segInst(beams, new THREE.MeshLambertMaterial({ color: S.colors.steel }), 0.3));
  detail.add(segInst(rails, new THREE.MeshLambertMaterial({ color: S.colors.rail }), 0.05));
  const st = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: S.colors.aisle }), steps.length);
  steps.forEach((s, i) => { q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.fwd.normalize()); m4.compose(s.p, q, new THREE.Vector3(s.w, s.h, s.d)); st.setMatrixAt(i, m4); });
  st.frustumCulled = false; detail.add(st);

  // ---------- болельщики ----------
  const { tc, tm, NV } = crowdAtlas();
  // порядок перемешан: при меньшем числе людей (низкое качество) пустеют места равномерно, а не целые сектора
  for (let i = seatsPlaced.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [seatsPlaced[i], seatsPlaced[j]] = [seatsPlaced[j], seatsPlaced[i]]; }
  const people = seatsPlaced.filter(() => rand() < 0.86); // часть мест пустует
  const n = people.length, geo = new THREE.PlaneGeometry(0.52, 0.78); geo.translate(0, 0.39, 0);
  const aPh = new Float32Array(n), aVar = new Float32Array(n), aSh = new Float32Array(n);
  const U = { uTime: { value: 0 }, uJump: { value: 0 }, uJumpT: { value: 0 }, maskT: { value: tm } };
  const mat = new THREE.MeshBasicMaterial({ map: tc, alphaTest: 0.5, alphaToCoverage: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime, uJump, uJumpT; attribute float aPh, aVar, aSh; varying float vSh; varying vec2 vAt;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
      vAt = vec2((uv.x + mod(aVar, ${NV}.0)) / ${NV}.0, (uv.y + floor(aVar / ${NV}.0)) / 2.0); vSh = aSh;`)
      .replace('#include <project_vertex>', `
      // человек всегда повёрнут к камере (не видно «картонок» ребром), высота — по оси мира
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sc = length(instanceMatrix[0].xyz);
      float delay = fract(aPh * 13.7) * 0.7, amp = 0.25 + fract(aPh * 7.3) * 0.35;
      float jump = uJump * step(delay, uJumpT) * max(0.0, sin((uJumpT - delay) * (7.5 + fract(aPh * 3.1) * 3.0))) * amp;
      float sway = sin(uTime * (1.1 + fract(aPh * 7.0)) + aPh * 30.0) * 0.03;
      mvPosition.xy += vec2(transformed.x * sc + sin(uTime * 0.7 + aPh * 11.0) * 0.02, transformed.y * sc + sway + jump);
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = 'uniform sampler2D maskT; varying float vSh; varying vec2 vAt;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vAt); diffuseColor *= sampledDiffuseColor; float msk = texture2D(maskT, vAt).r;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor, msk) * vSh; // перекрашиваем только одежду; в тени крыши темнее');
  };
  mat.customProgramCacheKey = () => 'crowd2';
  const crowd = new THREE.InstancedMesh(geo, mat, n);
  const col = new THREE.Color();
  // сектор = кусок трибуны 18 м; у каждого свой оттенок из палитры трибуны (цельные группы, а не случайные пятна)
  people.forEach((s, i) => {
    m4.makeScale(0.88 + rand() * 0.24, 0.88 + rand() * 0.24, 1); m4.setPosition(s.p); crowd.setMatrixAt(i, m4);
    const pal = PAL[s.sector], useTeam = rand() < 0.62;
    col.set(useTeam ? pal[(rand() * pal.length) | 0] : PAL.neutral[(rand() * PAL.neutral.length) | 0]);
    col.multiplyScalar(0.82 + rand() * 0.2); crowd.setColorAt(i, col);
    aPh[i] = rand(); aVar[i] = ((rand() * NV) | 0) + (rand() < 0.3 ? NV : 0); aSh[i] = 0.78 * s.shade + 0.04; // без света: тон под дневную сцену
  });
  geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(aPh, 1)); geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 1)); geo.setAttribute('aSh', new THREE.InstancedBufferAttribute(aSh, 1));
  crowd.frustumCulled = false; group.add(crowd);

  // ---------- рекламные щиты JACKSON / GAMES ----------
  const b = document.createElement('canvas'); b.width = 1024; b.height = 64; const bg = b.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const gr = bg.createLinearGradient(i * 256, 0, i * 256 + 256, 0); gr.addColorStop(0, i % 2 ? '#2b1a7a' : '#f0c43a'); gr.addColorStop(1, i % 2 ? '#4d34b8' : '#ea9a24');
    bg.fillStyle = gr; bg.fillRect(i * 256, 0, 256, 64);
    bg.fillStyle = i % 2 ? '#f0c43a' : '#1b1340'; bg.font = 'italic 900 40px system-ui'; bg.textAlign = 'center'; bg.fillText(i % 2 ? 'JACKSON' : 'GAMES', i * 256 + 128, 46);
  }
  const bt = new THREE.CanvasTexture(b); bt.colorSpace = THREE.SRGBColorSpace; bt.wrapS = THREE.RepeatWrapping; bt.repeat.x = 6; bt.anisotropy = maxAniso;
  const led = new THREE.MeshBasicMaterial({ map: bt, color: new THREE.Color().setScalar(opts.ledBrightness ?? 0.8) });
  const ledFrame = new THREE.MeshLambertMaterial({ color: '#2a2e36' });
  const board = (w, x, z, ry) => { const g2 = new THREE.Group(); const face = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), led); face.position.set(0, 0.5, 0.08);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.15), ledFrame); back.position.y = 0.5; g2.add(back, face); g2.position.set(x, 0, z); g2.rotation.y = ry; group.add(g2); };
  board(84, 0, -6.5, 0); board(60, -38, 22, Math.PI / 2); board(60, 38, 22, -Math.PI / 2);

  return {
    group, crowd, U, led: bt, detail, count: n,
    setCrowd(frac) { crowd.count = Math.max(1, Math.round(n * frac)); },
    setDetail(level) { detail.visible = level >= 1; },
    tick(t, dt) { U.uTime.value = t; if (U.uJump.value > 0) U.uJumpT.value += dt; else U.uJumpT.value = 0; bt.offset.x = (t * (opts.ledSpeed ?? 0.015)) % 1; },
  };
}
