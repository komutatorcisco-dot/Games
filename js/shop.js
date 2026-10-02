// Магазин: запасные жизни, паки испытаний для головоломок и косметика (рамки, темы карточек, мячи в Сортировке).
'use strict';

const Shop = (() => {
  const LIFE_COST = 50, PACK_COST = 250;
  const FRAMES = [
    ['none', 'Без рамки', 0], ['gold', 'Золото', 400], ['fire', 'Огонь', 600],
    ['neon', 'Неон', 600], ['rainbow', 'Радуга', 900], ['diamond', 'Алмаз', 1500], ['sponsor', 'Спонсор', -1],
  ];
  const CARDS = [
    ['classic', 'Классика', 0], ['night', 'Ночной матч', 400], ['grass', 'Газон', 400],
    ['retro', 'Ретро', 600], ['gold', 'Золотой мяч', 1000],
  ];
  const BALLS = [
    ['classic', 'Классика', 0], ['gloss', 'Глянец', 300], ['ball', 'Футбольные', 500], ['crests', 'Эмблемы клубов', 900],
  ];
  // Эмблемы для мячей: по клубу на каждый цвет KIT (красный, синий, белый, жёлтый, зелёный, фиолетовый, оранжевый, голубой, чёрный, розовый)
  const BALL_CLUBS = ['Ливерпуль', 'Челси', 'Реал Мадрид', 'Боруссия Дортмунд', 'Селтик', 'Фиорентина', 'Шахтёр', 'Манчестер Сити', 'Ювентус', 'Палермо'];

  const S = () => Store.d.shop;
  const owned = (kind, id, price) => price === 0 || !!S().owned[`${kind}:${id}`];
  // рамка «Спонсор» не продаётся за монеты


  // ---------- применение косметики ----------
  function apply() {
    const b = document.body.dataset;
    b.cards = S().cards; b.balls = S().balls;
    $$('.frame-host').forEach((el) => { el.dataset.frame = S().frame; });
  }
  const ballStyle = (c) => (S().balls === 'crests' && CRESTS[BALL_CLUBS[c]] ? `;--k:url('${crestSrc(CRESTS[BALL_CLUBS[c]])}')` : '');

  // ---------- запасная жизнь ----------
  // Предлагаем продолжить: своей жизнью или купить. onUse — продолжить игру, onNo — закончить.
  function offerLife(title, text, onUse, onNo) {
    const n = S().lives;
    const use = () => { S().lives--; Store.save(); Sound.play('coin'); onUse(); };
    Modal.open(
      `<h2>${title}</h2><p>${text}</p><p class="muted">Запасных жизней: <b>${n}</b></p>`,
      [
        n > 0
          ? { label: `❤ Использовать жизнь (${n})`, onClick: use }
          : { label: `❤ Купить жизнь и продолжить · ${LIFE_COST}`, onClick: () => { if (Coins.spend(LIFE_COST)) { S().lives++; use(); } else onNo(); } },
        { label: 'Закончить', cls: 'ghost', onClick: onNo },
      ],
    );
  }

  // ---------- экран ----------
  function item(kind, id, name, price, preview, on) {
    const have = owned(kind, id, price);
    const btn = on ? '<span class="shop-on">Выбрано</span>'
      : have ? `<button class="btn ghost" data-shop="${kind}:${id}">Выбрать</button>`
        : price < 0 ? '<span class="shop-on don-only">за донат ⭐</span>'
        : `<button class="btn gold" data-shop="${kind}:${id}" data-price="${price}"><span class="coin"></span>${price}</button>`;
    return `<div class="shop-item ${on ? 'on' : ''}">${preview}<b>${name}</b>${btn}</div>`;
  }

  function render() {
    const s = S();
    const pz = PZ.list.filter((g) => !g.endless);
    const m = Econ.mult(), full = Econ.left();
    $('#shop-body').innerHTML = `
      <div class="shop-econ ${m < 1 ? 'low' : ''}"><b>${m === 1 ? `За игры сегодня ещё ${full} монет по полному тарифу` : `За игры сегодня ${Math.round(m * 100)}% от обычной награды`}</b>
        <small>Вход, колесо, сундук и игры дня платят всегда полностью. Лимит обновляется в полночь по МСК.</small></div>
      <h3 class="section-label">Бонусы</h3>
      <div class="shop-row">
        <div class="shop-item wide"><span class="shop-ico life">❤</span><div><b>Запасная жизнь</b><small>Продолжить серию в «Угадай сборную» или +2 попытки в «Угадай футболиста». У тебя: ${s.lives}</small></div>
          <button class="btn gold" data-shop="life"><span class="coin"></span>${LIFE_COST}</button></div>
      </div>
      <h3 class="section-label">Паки испытаний · 10 сложных уровней, монеты ×2</h3>
      <div class="shop-grid">${pz.map((g) => {
        const p = s.packs[g.id];
        return `<div class="shop-item"><span class="tile-ico" data-ico="${g.id}" style="--c1:${g.c1};--c2:${g.c2}">${Icons.get(g.id) || g.icon}</span><b>${g.title}</b>${p
          ? `<span class="shop-on">${Object.keys(p.done || {}).length}/10 пройдено</span>`
          : `<button class="btn gold" data-shop="pack:${g.id}" data-price="${PACK_COST}"><span class="coin"></span>${PACK_COST}</button>`}</div>`;
      }).join('')}</div>
      <h3 class="section-label">Рамка аватара</h3>
      <div class="shop-grid">${FRAMES.map(([id, n, p]) => item('frame', id, n, p, `<span class="shop-frame frame-host" data-frame="${id}">${Profile.rank().name.slice(0, 1)}</span>`, s.frame === id)).join('')}</div>
      <h3 class="section-label">Тема карточек на главной</h3>
      <div class="shop-grid">${CARDS.map(([id, n, p]) => item('cards', id, n, p, `<span class="shop-card" data-cards="${id}"><span class="tile-card" style="--c1:#34c46a;--c2:#1f7a3a"><b>Игра</b><small>Рекорд 7</small></span></span>`, s.cards === id)).join('')}</div>
      <h3 class="section-label">Мячи в «Сортировке»</h3>
      <div class="shop-grid">${BALLS.map(([id, n, p]) => item('balls', id, n, p, `<span class="shop-balls" data-balls="${id}">${[0, 1, 3].map((c) => `<i class="sball" style="--c:${KIT[c]}${id === 'crests' ? `;--k:url('${crestSrc(CRESTS[BALL_CLUBS[c]])}')` : ''}"></i>`).join('')}</span>`, s.balls === id)).join('')}</div>`;
    Coins.render();
  }

  function open() {
    Modal.close();
    render();
    Screens.show('shop');
  }

  function buy(key, price) {
    const s = S();
    if (key === 'life') {
      if (!Coins.spend(LIFE_COST)) return;
      s.lives++; Store.save(); toast(`Запасных жизней: ${s.lives}`); Sound.play('coin');
      return render();
    }
    const [kind, id] = key.split(':');
    if (kind === 'pack') {
      if (s.packs[id] || !Coins.spend(PACK_COST)) return;
      s.packs[id] = { done: {} }; Store.save(); Sound.play('goal'); confetti();
      toast('Пак открыт! Нажми на головоломку на главной → «Испытания»');
      return render();
    }
    const list = { frame: FRAMES, cards: CARDS, balls: BALLS }[kind];
    const it = list.find((x) => x[0] === id);
    if (!owned(kind, id, it[2])) {
      if (!Coins.spend(it[2])) return;
      s.owned[`${kind}:${id}`] = true;
      Sound.play('goal'); confetti();
    } else Sound.play('tap');
    s[kind] = id;
    Store.save();
    apply();
    render();
  }

  function bind() {
    $('#shop-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-shop]');
      if (b) buy(b.dataset.shop);
    });
    apply();
  }

  return { open, bind, apply, offerLife, ballStyle, PACK_COST };
})();
