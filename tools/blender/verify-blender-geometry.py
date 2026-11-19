"""Run inside Blender with an isolated verification scene active."""
import bpy, math, json
from mathutils import Matrix, Euler
from swell_blender_sync import equipment as eq
assert bpy.context.scene.name == 'Swell integration verification'
root=eq.roots()[0]
original=root.matrix_world.copy()
original_mesh=root.data.copy()
checks=[]
def check_size(label, expected):
    bpy.context.view_layer.update()
    actual=eq.measure(root)
    assert all(abs(actual[k]-v)<0.00003 for k,v in expected.items()), (label,actual,expected)
    checks.append(label)
try:
    base=eq.measure(root)
    for angle in (0,90,37):
        root.matrix_world=Matrix.Translation(original.translation) @ Euler((0.31,-0.23,math.radians(angle))).to_matrix().to_4x4() @ Matrix.Diagonal((*original.decompose()[2],1))
        check_size('tilted canonical size at '+str(angle),base)
    root.matrix_world=original.copy()
    root.scale.x*=1.7;root.scale.y*=0.8
    scaled={**base,'widthMeters':base['widthMeters']*1.7,'depthMeters':base['depthMeters']*.8}
    check_size('unapplied nonuniform scale',scaled)
    for obj in bpy.context.selected_objects: obj.select_set(False)
    root.select_set(True);bpy.context.view_layer.objects.active=root
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    check_size('applied nonuniform scale',scaled)
    modifier=root.modifiers.new('Verification array','ARRAY');modifier.count=2;modifier.relative_offset_displace=(1,0,0)
    check_size('evaluated modifier bounds',{**scaled,'widthMeters':scaled['widthMeters']*2})
    root.modifiers.remove(modifier)
    root.scale.x=-1
    bpy.context.view_layer.update()
    try: eq.measure(root); raise AssertionError('reflection accepted')
    except ValueError: checks.append('negative scale rejected')
finally:
    root.data=original_mesh;root.matrix_world=original;bpy.context.view_layer.update()
result={'checks':checks,'clean':eq.local_changes()==[]}
assert result['clean'],eq.local_changes()
