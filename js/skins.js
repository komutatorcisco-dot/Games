// Скины оформления: меняют кнопки и панели главной, наград, профиля, шапки экранов и нижнее меню.
// «Классика» есть у всех; остальные открываются сами за трофеи или покупаются за монеты.
// Сохранение: Store.d.skin = { on: 'classic', own: ['classic', …] }.
const Skins = (() => {
  const LIST = [
    { id: 'classic', name: 'Классика', need: 0, price: 0 },
    { id: 'brawl', name: 'Сочный', need: 80, price: 250 },
    { id: 'ut', name: 'Ultimate', need: 150, price: 400 },
    { id: 'fcm', name: 'FC Mobile', need: 250, price: 500 },
    { id: 'ef', name: 'eFootball', need: 400, price: 600 },
    { id: 'pill', name: 'Таблетки', need: 600, price: 700 },
    { id: 'kit', name: 'Футболка', need: 800, price: 800 },
    { id: 'cyber', name: 'Киберспорт', need: 1000, price: 900 },
  ];
  const S = () => {
    const s = Store.d.skin || (Store.d.skin = { on: 'classic', own: ['classic'] });
    if (!s.own) s.own = ['classic'];
    return s;
  };
  const tro = () => (typeof Release !== 'undefined' ? Release.trophies() : 0);
  const has = (k) => { const x = LIST.find((s) => s.id === k); return !!x && (S().own.includes(k) || tro() >= x.need); };
  function apply() {
    const s = S(); if (!has(s.on)) s.on = 'classic';
    if (s.on === 'classic') delete document.body.dataset.skin; else document.body.dataset.skin = s.on;
  }
  function pick(k) {
    const x = LIST.find((s) => s.id === k); if (!x) return;
    if (!has(k)) {
      Modal.open(`<h3 class="sk-h">${esc(x.name)}</h3><img class="sk-big" src="img/skins/${k}.webp" alt=""><p class="sk-p">Откроется сам на ${x.need} трофеях — или купи сейчас.</p>`, [
        { label: `Купить за ${x.price} монет`, onClick: () => { if (!Coins.spend(x.price)) return; S().own.push(k); S().on = k; Store.save(); apply(); Modal.close(); toast(`Оформление «${x.name}» включено`); haptic('ok'); } },
        { label: 'Позже', cls: 'ghost' },
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
        <b>${esc(x.name)}</b><small>${on ? 'Включено' : ok ? 'Выбрать' : `${Ui.get('trophy')} ${x.need} · или ${x.price} мон.`}</small></button>`;
    };
    Modal.open(`<h3 class="sk-h">Оформление</h3><p class="sk-p">У тебя ${t} трофеев. Скины открываются сами — или покупай за монеты.</p><div class="sk-grid">${LIST.map(cell).join('')}</div>`, [{ label: 'Готово', cls: 'ghost' }]);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-skin-pick]'); if (b) pick(b.dataset.skinPick); });
  return { LIST, apply, open, has };
})();
