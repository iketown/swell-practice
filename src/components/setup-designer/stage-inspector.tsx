"use client";

import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpFromLineIcon,
  ArrowUpIcon,
  CableIcon,
  MapPinIcon,
  MousePointer2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RouteIcon,
  Trash2Icon,
} from "lucide-react";

import { CableInspector } from "@/components/setup-designer/cable-inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CableEdge, SetupNode, StageArea, StageConnectionAnchor, StageConnectionSide, StagePlan, StagePosition, StageWaypoint } from "@/lib/setup-designer/domain";
import { constrainStageArea, stagePositionForNode, stageRouteFor } from "@/lib/setup-designer/stage-plot";

export function StageCableInspector({
  edge,
  waypoints,
  onChange,
  onDelete,
  onAddWaypoint,
  onRemoveWaypoint,
}: {
  edge: CableEdge;
  waypoints: StageWaypoint[];
  onChange: (edge: CableEdge) => void;
  onDelete: (edgeId: string) => void;
  onAddWaypoint: (edgeId: string) => void;
  onRemoveWaypoint: (edgeId: string, waypointId: string) => void;
}) {
  const route = stageRouteFor(edge);
  const waypointMap = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]));
  const updateRoute = (patch: Partial<typeof route>) => onChange({
    ...edge,
    data: { ...edge.data, stageRoute: { ...route, ...patch } },
  });

  return (
    <Tabs defaultValue="route" className="min-h-0 flex-1 p-3">
      <TabsList className="w-full">
        <TabsTrigger value="route">Route</TabsTrigger>
        <TabsTrigger value="details">Cable details</TabsTrigger>
      </TabsList>
      <TabsContent value="route" className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Physical cord route</h3>
              <p className="text-xs leading-5 text-muted-foreground">Required length follows the stage grid, vertical drops, and service slack.</p>
            </div>
            <Badge>{edge.data.estimatedLength ?? "?"} {edge.data.lengthUnit}</Badge>
          </div>

          <div className="flex gap-2 rounded-lg border bg-muted/30 p-2.5">
            <RouteIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-xs leading-5 text-muted-foreground">Add waypoints in order, or click existing waypoints on the plot to include or remove them from this cord.</p>
          </div>

          <FieldGroup className="grid grid-cols-3 gap-2">
            <Field>
              <FieldLabel htmlFor="stage-source-drop">Source drop</FieldLabel>
              <Input id="stage-source-drop" type="number" min={0} step="0.5" value={route.sourceDropFeet} onChange={(event) => updateRoute({ sourceDropFeet: Math.max(0, Number(event.target.value) || 0) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="stage-target-drop">Target drop</FieldLabel>
              <Input id="stage-target-drop" type="number" min={0} step="0.5" value={route.targetDropFeet} onChange={(event) => updateRoute({ targetDropFeet: Math.max(0, Number(event.target.value) || 0) })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="stage-service-slack">Slack</FieldLabel>
              <Input id="stage-service-slack" type="number" min={0} step="0.5" value={route.serviceSlackFeet} onChange={(event) => updateRoute({ serviceSlackFeet: Math.max(0, Number(event.target.value) || 0) })} />
            </Field>
            <FieldDescription className="col-span-3">All values are feet. The horizontal floor run is measured automatically.</FieldDescription>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waypoints ({route.waypointIds.length})</h4>
              <Button type="button" size="sm" variant="outline" onClick={() => onAddWaypoint(edge.id)}>
                <PlusIcon data-icon="inline-start" />
                Add waypoint
              </Button>
            </div>
            {route.waypointIds.length ? route.waypointIds.map((waypointId, index) => {
              const waypoint = waypointMap.get(waypointId);
              return (
                <div key={waypointId} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{waypoint?.label ?? "Missing waypoint"}</span>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${waypoint?.label ?? "waypoint"} from route`} onClick={() => onRemoveWaypoint(edge.id, waypointId)}>
                    <Trash2Icon />
                  </Button>
                </div>
              );
            }) : (
              <Empty className="border py-8">
                <EmptyHeader><CableIcon /><EmptyTitle>Direct floor run</EmptyTitle><EmptyDescription>Add a waypoint where the cord turns or joins a shared route.</EmptyDescription></EmptyHeader>
              </Empty>
            )}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="details" className="min-h-0 overflow-y-auto -mx-3">
        <CableInspector edge={edge} onChange={onChange} onDelete={onDelete} />
      </TabsContent>
    </Tabs>
  );
}

export function StageItemInspector({
  node,
  stage,
  onPositionChange,
  onSignalVisibilityChange,
  onEdit,
}: {
  node: SetupNode;
  stage: StagePlan;
  onPositionChange: (position: Required<StagePosition>) => void;
  onSignalVisibilityChange: (visible: boolean) => void;
  onEdit: () => void;
}) {
  const position = stagePositionForNode(node, stage);
  const update = (patch: Partial<Required<StagePosition>>) => onPositionChange({ ...position, ...patch });

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{node.data.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{node.data.category}</p>
        </div>
        {node.data.showInSignalView === false ? <Badge variant="secondary">STAGE only</Badge> : null}
      </div>
      <FieldGroup className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="stage-item-x">From stage left</FieldLabel>
          <Input id="stage-item-x" type="number" min={0} max={stage.widthFeet} step="0.5" value={position.xFeet} onChange={(event) => update({ xFeet: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-item-y">From backstage</FieldLabel>
          <Input id="stage-item-y" type="number" min={0} max={stage.depthFeet} step="0.5" value={position.yFeet} onChange={(event) => update({ yFeet: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-item-width">Width (in)</FieldLabel>
          <Input id="stage-item-width" type="number" min={1} step="0.25" value={rounded(position.widthFeet * 12)} onChange={(event) => update({ widthFeet: Math.max(1, Number(event.target.value) || 1) / 12 })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-item-depth">Depth (in)</FieldLabel>
          <Input id="stage-item-depth" type="number" min={1} step="0.25" value={rounded(position.depthFeet * 12)} onChange={(event) => update({ depthFeet: Math.max(1, Number(event.target.value) || 1) / 12 })} />
        </Field>
        <FieldDescription className="col-span-2">Placement is measured in feet; the physical footprint is measured in inches. The resting plot renders only this exact footprint.</FieldDescription>
      </FieldGroup>

      <FieldGroup className="gap-3 rounded-lg border bg-muted/30 p-3">
        <Field>
          <FieldLabel htmlFor="stage-item-rotation">Rotation</FieldLabel>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
            <Button type="button" size="icon" variant="outline" aria-label="Rotate 15 degrees counterclockwise" onClick={() => update({ rotationDegrees: normalizeDegrees(position.rotationDegrees - 15) })}>
              <RotateCcwIcon />
            </Button>
            <Input id="stage-item-rotation" type="number" min={0} max={359.9} step={1} value={rounded(position.rotationDegrees)} onChange={(event) => update({ rotationDegrees: normalizeDegrees(Number(event.target.value) || 0) })} />
            <Button type="button" size="icon" variant="outline" aria-label="Rotate 15 degrees clockwise" onClick={() => update({ rotationDegrees: normalizeDegrees(position.rotationDegrees + 15) })}>
              <RotateCwIcon />
            </Button>
          </div>
          <FieldDescription>Degrees clockwise. The image, physical bounds, and cable anchors rotate together.</FieldDescription>
        </Field>

        <StageAnchorPreview input={position.inputAnchor} output={position.outputAnchor} />
        <StageAnchorEditor
          idPrefix="stage-item-input-anchor"
          label="Input anchor"
          anchor={position.inputAnchor}
          onChange={(inputAnchor) => update({ inputAnchor })}
        />
        <StageAnchorEditor
          idPrefix="stage-item-output-anchor"
          label="Output anchor"
          anchor={position.outputAnchor}
          onChange={(outputAnchor) => update({ outputAnchor })}
        />
        <FieldDescription>Every input port shares the IN point in STAGE; every output port shares the OUT point. SIGNAL keeps the individual ports.</FieldDescription>
      </FieldGroup>
      <Field orientation="horizontal" className="rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-1 flex-col gap-1">
          <FieldLabel htmlFor="stage-item-signal-visibility">Show in SIGNAL</FieldLabel>
          <FieldDescription>Keep stands and furniture off the logical signal diagram.</FieldDescription>
        </div>
        <Switch id="stage-item-signal-visibility" checked={node.data.showInSignalView !== false} onCheckedChange={onSignalVisibilityChange} />
      </Field>
      <Button type="button" variant="outline" onClick={onEdit}>
        <PencilIcon data-icon="inline-start" />
        Equipment details
      </Button>
    </div>
  );
}

export function StageLayoutInspector({
  stage,
  onDimensionsChange,
  onAddArea,
  onAreaSelect,
}: {
  stage: StagePlan;
  onDimensionsChange: (widthFeet: number, depthFeet: number) => void;
  onAddArea: () => void;
  onAreaSelect: (areaId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-3">
      <div>
        <h3 className="text-sm font-semibold">Stage layout</h3>
        <p className="text-xs leading-5 text-muted-foreground">Set the outer footprint, then add named rectangles for risers and side-stage space.</p>
      </div>

      <FieldGroup className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="stage-layout-width">Width (ft)</FieldLabel>
          <Input
            id="stage-layout-width"
            type="number"
            min={4}
            max={200}
            step="1"
            value={rounded(stage.widthFeet)}
            onChange={(event) => onDimensionsChange(Math.max(4, Number(event.target.value) || 4), stage.depthFeet)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-layout-depth">Depth (ft)</FieldLabel>
          <Input
            id="stage-layout-depth"
            type="number"
            min={4}
            max={200}
            step="1"
            value={rounded(stage.depthFeet)}
            onChange={(event) => onDimensionsChange(stage.widthFeet, Math.max(4, Number(event.target.value) || 4))}
          />
        </Field>
        <FieldDescription className="col-span-2">Audience is shown along the bottom edge. Equipment and areas remain constrained to the footprint when it becomes smaller.</FieldDescription>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Areas ({stage.areas.length})</h4>
            <p className="text-xs text-muted-foreground">Drag areas behind the gear to position them.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onAddArea}>
            <PlusIcon data-icon="inline-start" />
            Add area
          </Button>
        </div>
        {stage.areas.length ? (
          <div className="flex flex-col gap-1">
            {stage.areas.map((area) => (
              <button
                key={area.id}
                type="button"
                className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onAreaSelect(area.id)}
              >
                <span className="min-w-0 truncate font-medium">{area.label || "Untitled area"}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{rounded(area.widthFeet)} × {rounded(area.depthFeet)} ft</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty className="border py-8">
            <EmptyHeader><EmptyTitle>No stage areas</EmptyTitle><EmptyDescription>Add a riser, wing, or other dimensioned zone.</EmptyDescription></EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}

export function StageAreaInspector({
  area,
  stage,
  onChange,
  onDelete,
  onBack,
}: {
  area: StageArea;
  stage: StagePlan;
  onChange: (area: StageArea) => void;
  onDelete: (areaId: string) => void;
  onBack: () => void;
}) {
  const update = (patch: Partial<StageArea>) => onChange(constrainStageArea({ ...area, ...patch }, stage));

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        Stage layout
      </Button>
      <div>
        <h3 className="truncate text-sm font-semibold">{area.label || "Stage area"}</h3>
        <p className="text-xs text-muted-foreground">A dimensioned rectangle behind the equipment.</p>
      </div>
      <FieldGroup className="grid grid-cols-2 gap-3">
        <Field className="col-span-2">
          <FieldLabel htmlFor="stage-area-label">Label</FieldLabel>
          <Input id="stage-area-label" value={area.label} onChange={(event) => update({ label: event.target.value })} placeholder="Drum riser" />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-area-x">From stage left</FieldLabel>
          <Input id="stage-area-x" type="number" min={0} max={stage.widthFeet} step="0.5" value={rounded(area.xFeet)} onChange={(event) => update({ xFeet: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-area-y">From backstage</FieldLabel>
          <Input id="stage-area-y" type="number" min={0} max={stage.depthFeet} step="0.5" value={rounded(area.yFeet)} onChange={(event) => update({ yFeet: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-area-width">Width (ft)</FieldLabel>
          <Input id="stage-area-width" type="number" min={0.5} max={stage.widthFeet} step="0.5" value={rounded(area.widthFeet)} onChange={(event) => update({ widthFeet: Math.max(0.5, Number(event.target.value) || 0.5) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="stage-area-depth">Depth (ft)</FieldLabel>
          <Input id="stage-area-depth" type="number" min={0.5} max={stage.depthFeet} step="0.5" value={rounded(area.depthFeet)} onChange={(event) => update({ depthFeet: Math.max(0.5, Number(event.target.value) || 0.5) })} />
        </Field>
        <FieldDescription className="col-span-2">All measurements use feet. Drag the area directly on the STAGE plot for faster placement.</FieldDescription>
      </FieldGroup>
      <Button type="button" variant="destructive" onClick={() => onDelete(area.id)}>
        <Trash2Icon data-icon="inline-start" />
        Remove area
      </Button>
    </div>
  );
}

export function StageMultiSelectionInspector({
  equipmentCount,
  areaCount,
}: {
  equipmentCount: number;
  areaCount: number;
}) {
  const total = equipmentCount + areaCount;
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div>
        <h3 className="text-sm font-semibold">{total} items selected</h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {equipmentCount ? `${equipmentCount} gear item${equipmentCount === 1 ? "" : "s"}` : ""}
          {equipmentCount && areaCount ? " · " : ""}
          {areaCount ? `${areaCount} stage area${areaCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <div className="flex gap-2 rounded-lg border bg-muted/30 p-3">
        <MousePointer2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          <p>Drag any selected item to move the whole group.</p>
          <p><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">Shift</kbd> and drag another box to add more.</p>
        </div>
      </div>
    </div>
  );
}

const STAGE_SIDES: Array<{ value: StageConnectionSide; label: string; Icon: typeof ArrowUpIcon }> = [
  { value: "top", label: "Top", Icon: ArrowUpIcon },
  { value: "right", label: "Right", Icon: ArrowRightIcon },
  { value: "bottom", label: "Bottom", Icon: ArrowDownIcon },
  { value: "left", label: "Left", Icon: ArrowLeftIcon },
];

function StageAnchorEditor({
  idPrefix,
  label,
  anchor,
  onChange,
}: {
  idPrefix: string;
  label: string;
  anchor: StageConnectionAnchor;
  onChange: (anchor: StageConnectionAnchor) => void;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(anchor.offset * 100)}%</span>
      </div>
      <ToggleGroup
        aria-label={`${label} side`}
        variant="outline"
        size="sm"
        spacing={0}
        value={[anchor.side]}
        onValueChange={(value) => {
          const side = value[0] as StageConnectionSide | undefined;
          if (side) onChange({ ...anchor, side });
        }}
      >
        {STAGE_SIDES.map(({ value, label: sideLabel, Icon }) => (
          <ToggleGroupItem key={value} value={value} aria-label={`${label}: ${sideLabel.toLowerCase()}`}>
            <Icon aria-hidden />
            {sideLabel}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Slider
        id={`${idPrefix}-offset`}
        aria-label={`${label} position along side`}
        min={0}
        max={100}
        step={1}
        value={[anchor.offset * 100]}
        onValueChange={(value) => {
          const offset = Array.isArray(value) ? value[0] : value;
          if (typeof offset === "number") onChange({ ...anchor, offset: offset / 100 });
        }}
      />
    </Field>
  );
}

function StageAnchorPreview({ input, output }: { input: StageConnectionAnchor; output: StageConnectionAnchor }) {
  return (
    <div className="relative h-28 overflow-hidden rounded-lg border bg-background" aria-label={`Input on ${input.side}; output on ${output.side}`}>
      <div className="absolute left-1/2 top-1/2 h-12 w-28 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-foreground/35 bg-card" />
      <AnchorPreviewMarker anchor={input} type="input" />
      <AnchorPreviewMarker anchor={output} type="output" />
    </div>
  );
}

function AnchorPreviewMarker({ anchor, type }: { anchor: StageConnectionAnchor; type: "input" | "output" }) {
  const style = previewAnchorStyle(anchor);
  const Icon = type === "input" ? ArrowDownToLineIcon : ArrowUpFromLineIcon;
  return (
    <span
      className={type === "input"
        ? "absolute flex size-7 items-center justify-center rounded-full border-2 border-background bg-secondary text-secondary-foreground shadow-sm"
        : "absolute flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm"}
      style={style}
      title={type === "input" ? "Input anchor" : "Output anchor"}
    >
      <Icon className="size-3.5" />
      <span className="sr-only">{type === "input" ? "Input" : "Output"}</span>
    </span>
  );
}

function previewAnchorStyle(anchor: StageConnectionAnchor) {
  const left = anchor.side === "left" ? "calc(50% - 3.5rem)"
    : anchor.side === "right" ? "calc(50% + 3.5rem)"
      : `calc(50% - 3.5rem + ${anchor.offset * 7}rem)`;
  const top = anchor.side === "top" ? "calc(50% - 1.5rem)"
    : anchor.side === "bottom" ? "calc(50% + 1.5rem)"
      : `calc(50% - 1.5rem + ${anchor.offset * 3}rem)`;
  return { left, top, transform: "translate(-50%, -50%)" };
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function StageWaypointInspector({
  waypoint,
  cableCount,
  onChange,
  onDelete,
}: {
  waypoint: StageWaypoint;
  cableCount: number;
  onChange: (waypoint: StageWaypoint) => void;
  onDelete: (waypointId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Cord waypoint</h3>
          <p className="text-xs text-muted-foreground">Routes cords without entering the signal path.</p>
        </div>
        <Badge variant="secondary">{cableCount} cord{cableCount === 1 ? "" : "s"}</Badge>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="stage-waypoint-label">Label</FieldLabel>
          <Input id="stage-waypoint-label" value={waypoint.label} onChange={(event) => onChange({ ...waypoint, label: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="stage-waypoint-x">From stage left</FieldLabel>
            <Input id="stage-waypoint-x" type="number" min={0} step="0.5" value={waypoint.position.xFeet} onChange={(event) => onChange({ ...waypoint, position: { ...waypoint.position, xFeet: Math.max(0, Number(event.target.value) || 0) } })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="stage-waypoint-y">From backstage</FieldLabel>
            <Input id="stage-waypoint-y" type="number" min={0} step="0.5" value={waypoint.position.yFeet} onChange={(event) => onChange({ ...waypoint, position: { ...waypoint.position, yFeet: Math.max(0, Number(event.target.value) || 0) } })} />
          </Field>
        </div>
      </FieldGroup>
      <div className="flex gap-2 rounded-lg border bg-muted/30 p-2.5">
        <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">Moving this point recalculates every cord that uses it.</p>
      </div>
      <Button type="button" variant="destructive" onClick={() => onDelete(waypoint.id)}>
        <Trash2Icon data-icon="inline-start" />
        Remove waypoint
      </Button>
    </div>
  );
}
