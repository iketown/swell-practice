"use client";

import { Handle, Position, type Node, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, AudioLinesIcon, CableIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EquipmentNodeData, StageConnectionSide, StagePosition } from "@/lib/setup-designer/domain";
import { portsByDirection } from "@/lib/setup-designer/ports";
import { stageAnchorCanvasPlacement, stageNodeGeometry } from "@/lib/setup-designer/stage-plot";
import { cn } from "@/lib/utils";

export interface StageEquipmentCanvasData extends EquipmentNodeData {
  stagePosition: Required<StagePosition>;
}

export type StageEquipmentCanvasNode = Node<StageEquipmentCanvasData, "stageEquipment">;

export interface StageWaypointCanvasData extends Record<string, unknown> {
  label: string;
  cableCount: number;
  routeIndex?: number;
}

export type StageWaypointCanvasNode = Node<StageWaypointCanvasData, "stageWaypoint">;

export interface StageFloorCanvasData extends Record<string, unknown> {
  widthFeet: number;
  depthFeet: number;
}

export type StageFloorCanvasNode = Node<StageFloorCanvasData, "stageFloor">;

export interface StageAreaCanvasData extends Record<string, unknown> {
  label: string;
  widthFeet: number;
  depthFeet: number;
}

export type StageAreaCanvasNode = Node<StageAreaCanvasData, "stageArea">;

export type StageCanvasNode = StageEquipmentCanvasNode | StageWaypointCanvasNode | StageFloorCanvasNode | StageAreaCanvasNode;

const REACT_FLOW_POSITION: Record<StageConnectionSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export function StageEquipmentNode({ id, data, selected }: NodeProps<StageEquipmentCanvasNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const inputs = portsByDirection(data.ports, "input");
  const outputs = portsByDirection(data.ports, "output");
  const footprint = data.stagePosition;
  const geometry = stageNodeGeometry(footprint);
  const inputPlacement = stageAnchorCanvasPlacement(footprint, "input");
  const outputPlacement = stageAnchorCanvasPlacement(footprint, "output");
  const stageImageUrl = data.stageImage?.downloadUrl;
  const visibleImageUrl = stageImageUrl ?? data.image?.downloadUrl;
  const hasVisibleImage = Boolean(visibleImageUrl);

  useEffect(() => {
    updateNodeInternals(id);
  }, [footprint.depthFeet, footprint.inputAnchor, footprint.outputAnchor, footprint.rotationDegrees, footprint.widthFeet, id, updateNodeInternals]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <article
            className="setup-stage-equipment-node group relative size-full overflow-visible outline-none"
            tabIndex={0}
            aria-label={`${data.name}, ${formatStageSize(footprint)}. Rotated ${formatDegrees(footprint.rotationDegrees)}. Double-click to configure.`}
          />
        )}
      >
        <span className="setup-stage-hit-target" aria-hidden />
        <div
          className={cn(
            "setup-stage-equipment-body absolute left-1/2 top-1/2 transition-[border-color,box-shadow,filter] duration-150",
            hasVisibleImage
              ? "setup-stage-alpha-image overflow-visible border border-transparent bg-transparent"
              : "overflow-hidden rounded-[3px] border bg-card text-card-foreground",
            hasVisibleImage && selected ? "setup-stage-alpha-image-selected" : null,
            !hasVisibleImage && (selected ? "border-primary ring-2 ring-primary/35" : "border-foreground/25 group-hover:border-primary/70 group-focus-visible:border-primary/70"),
          )}
          style={{
            width: geometry.bodyWidthPixels,
            height: geometry.bodyHeightPixels,
            transform: `translate(-50%, -50%) rotate(${footprint.rotationDegrees}deg)`,
          }}
        >
          {visibleImageUrl ? (
            <Image
              src={visibleImageUrl}
              alt=""
              fill
              sizes={`${Math.max(24, Math.ceil(geometry.bodyWidthPixels))}px`}
              unoptimized
              className={stageImageUrl ? "object-cover" : "object-contain p-[8%]"}
            />
          ) : data.equipmentKind === "snake" || data.equipmentKind === "split-snake" ? (
            <CableIcon aria-hidden className="absolute left-1/2 top-1/2 size-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
          ) : (
            <AudioLinesIcon aria-hidden className="absolute left-1/2 top-1/2 size-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        <StagePortHandles ports={inputs} type="target" placement={inputPlacement} />
        <StagePortHandles ports={outputs} type="source" placement={outputPlacement} />
        {inputs.length ? <StageAnchorMarker direction="input" placement={inputPlacement} selected={selected} /> : null}
        {outputs.length ? <StageAnchorMarker direction="output" placement={outputPlacement} selected={selected} /> : null}
        {data.assemblyId ? (
          <Handle
            id={data.transportPrimary ? "transport-trunk-source" : "transport-trunk-target"}
            type={data.transportPrimary ? "source" : "target"}
            position={REACT_FLOW_POSITION[(data.transportPrimary ? outputPlacement : inputPlacement).side]}
            isConnectable={false}
            aria-hidden
            className="setup-stage-invisible-handle"
            style={handleStyle(data.transportPrimary ? outputPlacement : inputPlacement)}
          />
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10} className="flex max-w-64 flex-col items-start gap-1 px-3 py-2">
        <span className="font-semibold">{data.name}</span>
        <span className="text-background/75">{data.category} · {formatStageSize(footprint)} · {formatDegrees(footprint.rotationDegrees)}</span>
        {inputs.length || outputs.length ? (
          <span className="text-background/75">
            {inputs.length ? `IN ${anchorDescription(footprint.inputAnchor)}` : "No inputs"}
            {" · "}
            {outputs.length ? `OUT ${anchorDescription(footprint.outputAnchor)}` : "No outputs"}
          </span>
        ) : null}
        {data.showInSignalView === false ? <span className="text-background/75">STAGE only</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function StagePortHandles({
  ports,
  type,
  placement,
}: {
  ports: EquipmentNodeData["ports"];
  type: "source" | "target";
  placement: ReturnType<typeof stageAnchorCanvasPlacement>;
}) {
  return ports.map((port) => (
    <Handle
      key={port.id}
      id={port.id}
      type={type}
      position={REACT_FLOW_POSITION[placement.side]}
      isConnectable={false}
      aria-hidden
      className="setup-stage-invisible-handle"
      style={handleStyle(placement)}
    />
  ));
}

function handleStyle(placement: ReturnType<typeof stageAnchorCanvasPlacement>) {
  return {
    left: placement.x,
    right: "auto",
    top: placement.y,
    bottom: "auto",
    transform: "translate(-50%, -50%)",
  };
}

function StageAnchorMarker({
  direction,
  placement,
  selected,
}: {
  direction: "input" | "output";
  placement: ReturnType<typeof stageAnchorCanvasPlacement>;
  selected: boolean;
}) {
  const Icon = direction === "input" ? ArrowDownToLineIcon : ArrowUpFromLineIcon;
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 flex size-4 items-center justify-center rounded-full border border-background shadow-sm transition-opacity duration-150",
        direction === "input" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
      )}
      style={{ left: placement.x, top: placement.y, transform: "translate(-50%, -50%)" }}
      aria-hidden
    >
      <Icon className="size-2.5" />
    </span>
  );
}

function formatStageSize(position: Required<StagePosition>) {
  return `${formatInches(position.widthFeet * 12)} × ${formatInches(position.depthFeet * 12)}`;
}

function formatInches(value: number) {
  return `${Math.round(value * 10) / 10}\u2033`;
}

function formatDegrees(value: number) {
  return `${Math.round(value * 10) / 10}°`;
}

function anchorDescription(anchor: Required<StagePosition>["inputAnchor"]) {
  return `${anchor.side} ${Math.round(anchor.offset * 100)}%`;
}

export function StageWaypointNode({ data, selected }: NodeProps<StageWaypointCanvasNode>) {
  return (
    <div
      className={cn(
        "setup-stage-waypoint relative flex size-10 items-center justify-center rounded-full border-2 bg-card text-primary shadow-sm transition-[border-color,box-shadow,transform] duration-200",
        selected || data.routeIndex ? "border-primary ring-4 ring-primary/20" : "border-primary/55 hover:scale-105 hover:border-primary",
      )}
      aria-label={`${data.label}. Used by ${data.cableCount} cord${data.cableCount === 1 ? "" : "s"}.`}
      title={`${data.label} · ${data.cableCount} cord${data.cableCount === 1 ? "" : "s"}`}
    >
      <MapPinIcon aria-hidden className="size-4" />
      {data.routeIndex ? (
        <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
          {data.routeIndex}
        </span>
      ) : null}
    </div>
  );
}

export function StageFloorNode({ data }: NodeProps<StageFloorCanvasNode>) {
  return (
    <div className="setup-stage-floor relative size-full overflow-hidden rounded-xl border-2 border-foreground/25 bg-card/75" aria-label={`Stage floor, ${data.widthFeet} by ${data.depthFeet} feet`}>
      <span className="absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Backstage</span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Audience</span>
      <button type="button" className="pointer-events-auto absolute right-3 top-2 rounded-md border bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground" aria-label="Edit stage layout">
        {data.widthFeet} × {data.depthFeet} ft
      </button>
    </div>
  );
}

export function StageAreaNode({ data, selected }: NodeProps<StageAreaCanvasNode>) {
  return (
    <div
      className={cn(
        "relative size-full overflow-hidden rounded-md border border-dashed bg-secondary/20 text-secondary-foreground transition-[background-color,border-color,box-shadow] duration-150",
        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-foreground/30 hover:border-primary/60 hover:bg-secondary/30",
      )}
      aria-label={`${data.label || "Untitled area"}, ${formatFeet(data.widthFeet)} by ${formatFeet(data.depthFeet)} feet`}
    >
      <span className="absolute left-2 top-1.5 max-w-[calc(100%-1rem)] truncate text-[10px] font-semibold uppercase tracking-[0.1em]">
        {data.label || "Untitled area"}
      </span>
      <span className="absolute bottom-1.5 right-2 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">
        {formatFeet(data.widthFeet)} × {formatFeet(data.depthFeet)} ft
      </span>
    </div>
  );
}

function formatFeet(value: number) {
  return Math.round(value * 10) / 10;
}
