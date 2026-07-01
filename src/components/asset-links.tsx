import { DownloadIcon, FileArchiveIcon, FileAudioIcon, FileIcon, FileTextIcon, FileVideoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SongAsset } from "@/lib/domain";

function AssetIcon({ fileType }: { fileType: SongAsset["fileType"] }) {
  if (fileType === "audio") return <FileAudioIcon aria-hidden />;
  if (fileType === "pdf") return <FileTextIcon aria-hidden />;
  if (fileType === "video") return <FileVideoIcon aria-hidden />;
  if (fileType === "zip") return <FileArchiveIcon aria-hidden />;
  return <FileIcon aria-hidden />;
}

export function AssetLinks({ assets }: { assets: SongAsset[] }) {
  if (!assets.length) {
    return <span className="text-sm text-muted-foreground">No files assigned yet</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {assets.map((asset) => (
          <a
            key={asset.id}
            href={asset.downloadUrl || "#"}
            target={asset.downloadUrl && asset.downloadUrl !== "#" ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium shadow-[0_8px_20px_-18px_rgba(20,38,54,0.45)] transition-colors hover:bg-accent [&_svg]:size-4"
          >
            <AssetIcon fileType={asset.fileType} />
            <span className="truncate">{asset.displayName || asset.filename}</span>
            <DownloadIcon aria-hidden />
          </a>
        ))}
      </div>
      {assets.some((asset) => asset.fileType === "audio" && asset.downloadUrl && asset.downloadUrl !== "#") ? (
        <div className="grid gap-2">
          {assets
            .filter((asset) => asset.fileType === "audio" && asset.downloadUrl && asset.downloadUrl !== "#")
            .map((asset) => (
              <div key={`${asset.id}-player`} className="grid gap-1">
                <Badge variant="secondary">{asset.displayName || asset.filename}</Badge>
                <audio controls preload="none" src={asset.downloadUrl} className="h-10 w-full" />
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
