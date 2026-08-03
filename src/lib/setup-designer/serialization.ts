import type { Viewport } from "@xyflow/react";

import { emptySetupGraph, type CableEdge, type SetupGraph, type SetupNode } from "@/lib/setup-designer/domain";
import { equipmentPortsFromData } from "@/lib/setup-designer/ports";

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeSetupGraph(input: Pick<SetupGraph, "nodes" | "edges" | "viewport" | "revision">): SetupGraph {
  const nodes = input.nodes.map((node): SetupNode => ({
    id: String(node.id),
    type: "equipment",
    position: {
      x: Number.isFinite(node.position.x) ? node.position.x : 0,
      y: Number.isFinite(node.position.y) ? node.position.y : 0,
    },
    ...(typeof node.zIndex === "number" ? { zIndex: node.zIndex } : {}),
    data: {
      ...jsonClone(node.data),
      ports: equipmentPortsFromData(node.data.ports),
    },
  }));
  const edges = input.edges.map((edge): CableEdge => ({
    id: String(edge.id),
    type: "signalCable",
    source: String(edge.source),
    sourceHandle: String(edge.sourceHandle),
    target: String(edge.target),
    targetHandle: String(edge.targetHandle),
    animated: true,
    data: jsonClone(edge.data),
  }));
  const viewport: Viewport = {
    x: Number.isFinite(input.viewport.x) ? input.viewport.x : 0,
    y: Number.isFinite(input.viewport.y) ? input.viewport.y : 0,
    zoom: Number.isFinite(input.viewport.zoom) ? Math.max(0.1, Math.min(4, input.viewport.zoom)) : 1,
  };

  return { schemaVersion: 1, revision: input.revision, nodes, edges, viewport };
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
    revision: typeof data.revision === "number" ? data.revision : revision,
  });
}
