# Экспорт футболиста в glTF (.glb) с Draco-сжатием.
# Запуск после build_player.py и poses.py (exec в том же вызове):
#   export_glb(r"<repo>/assets3d/player.glb")
# В файле: скелет Mixamo (22 кости, без пальцев); сетки JG_Player, JG_Eyes, JG_Brows, JG_Hair_short|medium|afro;
# материалы skin, hair, shirt, shorts, socks, boots, eyes, brows, hair_<стиль>; морфы slim, heavy, muscular;
# анимации-позы stand, run, run2, kick, kick2 (по 1 кадру).
import bpy

def export_glb(path, draco=True):
    bake_actions()
    names = ['JG_Rig', 'JG_Player', 'JG_Eyes', 'JG_Brows'] + sorted(o.name for o in bpy.data.objects if o.name.startswith('JG_Hair_'))
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
