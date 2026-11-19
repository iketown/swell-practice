import assert from "node:assert/strict";
import test from "node:test";
import { BlenderPatchSchema, BlenderSnapshotSchema } from "@/lib/setup-designer/blender-contract";
import { stagePositionToPose, poseToStagePosition, poseToBlenderTransform, blenderTransformToPose } from "@/lib/setup-designer/blender-coordinates";
import { normalizeSetupGraph, setupGraphFromData } from "@/lib/setup-designer/serialization";
import { SAMPLE_SETUP_WORKSPACE } from "@/lib/setup-designer/sample-data";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const frame = {
  schemaVersion: 1, setupId: "QWSok55nO20JC3B8WL0x", stageObjectName: "stage",
  originWorldMeters: { x: -3.9624, y: 3.6576, z: 0 }, frameYawDegrees: 0, metersPerBlenderUnit: 1,
};
const position = { xFeet: 2, yFeet: 3, widthFeet: 2, depthFeet: 1, rotationDegrees: 0, inputAnchor: { side: "left", offset: 0.25 } };
const mutation = (changes) => ({
  schemaVersion: 1, setupId: frame.setupId, baseRevision: 4,
  mutationId: "7a3bb9dc-2557-4f14-a7f4-106ca85d2c02", clientId: "433911d6-0d87-4a1b-a4a0-9eefb1808064", changes,
});

test("asymmetric fixture maps to measured playroom frame without mirroring", () => {
  const result = poseToBlenderTransform(stagePositionToPose(position), frame);
  close(result.location.x, -3.048);
  close(result.location.y, 2.5908);
  close(result.location.z, 0);
  const clockwise = poseToBlenderTransform(stagePositionToPose({ ...position, rotationDegrees: 90 }), frame);
  close(clockwise.rotationXYZ.z, -Math.PI / 2);
  assert.deepEqual(clockwise.location, result.location);
});

test("round trips arbitrary heading, elevation, tilt, rotated frame and scene units", () => {
  for (const heading of [0, 90, 37, 359.9]) {
    for (const scale of [1, 0.01]) {
      const calibration = { ...frame, metersPerBlenderUnit: scale, frameYawDegrees: 24, originWorldMeters: { x: -8, y: 5, z: 2 } };
      const pose = stagePositionToPose({ ...position, rotationDegrees: heading }, {
        schemaVersion: 1, elevationFeet: 4.3, pitchDegrees: 23, rollDegrees: -12, footprintMode: "custom",
      });
      const restored = blenderTransformToPose(poseToBlenderTransform(pose, calibration), calibration);
      for (const key of Object.keys(pose)) close(restored[key], pose[key]);
    }
  }
});

test("resizing footprint preserves center and cable anchor, not the top-left corner", () => {
  const pose = stagePositionToPose(position);
  const resized = poseToStagePosition(pose, position, { widthMeters: 0.9144, depthMeters: 0.4572 });
  close(resized.xFeet, 1.5);
  close(resized.yFeet, 2.75);
  close(resized.widthFeet, 3);
  close(resized.depthFeet, 1.5);
  assert.deepEqual(resized.inputAnchor, position.inputAnchor);
  const restored = stagePositionToPose(resized);
  close(restored.centerXMeters, pose.centerXMeters);
  close(restored.centerYMeters, pose.centerYMeters);
});

test("contract does not snap or clamp off-stage placements", () => {
  const source = { ...position, xFeet: -0.0173, yFeet: 12.0427 };
  const restored = poseToStagePosition(stagePositionToPose(source), source, { widthMeters: 0.6096, depthMeters: 0.3048 });
  close(restored.xFeet, source.xFeet);
  close(restored.yFeet, source.yFeet);
});

test("pose-only edits never contain inferred dimension changes", () => {
  const request = mutation([{ nodeId: "one", pose: { headingDegrees: 90 } }]);
  assert.deepEqual(BlenderPatchSchema.parse(request), request);
  assert.equal("dimensions" in BlenderPatchSchema.parse(request).changes[0], false);
});

test("dimension corrections require full positive measurements and explicit scope", () => {
  const values = { widthMeters: 0.2, depthMeters: 0.1, heightMeters: 0.05 };
  const correction = { scope: "placement", values, measurementKind: "measured" };
  assert.equal(BlenderPatchSchema.safeParse(mutation([{ nodeId: "one", dimensions: correction }])).success, true);
  const definition = { ...correction, scope: "definition", templateId: "di", expectedDefinitionVersion: 3 };
  assert.equal(BlenderPatchSchema.safeParse(mutation([{ nodeId: "one", dimensions: definition }])).success, true);
  for (const invalid of [
    { ...definition, expectedDefinitionVersion: undefined },
    { ...correction, scope: undefined },
    { ...correction, values: { ...values, heightMeters: 0 } },
    { ...correction, values: { ...values, widthMeters: NaN } },
    { ...correction, values: { ...values, depthMeters: Infinity } },
    { ...correction, values: { ...values, heightMeters: undefined } },
  ]) assert.equal(BlenderPatchSchema.safeParse(mutation([{ nodeId: "one", dimensions: invalid }])).success, false);
});

test("reject ambiguous, empty or overbroad writes", () => {
  const change = { nodeId: "one", pose: { centerXMeters: 1 } };
  for (const invalid of [
    mutation([]), mutation([{ nodeId: "one" }]), mutation([{ nodeId: "one", pose: {} }]),
    mutation([change, change]), mutation([{ ...change, ports: [] }]),
    { ...mutation([change]), baseRevision: -1 }, { ...mutation([change]), schemaVersion: 2 },
  ]) assert.equal(BlenderPatchSchema.safeParse(invalid).success, false);
  const dimensions = { scope: "definition", templateId: "shared", expectedDefinitionVersion: 3, measurementKind: "measured", values: { widthMeters: 1, depthMeters: 1, heightMeters: 1 } };
  assert.equal(BlenderPatchSchema.safeParse(mutation([{ nodeId: "one", dimensions }, { nodeId: "two", dimensions }])).success, false);
});

test("snapshot permits unknown heights and distinct instances of one definition", () => {
  const item = { nodeId: "one", templateId: "di", name: "DI", kind: "equipment", pose: stagePositionToPose(position), footprint: { widthMeters: 0.6096, depthMeters: 0.3048, mode: "custom" }, dimensions: { widthMeters: 0.2 } };
  const snapshot = { schemaVersion: 1, setupId: frame.setupId, revision: 1, stage: { widthMeters: 7.9248, depthMeters: 3.6576 }, items: [item, { ...item, nodeId: "two" }] };
  assert.equal(BlenderSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(BlenderSnapshotSchema.safeParse({ ...snapshot, items: [item, item] }).success, false);
});

test("legacy setups round trip without injecting 3D fields or changing topology", () => {
  const before = normalizeSetupGraph(SAMPLE_SETUP_WORKSPACE.graph);
  const after = setupGraphFromData(JSON.parse(JSON.stringify(before)));
  assert.deepEqual(after, before);
  assert.equal(after.nodes.some((node) => node.data.stage3d !== undefined), false);
});

test("3D-only state and size snapshot survive ordinary 2D save", () => {
  const graph = structuredClone(SAMPLE_SETUP_WORKSPACE.graph);
  const node = graph.nodes[0];
  node.data.stage3d = { schemaVersion: 1, elevationFeet: 4.2, pitchDegrees: 10, rollDegrees: -5, footprintMode: "custom" };
  node.data.physicalDimensions = { widthInches: 4, depthInches: 2, heightInches: 1, sourceText: "Measured" };
  node.stagePosition = position;
  const before = normalizeSetupGraph(graph);
  before.nodes[0].stagePosition.xFeet = 8.17;
  const saved = setupGraphFromData(JSON.parse(JSON.stringify(normalizeSetupGraph(before))));
  assert.deepEqual(saved.nodes[0].data.stage3d, node.data.stage3d);
  assert.deepEqual(saved.nodes[0].data.physicalDimensions, node.data.physicalDimensions);
  assert.deepEqual(saved.edges, before.edges);
  assert.deepEqual(saved.nodes[0].position, node.position);
  assert.deepEqual(saved.nodes[0].data.ports, before.nodes[0].data.ports);
});

test("invalid optional 3D data does not prevent a legacy graph loading", () => {
  const graph = structuredClone(SAMPLE_SETUP_WORKSPACE.graph);
  graph.nodes[0].data.stage3d = { schemaVersion: 1, elevationFeet: "bad" };
  const saved = setupGraphFromData(graph);
  assert.equal(saved.nodes[0].data.stage3d, undefined);
  assert.equal(saved.nodes.length, graph.nodes.length);
});

const { applyBlenderChanges, blenderSnapshot } = await import('@/lib/setup-designer/blender-sync');
const { mergeSetupGraphs } = await import('@/lib/setup-designer/merge-setup');
const { stagePositionForNode } = await import('@/lib/setup-designer/stage-plot');
function spatialFixture() {
  const graph = normalizeSetupGraph(structuredClone(SAMPLE_SETUP_WORKSPACE.graph));
  graph.revision = 4;
  graph.nodes[0].stagePosition = position;
  graph.nodes[0].data.physicalDimensions = { widthInches: 24, depthInches: 12, heightInches: 6 };
  graph.nodes[0].data.stage3d = { schemaVersion: 1, elevationFeet: 0, pitchDegrees: 0, rollDegrees: 0, footprintMode: 'physical' };
  return graph;
}
test('placement correction preserves center, unrelated gear, ports and logical positions', () => {
  const graph = spatialFixture(), original = structuredClone(graph), id = graph.nodes[0].id;
  const result = applyBlenderChanges(graph, mutation([{ nodeId: id, dimensions: { scope: 'placement', values: { widthMeters: 0.9144, depthMeters: 0.4572, heightMeters: 0.2 }, measurementKind: 'measured' } }]), {}, false);
  assert.deepEqual(graph, original);
  close(result.graph.nodes[0].stagePosition.xFeet, 1.5);
  close(result.graph.nodes[0].stagePosition.yFeet, 2.75);
  close(result.graph.nodes[0].data.physicalDimensions.widthInches, 36);
  assert.deepEqual(result.graph.nodes.slice(1), graph.nodes.slice(1));
  assert.deepEqual(result.graph.nodes[0].data.ports, graph.nodes[0].data.ports);
  assert.deepEqual(result.graph.nodes[0].position, graph.nodes[0].position);
});
test('definition correction checks permission, mapping and current definition version', () => {
  const graph = spatialFixture(), node = graph.nodes[0];
  const dimensions = { scope: 'definition', templateId: node.data.templateId, expectedDefinitionVersion: 2, measurementKind: 'measured', values: { widthMeters: 0.3, depthMeters: 0.2, heightMeters: 0.1 } };
  const patch = mutation([{ nodeId: node.id, dimensions }]);
  const definitions = { [node.data.templateId]: { version: 2 } };
  assert.throws(() => applyBlenderChanges(graph, patch, definitions, false), /cannot correct/);
  assert.throws(() => applyBlenderChanges(graph, patch, { [node.data.templateId]: { version: 3 } }, true), /definition changed/);
  const result = applyBlenderChanges(graph, patch, definitions, true);
  assert.equal(result.corrections[0].version, 3);
  assert.equal(result.graph.nodes[0].data.templateVersion, node.data.templateVersion);
  assert.throws(() => applyBlenderChanges({ ...graph, revision: 5 }, patch, definitions, true), /setup changed/);
});
test('small and off-stage gear survives renderer resolution', () => {
  const graph = spatialFixture();
  graph.nodes[0].stagePosition = { xFeet: -1.2, yFeet: 29.8, widthFeet: 0.02, depthFeet: 0.01 };
  const result = stagePositionForNode(graph.nodes[0], graph.stage);
  close(result.xFeet, -1.2); close(result.yFeet, 29.8); close(result.widthFeet, 0.02); close(result.depthFeet, 0.01);
});
test('rotation changes pose but not product dimensions or custom footprint', () => {
  const graph = spatialFixture(); graph.nodes[0].data.stage3d.footprintMode = 'custom';
  const result = applyBlenderChanges(graph, mutation([{ nodeId: graph.nodes[0].id, pose: { headingDegrees: 37, pitchDegrees: 35 } }]), {}, false);
  assert.deepEqual(result.graph.nodes[0].data.physicalDimensions, graph.nodes[0].data.physicalDimensions);
  assert.equal(result.graph.nodes[0].stagePosition.widthFeet, 2);
  assert.equal(result.corrections.length, 0);
  assert.equal(blenderSnapshot(frame.setupId, result.graph, {}).items[0].pose.headingDegrees, 37);
});
test('three-way merge combines independent edits and exposes same-field conflicts', () => {
  const base = spatialFixture(), local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].stagePosition.xFeet = 8;
  remote.nodes[1].data.name = 'Renamed elsewhere'; remote.revision++;
  const result = mergeSetupGraphs(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.graph.nodes[0].stagePosition.xFeet, 8);
  assert.equal(result.graph.nodes[1].data.name, 'Renamed elsewhere');
  remote.nodes[0].stagePosition.xFeet = 9;
  const conflict = mergeSetupGraphs(base, local, remote).conflicts[0];
  assert.equal(conflict.local, 8); assert.equal(conflict.remote, 9);
  const resolved = mergeSetupGraphs(base, local, remote, { [conflict.path]: 'local' });
  assert.equal(resolved.conflicts.length, 0); assert.equal(resolved.graph.nodes[0].stagePosition.xFeet, 8);
});
test('remote removal conflicts with local edits but not unchanged instances', () => {
  const base = spatialFixture(), local = structuredClone(base), remote = structuredClone(base);
  remote.nodes.shift();
  assert.equal(mergeSetupGraphs(base, local, remote).graph.nodes.length, base.nodes.length - 1);
  local.nodes[0].data.name = 'Local edit';
  const result = mergeSetupGraphs(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].remote, undefined);
});

const { attachmentFromPoses, attachedPose, reconcileStageAttachments } = await import('@/lib/setup-designer/stage-attachments');
test('attachment rotations round trip in right-handed stage axes', () => {
  const parent = { centerXMeters: 1, centerYMeters: 2, elevationMeters: 0.3, headingDegrees: 37, pitchDegrees: 12, rollDegrees: -6 };
  const child = { centerXMeters: 1.2, centerYMeters: 2.1, elevationMeters: 1.7, headingDegrees: 91, pitchDegrees: 24, rollDegrees: 8 };
  const link = attachmentFromPoses('parent', parent, child);
  const actual = attachedPose(parent, link);
  for (const key in child) close(actual[key], child[key]);
});
test('parent move carries microphone; explicit child move changes its offset; cycles reject', () => {
  const graph = spatialFixture();
  const parent = graph.nodes[0], child = graph.nodes[1];
  child.stagePosition = { ...position, xFeet: 3, yFeet: 3 };
  child.data.stage3d = { schemaVersion: 1, elevationFeet: 5, pitchDegrees: 0, rollDegrees: 0, footprintMode: 'custom' };
  const parentPose = stagePositionToPose(stagePositionForNode(parent, graph.stage), parent.data.stage3d);
  const childPose = stagePositionToPose(stagePositionForNode(child, graph.stage), child.data.stage3d);
  child.data.stage3d.attachment = attachmentFromPoses(parent.id, parentPose, childPose);
  const changed = applyBlenderChanges(graph, mutation([{nodeId: parent.id, pose: {centerXMeters: parentPose.centerXMeters + 0.3048}}]), {}, false).graph;
  close(changed.nodes[1].stagePosition.xFeet, 4);
  close(changed.nodes[1].data.stage3d.elevationFeet, 5);
  const edited = structuredClone(changed.nodes); edited[1].stagePosition.yFeet += 1;
  const reconciled = reconcileStageAttachments(changed.nodes, edited, graph.stage);
  close(reconciled[1].stagePosition.yFeet, edited[1].stagePosition.yFeet);
  assert.notDeepEqual(reconciled[1].data.stage3d.attachment, child.data.stage3d.attachment);
  assert.throws(() => applyBlenderChanges(graph, mutation([{nodeId: parent.id, attachment: attachmentFromPoses(child.id, childPose, parentPose)}]), {}, false), /cycle/);
  const detached = applyBlenderChanges(graph, mutation([{nodeId: child.id, attachment: null}]), {}, false).graph;
  assert.equal(detached.nodes[1].data.stage3d.attachment, undefined);
});

test('snake endpoints never inherit whole-assembly dimensions as measurements', () => {
  const graph=spatialFixture(),node=graph.nodes[0];node.data.transportEndpointId='end-a';node.data.assemblyId='assembly';
  assert.deepEqual(blenderSnapshot(frame.setupId,graph,{}).items[0].dimensions,{});
  const updated=applyBlenderChanges(graph,mutation([{nodeId:node.id,dimensions:{scope:'placement',measurementKind:'measured',values:{widthMeters:.3,depthMeters:.2,heightMeters:.1}}}]),{},false).graph;
  close(blenderSnapshot(frame.setupId,updated,{}).items[0].dimensions.widthMeters,.3);
  assert.equal(updated.nodes[0].data.assemblyId,'assembly');
});
test('merge resolution carries an attached child with the chosen parent position', () => {
  const base=spatialFixture(),parent=base.nodes[0],child=base.nodes[1];
  child.stagePosition={...position,xFeet:4};child.data.stage3d={schemaVersion:1,elevationFeet:5,pitchDegrees:0,rollDegrees:0,footprintMode:'custom'};
  child.data.stage3d.attachment=attachmentFromPoses(parent.id,stagePositionToPose(stagePositionForNode(parent,base.stage),parent.data.stage3d),stagePositionToPose(stagePositionForNode(child,base.stage),child.data.stage3d));
  const local=structuredClone(base);local.nodes[0].stagePosition.xFeet+=1;local.nodes=reconcileStageAttachments(base.nodes,local.nodes,base.stage);
  const remote=structuredClone(base);remote.nodes[0].stagePosition.xFeet+=2;remote.nodes=reconcileStageAttachments(base.nodes,remote.nodes,base.stage);remote.revision++;
  const pending=mergeSetupGraphs(base,local,remote);
  const choices=Object.fromEntries(pending.conflicts.map(c=>[c.path,'local']));
  const resolved=mergeSetupGraphs(base,local,remote,choices);
  close(resolved.graph.nodes[0].stagePosition.xFeet,parent.stagePosition.xFeet+1);
  close(resolved.graph.nodes[1].stagePosition.xFeet,child.stagePosition.xFeet+1);
});

test('cable snapshot preserves ports, routing units and assembly membership without changing graph', () => {
  const graph = structuredClone(SAMPLE_SETUP_WORKSPACE.graph);
  const edge = graph.edges[0];
  graph.stage.waypoints = [{id:'waypoint-test',label:'Route turn',position:{xFeet:3,yFeet:5}}];
  edge.data.stageRoute={waypointIds:['waypoint-test'],sourceDropFeet:2,targetDropFeet:1,serviceSlackFeet:3};
  edge.data.cableAssemblyLegs=[{nodeId:'assembly-test',portId:'leg-one',primary:true}];
  const before=JSON.stringify(graph);
  const snapshot=blenderSnapshot('setup-test',graph,{});
  assert.equal(JSON.stringify(graph),before);
  assert.equal(snapshot.cables.length,graph.edges.length);
  const wire=snapshot.cables.find(c=>c.edgeId===edge.id);
  assert.equal(wire.source.nodeId,edge.source);
  assert.equal(wire.source.portId,edge.sourceHandle);
  assert.equal(wire.target.portId,edge.targetHandle);
  assert.deepEqual(wire.assemblyIds,['assembly-test']);
  close(wire.waypoints[0].xMeters,3*.3048);
  close(wire.waypoints[0].yMeters,5*.3048);
  close(wire.sourceDropMeters,2*.3048);
  close(wire.slackMeters,3*.3048);
  assert.ok(wire.source.portCount>=1);
  assert.equal(BlenderSnapshotSchema.safeParse({...snapshot,cables:[{...wire,slackMeters:-1}]}).success,false);
});

test('waypoint-only patches move shared and unused points without changing cable membership', () => {
  const graph = spatialFixture();
  graph.stage.waypoints = [
    {id:'shared',label:'Shared',position:{xFeet:2,yFeet:3}},
    {id:'unused',label:'Unused',position:{xFeet:5,yFeet:6}},
  ];
  for (const edge of graph.edges.slice(0,2)) edge.data.stageRoute={waypointIds:['shared'],sourceDropFeet:0,targetDropFeet:0,serviceSlackFeet:2};
  const patch = BlenderPatchSchema.parse({...mutation([]),waypointChanges:[{waypointId:'shared',xMeters:1.524},{waypointId:'unused',yMeters:2.1336}]});
  const changed=applyBlenderChanges(graph,patch,{},false).graph;
  close(changed.stage.waypoints[0].position.xFeet,5);
  close(changed.stage.waypoints[0].position.yFeet,3);
  close(changed.stage.waypoints[1].position.yFeet,7);
  assert.equal(changed.revision,5);
  assert.deepEqual(changed.nodes,graph.nodes);
  assert.deepEqual(changed.edges.map(e=>e.data.stageRoute),graph.edges.map(e=>e.data.stageRoute));
  const snap=blenderSnapshot(frame.setupId,changed,{});
  assert.equal(snap.waypoints.length,2);
  close(snap.cables[0].waypoints[0].xMeters,1.524);
  close(snap.cables[1].waypoints[0].xMeters,1.524);
  assert.throws(()=>applyBlenderChanges({...graph,revision:5},patch,{},false),/setup changed/);
  assert.throws(()=>applyBlenderChanges(graph,{...patch,waypointChanges:[{waypointId:'deleted',xMeters:1}]},{},false),/waypoint was removed/);
});

test('waypoint patch validation rejects empty, duplicate, nonfinite and route membership writes',()=>{
  assert.equal(BlenderPatchSchema.safeParse(mutation([])).success,false);
  for(const waypointChanges of [[{waypointId:'w'}],[{waypointId:'w',xMeters:NaN}],[{waypointId:'w',xMeters:1},{waypointId:'w',yMeters:2}],[{waypointId:'w',xMeters:1,waypointIds:['x']}]]) {
    assert.equal(BlenderPatchSchema.safeParse({...mutation([]),waypointChanges}).success,false);
  }
});
