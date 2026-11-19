"""Persistent, live cable curves. No network or database writes from routing.
Endpoints are local child empties; shared waypoint XY positions sync with the website.
"""
import csv
import json
import math
from pathlib import Path
import bpy
from bpy.props import StringProperty
from mathutils import Vector
from mathutils.geometry import intersect_line_line
from .models import material
from .lanes import separate_routes


def objects(key):
    return {o[key]: o for o in bpy.context.scene.objects if o.get(key)}


def collection():
    scene = bpy.context.scene
    name = 'Swell cables · ' + scene.swell_setup_sync.setup_id
    result = bpy.data.collections.get(name)
    if not result:
        result = bpy.data.collections.new(name); scene.collection.children.link(result)
    return result


def port_key(endpoint):
    return endpoint['nodeId'] + '/' + endpoint['portId']


def snapshot_waypoints(snapshot):
    if 'waypoints' in snapshot:
        return snapshot['waypoints']
    return list({w['id']: w for c in snapshot.get('cables', []) for w in c['waypoints']}.values())


def waypoint_changes(snapshot, frame):
    if not snapshot or 'waypoints' not in snapshot:
        return []  # Older servers do not accept waypoint writes.
    indexed = objects('swell_waypoint_id'); result = []
    unit = frame['metersPerBlenderUnit']; origin = frame['origin']
    for point in snapshot_waypoints(snapshot):
        obj = indexed.get(point['id'])
        if not obj:
            raise ValueError('Missing waypoint: ' + point['label'] + '. Restore from website or undo deletion')
        current = {'xMeters': obj.matrix_world.translation.x * unit - origin[0],
                   'yMeters': origin[1] - obj.matrix_world.translation.y * unit}
        patch = {k: v for k, v in current.items() if abs(v - point[k]) > .00002}
        if patch: result.append(dict(patch, waypointId=point['id']))
    return result


def waypoint_conflicts(old, incoming, changes):
    prior = {w['id']: w for w in snapshot_waypoints(old)}
    remote = {w['id']: w for w in snapshot_waypoints(incoming)}
    conflicts = []
    for change in changes:
        key = change['waypointId']; name = prior[key]['label']
        if key not in remote:
            conflicts.append(name + ': waypoint removed on website'); continue
        for axis in ('xMeters', 'yMeters'):
            if axis in change and abs(remote[key][axis] - prior[key][axis]) > .00002 and abs(remote[key][axis] - change[axis]) > .00002:
                conflicts.append(name + ': ' + axis + ' changed on both sides')
    return conflicts


def acknowledge_waypoints(snapshot, changes):
    indexed = objects('swell_waypoint_id')
    for change in changes:
        for point in snapshot_waypoints(snapshot):
            if point['id'] == change['waypointId']:
                point.update({k: v for k, v in change.items() if k != 'waypointId'})
                marker = indexed.get(point['id'])
                if marker: marker['swell_waypoint_baseline'] = json.dumps(point, sort_keys=True)
        for cable in snapshot.get('cables', []):
            for point in cable['waypoints']:
                if point['id'] == change['waypointId']:
                    point.update({k: v for k, v in change.items() if k != 'waypointId'})


def cone_waypoint(marker, col, unit):
    """The cone empty owns the waypoint ID, so dragging it syncs."""
    if marker and marker.type == 'EMPTY':
        return marker
    new = bpy.data.objects.new('Waypoint cone', None)
    if marker:
        name = marker.name; selected = marker.select_get()
        active = bpy.context.view_layer.objects.active == marker
        for collection_ref in marker.users_collection: collection_ref.objects.link(new)
        new.location = marker.matrix_world.translation
        for key in marker.keys(): new[key] = marker[key]
        for child in list(marker.children):
            world = child.matrix_world.copy(); child.parent = new; child.matrix_world = world
        old_mesh = marker.data if marker.type == 'MESH' else None
        bpy.data.objects.remove(marker, do_unlink=True)
        if old_mesh and old_mesh.users == 0: bpy.data.meshes.remove(old_mesh)
        new.name = name
        new.select_set(selected)
        if active: bpy.context.view_layer.objects.active = new
    else:
        col.objects.link(new)
    return new


def import_snapshot(snapshot, frame, preserve=None):
    if 'cables' not in snapshot:
        return  # Older server: retain the saved routes.
    col = collection(); roots = objects('swell_node_id'); ports = objects('swell_port_key')
    points = objects('swell_waypoint_id'); curves = objects('swell_edge_id')
    unit = frame['metersPerBlenderUnit']; origin = frame['origin']
    current_points = snapshot_waypoints(snapshot)
    for waypoint in current_points:
        marker = cone_waypoint(points.get(waypoint['id']), col, unit)
        marker['swell_waypoint_id'] = waypoint['id']; points[waypoint['id']] = marker
        marker.name = 'Waypoint · ' + waypoint['label'] + ' · ' + waypoint['id'][-6:]
        marker.empty_display_type = 'CONE'; marker.empty_display_size = .0762 / unit
        marker.rotation_mode = 'XYZ'; marker.rotation_euler = (math.pi / 2, 0, 0)
        marker.hide_select = False
        marker.hide_render = True  # Layout handle; visible and selectable in the viewport.
        marker.show_name = True; marker.show_in_front = True
        marker.lock_location = (False, False, True)
        marker.lock_rotation = (True, True, True); marker.lock_scale = (True, True, True)
        marker['swell_note'] = 'Shared waypoint: move in XY. Auto Sync sends positions to the website. Edit cable waypoint membership/order on the website.'
        signature = json.dumps(waypoint, sort_keys=True)
        if marker.get('swell_waypoint_baseline') != signature:
            marker.location = ((origin[0]+waypoint['xMeters'])/unit, (origin[1]-waypoint['yMeters'])/unit, (origin[2]+.012)/unit)
        marker['swell_waypoint_baseline'] = signature
        for change in preserve or []:
            if change['waypointId'] == waypoint['id']:
                if 'xMeters' in change: marker.location.x = (origin[0] + change['xMeters']) / unit
                if 'yMeters' in change: marker.location.y = (origin[1] - change['yMeters']) / unit
        marker.hide_set(False)
    ids = {w['id'] for w in current_points}
    for key, marker in points.items():
        if key not in ids:
            marker.hide_set(True); marker['swell_removed_waypoint_id'] = key
            del marker['swell_waypoint_id']
    for cable in snapshot['cables']:
        for end in (cable['source'], cable['target']):
            root = roots.get(end['nodeId'])
            if not root: continue
            key = port_key(end); marker = ports.get(key)
            if not marker:
                marker = bpy.data.objects.new('Jack · ' + root.name + ' · ' + end['label'], None)
                col.objects.link(marker); marker.parent = root
                marker.empty_display_type = 'SPHERE'; marker.empty_display_size = .012 / unit
                marker['swell_port_key'] = key; marker['swell_connector'] = end['connector']
                marker['swell_note'] = 'Estimated jack location. Move this child empty to refine; retained locally.'
                ports[key] = marker
            anchor = json.dumps(end, sort_keys=True)
            if marker.get('swell_anchor_baseline') != anchor:
                bounds = [Vector(v) for v in root.bound_box]
                lo = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
                hi = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
                # Spread ports on a panel rather than stack every cable at one point.
                t = end['offset'] if end['portCount'] == 1 else .1 + .8 * end['portIndex'] / max(1, end['portCount']-1)
                x = lo.x + (hi.x-lo.x)*t; y = hi.y - (hi.y-lo.y)*t
                side = end['side']
                marker.location = (lo.x if side=='left' else hi.x if side=='right' else x,
                                   hi.y if side=='top' else lo.y if side=='bottom' else y,
                                   lo.z + (hi.z-lo.z)*.5)
                marker['swell_anchor_baseline'] = anchor
        curve = curves.get(cable['edgeId'])
        if not curve:
            data = bpy.data.curves.new('Cable circular sweep', 'CURVE'); data.dimensions='3D'
            data.resolution_u=12; data.bevel_resolution=3; data.use_fill_caps=True
            diameter = .0174 if cable['isTrunk'] else .0058 if cable['signalType']=='microphone' else .005
            data.bevel_depth=diameter/2/unit
            curve = bpy.data.objects.new('Cable · '+cable['edgeId'],data); col.objects.link(curve)
            curve['swell_edge_id'] = cable['edgeId']; curves[cable['edgeId']] = curve
            curve['swell_note'] = 'Automatic curve bevel; edit jack/route empties to reroute. Diameter = 2 × bevel depth. Trunk diameter is provisional.'
        if cable['isTrunk']:
            curve.data.bevel_depth = .0174 / 2 / unit  # Three times the standard mic diameter.
            curve['swell_note'] = 'Snake trunk: 3× standard microphone cable diameter (17.4 mm). Visualization size; verify actual cable dimensions.'
        curve.hide_set(False); curve.hide_render=False
        curve.lock_location=(True,True,True); curve.lock_rotation=(True,True,True); curve.lock_scale=(True,True,True)
        color = cable['color']
        if curve.get('swell_color_baseline') != color:
            try: rgb=tuple(int(color.lstrip('#')[i:i+2],16)/255 for i in (0,2,4))
            except (ValueError, IndexError): rgb=(.2,.3,.4)
            curve.data.materials.clear(); curve.data.materials.append(material('Cable '+color,rgb))
            curve['swell_color_baseline']=color
        curve['swell_cable'] = json.dumps(cable)
    current={c['edgeId'] for c in snapshot['cables']}
    for key, curve in curves.items():
        if key not in current:
            curve.hide_set(True); curve.hide_render=True
            curve['swell_removed_edge_id']=key; del curve['swell_edge_id']
    bpy.context.view_layer.update()
    update(force=True)


def rounded_route(points, radius):
    clean=[]
    for p in points:
        if not clean or (p-clean[-1]).length > 1e-6: clean.append(p.copy())
    if len(clean)<3: return clean
    result=[clean[0]]
    for i in range(1,len(clean)-1):
        previous,center,nxt=clean[i-1:i+2]
        a=(previous-center); b=(nxt-center)
        r=min(radius,a.length*.25,b.length*.25)
        start=center+a.normalized()*r; end=center+b.normalized()*r
        result.append(start)
        for j in range(1,9):
            t=j/8; result.append((1-t)**2*start+2*(1-t)*t*center+t*t*end)
    result.append(clean[-1]); return result


def rod_axis(obj):
    """Read the two end-cap centers of our stand rods in world coordinates."""
    caps = [face for face in obj.data.polygons if len(face.vertices) > 4]
    if len(caps) != 2:
        return None
    centers = [obj.matrix_world @ (sum((obj.data.vertices[i].co for i in face.vertices), Vector()) / len(face.vertices)) for face in caps]
    radius = max((obj.matrix_world @ obj.data.vertices[i].co - center).length for face, center in zip(caps, centers) for i in face.vertices)
    return centers[0], centers[1], radius


def endpoint_descent(marker, floor_z, unit, cable_radius):
    """Mic jack -> boom -> beside upright -> floor; other gear drops directly."""
    jack = marker.matrix_world.translation.copy()
    fallback = [jack, Vector((jack.x, jack.y, floor_z))]
    mic = marker.parent
    if not mic:
        return fallback
    # Prefer the stable app attachment ID; imported stand names are a fallback.
    stand_id = mic.parent.get('swell_attachment_parent') if mic.parent else None
    stand = objects('swell_node_id').get(stand_id) if stand_id else None
    if not stand or not any(c.name.startswith('Upright') for c in stand.children):
        stand = bpy.data.objects.get(mic.get('swell_mic_stand', ''))
    if not stand:
        return fallback
    pole = next((c for c in stand.children if c.type == 'MESH' and c.name.startswith('Upright')), None)
    boom = next((c for c in stand.children if c.type == 'MESH' and c.name.startswith('Boom')), None)
    if not pole or not boom:
        return fallback
    pa, ba = rod_axis(pole), rod_axis(boom)
    if not pa or not ba:
        return fallback
    bottom, top = sorted(pa[:2], key=lambda p: p.z)
    b0, b1 = ba[:2]; axis = b1 - b0
    if axis.length < 1e-6 or (top-bottom).length < 1e-6:
        return fallback
    joint = intersect_line_line(b0, b1, bottom, top)
    if not joint:
        return fallback
    boom_joint, pole_joint = joint
    side = (top-bottom).cross(axis).normalized()
    # Keep the cable just outside the hardware, with clearance around the joint.
    offset = side * (max(pa[2], ba[2]) + cable_radius + .012 / unit)
    t = max(0, min(1, (jack-b0).dot(axis) / axis.length_squared))
    on_boom = b0 + axis*t + offset
    lower = bottom + offset
    return [jack, on_boom, boom_joint + offset, pole_joint + offset, lower,
            Vector((lower.x, lower.y, floor_z))]


def update(force=False):
    scene=bpy.context.scene
    raw=scene.get('swell_frame')
    curves=objects('swell_edge_id')
    if not raw or not curves: return
    frame=json.loads(raw); unit=frame['metersPerBlenderUnit']; floor=frame['origin'][2]/unit
    ports=objects('swell_port_key'); waypoints=objects('swell_waypoint_id')
    prepared=[]
    for curve in curves.values():
        data=json.loads(curve['swell_cable'])
        start=ports.get(port_key(data['source'])); end=ports.get(port_key(data['target']))
        if not start or not end:
            curve['swell_route_error']='Missing endpoint'; continue
        a=start.matrix_world.translation.copy(); b=end.matrix_world.translation.copy()
        z=floor+curve.data.bevel_depth+.003/unit
        source_descent = endpoint_descent(start, z, unit, curve.data.bevel_depth)
        target_descent = endpoint_descent(end, z, unit, curve.data.bevel_depth)
        route=[source_descent[-1]]
        route += [Vector((waypoints[w['id']].matrix_world.translation.x,waypoints[w['id']].matrix_world.translation.y,z)) for w in data['waypoints'] if w['id'] in waypoints]
        route += [target_descent[-1]]
        floor_path=[route[0]]
        for p,q in zip(route,route[1:]):
            floor_path.extend([Vector((q.x,p.y,z)),q])
        prepared.append({'id':curve['swell_edge_id'], 'points':floor_path,
                         'radius':curve.data.bevel_depth, 'source':tuple(a),
                         'curve':curve, 'data':data, 'a':a, 'b':b, 'z':z,
                         'source_descent':source_descent, 'target_descent':target_descent})
    spaced=separate_routes(prepared, .00635/unit, .0001/unit)
    for item in prepared:
        curve=item['curve']; data=item['data']; a=item['a']; b=item['b']; z=item['z']
        path=list(item['source_descent'][:-1])
        path.extend(Vector(p) for p in spaced[item['id']])
        path.extend(reversed(item['target_descent'][:-1]))
        signature=json.dumps([[round(v,6) for v in p] for p in path])+str(curve.data.bevel_depth)
        if not force and curve.get('swell_route_signature')==signature: continue
        points=rounded_route(path,.06/unit)
        curve.data.splines.clear()
        spline=curve.data.splines.new('POLY'); spline.points.add(len(points)-1)
        for point,co in zip(spline.points,points): point.co=(*co,1)
        length=sum((q-p).length for p,q in zip(points,points[1:]))*unit
        extra=max(0,data['sourceDropMeters']-abs(a.z-z)*unit)+max(0,data['targetDropMeters']-abs(b.z-z)*unit)
        curve['swell_route_m']=length; curve['swell_direct_m']=(b-a).length*unit
        curve['swell_extra_drop_m']=extra; curve['swell_slack_m']=data['slackMeters']
        curve['swell_required_m']=length+extra+data['slackMeters']
        curve['swell_route_signature']=signature
        curve['swell_route_error']=''


def export_report(path):
    update(force=True); roots=objects('swell_node_id'); rows=[]
    for edge_id,curve in objects('swell_edge_id').items():
        c=json.loads(curve['swell_cable'])
        row={'edge_id':edge_id,'source':roots[c['source']['nodeId']].name,'source_port':c['source']['label'],
             'target':roots[c['target']['nodeId']].name,'target_port':c['target']['label'],
             'device_connector_a':c['source']['connector'],'device_connector_b':c['target']['connector'],
             'signal':c['signalType'],'assembly_ids':';'.join(c['assemblyIds']),
             'segment_kind':'snake trunk' if c['isTrunk'] else 'assembly segment' if c['assemblyIds'] else 'cable run',
             'diameter_mm':round(curve.data.bevel_depth*2*bpy.context.scene.unit_settings.scale_length*1000,2)}
        for key in ('direct','route','extra_drop','slack','required'):
            row[key+'_ft']=round(curve['swell_'+key+'_m']/.3048,2)
        row['website_length_ft']=round(c.get('websiteLengthMeters',0)/.3048,2)
        row['notes']='Planning estimate: verify jack positions, elevations and route. Assembly segments are not separate purchase quantities.'
        rows.append(row)
    if rows:
        with open(path,'w',newline='') as out:
            writer=csv.DictWriter(out,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    return rows


class SWELL_OT_export_cables(bpy.types.Operator):
    bl_idname='swell.export_cables'; bl_label='Export cable measurements (CSV)'
    filepath: StringProperty(subtype='FILE_PATH')
    def invoke(self,context,event):
        self.filepath=str(Path(bpy.data.filepath).with_suffix('.cables.csv')) if bpy.data.filepath else 'cables.csv'
        context.window_manager.fileselect_add(self); return {'RUNNING_MODAL'}
    def execute(self,context):
        try: rows=export_report(self.filepath)
        except Exception as error:
            self.report({'ERROR'},str(error)); return {'CANCELLED'}
        self.report({'INFO'},str(len(rows))+' connection segments exported'); return {'FINISHED'}


class SWELL_PT_cables(bpy.types.Panel):
    bl_label='Cable routing'; bl_idname='SWELL_PT_cables'; bl_space_type='VIEW_3D'; bl_region_type='UI'; bl_category='Swell'
    def draw(self,context):
        layout=self.layout; layout.label(text='Routes follow gear automatically')
        layout.label(text='Shared runs: ¼ inch cable clearance')
        layout.operator('swell.export_cables')
        obj=context.active_object
        if obj and obj.get('swell_edge_id'):
            layout.prop(obj.data,'bevel_depth',text='Cable radius')
            for key,label in [('direct','Direct'),('route','Routed'),('slack','Service slack'),('required','Required incl. allowance')]:
                layout.label(text=f"{label}: {obj.get('swell_'+key+'_m',0)/.3048:.2f} ft")
            layout.label(text='Measurements are planning estimates',icon='INFO')
        elif obj and obj.get('swell_waypoint_id'):
            layout.label(text=obj.name)
            layout.label(text='Move in XY; Auto Sync updates website', icon='INFO')
            layout.prop(obj, 'location', index=0, text='Blender X')
            layout.prop(obj, 'location', index=1, text='Blender Y')
            layout.label(text='Cable waypoint lists are edited on website')
        elif obj and obj.get('swell_port_key'):
            layout.label(text='Position edits stay in this Blender file',icon='INFO')

_CLASSES=(SWELL_OT_export_cables,SWELL_PT_cables)
def register():
    for cls in _CLASSES: bpy.utils.register_class(cls)
def unregister():
    for cls in reversed(_CLASSES): bpy.utils.unregister_class(cls)
