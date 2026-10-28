# Чужие материалы в 3D-футболисте (assets3d/player.glb)

- Тело, глаза, брови, причёски, кожа — MakeHuman / MPFB 2 (makehumancommunity.org), CC0.
- Движения idle, jog, strike, pass, penalty, header, scissor, tackle, receive, spin, juggle, gk_idle, gk_dive, gk_catch —
  Mixamo «Soccer Game Pack» (Adobe), перенесены на наш скелет (`retarget.py`). Используются в игре по условиям Mixamo:
  только вшитыми в модель, исходные файлы анимаций не распространяются. Источник для переноса — игрок из прототипа
  «Удар» (ветка `claude/amazing-faraday-ofy7um`, `prototypes/shot/assets/player.glb`), в этой ветке его нет.
- Позы stand, run, run2, kick, kick2 и сборка формы — свои (`build_player.py`, `poses.py`).
