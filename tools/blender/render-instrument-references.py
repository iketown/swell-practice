import bpy,math,json
from mathutils import Vector,Matrix
source=bpy.context.scene
roots={o.get('swell_instrument_style'):o for o in source.objects if o.get('swell_instrument_style')}
scene=bpy.data.scenes.new('Instrument reference comparison');bpy.context.window.scene=scene
for i,(kind,title) in enumerate([('tele','TELECASTER'),('mustang','MUSTANG BASS'),('335','ES-335')]):
    root=roots[kind];dup=root.copy();dup.data=root.data.copy();scene.collection.objects.link(dup)
    dup.parent=None;dup.matrix_world=Matrix.Translation(((i-1)*.53,0,0))
    for child in root.children:
        if child.get('swell_visual'):
            obj=child.copy();obj.data=child.data.copy();scene.collection.objects.link(obj);obj.parent=dup
    data=bpy.data.curves.new(title,'FONT');data.body=title;data.align_x='CENTER';data.size=.035
    obj=bpy.data.objects.new(title,data);scene.collection.objects.link(obj);obj.location=((i-1)*.53,-.10,-.075);obj.rotation_euler=(math.pi/2,0,0)
    m=bpy.data.materials.new(title);m.diffuse_color=(.65,.70,.75,1);data.materials.append(m)
world=bpy.data.worlds.new('Instrument photo studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.065,.085,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
for name,loc,energy,size in [('Key',(-2,-3,3),350,3),('Fill',(2,-1,2),220,2),('Rim',(0,2,3),400,2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,.6))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Reference front');data.type='ORTHO';data.ortho_scale=1.65;obj=bpy.data.objects.new('Reference front',data);scene.collection.objects.link(obj);obj.location=(.10,-5,.61);obj.rotation_euler=(Vector((0,0,.55))-obj.location).to_track_quat('-Z','Y').to_euler();scene.camera=obj
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1600;scene.render.resolution_y=1400;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.render.filepath='/Users/brianeichenberger/projects/the_swell/stage/instruments_photo_reference.png';bpy.ops.render.render(write_still=True)
