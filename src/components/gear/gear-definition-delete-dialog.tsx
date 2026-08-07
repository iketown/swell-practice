"use client";

import { LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { lifecycleLabel, type InventoryAsset } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

export function GearDefinitionDeleteDialog({
  definition,
  assets,
  onDelete,
}: {
  definition: EquipmentTemplate;
  assets: InventoryAsset[];
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteDefinition() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this definition.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (deleting) return;
      setOpen(nextOpen);
      if (!nextOpen) setError(null);
    }}>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>
        <Trash2Icon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia><Trash2Icon aria-hidden /></AlertDialogMedia>
          <AlertDialogTitle>Delete {definition.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {assets.length
              ? `This will also permanently delete ${assets.length} inventory item${assets.length === 1 ? "" : "s"}, including check-in history. Setup assignments using these items will be cleared.`
              : "This removes the definition from the active catalog. Existing setup nodes keep their saved definition snapshots."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {assets.length ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">These items will be deleted:</p>
            <ul className="max-h-56 overflow-y-auto rounded-lg border bg-muted/30">
              {assets.map((asset) => (
                <li key={asset.id} className="grid gap-0.5 border-b px-3 py-2 text-sm last:border-b-0">
                  <span className="font-medium">{asset.label}</span>
                  <span className="text-muted-foreground">{asset.assetTag} · {lifecycleLabel(asset.lifecycleStatus)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Keep definition</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void deleteDefinition()} disabled={deleting}>
            {deleting ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Trash2Icon data-icon="inline-start" />}
            {deleting
              ? "Deleting..."
              : assets.length
                ? `Delete definition and ${assets.length} item${assets.length === 1 ? "" : "s"}`
                : "Delete definition"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
