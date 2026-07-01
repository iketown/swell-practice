"use client";

import Link from "next/link";
import { CheckIcon, PencilIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

import { AppShell } from "@/components/app-shell";
import { AssetLinks } from "@/components/asset-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { SongAsset, SongBundle } from "@/lib/domain";
import { getSongBundle, saveAssetAssignments, uploadSongAsset } from "@/lib/firestore";

export function SongPageClient({ slug }: { slug: string }) {
  const admin = useAdmin();
  const [bundle, setBundle] = useState<SongBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingAsset, setEditingAsset] = useState<SongAsset | null>(null);

  useEffect(() => {
    let active = true;

    getSongBundle(slug)
      .then((next) => {
        if (active) setBundle(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!bundle || !files.length) return;
      setUploading(true);
      try {
        for (const file of files) {
          await uploadSongAsset(bundle, file);
        }
        setBundle(await getSongBundle(slug));
      } finally {
        setUploading(false);
      }
    },
    [bundle, slug],
  );

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!bundle) {
    return (
      <AppShell>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Song not found</EmptyTitle>
            <EmptyDescription>No song exists at `/songs/{slug}` yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  }

  const assetMap = new Map(bundle.assets.map((asset) => [asset.id, asset]));
  const assignedAssetCount = bundle.assets.filter((asset) => asset.assignedPartSlugs.length > 0).length;

  return (
    <AppShell>
      <section className="swell-panel p-4 sm:p-5">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <p className="swell-page-kicker">Song</p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{bundle.song.title.toUpperCase()}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{bundle.assets.length} assets</Badge>
              <Badge variant="outline">{assignedAssetCount} assigned</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {bundle.parts.map((part) => (
              <Button key={part.slug} render={<Link href={`/parts/${part.slug}`} />} variant="outline" size="sm" nativeButton={false} className="bg-card">
                {part.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {admin.isAdmin ? <UploadPanel onDrop={onDrop} uploading={uploading} /> : null}

      {admin.isAdmin ? <AssetAssignmentPanel bundle={bundle} onEditAsset={setEditingAsset} /> : null}

      <section className="grid gap-2.5">
        {bundle.parts.map((part) => {
          const assets = part.assetIds.map((assetId) => assetMap.get(assetId)).filter((asset): asset is SongAsset => Boolean(asset));

          return (
            <Card key={part.slug} size="sm" className="transition-colors hover:bg-muted/35">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/parts/${part.slug}`} className="hover:underline">
                    {part.label}
                  </Link>
                  <Badge variant="secondary">{assets.length} files</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <AssetLinks assets={assets} />
              </CardContent>
            </Card>
          );
        })}
      </section>

      {admin.isAdmin && editingAsset ? (
        <AssignmentDialog
          bundle={bundle}
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSaved={async () => {
            setEditingAsset(null);
            setBundle(await getSongBundle(slug));
          }}
        />
      ) : null}
    </AppShell>
  );
}

function AssetAssignmentPanel({ bundle, onEditAsset }: { bundle: SongBundle; onEditAsset: (asset: SongAsset) => void }) {
  return (
    <Card className="bg-secondary/45">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>ASSETS</span>
          <Badge variant="secondary">{bundle.assets.length} uploaded</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bundle.assets.length ? (
          <div className="flex flex-wrap gap-2">
            {bundle.assets.map((asset) => (
              <Button key={asset.id} variant="secondary" size="sm" onClick={() => onEditAsset(asset)}>
                <PencilIcon data-icon="inline-start" />
                {asset.displayName || asset.filename}
              </Button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No assets uploaded yet</span>
        )}
      </CardContent>
    </Card>
  );
}

function UploadPanel({ onDrop, uploading }: { onDrop: (files: File[]) => Promise<void>; uploading: boolean }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => void onDrop(files),
    multiple: true,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload assets</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-secondary/55 p-5 text-center transition-colors hover:bg-accent"
        >
          <input {...getInputProps()} />
          <span className="grid size-10 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
            <UploadIcon aria-hidden />
          </span>
          <div className="grid gap-1">
            <p className="font-medium">{uploading ? "Uploading..." : isDragActive ? "Drop files here" : "Drop mp3s, PDFs, videos, or zips here"}</p>
            <p className="text-sm text-muted-foreground">Filenames like `voc_1`, `allvox`, `guit_a`, or `all` will suggest part assignments.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentDialog({
  bundle,
  asset,
  onClose,
  onSaved,
}: {
  bundle: SongBundle;
  asset: SongAsset;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(() => new Set(asset.assignedPartSlugs));
  const [saving, setSaving] = useState(false);

  const assignedCount = useMemo(() => selected.size, [selected]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>{asset.displayName || asset.filename}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {bundle.parts.map((part) => (
            <Field key={part.slug} orientation="horizontal">
              <Checkbox
                id={`${asset.id}-${part.slug}`}
                checked={selected.has(part.slug)}
                onCheckedChange={(checked) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked) next.add(part.slug);
                    else next.delete(part.slug);
                    return next;
                  });
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor={`${asset.id}-${part.slug}`}>{part.label}</FieldLabel>
                <FieldDescription>
                  {asset.suggestedPartSlugs.includes(part.slug) ? "Suggested from filename" : "Manual assignment"}
                </FieldDescription>
              </FieldContent>
            </Field>
          ))}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setSaving(true);
              await saveAssetAssignments(bundle, asset.id, [...selected]);
              await onSaved();
            }}
            disabled={saving}
          >
            <CheckIcon data-icon="inline-start" />
            {saving ? "Saving..." : `Save ${assignedCount} assignments`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
