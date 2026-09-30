"""Reduce a generated character before rigging, retaining UVs and original evidence."""
from __future__ import annotations
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
source,output=map(Path,args[:2]);target=int(args[2]) if len(args)>2 else 24000
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
before=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
for obj in meshes:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    mod=obj.modifiers.new('Browser topology','DECIMATE');mod.ratio=min(1,target/before);mod.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:poly.use_smooth=True
    obj.select_set(False)
after=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
for image in bpy.data.images:
    if image.size[0]>1024 or image.size[1]>1024:image.scale(1024,1024)
    if image.has_data:image.pack()
points=[obj.matrix_world@Vector(v) for obj in meshes for v in obj.bound_box]
mins=[min(p[i] for p in points) for i in range(3)];maxs=[max(p[i] for p in points) for i in range(3)]
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_apply=True,export_yup=True,export_image_format='AUTO')
report={'source':source.name,'output':output.name,'triangles_before':before,'triangles_after':after,'materials':len(bpy.data.materials),'dimensions_blender':[maxs[i]-mins[i] for i in range(3)],'blender':bpy.app.version_string,'bytes':output.stat().st_size,'textures_max':1024,'review':'requires deforming browser inspection'}
output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
