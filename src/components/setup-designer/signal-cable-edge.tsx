"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { edgeHasCableAssemblyLeg, edgeIsCableAssemblyPrimary } from "@/lib/setup-designer/breakout-cables";
import type { CableEdge } from "@/lib/setup-designer/domain";
import { cn } from "@/lib/utils";

export function SignalCableEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<CableEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 });
  const markerId = `setup-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const color = data?.color ?? "var(--primary)";
  const hovered = data?.signalHovered === true;
  const emphasized = selected || hovered;

  if (data?.internalTransport) {
    const transport = data.internalTransport;
    return (
      <>
        <BaseEdge id={`${id}-casing`} path={path} interactionWidth={0} style={{ stroke: "var(--background)", strokeWidth: 16 }} />
        <BaseEdge id={id} path={path} interactionWidth={10} style={{ stroke: color, strokeWidth: 10, strokeLinecap: "round" }} />
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold text-card-foreground shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span>{transport.channelCount} ch</span>
            {data.estimatedLength ? <span className="text-muted-foreground">· {data.estimatedLength} {data.lengthUnit}</span> : null}
            <span className="text-muted-foreground">· {transport.kind === "split-snake" ? "split trunk" : "snake trunk"}</span>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }

  return (
    <>
      <defs>
        <marker id={markerId} markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 0 0 L 5 2.5 L 0 5 z" fill={color} />
        </marker>
      </defs>
      <BaseEdge id={`${id}-casing`} path={path} interactionWidth={0} style={{ stroke: "var(--background)", strokeWidth: emphasized ? 8 : 6 }} />
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        interactionWidth={24}
        className={cn("setup-signal-cable", hovered && "setup-signal-cable-hovered")}
        style={{ stroke: color, strokeWidth: emphasized ? 4 : 3, strokeDasharray: "7 6" }}
      />
      {(data?.estimatedLength || data?.exception) && (!edgeHasCableAssemblyLeg({ data }) || edgeIsCableAssemblyPrimary({ data })) ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-semibold shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data?.exception ? <span aria-label="Compatibility exception">⚠</span> : null}
            {data?.estimatedLength ? `${data.estimatedLength} ${data.lengthUnit}` : "Check"}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
