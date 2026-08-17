"use client";

import {
  AudioLinesIcon,
  ArrowRightLeftIcon,
  CableIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleDashedIcon,
  CircleDotIcon,
  DrumIcon,
  GuitarIcon,
  Mic2Icon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  TruckIcon,
  ZapIcon,
} from "lucide-react";
import Image from "next/image";
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { createContext, useContext, useEffect, type CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SIGNAL_TYPES } from "@/lib/setup-designer/catalog";
import { powerDependencyLabel, type EquipmentPort, type FulfillmentStatus, type SetupNode } from "@/lib/setup-designer/domain";
import { portsByDirection } from "@/lib/setup-designer/ports";
import { portDisplayNameForNode } from "@/lib/setup-designer/snake-topology";
import { cn } from "@/lib/utils";

const categoryIcons = {
  microphone: Mic2Icon,
  "drum microphone": DrumIcon,
  instrument: GuitarIcon,
  "direct box": CableIcon,
  "stage box": CircleDotIcon,
  mixer: SlidersHorizontalIcon,
  snake: CableIcon,
  power: ZapIcon,
} as const;

const fulfillmentDisplay = {
  unplanned: { icon: CircleDashedIcon, label: "Unplanned" },
  owned: { icon: CheckIcon, label: "Owned" },
  rent: { icon: TruckIcon, label: "Rent" },
  buy: { icon: ShoppingCartIcon, label: "Buy" },
} satisfies Record<FulfillmentStatus, { icon: typeof CheckIcon; label: string }>;

interface EquipmentNodeActions {
  toggleExpanded: (nodeId: string) => void;
}

export const EquipmentNodeActionsContext = createContext<EquipmentNodeActions | null>(null);

export function EquipmentNode({ id, data, selected, isConnectable }: NodeProps<SetupNode>) {
  const actions = useContext(EquipmentNodeActionsContext);
  const updateNodeInternals = useUpdateNodeInternals();
  const inputs = portsByDirection(data.ports, "input");
  const outputs = portsByDirection(data.ports, "output");
  const Icon = categoryIcons[data.category.toLowerCase() as keyof typeof categoryIcons] ?? AudioLinesIcon;
  const powerLabel = powerDependencyLabel(data);

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(frame);
  }, [data.isExpanded, data.ports, id, updateNodeInternals]);

  if (data.cableAssembly) {
    return (
      <CableAssemblyNode
        data={data}
        selected={selected}
        isConnectable={isConnectable}
        inputs={inputs}
        outputs={outputs}
      />
    );
  }

  if (!data.isExpanded) {
    const status = fulfillmentDisplay[data.fulfillment];
    const StatusIcon = status.icon;
    const accessibleLabel = `${data.name}, ${inputs.length} inputs and ${outputs.length} outputs. ${status.label}.${powerLabel ? ` ${powerLabel}.` : ""} Double-click to configure.`;

    return (
      <article
        className={cn(
          "setup-equipment-node setup-equipment-node-compact relative w-[120px] overflow-visible rounded-xl border bg-card text-card-foreground shadow-md transition-[box-shadow,border-color,transform] duration-200",
          selected ? "border-primary shadow-lg ring-2 ring-primary/25" : "hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg",
        )}
        aria-label={accessibleLabel}
        title={`${data.name} · Click to select · Double-click to configure`}
      >
        <div className="relative h-[104px] overflow-hidden rounded-t-[calc(var(--radius-xl)-1px)] bg-muted/35">
          <div className="absolute inset-2 flex items-center justify-center overflow-hidden rounded-lg text-muted-foreground">
            {data.image?.downloadUrl ? (
              <Image src={data.image.downloadUrl} alt="" fill sizes="104px" unoptimized className="object-contain p-1" />
            ) : (
              <Icon aria-hidden className="size-10 opacity-80" />
            )}
          </div>
          <Badge
            variant={data.fulfillment === "owned" ? "default" : "secondary"}
            className="nodrag nopan absolute left-1.5 top-1.5 size-6 justify-center rounded-full p-0 shadow-sm"
            aria-label={status.label}
            title={status.label}
          >
            <StatusIcon aria-hidden className="size-3.5" />
            <span className="sr-only">{status.label}</span>
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="nodrag nopan absolute right-1.5 top-1.5 bg-card/95"
            aria-expanded="false"
            aria-label={`Expand ${data.name} ports`}
            title="Expand ports"
            onClick={(event) => {
              event.stopPropagation();
              actions?.toggleExpanded(id);
            }}
          >
            <ChevronDownIcon />
          </Button>
        </div>
        <footer className="border-t px-2 py-1.5">
          <h2 className="truncate text-xs font-semibold leading-4">{data.name}</h2>
          <p className="truncate text-[10px] leading-3.5 text-muted-foreground">{inputs.length} in · {outputs.length} out{powerLabel ? ` · ${powerLabel.toLowerCase()}` : ""}</p>
        </footer>
        <CompactPortHandles nodeName={data.name} ports={inputs} position={Position.Left} type="target" isConnectable={isConnectable} channelLabels={data.transportChannelLabels} />
        <CompactPortHandles nodeName={data.name} ports={outputs} position={Position.Right} type="source" isConnectable={isConnectable} channelLabels={data.transportChannelLabels} />
        <TransportTrunkHandle data={data} />
      </article>
    );
  }

  return (
    <article
      className={cn(
        "setup-equipment-node w-[360px] overflow-visible rounded-xl border bg-card text-card-foreground shadow-md transition-[box-shadow,border-color] duration-200",
        selected ? "border-primary shadow-lg ring-2 ring-primary/20" : "hover:border-primary/60",
      )}
      aria-label={`${data.name}, ${inputs.length} inputs and ${outputs.length} outputs${powerLabel ? `, ${powerLabel}` : ""}`}
    >
      <header className="nodrag flex min-h-20 items-center gap-3 rounded-t-[calc(var(--radius-xl)-1px)] border-b bg-muted/35 p-3">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-muted-foreground">
          {data.image?.downloadUrl ? (
            <Image src={data.image.downloadUrl} alt="" fill sizes="48px" unoptimized className="object-contain p-1" />
          ) : (
            <Icon aria-hidden className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{data.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{data.transportEndpointLabel || data.assignedAssetLabel || data.providerPartyName || data.category}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {powerLabel ? <Badge variant="outline">{powerLabel}</Badge> : null}
          <Badge variant={data.fulfillment === "owned" ? "default" : "secondary"} className="capitalize">
            {data.fulfillment}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="nodrag nopan shrink-0"
            aria-expanded="true"
            aria-label={`Collapse ${data.name} details`}
            title="Collapse details"
            onClick={(event) => {
              event.stopPropagation();
              actions?.toggleExpanded(id);
            }}
          >
            <ChevronUpIcon />
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-px bg-border">
        <PortColumn nodeName={data.name} nodeData={data} ports={inputs} position={Position.Left} type="target" showNumber={data.showPortNumbers} showLabel={data.showPortLabels} isConnectable={isConnectable} />
        <PortColumn nodeName={data.name} nodeData={data} ports={outputs} position={Position.Right} type="source" showNumber={data.showPortNumbers} showLabel={data.showPortLabels} isConnectable={isConnectable} />
      </div>
      <footer className="nodrag grid grid-cols-2 gap-px rounded-b-[calc(var(--radius-xl)-1px)] border-t bg-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="rounded-bl-[calc(var(--radius-xl)-1px)] bg-card px-3 py-1.5">{inputs.length} in</span>
        <span className="rounded-br-[calc(var(--radius-xl)-1px)] bg-card px-3 py-1.5 text-right">{outputs.length} out</span>
      </footer>
      <TransportTrunkHandle data={data} />
    </article>
  );
}

function CableAssemblyNode({
  data,
  selected,
  isConnectable,
  inputs,
  outputs,
}: {
  data: SetupNode["data"];
  selected: boolean;
  isConnectable: boolean;
  inputs: EquipmentPort[];
  outputs: EquipmentPort[];
}) {
  const breakout = inputs.length > 1 || outputs.length > 1;
  const kindLabel = breakout ? "Breakout cable" : "Cable";
  return (
    <article
      className={cn(
        "setup-equipment-node relative w-[216px] overflow-visible rounded-xl border bg-card text-card-foreground shadow-md transition-[box-shadow,border-color,transform] duration-200",
        selected ? "border-primary shadow-lg ring-2 ring-primary/25" : "hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg",
      )}
      aria-label={`${data.name}, ${kindLabel.toLowerCase()} with ${inputs.length} input${inputs.length === 1 ? "" : "s"} and ${outputs.length} output${outputs.length === 1 ? "" : "s"}. Double-click to configure.`}
      title={`${data.name} · One physical ${kindLabel.toLowerCase()}`}
    >
      <header className="flex min-h-11 items-center gap-2 rounded-t-[calc(var(--radius-xl)-1px)] border-b bg-muted/35 px-2.5 py-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"
          style={{ color: data.cableAssembly?.color }}
        >
          <CableIcon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{data.name}</span>
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{kindLabel}</span>
        </span>
        <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{inputs.length}→{outputs.length}</Badge>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-stretch bg-border">
        <BreakoutPortColumn ports={inputs} type="target" position={Position.Left} isConnectable={isConnectable} />
        <span className="flex items-center justify-center bg-muted/45 text-muted-foreground" aria-hidden>
          <ArrowRightLeftIcon className="size-3.5" />
        </span>
        <BreakoutPortColumn ports={outputs} type="source" position={Position.Right} isConnectable={isConnectable} align="right" />
      </div>
      <footer className="rounded-b-[calc(var(--radius-xl)-1px)] border-t px-2.5 py-1.5 text-[9px] font-medium text-muted-foreground">
        {breakout ? "All legs count as one cable" : "One specific cable in this chain"}
      </footer>
    </article>
  );
}

function BreakoutPortColumn({
  ports,
  type,
  position,
  isConnectable,
  align = "left",
}: {
  ports: EquipmentPort[];
  type: "source" | "target";
  position: Position;
  isConnectable: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-px bg-card py-1">
      {ports.map((port) => {
        const connector = `${port.connector.label}${port.connector.gender === "none" ? "" : ` ${port.connector.gender}`}`;
        const accessibleLabel = `${port.label ?? `Connector ${port.number}`}, ${connector}`;
        return (
          <div key={port.id} className={cn("relative flex min-h-10 flex-col justify-center px-2 py-1", align === "right" && "items-end text-right")}>
            <Handle
              id={port.id}
              type={type}
              position={position}
              isConnectable={isConnectable}
              aria-label={accessibleLabel}
              title={accessibleLabel}
              className="setup-port-handle"
            />
            <span className="max-w-full truncate text-[10px] font-semibold">{port.label}</span>
            <span className="max-w-full truncate text-[8px] text-muted-foreground">{connector}</span>
          </div>
        );
      })}
    </div>
  );
}

function PortColumn({
  nodeName,
  nodeData,
  ports,
  position,
  type,
  showNumber,
  showLabel,
  isConnectable,
}: {
  nodeName: string;
  nodeData: SetupNode["data"];
  ports: EquipmentPort[];
  position: Position;
  type: "source" | "target";
  showNumber: boolean;
  showLabel: boolean;
  isConnectable: boolean;
}) {
  return (
    <div className="flex min-h-9 flex-col bg-card">
      {ports.length ? ports.map((port) => {
        const label = portDisplayNameForNode({ data: nodeData }, port, showNumber, showLabel);
        const signalPath = nodeData.signalPathLabels?.[port.id];
        const accessibleLabel = portAccessibleLabel(nodeName, port, nodeData.transportChannelLabels?.[port.channelKey ?? ""], signalPath);
        const signalLabel = SIGNAL_TYPES.find((signal) => signal.id === port.signalType)?.label ?? port.signalType;
        const technicalSubtitle = [port.connector.label, port.connector.gender === "none" ? null : port.connector.gender, port.connector.specification, signalLabel].filter(Boolean).join(" · ");
        const subtitle = signalPath?.length ? `${signalPath.join(" → ")} →` : technicalSubtitle;
        return (
          <div key={port.id} className={cn("relative flex min-h-11 flex-col justify-center px-3 py-1.5 text-[11px]", type === "source" && "items-end text-right")} title={accessibleLabel}>
            <Handle
              id={port.id}
              type={type}
              position={position}
              isConnectable={isConnectable}
              aria-label={accessibleLabel}
              className="setup-port-handle"
            />
            <span className="max-w-full truncate font-medium">{label}</span>
            <span className="max-w-full truncate text-[9px] text-muted-foreground">{subtitle}</span>
          </div>
        );
      }) : <span className="px-3 py-2 text-[11px] text-muted-foreground">None</span>}
    </div>
  );
}

function CompactPortHandles({
  nodeName,
  ports,
  position,
  type,
  isConnectable,
  channelLabels,
}: {
  nodeName: string;
  ports: EquipmentPort[];
  position: Position;
  type: "source" | "target";
  isConnectable: boolean;
  channelLabels?: Record<string, string>;
}) {
  const handleSize = ports.length > 12 ? 6 : ports.length > 7 ? 8 : ports.length > 5 ? 10 : ports.length > 2 ? 13 : 18;
  const hitSize = ports.length > 12 ? 14 : ports.length > 7 ? 16 : ports.length > 5 ? 20 : ports.length > 2 ? 24 : 36;
  return ports.map((port, index) => {
    const accessibleLabel = portAccessibleLabel(nodeName, port, channelLabels?.[port.channelKey ?? ""]);
    const top = 10 + ((index + 1) / (ports.length + 1)) * 84;
    const edgeOffset = `${hitSize * -0.5}px`;
    const style: CSSProperties & {
      "--setup-port-size": string;
      "--setup-port-hit-size": string;
    } = {
      top: `${top}px`,
      width: `${hitSize}px`,
      height: `${hitSize}px`,
      border: 0,
      borderRadius: 0,
      background: "transparent",
      boxShadow: "none",
      cursor: "crosshair",
      transform: "translateY(-50%)",
      ...(position === Position.Left ? { left: edgeOffset } : { right: edgeOffset }),
      "--setup-port-size": `${handleSize}px`,
      "--setup-port-hit-size": `${hitSize}px`,
    };
    return (
      <Handle
        key={port.id}
        id={port.id}
        type={type}
        position={position}
        isConnectable={isConnectable}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        style={style}
        className={cn("setup-port-handle setup-port-handle-compact", type === "target" ? "setup-port-handle-input" : "setup-port-handle-output")}
      />
    );
  });
}

function TransportTrunkHandle({ data }: { data: SetupNode["data"] }) {
  if (!data.assemblyId || !data.transportEndpointId) return null;
  const primary = Boolean(data.transportPrimary);
  return (
    <Handle
      id={primary ? "transport-trunk-source" : "transport-trunk-target"}
      type={primary ? "source" : "target"}
      position={primary ? Position.Right : Position.Left}
      isConnectable={false}
      aria-label={`${data.transportEndpointLabel ?? data.name} fixed snake trunk`}
      title="Fixed multicore snake trunk"
      className="setup-transport-trunk-handle"
      style={{ top: "26px", width: "18px", height: "18px", borderWidth: "3px", background: "var(--card)", borderColor: "var(--primary)", cursor: "default" }}
    />
  );
}

function portAccessibleLabel(nodeName: string, port: EquipmentPort, carriedLabel?: string, signalPath?: string[]) {
  return `${nodeName}, ${port.direction} ${port.number}${carriedLabel ? `, Snake channel ${port.number}, ${carriedLabel}` : port.label ? `, ${port.label}` : ""}${signalPath?.length ? `, signal from ${signalPath.join(" through ")}` : ""}, ${port.connector.label} ${port.connector.gender}`;
}
