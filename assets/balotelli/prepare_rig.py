"""Prototype rig and pack animation. Never saves over source.blend.

The source faces +X. Normalize to 1.9 metres, facing -Y. Joint positions
are fitted to the inspected silhouette; manual visual approval is required.
"""
import bpy
import json
import math
import bmesh
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.kdtree import KDTree

out = Path(__file__).resolve().parent
report = {"status": "started", "source": bpy.data.filepath,
          "prototype": True, "requires_visual_review": True}

def checkpoint():
    (out / "rig-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

checkpoint()
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError("Expected the single mesh from inspection")
obj = meshes[0]
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
report["original_polygons"] = len(obj.data.polygons)
# Start from original geometry, not a compounded unknown decimation setting.
for modifier in list(obj.modifiers):
    if modifier.type == "DECIMATE":
        obj.modifiers.remove(modifier)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# Rotate mesh data directly: Euler assignment is ignored for quaternion-mode
# imported objects. Bone coordinates below require width on X, forward on -Y.
obj.data.transform(Matrix.Rotation(-math.pi / 2, 4, "Z"))
lo = Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
hi = Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
scale = 1.9 / (hi.z - lo.z)
center = Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
for vertex in obj.data.vertices:
    vertex.co = (vertex.co-center)*scale
obj.location = (0, 0, 0)
extent = [max(v.co[i] for v in obj.data.vertices)-min(v.co[i] for v in obj.data.vertices) for i in range(3)]
report["normalized_dimensions"] = extent
if extent[0] < extent[1]*1.2:
    report["status"] = "orientation_requires_review"
    checkpoint()
    raise RuntimeError("Model width is not aligned with rig X axis")
obj.data.validate(verbose=True, clean_customdata=True)
dec = obj.modifiers.new("Mobile prototype mesh", "DECIMATE")
dec.ratio = min(1.0, 50000 / len(obj.data.polygons))
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=dec.name)
# Weld only coincident/near-coincident scan seams (0.1 mm at human scale).
# This avoids independently weighted duplicate vertices splitting in motion.
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0001)
bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.00001)
bm.to_mesh(obj.data)
bm.free()
obj.data.validate(verbose=True, clean_customdata=True)
obj.data.update()
obj.name = "Balotelli_Mobile_Prototype"
report["mobile_polygons"] = len(obj.data.polygons)
report["mobile_vertices"] = len(obj.data.vertices)
checkpoint()
# Resize only the in-memory copy. Original packed images remain in source.blend.
for image in bpy.data.images:
    if image.type == "IMAGE" and image.size[0] and max(image.size) > 2048:
        factor = 2048 / max(image.size)
        image.scale(max(1, round(image.size[0]*factor)), max(1, round(image.size[1]*factor)))

arm = bpy.data.armatures.new("Balotelli_Rig")
rig = bpy.data.objects.new("Balotelli_Rig", arm)
bpy.context.collection.objects.link(rig)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
rig.show_in_front = True
bpy.ops.object.mode_set(mode="EDIT")
def bone(name, head, tail, parent=None, deform=True):
    b = arm.edit_bones.new(name)
    b.head, b.tail = head, tail
    b.use_deform = deform
    if parent:
        b.parent = arm.edit_bones[parent]
    return b

bone("root", (0,0,0), (0,0,.2), deform=False)
bone("pelvis", (0,0,.86), (0,0,1.04), "root")
bone("spine", (0,0,1.04), (0,0,1.24), "pelvis")
bone("chest", (0,0,1.24), (0,0,1.51), "spine")
bone("neck", (0,0,1.51), (0,0,1.65), "chest")
bone("head", (0,0,1.65), (0,-.015,1.87), "neck")
for side, s in [("L",1), ("R",-1)]:
    bone("clavicle."+side, (s*.025,0,1.48), (s*.20,0,1.47), "chest")
    bone("upper_arm."+side, (s*.20,0,1.47), (s*.245,-.005,1.19), "clavicle."+side)
    bone("forearm."+side, (s*.245,-.005,1.19), (s*.275,-.03,.95), "upper_arm."+side)
    bone("hand."+side, (s*.275,-.03,.95), (s*.285,-.04,.82), "forearm."+side)
    bone("thigh."+side, (s*.12,0,.94), (s*.135,-.015,.56), "pelvis")
    bone("shin."+side, (s*.135,-.015,.56), (s*.15,.015,.15), "thigh."+side)
    bone("foot."+side, (s*.15,.015,.15), (s*.15,-.15,.075), "shin."+side)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
print("Binding automatic weights", flush=True)
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
deform = {b.name for b in arm.bones if b.use_deform}
groups = {g.index for g in obj.vertex_groups if g.name in deform}
def weights(vertex):
    return [(g.group, g.weight) for g in vertex.groups
            if g.group in groups and g.weight > .00001]

missing = [v for v in obj.data.vertices if not weights(v)]
report["initial_unweighted_vertices"] = len(missing)
report["weight_repairs"] = []
# Heat weights can omit tiny disconnected scan fragments. Repair only a small
# minority and only within 2 cm on this normalized 1.9 m model. Do not invent
# weights for whole limbs or replace any successful automatic binding.
if missing and len(missing) <= max(20, int(len(obj.data.vertices)*.001)):
    donors = [v for v in obj.data.vertices if weights(v)]
    if donors:
        tree = KDTree(len(donors))
        for vertex in donors:
            tree.insert(vertex.co, vertex.index)
        tree.balance()
        repairs = []
        for vertex in missing:
            _, index, distance = tree.find(vertex.co)
            if distance <= .02:
                repairs.append((vertex.index, index, distance, weights(obj.data.vertices[index])))
        for target, donor, distance, source_weights in repairs:
            total = sum(w for _, w in source_weights)
            for group, weight in source_weights:
                obj.vertex_groups[group].add([target], weight/total, "REPLACE")
            report["weight_repairs"].append({"vertex": target, "donor": donor,
                                            "distance_metres": distance})
unweighted = sum(not weights(v) for v in obj.data.vertices)
report["unweighted_vertices"] = unweighted
report["bones"] = len(arm.bones)
if unweighted:
    report["status"] = "binding_failed"
    checkpoint()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "balotelli-binding-review.blend"))
    raise RuntimeError("Automatic weights incomplete; manual binding review required")

# Use the same four normalized influences in Blender and the mobile glTF.
# Otherwise the exporter silently truncates weights and previews can disagree.
for vertex in obj.data.vertices:
    influences = sorted(weights(vertex), key=lambda pair: pair[1], reverse=True)
    keep = influences[:4]
    for group, _ in influences[4:]:
        obj.vertex_groups[group].remove([vertex.index])
    total = sum(w for _, w in keep)
    for group, weight in keep:
        obj.vertex_groups[group].add([vertex.index], weight/total, "REPLACE")
report["max_deform_influences"] = 4

# BEGIN ANIMATION REVIEW (also reused by the fast pose-fix script)
for vertex in obj.data.vertices:
    # Keep each boot rigid; fade to the shin above the ankle. Scan fragments
    # within a shoe must follow the same bone instead of tearing apart.
    if vertex.co.z < .19:
        side = "L" if vertex.co.x >= 0 else "R"
        for group in list(vertex.groups):
            obj.vertex_groups[group.group].remove([vertex.index])
        foot_weight = max(0, min(1, (.19-vertex.co.z)/.05))
        obj.vertex_groups["foot."+side].add([vertex.index], foot_weight, "REPLACE")
        obj.vertex_groups["shin."+side].add([vertex.index], 1-foot_weight, "REPLACE")

def world_axis_rotation(name, axis, angle):
    # Convert the desired world-axis rotation to this bone's rest frame.
    # Mirrored, downward-facing arm bones do not share Euler axis directions.
    rest = rig.data.bones[name].matrix_local.to_quaternion()
    local = rest.inverted() @ Quaternion(Vector(axis), angle) @ rest
    rig.pose.bones[name].rotation_euler = local.to_euler("XYZ")

scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 144
# A restrained six-second prototype: approach, settle, arms-out celebration.
# Full-body automatic weights must be visually reviewed before game integration.
for p in rig.pose.bones:
    p.rotation_mode = "XYZ"
for frame in list(range(1,145,3)) + [144]:
    t = (frame-1)/24
    for p in rig.pose.bones:
        p.rotation_euler = (0,0,0)
        p.location = (0,0,0)
    walk = min(t/2.5, 1)
    rig.location = (0, .65*(1-walk), 0)
    rig.keyframe_insert(data_path="location", frame=frame)
    if t < 2.5:
        fade = min(1,t*4)*min(1,(2.5-t)*4)
        cycle = t*math.tau*1.25
        for side,s in [("L",1),("R",-1)]:
            stride = math.sin(cycle)*s*fade
            rig.pose.bones["thigh."+side].rotation_euler.x = .22*stride
            rig.pose.bones["shin."+side].rotation_euler.x = -.28*max(0,-stride)
            rig.pose.bones["upper_arm."+side].rotation_euler.x = -.14*stride
            rig.pose.bones["forearm."+side].rotation_euler.x = -.12
    else:
        a = min(1,max(0,(t-2.8)/.9))
        a = a*a*(3-2*a)
        for side,s in [("L",1),("R",-1)]:
            world_axis_rotation("upper_arm."+side, (0,1,0), -s*.65*a)
            rig.pose.bones["forearm."+side].rotation_euler.x = -.08*a
        rig.pose.bones["head"].rotation_euler.x = -.06*a
    for p in rig.pose.bones:
        p.keyframe_insert(data_path="rotation_euler", frame=frame)
if rig.animation_data and rig.animation_data.action:
    rig.animation_data.action.name = "Pack_Walkout_Celebration_Prototype"
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "balotelli-rigged-prototype.blend"))
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(out / "balotelli-prototype.glb"),
                          export_format="GLB", use_selection=True,
                          export_animations=True, export_frame_range=True)
report["glb_bytes"] = (out / "balotelli-prototype.glb").stat().st_size
report["status"] = "exported_requires_visual_review"
checkpoint()
# Three diagnostic poses, material colour only, to expose binding defects.
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_cavity = True
cam_data = bpy.data.cameras.new("Rig review camera")
cam = bpy.data.objects.new("Rig review camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type, cam_data.ortho_scale = "ORTHO", 2.5
cam.location = (0,-5,1.05)
cam.rotation_euler = (Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
for label,frame in [("standing",1),("walking",24),("celebration",120)]:
    scene.frame_set(frame)
    scene.render.filepath = str(out / ("rig-"+label+".png"))
    bpy.ops.render.render(write_still=True)
report["status"] = "preview_ready_requires_visual_review"
checkpoint()
print("BALOTELLI_RIG_PREVIEW_READY", flush=True)
