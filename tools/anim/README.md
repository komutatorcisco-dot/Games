# Игрок и движения для «Удара» (Mixamo)

- Персонаж — Mixamo «Ch38» (FBX с кожей), движения — Mixamo «Soccer Game Pack» (FBX без кожи).
  По условиям Mixamo их можно бесплатно использовать в игре, но исходные FBX не распространяем — в репозитории их нет.
- `build_player.py` — Blender (модуль bpy): берёт персонажа, надевает на его скелет движения из списка `CLIPS`,
  уменьшает текстуры до 1024, убирает приставку mixamorig у костей и пальцы из движений → один GLB.
  `python build_player.py Ch38_nonPBR.fbx <папка с движениями> player_anim.glb`
- Затем облегчение (gltfpack 0.22):
  `python build_player.py --tex=2048 Ch38_nonPBR.fbx <папка> player_anim.glb`
  `gltfpack -i player_anim.glb -o prototypes/shot/assets/player.glb -cc -af 30 -kn -noq` (сетку не упрощаем — модель как в оригинале)
  (`-kn` сохраняет имена частей: футболка, шорты и гетры перекрашиваются по отдельности).
