# Позы футболиста: stand, run, kick — отдельные действия (Actions) скелета JG_Rig.
# Запуск после build_player.py:
#   exec(open(r"<repo>/tools/art/player/poses.py", encoding="utf-8").read())
# Повороты заданы в осях мира: X — влево от игрока, -Y — куда он смотрит, Z — вверх.
# Порядок важен: сначала родитель, потом ребёнок.
import bpy
from mathutils import Matrix, Vector

rig = bpy.data.objects['JG_Rig']
PLAYER = bpy.data.objects['JG_Player']
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
T = 'twist'   # поворот кости вокруг её собственной оси

# A-поза -> руки вдоль тела (общая база для всех поз)
BASE = [
    ('LeftArm', Y, 32), ('RightArm', Y, -32),
    ('LeftForeArm', X, 35), ('RightForeArm', X, 35),     # убрать сгиб рук вперёд из исходной позы
    ('LeftForeArm', T, 75), ('RightForeArm', T, -75),    # ладони к бёдрам, а не вперёд
]

POSES = {
    'stand': BASE + [
        ('LeftForeArm', X, -12), ('RightForeArm', X, -12),
        ('LeftUpLeg', Y, 3), ('RightUpLeg', Y, -3),
    ],
    'run': BASE + [
        ('Spine', X, 14), ('Spine1', X, 4), ('Head', X, -14),
        ('Hips', Z, -8),
        ('RightUpLeg', X, -55), ('RightLeg', X, 70), ('RightFoot', X, 10),
        ('LeftUpLeg', X, 28), ('LeftLeg', X, 75), ('LeftFoot', X, 15),
        ('LeftArm', X, -22), ('LeftForeArm', X, -95),
        ('RightArm', X, 50), ('RightForeArm', X, -80),
        ('LeftForeArm', T, 45), ('RightForeArm', T, -60),     # кулаки ладонью внутрь
    ],
    'kick': BASE + [
        ('Spine', X, -10), ('Spine', Z, 12), ('Head', X, 16),
        ('Hips', Z, 10),
        ('RightUpLeg', X, -55), ('RightLeg', X, 22), ('RightFoot', X, 35),
        ('LeftUpLeg', X, -14), ('LeftLeg', X, 26), ('LeftFoot', X, -10),
        ('LeftArm', Y, -45), ('LeftArm', X, -25), ('LeftForeArm', X, -20),
        ('RightArm', Y, 40), ('RightArm', X, 30), ('RightForeArm', X, -20),
        ('LeftForeArm', T, 45),
    ],
    # второй шаг бега: другая нога и рука впереди, корпус ниже (вместе с run — цикл из двух кадров)
    'run2': BASE + [
        ('Spine', X, 18), ('Spine1', X, 4), ('Head', X, -16),
        ('Hips', Z, 8),
        ('LeftUpLeg', X, -60), ('LeftLeg', X, 65), ('LeftFoot', X, 10),
        ('RightUpLeg', X, 30), ('RightLeg', X, 85), ('RightFoot', X, 15),
        ('RightArm', X, -22), ('RightForeArm', X, -95),
        ('LeftArm', X, 50), ('LeftForeArm', X, -80),
        ('RightForeArm', T, -45), ('LeftForeArm', T, 60),
    ],
    # замах перед ударом: бьющая нога отведена назад, колено согнуто
    'kick2': BASE + [
        ('Spine', X, 6), ('Spine', Z, -10), ('Head', X, 6),
        ('Hips', Z, -6),
        ('RightUpLeg', X, 28), ('RightLeg', X, 95), ('RightFoot', X, 30),
        ('LeftUpLeg', X, -10), ('LeftLeg', X, 22), ('LeftFoot', X, -8),
        ('LeftArm', Y, -55), ('LeftArm', X, -20), ('LeftForeArm', X, -20),
        ('RightArm', Y, 35), ('RightArm', X, 25), ('RightForeArm', X, -20),
        ('LeftForeArm', T, 45),
    ],
}

def pb(n): return rig.pose.bones['mixamorig:' + n]

def reset():
    for b in rig.pose.bones:
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0); b.scale = (1, 1, 1)
    bpy.context.view_layer.update()

def rotate(name, axis, deg):
    import math
    b = pb(name)
    if axis == T:
        axis = b.matrix.to_3x3().col[1].normalized()
    head = b.matrix.to_translation()
    R = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-head)
    b.matrix = R @ b.matrix
    bpy.context.view_layer.update()

def ground():
    """Опустить/поднять Hips, чтобы нижняя точка тела стояла на z=0."""
    dg = bpy.context.evaluated_depsgraph_get()
    e = PLAYER.evaluated_get(dg); me = e.to_mesh()
    zmin = min((PLAYER.matrix_world @ v.co).z for v in me.vertices)
    e.to_mesh_clear()
    h = pb('Hips')
    m = h.matrix.copy(); m.translation.z -= zmin
    h.matrix = m
    bpy.context.view_layer.update()

def apply(name):   # пальцев в скелете нет: кисть цельная, сгиб пальцев запечён в сетку
    detach()
    reset()
    for bone, axis, deg in POSES[name]:
        rotate(bone, axis, deg)
    ground()

def detach():
    """Снять действие и выключить NLA, иначе Blender подмешивает прошлую позу к новой."""
    ad = rig.animation_data
    if ad:
        ad.action = None
        for t in ad.nla_tracks: t.mute = True

def bake_actions():
    rig.animation_data_create()
    ad = rig.animation_data
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for name in POSES:
        apply(name)
        act = bpy.data.actions.get(name)
        if act: bpy.data.actions.remove(act)
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        for b in rig.pose.bones:
            b.keyframe_insert('rotation_quaternion', frame=1, group=b.name)
            b.keyframe_insert('location', frame=1, group=b.name)
    rig.animation_data.action = None
    # NLA-дорожки: экспорт glTF кладёт каждое действие отдельной анимацией
    ad = rig.animation_data
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for name in POSES:
        t = ad.nla_tracks.new(); t.name = name
        t.strips.new(name, 1, bpy.data.actions[name]); t.mute = True
    reset()
