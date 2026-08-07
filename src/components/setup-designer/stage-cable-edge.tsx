"use client";

import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps, useReactFlow } from "@xyflow/react";

import type { CableEdgeData } from "@/lib/setup-designer/domain";
import type { StageCanvasNode } from "@/components/setup-designer/stage-plot-node";

interface StageCableEdgeData extends CableEdgeData {
  stageHovered?: boolean;
}

export type StageCanvasCableEdge = Edge<StageCableEdgeData, "stageCable"> & {
  sourceHandle: string;
  targetHandle: string;
  data: StageCableEdgeData;
};

interface Point {
  x: number;
  y: number;
}

function orthogonalPath(points: readonly Point[]) {
  const segments: Point[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = segments[segments.length - 1];
    const next = points[index];
    if (previous.x !== next.x && previous.y !== next.y) segments.push({ x: next.x, y: previous.y });
    segments.push(next);
  }
  const path = segments.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const distances = segments.slice(1).map((point, index) => (
    Math.abs(point.x - segments[index].x) + Math.abs(point.y - segments[index].y)
  ));
  const total = distances.reduce((sum, distance) => sum + distance, 0);
  let traversed = 0;
  let label = segments[Math.floor(segments.length / 2)] ?? points[0];
  for (let index = 0; index < distances.length; index += 1) {
    const distance = distances[index];
    if (traversed + distance >= total / 2) {
      const start = segments[index];
      const end = segments[index + 1];
      const remaining = total / 2 - traversed;
      const ratio = distance ? remaining / distance : 0;
      label = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
      break;
    }
    traversed += distance;
  }
  return { path, label };
}

export function StageCableEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<StageCanvasCableEdge>) {
  const reactFlow = useReactFlow<StageCanvasNode, StageCanvasCableEdge>();
  const waypointPoints = (data?.stageRoute?.waypointIds ?? []).flatMap((waypointId) => {
    const waypoint = reactFlow.getNode(waypointId);
    if (!waypoint) return [];
    const position = waypoint.position;
    return [{
      x: position.x + (waypoint.measured?.width ?? 40) / 2,
      y: position.y + (waypoint.measured?.height ?? 40) / 2,
    }];
  });
  const { path, label } = orthogonalPath([
    { x: sourceX, y: sourceY },
    ...waypointPoints,
    { x: targetX, y: targetY },
  ]);
  const color = data?.color ?? "var(--primary)";
  const waypointCount = data?.stageRoute?.waypointIds.length ?? 0;
  const hovered = data?.stageHovered === true;
  const emphasized = selected || hovered;
  const microphoneRoute = data?.signalType === "microphone";
  const routeWidth = data?.internalTransport ? (emphasized ? 8 : 7) : emphasized ? (microphoneRoute ? 4 : 5) : microphoneRoute ? 2 : 3.5;
  const casingWidth = data?.internalTransport ? routeWidth + 3 : routeWidth + (emphasized ? 4 : 3);

  return (
    <>
      <BaseEdge id={`${id}-stage-casing`} path={path} interactionWidth={0} style={{ stroke: "var(--background)", strokeWidth: casingWidth, strokeLinejoin: "round" }} />
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        className="setup-stage-cable"
        style={{ stroke: color, strokeWidth: routeWidth, strokeLinecap: "round", strokeLinejoin: "round" }}
      />
      {hovered ? (
        <BaseEdge
          id={`${id}-stage-trace`}
          path={path}
          interactionWidth={0}
          className="setup-stage-cable-trace"
          style={{ stroke: "var(--background)", strokeWidth: Math.max(1.25, routeWidth * 0.38), strokeLinecap: "round", pointerEvents: "none" }}
        />
      ) : null}
      {selected ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-card-foreground shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
          >
            {data?.estimatedLength ? `${data.estimatedLength} ${data.lengthUnit}` : "Measure"}
            {data?.internalTransport ? <span className="text-muted-foreground">fixed trunk</span> : waypointCount ? <span className="text-muted-foreground">· {waypointCount} via</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
