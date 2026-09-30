"""Combine approved Meshy clips, remove root travel, add original equipment, export GLB."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Quaternion, Matrix

ROOT=Path(__file__).resolve().parents[1]
folder=Path(sys.argv[sys.argv.index('--')+1]);kind=sys.argv[-1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(folder/'idle.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
# Meshy's motion exports flatten the surface shader. Restore the original UV-matched PBR maps.
with bpy.data.libraries.load(str(folder/'rig-input.blend'),link=False) as (source_data,target_data):
    target_data.materials=source_data.materials
surface=next((m for m in target_data.materials if m and m.node_tree and sum(n.type=='TEX_IMAGE' for n in m.node_tree.nodes)>=3),None)
if surface:
    for mesh in meshes:mesh.data.materials.clear();mesh.data.materials.append(surface)
for o in list(bpy.context.scene.objects):
    if o not in meshes and o!=rig:bpy.data.objects.remove(o,do_unlink=True)
actions={'idle':rig.animation_data.action}
slots={'idle':rig.animation_data.action_slot}
for clip in (('run','attack','dodge') if kind in ('knight','cyborg') else ()):
    existing=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(folder/(clip+'.glb')))
    created=set(bpy.data.objects)-existing
    imported=next(o for o in created if o.type=='ARMATURE')
    assert set(imported.pose.bones.keys())==set(rig.pose.bones.keys()),'Skeleton mismatch'
    actions[clip]=imported.animation_data.action;slots[clip]=imported.animation_data.action_slot
    for obj in created:bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene.render.fps=60
clips={};durations={'idle':179,'run':47,'attack':47,'dodge':37}
rest_position=rig.matrix_world @ rig.data.bones['Hips'].head_local
idle_pose=None
for name,action in actions.items():
    rig.animation_data.action=action;rig.animation_data.action_slot=slots[name]
    start,end=action.frame_range;samples=[]
    for i in range(durations[name]):
        frame=start+(end-start)*i/(durations[name]-1)
        scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        hips=rig.pose.bones['Hips'];matrix=hips.matrix.copy()
        position=rig.matrix_world @ matrix.translation
        position.x=rest_position.x;position.y=rest_position.y
        matrix.translation=rig.matrix_world.inverted() @ position;hips.matrix=matrix
        bpy.context.view_layer.update()
        samples.append({b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones})
    if name=='idle':idle_pose=samples[0]
    clips[name]=samples
# A restrained collapse is authored locally on the same skeleton.
samples=[]
for i in range(61):
    pose={n:(p.copy(),q.copy(),s.copy()) for n,(p,q,s) in idle_pose.items()}
    t=min(1,i/40);p,q,s=pose['Hips']
    # Convert a world-space fall into the imported bone's local rotation basis.
    fall=Quaternion((1,0,0),-1.48*t)
    basis=rig.data.bones['Hips'].matrix_local.to_quaternion()
    q=basis.inverted() @ fall @ basis @ q
    offset=rig.matrix_world.inverted().to_3x3() @ Vector((0,0,-.76*t))
    p+=rig.data.bones['Hips'].matrix_local.to_3x3().inverted() @ offset
    pose['Hips']=(p,q,s);samples.append(pose)
clips['death']=samples
rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
for name,samples in clips.items():
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    for frame,pose in enumerate(samples,1):
        for bone_name,(p,q,s) in pose.items():
            b=rig.pose.bones[bone_name];b.rotation_mode='QUATERNION';b.location=p;b.rotation_quaternion=q;b.scale=s
            for path in ('location','rotation_quaternion','scale'):b.keyframe_insert(data_path=path,frame=frame,group=bone_name)
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action);track.mute=True
for b in rig.pose.bones:b.matrix_basis.identity()

def material(name,color,metallic):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    node=m.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1);node.inputs['Metallic'].default_value=metallic;node.inputs['Roughness'].default_value=.32
    return m
steel=material('Concord forged steel',(.35,.43,.47),.8)
gold=material('Concord old brass',(.37,.22,.07),.8)
teal=material('Concord shield enamel',(.025,.12,.15),.5)
def weighted_mesh(name,vertices,faces,bone_name,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat)
    group=obj.vertex_groups.new(name=bone_name);group.add(list(range(len(vertices))),1,'REPLACE')
    modifier=obj.modifiers.new('Held equipment','ARMATURE');modifier.object=rig
    obj.parent=rig;obj.matrix_parent_inverse=rig.matrix_world.inverted()
    meshes.append(obj)
if kind=='knight':
    hand=rig.matrix_world @ rig.data.bones['RightHand'].head_local
    direction=Vector((-.12,-.16,-1)).normalized();right=Vector((1,0,-.12)).normalized();normal=direction.cross(right).normalized()
    def sword_part(name,start,end,width,depth,mat):
        verts=[]
        for point in (hand+direction*start,hand+direction*end):
            verts.extend([tuple(point+right*width),tuple(point+normal*depth),tuple(point-right*width),tuple(point-normal*depth)])
        weighted_mesh(name,verts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'RightHand',mat)
    sword_part('Longsword grip',-.1,.08,.027,.027,teal)
    sword_part('Longsword crossguard',.065,.105,.17,.023,gold)
    blade=[]
    for distance,width,depth in [(.105,.047,.012),(.72,.028,.009)]:
        point=hand+direction*distance
        blade.extend([tuple(point+right*width),tuple(point+normal*depth),tuple(point-right*width),tuple(point-normal*depth)])
    blade.append(tuple(hand+direction*.88))
    weighted_mesh('Longsword blade',blade,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,8),(5,6,8),(6,7,8),(7,4,8)],'RightHand',steel)
    centre=rig.matrix_world @ rig.data.bones['LeftHand'].head_local+Vector((0,-.12,.05))
    outline=[(-.25,.29),(.25,.29),(.24,-.06),(0,-.37),(-.24,-.06)]
    for size,depth,mat,name in [(1,.025,gold,'Heater shield rim'),(.89,0,teal,'Heater shield face')]:
        verts=[tuple(centre+Vector((x*size,-.055-depth,z*size))) for x,z in outline]
        verts.append(tuple(centre+Vector((0,-.13-depth,0))))
        weighted_mesh(name,verts,[(i,(i+1)%5,5)for i in range(5)],'LeftHand',mat)
    sigil=[]
    for i in range(24):
        angle=i*math.tau/24
        for radius in (.105,.123):sigil.append(tuple(centre+Vector((math.cos(angle)*radius,-.17,math.sin(angle)*radius))))
    weighted_mesh('Heater shield clockwork crest',sigil,[(2*i,2*i+1,(2*i+3)%48,(2*i+2)%48)for i in range(24)],'LeftHand',gold)
if kind=='knight':
    equipment=[o for o in meshes if o.name.startswith(('Longsword','Heater'))]
    weapon_material=material('Concord equipment',(.5,.5,.5),.7)
    attr=weapon_material.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Equipment pigment'
    weapon_material.node_tree.links.new(attr.outputs['Color'],weapon_material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in equipment:
        color=obj.data.materials[0].diffuse_color
        attribute=obj.data.color_attributes.new(name='Equipment pigment',type='FLOAT_COLOR',domain='CORNER')
        for value in attribute.data:value.color=color
        obj.data.materials.clear();obj.data.materials.append(weapon_material);obj.select_set(True)
    bpy.context.view_layer.objects.active=equipment[0];bpy.ops.object.join()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]

def evaluated_points(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    geometry=evaluated.to_mesh()
    result=[evaluated.matrix_world @ v.co for v in geometry.vertices]
    evaluated.to_mesh_clear()
    return result

# Bake ground contact and held-prop wrist corrections into the clips, not the runtime.
for track in rig.animation_data.nla_tracks:
    action=track.strips[0].action
    rig.animation_data.action=action
    for frame in range(1,len(clips[track.name])+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        if kind=='knight' and track.name=='dodge':
            held=next(o for o in meshes if o.name.startswith('Longsword'))
            for hand_name in ('RightHand','LeftHand'):
                group=held.vertex_groups.get(hand_name)
                if not group:continue
                indices=[v.index for v in held.data.vertices if any(g.group==group.index and g.weight>.9 for g in v.groups)]
                wrist=rig.pose.bones[hand_name]
                for _ in range(5):
                    points=evaluated_points(held)
                    lowest=min((points[i] for i in indices),key=lambda p:p.z)
                    if lowest.z>=.06:break
                    matrix=rig.matrix_world @ wrist.matrix
                    offset=lowest-matrix.translation
                    if offset.length<.03:break
                    desired_z=max(-.95,min(.95,(.065-matrix.translation.z)/offset.length))
                    horizontal=Vector((offset.x,offset.y,0))
                    if horizontal.length<.001:horizontal=Vector((0,-1,0))
                    horizontal.normalize()
                    desired=horizontal*math.sqrt(1-desired_z**2)+Vector((0,0,desired_z))
                    correction=offset.normalized().rotation_difference(desired)
                    position,rotation,scale=matrix.decompose()
                    wrist.matrix=rig.matrix_world.inverted() @ Matrix.LocRotScale(position,correction @ rotation,scale)
                    bpy.context.view_layer.update()
                wrist.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=hand_name)
        low=min(p.z for obj in meshes for p in evaluated_points(obj))
        lift=.01-low if track.name=='death' else max(0,.01-low)
        if abs(lift)>.00001:
            offset=rig.matrix_world.inverted().to_3x3() @ Vector((0,0,lift))
            rig.pose.bones['Hips'].location+=rig.data.bones['Hips'].matrix_local.to_3x3().inverted() @ offset
            rig.pose.bones['Hips'].keyframe_insert(data_path='location',frame=frame,group='Hips')
    rig.animation_data.action=None
for b in rig.pose.bones:b.matrix_basis.identity()
out=ROOT/'assets/source/private/runtime-unoptimized'/f'{kind}.glb'
rig.name=kind.title()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source'/f'{kind}.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_tangents=True)
report={'model':kind,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes),'bones':len(rig.data.bones),'animations':list(clips),'bytes':out.stat().st_size,'root_motion':'horizontal travel removed; server owns movement','equipment':'Original Blender sword and shield' if kind=='knight' else 'Generated ceramic body and pulse forearm' if kind=='cyborg' else 'Town clothing; no equipped props'}
(ROOT/'artifacts/checkpoint'/f'{kind}-rig.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
