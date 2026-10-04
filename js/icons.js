// Иконки игр: единый набор рисунков SVG 56×56. Белая фигура + золотой акцент на цветном фоне плитки,
// одинаковая толщина линий, без эмодзи и фото (эмодзи на iPhone и Android выглядят по-разному).
'use strict';

const Icons = (() => {
  const W = '#fff', G = '#ffcf3a', D = '#1b1340', F = 'rgba(255,255,255,.32)';
  const svg = (body) => `<svg viewBox="0 0 56 56" aria-hidden="true">${body}</svg>`;
  const ln = (d, c = W, w = 3.2, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const ci = (x, y, r, c = W, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${extra}/>`;
  const rc = (x, y, w, h, r, c = W, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${extra}/>`;
  const tx = (x, y, s, t, c = D, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${s}" fill="${c}" class="ic-t" ${extra}>${t}</text>`;
  // мяч: белый круг с пятиугольником
  const ball = (x, y, r, c = W, p = D) => {
    const pt = (k, rr) => { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; };
    const pent = [0, 1, 2, 3, 4].map((k) => pt(k, r * 0.42)).join(' ');
    const spokes = [0, 1, 2, 3, 4].map((k) => `M${pt(k, r * 0.42)} L${pt(k, r * 0.92)}`).join(' ');
    return `${ci(x, y, r, c)}<polygon points="${pent}" fill="${p}"/><path d="${spokes}" stroke="${p}" stroke-width="${Math.max(1, r * 0.12)}" fill="none"/>`;
  };
  // силуэт игрока (голова + плечи)
  const person = (x, y, s = 1, c = W) => `<g transform="translate(${x} ${y}) scale(${s})">${ci(0, -9, 7, c)}<path d="M-13 12 C-13 2 -7 -1 0 -1 C7 -1 13 2 13 12 Z" fill="${c}"/></g>`;
  const star = (x, y, r, c = G) => {
    const p = [...Array(10).keys()].map((k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
    return `<polygon points="${p}" fill="${c}"/>`;
  };
  const shirt = (x, y, s, c = W) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-8 -14 L-3 -14 C-2 -11 2 -11 3 -14 L8 -14 L16 -8 L12 -1 L9 -3 L9 14 L-9 14 L-9 -3 L-12 -1 L-16 -8 Z" fill="${c}" stroke-linejoin="round"/>`;
  const card = (x, y, w, h, rot, c = W) => `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">${rc(x, y, w, h, 4, c)}</g>`;
  const grid3 = (x, y, size, gap, fill) => [...Array(9).keys()].map((i) => rc(x + (i % 3) * (size + gap), y + Math.floor(i / 3) * (size + gap), size, size, 2.5, fill(i))).join('');
  const shield = (c = W) => `<path d="M28 7 L45 13 C45 30 39 42 28 49 C17 42 11 30 11 13 Z" fill="${c}"/>`;

  const MAP = {
    // ---------- головоломки ----------
    sort: svg(rc(12, 9, 13, 38, 6.5, 'none', `stroke="${W}" stroke-width="3"`) + rc(31, 9, 13, 38, 6.5, 'none', `stroke="${W}" stroke-width="3"`)
      + ci(18.5, 40, 4.6, G) + ci(18.5, 30.5, 4.6, W) + ci(18.5, 21, 4.6, G) + ci(37.5, 40, 4.6, W) + ci(37.5, 30.5, 4.6, G)),
    pipes: svg(ln('M11 43 C22 43 18 27 29 27 S38 13 45 13', W, 3.2, 'stroke-dasharray="0.1 6.5"') + ci(11, 43, 4.5) + ci(29, 27, 4.5) + ball(43, 14, 7.5, G)),
    flood: svg(grid3(10, 10, 10.5, 2.5, (i) => ([0, 1, 3, 4, 6].includes(i) ? G : F))
      + `<path d="M40 30 C40 30 47 38 47 42 A7 7 0 0 1 33 42 C33 38 40 30 40 30 Z" fill="${W}" stroke="${D}" stroke-width="1.5"/>`),
    slide: svg(grid3(10, 10, 10.5, 2.5, (i) => (i === 8 ? 'none' : i === 5 ? G : W)) + ln('M40 46 L40 39 M36.5 42.5 L40 46 L43.5 42.5', G, 2.8)),
    memory: svg(card(9, 11, 21, 30, -12, F) + `<g transform="rotate(-12 19.5 26)">${ln('M12 15 L27 37 M27 15 L12 37', W, 1.5, 'opacity=".6"')}</g>`
      + card(25, 14, 22, 31, 9, W) + `<g transform="rotate(9 36 29.5)">${star(36, 29.5, 7.5)}</g>`),
    words: svg(grid3(9, 9, 11, 2.5, (i) => (i < 3 ? G : F)) + tx(14.5, 18.6, 9, 'Г') + tx(28, 18.6, 9, 'О') + tx(41.5, 18.6, 9, 'Л')
      + tx(14.5, 32.1, 8, 'М', W) + tx(28, 32.1, 8, 'Я', W) + tx(41.5, 45.6, 8, 'Ч', W)),
    g2048: svg(rc(8, 8, 18, 18, 4, F) + rc(30, 8, 18, 18, 4, F) + rc(8, 30, 18, 18, 4, F) + rc(19, 19, 30, 30, 6, G) + tx(34, 38, 11, '2048')),
    popit: svg([...Array(9).keys()].map((i) => { const x = 15 + (i % 3) * 13, y = 15 + Math.floor(i / 3) * 13, on = i === 1 || i === 5 || i === 6;
      return ci(x, y, 5.6, on ? G : W) + ci(x - 1.6, y - 1.6, 1.8, on ? 'rgba(255,255,255,.75)' : 'rgba(27,19,64,.18)'); }).join('')),
    pass: svg(ln('M9 44 L9 14 L47 14 L47 44', W, 3.2) + ln('M15 14 L15 44 M21 14 L21 44 M27 14 L27 44 M33 14 L33 44 M39 14 L39 44 M9 21 L47 21 M9 28 L47 28 M9 35 L47 35', W, 1, 'opacity=".45"') + ball(33, 33, 9, G)),

    // ---------- угадайки ----------
    guess: svg(person(26, 32, 1.25) + ci(42, 14, 9, G) + tx(42, 19, 13, '?')),
    career: svg(ln('M9 44 L20 34 L30 38 L44 17', W, 3.4) + ln('M37 16 L44 17 L45 24', W, 3.4) + ci(9, 44, 4.5, W) + ci(20, 34, 4.5, W) + ci(30, 38, 4.5, W) + star(44, 17, 7)),
    club: svg(shield(W) + `<path d="M28 13 L39 17 C39 29 35 37 28 42 C21 37 17 29 17 17 Z" fill="${G}"/>` + tx(28, 35, 17, '?')),
    transfer: svg(shirt(19, 28, 0.95, W) + ln('M30 18 C40 14 46 20 45 30', G, 3.4) + ln('M39 27 L45 31 L49 25', G, 3.4) + shirt(41, 41, 0.42, G)),
    hl: svg(`<path d="M17 8 L28 22 L21 22 L21 30 L13 30 L13 22 L6 22 Z" fill="${G}" transform="translate(4 2)"/>` + `<path d="M39 48 L28 34 L35 34 L35 26 L43 26 L43 34 L50 34 Z" fill="${W}" transform="translate(-4 -2)"/>`
      + ci(40, 15, 8, F) + tx(40, 19.5, 12, '€', W)),
    fc: svg(`<path d="M15 7 L41 7 L44 12 L44 42 C44 46 34 50 28 51 C22 50 12 46 12 42 L12 12 Z" fill="${G}"/>` + tx(21.5, 21, 12, '91') + `<g opacity=".9">${person(32, 36, 0.62, D)}</g>`
      + rc(16, 25, 10, 2, 1, D, 'opacity=".5"')),
    value: svg([0, 1, 2, 3].map((k) => `<ellipse cx="22" cy="${42 - k * 6}" rx="13" ry="5" fill="${k === 3 ? G : W}" stroke="${D}" stroke-width="1.2" stroke-opacity=".25"/>`).join('')
      + ci(39, 19, 10, G) + tx(39, 24, 14, '€')),
    ttt: svg(ln('M22 9 L22 47 M34 9 L34 47 M9 22 L47 22 M9 34 L47 34', W, 3) + ln('M11 11 L19 19 M19 11 L11 19', G, 3.4) + ci(40, 40, 4.6, 'none', `stroke="${G}" stroke-width="3.2"`)
      + ln('M24 37 L32 45 M32 37 L24 45', W, 3.4, 'opacity=".9"')),
    nation: svg(ln('M14 8 L14 49', W, 3.4) + `<path d="M15 10 C24 6 30 15 44 10 L44 30 C30 35 24 26 15 30 Z" fill="${G}"/>` + `<path d="M15 17 C24 13 30 22 44 17 L44 23 C30 28 24 19 15 23 Z" fill="${W}"/>`),
    pick: svg(ln('M28 10 L28 45 M16 45 L40 45 M10 18 L46 18', W, 3.2) + `<path d="M10 18 L4 31 A7 4 0 0 0 16 31 Z M46 18 L40 31 A7 4 0 0 0 52 31 Z" fill="${W}" opacity=".9"/>`
      + `<path d="M22 12 L24 6 L28 10 L32 6 L34 12 Z" fill="${G}"/>`),
    'pick-duo': svg(card(8, 12, 19, 27, -10, W) + card(29, 12, 19, 27, 10, G) + person(17.5, 27, 0.55, D) + person(38.5, 27, 0.55, D)
      + ln('M18 46 C24 50 32 50 38 46', W, 2.6) + ln('M34 44 L38 46 L37 50', W, 2.6)),
    'ttt-duo': svg(ln('M22 9 L22 47 M34 9 L34 47 M9 22 L47 22 M9 34 L47 34', W, 3) + ln('M11 11 L19 19 M19 11 L11 19', G, 3.4) + ci(28, 28, 4.4, 'none', `stroke="${W}" stroke-width="3.2"`)
      + ln('M37 37 L45 45 M45 37 L37 45', G, 3.4) + ci(16, 40, 4.4, 'none', `stroke="${W}" stroke-width="3.2"`)),
    'guess-duel': svg(person(15, 34, 0.95, W) + person(41, 34, 0.95, G) + ci(28, 13, 7.5, W) + tx(28, 17.5, 12, '?')),
    'career-duel': svg(ln('M8 44 L19 32 L28 36 L46 12', W, 3.2) + ln('M8 30 L20 38 L32 24 L46 30', G, 3.2) + star(46, 12, 6, W) + ci(46, 30, 4.5, G)),

    // ---------- ежедневные ----------
    'ng-lineup': svg(rc(9, 7, 38, 42, 6, 'none', `stroke="${W}" stroke-width="2.6"`) + ln('M9 28 L47 28', W, 1.6, 'opacity=".6"') + ci(28, 28, 5, 'none', `stroke="${W}" stroke-width="1.6" opacity=".6"`)
      + [[28, 44], [16, 37], [24, 38], [32, 38], [40, 37], [18, 25], [28, 23], [38, 25], [17, 14], [28, 12], [39, 14]].map(([x, y], i) => ci(x, y, 3, i === 0 ? W : G)).join('')),
    'ng-wordle': svg(rc(7, 15, 12.5, 13, 3, '#34c46a') + rc(21.75, 15, 12.5, 13, 3, G) + rc(36.5, 15, 12.5, 13, 3, F) + tx(13.25, 25, 9.5, 'Г', W) + tx(28, 25, 9.5, 'О') + tx(42.75, 25, 9.5, 'Л', W)
      + rc(7, 31, 12.5, 11, 3, 'none', `stroke="${W}" stroke-width="1.6" opacity=".6"`) + rc(21.75, 31, 12.5, 11, 3, 'none', `stroke="${W}" stroke-width="1.6" opacity=".6"`) + rc(36.5, 31, 12.5, 11, 3, 'none', `stroke="${W}" stroke-width="1.6" opacity=".6"`)),
    'ng-treble': svg([[15, 36, 0.62, W], [41, 36, 0.62, W], [28, 30, 0.85, G]].map(([x, y, s, c]) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-12 -18 L12 -18 L11 -6 C10 2 4 6 0 6 C-4 6 -10 2 -11 -6 Z" fill="${c}"/>`
      + `<path d="M-12 -14 C-20 -14 -19 -3 -10 -2 M12 -14 C20 -14 19 -3 10 -2" fill="none" stroke="${c}" stroke-width="3"/>${rc(-3, 5, 6, 8, 1, c)}${rc(-8, 12, 16, 5, 2, c)}</g>`).join('')),
    'ng-false9': svg(tx(25, 44, 40, '9', W) + ci(41, 15, 9, '#ff5a6a') + ln('M37 11 L45 19 M45 11 L37 19', W, 3)),
    'ng-connect': svg(rc(8, 8, 18, 18, 5, G) + rc(30, 8, 18, 18, 5, W) + rc(8, 30, 18, 18, 5, W) + rc(30, 30, 18, 18, 5, G) + ci(17, 17, 3, D, 'opacity=".55"') + ci(39, 39, 3, D, 'opacity=".55"')),
    'ng-top10': svg([0, 1, 2, 3].map((k) => ci(11, 13 + k * 10, 2.6, W) + rc(17, 11 + k * 10, k === 0 ? 18 : 22 - k * 3, 4.5, 2.2, W, 'opacity=".85"')).join('') + ci(41, 37, 11, G) + tx(41, 42, 13, '10')),
    'ng-context': svg(rc(22, 7, 12, 31, 6, W) + ci(28, 41, 9, W) + rc(25.5, 18, 5, 22, 2.5, '#ff5a3c') + ci(28, 41, 6, '#ff5a3c')
      + ln('M38 12 L43 12 M38 19 L43 19 M38 26 L43 26', W, 2.4) + `<path d="M12 17 L15 12 L18 17 Z" fill="${G}"/>` + ln('M15 17 L15 27', G, 2.4)),
    'ng-whoami': svg(person(28, 34, 1.3) + `<path d="M15 22 C19 18 24 20 28 22 C32 20 37 18 41 22 C40 27 35 29 31 26 C30 25 26 25 25 26 C21 29 16 27 15 22 Z" fill="${G}"/>`
      + ci(21.5, 22.8, 1.8, D) + ci(34.5, 22.8, 1.8, D)),
    'ng-linkup': svg(`<g transform="rotate(-40 28 28)">${rc(9, 21, 22, 14, 7, 'none', `stroke="${W}" stroke-width="4"`)}${rc(25, 21, 22, 14, 7, 'none', `stroke="${G}" stroke-width="4"`)}</g>`),
    'ng-rank': svg(rc(20, 18, 16, 30, 3, G) + rc(5, 28, 15, 20, 3, W) + rc(36, 33, 15, 15, 3, W, 'opacity=".8"') + tx(28, 32, 12, '1') + tx(12.5, 41, 10, '2') + tx(43.5, 44, 9, '3') + star(28, 10, 6, W)),
    'ng-box2box': svg(grid3(7, 13, 9.5, 2.5, () => F) + ci(39, 33, 12, W) + ln('M39 33 L39 26 M39 33 L44 36', D, 2.6) + rc(36, 17, 6, 4, 1.5, W) + ln('M48 24 L50 22', W, 2.6)),
    'ng-bingo': svg(rc(7, 7, 42, 42, 7, W) + [...Array(16).keys()].map((i) => { const x = 14 + (i % 4) * 9.5, y = 14 + Math.floor(i / 4) * 9.5, on = i % 5 === 0;
      return ci(x, y, 3.4, on ? G : 'rgba(27,19,64,.18)', on ? `stroke="${D}" stroke-width="1"` : ''); }).join('') + ln('M14 14 L42.5 42.5', D, 2, 'opacity=".55"')),
    'ng-draft': svg(rc(7, 7, 42, 42, 7, 'none', `stroke="${W}" stroke-width="2.4" opacity=".7"`) + ln('M14 40 L22 30 L28 42 L34 30 L42 40 M22 30 L28 20 L34 30 M28 20 L18 13 M28 20 L38 13', G, 2)
      + [[14, 40], [28, 42], [42, 40], [22, 30], [34, 30], [28, 20], [18, 13], [38, 13]].map(([x, y]) => ci(x, y, 3.6, W)).join('')),
    'ng-trumps': svg(card(8, 13, 20, 29, -16, F) + card(18, 10, 20, 29, -4, W) + card(28, 12, 20, 29, 10, G) + `<g transform="rotate(10 38 26.5)">${tx(33.5, 22, 8, '88')}${person(38, 32, 0.45, D)}</g>`),
    'ng-vs100': svg([...Array(25).keys()].map((i) => (i === 12 ? '' : ci(10 + (i % 5) * 9, 10 + Math.floor(i / 5) * 9, 3, F))).join('') + ci(28, 28, 7.5, G) + ci(28, 25.5, 2.6, D) + `<path d="M23.5 32 C24 29 32 29 32.5 32 Z" fill="${D}"/>`),
    'ng-darts': svg(ci(25, 31, 18, W) + ci(25, 31, 13, '#e2384d') + ci(25, 31, 8.5, W) + ci(25, 31, 4, '#e2384d')
      + ln('M27 29 L44 12', D, 3) + `<path d="M44 12 L41 6 L47 8 L50 5 L49 11 L50 15 L45 14 Z" fill="${G}"/>`),

    // ---------- история ----------
    'ng-score': svg(rc(6, 13, 44, 30, 7, D) + rc(6, 13, 44, 30, 7, 'none', `stroke="${W}" stroke-width="2.6"`) + tx(19, 37, 19, '2', G) + tx(37, 37, 19, '1', G) + ci(28, 24, 1.8, W) + ci(28, 32, 1.8, W)),
    'ng-numhist': svg(shirt(28, 29, 1.25, W) + tx(28, 39, 15, '10', D) + ci(44, 12, 7, G) + ln('M44 8.5 L44 12 L46.5 13.5', D, 1.8)),
    // часы и золотая стрелка «назад во времени» вокруг них
    'ng-timemachine': svg(ci(30, 30, 14, W) + ln('M30 22 L30 30 L36 33', D, 3) + ln('M10.5 25 A20 20 0 1 1 15 43', G, 3.6) + `<path d="M4.5 22 L11 31 L16.5 22.5 Z" fill="${G}"/>`),
    'ng-replay': svg(rc(6, 10, 44, 36, 6, 'none', `stroke="${W}" stroke-width="2.4" opacity=".7"`) + ln('M28 10 L28 46', W, 1.4, 'opacity=".5"') + ln('M11 38 L22 29 L30 34 L42 22', G, 2.8, 'stroke-dasharray="4 3"')
      + ci(11, 38, 3, W) + ci(22, 29, 3, W) + ci(30, 34, 3, W) + ball(43, 21, 5.5)),
    'ng-duel': svg(person(13, 36, 0.78, W) + person(43, 36, 0.78, W) + `<path d="M31 6 L20 29 L28 29 L24 49 L37 23 L29 23 Z" fill="${G}"/>`),
    auction: svg(`<g transform="rotate(-35 26 22)">${rc(14, 12, 24, 11, 3, W)}${rc(24, 23, 4, 20, 2, W)}</g>` + rc(8, 42, 24, 6, 3, G) + rc(11, 37, 18, 5, 2, G) + ln('M37 37 L45 37 M38 31 L45 27 M38 43 L45 47', W, 2.6)),
  };
  // старые ключи плиток
  MAP.ng = MAP['ng-duel'];

  const get = (id) => MAP[id] || '';
  // Подставляет картинки во все <span class="tile-ico" data-ico="...">
  function fill(root = document) {
    $$('[data-ico]', root).forEach((el) => { if (!el.dataset.done) { el.innerHTML = get(el.dataset.ico); el.dataset.done = 1; } });
  }
  return { get, fill };
})();
