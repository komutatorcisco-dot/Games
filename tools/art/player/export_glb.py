# Экспорт футболиста в glTF (.glb) с Draco-сжатием.
# Запуск после build_player.py и poses.py (exec в том же вызове):
#   export_glb(r"<repo>/assets3d/player.glb")
# В файле: скелет Mixamo (22 кости, без пальцев); сетки JG_Player, JG_PlayerLOD (дальние, lod.py), JG_Eyes, JG_Brows, JG_Hair_short|medium|afro;
# материалы skin, hair, shirt, shorts, socks, boots, eyes, brows, hair_<стиль>; морфы slim, heavy, muscular;
# позы по 1 кадру: stand, run, run2, kick, kick2; анимации Mixamo (retarget.py): idle, jog, strike, pass, penalty,
# header, scissor, tackle, receive, spin, juggle, gk_idle, gk_dive, gk_catch.
import bpy

def export_glb(path, draco=True):
    bake_actions()
    # анимации Mixamo после retarget.py (действия a_<имя>) — отдельными дорожками, в файле без «a_»
    rig = bpy.data.objects['JG_Rig']; ad = rig.animation_data
    for act in sorted((a for a in bpy.data.actions if a.name.startswith('a_')), key=lambda a: a.name):
        t = ad.nla_tracks.new(); t.name = act.name[2:]
        t.strips.new(act.name[2:], 1, act); t.mute = True
    names = ['JG_Rig', 'JG_Player', 'JG_Eyes', 'JG_Brows'] + sorted(o.name for o in bpy.data.objects if o.name.startswith(('JG_Hair_', 'JG_PlayerLOD')))
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    objs = [bpy.data.objects[n] for n in names]
    for o in objs:
        o.hide_set(False); o.select_set(True)
        if o.type == 'MESH' and o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks: k.value = 0.0
    bpy.context.view_layer.objects.active = objs[0]
    tracks = objs[0].animation_data.nla_tracks
    for t in tracks: t.mute = False
    kw = dict(filepath=path, export_format='GLB', use_selection=True,
              export_apply=False, export_skins=True, export_def_bones=True,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_frame_step=2,   # 12 ключей в секунду: three.js сглаживает между ними, файл вдвое легче
              export_morph=True, export_morph_normal=False,
              export_yup=True, export_texcoords=True, export_normals=True,
              export_image_format='WEBP', export_image_quality=80)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                  export_draco_position_quantization=14, export_draco_normal_quantization=10,
                  export_draco_texcoord_quantization=12)
    bpy.ops.export_scene.gltf(**kw)
    for t in tracks: t.mute = True
    return path
