// Настройки, которые меняются без правки кода игр.
// api — адрес Cloudflare Worker из server/worker.js (например 'https://jackson-games.ИМЯ.workers.dev'): рейтинг и донат.
// Пока пусто, вкладка «Рейтинг» пишет, что рейтинг скоро запустится, а кнопка доната скрыта.
// donateApi — старое имя того же адреса (можно оставить пустым). donateUrl — запасная ссылка на донат (Boosty и т.п.).
const CONFIG = {
  economyStaging: false, // Enable only in a private staging build for allowlisted test accounts.
  economyApi: '',
  api: 'https://jackson-games.komutatorcisco.workers.dev',
  donateApi: '',
  donateUrl: '',
};

// A private staging build must never send legacy requests to the live Worker.
if (CONFIG.economyStaging) {
  const productionApi = CONFIG.api;
  CONFIG.api = CONFIG.economyApi && CONFIG.economyApi !== productionApi ? CONFIG.economyApi : '';
  CONFIG.donateApi = '';
}
