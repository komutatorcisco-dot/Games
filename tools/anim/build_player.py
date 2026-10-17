# Сборка игрока для «Удара»: персонаж Mixamo (FBX с кожей) + движения Mixamo (FBX без кожи) → один GLB.
# Запуск: <python с модулем bpy> build_player.py <персонаж.fbx> <папка с движениями> <выход.glb>
# Текстуры уменьшаются до 1024 (или --tex=2048), у костей убирается приставка mixamorig, пальцы в движениях не храним (меньше файл).
import bpy, sys, re, os
args = [a for a in sys.argv[1:] if not a.startswith('--')]; char, adir, dst = args[-3:]
# все движения из папки: ключ — имя файла без .fbx (пробелы и скобки → _), например «goalkeeper diving save (2)» → goalkeeper_diving_save_2
NOANIM = '--noanim' in sys.argv
CLIPS = {} if NOANIM else {re.sub(r'[^a-z0-9]+', '_', f[:-4].lower()).strip('_'): f[:-4] for f in sorted(os.listdir(adir)) if f.lower().endswith('.fbx') and 'bot' not in f.lower()}
strip = lambda n: re.sub(r'^mixamorig\d*:', '', n)
FINGER = re.compile(r'(Thumb|Index|Middle|Ring|Pinky)\d|_End')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=char)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for b in arm.data.bones: b.name = strip(b.name)
TEX = int(next((a[6:] for a in sys.argv if a.startswith('--tex=')), 1024))  # --tex=2048 — текстуры почти как в оригинале
for im in bpy.data.images:
    if im.size[0] > TEX: im.scale(TEX, TEX)
arm.animation_data_create()
for key, name in CLIPS.items():
    f = os.path.join(adir, name + '.fbx')
    if not os.path.exists(f): print('нет', name); continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    a = next(o for o in new if o.type == 'ARMATURE')
    for b in a.data.bones: b.name = strip(b.name)  # пути в кривых движения обновляются сами
    act = a.animation_data.action; act.name = key; act.use_fake_user = True
    # пальцы и концы не анимируем; у всех костей, кроме таза, — только повороты
    # Blender 5: кривые лежат в слоях действия (layers → strips → channelbags)
    bags = [cb for l in act.layers for st in l.strips for cb in st.channelbags]
    for cb in bags:
        for fc in list(cb.fcurves):
            m = re.match(r'pose\.bones\["([^"]+)"\]\.(\w+)', fc.data_path)
            if not m: continue
            bone, prop = m.groups()
            if FINGER.search(bone) or (prop in ('location', 'scale') and bone != 'Hips') or prop == 'scale': cb.fcurves.remove(fc)
    tr = arm.animation_data.nla_tracks.new(); tr.name = key; tr.strips.new(key, int(act.frame_range[0]), act); tr.mute = True
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    print('движение', key, act.frame_range[:])
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
  export_image_format='WEBP', export_image_quality=82, export_optimize_animation_size=True, export_anim_single_armature=True)
