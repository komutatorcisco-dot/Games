# Рендер поз футболиста на прозрачном фоне 900×600 (EEVEE).
# Запуск после build_player.py и poses.py (exec обоих в одном вызове), затем:
#   render_all(r"<repo>/img/fcm", fmt='WEBP')  -> player-stand.webp / player-run.webp / player-kick.webp
import bpy, math, os
from mathutils import Vector

def setup():
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 900, 600, 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.55, 0.6, 0.7, 1); bg.inputs['Strength'].default_value = 0.6
    for o in list(bpy.data.objects):
        if o.name.startswith('JGR_'): bpy.data.objects.remove(o, do_unlink=True)
    def light(name, kind, energy, rot, size=1.0, col=(1, 1, 1)):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = col
        if kind == 'AREA': d.size = size
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        o.rotation_euler = [math.radians(a) for a in rot]
        return o
    light('JGR_Key', 'SUN', 3.2, (50, 0, -35), col=(1, 0.96, 0.9))
    light('JGR_Rim', 'SUN', 2.5, (60, 0, 160), col=(0.8, 0.9, 1))
    for n in ('Light',):
        if n in bpy.data.objects: bpy.data.objects[n].hide_render = True
    cd = bpy.data.cameras.new('JGR_Cam'); cd.lens = 50
    cam = bpy.data.objects.new('JGR_Cam', cd); sc.collection.objects.link(cam)
    sc.camera = cam
    return cam

def frame(cam, objs, view=Vector((0.55, -1, 0.12))):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        e = o.evaluated_get(dg); me = e.to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    d = view.normalized()
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    # дистанция так, чтобы рост занимал ~88% высоты кадра
    fov = 2 * math.atan(cam.data.sensor_width / 2 / cam.data.lens) * 600 / 900
    size = max(hi.z - lo.z, (hi - lo).xy.length * 0.6)
    dist = size / 0.88 / 2 / math.tan(fov / 2)
    cam.location = c + d * dist

VIEWS = {'kick': Vector((-1, -0.45, 0.1))}   # удар лучше читается сбоку

def render_all(out_dir, names=('stand', 'run', 'kick'), fmt='PNG'):
    cam = setup()
    st = bpy.context.scene.render.image_settings
    st.file_format = fmt; st.color_mode = 'RGBA'
    if fmt == 'WEBP': st.quality = 90
    objs = [bpy.data.objects[n] for n in ('JG_Player', 'JG_Eyes', 'JG_Brows')]
    files = []
    for n in names:
        apply(n)
        frame(cam, objs[:1], VIEWS.get(n, Vector((0.55, -1, 0.12))))
        f = os.path.join(out_dir, 'player-%s.%s' % (n, 'webp' if fmt == 'WEBP' else 'png'))
        bpy.context.scene.render.filepath = f
        bpy.ops.render.render(write_still=True)
        files.append(f)
    return files
