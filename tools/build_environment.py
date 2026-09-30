"""Author the Briar Gate modular environment in Blender; deterministic, no external assets.

Run with Blender --background --python tools/build_environment.py. Blender coordinates
are (world x, -world z, height); the glTF exporter makes runtime Y-up and +Z north.
"""
from __future__ import annotations
import json
import math
import random
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
random.seed(1847)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
PALETTE = {
    'earth': ((.105,.135,.125), .98, 0), 'mud': ((.16,.18,.17), .8, 0),
    'stone': ((.31,.36,.37), .7, 0), 'stone-light': ((.41,.43,.40), .75, 0),
    'stone-dark': ((.19,.25,.27), .63, 0), 'slate': ((.105,.17,.21), .4, .1),
    'timber': ((.115,.085,.061), .86, 0), 'plaster': ((.50,.43,.31), .88, 0),
    'wood': ((.25,.17,.10), .75, 0), 'brass': ((.47,.30,.105), .35, .8),
    'iron': ((.12,.17,.19), .38, .7), 'copper': ((.25,.30,.24), .47, .68),
    'teal': ((.055,.20,.23), .83, 0), 'cream': ((.64,.56,.39), .9, 0),
    'leaf-dark': ((.10,.20,.15), .94, 0), 'leaf': ((.22,.31,.17), .89, 0),
    'leaf-gold': ((.43,.36,.12), .88, 0), 'moss': ((.22,.30,.15), .96, 0),
    'glow': ((1,.49,.12), .6, 0), 'glass': ((.55,.31,.10), .34, .12),
    'flower': ((.48,.22,.16), .9, 0), 'waterbed': ((.08,.16,.18), .5, .1),
}
buffers: dict[str, tuple[list, list]] = {key:([],[]) for key in PALETTE}
GROUP = ''

def geom(mat: str, points: list, faces: list) -> None:
    key = f'{GROUP}.{mat}' if GROUP else mat
    verts, polys=buffers.setdefault(key, ([], []))
    offset=len(verts)
    verts.extend((x,-z,h) for x,h,z in points)
    polys.extend(tuple(offset+i for i in face) for face in faces)

def box(mat: str, x:float,z:float,h:float,w:float,d:float,height:float,angle:float=0) -> None:
    points=[]
    for yy in (-.5,.5):
        for zz in (-.5,.5):
            for xx in (-.5,.5):
                px,pz=xx*w,zz*d
                points.append((x+px*math.cos(angle)-pz*math.sin(angle),h+yy*height,z+px*math.sin(angle)+pz*math.cos(angle)))
    geom(mat,points,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)])

def beam(mat:str,a:tuple,b:tuple,r:float,sides:int=8,r2:float|None=None)->None:
    a,b=Vector(a),Vector(b);axis=(b-a).normalized()
    right=axis.cross(Vector((0,1,0)))
    if right.length<.01:right=axis.cross(Vector((1,0,0)))
    right.normalize();up=axis.cross(right).normalized();points=[]
    for centre,radius in [(a,r),(b,r if r2 is None else r2)]:
        for i in range(sides):
            p=centre+radius*(math.cos(i*math.tau/sides)*right+math.sin(i*math.tau/sides)*up)
            points.append(tuple(p))
    geom(mat,points,[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)])

def rock(mat:str,x:float,z:float,h:float,sx:float,sy:float,sz:float)->None:
    n=7;points=[(x,h+sy,z)]
    for layer in range(2):
        for i in range(n):
            angle=(i+layer*.45)*math.tau/n;r=random.uniform(.77,1.12)
            points.append((x+math.cos(angle)*sx*r,h+sy*(.25 if layer==0 else -.5),z+math.sin(angle)*sz*r))
    points.append((x,h-sy*.8,z));faces=[]
    for i in range(n):
        faces.extend([(0,1+i,1+(i+1)%n),(1+i,8+i,8+(i+1)%n,1+(i+1)%n),(15,8+(i+1)%n,8+i)])
    geom(mat,points,faces)

def ring(mat:str,x:float,z:float,h:float,radius:float,width:float,vertical:bool=False)->None:
    points=[];n=64
    for i in range(n):
        angle=i*math.tau/n
        for r in (radius-width/2,radius+width/2):
            points.append((x+r*math.cos(angle),h+(r*math.sin(angle) if vertical else 0),z+(0 if vertical else r*math.sin(angle))))
    geom(mat,points,[(2*i,2*i+1,(2*(i+1)+1)%(2*n),(2*(i+1))%(2*n)) for i in range(n)])

def lantern(x:float,z:float,base:float=0,tall:bool=True)->None:
    h=base+(2.7 if tall else .7)
    if tall:
        box('stone-dark',x,z,.3,.65,.65,.6)
        beam('iron',(x,.55,z),(x,h,z),.07)
        beam('brass',(x-.32,h-.1,z),(x+.32,h-.1,z),.045)
    box('glow',x,z,h,.25,.25,.38)
    for dx in (-.18,.18):
        for dz in (-.18,.18):beam('iron',(x+dx,h-.24,z+dz),(x+dx,h+.24,z+dz),.025,4)
    box('iron',x,z,h-.25,.44,.44,.07)
    beam('iron',(x,h+.23,z),(x,h+.46,z),.3,4,0)

def barrel(x:float,z:float,size:float=1)->None:
    beam('wood',(x,0,z),(x,.85*size,z),.35*size,12,.3*size)
    for h in (.12,.64):beam('iron',(x,h*size,z),(x,(h+.055)*size,z),.356*size,12)
    box('wood',x,z,.88*size,.5*size,.52*size,.055)

def crate(x:float,z:float,size:float=.8,h:float=0)->None:
    box('wood',x,z,h+size/2,size,size,size)
    for offset in (-.43,.43):
        box('timber',x+offset*size,z,h+size/2,.08,size*1.02,size*1.02)
        box('timber',x,z+offset*size,h+size/2,size*1.02,.08,size*1.02)
    for offset in (-.32,0,.32):box('brass',x+offset*size,z-size*.51,h+size*.85,.035,.02,.035)

def building(x:float,z:float,w:float,d:float,height:float)->None:
    box('stone-dark',x,z,.45,w+.3,d+.3,.9)
    box('plaster',x,z,height/2+.5,w,d,height)
    for dx in (-w/2,w/2):
        for dz in (-d/2,d/2):box('timber',x+dx,z+dz,height/2+.5,.24,.24,height+.4)
    for hh in (1,height*.55,height):
        box('timber',x,z-d/2-.03,hh,w,.15,.18);box('timber',x,z+d/2+.03,hh,w,.15,.18)
    for dx in range(-int(w/2)+1,int(w/2)):
        if dx%2:continue
        box('timber',x+dx,z-d/2-.08,height/2+.5,.13,.17,height)
    # A steep blue-slate roof, subdivided into visible tile strips.
    for side in (-1,1):
        for i in range(9):
            f0=i/9;f1=(i+1)/9
            px0=x+side*(w/2+.65)*f0;px1=x+side*(w/2+.65)*f1
            y0=height+3.3-2.6*f0;y1=height+3.3-2.6*f1
            for j in range(math.ceil(d/.72)+1):
                zz=z-d/2-.6+j*.72;geom('slate',[(px0,y0,zz),(px1,y1,zz),(px1,y1,zz+.7),(px0,y0,zz+.7)],[(0,1,2,3)])
            beam('timber',(px0,y0,z-d/2-.66),(px1,y1,z-d/2-.66),.085,4)
    beam('timber',(x,height+3.35,z-d/2-.7),(x,height+3.35,z+d/2+.7),.13,6)
    # The inward facade has warm windows and projecting beams.
    face=x+(w/2+.06)*(-1 if x>0 else 1)
    for zz in (-d*.3,0,d*.3):
        for hh in (2.1,4.4):
            box('timber',face,z+zz,hh,.18,1.3,1.5)
            box('glass',face+(.1 if x<0 else -.1),z+zz,hh,.04,1.08,1.26)
            box('glow',face+(.12 if x<0 else -.12),z+zz,hh,.025,.83,1.1)
            box('timber',face+(.14 if x<0 else -.14),z+zz,hh,.05,.07,1.3)
            box('timber',face+(.15 if x<0 else -.15),z+zz,hh,.05,1.12,.075)
    box('stone',x+w*.2,z+d*.2,height+2,1,1,3)
    box('stone-dark',x+w*.2,z+d*.2,height+3.6,1.2,1.2,.2)

def tree(x:float,z:float,size:float=1)->None:
    global GROUP
    canopy_group = f"occluder-canopy.{-14 if x < 0 else 14}.{int(z//8)*8+4}"
    h=random.uniform(7,10)*size;lean=random.uniform(-.7,.7)
    beam('timber',(x,-.1,z),(x+lean,h,z+.3),.38*size,9,.12*size)
    for i in range(5):
        a=random.random()*math.tau;bh=h*(.45+i*.08);ex=x+math.cos(a)*2.5*size;ez=z+math.sin(a)*2.5*size
        beam('timber',(x+lean*.4,bh,z),(ex,bh+1.5*size,ez),.16*size,7,.03)
        GROUP = canopy_group
        for _ in range(100):
            lx=ex+random.uniform(-1.9,1.9)*size;lz=ez+random.uniform(-1.9,1.9)*size;lh=bh+random.uniform(.3,2.8)*size
            angle=random.random()*math.tau;length=random.uniform(.13,.32)*size;width=length*.45
            vx,vz=math.cos(angle)*length,math.sin(angle)*length
            wx,wz=-math.sin(angle)*width,math.cos(angle)*width
            geom(random.choice(['leaf','leaf-dark','leaf-gold']),[(lx-vx,lh,lz-vz),(lx+wx,lh+.035,lz+wz),(lx+vx,lh+.08,lz+vz),(lx-wx,lh+.035,lz-wz)],[(0,1,2),(0,2,3)])
        GROUP = ''
    for i in range(4):
        a=i*math.pi/2;beam('timber',(x,.15,z),(x+math.cos(a)*1.2*size,0,z+math.sin(a)*1.2*size),.2*size,6,.04)

# Terrain and the wet town plaza.
box('earth',0,10,-.42,40,100,.7)
box('waterbed',0,20,-.35,40,6,.5)
for z in range(-38,0):
    for col in range(-18,19):
        x=col*.52+(.26 if z%2 else 0)
        box(random.choice(['stone','stone-dark','stone-light']),x,z+.5,-.025+random.uniform(-.016,.016),.48,.94,.10,random.uniform(-.028,.028))
for z in range(0,60):
    if 17<=z<=23:continue
    mid=math.sin(z*.13)*1.3
    box('mud',mid,z,-.025,8.5,1.1,.07)
    for _ in range(7):
        x=mid+random.uniform(-3.5,3.5)
        box(random.choice(['stone','stone-dark']),x,z+random.uniform(-.5,.5),.02,random.uniform(.3,.65),random.uniform(.45,.8),.06,random.random()*math.pi)
for z in (-34,-30,-26,-22,-18,-14,-10,-6,-2):
    for x in (-9.8,9.8):box('stone-dark',x,z,.10,.38,3.92,.25)

building(-15,-23,9,16,5.2);building(15,-24,9,14,5.6)
building(-14,-8,9,8,4.7);building(15,-9,7,8,4.9)

# Towered north gate. The actual player safety line is at z=0, marked by lantern posts.
for x in (-5.6,5.6):
    box('stone-dark',x,5,4,2.7,3.7,8)
    for h in range(8):
        for i in range(3):box('stone' if (i+h)%3 else 'stone-light',x+(i-1)*.91,3.08,h+.49,.88,.23,.93)
    box('stone-light',x,5,8.1,3.1,4.1,.3)
    for dx in (-1.1,0,1.1):box('stone',x+dx,3.4,8.6,.56,.8,.8)
    box('teal',x,3.15,5.4,1.15,.035,3)
    box('brass',x,3.11,4.1,1.2,.025,.045)
    ring('brass',x,3.1,5.7,.37,.04,True)
    lantern(x,2.7,3,False)
GROUP = 'occluder-gate'
for i in range(20):
    a=i*math.pi/20;b=(i+1)*math.pi/20
    points=[]
    for z in (3.2,6.8):
        for radius,angle in [(4.1,a),(5.15,a),(5.15,b),(4.1,b)]:points.append((math.cos(angle)*radius,3.5+math.sin(angle)*radius,z))
    geom('stone-light' if i%5==0 else 'stone',points,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)])
GROUP = ''
for x0,width in [(-12.5,9),(10,6)]:
    for h in range(4):
        for j in range(int(width)):box('stone-dark' if h%3==0 else 'stone',x0-width/2+j+.5+(h%2)*.2,5,h+.45,.96,1.4,.87)
for x in (-7,7,18):lantern(x,-.6)

# Brass astrolabe with rings, pedestal and compass inlay.
beam('stone-dark',(-5,0,-28),(-5,.65,-28),2.1,24)
beam('stone',(-5,.65,-28),(-5,.87,-28),1.7,24)
beam('brass',(-5,.87,-28),(-5,2.5,-28),.28,16,.18)
for h in (1.1,1.7,2.3):ring('brass',-5,-28,h,1.15,.065)
ring('brass',-5,-28,2.05,1.35,.10,True)
rock('brass',-5,-28,2.1,.47,.47,.47)
for r in (2.7,3.1,4):ring('brass',-5,-28,.044,r,.035)
for i in range(12):
    a=i*math.tau/12;box('brass',-5+math.cos(a)*3.6,-28+math.sin(a)*3.6,.046,.035,.58,.025,-a)

# Merchant canopy and practical market dressing.
for x in (6,9):
    for z in (-17,-13):beam('timber',(x,0,z),(x,3,z),.07)
for i in range(6):
    x=5.8+i*.58;geom('teal' if i%2==0 else 'cream',[(x,2.8,-17.2),(x+.58,2.8,-17.2),(x+.58,2.45,-12.6),(x,2.45,-12.6)],[(0,1,2,3)])
box('wood',7.5,-15,1.0,2.8,.8,.12)
for x in (6.4,8.5):box('timber',x,-15,.5,.12,.5,1)
for i in range(12):rock('flower' if i%2 else 'leaf-gold',6.4+(i%6)*.36,-15+(i//6)*.2,1.2,.12,.12,.13)
for x,z in [(-8,-9),(-8,-10),(9,-19),(8,-20),(-9,-32),(8,7),(-7,29)]:barrel(x,z,random.uniform(.8,1.1))
for x,z in [(-8,-12),(-8,-13),(9,-18),(8,-18),(9,-32),(-8,7)]:crate(x,z)
for x,z in [(-9,-29),(9,-29),(-9,-16),(9,-6),(-6,11),(6,14),(-5,27),(6,31),(11,44)]:lantern(x,z)

# Two bridges give a retreat route. Railings never seal the traversable decks.
for x,w in [(0,8),(15,5)]:
    for i in range(15):box('wood',x,16.5+i*.5,.10,w,.46,.20)
    for sx in (-1,1):
        for z in (16.4,18.5,21,23.7):box('stone',x+sx*w/2,z,.62,.52,.52,1.2)
        beam('timber',(x+sx*w/2,1.16,16),(x+sx*w/2,1.16,24),.10,6)
    lantern(x-w/2,16.4,1,False);lantern(x+w/2,23.7,1,False)
for x in range(-19,20,2):
    if abs(x)<5 or 11<x<19:continue
    for z in (16,24):rock('stone-dark',x,z,.15,1.3,.8,1)

# Collapsed industrial pipe and ruined wall, tying Fantasy to Science.
beam('copper',(-13,1.3,28),(-13,1.3,35),1.1,20)
for z in (28,29.5,33.5,35):beam('iron',(-13,1.3,z-.12),(-13,1.3,z+.12),1.19,20)
for i in range(9):
    z=27+i*.9
    for h in range(random.randint(1,3)):box('stone',-10,z,.44+h*.8,.8,.84,.76)
beam('stone-dark',(-4,0,34),(-4,2.2,34),.65,6,.48)
box('stone-light',-4,33.65,1.5,1.18,.24,1.2)
for h in range(4):box('brass',-4,33.51,1.15+h*.19,.65,.025,.025)

# The unpatrolled refuge has two open sides and a thin gold stone ring.
beam('stone', (14,-.02,45),(14,.07,45),4,48)
ring('brass',14,45,.09,3.85,.05)
for a in (0,math.pi):
    x,z=14+math.cos(a)*3.7,45+math.sin(a)*3.7;box('stone-light',x,z,1.7,.45,.45,3.4);lantern(x,z,3,False)
rock('stone-light',14,47.5,.7,1,.7,.55)

# Foliage stays out of the main route; authored seed makes captures comparable.
for _ in range(78):
    x=random.choice([-1,1])*random.uniform(8,19);z=random.uniform(7,59)
    if 15<z<25 or math.hypot(x-14,z-45)<6 or (x<-9 and 26<z<37):continue
    tree(x,z,random.uniform(.65,1.1))
for _ in range(350):
    x=random.uniform(-19,19);z=random.uniform(1,59)
    if abs(x)<5 or 16<z<24 or math.hypot(x-14,z-45)<5:continue
    rock(random.choice(['leaf','leaf-dark','moss']),x,z,.22,random.uniform(.2,.7),random.uniform(.2,.5),random.uniform(.2,.6))
for _ in range(130):
    x=random.uniform(-19,19);z=random.uniform(0,60)
    if abs(x)<5 or 16<z<24 or math.hypot(x-14,z-45)<5:continue
    rock('stone-dark',x,z,.25,random.uniform(.3,.9),random.uniform(.2,.6),random.uniform(.3,.7))

materials={}

def surface_maps(name, color, roughness):
    """Original seamless material maps; retain them packed in the Blender source."""
    rng=np.random.default_rng(sum(map(ord,name))+1847);size=512
    yy,xx=np.mgrid[0:size,0:size]/size
    height=np.zeros((size,size),dtype=np.float32)
    for frequency,amplitude in [(2,.23),(5,.14),(13,.08),(41,.045),(117,.018)]:
        for _ in range(4):
            ax=int(rng.integers(-frequency,frequency+1));ay=int(rng.integers(-frequency,frequency+1))
            height+=amplitude*np.sin(math.tau*(xx*ax+yy*ay)+rng.random()*math.tau)
    grain=rng.random((size,size))
    if name in ('wood','timber'):
        height=.22*np.sin(math.tau*(xx*37+.5*np.sin(yy*math.tau*3)))+.3*height
        height-=np.maximum(0,np.sin(xx*math.tau*9+np.sin(yy*math.tau)*.25)-.92)*3
    height=(height-height.min())/(height.max()-height.min())
    modulation=.72+.35*height+.06*grain
    base=np.asarray(color)**(1/2.2)
    rgb=np.clip(modulation[:,:,None]*base,0,1)
    family='stone' if name.startswith('stone') else 'wood' if name in ('wood','timber') else 'soil' if name in ('earth','mud') else None
    if family:
        reference=bpy.data.images.load(str(ROOT/'design/calibration'/f'material-{family}.png'),check_existing=False)
        reference.scale(size,size)
        pixels=np.empty(size*size*4,dtype=np.float32);reference.pixels.foreach_get(pixels)
        rgb=pixels.reshape(size,size,4)[:,:,:3].copy()
        rgb=np.clip(rgb*({'stone':.82,'stone-light':1.05,'stone-dark':.66,'timber':.57,'wood':.85,'earth':.76,'mud':.88}.get(name,1)),0,1)
        height=rgb.mean(axis=2)*.6+height*.12
        bpy.data.images.remove(reference)
    if name.startswith('stone') or name in ('earth','mud'):
        damp=np.clip((.4-height)*3,0,.7)
        rgb*=1-damp[:,:,None]*.3
    def image(key,values,linear=False):
        rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=values
        result=bpy.data.images.new(name+'.'+key,width=size,height=size)
        if linear:result.colorspace_settings.name='Non-Color'
        result.pixels.foreach_set(rgba.ravel());result.pack();return result
    dx=(np.roll(height,1,1)-np.roll(height,-1,1))*1.7
    dy=(np.roll(height,1,0)-np.roll(height,-1,0))*1.7
    normal=np.stack((dx,dy,np.ones_like(height)),axis=2)
    normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    r=np.clip(roughness-(1-height)*.34,.19,.96)
    return image('albedo',rgb),image('normal',normal*.5+.5,True),image('roughness',np.repeat(r[:,:,None],3,axis=2),True)

for name,(color,roughness,metallic) in PALETTE.items():
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=roughness;node.inputs['Metallic'].default_value=metallic
    if name=='glow':node.inputs['Emission Color'].default_value=(1,.35,.065,1);node.inputs['Emission Strength'].default_value=3
    if name not in ('glow','glass','flower','brass','iron','leaf','leaf-dark','leaf-gold'):
        albedo,normal,rough=surface_maps(name,color,roughness)
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        for img,socket in [(albedo,'Base Color'),(rough,'Roughness')]:
            tex=nodes.new('ShaderNodeTexImage');tex.image=img;links.new(tex.outputs['Color'],node.inputs[socket])
        tex=nodes.new('ShaderNodeTexImage');tex.image=normal
        norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.55
        links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],node.inputs['Normal'])
    materials[name]=mat
for name,(vertices,faces) in buffers.items():
    palette_name = name.rsplit('.', 1)[-1]
    if not vertices:continue
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='Surface scale')
    for polygon in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(polygon.normal[i]))
        axes=[i for i in range(3) if i!=axis]
        for loop in polygon.loop_indices:
            co=mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv=(co[axes[0]]*.8,co[axes[1]]*.8)
    obj=bpy.data.objects.new('env.'+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(materials[palette_name])
    if palette_name.startswith('stone') or palette_name in ('wood','brass','iron'):
        mod=obj.modifiers.new('Worn edges','BEVEL');mod.width=.025;mod.segments=1
        mod.limit_method='ANGLE'

bpy.context.scene.world.color=(.18,.22,.28)
out=ROOT/'assets/source/private/runtime-unoptimized/briar-gate.glb';out.parent.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/source/briar-gate.blend';source.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_tangents=True)
stats={'source':'tools/build_environment.py','seed':1847,'blender':bpy.app.version_string,'objects':len(bpy.data.objects),'vertices_before_modifiers':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),'bytes':out.stat().st_size,'note':'Original authored environment. Runtime lighting, water, weather and VFX are added by Babylon.'}
(ROOT/'artifacts/checkpoint/environment.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats))
