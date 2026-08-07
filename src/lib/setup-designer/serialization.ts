import type { Viewport } from "@xyflow/react";

import {
  emptySetupGraph,
  type CableEdge,
  type SetupGraph,
  type SetupNode,
  type StageArea,
  type StageConnectionAnchor,
  type StageConnectionSide,
  type StagePlan,
  type StagePosition,
  type StageRoute,
} from "@/lib/setup-designer/domain";
import { equipmentPortsFromData } from "@/lib/setup-designer/ports";
import { constrainStageArea } from "@/lib/setup-designer/stage-plot";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type SetupGraphInput = Pick<SetupGraph, "nodes" | "edges" | "viewport" | "revision"> & Partial<Pick<SetupGraph, "stage">>;

function finitePositive(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNonNegative(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeStageAnchor(value: unknown): StageConnectionAnchor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const sides: StageConnectionSide[] = ["top", "right", "bottom", "left"];
  if (!sides.includes(data.side as StageConnectionSide)) return undefined;
  const offset = Number(data.offset);
  return {
    side: data.side as StageConnectionSide,
    offset: Number.isFinite(offset) ? Math.max(0, Math.min(1, offset)) : 0.5,
  };
}

function normalizeStagePosition(value: unknown): StagePosition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const xFeet = Number(data.xFeet);
  const yFeet = Number(data.yFeet);
  if (!Number.isFinite(xFeet) || !Number.isFinite(yFeet)) return undefined;
  return {
    xFeet,
    yFeet,
    ...(Number.isFinite(Number(data.widthFeet)) && Number(data.widthFeet) > 0 ? { widthFeet: Number(data.widthFeet) } : {}),
    ...(Number.isFinite(Number(data.depthFeet)) && Number(data.depthFeet) > 0 ? { depthFeet: Number(data.depthFeet) } : {}),
    ...(Number.isFinite(Number(data.rotationDegrees)) ? { rotationDegrees: ((Number(data.rotationDegrees) % 360) + 360) % 360 } : {}),
    ...(normalizeStageAnchor(data.inputAnchor) ? { inputAnchor: normalizeStageAnchor(data.inputAnchor) } : {}),
    ...(normalizeStageAnchor(data.outputAnchor) ? { outputAnchor: normalizeStageAnchor(data.outputAnchor) } : {}),
  };
}

function normalizeStageRoute(value: unknown): StageRoute | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  return {
    waypointIds: Array.isArray(data.waypointIds)
      ? [...new Set(data.waypointIds.filter((item): item is string => typeof item === "string" && Boolean(item)))]
      : [],
    sourceDropFeet: finiteNonNegative(data.sourceDropFeet),
    targetDropFeet: finiteNonNegative(data.targetDropFeet),
    serviceSlackFeet: finiteNonNegative(data.serviceSlackFeet, 3),
  };
}

function normalizeStagePlan(value: unknown): StagePlan {
  const fallback = emptySetupGraph().stage;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const data = value as Record<string, unknown>;
  const rawViewport = data.viewport && typeof data.viewport === "object" && !Array.isArray(data.viewport)
    ? data.viewport as Partial<Viewport>
    : fallback.viewport;
  const waypoints = Array.isArray(data.waypoints) ? data.waypoints.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const waypoint = item as Record<string, unknown>;
    const xFeet = Number((waypoint.position as Record<string, unknown> | undefined)?.xFeet);
    const yFeet = Number((waypoint.position as Record<string, unknown> | undefined)?.yFeet);
    if (typeof waypoint.id !== "string" || !Number.isFinite(xFeet) || !Number.isFinite(yFeet)) return [];
    return [{
      id: waypoint.id,
      label: typeof waypoint.label === "string" && waypoint.label.trim() ? waypoint.label.trim() : "Cord waypoint",
      position: { xFeet, yFeet },
    }];
  }) : [];
  const areas = Array.isArray(data.areas) ? data.areas.flatMap((item): StageArea[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const area = item as Record<string, unknown>;
    if (typeof area.id !== "string" || !area.id) return [];
    return [{
      id: area.id,
      label: typeof area.label === "string" && area.label.trim() ? area.label.trim() : "Stage area",
      xFeet: finiteNonNegative(area.xFeet),
      yFeet: finiteNonNegative(area.yFeet),
      widthFeet: finitePositive(area.widthFeet, 8),
      depthFeet: finitePositive(area.depthFeet, 6),
    }];
  }) : [];
  const widthFeet = finitePositive(data.widthFeet, fallback.widthFeet);
  const depthFeet = finitePositive(data.depthFeet, fallback.depthFeet);

  return {
    widthFeet,
    depthFeet,
    viewport: {
      x: Number.isFinite(Number(rawViewport.x)) ? Number(rawViewport.x) : fallback.viewport.x,
      y: Number.isFinite(Number(rawViewport.y)) ? Number(rawViewport.y) : fallback.viewport.y,
      zoom: Number.isFinite(Number(rawViewport.zoom)) ? Math.max(0.1, Math.min(4, Number(rawViewport.zoom))) : fallback.viewport.zoom,
    },
    areas: areas.map((area) => constrainStageArea(area, { widthFeet, depthFeet })),
    waypoints,
  };
}

export function normalizeSetupGraph(input: SetupGraphInput): SetupGraph {
  const nodes = input.nodes.map((node): SetupNode => {
    const data = jsonClone(node.data);
    delete data["assignedUnitId"];
    delete data["assignedUnitLabel"];
    return {
      id: String(node.id),
      type: "equipment",
      position: {
        x: Number.isFinite(node.position.x) ? node.position.x : 0,
        y: Number.isFinite(node.position.y) ? node.position.y : 0,
      },
      ...(typeof node.zIndex === "number" ? { zIndex: node.zIndex } : {}),
      ...(normalizeStagePosition(node.stagePosition) ? { stagePosition: normalizeStagePosition(node.stagePosition) } : {}),
      data: {
        ...data,
        ports: equipmentPortsFromData(data.ports),
      },
    };
  });
  const edges = input.edges.map((edge): CableEdge => {
    const data = jsonClone(edge.data);
    const stageRoute = normalizeStageRoute(data.stageRoute);
    const internalTransport = Boolean(data.internalTransport);
    return {
      id: String(edge.id),
      type: "signalCable",
      source: String(edge.source),
      sourceHandle: String(edge.sourceHandle),
      target: String(edge.target),
      targetHandle: String(edge.targetHandle),
      animated: !internalTransport,
      ...(internalTransport ? { selectable: false, deletable: false, reconnectable: false } : {}),
      data: {
        ...data,
        ...(stageRoute ? { stageRoute } : {}),
      },
    };
  });
  const viewport: Viewport = {
    x: Number.isFinite(input.viewport.x) ? input.viewport.x : 0,
    y: Number.isFinite(input.viewport.y) ? input.viewport.y : 0,
    zoom: Number.isFinite(input.viewport.zoom) ? Math.max(0.1, Math.min(4, input.viewport.zoom)) : 1,
  };

  return { schemaVersion: 2, revision: input.revision, nodes, edges, viewport, stage: normalizeStagePlan(input.stage) };
}

export function graphByteSize(graph: SetupGraph) {
  return new TextEncoder().encode(JSON.stringify(normalizeSetupGraph(graph))).byteLength;
}

export function setupGraphFromData(value: unknown, revision = 0): SetupGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySetupGraph(revision);
  const data = value as Partial<SetupGraph>;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return emptySetupGraph(revision);
  const viewport = data.viewport && typeof data.viewport === "object"
    ? data.viewport as Viewport
    : { x: 0, y: 0, zoom: 1 };
  return normalizeSetupGraph({
    nodes: data.nodes as SetupNode[],
    edges: data.edges as CableEdge[],
    viewport,
    stage: data.stage,
    revision: typeof data.revision === "number" ? data.revision : revision,
  });
}
