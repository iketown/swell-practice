"use client";

import { AlertTriangleIcon, CableIcon, PackageCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { CableInspector } from "@/components/setup-designer/cable-inspector";
import { CableInventoryPanel } from "@/components/setup-designer/cable-inventory-panel";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InventoryAsset } from "@/lib/gear/domain";
import type { CableEdge, CableRunGroup, CableRunRow, EquipmentTemplate, EquipmentUsageRow } from "@/lib/setup-designer/domain";
import { cn } from "@/lib/utils";

export function PartsListPanel({
  selectedEdge,
  cableRows,
  cableGroups,
  equipmentRows,
  edges,
  templates,
  assets,
  onCableChange,
  onCableDelete,
  onCableSelect,
  hoveredEdgeId,
  onCableHoverChange,
  onEquipmentSelect,
  onCableInventoryAssign,
  onCableInventoryAutoAssign,
}: {
  selectedEdge: CableEdge | null;
  cableRows: CableRunRow[];
  cableGroups: CableRunGroup[];
  equipmentRows: EquipmentUsageRow[];
  edges: CableEdge[];
  templates: EquipmentTemplate[];
  assets: InventoryAsset[];
  onCableChange: (edge: CableEdge) => void;
  onCableDelete: (edgeId: string) => void;
  onCableSelect: (edgeId: string) => void;
  hoveredEdgeId?: string | null;
  onCableHoverChange?: (edgeId: string | null) => void;
  onEquipmentSelect: (nodeId: string) => void;
  onCableInventoryAssign: (edgeId: string, asset?: InventoryAsset) => void;
  onCableInventoryAutoAssign: (assignments: ReadonlyMap<string, InventoryAsset>) => void;
}) {
  const cableButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!hoveredEdgeId) return;
    const button = cableButtonRefs.current.get(hoveredEdgeId);
    if (!button) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    button.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [hoveredEdgeId]);

  if (selectedEdge) return <CableInspector edge={selectedEdge} onChange={onCableChange} onDelete={onCableDelete} />;

  return (
    <Tabs defaultValue="runs" className="min-h-0 flex-1 overflow-hidden p-3 min-[901px]:max-h-[calc(100dvh-15rem)]">
      <TabsList className="w-full">
        <TabsTrigger value="runs">Runs ({cableRows.length})</TabsTrigger>
        <TabsTrigger value="inventory">Match</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="equipment">Gear ({equipmentRows.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="runs" className="min-h-0 overflow-y-auto">
        {cableRows.length ? <div className="flex flex-col gap-2 py-2">{cableRows.map((row) => (
          <button
            key={row.edgeId}
            ref={(element) => {
              if (element) cableButtonRefs.current.set(row.edgeId, element);
              else cableButtonRefs.current.delete(row.edgeId);
            }}
            type="button"
            onClick={() => onCableSelect(row.edgeId)}
            onMouseEnter={() => onCableHoverChange?.(row.edgeId)}
            onMouseLeave={() => onCableHoverChange?.(null)}
            onFocus={() => onCableHoverChange?.(row.edgeId)}
            onBlur={() => onCableHoverChange?.(null)}
            data-highlighted={hoveredEdgeId === row.edgeId ? "true" : undefined}
            className={cn(
              "flex flex-col gap-1 rounded-lg border bg-background p-2 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary",
              hoveredEdgeId === row.edgeId && "border-primary bg-primary/10 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)]",
            )}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span className="truncate">{row.cable}</span><Badge variant="secondary" className="capitalize">{row.fulfillment}</Badge></span>
            <span className="text-xs text-muted-foreground">{row.from} → {row.to}</span>
            <span className="flex items-center gap-2 text-xs"><span>{row.length ? `${row.length} ${row.lengthUnit}` : "Length needed"}</span>{row.assignedInventoryLabel ? <span>· {row.assignedInventoryLabel}</span> : null}{row.exceptionReason || row.unresolved ? <AlertTriangleIcon aria-label="Needs review" className="size-3.5 text-destructive" /> : null}</span>
          </button>
        ))}</div> : <Empty className="border-0 py-12"><EmptyHeader><CableIcon /><EmptyTitle>No cables yet</EmptyTitle><EmptyDescription>Drag from an output handle to an input handle.</EmptyDescription></EmptyHeader></Empty>}
      </TabsContent>
      <TabsContent value="inventory" className="min-h-0 overflow-y-auto">
        <CableInventoryPanel
          edges={edges}
          cableRows={cableRows}
          templates={templates}
          assets={assets}
          onAssign={onCableInventoryAssign}
          onAutoAssign={onCableInventoryAutoAssign}
          onCableSelect={onCableSelect}
        />
      </TabsContent>
      <TabsContent value="summary" className="min-h-0 overflow-y-auto">
        {cableGroups.length ? <div className="flex flex-col gap-2 py-2">{cableGroups.map((group) => (
          <div key={group.key} className="rounded-lg border bg-background p-2">
            <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold">{group.cable}</span><Badge>{group.quantity}×</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">{group.length ? `${group.length} ${group.lengthUnit}` : "Length TBD"} · {group.owned} owned · {group.rent} rent · {group.buy} buy · {group.unplanned} unplanned</p>
          </div>
        ))}</div> : <Empty className="border-0 py-12"><EmptyHeader><PackageCheckIcon /><EmptyTitle>No cable summary</EmptyTitle><EmptyDescription>Cable groups appear as the patch grows.</EmptyDescription></EmptyHeader></Empty>}
      </TabsContent>
      <TabsContent value="equipment" className="min-h-0 overflow-y-auto">
        {equipmentRows.length ? <div className="flex flex-col gap-2 py-2">{equipmentRows.map((row) => (
          <button key={row.nodeId} type="button" onClick={() => onEquipmentSelect(row.nodeId)} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary">
            <span className="min-w-0"><span className="block truncate text-xs font-semibold">{row.name}</span><span className="block truncate text-xs text-muted-foreground">{row.detail ?? row.assignmentLabel ?? `${row.category} · not mapped`}</span>{row.detail && row.assignmentLabel ? <span className="block truncate text-[10px] text-muted-foreground">{row.assignmentLabel}</span> : null}</span>
            <Badge variant="secondary" className="shrink-0 capitalize">{row.fulfillment}</Badge>
          </button>
        ))}</div> : <Empty className="border-0 py-12"><EmptyHeader><PackageCheckIcon /><EmptyTitle>No equipment used</EmptyTitle><EmptyDescription>Add nodes from the equipment library.</EmptyDescription></EmptyHeader></Empty>}
      </TabsContent>
    </Tabs>
  );
}
