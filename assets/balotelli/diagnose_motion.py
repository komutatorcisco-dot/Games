"""Compare rig/rest/animated bounds and close-up renders without changing assets."""
import bpy
import json
from pathlib import Path
from mathutils import Vector, Matrix

out=Path(__file__).resolve().parent
scene=bpy.context.scene
mesh=bpy.data.objects['Balotelli_Mobile_Prototype']
rig=bpy.data.objects['Balotelli_Rig']
source=bpy.data.objects.get('Game_engine')
def bounds(obj):
    bpy.context.view_layer.update()
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    pts=[evaluated.matrix_world@Vector(p) for p in evaluated.bound_box]
    lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    return lo,hi
def describe(obj):
    return {'name':obj.name,'scale':list(obj.scale),'world_scale':list(obj.matrix_world.to_scale()),
            'parent':obj.parent.name if obj.parent else None,
            'parent_inverse':[list(row) for row in obj.matrix_parent_inverse]}
report={'objects':[describe(mesh),describe(rig)],'poses':[]}
if source:report['objects'].append(describe(source))
for mode in ['REST','POSE']:
    rig.data.pose_position=mode
    scene.frame_set(1)
    lo,hi=bounds(mesh)
    report[mode.lower()+'_bounds']={'min':list(lo),'max':list(hi),'size':list(hi-lo)}
report['bone_lengths']=[{'name':b.name,'rest':b.bone.length,'posed':(b.tail-b.head).length,
                        'scale':list(b.scale),'matrix_scale':list(b.matrix.to_scale())} for b in rig.pose.bones]
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=720;scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
camdata=bpy.data.cameras.new('Diagnostic camera')
cam=bpy.data.objects.new('Diagnostic camera',camdata)
scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
def render(label,objects,direction):
    visible=set(objects)
    for obj in scene.objects:
        if obj.type=='MESH':obj.hide_render=obj not in visible
    boxes=[bounds(obj) for obj in objects]
    lo=Vector(tuple(min(a[i] for a,b in boxes) for i in range(3)))
    hi=Vector(tuple(max(b[i] for a,b in boxes) for i in range(3)))
    center=(lo+hi)*.5;size=max(hi-lo)
    camdata.ortho_scale=max(.1,size*1.5)
    camdata.clip_end=max(1000,size*20)
    cam.location=center+direction.normalized()*max(1,size*3)
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(label+'.png'))
    bpy.ops.render.render(write_still=True)
rig.data.pose_position='REST'
render('diagnostic-rest',[mesh],Vector((.15,-1,.05)))
rig.data.pose_position='POSE'
for frame in [1,50,125,200]:
    scene.frame_set(frame)
    lo,hi=bounds(mesh)
    report['poses'].append({'frame':frame,'size':list(hi-lo),'bones':{
        n:{'head':list(rig.pose.bones[n].head),'tail':list(rig.pose.bones[n].tail)}
        for n in ['pelvis','chest','head','thigh.L','shin.L']}})
    render('diagnostic-pose-'+str(frame),[mesh],Vector((.15,-1,.05)))
if source:
    source.hide_set(False)
    srcmeshes=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==source for m in o.modifiers)]
    for obj in srcmeshes:obj.hide_set(False)
    if srcmeshes:
        for mode in ['REST','POSE']:
            source.data.pose_position=mode
            scene.frame_set(2)
            render('diagnostic-source-'+mode.lower(),srcmeshes,Vector((0,-1,.1)))
(out/'motion-diagnostic.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('MOTION_DIAGNOSTIC_READY',flush=True)
