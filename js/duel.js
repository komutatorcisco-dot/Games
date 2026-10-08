// «Футбольная дуэль»: 8 быстрых вопросов (лицо, клуб, номер, сборная, гол, счёт матча, FC 27, сила клуба).
// Три режима: на одном телефоне по очереди; вызов по ссылке (друг получает те же вопросы по «зерну»);
// живая игра онлайн — телефоны соединяются напрямую (WebRTC через PeerJS), вопросы приходят одновременно.
'use strict';

const Duel = (() => {
  const N = 8, TIME = 12000, REVEAL = 2300;
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PEER_PREFIX = 'jacksongames-';
  const ELO_TOP = ['Барселона', 'Реал Мадрид', 'Бавария', 'Манчестер Сити', 'Ливерпуль', 'Манчестер Юнайтед', 'Челси', 'Арсенал', 'Ювентус', 'Милан',
    'Интер', 'Атлетико', 'ПСЖ', 'Боруссия Дортмунд', 'Тоттенхэм', 'Наполи', 'Рома', 'Валенсия', 'Севилья', 'Порту', 'Бенфика', 'Аякс', 'Лион', 'Байер'];
  const KIND = { face: [Ui.get('camera'), 'Лицо'], club: [Ui.get('shield'), 'Клуб'], num: [Ui.get('hash'), 'Номер'], nation: [Ui.get('globe'), 'Сборная'], goal: [Ui.get('ball'), 'Гол'], score: [Ui.get('trophy'), 'Счёт'], fc: [Ui.get('gamepad'), 'FC 27'], elo: [Ui.get('clock'), 'История'] };

  const D = () => Store.d.fduel || (Store.d.fduel = { hist: [], played: {} });
  const me = () => ({ nick: Store.d.user.nick || 'Игрок', emo: Store.d.user.emoji || '⚽' });
  const pts = (ok, ms) => (ok ? 100 + Math.round((50 * Math.max(0, TIME - ms)) / TIME) : 0);

  // ---------- вопросы из «зерна»: у обоих игроков получаются одинаковыми ----------
  let pools = null;
  function P() {
    if (pools) return pools;
    const known = PLAYERS.filter((p) => p.tier <= 2);
    const by = (arr, key) => arr.reduce((m, x) => ((m[key(x)] = m[key(x)] || []).push(x), m), {});
    pools = {
      known,
      face: known.filter((p) => FACES[p.name]),
      num: known.filter((p) => p.num),
      fc: PLAYERS.filter((p) => FC27[p.name] && p.tier <= 3),
      elo: ELO_HIST.filter((x) => ELO_TOP.includes(x[0])),
      clubs: Object.fromEntries(Object.entries(by(PLAYERS.filter((p) => p.tier <= 3), (p) => p.lg)).map(([k, v]) => [k, [...new Set(v.map((p) => p.club))]])),
      nats: Object.fromEntries(Object.entries(by(known, (p) => p.cont)).map(([k, v]) => [k, [...new Map(v.map((p) => [p.nat, p.flag])).entries()]])),
    };
    return pools;
  }
  const rp = (r, a) => a[Math.floor(r() * a.length)];
  const others = (r, arr, right, n = 3) => shuffle(arr.filter((x) => x !== right), r).slice(0, n);
  function four(r, right, wrong, label = esc) {
    const all = shuffle([right, ...wrong], r);
    return { opts: all.map(label), ans: all.indexOf(right) };
  }
  const season = (y) => `${y - 1}/${String(y).slice(2)}`;

  const Q = {
    face(r) {
      const p = rp(r, P().face);
      const same = P().face.filter((x) => x.pos === p.pos).map((x) => x.name);
      const wrong = others(r, same.length >= 4 ? same : P().face.map((x) => x.name), p.name);
      return { q: 'Кто на фото?', media: `<span class="ava du-ava" data-ph="${esc(p.name)}"><b>?</b></span>`, ...four(r, p.name, wrong) };
    },
    club(r) {
      const p = rp(r, P().known);
      const wrong = others(r, P().clubs[p.lg] || [], p.club);
      return { q: `За какой клуб играет <b>${esc(p.name)}</b>?`, media: avatar(p.name, 'l'), ...four(r, p.club, wrong, (c) => `${crestImg(c, 's')}<span>${esc(c)}</span>`) };
    },
    num(r) {
      const p = rp(r, P().num), n = p.num;
      const near = [n - 2, n - 1, n + 1, n + 2, n + 10, n - 10, 7, 9, 10, 11, 1, 4, 5, 8, 14, 17, 19, 21, 23, 99].filter((x) => x > 0 && x < 100 && x !== n);
      const wrong = others(r, [...new Set(near)], n);
      return { q: `Под каким номером играет <b>${esc(p.name)}</b> в «${esc(p.club)}»?`, media: avatar(p.name, 'l'), ...four(r, n, wrong, (x) => `<b class="du-num">${x}</b>`) };
    },
    nation(r) {
      const p = rp(r, P().known);
      const pool = (P().nats[p.cont] || []).map(([n]) => n);
      const wrong = others(r, pool.length >= 4 ? pool : Object.values(P().nats).flat().map(([n]) => n), p.nat);
      const flag = (n) => (PLAYERS.find((x) => x.nat === n) || {}).flag || '';
      return { q: `За какую сборную играет <b>${esc(p.name)}</b>?`, media: avatar(p.name, 'l'), ...four(r, p.nat, wrong, (n) => `<span class="du-flag">${flag(n)}</span><span>${esc(n)}</span>`) };
    },
    goal(r) {
      const tour = r() < 0.7;
      let g, t = 0;
      do { g = rp(r, GOALS); t++; } while (t < 80 && !!g[14] !== tour);
      const ans = GOAL_SCORERS[g[9]];
      let pool = [...new Set(GOALS.filter((x) => x[0] === g[0]).map((x) => GOAL_SCORERS[x[9]]))];
      if (pool.length < 4) pool = GOAL_SCORERS;
      const team = g[7] ? g[4] : g[3];
      return {
        q: 'Кто забил этот гол?',
        media: `<div class="du-card"><small>${Ui.get('trophy')} ${esc(g[0])} ${esc(g[1])}${g[2] ? ' · ' + esc(g[2]) : ''}</small><b>${esc(g[3])} — ${esc(g[4])} ${g[5]}:${g[6]}</b><small>${Ui.get('clock')} ${g[8]}-я минута · гол за ${esc(team)}</small></div>`,
        ...four(r, ans, others(r, pool, ans)),
      };
    },
    score(r) {
      const W = { 'Финал': 6, 'Полуфинал': 3, '1/4 финала': 2 };
      let x = r() * WC_MATCHES.reduce((a, m) => a + (W[m[1]] || 1), 0), m = WC_MATCHES[0];
      for (const k of WC_MATCHES) { x -= W[k[1]] || 1; if (x <= 0) { m = k; break; } }
      const h = m[6], a = m[7], right = `${h}:${a}`;
      const cand = [`${a}:${h}`, `${h + 1}:${a}`, `${h}:${a + 1}`, `${Math.max(0, h - 1)}:${a}`, `${h}:${Math.max(0, a - 1)}`, `${h + 1}:${a + 1}`, '1:0', '2:1', '1:1', '2:0', '3:1']
        .filter((s) => s !== right);
      const wrong = others(r, [...new Set(cand)], right);
      return {
        q: 'С каким счётом закончился матч?',
        media: `<div class="du-card"><small>${Ui.get('trophy')} Чемпионат мира ${m[0]} · ${esc(m[1])}</small><b>${m[3]} ${esc(m[2])} — ${esc(m[4])} ${m[5]}</b><small>с учётом доп. времени, без серии пенальти</small></div>`,
        ...four(r, right, wrong, (s) => `<b class="du-num">${s}</b>`),
      };
    },
    fc(r) {
      let a, b, t = 0;
      do { a = rp(r, P().fc); b = rp(r, P().fc); t++; } while ((a === b || Math.abs(FC27[a.name] - FC27[b.name]) < 2) && t < 200);
      const right = FC27[a.name] > FC27[b.name] ? a : b, all = [a, b];
      return {
        q: 'У кого выше рейтинг в FC 27?', two: true,
        opts: all.map((p) => `${avatar(p.name, 'm')}<span>${esc(p.name)}</span>`), ans: all.indexOf(right),
        after: all.map((p) => `${esc(p.name)} — ${FC27[p.name]}`).join(' · '),
      };
    },
    elo(r) {
      let a, b, t = 0;
      do { a = rp(r, P().elo); b = rp(r, P().elo); t++; } while ((a[0] === b[0] || Math.abs(a[2] - b[2]) < 60) && t < 300);
      const all = [a, b], right = a[2] > b[2] ? a : b;
      return {
        q: 'Какая команда была сильнее?', two: true,
        opts: all.map((x) => `${crestImg(x[0], 'm')}<span>${esc(x[0])}<small>${season(x[1])}</small></span>`), ans: all.indexOf(right),
        after: all.map((x) => `${esc(x[0])} ${season(x[1])} — ${x[2]} Эло`).join(' · '),
      };
    },
  };
  const TYPES = ['face', 'club', 'goal', 'score', 'num', 'fc', 'elo', 'nation'];
  function build(seed) {
    const r = mulberry32(seed);
    return shuffle(TYPES, r).map((t) => Object.assign({ t }, Q[t](r)));
  }
  const newSeed = () => 1 + Math.floor(Math.random() * 2 ** 31);

  // ---------- ссылка-вызов: d_<зерно>_<очки>_<ответы>_<ник base64url> ----------
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = (s) => { try { return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))); } catch (e) { return ''; } };
  function token(seed, score, ans, nick) {
    const head = `d_${seed.toString(36)}_${score}_${ans}_`;
    let n = nick;
    while (n && (head + b64(n)).length > 64) n = n.slice(0, -1);
    return head + b64(n || 'Друг');
  }
  function parse(t) {
    const m = /^d_([0-9a-z]+)_(\d+)_([0-3x]{8})_(.*)$/.exec(t || '');
    if (!m) return null;
    return { seed: parseInt(m[1], 36), score: +m[2], ans: m[3], nick: unb64(m[4]).replace(/[<>]/g, '').slice(0, 16) || 'Друг', key: m[1] + '_' + m[2] };
  }

  function shareLink(start, text) {
    const url = appLink(start);
    try {
      if (TG && TG.openTelegramLink) { TG.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`); return; }
    } catch (e) { /* не в Telegram */ }
    if (navigator.share) { navigator.share({ text, url }).catch(() => {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(() => toast('Ссылка скопирована, отправь её другу'), () => toast(url));
    else toast(url);
  }

  function remember(entry) {
    const d = D();
    d.hist.unshift(Object.assign({ day: Day.key() }, entry));
    d.hist = d.hist.slice(0, 12);
    Store.save();
    if (['win', 'lose', 'draw'].includes(entry.res)) safe('rewards', () => Rewards.onEnd(entry.res === 'win', 'ng:duel'));
  }

  // PeerJS грузим только когда открыли живую игру
  let peerLib = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return peerLib || (peerLib = new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js';
      s.onload = () => ok(); s.onerror = () => { peerLib = null; bad(new Error('peerjs')); };
      document.head.appendChild(s);
    }));
  }

  // ---------- игра ----------
  NG.register({
    id: 'duel', group: 'friends', title: 'Футбольная дуэль', c1: '#ff5f6d', c2: '#5b3cc4', tag: 'Онлайн и на одном телефоне', wide: true,
    meta: () => { const h = D().hist; const w = h.filter((x) => x.res === 'win').length; return h.length ? `Дуэлей: ${h.length} · побед: ${w}` : 'Онлайн и на одном телефоне'; },
    start(api, opts = {}) {
      const b = api.body;
      let onPick = null, acts = {}, timers = [], peer = null, conn = null, alive = true, rematchFn = null;
      const T = (fn, ms) => { const id = later(() => alive && fn(), ms); timers.push(id); return id; };
      const clearT = () => { timers.forEach(clearTimeout); timers = []; };
      const stopPeer = () => { try { conn && conn.close(); } catch (e) { /* уже закрыто */ } try { peer && peer.destroy(); } catch (e) { /* уже закрыто */ } conn = null; peer = null; };

      b.addEventListener('click', (e) => {
        const o = e.target.closest('.du-opt');
        if (o && onPick && !o.disabled) { onPick(+o.dataset.k); return; }
        const a = e.target.closest('[data-du]');
        if (a && acts[a.dataset.du]) { Sound.play('tap'); acts[a.dataset.du](a); }
      });

      // Один вопрос: таймер, варианты. cb(k, ms), k = -1 если время вышло
      function ask(q, i, head, cb) {
        onPick = null;
        b.innerHTML = `${head || ''}<div class="du-q" style="--T:${TIME}ms">
          <div class="du-meta"><span>Вопрос ${i + 1} из ${N}</span><span class="du-kind">${KIND[q.t].join(' ')}</span></div>
          <div class="du-timer"><i></i></div>
          <div class="du-media">${q.media || ''}</div><h3 class="du-text">${q.q}</h3>
          <div class="du-opts ${q.two ? 'two' : ''}">${q.opts.map((o, k) => `<button class="du-opt" data-k="${k}" style="--i:${k}">${o}</button>`).join('')}</div>
          <p class="du-after" hidden></p></div>`;
        Photos.hydrate(b);
        const t0 = performance.now();
        let done = false;
        const fin = (k) => {
          if (done) return; done = true; onPick = null;
          const ms = Math.min(TIME, Math.round(performance.now() - t0));
          $$('.du-opt', b).forEach((el) => { el.disabled = true; if (+el.dataset.k === k) el.classList.add('picked'); });
          const tm = $('.du-timer', b); if (tm) tm.classList.add('stop');
          if (k < 0) toast('Время вышло');
          cb(k, ms);
        };
        onPick = (k) => { Sound.play('tap'); haptic('tap'); fin(k); };
        T(() => fin(-1), TIME);
      }

      // Показать правильный ответ и чьи были выборы: marks = [{k, lab}]
      function reveal(q, marks) {
        $$('.du-opt', b).forEach((el) => {
          const k = +el.dataset.k, mine = marks.filter((m) => m.k === k);
          el.classList.add(k === q.ans ? 'right' : mine.length ? 'wrong' : 'dim');
          if (mine.length) el.insertAdjacentHTML('beforeend', `<span class="du-marks">${mine.map((m) => `<em>${m.lab}</em>`).join('')}</span>`);
        });
        const af = $('.du-after', b);
        if (af && q.after) { af.innerHTML = q.after; af.hidden = false; }
      }

      const board = (L, R, extra = '') => `<div class="du-board">
          <div class="du-pl ${L.on ? 'on' : ''}"><span class="du-emo">${L.emo}</span><b>${esc(L.nick)}</b><em class="du-sc">${L.score}</em>${L.flag || ''}</div>
          <i class="du-vs">VS</i>
          <div class="du-pl right ${R.on ? 'on' : ''}"><span class="du-emo">${R.emo}</span><b>${esc(R.nick)}</b><em class="du-sc">${R.score}</em>${R.flag || ''}</div>${extra}</div>`;
      const gain = (sel, n) => { const el = $(sel, b); if (el && n) { el.insertAdjacentHTML('beforeend', `<i class="du-gain">+${n}</i>`); bump(el, 'du-pop'); } };

      // ---------- меню ----------
      function menu() {
        clearT(); stopPeer(); onPick = null;
        api.sub('Сыграй с другом');
        const h = D().hist.slice(0, 5);
        b.innerHTML = `<div class="du-hero"><div class="du-hero-vs"><span>${me().emo}</span><i>VS</i><span>🙂</span></div>
            <p>8 вопросов: лица, клубы, номера, голы и счёт легендарных матчей. Чем быстрее верный ответ, тем больше очков.</p></div>
          <div class="du-modes">
            <button class="du-mode rnd" data-du="rnd" style="--i:0"><span class="du-mi">${Ui.get('swords')}</span><span><b>Случайный соперник</b><small>Найдём живого игрока онлайн прямо сейчас</small></span></button>
            <button class="du-mode live" data-du="live" style="--i:0"><span class="du-mi">${Ui.get('bolt')}</span><span><b>Онлайн в реальном времени</b><small>Отправь другу ссылку и играйте одновременно</small></span></button>
            <button class="du-mode link" data-du="link" style="--i:1"><span class="du-mi">${Ui.get('link')}</span><span><b>Вызов по ссылке</b><small>Сыграй сейчас, а друг потом, когда удобно. Вопросы те же</small></span></button>
            <button class="du-mode hot" data-du="hot" style="--i:2"><span class="du-mi">${Ui.get('phone')}</span><span><b>На одном телефоне</b><small>Отвечаете по очереди и передаёте телефон</small></span></button>
          </div>
          ${h.length ? `<h4 class="du-h">Последние дуэли</h4><div class="du-hist">${h.map((x) => `<div class="du-hrow ${x.res}"><span>${Ui.get(x.mode === 'live' ? 'bolt' : x.mode === 'hot' ? 'phone' : 'link')} ${esc(x.vs)}</span><b>${x.my} : ${x.op == null ? '?' : x.op}</b><i>${x.res === 'win' ? 'Победа' : x.res === 'lose' ? 'Поражение' : x.res === 'draw' ? 'Ничья' : 'Ждём друга'}</i></div>`).join('')}</div>` : ''}`;
        acts = { rnd: random, live: liveMenu, link: () => solo(newSeed(), null), hot: hotSetup };
      }

      // ---------- вызов по ссылке: создать или принять ----------
      function solo(seed, ch) {
        clearT(); onPick = null;
        const qs = build(seed), m = me();
        let i = 0, score = 0, ans = '';
        const left = () => ({ ...m, score, on: true }), right = () => (ch ? { nick: ch.nick, emo: '🎯', score: ch.score != null && i >= N ? ch.score : '?' } : { nick: 'друг', emo: '❔', score: '?' });
        function intro() {
          api.sub(ch ? `Вызов от ${ch.nick}` : 'Новый вызов');
          b.innerHTML = `<div class="du-intro">${ch ? `<div class="du-big-emo">${Ui.get('target')}</div><h3><b>${esc(ch.nick)}</b> вызывает тебя на дуэль!</h3>
              <p>Те же 8 вопросов, что были у ${esc(ch.nick)}. Его счёт откроется в конце. После каждого вопроса увидишь, что ответил соперник.</p>`
            : `<div class="du-big-emo">${Ui.get('link')}</div><h3>Сыграй 8 вопросов</h3><p>Потом отправь ссылку другу. Ему достанутся те же вопросы, и вы сравните очки.</p>`}
            <button class="btn gold du-go" data-du="go">Поехали!</button></div>`;
          acts = { go: () => countdown(next) };
        }
        function next() {
          if (i >= N) return finish();
          const q = qs[i];
          ask(q, i, board(left(), right()), (k, ms) => {
            const ok = k === q.ans, p = pts(ok, ms);
            score += p; ans += k < 0 ? 'x' : k;
            Sound.play(ok ? 'kick' : 'bad'); haptic(ok ? 'ok' : 'bad');
            const marks = [{ k, lab: m.emo }];
            if (ch) { const ok2 = ch.ans[i] !== 'x' ? +ch.ans[i] : -1; if (ok2 >= 0) marks.push({ k: ok2, lab: Ui.get('target') }); }
            reveal(q, marks);
            $('.du-sc', b).textContent = score; gain('.du-pl', p);
            i++;
            T(next, REVEAL);
          });
        }
        function finish() {
          onPick = null;
          if (!ch) {
            const tk = token(seed, score, ans, m.nick);
            remember({ mode: 'link', vs: 'вызов отправлен', my: score, op: null, res: 'wait' });
            const reward = Econ.play(Math.round(score / 40));
            b.innerHTML = `<div class="du-end"><div class="du-end-big" data-count="${score}">0</div><p>очков из ${N * 150}</p>
                <p class="du-end-txt">Теперь отправь вызов другу: ему достанутся те же вопросы. Кто наберёт больше?</p>
                ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
                <button class="btn gold" data-du="send">${Ui.get('send')} Отправить вызов другу</button>
                <button class="btn ghost" data-du="menu">Назад к дуэлям</button></div>`;
            countUp();
            acts = { send: () => shareLink(tk, `⚔️ Вызываю на футбольную дуэль! Я набрал ${score} очков. Сможешь больше?`), menu };
            return;
          }
          const res = score > ch.score ? 'win' : score < ch.score ? 'lose' : 'draw';
          const d = D(); d.played[ch.key] = { my: score, op: ch.score, res }; Store.save();
          remember({ mode: 'link', vs: ch.nick, my: score, op: ch.score, res });
          if (res === 'win') { confetti(); Sound.play('goal'); haptic('ok'); Profile.bump('duel', 10); } else Sound.play('lose');
          const reward = Econ.play(Math.round(score / 40) + (res === 'win' ? 20 : 0));
          b.innerHTML = `<div class="du-end ${res}">${board({ ...m, score }, { nick: ch.nick, emo: '🎯', score: ch.score })}
              <h2 class="du-res">${res === 'win' ? 'Победа!' : res === 'lose' ? 'Поражение' : 'Ничья!'}</h2>
              <p class="du-end-txt">${res === 'win' ? `Ты обыграл ${esc(ch.nick)}` : res === 'lose' ? `${esc(ch.nick)} оказался сильнее` : 'Равный бой'}: ${score} : ${ch.score}</p>
              ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
              <button class="btn gold" data-du="send">${Ui.get('send')} Отправить результат</button>
              <button class="btn" data-du="re">${Ui.get('swords')} Реванш: новый вызов</button>
              <button class="btn ghost" data-du="menu">Назад к дуэлям</button></div>`;
          acts = {
            send: () => shareLink(token(seed, score, ans, m.nick), `${res === 'win' ? '🏆 Я выиграл' : res === 'lose' ? '😤 Я проиграл' : '🤝 Ничья'} дуэль: ${score} : ${ch.score}. Сыграешь эти же вопросы?`),
            re: () => solo(newSeed(), null), menu,
          };
        }
        if (ch && D().played[ch.key]) {
          const r = D().played[ch.key];
          api.sub(`Вызов от ${ch.nick}`);
          b.innerHTML = `<div class="du-end ${r.res}">${board({ ...m, score: r.my }, { nick: ch.nick, emo: '🎯', score: r.op })}
              <h2 class="du-res">Этот вызов уже сыгран</h2><p class="du-end-txt">${r.res === 'win' ? 'Ты победил' : r.res === 'lose' ? 'Победил соперник' : 'Была ничья'}: ${r.my} : ${r.op}</p>
              <button class="btn gold" data-du="re">${Ui.get('swords')} Реванш: новый вызов</button><button class="btn ghost" data-du="menu">К дуэлям</button></div>`;
          acts = { re: () => solo(newSeed(), null), menu };
          return;
        }
        intro();
      }

      // 3-2-1 перед стартом
      function countdown(fn) {
        let n = 3;
        const step = () => {
          if (!n) return fn();
          b.innerHTML = `<div class="du-count"><b key="${n}">${n}</b></div>`;
          Sound.play('tap'); n--; T(step, 650);
        };
        step();
      }
      function countUp() {
        const el = $('[data-count]', b); if (!el) return;
        const to = +el.dataset.count, t0 = performance.now();
        const tick = (now) => { if (!el.isConnected) return; const p = Math.min(1, (now - t0) / 900); el.textContent = Math.round(to * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }

      // ---------- на одном телефоне ----------
      function hotSetup() {
        api.sub('На одном телефоне');
        b.innerHTML = `<div class="du-intro"><div class="du-big-emo">${Ui.get('phone')}</div><h3>Кто играет?</h3>
            <label class="du-name"><span>${me().emo}</span><input id="du-p1" maxlength="14" value="${esc(me().nick)}"></label>
            <label class="du-name"><span>🙂</span><input id="du-p2" maxlength="14" placeholder="Имя друга" value="Друг"></label>
            <p>Каждый вопрос отвечаете по очереди: первый отвечает, передаёт телефон, второй отвечает, и только потом видно, кто прав.</p>
            <button class="btn gold du-go" data-du="go">Начать</button></div>`;
        acts = { go: () => hot([($('#du-p1').value || 'Игрок 1').trim().slice(0, 14), ($('#du-p2').value || 'Игрок 2').trim().slice(0, 14)]) };
      }
      function hot(names) {
        const qs = build(newSeed()), sc = [0, 0], emo = [me().emo, '🙂'];
        let i = 0;
        const brd = (turn) => board({ nick: names[0], emo: emo[0], score: sc[0], on: turn === 0 }, { nick: names[1], emo: emo[1], score: sc[1], on: turn === 1 });
        function pass(turn, fn) {
          onPick = null;
          api.sub(`Вопрос ${i + 1} из ${N}`);
          b.innerHTML = `${brd(turn)}<div class="du-pass"><div class="du-big-emo">${Ui.get(turn ? 'refresh' : 'phone')}</div><h3>${turn ? 'Передай телефон' : 'Ходит'} <b>${esc(names[turn])}</b></h3>
              <p>${turn ? 'Не подглядывай, какой ответ выбрал соперник' : 'Второй игрок, отвернись'}</p><button class="btn gold" data-du="ready">Я готов</button></div>`;
          acts = { ready: fn };
        }
        function round() {
          if (i >= N) return finish();
          const q = qs[i], got = [];
          pass(0, () => ask(q, i, brd(0), (k0, ms0) => {
            got[0] = [k0, ms0];
            T(() => pass(1, () => ask(q, i, brd(1), (k1, ms1) => {
              got[1] = [k1, ms1];
              const p = got.map(([k, ms]) => pts(k === q.ans, ms));
              sc[0] += p[0]; sc[1] += p[1];
              b.innerHTML = brd(-1) + b.innerHTML.slice(b.innerHTML.indexOf('<div class="du-q"'));
              $$('.du-opt', b).forEach((el) => { el.disabled = true; el.classList.remove('picked'); });
              const tm = $('.du-timer', b); if (tm) tm.hidden = true;
              reveal(q, [{ k: got[0][0], lab: emo[0] }, { k: got[1][0], lab: emo[1] }]);
              gain('.du-pl', p[0]); gain('.du-pl.right', p[1]);
              Sound.play(p[0] || p[1] ? 'kick' : 'bad');
              i++;
              b.insertAdjacentHTML('beforeend', `<div class="ng-row"><button class="btn gold" data-du="next">${i >= N ? 'Итоги' : 'Дальше →'}</button></div>`);
              acts = { next: round };
            })), 500);
          }));
        }
        function finish() {
          const w = sc[0] === sc[1] ? -1 : sc[0] > sc[1] ? 0 : 1;
          confetti(); Sound.play('goal');
          remember({ mode: 'hot', vs: `${names[0]} и ${names[1]}`, my: sc[0], op: sc[1], res: w < 0 ? 'draw' : w === 0 ? 'win' : 'lose' });
          b.innerHTML = `<div class="du-end">${brd(-1)}<h2 class="du-res">${w < 0 ? 'Ничья!' : `Победил ${esc(names[w])}!`}</h2>
              <p class="du-end-txt">${sc[0]} : ${sc[1]}</p>
              <button class="btn gold" data-du="again">Ещё дуэль</button><button class="btn ghost" data-du="menu">Назад к дуэлям</button></div>`;
          acts = { again: () => hot(names), menu };
        }
        round();
      }

      // ---------- живая игра онлайн ----------
      function liveMenu() {
        api.sub('Онлайн');
        b.innerHTML = `<div class="du-intro"><div class="du-big-emo">${Ui.get('bolt')}</div><h3>Дуэль в реальном времени</h3>
            <p>Создай комнату и отправь другу приглашение. Когда он откроет ссылку, вопросы появятся у вас одновременно.</p>
            <button class="btn gold du-go" data-du="host">Создать комнату</button>
            <div class="du-join"><input id="du-code" maxlength="5" placeholder="КОД" autocomplete="off" autocapitalize="characters"><button class="btn" data-du="join">Войти</button></div>
            <p class="du-small">Если онлайн не соединяется (так бывает в некоторых мобильных сетях), сыграйте «Вызовом по ссылке».</p></div>`;
        acts = { host, join: () => { const c = ($('#du-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 5) join(c); else toast('В коде 5 символов'); } };
      }
      function connecting(text, code) {
        b.innerHTML = `<div class="du-intro du-wait"><div class="du-radar"><i></i><i></i><i></i><span>${me().emo}</span></div>
            <h3>${text}</h3>${code ? `<div class="du-code">${code.split('').map((c, k) => `<b style="--i:${k}">${c}</b>`).join('')}</div>
            <button class="btn gold" data-du="invite">${Ui.get('send')} Пригласить друга</button><button class="btn ghost" data-du="copy">Скопировать код</button>` : ''}
            <button class="btn ghost" data-du="menu">Отмена</button></div>`;
      }
      function fail(msg) {
        if (!alive) return;
        stopPeer(); clearT(); onPick = null;
        b.innerHTML = `<div class="du-intro"><div class="du-big-emo">${Ui.get('signal')}</div><h3>${msg}</h3>
            <p>Попробуйте ещё раз или сыграйте «Вызовом по ссылке», он работает всегда.</p>
            <button class="btn gold" data-du="live">Попробовать снова</button><button class="btn" data-du="link">${Ui.get('link')} Вызов по ссылке</button><button class="btn ghost" data-du="menu">Назад</button></div>`;
        acts = { live: liveMenu, link: () => solo(newSeed(), null), menu };
      }
      const peerOpts = () => Object.assign({ debug: 0 }, window.DUEL_PEER || {});
      // ---------- случайный соперник: сервер сводит двух ищущих, дальше — как обычная комната ----------
      let mmOn = false;
      const mm = (body) => Board.post('/mm', body).catch(() => ({ ok: false }));
      const mmStop = () => { if (mmOn) { mmOn = false; mm({ act: 'cancel' }); } };
      async function random() {
        if (!Board.ready()) { toast('Онлайн работает в Telegram через бота @JacksonGamesbot'); return; }
        api.sub('Случайный соперник');
        connecting('Ищем соперника…');
        acts = { menu: () => { mmStop(); menu(); } };
        try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн-режим'); }
        if (!alive) return;
        const code = Array.from({ length: 5 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join('');
        stopPeer(); mmOn = true;
        const t0 = Date.now();
        peer = new window.Peer(PEER_PREFIX + code, peerOpts());
        peer.on('connection', (c) => { if (conn) { c.on('open', () => c.close()); return; } mmStop(); wire(c, true); });
        peer.on('error', (e) => { if (e.type === 'unavailable-id') { mmStop(); random(); } else if (!conn) { mmStop(); fail('Не удалось выйти в онлайн'); } });
        const poll = async () => {
          if (!alive || !mmOn || conn) return;
          const r = await mm({ act: 'find', code, nick: me().nick, emo: me().emo });
          if (!alive || !mmOn || conn) return;
          if (r.ok && r.role === 'join') { mmOn = false; toast(`Соперник найден: ${String(r.nick || 'Игрок').slice(0, 16)}`); return join(r.code); }
          const w = $('.du-wait h3', b); if (w) w.textContent = r.ok && r.waiting > 1 ? `Ищем соперника… онлайн ищут: ${r.waiting}` : 'Ищем соперника…';
          if (Date.now() - t0 > 60000) { mmStop(); stopPeer(); b.innerHTML = `<div class="du-intro"><div class="du-big-emo">${Ui.get('users')}</div><h3>Пока никого нет онлайн</h3>
            <p>Позови друга в комнату или брось вызов по ссылке — он сыграет, когда сможет.</p>
            <button class="btn gold" data-du="rnd">Искать ещё</button><button class="btn" data-du="live">${Ui.get('bolt')} Комната для друга</button><button class="btn ghost" data-du="menu">Назад</button></div>`;
            acts = { rnd: random, live: liveMenu, menu }; return; }
          T(poll, 3000);
        };
        peer.on('open', poll);
      }
      async function host() {
        connecting('Создаём комнату…');
        acts = { menu };
        try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн-режим'); }
        if (!alive) return;
        const code = Array.from({ length: 5 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join('');
        stopPeer();
        peer = new window.Peer(PEER_PREFIX + code, peerOpts());
        peer.on('open', () => {
          connecting('Ждём друга…', code);
          acts = { menu, invite: () => shareLink('r_' + code, `⚡ Залетай на футбольную дуэль онлайн! Код комнаты: ${code}`), copy: () => { try { navigator.clipboard.writeText(code).then(() => toast('Код скопирован')); } catch (e) { toast(code); } } };
        });
        peer.on('connection', (c) => { if (conn) { c.on('open', () => c.close()); return; } wire(c, true); });
        peer.on('error', (e) => { if (e.type === 'unavailable-id') host(); else if (!conn) fail('Не удалось создать комнату'); });
      }
      async function join(code) {
        connecting(`Подключаемся к комнате ${code}…`);
        acts = { menu };
        try { await loadPeer(); } catch (e) { return fail('Не получилось загрузить онлайн-режим'); }
        if (!alive) return;
        stopPeer();
        peer = new window.Peer(peerOpts());
        peer.on('open', () => wire(peer.connect(PEER_PREFIX + code, { reliable: true }), false));
        peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Комната не найдена. Проверь код. Возможно, друг уже закрыл игру' : 'Не удалось подключиться'));
        T(() => { if (!conn || !conn.open) fail('Не удалось подключиться'); }, 20000);
      }
      // Протокол: hi {nick, emo} → go {seed} (от хозяина) → a {i, k, ms} на каждый вопрос → re (реванш)
      function wire(c, isHost) {
        conn = c;
        let op = null, game = null, reMe = false, reOp = false;
        const send = (m) => { try { c.open && c.send(m); } catch (e) { /* соединение пропало */ } };
        c.on('open', () => send({ t: 'hi', ...me() }));
        c.on('close', () => { if (alive && conn === c) { conn = null; if (game && !game.over) fail('Соперник отключился'); else if (!game) fail('Соединение закрыто'); else toast('Соперник вышел'); } });
        c.on('error', () => {});
        const startGame = (seed) => { reMe = reOp = false; game = live(seed, op, send); };
        c.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'hi') {
            op = { nick: String(m.nick || 'Друг').replace(/[<>]/g, '').slice(0, 16), emo: String(m.emo || '🙂').slice(0, 4) };
            if (isHost) { const seed = newSeed(); send({ t: 'go', seed }); countdown(() => startGame(seed)); toast(`${op.nick} в игре!`); }
          } else if (m.t === 'go' && !isHost && op) { toast(`Играем с ${op.nick}!`); countdown(() => startGame(+m.seed)); }
          else if (m.t === 'a' && game) game.opAnswer(m);
          else if (m.t === 're') {
            reOp = true; if (game) game.reWanted();
            if (isHost && reMe) { const seed = newSeed(); send({ t: 'go', seed }); countdown(() => startGame(seed)); }
          }
        });
        rematchFn = () => {
          reMe = true; send({ t: 're' }); toast('Ждём ответа соперника…');
          if (isHost && reOp) { const seed = newSeed(); send({ t: 'go', seed }); countdown(() => startGame(seed)); }
        };
      }
      function live(seed, op, send) {
        const qs = build(seed), m = me(), sc = [0, 0], opAns = {};
        let i = 0, mine = null;
        const g = { over: false };
        const brd = () => board({ ...m, score: sc[0] }, { ...op, score: sc[1], flag: opAns[i] && !mine ? '<i class="du-flag-ok">⚡</i>' : '' });
        function next() {
          if (i >= N) return finish();
          mine = null;
          api.sub(`Онлайн · вопрос ${i + 1} из ${N}`);
          const at = i;
          // соперник свернул приложение или пропала сеть — засчитываем ему пропуск
          T(() => { if (i === at && !opAns[at]) { opAns[at] = { k: -1, ms: TIME }; both(); } }, TIME + 8000);
          ask(qs[i], i, brd(), (k, ms) => {
            mine = { k, ms };
            send({ t: 'a', i, k, ms });
            if (!opAns[i]) { const w = $('.du-after', b); if (w) { w.innerHTML = `<span class="du-waiting">Ждём ${esc(op.nick)}…</span>`; w.hidden = false; } }
            both();
          });
        }
        function both() {
          if (!mine || !opAns[i]) return;
          const q = qs[i], o = opAns[i], p0 = pts(mine.k === q.ans, mine.ms), p1 = pts(o.k === q.ans, o.ms);
          sc[0] += p0; sc[1] += p1;
          const w = $('.du-after', b); if (w) { w.hidden = true; w.innerHTML = ''; }
          $$('.du-flag-ok', b).forEach((x) => x.remove());
          reveal(q, [{ k: mine.k, lab: m.emo }, { k: o.k, lab: op.emo }]);
          const els = $$('.du-sc', b); if (els[0]) els[0].textContent = sc[0]; if (els[1]) els[1].textContent = sc[1];
          gain('.du-pl', p0); gain('.du-pl.right', p1);
          Sound.play(p0 ? 'kick' : 'bad'); haptic(p0 ? 'ok' : 'bad');
          i++; mine = null;
          T(next, REVEAL + 300);
        }
        g.opAnswer = (a) => {
          const k = +a.i;
          if (!(k >= 0 && k < N) || opAns[k]) return;
          opAns[k] = { k: Math.max(-1, Math.min(3, +a.k)), ms: Math.max(0, Math.min(TIME, +a.ms || TIME)) };
          if (k === i && !mine) { const r = $('.du-pl.right', b); if (r && !$('.du-flag-ok', r)) r.insertAdjacentHTML('beforeend', '<i class="du-flag-ok">⚡</i>'); }
          if (k === i) both();
        };
        g.reWanted = () => { const r = $('.du-re-note', b); if (r) r.textContent = `${op.nick} хочет реванш!`; };
        function finish() {
          g.over = true; onPick = null;
          const res = sc[0] > sc[1] ? 'win' : sc[0] < sc[1] ? 'lose' : 'draw';
          remember({ mode: 'live', vs: op.nick, my: sc[0], op: sc[1], res });
          if (res === 'win') { confetti(); Sound.play('goal'); haptic('ok'); Profile.bump('duel', 15); } else Sound.play('lose');
          const reward = Econ.play(Math.round(sc[0] / 40) + (res === 'win' ? 30 : 0));
          api.sub('Онлайн · итог');
          b.innerHTML = `<div class="du-end ${res}">${board({ ...m, score: sc[0] }, { ...op, score: sc[1] })}
              <h2 class="du-res">${res === 'win' ? 'Победа!' : res === 'lose' ? 'Поражение' : 'Ничья!'}</h2>
              <p class="du-end-txt">${sc[0]} : ${sc[1]}</p><p class="du-re-note"></p>
              ${reward ? `<span class="reward"><span class="coin"></span>+${reward}</span>` : ''}
              <button class="btn gold" data-du="rematch">${Ui.get('swords')} Реванш</button><button class="btn ghost" data-du="menu">Выйти</button></div>`;
          acts = { rematch: rematchFn, menu };
        }
        next();
        return g;
      }

      // старт: из ссылки-вызова, из приглашения в комнату или меню
      if (opts.mode === 'accept' && opts.ch) solo(opts.ch.seed, opts.ch);
      else if (opts.mode === 'join' && opts.code) join(opts.code);
      else if (opts.mode === 'live') liveMenu();
      else if (opts.mode === 'link') solo(newSeed(), null);
      else if (opts.mode === 'hot') hotSetup();
      else if (opts.mode === 'rnd') random();
      else menu();
      return () => { alive = false; clearT(); mmStop(); stopPeer(); };
    },
  });

  // Ссылки из Telegram: d_… — вызов, r_… — комната
  function deep(param) {
    if (/^d_/.test(param)) { const ch = parse(param); if (ch) { NG.open('duel', { mode: 'accept', ch }); return true; } }
    if (/^r_[A-Z0-9]{5}$/.test(param)) { NG.open('duel', { mode: 'join', code: param.slice(2) }); return true; }
    return false;
  }

  return { deep, build, parse, token, share: shareLink };
})();
