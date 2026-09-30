"""Finish the representative Meshy merchant house; retain the provider original.

blender --background --python-exit-code 1 --python tools/prepare_house.py -- INPUT_GLB
The checked-in Blender library is placed by build_environment.py.
"""
from pathlib import Path
import json
import sys
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[sys.argv.index('--') + 1])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
before = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
if not before:
    raise ValueError('The delivered house contains no faces')
points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
centre = Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))
dimensions = high-low
scale = Vector((6.5/dimensions.x, 6.5/dimensions.y, 8.2/dimensions.z))
for index, obj in enumerate(meshes):
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    for vertex in obj.data.vertices:
        local = world @ vertex.co-centre
        vertex.co = Vector(tuple(local[i]*scale[i] for i in range(3)))
    obj.data.update()
    obj.name = f'house.merchant.{index}'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if before > 18000:
        modifier = obj.modifiers.new('Architectural browser topology', 'DECIMATE')
        modifier.ratio = 18000/before
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)
for image in bpy.data.images:
    if image.size[0] > 2048 or image.size[1] > 2048:
        image.scale(2048, 2048)
    if image.has_data:
        image.pack()
after = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
output = ROOT/'assets/source/merchant-house.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
report = {
    'source_task': '01a0f291-7497-73cf-a2c4-958706ec4817',
    'source_resource': 'image-to-3d',
    'source': source.name,
    'output': str(output.relative_to(ROOT)),
    'triangles_before': before,
    'triangles_after': after,
    'height_metres': 8.2,
    'dimensions_metres': [6.5, 6.5, 8.2],
    'proportion_repair': 'Provider model compressed the gable width; restored the reference house proportions.',
    'textures_max': 2048,
    'blender': bpy.app.version_string,
    'review': 'Candidate; browser review required before acceptance',
}
(ROOT/'artifacts/checkpoint/merchant-house-preparation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
