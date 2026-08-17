"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangleIcon,
  BoxesIcon,
  CameraIcon,
  CheckCircle2Icon,
  LogInIcon,
  MapPinIcon,
  PackageCheckIcon,
  SearchIcon,
  StopCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { ContainerLocationConfirmation } from "@/components/gear/container-location-confirmation";
import { GearShell } from "@/components/gear/gear-shell";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import {
  canonicalizeAssetTag,
  inventoryAssetLocationChain,
  isContainerInventoryAsset,
  normalizeGearSearchText,
  type GearLocation,
  type InventoryAsset,
  type InventoryCheckInOutcome,
} from "@/lib/gear/domain";
import {
  checkInInventoryAsset,
  listGearLocations,
  listInventoryAssets,
  updateContainerExpectedContents,
} from "@/lib/gear/repository";
import { assetTagFromScannedValue, cameraAccessErrorMessage } from "@/lib/gear/scanner";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";

type CameraStatus = "idle" | "starting" | "scanning" | "error";

interface ContentRow {
  asset: InventoryAsset;
  depth: number;
}

export function GearPackClient({ initialContainerTag }: { initialContainerTag?: string }) {
  const admin = useAdmin();
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [definitions, setDefinitions] = useState<EquipmentTemplate[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [packingAssetIds, setPackingAssetIds] = useState<Set<string>>(new Set());
  const [savingExpectedContents, setSavingExpectedContents] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const cameraAttemptRef = useRef(0);
  const recentScanRef = useRef(new Map<string, number>());
  const initialContainerAppliedRef = useRef(false);

  const loadGear = useCallback(async () => {
    if (!admin.isAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [nextAssets, nextLocations, nextDefinitions] = await Promise.all([
        listInventoryAssets(),
        listGearLocations(),
        listEquipmentTemplates(),
      ]);
      setAssets(nextAssets);
      setLocations(nextLocations);
      setDefinitions(nextDefinitions);
      if (initialContainerTag && !initialContainerAppliedRef.current) {
        const canonical = canonicalizeAssetTag(initialContainerTag);
        const initial = nextAssets.find((asset) => isContainerInventoryAsset(asset) && (
          asset.id === initialContainerTag || canonicalizeAssetTag(asset.assetTag) === canonical
        ));
        if (initial) setSelectedContainerId(initial.id);
        initialContainerAppliedRef.current = true;
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not load containers and inventory.");
    } finally {
      setLoading(false);
    }
  }, [admin.isAdmin, initialContainerTag]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    const timeout = window.setTimeout(() => void loadGear(), 0);
    return () => window.clearTimeout(timeout);
  }, [admin.isAdmin, loadGear]);

  const containers = useMemo(() => assets
    .filter((asset) => asset.lifecycleStatus === "active" && isContainerInventoryAsset(asset))
    .sort((left, right) => left.assetTag.localeCompare(right.assetTag)), [assets]);
  const selectedContainer = containers.find((container) => container.id === selectedContainerId) ?? null;
  const definitionById = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const normalizedQuery = normalizeGearSearchText(query);
  const matchingAssets = useMemo(() => assets
    .filter((asset) => asset.lifecycleStatus === "active" && asset.id !== selectedContainerId)
    .filter((asset) => {
      if (!normalizedQuery) return true;
      const definition = definitionById.get(asset.definitionId);
      return [
        asset.assetTag,
        asset.label,
        asset.serialNumber,
        asset.cableManufacturer,
        definition?.name,
        definition?.manufacturer,
        definition?.model,
        ...asset.tags,
      ].some((value) => normalizeGearSearchText(value ?? "").includes(normalizedQuery));
    })
    .sort((left, right) => left.assetTag.localeCompare(right.assetTag))
    .slice(0, 40), [assets, definitionById, normalizedQuery, selectedContainerId]);
  const contentRows = useMemo(() => selectedContainer
    ? actualContainerRows(selectedContainer.id, assets)
    : [], [assets, selectedContainer]);
  const directContents = useMemo(() => selectedContainer
    ? assets
      .filter((asset) => asset.currentPlacement?.kind === "container" && asset.currentPlacement.containerAssetId === selectedContainer.id)
      .sort((left, right) => left.assetTag.localeCompare(right.assetTag))
    : [], [assets, selectedContainer]);
  const directContentCount = directContents.length;
  const expectedContentConfigured = selectedContainer?.expectedContentAssetIds !== undefined;
  const expectedContentIds = useMemo(() => selectedContainer?.expectedContentAssetIds ?? [], [selectedContainer]);
  const directContentIdSet = useMemo(() => new Set(directContents.map((asset) => asset.id)), [directContents]);
  const expectedContentIdSet = useMemo(() => new Set(expectedContentIds), [expectedContentIds]);
  const missingExpectedContents = useMemo(() => expectedContentIds
    .filter((assetId) => !directContentIdSet.has(assetId))
    .map((assetId) => ({ assetId, asset: assets.find((asset) => asset.id === assetId) })), [assets, directContentIdSet, expectedContentIds]);
  const unexpectedContents = useMemo(() => expectedContentConfigured
    ? directContents.filter((asset) => !expectedContentIdSet.has(asset.id))
    : [], [directContents, expectedContentConfigured, expectedContentIdSet]);
  const containerIsPackedAndReady = expectedContentConfigured
    && missingExpectedContents.length === 0
    && unexpectedContents.length === 0;

  const mergeOutcome = useCallback((outcome: InventoryCheckInOutcome) => {
    const updated = outcome.propagatedAssets ?? outcome.assets;
    const updatedById = new Map(updated.map((asset) => [asset.id, asset]));
    setAssets((current) => current.map((asset) => updatedById.get(asset.id) ?? asset));
  }, []);

  const setExpectedContentsToCurrentContents = useCallback(async () => {
    if (!selectedContainer || savingExpectedContents) return;
    setSavingExpectedContents(true);
    try {
      const updatedContainer = await updateContainerExpectedContents(
        selectedContainer.id,
        directContents.map((asset) => asset.id),
      );
      setAssets((current) => current.map((asset) => asset.id === updatedContainer.id ? updatedContainer : asset));
      toast.success(`Expected contents saved for ${updatedContainer.assetTag}.`, {
        description: `${directContents.length} direct item${directContents.length === 1 ? "" : "s"} now define this container's packing checklist.`,
      });
    } catch (caught) {
      toast.error("Could not save expected contents.", {
        description: caught instanceof Error ? caught.message : "Try again.",
      });
    } finally {
      setSavingExpectedContents(false);
    }
  }, [directContents, savingExpectedContents, selectedContainer]);

  const packAsset = useCallback(async (asset: InventoryAsset) => {
    if (!selectedContainer || !locationConfirmed || packingAssetIds.has(asset.id)) return;
    if (asset.currentPlacement?.kind === "container" && (
      asset.currentPlacement.containerAssetId === selectedContainer.id
      || asset.ancestorContainerIds?.includes(selectedContainer.id)
    )) {
      toast.info(`${asset.assetTag} is already in ${selectedContainer.label}.`);
      return;
    }
    setPackingAssetIds((current) => new Set(current).add(asset.id));
    try {
      const outcome = await checkInInventoryAsset({
        assetId: asset.id,
        destination: { kind: "container", containerAssetId: selectedContainer.id },
        method: "manual_bulk",
        actorId: admin.user?.uid ?? "demo-admin",
      });
      mergeOutcome(outcome);
      const movedTags = outcome.assets.map((item) => item.assetTag).join(" + ");
      toast.success(`${movedTags} packed in ${selectedContainer.label}.`, {
        description: outcome.assets.length > 1 ? `${outcome.assets.length} connected items moved together.` : asset.label,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not pack this item.";
      toast.error(`Could not pack ${asset.assetTag}.`, { description: message });
      if (/confirm/i.test(message)) setLocationConfirmed(false);
    } finally {
      setPackingAssetIds((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
    }
  }, [admin.user, locationConfirmed, mergeOutcome, packingAssetIds, selectedContainer]);

  const stopCamera = useCallback((updateStatus = true) => {
    cameraAttemptRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      for (const track of video.srcObject.getTracks()) track.stop();
      video.srcObject = null;
    }
    if (updateStatus) setCameraStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || cameraStatus === "starting" || cameraStatus === "scanning") return;
    const attempt = cameraAttemptRef.current + 1;
    cameraAttemptRef.current = attempt;
    setCameraStatus("starting");
    setCameraError(null);
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 300,
      });
      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      }, videoRef.current, (result) => {
        if (!result) return;
        const assetTag = assetTagFromScannedValue(result.getText());
        const now = Date.now();
        if (!assetTag || now - (recentScanRef.current.get(assetTag) ?? 0) < 2000) return;
        recentScanRef.current.set(assetTag, now);
        const asset = assets.find((item) => canonicalizeAssetTag(item.assetTag) === assetTag);
        if (!asset) {
          toast.error(`${assetTag} is not registered gear.`);
          return;
        }
        void packAsset(asset);
      });
      if (attempt !== cameraAttemptRef.current || !cameraOpen) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      setCameraStatus("scanning");
    } catch (caught) {
      if (attempt !== cameraAttemptRef.current) return;
      setCameraError(cameraAccessErrorMessage(caught));
      setCameraStatus("error");
    }
  }, [assets, cameraOpen, cameraStatus, packAsset]);

  useEffect(() => {
    if (!cameraOpen || !locationConfirmed || !videoRef.current) return;
    const timeout = window.setTimeout(() => void startCamera(), 0);
    return () => window.clearTimeout(timeout);
  }, [cameraOpen, locationConfirmed, startCamera]);

  useEffect(() => () => stopCamera(false), [stopCamera]);

  function changeContainer(container: InventoryAsset | null) {
    stopCamera();
    setCameraOpen(false);
    setSelectedContainerId(container?.id ?? "");
    setLocationConfirmed(false);
    setQuery("");
  }

  if (admin.loading) {
    return (
      <GearShell active="pack" wide>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </GearShell>
    );
  }

  if (!admin.isAdmin) {
    return (
      <GearShell active="pack" wide>
        <section className="swell-panel flex flex-col gap-5 p-5 sm:p-7">
          <BoxesIcon className="size-10 text-primary" aria-hidden />
          <div className="flex flex-col gap-2">
            <p className="swell-page-kicker">Pack a Bag</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sign in to pack containers.</h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">Container locations and contents are private inventory records.</p>
          </div>
          <Button className="self-start" onClick={() => setLoginOpen(true)}><LogInIcon data-icon="inline-start" />Sign in</Button>
        </section>
        <AdminSignInDialog open={loginOpen} onOpenChange={setLoginOpen} title="Sign in to pack gear" description="Use an approved Swell account to update container contents." />
      </GearShell>
    );
  }

  if (loading) {
    return (
      <GearShell active="pack" isAdmin isDemoAdmin={admin.isDemoAdmin} wide>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </GearShell>
    );
  }

  return (
    <GearShell active="pack" isAdmin isDemoAdmin={admin.isDemoAdmin} wide>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <p className="swell-page-kicker">Container check-in</p>
          <h1 className="text-3xl font-semibold tracking-tight">Pack a Bag</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Confirm where the container is, then search or scan each item into it.</p>
        </div>
        <Field className="w-full lg:max-w-md">
          <FieldLabel htmlFor="pack-container-select">Container</FieldLabel>
          <Combobox
            items={containers}
            itemToStringValue={(container) => `${container.assetTag} ${container.label}`}
            filter={(container, search) => normalizeGearSearchText(`${container.assetTag} ${container.label}`).includes(normalizeGearSearchText(search))}
            value={selectedContainer}
            onValueChange={changeContainer}
            autoHighlight
          >
            <ComboboxInput id="pack-container-select" className="w-full" placeholder="Search container number or title..." showClear />
            <ComboboxContent>
              <ComboboxEmpty>No matching container.</ComboboxEmpty>
              <ComboboxList>
                {(container) => <ComboboxItem key={container.id} value={container}>{container.assetTag} · {container.label}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </header>

      {loadError ? (
        <Alert variant="destructive"><AlertTriangleIcon aria-hidden /><AlertTitle>Could not load packing</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>
      ) : null}

      {!containers.length ? (
        <Empty className="swell-panel">
          <EmptyHeader><EmptyTitle>No containers registered</EmptyTitle><EmptyDescription>Register a physical asset as Container from the Gear page first. Its permanent ID will come from the 1000 series.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : !selectedContainer ? (
        <Empty className="swell-panel">
          <EmptyHeader><EmptyTitle>Choose a bag, case, bin, or trunk</EmptyTitle><EmptyDescription>Search by its 1000-series ID or title to begin.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : !locationConfirmed ? (
        <section className="swell-panel mx-auto w-full max-w-2xl p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-muted-foreground">{selectedContainer.assetTag}</p>
              <h2 className="text-xl font-semibold">{selectedContainer.label}</h2>
            </div>
            <Badge variant="secondary">Container</Badge>
          </div>
          <ContainerLocationConfirmation
            container={selectedContainer}
            assets={assets}
            locations={locations}
            actorId={admin.user?.uid ?? "demo-admin"}
            onConfirmed={(outcome, location) => {
              mergeOutcome(outcome);
              setLocations((current) => current.map((item) => item.id === location.id ? { ...item, lastCheckInAt: Date.now() } : item));
              setLocationConfirmed(true);
              toast.success(`${selectedContainer.label} confirmed at ${location.name}.`);
            }}
          />
        </section>
      ) : (
        <div className="grid min-h-[34rem] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
          <section className="swell-panel flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">Packing into {selectedContainer.assetTag}</p>
                  <h2 className="text-xl font-semibold">{selectedContainer.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground"><MapPinIcon className="mr-1 inline size-4" aria-hidden />{inventoryAssetLocationChain(selectedContainer, assets, locations)}</p>
                </div>
                <Badge variant="secondary"><CheckCircle2Icon aria-hidden />Location confirmed</Badge>
              </div>

              <Field>
                <FieldLabel htmlFor="pack-gear-search">Find an item</FieldLabel>
                <label className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="pack-gear-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, IDs, models, or serials..." className="pl-9" autoFocus />
                </label>
                <FieldDescription>Search by the large number, title, model, serial, or tag.</FieldDescription>
              </Field>

              <Button type="button" variant="outline" className="w-full" onClick={() => {
                if (cameraOpen) stopCamera();
                setCameraOpen((current) => !current);
              }}>
                {cameraOpen ? <StopCircleIcon data-icon="inline-start" /> : <CameraIcon data-icon="inline-start" />}
                {cameraOpen ? "Close camera" : "Open camera and scan items"}
              </Button>

              {cameraOpen ? (
                <div className="flex flex-col gap-3">
                  <div className="relative overflow-hidden rounded-lg border-2 border-foreground bg-foreground">
                    <video ref={videoRef} aria-label="Live camera for packing gear" autoPlay muted playsInline className="aspect-video w-full object-cover" />
                    {cameraStatus !== "scanning" ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-foreground/85 p-6 text-center text-background">
                        <span>{cameraStatus === "starting" ? "Starting camera..." : "Camera paused"}</span>
                      </div>
                    ) : <Badge className="absolute left-3 top-3" variant="secondary">Camera on</Badge>}
                  </div>
                  {cameraError ? <Alert variant="destructive"><AlertTriangleIcon aria-hidden /><AlertTitle>Camera unavailable</AlertTitle><AlertDescription>{cameraError}</AlertDescription></Alert> : null}
                  {cameraStatus === "error" ? <Button variant="outline" onClick={() => void startCamera()}><CameraIcon data-icon="inline-start" />Try camera again</Button> : null}
                </div>
              ) : null}
            </div>

            <Separator />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {matchingAssets.length ? (
                <ol className="divide-y" aria-label="Gear search results">
                  {matchingAssets.map((asset) => {
                    const alreadyPacked = asset.currentPlacement?.kind === "container" && (
                      asset.currentPlacement.containerAssetId === selectedContainer.id
                      || asset.ancestorContainerIds?.includes(selectedContainer.id)
                    );
                    const cycleRisk = isContainerInventoryAsset(asset) && selectedContainer.ancestorContainerIds?.includes(asset.id);
                    return (
                      <li className="flex items-center gap-3 p-4 sm:px-5" key={asset.id}>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="font-mono tracking-[0.08em]">{asset.assetTag}</strong>
                            {isContainerInventoryAsset(asset) ? <Badge variant="outline">Container</Badge> : null}
                            {alreadyPacked ? <Badge variant="secondary">In bag</Badge> : null}
                          </span>
                          <span className="mt-0.5 block truncate font-medium">{asset.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{inventoryAssetLocationChain(asset, assets, locations)}</span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant={alreadyPacked ? "secondary" : "default"}
                          onClick={() => void packAsset(asset)}
                          disabled={alreadyPacked || cycleRisk || packingAssetIds.has(asset.id)}
                        >
                          <PackageCheckIcon data-icon="inline-start" />
                          {packingAssetIds.has(asset.id) ? "Packing..." : alreadyPacked ? "Packed" : cycleRisk ? "Would nest itself" : "Pack"}
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <Empty>
                  <EmptyHeader><EmptyTitle>No matching gear</EmptyTitle><EmptyDescription>Try the four-digit ID or a shorter part of the title.</EmptyDescription></EmptyHeader>
                </Empty>
              )}
            </div>
          </section>

          <aside className="swell-panel flex min-h-0 flex-col overflow-hidden" aria-labelledby="bag-contents-title">
            <div className="flex items-start justify-between gap-3 p-5 sm:p-6">
              <div>
                <p className="swell-page-kicker">Actual contents</p>
                <h2 className="mt-1 text-xl font-semibold" id="bag-contents-title">In {selectedContainer.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{directContentCount} direct, {contentRows.length} including nested contents</p>
              </div>
              <Badge variant="secondary">{contentRows.length}</Badge>
            </div>
            <Separator />
            <div className="flex flex-col gap-3 p-4 sm:p-5">
              {!expectedContentConfigured ? (
                <Alert>
                  <BoxesIcon aria-hidden />
                  <AlertTitle>Expected contents not set</AlertTitle>
                  <AlertDescription>Save the bag&apos;s current direct contents as its packing checklist.</AlertDescription>
                </Alert>
              ) : containerIsPackedAndReady ? (
                <Alert className="border-primary/40 bg-primary/5">
                  <CheckCircle2Icon className="text-primary" aria-hidden />
                  <AlertTitle>Container {selectedContainer.assetTag} is packed and ready.</AlertTitle>
                  <AlertDescription>Every expected item is directly inside, with no unexpected extras.</AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-amber-700/35 bg-amber-50/70">
                  <AlertTriangleIcon className="text-amber-800" aria-hidden />
                  <AlertTitle>Packing checklist needs attention</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2 pt-1 text-pretty">
                    {missingExpectedContents.length ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="mr-1 text-foreground">Missing:</strong>
                        {missingExpectedContents.map(({ assetId, asset: missingAsset }) => (
                          <Badge variant="destructive" key={assetId}>{missingAsset ? `${missingAsset.assetTag} · ${missingAsset.label}` : "Removed inventory item"}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {unexpectedContents.length ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="mr-1 text-foreground">Unexpected:</strong>
                        {unexpectedContents.map((asset) => <Badge variant="outline" key={asset.id}>{asset.assetTag} · {asset.label}</Badge>)}
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void setExpectedContentsToCurrentContents()}
                disabled={savingExpectedContents}
              >
                <BoxesIcon data-icon="inline-start" />
                {savingExpectedContents ? "Saving expected contents..." : "Set expected contents to current contents"}
              </Button>
            </div>
            <Separator />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {contentRows.length ? (
                <ol className="divide-y">
                  {contentRows.map(({ asset, depth }) => (
                    <li className="flex items-start gap-3 p-4" key={asset.id} style={{ paddingLeft: `${1 + depth * 1.25}rem` }}>
                      <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><strong className="font-mono">{asset.assetTag}</strong>{isContainerInventoryAsset(asset) ? <Badge variant="outline">Container</Badge> : null}</span>
                        <span className="block truncate text-sm font-medium">{asset.label}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>
                  <EmptyHeader><EmptyTitle>This container is empty</EmptyTitle><EmptyDescription>Search on the left or open the camera to add the first item.</EmptyDescription></EmptyHeader>
                </Empty>
              )}
            </div>
          </aside>
        </div>
      )}
    </GearShell>
  );
}

function actualContainerRows(containerId: string, assets: InventoryAsset[]) {
  const rows: ContentRow[] = [];
  const visited = new Set<string>();
  function visit(parentId: string, depth: number) {
    const children = assets
      .filter((asset) => asset.currentPlacement?.kind === "container" && asset.currentPlacement.containerAssetId === parentId)
      .sort((left, right) => left.assetTag.localeCompare(right.assetTag));
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      rows.push({ asset: child, depth });
      if (isContainerInventoryAsset(child)) visit(child.id, depth + 1);
    }
  }
  visit(containerId, 0);
  return rows;
}
