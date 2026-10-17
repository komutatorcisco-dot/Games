# Сборка игрока для «Удара»: персонаж Mixamo (FBX с кожей) + движения Mixamo (FBX без кожи) → один GLB.
# Запуск: <python с модулем bpy> build_player.py <персонаж.fbx> <папка с движениями> <выход.glb>
# Текстуры уменьшаются до 1024, у костей убирается приставка mixamorig, пальцы в движениях не храним (меньше файл).
import bpy, sys, re, os
char, adir, dst = sys.argv[-3:]
CLIPS = { 'kick': 'soccer penalty kick', 'kick2': 'kick soccerball', 'idle': 'offensive idle', 'jog': 'jog forward',
  'gk_idle': 'goalkeeper idle', 'gk_dive': 'goalkeeper diving save', 'gk_dive2': 'goalkeeper diving save (2)',
  'gk_catch': 'goalkeeper catch', 'gk_block': 'goalkeeper body block', 'gk_miss': 'goalkeeper miss', 'gk_step': 'goalkeeper sidestep' }
strip = lambda n: re.sub(r'^mixamorig\d*:', '', n)
FINGER = re.compile(r'(Thumb|Index|Middle|Ring|Pinky)\d|_End')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=char)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for b in arm.data.bones: b.name = strip(b.name)
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024)
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
