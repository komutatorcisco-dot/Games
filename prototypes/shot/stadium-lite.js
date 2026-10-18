// Лёгкий стадион «Удара»: чаша трибун вокруг полного поля 105×68 м одной поверхностью и запечённой текстурой болельщиков,
// плюс рекламные щиты. Без отдельных фигур, ферм, перил, крыши и анимации людей.
// Вызовы отрисовки: чаша (1), лицевая сторона щитов (1), обратная сторона щитов (1). Теней не отбрасывает и не принимает.
// Тот же интерфейс, что у прежнего stadium.js (crowd, U, setCrowd, setDetail, tick) — игре менять ничего не нужно.
import * as THREE from 'three';

export const STAND = {
  halfW: 42,              // передний край боковых трибун (x = ±42) — 8 м от бровки
  north: -9, south: 114,  // передний край трибун за воротами (поле — от z = 0 до z = 105)
  // сечение чаши: [вглубь от переднего края, высота] — бортик, нижний ярус, проход, верхний ярус
  profile: [[0, 0], [0, 1.2], [11, 5.6], [12.2, 5.9], [25, 14.6], [25.6, 15.4]],
  tile: 12,               // текстура болельщиков повторяется через столько метров вдоль трибуны
};
// одежда: больше светлых и нейтральных тонов, командные цвета приглушены — трибуны не спорят с полем по яркости и пестроте
const PAL = ['#b0474c', '#d9d6cf', '#c9c4ba', '#9b3a40', '#4f6a9c', '#e2e0da', '#7d8189', '#a7a39b', '#5d6168', '#c4b8a6', '#b0474c', '#d9d6cf'];
const rand = (() => { let s = 77; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(); // своё зерно: одинаковый стадион

// текстура сектора: ряды кресел с сидящими людьми (сверху — плечи и голова), проход, тёмный проём между ярусами, бортик.
// v: 0 — низ бортика, 1 — верх задней стенки (координата вдоль сечения задаётся в той же доле)
function standTexture(vOf) {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const y = (v) => (1 - v) * H; // canvas сверху вниз; текстура переворачивается при загрузке
  g.fillStyle = '#8c9199'; g.fillRect(0, 0, W, H); // бетон
  const tier = (v0, v1, rows) => {
    const y0 = y(v1), y1 = y(v0), rh = (y1 - y0) / rows, pw = W / 26; // ~26 мест на 12 м
    for (let r = 0; r < rows; r++) {
      const ry = y0 + r * rh;
      g.fillStyle = r % 2 ? '#56657c' : '#5b6b83'; g.fillRect(0, ry, W, rh * 0.92); // кресла
      for (let k = 0; k < 26; k++) {
        const x = k * pw + pw * 0.5; if (Math.abs(x - W * 0.5) < pw * 0.9) continue; // проход-лестница в середине плитки
        if (rand() < 0.14) continue; // свободные места
        const col = PAL[(rand() * PAL.length) | 0], j = (rand() - 0.5) * pw * 0.18;
        // фигура сидящего: плечи-корпус (скруглённый прямоугольник) и отдельная небольшая голова — без «капель»
        g.fillStyle = col; g.beginPath(); if (g.roundRect) g.roundRect(x + j - pw * 0.3, ry + rh * 0.44, pw * 0.6, rh * 0.48, pw * 0.14); else g.rect(x + j - pw * 0.3, ry + rh * 0.44, pw * 0.6, rh * 0.48); g.fill();
        g.fillStyle = rand() < 0.75 ? '#c49a7c' : '#6e4c38'; g.beginPath(); g.arc(x + j, ry + rh * 0.3, Math.min(pw, rh) * 0.15, 0, 7); g.fill();
      }
    }
    g.fillStyle = '#8a9099'; g.fillRect(W * 0.5 - pw * 0.6, y0, pw * 1.2, y1 - y0); // ступени прохода
  };
  // сечение: 0–1 бортик, 1–2 нижний ярус, 2–3 проход между ярусами, 3–4 верхний ярус, 4–5 задняя стенка
  tier(vOf(1), vOf(2), 13); tier(vOf(3), vOf(4), 16);
  g.fillStyle = '#4d535c'; g.fillRect(0, y(vOf(3)), W, y(vOf(2)) - y(vOf(3))); // проход между ярусами
  g.fillStyle = '#5d636c'; g.fillRect(0, y(vOf(1)), W, y(vOf(0)) - y(vOf(1))); // бортик
  return c;
}

export function buildStadium(scene, opts = {}) {
  const S = STAND, P = S.profile, maxAniso = opts.aniso || 4;
  // длина сечения → координата v текстуры (по длине, без растяжения)
  const segL = P.map((p, i) => (i ? Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0)); let acc = 0; const cum = segL.map((l) => (acc += l));
  const vOf = (i) => cum[i] / acc;
  // обход вокруг поля на отступе d: прямые стороны + скруглённые углы радиуса d (кольца сечения стыкуются без щелей)
  // кольцо на отступе d: прямые стороны + скруглённые углы радиуса d. u (вдоль трибуны) у всех колец одинаковый: на прямых —
  // по длине стороны, в углах — по дуге среднего радиуса, поэтому ряды мест не съезжают от кольца к кольцу
  const NARC = 8, RMID = 12;
  const loop = (d) => {
    const x0 = -S.halfW, x1 = S.halfW, z0 = S.north, z1 = S.south, pts = [], sides = [z1 - z0, x1 - x0, z1 - z0, x1 - x0];
    let u = 0;
    const arc = (cx, cz, a0, side) => { for (let k = 0; k <= NARC; k++) { const a = a0 + (k / NARC) * (Math.PI / 2); pts.push([cx + Math.cos(a) * d, cz + Math.sin(a) * d, u + (k / NARC) * (Math.PI / 2) * RMID / S.tile]); }
      u += (Math.PI / 2) * RMID / S.tile + side / S.tile; };
    arc(x1, z0, -Math.PI / 2, sides[0]); arc(x1, z1, 0, sides[1]); arc(x0, z1, Math.PI / 2, sides[2]); arc(x0, z0, Math.PI, sides[3]);
    pts.push([pts[0][0], pts[0][1], u]); // замыкание
    return pts;
  };
  const pos = [], uv = [], idx = [];
  const rings = P.map(([d, h]) => loop(d).map(([x, z, u]) => [x, h, z, u]));
  const n = rings[0].length;
  for (let k = 0; k < rings.length; k++) for (let i = 0; i < n; i++) { const [x, h, z, u] = rings[k][i]; pos.push(x, h, z); uv.push(u, vOf(k)); }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n - 1; i++) { const a = k * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(standTexture(vOf)); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = maxAniso;
  const group = new THREE.Group(); scene.add(group);
  const bowl = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); bowl.matrixAutoUpdate = false; group.add(bowl);

  // ---------- рекламные щиты JACKSON / GAMES: все щиты — одна геометрия лицом к полю и одна — тыльной стороной ----------
  const b = document.createElement('canvas'); b.width = 1024; b.height = 64; const bg = b.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const gr = bg.createLinearGradient(i * 256, 0, i * 256 + 256, 0); gr.addColorStop(0, i % 2 ? '#2b1a7a' : '#e9c24a'); gr.addColorStop(1, i % 2 ? '#43309e' : '#e2a23a');
    bg.fillStyle = gr; bg.fillRect(i * 256, 0, 256, 64);
    bg.fillStyle = i % 2 ? '#f0c43a' : '#1b1340'; bg.font = 'italic 900 40px system-ui'; bg.textAlign = 'center'; bg.fillText(i % 2 ? 'JACKSON' : 'GAMES', i * 256 + 128, 46);
  }
  const bt = new THREE.CanvasTexture(b); bt.colorSpace = THREE.SRGBColorSpace; bt.wrapS = THREE.RepeatWrapping; bt.anisotropy = maxAniso;
  // каждый щит — четырёхугольник от A до B высотой 0,9 м; лицо смотрит к центру поля, тыльная сторона — тёмная
  const fp = [], fu = [], fi = [], bp = [], bi = [];
  const board = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L, toC = nx * (0 - (ax + bx) / 2) + nz * (52.5 - (az + bz) / 2);
    if (toC < 0) { [ax, az, bx, bz] = [bx, bz, ax, az]; } // обход так, чтобы лицевая сторона смотрела к полю
    const o = fp.length / 3, q = [[ax, 0.05, az], [bx, 0.05, bz], [bx, 0.95, bz], [ax, 0.95, az]];
    q.forEach((v) => { fp.push(...v); bp.push(...v); }); fu.push(0, 0, L / 14, 0, L / 14, 1, 0, 1);
    fi.push(o, o + 1, o + 2, o, o + 2, o + 3); bi.push(o, o + 2, o + 1, o, o + 3, o + 2);
  };
  board(-40, -6.5, 40, -6.5); board(-40, 111.5, 40, 111.5); board(38, -4, 38, 109); board(-38, -4, -38, 109);
  const mk = (p2, u2, i2) => { const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); if (u2) out.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2)); out.setIndex(i2); return out; };
  const led = new THREE.MeshBasicMaterial({ map: bt, color: new THREE.Color().setScalar(opts.ledBrightness ?? 0.8) });
  group.add(new THREE.Mesh(mk(fp, fu, fi), led), new THREE.Mesh(mk(bp, null, bi), new THREE.MeshBasicMaterial({ color: '#23272e' })));
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });

  // болельщиков-фигур нет: оставляем пустые поля прежнего интерфейса (празднование гола — звуком)
  const U = { uTime: { value: 0 }, uJump: { value: 0 }, uJumpT: { value: 0 } };
  const crowd = { userData: {}, count: 0 };
  return {
    group, crowd, U, led: bt, count: 0,
    setCrowd() {}, setDetail() {},
    tick(t) { bt.offset.x = (t * (opts.ledSpeed ?? 0.015)) % 1; },
  };
}
