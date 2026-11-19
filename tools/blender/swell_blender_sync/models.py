"""Lightweight reusable stage models. Geometry is normalized to a measured proxy."""
import hashlib
import math
import bpy
from mathutils import Vector


def material(name, color):
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    result.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*color, 1)
    result.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.6
    return result


def build(root, item, dimensions):
    name = (item['name']+' '+item.get('modelHint','')).lower()
    if root.get('swell_visual_version'):
        return
    scale = dimensions
    collection = root.users_collection[0]
    dark = material('Swell charcoal', (0.035, 0.045, 0.055))
    metal = material('Swell brushed metal', (0.48, 0.53, 0.55))
    cream = material('Swell cream', (0.88, 0.87, 0.79))
    gold = material('Swell cymbal brass', (0.65, 0.42, 0.13))
    wood = material('Swell drum shell', (0.28, 0.085, 0.035))

    def mesh_object(label, vertices, faces, mat):
        mesh = bpy.data.meshes.new(label); mesh.from_pydata(vertices, [], faces); mesh.update()
        obj = bpy.data.objects.new(label, mesh); collection.objects.link(obj); obj.parent = root
        obj.data.materials.append(mat); obj.hide_select = True
        obj['swell_visual'] = True
        return obj

    def point(p):
        return Vector(tuple(p[i] * scale[i] for i in range(3)))

    def box(label, center, size, mat):
        c = point(center); d = point(size)
        vertices = [c + Vector((x*d.x/2, y*d.y/2, z*d.z/2)) for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
        return mesh_object(label, vertices, [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)], mat)

    def sphere(label, center, radius, mat):
        c = point(center); r = point(radius); vertices=[]; faces=[]
        for j in range(9):
            phi = math.pi * j / 8
            for i in range(12):
                theta = math.tau * i / 12
                vertices.append(c + Vector((r.x*math.sin(phi)*math.cos(theta), r.y*math.sin(phi)*math.sin(theta), r.z*math.cos(phi))))
        for j in range(8):
            for i in range(12):
                a=j*12+i; b=j*12+(i+1)%12
                faces.append((a,b,b+12,a+12))
        obj=mesh_object(label,vertices,faces,mat)
        for polygon in obj.data.polygons: polygon.use_smooth=True
        return obj

    def rod(label, start, end, radius, mat):
        a=point(start); b=point(end); direction=(b-a).normalized()
        side=direction.cross(Vector((0,0,1)))
        if side.length < 0.01: side=direction.cross(Vector((0,1,0)))
        side.normalize(); other=direction.cross(side)
        radius *= min(scale[0], scale[1]); vertices=[]
        for center in (a,b):
            for i in range(12):
                t=math.tau*i/12; vertices.append(center+radius*(math.cos(t)*side+math.sin(t)*other))
        faces=[tuple(reversed(range(12))),tuple(range(12,24))]
        faces += [(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
        return mesh_object(label,vertices,faces,mat)

    complex_model = False
    if item['kind'] == 'performer':
        complex_model=True
        palette=[(0.06,0.25,0.30),(0.12,0.20,0.38),(0.48,0.13,0.10),(0.19,0.31,0.22),(0.52,0.34,0.09)]
        shirt=material('Swell shirt '+item['nodeId'],palette[int(hashlib.sha256(item['nodeId'].encode()).hexdigest()[:4],16)%5])
        skin=material('Swell skin',(0.63,0.40,0.26))
        sphere('Head',(0,0,0.91),(0.23,0.38,0.09),skin)
        sphere('Hair',(0,0.04,0.957),(0.235,0.38,0.043),dark)
        rod('Neck',(0,0,0.78),(0,0,0.85),0.14,skin)
        sphere('Shirt',(0,0,0.645),(0.35,0.38,0.155),shirt)
        sphere('Hips',(0,0,0.49),(0.28,0.35,0.07),dark)
        for sign in (-1,1):
            rod('Sleeve',(sign*0.28,0,0.75),(sign*0.39,0,0.63),0.13,shirt)
            rod('Forearm',(sign*0.39,0,0.63),(sign*0.40,-0.04,0.48),0.09,skin)
            sphere('Hand',(sign*0.40,-0.04,0.465),(0.075,0.12,0.035),skin)
            rod('Leg',(sign*0.15,0,0.48),(sign*0.16,0,0.09),0.15,dark)
            box('Shoe',(sign*0.16,-0.12,0.035),(0.25,0.62,0.07),dark)
            sphere('Eye',(sign*0.075,-0.365,0.924),(0.022,0.025,0.009),dark)
    elif 'microphone stand' in name or 'mic stand' in name:
        complex_model=True
        for angle in (0,120,240):
            t=math.radians(angle); rod('Tripod',(0,0,0.08),(0.48*math.cos(t),0.48*math.sin(t),0.01),0.018,dark)
        rod('Upright',(0,0,0.03),(0,0,0.87),0.021,metal)
        rod('Boom',(0,0.15,0.80),(0,-0.48,0.98),0.016,dark)
        sphere('Clutch',(0,0,0.54),(0.045,0.045,0.035),dark)
    elif 'guitar stand' in name:
        complex_model=True
        rod('Back',(0,0.2,0.02),(0,0.25,0.93),0.035,dark)
        for sign in (-1,1):
            rod('Base',(0,0.2,0.08),(sign*0.45,-0.45,0.01),0.035,dark)
            rod('Cradle',(sign*0.28,0.16,0.18),(sign*0.28,-0.25,0.22),0.035,dark)
        rod('Neck cradle',(-0.18,0.20,0.88),(0.18,0.20,0.88),0.035,dark)
    elif 'drum kit' in name or 'drum set' in name:
        complex_model=True
        rod('Kick shell',(0,-0.45,0.23),(0,-0.1,0.23),0.25,wood)
        rod('Kick head',(0,-0.46,0.23),(0,-0.45,0.23),0.24,cream)
        for x,y,z,r in ((-0.2,0,0.60,0.14),(0.12,0.02,0.64,0.16),(0.34,0.2,0.35,0.21),(-0.32,-0.05,0.33,0.17)):
            rod('Drum',(x,y,z-0.14),(x,y,z),r,wood); rod('Drum head',(x,y,z),(x,y,z+0.006),r,cream)
        for x,y,z in ((-0.35,0.24,0.93),(0.33,-0.13,0.99)):
            rod('Cymbal stand',(x,y,0),(x,y,z),0.012,metal)
            sphere('Cymbal',(x,y,z),(0.17,0.21,0.008),gold)
    elif 'keyboard stand' in name:
        complex_model=True
        rod('X brace',(-0.45,0,0.03),(0.45,0,0.97),0.04,dark)
        rod('X brace',(0.45,0,0.03),(-0.45,0,0.97),0.04,dark)
        for x in (-0.45,0.45):
            rod('Keyboard support',(x,-0.45,0.97),(x,0.45,0.97),0.04,dark)
            rod('Foot',(x,-0.45,0.03),(x,0.45,0.03),0.04,dark)
    elif ('microphone' in name or ' mic' in name or 'template-overhead-mic' in name) and 'micromon' not in name:
        complex_model=True
        rod('Microphone body',(0,0.46,0.5),(0,-0.27,0.5),0.28,dark)
        sphere('Microphone grille',(0,-0.31,0.5),(0.47,0.19,0.48),metal)
    elif 'multi-effects' in name or 'stomp' in name:
        box('Pedal display',(-.25,.15,1.01),(.28,.5,.02),metal)
        for x in (-.35,-.12,.12,.35):
            sphere('Foot switch',(x,-.27,1.03),(.025,.055,.04),metal)
        for x in (-.1,.15,.36): sphere('Knob',(x,.28,1.04),(.04,.09,.05),dark)
    elif 'amp' not in name and ('guitar' in name or 'tele' in name or ('bass' in name and 'd.i.' not in name and 'station' not in name and 'direct box' not in name)):
        from . import instruments
        instruments.build(root, '335' if '335' in name else 'mustang' if 'bass' in name else 'tele', dimensions)
        return
    elif 'keyboard' in name or 'nord' in name or 'piano' in name:
        root.data.materials.clear(); root.data.materials.append(material('Nord red',(.52,.012,.02)))
        for i in range(24):
            box('Key',(-0.46+i*0.04,-0.12,1.015),(0.037,0.68,0.025),cream)
        for i in range(23):
            if i%7 not in (2,6): box('Black key',(-0.44+i*0.04,0.10,1.04),(0.018,0.34,0.04),dark)
    elif 'x32' in name:
        for i in range(16):
            x=-.45+i*.06
            box('Fader slot',(x,-.14,1.008),(.009,.42,.012),dark)
            box('Fader cap',(x,-.16,1.035),(.035,.035,.026),cream)
            for y in (.12,.25,.37): sphere('Console knob',(x,y,1.025),(.017,.025,.035),metal)
        box('Console display',(.26,.25,1.015),(.25,.3,.025),dark)
    else:
        box('Top panel',(0,0,0.998),(0.90,0.90,0.004),dark)
        if 'amp' in name:
            box('Speaker grille',(0,-0.497,0.48),(0.88,0.005,0.8),metal)
    if complex_model:
        root.display_type='WIRE'; root.hide_render=True
    root['swell_visual_version']=2
