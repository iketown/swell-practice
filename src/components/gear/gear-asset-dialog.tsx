"use client";

import { CameraIcon, PackagePlusIcon, SaveIcon } from "lucide-react";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

import { GearLabelPrinter } from "@/components/gear/gear-label-printer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_LIFECYCLE_OPTIONS,
  canonicalizeAssetTag,
  createAssetTag,
  isStandardAssetTag,
  type GearLocation,
  type GearParty,
  type InventoryAsset,
  type InventoryAssetLifecycle,
} from "@/lib/gear/domain";
import { saveInventoryAsset } from "@/lib/gear/repository";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function GearAssetDialog({
  open,
  onOpenChange,
  definitions,
  assets,
  parties,
  locations,
  asset,
  initialDefinitionId,
  initialLifecycle = "planned",
  sourceSetupId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: EquipmentTemplate[];
  assets: InventoryAsset[];
  parties: GearParty[];
  locations: GearLocation[];
  asset?: InventoryAsset;
  initialDefinitionId?: string;
  initialLifecycle?: InventoryAssetLifecycle;
  sourceSetupId?: string;
  onSaved: (asset: InventoryAsset) => void;
}) {
  const startingDefinitionId = asset?.definitionId ?? initialDefinitionId ?? definitions[0]?.id ?? "";
  const startingDefinition = definitions.find((item) => item.id === startingDefinitionId);
  const existingAssetTags = assets.filter((item) => item.id !== asset?.id).map((item) => item.assetTag);
  const [definitionId, setDefinitionId] = useState(startingDefinitionId);
  const [label, setLabel] = useState(asset?.label ?? (startingDefinition ? `${startingDefinition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : ""));
  const [assetTag, setAssetTag] = useState(asset?.assetTag ?? createAssetTag(assetTagSource(startingDefinition), existingAssetTags));
  const [assetTagEdited, setAssetTagEdited] = useState(Boolean(asset));
  const [lifecycleStatus, setLifecycleStatus] = useState<InventoryAssetLifecycle>(asset?.lifecycleStatus ?? initialLifecycle);
  const [ownerPartyId, setOwnerPartyId] = useState(asset?.ownerPartyId ?? "");
  const [currentLocationId, setCurrentLocationId] = useState(asset?.currentLocationId ?? "");
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? "");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const definition = useMemo(() => definitions.find((item) => item.id === definitionId), [definitionId, definitions]);
  const physicalStatus = lifecycleStatus === "active" || lifecycleStatus === "awaiting_check_in";
  const canonicalAssetTag = canonicalizeAssetTag(assetTag);
  const retainsLegacyTag = Boolean(asset && canonicalizeAssetTag(asset.assetTag) === canonicalAssetTag);
  const duplicateAsset = assets.find((item) => item.id !== asset?.id && canonicalizeAssetTag(item.assetTag) === canonicalAssetTag);
  const assetTagIssue = !retainsLegacyTag && !isStandardAssetTag(canonicalAssetTag)
    ? "Use three letters and a sequence, such as HXS-01 or XLR-04-25."
    : duplicateAsset
      ? `${canonicalAssetTag} is already assigned to ${duplicateAsset.label}.`
      : null;

  function chooseDefinition(value: string | null) {
    if (!value) return;
    const next = definitions.find((item) => item.id === value);
    const previousDefault = definition ? `${definition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : "";
    setDefinitionId(value);
    if (!label || label === previousDefault) setLabel(next ? `${next.name}${lifecycleStatus === "planned" ? " · planned" : ""}` : "");
    if (!assetTagEdited) setAssetTag(createAssetTag(assetTagSource(next), existingAssetTags));
  }

  function choosePhotos(files: FileList | null) {
    const next = Array.from(files ?? []);
    const invalid = next.find((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalid) {
      setError("Physical-item photos must be JPEG, PNG, or WebP files smaller than 10 MB each.");
      return;
    }
    setError(null);
    setPhotoFiles(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!definitionId || !label.trim() || assetTagIssue || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveInventoryAsset({
        id: asset?.id,
        assetTag: canonicalAssetTag,
        definitionId,
        label,
        lifecycleStatus,
        ownerPartyId: ownerPartyId || undefined,
        currentLocationId: physicalStatus && currentLocationId ? currentLocationId : undefined,
        serialNumber,
        notes,
        sourceSetupId: asset?.sourceSetupId ?? sourceSetupId,
        photos: asset?.photos ?? [],
        createdAt: asset?.createdAt,
      }, photoFiles, setProgress);
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this gear asset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.label}` : initialLifecycle === "planned" ? "Create planned gear" : "Register physical gear"}</DialogTitle>
          <DialogDescription>
            {initialLifecycle === "planned" && !asset
              ? "Reserve a permanent asset ID now. Its setup references and QR identity will survive ordering, delivery, and first check-in."
              : "Track the exact physical item, its owner, identifying details, photos, and current lifecycle."}
          </DialogDescription>
        </DialogHeader>

        <form id="gear-asset-form" onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="gear-asset-definition">Gear definition</FieldLabel>
              <Select value={definitionId} onValueChange={chooseDefinition} disabled={saving || Boolean(asset)}>
                <SelectTrigger id="gear-asset-definition" className="w-full"><SelectValue placeholder="Choose equipment" /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {definitions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.model ? ` · ${item.model}` : ""}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>The definition holds reusable product data and ports. This record represents one intended or physical item.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="gear-asset-label">Asset name</FieldLabel>
              <Input id="gear-asset-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ike's SM58 #2" required disabled={saving} />
            </Field>
            <Field data-invalid={Boolean(assetTagIssue)}>
              <FieldLabel htmlFor="gear-asset-tag">Permanent asset ID</FieldLabel>
              <Input
                id="gear-asset-tag"
                value={assetTag}
                onChange={(event) => { setAssetTag(event.target.value.toUpperCase()); setAssetTagEdited(true); }}
                onBlur={() => setAssetTag(canonicalAssetTag)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                required
                aria-invalid={Boolean(assetTagIssue)}
                disabled={saving}
              />
              {assetTagIssue
                ? <FieldError>{assetTagIssue}</FieldError>
                : <FieldDescription>The next ID for this item is suggested automatically. Use PREFIX-NN-LL for cables, such as XLR-04-25 for cable 04 at 25 ft.</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-asset-lifecycle">Lifecycle</FieldLabel>
              <Select value={lifecycleStatus} onValueChange={(value) => value && setLifecycleStatus(value as InventoryAssetLifecycle)} disabled={saving}>
                <SelectTrigger id="gear-asset-lifecycle" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {ASSET_LIFECYCLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-asset-owner">Owner</FieldLabel>
              <Select value={ownerPartyId || "none"} onValueChange={(value) => setOwnerPartyId(value === "none" || !value ? "" : value)} disabled={saving}>
                <SelectTrigger id="gear-asset-owner" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {parties.map((party) => <SelectItem key={party.id} value={party.id}>{party.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>Ownership can be assigned before the item physically arrives.</FieldDescription>
            </Field>
            {physicalStatus ? (
              <Field>
                <FieldLabel htmlFor="gear-asset-location">Current location</FieldLabel>
                <Select value={currentLocationId || "none"} onValueChange={(value) => setCurrentLocationId(value === "none" || !value ? "" : value)} disabled={saving}>
                  <SelectTrigger id="gear-asset-location" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="none">Not checked in</SelectItem>
                    {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="gear-asset-serial">Serial number</FieldLabel>
              <Input id="gear-asset-serial" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="Add when it arrives" disabled={saving} />
            </Field>
          </FieldGroup>

          {definition?.purchaseSource ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <Badge variant="secondary">Purchase source</Badge>
              <a href={definition.purchaseSource.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                {definition.purchaseSource.vendor || "Product page"}{definition.purchaseSource.priceDisplay ? ` · ${definition.purchaseSource.priceDisplay}` : ""}
              </a>
            </div>
          ) : null}

          <Field>
            <FieldLabel htmlFor="gear-asset-photos">Photos of this physical item</FieldLabel>
            <label htmlFor="gear-asset-photos" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/25 px-4 py-5 text-center text-sm font-medium hover:bg-muted/50">
              <CameraIcon aria-hidden />
              {photoFiles.length ? `${photoFiles.length} new photo${photoFiles.length === 1 ? "" : "s"} selected` : "Choose physical-item photos"}
              <input id="gear-asset-photos" className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhotos(event.target.files)} disabled={saving} />
            </label>
            <FieldDescription>These document the exact item. They stay separate from the product icon and reusable reference photos.</FieldDescription>
            {asset?.photos.length ? (
              <div className="grid grid-cols-4 gap-2">
                {asset.photos.slice(0, 8).map((photo) => (
                  <span key={photo.storagePath} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                    <Image src={photo.downloadUrl} alt={photo.filename} fill sizes="120px" className="object-cover" unoptimized />
                  </span>
                ))}
              </div>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="gear-asset-notes">Notes</FieldLabel>
            <Textarea id="gear-asset-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Why we need it, condition, identifying marks, or receiving instructions." rows={3} disabled={saving} />
          </Field>

          {asset ? <GearLabelPrinter assetTag={canonicalAssetTag} assetName={label} /> : null}

          {saving && photoFiles.length ? <Progress value={progress} aria-label={`Gear photo upload ${progress}% complete`} /> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="gear-asset-form" disabled={saving || !definitionId || !label.trim() || Boolean(assetTagIssue)}>
            {asset ? <SaveIcon data-icon="inline-start" /> : <PackagePlusIcon data-icon="inline-start" />}
            {saving ? "Saving..." : asset ? "Save asset" : initialLifecycle === "planned" ? "Create planned asset" : "Register asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function assetTagSource(definition: EquipmentTemplate | undefined) {
  const modelLetters = definition?.model?.replace(/[^A-Za-z]/g, "") ?? "";
  return modelLetters.length >= 3 ? definition?.model ?? "Gear" : definition?.name ?? "Gear";
}
