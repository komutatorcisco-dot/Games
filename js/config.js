// Настройки, которые меняются без правки кода игр.
// api — адрес Cloudflare Worker из server/worker.js (например 'https://jackson-games.ИМЯ.workers.dev'): рейтинг и донат.
// Пока пусто, вкладка «Рейтинг» пишет, что рейтинг скоро запустится, а кнопка доната скрыта.
// donateApi — старое имя того же адреса (можно оставить пустым). donateUrl — запасная ссылка на донат (Boosty и т.п.).
const CONFIG = {
  api: '',
  donateApi: '',
  donateUrl: '',
};
