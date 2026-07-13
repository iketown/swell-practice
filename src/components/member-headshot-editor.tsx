"use client";

import Cropper, { type Area, type Point } from "react-easy-crop";
import { ImagePlusIcon, RotateCcwIcon } from "lucide-react";
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";

const MAX_HEADSHOT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PendingHeadshot {
  file: File;
  objectUrl: string;
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
}

interface MemberHeadshotEditorProps {
  displayName: string;
  photoUrl?: string;
  pendingHeadshot: PendingHeadshot | null;
  onPendingHeadshotChange: Dispatch<SetStateAction<PendingHeadshot | null>>;
  disabled?: boolean;
}

export function MemberHeadshotEditor({
  displayName,
  photoUrl,
  pendingHeadshot,
  onPendingHeadshotChange,
  disabled,
}: MemberHeadshotEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const headshotObjectUrl = pendingHeadshot?.objectUrl;

  useEffect(() => () => {
    if (headshotObjectUrl) URL.revokeObjectURL(headshotObjectUrl);
  }, [headshotObjectUrl]);

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_HEADSHOT_BYTES) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }

    setError(null);
    onPendingHeadshotChange({
      file,
      objectUrl: URL.createObjectURL(file),
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MemberAvatar displayName={displayName || "New member"} photoUrl={pendingHeadshot?.objectUrl ?? photoUrl} className="size-14 text-sm" />
          <div>
            <FieldLabel htmlFor="member-headshot">Headshot</FieldLabel>
            <FieldDescription>Square thumbnail, visible on member pages.</FieldDescription>
          </div>
        </div>
        <label htmlFor="member-headshot" className="inline-flex cursor-pointer items-center justify-center gap-2 rounded border-2 border-foreground bg-secondary px-3 py-1 text-sm font-medium shadow-md transition-[transform,background-color,box-shadow] duration-200 hover:translate-y-px hover:bg-secondary-hover hover:shadow-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary has-[input:disabled]:pointer-events-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60">
          <ImagePlusIcon aria-hidden className="size-4" />
          {pendingHeadshot || photoUrl ? "Replace photo" : "Upload photo"}
          <input id="member-headshot" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseImage} disabled={disabled} />
        </label>
      </div>

      {pendingHeadshot ? (
        <div className="grid gap-3 rounded-lg border bg-secondary/35 p-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-md bg-foreground/10 sm:max-w-80">
            <Cropper
              image={pendingHeadshot.objectUrl}
              crop={pendingHeadshot.crop}
              zoom={pendingHeadshot.zoom}
              aspect={1}
              cropShape="rect"
              showGrid={false}
              onCropChange={(crop) => onPendingHeadshotChange((current) => current ? { ...current, crop } : current)}
              onZoomChange={(zoom) => onPendingHeadshotChange((current) => current ? { ...current, zoom } : current)}
              onCropComplete={(_, croppedAreaPixels) => onPendingHeadshotChange((current) => current ? { ...current, croppedAreaPixels } : current)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-52 flex-1 items-center gap-3 text-sm font-medium">
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={pendingHeadshot.zoom}
                onChange={(event) => onPendingHeadshotChange((current) => current ? { ...current, zoom: Number(event.target.value) } : current)}
                className="min-w-0 flex-1 accent-primary"
                disabled={disabled}
              />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => onPendingHeadshotChange(null)} disabled={disabled}>
              <RotateCcwIcon data-icon="inline-start" />
              {photoUrl ? "Keep current" : "Remove photo"}
            </Button>
          </div>
          <FieldDescription>Drag to position the photo. Saving exports a 512 × 512 JPEG.</FieldDescription>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

export async function cropHeadshot(headshot: PendingHeadshot) {
  if (!headshot.croppedAreaPixels) throw new Error("Finish positioning the headshot before saving.");

  const image = await loadImage(headshot.objectUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not crop this headshot.");

  const area = headshot.croppedAreaPixels;
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 512, 512);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare this headshot."));
    }, "image/jpeg", 0.9);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image."));
    image.src = source;
  });
}
