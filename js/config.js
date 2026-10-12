// Настройки, которые меняются без правки кода игр.
// api — адрес Cloudflare Worker из server/worker.js (например 'https://jackson-games.ИМЯ.workers.dev'): рейтинг и донат.
// Пока пусто, вкладка «Рейтинг» пишет, что рейтинг скоро запустится, а кнопка доната скрыта.
// donateApi — старое имя того же адреса (можно оставить пустым). donateUrl — запасная ссылка на донат (Boosty и т.п.).
// ?stage=1 — проверочный сервер (staging) для новых функций до включения всем; адрес фиксированный.
const STAGE = /[?&]stage=1(&|$)/.test(location.search);
const CONFIG = {
  api: STAGE ? 'https://jackson-games-staging.komutatorcisco.workers.dev' : 'https://jackson-games.komutatorcisco.workers.dev',
  stage: STAGE,
  donateApi: '',
  donateUrl: '',
};
