"""Author the pilot hound's quadruped skeleton and in-place motion in Blender."""
import bpy
import math
import sys
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
ground=min(v.co.z for v in mesh.data.vertices)
scale=1.1/(max(v.co.z for v in mesh.data.vertices)-ground)
def point(x,y,z):return Vector((x*scale,y*scale,(z-ground)*scale))
for v in mesh.data.vertices:v.co=point(*v.co)
bpy.ops.object.armature_add()
rig=bpy.context.object;rig.name='BriarHound';rig.data.name='THREEFOLD quadruped v1'
bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
bones={}
def bone(name,head,tail,parent=None):
    b=rig.data.edit_bones.new(name);b.head=point(*head);b.tail=point(*tail)
    if parent:b.parent=rig.data.edit_bones[parent]
    bones[name]=(b.head.copy(),b.tail.copy())
bone('Hips',(0,.35,.2),(0,.05,.2))
bone('Spine',(0,.05,.2),(0,-.31,.21),'Hips')
bone('Neck',(0,-.31,.21),(0,-.51,.39),'Spine')
bone('Head',(0,-.51,.39),(0,-.88,.26),'Neck')
bone('Tail',(0,.55,.23),(0,.79,-.04),'Hips')
bone('TailTip',(0,.79,-.04),(0,.93,-.30),'Tail')
for side,x in [('L',.155),('R',-.155)]:
    bone(f'FrontUpper.{side}',(x,-.31,.13),(x,-.34,-.24),'Spine')
    bone(f'FrontLower.{side}',(x,-.34,-.24),(x,-.36,-.54),f'FrontUpper.{side}')
    bone(f'FrontPaw.{side}',(x,-.36,-.54),(x,-.48,-.615),f'FrontLower.{side}')
    bone(f'RearUpper.{side}',(x,.43,.18),(x,.25,-.20),'Hips')
    bone(f'RearLower.{side}',(x,.25,-.20),(x,.45,-.46),f'RearUpper.{side}')
    bone(f'RearPaw.{side}',(x,.45,-.46),(x,.37,-.615),f'RearLower.{side}')
bpy.ops.object.mode_set(mode='OBJECT')
groups={name:mesh.vertex_groups.new(name=name) for name in bones}
def segment_distance(p,a,b):
    ab=b-a;t=max(0,min(1,(p-a).dot(ab)/ab.length_squared))
    return (p-a-ab*t).length
for v in mesh.data.vertices:
    raw=Vector((v.co.x/scale,v.co.y/scale,v.co.z/scale+ground))
    # Continuous nearest-bone weights avoid hard slice boundaries through connected fur.
    # Tail vertices remain near tail bones even when they are lower than the belly.
    ranked=[]
    for name,(head,tail) in bones.items():
        weight=1/(segment_distance(v.co,head,tail)+.035)**5
        if name.endswith(('.L','.R')):
            side=max(0,min(1,(raw.x+.06)/.12))
            if name.endswith('.R'):side=1-side
            weight*=.1+.9*side
        ranked.append((weight,name))
    ranked=sorted(ranked,reverse=True)[:4];total=sum(weight for weight,_ in ranked)
    for weight,name in ranked:groups[name].add([v.index],weight/total,'REPLACE')
mesh.parent=rig
mod=mesh.modifiers.new('Quadruped deformation','ARMATURE');mod.object=rig
rig.animation_data_create()
for b in rig.pose.bones:b.rotation_mode='XYZ'
scene=bpy.context.scene;scene.render.fps=30
durations={'idle':90,'walk':36,'run':22,'attack':23,'dodge':18,'death':30}
for name,end in durations.items():
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame in range(1,end+1):
        scene.frame_set(frame)
        phase=(frame-1)/(end-1);wave=math.sin(phase*math.tau)
        for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
        if name in ('walk','run'):
            strength=.32 if name=='walk' else .6
            for side,offset in [('L',0),('R',math.pi)]:
                for endname,offset2 in [('Front',0),('Rear',math.pi)]:
                    swing=math.sin(phase*math.tau+offset+offset2)
                    rig.pose.bones[f'{endname}Upper.{side}'].rotation_euler.x=swing*strength
                    rig.pose.bones[f'{endname}Lower.{side}'].rotation_euler.x=max(0,-swing)*strength*.9
            rig.pose.bones['Hips'].location.z=abs(wave)*(.014 if name=='walk' else .028)
            rig.pose.bones['Spine'].rotation_euler.x=wave*.035
        elif name=='idle':
            rig.pose.bones['Spine'].rotation_euler.x=wave*.014
            rig.pose.bones['Head'].rotation_euler.z=wave*.03
        elif name=='attack':
            lunge=math.sin(phase*math.pi)
            rig.pose.bones['Neck'].rotation_euler.x=lunge*.36
            rig.pose.bones['Head'].rotation_euler.x=-lunge*.42
            rig.pose.bones['Hips'].location.y=-lunge*.12
        elif name=='dodge':
            rig.pose.bones['Hips'].location.z=math.sin(phase*math.pi)*.12
            for side in ('L','R'):
                rig.pose.bones[f'FrontUpper.{side}'].rotation_euler.x=-math.sin(phase*math.pi)*.5
                rig.pose.bones[f'RearUpper.{side}'].rotation_euler.x=math.sin(phase*math.pi)*.5
        elif name=='death':
            rig.pose.bones['Hips'].rotation_euler.y=min(1,phase*2)*1.45
            rig.pose.bones['Hips'].location.z=-min(1,phase*2)*.21
        rig.pose.bones['Tail'].rotation_euler.z=wave*.12
        rig.pose.bones['TailTip'].rotation_euler.z=wave*.15
        if name=='death':
            bpy.context.view_layer.update()
            evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            geometry=evaluated.to_mesh()
            low=min((evaluated.matrix_world @ v.co).z for v in geometry.vertices)
            evaluated.to_mesh_clear()
            offset=rig.matrix_world.inverted().to_3x3() @ Vector((0,0,.01-low))
            rig.pose.bones['Hips'].location+=rig.data.bones['Hips'].matrix_local.to_3x3().inverted() @ offset
        for b in rig.pose.bones:
            b.keyframe_insert(data_path='rotation_euler',frame=frame,group=b.name)
            b.keyframe_insert(data_path='location',frame=frame,group=b.name)
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new();track.name=name
    track.strips.new(name,1,action);track.mute=True
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
out=ROOT/'assets/source/private/runtime-unoptimized/wolf.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/wolf.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_tangents=True)
report={'model':'wolf','triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'bones':len(bones),'animations':list(durations),'height_m':1.1,'bytes':out.stat().st_size,'rig':'Original Blender quadruped; spatial skin weights; needs in-browser deformation review'}
(ROOT/'artifacts/checkpoint/wolf-rig.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
