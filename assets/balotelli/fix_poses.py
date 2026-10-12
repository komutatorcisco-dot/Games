"""Rebuild poses from the saved lightweight rig; never touches source.blend."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

out = Path(__file__).resolve().parent
report = json.loads((out / "rig-report.json").read_text(encoding="utf-8"))
report["status"] = "rebuilding_poses"
report["pose_revision"] = 2
def checkpoint():
    (out / "rig-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
checkpoint()
obj = bpy.data.objects["Balotelli_Mobile_Prototype"]
rig = bpy.data.objects["Balotelli_Rig"]
rig.animation_data_clear()
for pose in rig.pose.bones:
    pose.rotation_euler = (0,0,0)
    pose.location = (0,0,0)
rig.location = (0,0,0)
source = (out / "prepare_rig.py").read_text(encoding="utf-8")
marker = "# BEGIN ANIMATION REVIEW (also reused by the fast pose-fix script)"
if source.count(marker) != 1:
    raise RuntimeError("Animation source marker mismatch")
exec(compile(source.split(marker, 1)[1], str(out / "prepare_rig.py"), "exec"))
