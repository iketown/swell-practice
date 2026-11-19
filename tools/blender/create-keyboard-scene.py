"""Run in Blender via MCP after refreshing the authenticated setup snapshot."""
import bpy, json, math, importlib, shutil
from pathlib import Path
from mathutils import Vector
from swell_blender_sync import equipment as eq, models
REPO=Path('/Users/brianeichenberger/projects/the_swell/swell_website/swell-parts')
DEST=Path('/Users/brianeichenberger/projects/the_swell/stage/keyboard_stage_center.blend')
if DEST.exists(): raise RuntimeError('Destination exists; inspect before replacing')
if eq.local_changes(): raise RuntimeError('Original scene has pending local changes')
# The existing playroom is saved and remains on disk. Keep its scene until the new one is populated.
original=bpy.context.scene
bpy.context.window_manager.swell_auto_sync=False
eq.unregister()
for path in (REPO/'tools/blender/swell_blender_sync').glob('*.py'):
    shutil.copy2(path,Path(eq.__file__).parent/path.name)
from swell_blender_sync import cables
importlib.reload(models); importlib.reload(cables); importlib.reload(eq); eq.register()
scene=bpy.data.scenes.new('Keyboard Stage Center'); bpy.context.window.scene=scene
scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=1; scene.unit_settings.length_unit='FEET'
snap=json.loads((REPO/'tmp/blender-integration/keyboard-snapshot.json').read_text())
scene.swell_setup_sync.setup_id=snap['setupId']; scene.swell_setup_sync.app_url='http://localhost:3000'
w=snap['stage']['widthMeters']; d=snap['stage']['depthMeters']
mesh=bpy.data.meshes.new('Stage calibration surface'); mesh.from_pydata([(-w/2,-d/2,0),(w/2,-d/2,0),(w/2,d/2,0),(-w/2,d/2,0)],[],[(0,1,2,3)]);mesh.update()
stage=bpy.data.objects.new('Stage · 46 × 24 ft',mesh);scene.collection.objects.link(stage)
stage.data.materials.append(models.material('Stage graphite',(.09,.11,.125)))
scene.swell_setup_sync.stage_object=stage
eq.apply_snapshot(snap)
# Heights are provisional placement choices, stored as pose edits; footprint XY stays unchanged.
for root in eq.roots():
    item=json.loads(root['swell_item']); hint=(item['name']+' '+item.get('modelHint','')).lower()
    if item['pose']['elevationMeters']!=0: continue
    z=0
    if 'overhead-mic' in hint: z=2.0
    elif 'kick' in hint and 'mic' in hint: z=.30
    elif 'snare' in hint and 'mic' in hint: z=.72
    elif 'mic' in hint and 'stand' not in hint and 'micromon' not in hint: z=1.12 if 'sam mic' in hint else 1.55
    elif 'keyboard' in hint or 'nord' in hint: z=.85
    elif 'telecaster' in hint or '335' in hint or 'template-bass' in hint and 'di' not in hint: z=.12
    elif 'x32' in hint: z=.85
    root.location.z=z
    root['swell_model_note']='Low-poly planning proxy. Missing dimensions are estimates; catalog unchanged.'
# Reference scenery is separate from synchronized inventory.
refs=bpy.data.collections.new('Reference · people, drum kit, supports');scene.collection.children.link(refs)
def reference(name,size,location,kind='equipment',hint=''):
    obj=bpy.data.objects.new(name,eq.box_mesh(name,size));refs.objects.link(obj)
    obj.location=location;obj['swell_reference_only']=True
    obj['swell_note']='Unlinked planning reference; not an inventory placement.'
    models.build(obj,{'name':name,'nodeId':name,'kind':kind,'modelHint':hint},size)
    return obj
roots={o['swell_node_id']:o for o in eq.roots()}
for label,node,offset in [
 ('Joe · 6 ft','node-9eec7a8e-4ad5-4297-9ef1-aef7092362d6',(.0,.34)),
 ('Ike · 6 ft','node-09ff1579-0316-4df3-83f6-091b60135065',(.0,-.5)),
 ('Cron · 6 ft','node-ed8e059b-2f36-4d8e-b995-1a8908a30ac9',(.0,.34)),
 ('Jackson · 6 ft','node-08f0448d-37a3-4cc4-9e90-9e6b4113aae7',(.0,.34)),
 ('Sam · 6 ft reference','node-ebbaa4ac-5c03-4bae-8c5f-2b2d16afeb0c',(.0,1.0))]:
    p=roots[node].location
    reference(label,(.55,.32,1.8288),(p.x+offset[0],p.y+offset[1],0),'performer')
p=roots['node-4062ebc5-3611-4be4-bfe2-1c9879ed7847'].location
reference('Drum kit · provisional reference',(1.7,1.6,1.4),(p.x,p.y+.65,0))
p=roots['node-09ff1579-0316-4df3-83f6-091b60135065'].location
reference('Keyboard stand · reference',(1.0,.40,.85),(p.x,p.y,0))
p=roots['node-7a74e5d3-5107-49fd-9288-fc9fe85ee853'].location
reference('Console table · reference',(1.12,.65,.84),(p.x,p.y,0))
# Stage area overlay, front/back labels, and unobtrusive device captions.
def label(text,location,size=.12,rotation=(0,0,0)):
    data=bpy.data.curves.new(text,'FONT');data.body=text;data.size=size;data.align_x='CENTER'
    obj=bpy.data.objects.new(text,data);refs.objects.link(obj);obj.location=location;obj.rotation_euler=rotation
    data.materials.append(models.material('Lettering',(.65,.73,.77)));return obj
label('KEYBOARD STAGE CENTER  /  46 × 24 FT',(0,d/2-.4,.015),.25)
label('AUDIENCE',(0,-d/2-.4,.01),.22)
label('SIDESTAGE',(w/2-1.2,0,.014),.18)
for root in eq.roots():
    item=json.loads(root['swell_item'])
    if item['kind']=='cable':continue
    short='Gibson ES-335' if '335' in root.name else 'SD16' if 'SD16' in root.name else root.name
    if short=='Microphone stand':continue
    p=root.location
    label(short,(p.x,p.y-.30,.018),.075)
# Lighting and cameras.
world=bpy.data.worlds.new('Keyboard studio world');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.20,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('Key',(0,-4,10),2200,9),('Fill',(-6,2,7),1600,8),('Rim',(4,5,8),1900,7)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,target,ortho in [('Stage overview',(13,-17,16),(0,0,0),18.5),('Stage top',(0,0,20),(0,0,0),16),('Band detail',(9,-13,8),(0,-1,.6),11)]:
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=ortho
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    if name=='Stage overview':scene.camera=obj
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=2000;scene.render.resolution_y=1350;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.context.view_layer.update();cables.update(force=True)
# Remove only the old scenes from this new document; saved playroom.blend is untouched.
for old in list(bpy.data.scenes):
    if old!=scene:bpy.data.scenes.remove(old)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_rotation=scene.camera.rotation_euler.to_quaternion()
            area.spaces.active.region_3d.view_distance=19
            area.spaces.active.region_3d.view_location=Vector((0,0,.4))
            area.spaces.active.clip_end=1000
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_extras=False
scene['swell_project_note']='Actual setup imported 2026-09-07. 28 nodes / 28 connection segments. Reference people/drums/supports are not inventory. Cable and missing proxy dimensions are estimates; no catalog dimensions changed.'
bpy.ops.wm.save_as_mainfile(filepath=str(DEST))
connection=json.loads((REPO/'tmp/blender-integration/keyboard-connection.json').read_text())
eq.connect(connection)
result={'file':str(DEST),'items':len(eq.roots()),'cables':len(cables.objects('swell_edge_id')),'pose_edits':len(eq.local_changes())}
