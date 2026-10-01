"""Assemble the Briar Gate in Blender from authored geometry and a saved house library.

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
from mathutils import Matrix, Vector

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
    'leaf-dark': ((.025,.055,.025), .98, 0), 'leaf': ((.045,.095,.035), .96, 0),
    'leaf-gold': ((.43,.36,.12), .88, 0), 'moss': ((.22,.30,.15), .96, 0),
    'glow': ((1,.49,.12), .6, 0), 'glass': ((.55,.31,.10), .34, .12),
    'flower': ((.48,.22,.16), .9, 0), 'waterbed': ((.08,.16,.18), .5, .1),
    'paving': ((.28,.32,.34), .38, 0), 'masonry': ((.42,.40,.33), .73, 0),
    'foliage': ((.22,.30,.13), .91, 0),
}
buffers: dict[str, tuple[list, list]] = {key:([],[]) for key in PALETTE}
GROUP = ''

def geom(mat: str, points: list, faces: list) -> None:
    # Spatial batches retain shared materials while allowing camera/shadow culling.
    cell = math.floor(sum(p[2] for p in points)/len(points)/20)
    key = f'{GROUP}.{mat}' if GROUP else f'sector.{cell}.{mat}'
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
    GROUP = f"occluder-tree.{x:.2f}.{z:.2f}"
    h=random.uniform(7,10)*size;lean=random.uniform(-.7,.7)
    beam('timber',(x,-.1,z),(x+lean,h,z+.3),.38*size,9,.12*size)
    for i in range(5):
        a=random.random()*math.tau;bh=h*(.45+i*.08);ex=x+math.cos(a)*2.5*size;ez=z+math.sin(a)*2.5*size
        beam('timber',(x+lean*.4,bh,z),(ex,bh+1.5*size,ez),.16*size,7,.03)
        # Dense, small leaves follow visible twigs instead of floating like confetti.
        for twig in range(5):
            angle=twig*2.39996+a;reach=random.uniform(.4,2.0)*size
            tx=ex+math.cos(angle)*reach;tz=ez+math.sin(angle)*reach
            th=bh+1.5*size+random.uniform(-.3,1.4)*size
            beam('timber',(ex,bh+1.4*size,ez),(tx,th,tz),.017*size,5,.003*size)
            foliage(tx,tz,th,angle,random.uniform(.85,1.3)*size)
    for i in range(4):
        a=i*math.pi/2;beam('timber',(x,.15,z),(x+math.cos(a)*1.2*size,0,z+math.sin(a)*1.2*size),.2*size,6,.04)
    GROUP = ''

def leaf(mat:str,x:float,z:float,h:float,angle:float,length:float)->None:
    direction=Vector((math.cos(angle),.32,math.sin(angle)))
    across=Vector((-math.sin(angle),0,math.cos(angle)))
    base=Vector((x,h,z));tip=base+direction*length*2
    mid=base+direction*length
    # Two triangles retain the leaf silhouette at the ordinary gameplay camera.
    points=[base,mid+across*length*.38,tip,mid-across*length*.38]
    geom(mat,[tuple(p) for p in points],[(0,1,2),(0,2,3)])

def fern(x:float,z:float,size:float=1)->None:
    for frond in range(5):
        angle=frond*math.tau/5+random.uniform(-.15,.15)
        reach=random.uniform(.45,.8)*size
        for step in range(5):
            f=(step+1)/6;px=x+math.cos(angle)*reach*f;pz=z+math.sin(angle)*reach*f
            hh=(math.sin(f*math.pi)*.36+.08)*size
            for side in (-1,1):leaf('leaf-dark' if frond%3==0 else 'leaf',px,pz,hh,angle+side*1.05,(1-f)*.14*size+.015)

def foliage(x:float,z:float,h:float,angle:float,size:float=1,vertical:bool=False)->None:
    """Two bent, alpha-tested planes carry the original generated branch cutout."""
    for cross in range(2):
        a=angle+cross*math.pi/2
        right=Vector((math.cos(a),0,math.sin(a)))
        up=Vector((0,1,0)) if vertical else Vector((-math.sin(a)*.83,.55,math.cos(a)*.83))
        centre=Vector((x,h,z));points=[]
        for xx,yy in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            p=centre+right*xx*size+up*yy*size
            points.append(tuple(p))
        geom('foliage',points,[(0,1,2,3)])

def arch_profile(x:float,z:float,spring:float,radius:float,width:float,depth:float,mat:str)->None:
    for i in range(28):
        a=i*math.pi/28+.006;b=(i+1)*math.pi/28-.006
        points=[]
        for zz in (z-depth/2,z+depth/2):
            for r,angle in [(radius,a),(radius+width,a),(radius+width,b),(radius,b)]:
                points.append((x+math.cos(angle)*r,spring+math.sin(angle)*r,zz))
        geom(mat,points,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)])

def banner(x:float,z:float,h:float,width:float,length:float)->None:
    for j in range(10):
        y0=h-length*j/10;y1=h-length*(j+1)/10
        for i in range(8):
            left=-width/2+width*i/8;right=left+width/8
            wave=lambda a,b:z+.10*math.sin(a*14+b*2)+.035*math.cos(b*6)
            geom('teal',[(x+left,y0,wave(left,y0)),(x+right,y0,wave(right,y0)),(x+right,y1,wave(right,y1)),(x+left,y1,wave(left,y1))],[(0,1,2,3)])
    for dx in (-width/2+.055,width/2-.055):
        beam('brass',(x+dx,h,z-.1),(x+dx,h-length,z-.1),.012,4)
    beam('brass',(x-width*.65,h+.08,z),(x+width*.65,h+.08,z),.035,8)
    ring('brass',x,z-.14,h-length*.43,width*.27,.032,True)
    beam('brass',(x,h-length*.17,z-.15),(x,h-length*.73,z-.15),.027,6)

# Terrain and the wet town plaza.
box('earth',0,10,-.42,90,130,.7)
box('waterbed',0,20,-.35,40,6,.5)
for z in range(-40,0,4):
    for x in range(-20,20,4):
        geom('paving',[(x,.026,z),(x+4,.026,z),(x+4,.026,z+4),(x,.026,z+4)],[(0,3,2,1)])
for x in (-8.9,8.9):
    for z in range(-38,0):box('stone-dark',x,z+.45,.04,.24,.86,.12)
for x in (-18.2,18.2):
    for z in range(-38,0,2):box('stone',x,z,.09,1.1,1.93,.18)
for z in range(0,60):
    if 17<=z<=23:continue
    mid=math.sin(z*.13)*1.3
    box('mud',mid,z,-.025,8.5,1.1,.07)
    if z < 15 or 26 < z < 39:
        geom('paving',[(mid-2.8,.035,z-.5),(mid+2.8,.035,z-.5),(mid+2.8,.035,z+.5),(mid-2.8,.035,z+.5)],[(0,3,2,1)])
    for side in (-1,1):
        if random.random()<.6:
            x=mid+side*random.uniform(2.5,3.4)
            box('stone-dark',x,z+random.uniform(-.4,.4),.035,random.uniform(.22,.48),random.uniform(.3,.65),.06,random.uniform(-.4,.4))
for z in (-34,-30,-26,-22,-18,-14,-10,-6,-2):
    for x in (-9.8,9.8):box('stone-dark',x,z,.10,.38,3.92,.25)

# The house library is a reviewed representative prop, reused within the town kit.
house_library = ROOT/'assets/source/merchant-house.blend'
if not house_library.is_file():
    raise FileNotFoundError('Finish the merchant-house source with prepare_house.py first')
with bpy.data.libraries.load(str(house_library), link=False) as (available, loaded):
    loaded.objects = [name for name in available.objects if name.startswith('house.merchant.')]
for x,z,scale in [(-13,-24,1.05),(13,-25,.96),(-13,-9,1.0),(13,-9,.97)]:
    for original in loaded.objects:
        obj=original.copy();obj.data=original.data
        obj.name=f'env.house.{x}.{z}.{original.name}'
        bpy.context.collection.objects.link(obj)
        obj.matrix_world=Matrix.Translation((x,-z,0)) @ Matrix.Rotation(math.pi/2 if x<0 else -math.pi/2,4,'Z') @ Matrix.Scale(scale,4)

# Towered north gate. The actual player safety line is at z=0, marked by lantern posts.
for x in (-5.6,5.6):
    GROUP=f'occluder-tower.{x}.5'
    box('masonry',x,5,4,2.7,3.7,8)
    # Pilasters, weathered plinths and projecting cornices break the box silhouette.
    for dx in (-1.12,1.12):
        box('stone-light',x+dx,3.08,3.9,.31,.33,7.6)
        for h in (.45,1.0,5.7,7.5):box('stone-light',x+dx,3.04,h,.45,.48,.18)
    for h,w,d in [(.18,2.88,3.88),(.54,2.79,3.80),(6.85,2.88,3.88),(7.12,3.0,4.0)]:
        box('stone',x,5,h,w,d,.22)
    box('stone-light',x,5,8.1,3.1,4.1,.3)
    for dx in (-1.1,0,1.1):box('stone',x+dx,3.4,8.6,.56,.8,.8)
    banner(x,2.82,6.5,1.2,3.2)
    lantern(x,2.7,3,False)
    for h in (.7,1.7,3.0,6.3,7.1):
        foliage(x+random.choice([-1,1])*.93,2.91,h,math.pi/2,.42,True)
GROUP = 'occluder-gate'
for i in range(20):
    a=i*math.pi/20;b=(i+1)*math.pi/20
    points=[]
    for z in (3.2,6.8):
        for radius,angle in [(4.1,a),(5.15,a),(5.15,b),(4.1,b)]:points.append((math.cos(angle)*radius,3.5+math.sin(angle)*radius,z))
    geom('stone-light' if i%5==0 else 'stone',points,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)])
for z in (3.07,6.93):
    arch_profile(0,z,3.5,4.10,.16,.16,'stone-light')
    arch_profile(0,z,3.5,4.80,.17,.19,'stone-light')
box('stone-light',0,3.06,8.45,.54,.43,.94)
ring('brass',0,2.81,8.4,.18,.035,True)
GROUP = ''
for x0,width in [(-12.5,9),(10,6)]:
    box('masonry',x0,5,1.8,width,1.4,3.6)
    box('stone-light',x0,5,3.65,width+.15,1.6,.18)
    for j in range(int(width/1.5)):
        xx=x0-width/2+j*1.5+.7
        box('stone',xx,4.2,2,.35,.35,4)
        foliage(xx,4.1,1.5,math.pi/2,.7,True)
for x in (-7,7,18):lantern(x,-.6)

# Brass astrolabe anchors the central plaza; server radius is 2.1m at (0, -10).
beam('stone-dark',(0,0,-10),(0,.32,-10),2.1,48)
beam('masonry',(0,.32,-10),(0,.80,-10),1.82,48)
beam('stone-light',(0,.80,-10),(0,.94,-10),1.9,48)
beam('iron',(0,.94,-10),(0,1.23,-10),1.43,40)
for h,r in [(1.0,1.47),(1.22,1.47)]:ring('brass',0,-10,h,r,.06)
beam('brass',(0,1.15,-10),(0,2.55,-10),.18,16,.12)
# Armillary bands occupy three tilted planes with small engraved tick marks.
for band in range(3):
    rotation=Matrix.Rotation([0,.65,-.8][band],3,'Y') @ Matrix.Rotation([.22,1.1,-.55][band],3,'X')
    points=[]
    for i in range(96):
        a=i*math.tau/96
        for r in (1.33,1.41):
            q=rotation @ Vector((math.cos(a)*r,math.sin(a)*r,0))
            points.append((q.x,2.65+q.y,-10+q.z))
    geom('brass',points,[(2*i,2*i+1,(2*(i+1)+1)%192,(2*(i+1))%192) for i in range(96)])
    for i in range(12):
        a=i*math.tau/12
        q=rotation @ Vector((math.cos(a)*1.36,math.sin(a)*1.36,0))
        rock('brass',q.x,-10+q.z,2.65+q.y,.065,.065,.065)
rock('copper',0,-10,2.65,.38,.38,.38)
for i in range(12):
    a=i*math.tau/12
    x,z=math.cos(a)*1.55,-10+math.sin(a)*1.55
    beam('brass',(x,.85,z),(x,1.27,z),.045,8)
    if i%3==0:lantern(x,z,.75,False)
    ring('brass',x,z,1.08,.11,.025,True)
for i in range(12):
    a=i*math.tau/12;box('brass',math.cos(a)*3.6,-10+math.sin(a)*3.6,.046,.035,.58,.025,-a)

# A worn three-realm compass gives the open plaza a readable centre.
for r in (3.8,4.05):ring('brass',0,-10,.06,r,.025)
for i in range(12):
    a=i*math.tau/12
    beam('brass',(math.cos(a)*3.3,.063,-10+math.sin(a)*3.3),(math.cos(a)*3.65,.063,-10+math.sin(a)*3.65),.018,4)
for i in range(3):
    a=i*math.tau/3+math.pi/2
    ring('brass',math.cos(a)*2.5,-10+math.sin(a)*2.5,.064,.43,.026)
for i in range(64):
    a=i*math.tau/64
    for r in (4.3,4.65):
        box('stone-light' if i%4==0 else 'slate',math.cos(a)*r,-10+math.sin(a)*r,.045,.34,.25,.036,a)

# Merchant canopy and practical market dressing.
for x in (6,9):
    for z in (-17,-13):beam('timber',(x,0,z),(x,3,z),.07)
GROUP = 'occluder-awning'
for i in range(6):
    x=5.8+i*.58;geom('teal' if i%2==0 else 'cream',[(x,2.8,-17.2),(x+.58,2.8,-17.2),(x+.58,2.45,-12.6),(x,2.45,-12.6)],[(0,1,2,3)])
GROUP = ''
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
beam('copper',(-13,1.3,28),(-13,1.3,35),1.1,28)
for z in (28,29.5,33.5,35):
    beam('iron',(-13,1.3,z-.12),(-13,1.3,z+.12),1.19,28)
    for i in range(12):
        a=i*math.tau/12
        beam('brass',(-13+math.cos(a)*1.14,1.3+math.sin(a)*1.14,z-.15),(-13+math.cos(a)*1.14,1.3+math.sin(a)*1.14,z+.15),.055,6)
for i in range(9):
    z=27+i*.9
    for h in range(random.randint(1,3)):box('masonry',-10,z,.44+h*.8,.8,.84,.76)
for z in (28,31,34):foliage(-11.5,z,1.0,1.7,.9,True)
# A broken arch frames the memorial, matching the quest's navigational landmark.
for x in (-6.2,-1.8):
    box('masonry',x,34.8,1.5,.65,.68,3)
    box('stone-light',x,34.8,3.03,.87,.85,.22)
arch_profile(-4,34.8,3,1.87,.4,.62,'stone')
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
# Lower, denser growth gives the path an authored edge without covering combat feet.
for z in range(7,59,3):
    if 15<z<26:continue
    for side in (-1,1):
        x=side*random.uniform(6.4,8.2)
        if math.hypot(x-14,z-45)>6:
            foliage(x,z,.6,random.random()*math.tau,.78)
for _ in range(350):
    x=random.uniform(-19,19);z=random.uniform(1,59)
    if abs(x)<5 or 16<z<24 or math.hypot(x-14,z-45)<5:continue
    fern(x,z,random.uniform(.65,1.3))
for _ in range(130):
    x=random.uniform(-19,19);z=random.uniform(0,60)
    if abs(x)<5 or 16<z<24 or math.hypot(x-14,z-45)<5:continue
    rock('stone-dark',x,z,.25,random.uniform(.3,.9),random.uniform(.2,.6),random.uniform(.3,.7))

materials={}

def surface_maps(name, color, roughness):
    """Original seamless material maps; retain them packed in the Blender source."""
    rng=np.random.default_rng(sum(map(ord,name))+1847);size=1024 if name in ('paving','masonry') else 512
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
    source_name={'paving':'courtyard-paving','masonry':'aged-limestone'}.get(name)
    if source_name:family=source_name
    if family:
        reference=bpy.data.images.load(str(ROOT/'design/calibration'/f'{source_name or "material-"+family}.png'),check_existing=False)
        reference.scale(size,size)
        pixels=np.empty(size*size*4,dtype=np.float32);reference.pixels.foreach_get(pixels)
        rgb=pixels.reshape(size,size,4)[:,:,:3].copy()
        rgb=np.clip(rgb*({'stone':.82,'stone-light':1.05,'stone-dark':.66,'timber':.57,'wood':.85,'earth':.76,'mud':.88}.get(name,1)),0,1)
        if name=='paving':
            luminance=rgb.mean(axis=2)
            softened=.29+(luminance-luminance.mean())*.30
            rgb*=softened[:,:,None]/np.maximum(luminance[:,:,None],.02)
        height=rgb.mean(axis=2)*.85+height*.025
        bpy.data.images.remove(reference)
    if name.startswith('stone') or name in ('earth','mud'):
        damp=np.clip((.4-height)*3,0,.7)
        rgb*=1-damp[:,:,None]*.3
    def image(key,values,linear=False):
        rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=values
        result=bpy.data.images.new(name+'.'+key,width=size,height=size)
        if linear:result.colorspace_settings.name='Non-Color'
        result.pixels.foreach_set(rgba.ravel());result.pack();return result
    relief=5.5 if name in ('paving','masonry') else 1.4
    dx=(np.roll(height,1,1)-np.roll(height,-1,1))*relief
    dy=(np.roll(height,1,0)-np.roll(height,-1,0))*relief
    normal=np.stack((dx,dy,np.ones_like(height)),axis=2)
    normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    r=np.clip(roughness-(1-height)*.18,.22,.96)
    if name=='paving':r=np.clip(.24+height*.27,.22,.54)
    return image('albedo',rgb),image('normal',normal*.5+.5,True),image('roughness',np.repeat(r[:,:,None],3,axis=2),True)

for name,(color,roughness,metallic) in PALETTE.items():
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=roughness;node.inputs['Metallic'].default_value=metallic
    if name=='glow':node.inputs['Emission Color'].default_value=(1,.35,.065,1);node.inputs['Emission Strength'].default_value=3
    if name=='foliage':
        image=bpy.data.images.load(str(ROOT/'design/calibration/briar-leaf-cluster.png'))
        image.scale(1024,1024);image.pack()
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        mat.node_tree.links.new(tex.outputs['Color'],node.inputs['Base Color'])
        mat.node_tree.links.new(tex.outputs['Alpha'],node.inputs['Alpha'])
        mat.use_backface_culling=False
    if name not in ('glow','glass','flower','brass','iron','leaf','leaf-dark','leaf-gold','foliage'):
        albedo,normal,rough=surface_maps(name,color,roughness)
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        for img,socket in [(albedo,'Base Color'),(rough,'Roughness')]:
            tex=nodes.new('ShaderNodeTexImage');tex.image=img;links.new(tex.outputs['Color'],node.inputs[socket])
        tex=nodes.new('ShaderNodeTexImage');tex.image=normal
        norm=nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.9 if name in ('paving','masonry') else .35
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
            scale=.22 if palette_name=='paving' else .28 if palette_name=='masonry' else .5 if palette_name.startswith('stone') else .8
            uv.data[loop].uv=(co[axes[0]]*scale,co[axes[1]]*scale)
        if palette_name=='foliage':
            for loop,coord in zip(polygon.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[loop].uv=coord
    obj=bpy.data.objects.new('env.'+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(materials[palette_name])
    if palette_name.startswith('stone') or palette_name in ('masonry','wood','brass','iron'):
        mod=obj.modifiers.new('Worn edges','BEVEL');mod.width=.025;mod.segments=1
        mod.limit_method='ANGLE'
    obj.modifiers.new('Export triangles and tangent basis','TRIANGULATE')

bpy.context.scene.world.color=(.18,.22,.28)
out=ROOT/'assets/source/private/runtime-unoptimized/briar-gate.glb';out.parent.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/source/briar-gate.blend';source.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_tangents=True)
stats={'source':'tools/build_environment.py','seed':1847,'blender':bpy.app.version_string,'objects':len(bpy.data.objects),'vertices_before_modifiers':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH'),'bytes':out.stat().st_size,'note':'Blender assembly: generated merchant house plus original terrain, props and foliage. Runtime lighting, water and VFX are added by Babylon.'}
(ROOT/'artifacts/checkpoint/environment.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats))

# Orthographic map of the actual assembled environment; runtime overlays live actors.
# It is a map asset, never substituted for the playable 3D viewport.
scene=bpy.context.scene
camera_data=bpy.data.cameras.new('Survey camera');camera=bpy.data.objects.new('Survey camera',camera_data)
scene.collection.objects.link(camera);camera.location=(0,-10,110);camera.rotation_euler=(0,0,math.pi)
camera_data.type='ORTHO';camera_data.ortho_scale=104;scene.camera=camera
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=832;scene.render.resolution_y=2080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
sun_data=bpy.data.lights.new('Map daylight','SUN');sun=bpy.data.objects.new('Map daylight',sun_data)
scene.collection.objects.link(sun);sun.rotation_euler=(.25,-.4,.3);sun_data.energy=2.3
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.30,.38,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
water_material=bpy.data.materials.new('Survey river');water_material.use_nodes=True
water_material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.045,.17,.22,1)
bpy.ops.mesh.primitive_plane_add(size=2, location=(0,-20,-.029))
river=bpy.context.object;river.scale=(20,3.0,1);river.data.materials.append(water_material)
scene.render.filepath=str(ROOT/'assets/source/private/briar-map.png')
bpy.ops.render.render(write_still=True)
