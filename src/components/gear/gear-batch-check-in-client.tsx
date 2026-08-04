"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  KeyboardIcon,
  LogInIcon,
  MapPinCheckIcon,
  MapPinIcon,
  PlusIcon,
  ScanLineIcon,
  SquareIcon,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { GearShell } from "@/components/gear/gear-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import {
  canonicalizeAssetTag,
  createGearId,
  type GearLocation,
  type GearLocationKind,
  type InventoryAsset,
} from "@/lib/gear/domain";
import {
  checkInInventoryAsset,
  createGearLocation,
  listGearLocations,
  listInventoryAssets,
} from "@/lib/gear/repository";
import { assetTagFromScannedValue, cameraAccessErrorMessage } from "@/lib/gear/scanner";

const LOCATION_KINDS: Array<{ value: GearLocationKind; label: string }> = [
  { value: "house", label: "House" },
  { value: "vehicle", label: "Vehicle" },
  { value: "studio", label: "Studio" },
  { value: "venue", label: "Venue" },
  { value: "warehouse", label: "Warehouse" },
  { value: "container", label: "Container" },
  { value: "other", label: "Other" },
];

type SessionPhase = "setup" | "scanning" | "summary";
type CameraStatus = "idle" | "starting" | "scanning" | "error";
type ScanSource = "camera" | "manual";

interface ScannedSessionItem {
  assetId: string;
  assetTag: string;
  label: string;
  checkInId: string;
  checkedInAt: number;
  previousLocationName?: string;
}

function formatScanTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function GearBatchCheckInClient({ initialLocationId }: { initialLocationId?: string }) {
  const admin = useAdmin();
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualAssetTag, setManualAssetTag] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedSessionItem[]>([]);
  const [lastScan, setLastScan] = useState<ScannedSessionItem | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationKind, setNewLocationKind] = useState<GearLocationKind>("other");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const cameraAttemptRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const operationIdRef = useRef("");
  const sessionActiveRef = useRef(false);
  const successfulAssetIdsRef = useRef(new Set<string>());
  const processingAssetIdsRef = useRef(new Set<string>());
  const recentDetectionRef = useRef(new Map<string, number>());
  const initialLocationAppliedRef = useRef(false);

  const loadGear = useCallback(async () => {
    if (!admin.isAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [nextAssets, nextLocations] = await Promise.all([
        listInventoryAssets(),
        listGearLocations(),
      ]);
      setAssets(nextAssets);
      setLocations(nextLocations);
      if (
        initialLocationId
        && !initialLocationAppliedRef.current
        && nextLocations.some((location) => location.id === initialLocationId)
      ) {
        setSelectedLocationId(initialLocationId);
        initialLocationAppliedRef.current = true;
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not load gear and locations.");
    } finally {
      setLoading(false);
    }
  }, [admin.isAdmin, initialLocationId]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    const timeout = window.setTimeout(() => void loadGear(), 0);
    return () => window.clearTimeout(timeout);
  }, [admin.isAdmin, loadGear]);

  const sortedLocations = useMemo(() => [...locations].sort((left, right) => {
    const leftRecency = left.lastCheckInAt ?? left.updatedAt;
    const rightRecency = right.lastCheckInAt ?? right.updatedAt;
    return rightRecency - leftRecency || left.name.localeCompare(right.name);
  }), [locations]);
  const recentLocations = sortedLocations.slice(0, 4);
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null;
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const assetByTag = useMemo(() => new Map(
    assets.map((asset) => [canonicalizeAssetTag(asset.assetTag), asset]),
  ), [assets]);

  const stopCamera = useCallback((updateStatus = true) => {
    cameraAttemptRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      for (const track of video.srcObject.getTracks()) track.stop();
      video.srcObject = null;
    }
    if (updateStatus) setCameraStatus("idle");
  }, []);

  const primeFeedback = useCallback(async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
      return;
    }
    if (!("AudioContext" in window)) return;
    const context = new AudioContext();
    await context.resume();
    audioContextRef.current = context;
  }, []);

  const playSuccessFeedback = useCallback(() => {
    const context = audioContextRef.current;
    if (context?.state === "running") {
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      gain.connect(context.destination);

      for (const [frequency, offset] of [[880, 0], [1174, 0.055]] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        oscillator.connect(gain);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.1);
      }
    }
    if ("vibrate" in navigator) navigator.vibrate(70);
  }, []);

  const processScannedValue = useCallback(async (rawValue: string, source: ScanSource) => {
    if (!sessionActiveRef.current || !selectedLocation) return false;
    const assetTag = assetTagFromScannedValue(rawValue);
    const detectionKey = assetTag || rawValue.trim();
    if (!detectionKey) return false;

    const asset = assetByTag.get(assetTag);
    if (!asset) {
      const now = Date.now();
      const lastDetectedAt = recentDetectionRef.current.get(detectionKey) ?? 0;
      if (now - lastDetectedAt < 5000) return false;
      recentDetectionRef.current.set(detectionKey, now);
      toast.error(`${assetTag || "This code"} is not registered gear.`, {
        description: "Try another label or enter the asset tag manually.",
      });
      return false;
    }

    if (successfulAssetIdsRef.current.has(asset.id)) {
      if (source === "manual") toast.info(`${asset.assetTag} is already in this session.`);
      return false;
    }
    if (processingAssetIdsRef.current.has(asset.id)) return false;

    const now = Date.now();
    const lastDetectedAt = recentDetectionRef.current.get(detectionKey) ?? 0;
    if (now - lastDetectedAt < 2000) return false;
    recentDetectionRef.current.set(detectionKey, now);

    processingAssetIdsRef.current.add(asset.id);
    try {
      const previousLocationName = asset.currentLocationId
        ? locationById.get(asset.currentLocationId)?.name
        : undefined;
      const checkIn = await checkInInventoryAsset({
        assetId: asset.id,
        locationId: selectedLocation.id,
        method: source === "camera" ? "qr_camera" : "manual_bulk",
        actorId: admin.user?.uid ?? "demo-admin",
        operationId: operationIdRef.current,
      });
      const item: ScannedSessionItem = {
        assetId: asset.id,
        assetTag: asset.assetTag,
        label: asset.label,
        checkInId: checkIn.id,
        checkedInAt: checkIn.checkedInAt,
        previousLocationName,
      };
      successfulAssetIdsRef.current.add(asset.id);
      setScannedItems((current) => [...current, item]);
      setLastScan(item);
      setAssets((current) => current.map((currentAsset) => currentAsset.id === asset.id
        ? {
            ...currentAsset,
            lifecycleStatus: "active",
            currentLocationId: selectedLocation.id,
            updatedAt: checkIn.checkedInAt,
          }
        : currentAsset));
      setLocations((current) => current.map((location) => location.id === selectedLocation.id
        ? { ...location, lastCheckInAt: checkIn.checkedInAt }
        : location));
      toast.success(`${asset.assetTag} checked into ${selectedLocation.name}.`, {
        description: asset.label,
        duration: 2400,
      });
      playSuccessFeedback();
      return true;
    } catch (caught) {
      toast.error(`Could not check in ${asset.assetTag}.`, {
        description: caught instanceof Error ? caught.message : "Try scanning it again.",
      });
      recentDetectionRef.current.delete(detectionKey);
      return false;
    } finally {
      processingAssetIdsRef.current.delete(asset.id);
    }
  }, [admin.user, assetByTag, locationById, playSuccessFeedback, selectedLocation]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || cameraStatus === "starting" || cameraStatus === "scanning") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot open a live camera. Enter asset tags manually instead.");
      setCameraStatus("error");
      setManualEntryOpen(true);
      return;
    }

    const attempt = cameraAttemptRef.current + 1;
    cameraAttemptRef.current = attempt;
    setCameraError(null);
    setCameraStatus("starting");
    const permissionTimeout = window.setTimeout(() => {
      if (attempt !== cameraAttemptRef.current || controlsRef.current) return;
      cameraAttemptRef.current += 1;
      setCameraError("Camera permission is still waiting. Approve it in the browser prompt, then try again, or enter asset tags manually.");
      setCameraStatus("error");
      setManualEntryOpen(true);
    }, 15000);
    try {
      await primeFeedback();
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 250,
      });
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result) => {
          if (result && sessionActiveRef.current) {
            void processScannedValue(result.getText(), "camera");
          }
        },
      );
      if (attempt !== cameraAttemptRef.current || !sessionActiveRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setCameraStatus("scanning");
    } catch (caught) {
      if (attempt !== cameraAttemptRef.current) return;
      setCameraError(cameraAccessErrorMessage(caught));
      setCameraStatus("error");
      setManualEntryOpen(true);
    } finally {
      window.clearTimeout(permissionTimeout);
    }
  }, [cameraStatus, primeFeedback, processScannedValue]);

  useEffect(() => {
    if (phase !== "scanning" || !cameraRequested || !videoRef.current) return;
    const timeout = window.setTimeout(() => {
      setCameraRequested(false);
      void startCamera();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [cameraRequested, phase, startCamera]);

  useEffect(() => {
    function pauseHiddenCamera() {
      if (document.visibilityState === "hidden" && controlsRef.current) {
        stopCamera();
      }
    }
    document.addEventListener("visibilitychange", pauseHiddenCamera);
    return () => document.removeEventListener("visibilitychange", pauseHiddenCamera);
  }, [stopCamera]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    stopCamera(false);
    if (audioContextRef.current) void audioContextRef.current.close();
  }, [stopCamera]);

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
      toast.success(`${location.name} is ready for scanning.`);
    } catch (caught) {
      setLocationError(caught instanceof Error ? caught.message : "Could not create this location.");
    } finally {
      setSavingLocation(false);
    }
  }

  async function beginSession() {
    if (!selectedLocation) return;
    stopCamera();
    await primeFeedback().catch(() => undefined);
    operationIdRef.current = createGearId("scan");
    successfulAssetIdsRef.current = new Set();
    processingAssetIdsRef.current = new Set();
    recentDetectionRef.current = new Map();
    sessionActiveRef.current = true;
    setScannedItems([]);
    setLastScan(null);
    setManualAssetTag("");
    setManualEntryOpen(false);
    setCameraError(null);
    setCameraStatus("idle");
    setPhase("scanning");
    setCameraRequested(true);
  }

  function finishSession() {
    sessionActiveRef.current = false;
    stopCamera();
    setCameraRequested(false);
    setPhase(scannedItems.length ? "summary" : "setup");
  }

  function changeLocation() {
    sessionActiveRef.current = false;
    stopCamera();
    setSelectedLocationId("");
    setScannedItems([]);
    setLastScan(null);
    setPhase("setup");
  }

  async function submitManualAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualAssetTag.trim() || manualSubmitting) return;
    setManualSubmitting(true);
    const added = await processScannedValue(manualAssetTag, "manual");
    if (added) setManualAssetTag("");
    setManualSubmitting(false);
  }

  if (admin.loading) {
    return (
      <GearShell active="batch">
        <section className="swell-panel flex flex-col gap-4 p-5 sm:p-6">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </section>
      </GearShell>
    );
  }

  if (!admin.isAdmin) {
    const signedInWithoutAccess = Boolean(admin.user);
    return (
      <GearShell active="batch">
        <section className="swell-panel overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:p-7">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ScanLineIcon className="size-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Gear scanner</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to scan multiple items.</h1>
              <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                {signedInWithoutAccess
                  ? "This account does not have permission to change gear locations."
                  : "Camera scanning and location changes are available only to approved Swell administrators."}
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end bg-muted/35 p-4 sm:p-5">
            <Button onClick={() => setLoginOpen(true)}>
              <LogInIcon data-icon="inline-start" />
              {signedInWithoutAccess ? "Use another account" : "Sign in"}
            </Button>
          </div>
        </section>
        <AdminSignInDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          title="Sign in to scan gear"
          description="Use an approved Swell account to start a multi-item check-in session."
        />
      </GearShell>
    );
  }

  if (loading) {
    return (
      <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel flex flex-col gap-4 p-5 sm:p-6">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </section>
      </GearShell>
    );
  }

  if (phase === "summary" && selectedLocation) {
    const inventoryHref = admin.isDemoAdmin ? "/gear?demo=1" : "/gear";
    return (
      <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin}>
        <section className="swell-panel overflow-hidden">
          <div className="flex flex-col gap-4 p-5 text-center sm:p-7">
            <CheckCircle2Icon className="mx-auto size-12 text-primary" aria-hidden />
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Session complete</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {scannedItems.length} item{scannedItems.length === 1 ? "" : "s"} checked in
              </h1>
              <p className="text-base text-muted-foreground">
                Destination: <strong className="font-semibold text-foreground">{selectedLocation.name}</strong>
              </p>
            </div>
          </div>
          <Separator />
          <ol aria-label="Checked-in gear" className="divide-y">
            {scannedItems.map((item) => (
              <li className="flex items-start gap-3 p-4 sm:px-5" key={item.checkInId}>
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold">{item.assetTag}</strong>
                    <Badge variant="secondary">{formatScanTime(item.checkedInAt)}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{item.label}</span>
                </span>
              </li>
            ))}
          </ol>
          <Separator />
          <div className="grid gap-2 bg-muted/35 p-4 sm:grid-cols-2 sm:p-5">
            <Button variant="outline" onClick={changeLocation}>Choose another location</Button>
            <Button onClick={() => void beginSession()}>
              <ScanLineIcon data-icon="inline-start" />
              Scan more here
            </Button>
            <Link className={buttonVariants({ variant: "ghost", className: "sm:col-span-2" })} href={inventoryHref}>
              Return to inventory
            </Link>
          </div>
        </section>
      </GearShell>
    );
  }

  if (phase === "scanning" && selectedLocation) {
    return (
      <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin}>
        <section className="flex flex-col gap-4">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="swell-page-kicker">Checking in to {selectedLocation.name}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Scan gear labels</h1>
            </div>
            <Badge variant="secondary">{scannedItems.length} scanned</Badge>
          </header>

          <div className="relative overflow-hidden rounded-xl border-2 border-foreground bg-foreground text-background">
            <video
              ref={videoRef}
              aria-label="Live rear-camera preview"
              autoPlay
              muted
              playsInline
              className="aspect-[3/4] w-full object-cover sm:aspect-video"
            />
            {cameraStatus === "scanning" ? (
              <>
                <div className="pointer-events-none absolute inset-[11%] rounded-xl border-2 border-background/80" aria-hidden />
                <Badge className="absolute left-3 top-3" variant="secondary">
                  <span className="size-2 rounded-full bg-primary" aria-hidden />
                  Camera on
                </Badge>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-foreground/85 p-6 text-center">
                <CameraIcon className="size-10" aria-hidden />
                <div className="flex max-w-sm flex-col gap-1">
                  <strong>{cameraStatus === "starting" ? "Starting camera..." : "Camera paused"}</strong>
                  <span className="text-sm text-background/75">
                    Point the rear camera at a Swell QR code or asset barcode.
                  </span>
                </div>
                {cameraStatus !== "starting" ? (
                  <Button variant="secondary" onClick={() => setCameraRequested(true)}>
                    <CameraIcon data-icon="inline-start" />
                    {cameraStatus === "error" ? "Try camera again" : "Start camera"}
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          {cameraError ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>Camera unavailable</AlertTitle>
              <AlertDescription>{cameraError}</AlertDescription>
            </Alert>
          ) : null}

          <p className="sr-only" aria-live="polite">
            {lastScan ? `${lastScan.assetTag} checked into ${selectedLocation.name}.` : "Scanner ready."}
          </p>

          <div className="flex flex-col gap-2">
            <Button variant="ghost" onClick={() => setManualEntryOpen((current) => !current)} aria-expanded={manualEntryOpen}>
              <KeyboardIcon data-icon="inline-start" />
              Enter an asset tag instead
            </Button>
            {manualEntryOpen ? (
              <form className="swell-panel flex flex-col gap-3 p-4" onSubmit={submitManualAsset}>
                <Field>
                  <FieldLabel htmlFor="manual-scanner-asset-tag">Asset tag</FieldLabel>
                  <Input
                    id="manual-scanner-asset-tag"
                    value={manualAssetTag}
                    onChange={(event) => setManualAssetTag(event.target.value)}
                    placeholder="XLR-04-10"
                    autoCapitalize="characters"
                    autoComplete="off"
                    disabled={manualSubmitting}
                  />
                  <FieldDescription>Enter the code printed beneath the barcode.</FieldDescription>
                </Field>
                <Button type="submit" disabled={manualSubmitting || !manualAssetTag.trim()}>
                  <MapPinCheckIcon data-icon="inline-start" />
                  {manualSubmitting ? "Checking in..." : "Check in tag"}
                </Button>
              </form>
            ) : null}
          </div>

          <section className="swell-panel overflow-hidden" aria-labelledby="session-scans-heading">
            <div className="flex items-center justify-between gap-3 p-4 sm:px-5">
              <h2 className="font-semibold" id="session-scans-heading">This session</h2>
              <Badge variant="outline">{scannedItems.length}</Badge>
            </div>
            <Separator />
            {scannedItems.length ? (
              <ol className="divide-y">
                {[...scannedItems].reverse().slice(0, 6).map((item) => (
                  <li className="flex items-start gap-3 p-4 sm:px-5" key={item.checkInId}>
                    <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate font-semibold">{item.assetTag}</strong>
                      <span className="block truncate text-sm text-muted-foreground">{item.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{formatScanTime(item.checkedInAt)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty className="border-0 py-8">
                <EmptyHeader>
                  <EmptyTitle>No labels scanned yet</EmptyTitle>
                  <EmptyDescription>Hold one label inside the frame until you hear the confirmation tone.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>

          <div className="sticky bottom-2 flex items-center gap-3 rounded-xl border-2 border-foreground bg-card p-3 shadow-md">
            <span className="min-w-0 flex-1 text-sm">
              <strong className="block truncate">{selectedLocation.name}</strong>
              <span className="text-muted-foreground">{scannedItems.length} checked in</span>
            </span>
            <Button onClick={finishSession}>
              <SquareIcon data-icon="inline-start" />
              {scannedItems.length ? "Done" : "Cancel"}
            </Button>
          </div>
        </section>
      </GearShell>
    );
  }

  return (
    <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin}>
      <section className="swell-panel overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Multi-item check-in</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where is this gear going?</h1>
              <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                Choose one destination, then scan as many QR codes or barcodes as you need.
              </p>
            </div>
            <ScanLineIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
          </div>

          {loadError ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden />
              <AlertTitle>Could not load the scanner</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          {recentLocations.length ? (
            <Field>
              <FieldLabel id="recent-batch-locations">Recent locations</FieldLabel>
              <ToggleGroup
                aria-labelledby="recent-batch-locations"
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
                    className="min-h-11 w-full justify-start px-3 text-left"
                  >
                    <MapPinIcon aria-hidden />
                    <span className="truncate">{location.name}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="batch-check-in-location">Search all locations</FieldLabel>
            <Combobox
              items={sortedLocations}
              itemToStringValue={(location) => location.name}
              value={selectedLocation}
              onValueChange={(location) => setSelectedLocationId(location?.id ?? "")}
              autoHighlight
            >
              <ComboboxInput id="batch-check-in-location" className="w-full" placeholder="Search locations..." showClear />
              <ComboboxContent>
                <ComboboxEmpty>No matching location.</ComboboxEmpty>
                <ComboboxList>
                  {(location) => (
                    <ComboboxItem key={location.id} value={location}>{location.name}</ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
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
                    <FieldLabel htmlFor="new-batch-location-name">Location name</FieldLabel>
                    <Input
                      id="new-batch-location-name"
                      value={newLocationName}
                      onChange={(event) => setNewLocationName(event.target.value)}
                      placeholder="Ike studio"
                      aria-invalid={Boolean(locationError)}
                      autoFocus
                      required
                      disabled={savingLocation}
                    />
                    <FieldError>{locationError}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-batch-location-kind">Type</FieldLabel>
                    <Select
                      value={newLocationKind}
                      onValueChange={(value) => value && setNewLocationKind(value as GearLocationKind)}
                      disabled={savingLocation}
                    >
                      <SelectTrigger id="new-batch-location-kind" className="w-full"><SelectValue /></SelectTrigger>
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
          <Button size="lg" className="w-full" onClick={() => void beginSession()} disabled={!selectedLocation || Boolean(loadError)}>
            <CameraIcon data-icon="inline-start" />
            {selectedLocation ? `Start scanning into ${selectedLocation.name}` : "Choose a location"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your browser will ask for camera permission. Video stays on this device.
          </p>
        </div>
      </section>
    </GearShell>
  );
}
