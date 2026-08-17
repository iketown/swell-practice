"use client";

import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type XYPosition,
} from "@xyflow/react";
import { GripVerticalIcon, UnlinkIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  connectorReferenceKey,
  inventoryAssetConnectors,
  inventoryConnectorsMate,
  usedInternalConnectorKeys,
  type InventoryConnectorOption,
} from "@/lib/gear/connections";
import type {
  InventoryAsset,
  InventoryConnectionSet,
  InventoryConnectorReference,
} from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { cn } from "@/lib/utils";

type GearNodeConnector = {
  id: string;
  label: string;
  side: "left" | "right";
  used: boolean;
};

type GearConnectionNodeData = {
  assetTag: string;
  label: string;
  connectors: GearNodeConnector[];
  current: boolean;
  disabled: boolean;
  onRemove?: () => void;
} & Record<string, unknown>;

type GearConnectionNode = Node<GearConnectionNodeData, "gearItem">;

type PhysicalJoinEdgeData = {
  disabled: boolean;
  onRemove: () => void;
} & Record<string, unknown>;

type PhysicalJoinEdge = Edge<PhysicalJoinEdgeData, "physicalJoin">;

const nodeTypes: NodeTypes = { gearItem: GearItemNode };
const edgeTypes: EdgeTypes = { physicalJoin: PhysicalJoinEdgeComponent };

export function GearConnectionsCanvas({
  currentAssetId,
  memberAssets,
  definitionsById,
  value,
  onConnect,
  onDisconnect,
  onRemoveMember,
  onMoveMember,
  disabled = false,
}: {
  currentAssetId: string;
  memberAssets: InventoryAsset[];
  definitionsById: ReadonlyMap<string, EquipmentTemplate>;
  value: InventoryConnectionSet | null;
  onConnect: (a: InventoryConnectorReference, b: InventoryConnectorReference) => void;
  onDisconnect: (linkId: string) => void;
  onRemoveMember: (assetId: string) => void;
  onMoveMember: (assetId: string, position: XYPosition) => void;
  disabled?: boolean;
}) {
  const connectorsByAssetId = useMemo(() => new Map(memberAssets.map((member) => [
    member.id,
    inventoryAssetConnectors(member, definitionsById.get(member.definitionId)),
  ])), [definitionsById, memberAssets]);
  const connectorByReferenceKey = useMemo(() => new Map(
    [...connectorsByAssetId.values()].flat().map((connector) => [
      connectorReferenceKey(connectorReference(connector)),
      connector,
    ]),
  ), [connectorsByAssetId]);
  const usedConnectorKeys = useMemo(() => value ? usedInternalConnectorKeys(value) : new Set<string>(), [value]);
  const columns = Math.min(3, Math.max(1, memberAssets.length));
  const [nodePositions, setNodePositions] = useState<Record<string, XYPosition>>(() => Object.fromEntries(
    memberAssets.map((member, index) => [
      member.id,
      value?.nodePositions?.[member.id] ?? defaultNodePosition(index, columns),
    ]),
  ));
  const nodes = useMemo<GearConnectionNode[]>(() => memberAssets.map((member, index) => ({
    id: member.id,
    type: "gearItem",
    position: nodePositions[member.id] ?? defaultNodePosition(index, columns),
    draggable: !disabled,
    dragHandle: ".gear-connection-node-drag-handle",
    selectable: false,
    ariaLabel: `${member.assetTag}, ${member.label}`,
    data: {
      assetTag: member.assetTag,
      label: member.label,
      connectors: (connectorsByAssetId.get(member.id) ?? []).map((connector) => ({
        id: connector.id,
        label: connector.label,
        side: connectorSide(connector),
        used: usedConnectorKeys.has(connectorReferenceKey(connectorReference(connector))),
      })),
      current: member.id === currentAssetId,
      disabled,
      onRemove: member.id === currentAssetId ? undefined : () => onRemoveMember(member.id),
    },
  })), [columns, connectorsByAssetId, currentAssetId, disabled, memberAssets, nodePositions, onRemoveMember, usedConnectorKeys]);
  const edges = useMemo<PhysicalJoinEdge[]>(() => (value?.links ?? []).map((link) => ({
    id: link.id,
    source: link.a.assetId,
    sourceHandle: link.a.connectorId,
    target: link.b.assetId,
    targetHandle: link.b.connectorId,
    type: "physicalJoin",
    selectable: false,
    data: {
      disabled,
      onRemove: () => onDisconnect(link.id),
    },
  })), [disabled, onDisconnect, value?.links]);

  function resolveConnection(connection: Connection | PhysicalJoinEdge) {
    if (!connection.sourceHandle || !connection.targetHandle || connection.source === connection.target) return null;
    const a: InventoryConnectorReference = { assetId: connection.source, connectorId: connection.sourceHandle };
    const b: InventoryConnectorReference = { assetId: connection.target, connectorId: connection.targetHandle };
    const left = connectorByReferenceKey.get(connectorReferenceKey(a));
    const right = connectorByReferenceKey.get(connectorReferenceKey(b));
    if (!left || !right) return null;
    if (usedConnectorKeys.has(connectorReferenceKey(a)) || usedConnectorKeys.has(connectorReferenceKey(b))) return null;
    return inventoryConnectorsMate(left.connector, right.connector) ? { a, b } : null;
  }

  function handleNodesChange(changes: NodeChange<GearConnectionNode>[]) {
    const positionChanges = changes.filter((change) => change.type === "position" && change.position);
    if (!positionChanges.length) return;
    setNodePositions((current) => {
      const next = { ...current };
      for (const change of positionChanges) {
        if (change.type === "position" && change.position) next[change.id] = change.position;
      }
      return next;
    });
  }

  return (
    <div className="h-80 overflow-hidden rounded-md border bg-background" aria-label="Physical connection canvas">
      <ReactFlow
        key={memberAssets.map((member) => member.id).join(":")}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={(connection) => Boolean(resolveConnection(connection))}
        onConnect={(connection) => {
          const resolved = resolveConnection(connection);
          if (resolved) onConnect(resolved.a, resolved.b);
        }}
        onNodesChange={handleNodesChange}
        onNodeDragStop={(_, node) => onMoveMember(node.id, {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        })}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.4}
        zoomOnScroll={false}
        panOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function GearItemNode({ data }: NodeProps<GearConnectionNode>) {
  const leftConnectors = data.connectors.filter((connector) => connector.side === "left");
  const rightConnectors = data.connectors.filter((connector) => connector.side === "right");

  return (
    <div className={cn(
      "w-60 overflow-hidden rounded-md border-2 bg-card text-card-foreground shadow-sm",
      data.current ? "border-primary" : "border-border",
    )}>
      <div
        className="gear-connection-node-drag-handle flex min-h-12 cursor-grab touch-none items-start gap-2 border-b bg-muted/40 px-3 py-2 active:cursor-grabbing"
        title="Drag to arrange"
      >
        <GripVerticalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">{data.assetTag}</p>
          <p className="truncate text-sm font-medium" title={data.label}>{data.label}</p>
        </div>
        {data.onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="nodrag nopan -mr-1 -mt-0.5"
            aria-label={`Remove ${data.assetTag} ${data.label} from this connection canvas`}
            onClick={data.onRemove}
            disabled={data.disabled}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-16 grid-cols-2 divide-x">
        <ConnectorColumn connectors={leftConnectors} side="left" disabled={data.disabled} />
        <ConnectorColumn connectors={rightConnectors} side="right" disabled={data.disabled} />
      </div>
    </div>
  );
}

function ConnectorColumn({
  connectors,
  side,
  disabled,
}: {
  connectors: GearNodeConnector[];
  side: "left" | "right";
  disabled: boolean;
}) {
  if (!connectors.length) {
    return <div className="min-h-16" aria-hidden />;
  }

  return (
    <div className="flex flex-col justify-center py-1">
      {connectors.map((connector) => (
        <div key={connector.id} className="relative flex min-h-10 items-center px-3 py-1.5">
          <Handle
            id={connector.id}
            type={side === "left" ? "target" : "source"}
            position={side === "left" ? Position.Left : Position.Right}
            isConnectable={!disabled && !connector.used}
            className={cn(
              "!size-3 !border-2 !border-background !bg-primary transition-transform hover:!scale-125",
              connector.used && "!bg-foreground",
            )}
            aria-label={`${connector.label}${connector.used ? ", connected" : ", drag to connect"}`}
          />
          <span className={cn(
            "w-full text-[11px] leading-tight",
            side === "right" && "text-right",
            connector.used ? "font-medium text-foreground" : "text-muted-foreground",
          )}>
            {connector.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function PhysicalJoinEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<PhysicalJoinEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: "var(--primary)", strokeWidth: 3 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="rounded-full bg-background"
            aria-label="Disconnect this physical join"
            onClick={data?.onRemove}
            disabled={data?.disabled}
          >
            <UnlinkIcon />
          </Button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function connectorReference(connector: InventoryConnectorOption): InventoryConnectorReference {
  return { assetId: connector.assetId, connectorId: connector.id };
}

function connectorSide(connector: InventoryConnectorOption): "left" | "right" {
  if (connector.id.startsWith("cable:end1:")) return "left";
  if (connector.id.startsWith("cable:end2:")) return "right";
  return connector.defaultDirection === "input" ? "left" : "right";
}

function defaultNodePosition(index: number, columns: number): XYPosition {
  return {
    x: (index % columns) * 304,
    y: Math.floor(index / columns) * 220,
  };
}
