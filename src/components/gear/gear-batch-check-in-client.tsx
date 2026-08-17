"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangleIcon,
  BoxesIcon,
  CameraIcon,
  CheckIcon,
  CheckCircle2Icon,
  KeyboardIcon,
  LoaderCircleIcon,
  LogInIcon,
  MapPinCheckIcon,
  MapPinIcon,
  MicIcon,
  PlusIcon,
  ScanLineIcon,
  SquareIcon,
  StopCircleIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { ContainerLocationConfirmation } from "@/components/gear/container-location-confirmation";
import { GearAssetDialog } from "@/components/gear/gear-asset-dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import {
  canonicalizeAssetTag,
  createGearId,
  normalizeGearSearchText,
  normalizeInventoryAssetCode,
  type GearLocation,
  type GearLocationKind,
  type GearParty,
  type InventoryAsset,
} from "@/lib/gear/domain";
import {
  checkInInventoryAsset,
  createGearLocation,
  listGearLocations,
  listGearParties,
  listInventoryAssets,
} from "@/lib/gear/repository";
import { assetTagFromScannedValue, cameraAccessErrorMessage } from "@/lib/gear/scanner";
import { spokenGearAssetCodes } from "@/lib/gear/voice-entry";
import { powerCheckInTag, resolvePowerDependencies, type EquipmentTemplate } from "@/lib/setup-designer/domain";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";

const LOCATION_KINDS: Array<{ value: GearLocationKind; label: string }> = [
  { value: "house", label: "House" },
  { value: "vehicle", label: "Vehicle" },
  { value: "studio", label: "Studio" },
  { value: "venue", label: "Venue" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
];

type SessionPhase = "setup" | "scanning" | "summary";
type CameraStatus = "idle" | "starting" | "scanning" | "error";
type ScanSource = "camera" | "manual" | "voice";
type ScanEntryMode = "voice" | "number" | "camera";
type VoiceStatus = "idle" | "listening" | "processing" | "error";
type VoiceQueueStatus = "pending" | "checking" | "checked" | "error";
type CameraDetectionStatus = "checking" | "recorded";

const CAMERA_DETECTION_LIFETIME_MS = 2200;
const MAX_VISIBLE_CAMERA_DETECTIONS = 8;

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserSpeechRecognitionEvent extends Event {
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function subscribeToVoiceSupport() {
  return () => undefined;
}

function browserSupportsDirectVoice() {
  if (typeof window === "undefined") return false;
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
}

interface CameraFrameSize {
  width: number;
  height: number;
}

interface CameraResultPoint {
  getX: () => number;
  getY: () => number;
}

interface CameraDetectionBox {
  assetId: string;
  assetTag: string;
  status: CameraDetectionStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  lastSeenAt: number;
}

interface ScannedSessionItem {
  assetId: string;
  assetTag: string;
  displayTag: string;
  label: string;
  checkInId: string;
  checkedInAt: number;
  previousLocationName?: string;
}

interface VoiceQueueItem {
  code: string;
  assetId?: string;
  assetTag: string;
  displayTag: string;
  label: string;
  status: VoiceQueueStatus;
  error?: string;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function cameraBoxFromResultPoints(
  points: CameraResultPoint[],
  frame: CameraFrameSize,
): Omit<CameraDetectionBox, "assetId" | "assetTag" | "status" | "lastSeenAt"> | null {
  if (points.length < 2 || frame.width <= 0 || frame.height <= 0) return null;

  const xValues = points.map((point) => point.getX()).filter(Number.isFinite);
  const yValues = points.map((point) => point.getY()).filter(Number.isFinite);
  if (xValues.length < 2 || yValues.length < 2) return null;

  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  const rawWidth = Math.max(maximumX - minimumX, 1);
  const rawHeight = Math.max(maximumY - minimumY, 1);
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  const longSide = Math.max(rawWidth, rawHeight);
  const shortSide = Math.min(rawWidth, rawHeight);
  const looksLinear = shortSide < longSide * 0.26;

  let boxWidth: number;
  let boxHeight: number;
  if (looksLinear) {
    boxWidth = rawWidth < rawHeight ? Math.max(rawHeight * 0.3, frame.width * 0.07) : rawWidth;
    boxHeight = rawHeight < rawWidth ? Math.max(rawWidth * 0.3, frame.height * 0.07) : rawHeight;
    boxWidth += Math.max(boxWidth * 0.12, frame.width * 0.018);
    boxHeight += Math.max(boxHeight * 0.2, frame.height * 0.018);
  } else {
    // QR result points are the finder-pattern centers, not the outer corners.
    // Expanding by roughly 30% recreates the code's full footprint and quiet zone.
    const side = Math.max(rawWidth, rawHeight);
    boxWidth = side * 1.58;
    boxHeight = side * 1.58;
  }

  boxWidth = clamp(boxWidth, frame.width * 0.06, frame.width);
  boxHeight = clamp(boxHeight, frame.height * 0.06, frame.height);

  const x = clamp(centerX - boxWidth / 2, 0, Math.max(frame.width - boxWidth, 0));
  const y = clamp(centerY - boxHeight / 2, 0, Math.max(frame.height - boxHeight, 0));

  return { x, y, width: boxWidth, height: boxHeight };
}

function CameraDetectionOverlay({
  detections,
  frame,
}: {
  detections: CameraDetectionBox[];
  frame: CameraFrameSize;
}) {
  if (!detections.length || frame.width <= 0 || frame.height <= 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {detections.map((detection) => {
        const recorded = detection.status === "recorded";
        const color = recorded ? "oklch(0.72 0.19 145)" : "oklch(0.84 0.17 84)";
        const fill = recorded ? "oklch(0.72 0.19 145 / 0.13)" : "oklch(0.84 0.17 84 / 0.15)";
        const radius = Math.max(8, Math.min(detection.width, detection.height) * 0.07);
        const centerX = detection.x + detection.width / 2;
        const centerY = detection.y + detection.height / 2;
        const statusRadius = clamp(
          Math.min(detection.width, detection.height) * 0.22,
          Math.min(frame.width, frame.height) * 0.022,
          Math.min(frame.width, frame.height) * 0.065,
        );

        return (
          <g key={detection.assetId}>
            <rect
              x={detection.x}
              y={detection.y}
              width={detection.width}
              height={detection.height}
              rx={radius}
              fill={fill}
              stroke="oklch(0.16 0.01 80 / 0.7)"
              strokeWidth="8"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={detection.x}
              y={detection.y}
              width={detection.width}
              height={detection.height}
              rx={radius}
              fill="none"
              stroke={color}
              strokeDasharray="13 9"
              strokeLinecap="round"
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
            />
            {recorded ? (
              <>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={statusRadius}
                  fill="oklch(0.66 0.2 145 / 0.94)"
                  stroke="oklch(0.98 0.01 95)"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={`M ${centerX - statusRadius * 0.5} ${centerY} L ${centerX - statusRadius * 0.12} ${centerY + statusRadius * 0.36} L ${centerX + statusRadius * 0.56} ${centerY - statusRadius * 0.42}`}
                  fill="none"
                  stroke="oklch(0.98 0.01 95)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={Math.max(statusRadius * 0.22, 3)}
                />
              </>
            ) : (
              <circle
                className="motion-safe:animate-pulse"
                cx={centerX}
                cy={centerY}
                r={statusRadius * 0.24}
                fill={color}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function formatScanTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function GearBatchCheckInClient({ initialLocationId, initialContainerId }: { initialLocationId?: string; initialContainerId?: string }) {
  const admin = useAdmin();
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [definitions, setDefinitions] = useState<EquipmentTemplate[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [parties, setParties] = useState<GearParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [containerLocationConfirmed, setContainerLocationConfirmed] = useState(false);
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [entryMode, setEntryMode] = useState<ScanEntryMode>("voice");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraRequested, setCameraRequested] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFrame, setCameraFrame] = useState<CameraFrameSize>({ width: 1280, height: 720 });
  const [cameraDetections, setCameraDetections] = useState<CameraDetectionBox[]>([]);
  const [manualAssetTag, setManualAssetTag] = useState("");
  const [manualPendingCount, setManualPendingCount] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceQueue, setVoiceQueue] = useState<VoiceQueueItem[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedSessionItem[]>([]);
  const [lastScan, setLastScan] = useState<ScannedSessionItem | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [creatingContainer, setCreatingContainer] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationKind, setNewLocationKind] = useState<GearLocationKind>("other");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const voiceInputRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceListEndRef = useRef<HTMLDivElement | null>(null);
  const manualSubmissionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const controlsRef = useRef<IScannerControls | null>(null);
  const cameraAttemptRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const operationIdRef = useRef("");
  const sessionActiveRef = useRef(false);
  const successfulAssetIdsRef = useRef(new Set<string>());
  const processingAssetIdsRef = useRef(new Set<string>());
  const recentDetectionRef = useRef(new Map<string, number>());
  const cameraDetectionsRef = useRef(new Map<string, CameraDetectionBox>());
  const initialLocationAppliedRef = useRef(false);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef("");
  const directVoiceAvailable = useSyncExternalStore(
    subscribeToVoiceSupport,
    browserSupportsDirectVoice,
    () => false,
  );

  const loadGear = useCallback(async () => {
    if (!admin.isAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [nextAssets, nextLocations, nextDefinitions, nextParties] = await Promise.all([
        listInventoryAssets(),
        listGearLocations(),
        listEquipmentTemplates(),
        listGearParties(),
      ]);
      setAssets(nextAssets);
      setLocations(nextLocations);
      setDefinitions(nextDefinitions);
      setParties(nextParties);
      if (
        initialLocationId
        && !initialLocationAppliedRef.current
        && nextLocations.some((location) => location.id === initialLocationId)
      ) {
        setSelectedLocationId(initialLocationId);
        initialLocationAppliedRef.current = true;
      } else if (initialContainerId && !initialLocationAppliedRef.current) {
        const canonicalContainerTag = canonicalizeAssetTag(initialContainerId);
        const initialContainer = nextAssets.find((asset) => asset.canContainAssets && (
          asset.id === initialContainerId || canonicalizeAssetTag(asset.assetTag) === canonicalContainerTag
        ));
        if (initialContainer) setSelectedContainerId(initialContainer.id);
        initialLocationAppliedRef.current = true;
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not load gear and locations.");
    } finally {
      setLoading(false);
    }
  }, [admin.isAdmin, initialContainerId, initialLocationId]);

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
  const containers = useMemo(() => assets
    .filter((asset) => asset.lifecycleStatus === "active" && asset.canContainAssets)
    .sort((left, right) => left.assetTag.localeCompare(right.assetTag)), [assets]);
  const selectedContainer = containers.find((container) => container.id === selectedContainerId) ?? null;
  const selectedDestination = useMemo(() => selectedContainer
    ? { kind: "container" as const, id: selectedContainer.id, name: selectedContainer.label }
    : selectedLocation
      ? { kind: "location" as const, id: selectedLocation.id, name: selectedLocation.name }
      : null, [selectedContainer, selectedLocation]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const assetByTag = useMemo(() => new Map(
    assets.map((asset) => [canonicalizeAssetTag(asset.assetTag), asset]),
  ), [assets]);
  const definitionById = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const normalizedManualAssetTag = normalizeInventoryAssetCode(manualAssetTag);
  const manualSubmitting = manualPendingCount > 0;

  const publishCameraDetections = useCallback(() => {
    const visible = [...cameraDetectionsRef.current.values()]
      .sort((left, right) => left.lastSeenAt - right.lastSeenAt)
      .slice(-MAX_VISIBLE_CAMERA_DETECTIONS);
    setCameraDetections(visible);
  }, []);

  const clearCameraDetections = useCallback(() => {
    cameraDetectionsRef.current.clear();
    setCameraDetections([]);
  }, []);

  const updateCameraFrame = useCallback((video: HTMLVideoElement) => {
    if (!video.videoWidth || !video.videoHeight) return;
    setCameraFrame((current) => (
      current.width === video.videoWidth && current.height === video.videoHeight
        ? current
        : { width: video.videoWidth, height: video.videoHeight }
    ));
  }, []);

  const showCameraDetection = useCallback((rawValue: string, points: CameraResultPoint[]) => {
    const assetTag = assetTagFromScannedValue(rawValue);
    const asset = assetByTag.get(assetTag);
    const video = videoRef.current;
    if (!asset || !video?.videoWidth || !video.videoHeight) return;

    const frame = { width: video.videoWidth, height: video.videoHeight };
    const geometry = cameraBoxFromResultPoints(points, frame);
    if (!geometry) return;

    updateCameraFrame(video);
    const now = Date.now();
    for (const [assetId, detection] of cameraDetectionsRef.current) {
      if (now - detection.lastSeenAt > CAMERA_DETECTION_LIFETIME_MS) {
        cameraDetectionsRef.current.delete(assetId);
      }
    }
    cameraDetectionsRef.current.set(asset.id, {
      assetId: asset.id,
      assetTag: asset.assetTag,
      status: successfulAssetIdsRef.current.has(asset.id) ? "recorded" : "checking",
      ...geometry,
      lastSeenAt: now,
    });
    publishCameraDetections();
  }, [assetByTag, publishCameraDetections, updateCameraFrame]);

  const markCameraDetectionRecorded = useCallback((assetId: string) => {
    const detection = cameraDetectionsRef.current.get(assetId);
    if (!detection) return;
    cameraDetectionsRef.current.set(assetId, {
      ...detection,
      status: "recorded",
      lastSeenAt: Date.now(),
    });
    publishCameraDetections();
  }, [publishCameraDetections]);

  const removeCameraDetection = useCallback((assetId: string) => {
    if (!cameraDetectionsRef.current.delete(assetId)) return;
    publishCameraDetections();
  }, [publishCameraDetections]);

  const stopCamera = useCallback((updateStatus = true) => {
    cameraAttemptRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      for (const track of video.srcObject.getTracks()) track.stop();
      video.srcObject = null;
    }
    clearCameraDetections();
    if (updateStatus) setCameraStatus("idle");
  }, [clearCameraDetections]);

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
    if (!sessionActiveRef.current || !selectedDestination) return false;
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
      const outcome = await checkInInventoryAsset({
        assetId: asset.id,
        destination: selectedDestination.kind === "container"
          ? { kind: "container", containerAssetId: selectedDestination.id }
          : { kind: "location", locationId: selectedDestination.id },
        method: source === "camera" ? "qr_camera" : "manual_bulk",
        actorId: admin.user?.uid ?? "demo-admin",
        operationId: operationIdRef.current,
      });
      const checkInByAssetId = new Map(outcome.checkIns.map((checkIn) => [checkIn.assetId, checkIn]));
      const checkedItems = outcome.assets.flatMap((checkedAsset): ScannedSessionItem[] => {
        if (successfulAssetIdsRef.current.has(checkedAsset.id)) return [];
        const checkIn = checkInByAssetId.get(checkedAsset.id);
        if (!checkIn) return [];
        const previousAsset = assets.find((item) => item.id === checkedAsset.id);
        return [{
          assetId: checkedAsset.id,
          assetTag: checkedAsset.assetTag,
          displayTag: powerCheckInTag(checkedAsset.assetTag, resolvePowerDependencies(checkedAsset, definitionById.get(checkedAsset.definitionId)).needsPowerAdapter),
          label: checkedAsset.label,
          checkInId: checkIn.id,
          checkedInAt: checkIn.checkedInAt,
          previousLocationName: previousAsset?.currentLocationId ? locationById.get(previousAsset.currentLocationId)?.name : undefined,
        }];
      });
      for (const checkedItem of checkedItems) successfulAssetIdsRef.current.add(checkedItem.assetId);
      markCameraDetectionRecorded(asset.id);
      setScannedItems((current) => [...current, ...checkedItems]);
      const sourceItem = checkedItems.find((item) => item.assetId === asset.id) ?? checkedItems.at(-1);
      if (sourceItem) setLastScan(sourceItem);
      const checkedAssetById = new Map(outcome.assets.map((checkedAsset) => [checkedAsset.id, checkedAsset]));
      const propagatedAssetById = new Map((outcome.propagatedAssets ?? outcome.assets).map((checkedAsset) => [checkedAsset.id, checkedAsset]));
      setAssets((current) => current.map((currentAsset) => propagatedAssetById.get(currentAsset.id) ?? checkedAssetById.get(currentAsset.id) ?? currentAsset));
      const checkedInAt = outcome.checkIns[0]?.checkedInAt ?? Date.now();
      if (selectedDestination.kind === "location") {
        setLocations((current) => current.map((location) => location.id === selectedDestination.id
          ? { ...location, lastCheckInAt: checkedInAt }
          : location));
      }
      const checkedDisplayTags = checkedItems.map((item) => item.displayTag);
      toast.success(`${checkedDisplayTags.join(" + ")} checked into ${selectedDestination.name}.`, {
        description: checkedItems.length > 1 ? `${checkedItems.length} connected items moved together.` : asset.label,
        duration: 2400,
      });
      playSuccessFeedback();
      return true;
    } catch (caught) {
      toast.error(`Could not check in ${asset.assetTag}.`, {
        description: caught instanceof Error ? caught.message : "Try scanning it again.",
      });
      removeCameraDetection(asset.id);
      recentDetectionRef.current.delete(detectionKey);
      return false;
    } finally {
      processingAssetIdsRef.current.delete(asset.id);
    }
  }, [
    admin.user,
    assetByTag,
    assets,
    definitionById,
    locationById,
    markCameraDetectionRecorded,
    playSuccessFeedback,
    removeCameraDetection,
    selectedDestination,
  ]);

  const appendVoiceCodes = useCallback((codes: string[]) => {
    if (!codes.length) return;
    setVoiceQueue((current) => {
      const seen = new Set(current.map((item) => item.code));
      const additions: VoiceQueueItem[] = [];
      for (const code of codes) {
        if (seen.has(code)) continue;
        seen.add(code);
        const asset = assetByTag.get(code);
        const displayTag = asset
          ? powerCheckInTag(asset.assetTag, resolvePowerDependencies(asset, definitionById.get(asset.definitionId)).needsPowerAdapter)
          : code;
        additions.push(asset
          ? {
              code,
              assetId: asset.id,
              assetTag: asset.assetTag,
              displayTag,
              label: asset.label,
              status: successfulAssetIdsRef.current.has(asset.id) ? "checked" : "pending",
            }
          : {
              code,
              assetTag: code,
              displayTag,
              label: "No matching inventory item",
              status: "error",
              error: "This number is not registered.",
            });
      }
      return additions.length ? [...current, ...additions] : current;
    });
  }, [assetByTag, definitionById]);

  const parseVoiceTranscript = useCallback((transcript: string) => {
    const codes = spokenGearAssetCodes(transcript);
    appendVoiceCodes(codes);
    return codes;
  }, [appendVoiceCodes]);

  const removeVoiceQueueItem = useCallback((code: string) => {
    setVoiceQueue((current) => current.filter((item) => item.code !== code));
  }, []);

  const confirmVoiceQueueItem = useCallback(async (code: string) => {
    const item = voiceQueue.find((candidate) => candidate.code === code);
    if (!item?.assetId || item.status === "checking" || item.status === "checked") return;
    setVoiceQueue((current) => current.map((candidate) => candidate.code === code
      ? { ...candidate, status: "checking", error: undefined }
      : candidate));
    const added = await processScannedValue(code, "voice");
    const checked = added || successfulAssetIdsRef.current.has(item.assetId);
    setVoiceQueue((current) => current.map((candidate) => candidate.code === code
      ? checked
        ? { ...candidate, status: "checked", error: undefined }
        : { ...candidate, status: "error", error: "Check-in failed. Tap the checkmark to try again." }
      : candidate));
  }, [processScannedValue, voiceQueue]);

  const cancelVoiceCapture = useCallback((updateStatus = true) => {
    const recognition = voiceRecognitionRef.current;
    voiceRecognitionRef.current = null;
    recognition?.abort();
    if (updateStatus) setVoiceStatus("idle");
  }, []);

  const startVoiceRecognition = useCallback(() => {
    if (voiceStatus === "listening" || voiceStatus === "processing") return;
    if (!window.isSecureContext) {
      setVoiceError("Microphone access requires HTTPS. Open the secure scanner link and try again.");
      setVoiceStatus("error");
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Direct listening is not available in this browser. Tap the phrase field and use the microphone on the iPhone keyboard.");
      setVoiceStatus("error");
      return;
    }

    cancelVoiceCapture(false);
    setVoiceError(null);
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results, (result) => result[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const finalTranscript = Array.from(event.results, (result) => (
        result.isFinal ? result[0]?.transcript ?? "" : ""
      ))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      voiceTranscriptRef.current = transcript;
      setVoiceTranscript(transcript);
      if (finalTranscript) parseVoiceTranscript(finalTranscript);
    };
    recognition.onerror = (event) => {
      if (voiceRecognitionRef.current !== recognition) return;
      voiceRecognitionRef.current = null;
      const chromeHelp = event.error === "service-not-allowed"
        ? " Open this page in Safari, or use the microphone on the iPhone keyboard in the phrase field."
        : "";
      setVoiceError(
        event.error === "not-allowed"
          ? "Speech recognition was blocked. Allow microphone and speech recognition access in the browser settings."
          : event.error === "no-speech"
            ? "I did not hear a number. Try speaking closer to the phone."
            : `${event.message || "The phone could not start speech recognition."}${chromeHelp}`,
      );
      setVoiceStatus("error");
    };
    recognition.onend = () => {
      if (voiceRecognitionRef.current !== recognition) return;
      voiceRecognitionRef.current = null;
      parseVoiceTranscript(voiceTranscriptRef.current);
      setVoiceStatus("idle");
    };
    voiceRecognitionRef.current = recognition;
    try {
      recognition.start();
      setVoiceStatus("listening");
    } catch (caught) {
      voiceRecognitionRef.current = null;
      setVoiceError(caught instanceof Error ? caught.message : "The phone could not start speech recognition.");
      setVoiceStatus("error");
    }
  }, [cancelVoiceCapture, parseVoiceTranscript, voiceStatus]);

  const stopVoiceRecognition = useCallback(() => {
    const recognition = voiceRecognitionRef.current;
    if (!recognition) return;
    setVoiceStatus("processing");
    recognition.stop();
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || cameraStatus === "starting" || cameraStatus === "scanning") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot open a live camera. Enter asset tags manually instead.");
      setCameraStatus("error");
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
        BarcodeFormat.DATA_MATRIX,
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
            showCameraDetection(result.getText(), result.getResultPoints());
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
    } finally {
      window.clearTimeout(permissionTimeout);
    }
  }, [cameraStatus, primeFeedback, processScannedValue, showCameraDetection]);

  useEffect(() => {
    if (phase !== "scanning" || !cameraRequested || !videoRef.current) return;
    const timeout = window.setTimeout(() => {
      setCameraRequested(false);
      void startCamera();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [cameraRequested, phase, startCamera]);

  useEffect(() => {
    if (phase !== "scanning") return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [assetId, detection] of cameraDetectionsRef.current) {
        if (now - detection.lastSeenAt <= CAMERA_DETECTION_LIFETIME_MS) continue;
        cameraDetectionsRef.current.delete(assetId);
        changed = true;
      }
      if (changed) publishCameraDetections();
    }, 300);
    return () => window.clearInterval(interval);
  }, [phase, publishCameraDetections]);

  useEffect(() => {
    if (entryMode !== "voice" || !voiceQueue.length) return;
    voiceListEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [entryMode, voiceQueue.length]);

  useEffect(() => {
    function pauseHiddenCapture() {
      if (document.visibilityState === "hidden") {
        if (controlsRef.current) stopCamera();
        if (voiceRecognitionRef.current) cancelVoiceCapture();
      }
    }
    document.addEventListener("visibilitychange", pauseHiddenCapture);
    return () => document.removeEventListener("visibilitychange", pauseHiddenCapture);
  }, [cancelVoiceCapture, stopCamera]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    stopCamera(false);
    cancelVoiceCapture(false);
    if (audioContextRef.current) void audioContextRef.current.close();
  }, [cancelVoiceCapture, stopCamera]);

  async function submitNewLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLocationName.trim() || savingLocation) return;
    setSavingLocation(true);
    setLocationError(null);
    try {
      const location = await createGearLocation({ name: newLocationName, kind: newLocationKind });
      setLocations((current) => [...current, location]);
      setSelectedLocationId(location.id);
      setSelectedContainerId("");
      setContainerLocationConfirmed(false);
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
    if (!selectedDestination || (selectedDestination.kind === "container" && !containerLocationConfirmed)) return;
    stopCamera();
    cancelVoiceCapture();
    await primeFeedback().catch(() => undefined);
    operationIdRef.current = createGearId("scan");
    successfulAssetIdsRef.current = new Set();
    processingAssetIdsRef.current = new Set();
    recentDetectionRef.current = new Map();
    sessionActiveRef.current = true;
    setScannedItems([]);
    setLastScan(null);
    setManualAssetTag("");
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    setVoiceError(null);
    setVoiceStatus("idle");
    setVoiceQueue([]);
    setCameraError(null);
    setCameraStatus("idle");
    setPhase("scanning");
    setCameraRequested(entryMode === "camera");
  }

  function finishSession() {
    sessionActiveRef.current = false;
    stopCamera();
    cancelVoiceCapture();
    setCameraRequested(false);
    setPhase(scannedItems.length ? "summary" : "setup");
  }

  function changeLocation() {
    sessionActiveRef.current = false;
    stopCamera();
    cancelVoiceCapture();
    setCameraRequested(false);
    setSelectedLocationId("");
    setSelectedContainerId("");
    setContainerLocationConfirmed(false);
    setScannedItems([]);
    setLastScan(null);
    setPhase("setup");
  }

  function changeEntryMode(value: string) {
    if (value !== "voice" && value !== "number" && value !== "camera") return;
    const nextMode = value as ScanEntryMode;
    if (nextMode === entryMode) return;
    if (nextMode === "camera") {
      cancelVoiceCapture();
      setCameraRequested(true);
    } else {
      stopCamera();
      setCameraRequested(false);
      if (nextMode === "number") cancelVoiceCapture();
    }
    setEntryMode(nextMode);
    if (nextMode === "number") {
      window.requestAnimationFrame(() => manualInputRef.current?.focus());
    }
  }

  function submitManualAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedManualAssetTag) return;
    const submittedCode = normalizedManualAssetTag;
    setManualAssetTag("");
    manualInputRef.current?.focus({ preventScroll: true });
    setManualPendingCount((current) => current + 1);
    const submission = manualSubmissionQueueRef.current
      .catch(() => undefined)
      .then(() => processScannedValue(submittedCode, "manual"));
    manualSubmissionQueueRef.current = submission.finally(() => {
      setManualPendingCount((current) => Math.max(0, current - 1));
      window.requestAnimationFrame(() => manualInputRef.current?.focus({ preventScroll: true }));
    });
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

  if (phase === "summary" && selectedDestination) {
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
                Destination: <strong className="font-semibold text-foreground">{selectedDestination.name}</strong>
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
                    <strong className="font-semibold">{item.displayTag}</strong>
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

  if (phase === "scanning" && selectedDestination) {
    return (
      <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin}>
        <section className="flex flex-col gap-4">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="swell-page-kicker">Checking in to {selectedDestination.name}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Check in gear</h1>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="secondary">{scannedItems.length} checked in</Badge>
              {entryMode !== "voice" ? (
                <Button size="sm" variant="ghost" onClick={finishSession}>
                  {scannedItems.length ? "Done" : "Cancel"}
                </Button>
              ) : null}
            </div>
          </header>

          <Tabs value={entryMode} onValueChange={changeEntryMode} className="gap-4">
            <TabsList
              className={entryMode === "voice" && (voiceStatus === "listening" || voiceStatus === "processing")
                ? "hidden"
                : "grid h-auto w-full grid-cols-3"}
              aria-label="Check-in method"
            >
              <TabsTrigger value="voice" className="min-h-11 px-2">
                <MicIcon aria-hidden />
                Voice
              </TabsTrigger>
              <TabsTrigger value="number" className="min-h-11 px-2">
                <KeyboardIcon aria-hidden />
                Number
              </TabsTrigger>
              <TabsTrigger value="camera" className="min-h-11 px-2">
                <CameraIcon aria-hidden />
                Camera
              </TabsTrigger>
            </TabsList>

            <TabsContent value="voice" className="flex flex-col gap-3">
              <section className="swell-panel overflow-hidden" aria-labelledby="voice-check-in-heading">
                <div className="flex items-center justify-between gap-3 bg-muted/35 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <h2 id="voice-check-in-heading" className="font-semibold">Voice check-in</h2>
                    <p className="truncate text-sm text-muted-foreground">
                      Say “gear” or “cable” before every number.
                    </p>
                  </div>
                  <Badge variant={voiceStatus === "listening" ? "default" : "secondary"}>
                    {voiceStatus === "listening" ? (
                      <span className="size-2 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />
                    ) : null}
                    {voiceStatus === "listening" ? "Listening" : `${voiceQueue.length} heard`}
                  </Badge>
                </div>
                <Separator />

                <div
                  className="max-h-[56dvh] min-h-72 overflow-y-auto overscroll-contain"
                  role="log"
                  aria-live="polite"
                  aria-label="Recognized gear awaiting confirmation"
                >
                  {voiceQueue.length ? (
                    <ol className="divide-y">
                      {voiceQueue.map((item) => (
                        <li
                          className={item.status === "checked"
                            ? "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-[color-mix(in_oklch,var(--swell-success)_10%,transparent)] p-3 sm:p-4"
                            : item.status === "error"
                              ? "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-destructive/5 p-3 sm:p-4"
                              : "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 sm:p-4"}
                          key={item.code}
                        >
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-lg"
                            className="size-14 shrink-0"
                            onClick={() => removeVoiceQueueItem(item.code)}
                            disabled={item.status === "checking" || item.status === "checked"}
                            aria-label={`Remove ${item.displayTag} from this list`}
                          >
                            <XIcon className="size-7" aria-hidden />
                          </Button>

                          <span className="min-w-0">
                            <strong className="block font-mono text-xl tracking-[0.08em]">{item.displayTag}</strong>
                            <span className="block truncate text-base font-medium">{item.label}</span>
                            {item.status === "checked" ? (
                              <span className="mt-0.5 block text-sm font-medium text-foreground">Checked in</span>
                            ) : item.error ? (
                              <span className="mt-0.5 block text-sm text-destructive">{item.error}</span>
                            ) : (
                              <span className="mt-0.5 block text-sm text-muted-foreground">Waiting for confirmation</span>
                            )}
                          </span>

                          <Button
                            type="button"
                            variant="success"
                            size="icon-lg"
                            className="size-14 shrink-0"
                            onClick={() => void confirmVoiceQueueItem(item.code)}
                            disabled={!item.assetId || item.status === "checking" || item.status === "checked"}
                            aria-label={item.status === "checked"
                              ? `${item.displayTag} checked in`
                              : `Confirm check-in for ${item.displayTag}`}
                          >
                            {item.status === "checking" ? (
                              <LoaderCircleIcon className="size-7 motion-safe:animate-spin" aria-hidden />
                            ) : (
                              <CheckIcon className="size-8" aria-hidden />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
                        <MicIcon className="size-7" aria-hidden />
                      </span>
                      <div className="max-w-sm">
                        <strong className="block text-lg">Ready for the first number</strong>
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                          Tap Start listening below, then say “gear 3, gear 4.”
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={voiceListEndRef} aria-hidden />
                </div>

                {!directVoiceAvailable ? (
                  <>
                    <Separator />
                    <Field className="p-4 sm:p-5">
                      <FieldLabel htmlFor="voice-gear-numbers">iPhone dictation field</FieldLabel>
                      <Textarea
                        ref={voiceInputRef}
                        id="voice-gear-numbers"
                        value={voiceTranscript}
                        onChange={(event) => {
                          const transcript = event.target.value;
                          voiceTranscriptRef.current = transcript;
                          setVoiceTranscript(transcript);
                          parseVoiceTranscript(transcript);
                          setVoiceError(null);
                          if (voiceStatus === "error") setVoiceStatus("idle");
                        }}
                        placeholder="Tap here, then tap the microphone on the iPhone keyboard"
                        rows={2}
                        autoCapitalize="none"
                        autoComplete="off"
                        enterKeyHint="done"
                      />
                    </Field>
                  </>
                ) : null}
              </section>

              {voiceError ? (
                <Alert variant="destructive">
                  <AlertTriangleIcon aria-hidden />
                  <AlertTitle>Could not listen</AlertTitle>
                  <AlertDescription>{voiceError}</AlertDescription>
                </Alert>
              ) : null}
            </TabsContent>

            <TabsContent value="number">
              <div className="flex flex-col gap-1 px-2 py-3 text-center">
                <h2 className="text-lg font-semibold">Type the large number on the label</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Leading zeros are automatic. Type 23 and the system checks in 0023.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="camera" className="flex flex-col gap-3">
              <div className="relative overflow-hidden rounded-xl border-2 border-foreground bg-foreground text-background">
                <video
                  ref={videoRef}
                  aria-label="Live rear-camera preview"
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(event) => updateCameraFrame(event.currentTarget)}
                  className="aspect-[3/4] w-full object-cover sm:aspect-video"
                />
                {cameraStatus === "scanning" ? (
                  <>
                    <CameraDetectionOverlay detections={cameraDetections} frame={cameraFrame} />
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
                        Point the rear camera at a QR code, Data Matrix code, or barcode.
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
            </TabsContent>
          </Tabs>

          <p className="sr-only" aria-live="polite">
            {lastScan ? `${lastScan.displayTag} checked into ${selectedDestination.name}.` : "Scanner ready."}
          </p>

          {entryMode !== "voice" ? (
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
                        <strong className="block truncate font-semibold">{item.displayTag}</strong>
                        <span className="block truncate text-sm text-muted-foreground">{item.label}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{formatScanTime(item.checkedInAt)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty className="border-0 py-8">
                  <EmptyHeader>
                    <EmptyTitle>No gear checked in yet</EmptyTitle>
                    <EmptyDescription>
                      {entryMode === "number"
                        ? "Type the first label number below."
                        : "Hold one code inside the frame until you hear the confirmation tone."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          ) : null}

          {entryMode === "voice" ? (
            <div className="sticky bottom-2 z-10 overflow-hidden rounded-xl border-2 border-foreground bg-card shadow-md">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3">
                {directVoiceAvailable ? (
                  <Button
                    type="button"
                    size="lg"
                    variant={voiceStatus === "listening" ? "secondary" : "default"}
                    className="min-h-14"
                    onClick={voiceStatus === "listening" ? stopVoiceRecognition : startVoiceRecognition}
                    disabled={voiceStatus === "processing"}
                  >
                    {voiceStatus === "listening" ? (
                      <StopCircleIcon data-icon="inline-start" className="size-6" />
                    ) : (
                      <MicIcon data-icon="inline-start" className="size-6" />
                    )}
                    {voiceStatus === "listening"
                      ? "Stop listening"
                      : voiceStatus === "processing"
                        ? "Stopping..."
                        : "Start listening"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-14"
                    onClick={() => voiceInputRef.current?.focus()}
                  >
                    <MicIcon data-icon="inline-start" className="size-6" />
                    Start dictation
                  </Button>
                )}
                <Button type="button" size="lg" variant="outline" className="min-h-14 px-5" onClick={finishSession}>
                  <SquareIcon data-icon="inline-start" />
                  Exit
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 bg-muted/35 px-3 py-2 text-sm">
                <strong className="truncate">{selectedDestination.name}</strong>
                <span className="shrink-0 text-muted-foreground">{scannedItems.length} checked in</span>
              </div>
            </div>
          ) : (
            <div className="sticky bottom-2 overflow-hidden rounded-xl border-2 border-foreground bg-card shadow-md">
              <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3" onSubmit={submitManualAsset}>
                <Field>
                  <FieldLabel htmlFor="manual-scanner-asset-tag">Quick number entry</FieldLabel>
                  <Input
                    ref={manualInputRef}
                    id="manual-scanner-asset-tag"
                    value={manualAssetTag}
                    onChange={(event) => setManualAssetTag(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="click here to enter number"
                    autoComplete="off"
                    enterKeyHint="done"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    className="h-14 border-2 px-4 font-mono text-2xl tracking-[0.14em] md:text-2xl"
                  />
                  <FieldDescription>
                    {normalizedManualAssetTag
                      ? `Will check in ${normalizedManualAssetTag}`
                      : manualSubmitting
                        ? `${manualPendingCount} check-in${manualPendingCount === 1 ? "" : "s"} saving`
                        : "Enter 1 to 4 digits"}
                  </FieldDescription>
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  className="mt-6 min-h-14 min-w-28"
                  disabled={!normalizedManualAssetTag}
                >
                  <MapPinCheckIcon data-icon="inline-start" />
                  Enter
                </Button>
              </form>
              <Separator />
              <div className="flex items-center gap-3 bg-muted/35 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm">
                  <strong className="block truncate">{selectedDestination.name}</strong>
                  <span className="text-muted-foreground">{scannedItems.length} checked in</span>
                </span>
                <Button size="sm" variant="ghost" onClick={finishSession}>
                  <SquareIcon data-icon="inline-start" />
                  {scannedItems.length ? "Done" : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </GearShell>
    );
  }

  return (
    <GearShell active="batch" isAdmin isDemoAdmin={admin.isDemoAdmin} wide>
      <section className="swell-panel mx-auto w-full max-w-3xl overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="swell-page-kicker">Multi-item check-in</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where is this gear going?</h1>
              <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                Choose one destination, then speak, type, or scan as many labels as you need.
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

          <div className="grid items-start gap-6 sm:grid-cols-2 sm:gap-5">
            <section className="flex min-w-0 flex-col gap-3" aria-labelledby="batch-locations-heading">
              <h2 id="batch-locations-heading" className="swell-page-kicker">Locations</h2>

              <div className="sm:min-h-[12.5rem]">
                {recentLocations.length ? (
                  <ToggleGroup
                    aria-label="Recent locations"
                    className="w-full"
                    orientation="vertical"
                    spacing={2}
                    value={selectedLocationId ? [selectedLocationId] : []}
                    onValueChange={(values) => {
                      setSelectedLocationId(values[0] ?? "");
                      setSelectedContainerId("");
                      setContainerLocationConfirmed(false);
                    }}
                    variant="outline"
                  >
                    {recentLocations.map((location) => (
                      <ToggleGroupItem key={location.id} value={location.id} className="min-h-11 w-full justify-start px-3 text-left">
                        <MapPinIcon aria-hidden />
                        <span className="truncate">{location.name}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <FieldDescription>No saved locations yet.</FieldDescription>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="batch-check-in-location">Search locations</FieldLabel>
                <Combobox
                  items={sortedLocations}
                  itemToStringValue={(location) => location.name}
                  value={selectedLocation}
                  onValueChange={(location) => {
                    setSelectedLocationId(location?.id ?? "");
                    setSelectedContainerId("");
                    setContainerLocationConfirmed(false);
                  }}
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
                <form onSubmit={submitNewLocation} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-3">
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
              ) : null}
            </section>

            <section className="flex min-w-0 flex-col gap-3" aria-labelledby="batch-containers-heading">
              <h2 id="batch-containers-heading" className="swell-page-kicker">Containers</h2>

              <div className="sm:min-h-[12.5rem]">
                {containers.length ? (
                  <ToggleGroup
                    aria-label="Containers"
                    className="w-full"
                    orientation="vertical"
                    spacing={2}
                    value={selectedContainerId ? [selectedContainerId] : []}
                    onValueChange={(values) => {
                      setSelectedContainerId(values[0] ?? "");
                      setSelectedLocationId("");
                      setContainerLocationConfirmed(false);
                    }}
                    variant="outline"
                  >
                    {containers.slice(0, 4).map((container) => (
                      <ToggleGroupItem key={container.id} value={container.id} className="min-h-11 w-full justify-start px-3 text-left">
                        <BoxesIcon aria-hidden />
                        <span className="font-mono">{container.assetTag}</span>
                        <span className="truncate">{container.label}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <FieldDescription>No registered containers yet.</FieldDescription>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="batch-check-in-container">Search containers</FieldLabel>
                <Combobox
                  items={containers}
                  itemToStringValue={(container) => `${container.assetTag} ${container.label}`}
                  filter={(container, search) => normalizeGearSearchText(`${container.assetTag} ${container.label}`).includes(normalizeGearSearchText(search))}
                  value={selectedContainer}
                  onValueChange={(container) => {
                    setSelectedContainerId(container?.id ?? "");
                    setSelectedLocationId("");
                    setContainerLocationConfirmed(false);
                  }}
                  autoHighlight
                >
                  <ComboboxInput id="batch-check-in-container" className="w-full" placeholder="Search containers..." showClear />
                  <ComboboxContent>
                    <ComboboxEmpty>No matching container.</ComboboxEmpty>
                    <ComboboxList>
                      {(container) => <ComboboxItem key={container.id} value={container}>{container.assetTag} · {container.label}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>

              <Button type="button" variant="outline" className="w-full" onClick={() => setCreatingContainer(true)}>
                <PlusIcon data-icon="inline-start" />
                Create new container
              </Button>
            </section>
          </div>

          {selectedContainer && !containerLocationConfirmed ? (
            <>
              <Separator />
              <ContainerLocationConfirmation
                container={selectedContainer}
                assets={assets}
                locations={locations}
                actorId={admin.user?.uid ?? "demo-admin"}
                onConfirmed={(outcome, location) => {
                  const updatedById = new Map((outcome.propagatedAssets ?? outcome.assets).map((asset) => [asset.id, asset]));
                  setAssets((current) => current.map((asset) => updatedById.get(asset.id) ?? asset));
                  setLocations((current) => current.map((item) => item.id === location.id ? { ...item, lastCheckInAt: Date.now() } : item));
                  setContainerLocationConfirmed(true);
                  toast.success(`${selectedContainer.label} confirmed at ${location.name}.`);
                }}
              />
            </>
          ) : selectedContainer ? (
            <Alert>
              <CheckCircle2Icon aria-hidden />
              <AlertTitle>{selectedContainer.label} is ready</AlertTitle>
              <AlertDescription>Its location was freshly confirmed. Items scanned in this session will inherit that location.</AlertDescription>
            </Alert>
          ) : null}

        </div>
        <Separator />
        <div className="flex flex-col gap-2 bg-muted/35 p-4 sm:p-5">
          <Button size="lg" className="w-full" onClick={() => void beginSession()} disabled={!selectedDestination || (selectedDestination.kind === "container" && !containerLocationConfirmed) || Boolean(loadError)}>
            <ScanLineIcon data-icon="inline-start" />
            {selectedDestination
              ? selectedDestination.kind === "container" && !containerLocationConfirmed
                ? "Confirm the container's location above"
                : `Start check-in to ${selectedDestination.name}`
              : "Choose a location or container"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Voice uses the microphone. Number entry works with no permissions.
          </p>
        </div>
      </section>
      <GearAssetDialog
        key={`check-in-container-${creatingContainer ? "open" : "closed"}`}
        open={creatingContainer}
        onOpenChange={setCreatingContainer}
        definitions={definitions}
        assets={assets}
        parties={parties}
        locations={locations}
        initialRegistrationKind="container"
        initialLifecycle="active"
        onDefinitionCreated={(definition) => {
          setDefinitions((current) => [...current.filter((item) => item.id !== definition.id), definition]
            .sort((left, right) => left.name.localeCompare(right.name)));
        }}
        onSaved={(container) => {
          setAssets((current) => [container, ...current.filter((item) => item.id !== container.id)]);
          setSelectedContainerId(container.id);
          setSelectedLocationId("");
          setContainerLocationConfirmed(false);
          toast.success(`${container.assetTag} ${container.label} is ready to check in.`);
        }}
      />
    </GearShell>
  );
}
