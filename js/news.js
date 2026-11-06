// Новое видео канала (6.11): при входе — карточка «Вышло новое видео» один раз на каждое видео; на главной — плашка
// несколько дней. Без наград и без блокировки: можно закрыть и играть дальше (правила YouTube запрещают награды
// за просмотр, лайк, подписку и комментарий). Новое видео — поменять VIDEO ниже и картинку в img/news/.
'use strict';

const News = (() => {
  const VIDEO = { id: 'Ksb0ULrlrxw', title: 'Сможем ли мы спасти Манчестер Юнайтед от вылета?', img: 'img/news/ksb0ulrlrxw.webp', until: '2026-11-09T21:00:00Z' };
  const url = () => `https://youtu.be/${VIDEO.id}`;
  const S = () => { const d = Store.d; if (!d.news || typeof d.news !== 'object') d.news = { seen: [] }; if (!Array.isArray(d.news.seen)) d.news.seen = []; return d.news; };
  const fresh = () => Date.now() < Date.parse(VIDEO.until);
  function watch() {
    try { if (typeof TG !== 'undefined' && TG && TG.openLink) TG.openLink(url()); else window.open(url(), '_blank'); } catch (e) { window.open(url(), '_blank'); }
    if (typeof Track !== 'undefined' && Track.event) safe('news', () => Track.event('news:' + VIDEO.id));
  }
  // плашка на главной, пока видео свежее
  const bar = () => (fresh() ? `<button class="nw-bar" data-act="news"><img src="${VIDEO.img}" alt=""><span><small>Новое видео на канале</small><b>${esc(VIDEO.title)}</b></span><em>Смотреть</em></button>` : '');
  function card() {
    S().seen = S().seen.concat(VIDEO.id).slice(-20); Store.save();
    Modal.open(`<div class="nw-card"><span class="nw-pic"><img src="${VIDEO.img}" alt=""><i class="nw-play"></i></span>
      <small>Вышло новое видео</small><h2>${esc(VIDEO.title)}</h2><p>Старики Джексоны на YouTube</p></div>`,
    [{ label: 'Смотреть на YouTube', cls: 'gold', onClick: watch }, { label: 'Играть дальше', cls: 'ghost' }]);
  }
  // при входе: один раз на видео, когда ничего другого не открыто (подписка на канал, обучение, окна)
  function maybeShow(tries = 0) {
    if (!fresh() || S().seen.includes(VIDEO.id)) return;
    const busy = document.body.classList.contains('gated') || document.querySelector('.gate:not(.out)') || (typeof Modal !== 'undefined' && Modal.isOpen) || (Screens.current && Screens.current !== 'hub');
    if (busy) { if (tries < 40) setTimeout(() => maybeShow(tries + 1), 3000); return; }
    card();
  }
  return { bar, card, watch, maybeShow, VIDEO };
})();
