"""Author held-equipment poses and individual Knight actions on the existing rig.

No provider calls. Retains the original legs/skin and bakes two-bone arm posing at
30 fps. Input is the preserved pre-repair Blender file, never the previous output.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts/private/combat-before/knight.blend"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == "ARMATURE")
body = next(o for o in scene.objects if o.type == "MESH" and o.name == "char1")
tracks = {t.name: t for t in rig.animation_data.nla_tracks}
rig.animation_data.action = None
for track in tracks.values():
    track.mute = True


def capture() -> dict:
    return {b.name: (b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy()) for b in rig.pose.bones}


def restore(pose: dict) -> None:
    for name, (p, q, s) in pose.items():
        b = rig.pose.bones[name]
        b.rotation_mode = "QUATERNION"
        b.location, b.rotation_quaternion, b.scale = p.copy(), q.copy(), s.copy()
    bpy.context.view_layer.update()


def sample(name: str, phase: float) -> dict:
    t = tracks[name]
    t.mute = False
    strip = t.strips[0]
    frame = strip.frame_start + (strip.frame_end - strip.frame_start) * phase
    scene.frame_set(int(frame), subframe=frame % 1)
    bpy.context.view_layer.update()
    pose = capture()
    t.mute = True
    return pose


# Cache before disabling the imported actions. Each sample keeps authored footwork.
base = sample("idle", 0)
original = {name: [sample(name, i / count) for i in range(count + 1)]
            for name, count in (("idle", 90), ("run", 24), ("dodge", 18), ("death", 30))}
for t in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(t)
rig.animation_data.action = None
restore(base)
hand_rotation = {side: (rig.matrix_world @ rig.pose.bones[side + "Hand"].matrix).to_quaternion()
                 for side in ("Left", "Right")}


def point(name: str) -> Vector:
    return (rig.matrix_world @ rig.pose.bones[name].matrix).translation


def rotate_toward(name: str, child: str, target: Vector) -> None:
    b = rig.pose.bones[name]
    matrix = rig.matrix_world @ b.matrix
    origin, q, scale = matrix.decompose()
    direction = point(child) - origin
    correction = direction.normalized().rotation_difference((target - origin).normalized())
    b.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(origin, correction @ q, scale)
    bpy.context.view_layer.update()


def arm(side: str, target: Vector, pole: Vector, rotation: Quaternion) -> None:
    upper, lower, hand = (side + n for n in ("Arm", "ForeArm", "Hand"))
    shoulder = point(upper)
    l1, l2 = (point(lower) - shoulder).length, (point(hand) - point(lower)).length
    delta = target - shoulder
    d = min(delta.length, l1 + l2 - .002)
    direction = delta.normalized()
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    perpendicular = pole - shoulder
    perpendicular -= direction * perpendicular.dot(direction)
    elbow = shoulder + direction * along + perpendicular.normalized() * math.sqrt(max(0, l1 * l1 - along * along))
    rotate_toward(upper, lower, elbow)
    rotate_toward(lower, hand, shoulder + direction * d)
    b = rig.pose.bones[hand]
    matrix = rig.matrix_world @ b.matrix
    b.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(matrix.translation, rotation, matrix.to_scale())
    bpy.context.view_layer.update()


READY_R = Vector((-.37, -.25, 1.17))
READY_L = Vector((.34, -.31, 1.22))
SWORD_READY = Vector((-.13, -.30, .945)).normalized()


def pose_arms(right=READY_R, left=READY_L, blade=SWORD_READY, shield_turn=0.0) -> None:
    arm("Right", Vector(right), Vector((-.65, .12, 1.15)),
        SWORD_READY.rotation_difference(Vector(blade).normalized()) @ hand_rotation["Right"])
    arm("Left", Vector(left), Vector((.65, .08, 1.22)),
        Quaternion((0, 0, 1), shield_turn) @ hand_rotation["Left"])


# Fit props in the actual ready pose, then invert skinning to store bind vertices.
pose_arms()
ready = capture()
# The source has an open, unarticulated hand. Close its finger silhouette around
# the hilt in the ready pose, retaining the textured palm and wrist skin weights.
skin = rig.matrix_world @ rig.pose.bones["RightHand"].matrix @ rig.data.bones["RightHand"].matrix_local.inverted() @ rig.matrix_world.inverted()
hand_group = body.vertex_groups.get("RightHand")
wrist = point("RightHand")
if hand_group:
    for vertex in body.data.vertices:
        weight = next((g.weight for g in vertex.groups if g.group == hand_group.index), 0)
        if weight < .85:
            continue
        world = skin @ (body.matrix_world @ vertex.co)
        if world.z < wrist.z - .06:
            depth = wrist.z - .06 - world.z
            world.z = wrist.z - .06 - depth * .28
            world.y -= min(.055, depth * .35)
            vertex.co = body.matrix_world.inverted() @ (skin.inverted() @ world)
for obj in list(scene.objects):
    if obj.type == "MESH" and obj != body:
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name: str, color: tuple, metal: float, roughness: float):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = roughness
    return m


steel = material("Tempered steel", (.30, .38, .43), .85, .27)
brass = material("Worn brass", (.42, .28, .10), .78, .36)
teal = material("Teal shield enamel", (.028, .12, .135), .4, .42)
leather = material("Leather straps", (.07, .043, .025), .05, .8)
equipment = []


def held(name: str, vertices: list, faces: list, bone: str, mat) -> None:
    skin = rig.matrix_world @ rig.pose.bones[bone].matrix @ rig.data.bones[bone].matrix_local.inverted() @ rig.matrix_world.inverted()
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([skin.inverted() @ Vector(v) for v in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(vertices))), 1, "REPLACE")
    modifier = obj.modifiers.new("Rigid hand binding", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    equipment.append(obj)


def box(name: str, centre: Vector, axes: tuple, size: tuple, bone: str, mat) -> None:
    verts = [centre + axes[0] * x * size[0] / 2 + axes[1] * y * size[1] / 2 + axes[2] * z * size[2] / 2
             for x, y, z in ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))]
    held(name, verts, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], bone, mat)


grip = point("RightHand") + Vector((0, -.035, -.095))
d = SWORD_READY
cross = Vector((1, 0, 0)); cross = (cross - d * cross.dot(d)).normalized()
normal = d.cross(cross).normalized()
axes = (cross, normal, d)
box("Wrapped sword grip", grip, axes, (.038,.038,.16), "RightHand", leather)
box("Sword crossguard", grip + d * .11, axes, (.28,.042,.045), "RightHand", brass)
box("Sword pommel", grip - d * .105, axes, (.065,.05,.05), "RightHand", brass)
verts = []
for t, w in ((.13, .046), (.70, .024)):
    p = grip + d * t
    verts.extend([p+cross*w,p+normal*.013,p-cross*w,p-normal*.013])
verts.append(grip+d*.85)
held("Sword blade", verts, [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,8),(5,6,8),(6,7,8),(7,4,8)], "RightHand", steel)

centre = point("LeftHand") + Vector((0, -.11, -.015))
outline = [(-.26,.32),(.26,.32),(.265,-.07),(.15,-.28),(0,-.41),(-.15,-.28),(-.265,-.07)]
count = len(outline)
for size, offset, mat, name in ((1,0,brass,"Shield rim"),(.89,-.018,teal,"Shield face")):
    verts = [centre+Vector((x*size,offset,z*size)) for x,z in outline]
    verts += [centre+Vector((x*size,.045+offset,z*size)) for x,z in outline]
    verts.append(centre+Vector((0,-.045+offset,0)))
    faces = [(i,(i+1)%count,count*2) for i in range(count)]
    faces += [(i,count+i,count+(i+1)%count,(i+1)%count) for i in range(count)]
    faces.append(tuple(range(count, count*2)))
    held(name,verts,faces,"LeftHand",mat)
world_axes=(Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
box("Shield hand grip", centre+Vector((0,.09,0)), world_axes, (.19,.035,.035), "LeftHand", leather)
for x in (-.10,.10):
    box("Shield grip bracket", centre+Vector((x,.065,0)), world_axes, (.03,.08,.09), "LeftHand", brass)
# Raised tree crest and six restrained brass rivets; geometry remains visible at play distance.
box("Crest trunk", centre+Vector((0,-.066,-.02)), world_axes, (.024,.012,.25), "LeftHand", brass)
for side in (-1,1):
    for z in (-.01,.065,.13):
        a=centre+Vector((0,-.067,z-.045)); b=centre+Vector((side*.095,-.067,z))
        held("Crest branch",[a+Vector((0,0,.012)),a-Vector((0,0,.012)),b-Vector((0,0,.012)),b+Vector((0,0,.012))],[(0,1,2,3)],"LeftHand",brass)

# One equipment material with vertex pigments; avoid a draw call for every rivet.
pigment = material("Knight equipment pigments", (.5,.5,.5), .65, .36)
attr= pigment.node_tree.nodes.new("ShaderNodeVertexColor"); attr.layer_name="Equipment pigment"
pigment.node_tree.links.new(attr.outputs["Color"],pigment.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
bpy.ops.object.select_all(action="DESELECT")
for obj in equipment:
    color = obj.data.materials[0].diffuse_color
    colors = obj.data.color_attributes.new(name="Equipment pigment", type="FLOAT_COLOR", domain="CORNER")
    for v in colors.data: v.color=color
    obj.data.materials.clear(); obj.data.materials.append(pigment); obj.select_set(True)
bpy.context.view_layer.objects.active=equipment[0]; bpy.ops.object.join()
bpy.context.object.name="Concord sword and heater shield"


def curve(keys: list, t: float) -> Vector:
    for (ta,a),(tb,b) in zip(keys, keys[1:]):
        if t <= tb:
            x=max(0,min(1,(t-ta)/(tb-ta))); x=x*x*(3-2*x)
            return Vector(a).lerp(Vector(b),x)
    return Vector(keys[-1][1])


# Times in seconds, with the contact pose at the exact server windup.
actions = {
    "cut": (.66, .3, [ (0,READY_R),(.18,(-.48,.02,1.39)),(.30,(.02,-.49,1.17)),(.43,(.24,-.32,1.00)),(.66,READY_R)],
            [(0,SWORD_READY),(.18,(-.7,.25,.8)),(.30,(.15,-1,.10)),(.43,(.8,-.55,-.20)),(.66,SWORD_READY)]),
    "sunder": (.9,.45,[(0,READY_R),(.30,(-.28,-.08,1.76)),(.45,(-.12,-.48,1.18)),(.60,(-.16,-.42,1.03)),(.9,READY_R)],
               [(0,SWORD_READY),(.3,(0,.12,1)),(.45,(0,-1,-.2)),(.6,(0,-.8,-.5)),(.9,SWORD_READY)]),
    "bash": (.65,.35,[(0,READY_R),(.65,READY_R)],[(0,SWORD_READY),(.65,SWORD_READY)]),
    "challenge": (.62,.3,[(0,READY_R),(.3,(-.32,-.36,1.48)),(.62,READY_R)],[(0,SWORD_READY),(.3,(0,-.65,.8)),(.62,SWORD_READY)]),
    "interpose": (.5,.2,[(0,READY_R),(.5,READY_R)],[(0,SWORD_READY),(.5,SWORD_READY)]),
    "rally": (1.05,.7,[(0,READY_R),(.5,(-.3,-.32,1.10)),(.8,(-.3,-.32,1.10)),(1.05,READY_R)],[(0,SWORD_READY),(.5,(0,-.1,-1)),(.8,(0,-.1,-1)),(1.05,SWORD_READY)]),
    "oath": (1,.6,[(0,READY_R),(.5,(-.18,-.33,1.54)),(.7,(-.18,-.33,1.54)),(1,READY_R)],[(0,SWORD_READY),(.5,(0,0,1)),(.7,(0,0,1)),(1,SWORD_READY)]),
}
clips={}
for name, samples in original.items():
    frames=[]
    for i,p in enumerate(samples):
        restore(p)
        if name in ("idle","run"):
            bob=math.sin(i/(len(samples)-1)*math.tau)*(.016 if name=="run" else .004)
            pose_arms(READY_R+Vector((0,0,bob)), READY_L+Vector((0,0,bob)))
        elif name=="dodge":
            pose_arms((-.36,-.25,1.07),(.24,-.35,1.18),(0,-.7,.7))
        frames.append(capture())
    clips[name]=frames
for name,(duration,impact,right,blade) in actions.items():
    frames=[]
    for i in range(round(duration*30)+1):
        t=min(duration,i/30)
        restore(base)
        left=READY_L
        if name=="bash": left=curve([(0,READY_L),(.22,(.32,-.1,1.24)),(.35,(.21,-.52,1.30)),(.48,(.27,-.38,1.26)),(.65,READY_L)],t)
        elif name=="interpose": left=curve([(0,READY_L),(.2,(.2,-.49,1.35)),(.5,READY_L)],t)
        elif name in ("cut","sunder"): left=READY_L+Vector((.06,.03,.015))
        pose_arms(curve(right,t),left,curve(blade,t))
        frames.append(capture())
    clips[name]=frames
clips["guard"]=[]
for i in range(28):
    restore(base)
    t=i/30
    left=curve([(0,READY_L),(.1,(.16,-.48,1.38)),(.9,(.16,-.48,1.38))],t)
    pose_arms((-.35,-.25,1.20),left,(.1,-.4,.91))
    clips["guard"].append(capture())
clips["hit"]=[]
for i in range(9):
    restore(ready)
    b=rig.pose.bones["Spine02"]
    b.rotation_quaternion = Quaternion((1,0,0),-.09*math.sin(i/8*math.pi)) @ b.rotation_quaternion
    clips["hit"].append(capture())

scene.render.fps=30
for name, samples in clips.items():
    action=bpy.data.actions.new("Knight_"+name)
    rig.animation_data.action=action
    for frame,p in enumerate(samples,1):
        restore(p)
        for bone in rig.pose.bones:
            for path in ("location","rotation_quaternion","scale"):
                bone.keyframe_insert(data_path=path,frame=frame,group=bone.name)
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new();track.name=name
    track.strips.new(name,1,action);track.mute=True
restore(base)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"assets/source/knight.blend"))
output=ROOT/"assets/source/private/runtime-unoptimized/knight.glb"
bpy.ops.export_scene.gltf(filepath=str(output),export_format="GLB",export_yup=True,export_animations=True,
                         export_animation_mode="NLA_TRACKS",export_nla_strips=True,export_force_sampling=True,
                         export_tangents=True,export_cameras=False,export_lights=False)
report={"source":"preserved pre-repair knight.blend","fps":30,"bones":len(rig.data.bones),
        "clips":{name:{"seconds":(len(frames)-1)/30} for name,frames in clips.items()},
        "equipment":"Rigid hand binding fitted in ready pose; solid heater shield, rear grip, tree crest and longsword",
        "review":"Requires browser motion review; authoring is not acceptance"}
(ROOT/"artifacts/checkpoint/combat-repair/knight-authoring.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report))
