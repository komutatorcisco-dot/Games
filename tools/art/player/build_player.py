# Сборка 3D-футболиста Jackson Games в Blender 5.2 + MPFB 2.
# Запуск в открытом Blender (через MCP или Text Editor):
#   exec(open(r"<repo>/tools/art/player/build_player.py", encoding="utf-8").read())
# Создаёт: JG_Body (скрыт, база MPFB), JG_Rig (скелет Mixamo), JG_Player (тело+форма),
# JG_Eyes, JG_Brows, JG_Hair_short|medium|afro. Материалы: skin, hair, shirt, shorts, socks, boots,
# eyes, brows, hair_*. Морфы телосложения slim/heavy/muscular. Ассеты MakeHuman/MPFB — CC0.
# Дальше: poses.py (позы), export_glb.py (assets3d/player.glb), render.py (img/fcm/player-*.webp).
import bpy, bmesh, os
from mathutils import Vector

OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'jg-blender')   # рабочие текстуры, вне репозитория
DATA = os.path.join(bpy.utils.user_resource('EXTENSIONS'), '.user', 'blender_org', 'mpfb', 'data')
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

# ---------- очистка прошлой сборки ----------
for o in list(bpy.data.objects):
    if o.name.startswith('JG_') or o.name.startswith('tmp_'):
        bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures):
    for d in list(coll):
        if d.users == 0:
            coll.remove(d)

# ---------- тело: молодой мужчина, худощавый спортивный, 185 см ----------
# Обобщённый игрок, не копия реального человека.
HEIGHT = 1.85
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0, age=0.42, muscle=0.7, weight=0.38, proportions=0.8, height=0.6)
macro['race'] = {'asian': 0.1, 'caucasian': 0.4, 'african': 0.5}
body = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True,
                                 feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
body.name = 'JG_Body'

def body_height():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); me = e.to_mesh()
    zs = [v.co.z for v in me.vertices]; e.to_mesh_clear()
    return min(zs), max(zs)

from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
lo, hi = 0.3, 0.9
for _ in range(9):   # подбираем «рост» MPFB под 185 см
    mid = (lo + hi) / 2
    HumanObjectProperties.set_value('height', mid, entity_reference=body)
    TargetService.reapply_macro_details(body)
    z0, z1 = body_height()
    if z1 - z0 > HEIGHT: hi = mid
    else: lo = mid
print('height', round(z1 - z0, 3))
rig = HumanService.add_builtin_rig(body, 'mixamo', import_weights=True)
rig.name = 'JG_Rig'

def add(asset, kind, name):
    o = HumanService.add_mhclo_asset(os.path.join(DATA, *asset), body, asset_type=kind,
                                     subdiv_levels=0, material_type='MAKESKIN')
    for m in list(o.modifiers):
        if m.type == 'SUBSURF':
            o.modifiers.remove(m)
    o.name = name
    return o

player = add(('proxymeshes', 'male1591', 'male1591.proxy'), 'Proxymeshes', 'JG_Player')
eyes = add(('eyes', 'low-poly', 'low-poly.mhclo'), 'Eyes', 'JG_Eyes')
brows = add(('eyebrows', 'eyebrow006', 'eyebrow006.mhclo'), 'Eyebrows', 'JG_Brows')
body.hide_set(True); body.hide_render = True

# ---------- материалы ----------
def bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

def flat(name, col, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_fake_user = True   # MPFB при загрузке ассетов чистит материалы без пользователей
    m.use_nodes = True
    b = bsdf(m)
    for n in [n for n in m.node_tree.nodes if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL')]:
        m.node_tree.nodes.remove(n)
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*col, 1)
    return m

def textured(name, src, size, rough, alpha=False):
    m = flat(name, (1, 1, 1), rough)
    out = os.path.join(OUT, 'jg_%s.png' % name)
    if not os.path.exists(out):
        img = bpy.data.images.load(src)
        img.scale(size, size)
        img.filepath_raw = out; img.file_format = 'PNG'; img.save()
        bpy.data.images.remove(img)
    im = bpy.data.images.load(out, check_existing=True); im.name = 'jg_' + name
    nt = m.node_tree
    for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE']:
        nt.nodes.remove(n)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im; t.location = (-400, 200)
    nt.links.new(t.outputs['Color'], bsdf(m).inputs['Base Color'])
    if alpha:   # вырез по прозрачности (glTF alphaMode MASK), без сортировки полупрозрачного
        gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.5; gt.location = (-200, -100)
        nt.links.new(t.outputs['Alpha'], gt.inputs[0])
        nt.links.new(gt.outputs[0], bsdf(m).inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
    return m

def blend_skin(out, a, b, t, size=1024):
    """Смешать две кожи MakeHuman (t — доля второй) и сохранить PNG size×size."""
    import numpy as np
    px = []
    for src in (a, b):
        im = bpy.data.images.load(src); im.scale(size, size)
        arr = np.empty(size * size * 4, dtype=np.float32); im.pixels.foreach_get(arr)
        px.append(arr); bpy.data.images.remove(im)
    res = px[0] * (1 - t) + px[1] * t
    im = bpy.data.images.new('tmp_skin', size, size, alpha=True)
    im.pixels.foreach_set(res); im.filepath_raw = out; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

def tint(m, col):
    """Цвет × текстура (в glTF это baseColorFactor): кожа одного рисунка красится кодом в любой тон."""
    nt = m.node_tree; b = bsdf(m)
    t = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0; mix.location = (-200, 200)
    nt.links.new(t.outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = (*col, 1)
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])

def stripes_png(out, c1, c2, n=10, size=512):
    """Образец майки: n вертикальных полос по кругу (развёртка майки: u — вокруг тела)."""
    import numpy as np
    u = (np.arange(size) + 0.5) / size
    band = (np.floor(u * n) % 2).astype(np.float32)[None, :, None]
    rgb = np.array(c1, np.float32)[None, None, :] * (1 - band) + np.array(c2, np.float32)[None, None, :] * band
    px = np.ones((size, size, 4), np.float32); px[..., :3] = rgb
    im = bpy.data.images.new('tmp_kit', size, size); im.pixels.foreach_set(px.ravel())
    im.filepath_raw = out; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)

os.makedirs(OUT, exist_ok=True)
# Кожа: светлая основа, тон задаётся цветом материала (SKIN_TONE) — в игре так же кодом.
SKIN_PNG = os.path.join(OUT, 'jg_skin.png')
blend_skin(SKIN_PNG,
           os.path.join(DATA, 'skins', 'young_caucasian_male', 'young_lightskinned_male_diffuse.png'),
           os.path.join(DATA, 'skins', 'young_african_male', 'young_darkskinned_male_diffuse.png'), 0.1)
KIT_PNG = os.path.join(OUT, 'jg_shirt.png')
# Образец формы: сине-гранатовые полосы (цвета клуба в духе «Барсы», без герба и спонсора)
stripes_png(KIT_PNG, (0.0, 0.16, 0.45), (0.45, 0.02, 0.12))
for im in [i for i in bpy.data.images if i.name.startswith(('jg_skin', 'jg_shirt'))]:
    bpy.data.images.remove(im)
SKIN_TONE = (0.62, 0.42, 0.30)
MAT = {
    'skin': textured('skin', SKIN_PNG, 1024, 0.5),
    'hair': flat('hair', (0.018, 0.012, 0.01), 0.85),
    'shirt': textured('shirt', KIT_PNG, 512, 0.55),
    'shorts': flat('shorts', (0.008, 0.025, 0.12), 0.6),
    'socks': flat('socks', (0.17, 0.008, 0.03), 0.8),
    'boots': flat('boots', (0.03, 0.03, 0.035), 0.35),
}
tint(MAT['skin'], SKIN_TONE)
EYE = textured('eyes', os.path.join(DATA, 'eyes', 'materials', 'brown_eye.png'), 256, 0.3)
BROW = textured('brows', os.path.join(DATA, 'eyebrows', 'eyebrow006', 'eyebrow006.png'), 256, 0.8, alpha=True)
for o, m in ((eyes, EYE), (brows, BROW)):
    old = [s.material for s in o.material_slots]
    o.data.materials.clear(); o.data.materials.append(m)
    for x in {m.name for m in old if m}:
        x = bpy.data.materials.get(x)
        if x and x.users == 0:
            bpy.data.materials.remove(x)

# ---------- причёски (MPFB, CC0): отдельные сетки JG_Hair_<имя>, в игре видна одна ----------
# Текстура переводится в светло-серую с альфой: цвет волос = цвет материала (задаётся кодом).
HAIRS = {'short': 'short04', 'medium': 'short03', 'afro': 'afro01'}
HAIR_COLOR = (0.018, 0.012, 0.01)

def gray_hair_png(src, out, size=256):
    import numpy as np
    im = bpy.data.images.load(src); im.scale(size, size)
    a = np.empty(size * size * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    a = a.reshape(-1, 4)
    lum = a[:, 0] * 0.3 + a[:, 1] * 0.59 + a[:, 2] * 0.11
    ref = np.percentile(lum[a[:, 3] > 0.5], 90) if (a[:, 3] > 0.5).any() else 1.0
    g = np.clip(0.35 + 0.65 * lum / max(ref, 1e-3), 0, 1)
    a[:, 0] = a[:, 1] = a[:, 2] = g
    im = bpy.data.images.new('tmp_hairpng', size, size, alpha=True); im.pixels.foreach_set(a.ravel())
    im.filepath_raw = out; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)

hairs = {}
for style, asset in HAIRS.items():
    o = add(('hair', asset, asset + '.mhclo'), 'Hair', 'JG_Hair_' + style)
    src = next(n.image.filepath_from_user() for s in o.material_slots if s.material
               for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    png = os.path.join(OUT, 'jg_hair_%s.png' % style)
    gray_hair_png(bpy.path.abspath(src), png)
    for im in [i for i in bpy.data.images if i.name.startswith('jg_hair_' + style)]:
        bpy.data.images.remove(im)
    old = [s.material for s in o.material_slots]
    m = textured('hair_' + style, png, 256, 0.75, alpha=True)
    tint(m, HAIR_COLOR)
    o.data.materials.clear(); o.data.materials.append(m)
    keep = {mm.name for mm in MAT.values()} | {'hair_' + s for s in HAIRS}
    for x in {mm.name for mm in old if mm} - keep:
        x = bpy.data.materials.get(x)
        if x and x.users == 0:
            bpy.data.materials.remove(x)
    hairs[style] = o

ORDER = ['skin', 'hair', 'shirt', 'shorts', 'socks', 'boots']
me = player.data
me.materials.clear()
for k in ORDER:
    me.materials.append(MAT[k])
IDX = {k: i for i, k in enumerate(ORDER)}

# ---------- разрезы по линиям формы ----------
bm = bmesh.new(); bm.from_mesh(me)
cen = lambda f: f.calc_center_median()

def cut(co, no, pred):
    faces = [f for f in bm.faces if pred(f)]
    verts = {v for f in faces for v in f.verts}; edges = {e for f in faces for e in f.edges}
    bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + faces, plane_co=co, plane_no=no)

Z_SHIRT, Z_SHORTS, Z_SOCKS, Z_BOOTS = 1.0, 0.66, 0.50, 0.10
for z in (Z_SHIRT, Z_SHORTS, Z_SOCKS, Z_BOOTS):
    cut(Vector((0, 0, z)), Vector((0, 0, 1)), lambda f: cen(f).z < 1.2 and abs(cen(f).x) < 0.3)
ARM_A = Vector((0.21, -0.02, 1.486)); ARM_B = Vector((0.391, -0.02, 1.28))   # плечо -> локоть
SLV_P = ARM_A.lerp(ARM_B, 0.55); SLV_N = (ARM_B - ARM_A).normalized()
def mirror(v, s): return Vector((v.x * s, v.y, v.z))
for s in (1, -1):
    cut(mirror(SLV_P, s), mirror(SLV_N, s), lambda f: cen(f).x * s > 0.24 and 0.9 < cen(f).z < 1.6)
COL_N = Vector((0, -0.5, 1)).normalized()
cut(Vector((0, 0, 1.555)), COL_N, lambda f: abs(cen(f).x) < 0.11 and 1.45 < cen(f).z < 1.7)
head = lambda f: abs(cen(f).x) < 0.13 and cen(f).z > 1.62
cut(Vector((0, -0.10, 1.777)), Vector((0, 0.6, 1)).normalized(), head)
cut(Vector((0, 0, 1.735)), Vector((0, 1.5, 1)).normalized(), head)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)

# ---------- зоны ----------
def hairline(y):   # линия волос: лоб и виски (плоскость 1), затылок (плоскость 2)
    return min(1.777 - 0.6 * (y + 0.10), 1.735 - 1.5 * y)

def zone(c):
    ax = abs(c.x)
    if ax > 0.24 and 0.9 < c.z < 1.6:                         # рука
        return 'shirt' if (c - mirror(SLV_P, 1 if c.x > 0 else -1)).dot(mirror(SLV_N, 1 if c.x > 0 else -1)) < 0 else 'skin'
    if c.z < Z_BOOTS: return 'boots'
    if c.z < Z_SOCKS: return 'socks'
    if c.z < Z_SHORTS: return 'skin'
    if c.z < Z_SHIRT: return 'shorts'
    if c.z < 1.45: return 'shirt'
    if ax < 0.11 and (c.z - 0.5 * c.y) > 1.555: k = 'skin'
    elif c.z > 1.62: k = 'skin'
    else: return 'shirt'
    # волосы: линия роста — лоб выше, затылок ниже
    ear = ax > 0.075 and -0.075 < c.y < -0.015 and c.z < 1.785
    if c.z > 1.62 and ax < 0.13 and c.z > hairline(c.y) and not ear:
        return 'hair'
    return k

for f in bm.faces:
    f.material_index = IDX[zone(cen(f))]

# ---------- объём формы и кромки ----------
OFF = {'skin': 0.0, 'hair': 0.012, 'shirt': 0.010, 'shorts': 0.016, 'socks': 0.004, 'boots': 0.007}
def offset(mat, c):
    o = OFF[mat]
    if mat == 'hair':   # тонко у линии роста, объём к макушке
        o = 0.002 + min(0.005, max(0.0, c.z - hairline(c.y)) * 0.2)   # «ёжик»; причёски — отдельные сетки поверх
    if mat == 'shorts':
        o += 0.014 * max(0.0, min(1.0, (Z_SHIRT - c.z) / (Z_SHIRT - Z_SHORTS)))   # шире к низу
    if mat == 'shirt':
        if abs(c.x) > 0.24 and c.z < 1.45: o += 0.006                         # рукав
        if c.z < 1.12 and abs(c.x) < 0.24: o += 0.012 * (1.12 - c.z) / 0.12  # подол поверх шорт
    return o

bm.verts.index_update(); bm.normal_update()
oid = bm.verts.layers.int.new('oid')
for v in bm.verts: v[oid] = v.index
nrm = {v.index: v.normal.copy() for v in bm.verts}
org = {v.index: v.co.copy() for v in bm.verts}
mname = lambda f: ORDER[f.material_index]

bnd = []
for e in bm.edges:
    if len(e.link_faces) != 2: continue
    f1, f2 = e.link_faces
    if f1.material_index == f2.material_index: continue
    bnd.append(e)
pairs = []   # (outer_face, inner_face, oid_a, oid_b)
for e in bnd:
    f1, f2 = e.link_faces
    c = (e.verts[0].co + e.verts[1].co) / 2
    o1, o2 = offset(mname(f1), c), offset(mname(f2), c)
    if abs(o1 - o2) < 1e-6: continue
    outer, inner = (f1, f2) if o1 > o2 else (f2, f1)
    pairs.append((outer, inner, e.verts[0][oid], e.verts[1][oid]))
bmesh.ops.split_edges(bm, edges=bnd)

for v in bm.verts:
    if not v.link_faces: continue
    i = v[oid]
    v.co = org[i] + nrm[i] * max(offset(mname(f), org[i]) for f in v.link_faces)

def vert_in(face, i):
    return next((v for v in face.verts if v[oid] == i), None)
rings = 0
for outer, inner, a, b in pairs:
    va, vb = vert_in(outer, a), vert_in(outer, b)
    ia, ib = vert_in(inner, a), vert_in(inner, b)
    if not all((va, vb, ia, ib)) or va is ia or vb is ib: continue
    lp = next(l for l in outer.loops if l.vert is va)
    if lp.link_loop_next.vert is vb: quad = (vb, va, ia, ib)
    else: quad = (va, vb, ib, ia)
    try:
        nf = bm.faces.new(quad); nf.material_index = outer.material_index; nf.smooth = outer.smooth; rings += 1
    except ValueError:
        pass
bm.verts.layers.int.remove(oid)
bm.to_mesh(me); bm.free(); me.update()

tris = lambda o: sum(len(f.vertices) - 2 for f in o.data.polygons)
print('rings', rings, 'tris player/eyes/brows', tris(player), tris(eyes), tris(brows))

# ---------- развёртка майки под узоры ----------
# Текстура майки (glTF/canvas, ось y вниз):
#   туловище — верх 75% картинки: x = вокруг тела (0.25 — грудь, 0.75 — спина, шов под правой рукой),
#            y = 0 у ворота, 0.75 у подола;
#   рукава  — полоса y 0.78..0.98, x = вокруг руки.
import math
def cyl_u(dx, dy):           # dx — вбок, dy — вперёд (к лицу); 0.25 спереди, 0.75 сзади
    return (0.25 + math.atan2(dx, dy) / (2 * math.pi)) % 1.0
uv = me.uv_layers.active.data
SH = IDX['shirt']
tz = [v.co.z for f in me.polygons if f.material_index == SH and abs(f.center.x) <= 0.24 for v in (me.vertices[i] for i in f.vertices)]
Z_HEM, Z_NECK = min(tz), max(tz)
for f in me.polygons:
    if f.material_index != SH: continue
    c = f.center
    if abs(c.x) > 0.24 and c.z < 1.5:          # рукав: цилиндр вокруг оси плечо-локоть
        s = 1 if c.x > 0 else -1
        A, N = mirror(ARM_A, s), mirror(SLV_N, s)
        side = Vector((0, -1, 0)).cross(N).normalized(); fwd = N.cross(side)
        coords = []
        for li in f.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co - A
            t = p.dot(N) / (SLV_P - ARM_A).length
            coords.append([cyl_u(p.dot(side) * s, p.dot(fwd)), 0.22 - 0.20 * max(0, min(1, t))])
    else:
        coords = []
        for li in f.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            coords.append([cyl_u(p.x, -(p.y + 0.02)), 0.25 + 0.75 * (p.z - Z_HEM) / (Z_NECK - Z_HEM)])
    us = [u for u, _ in coords]
    if max(us) - min(us) > 0.5:                # грань на шве — сдвигаем, текстура повторяется
        for cc in coords:
            if cc[0] < 0.5: cc[0] += 1.0
    for li, (u, v) in zip(f.loop_indices, coords):
        uv[li].uv = (u, v)

# ---------- кисти без костей пальцев ----------
# Пальцы один раз сгибаем в мягкий полукулак и «запекаем» в сетку, веса пальцев отдаём кисти,
# кости пальцев удаляем. Кисть двигается целиком (запястье), пальцы не анимируются.
import math
from mathutils import Quaternion
FINGER_CURL = {1: 10, 2: 16, 3: 10}   # почти прямые: у облегчённой кисти пальцы «лопаткой», сильный сгиб даёт коготь
THUMB_CURL = {2: 6, 3: 6}
FINGERS = [b.name for b in rig.data.bones if 'HandThumb' in b.name or any(
    'Hand%s' % f in b.name for f in ('Index', 'Middle', 'Ring', 'Pinky'))]
for b in rig.pose.bones:
    b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
for n in FINGERS:
    i = int(n[-1]); curl = THUMB_CURL if 'Thumb' in n else FINGER_CURL
    if i in curl:
        rig.pose.bones[n].rotation_quaternion = Quaternion((1, 0, 0), math.radians(curl[i]))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for o in (player,):
    e = o.evaluated_get(dg); em = e.to_mesh()
    co = [v.co.copy() for v in em.vertices]; e.to_mesh_clear()
    for v, c in zip(o.data.vertices, co): v.co = c
    # веса пальцев -> кисть
    vg = o.vertex_groups
    for side in ('Left', 'Right'):
        hand = vg.get('mixamorig:%sHand' % side)
        for n in [n for n in FINGERS if n.startswith('mixamorig:' + side)]:
            g = vg.get(n)
            if not g: continue
            for v in o.data.vertices:
                for ge in v.groups:
                    if ge.group == g.index and ge.weight > 0:
                        hand.add([v.index], ge.weight, 'ADD')
            vg.remove(g)
for b in rig.pose.bones:
    b.rotation_quaternion = (1, 0, 0, 0)
bpy.context.view_layer.objects.active = rig
rig.hide_set(False); rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in FINGERS:
    eb = rig.data.edit_bones.get(n)
    if eb: rig.data.edit_bones.remove(eb)
bpy.ops.object.mode_set(mode='OBJECT')
print('bones', len(rig.data.bones))

# ---------- телосложение: морфы slim / heavy / muscular ----------
# MPFB меняет вес/мышцы на базовом теле; разницу переносим на готовые сетки (тело с формой,
# глаза, брови, причёски) через привязку к ближайшей точке поверхности. В игре — morphTargetInfluences.
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
from mathutils.geometry import normal as poly_normal
BUILDS = {'slim': dict(weight=0.12, muscle=0.5), 'heavy': dict(weight=0.8, muscle=0.6),
          'muscular': dict(weight=0.5, muscle=1.0)}

def body_surface():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
    co = [v.co.copy() for v in m.vertices]; polys = [tuple(p.vertices) for p in m.polygons]
    e.to_mesh_clear(); return co, polys

def set_macros(**kw):
    for k, v in kw.items():
        HumanObjectProperties.set_value(k, v, entity_reference=body)
    TargetService.reapply_macro_details(body)

base_macros = {k: HumanObjectProperties.get_value(k, entity_reference=body) for k in ('weight', 'muscle')}
B0, P0 = body_surface()
bvh = BVHTree.FromPolygons(B0, P0)
targets = [player, eyes, brows]   # причёски не морфим: голова меняется меньше чем на 5 мм
binds = {}
for o in targets:
    bl = []
    for v in o.data.vertices:
        loc, nrm, fi, _ = bvh.find_nearest(v.co)
        pv = [B0[i] for i in P0[fi]]
        w = poly_3d_calc(pv, loc)
        d = v.co - loc
        bl.append((fi, w, d.dot(nrm), d - nrm * d.dot(nrm)))
    binds[o.name] = bl
for o in targets:
    if not o.data.shape_keys:
        o.shape_key_add(name='Basis', from_mix=False)
for name, mac in BUILDS.items():
    set_macros(**mac)
    B1, _ = body_surface()
    for o in targets:
        sk = o.data.shape_keys.key_blocks.get(name) or o.shape_key_add(name=name, from_mix=False)
        for v, (fi, w, dn, dt) in zip(o.data.vertices, binds[o.name]):
            pv = [B1[i] for i in P0[fi]]
            loc = sum((p * wi for p, wi in zip(pv, w)), Vector())
            sk.data[v.index].co = loc + poly_normal(pv) * dn + dt
        sk.value = 0.0
set_macros(**base_macros)
print('builds', list(BUILDS))
