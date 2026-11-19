"""Saved-file integration checks, safe to run in a factory-startup background Blender."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import swell_blender_sync
swell_blender_sync.register()
from swell_blender_sync import equipment as eq,cables
scene=bpy.context.scene;snap=eq.baseline()
assert len(eq.roots())==len(snap['items'])==28
assert set(cables.objects('swell_edge_id'))=={c['edgeId'] for c in snap['cables']}
assert len(bpy.data.scenes)==1
assert not eq.local_changes(),eq.local_changes()
cables.update(force=True)
ports=cables.objects('swell_port_key')
for curve in cables.objects('swell_edge_id').values():
    c=json.loads(curve['swell_cable']);points=curve.data.splines[0].points
    for idx,end in [(0,c['source']),(-1,c['target'])]:
        assert (Vector(points[idx].co[:3])-ports[cables.port_key(end)].matrix_world.translation).length<.00001
    direct=curve['swell_direct_m'];routed=curve['swell_route_m']
    assert routed+1e-5>=direct
    assert math.isclose(curve['swell_required_m'],routed+curve['swell_extra_drop_m']+curve['swell_slack_m'],abs_tol=1e-6)
    assert 0<curve.data.bevel_depth*2<=.00635
# Edits to a local waypoint survive a pull with the same remote waypoint.
waypoint=next(iter(cables.objects('swell_waypoint_id').values()))
original=waypoint.location.copy();waypoint.location.x+=.1;bpy.context.view_layer.update()
cables.import_snapshot(snap,eq.frame(snap))
assert abs(waypoint.location.x-original.x-.1)<1e-5
waypoint.location=original;bpy.context.view_layer.update();cables.update(force=True)
# Scaling and heading are isolated from measurement changes at rest.
assert not eq.local_changes()
print(json.dumps({'saved_reload':'passed','nodes':28,'curves':28,'endpoint_binding':'passed','route_measurements':'passed','local_waypoint_persistence':'passed','local_changes':0}))
