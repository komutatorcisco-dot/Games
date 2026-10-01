// Иконки игр на главной: маленькие картинки из SVG, эмблем клубов и лиц игроков.
'use strict';

const Icons = (() => {
  const svg = (body) => `<svg viewBox="0 0 56 56" aria-hidden="true">${body}</svg>`;
  const face = (id, cls = '') => `<img class="ic-face ${cls}" src="img/players/${id}.webp" alt="" loading="lazy">`;
  const crest = (f, cls = '') => `<img class="ic-crest ${cls}" src="img/clubs/${f}.webp" alt="" loading="lazy">`;
  const dome = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#icg)"/>`;
  const gloss = '<defs><radialGradient id="icg" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>';

  const MAP = {
    sort: svg(gloss + [10, 25, 40].map((x) => `<rect x="${x - 6}" y="9" width="12" height="40" rx="6" fill="rgba(255,255,255,.18)" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>`).join('')
      + dome(10, 42, 4.6, '#2f6fe4') + dome(10, 32.5, 4.6, '#ffcf3a') + dome(25, 42, 4.6, '#ffcf3a') + dome(25, 32.5, 4.6, '#2f6fe4') + dome(25, 23, 4.6, '#e2384d')
      + dome(40, 42, 4.6, '#e2384d') + dome(40, 32.5, 4.6, '#e2384d')),
    pipes: svg(gloss + '<path d="M12 42 C12 26, 28 34, 28 22 S44 18, 44 12" fill="none" stroke="#fff" stroke-width="3.5" stroke-dasharray="1 6" stroke-linecap="round"/>'
      + dome(12, 43, 6, '#8fd8c4') + dome(28, 23, 6, '#8fd8c4') + dome(44, 12, 6, '#ffcf3a')
      + '<path d="M37 14 l5 -2 -2 5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    flood: svg(['#e2384d', '#e2384d', '#ffcf3a', '#2f6fe4', '#e2384d', '#ffcf3a', '#ffcf3a', '#2f6fe4', '#34c46a', '#ffcf3a', '#2f6fe4', '#2f6fe4', '#34c46a', '#34c46a', '#e2384d', '#2f6fe4']
      .map((c, i) => `<rect x="${7 + (i % 4) * 10.7}" y="${7 + Math.floor(i / 4) * 10.7}" width="10.2" height="10.2" rx="2.5" fill="${c}" stroke="rgba(0,0,0,.18)"/>`).join('')
      + '<path d="M44 40 l6 6" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="41" cy="37" r="5" fill="#fff"/><circle cx="41" cy="37" r="3" fill="#e2384d"/>'),
    slide: `<span class="ic-slide">${crest('real-madrid')}<i></i></span>`,
    memory: `<span class="ic-card back"></span><span class="ic-card front">${face(158023)}</span>`,
    words: svg('ГОЛМАЯКБУ'.split('').map((ch, i) => {
      const x = 9 + (i % 3) * 13, y = 9 + Math.floor(i / 3) * 13, on = i < 3;
      return `<rect x="${x}" y="${y}" width="12" height="12" rx="3" fill="${on ? '#ffcf3a' : 'rgba(255,255,255,.22)'}"/>
        <text x="${x + 6}" y="${y + 9.2}" text-anchor="middle" font-size="9" font-weight="800" fill="${on ? '#2a1d00' : '#fff'}">${ch}</text>`;
    }).join('') + '<rect x="7" y="7" width="40" height="16" rx="7" fill="none" stroke="#fff" stroke-width="2"/>'),
    g2048: '<span class="ic-2048"><b>2048</b><small>★</small></span>',
    popit: svg(gloss + '<rect x="6" y="6" width="44" height="44" rx="12" fill="rgba(255,255,255,.18)"/>'
      + [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => dome(15 + (i % 3) * 13, 15 + Math.floor(i / 3) * 13, 5.4, ['#e2384d', '#ff8a2a', '#ffcf3a'][Math.floor(i / 3)])).join('')
      + '<circle cx="28" cy="28" r="5.4" fill="rgba(0,0,0,.35)"/>'),
    guess: `${face(231747, 'dim')}<b class="ic-q">?</b>`,
    career: `<span class="ic-path">${crest('sporting', 'c1')}${crest('manchester-yunayted', 'c2')}${crest('real-madrid', 'c3')}</span>`
      + svg('<path d="M15 41 Q22 34 27 30 M31 25 Q36 20 41 16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 4"/>'),
    club: `${crest('bavariya', 'blur')}<b class="ic-q">?</b>`,
    transfer: `${crest('benfika', 'from')}${crest('atletiko', 'to')}`
      + svg('<path d="M20 30 H36 m-5 -5 l5 5 -5 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 1px 1px rgba(0,0,0,.5))"/>'),
    hl: svg('<path d="M10 22 L26 8 H44 a3 3 0 0 1 3 3 V29 L31 45 a3 3 0 0 1 -4 0 L10 28 a4 4 0 0 1 0 -6z" fill="#fff"/><circle cx="39" cy="15" r="3" fill="#ff7a59"/>'
      + '<text x="26" y="34" text-anchor="middle" font-size="15" font-weight="900" fill="#c2412a">€</text>'
      + '<path d="M44 38 l4 -6 4 6z" fill="#34c46a"/><path d="M44 42 l4 6 4 -6z" fill="#e2384d"/>'),
    fc: `<span class="ic-fut"><b>91</b><small>ST</small>${face(239085)}</span>`,
    value: `${face(239085, 'big')}<span class="ic-coin">€</span>`,
    ttt: svg('<path d="M21 8 V48 M35 8 V48 M8 21 H48 M8 35 H48" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/>'
      + '<path d="M10 10 l8 8 m0 -8 l-8 8" stroke="#ffcf3a" stroke-width="3" stroke-linecap="round"/><circle cx="42" cy="42" r="4.5" fill="none" stroke="#8fd8c4" stroke-width="3"/>'
      + '<path d="M38 24 l8 8 m0 -8 l-8 8" stroke="#ffcf3a" stroke-width="3" stroke-linecap="round"/>') + crest('barselona', 'mid'),
    'guess-duel': `${face(158023, 'l')}${face(20801, 'r')}<b class="ic-vs">VS</b>`,
    'career-duel': `${crest('barselona', 'l')}${crest('real-madrid', 'r')}<b class="ic-vs">VS</b>`,
    nation: svg('<rect x="5" y="5" width="46" height="46" rx="6" fill="#34c46a" stroke="#fff" stroke-width="2"/><path d="M5 28 H51 M20 5 v8 h16 v-8" stroke="rgba(255,255,255,.7)" stroke-width="1.5" fill="none"/><circle cx="28" cy="28" r="6" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>')
      + crest('bavariya', 'n1') + crest('real-madrid', 'n2') + crest('liverpul', 'n3') + crest('pszh', 'n4') + '<span class="ic-flag">🏳️</span>',
    pick: `${face(10535, 'l')}${face(41, 'r')}<b class="ic-vs">?</b>`,
    'pick-duo': `${face(45661, 'l')}${face(13743, 'r')}<b class="ic-vs">VS</b>`,
    'ttt-duo': svg('<path d="M12 12 l13 13 m0 -13 l-13 13" stroke="#1b1240" stroke-width="5" stroke-linecap="round"/><circle cx="37" cy="37" r="8" fill="none" stroke="#fff" stroke-width="5"/>'),
  };

  const get = (id) => MAP[id] || '';
  // Подставляет картинки во все <span class="tile-ico" data-ico="...">
  function fill(root = document) {
    $$('[data-ico]', root).forEach((el) => { if (!el.dataset.done) { el.innerHTML = get(el.dataset.ico); el.dataset.done = 1; } });
  }
  return { get, fill };
})();
