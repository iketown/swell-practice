"use client";

import { ExternalLinkIcon, ImageOffIcon, ImagesIcon, Trash2Icon, UploadIcon } from "lucide-react";
import Image from "next/image";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { cn } from "@/lib/utils";

const MAX_DETAIL_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DETAIL_IMAGES = 12;
const ACCEPTED_DETAIL_IMAGE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

type GalleryPhoto = {
  key: string;
  url: string;
  label: string;
  kind: "stored" | "reference" | "pending";
  sourceUrl?: string;
  file?: File;
};

interface EquipmentPhotoGalleryProps {
  template: EquipmentTemplate;
  pendingFiles: File[];
  onPendingFilesChange: Dispatch<SetStateAction<File[]>>;
  disabled?: boolean;
}

export function EquipmentPhotoGallery({ template, pendingFiles, onPendingFilesChange, disabled }: EquipmentPhotoGalleryProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingPreviews = useMemo(() => pendingFiles.map((file) => ({ file, url: URL.createObjectURL(file) })), [pendingFiles]);

  useEffect(() => () => pendingPreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [pendingPreviews]);

  const photos = useMemo<GalleryPhoto[]>(() => [
    ...(template.detailImages ?? []).map((image, index) => ({
      key: `stored:${image.storagePath}`,
      url: image.downloadUrl,
      label: image.filename || `Detail photo ${index + 1}`,
      kind: "stored" as const,
    })),
    ...template.referenceImages.map((image, index) => ({
      key: `reference:${image.url}`,
      url: image.url,
      label: image.altText || `Web reference ${index + 1}`,
      kind: "reference" as const,
      sourceUrl: image.sourceUrl,
    })),
    ...pendingPreviews.map(({ file, url }) => ({
      key: `pending:${fileKey(file)}`,
      url,
      label: file.name,
      kind: "pending" as const,
      file,
    })),
  ], [pendingPreviews, template.detailImages, template.referenceImages]);

  const selectedPhoto = photos.find((photo) => photo.key === selectedKey) ?? photos[0];
  const remainingSlots = Math.max(0, MAX_DETAIL_IMAGES - (template.detailImages?.length ?? 0) - pendingFiles.length);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_DETAIL_IMAGE_TYPES,
    disabled: disabled || remainingSlots === 0,
    maxFiles: Math.max(1, remainingSlots),
    maxSize: MAX_DETAIL_IMAGE_BYTES,
    multiple: true,
    onDropAccepted: (files) => {
      const unique = files
        .filter((file) => !pendingFiles.some((pending) => fileKey(pending) === fileKey(file)))
        .slice(0, remainingSlots);
      if (!unique.length) return;
      setError(null);
      onPendingFilesChange((current) => [...current, ...unique]);
      setSelectedKey(`pending:${fileKey(unique[0])}`);
    },
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((rejection) => rejection.errors.some((item) => item.code === "file-too-large"));
      const tooMany = rejections.some((rejection) => rejection.errors.some((item) => item.code === "too-many-files"));
      setError(
        tooLarge
          ? "Each photo must be smaller than 10 MB."
          : tooMany
            ? `This gear definition can hold up to ${MAX_DETAIL_IMAGES} uploaded detail photos.`
            : "Choose JPEG, PNG, or WebP photos.",
      );
    },
  });

  function removePending(file: File) {
    onPendingFilesChange((current) => current.filter((item) => fileKey(item) !== fileKey(file)));
    setSelectedKey(null);
  }

  return (
    <FieldGroup className="gap-3">
      {selectedPhoto ? (
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="relative aspect-[16/9] bg-muted/30">
            <GalleryImage photo={selectedPhoto} sizes="(max-width: 768px) 100vw, 840px" />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            <Badge variant={selectedPhoto.kind === "pending" ? "default" : selectedPhoto.kind === "reference" ? "outline" : "secondary"}>
              {selectedPhoto.kind === "pending" ? "New" : selectedPhoto.kind === "reference" ? "Web reference" : "Uploaded"}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedPhoto.label}</span>
            {selectedPhoto.kind === "reference" && selectedPhoto.sourceUrl ? (
              <a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Source <ExternalLinkIcon data-icon="inline-end" />
              </a>
            ) : null}
            {selectedPhoto.kind === "pending" && selectedPhoto.file ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removePending(selectedPhoto.file!)} disabled={disabled}>
                <Trash2Icon data-icon="inline-start" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/20 px-4 text-center">
          <ImagesIcon aria-hidden className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No detail photos yet</p>
          <p className="max-w-md text-xs text-muted-foreground">Add front, rear-panel, jack, or control-surface photos so the patch can be checked without leaving the setup.</p>
        </div>
      )}

      {photos.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8" aria-label="Equipment detail photos">
          {photos.map((photo) => (
            <button
              type="button"
              key={photo.key}
              className={cn(
                "relative aspect-square overflow-hidden rounded-md border bg-muted/30 outline-none transition-[border-color,box-shadow] hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
                selectedPhoto?.key === photo.key && "border-primary ring-2 ring-primary/20",
              )}
              onClick={() => setSelectedKey(photo.key)}
              aria-label={`View ${photo.label}`}
            >
              <GalleryImage photo={photo} sizes="96px" />
              {photo.kind === "pending" ? <Badge className="absolute bottom-1 left-1 px-1 py-0 text-[9px]">New</Badge> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div
        {...getRootProps()}
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-4 py-3 text-center transition-colors hover:bg-muted/50",
          isDragActive && "border-primary bg-muted/60",
          (disabled || remainingSlots === 0) && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} />
        <UploadIcon aria-hidden className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">{isDragActive ? "Drop photos here" : remainingSlots ? "Drop detail photos or browse" : "Photo limit reached"}</span>
        <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 10 MB each · {remainingSlots} slots available</span>
      </div>

      <FieldDescription>These reusable product and port photos stay separate from the final SIGNAL and STAGE crops, but either image editor can use them as a source.</FieldDescription>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </FieldGroup>
  );
}

function GalleryImage({ photo, sizes }: { photo: GalleryPhoto; sizes: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
      <ImageOffIcon aria-hidden className="size-5" />
      Photo unavailable
    </span>
  );

  return (
    <Image
      src={photo.url}
      alt={photo.label}
      fill
      sizes={sizes}
      unoptimized
      className="object-contain p-2"
      onError={() => setFailed(true)}
    />
  );
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
