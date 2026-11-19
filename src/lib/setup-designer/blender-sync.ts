import { BlenderSnapshotSchema, type BlenderPatch } from "@/lib/setup-designer/blender-contract";
import { METERS_PER_FOOT as FT, METERS_PER_INCH as IN, poseToStagePosition, stagePositionToPose } from "@/lib/setup-designer/blender-coordinates";
import type { EquipmentPhysicalDimensions, SetupGraph } from "@/lib/setup-designer/domain";
import { stagePositionForNode, stageRouteFor, withMeasuredStageCableLengths } from "@/lib/setup-designer/stage-plot";

import { reconcileStageAttachments } from "@/lib/setup-designer/stage-attachments";

export class BlenderSyncError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export type DefinitionState = { version: number; physicalDimensions?: EquipmentPhysicalDimensions; status?: string };
export type DefinitionMap = Record<string, DefinitionState>;

function dimensionsInMeters(d?: EquipmentPhysicalDimensions) {
  return {
    ...(d?.widthInches && d.widthInches > 0 ? { widthMeters: d.widthInches * IN } : {}),
    ...(d?.depthInches && d.depthInches > 0 ? { depthMeters: d.depthInches * IN } : {}),
    ...(d?.heightInches && d.heightInches > 0 ? { heightMeters: d.heightInches * IN } : {}),
  };
}

export function blenderSnapshot(setupId: string, graph: SetupGraph, definitions: DefinitionMap) {
  return BlenderSnapshotSchema.parse({
    schemaVersion: 1, setupId, revision: graph.revision,
    stage: { widthMeters: graph.stage.widthFeet * FT, depthMeters: graph.stage.depthFeet * FT,
      ...(graph.stage.outline ? { outlineMeters: graph.stage.outline.map((p) => ({ xMeters: p.xFeet * FT, yMeters: p.yFeet * FT })) } : {}),
    },
    waypoints: graph.stage.waypoints.map(w => ({ id: w.id, label: w.label, xMeters: w.position.xFeet * FT, yMeters: w.position.yFeet * FT })),
    cables: graph.edges.flatMap((edge) => {
      const source = graph.nodes.find(n => n.id === edge.source), target = graph.nodes.find(n => n.id === edge.target);
      if (!source || !target) return [];
      const endpoint = (node: typeof source, portId: string, direction: "input" | "output") => {
        const position = stagePositionForNode(node, graph.stage);
        const anchor = direction === "input" ? position.inputAnchor : position.outputAnchor;
        const port = node.data.ports.find(p => p.id === portId);
        const ports = node.data.ports.filter(p => p.direction === (port?.direction ?? direction));
        return { nodeId: node.id, portId, label: port?.label ?? portId,
          connector: port ? `${port.connector.label} ${port.connector.gender}` : "Assembly trunk",
          side: anchor.side, offset: anchor.offset, portIndex: Math.max(0, ports.findIndex(p => p.id === portId)), portCount: Math.max(1, ports.length) };
      };
      const route = stageRouteFor(edge);
      return [{ edgeId: edge.id, source: endpoint(source, edge.sourceHandle, "output"), target: endpoint(target, edge.targetHandle, "input"),
        color: edge.data.color, signalType: edge.data.signalType ?? "unknown", channelCapacity: edge.data.channelCapacity ?? 1,
        isTrunk: !!edge.data.internalTransport,
        assemblyIds: [...new Set([...(edge.data.cableAssemblyLegs ?? (edge.data.cableAssemblyLeg ? [edge.data.cableAssemblyLeg] : [])).map(l => l.nodeId), ...(edge.data.internalTransport ? [edge.data.internalTransport.assemblyId] : [])])],
        waypoints: route.waypointIds.flatMap(id => { const w = graph.stage.waypoints.find(w => w.id === id); return w ? [{ id, label: w.label, xMeters: w.position.xFeet * FT, yMeters: w.position.yFeet * FT }] : []; }),
        sourceDropMeters: route.sourceDropFeet * FT, targetDropMeters: route.targetDropFeet * FT, slackMeters: route.serviceSlackFeet * FT,
        websiteLengthMeters: edge.data.estimatedLength === undefined ? undefined : edge.data.estimatedLength * (edge.data.lengthUnit === "m" ? 1 : FT),
      }];
    }),
    items: graph.nodes.map((node) => {
      const p = stagePositionForNode(node, graph.stage);
      const d = (node.data.transportEndpointId || node.data.cableAssembly) && !node.data.stage3d?.dimensionOverride ? undefined : node.data.physicalDimensions;
      return {
        nodeId: node.id, name: node.data.name, modelHint: `${node.data.category} ${node.data.templateId ?? ""}`,
        kind: node.data.transportEndpointId ? "transport-endpoint" : node.data.cableAssembly ? "cable" : node.data.category === "performer" ? "performer" : "equipment",
        templateId: node.data.templateId, templateVersion: node.data.templateVersion,
        currentDefinitionVersion: node.data.templateId ? definitions[node.data.templateId]?.version : undefined,
        currentDefinitionDimensions: node.data.templateId && definitions[node.data.templateId] ? dimensionsInMeters(definitions[node.data.templateId].physicalDimensions) : undefined,
        assignedAssetId: node.data.assignedAssetId, assemblyId: node.data.assemblyId, transportEndpointId: node.data.transportEndpointId,
        pose: stagePositionToPose(p, node.data.stage3d),
        attachment: node.data.stage3d?.attachment,
        footprint: { widthMeters: p.widthFeet * FT, depthMeters: p.depthFeet * FT, mode: node.data.stage3d?.footprintMode ?? "custom" },
        dimensionsSourceText: d?.sourceText || undefined,
        dimensions: dimensionsInMeters(d),
      };
    }),
  });
}

export function applyBlenderChanges(graph: SetupGraph, patch: BlenderPatch, definitions: DefinitionMap, allowDefinitions: boolean) {
  if (graph.revision !== patch.baseRevision) throw new BlenderSyncError("stale_revision", "The setup changed. Pull and review before retrying.");
  const result = structuredClone(graph);
  const corrections: Array<{ nodeId: string; scope: string; templateId: string | null; version: number | null; measurementKind: string; before: EquipmentPhysicalDimensions; after: EquipmentPhysicalDimensions }> = [];
  for (const change of patch.changes) {
    const node = result.nodes.find((item) => item.id === change.nodeId);
    if (!node) throw new BlenderSyncError("missing_node", "A placement was removed. Pull the latest setup.", 404);
    const previous = stagePositionForNode(node, result.stage);
    const pose = { ...stagePositionToPose(previous, node.data.stage3d), ...change.pose };
    const mode = change.footprint?.mode ?? node.data.stage3d?.footprintMode ?? "custom";
    if (change.dimensions) {
      const correction = change.dimensions;
      let definition: DefinitionState | undefined;
      if (correction.scope === "definition") {
        if (!allowDefinitions) throw new BlenderSyncError("permission", "This connection cannot correct gear definitions.", 403);
        if (node.data.templateId !== correction.templateId || node.data.transportEndpointId || node.data.cableAssembly) throw new BlenderSyncError("mapping", "This proxy cannot correct that gear definition.");
        definition = definitions[correction.templateId];
        if (!definition || definition.status === "archived" || definition.version !== correction.expectedDefinitionVersion) throw new BlenderSyncError("stale_definition", "The gear definition changed. Pull and review its dimensions.");
      }
      const before = node.data.physicalDimensions ?? {};
      const after = { ...before, widthInches: correction.values.widthMeters / IN, depthInches: correction.values.depthMeters / IN, heightInches: correction.values.heightMeters / IN };
      node.data.physicalDimensions = after;
      corrections.push({ nodeId: node.id, scope: correction.scope, templateId: correction.scope === "definition" ? correction.templateId : null,
        version: definition ? definition.version + 1 : null, measurementKind: correction.measurementKind, before, after });
    }
    let footprint = change.footprint ?? { widthMeters: previous.widthFeet * FT, depthMeters: previous.depthFeet * FT };
    if (mode === "physical") {
      const d = node.data.physicalDimensions;
      if (!d?.widthInches || !d?.depthInches || !d?.heightInches) throw new BlenderSyncError("missing_dimensions", "Complete physical dimensions before using a physical footprint.", 400);
      // Unheaded orthographic bounds of the canonical box: Ry(pitch) * Rx(roll).
      const pitch = pose.pitchDegrees * Math.PI / 180, roll = pose.rollDegrees * Math.PI / 180;
      footprint = {
        widthMeters: (Math.abs(Math.cos(pitch)) * d.widthInches + Math.abs(Math.sin(pitch) * Math.sin(roll)) * d.depthInches + Math.abs(Math.sin(pitch) * Math.cos(roll)) * d.heightInches) * IN,
        depthMeters: (Math.abs(Math.cos(roll)) * d.depthInches + Math.abs(Math.sin(roll)) * d.heightInches) * IN,
      };
    }
    node.stagePosition = poseToStagePosition(pose, previous, footprint);
    node.data.stage3d = { ...node.data.stage3d, schemaVersion: 1, elevationFeet: pose.elevationMeters / FT, pitchDegrees: pose.pitchDegrees, rollDegrees: pose.rollDegrees, footprintMode: mode, ...(change.dimensions ? { dimensionOverride: true as const } : {}) };
  }
  for (const change of patch.changes) {
    if (change.attachment !== undefined) {
      const node = result.nodes.find((n) => n.id === change.nodeId)!;
      if (change.attachment === null) delete node.data.stage3d!.attachment;
      else {
        if (!result.nodes.some((n) => n.id === change.attachment!.parentNodeId)) throw new BlenderSyncError("missing_parent", "Attachment parent is missing.", 400);
        node.data.stage3d!.attachment = change.attachment;
      }
    }
  }
  try { result.nodes = reconcileStageAttachments(graph.nodes, result.nodes, result.stage); }
  catch (error) { throw new BlenderSyncError("invalid_attachment", error instanceof Error ? error.message : "Invalid attachment", 400); }
  for (const change of patch.waypointChanges ?? []) {
    const waypoint = result.stage.waypoints.find(w => w.id === change.waypointId);
    if (!waypoint) throw new BlenderSyncError("missing_waypoint", "A waypoint was removed. Pull the latest setup.", 404);
    if (change.xMeters !== undefined) waypoint.position.xFeet = change.xMeters / FT;
    if (change.yMeters !== undefined) waypoint.position.yFeet = change.yMeters / FT;
  }
  result.revision++;
  result.edges = withMeasuredStageCableLengths(result.nodes, result.edges, result.stage);
  return { graph: result, corrections };
}
