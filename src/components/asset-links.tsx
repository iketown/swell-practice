"use client";

import { DownloadIcon, FileArchiveIcon, FileAudioIcon, FileIcon, FileTextIcon, FileVideoIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SongAsset } from "@/lib/domain";

function AssetIcon({ fileType }: { fileType: SongAsset["fileType"] }) {
  if (fileType === "audio") return <FileAudioIcon aria-hidden />;
  if (fileType === "pdf") return <FileTextIcon aria-hidden />;
  if (fileType === "video") return <FileVideoIcon aria-hidden />;
  if (fileType === "zip") return <FileArchiveIcon aria-hidden />;
  return <FileIcon aria-hidden />;
}

export function AssetLinks({ assets }: { assets: SongAsset[] }) {
  const [activeVideo, setActiveVideo] = useState<SongAsset | null>(null);

  if (!assets.length) {
    return <span className="text-sm text-muted-foreground">No files assigned yet</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {assets.map((asset) =>
          asset.fileType === "video" ? (
            <VideoAssetButton key={asset.id} asset={asset} onOpen={() => setActiveVideo(asset)} />
          ) : (
            <a
              key={asset.id}
              href={asset.downloadUrl || "#"}
              target={asset.downloadUrl && asset.downloadUrl !== "#" ? "_blank" : undefined}
              rel="noreferrer"
              className="swell-file-link"
            >
              <AssetIcon fileType={asset.fileType} />
              <span className="truncate">{asset.displayName || asset.filename}</span>
              <DownloadIcon aria-hidden />
            </a>
          ),
        )}
      </div>
      {assets.some((asset) => asset.fileType === "audio" && asset.downloadUrl && asset.downloadUrl !== "#") ? (
        <div className="grid gap-2">
          {assets
            .filter((asset) => asset.fileType === "audio" && asset.downloadUrl && asset.downloadUrl !== "#")
            .map((asset) => (
              <div key={`${asset.id}-player`} className="swell-audio-panel">
                <Badge variant="secondary">{asset.displayName || asset.filename}</Badge>
                <audio controls preload="none" src={asset.downloadUrl} className="h-10 w-full" />
              </div>
            ))}
        </div>
      ) : null}

      <VideoPlayerDialog asset={activeVideo} onClose={() => setActiveVideo(null)} />
    </div>
  );
}

function VideoAssetButton({ asset, onOpen }: { asset: SongAsset; onOpen: () => void }) {
  const playable = Boolean(asset.downloadUrl && asset.downloadUrl !== "#");
  const name = asset.displayName || asset.filename;

  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      onClick={onOpen}
      disabled={!playable}
      className="swell-video-button h-auto max-w-full justify-start overflow-hidden p-0 text-left"
      aria-label={playable ? `Play ${name}` : `${name} is unavailable`}
    >
      {asset.thumbnailUrl ? (
        // Firebase Storage thumbnail URLs are generated at runtime, so they cannot use Next's static image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumbnailUrl} alt="" className="aspect-video w-28 shrink-0 object-cover" />
      ) : (
        <span className="grid aspect-video w-28 shrink-0 place-items-center bg-muted text-muted-foreground">
          <FileVideoIcon aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-2 px-3 py-2">
        <PlayIcon aria-hidden />
        <span className="truncate">{name}</span>
      </span>
    </Button>
  );
}

function VideoPlayerDialog({ asset, onClose }: { asset: SongAsset | null; onClose: () => void }) {
  const playable = Boolean(asset?.downloadUrl && asset.downloadUrl !== "#");

  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="gap-1 p-4 pr-12">
          <DialogTitle>{asset?.displayName || asset?.filename || "Video"}</DialogTitle>
          <DialogDescription>Video asset</DialogDescription>
        </DialogHeader>
        {playable ? (
          <video controls autoPlay playsInline preload="metadata" src={asset?.downloadUrl} className="aspect-video w-full bg-foreground" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
