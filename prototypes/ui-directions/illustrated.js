// Направление 3 — оригинальные рисованные иконки (SVG 48×48): тёмный контур, светлая и тёмная грань, блик.
// Прототип для сравнения: подменяет Ui.get только для этих имён, остальные иконки — прежние.
(() => {
  const O = '#1a1033'; // контур
  const ol = `stroke="${O}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
  const hl = (d) => `<path d="${d}" fill="#fff" opacity=".55"/>`;
  const ILL = {
    // кубок: золото, правая половина в тени, бордовое основание
    trophy: `<path d="M13 7h22v9a11 11 0 0 1-22 0z" fill="#ffd23f" ${ol}/>
      <path d="M24 7h11v9a11 11 0 0 1-11 11z" fill="#f2a516"/>
      <path d="M13 10H8.5a5.5 5.5 0 0 0 6 8 M35 10h4.5a5.5 5.5 0 0 1-6 8" fill="none" ${ol}/>
      <path d="M21 27h6v6h-6z" fill="#e0901a" ${ol}/>
      <path d="M14.5 33h19a2 2 0 0 1 2 2v5h-23v-5a2 2 0 0 1 2-2z" fill="#a8452a" ${ol}/>
      <path d="M12.5 37h23v3h-23z" fill="#7a2c1c"/>
      ${hl('M16 10h3v7a6 6 0 0 0 1.4 3.8C17.6 19.6 16 17.6 16 15z')}
      <path d="M21.5 15.5l2.5-5 2.5 5-2.5 2.3z" fill="#fff6c8"/>`,
    // галерея: две карточки, передняя с гербом «ДЖ»
    pack: `<rect x="9" y="8" width="20" height="28" rx="3.5" transform="rotate(-12 19 22)" fill="#8f5cf6" ${ol}/>
      <rect x="18" y="10" width="21" height="29" rx="3.5" fill="#3b8cf0" ${ol}/>
      <path d="M18 13.5a3.5 3.5 0 0 1 3.5-3.5h14a3.5 3.5 0 0 1 3.5 3.5v3H18z" fill="#8cc6ff"/>
      <path d="M23.5 20h10v6.5c0 3-2.4 5-5 6.3-2.6-1.3-5-3.3-5-6.3z" fill="#ffd23f" ${ol}/>
      <path d="M28.5 20h5v6.5c0 3-2.4 5-5 6.3z" fill="#f2a516"/>
      ${hl('M20 12.5h3v3h-3z')}`,
    // пропуск: гранёная звезда с искрой
    star: `<path d="M24 5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L24 33.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill="#ffd23f" ${ol}/>
      <path d="M24 5v28.7l11.2 5.9-2.1-12.5 9.1-8.9-12.6-1.8z" fill="#f2a516"/>
      <path d="M24 13l2.8 5.8 6.4.9-4.6 4.5L24 21.6z" fill="#fff4b8" opacity=".85"/>
      <path d="M38.5 5.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z" fill="#fff"/>`,
    // задания: мишень и дротик
    target: `<circle cx="22" cy="26" r="16" fill="#ef4444" ${ol}/>
      <circle cx="22" cy="26" r="11" fill="#fff"/><circle cx="22" cy="26" r="6.5" fill="#ef4444"/><circle cx="22" cy="26" r="2.6" fill="#fff"/>
      <path d="M22 10a16 16 0 0 1 16 16H22z" fill="#000" opacity=".12"/>
      <path d="M23 25L38 10" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/><path d="M23 25L38 10" stroke="#ffd23f" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M36 7l6-1-1 6-4 1z" fill="#3fd26b" ${ol}/>
      ${hl('M11 20a12 12 0 0 1 6-6.5l1 2a10 10 0 0 0-5 5.5z')}`,
    // состав: футболка с номером 10
    shirt: `<path d="M17 7l-10 5 3.5 9 4.5-2v21h18V19l4.5 2 3.5-9-10-5c-1 3-3.6 4.6-7 4.6S18 10 17 7z" fill="#2fcf6a" ${ol}/>
      <path d="M24 11.6c3.4 0 6-1.6 7-4.6l10 5-3.5 9-4.5-2v21h-9z" fill="#1c9a4b"/>
      <path d="M19.5 8.2c1.1 2 2.6 3 4.5 3s3.4-1 4.5-3" fill="none" stroke="#fff" stroke-width="2"/>
      <text x="24" y="33" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="900" font-size="12" fill="#fff" stroke="${O}" stroke-width="2.2" paint-order="stroke">10</text>
      ${hl('M10 13l5-2.5 1.6 4-4.6 2.3z')}`,
    // ИПК: две карточки и стрелки обмена
    puzzle: `<rect x="6" y="11" width="16" height="22" rx="3" fill="#8f5cf6" ${ol}/>
      <rect x="26" y="15" width="16" height="22" rx="3" fill="#ffd23f" ${ol}/>
      <path d="M26 18a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2H26z" fill="#fff4b8"/>
      <path d="M13 38c2.5 4 8 5 12 2" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M13 38c2.5 4 8 5 12 2" fill="none" stroke="#3fd26b" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M35 10c-2.5-4-8-5-12-2" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M35 10c-2.5-4-8-5-12-2" fill="none" stroke="#3fd26b" stroke-width="2.4" stroke-linecap="round"/>
      <text x="14" y="26" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="900" font-size="9" fill="#fff">ДЖ</text>`,
    // сундук: подарочная коробка с лентой
    gift: `<path d="M9 21h30v19a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z" fill="#ef4444" ${ol}/>
      <path d="M24 21h15v19a2 2 0 0 1-2 2H24z" fill="#c22a3a"/>
      <rect x="6" y="14" width="36" height="8" rx="2" fill="#ff6b6b" ${ol}/>
      <path d="M21 14h6v28h-6z" fill="#ffd23f" ${ol}/>
      <path d="M24 14c-3-6-11-7-10-2 .5 2.5 6 2.5 10 2zm0 0c3-6 11-7 10-2-.5 2.5-6 2.5-10 2z" fill="#ffd23f" ${ol}/>
      ${hl('M9 16h7v3H9z')}`,
    // участники: двое игроков
    users: `<circle cx="31" cy="15" r="6.5" fill="#5aa8ff" ${ol}/><path d="M20 38c0-7 5-11 11-11s11 4 11 11z" fill="#3b7ff0" ${ol}/>
      <circle cx="18" cy="17" r="7.5" fill="#ffd23f" ${ol}/><path d="M5 41c0-8 6-12.5 13-12.5S31 33 31 41z" fill="#f2a516" ${ol}/>
      ${hl('M14 13a4 4 0 0 1 3-2.5v2.4a2 2 0 0 0-1.5 1.3z')}`,
    // чат: облачко сообщения
    send: `<path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H22l-9 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" fill="#5aa8ff" ${ol}/>
      <path d="M24 10h16a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H24z" fill="#3b7ff0"/>
      <circle cx="16" cy="21.5" r="2.6" fill="#fff"/><circle cx="24" cy="21.5" r="2.6" fill="#fff"/><circle cx="32" cy="21.5" r="2.6" fill="#fff"/>
      ${hl('M9 13h8v2.5H9z')}`,
    // замок
    lock: `<path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="#c9cfe0" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="10" y="20" width="28" height="21" rx="4" fill="#ffd23f" ${ol}/><path d="M24 20h10a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H24z" fill="#f2a516"/>
      <circle cx="24" cy="29" r="3" fill="${O}"/><path d="M22.8 30h2.4l1 5h-4.4z" fill="${O}"/>`,
  };
  const orig = Ui.get;
  Ui.get = (name, cls = '') => (ILL[name] ? `<svg class="ui-ic ill ${cls}" viewBox="0 0 48 48" aria-hidden="true">${ILL[name]}</svg>` : orig(name, cls));
})();
