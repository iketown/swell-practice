"use client";

import Link from "next/link";
import { CheckIcon, ClipboardListIcon, ImageIcon, PencilIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getSongBundle, saveAssetAssignments, saveVideoThumbnail, uploadSongAsset } from "@/lib/firestore";

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
  return (
    <AppShell>
      <header className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:py-2">
        <h1 className="swell-song-title">{bundle.song.title}</h1>
        {admin.isAdmin ? (
          <Button render={<Link href={`/assignments/${bundle.song.slug}`} />} variant="secondary" nativeButton={false}>
            <ClipboardListIcon data-icon="inline-start" />
            Assign members
          </Button>
        ) : null}
      </header>

      {admin.isAdmin ? <UploadPanel onDrop={onDrop} uploading={uploading} /> : null}

      {admin.isAdmin ? <AssetAssignmentPanel bundle={bundle} onEditAsset={setEditingAsset} /> : null}

      <section className="grid gap-2.5">
        {bundle.parts.map((part) => {
          const assets = part.assetIds.map((assetId) => assetMap.get(assetId)).filter((asset): asset is SongAsset => Boolean(asset));

          return (
            <Card
              key={part.slug}
              size="sm"
              className="transform-gpu transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:shadow-[0_18px_42px_-32px_var(--swell-espresso)]"
            >
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
          onAssetUpdated={async () => {
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
            <p className="font-medium">{uploading ? "Uploading..." : isDragActive ? "Drop files here" : "Drop MP3s, PDFs, MP4s, or ZIPs here"}</p>
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
  onAssetUpdated,
}: {
  bundle: SongBundle;
  asset: SongAsset;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAssetUpdated: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(() => new Set(asset.assignedPartSlugs));
  const [saving, setSaving] = useState(false);

  const assignedCount = useMemo(() => selected.size, [selected]);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
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
        {asset.fileType === "video" ? (
          <VideoThumbnailEditor bundle={bundle} asset={asset} onAssetUpdated={onAssetUpdated} />
        ) : null}
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

function VideoThumbnailEditor({
  bundle,
  asset,
  onAssetUpdated,
}: {
  bundle: SongBundle;
  asset: SongAsset;
  onAssetUpdated: () => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState(asset.thumbnailUrl);
  const [frameTime, setFrameTime] = useState(asset.thumbnailTime ?? 0);
  const [savedThumbnailTime, setSavedThumbnailTime] = useState(asset.thumbnailTime);
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const playable = Boolean(asset.downloadUrl && asset.downloadUrl !== "#");

  async function setThumbnail() {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setThumbnailError("Wait for the video frame to load, then try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setThumbnailError("This video frame is not ready yet.");
      return;
    }

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setThumbnailError("Your browser could not create a thumbnail from this video.");
      return;
    }

    setSavingThumbnail(true);
    setThumbnailError(null);

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the thumbnail image."))), "image/jpeg", 0.88);
      });
      const saved = await saveVideoThumbnail(bundle, asset, thumbnail, video.currentTime);
      setThumbnailUrl(saved.thumbnailUrl);
      setFrameTime(saved.thumbnailTime);
      setSavedThumbnailTime(saved.thumbnailTime);
      await onAssetUpdated();
    } catch (caught) {
      setThumbnailError(caught instanceof Error ? caught.message : "Could not save the thumbnail.");
    } finally {
      setSavingThumbnail(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/35 p-3" aria-labelledby={`${asset.id}-thumbnail-title`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 id={`${asset.id}-thumbnail-title`} className="text-sm font-medium">Video thumbnail</h3>
          <p className="text-sm text-muted-foreground">Scrub to the frame you want, then save it as this video&apos;s cover.</p>
        </div>
        {thumbnailUrl ? <Badge variant="secondary">Thumbnail set</Badge> : null}
      </div>
      {playable ? (
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          src={asset.downloadUrl}
          onSeeked={(event) => setFrameTime(event.currentTarget.currentTime)}
          onLoadedData={(event) => setFrameTime(event.currentTarget.currentTime)}
          className="aspect-video w-full rounded-md bg-foreground"
        />
      ) : (
        <p className="text-sm text-muted-foreground">The uploaded video is unavailable, so a thumbnail cannot be selected.</p>
      )}
      {playable ? <p className="text-sm text-muted-foreground">Selected frame: {formatVideoTime(frameTime)}</p> : null}
      {thumbnailUrl ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {/* Firebase Storage thumbnail URLs are generated at runtime, so they cannot use Next's static image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl} alt="Current video thumbnail" className="aspect-video w-24 rounded-sm object-cover" />
          <span>{typeof savedThumbnailTime === "number" ? `Current cover: ${formatVideoTime(savedThumbnailTime)}` : "Current cover"}</span>
        </div>
      ) : null}
      {thumbnailError ? <p className="text-sm text-destructive">{thumbnailError}</p> : null}
      <div>
        <Button type="button" variant="secondary" onClick={() => void setThumbnail()} disabled={!playable || savingThumbnail}>
          <ImageIcon data-icon="inline-start" />
          {savingThumbnail ? "Saving thumbnail..." : "Set thumbnail"}
        </Button>
      </div>
    </section>
  );
}

function formatVideoTime(time: number) {
  const seconds = Math.max(0, Math.floor(time));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
