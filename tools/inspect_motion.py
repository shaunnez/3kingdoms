"""Measure deformed GLB bounds over every clip; optionally render a named pose."""
import bpy
import json
import hashlib
import sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, output = map(Path, args[:2])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
meshes = [o for o in scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
tracks = list(rig.animation_data.nla_tracks)
rig.animation_data.action = None
for track in tracks:
    track.mute = True
report = {'file': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'blender': bpy.app.version_string, 'clips': {}}
for track in tracks:
    track.mute = False
    strip = track.strips[0]
    poses = []
    for step in range(9):
        frame = strip.frame_start + (strip.frame_end - strip.frame_start) * step / 8
        scene.frame_set(int(frame), subframe=frame-int(frame))
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        points = []
        parts = []
        for obj in meshes:
            evaluated = obj.evaluated_get(deps)
            geometry = evaluated.to_mesh()
            vertices = [evaluated.matrix_world @ v.co for v in geometry.vertices]
            points.extend(vertices)
            parts.append({'mesh': obj.name, 'low': [min(v[i] for v in vertices) for i in range(3)], 'high': [max(v[i] for v in vertices) for i in range(3)]})
            evaluated.to_mesh_clear()
        low = [min(p[i] for p in points) for i in range(3)]
        high = [max(p[i] for p in points) for i in range(3)]
        poses.append({'phase': step/8, 'low': low, 'high': high, 'dimensions': [high[i]-low[i] for i in range(3)], 'parts': parts})
    report['clips'][track.name] = poses
    track.mute = True
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'file': source.name, 'clips': {name: {'max_height': max(p['dimensions'][2] for p in poses), 'min_ground': min(p['low'][2] for p in poses)} for name, poses in report['clips'].items()}}))

if len(args) >= 3:
    selected = next(t for t in tracks if args[2] in t.name)
    selected.mute = False
    strip = selected.strips[0]
    phase = float(args[3]) if len(args) > 3 else .25
    scene.frame_set(int(strip.frame_start+(strip.frame_end-strip.frame_start)*phase))
    neutral = report['clips'].get('idle', next(iter(report['clips'].values())))[0]
    centre = (Vector(neutral['low'])+Vector(neutral['high']))/2
    bpy.ops.object.camera_add(location=(3.5,-4.2,2.3))
    camera = bpy.context.object
    camera.rotation_euler = (centre-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = max(neutral['dimensions']) * 1.6
    scene.camera = camera
    for location, power in [((3,-4,5),600),((-3,1,3),450),((0,3,4),350)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = power
        light.data.size = 4
        light.rotation_euler = (centre-light.location).to_track_quat('-Z','Y').to_euler()
    scene.world.color = (.25,.25,.25)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(output.with_suffix('.png'))
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.render.render(write_still=True)
