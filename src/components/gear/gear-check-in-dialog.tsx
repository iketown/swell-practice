"use client";

import { LocateFixedIcon, MapPinCheckIcon } from "lucide-react";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { GearLocation, InventoryAsset } from "@/lib/gear/domain";
import { checkInInventoryAsset } from "@/lib/gear/repository";

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export function GearCheckInDialog({
  open,
  onOpenChange,
  asset,
  locations,
  actorId,
  onCheckedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: InventoryAsset | null;
  locations: GearLocation[];
  actorId: string;
  onCheckedIn: (assetId: string, locationId: string) => void;
}) {
  const [locationId, setLocationId] = useState(asset?.currentLocationId ?? "");
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
    if (!asset || !locationId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await checkInInventoryAsset({
        assetId: asset.id,
        locationId,
        method: "manual",
        actorId,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        accuracyMeters: coordinates?.accuracyMeters,
        notes,
      });
      onCheckedIn(asset.id, locationId);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check in this item.");
    } finally {
      setSaving(false);
    }
  }

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check in {asset.label}</DialogTitle>
          <DialogDescription>This creates an append-only observation that the item is at this location now. It does not require recording where it came from.</DialogDescription>
        </DialogHeader>
        <form id="gear-check-in-form" onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="gear-check-in-location">Location</FieldLabel>
              <Select value={locationId} onValueChange={(value) => value && setLocationId(value)} disabled={saving}>
                <SelectTrigger id="gear-check-in-location" className="w-full"><SelectValue placeholder="Choose destination" /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
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
          <Button type="submit" form="gear-check-in-form" disabled={saving || !locationId}>
            <MapPinCheckIcon data-icon="inline-start" />
            {saving ? "Checking in..." : "Check in item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
