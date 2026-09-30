"""Inspect a delivered model's bounds, skeleton and one neutral lit view."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, output = map(Path, args[:2])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
centre = (low + high) / 2
report = {'bounds': [list(low), list(high)], 'actions': [a.name for a in bpy.data.actions], 'objects': [{ 'name': o.name, 'type': o.type, 'scale': list(o.scale)} for o in bpy.context.scene.objects], 'bones': {o.name: [{'name': b.name, 'head': list(o.matrix_world @ b.head_local), 'tail': list(o.matrix_world @ b.tail_local)} for b in o.data.bones] for o in bpy.context.scene.objects if o.type == 'ARMATURE'}}
output.with_suffix('.json').write_text(json.dumps(report, indent=2))
bpy.ops.object.camera_add(location=centre + Vector((3.7, -4.2, 1.5)))
camera = bpy.context.object
camera.rotation_euler = (centre-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = max(high-low) * 1.4
bpy.context.scene.camera = camera
for location, power, size in [((3,-4,5),600,5),((-3,1,3),450,4),((0,3,4),350,3)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light=bpy.context.object
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(centre-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.world.color=(.25,.25,.25)
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.render.resolution_x=1000
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(output)
scene.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
print(json.dumps({'preview':str(output),'bounds':report['bounds'],'actions':report['actions']}))
