// Сервер доната для бота @JacksonGamesbot: Cloudflare Worker (бесплатный тариф).
// Делает две вещи:
//   1) GET /invoice?stars=100 — создаёт счёт в Telegram Stars и отдаёт ссылку, игра открывает его через Telegram.WebApp.openInvoice;
//   2) POST /webhook — принимает обновления бота: подтверждает платёж (pre_checkout_query) и благодарит за донат.
// Токен бота хранится в секрете BOT_TOKEN (Settings → Variables and Secrets), в коде его нет.

const ALLOWED = [50, 100, 250, 500, 1000];
const ORIGIN = 'https://komutatorcisco-dot.github.io';

const tg = (env, method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

const cors = (res) => {
  res.headers.set('access-control-allow-origin', ORIGIN);
  res.headers.set('access-control-allow-methods', 'GET, OPTIONS');
  return res;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    if (url.pathname === '/invoice') {
      const stars = Number(url.searchParams.get('stars'));
      if (!ALLOWED.includes(stars)) return cors(Response.json({ ok: false, error: 'bad amount' }, { status: 400 }));
      const nick = (url.searchParams.get('nick') || '').slice(0, 32);
      const r = await tg(env, 'createInvoiceLink', {
        title: 'Поддержка «Старики Джексоны»',
        description: `Спасибо за поддержку игр канала!${nick ? ' От: ' + nick : ''}`,
        payload: JSON.stringify({ stars, nick, t: Date.now() }),
        currency: 'XTR', // Telegram Stars: provider_token не нужен
        prices: [{ label: `${stars} ⭐`, amount: stars }],
      });
      return cors(Response.json(r.ok ? { ok: true, link: r.result } : { ok: false, error: r.description }));
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      // защита: Telegram присылает секрет, заданный в setWebhook
      if (env.WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const u = await request.json();
      if (u.pre_checkout_query) {
        await tg(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
      } else if (u.message && u.message.successful_payment) {
        const p = u.message.successful_payment;
        await tg(env, 'sendMessage', { chat_id: u.message.chat.id, text: `Спасибо за ${p.total_amount} ⭐! Это очень помогает каналу 🙌` });
      } else if (u.message && u.message.text === '/start') {
        await tg(env, 'sendMessage', {
          chat_id: u.message.chat.id, text: 'Футбольные мини-игры канала «Старики Джексоны» ⚽',
          reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: `${ORIGIN}/Games/` } }]] },
        });
      }
      return new Response('ok');
    }
    return new Response('Jackson donate worker', { status: 200 });
  },
};
