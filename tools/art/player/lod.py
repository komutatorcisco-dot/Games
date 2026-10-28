# Упрощённое тело для дальних игроков: JG_PlayerLOD — копия JG_Player без морфов, прорежена до ~1200 треугольников
# (Decimate), тот же скелет и веса, те же 6 материалов (в игре сливаются в одну отрисовку — PlayerKit).
# Без глаз, бровей и причёсок: издалека их не видно, «ёжик» есть на самом теле.
# Запуск после build_player.py: exec(open(r"<repo>/tools/art/player/lod.py", encoding="utf-8").read()); make_lod()
import bpy

def make_lod(ratio=0.33):
    P = bpy.data.objects['JG_Player']
    for o in list(bpy.data.objects):
        if o.name.startswith('JG_PlayerLOD'):
            bpy.data.objects.remove(o, do_unlink=True)
    L = P.copy(); L.data = P.data.copy(); L.name = L.data.name = 'JG_PlayerLOD'
    bpy.context.scene.collection.objects.link(L)
    L.shape_key_clear()
    for m in list(L.modifiers):
        if m.type != 'ARMATURE': L.modifiers.remove(m)
    d = L.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
    with bpy.context.temp_override(object=L, active_object=L):
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
        bpy.ops.object.modifier_apply(modifier='dec')
    return sum(len(f.vertices) - 2 for f in L.data.polygons)
