"""Floor controls retain equipment identity without rendering measurement boxes."""
import json
import math
import bpy
from mathutils import Vector


def ensure_stand_controls():
    for old in list(bpy.context.scene.objects):
        if not old.get('swell_node_id') or old.type != 'MESH':
            continue
        pole=next((c for c in old.children if c.name.startswith('Upright') and c.type=='MESH'),None)
        boom=next((c for c in old.children if c.name.startswith('Boom') and c.type=='MESH'),None)
        if not pole or not boom:
            continue
        bounds=[list(p) for p in old.bound_box]
        inverse=old.matrix_world.inverted()
        pole_points=[inverse @ (pole.matrix_world @ v.co) for v in pole.data.vertices]
        center=sum(pole_points,Vector())/len(pole_points)
        boom_points=[inverse @ (boom.matrix_world @ v.co) for v in boom.data.vertices]
        tip=max(boom_points,key=lambda p:p.z)
        direction=Vector((tip.x-center.x,tip.y-center.y,0))
        if direction.length < 1e-6: direction=Vector((0,-1,0))
        direction.normalize(); side=Vector((-direction.y,direction.x,0))
        radius=max(max(p[i] for p in bounds)-min(p[i] for p in bounds) for i in (0,1))*.62
        unit=bpy.context.scene.unit_settings.scale_length
        scale=max(old.matrix_world.to_scale())
        center.z=.014/unit/scale
        data=bpy.data.curves.new('Stand floor circle and arrow','CURVE')
        data.dimensions='3D'; data.bevel_depth=.003/unit/scale; data.bevel_resolution=2
        def line(points,closed=False):
            spline=data.splines.new('POLY'); spline.points.add(len(points)-1)
            for p,co in zip(spline.points,points): p.co=(*co,1)
            spline.use_cyclic_u=closed
        line([center+Vector((math.cos(i*math.tau/96)*radius,math.sin(i*math.tau/96)*radius,0)) for i in range(96)],True)
        line([center+direction*radius,center+direction*(radius*1.52)])
        line([center+direction*(radius*1.28)+side*(radius*.18),center+direction*(radius*1.52),center+direction*(radius*1.28)-side*(radius*.18)])
        mat=bpy.data.materials.get('Stand control · turquoise') or bpy.data.materials.new('Stand control · turquoise')
        mat.diffuse_color=(.015,.65,.65,1); data.materials.append(mat)
        new=bpy.data.objects.new('Stand control',data)
        for col in old.users_collection: col.objects.link(new)
        for key in old.keys(): new[key]=old[key]
        new['swell_control_bounds']=json.dumps(bounds)
        new['swell_note']='Floor circle-and-arrow control: move in XY or rotate Z. Stand and microphone follow; original equipment dimensions retained.'
        new.parent=old.parent; new.matrix_world=old.matrix_world.copy()
        new.hide_render=True; new.show_in_front=True;new.color=mat.diffuse_color
        new.lock_rotation=(True,True,False)
        selected=old.select_get();active=bpy.context.view_layer.objects.active==old
        for child in list(old.children):
            world=child.matrix_world.copy();child.parent=new;child.matrix_world=world
        for obj in list(bpy.data.objects):
            for constraint in obj.constraints:
                if getattr(constraint,'target',None)==old: constraint.target=new
            if obj.get('swell_attachment_parent')==old['swell_node_id']:
                world=obj.matrix_world.copy();obj.parent=new;obj.matrix_world=world
        name=old.name;mesh=old.data
        bpy.data.objects.remove(old,do_unlink=True);new.name=name
        if mesh.users==0: bpy.data.meshes.remove(mesh)
        new.select_set(selected)
        if active: bpy.context.view_layer.objects.active=new
    bpy.context.view_layer.update()
