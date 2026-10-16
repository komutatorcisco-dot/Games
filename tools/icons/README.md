# Иконки игр и меню

- `cut.py` — вырезает иконку из присланной плитки (картинки 1254×1254 с подписью) → прозрачный PNG.
- `render.js` — рисует иконку в общем стиле (обводка, объём, блик) из SVG: рисунки игр берёт из `js/icons.js` (MAP),
  значки меню — из `extra2.js`, ИПК — из `extra.js`.
  Запуск: `OUTD=out node render.js ttt daily squad` → PNG 256×256; потом сжать в webp 192 px
  и положить в `img/games/<ключ>.webp` (игры) или `img/ui2/<имя>.webp` (меню). После замены поднять `V` в `js/icons.js`.

## 3D (стиль Brawl Stars)

- `3d/models.js` — модели иконок из 3D-фигур, `3d/scene.html` — свет, чёткие линии между деталями и обводка, `3d/render.js` — запуск.
  Нужен пакет three: `cd 3d && npm i three@0.169.0 --no-save` (папка node_modules в репозиторий не идёт).
  Запуск: `cd 3d && OUTD=out node render.js ttt guess shop` → PNG 256×256.
- `render2d.js` — 2D в стиле Brawl Stars (обводка у каждой детали, жёсткая тень, блик): `OUTD=out node render2d.js squad ttt`.
- `PROMPTS.md` — подсказки для нейросети, если иконки рисуются там.
