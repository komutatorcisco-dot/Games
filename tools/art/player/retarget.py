# Перенос анимаций Mixamo («Soccer Game Pack») на скелет JG_Rig (Mixamo-имена, 22 кости, без пальцев).
# Источник — игрок Mixamo с анимациями (в репозитории: ветка claude/amazing-faraday-ofy7um,
# prototypes/shot/assets/player.glb). Сами файлы Mixamo отдельно не выкладываем — только вшитыми в модель.
#
# Запуск в Blender после build_player.py (или в открытом jg-player.blend):
#   exec(open(r"<repo>/tools/art/player/retarget.py", encoding="utf-8").read())
#   retarget_all(r"<путь>/player.glb")          # создаёт действия a_<имя> на JG_Rig
#
# Как переносится: для каждой кости берём поворот источника относительно его позы покоя (в мире)
# и применяем к позе покоя нашей кости. Позы покоя разные (T и A) — так это не мешает.
# Бёдра: смещение масштабируется по высоте таза; у циклов (бег, стойка) смещение по полу убирается.
import bpy
from mathutils import Matrix, Quaternion, Vector

# имя у нас → (анимация Mixamo, на месте?)
CLIPS = {
    'idle': ('soccer_idle', True),
    'jog': ('jog_forward', True),
    'strike': ('strike_foward_jog', True),
    'pass': ('kick_soccerball', True),
    'penalty': ('soccer_penalty_kick', True),
    'header': ('header_soccerball', True),
    'scissor': ('scissor_kick', False),
    'tackle': ('soccer_tackle', False),
    'receive': ('receive', True),
    'spin': ('soccer_spin', True),
    'juggle': ('stall_soccerball', True),
    'gk_idle': ('goalkeeper_idle', True),
    'gk_dive': ('goalkeeper_diving_save', False),
    'gk_catch': ('goalkeeper_catch', True),
}
PREFIX = 'mixamorig:'

def import_source(path):
    before = set(bpy.data.objects)
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    region = next(r for r in area.regions if r.type == 'WINDOW')
    with bpy.context.temp_override(window=win, area=area, region=region):
        bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE'); src.name = 'SRC_Rig'
    for o in new:   # сетки источника не нужны — только скелет с анимациями
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    return src

def rot(m):
    return m.to_3x3().normalized().to_quaternion()

def retarget(src, tgt, name, src_action, inplace):
    sc = bpy.context.scene
    act = bpy.data.actions[src_action]
    src.animation_data_create(); src.animation_data.action = act
    if src.animation_data.action_slot is None and len(act.slots):
        src.animation_data.action_slot = act.slots[0]
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    bones = [b for b in tgt.data.bones if b.name.startswith(PREFIX) and b.name[len(PREFIX):] in src.data.bones]
    order = sorted(bones, key=lambda b: len(b.parent_recursive))
    # позы покоя в мире
    t_rest = {b.name: rot(tgt.matrix_world @ b.matrix_local) for b in bones}
    s_rest = {b.name: rot(src.matrix_world @ src.data.bones[b.name[len(PREFIX):]].matrix_local) for b in bones}
    # позы покоя разные (у источника T, у нас A): сначала разворачиваем нашу кость вдоль кости источника
    # (кратчайшим поворотом, своё вращение вокруг оси кости сохраняется) — иначе разница поз уходит в движение
    Yax = Vector((0, 1, 0))
    for n in t_rest:
        t_rest[n] = (t_rest[n] @ Yax).rotation_difference(s_rest[n] @ Yax) @ t_rest[n]
    L = {b.name: (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local.copy() for b in bones}
    hips = tgt.data.bones[PREFIX + 'Hips']
    t_hip0 = (tgt.matrix_world @ hips.matrix_local).translation
    s_hip0 = (src.matrix_world @ src.data.bones['Hips'].matrix_local).translation
    k = t_hip0.z / s_hip0.z
    tw_inv = rot(tgt.matrix_world).inverted()

    out = bpy.data.actions.get('a_' + name)
    if out: bpy.data.actions.remove(out)
    out = bpy.data.actions.new('a_' + name); out.use_fake_user = True
    tgt.animation_data_create(); tgt.animation_data.action = out
    prev = {}
    start_xy = None
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        A = {}
        for b in order:
            spb = src.pose.bones[b.name[len(PREFIX):]]
            sw = rot(src.matrix_world @ spb.matrix)
            A[b.name] = tw_inv @ ((sw @ s_rest[b.name].inverted()) @ t_rest[b.name])
        for b in order:
            pb = tgt.pose.bones[b.name]
            Ap = A[b.parent.name] if b.parent and b.parent.name in A else Quaternion()
            q = L[b.name].to_quaternion().inverted() @ Ap.inverted() @ A[b.name]
            if b.name in prev and prev[b.name].dot(q) < 0: q.negate()   # без переворотов между кадрами
            prev[b.name] = q.copy()
            pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f - f0 + 1, group=b.name)
            if b == hips:
                sp = (src.matrix_world @ src.pose.bones['Hips'].matrix).translation
                d = (sp - s_hip0) * k
                if start_xy is None: start_xy = d.xy.copy()
                if inplace: d.x = d.y = 0.0
                else: d.x -= start_xy.x; d.y -= start_xy.y          # клип начинается в точке игрока
                P = tgt.matrix_world.inverted() @ (t_hip0 + d)
                M = Matrix.Translation(P) @ A[b.name].to_matrix().to_4x4()
                pb.location = (L[b.name].inverted() @ M).translation
                pb.keyframe_insert('location', frame=f - f0 + 1, group=b.name)
    tgt.animation_data.action = None
    return out, f1 - f0 + 1

def retarget_all(path, clips=CLIPS):
    tgt = bpy.data.objects['JG_Rig']
    src = bpy.data.objects.get('SRC_Rig') or import_source(path)
    fps = bpy.context.scene.render.fps
    res = []
    for name, (sa, inplace) in clips.items():
        a, n = retarget(src, tgt, name, sa, inplace)
        res.append((name, n, round(n / fps, 2)))
    src.animation_data.action = None
    return res
