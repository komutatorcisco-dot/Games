// Прототип: рисованные иконки (img/icons/*.webp) внутри существующих кнопок. Расположение не меняется —
// заменяется только картинка в уже существующем месте значка. Для сравнения на скриншотах.
(() => {
  const MAP = [
    ['[data-rwtab="road"] .sr-i', 'road'], ['[data-rwtab="cards"] .sr-i', 'gallery'], ['[data-rwtab="pass"] .sr-i', 'pass'],
    ['[data-rwtab="quests"] .sr-i', 'quests'], ['.sr-b[data-act="squad"] .sr-i', 'squad'], ['.sr-b[data-act="sbc"] .sr-i', 'sbc'],
    ['.h2-sb[data-act="dly"] .h2-sbi', 'daily'], ['.h2-sb[data-act="squad"] .h2-sbi', 'squad'], ['.h2-sb[data-act="online"] .h2-sbi', 'online'],
    ['[data-cltab="chest"]', 'chest', 'svg'], ['[data-cltab="league"]', 'league', 'svg'], ['.kb-chi', 'chest'],
    ['.h2-road .h2-tro', 'cup1'], ['#profile .pf-tiles [data-act="achievements"] > span', 'cup2'],
    ['.ps-cell .rs-coins', 'coins'], ['.kb-tier .rs-coins', 'coins'],
  ];
  const img = (n) => `<img class="ji" src="img/icons/${n}-192.webp" alt="" decoding="async">`;
  function apply(root = document) {
    for (const [sel, n, inner] of MAP) root.querySelectorAll(sel).forEach((el) => {
      if (el.dataset.ji === n) return;
      if (inner) { const s = el.querySelector(inner); if (s) s.outerHTML = img(n); } else el.innerHTML = img(n);
      el.dataset.ji = n;
    });
  }
  new MutationObserver(() => apply()).observe(document.body, { childList: true, subtree: true });
  apply();
})();
