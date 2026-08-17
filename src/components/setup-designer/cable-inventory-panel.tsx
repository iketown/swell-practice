"use client";

import { CableIcon, CheckIcon, RulerIcon, WandSparklesIcon } from "lucide-react";
import { useMemo } from "react";

import { CableColorSwatch } from "@/components/gear/cable-color-swatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cableColorLabel,
  formatCableLength,
  isCableInventoryAsset,
  type InventoryAsset,
} from "@/lib/gear/domain";
import {
  buildCableInventoryMatches,
  cableInventoryAssignmentLabel,
} from "@/lib/setup-designer/cable-matching";
import type { CableEdge, CableRunRow, EquipmentTemplate } from "@/lib/setup-designer/domain";

export function CableInventoryPanel({
  edges,
  cableRows,
  templates,
  assets,
  onAssign,
  onAutoAssign,
  onCableSelect,
}: {
  edges: CableEdge[];
  cableRows: CableRunRow[];
  templates: EquipmentTemplate[];
  assets: InventoryAsset[];
  onAssign: (edgeId: string, asset?: InventoryAsset) => void;
  onAutoAssign: (assignments: ReadonlyMap<string, InventoryAsset>) => void;
  onCableSelect: (edgeId: string) => void;
}) {
  const matches = useMemo(() => buildCableInventoryMatches(edges, templates, assets), [assets, edges, templates]);
  const matchByEdgeId = useMemo(() => new Map(matches.map((match) => [match.edgeId, match])), [matches]);
  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const assignedEdgeByAssetId = useMemo(() => new Map(
    edges.flatMap((edge) => (edge.data.assignedInventoryAssetIds?.length
      ? edge.data.assignedInventoryAssetIds
      : edge.data.assignedInventoryAssetId ? [edge.data.assignedInventoryAssetId] : [])
      .map((assetId) => [assetId, edge.id] as const)),
  ), [edges]);
  const suggestedAssignments = useMemo(() => new Map(
    matches.flatMap((match) => match.suggestedAsset ? [[match.edgeId, match.suggestedAsset] as const] : []),
  ), [matches]);
  const availableCableCount = assets.filter((asset) => isCableInventoryAsset(asset) && asset.lifecycleStatus === "active").length;
  const measuredCount = matches.filter((match) => match.requiredInches).length;
  const matchedCount = suggestedAssignments.size;
  const connectedCount = cableRows.filter((row) => (edgeById.get(row.edgeId)?.data.assignedInventoryAssetIds?.length ?? 0) > 1).length;
  const suppliedCount = Math.min(cableRows.length, matchedCount + connectedCount);

  if (!cableRows.length) return (
    <Empty className="border-0 py-12">
      <EmptyHeader>
        <CableIcon />
        <EmptyTitle>No cable runs to match</EmptyTitle>
        <EmptyDescription>Build the SIGNAL routes first, then place the gear in STAGE to calculate lengths.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="flex min-h-0 flex-col gap-3 py-2">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/25 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={suppliedCount === cableRows.length ? "secondary" : "outline"}>{suppliedCount}/{cableRows.length} supplied</Badge>
          <Badge variant="outline">{availableCableCount} on hand</Badge>
          {measuredCount < cableRows.length ? <Badge variant="destructive">{cableRows.length - measuredCount} need length</Badge> : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Longer runs are assigned first. Each run gets the shortest on-hand cable that has matching ends and reaches the measured distance.</p>
        <Button size="sm" onClick={() => onAutoAssign(suggestedAssignments)} disabled={!matchedCount}>
          <WandSparklesIcon data-icon="inline-start" />
          Assign best matches
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {cableRows.map((row) => {
          const edge = edgeById.get(row.edgeId);
          const match = matchByEdgeId.get(row.edgeId);
          if (!edge) return null;
          const connectedAssetIds = edge.data.assignedInventoryAssetIds ?? [];
          const connectedAssets = connectedAssetIds.flatMap((assetId) => {
            const connectedAsset = assetById.get(assetId);
            return connectedAsset ? [connectedAsset] : [];
          });
          const fixedConnectedAssembly = connectedAssetIds.length > 1;
          if (!match && !fixedConnectedAssembly) return null;
          const assignedAsset = edge.data.assignedInventoryAssetId ? assetById.get(edge.data.assignedInventoryAssetId) : undefined;
          const recommendedAsset = match?.suggestedAsset;
          const statusText = fixedConnectedAssembly
            ? `Kept connected: ${edge.data.assignedInventoryLabel ?? connectedAssets.map((asset) => asset.assetTag).join(" + ")}`
            : assignedAsset
            ? cableInventoryAssignmentLabel(assignedAsset)
            : recommendedAsset
              ? `Recommended: ${cableInventoryAssignmentLabel(recommendedAsset)}`
              : shortageReason(match?.requiredInches, match?.compatibleAssets ?? []);

          return (
            <article key={row.edgeId} className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
              <button type="button" onClick={() => onCableSelect(row.edgeId)} className="flex min-w-0 flex-col gap-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{row.cable}</span>
                  <Badge variant={fixedConnectedAssembly || assignedAsset ? "secondary" : recommendedAsset ? "outline" : "destructive"}>
                    {fixedConnectedAssembly || assignedAsset ? <CheckIcon data-icon="inline-start" /> : null}
                    {fixedConnectedAssembly ? "Connected gear" : match?.requiredInches ? formatCableLength(match.requiredInches) : "Unmeasured"}
                  </Badge>
                </span>
                <span className="truncate text-xs text-muted-foreground">{row.from} → {row.to}</span>
              </button>

              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <RulerIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>{statusText}</span>
              </p>

              {fixedConnectedAssembly ? (
                <Field>
                  <FieldLabel>Inventory items</FieldLabel>
                  <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/25 p-2.5">
                    {connectedAssets.map((asset) => <Badge key={asset.id} variant="secondary">{asset.assetTag}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground">These items are supplied together and cannot be reassigned as a single cable.</p>
                </Field>
              ) : match ? <Field>
                <FieldLabel htmlFor={`cable-match-${row.edgeId}`}>Inventory cable</FieldLabel>
                <Select
                  value={assignedAsset?.id ?? "unassigned"}
                  onValueChange={(value) => onAssign(row.edgeId, value && value !== "unassigned" ? assetById.get(value) : undefined)}
                >
                  <SelectTrigger id={`cable-match-${row.edgeId}`} className="w-full">
                    <SelectValue>{assignedAsset ? <><CableColorSwatch color={assignedAsset.cableColor ?? "black"} />{formatCableLength(assignedAsset.cableLengthInches)} · {assignedAsset.assetTag}</> : "Not assigned"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="unassigned">Not assigned</SelectItem>
                    {match.suitableAssets.map((asset) => {
                      const assignedEdgeId = assignedEdgeByAssetId.get(asset.id);
                      const usedElsewhere = Boolean(assignedEdgeId && assignedEdgeId !== row.edgeId);
                      return (
                        <SelectItem key={asset.id} value={asset.id} disabled={usedElsewhere}>
                          <CableColorSwatch color={asset.cableColor ?? "black"} />
                          {formatCableLength(asset.cableLengthInches)} · {asset.assetTag}{asset.cableColor ? ` · ${cableColorLabel(asset.cableColor)}` : ""}{usedElsewhere ? " · Used" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup></SelectContent>
                </Select>
              </Field> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function shortageReason(requiredInches: number | undefined, compatibleAssets: InventoryAsset[]) {
  if (!requiredInches) return "Measure this run in STAGE before assigning inventory.";
  if (!compatibleAssets.length) return "No on-hand cable has these connector ends.";
  const longest = compatibleAssets.at(-1);
  if ((longest?.cableLengthInches ?? 0) < requiredInches) {
    return `No cable is long enough. Longest matching cable: ${formatCableLength(longest?.cableLengthInches)}.`;
  }
  return "Suitable cables are allocated to longer runs.";
}
