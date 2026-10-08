// Скины оформления: меняют кнопки и панели главной, наград, профиля, шапки экранов и нижнее меню.
// «Таблетки» (по умолчанию) и «Классика» есть у всех; «Золото» — из премиум-пропуска; остальные — за трофеи или монеты.
// Сохранение: Store.d.skin = { on, own: [...], v }.
const Skins = (() => {
  const LIST = [
    { id: 'pill', name: 'Таблетки', need: 0, price: 0 },
    { id: 'classic', name: 'Классика', need: 0, price: 0 },
    { id: 'gold', name: 'Золото', prem: true },
    { id: 'brawl', name: 'Сочный', need: 80, price: 250 },
    { id: 'ut', name: 'Ultimate', need: 150, price: 400 },
    { id: 'fcm', name: 'FC Mobile', need: 250, price: 500 },
    { id: 'ef', name: 'eFootball', need: 400, price: 600 },
    { id: 'kit', name: 'Футболка', need: 800, price: 800 },
    { id: 'cyber', name: 'Киберспорт', need: 1000, price: 900 },
  ];
  const S = () => {
    const s = Store.d.skin || (Store.d.skin = { on: 'pill', own: ['pill', 'classic'], v: 2 });
    if (!s.own) s.own = ['pill', 'classic'];
    if (s.v !== 2) { s.v = 2; if (s.on === 'classic') s.on = 'pill'; } // «Таблетки» — новый вид по умолчанию
    return s;
  };
  const tro = () => (typeof Release !== 'undefined' ? Release.trophies() : 0);
  const admin = () => !!(Store.d && Store.d.admin);
  const has = (k) => { const x = LIST.find((s) => s.id === k); return !!x && (admin() || S().own.includes(k) || (!x.prem && tro() >= x.need)); };
  function apply() {
    const s = S(); if (!has(s.on)) s.on = 'pill';
    if (s.on === 'classic') delete document.body.dataset.skin; else document.body.dataset.skin = s.on;
  }
  function pick(k) {
    const x = LIST.find((s) => s.id === k); if (!x) return;
    if (!has(k) && x.prem) {
      Modal.open(`<h3 class="sk-h">${esc(x.name)}</h3><img class="sk-big" src="img/skins/${k}.webp" alt=""><p class="sk-p">Эксклюзив премиум-пропуска: открывается на 1-м уровне премиум-линии.</p>`, [
        { label: 'К пропуску', onClick: () => { Modal.close(); if (typeof Rewards !== 'undefined') Rewards.open('pass'); } },
        { label: 'Назад', cls: 'ghost', keepOpen: true, onClick: () => open() },
      ]);
      return;
    }
    if (!has(k)) {
      Modal.open(`<h3 class="sk-h">${esc(x.name)}</h3><img class="sk-big" src="img/skins/${k}.webp" alt=""><p class="sk-p">Откроется сам на ${x.need} трофеях — или купи сейчас.</p>`, [
        { label: `Купить за ${x.price} монет`, onClick: () => { if (!Coins.spend(x.price)) return; S().own.push(k); S().on = k; Store.save(); apply(); Modal.close(); toast(`Оформление «${x.name}» включено`); haptic('ok'); } },
        { label: 'Назад к скинам', cls: 'ghost', keepOpen: true, onClick: () => open() },
      ]);
      return;
    }
    S().on = k; Store.save(); apply(); Sound.play('tap'); haptic('pop'); open();
  }
  function open() {
    const s = S(), t = tro();
    const cell = (x) => {
      const ok = has(x.id), on = s.on === x.id;
      return `<button class="sk-c ${on ? 'on' : ''} ${ok ? '' : 'lock'}" data-skin-pick="${x.id}"><img src="img/skins/${x.id}.webp" alt="" loading="lazy">
        <b>${esc(x.name)}</b><small>${on ? 'Включено' : ok ? 'Выбрать' : x.prem ? `${Ui.get('star')} Премиум-пропуск` : `${Ui.get('trophy')} ${x.need} · или ${x.price} мон.`}</small></button>`;
    };
    Modal.open(`<h3 class="sk-h">Оформление</h3><p class="sk-p">У тебя ${t} трофеев. Скины открываются сами — или покупай за монеты.</p><div class="sk-grid">${LIST.map(cell).join('')}</div>`, [{ label: 'Готово', cls: 'ghost' }]);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-skin-pick]'); if (b) pick(b.dataset.skinPick); });
  // выдать скин навсегда (награда пропуска) и сразу включить
  function grant(k) { const s = S(); if (!s.own.includes(k)) s.own.push(k); s.on = k; Store.save(); apply(); }
  return { LIST, apply, open, has, grant };
})();
