"""Retarget the supplied FBX into a separate preview. No production changes."""
import bpy
import json
import math
import struct
from pathlib import Path
from mathutils import Vector, Matrix

out = Path(__file__).resolve().parent
report = {"status":"importing", "requires_visual_review":True}
def save_report():
    (out/'motion-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
save_report()
target = bpy.data.objects['Balotelli_Rig']
mesh = bpy.data.objects['Balotelli_Mobile_Prototype']
target.animation_data_clear()
target.location = (0,0,0)
for p in target.pose.bones:
    p.rotation_mode='QUATERNION'
    p.rotation_quaternion=(1,0,0,0)
    p.location=(0,0,0)
    p.scale=(1,1,1)
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=str(out/'motion-source/source.fbx'),use_anim=True,
                         automatic_bone_orientation=False)
imported = set(bpy.data.objects)-before
rigs = [o for o in imported if o.type=='ARMATURE']
if len(rigs)!=1:
    raise RuntimeError('Expected one source armature, found '+str(len(rigs)))
source=rigs[0]
action=source.animation_data.action if source.animation_data else None
if action is None:
    raise RuntimeError('Source skeleton has no active animation')
start,end = [int(round(x)) for x in action.frame_range]
if not 1<=end-start<=1800:
    raise RuntimeError('Unexpected animation duration')
scene=bpy.context.scene
report.update(source_rig=source.name,source_action=action.name,
              source_frames=[start,end],fps=scene.render.fps,
              source_bones=[b.name for b in source.data.bones])
mapping={'pelvis':'pelvis','spine':'spine_01','chest':'spine_03','neck':'neck_01','head':'head'}
for side,suffix in [('L','l'),('R','r')]:
    for dst,src in [('clavicle','clavicle'),('upper_arm','upperarm'),('forearm','lowerarm'),
                    ('hand','hand'),('thigh','thigh'),('shin','calf'),('foot','foot')]:
        mapping[dst+'.'+side]=src+'_'+suffix
missing=[n for n in mapping.values() if n not in source.data.bones]
if missing:
    report['missing_bones']=missing;save_report()
    raise RuntimeError('Source bone mapping incomplete')
def rest_head(rig,name):
    return rig.matrix_world @ rig.data.bones[name].head_local
def pose_head(rig,name):
    return rig.matrix_world @ rig.pose.bones[name].head
def basis(rig,left,right,hips,head,point=rest_head):
    x=(point(rig,left)-point(rig,right)).normalized()
    z=point(rig,head)-point(rig,hips)
    z=(z-x*z.dot(x)).normalized()
    y=z.cross(x).normalized()
    return Matrix((x,y,z)).transposed()
scene.frame_set(start)
bpy.context.view_layer.update()
# This FBX's animated Root carries a quarter-turn absent from its bind pose.
# Calibrate axes against the verified standing animation frame, not bind space.
alignment=basis(target,'upper_arm.L','upper_arm.R','pelvis','head') @ basis(source,'upperarm_l','upperarm_r','pelvis','head',pose_head).transposed()
scale=(rest_head(target,'head')-rest_head(target,'pelvis')).length/(pose_head(source,'head')-pose_head(source,'pelvis')).length
report['reference_frame']=start
report['reference_basis']='standing source pose, including animated Root'
report['translation_scale']=scale
report['mapping']=mapping
save_report()
# Cache source motion before writing target keys; source objects remain untouched.
samples=[]
for frame in range(start,end+1):
    scene.frame_set(frame)
    source_world=source.matrix_world.to_3x3()
    poses={}
    for name in mapping.values():
        p=source.pose.bones[name]
        poses[name]={'direction':(source_world@(p.tail-p.head)).normalized(),
                     'rotation':(source.matrix_world@p.matrix).to_quaternion()}
    samples.append((source.matrix_world@source.pose.bones['pelvis'].head,poses))
first=samples[0][0]
align_q=alignment.to_quaternion()
for i,(hips,poses) in enumerate(samples):
    frame=i+1
    scene.frame_set(frame)
    target.location=alignment@(hips-first)*scale
    target.keyframe_insert(data_path='location',frame=frame)
    # Parents first. Transfer limb direction in world space, rather than copying
    # Euler angles from a different rest pose (T pose vs arms-down scan).
    for p in target.pose.bones:
        if p.name not in mapping:
            continue
        src=mapping[p.name]
        rest=p.bone.matrix_local.to_quaternion()
        if p.name in ('pelvis','head','neck'):
            sr=samples[0][1][src]['rotation']
            delta=align_q@(poses[src]['rotation']@sr.inverted())@align_q.inverted()
            desired=delta@rest
        else:
            aim=(alignment@poses[src]['direction']).normalized()
            rest_direction=(p.bone.tail_local-p.bone.head_local).normalized()
            desired=rest_direction.rotation_difference(aim)@rest
        if p.parent:
            parent_delta=p.parent.matrix.to_quaternion()@p.parent.bone.matrix_local.to_quaternion().inverted()
            inherited=parent_delta@rest
        else:
            inherited=rest
        p.rotation_quaternion=inherited.inverted()@desired
        p.keyframe_insert(data_path='rotation_quaternion',frame=frame)
        bpy.context.view_layer.update()
target.animation_data.action.name='Imported_Football_Motion_Prototype'
scene.frame_start=1
scene.frame_end=len(samples)
for o in imported:
    o.hide_render=True
    o.hide_set(True)
# Preserve packed textures at the intended mobile resolution after reopening.
for image in bpy.data.images:
    if image.type=='IMAGE' and image.size[0] and max(image.size)>2048:
        factor=2048/max(image.size)
        image.scale(max(1,round(image.size[0]*factor)),max(1,round(image.size[1]*factor)))
        image.pack()
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'balotelli-imported-motion.blend'))
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True);target.select_set(True)
bpy.context.view_layer.objects.active=target
# Render before export: exporters must not influence the binding review.
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=720
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_cavity=True
camera_data=bpy.data.cameras.new('Motion review camera')
camera=bpy.data.objects.new('Motion review camera',camera_data)
scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=2.8
report['pose_checks']=[]
for i,frame in enumerate(sorted(set(round(1+(len(samples)-1)*t) for t in [0,.2,.4,.6,.8,1]))):
    scene.frame_set(frame)
    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    corners=[evaluated.matrix_world@Vector(c) for c in evaluated.bound_box]
    height=max(p.z for p in corners)-min(p.z for p in corners)
    report['pose_checks'].append({'frame':frame,'height':height})
    save_report()
    if not .7<height<2.8:
        raise RuntimeError('Animated model scale/bounds invalid; see motion-report.json')
    center=target.location+Vector((0,0,1))
    camera.location=center+Vector((.5,-5,.15))
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'motion-review-{i+1}.png')
    bpy.ops.render.render(write_still=True)
# Render the source at matching sample times for an honest motion comparison.
mesh.hide_render=True
for o in imported:
    o.hide_render=False
    o.hide_set(False)
for i,fraction in enumerate([0,.4,.8]):
    scene.frame_set(round(start+(end-start)*fraction))
    points=[o.matrix_world@Vector(corner) for o in imported if o.type=='MESH' for corner in o.bound_box]
    if not points:
        break
    lo=Vector(tuple(min(p[j] for p in points) for j in range(3)))
    hi=Vector(tuple(max(p[j] for p in points) for j in range(3)))
    center=(lo+hi)*.5
    size=max(hi-lo)
    camera_data.ortho_scale=size*1.3
    camera_data.clip_end=max(1000,size*20)
    camera.location=center+alignment.transposed()@Vector((.1,-3,.1))*size
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'source-motion-{i+1}.png')
    bpy.ops.render.render(write_still=True)
mesh.hide_render=False
for o in imported:
    o.hide_render=True
    o.hide_set(True)
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True);target.select_set(True)
bpy.context.view_layer.objects.active=target
bpy.ops.export_scene.gltf(filepath=str(out/'balotelli-imported-motion.glb'),export_format='GLB',
                          use_selection=True,export_animations=True,export_frame_range=True,
                          export_animation_mode='ACTIVE_ACTIONS',export_anim_single_armature=False)
binary=(out/'balotelli-imported-motion.glb').read_bytes()
json_length=struct.unpack_from('<I',binary,12)[0]
gltf=json.loads(binary[20:20+json_length])
clips=gltf.get('animations',[])
report['exported_clips']=[c.get('name','unnamed') for c in clips]
if len(clips)!=1 or not clips[0].get('channels') or not gltf.get('skins'):
    report['status']='export_validation_failed';save_report()
    raise RuntimeError('Expected one animated skeletal clip')
report.update(status='preview_ready_requires_review',frames=len(samples),
              export_revision=2,
              glb_bytes=(out/'balotelli-imported-motion.glb').stat().st_size)
save_report()
print('IMPORTED_MOTION_PREVIEW_READY',flush=True)
