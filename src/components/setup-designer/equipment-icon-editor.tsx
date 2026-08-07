"use client";

import Cropper, { type Area, type Point } from "react-easy-crop";
import { ImagePlusIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import Image from "next/image";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
  EquipmentImageSourcePicker,
  type EquipmentImageSource,
} from "@/components/setup-designer/equipment-image-source-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MAX_ICON_BYTES = 10 * 1024 * 1024;
const MIN_ICON_ZOOM = 0.1;
const MAX_ICON_ZOOM = 3;
const ACCEPTED_ICON_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export interface PendingEquipmentIcon {
  sourceUrl: string;
  filename: string;
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  objectUrlToRevoke?: string;
}

interface EquipmentIconEditorProps {
  nodeName: string;
  currentImageUrl?: string;
  currentFilename?: string;
  sourceImages?: EquipmentImageSource[];
  pendingDetailFiles?: File[];
  pendingIcon: PendingEquipmentIcon | null;
  onPendingIconChange: Dispatch<SetStateAction<PendingEquipmentIcon | null>>;
  disabled?: boolean;
}

export function EquipmentIconEditor({
  nodeName,
  currentImageUrl,
  currentFilename,
  sourceImages,
  pendingDetailFiles,
  pendingIcon,
  onPendingIconChange,
  disabled,
}: EquipmentIconEditorProps) {
  const [cropping, setCropping] = useState(Boolean(pendingIcon));
  const [error, setError] = useState<string | null>(null);
  const objectUrlToRevoke = pendingIcon?.objectUrlToRevoke;

  useEffect(() => () => {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  }, [objectUrlToRevoke]);

  function beginCrop(sourceUrl: string, filename: string, ownedObjectUrl?: string) {
    setError(null);
    onPendingIconChange({
      sourceUrl,
      filename,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      ...(ownedObjectUrl ? { objectUrlToRevoke: ownedObjectUrl } : {}),
    });
    setCropping(true);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_ICON_TYPES,
    disabled,
    maxFiles: 1,
    maxSize: MAX_ICON_BYTES,
    multiple: false,
    onDropAccepted: ([file]) => {
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      beginCrop(objectUrl, file.name, objectUrl);
    },
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((rejection) => rejection.errors.some((item) => item.code === "file-too-large"));
      setError(tooLarge ? "Choose an image smaller than 10 MB." : "Choose a JPEG, PNG, or WebP image.");
    },
  });

  const visibleImage = pendingIcon?.sourceUrl ?? currentImageUrl;

  return (
    <FieldGroup className="gap-3">
      {pendingIcon && cropping ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-lg bg-muted">
            <Cropper
              image={pendingIcon.sourceUrl}
              crop={pendingIcon.crop}
              zoom={pendingIcon.zoom}
              minZoom={MIN_ICON_ZOOM}
              maxZoom={MAX_ICON_ZOOM}
              aspect={1}
              cropShape="rect"
              restrictPosition={false}
              showGrid
              onCropChange={(crop) => onPendingIconChange((current) => current ? { ...current, crop } : current)}
              onZoomChange={(zoom) => onPendingIconChange((current) => current ? { ...current, zoom } : current)}
              onCropComplete={(_, croppedAreaPixels) => onPendingIconChange((current) => current ? { ...current, croppedAreaPixels } : current)}
            />
          </div>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="equipment-icon-zoom">Zoom</FieldLabel>
              <span className="text-xs tabular-nums text-muted-foreground">{pendingIcon.zoom.toFixed(1)}×</span>
            </div>
            <Slider
              id="equipment-icon-zoom"
              aria-label="Icon zoom"
              min={MIN_ICON_ZOOM}
              max={MAX_ICON_ZOOM}
              step={0.05}
              value={[pendingIcon.zoom]}
              onValueChange={(value) => {
                const zoom = Array.isArray(value) ? value[0] : value;
                if (typeof zoom === "number") onPendingIconChange((current) => current ? { ...current, zoom } : current);
              }}
              disabled={disabled}
            />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onPendingIconChange(null);
                setCropping(false);
              }}
              disabled={disabled}
            >
              <RotateCcwIcon data-icon="inline-start" />
              {currentImageUrl ? "Keep current" : "Remove image"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCropping(false)} disabled={!pendingIcon.croppedAreaPixels || disabled}>
              Done cropping
            </Button>
          </div>
          <FieldDescription>Drag to position the image. Zoom below 1× to add transparent padding. The saved icon is a 512 × 512 WebP.</FieldDescription>
        </div>
      ) : visibleImage ? (
        <button
          type="button"
          className="group relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-lg border bg-muted/30 outline-none transition-[border-color,box-shadow] hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            if (pendingIcon) setCropping(true);
            else if (currentImageUrl) beginCrop(currentImageUrl, currentFilename || `${nodeName}-icon`);
          }}
          disabled={disabled}
          aria-label={`Crop ${nodeName} icon`}
        >
          <Image src={visibleImage} alt="" fill sizes="220px" unoptimized className="object-contain p-3" />
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-card/95 px-2 py-1 text-xs font-medium shadow-sm">
            <PencilIcon aria-hidden className="size-3" />
            Adjust crop
          </span>
        </button>
      ) : null}

      {!(pendingIcon && cropping) ? (
        <EquipmentImageSourcePicker
          sourceImages={sourceImages}
          pendingFiles={pendingDetailFiles}
          excludeUrl={currentImageUrl}
          purpose="SIGNAL icon"
          onSelect={beginCrop}
          disabled={disabled}
        />
      ) : null}

      {!(pendingIcon && cropping) ? (
        <div
          {...getRootProps()}
          className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-3 py-4 text-center transition-colors hover:bg-muted/50",
            isDragActive && "border-primary bg-muted/60",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} />
          <ImagePlusIcon aria-hidden className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">{isDragActive ? "Drop image here" : visibleImage ? "Drop a replacement or browse" : "Drop an image or browse"}</span>
          <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 10 MB</span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </FieldGroup>
  );
}

export async function cropEquipmentIcon(icon: PendingEquipmentIcon) {
  if (!icon.croppedAreaPixels) throw new Error("Finish positioning the icon before saving.");

  const image = await loadImage(icon.sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not crop this icon.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const area = icon.croppedAreaPixels;
  drawCropWithTransparentPadding(context, image, area, 512);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Could not prepare this icon."));
    }, "image/webp", 0.9);
  });

  const basename = icon.filename.replace(/\.[^.]+$/, "").trim() || "equipment";
  return new File([blob], `${basename}-icon.webp`, { type: "image/webp" });
}

function drawCropWithTransparentPadding(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  area: Area,
  outputSize: number,
) {
  const sourceLeft = Math.max(0, area.x);
  const sourceTop = Math.max(0, area.y);
  const sourceRight = Math.min(image.naturalWidth, area.x + area.width);
  const sourceBottom = Math.min(image.naturalHeight, area.y + area.height);
  const sourceWidth = sourceRight - sourceLeft;
  const sourceHeight = sourceBottom - sourceTop;

  context.clearRect(0, 0, outputSize, outputSize);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const scaleX = outputSize / area.width;
  const scaleY = outputSize / area.height;
  context.drawImage(
    image,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    (sourceLeft - area.x) * scaleX,
    (sourceTop - area.y) * scaleY,
    sourceWidth * scaleX,
    sourceHeight * scaleY,
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    if (!source.startsWith("data:") && !source.startsWith("blob:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image. Try uploading the original file instead."));
    image.src = source;
  });
}
