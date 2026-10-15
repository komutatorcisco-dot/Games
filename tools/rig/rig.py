import bpy, numpy as np, math, sys, json
from mathutils import Vector, Matrix
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='low.glb')
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
# лицо к -Y (вперёд по правилам Blender), рост 1.85 м, стопы на полу
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
ob.rotation_mode='XYZ'
ob.matrix_world = Matrix.Rotation(-math.pi/2,4,'Z') @ ob.matrix_world
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
me=ob.data
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
H0=co[:,2].max()-co[:,2].min(); s=1.85/H0
co=(co-[ (co[:,0].max()+co[:,0].min())/2, (co[:,1].max()+co[:,1].min())/2, co[:,2].min()])*s
me.vertices.foreach_set('co',co.ravel()); me.update()
H=1.85; x,y,z=co[:,0],co[:,1],co[:,2]
def sl(f,w=0.006): return co[abs(z-f*H)<w*H]
# --- ноги: промежность — самая высокая высота, где в центре (|x|<1см) нет точек
gap=[f for f in np.arange(0.10,0.56,0.0025) if len(sl(f,0.003)) and (abs(sl(f,0.003)[:,0])<0.008).sum()==0]
print('gap top',max(gap)); crotch=0.465
def legc(f,side):
  s_=sl(f); s_=s_[(s_[:,0]*side>0.01)&(abs(s_[:,0])<0.25)]; return s_[:,0].mean(), s_[:,1].mean()
J={}
for side,n in [(1,'L'),(-1,'R')]:
  ux,uy=legc(0.37,side); kx,ky=legc(0.285,side); ax,ay=legc(0.06,side)
  J['hip'+n]=(side*0.05*H, ky, 0.50*H)
  J['knee'+n]=(kx, ky+0.012, 0.285*H)   # колено чуть вперёд — сгиб в нужную сторону
  J['ankle'+n]=(ax, ay+0.03, 0.05*H)
  foot=co[(z<0.03*H)&(x*side>0.01)]
  J['toe'+n]=(ax, foot[:,1].min()+0.02, 0.02*H)
print({k:np.round(v,3).tolist() for k,v in J.items()})
# --- корпус
pel=0.53*H
J['pelvis']=(0,0.0,pel); J['spine']=(0,0.0,0.62*H); J['chest']=(0,0.0,0.71*H)
# шея: самое узкое место по ширине выше 0.78H
best=None
for f in np.arange(0.80,0.90,0.0025):
  s_=sl(f,0.003); s_=s_[abs(s_[:,0])<0.15]
  if not len(s_): continue
  w=s_[:,0].max()-s_[:,0].min()
  if best is None or w<best[0]: best=(w,f,s_[:,1].mean())
print('neck',best)
ty=sl(0.79); ty=ty[abs(ty[:,0])<0.15][:,1].mean()
J['pelvis']=(0,ky*0+legc(0.285,1)[1],pel); J['spine']=(0,ty,0.62*H); J['chest']=(0,ty,0.71*H)
J['neck']=(0,best[2]+0.005,(best[1]-0.025)*H); J['head']=(0,best[2]+0.005,(best[1]+0.012)*H); J['top']=(0,best[2],H)
# --- руки: точки дальше плеч, PCA линии
for side,n in [(1,'L'),(-1,'R')]:
  arm=co[(x*side>0.24)&(z>0.45*H)]
  c=arm.mean(0); u,sv,vt=np.linalg.svd(arm-c); d=vt[0]; d=d if d[0]*side>0 else -d
  t=(arm-c)@d; tip=c+d*t.max()
  # плечевой сустав: на линии руки там, где x ≈ край плеча (ширина торса на 0.80H)
  tor=sl(0.79); tor=tor[abs(tor[:,0])<0.3]
  shx=side*(abs(tor[:,0]).max()-0.055)
  ts=(shx-c[0])/d[0]; sh=c+d*ts
  sh[1]=tor[:,1].mean()
  L=np.linalg.norm(tip-sh)
  J['sh'+n]=tuple(sh); J['el'+n]=tuple(sh+d*L*0.40); J['wr'+n]=tuple(sh+d*L*0.76); J['fi'+n]=tuple(tip)
  J['cl'+n]=(side*0.03, ty, (best[1]-0.045)*H)
print({k:np.round(v,3).tolist() for k,v in J.items() if k[:2] in ('sh','el','wr','fi','cl')})
json.dump({k:list(map(float,v)) for k,v in J.items()},open('joints.json','w'))
# --- арматура
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0)); arm=bpy.context.object; arm.name='Armature'; A=arm.data; A.name='Armature'
eb=A.edit_bones; eb.remove(eb[0])
def bone(name,h,t,parent=None,conn=False,roll=0):
  b=eb.new(name); b.head=Vector(h); b.tail=Vector(t); b.roll=roll
  if parent: b.parent=eb[parent]; b.use_connect=conn
  return b
bone('root',(0,0,0),(0,0.25,0))
bone('pelvis',J['pelvis'],J['spine'],'root')
bone('spine',J['spine'],J['chest'],'pelvis',True)
bone('chest',J['chest'],J['neck'],'spine',True)
bone('neck',J['neck'],J['head'],'chest',True)
bone('head',J['head'],J['top'],'neck',True)
for n in 'LR':
  bone('clavicle.'+n,J['cl'+n],J['sh'+n],'chest')
  bone('upper_arm.'+n,J['sh'+n],J['el'+n],'clavicle.'+n,True)
  bone('forearm.'+n,J['el'+n],J['wr'+n],'upper_arm.'+n,True)
  bone('hand.'+n,J['wr'+n],J['fi'+n],'forearm.'+n,True)
  bone('thigh.'+n,J['hip'+n],J['knee'+n],'pelvis')
  bone('shin.'+n,J['knee'+n],J['ankle'+n],'thigh.'+n,True)
  bone('foot.'+n,J['ankle'+n],J['toe'+n],'shin.'+n,True)
# ролы как у обычного рига: ось Z кости смотрит вперёд (-Y) у ног и корпуса
bpy.ops.armature.select_all(action='SELECT'); bpy.ops.armature.calculate_roll(type='GLOBAL_NEG_Y')
bpy.ops.object.mode_set(mode='OBJECT')
# --- веса
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
bpy.ops.object.duplicate(); px=bpy.context.object; px.name='proxy'
m=px.modifiers.new('r','REMESH'); m.mode='VOXEL'; m.voxel_size=0.011; bpy.ops.object.modifier_apply(modifier='r')
m=px.modifiers.new('d','DECIMATE'); m.ratio=min(1,25000/len(px.data.polygons)); bpy.ops.object.modifier_apply(modifier='d')
print('proxy faces',len(px.data.polygons))
bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('proxy unweighted',sum(1 for v in px.data.vertices if len(v.groups)==0),'of',len(px.data.vertices))
for g in px.vertex_groups: ob.vertex_groups.new(name=g.name)
dt=ob.modifiers.new('dt','DATA_TRANSFER'); dt.object=px; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
bpy.ops.object.modifier_apply(modifier='dt')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.data.objects.remove(px)
ob.parent=arm; am=ob.modifiers.new('Armature','ARMATURE'); am.object=arm
vg=ob.vertex_groups; empty=sum(1 for v in me.vertices if len(v.groups)==0)
print('groups',len(vg),'verts without weight',empty,'of',len(me.vertices))
bpy.ops.wm.save_as_mainfile(filepath='rig.blend')

bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath='rigged.glb', export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_yup=True, export_image_format='AUTO')
print('exported')
