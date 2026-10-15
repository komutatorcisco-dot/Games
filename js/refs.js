// «Пригласи друга»: друг пришёл по твоей ссылке и набрал 100 трофеев — награда тебе; новичку по ссылке — подарок на старте.
// Кто чей друг, сколько у него трофеев и что уже выдано — знает сервер (POST /ref); выдаёт каждую награду один раз.
'use strict';

const Refs = (() => {
  const packName = (lv) => ['обычный', 'золотой', 'эпический', 'легендарный', '«Джексон!!»'][lv] + ' пак';
  const rwText = (r) => [r.coins ? `${r.coins} монет` : '', r.pack !== undefined ? packName(r.pack) : ''].filter(Boolean).join(' + ');
  let busy = false;

  async function open() {
    if (!Board.ready()) { toast('Открой игры через бота @JacksonGamesbot, чтобы звать друзей'); return; }
    Modal.open('<div class="rf"><h3 class="sk-h">Друзья</h3><p class="sk-p">Загружаем…</p></div>', [{ label: 'Закрыть', cls: 'ghost' }]);
    let r; try { r = await Board.post('/ref', {}); } catch (e) { r = null; }
    if (!r || !r.ok) { const p = $('.rf .sk-p'); if (p) p.textContent = 'Сервер не ответил. Попробуй позже.'; return; }
    render(r);
  }

  function render(r) {
    const got = r.friends.filter((f) => f.claimed).length;
    const fr = r.friends.map((f) => `<div class="rf-f ${f.claimed ? 'done' : f.ready ? 'ready' : ''}"><span class="rf-ava">${esc((f.nick || '?').slice(0, 1).toUpperCase())}</span>
      <span class="rf-nm"><b>${esc(f.nick)}</b><span class="rf-bar"><i style="width:${Math.min(100, (f.tro / r.need) * 100)}%"></i></span><small>${Math.min(f.tro, r.need)} / ${r.need} трофеев</small></span>
      ${f.claimed ? '<em class="rf-ok">✓ Получено</em>' : f.ready ? `<button class="btn gold rf-go" data-rf-claim="${f.id}">Забрать</button>` : '<em>Играет</em>'}</div>`).join('');
    const miles = r.miles.map((m) => `<div class="rf-m ${m.claimed ? 'done' : got >= m.n ? 'ready' : ''}"><b>${m.n} ${plural(m.n, 'друг', 'друга', 'друзей')}</b><small>${esc(rwText(m.reward))}</small>
      ${m.claimed ? '<em class="rf-ok">✓</em>' : got >= m.n ? `<button class="btn gold rf-go" data-rf-mile="${m.n}">Забрать</button>` : `<em>${got}/${m.n}</em>`}</div>`).join('');
    const box = $('#modal-card .rf'); if (!box) return;
    box.innerHTML = `<div class="rf-hero">${Art.img('members', '', 192)}</div><h3 class="sk-h">Пригласи друга</h3>
      <p class="sk-p">Друг пришёл по твоей ссылке и набрал ${r.need} 🏆 — тебе <b>${esc(rwText(r.reward))}</b>. Другу — подарок на старте.</p>
      <button class="btn gold rf-inv" data-act="invite">Позвать друга</button>
      <h4 class="ss-h">Награды за друзей</h4><div class="rf-miles">${miles}</div>
      <h4 class="ss-h">Твои друзья · ${r.friends.length}</h4>
      ${fr || '<p class="sk-p">Пока никого. Отправь ссылку — друг появится здесь, как только откроет игру.</p>'}`;
  }

  async function claim(body, title) {
    if (busy) return; busy = true;
    try {
      const r = await Board.post('/ref', body);
      if (!r || !r.ok) { toast(r && r.error === 'claimed' ? 'Уже получено' : 'Пока рано — друг ещё играет'); return; }
      Modal.close(); Sound.play('coin'); haptic('ok');
      Rewards.giveReward(r.reward, title);
    } catch (e) { toast('Сервер не ответил. Попробуй ещё раз'); } finally { busy = false; }
  }

  // новичок пришёл по ссылке друга: подарок один раз (сервер отвечает refGift только при первом входе)
  function welcome() {
    Coins.add(300);
    const s = Rewards.S(); s.pending = (s.pending || 0) + 1; Store.save(); Rewards.refresh();
    Modal.open(`<div class="rf"><div class="rf-hero">${Art.img('chest', '', 192)}</div><h3 class="sk-h">Подарок от друга!</h3>
      <p class="sk-p">Тебя позвал друг — держи <b>300 монет</b> и <b>пак</b> с карточками. Пак ждёт тебя в «Наградах».</p></div>`, [{ label: 'Спасибо!', cls: 'gold' }]);
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-rf-claim]'); if (c) { e.preventDefault(); claim({ act: 'claim', id: Number(c.dataset.rfClaim) }, 'НАГРАДА ЗА ДРУГА'); return; }
    const m = e.target.closest('[data-rf-mile]'); if (m) { e.preventDefault(); claim({ act: 'mile', n: Number(m.dataset.rfMile) }, `НАГРАДА · ${m.dataset.rfMile} ДРУЗЕЙ`); }
  });
  return { open, welcome };
})();
