// «Драфт»: ядро без интерфейса — схемы, две системы химии, рейтинг команды, подбор кандидатов и движок матча.
// Файл не трогает DOM: его же можно запускать в node (проверки) и на сервере (онлайн-матчи, этапы 3–4).
// Игрок здесь — объект { name, r, pos: ['ST','LW'], club, lg, nat, flag, st: [6 характеристик] }.
'use strict';

(function (root) {
  // ---------- настройки баланса: всё, что можно крутить, — здесь ----------
  const CFG = {
    // подборка: доли рейтинговых коридоров для основы и скамейки
    bands: [[70, 74, 0.30], [75, 79, 0.34], [80, 84, 0.25], [85, 99, 0.11]],
    captainBands: [[82, 85, 0.55], [86, 99, 0.45]],
    offerSize: 5,
    // шанс, что отдельный кандидат будет «под химию»: общий клуб / лига / сборная с кем-то из уже взятых
    linkChance: 0.38,
    linkKinds: [['club', 0.3], ['lg', 0.45], ['nat', 0.25]],
    // классика: шанс показать кандидата со «смежной» позицией вместо точной
    classicRelatedChance: 0.15,
    // матч
    match: {
      minutes: 90, stepMin: 1, tickMs: 667, // 90 шагов × 0,667 с ≈ 1 мин
      baseChance: 0.075, // шанс момента за минуту при равных командах и «Балансе»
      onTarget: 0.55, goalBase: 0.36,
      tAtt: [0.6, 0.8, 1, 1.22, 1.48], // своя угроза: Глубокая защита … Всё в атаку
      tExp: [0.62, 0.82, 1, 1.2, 1.45], // насколько вырастают моменты соперника (контратаки)
      chemSwing: 0.05, // нулевая химия = −5% к силе линий, полная = без потерь
    },
  };
  const TACTICS = ['Глубокая защита', 'Осторожно', 'Баланс', 'Атака', 'Всё в атаку'];

  const RU = { GK: 'ВРТ', CB: 'ЦЗ', LB: 'ЛЗ', RB: 'ПЗ', CDM: 'ЦОП', CM: 'ЦП', CAM: 'ЦАП', LM: 'ЛП', RM: 'ПП', LW: 'ЛВ', RW: 'ПВ', ST: 'НАП' };

  // ---------- схемы: позиции, места на поле (x, y в %), граф связей задан явно ----------
  const F = (name, slots, links) => ({ name, slots: slots.map(([pos, x, y]) => ({ pos, x, y })), links });
  const FORMATIONS = {
    '4-3-3': F('4-3-3', [['GK', 50, 93], ['LB', 12, 69], ['CB', 36, 73], ['CB', 64, 73], ['RB', 88, 69], ['CM', 24, 50], ['CM', 50, 54], ['CM', 76, 50], ['LW', 16, 22], ['ST', 50, 16], ['RW', 84, 22]],
      [[0, 2], [0, 3], [1, 2], [2, 3], [3, 4], [1, 5], [1, 8], [4, 7], [4, 10], [2, 5], [2, 6], [3, 6], [3, 7], [5, 6], [6, 7], [5, 8], [6, 9], [7, 10], [8, 9], [9, 10]]),
    '4-4-2': F('4-4-2', [['GK', 50, 93], ['LB', 12, 69], ['CB', 36, 73], ['CB', 64, 73], ['RB', 88, 69], ['LM', 12, 44], ['CM', 37, 50], ['CM', 63, 50], ['RM', 88, 44], ['ST', 35, 17], ['ST', 65, 17]],
      [[0, 2], [0, 3], [1, 2], [2, 3], [3, 4], [1, 5], [4, 8], [2, 6], [3, 7], [5, 6], [6, 7], [7, 8], [5, 9], [6, 9], [7, 10], [8, 10], [9, 10]]),
    '4-2-3-1': F('4-2-3-1', [['GK', 50, 93], ['LB', 12, 69], ['CB', 36, 73], ['CB', 64, 73], ['RB', 88, 69], ['CDM', 36, 56], ['CDM', 64, 56], ['LM', 14, 34], ['CAM', 50, 34], ['RM', 86, 34], ['ST', 50, 12]],
      [[0, 2], [0, 3], [1, 2], [2, 3], [3, 4], [1, 7], [4, 9], [2, 5], [3, 6], [5, 6], [5, 7], [5, 8], [6, 8], [6, 9], [7, 8], [8, 9], [7, 10], [8, 10], [9, 10]]),
    '3-5-2': F('3-5-2', [['GK', 50, 93], ['CB', 24, 73], ['CB', 50, 73], ['CB', 76, 73], ['LM', 10, 46], ['CDM', 34, 56], ['CAM', 50, 36], ['CDM', 66, 56], ['RM', 90, 46], ['ST', 35, 14], ['ST', 65, 14]],
      [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [1, 4], [1, 5], [2, 5], [2, 7], [3, 7], [3, 8], [4, 5], [5, 7], [7, 8], [5, 6], [7, 6], [4, 9], [6, 9], [6, 10], [8, 10], [9, 10]]),
    '4-1-2-1-2': F('4-1-2-1-2', [['GK', 50, 93], ['LB', 12, 69], ['CB', 36, 73], ['CB', 64, 73], ['RB', 88, 69], ['CDM', 50, 57], ['CM', 26, 43], ['CM', 74, 43], ['CAM', 50, 29], ['ST', 35, 14], ['ST', 65, 14]],
      [[0, 2], [0, 3], [1, 2], [2, 3], [3, 4], [1, 6], [4, 7], [2, 5], [3, 5], [5, 6], [5, 7], [6, 8], [7, 8], [6, 9], [7, 10], [8, 9], [8, 10], [9, 10]]),
    '3-4-3': F('3-4-3', [['GK', 50, 93], ['CB', 24, 73], ['CB', 50, 73], ['CB', 76, 73], ['LM', 10, 48], ['CM', 37, 52], ['CM', 63, 52], ['RM', 90, 48], ['LW', 16, 20], ['ST', 50, 14], ['RW', 84, 20]],
      [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 9], [7, 10], [8, 9], [9, 10]]),
  };
  const BENCH = 7;

  // ---------- КЛАССИЧЕСКАЯ химия (FUT в FIFA 19) ----------
  // Точно по FIFA 19: связь красная (ничего общего, −1), оранжевая (одно общее из клуб/лига/сборная, +1),
  // зелёная (два и больше, +2); сила связей игрока = среднее по его связям; химия игрока 0–10; команда = сумма, максимум 100.
  // Реконструкция: таблица «соответствие позиции × сила связей» ниже (официально EA её не публиковала),
  // смежность позиций — по смыслу FIFA 19 для позиций, которые есть в нашей базе (в ней нет CF, LF, RF, LWB, RWB).
  // Лояльность: как в FUT Draft FIFA 19 — у всех карточек драфта она есть, +1 к химии (не выше 10). Поэтому своя позиция
  // и все жёлтые связи дают 9 + 1 = 10. Не воспроизводим: тренера, стили химии и смену позиций карточками.
  const ChemClassic = (() => {
    const RELATED = [['CDM', 'CM'], ['CM', 'CAM'], ['LM', 'LW'], ['RM', 'RW']];
    const ZONES = [['CB', 'LB', 'RB'], ['CDM', 'CM', 'CAM', 'LM', 'RM'], ['ST', 'LW', 'RW', 'CAM']];
    function fit(p, slotPos) {
      const own = p.pos[0]; // в FIFA 19 у карточки одна позиция
      if (own === slotPos) return 'perfect';
      if (own === 'GK' || slotPos === 'GK') return 'wrong';
      if (RELATED.some(([a, b]) => (a === own && b === slotPos) || (b === own && a === slotPos))) return 'related';
      if (ZONES.some((z) => z.includes(own) && z.includes(slotPos))) return 'unrelated';
      return 'wrong';
    }
    const FIT_RU = { perfect: 'своя позиция', related: 'смежная позиция', unrelated: 'та же линия', wrong: 'чужая позиция' };
    // [сила < 0, 0…0,99, 1…1,59, ≥ 1,6]
    const TABLE = { perfect: [3, 6, 9, 10], related: [2, 5, 7, 8], unrelated: [1, 3, 5, 6], wrong: [0, 1, 2, 3] };
    const BUCKETS = [0, 1, 1.6];
    const LOYALTY = 1;
    function link(a, b) {
      const shared = (a.club === b.club ? 1 : 0) + (a.lg === b.lg ? 1 : 0) + (a.nat === b.nat ? 1 : 0);
      return shared >= 2 ? { color: 'green', v: 2, shared } : shared === 1 ? { color: 'orange', v: 1, shared } : { color: 'red', v: -1, shared };
    }
    function calc(form, xi) {
      const F_ = FORMATIONS[form];
      const links = F_.links.map(([i, j]) => (xi[i] && xi[j] ? { i, j, ...link(xi[i], xi[j]) } : { i, j, color: 'none', v: 0 }));
      const per = xi.map((p, i) => {
        if (!p) return null;
        const mine = links.filter((l) => (l.i === i || l.j === i) && l.color !== 'none');
        const li = mine.length ? mine.reduce((s, l) => s + l.v, 0) / mine.length : 0;
        const f = fit(p, F_.slots[i].pos);
        const b = li < BUCKETS[0] ? 0 : li < BUCKETS[1] ? 1 : li < BUCKETS[2] ? 2 : 3;
        return { chem: Math.min(10, TABLE[f][b] + LOYALTY), base: TABLE[f][b], fit: f, li, bucket: b, links: mine };
      });
      const total = Math.min(100, per.reduce((s, x) => s + (x ? x.chem : 0), 0));
      return { total, max: 100, per, links };
    }
    function explain(form, xi, i) {
      const c = calc(form, xi), x = c.per[i], p = xi[i]; if (!x) return '';
      const lines = x.links.map((l) => { const o = xi[l.i === i ? l.j : l.i]; return { color: l.color, who: o.name, why: [p.club === o.club && 'клуб', p.lg === o.lg && 'лига', p.nat === o.nat && 'сборная'].filter(Boolean).join(' + ') || 'ничего общего' }; });
      const b = x.bucket, row = TABLE[x.fit];
      const nb = row.findIndex((v, k) => k > b && Math.min(10, v + LOYALTY) > x.chem);
      const next = x.chem >= 10 ? 'Максимум.' : nb > 0 ? `Нужно больше общих связей (средняя сила ≥ ${BUCKETS[nb - 1]}).` : `Поставь на ${RU[p.pos[0]]} — там можно до 10.`;
      return { chem: x.chem, base: x.base, max: 10, fit: FIT_RU[x.fit], li: x.li, lines, next };
    }
    return { calc, explain, fit, link, TABLE, FIT_RU };
  })();

  // ---------- НОВАЯ химия (FIFA 23, базовые правила на запуске) ----------
  // Точно по «Pitch Notes: FIFA 23 FUT Chemistry Update»: 0–3 на игрока, связей нет, считаются только 11 основных,
  // игрок вне основной/альтернативной позиции получает 0 и не идёт в пороги. Пороги: клуб 2/4/7, сборная 2/5/8, лига 3/5/8.
  // Без тренеров, Icons и Heroes — их в нашей базе нет.
  const ChemNew = (() => {
    const TH = { club: [2, 4, 7], nat: [2, 5, 8], lg: [3, 5, 8] };
    const pts = (n, th) => th.filter((t) => n >= t).length;
    const onPos = (p, slotPos) => p.pos.includes(slotPos);
    function counts(form, xi) {
      const F_ = FORMATIONS[form], c = { club: {}, nat: {}, lg: {} };
      xi.forEach((p, i) => { if (p && onPos(p, F_.slots[i].pos)) ['club', 'nat', 'lg'].forEach((k) => { c[k][p[k]] = (c[k][p[k]] || 0) + 1; }); });
      return c;
    }
    function calc(form, xi) {
      const F_ = FORMATIONS[form], c = counts(form, xi);
      const per = xi.map((p, i) => {
        if (!p) return null;
        if (!onPos(p, F_.slots[i].pos)) return { chem: 0, onPos: false };
        const parts = { club: pts(c.club[p.club], TH.club), nat: pts(c.nat[p.nat], TH.nat), lg: pts(c.lg[p.lg], TH.lg) };
        return { chem: Math.min(3, parts.club + parts.nat + parts.lg), onPos: true, parts };
      });
      return { total: per.reduce((s, x) => s + (x ? x.chem : 0), 0), max: 33, per, counts: c };
    }
    const NAME = { club: 'клуб', nat: 'сборная', lg: 'лига' };
    function explain(form, xi, i) {
      const r = calc(form, xi), x = r.per[i], p = xi[i]; if (!x) return '';
      if (!x.onPos) return { chem: 0, max: 3, off: true, next: `${p.name} не играет на ${RU[FORMATIONS[form].slots[i].pos]} (его позиции: ${p.pos.map((q) => RU[q]).join(', ')}). Переставь на свою — тогда он получит химию и будет считаться в порогах.` };
      const rows = ['club', 'nat', 'lg'].map((k) => {
        const n = r.counts[k][p[k]] || 0, th = TH[k], got = pts(n, th), nx = th.find((t) => n < t);
        return { k, name: NAME[k], value: p[k], n, got, need: nx ? nx - n : 0, th };
      });
      return { chem: x.chem, max: 3, rows, next: x.chem >= 3 ? 'Максимум 3 достигнут.' : rows.filter((q) => q.need).map((q) => `${q.name} «${q.value}»: ещё ${q.need} — +1`).join('; ') };
    }
    return { calc, explain, onPos, TH, counts };
  })();

  const chem = (sys, form, xi) => (sys === 'classic' ? ChemClassic : ChemNew).calc(form, xi);
  // химия в долю 0…1 — для матча, чтобы 100 и 33 давали одинаковый эффект
  const chemShare = (sys, total) => Math.max(0, Math.min(1, total / (sys === 'classic' ? 100 : 33)));

  // ---------- рейтинг команды: формула рейтинга состава FUT, только 11 основных ----------
  // сумма рейтингов + «поправка» (у кого рейтинг выше среднего — прибавляем превышение), делим на 11, округляем вниз.
  // пока основа не полная — та же формула по уже взятым (на экране помечено «предв.»)
  function teamRating(xi) {
    const rs = xi.filter(Boolean).map((p) => p.r); if (!rs.length) return 0;
    const n = rs.length, sum = rs.reduce((a, b) => a + b, 0), avg = sum / n;
    const corr = rs.reduce((s, r) => s + Math.max(0, r - avg), 0);
    return Math.floor((sum + corr) / n);
  }

  // ---------- подбор кандидатов ----------
  // rnd — функция случайности (Math.random или с зерном), pool — все игроки, team — уже взятые (имена исключаются).
  function pickBand(bands, rnd) { let x = rnd() * bands.reduce((s, b) => s + b[2], 0); for (const b of bands) { x -= b[2]; if (x <= 0) return b; } return bands[0]; }
  function offer({ pool, team, slotPos, sys, rnd, bands = CFG.bands, n = CFG.offerSize, bench = false }) {
    const taken = new Set(team.filter(Boolean).map((p) => p.name));
    const fits = (p) => {
      if (bench || !slotPos) return true;
      if (sys === 'new') return p.pos.includes(slotPos);
      return p.pos[0] === slotPos;
    };
    const related = (p) => sys === 'classic' && slotPos && ChemClassic.fit(p, slotPos) === 'related';
    const out = [], used = new Set(taken);
    const take = (list) => { if (!list.length) return null; const p = list[Math.floor(rnd() * list.length)]; used.add(p.name); out.push(p); return p; };
    const free = (p) => !used.has(p.name);
    let guard = 0;
    while (out.length < n && guard++ < 60) {
      const band = pickBand(bands, rnd);
      let base = pool.filter((p) => free(p) && p.r >= band[0] && p.r <= band[1]);
      let cand = base.filter(fits);
      if (sys === 'classic' && !bench && rnd() < CFG.classicRelatedChance) { const rel = base.filter(related); if (rel.length) cand = rel; }
      // «под химию»: общий клуб/лига/сборная с кем-то из уже взятых
      if (team.some(Boolean) && rnd() < CFG.linkChance) {
        const kind = pickBand(CFG.linkKinds.map(([k, w]) => [k, k, w]), rnd)[0];
        const vals = new Set(team.filter(Boolean).map((p) => p[kind]));
        const linked = pool.filter((p) => free(p) && fits(p) && vals.has(p[kind]));
        if (linked.length) { take(linked); continue; }
      }
      if (!cand.length) cand = pool.filter((p) => free(p) && fits(p)); // в коридоре пусто — любой подходящий
      if (!take(cand)) break; // подходящих совсем нет — подборка будет короче, без дублей и выдумок
    }
    return out;
  }
  function captains({ pool, form, sys, rnd }) {
    const slots = FORMATIONS[form].slots.map((s) => s.pos);
    const ok = (p) => slots.some((s) => (sys === 'new' ? p.pos.includes(s) : p.pos[0] === s));
    const list = pool.filter(ok);
    return offer({ pool: list, team: [], slotPos: null, sys, rnd, bands: CFG.captainBands, bench: true });
  }

  // ---------- матч ----------
  // Сила линий из характеристик FC (скорость, удар, пас, дриблинг, защита, физика; у вратарей — свои 6).
  const FIT_MUL = { perfect: 1, related: 0.95, unrelated: 0.88, wrong: 0.75 };
  function lines(sys, form, xi, chemTotal) {
    const F_ = FORMATIONS[form];
    const m = 1 - CFG.match.chemSwing * (1 - chemShare(sys, chemTotal));
    const acc = { att: [0, 0], mid: [0, 0], def: [0, 0] };
    let gk = 35;
    xi.forEach((p, i) => {
      if (!p) return;
      const pos = F_.slots[i].pos, st = p.st || [p.r, p.r, p.r, p.r, p.r, p.r];
      const fm = sys === 'classic' ? FIT_MUL[ChemClassic.fit(p, pos)] : (p.pos.includes(pos) ? 1 : 0.8);
      if (pos === 'GK') { gk = p.pos[0] === 'GK' ? (st[0] + st[1] + st[3] + st[5]) / 4 * fm : 35; return; }
      const [pac, sho, pas, dri, def, phy] = st;
      const a = (0.42 * sho + 0.3 * dri + 0.28 * pac) * fm, md = (0.45 * pas + 0.35 * dri + 0.2 * phy) * fm, d = (0.6 * def + 0.25 * phy + 0.15 * pac) * fm;
      const w = { ST: [1, 0.2, 0], LW: [1, 0.3, 0], RW: [1, 0.3, 0], CAM: [0.7, 0.8, 0], LM: [0.5, 0.8, 0.2], RM: [0.5, 0.8, 0.2], CM: [0.2, 1, 0.4], CDM: [0, 0.8, 0.8], LB: [0.1, 0.2, 1], RB: [0.1, 0.2, 1], CB: [0, 0.1, 1] }[pos] || [0.3, 0.3, 0.3];
      acc.att[0] += a * w[0]; acc.att[1] += w[0]; acc.mid[0] += md * w[1]; acc.mid[1] += w[1]; acc.def[0] += d * w[2]; acc.def[1] += w[2];
    });
    const avg = (x) => (x[1] ? x[0] / x[1] : 40);
    return { att: avg(acc.att) * m, mid: avg(acc.mid) * m, def: avg(acc.def) * m, gk: gk * m };
  }
  // генератор случайных чисел с зерном: у обоих участников онлайн-матча (и у сервера) — одна и та же последовательность
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // состояние матча восстанавливается из зерна и истории тактик — так переживает перезапуск и годится для сервера
  function matchNew(home, away, seed) { return { seed, min: 0, score: [0, 0], ev: [], tacHist: [], stats: { ch: [0, 0], sh: [0, 0], on: [0, 0] }, home, away, over: false }; }
  function matchStep(M, tac) {
    if (M.over) return [];
    const C = CFG.match, R = rng((M.seed + M.min * 7919) >>> 0), L = [M.home.lines, M.away.lines], out = [];
    M.tacHist.push(tac.slice());
    const minute = M.min + C.stepMin;
    for (const s of [0, 1]) {
      const o = 1 - s, A = L[s], D = L[o];
      const share = (A.mid * A.mid) / (A.mid * A.mid + D.mid * D.mid);
      const p = C.baseChance * share * 2 * Math.pow(A.att / D.def, 2) * C.tAtt[tac[s]] * C.tExp[tac[o]];
      if (R() < p) {
        M.stats.ch[s]++; M.stats.sh[s]++;
        const on = R() < C.onTarget;
        if (!on) { out.push({ m: minute, s, t: 'miss' }); continue; }
        M.stats.on[s]++;
        const g = Math.max(0.15, Math.min(0.6, C.goalBase * (A.att / D.gk)));
        if (R() < g) { M.score[s]++; out.push({ m: minute, s, t: 'goal' }); } else out.push({ m: minute, s, t: 'save' });
      }
    }
    M.min = minute; M.ev.push(...out);
    if (M.min >= C.minutes) M.over = true;
    return out;
  }

  // ---------- боты ----------
  const BOTS = {
    easy: { name: 'Новичок', bands: [[70, 74, 0.6], [75, 78, 0.4]], chem: 0.2, react: 30 },
    normal: { name: 'Любитель', bands: [[74, 78, 0.5], [79, 82, 0.5]], chem: 0.5, react: 15 },
    hard: { name: 'Профи', bands: [[79, 83, 0.5], [84, 90, 0.5]], chem: 0.85, react: 10 },
  };
  // состав бота: те же правила — реальные игроки базы на подходящих позициях; сложность — в рейтинге и химии
  function botTeam(level, pool, sys, rnd) {
    const B = BOTS[level], forms = Object.keys(FORMATIONS), form = forms[Math.floor(rnd() * forms.length)];
    const xi = Array(11).fill(null);
    // «ядро» химии: лига, из которой бот старается брать игроков
    const lgs = ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'Лига 1'], core = lgs[Math.floor(rnd() * lgs.length)];
    FORMATIONS[form].slots.forEach((sl, i) => {
      const band = pickBand(B.bands, rnd), team = xi.filter(Boolean);
      const ok = (p) => p.pos[0] === sl.pos && !team.some((t) => t.name === p.name) && p.r >= band[0] && p.r <= band[1];
      let list = pool.filter(ok);
      if (rnd() < B.chem) { const c = list.filter((p) => p.lg === core); if (c.length) list = c; }
      if (!list.length) list = pool.filter((p) => p.pos[0] === sl.pos && !team.some((t) => t.name === p.name));
      xi[i] = list[Math.floor(rnd() * list.length)] || null;
    });
    return { form, xi, level };
  }
  // тактика бота: решает только на своих «проверках» (раз в react минут), знает лишь счёт и минуту
  function botTactic(level, M, side, cur) {
    const B = BOTS[level]; if (M.min % B.react !== 0) return cur;
    const diff = M.score[side] - M.score[1 - side], m = M.min;
    if (level === 'easy') return diff < 0 && m >= 70 ? 3 : 2;
    if (diff < 0) return m >= 80 ? 4 : m >= 60 ? 3 : 2;
    if (diff > 0) return m >= 75 ? (diff >= 2 && level === 'hard' ? 0 : 1) : 2;
    return level === 'hard' && m >= 80 ? 3 : 2;
  }

  root.XD = { CFG, TACTICS, RU, FORMATIONS, BENCH, ChemClassic, ChemNew, chem, chemShare, teamRating, offer, captains, lines, rng, matchNew, matchStep, BOTS, botTeam, botTactic };
})(typeof window !== 'undefined' ? window : globalThis);
