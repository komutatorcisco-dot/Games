// Лига канала (22.11): недельное соревнование подписчиков по трофеям, заработанным за неделю в дивизионах.
// Сервер (/league в server/worker.js) считает места, соседей сверху и снизу, сам подводит итоги прошлой недели;
// 1–25 места получают награду из ECON.league — игрок забирает её здесь, сервер отмечает «получено» один раз.
'use strict';

const League = (() => {
  const api = () => (typeof CONFIG !== 'undefined' && (CONFIG.api || CONFIG.donateApi)) || '';
  const ready = () => !!(api() && typeof TG !== 'undefined' && TG && TG.initData);
  let data = null, at = 0, busy = null;
  const post = (body) => fetch(api() + '/league', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: TG.initData, ...body }) }).then((r) => r.json());
  // загрузить (не чаще раза в 30 секунд); onDone — перерисовать экран
  function load(force, onDone) {
    if (!ready()) return Promise.resolve(null);
    if (!force && data && Date.now() - at < 30e3) return Promise.resolve(data);
    if (busy) return busy;
    busy = post({}).then((r) => { busy = null; if (r && r.ok) { data = r; at = Date.now(); try { const u = Store.d.ui || (Store.d.ui = {}); u.lgPlace = r.me ? r.me.place : 0; } catch (e) { /* ок */ } if (onDone) onDone(); } return data; })
      .catch(() => { busy = null; return data; });
    return busy;
  }
  const prizeFor = (place) => { const p = ECON.league.places.find(([a, b]) => place >= a && place <= b); return p ? p[2] : null; };
  const prizeText = (z) => [z.angry ? `${z.angry} ${plural(z.angry, 'злой мяч', 'злых мяча', 'злых мячей')}` : '', z.lime ? `${z.lime} лаймовых очков` : '', z.coins ? `${z.coins.toLocaleString('ru-RU')} монет` : ''].filter(Boolean).join(' · ');
  // забрать награду за место прошлой недели: сервер отмечает один раз, награда начисляется в игре
  async function claim(onDone) {
    if (!ready()) return;
    const r = await post({ act: 'claim' }).catch(() => null);
    if (!r || !r.ok) { toast((r && r.error) || 'Нет связи — попробуй ещё раз'); return; }
    const z = prizeFor(r.prize.place) || {};
    if (z.angry && typeof Rewards !== 'undefined' && Rewards.angry) Rewards.angry(z.angry);
    if (z.lime && typeof Lime !== 'undefined') Lime.add(z.lime, 'league');
    if (z.coins) { Coins.last = { x: innerWidth / 2, y: innerHeight / 2 }; Coins.add(z.coins, 'game'); }
    if (typeof confetti === 'function') confetti(); Sound.play('goal'); haptic('ok');
    toast(`Лига: ${r.prize.place}-е место — ${prizeText(z)}`);
    if (data) data.prize = null;
    load(true, onDone);
  }
  // текст итогов недели для поста в канал (копирует админ)
  function postText() {
    const L = data && data.last; if (!L || !L.rows.length) return '';
    const M = ['🥇', '🥈', '🥉'];
    const lines = L.rows.map((r) => `${M[r.place - 1] || `${r.place}.`} ${r.nick} — ${r.score.toLocaleString('ru-RU')} 🏆`);
    return `🏆 Лига канала — итоги недели\n\n${lines.join('\n')}\n\nНаграды уже ждут в игре: ${ECON.league.places.map(([a, b]) => (a === b ? `${a}-е` : `${a}–${b}`)).join(', ')} места.\nНовая неделя началась — трофеи за матчи в дивизионах. Играй: @JacksonGamesbot`;
  }
  return { load, claim, ready, prizeFor, prizeText, postText, get data() { return data; }, _set: (d) => { data = d; at = Date.now(); } }; // _set — для проверки вида без сервера
})();
