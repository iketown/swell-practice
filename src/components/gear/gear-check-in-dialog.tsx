"use client";

import { BoxesIcon, LocateFixedIcon, MapPinCheckIcon } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CheckInDestination, GearLocation, InventoryAsset } from "@/lib/gear/domain";
import { checkInInventoryAsset } from "@/lib/gear/repository";
import { powerCheckInTag, resolvePowerDependencies, type EquipmentTemplate } from "@/lib/setup-designer/domain";

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export function GearCheckInDialog({
  open,
  onOpenChange,
  asset,
  definition,
  connectedAssets,
  locations,
  assets,
  actorId,
  onCheckedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: InventoryAsset | null;
  definition?: EquipmentTemplate;
  connectedAssets?: InventoryAsset[];
  locations: GearLocation[];
  assets: InventoryAsset[];
  actorId: string;
  onCheckedIn: (assets: InventoryAsset[], destination: CheckInDestination, propagatedAssets: InventoryAsset[]) => void;
}) {
  const currentEffectiveLocationId = asset?.effectiveLocationId ?? asset?.currentLocationId;
  const initialDestination = asset?.currentPlacement?.kind === "container"
    ? `container:${asset.currentPlacement.containerAssetId}`
    : currentEffectiveLocationId
      ? `location:${currentEffectiveLocationId}`
      : "";
  const [destinationValue, setDestinationValue] = useState(initialDestination);
  const [notes, setNotes] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function captureCoordinates() {
    if (!("geolocation" in navigator)) {
      setError("This browser does not provide location coordinates.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition((position) => {
      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      });
      setLocating(false);
    }, (reason) => {
      setError(reason.message || "Could not read the phone's location.");
      setLocating(false);
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || !destinationValue || saving) return;
    const [kind, id] = destinationValue.split(":", 2);
    const destination: CheckInDestination = kind === "container"
      ? { kind: "container", containerAssetId: id }
      : { kind: "location", locationId: id };
    setSaving(true);
    setError(null);
    try {
      const outcome = await checkInInventoryAsset({
        assetId: asset.id,
        destination,
        method: "manual_single",
        actorId,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        accuracyMeters: coordinates?.accuracyMeters,
        notes,
      });
      onCheckedIn(outcome.assets, destination, outcome.propagatedAssets ?? outcome.assets);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check in this item.");
    } finally {
      setSaving(false);
    }
  }

  if (!asset) return null;
  const powerDependencies = resolvePowerDependencies(asset, definition);
  const displayTag = powerCheckInTag(asset.assetTag, powerDependencies.needsPowerAdapter);
  const companions = (connectedAssets ?? []).filter((item) => item.id !== asset.id);
  const containers = assets.filter((item) => item.lifecycleStatus === "active" && item.canContainAssets && item.id !== asset.id);
  const selectedDestinationLabel = destinationValue.startsWith("container:")
    ? containers.find((container) => `container:${container.id}` === destinationValue)?.label
    : locations.find((location) => `location:${location.id}` === destinationValue)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check in {displayTag}</DialogTitle>
          <DialogDescription>
            {asset.label}. This records that the item{powerDependencies.needsPowerAdapter ? " and its matching adapter are" : " is"} at this location now.
            {companions.length ? ` It will also check in ${companions.map((item) => item.assetTag).join(", ")} because they stay connected.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form id="gear-check-in-form" onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="gear-check-in-location">Location or container</FieldLabel>
              <Select value={destinationValue} onValueChange={(value) => value && setDestinationValue(value)} disabled={saving}>
                <SelectTrigger id="gear-check-in-location" className="w-full">
                  <SelectValue>{selectedDestinationLabel ?? "Choose destination"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Locations</SelectLabel>
                    {locations.map((location) => <SelectItem key={location.id} value={`location:${location.id}`}>{location.name}</SelectItem>)}
                  </SelectGroup>
                  {containers.length ? <SelectGroup>
                    <SelectLabel>Containers</SelectLabel>
                    {containers.map((container) => <SelectItem key={container.id} value={`container:${container.id}`}><BoxesIcon />{container.assetTag} · {container.label}</SelectItem>)}
                  </SelectGroup> : null}
                </SelectContent>
              </Select>
              {destinationValue.startsWith("container:") ? <FieldDescription>The container must have a freshly confirmed location. Use Pack a Bag or Scan multiple if confirmation is required.</FieldDescription> : null}
            </Field>
            <Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <FieldLabel>Phone coordinates</FieldLabel>
                  <FieldDescription>Optional. The named location remains the operational source of truth.</FieldDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={captureCoordinates} disabled={locating || saving}>
                  <LocateFixedIcon data-icon="inline-start" />
                  {locating ? "Locating..." : coordinates ? "Refresh coordinates" : "Use current coordinates"}
                </Button>
              </div>
              {coordinates ? <p className="font-mono text-xs text-muted-foreground">{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)} · ±{Math.round(coordinates.accuracyMeters ?? 0)} m</p> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-check-in-notes">Notes</FieldLabel>
              <Textarea id="gear-check-in-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Placed in the rear cable bin." rows={3} disabled={saving} />
            </Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="gear-check-in-form" disabled={saving || !destinationValue}>
            <MapPinCheckIcon data-icon="inline-start" />
            {saving ? "Checking in..." : `Check in ${displayTag}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
