"use client";

import { AlertCircleIcon, BoxesIcon, CheckCircle2Icon, LocateFixedIcon, MapPinCheckIcon, MapPinIcon } from "lucide-react";
import { FormEvent, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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

type CheckInStep = "details" | "confirm-container" | "choose-container-location";

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
  onContainerConfirmed,
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
  onContainerConfirmed: (assets: InventoryAsset[], location: GearLocation) => void;
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
  const [step, setStep] = useState<CheckInStep>("details");
  const [alternativeLocationId, setAlternativeLocationId] = useState("");

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

  if (!asset) return null;
  const checkInAssetId = asset.id;
  const powerDependencies = resolvePowerDependencies(asset, definition);
  const displayTag = powerCheckInTag(asset.assetTag, powerDependencies.needsPowerAdapter);
  const companions = (connectedAssets ?? []).filter((item) => item.id !== asset.id);
  const containers = assets.filter((item) => item.lifecycleStatus === "active" && item.canContainAssets && item.id !== asset.id);
  const selectedContainer = destinationValue.startsWith("container:")
    ? containers.find((container) => `container:${container.id}` === destinationValue) ?? null
    : null;
  const currentContainerLocationId = selectedContainer?.effectiveLocationId ?? selectedContainer?.currentLocationId ?? "";
  const currentContainerLocation = locations.find((location) => location.id === currentContainerLocationId) ?? null;
  const alternativeLocations = [...locations]
    .filter((location) => location.id !== currentContainerLocationId)
    .sort((left, right) => {
      const leftRecency = left.lastCheckInAt ?? left.updatedAt;
      const rightRecency = right.lastCheckInAt ?? right.updatedAt;
      return rightRecency - leftRecency || left.name.localeCompare(right.name);
    });
  const selectedAlternativeLocation = locations.find((location) => location.id === alternativeLocationId) ?? null;
  const selectedDestinationLabel = destinationValue.startsWith("container:")
    ? containers.find((container) => `container:${container.id}` === destinationValue)?.label
    : locations.find((location) => `location:${location.id}` === destinationValue)?.name;

  async function recordItemCheckIn(destination: CheckInDestination) {
    const outcome = await checkInInventoryAsset({
      assetId: checkInAssetId,
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
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!destinationValue || saving) return;
    const [kind, id] = destinationValue.split(":", 2);
    if (kind === "container") {
      setError(null);
      setStep(currentContainerLocation ? "confirm-container" : "choose-container-location");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await recordItemCheckIn({ kind: "location", locationId: id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check in this item.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmContainerAndContinue(location: GearLocation) {
    if (!selectedContainer || saving) return;
    setSaving(true);
    setError(null);
    try {
      const containerOutcome = await checkInInventoryAsset({
        assetId: selectedContainer.id,
        destination: { kind: "location", locationId: location.id },
        method: "manual_single",
        actorId,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        accuracyMeters: coordinates?.accuracyMeters,
        notes: `Container location confirmed before checking in ${displayTag}.`,
      });
      onContainerConfirmed(containerOutcome.propagatedAssets ?? containerOutcome.assets, location);
      await recordItemCheckIn({ kind: "container", containerAssetId: selectedContainer.id });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete this check-in.");
    } finally {
      setSaving(false);
    }
  }

  const dialogTitle = step === "confirm-container" && selectedContainer && currentContainerLocation
    ? `Is ${selectedContainer.label} still in ${currentContainerLocation.name}?`
    : step === "choose-container-location" && selectedContainer
      ? `Where is ${selectedContainer.label} now?`
      : `Check in ${displayTag}`;
  const dialogDescription = step === "confirm-container" && selectedContainer && currentContainerLocation
    ? `Yes will refresh the container location, then check ${displayTag} into it.${selectedContainer.lastPlacedAt ? ` It was last checked in ${relativeTime(selectedContainer.lastPlacedAt)}.` : ""}${selectedContainer.currentPlacement?.kind === "container" ? " This will take it out of its outer container." : ""}`
    : step === "choose-container-location" && selectedContainer
      ? `Choose the container's current location. We'll update ${selectedContainer.label}, then finish checking in ${displayTag}.`
      : `${asset.label}. This records that the item${powerDependencies.needsPowerAdapter ? " and its matching adapter are" : " is"} at this location now.${companions.length ? ` It will also check in ${companions.map((item) => item.assetTag).join(", ")} because they stay connected.` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        {step === "details" ? (
          <form id="gear-check-in-form" onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="gear-check-in-location">Location or container</FieldLabel>
                <Select value={destinationValue} onValueChange={(value) => {
                  if (!value) return;
                  setDestinationValue(value);
                  setAlternativeLocationId("");
                  setError(null);
                }} disabled={saving}>
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
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden />
                <AlertTitle>Could not complete check-in</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        ) : step === "confirm-container" && selectedContainer && currentContainerLocation ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinIcon className="size-4" aria-hidden />
              Current container location: <strong className="text-foreground">{currentContainerLocation.name}</strong>
            </p>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden />
                <AlertTitle>Could not continue</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : selectedContainer ? (
          <Field>
            <FieldLabel htmlFor="gear-check-in-container-location">Container location</FieldLabel>
            <Combobox
              items={alternativeLocations}
              itemToStringValue={(location) => location.name}
              value={selectedAlternativeLocation}
              onValueChange={(location) => setAlternativeLocationId(location?.id ?? "")}
              autoHighlight
            >
              <ComboboxInput id="gear-check-in-container-location" className="w-full" placeholder="Search locations..." showClear disabled={saving} />
              <ComboboxContent>
                <ComboboxEmpty>No matching location.</ComboboxEmpty>
                <ComboboxList>
                  {(location) => <ComboboxItem key={location.id} value={location}>{location.name}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldDescription>This records a fresh location for container {selectedContainer.assetTag} before adding {displayTag}.</FieldDescription>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden />
                <AlertTitle>Could not continue</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </Field>
        ) : null}
        {step === "details" ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="gear-check-in-form" disabled={saving || !destinationValue}>
              <MapPinCheckIcon data-icon="inline-start" />
              {saving ? "Checking in..." : `Check in ${displayTag}`}
            </Button>
          </DialogFooter>
        ) : step === "confirm-container" && currentContainerLocation ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setStep("choose-container-location");
              setError(null);
            }} disabled={saving}>
              <MapPinIcon data-icon="inline-start" />
              No, choose another location
            </Button>
            <Button type="button" onClick={() => void confirmContainerAndContinue(currentContainerLocation)} disabled={saving}>
              <CheckCircle2Icon data-icon="inline-start" />
              {saving ? "Confirming and checking in..." : "Yes, continue"}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              setStep(currentContainerLocation ? "confirm-container" : "details");
              setError(null);
            }} disabled={saving}>Back</Button>
            <Button type="button" onClick={() => selectedAlternativeLocation && void confirmContainerAndContinue(selectedAlternativeLocation)} disabled={saving || !selectedAlternativeLocation}>
              <MapPinCheckIcon data-icon="inline-start" />
              {saving ? "Updating and checking in..." : "Update container and continue"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function relativeTime(value: number) {
  const elapsed = Math.max(0, Date.now() - value);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
