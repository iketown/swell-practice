"use client";

import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";

export interface EquipmentImageSource {
  id: string;
  url: string;
  filename: string;
  label: string;
  kind: "signal" | "stage" | "detail" | "reference" | "asset";
}

interface PendingImageSource extends Omit<EquipmentImageSource, "kind"> {
  kind: "pending";
  file: File;
}

type AvailableImageSource = EquipmentImageSource | PendingImageSource;

export function EquipmentImageSourcePicker({
  sourceImages,
  pendingFiles,
  excludeUrl,
  purpose,
  onSelect,
  disabled,
}: {
  sourceImages?: EquipmentImageSource[];
  pendingFiles?: File[];
  excludeUrl?: string;
  purpose: "SIGNAL icon" | "STAGE overhead image";
  onSelect: (sourceUrl: string, filename: string, objectUrlToRevoke?: string) => void;
  disabled?: boolean;
}) {
  const pendingSources = useMemo<PendingImageSource[]>(() => (pendingFiles ?? []).map((file) => ({
    id: `pending:${file.name}:${file.size}:${file.lastModified}`,
    url: URL.createObjectURL(file),
    filename: file.name,
    label: file.name,
    kind: "pending",
    file,
  })), [pendingFiles]);
  const availableSources = useMemo(() => {
    const seen = new Set<string>();
    return [...(sourceImages ?? []), ...pendingSources].filter((source) => {
      if (!source.url || source.url === excludeUrl || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
  }, [excludeUrl, pendingSources, sourceImages]);

  useEffect(() => () => {
    pendingSources.forEach((source) => URL.revokeObjectURL(source.url));
  }, [pendingSources]);

  if (!availableSources.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Choose an existing photo</p>
        <p className="text-xs text-muted-foreground">Reuse any photo already attached to this gear or its assigned physical item.</p>
      </div>
      <div
        className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2 overflow-y-auto pr-1"
        aria-label={`Photos available for the ${purpose}`}
      >
        {availableSources.map((source) => (
          <button
            key={source.id}
            type="button"
            className="group flex min-w-0 flex-col overflow-hidden rounded-md border bg-background text-left outline-none transition-[border-color,box-shadow] hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => selectSource(source, onSelect)}
            disabled={disabled}
            aria-label={`Use ${source.label} for the ${purpose}`}
          >
            <span className="relative aspect-square w-full bg-muted/30">
              <SourceThumbnail source={source} />
            </span>
            <span className="flex min-w-0 flex-col gap-1 border-t px-2 py-1.5">
              <span className="truncate text-xs font-medium">{source.label}</span>
              <Badge variant={source.kind === "reference" ? "outline" : "secondary"} className="w-fit px-1.5 py-0 text-[9px]">
                {sourceKindLabel(source.kind)}
              </Badge>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function selectSource(
  source: AvailableImageSource,
  onSelect: (sourceUrl: string, filename: string, objectUrlToRevoke?: string) => void,
) {
  if (source.kind === "pending") {
    const objectUrl = URL.createObjectURL(source.file);
    onSelect(objectUrl, source.filename, objectUrl);
    return;
  }
  onSelect(source.url, source.filename);
}

function SourceThumbnail({ source }: { source: AvailableImageSource }) {
  const [failed, setFailed] = useState(false);

  if (failed) return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
      <ImageOffIcon aria-hidden className="size-5" />
      Unavailable
    </span>
  );

  return (
    <Image
      src={source.url}
      alt=""
      fill
      sizes="160px"
      unoptimized
      className="object-contain p-2"
      onError={() => setFailed(true)}
    />
  );
}

function sourceKindLabel(kind: AvailableImageSource["kind"]) {
  if (kind === "signal") return "SIGNAL icon";
  if (kind === "stage") return "STAGE image";
  if (kind === "detail") return "Detail photo";
  if (kind === "reference") return "Web reference";
  if (kind === "asset") return "Asset photo";
  return "New detail photo";
}
