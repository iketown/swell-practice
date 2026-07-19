"use client";

import { GripVerticalIcon } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { DEFAULT_PARTS, type SongAsset, type SongBundle } from "@/lib/domain";
import { saveAssetAssignments } from "@/lib/firestore";
import { cn } from "@/lib/utils";

const assetDragDataType = "application/x-swell-song-asset-assignment";
const partSlugSet = new Set(DEFAULT_PARTS.map((part) => part.slug));

type DraggedAsset = {
  assetId: string;
  sourcePartSlug: string | null;
};

type AssignmentState = Record<string, string[]>;

export function SongAssetAssignmentCard({
  bundle,
  onAssignmentsChanged,
  onEditAsset,
}: {
  bundle: SongBundle;
  onAssignmentsChanged: () => Promise<void>;
  onEditAsset: (asset: SongAsset) => void;
}) {
  const [assignments, setAssignments] = useState<AssignmentState>(() => assignmentStateFromAssets(bundle.assets));
  const [draggedAsset, setDraggedAsset] = useState<DraggedAsset | null>(null);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);

  const assetsByPartSlug = useMemo(
    () =>
      new Map(
        DEFAULT_PARTS.map((part) => [
          part.slug,
          bundle.assets.filter((asset) => assignments[asset.id]?.includes(part.slug)),
        ]),
      ),
    [assignments, bundle.assets],
  );

  const unassignedAssets = useMemo(
    () =>
      bundle.assets.filter(
        (asset) => !assignments[asset.id]?.some((partSlug) => partSlugSet.has(partSlug)),
      ),
    [assignments, bundle.assets],
  );

  function editAsset(asset: SongAsset) {
    onEditAsset({
      ...asset,
      assignedPartSlugs: assignments[asset.id] ?? [],
    });
  }

  async function dropAsset(targetPartSlug: string | null, payload: DraggedAsset, copy: boolean) {
    const currentPartSlugs = assignments[payload.assetId] ?? [];
    const nextPartSlugs = new Set(currentPartSlugs);

    if (targetPartSlug) {
      if (!copy && payload.sourcePartSlug && payload.sourcePartSlug !== targetPartSlug) {
        nextPartSlugs.delete(payload.sourcePartSlug);
      }

      nextPartSlugs.add(targetPartSlug);
    } else if (payload.sourcePartSlug) {
      nextPartSlugs.delete(payload.sourcePartSlug);
    }

    const nextAssignments = [...nextPartSlugs];

    if (sameStrings(currentPartSlugs, nextAssignments)) {
      return;
    }

    setAssignments((current) => ({
      ...current,
      [payload.assetId]: nextAssignments,
    }));
    setPendingAssetId(payload.assetId);

    try {
      await saveAssetAssignments(bundle, payload.assetId, nextAssignments);
      await onAssignmentsChanged();

      const targetLabel = targetPartSlug?.toUpperCase();
      if (!targetLabel) {
        toast.success(`Removed from ${payload.sourcePartSlug?.toUpperCase()}`);
      } else if (copy && payload.sourcePartSlug) {
        toast.success(`Copied to ${targetLabel}`);
      } else {
        toast.success(`Moved to ${targetLabel}`);
      }
    } catch (caught) {
      setAssignments((current) => ({
        ...current,
        [payload.assetId]: currentPartSlugs,
      }));
      toast.error("Asset assignment could not be saved", {
        description: caught instanceof Error ? caught.message : "Please try again.",
      });
    } finally {
      setPendingAssetId(null);
      setDraggedAsset(null);
    }
  }

  return (
    <Card className="bg-secondary/45">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>ASSETS</CardTitle>
            <CardDescription>
              Drag to move. Hold Alt or Option while dragging to copy.
            </CardDescription>
          </div>
          <Badge variant="secondary">{bundle.assets.length} uploaded</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {bundle.assets.length ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {DEFAULT_PARTS.map((part) => (
                <PartDropZone
                  assetDisabled={(assetId) => pendingAssetId === assetId}
                  assets={assetsByPartSlug.get(part.slug) ?? []}
                  draggedAsset={draggedAsset}
                  key={part.slug}
                  label={part.slug.toUpperCase()}
                  onDragEnd={() => setDraggedAsset(null)}
                  onDragStart={setDraggedAsset}
                  onDrop={(payload, copy) => void dropAsset(part.slug, payload, copy)}
                  onEditAsset={editAsset}
                  partSlug={part.slug}
                />
              ))}
            </div>

            <UnassignedDropZone
              assets={unassignedAssets}
              draggedAsset={draggedAsset}
              isPending={(assetId) => pendingAssetId === assetId}
              onDragEnd={() => setDraggedAsset(null)}
              onDragStart={setDraggedAsset}
              onDrop={(payload) => void dropAsset(null, payload, false)}
              onEditAsset={editAsset}
            />
          </>
        ) : (
          <Empty className="min-h-36 border border-dashed bg-card/55">
            <EmptyHeader>
              <EmptyTitle>No assets uploaded yet</EmptyTitle>
              <EmptyDescription>
                Uploaded files will appear in their filename-matched parts.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function PartDropZone({
  assetDisabled,
  assets,
  draggedAsset,
  label,
  onDragEnd,
  onDragStart,
  onDrop,
  onEditAsset,
  partSlug,
}: {
  assetDisabled: (assetId: string) => boolean;
  assets: SongAsset[];
  draggedAsset: DraggedAsset | null;
  label: string;
  onDragEnd: () => void;
  onDragStart: (payload: DraggedAsset) => void;
  onDrop: (payload: DraggedAsset, copy: boolean) => void;
  onEditAsset: (asset: SongAsset) => void;
  partSlug: string;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section
      aria-labelledby={`${partSlug}-asset-label`}
      className={cn(
        "flex min-h-32 min-w-0 flex-col gap-2 rounded-lg border border-dashed bg-card/65 p-2 transition-[background-color,border-color,box-shadow] duration-200",
        isOver && "border-primary bg-primary/5 shadow-sm",
      )}
      onDragEnter={(event) => {
        if (!draggedAsset) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOver(false);
        }
      }}
      onDragOver={(event) => {
        if (!draggedAsset) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = event.altKey ? "copy" : "move";
        setIsOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        const payload = readDraggedAsset(event, draggedAsset);
        if (payload) onDrop(payload, event.altKey);
      }}
    >
      <h3
        className="text-muted-foreground text-xs font-semibold tracking-[0.08em]"
        id={`${partSlug}-asset-label`}
      >
        {label}
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {assets.length ? (
          assets.map((asset) => (
            <DraggableAssetBadge
              asset={asset}
              disabled={assetDisabled(asset.id)}
              key={`${partSlug}-${asset.id}`}
              onDragEnd={onDragEnd}
              onDragStart={() => onDragStart({ assetId: asset.id, sourcePartSlug: partSlug })}
              onEdit={() => onEditAsset(asset)}
              sourcePartSlug={partSlug}
            />
          ))
        ) : (
          <span className="text-muted-foreground/75 m-auto text-center text-xs">
            No asset
          </span>
        )}
      </div>
    </section>
  );
}

function UnassignedDropZone({
  assets,
  draggedAsset,
  isPending,
  onDragEnd,
  onDragStart,
  onDrop,
  onEditAsset,
}: {
  assets: SongAsset[];
  draggedAsset: DraggedAsset | null;
  isPending: (assetId: string) => boolean;
  onDragEnd: () => void;
  onDragStart: (payload: DraggedAsset) => void;
  onDrop: (payload: DraggedAsset) => void;
  onEditAsset: (asset: SongAsset) => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section aria-labelledby="unassigned-assets-label" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold" id="unassigned-assets-label">
          Unassigned
        </h3>
        <span className="text-muted-foreground text-xs">
          Drop here to remove an asset from its current part.
        </span>
      </div>
      <div
        className={cn(
          "flex min-h-20 flex-wrap content-start gap-2 rounded-lg border border-dashed bg-card/65 p-2 transition-[background-color,border-color,box-shadow] duration-200",
          isOver && "border-primary bg-primary/5 shadow-sm",
        )}
        onDragEnter={(event) => {
          if (!draggedAsset?.sourcePartSlug) return;
          event.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsOver(false);
          }
        }}
        onDragOver={(event) => {
          if (!draggedAsset?.sourcePartSlug) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          const payload = readDraggedAsset(event, draggedAsset);
          if (payload?.sourcePartSlug) onDrop(payload);
        }}
      >
        {assets.length ? (
          assets.map((asset) => (
            <DraggableAssetBadge
              asset={asset}
              disabled={isPending(asset.id)}
              key={`unassigned-${asset.id}`}
              onDragEnd={onDragEnd}
              onDragStart={() => onDragStart({ assetId: asset.id, sourcePartSlug: null })}
              onEdit={() => onEditAsset(asset)}
              sourcePartSlug={null}
            />
          ))
        ) : (
          <span className="text-muted-foreground/75 m-auto text-center text-xs">
            Every asset is assigned.
          </span>
        )}
      </div>
    </section>
  );
}

function DraggableAssetBadge({
  asset,
  disabled,
  onDragEnd,
  onDragStart,
  onEdit,
  sourcePartSlug,
}: {
  asset: SongAsset;
  disabled: boolean;
  onDragEnd: () => void;
  onDragStart: () => void;
  onEdit: () => void;
  sourcePartSlug: string | null;
}) {
  const label = asset.displayName || asset.filename;

  return (
    <Badge
      aria-label={`${label}. ${sourcePartSlug ? `Assigned to ${sourcePartSlug.toUpperCase()}.` : "Unassigned."} Drag to move, or select to edit assignments.`}
      className={cn(
        "h-auto min-h-8 max-w-full cursor-grab justify-start rounded-md px-2 py-1.5 shadow-xs active:cursor-grabbing",
        disabled && "pointer-events-none opacity-60",
      )}
      draggable={!disabled}
      onClick={() => {
        if (!disabled) onEdit();
      }}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        const payload = { assetId: asset.id, sourcePartSlug };
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData(assetDragDataType, JSON.stringify(payload));
        event.dataTransfer.setData("text/plain", asset.id);
        onDragStart();
      }}
      render={<button disabled={disabled} type="button" />}
      title={`${label}. Drag to move, hold Alt or Option to copy, or click to edit.`}
      variant="outline"
    >
      <GripVerticalIcon aria-hidden data-icon="inline-start" />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

function assignmentStateFromAssets(assets: SongAsset[]): AssignmentState {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset.assignedPartSlugs]));
}

function readDraggedAsset(event: DragEvent, fallback: DraggedAsset | null) {
  const serialized = event.dataTransfer.getData(assetDragDataType);

  if (!serialized) return fallback;

  try {
    return JSON.parse(serialized) as DraggedAsset;
  } catch {
    return fallback;
  }
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}
