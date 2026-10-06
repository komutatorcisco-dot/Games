// Пак дня (раньше — колесо удачи): раз в день открываешь одну из трёх карточек и забираешь монеты.
'use strict';

const Wheel = (() => {
  const PRIZES = [10, 40, 20, 80, 15, 30, 150, 25];
  const WEIGHTS = [18, 10, 16, 5, 18, 12, 2, 14];
  const today = () => new Date().toISOString().slice(0, 10);
  const ready = () => Store.d.lastWheel !== today();

  // Пак дня: три карточки рубашкой вверх, как паки в FC. Выбираешь одну — она переворачивается с монетами.
  const roll = () => { let r = Math.random() * WEIGHTS.reduce((x, y) => x + y, 0), i = 0; while ((r -= WEIGHTS[i]) > 0) i++; return PRIZES[i]; };
  const face = (v) => `<span class="pk-face ${v >= 100 ? 'jack' : v >= 40 ? 'gold' : 'silver'}"><span class="pk-fr"></span><small>${v >= 100 ? 'ДЖЕКПОТ' : v >= 40 ? 'ЗОЛОТО' : 'СЕРЕБРО'}</small><i class="coin"></i><b>+${v}</b><em>монет</em></span>`;
  function open() {
    if (!ready()) { toast('Пак уже открыт сегодня. Новый — завтра!'); return; }
    Modal.open(`<div class="pk-head"><h2>Пак дня</h2><p>Выбери одну карточку. Внутри от 10 до 150 монет.</p></div>
      <div class="pk-row">${[0, 1, 2].map((i) => `<button class="pk" data-pk="${i}" style="--d:${i * 0.08}s"><span class="pk-in"><span class="pk-back"><span class="pk-rays"></span><span class="pk-foil"></span><span class="pk-logo"><b>Д</b></span><span class="pk-band"><span class="pk-t">ПАК ДНЯ</span><span class="pk-stars">★★★</span></span><span class="pk-sp s1"></span><span class="pk-sp s2"></span><span class="pk-sp s3"></span></span><span class="pk-front"></span></span></button>`).join('')}</div>`, []);
    $$('#modal-card .pk').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.pk), { once: true }));
  }
  function pick(n) {
    if (!ready()) return;
    Store.d.lastWheel = today(); Store.save();
    const prize = roll(), others = PRIZES.filter((x) => x !== prize).sort(() => Math.random() - 0.5);
    const cards = $$('#modal-card .pk');
    cards.forEach((c) => { c.disabled = true; });
    const mine = cards[n];
    $('.pk-front', mine).innerHTML = face(prize);
    mine.classList.add('flip', 'mine'); Sound.play(prize >= 100 ? 'goal' : 'coin'); haptic('ok');
    let k = 0;
    setTimeout(() => cards.forEach((c, i) => { if (i !== n) { $('.pk-front', c).innerHTML = face(others[k++]); c.classList.add('flip', 'other'); } }), 900);
    if (prize >= 100) setTimeout(confetti, 500);
    setTimeout(() => {
      const box = $('#modal-card .btns');
      box.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'btn gold'; btn.textContent = `Забрать +${prize}`;
      btn.addEventListener('click', () => { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(prize); Modal.close(); App.refresh(); });
      box.appendChild(btn);
    }, 1300);
  }

  return { open, ready };
})();
