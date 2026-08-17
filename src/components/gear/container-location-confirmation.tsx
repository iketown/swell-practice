"use client";

import { CheckCircle2Icon, Clock3Icon, MapPinCheckIcon, MapPinIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { inventoryAssetLocationChain, type GearLocation, type InventoryAsset, type InventoryCheckInOutcome } from "@/lib/gear/domain";
import { checkInInventoryAsset } from "@/lib/gear/repository";

export function ContainerLocationConfirmation({
  container,
  assets,
  locations,
  actorId,
  onConfirmed,
}: {
  container: InventoryAsset;
  assets: InventoryAsset[];
  locations: GearLocation[];
  actorId: string;
  onConfirmed: (outcome: InventoryCheckInOutcome, location: GearLocation) => void;
}) {
  const currentLocationId = container.effectiveLocationId ?? container.currentLocationId ?? "";
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedLocations = useMemo(() => [...locations].sort((left, right) => {
    const leftRecency = left.lastCheckInAt ?? left.updatedAt;
    const rightRecency = right.lastCheckInAt ?? right.updatedAt;
    return rightRecency - leftRecency || left.name.localeCompare(right.name);
  }), [locations]);
  const recentLocations = sortedLocations
    .filter((location) => location.id !== currentLocationId)
    .slice(0, 3);
  const currentLocation = locations.find((location) => location.id === currentLocationId);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null;
  const currentChain = inventoryAssetLocationChain(container, assets, locations);

  async function confirmLocation() {
    if (!selectedLocation || saving) return;
    setSaving(true);
    setError(null);
    try {
      const outcome = await checkInInventoryAsset({
        assetId: container.id,
        destination: { kind: "location", locationId: selectedLocation.id },
        method: "manual_single",
        actorId,
        notes: "Container location confirmed before packing.",
      });
      onConfirmed(outcome, selectedLocation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not confirm this container's location.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <MapPinCheckIcon aria-hidden />
        <AlertTitle>Confirm the bag before packing</AlertTitle>
        <AlertDescription>
          This fresh check-in prevents everything you add from inheriting an old location.
        </AlertDescription>
      </Alert>

      <section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="container-current-location">
        <p className="text-sm text-muted-foreground" id="container-current-location">Container is currently at</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <strong className="text-lg">{currentLocation?.name ?? "No confirmed location"}</strong>
          {container.lastPlacedAt ? (
            <Badge variant="outline">
              <Clock3Icon aria-hidden />
              checked in {relativeTime(container.lastPlacedAt)}
            </Badge>
          ) : null}
        </div>
        {container.currentPlacement?.kind === "container" ? (
          <p className="mt-2 text-sm text-muted-foreground">Last known chain: {currentChain}. Confirming a location will take this container out of its parent container.</p>
        ) : null}
      </section>

      {currentLocation ? (
        <Button
          type="button"
          size="lg"
          variant={selectedLocationId === currentLocation.id ? "default" : "outline"}
          className="w-full justify-start"
          onClick={() => setSelectedLocationId(currentLocation.id)}
          disabled={saving}
        >
          <MapPinIcon data-icon="inline-start" />
          {currentLocation.name}
          <Badge variant="secondary" className="ml-auto">Current</Badge>
        </Button>
      ) : null}

      {recentLocations.length ? (
        <Field>
          <FieldLabel id="recent-container-locations">Recent locations</FieldLabel>
          <ToggleGroup
            aria-labelledby="recent-container-locations"
            className="w-full"
            orientation="vertical"
            spacing={2}
            value={selectedLocationId ? [selectedLocationId] : []}
            onValueChange={(values) => setSelectedLocationId(values[0] ?? "")}
            variant="outline"
          >
            {recentLocations.map((location) => (
              <ToggleGroupItem key={location.id} value={location.id} className="min-h-11 w-full justify-start px-3 text-left">
                <MapPinIcon aria-hidden />
                <span className="truncate">{location.name}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      ) : null}

      <Field>
        <FieldLabel htmlFor="container-location-search">Search for another location</FieldLabel>
        <Combobox
          items={sortedLocations}
          itemToStringValue={(location) => location.name}
          value={selectedLocation}
          onValueChange={(location) => setSelectedLocationId(location?.id ?? "")}
          autoHighlight
        >
          <ComboboxInput id="container-location-search" className="w-full" placeholder="Search locations..." showClear />
          <ComboboxContent>
            <ComboboxEmpty>No matching location.</ComboboxEmpty>
            <ComboboxList>
              {(location) => <ComboboxItem key={location.id} value={location}>{location.name}</ComboboxItem>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>This writes a new location observation for container {container.assetTag}.</FieldDescription>
      </Field>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button type="button" size="lg" className="w-full" onClick={() => void confirmLocation()} disabled={!selectedLocation || saving}>
        {saving ? <Clock3Icon data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
        {saving ? "Confirming location..." : selectedLocation ? `Confirm at ${selectedLocation.name}` : "Choose a location"}
      </Button>
    </div>
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
