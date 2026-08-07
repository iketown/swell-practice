"use client";

import Cropper, { type Area, type Point } from "react-easy-crop";
import { ImagePlusIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import Image from "next/image";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
  EquipmentImageSourcePicker,
  type EquipmentImageSource,
} from "@/components/setup-designer/equipment-image-source-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ACCEPTED_IMAGE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export interface PendingEquipmentStageImage {
  sourceUrl: string;
  filename: string;
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  objectUrlToRevoke?: string;
}

export function EquipmentStageImageEditor({
  nodeName,
  widthInches,
  depthInches,
  currentImageUrl,
  currentFilename,
  sourceImages,
  pendingDetailFiles,
  pendingImage,
  onPendingImageChange,
  disabled,
}: {
  nodeName: string;
  widthInches: number;
  depthInches: number;
  currentImageUrl?: string;
  currentFilename?: string;
  sourceImages?: EquipmentImageSource[];
  pendingDetailFiles?: File[];
  pendingImage: PendingEquipmentStageImage | null;
  onPendingImageChange: Dispatch<SetStateAction<PendingEquipmentStageImage | null>>;
  disabled?: boolean;
}) {
  const [cropping, setCropping] = useState(Boolean(pendingImage));
  const [error, setError] = useState<string | null>(null);
  const aspect = Math.max(0.05, widthInches / Math.max(0.05, depthInches));
  const objectUrlToRevoke = pendingImage?.objectUrlToRevoke;

  useEffect(() => () => {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  }, [objectUrlToRevoke]);

  function beginCrop(sourceUrl: string, filename: string, ownedObjectUrl?: string) {
    setError(null);
    onPendingImageChange({
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
    accept: ACCEPTED_IMAGE_TYPES,
    disabled,
    maxFiles: 1,
    maxSize: MAX_IMAGE_BYTES,
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

  const visibleImage = pendingImage?.sourceUrl ?? currentImageUrl;

  return (
    <FieldGroup className="gap-3">
      {pendingImage && cropping ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="relative mx-auto h-72 w-full max-w-3xl overflow-hidden rounded-lg bg-muted">
            <Cropper
              image={pendingImage.sourceUrl}
              crop={pendingImage.crop}
              zoom={pendingImage.zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={aspect}
              cropShape="rect"
              restrictPosition={false}
              showGrid
              onCropChange={(crop) => onPendingImageChange((current) => current ? { ...current, crop } : current)}
              onZoomChange={(zoom) => onPendingImageChange((current) => current ? { ...current, zoom } : current)}
              onCropComplete={(_, croppedAreaPixels) => onPendingImageChange((current) => current ? { ...current, croppedAreaPixels } : current)}
            />
          </div>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="equipment-stage-image-zoom">Zoom</FieldLabel>
              <span className="text-xs tabular-nums text-muted-foreground">{pendingImage.zoom.toFixed(1)}×</span>
            </div>
            <Slider
              id="equipment-stage-image-zoom"
              aria-label="Stage image zoom"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={[pendingImage.zoom]}
              onValueChange={(value) => {
                const zoom = Array.isArray(value) ? value[0] : value;
                if (typeof zoom === "number") onPendingImageChange((current) => current ? { ...current, zoom } : current);
              }}
              disabled={disabled}
            />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { onPendingImageChange(null); setCropping(false); }} disabled={disabled}>
              <RotateCcwIcon data-icon="inline-start" />
              {currentImageUrl ? "Keep current" : "Remove image"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCropping(false)} disabled={!pendingImage.croppedAreaPixels || disabled}>
              Done cropping
            </Button>
          </div>
          <FieldDescription>Crop the overhead photo to the physical {formatInches(widthInches)} × {formatInches(depthInches)} footprint. Transparent WebP or PNG pixels stay see-through on the STAGE plot.</FieldDescription>
        </div>
      ) : visibleImage ? (
        <button
          type="button"
          className="group relative mx-auto h-72 w-full max-w-3xl overflow-hidden rounded-lg border bg-muted/30 outline-none transition-[border-color,box-shadow] hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            if (pendingImage) setCropping(true);
            else if (currentImageUrl) beginCrop(currentImageUrl, currentFilename || `${nodeName}-stage`);
          }}
          disabled={disabled}
          aria-label={`Crop ${nodeName} stage image`}
        >
          <Image src={visibleImage} alt="" fill sizes="768px" unoptimized className="object-contain p-3" />
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-card/95 px-2 py-1 text-xs font-medium shadow-sm">
            <PencilIcon aria-hidden className="size-3" />
            Adjust crop
          </span>
        </button>
      ) : null}

      {!(pendingImage && cropping) ? (
        <EquipmentImageSourcePicker
          sourceImages={sourceImages}
          pendingFiles={pendingDetailFiles}
          excludeUrl={currentImageUrl}
          purpose="STAGE overhead image"
          onSelect={beginCrop}
          disabled={disabled}
        />
      ) : null}

      {!(pendingImage && cropping) ? (
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
          <span className="text-sm font-medium">{isDragActive ? "Drop overhead photo here" : visibleImage ? "Drop a replacement or browse" : "Drop an overhead photo or browse"}</span>
          <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 10 MB</span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </FieldGroup>
  );
}

export async function cropEquipmentStageImage(imageDraft: PendingEquipmentStageImage, aspect: number) {
  if (!imageDraft.croppedAreaPixels) throw new Error("Finish positioning the stage image before saving.");

  const image = await loadImage(imageDraft.sourceUrl);
  const safeAspect = Math.max(0.05, aspect);
  const outputWidth = safeAspect >= 1 ? 1200 : Math.max(1, Math.round(1200 * safeAspect));
  const outputHeight = safeAspect >= 1 ? Math.max(1, Math.round(1200 / safeAspect)) : 1200;
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not crop this stage image.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawCropWithTransparentPadding(context, image, imageDraft.croppedAreaPixels, outputWidth, outputHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare this stage image.")), "image/webp", 0.9);
  });
  const basename = imageDraft.filename.replace(/\.[^.]+$/, "").trim() || "equipment";
  return new File([blob], `${basename}-stage.webp`, { type: "image/webp" });
}

function drawCropWithTransparentPadding(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  area: Area,
  outputWidth: number,
  outputHeight: number,
) {
  const sourceLeft = Math.max(0, area.x);
  const sourceTop = Math.max(0, area.y);
  const sourceRight = Math.min(image.naturalWidth, area.x + area.width);
  const sourceBottom = Math.min(image.naturalHeight, area.y + area.height);
  const sourceWidth = sourceRight - sourceLeft;
  const sourceHeight = sourceBottom - sourceTop;
  context.clearRect(0, 0, outputWidth, outputHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const scaleX = outputWidth / area.width;
  const scaleY = outputHeight / area.height;
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

function formatInches(value: number) {
  return `${Math.round(value * 10) / 10}\u2033`;
}
