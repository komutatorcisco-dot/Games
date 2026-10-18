// node tests/cloud-save-retry.test.js — копия сейва на сервере (/save): метка «уже отправлено» ставится
// только после ответа ok. Сбой сети или ошибка сервера — те же данные уйдут при следующем сохранении,
// без самостоятельного цикла повторов.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const core = fs.readFileSync('js/core.js', 'utf8');
const src = core.slice(core.indexOf('const Cloud ='), core.indexOf('const Coins ='));
assert.ok(src.includes('function pushSrv'), 'Cloud block found in core.js');

function setup() {
  const sent = [], timers = [], beacons = [];
  let next = [];          // очередь ответов fetch: 'drop' | 'pending' | номер HTTP-статуса
  const pending = [];
  const ctx = {
    TG: { initData: 'init' },
    CONFIG: { api: 'https://api.test' },
    Store: { d: { coins: 100, rw: { trophies: 5 }, ts: 1 } },
    Board: { ready: () => true, post: async () => ({ ok: true, data: null }) },
    navigator: { sendBeacon: (url, body) => { beacons.push(body); return true; } },
    document: { hidden: false, addEventListener() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    fetch: (url, opts) => {
      sent.push(JSON.parse(opts.body));
      const kind = next.length ? next.shift() : 200;
      if (kind === 'drop') return Promise.reject(new TypeError('Failed to fetch'));
      if (kind === 'pending') return new Promise((ok) => pending.push(ok));
      return Promise.resolve({ ok: kind >= 200 && kind < 300, status: kind });
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src + '\nglobalThis.testCloud = Cloud;', ctx);
  const flush = () => new Promise((ok) => setImmediate(ok));
  return { ctx, Cloud: ctx.testCloud, sent, timers, beacons, pending, flush, queue: (...k) => { next = k; } };
}

(async () => {
  // 1. Сеть упала → следующая попытка с теми же данными всё равно уходит; после ok — повтора нет.
  {
    const t = setup();
    t.queue('drop', 200);
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 1, 'first push reached fetch');
    assert.equal(t.timers.length, 0, 'a failed request does not schedule its own retry');
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 2, 'same data is pushed again after a failed request');
    assert.equal(JSON.parse(t.sent[1].data).coins, 100);
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 2, 'after an ok response the unchanged save is not sent again');
    t.ctx.Store.d.coins = 120;
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 3, 'changed data is still pushed');
  }
  // 2. Сервер ответил ошибкой (не ok) → тоже считается неотправленным.
  {
    const t = setup();
    t.queue(500, 200);
    t.Cloud.pushSrv();
    await t.flush();
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 2, 'HTTP error is retried on the next attempt');
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 2, 'then marked as sent');
  }
  // 3. Пока запрос в пути, те же данные второй раз не шлём; после сбоя — шлём.
  {
    const t = setup();
    t.queue('pending', 200);
    t.Cloud.pushSrv();
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 1, 'no duplicate while the same save is in flight');
    t.pending[0]({ ok: false, status: 503 });
    await t.flush();
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 2, 'retried once the in-flight request failed');
  }
  // 4. Через обычное сохранение: сбой → следующее Store.save() (schedule) отправляет снова.
  {
    const t = setup();
    t.queue('drop', 200);
    await t.Cloud.pull();                  // готовность + первая отправка
    await t.flush();
    assert.equal(t.sent.length, 1);
    t.Cloud.schedule();                    // следующее сохранение ставит отложенную отправку
    const timer = t.timers.find((x) => x.ms === 120000);
    assert.ok(timer, 'server push is still throttled by the 2-minute timer');
    timer.fn();
    await t.flush();
    assert.equal(t.sent.length, 2, 'failed save is resent on the next save attempt');
  }
  // 5. Beacon (при сворачивании) ответа не даёт — метку не ставим, следующий push отправит данные.
  {
    const t = setup();
    t.Cloud.pushSrv(true);
    assert.equal(t.beacons.length, 1);
    t.Cloud.pushSrv();
    await t.flush();
    assert.equal(t.sent.length, 1, 'beacon without a response is not treated as confirmed');
  }
  console.log('Cloud save: server backup is marked sent only after an ok response; failed pushes retry on the next save');
})().catch((e) => { console.error(e); process.exit(1); });
