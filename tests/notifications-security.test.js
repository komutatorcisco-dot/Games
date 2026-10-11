// Regression tests for emergency stop, deduplication and matchmaking. No real Telegram calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const sql = new DatabaseSync(':memory:');
const db = {
  prepare(text) {
    return {
      bind(...params) {
        let i = 0;
        const values = [];
        const query = text.replace(/\?(\d+)?/g, (_, n) => { values.push(params[n ? Number(n) - 1 : i++]); return '?'; });
        const stmt = sql.prepare(query);
        return {
          first: async () => stmt.get(...values) || null,
          all: async () => ({ results: stmt.all(...values) }),
          run: async () => {
            const r = stmt.run(...values);
            return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
          },
        };
      },
      async run() { return this.bind().run(); },
    };
  },
  async batch(items) {
    sql.exec('BEGIN');
    try {
      const out = [];
      for (const item of items) out.push(await item.run());
      sql.exec('COMMIT');
      return out;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const sent = [];
const mockFetch = async (url, args) => {
  const method = String(url).split('/').at(-1);
  const body = JSON.parse(args.body);
  sent.push({ method, body });
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
};
const ctx = {
  console, Date, crypto: require('node:crypto').webcrypto, TextEncoder, URL, Response, Request,
  fetch: mockFetch, setTimeout, clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('server/worker.js', 'utf8')
  .replace(/^export \{[^}]+\};/gm, '').replace('export default {', 'const worker = {')
  .replace(/^export /gm, '')
  + '\nglobalThis.audit = { schema, broadcast, reminders, adminCommand, events, matchmake, route };', ctx);
const api = ctx.audit;
const env = { DB: db, BOT_TOKEN: 'dummy-token', WEBHOOK_SECRET: 'private-webhook', ADMIN_CODE: 'private-admin' };
const countDelivered = () => sent.filter((x) => x.method === 'sendMessage' && x.body.chat_id === 42).length;
(async () => {
  await api.schema(db);
  sql.exec("INSERT INTO settings (k,v) VALUES ('admins','[7]')");
  sql.exec("INSERT INTO bot(chat,started,blocked) VALUES (42,0,0)");
  assert.equal(await api.broadcast(env, 'disabled'), 0);
  assert.equal(countDelivered(), 0, 'mailing must default to disabled');
  assert.equal(await api.reminders(env), 'рассылки отключены');

  await api.adminCommand(env, { chat: { id: 7, type: 'private' }, text: '/broadcast_on' });
  assert.equal(sql.prepare("SELECT v FROM settings WHERE k='broadcast:enabled'").get().v, '1');
  assert.equal(await api.broadcast(env, 'enabled'), 1);
  assert.equal(countDelivered(), 1);

  // The same Telegram update must never broadcast twice.
  const update = { update_id: 89123, message: { chat: { id: 7, type: 'private' }, text: '/broadcast Test' } };
  const webhook = () => api.route(new Request('https://worker.test/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'private-webhook' },
    body: JSON.stringify(update),
  }), env);
  assert.equal((await webhook()).status, 200);
  assert.equal((await webhook()).status, 200);
  assert.equal(countDelivered(), 2, 'duplicate webhook must not broadcast twice');
  const unsigned = await api.route(new Request('https://worker.test/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update),
  }), env);
  assert.equal(unsigned.status, 403, 'webhook must require a secret');

  await api.adminCommand(env, { chat: { id: 7, type: 'private' }, text: '/stop' });
  assert.equal(sql.prepare("SELECT v FROM settings WHERE k='broadcast:enabled'").get().v, '0');
  assert.equal(await api.broadcast(env, 'stopped'), 0);
  assert.equal(await api.reminders(env), 'рассылки отключены');
  assert.equal(countDelivered(), 2);

  const ev = [{ game: 'ng:wordle', kind: 'win', ms: 12000 }, { game: 'ng:wordle', kind: 'end', ms: 12000 }];
  const first = await api.events(env, { id: 42 }, { events: ev, batchId: 'batch-test-0001' });
  const twice = await api.events(env, { id: 42 }, { events: ev, batchId: 'batch-test-0001' });
  assert.equal(first.saved, 2);
  assert.equal(twice.duplicate, true);
  assert.equal(sql.prepare("SELECT n FROM evd WHERE game='ng:wordle' AND kind='win'").get().n, 1);
  assert.equal(sql.prepare("SELECT SUM(n) AS n FROM cwins WHERE id=42").get().n, 1);

  const p1 = await api.matchmake(env, { id: 1 }, { game: 'duel', code: 'ABCDE' });
  assert.equal(p1.role, 'host');
  const p2 = await api.matchmake(env, { id: 2 }, { game: 'duel', code: 'FGHIJ' });
  assert.equal(p2.role, 'join');
  assert.equal(p2.code, 'ABCDE');
  const p3 = await api.matchmake(env, { id: 3 }, { game: 'duel', code: 'KLMNO' });
  assert.equal(p3.role, 'host', 'the same host must not pair twice');
  console.log('Notifications, webhook, event deduplication and matchmaking: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
