"""Swell equipment sync. Scene work stays on Blender's main thread."""
import copy
import hashlib
import json
import math
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, EnumProperty, FloatVectorProperty, StringProperty
from mathutils import Matrix, Vector, Euler

FT = 0.3048
_STATE = {'process': None, 'write': b'', 'read': b'', 'pending': None, 'connection': None,
          'incoming': None, 'retry': None, 'last_change': 0, 'last_poll': 0, 'signature': None, 'stable': 0, 'failures': 0, 'retry_after': 0}


def settings():
    return bpy.context.scene.swell_setup_sync


def status(text):
    bpy.context.window_manager.swell_status = text
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()


def roots(setup_id=None):
    setup_id = setup_id or settings().setup_id
    return [o for o in bpy.context.scene.objects if o.get('swell_node_id') and o.get('swell_setup_id') == setup_id]


def root_for_active():
    obj = bpy.context.view_layer.objects.active
    while obj and not obj.get('swell_node_id'):
        obj = obj.parent
    return obj


def baseline():
    raw = bpy.context.scene.get('swell_snapshot')
    return json.loads(raw) if raw else None


def stage_signature():
    obj = settings().stage_object
    if not obj or obj.type != 'MESH':
        raise ValueError('Choose the stage mesh first')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        scale = bpy.context.scene.unit_settings.scale_length
        points = [evaluated.matrix_world @ v.co * scale for v in mesh.vertices]
        if len(points) < 3:
            raise ValueError('Stage needs at least three vertices')
        if max(p.z for p in points) - min(p.z for p in points) > 0.001:
            raise ValueError('Use a flat horizontal stage mesh for calibration')
        signature = hashlib.sha256(json.dumps([[round(v, 5) for v in p] for p in points]).encode()).hexdigest()
        return points, signature, scale
    finally:
        if mesh is not None: evaluated.to_mesh_clear()


def frame(snapshot=None):
    raw = bpy.context.scene.get('swell_frame')
    points, signature, scale = stage_signature()
    if raw:
        result = json.loads(raw)
        if result['signature'] != signature or result['metersPerBlenderUnit'] != scale or result['setupId'] != settings().setup_id:
            raise ValueError('Stage or units changed. Recalibrate and review before syncing')
    else:
        result = {'setupId': settings().setup_id, 'origin': [min(p.x for p in points), max(p.y for p in points), min(p.z for p in points)],
                  'width': max(p.x for p in points) - min(p.x for p in points), 'depth': max(p.y for p in points) - min(p.y for p in points),
                  'signature': signature, 'metersPerBlenderUnit': scale}
        bpy.context.scene['swell_frame'] = json.dumps(result)
    if snapshot:
        if abs(result['width'] - snapshot['stage']['widthMeters']) > 0.002 or abs(result['depth'] - snapshot['stage']['depthMeters']) > 0.002:
            raise ValueError('Stage bounds differ from website. Sync the stage outline first')
        # Compare point sets without depending on winding/start vertex.
        outline = snapshot['stage'].get('outlineMeters')
        if outline:
            expected = [(p.x - result['origin'][0], result['origin'][1] - p.y) for p in points]
            if any(min(math.hypot(p['xMeters'] - x, p['yMeters'] - y) for x, y in expected) > 0.002 for p in outline):
                raise ValueError('Stage outline differs. Review stage calibration')
    return result


def pose_matrix(pose, calibration):
    origin = calibration['origin']; scale = calibration['metersPerBlenderUnit']
    location = Vector(((origin[0] + pose['centerXMeters']) / scale, (origin[1] - pose['centerYMeters']) / scale, (origin[2] + pose['elevationMeters']) / scale))
    rotation = Euler(tuple(math.radians(pose[k]) for k in ('rollDegrees', 'pitchDegrees')) + (math.radians(-pose['headingDegrees']),), 'XYZ')
    return Matrix.Translation(location) @ rotation.to_matrix().to_4x4()


def measure(root):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = root.evaluated_get(depsgraph)
    matrix = evaluated.matrix_world
    basis = matrix.to_3x3()
    if basis.determinant() <= 0:
        raise ValueError(root.name + ': normalize negative scale before correction')
    columns = [basis.col[i].normalized() for i in range(3)]
    if any(abs(columns[i].dot(columns[j])) > 1e-5 for i, j in ((0, 1), (0, 2), (1, 2))):
        raise ValueError(root.name + ': normalize sheared parent transforms')
    location, rotation, _ = matrix.decompose()
    inverse = rotation.to_matrix().transposed()
    stored_bounds = root.get('swell_control_bounds')
    mesh = None if stored_bounds else evaluated.to_mesh()
    try:
        vertices = [Vector(v) for v in json.loads(stored_bounds)] if stored_bounds else [v.co for v in mesh.vertices]
        points = [inverse @ (matrix @ v - location) for v in vertices]
        if not points:
            raise ValueError(root.name + ': measurement mesh is empty')
        scale = bpy.context.scene.unit_settings.scale_length
        result = [(max(p[i] for p in points) - min(p[i] for p in points)) * scale for i in range(3)]
        if any(not math.isfinite(v) or v <= 1e-7 for v in result):
            raise ValueError(root.name + ': all dimensions must be positive')
        return dict(zip(('widthMeters', 'depthMeters', 'heightMeters'), result))
    finally:
        if mesh is not None: evaluated.to_mesh_clear()


def current_item(root, base_item, calibration):
    result = copy.deepcopy(base_item)
    matrix = root.matrix_world
    loc, quat, _ = matrix.decompose()
    reference = Euler((math.radians(base_item['pose']['rollDegrees']), math.radians(base_item['pose']['pitchDegrees']), math.radians(-base_item['pose']['headingDegrees'])), 'XYZ')
    angles = quat.to_euler('XYZ', reference)
    origin = calibration['origin']; scale = calibration['metersPerBlenderUnit']
    result['pose'] = {'centerXMeters': loc.x * scale - origin[0], 'centerYMeters': origin[1] - loc.y * scale,
                      'elevationMeters': loc.z * scale - origin[2], 'headingDegrees': (-math.degrees(angles.z)) % 360,
                      'pitchDegrees': math.degrees(angles.y), 'rollDegrees': math.degrees(angles.x)}
    parent_id = root.parent.get('swell_attachment_parent') if root.parent else None
    if parent_id:
        parent = next((o for o in roots() if o['swell_node_id'] == parent_id), None)
        if not parent:
            raise ValueError('Attachment parent is missing')
        ploc, prot, _ = parent.matrix_world.decompose()
        rigid_parent = Matrix.Translation(ploc) @ prot.to_matrix().to_4x4()
        local = rigid_parent.inverted() @ (Matrix.Translation(loc) @ quat.to_matrix().to_4x4())
        angles = local.to_euler('XYZ')
        result['attachment'] = {'parentNodeId': parent_id, 'offsetMeters': dict(zip(('x','y','z'), (v * scale for v in local.translation))), 'rotationXYZDegrees': dict(zip(('x','y','z'), (math.degrees(v) for v in angles)))}
    else:
        result.pop('attachment', None)
    measured = measure(root)
    original = json.loads(root.get('swell_measured_baseline', '{}'))
    if original and not near(measured, original):
        result['dimensions'] = measured
    return result


def near(a, b, tolerance=0.00002):
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(near(a[k], b[k], tolerance) for k in a)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) < tolerance
    return a == b


def local_changes(include_dimensions=True, definition=False):
    snapshot = baseline()
    if not snapshot:
        return []
    if snapshot['setupId'] != settings().setup_id:
        raise ValueError('Pull the selected setup before pushing')
    calibration = frame(snapshot)
    objects = roots(); ids = [o['swell_node_id'] for o in objects]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate linked item. Unlink the duplicate before syncing')
    indexed = {o['swell_node_id']: o for o in objects}
    changes = []
    selected = root_for_active()
    for item in snapshot['items']:
        root = indexed.get(item['nodeId'])
        if not root:
            raise ValueError('Missing linked item: ' + item['name'] + '. Restore from website or undo deletion')
        current = current_item(root, item, calibration)
        patch = {'nodeId': item['nodeId']}
        pose = {k: v for k, v in current['pose'].items() if (abs((v-item['pose'][k]+180)%360-180) > .0001 if k.endswith('Degrees') else not near(v, item['pose'][k]))}
        if pose:
            patch['pose'] = pose
        if not near(current.get('attachment'), item.get('attachment')):
            patch['attachment'] = current.get('attachment')
        dimension_changed = not near(current['dimensions'], item['dimensions'])
        if definition and root == selected:
            current['dimensions'] = measure(root)
            dimension_changed = True
        if dimension_changed and include_dimensions:
            scope = 'definition' if definition and root == selected else 'placement'
            patch['dimensions'] = {'scope': scope, 'values': current['dimensions'], 'measurementKind': 'modeled-estimate'}
            if scope == 'definition':
                if item['kind'] in ('transport-endpoint', 'cable') or not item.get('templateId') or item.get('currentDefinitionVersion') is None:
                    raise ValueError('This item has no correctable equipment definition')
                patch['dimensions'].update(templateId=item['templateId'], expectedDefinitionVersion=item['currentDefinitionVersion'])
            if root.get('swell_fit_footprint', True):
                patch['footprint'] = {'widthMeters': current['dimensions']['widthMeters'], 'depthMeters': current['dimensions']['depthMeters'], 'mode': 'physical'}
        if len(patch) > 1:
            changes.append(patch)
    return changes


def box_mesh(name, dimensions):
    w, d, h = dimensions
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x * w / 2, y * d / 2, z * h) for z in (0, 1) for y in (-1, 1) for x in (-1, 1)], [],
                     [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)])
    mesh.update()
    return mesh


def default_size(item):
    kind = item['kind']; name = (item['name']+' '+item.get('modelHint','')).lower()
    d = item['dimensions']; f = item['footprint']
    fallback = (f['widthMeters'], f['depthMeters'], .15)
    if kind == 'performer': fallback=(.55,.30,1.8288)
    elif kind == 'cable': fallback=(.06,.035,.025)
    elif kind == 'transport-endpoint': fallback=(min(f['widthMeters'],.43),min(f['depthMeters'],.23),.09)
    elif 'stand' in name: fallback=(f['widthMeters'],f['depthMeters'],1.6)
    elif 'mic' in name and 'micromon' not in name: fallback=(.05,.19,.05)
    elif 'multi-effects' in name or 'stomp' in name: fallback=(.318,.127,.068)
    elif 'd.i.' in name or 'direct box' in name: fallback=(.13,.09,.05)
    elif 'bass' in name and 'amp' not in name: fallback=(.35,.055,1.18)
    elif '335' in name: fallback=(.406,.085,1.06)
    elif 'tele' in name or 'electric guitar' in name: fallback=(.325,.05,1.0)
    elif 'keyboard' in name or 'nord' in name: fallback=(1.067,.31,.104)
    elif 'sd16' in name: fallback=(.333,.149,.14)
    elif 'x32' in name: fallback=(.9,.53,.20)
    return tuple(d.get(k, fallback[i]) for i,k in enumerate(('widthMeters','depthMeters','heightMeters')))


def color_material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*color, 1)
    return mat


def make_root(item, collection, calibration):
    size = tuple(v / calibration['metersPerBlenderUnit'] for v in default_size(item))
    root = bpy.data.objects.new(item['name'], box_mesh('Swell measurement', size))
    collection.objects.link(root)
    root['swell_setup_id'] = settings().setup_id; root['swell_node_id'] = item['nodeId']
    root['swell_fit_footprint'] = item['footprint']['mode'] == 'physical'
    root.show_name = False
    root.data.materials.append(color_material('Swell equipment', (0.09, 0.18, 0.21)))
    from . import models
    models.build(root, item, size)
    return root


def set_attachment(root, parent, collection):
    world = root.matrix_world.copy()
    old_helper = root.parent if root.parent and root.parent.get('swell_attachment_parent') else None
    if parent:
        current = parent
        while current:
            if current == root:
                raise ValueError('Attachment would create a cycle')
            parent_id = current.parent.get('swell_attachment_parent') if current.parent else None
            current = next((o for o in roots() if o['swell_node_id'] == parent_id), None)
        root.parent = None
        helper = bpy.data.objects.new('Swell attachment · ' + root.name, None)
        collection.objects.link(helper)
        helper['swell_attachment_parent'] = parent['swell_node_id']
        helper.hide_select = True; helper.empty_display_size = 0.03
        if parent.get('swell_control_bounds'):
            helper.parent = parent
            helper.matrix_parent_inverse = parent.matrix_world.inverted()
        for kind in ('COPY_LOCATION', 'COPY_ROTATION'):
            constraint = helper.constraints.new(kind); constraint.target = parent
        bpy.context.view_layer.update()
        root.parent = helper
    else:
        root.parent = None
    root.matrix_world = world
    bpy.context.view_layer.update()
    if old_helper and not old_helper.children:
        bpy.data.objects.remove(old_helper, do_unlink=True)


def apply_snapshot(snapshot, preserve=None, waypoint_preserve=None):
    if snapshot['setupId'] != settings().setup_id:
        raise ValueError('Snapshot belongs to another setup')
    calibration = frame(snapshot)
    collection_name = 'Swell · ' + settings().setup_id
    collection = bpy.data.collections.get(collection_name)
    if not collection:
        collection = bpy.data.collections.new(collection_name); bpy.context.scene.collection.children.link(collection)
    existing = roots(); ids = [o['swell_node_id'] for o in existing]
    if len(ids) != len(set(ids)):
        raise ValueError('Unlink duplicated objects before pulling')
    indexed = {o['swell_node_id']: o for o in existing}
    remote_ids = {item['nodeId'] for item in snapshot['items']}
    for node_id, root in indexed.items():
        if node_id not in remote_ids:
            root['swell_removed_node_id'] = node_id; del root['swell_node_id']
            root.hide_set(True); root.hide_render = True
            for child in root.children_recursive:
                child.hide_set(True); child.hide_render = True
    # Detach first so incoming transforms are independent of item ordering.
    for root in existing:
        if root.parent and root.parent.get('swell_attachment_parent'):
            set_attachment(root, None, collection)
    for item in snapshot['items']:
        root = indexed.get(item['nodeId']) or make_root(item, collection, calibration)
        world_scale = root.matrix_world.decompose()[2]
        desired = pose_matrix(item['pose'], calibration)
        root.matrix_world = desired @ Matrix.Diagonal((*world_scale, 1))
        bpy.context.view_layer.update()
        before = measure(root); target = default_size(item)
        root.scale = tuple(root.scale[i] * target[i] / before[k] for i, k in enumerate(('widthMeters', 'depthMeters', 'heightMeters')))
        bpy.context.view_layer.update()
        root['swell_measured_baseline'] = json.dumps(measure(root))
        root['swell_item'] = json.dumps(item)
        root['swell_fit_footprint'] = item['footprint']['mode'] == 'physical'
        root.hide_set(False)
    linked = {o['swell_node_id']: o for o in roots()}
    for item in snapshot['items']:
        link = item.get('attachment')
        if link:
            set_attachment(linked[item['nodeId']], linked[link['parentNodeId']], collection)
    bpy.context.scene['swell_snapshot'] = json.dumps(snapshot)
    if preserve:
        for node_id, values in preserve.items():
            root = next((o for o in roots() if o['swell_node_id'] == node_id), None)
            if root and 'pose' in values:
                item = next(i for i in snapshot['items'] if i['nodeId'] == node_id)
                pose = dict(item['pose'], **values['pose'])
                scale = root.matrix_world.decompose()[2]
                root.matrix_world = pose_matrix(pose, calibration) @ Matrix.Diagonal((*scale, 1))
            if root and 'attachment' in values:
                link = values['attachment']
                set_attachment(root, linked.get(link['parentNodeId']) if link else None, collection)
            bpy.context.view_layer.update()
            if root and 'dimensions' in values:
                before = measure(root)
                root.scale = tuple(root.scale[i] * values['dimensions']['values'][k] / before[k] for i, k in enumerate(('widthMeters', 'depthMeters', 'heightMeters')))
    bpy.context.view_layer.update()
    from . import controls, cables
    controls.ensure_stand_controls()
    cables.import_snapshot(snapshot, calibration, waypoint_preserve)
    status('Synced · revision ' + str(snapshot['revision']) + ' · ' + str(len(snapshot['items'])) + ' items')


def stop_worker():
    process = _STATE['process']
    if process:
        process.terminate()
        try:
            process.wait(timeout=0.2)
        except subprocess.TimeoutExpired:
            process.kill()
        for stream in (process.stdin, process.stdout):
            stream.close()
    _STATE.update(process=None, pending=None, write=b'', read=b'')


def request(method, body=None, operation='pull'):
    if _STATE['pending']:
        raise ValueError('Wait for the current sync to finish')
    connection = _STATE['connection']
    if not connection or connection['setupId'] != settings().setup_id:
        raise ValueError('Paste a connection from this setup page first')
    if not _STATE['process'] or _STATE['process'].poll() is not None:
        executable = shutil.which('python3') or ('/usr/bin/python3' if Path('/usr/bin/python3').exists() else None)
        if not executable:
            raise ValueError('Python 3 is required for the network worker')
        process = subprocess.Popen([executable, str(Path(__file__).with_name('http_worker.py'))], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
        os.set_blocking(process.stdin.fileno(), False); os.set_blocking(process.stdout.fileno(), False)
        _STATE['process'] = process
    payload = dict(connection, method=method, body=body)
    _STATE['write'] = (json.dumps(payload) + '\n').encode()
    _STATE['pending'] = {'scene': bpy.context.scene.name, 'operation': operation, 'started': time.monotonic(), 'body': body}
    status('Syncing…')


def local_waypoint_changes():
    from . import cables
    snap = baseline()
    return cables.waypoint_changes(snap, frame(snap)) if snap else []


def push(definition=False, automatic=False, measurement_kind="modeled-estimate"):
    changes = local_changes(include_dimensions=not automatic, definition=definition)
    waypoint_changes = local_waypoint_changes()
    if not changes and not waypoint_changes:
        status('No placement or waypoint changes to push'); return
    if len(changes) > 100:
        raise ValueError('Push at most 100 changed items at once')
    for change in changes:
        if 'dimensions' in change: change['dimensions']['measurementKind'] = measurement_kind
    snapshot = baseline()
    body = {'schemaVersion': 1, 'setupId': settings().setup_id, 'baseRevision': snapshot['revision'],
            'clientId': bpy.context.scene.get('swell_client_id') or str(uuid.uuid4()), 'mutationId': str(uuid.uuid4()), 'changes': changes}
    if waypoint_changes: body['waypointChanges'] = waypoint_changes
    bpy.context.scene['swell_client_id'] = body['clientId']
    _STATE['retry'] = body
    request('PATCH', body, 'push')


def receive(message, pending):
    if not message['ok']:
        status(message['error'])
        if message.get('status', 0) == 0 or message.get('status', 0) >= 500:
            _STATE['failures'] += 1
            _STATE['retry_after'] = time.monotonic() + min(30, 2 ** _STATE['failures'])
        else:
            bpy.context.window_manager.swell_auto_sync = False
        return
    _STATE['failures'] = 0; _STATE['retry_after'] = 0
    if pending['operation'] == 'push':
        # Advance the baseline by the acknowledged patch, preserving edits made during I/O.
        snap = baseline(); changes = pending['body']['changes']
        if message['data'].get('replayed') and message['data']['revision'] < snap['revision']:
            _STATE['retry'] = None; request('GET'); return
        objects = {o['swell_node_id']: o for o in roots()}
        for change in changes:
            item = next(i for i in snap['items'] if i['nodeId'] == change['nodeId'])
            item['pose'].update(change.get('pose', {}))
            if 'dimensions' in change:
                item['dimensions'] = change['dimensions']['values']
                root = objects.get(item['nodeId'])
                if root:
                    root['swell_measured_baseline'] = json.dumps(item['dimensions'])
            if 'attachment' in change:
                if change['attachment'] is None: item.pop('attachment', None)
                else: item['attachment'] = change['attachment']
            if 'footprint' in change:
                item['footprint'] = change['footprint']
        from . import cables
        cables.acknowledge_waypoints(snap, pending['body'].get('waypointChanges', []))
        snap['revision'] = message['data']['revision']
        bpy.context.scene['swell_snapshot'] = json.dumps(snap)
        _STATE['retry'] = None
        request('GET', operation='pull')
        return
    snap = message['data']
    old = baseline()
    if old and snap['revision'] < old['revision']:
        raise ValueError('Server returned an older revision')
    if old:
        try:
            changes = local_changes()
            waypoint_changes = local_waypoint_changes()
        except ValueError as error:
            _STATE['incoming'] = snap
            status(str(error) + '. Use Restore website items if intentional.'); return
        if changes or waypoint_changes:
            remote = {i['nodeId']: i for i in snap['items']}; prior = {i['nodeId']: i for i in old['items']}
            from . import cables
            conflicts = cables.waypoint_conflicts(old, snap, waypoint_changes)
            for change in changes:
                node_id = change['nodeId']
                if node_id not in remote:
                    conflicts.append(prior[node_id]['name'] + ': removed on website'); continue
                for key, value in change.get('pose', {}).items():
                    if not near(remote[node_id]['pose'][key], prior[node_id]['pose'][key]) and not near(remote[node_id]['pose'][key], value):
                        conflicts.append(prior[node_id]['name'] + ': ' + key + ' local=' + str(round(value, 4)) + ' website=' + str(round(remote[node_id]['pose'][key], 4)))
                if 'attachment' in change and not near(remote[node_id].get('attachment'), prior[node_id].get('attachment')) and not near(remote[node_id].get('attachment'), change['attachment']):
                    conflicts.append(prior[node_id]['name'] + ': attachment changed on both sides')
                if 'dimensions' in change and not near(remote[node_id]['dimensions'], prior[node_id]['dimensions']) and not near(remote[node_id]['dimensions'], change['dimensions']['values']):
                    conflicts.append(prior[node_id]['name'] + ': dimensions changed on both sides')
            if conflicts:
                _STATE['incoming'] = snap; bpy.context.window_manager.swell_auto_sync = False
                status('Conflict: ' + '; '.join(conflicts)[:800]); return
            apply_snapshot(snap, {c['nodeId']: c for c in changes}, waypoint_changes)
            return
    apply_snapshot(snap)


def manipulating():
    return bpy.context.mode != 'OBJECT' or any(op.bl_idname.startswith('TRANSFORM_OT') for window in bpy.context.window_manager.windows for op in getattr(window, 'modal_operators', []))


def tick():
    try:
        from . import cables
        cables.update()
        process = _STATE['process']; pending = _STATE['pending']
        if pending and pending['scene'] != bpy.context.scene.name:
            stop_worker(); _STATE['connection'] = None; bpy.context.window_manager.swell_auto_sync = False
            status('Scene changed. Reconnect this scene before syncing.'); return 0.2
        if pending:
            if time.monotonic() - pending['started'] > 20 or process.poll() is not None:
                stop_worker(); status('Connection timed out. Local changes retained. Retry the last push.'); bpy.context.window_manager.swell_auto_sync = False
            else:
                if _STATE['write']:
                    try:
                        count = os.write(process.stdin.fileno(), _STATE['write']); _STATE['write'] = _STATE['write'][count:]
                    except BlockingIOError:
                        pass
                try:
                    chunk = os.read(process.stdout.fileno(), 65536)
                    _STATE['read'] += chunk
                except BlockingIOError:
                    pass
                if b'\n' in _STATE['read'] and not manipulating():
                    line, _STATE['read'] = _STATE['read'].split(b'\n', 1)
                    _STATE['pending'] = None
                    receive(json.loads(line), pending)
        elif bpy.context.window_manager.swell_auto_sync and _STATE['connection'] and baseline() and not manipulating():
            if time.monotonic() < _STATE['retry_after']:
                return 0.2
            if _STATE['retry']:
                request('PATCH', _STATE['retry'], 'push'); return 0.2
            changes = local_changes(); waypoint_changes = local_waypoint_changes()
            signature = json.dumps([changes, waypoint_changes], sort_keys=True)
            if signature != _STATE['signature']:
                _STATE['signature'] = signature; _STATE['stable'] = time.monotonic()
            if (changes or waypoint_changes) and time.monotonic() - _STATE['stable'] > 1.0:
                if any('dimensions' in c for c in changes):
                    status('Dimensions changed. Review and push explicitly.')
                else:
                    push(automatic=True)
            elif not changes and not waypoint_changes and time.monotonic() - _STATE['last_poll'] > 3:
                _STATE['last_poll'] = time.monotonic(); request('GET')
    except Exception as error:
        bpy.context.window_manager.swell_auto_sync = False
        status(str(error))
    return 0.2


class SWELL_OT_connect(bpy.types.Operator):
    bl_idname = 'swell.connect_equipment'; bl_label = 'Paste connection'
    def execute(self, context):
        try:
            connect(json.loads(context.window_manager.clipboard))
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


def connect(connection):
    if not all(connection.get(k) for k in ('appUrl', 'setupId', 'token')):
        raise ValueError('Copy a connection from the website first')
    stop_worker(); _STATE.update(connection=connection, incoming=None, retry=None)
    bpy.context.window_manager.swell_auto_sync = False
    settings().setup_id = connection['setupId']; settings().app_url = connection['appUrl']
    status('Connected. Pull from website to begin.')


class SWELL_OT_pull_items(bpy.types.Operator):
    bl_idname = 'swell.pull_items'; bl_label = 'Pull from website'
    def execute(self, context):
        try:
            request('GET'); return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_push_items(bpy.types.Operator):
    bl_idname = 'swell.push_items'; bl_label = 'Review & push changes'
    definition: BoolProperty(name='Correct selected gear definition', default=False)
    measurement_kind: EnumProperty(name='Dimension source', items=[('modeled-estimate','Modeled estimate','Size inferred from the model'),('measured','Measured','Verified physical measurements')], default='modeled-estimate')
    def invoke(self, context, event):
        try:
            self.changes = local_changes(definition=self.definition)
            return context.window_manager.invoke_props_dialog(self, width=620)
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}
    def draw(self, context):
        self.layout.prop(self, 'definition')
        self.layout.prop(self, 'measurement_kind')
        self.layout.label(text='Other instances keep their existing dimensions.')
        try:
            changes = local_changes(definition=self.definition)
        except ValueError as error:
            self.layout.label(text=str(error)); return
        for change in local_waypoint_changes():
            self.layout.label(text='Waypoint ' + change['waypointId'] + ': ' + ', '.join(k for k in change if k != 'waypointId'))
        for change in changes:
            root = next((o for o in roots() if o['swell_node_id'] == change['nodeId']), None)
            self.layout.label(text=(root.name if root else change['nodeId']) + ': ' + ', '.join(k for k in change if k != 'nodeId'))
            if 'dimensions' in change:
                old = next(i for i in baseline()['items'] if i['nodeId'] == change['nodeId'])['dimensions']
                new = change['dimensions']['values']
                if change['dimensions']['scope'] == 'definition':
                    definition = next(i for i in baseline()['items'] if i['nodeId'] == change['nodeId'])
                    self.layout.label(text='Gear definition: ' + definition['templateId'] + ' · v' + str(definition['currentDefinitionVersion']))
                    catalog = definition.get('currentDefinitionDimensions', {})
                    self.layout.label(text='Catalog old: ' + ' × '.join(str(round(catalog[k] / 0.0254, 2)) if k in catalog else '?' for k in ('widthMeters','depthMeters','heightMeters')) + ' in')
                self.layout.label(text='Old: ' + ' × '.join(str(round(old.get(k, 0) / 0.0254, 2)) for k in ('widthMeters', 'depthMeters', 'heightMeters')) + ' in')
                self.layout.label(text='New: ' + ' × '.join(str(round(new[k] / 0.0254, 2)) for k in ('widthMeters', 'depthMeters', 'heightMeters')) + ' in')
    def execute(self, context):
        try:
            push(self.definition, measurement_kind=self.measurement_kind); return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_retry_items(bpy.types.Operator):
    bl_idname = 'swell.retry_items'; bl_label = 'Retry last push'
    def execute(self, context):
        try:
            if not _STATE['retry']:
                raise ValueError('No pending push to retry')
            request('PATCH', _STATE['retry'], 'push'); return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_resolve_items(bpy.types.Operator):
    bl_idname = 'swell.resolve_items'; bl_label = 'Resolve sync changes'; bl_options = {'REGISTER', 'UNDO'}
    keep_local: BoolProperty(default=False)
    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)
    def execute(self, context):
        try:
            snap = _STATE['incoming']
            if not snap:
                raise ValueError('Pull the latest website version first')
            changes = local_changes() if self.keep_local else []
            waypoint_changes = local_waypoint_changes() if self.keep_local else []
            # Keep a recoverable local snapshot of object transforms and measurements.
            context.scene['swell_before_resolution'] = json.dumps([{'nodeId': o['swell_node_id'], 'matrix': [list(r) for r in o.matrix_world], 'dimensions': measure(o)} for o in roots()])
            context.scene['swell_waypoints_before_resolution'] = json.dumps(local_waypoint_changes())
            apply_snapshot(snap, {c['nodeId']: c for c in changes}, waypoint_changes)
            _STATE['incoming'] = None; _STATE['retry'] = None
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_size_item(bpy.types.Operator):
    bl_idname = 'swell.size_item'; bl_label = 'Edit item dimensions'; bl_options = {'REGISTER', 'UNDO'}
    dimensions: FloatVectorProperty(name='Width / Depth / Height (inches)', size=3, min=0.01, default=(12, 12, 12))
    fit_footprint: BoolProperty(name='Use physical size for stage footprint', default=True)
    def invoke(self, context, event):
        root = root_for_active()
        if not root:
            self.report({'ERROR'}, 'Select a linked item'); return {'CANCELLED'}
        d = measure(root); self.dimensions = tuple(d[k] / 0.0254 for k in ('widthMeters', 'depthMeters', 'heightMeters'))
        self.fit_footprint = root.get('swell_fit_footprint', True)
        return context.window_manager.invoke_props_dialog(self)
    def execute(self, context):
        root = root_for_active()
        if not root:
            return {'CANCELLED'}
        d = measure(root)
        root.scale = tuple(root.scale[i] * self.dimensions[i] * 0.0254 / d[k] for i, k in enumerate(('widthMeters', 'depthMeters', 'heightMeters')))
        root['swell_fit_footprint'] = self.fit_footprint
        context.view_layer.update(); return {'FINISHED'}


class SWELL_OT_unlink_item(bpy.types.Operator):
    bl_idname = 'swell.unlink_item'; bl_label = 'Unlink selected duplicate'; bl_options = {'REGISTER', 'UNDO'}
    def execute(self, context):
        root = root_for_active()
        if root:
            del root['swell_node_id']; root['swell_unlinked'] = True
        return {'FINISHED'}


class SWELL_OT_attach_items(bpy.types.Operator):
    bl_idname = 'swell.attach_items'; bl_label = 'Attach selected to active'; bl_options = {'REGISTER', 'UNDO'}
    detach: BoolProperty(default=False)
    def execute(self, context):
        try:
            parent = root_for_active()
            selected = [o for o in context.selected_objects if o.get('swell_node_id') and o.get('swell_setup_id') == settings().setup_id]
            if not parent or (not self.detach and len(selected) < 2):
                raise ValueError('Select the child, then Shift-select the parent last')
            for child in selected:
                if self.detach or child != parent:
                    set_attachment(child, None if self.detach else parent, child.users_collection[0])
            status('Attachment updated locally. Review and push changes.')
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_recalibrate(bpy.types.Operator):
    bl_idname = 'swell.recalibrate_items'; bl_label = 'Recalibrate stage'; bl_options = {'REGISTER', 'UNDO'}
    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)
    def execute(self, context):
        old = context.scene.get('swell_frame')
        try:
            if old: del context.scene['swell_frame']
            frame(baseline())
            status('Stage recalibrated. Review changed positions before pushing.')
            return {'FINISHED'}
        except Exception as error:
            if old: context.scene['swell_frame'] = old
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class SWELL_OT_disconnect(bpy.types.Operator):
    bl_idname = 'swell.disconnect_items'; bl_label = 'Disconnect'
    def execute(self, context):
        stop_worker(); _STATE['connection'] = None; context.window_manager.swell_auto_sync = False
        status('Disconnected. Scene and pending edits retained.'); return {'FINISHED'}


class SWELL_PT_items(bpy.types.Panel):
    bl_label = 'Equipment sync'; bl_idname = 'SWELL_PT_items'; bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Swell'
    def draw(self, context):
        layout = self.layout
        layout.operator('swell.connect_equipment')
        row = layout.row(); row.enabled = not bool(_STATE['pending'])
        row.operator('swell.pull_items'); row.operator('swell.push_items')
        layout.prop(context.window_manager, 'swell_auto_sync', text='Auto Sync')
        for line in [context.window_manager.swell_status[i:i+70] for i in range(0, len(context.window_manager.swell_status), 70)]:
            layout.label(text=line)
        if _STATE['incoming']:
            layout.operator('swell.resolve_items', text='Keep local changes').keep_local = True
            layout.operator('swell.resolve_items', text='Restore website items').keep_local = False
        if _STATE['retry']:
            layout.operator('swell.retry_items')
        root = root_for_active()
        if root:
            layout.separator(); layout.label(text=root.name)
            item = json.loads(root.get('swell_item', '{}'))
            if len(item.get('dimensions', {})) < 3:
                layout.label(text='Missing dimensions: proxy uses estimates', icon='INFO')
            elif 'estimat' in item.get('dimensionsSourceText', '').lower():
                layout.label(text='Planning dimensions: verify before catalog correction', icon='INFO')
            if item.get('currentDefinitionVersion') is None:
                layout.label(text='Placement only: no saved gear definition')
            elif item.get('templateVersion') != item.get('currentDefinitionVersion'):
                layout.label(text='Gear definition has a newer version', icon='INFO')
            layout.operator('swell.size_item')
            layout.operator('swell.attach_items')
            layout.operator('swell.attach_items', text='Detach selected').detach = True
            layout.operator('swell.unlink_item')
        layout.operator('swell.recalibrate_items')
        layout.operator('swell.disconnect_items')


@persistent
def on_load(_):
    stop_worker(); _STATE.update(connection=None, incoming=None, retry=None)

_CLASSES = (SWELL_OT_connect, SWELL_OT_pull_items, SWELL_OT_push_items, SWELL_OT_retry_items, SWELL_OT_resolve_items, SWELL_OT_size_item, SWELL_OT_unlink_item, SWELL_OT_attach_items, SWELL_OT_recalibrate, SWELL_OT_disconnect, SWELL_PT_items)

def register():
    from . import cables
    cables.register()
    for cls in _CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.swell_status = StringProperty(default='Connect from the website to begin', options={'SKIP_SAVE'})
    bpy.types.WindowManager.swell_auto_sync = BoolProperty(default=False, options={'SKIP_SAVE'})
    bpy.app.handlers.load_pre.append(on_load)
    bpy.app.timers.register(tick, persistent=True)


def unregister():
    from . import cables
    cables.unregister()
    stop_worker()
    if bpy.app.timers.is_registered(tick): bpy.app.timers.unregister(tick)
    if on_load in bpy.app.handlers.load_pre: bpy.app.handlers.load_pre.remove(on_load)
    for cls in reversed(_CLASSES): bpy.utils.unregister_class(cls)
    del bpy.types.WindowManager.swell_status; del bpy.types.WindowManager.swell_auto_sync
