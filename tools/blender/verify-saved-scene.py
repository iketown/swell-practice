import bpy,json
scene=bpy.data.scenes['Scene'];bpy.context.window.scene=scene
bpy.context.view_layer.update()
snap=json.loads(scene['swell_snapshot']);items=[o for o in scene.objects if o.get('swell_node_id')]
assert len(items)==28 and len({o['swell_node_id'] for o in items})==28
people=[o for o in items if 'performer' in o['swell_node_id']]
assert len(people)==5 and all(abs(o.dimensions.z*scene.unit_settings.scale_length-1.8288)<1e-5 for o in people)
assert all(o.parent and o.parent.get('swell_attachment_parent') for o in items if 'vocal-mic' in o['swell_node_id'])
assert all('token' not in k.lower() for k in scene.keys())
print(json.dumps({'saved_revision':snap['revision'],'linked_items':len(items),'six_foot_people':len(people),'microphone_attachments':5,'persistent_calibration':bool(scene.get('swell_frame'))}))
