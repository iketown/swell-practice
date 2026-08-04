"use client";

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  LogInIcon,
  MailIcon,
  MapPinCheckIcon,
  MapPinIcon,
  PackageSearchIcon,
  PlusIcon,
  ScanLineIcon,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { GearShell } from "@/components/gear/gear-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import type { GearLocation, GearLocationKind, InventoryAsset, PublicGearAsset } from "@/lib/gear/domain";
import {
  checkInInventoryAsset,
  createGearLocation,
  getInventoryAssetByTag,
  getPublicGearAssetByTag,
  listGearLocations,
  syncPublicGearAssetRecords,
} from "@/lib/gear/repository";

const LOCATION_KINDS: Array<{ value: GearLocationKind; label: string }> = [
  { value: "house", label: "House" },
  { value: "vehicle", label: "Vehicle" },
  { value: "studio", label: "Studio" },
  { value: "venue", label: "Venue" },
  { value: "warehouse", label: "Warehouse" },
  { value: "container", label: "Container" },
  { value: "other", label: "Other" },
];

function ownerNoteHref(assetTag: string, label: string) {
  const recipient = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",")[0]?.trim() ?? "";
  const subject = `Note about ${label} (${assetTag})`;
  const body = `I scanned the gear label for ${label} (${assetTag}) and wanted to send you a note.\n\nLabel: https://theswell.live/g/${assetTag.toLowerCase()}`;
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function GearScanClient({ assetTag }: { assetTag: string }) {
  const admin = useAdmin();
  const [publicAsset, setPublicAsset] = useState<PublicGearAsset | null>(null);
  const [asset, setAsset] = useState<InventoryAsset | null>(null);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [completedLocation, setCompletedLocation] = useState<GearLocation | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationKind, setNewLocationKind] = useState<GearLocationKind>("other");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setPublicLoading(true);
      setPublicError(null);
      try {
        const result = await getPublicGearAssetByTag(assetTag);
        if (active) setPublicAsset(result);
      } catch (caught) {
        if (active) setPublicError(caught instanceof Error ? caught.message : "Could not look up this gear label.");
      } finally {
        if (active) setPublicLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [assetTag]);

  useEffect(() => {
    if (admin.loading) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!admin.isAdmin) {
        setAsset(null);
        setLocations([]);
        setPrivateLoading(false);
        setPrivateError(null);
        return;
      }

      setPrivateLoading(true);
      setPrivateError(null);
      try {
        const [nextAsset, nextLocations] = await Promise.all([getInventoryAssetByTag(assetTag), listGearLocations()]);
        if (active) {
          setAsset(nextAsset);
          setLocations(nextLocations);
          if (nextAsset) {
            setPublicAsset({ assetTag: nextAsset.assetTag, label: nextAsset.label, updatedAt: nextAsset.updatedAt });
            void syncPublicGearAssetRecords([nextAsset]).catch(() => undefined);
          }
        }
      } catch (caught) {
        if (active) setPrivateError(caught instanceof Error ? caught.message : "Could not load check-in options.");
      } finally {
        if (active) setPrivateLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [admin.isAdmin, admin.loading, assetTag]);

  const sortedLocations = [...locations].sort((left, right) => {
    const leftRecency = left.lastCheckInAt ?? (asset?.currentLocationId === left.id ? asset.updatedAt : 0);
    const rightRecency = right.lastCheckInAt ?? (asset?.currentLocationId === right.id ? asset.updatedAt : 0);
    return rightRecency - leftRecency || left.name.localeCompare(right.name);
  });
  const recentLocations = sortedLocations.slice(0, 4);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null;
  const currentLocation = locations.find((location) => location.id === asset?.currentLocationId) ?? null;
  const displayLabel = asset?.label ?? publicAsset?.label ?? "this piece of Swell gear";
  const displayTag = asset?.assetTag ?? publicAsset?.assetTag ?? assetTag;
  const noteHref = ownerNoteHref(displayTag, displayLabel);

  async function submitNewLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLocationName.trim() || savingLocation) return;
    setSavingLocation(true);
    setLocationError(null);
    try {
      const location = await createGearLocation({ name: newLocationName, kind: newLocationKind });
      setLocations((current) => [...current, location]);
      setSelectedLocationId(location.id);
      setNewLocationName("");
      setNewLocationKind("other");
      setCreatingLocation(false);
      toast.success(`${location.name} is ready. Confirm the check-in below.`);
    } catch (caught) {
      setLocationError(caught instanceof Error ? caught.message : "Could not create this location.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function checkIn() {
    if (!asset || !selectedLocation || checkingIn) return;
    setCheckingIn(true);
    setCheckInError(null);
    try {
      await checkInInventoryAsset({
        assetId: asset.id,
        locationId: selectedLocation.id,
        method: "qr_camera",
        actorId: admin.user?.uid ?? "demo-admin",
      });
      const checkedInAt = Date.now();
      setAsset({
        ...asset,
        lifecycleStatus: "active",
        currentLocationId: selectedLocation.id,
        updatedAt: checkedInAt,
      });
      setLocations((current) => current.map((location) => location.id === selectedLocation.id
        ? { ...location, lastCheckInAt: checkedInAt }
        : location));
      setCompletedLocation(selectedLocation);
      toast.success(`${asset.label} is checked in at ${selectedLocation.name}.`);
    } catch (caught) {
      setCheckInError(caught instanceof Error ? caught.message : "Could not check in this item.");
    } finally {
      setCheckingIn(false);
    }
  }

  function beginAnotherCheckIn() {
    setCompletedLocation(null);
    setSelectedLocationId("");
    setCheckInError(null);
  }

  if (publicLoading || admin.loading) {
    return (
      <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel mx-auto flex w-full max-w-xl flex-col gap-4 p-5 sm:p-6">
          <Skeleton className="size-12" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </section>
      </GearShell>
    );
  }

  if (!admin.isAdmin) {
    const signedInWithoutAccess = Boolean(admin.user);
    return (
      <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex flex-col gap-5 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                <PackageSearchIcon className="size-6" aria-hidden />
              </span>
              <Badge variant="secondary">{displayTag}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Gear label scanned</p>
              <h1 className="max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">
                You scanned the code on {displayLabel}.
              </h1>
              <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                {signedInWithoutAccess
                  ? "This account does not have permission to change gear locations."
                  : "Only signed-in Swell administrators can check gear in or change its location."}
              </p>
              {!publicAsset && publicError ? (
                <p className="text-sm text-destructive" role="alert">We could not load the public name for this label.</p>
              ) : null}
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-2 bg-muted/35 p-4 sm:flex-row sm:justify-end sm:p-5">
            <Button variant="outline" nativeButton={false} render={<a href={noteHref} />}>
              <MailIcon data-icon="inline-start" />
              Send note to owner
            </Button>
            {signedInWithoutAccess ? (
              <Button onClick={() => void admin.signOut().then(() => setLoginOpen(true))}>
                <LogInIcon data-icon="inline-start" />
                Use another account
              </Button>
            ) : (
              <Button onClick={() => setLoginOpen(true)}>
                <LogInIcon data-icon="inline-start" />
                Sign in
              </Button>
            )}
          </div>
        </section>
        <AdminSignInDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          title="Sign in to check in gear"
          description={`Sign in with an approved Swell account to update ${displayLabel}.`}
        />
      </GearShell>
    );
  }

  if (privateLoading) {
    return (
      <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel mx-auto flex w-full max-w-xl flex-col gap-3 p-5 sm:p-6">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </section>
      </GearShell>
    );
  }

  if (!asset || privateError) {
    return (
      <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel mx-auto flex w-full max-w-xl flex-col gap-3 p-5 sm:p-6">
          <PackageSearchIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="swell-page-kicker">Gear label</p>
          <h1 className="text-2xl font-semibold">Could not find {displayTag}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {privateError ?? "This asset tag is not registered in the gear system."}
          </p>
        </section>
      </GearShell>
    );
  }

  if (completedLocation) {
    const gearHref = `/gear?asset=${encodeURIComponent(asset.assetTag)}${admin.isDemoAdmin ? "&demo=1" : ""}`;
    const batchHref = `/gear/check-in?location=${encodeURIComponent(completedLocation.id)}${admin.isDemoAdmin ? "&demo=1" : ""}`;
    return (
      <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel mx-auto w-full max-w-xl overflow-hidden">
          <div className="flex flex-col gap-5 p-5 text-center sm:p-7">
            <CheckCircle2Icon className="mx-auto size-12 text-primary" aria-hidden />
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Check-in complete</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{asset.label}</h1>
              <p className="text-base text-muted-foreground">
                Checked in at <strong className="font-semibold text-foreground">{completedLocation.name}</strong>.
              </p>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2 bg-muted/35 p-4 sm:grid-cols-2 sm:p-5">
            <Button variant="outline" onClick={beginAnotherCheckIn}>Check in somewhere else</Button>
            <Link className={buttonVariants({ variant: "outline" })} href={gearHref}>
              Open gear record
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
            <Link className={buttonVariants({ className: "sm:col-span-2" })} href={batchHref}>
              <ScanLineIcon data-icon="inline-start" />
              Scan more gear here
            </Link>
          </div>
        </section>
      </GearShell>
    );
  }

  return (
    <GearShell assetTag={assetTag} isAdmin={admin.isAdmin} isDemoAdmin={admin.isDemoAdmin}>
      <section className="swell-panel mx-auto w-full max-w-xl overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="swell-page-kicker">{asset.assetTag}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Check {asset.label} in to:
              </h1>
            </div>
            <MapPinCheckIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
          </div>

          {currentLocation ? (
            <p className="text-sm text-muted-foreground">
              Currently recorded at <span className="font-medium text-foreground">{currentLocation.name}</span>.
            </p>
          ) : null}

          {recentLocations.length ? (
            <Field>
              <FieldLabel id="recent-gear-locations">Recent locations</FieldLabel>
              <ToggleGroup
                aria-labelledby="recent-gear-locations"
                className="w-full"
                orientation="vertical"
                spacing={2}
                value={selectedLocationId ? [selectedLocationId] : []}
                onValueChange={(values) => setSelectedLocationId(values[0] ?? "")}
                variant="outline"
              >
                {recentLocations.map((location) => (
                  <ToggleGroupItem
                    key={location.id}
                    value={location.id}
                    className="min-h-11 w-full justify-between px-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPinIcon aria-hidden />
                      <span className="truncate">{location.name}</span>
                    </span>
                    {asset.currentLocationId === location.id ? <Badge variant="secondary">Current</Badge> : null}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="all-gear-locations">Search all locations</FieldLabel>
            <Combobox
              items={sortedLocations}
              itemToStringValue={(location) => location.name}
              value={selectedLocation}
              onValueChange={(location) => setSelectedLocationId(location?.id ?? "")}
              autoHighlight
            >
              <ComboboxInput id="all-gear-locations" className="w-full" placeholder="Search locations..." showClear />
              <ComboboxContent>
                <ComboboxEmpty>No matching location.</ComboboxEmpty>
                <ComboboxList>
                  {(location) => (
                    <ComboboxItem key={location.id} value={location}>
                      {location.name}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldDescription>Choose an existing location, or set up a new one below.</FieldDescription>
          </Field>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            aria-expanded={creatingLocation}
            onClick={() => {
              setCreatingLocation((current) => !current);
              setLocationError(null);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Create new location
          </Button>

          {creatingLocation ? (
            <>
              <Separator />
              <form onSubmit={submitNewLocation} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-invalid={Boolean(locationError)}>
                    <FieldLabel htmlFor="new-gear-location-name">Location name</FieldLabel>
                    <Input
                      id="new-gear-location-name"
                      value={newLocationName}
                      onChange={(event) => setNewLocationName(event.target.value)}
                      placeholder="Ike's closet"
                      aria-invalid={Boolean(locationError)}
                      autoFocus
                      required
                      disabled={savingLocation}
                    />
                    <FieldError>{locationError}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-gear-location-kind">Type</FieldLabel>
                    <Select
                      value={newLocationKind}
                      onValueChange={(value) => value && setNewLocationKind(value as GearLocationKind)}
                      disabled={savingLocation}
                    >
                      <SelectTrigger id="new-gear-location-kind" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {LOCATION_KINDS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" onClick={() => setCreatingLocation(false)} disabled={savingLocation}>Cancel</Button>
                  <Button type="submit" disabled={savingLocation || !newLocationName.trim()}>
                    <PlusIcon data-icon="inline-start" />
                    {savingLocation ? "Creating..." : "Create location"}
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </div>

        <Separator />
        <div className="flex flex-col gap-2 bg-muted/35 p-4 sm:p-5">
          {checkInError ? <p className="text-sm text-destructive" role="alert">{checkInError}</p> : null}
          <Button size="lg" className="w-full" onClick={() => void checkIn()} disabled={!selectedLocation || checkingIn}>
            <MapPinCheckIcon data-icon="inline-start" />
            {checkingIn
              ? "Checking in..."
              : selectedLocation
                ? `Check in at ${selectedLocation.name}`
                : "Choose a location"}
          </Button>
        </div>
      </section>
    </GearShell>
  );
}
