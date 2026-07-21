"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileMusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import {
  createContext,
  Fragment,
  useCallback,
  useEffect,
  useEffectEvent,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  DragDropProvider,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import {
  noDropAnimationPlugins,
  PlaylistVisualization,
  WaveformPlaylistProvider,
  type AnnotationData,
  usePlaybackAnimation,
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
  useDragSensors,
} from "@waveform-playlist/browser";
import { useAudioTracks, type AudioTrackConfig } from "@waveform-playlist/browser/tone";
import { AnnotationProvider } from "@waveform-playlist/annotations";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  mixerStateForTrack,
  resolveSongMixerTrackState,
  type SongAnnotation,
  type SongMixerMixId,
  type SongMixerSettings,
  type SongMixerStateName,
  type SongMixerStateOverride,
  type SongMixerStateOverrides,
  type SongMixerStateValues,
  type SongMixerTrack,
} from "@/lib/domain";
import {
  buildMidiAnnotationExtraction,
  extractAnnotationsFromMidi,
  type MidiAnnotationExtraction,
} from "@/lib/midi-annotations";
import { resizeAnnotationBoundary } from "@/lib/annotation-boundaries";
import {
  advanceAnnotationPlayback,
  createAnnotationPlaybackBoundaryState,
  type AnnotationPlaybackMode,
} from "@/lib/annotation-playback";
import { cn } from "@/lib/utils";

const BASE_WAVE_HEIGHT = 52;
const SELECTED_PART_SCALE = 2;
const PART_COLOR_COUNT = 5;
const DEFAULT_ANNOTATION_DURATION = 3;
const MIN_ANNOTATION_DURATION = 0.1;
const MIXER_TRACK_CONTROLS_WIDTH = 120;
const MIXER_ZOOM_LEVELS = [
  256,
  320,
  400,
  512,
  640,
  800,
  1024,
  1280,
  1600,
  2048,
  2560,
  3200,
  4096,
];
const SELECTED_ANNOTATION_VIEWPORT_FILL = 0.6;
const TIMELINE_ZOOM_DRAG_STEP = 36;
const TIMELINE_PAN_MULTIPLIER = 2;

type LoadedPlaylistTrack = ReturnType<typeof useAudioTracks>["tracks"][number];

const MIXER_THEME = {
  backgroundColor: "#FFFCF4",
  borderColor: "#E3D6C2",
  playheadColor: "#FF7350",
  selectionColor: "rgba(143, 208, 224, 0.28)",
  surfaceColor: "#F3E9D6",
  textColor: "#2C2A28",
  textColorMuted: "#6F6257",
  timeColor: "#6F6257",
  timescaleBackgroundColor: "#F3E9D6",
  waveformDrawMode: "normal" as const,
  playlistBackgroundColor: "#FFFEFA",
  waveFillColor: "#343633",
  waveOutlineColor: "#FFFEFA",
  waveProgressColor: "transparent",
  selectedWaveFillColor: "#343633",
  selectedWaveOutlineColor: "#FFFEFA",
  selectedTrackBackground: "#FFFEFA",
  selectedTrackControlsBackground: "#F3E9D6",
  annotationBoxBackground: "rgba(255, 252, 244, 0.94)",
  annotationBoxActiveBackground: "rgba(143, 208, 224, 0.96)",
  annotationBoxHoverBackground: "rgba(255, 254, 250, 0.99)",
  annotationBoxBorder: "#FF7350",
  annotationBoxActiveBorder: "#32758A",
  annotationLabelColor: "#2C2A28",
  annotationResizeHandleColor: "rgba(50, 117, 138, 0.55)",
  annotationResizeHandleActiveColor: "rgba(50, 117, 138, 0.95)",
};

export function SongMixerWaveform({
  tracks: mixerTracks,
  settings,
  annotations,
  partAndMixControls,
  mixId,
  selectedTrackId,
  onSelectedTrackChange,
  onTrackOverridesChange,
  canEditAnnotations,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onImportAnnotations,
  onAnnotationsChange,
}: {
  tracks: SongMixerTrack[];
  settings: SongMixerSettings;
  annotations: SongAnnotation[];
  partAndMixControls: ReactNode;
  mixId: SongMixerMixId;
  selectedTrackId: string | null;
  onSelectedTrackChange: (trackId: string) => void;
  onTrackOverridesChange?: (trackId: string, stateOverrides: SongMixerStateOverrides) => void;
  canEditAnnotations: boolean;
  onCreateAnnotation: (annotation: Omit<SongAnnotation, "id">) => Promise<SongAnnotation | null>;
  onUpdateAnnotation: (annotation: SongAnnotation) => Promise<boolean>;
  onDeleteAnnotation: (annotation: SongAnnotation) => Promise<boolean>;
  onImportAnnotations: (
    annotations: Array<Omit<SongAnnotation, "id">>,
  ) => Promise<SongAnnotation[] | null>;
  onAnnotationsChange: (annotations: SongAnnotation[]) => void;
}) {
  const configSignature = JSON.stringify(
    mixerTracks.map((track) => [track.id, track.downloadUrl]),
  );
  const configs = useMemo<AudioTrackConfig[]>(() => {
    const sources = JSON.parse(configSignature) as Array<
      [id: string, downloadUrl: string | undefined]
    >;

    return sources.map(([id, downloadUrl]) => ({
      src: downloadUrl,
      // The library does not retain our application track ID separately. Using
      // it as the internal name lets progressively loaded tracks map back to
      // the correct controls even when later stems finish downloading first.
      name: id,
      volume: 1,
      pan: 0,
    }));
  }, [configSignature]);
  const [loadedTracksById, setLoadedTracksById] = useState(
    () => new Map<string, { sourceUrl: string | undefined; track: LoadedPlaylistTrack }>(),
  );
  const [trackErrorsById, setTrackErrorsById] = useState(
    () => new Map<string, { sourceUrl: string | undefined; message: string }>(),
  );
  const [engineError, setEngineError] = useState<string | null>(null);
  const [annotationPlaybackMode, setAnnotationPlaybackMode] =
    useState<AnnotationPlaybackMode>("normal");
  const waveformRootRef = useRef<HTMLDivElement>(null);
  const handleTrackLoaded = useCallback(
    (trackId: string, sourceUrl: string | undefined, track: LoadedPlaylistTrack) => {
      setLoadedTracksById((current) => {
        const existing = current.get(trackId);
        if (existing && existing.sourceUrl === sourceUrl && existing.track === track) return current;

        const next = new Map(current);
        next.set(trackId, { sourceUrl, track });
        return next;
      });
      setTrackErrorsById((current) => {
        if (!current.has(trackId)) return current;
        const next = new Map(current);
        next.delete(trackId);
        return next;
      });
    },
    [],
  );
  const handleTrackLoadError = useCallback(
    (trackId: string, sourceUrl: string | undefined, message: string) => {
      setTrackErrorsById((current) => {
        const existing = current.get(trackId);
        if (existing && existing.sourceUrl === sourceUrl && existing.message === message) return current;

        const next = new Map(current);
        next.set(trackId, { sourceUrl, message });
        return next;
      });
    },
    [],
  );
  const handleEngineError = useCallback((caught: Error) => {
    setEngineError(caught.message);
  }, []);
  const loadedEntries = useMemo(
    () =>
      mixerTracks.flatMap((mixerTrack, index) => {
        const config = configs[index];
        const loaded = loadedTracksById.get(mixerTrack.id);
        if (!loaded || loaded.sourceUrl !== config?.src) return [];

        return [{ mixerTrack, playlistTrack: loaded.track }];
      }),
    [configs, loadedTracksById, mixerTracks],
  );
  const tracks = useMemo(
    () => loadedEntries.map((entry) => entry.playlistTrack),
    [loadedEntries],
  );
  const loadedMixerTracks = useMemo(
    () => loadedEntries.map((entry) => entry.mixerTrack),
    [loadedEntries],
  );
  const loadedCount = tracks.length;
  const totalCount = configs.length;
  const loading = loadedCount < totalCount;
  const error = useMemo(() => {
    for (let index = 0; index < mixerTracks.length; index += 1) {
      const mixerTrack = mixerTracks[index];
      const config = configs[index];
      const trackError = trackErrorsById.get(mixerTrack.id);
      if (trackError && trackError.sourceUrl === config?.src) return trackError.message;
    }

    return null;
  }, [configs, mixerTracks, trackErrorsById]);
  const trackLoaders = loading
    ? configs.flatMap((config, index) => {
        const mixerTrack = mixerTracks[index];
        const loaded = mixerTrack ? loadedTracksById.get(mixerTrack.id) : undefined;
        if (!mixerTrack || loaded?.sourceUrl === config.src) return [];

        return [
          <ProgressiveAudioTrackLoader
            key={`${mixerTrack.id}:${config.src ?? ""}`}
            config={config}
            trackId={mixerTrack.id}
            sourceUrl={config.src}
            onLoaded={handleTrackLoaded}
            onError={handleTrackLoadError}
          />,
        ];
      })
    : null;
  const effectiveStates = useMemo(
    () =>
      loadedMixerTracks.map((track) => {
        const name = mixerStateForTrack(
          mixId,
          track.id,
          selectedTrackId,
          track.isBackgroundMix,
        );

        return {
          name,
          values: resolveSongMixerTrackState(settings, track, name),
        };
      }),
    [loadedMixerTracks, mixId, selectedTrackId, settings],
  );
  const playlistAnnotations = useMemo<AnnotationData[]>(
    () => annotations.map((annotation) => ({
      id: annotation.id,
      start: annotation.start,
      end: annotation.end,
      lines: [annotation.title],
    })),
    [annotations],
  );
  const handleAnnotationsChange = useCallback(
    (updatedAnnotations: AnnotationData[]) => {
      if (!canEditAnnotations) return;

      const nextAnnotations = updatedAnnotations
        .map((annotation) => ({
          id: annotation.id,
          title: annotation.lines[0]?.trim() || "Untitled section",
          start: roundAnnotationTime(annotation.start),
          end: roundAnnotationTime(annotation.end),
        }))
        .sort((left, right) => left.start - right.start || left.end - right.end);

      if (!isValidAnnotationTimeline(nextAnnotations)) return;
      onAnnotationsChange(nextAnnotations);
    },
    [canEditAnnotations, onAnnotationsChange],
  );

  if (error || engineError) {
    return (
      <div className="m-4 rounded-md border border-destructive/55 bg-destructive/10 p-4 text-sm">
        <p className="font-medium">The mixer could not decode one of these MP3s.</p>
        <p className="mt-1 text-muted-foreground">{error ?? engineError}</p>
      </div>
    );
  }

  if (loading && tracks.length === 0) {
    return (
      <>
        {trackLoaders}
        <MixerLoadingPlaceholder
          tracks={mixerTracks}
          loadedCount={loadedCount}
          totalCount={totalCount}
        />
      </>
    );
  }

  return (
    <>
      {trackLoaders}
      <WaveformPlaylistProvider
        tracks={tracks}
        timescale
        mono={false}
        waveHeight={BASE_WAVE_HEIGHT}
        samplesPerPixel={1024}
        zoomLevels={MIXER_ZOOM_LEVELS}
        automaticScroll
        controls={{
          show: true,
          width: MIXER_TRACK_CONTROLS_WIDTH,
        }}
        annotationList={{
          annotations: playlistAnnotations,
          editable: canEditAnnotations,
          isContinuousPlay: true,
          linkEndpoints: true,
        }}
        onAnnotationsChange={handleAnnotationsChange}
        theme={MIXER_THEME}
        barWidth={2}
        barGap={1}
        roundedBars
        deferEngineRebuild={loading}
        onError={handleEngineError}
      >
        <AnnotationProvider>
          <AnnotationEditabilitySynchronizer editable={canEditAnnotations} />
          <AnnotationLanePositionSynchronizer
            annotationCount={playlistAnnotations.length}
            waveformRootRef={waveformRootRef}
          />
          <MixStateSynchronizer
            effectiveStates={effectiveStates}
            mixId={mixId}
            mixerTracks={loadedMixerTracks}
            selectedTrackId={selectedTrackId}
            waveformRootRef={waveformRootRef}
          />
          <SuppressWaveformTrackSelection />
          <MixerSpacebarShortcut />
          <AnnotationNavigationProvider playbackMode={annotationPlaybackMode}>
            <section
              className="grid gap-3 border-t-2 bg-secondary/70 p-3 sm:p-4"
              aria-labelledby="song-sections-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="song-sections-title" className="text-sm font-semibold">
                  Song sections
                </h2>
                <AnnotationPlaybackControls
                  annotations={annotations}
                  mode={annotationPlaybackMode}
                  onModeChange={setAnnotationPlaybackMode}
                />
              </div>
              <MixerAnnotations
                annotations={annotations}
                editable={canEditAnnotations}
                onCreate={onCreateAnnotation}
                onUpdate={onUpdateAnnotation}
                onDelete={onDeleteAnnotation}
                onImport={onImportAnnotations}
              />
            </section>
            <MixerTransport
              loading={loading}
              loadedCount={loadedCount}
              totalCount={totalCount}
              annotations={annotations}
            />
          </AnnotationNavigationProvider>
          <TimelineNavigationSurface
            waveformRootRef={waveformRootRef}
          >
            <WaveformPartColorFilters />
            <AdminAnnotationDragProvider enabled={canEditAnnotations}>
              <PlaylistVisualization
                showClipHeaders={false}
                interactiveClips={false}
                getAnnotationBoxLabel={(annotation) => annotation.lines[0] ?? "Untitled section"}
                renderTrackControls={(trackIndex) => (
                <MixerTrackControls
                  trackIndex={trackIndex}
                  track={loadedMixerTracks[trackIndex]}
                  mixId={mixId}
                  selected={loadedMixerTracks[trackIndex]?.id === selectedTrackId}
                  selectable={!loadedMixerTracks[trackIndex]?.isBackgroundMix}
                  practiceQuickMute={
                    mixId === "practice"
                    && loadedMixerTracks[trackIndex]?.id === selectedTrackId
                  }
                  onSelect={() => {
                    const trackId = loadedMixerTracks[trackIndex]?.id;
                    if (trackId) onSelectedTrackChange(trackId);
                  }}
                  onStateValueChange={(key, value) => {
                    const track = loadedMixerTracks[trackIndex];
                    const stateName = effectiveStates[trackIndex]?.name;
                    if (!track || !stateName || !onTrackOverridesChange) return;

                    const nextStateOverride: SongMixerStateOverride = {
                      ...track.stateOverrides[stateName],
                    };
                    const inheritedValue = settings.states[stateName][key];

                    if (value === inheritedValue) {
                      delete nextStateOverride[key];
                    } else {
                      Object.assign(nextStateOverride, { [key]: value });
                    }

                    const nextStateOverrides = { ...track.stateOverrides };
                    if (Object.keys(nextStateOverride).length) {
                      nextStateOverrides[stateName] = nextStateOverride;
                    } else {
                      delete nextStateOverrides[stateName];
                    }

                    if (JSON.stringify(nextStateOverrides) !== JSON.stringify(track.stateOverrides)) {
                      onTrackOverridesChange(track.id, nextStateOverrides);
                    }
                  }}
                />
                )}
              />
            </AdminAnnotationDragProvider>
          </TimelineNavigationSurface>
          {partAndMixControls}
        </AnnotationProvider>
      </WaveformPlaylistProvider>
    </>
  );
}

type AnnotationDragData = {
  annotationIndex: number;
  edge: "start" | "end";
};

type AnnotationDragStartEvent = Parameters<DragStartEvent>[0];
type AnnotationDragMoveEvent = Parameters<DragMoveEvent>[0];
type AnnotationDragEndEvent = Parameters<DragEndEvent>[0];

type AnnotationDragSnapshot = {
  annotations: AnnotationData[];
  annotationIndex: number;
  edge: "start" | "end";
};

function AdminAnnotationDragProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const { annotations } = usePlaylistState();
  const { duration, sampleRate, samplesPerPixel } = usePlaylistData();
  const { setAnnotations } = usePlaylistControls();
  const sensors = useDragSensors();
  const dragSnapshotRef = useRef<AnnotationDragSnapshot | null>(null);

  const onDragStart = useCallback(
    (event: AnnotationDragStartEvent) => {
      const data = annotationDragData(event);
      if (!data) {
        dragSnapshotRef.current = null;
        return;
      }

      dragSnapshotRef.current = {
        annotations: annotations.map((annotation) => ({ ...annotation })),
        annotationIndex: data.annotationIndex,
        edge: data.edge,
      };
    },
    [annotations],
  );

  const onDragMove = useCallback(
    (event: AnnotationDragMoveEvent) => {
      const snapshot = dragSnapshotRef.current;
      const data = annotationDragData(event);
      if (
        !snapshot
        || !data
        || snapshot.annotationIndex !== data.annotationIndex
        || snapshot.edge !== data.edge
      ) {
        return;
      }

      const original = snapshot.annotations[data.annotationIndex];
      if (!original) return;

      const currentX = event.to?.x ?? event.operation.position.current.x;
      const pixelDelta = currentX - event.operation.position.initial.x;
      const timeDelta = pixelDelta * samplesPerPixel / sampleRate;
      const requestedTime =
        data.edge === "start"
          ? original.start + timeDelta
          : original.end + timeDelta;

      setAnnotations(
        resizeAnnotationBoundary(
          snapshot.annotations,
          data.annotationIndex,
          data.edge,
          requestedTime,
          duration,
          MIN_ANNOTATION_DURATION,
        ),
      );
    },
    [duration, sampleRate, samplesPerPixel, setAnnotations],
  );

  const onDragEnd = useCallback(
    (event: AnnotationDragEndEvent) => {
      const snapshot = dragSnapshotRef.current;
      if (event.canceled && snapshot) {
        setAnnotations(snapshot.annotations);
      }
      dragSnapshotRef.current = null;
    },
    [setAnnotations],
  );

  if (!enabled) return children;

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      plugins={noDropAnimationPlugins}
    >
      {children}
    </DragDropProvider>
  );
}

function annotationDragData(
  event: AnnotationDragStartEvent | AnnotationDragMoveEvent | AnnotationDragEndEvent,
): AnnotationDragData | null {
  const data = event.operation.source?.data;
  if (
    !data
    || typeof data.annotationIndex !== "number"
    || (data.edge !== "start" && data.edge !== "end")
  ) {
    return null;
  }

  return {
    annotationIndex: data.annotationIndex,
    edge: data.edge,
  };
}

function AnnotationLanePositionSynchronizer({
  annotationCount,
  waveformRootRef,
}: {
  annotationCount: number;
  waveformRootRef: RefObject<HTMLDivElement | null>;
}) {
  const { isReady, tracks } = usePlaylistData();

  useEffect(() => {
    const root = waveformRootRef.current;
    if (!root) return;

    if (!annotationCount) {
      delete root.dataset.annotationLanePosition;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = root.querySelector<HTMLElement>(
        '[data-scroll-container="true"]',
      );
      const waveformTrack = root.querySelector<HTMLElement>("[data-track-id]");
      const trackStack = waveformTrack?.parentElement?.parentElement;
      const controlsColumn = scrollContainer?.previousElementSibling;
      const annotationLane = trackStack
        ? Array.from(trackStack.children).find((element) => {
            const style = window.getComputedStyle(element);
            return style.position === "relative" && style.zIndex === "110";
          })
        : undefined;

      if (
        !(trackStack instanceof HTMLElement)
        || !(annotationLane instanceof HTMLElement)
        || !(controlsColumn instanceof HTMLElement)
      ) {
        delete root.dataset.annotationLanePosition;
        return;
      }

      trackStack.dataset.mixerTrackStack = "";
      annotationLane.dataset.mixerAnnotationLane = "";
      controlsColumn.dataset.mixerControlsColumn = "";
      root.dataset.annotationLanePosition = "top";
    });

    return () => window.cancelAnimationFrame(frame);
  }, [annotationCount, isReady, tracks.length, waveformRootRef]);

  return null;
}

type TimelineDragGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  anchorTime: number;
  anchorX: number;
  horizontalDelta: number;
  startZoomIndex: number;
  currentZoomIndex: number;
};

type TimelineScrollSnapshot = Pick<
  TimelineDragGesture,
  "anchorTime" | "anchorX" | "horizontalDelta"
>;

function TimelineNavigationSurface({
  waveformRootRef,
  children,
}: {
  waveformRootRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { sampleRate, samplesPerPixel, timeScaleHeight } = usePlaylistData();
  const { scrollContainerRef, zoomIn, zoomOut } = usePlaylistControls();
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [isPointerOverTimeline, setIsPointerOverTimeline] = useState(false);
  const gestureRef = useRef<TimelineDragGesture | null>(null);
  const pendingZoomAnchorRef = useRef<TimelineScrollSnapshot | null>(null);
  const samplesPerPixelRef = useRef(samplesPerPixel);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    samplesPerPixelRef.current = samplesPerPixel;
  }, [samplesPerPixel]);

  const scrollTimeline = useCallback(
    (snapshot: TimelineScrollSnapshot, scale: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const anchorPixel = snapshot.anchorTime * sampleRate / scale;
      scrollContainer.scrollLeft = Math.max(
        0,
        anchorPixel - snapshot.anchorX
          - snapshot.horizontalDelta * TIMELINE_PAN_MULTIPLIER,
      );
    },
    [sampleRate, scrollContainerRef],
  );

  useEffect(() => {
    const snapshot = pendingZoomAnchorRef.current;
    if (!snapshot) return;

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollTimeline(snapshot, samplesPerPixel);
      pendingZoomAnchorRef.current = null;
      scrollFrameRef.current = null;
    });
  }, [samplesPerPixel, scrollTimeline]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const isTimelinePoint = useCallback(
    (clientX: number, clientY: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer || timeScaleHeight <= 0) return false;

      const bounds = scrollContainer.getBoundingClientRect();
      return (
        clientX >= bounds.left
        && clientX <= bounds.right
        && clientY >= bounds.top
        && clientY <= bounds.top + timeScaleHeight
      );
    },
    [scrollContainerRef, timeScaleHeight],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0
      || event.pointerType === "touch"
      || !isTimelinePoint(event.clientX, event.clientY)
    ) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const bounds = scrollContainer.getBoundingClientRect();
    const anchorX = event.clientX - bounds.left;
    const startZoomIndex = closestZoomLevelIndex(samplesPerPixelRef.current);

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      anchorTime:
        (scrollContainer.scrollLeft + anchorX) * samplesPerPixelRef.current / sampleRate,
      anchorX,
      horizontalDelta: 0,
      startZoomIndex,
      currentZoomIndex: startZoomIndex,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setIsDraggingTimeline(true);
    setIsPointerOverTimeline(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      const isOverTimeline = isTimelinePoint(event.clientX, event.clientY);
      setIsPointerOverTimeline((current) =>
        current === isOverTimeline ? current : isOverTimeline,
      );
      return;
    }

    event.preventDefault();
    gesture.horizontalDelta = event.clientX - gesture.startX;
    const verticalDelta = event.clientY - gesture.startY;
    const desiredZoomIndex = clamp(
      gesture.startZoomIndex - Math.trunc(verticalDelta / TIMELINE_ZOOM_DRAG_STEP),
      0,
      MIXER_ZOOM_LEVELS.length - 1,
    );

    if (desiredZoomIndex !== gesture.currentZoomIndex) {
      while (gesture.currentZoomIndex > desiredZoomIndex) {
        zoomIn();
        gesture.currentZoomIndex -= 1;
      }
      while (gesture.currentZoomIndex < desiredZoomIndex) {
        zoomOut();
        gesture.currentZoomIndex += 1;
      }
      pendingZoomAnchorRef.current = timelineScrollSnapshot(gesture);
    } else if (pendingZoomAnchorRef.current) {
      pendingZoomAnchorRef.current = timelineScrollSnapshot(gesture);
    }

    scrollTimeline(gesture, samplesPerPixelRef.current);
  }

  function finishTimelineDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingTimeline(false);
    setIsPointerOverTimeline(isTimelinePoint(event.clientX, event.clientY));
  }

  return (
    <div
      ref={waveformRootRef}
      aria-keyshortcuts="Space"
      data-timeline-dragging={isDraggingTimeline || undefined}
      title={
        isPointerOverTimeline
          ? "Drag up to zoom out or down to zoom in. Drag left or right to scroll."
          : undefined
      }
      onPointerDown={handlePointerDown}
      onPointerEnter={(event) => {
        setIsPointerOverTimeline(isTimelinePoint(event.clientX, event.clientY));
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={finishTimelineDrag}
      onPointerCancel={finishTimelineDrag}
      onLostPointerCapture={(event) => {
        if (gestureRef.current?.pointerId !== event.pointerId) return;
        gestureRef.current = null;
        setIsDraggingTimeline(false);
        setIsPointerOverTimeline(false);
      }}
      onPointerLeave={() => {
        if (!gestureRef.current) setIsPointerOverTimeline(false);
      }}
      className={cn(
        "swell-mixer-waveform min-w-0 overflow-x-auto border-t-2 bg-card",
        isPointerOverTimeline && "cursor-all-scroll",
        isDraggingTimeline && "cursor-grabbing select-none",
      )}
    >
      {children}
    </div>
  );
}

function closestZoomLevelIndex(samplesPerPixel: number) {
  return MIXER_ZOOM_LEVELS.reduce(
    (closestIndex, zoomLevel, index) =>
      Math.abs(Math.log(zoomLevel / samplesPerPixel))
        < Math.abs(Math.log(MIXER_ZOOM_LEVELS[closestIndex] / samplesPerPixel))
        ? index
        : closestIndex,
    0,
  );
}

function timelineScrollSnapshot(
  gesture: TimelineDragGesture,
): TimelineScrollSnapshot {
  return {
    anchorTime: gesture.anchorTime,
    anchorX: gesture.anchorX,
    horizontalDelta: gesture.horizontalDelta,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

type NavigateToAnnotation = (annotation: SongAnnotation | null) => void;

const AnnotationNavigationContext = createContext<NavigateToAnnotation | null>(null);

function AnnotationNavigationProvider({
  playbackMode,
  children,
}: {
  playbackMode: AnnotationPlaybackMode;
  children: ReactNode;
}) {
  const { isPlaying, visualTimeRef } = usePlaybackAnimation();
  const { activeAnnotationId, isAutomaticScroll } = usePlaylistState();
  const { sampleRate, samplesPerPixel } = usePlaylistData();
  const {
    scrollContainerRef,
    seekTo,
    setActiveAnnotationId,
    setAutomaticScroll,
    zoomIn,
    zoomOut,
  } = usePlaylistControls();
  const pendingAnnotationFocusRef = useRef<{
    centerTime: number;
    samplesPerPixel: number;
  } | null>(null);
  const annotationFocusFrameRef = useRef<number | null>(null);
  const restoreAutomaticScrollRef = useRef(false);
  const focusedAnnotationRef = useRef<SongAnnotation | null>(null);

  const restoreAutomaticScroll = useCallback(() => {
    focusedAnnotationRef.current = null;
    if (!restoreAutomaticScrollRef.current) return;

    setAutomaticScroll(true);
    restoreAutomaticScrollRef.current = false;
  }, [setAutomaticScroll]);

  const centerPendingAnnotation = useCallback(() => {
    const focus = pendingAnnotationFocusRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!focus || !scrollContainer) return;

    if (annotationFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(annotationFocusFrameRef.current);
    }
    annotationFocusFrameRef.current = window.requestAnimationFrame(() => {
      const centerPixel = focus.centerTime * sampleRate / focus.samplesPerPixel;
      const maximumScrollLeft = Math.max(
        0,
        scrollContainer.scrollWidth - scrollContainer.clientWidth,
      );
      scrollContainer.scrollLeft = clamp(
        centerPixel - scrollContainer.clientWidth / 2,
        0,
        maximumScrollLeft,
      );
      pendingAnnotationFocusRef.current = null;
      annotationFocusFrameRef.current = null;
    });
  }, [sampleRate, scrollContainerRef]);

  useEffect(() => {
    const focus = pendingAnnotationFocusRef.current;
    if (!focus || focus.samplesPerPixel !== samplesPerPixel) return;

    centerPendingAnnotation();
  }, [centerPendingAnnotation, samplesPerPixel]);

  useEffect(() => {
    return () => {
      if (annotationFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(annotationFocusFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const focusedAnnotation = focusedAnnotationRef.current;
    if (!focusedAnnotation || activeAnnotationId === focusedAnnotation.id) return;

    restoreAutomaticScroll();
  }, [activeAnnotationId, restoreAutomaticScroll]);

  useEffect(() => {
    if (!isPlaying || playbackMode === "loop") return;

    let frame = 0;
    const watchFocusedAnnotation = () => {
      const focusedAnnotation = focusedAnnotationRef.current;
      const visualTime = visualTimeRef.current;
      if (
        focusedAnnotation
        && (
          visualTime < focusedAnnotation.start
          || visualTime >= focusedAnnotation.end
        )
      ) {
        restoreAutomaticScroll();
        return;
      }

      frame = window.requestAnimationFrame(watchFocusedAnnotation);
    };
    frame = window.requestAnimationFrame(watchFocusedAnnotation);

    return () => window.cancelAnimationFrame(frame);
  }, [
    isPlaying,
    playbackMode,
    restoreAutomaticScroll,
    visualTimeRef,
  ]);

  const focusAnnotation = useCallback((annotation: SongAnnotation) => {
    const scrollContainer = scrollContainerRef.current;
    const annotationDuration = annotation.end - annotation.start;
    if (
      !scrollContainer
      || scrollContainer.clientWidth <= 0
      || sampleRate <= 0
      || annotationDuration <= 0
    ) {
      return;
    }

    const idealSamplesPerPixel =
      annotationDuration * sampleRate
      / (scrollContainer.clientWidth * SELECTED_ANNOTATION_VIEWPORT_FILL);
    const targetZoomIndex = closestZoomLevelIndex(idealSamplesPerPixel);
    const currentZoomIndex = closestZoomLevelIndex(samplesPerPixel);
    const targetSamplesPerPixel = MIXER_ZOOM_LEVELS[targetZoomIndex];

    restoreAutomaticScrollRef.current ||= isAutomaticScroll;
    if (isAutomaticScroll) setAutomaticScroll(false);
    focusedAnnotationRef.current = annotation;
    pendingAnnotationFocusRef.current = {
      centerTime: (annotation.start + annotation.end) / 2,
      samplesPerPixel: targetSamplesPerPixel,
    };

    for (let index = currentZoomIndex; index > targetZoomIndex; index -= 1) {
      zoomIn();
    }
    for (let index = currentZoomIndex; index < targetZoomIndex; index += 1) {
      zoomOut();
    }

    if (currentZoomIndex === targetZoomIndex) centerPendingAnnotation();
  }, [
    centerPendingAnnotation,
    isAutomaticScroll,
    sampleRate,
    samplesPerPixel,
    scrollContainerRef,
    setAutomaticScroll,
    zoomIn,
    zoomOut,
  ]);

  const navigateToAnnotation = useCallback<NavigateToAnnotation>((annotation) => {
    if (!annotation) return;

    setActiveAnnotationId(annotation.id);
    seekTo(annotation.start);
    focusAnnotation(annotation);
  }, [focusAnnotation, seekTo, setActiveAnnotationId]);

  return (
    <AnnotationNavigationContext.Provider value={navigateToAnnotation}>
      {children}
    </AnnotationNavigationContext.Provider>
  );
}

function useAnnotationNavigation() {
  const navigateToAnnotation = useContext(AnnotationNavigationContext);
  if (!navigateToAnnotation) {
    throw new Error("useAnnotationNavigation must be used within AnnotationNavigationProvider");
  }

  return navigateToAnnotation;
}

function AnnotationEditabilitySynchronizer({ editable }: { editable: boolean }) {
  const { setAnnotationsEditable } = usePlaylistControls();

  useEffect(() => {
    setAnnotationsEditable(editable);
  }, [editable, setAnnotationsEditable]);

  return null;
}

function AnnotationPlaybackControls({
  annotations,
  mode,
  onModeChange,
}: {
  annotations: SongAnnotation[];
  mode: AnnotationPlaybackMode;
  onModeChange: (mode: AnnotationPlaybackMode) => void;
}) {
  const {
    audioStartPositionRef,
    isPlaying,
    playbackStartTimeRef,
    visualTimeRef,
  } = usePlaybackAnimation();
  const { activeAnnotationId } = usePlaylistState();
  const {
    pause,
    play,
    setActiveAnnotationId,
    setCurrentTime,
  } = usePlaylistControls();
  const boundaryStateRef = useRef(createAnnotationPlaybackBoundaryState());
  const actionInFlightRef = useRef(false);
  const activeAnnotation = activeAnnotationId
    ? annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
    : null;
  const targetAnnotationRef = useRef<SongAnnotation | null>(activeAnnotation);

  const handlePlaybackFrame = useCallback(
    (visualTime: number) => {
      if (actionInFlightRef.current) return;

      const targetAnnotation = targetAnnotationRef.current;
      const transition = advanceAnnotationPlayback({
        mode,
        annotation: targetAnnotation,
        currentTime: visualTime,
        playbackEpoch: playbackStartTimeRef.current,
        playbackStartPosition: audioStartPositionRef.current,
        state: boundaryStateRef.current,
      });
      boundaryStateRef.current = transition.state;

      if (!targetAnnotation || transition.action === "none") return;

      actionInFlightRef.current = true;
      if (transition.action === "stop") {
        pause();
        queueMicrotask(() => {
          setCurrentTime(targetAnnotation.end);
          setActiveAnnotationId(targetAnnotation.id);
          actionInFlightRef.current = false;
        });
        return;
      }

      void play(targetAnnotation.start).finally(() => {
        boundaryStateRef.current = {
          annotationId: targetAnnotation.id,
          playbackEpoch: playbackStartTimeRef.current,
          previousTime: targetAnnotation.start,
          canArm: true,
          armed: true,
        };
        setActiveAnnotationId(targetAnnotation.id);
        actionInFlightRef.current = false;
      });
    },
    [
      mode,
      pause,
      play,
      audioStartPositionRef,
      playbackStartTimeRef,
      setActiveAnnotationId,
      setCurrentTime,
    ],
  );

  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    const checkAnnotationBoundary = () => {
      handlePlaybackFrame(visualTimeRef.current);
      frame = window.requestAnimationFrame(checkAnnotationBoundary);
    };
    frame = window.requestAnimationFrame(checkAnnotationBoundary);

    return () => window.cancelAnimationFrame(frame);
  }, [handlePlaybackFrame, isPlaying, visualTimeRef]);

  useEffect(() => {
    const keepArmedTarget =
      mode !== "normal"
      && isPlaying
      && boundaryStateRef.current.armed
      && targetAnnotationRef.current !== null;

    if (keepArmedTarget) return;

    targetAnnotationRef.current = mode === "normal" ? null : activeAnnotation;
    boundaryStateRef.current = createAnnotationPlaybackBoundaryState();
    actionInFlightRef.current = false;
  }, [activeAnnotation, isPlaying, mode]);

  if (!annotations.length) return null;

  return (
    <FieldSet className="w-auto flex-row flex-nowrap items-center gap-3 sm:gap-4">
      <FieldLegend variant="label" className="mb-0 shrink-0 text-xs">
        Playback
      </FieldLegend>
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as AnnotationPlaybackMode)}
        className="flex w-auto flex-nowrap items-center gap-3 sm:gap-4"
        aria-label="Section playback behavior"
      >
        <Field orientation="horizontal" className="w-auto gap-1.5">
          <RadioGroupItem value="normal" id="annotation-playback-normal" />
          <FieldLabel
            htmlFor="annotation-playback-normal"
            className="font-normal"
            title="Continue playing after the selected section"
          >
            Normal
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto gap-1.5">
          <RadioGroupItem value="loop" id="annotation-playback-loop" />
          <FieldLabel
            htmlFor="annotation-playback-loop"
            className="font-normal"
            title="Return to the selected section start at its end"
          >
            Loop
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto gap-1.5">
          <RadioGroupItem value="stop" id="annotation-playback-stop" />
          <FieldLabel
            htmlFor="annotation-playback-stop"
            className="font-normal"
            title="Pause when playback crosses the selected section end"
          >
            Stop
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}

type AnnotationDraft = {
  title: string;
  start: string;
  end: string;
};

function MixerAnnotations({
  annotations,
  editable,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
}: {
  annotations: SongAnnotation[];
  editable: boolean;
  onCreate: (annotation: Omit<SongAnnotation, "id">) => Promise<SongAnnotation | null>;
  onUpdate: (annotation: SongAnnotation) => Promise<boolean>;
  onDelete: (annotation: SongAnnotation) => Promise<boolean>;
  onImport: (
    annotations: Array<Omit<SongAnnotation, "id">>,
  ) => Promise<SongAnnotation[] | null>;
}) {
  const { currentTimeRef } = usePlaybackAnimation();
  const { activeAnnotationId } = usePlaylistState();
  const { duration, isReady } = usePlaylistData();
  const navigateToAnnotation = useAnnotationNavigation();
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const [editingId, setEditingId] = useState<string | null>(annotations[0]?.id ?? null);
  const [newDraft, setNewDraft] = useState<AnnotationDraft>(() => emptyAnnotationDraft());
  const [editorSession, setEditorSession] = useState(0);
  const midiInputRef = useRef<HTMLInputElement>(null);
  const [midiPreview, setMidiPreview] = useState<{
    filename: string;
    extraction: MidiAnnotationExtraction;
  } | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [readingMidi, setReadingMidi] = useState(false);
  const [savingMidi, setSavingMidi] = useState(false);
  const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
  const editingAnnotation = editingId
    ? annotations.find((annotation) => annotation.id === editingId)
    : undefined;
  const midiConflictCount = midiPreview?.extraction.conflictCount ?? 0;
  const midiAnnotationCount = midiPreview?.extraction.annotations.length ?? 0;
  const midiPreviewCanSave = midiAnnotationCount > 0 && midiConflictCount === 0;

  const seekToAnnotation = (annotation: SongAnnotation, selectForEditing: boolean) => {
    navigateToAnnotation(annotation);

    if (selectForEditing) {
      setEditingId(annotation.id);
      setEditorSession((current) => current + 1);
    }
  };

  const annotationButtons = (
    <div className="flex flex-wrap gap-2" aria-label="Song annotations">
      {annotations.map((annotation) => (
        <Button
          key={annotation.id}
          type="button"
          size="sm"
          variant={activeAnnotationId === annotation.id ? "default" : "outline"}
          aria-current={activeAnnotationId === annotation.id ? "true" : undefined}
          aria-label={`Seek to ${annotation.title} at ${formatAnnotationTimestamp(annotation.start)}`}
          onClick={() => seekToAnnotation(annotation, editable)}
        >
          <span className="max-w-56 truncate">{annotation.title}</span>
        </Button>
      ))}
    </div>
  );

  if (!editable) {
    return annotations.length ? annotationButtons : (
      <p className="text-sm text-muted-foreground">No song sections are available yet.</p>
    );
  }

  const startNewAnnotation = () => {
    const playhead = Math.min(
      Math.max(Number.isFinite(currentTimeRef.current) ? currentTimeRef.current : 0, 0),
      safeDuration,
    );
    const nextRange = findAnnotationGap(annotations, playhead, safeDuration);

    setEditingId(null);
    setNewDraft({
      title: "",
      start: formatAnnotationInput(nextRange.start),
      end: formatAnnotationInput(nextRange.end),
    });
    setEditorSession((current) => current + 1);
  };

  const readMidiFile = async (file: File) => {
    setReadingMidi(true);
    setMidiError(null);
    setMidiPreview(null);

    try {
      const source = await file.arrayBuffer();
      const extraction = extractAnnotationsFromMidi(source, safeDuration);
      setMidiPreview({ filename: file.name, extraction });
    } catch (caught) {
      setMidiError(
        caught instanceof Error
          ? caught.message
          : "The MIDI markers could not be extracted.",
      );
    } finally {
      setReadingMidi(false);
    }
  };

  const saveMidiPreview = async () => {
    if (!midiPreview || !midiPreviewCanSave || savingMidi) return;

    setSavingMidi(true);
    try {
      const imported = await onImport(
        midiPreview.extraction.annotations.map(({ title, start, end }) => ({
          title,
          start,
          end,
        })),
      );
      if (!imported) return;

      setEditingId(imported[0]?.id ?? null);
      setEditorSession((current) => current + 1);
      setMidiPreview(null);
      setMidiError(null);
      if (midiInputRef.current) midiInputRef.current.value = "";
    } finally {
      setSavingMidi(false);
    }
  };

  const requestMidiSave = () => {
    if (!midiPreview || !midiPreviewCanSave || savingMidi) return;

    if (annotations.length) {
      setOverwriteDialogOpen(true);
      return;
    }

    void saveMidiPreview();
  };

  const removeMidiPreviewMarker = (markerId: string) => {
    setMidiPreview((current) => {
      if (!current) return current;

      const remainingMarkers = current.extraction.markers.filter(
        (marker) => marker.id !== markerId,
      );
      const extraction = buildMidiAnnotationExtraction(
        remainingMarkers,
        current.extraction.midiDuration,
        current.extraction.audioDuration,
      );

      return { ...current, extraction };
    });
  };

  return (
    <div className="grid gap-3">
      <Accordion defaultValue={[]} className="gap-0">
        <AccordionItem value="annotations" className="bg-card shadow-sm hover:shadow-sm data-[open]:shadow-sm">
          <AccordionTrigger className="min-h-11 px-3 py-2 font-body hover:bg-secondary/55">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="font-semibold">Annotations</span>
              <Badge variant="outline">
                {annotations.length} section{annotations.length === 1 ? "" : "s"}
              </Badge>
              <span className="text-xs font-normal text-muted-foreground">No overlaps</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="grid gap-4 border-t px-3 py-3 text-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {annotations.length ? annotationButtons : (
                <p className="text-sm text-muted-foreground">Create the first section at the current playhead.</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!isReady || safeDuration < MIN_ANNOTATION_DURATION}
                onClick={startNewAnnotation}
              >
                <PlusIcon data-icon="inline-start" />
                New annotation
              </Button>
            </div>

            <AnnotationEditor
              key={`${editorSession}:${editingAnnotation?.id ?? "new"}:${editingAnnotation?.start ?? newDraft.start}:${editingAnnotation?.end ?? newDraft.end}`}
              annotation={editingAnnotation}
              initialDraft={editingAnnotation ? draftFromAnnotation(editingAnnotation) : newDraft}
              annotations={annotations}
              duration={safeDuration}
              isReady={isReady}
              onCreate={onCreate}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onCreated={(created) => {
                setEditingId(created.id);
                setEditorSession((current) => current + 1);
              }}
              onDeleted={(deletedId) => {
                const fallback = annotations.find((annotation) => annotation.id !== deletedId);
                setEditingId(fallback?.id ?? null);
                setNewDraft(emptyAnnotationDraft());
                setEditorSession((current) => current + 1);
              }}
            />

            <FieldGroup className="gap-3 rounded-md border bg-background p-3">
              <Field data-invalid={Boolean(midiError)}>
                <FieldLabel htmlFor="annotation-midi-file">
                  Import annotations from MIDI
                </FieldLabel>
                <Input
                  ref={midiInputRef}
                  id="annotation-midi-file"
                  type="file"
                  accept=".mid,.midi,audio/midi,audio/x-midi"
                  disabled={!isReady || readingMidi || savingMidi}
                  aria-invalid={Boolean(midiError)}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void readMidiFile(file);
                  }}
                />
                <FieldDescription>
                  Choose a Standard MIDI file with named markers. Each marker ends
                  at the next marker; a final marker named “end” is used only as
                  the closing boundary. Conflicting markers stay in the preview
                  until you remove one with its X.
                </FieldDescription>
                {midiError ? <FieldError>{midiError}</FieldError> : null}
              </Field>

              {readingMidi ? (
                <p className="text-sm text-muted-foreground">
                  Reading MIDI markers…
                </p>
              ) : null}

              {midiPreview ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <FileMusicIcon aria-hidden className="size-4 shrink-0" />
                      <span className="max-w-72 truncate text-sm font-medium">
                        {midiPreview.filename}
                      </span>
                      <Badge variant="secondary">
                        {midiPreview.extraction.annotations.length} annotation
                        {midiPreview.extraction.annotations.length === 1 ? "" : "s"}
                      </Badge>
                      {midiConflictCount ? (
                        <Badge variant="destructive">
                          {midiConflictCount} conflicting
                        </Badge>
                      ) : null}
                    </div>
                    {annotations.length ? (
                      <Badge variant="destructive">
                        Replaces {annotations.length} current
                      </Badge>
                    ) : null}
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Preview</p>
                    <ol
                      className="max-h-64 divide-y overflow-y-auto rounded-md border"
                      aria-label="Extracted MIDI annotation preview"
                    >
                      {midiPreview.extraction.annotations.map((annotation, index) => (
                        <li
                          key={annotation.markerId}
                          data-invalid={annotation.conflict ? true : undefined}
                          className={cn(
                            "flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm",
                            annotation.conflict && "bg-destructive/10 text-destructive",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">
                              {index + 1}. {annotation.title}
                            </span>
                            {annotation.conflict ? (
                              <Badge variant="destructive">Conflict</Badge>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span
                              className={cn(
                                "font-mono text-xs tabular-nums",
                                annotation.conflict
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatAnnotationTimestamp(annotation.start)}
                              {" – "}
                              {formatAnnotationTimestamp(annotation.end)}
                            </span>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant={annotation.conflict ? "destructive" : "ghost"}
                              disabled={savingMidi}
                              aria-label={`Remove ${annotation.title} from MIDI import`}
                              onClick={() => removeMidiPreviewMarker(annotation.markerId)}
                            >
                              <XIcon />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {midiConflictCount ? (
                    <Field data-invalid>
                      <FieldError>
                        Markers with the same start time cannot become overlapping
                        annotations. Remove all but one marker from each red conflict.
                      </FieldError>
                    </Field>
                  ) : null}

                  {!midiAnnotationCount ? (
                    <Field data-invalid>
                      <FieldError>
                        Keep at least one section marker before saving.
                      </FieldError>
                    </Field>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldDescription>
                      Found {midiPreview.extraction.markerCount} named marker
                      {midiPreview.extraction.markerCount === 1 ? "" : "s"}
                      {midiPreview.extraction.closingMarker
                        ? `, including the closing “${midiPreview.extraction.closingMarker}” marker.`
                        : "."}
                    </FieldDescription>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!midiPreviewCanSave || savingMidi}
                      onClick={requestMidiSave}
                    >
                      {savingMidi ? "Saving…" : "Save MIDI annotations"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog
        open={overwriteDialogOpen}
        onOpenChange={setOverwriteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite current annotations?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to overwrite current annotations with these extracted
              annotations?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingMidi}>No, cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={savingMidi}
              onClick={() => {
                setOverwriteDialogOpen(false);
                void saveMidiPreview();
              }}
            >
              Yes, overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AnnotationEditor({
  annotation,
  initialDraft,
  annotations,
  duration,
  isReady,
  onCreate,
  onUpdate,
  onDelete,
  onCreated,
  onDeleted,
}: {
  annotation: SongAnnotation | undefined;
  initialDraft: AnnotationDraft;
  annotations: SongAnnotation[];
  duration: number;
  isReady: boolean;
  onCreate: (annotation: Omit<SongAnnotation, "id">) => Promise<SongAnnotation | null>;
  onUpdate: (annotation: SongAnnotation) => Promise<boolean>;
  onDelete: (annotation: SongAnnotation) => Promise<boolean>;
  onCreated: (annotation: SongAnnotation) => void;
  onDeleted: (annotationId: string) => void;
}) {
  const { currentTimeRef } = usePlaybackAnimation();
  const [draft, setDraft] = useState(initialDraft);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = annotationDraftErrors(
    draft,
    annotations,
    annotation?.id ?? null,
    duration,
  );
  const hasErrors = Boolean(errors.title || errors.time);

  const setBoundaryAtPlayhead = (boundary: "start" | "end") => {
    const playhead = Math.min(
      Math.max(Number.isFinite(currentTimeRef.current) ? currentTimeRef.current : 0, 0),
      duration,
    );
    setDraft((current) => ({
      ...current,
      [boundary]: formatAnnotationInput(playhead),
    }));
  };

  const saveAnnotation = async () => {
    setShowValidation(true);
    if (hasErrors) return;

    const values = {
      title: draft.title.trim(),
      start: roundAnnotationTime(Number(draft.start)),
      end: roundAnnotationTime(Number(draft.end)),
    };
    setSaving(true);

    try {
      if (annotation) {
        const updated = { id: annotation.id, ...values };
        const saved = await onUpdate(updated);
        if (saved) setDraft(draftFromAnnotation(updated));
      } else {
        const created = await onCreate(values);
        if (created) onCreated(created);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeAnnotation = async () => {
    if (!annotation) return;

    setSaving(true);
    try {
      const deleted = await onDelete(annotation);
      if (deleted) onDeleted(annotation.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FieldGroup className="gap-4 rounded-md border bg-background p-3">
      <Field data-invalid={showValidation && Boolean(errors.title)}>
        <FieldLabel htmlFor="annotation-title">Title</FieldLabel>
        <Input
          id="annotation-title"
          value={draft.title}
          placeholder="Verse, chorus, bridge…"
          disabled={saving}
          aria-invalid={showValidation && Boolean(errors.title)}
          onChange={(event) => {
            const title = event.currentTarget.value;
            setDraft((current) => ({ ...current, title }));
          }}
        />
        {showValidation && errors.title ? <FieldError>{errors.title}</FieldError> : null}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isReady || saving}
          onClick={() => setBoundaryAtPlayhead("start")}
        >
          Start at playhead
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isReady || saving}
          onClick={() => setBoundaryAtPlayhead("end")}
        >
          End at playhead
        </Button>
      </div>

      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={showValidation && Boolean(errors.time)}>
          <FieldLabel htmlFor="annotation-start">Start (seconds)</FieldLabel>
          <Input
            id="annotation-start"
            type="number"
            min={0}
            max={duration}
            step={0.01}
            value={draft.start}
            disabled={saving}
            aria-invalid={showValidation && Boolean(errors.time)}
            onChange={(event) => {
              const start = event.currentTarget.value;
              setDraft((current) => ({ ...current, start }));
            }}
          />
        </Field>
        <Field data-invalid={showValidation && Boolean(errors.time)}>
          <FieldLabel htmlFor="annotation-end">End (seconds)</FieldLabel>
          <Input
            id="annotation-end"
            type="number"
            min={0}
            max={duration}
            step={0.01}
            value={draft.end}
            disabled={saving}
            aria-invalid={showValidation && Boolean(errors.time)}
            onChange={(event) => {
              const end = event.currentTarget.value;
              setDraft((current) => ({ ...current, end }));
            }}
          />
        </Field>
      </FieldGroup>

      {showValidation && errors.time ? <FieldError>{errors.time}</FieldError> : null}
      <FieldDescription>
        Drag either edge on the timeline for fast adjustments. Touching edges are allowed; overlapping sections are not.
      </FieldDescription>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveAnnotation()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={!annotation || saving}
          onClick={() => void removeAnnotation()}
        >
          Delete
        </Button>
      </div>
    </FieldGroup>
  );
}

function emptyAnnotationDraft(): AnnotationDraft {
  return { title: "", start: "0.000", end: "0.000" };
}

function draftFromAnnotation(annotation: SongAnnotation): AnnotationDraft {
  return {
    title: annotation.title,
    start: formatAnnotationInput(annotation.start),
    end: formatAnnotationInput(annotation.end),
  };
}

function formatAnnotationInput(seconds: number) {
  return roundAnnotationTime(seconds).toFixed(3);
}

function roundAnnotationTime(seconds: number) {
  return Math.round(seconds * 1000) / 1000;
}

function formatAnnotationTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(2).padStart(5, "0")}`;
}

function findAnnotationGap(
  annotations: SongAnnotation[],
  playhead: number,
  duration: number,
) {
  const ordered = [...annotations].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const starts = [playhead, 0];

  for (const candidate of starts) {
    let cursor = Math.min(Math.max(candidate, 0), duration);

    for (const annotation of ordered) {
      if (annotation.end <= cursor) continue;

      if (annotation.start - cursor >= MIN_ANNOTATION_DURATION) {
        return {
          start: cursor,
          end: Math.min(cursor + DEFAULT_ANNOTATION_DURATION, annotation.start),
        };
      }

      if (cursor < annotation.end) cursor = annotation.end;
    }

    if (duration - cursor >= MIN_ANNOTATION_DURATION) {
      return {
        start: cursor,
        end: Math.min(cursor + DEFAULT_ANNOTATION_DURATION, duration),
      };
    }
  }

  const start = Math.max(0, Math.min(playhead, duration - MIN_ANNOTATION_DURATION));
  return { start, end: Math.min(duration, start + MIN_ANNOTATION_DURATION) };
}

function annotationDraftErrors(
  draft: AnnotationDraft,
  annotations: SongAnnotation[],
  editingId: string | null,
  duration: number,
) {
  const title = draft.title.trim() ? undefined : "Enter a title for this section.";
  const start = Number(draft.start);
  const end = Number(draft.end);
  let time: string | undefined;

  if (!draft.start.trim() || !draft.end.trim() || !Number.isFinite(start) || !Number.isFinite(end)) {
    time = "Enter valid start and end times.";
  } else if (start < 0 || end > duration) {
    time = `Times must stay between 0 and ${formatAnnotationTimestamp(duration)}.`;
  } else if (end - start < MIN_ANNOTATION_DURATION) {
    time = "End must be at least 0.10 seconds after start.";
  } else {
    const overlap = annotations.find((annotation) =>
      annotation.id !== editingId
      && start < annotation.end
      && end > annotation.start,
    );

    if (overlap) time = `This overlaps “${overlap.title}”. Adjust one of the boundaries.`;
  }

  return { title, time };
}

function isValidAnnotationTimeline(annotations: SongAnnotation[]) {
  return annotations.every((annotation, index) => {
    if (
      !Number.isFinite(annotation.start)
      || !Number.isFinite(annotation.end)
      || annotation.start < 0
      || annotation.end - annotation.start < MIN_ANNOTATION_DURATION
    ) {
      return false;
    }

    const previous = annotations[index - 1];
    return !previous || annotation.start >= previous.end;
  });
}

function ProgressiveAudioTrackLoader({
  config,
  trackId,
  sourceUrl,
  onLoaded,
  onError,
}: {
  config: AudioTrackConfig;
  trackId: string;
  sourceUrl: string | undefined;
  onLoaded: (
    trackId: string,
    sourceUrl: string | undefined,
    track: LoadedPlaylistTrack,
  ) => void;
  onError: (trackId: string, sourceUrl: string | undefined, message: string) => void;
}) {
  const singletonConfig = useMemo(() => [config], [config]);
  const { tracks, loading, error } = useAudioTracks(singletonConfig);

  useEffect(() => {
    if (error) {
      onError(trackId, sourceUrl, error);
      return;
    }

    const loadedTrack = tracks[0];
    if (!loading && loadedTrack) onLoaded(trackId, sourceUrl, loadedTrack);
  }, [error, loading, onError, onLoaded, sourceUrl, trackId, tracks]);

  return null;
}

function MixerLoadingPlaceholder({
  tracks,
  loadedCount,
  totalCount,
}: {
  tracks: SongMixerTrack[];
  loadedCount: number;
  totalCount: number;
}) {
  const progress = totalCount > 0 ? (loadedCount / totalCount) * 100 : 0;

  return (
    <div aria-busy="true" aria-label="Loading mixer stems">
      <div className="grid gap-2 bg-secondary/70 p-3 sm:p-4">
        <Progress value={progress} className="gap-2">
          <ProgressLabel>Loading and decoding stems</ProgressLabel>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {loadedCount}/{totalCount}
          </span>
        </Progress>
        <p className="text-xs text-muted-foreground">
          Waveforms will appear as each MP3 becomes ready. Playback starts when all stems are loaded.
        </p>
      </div>

      <div className="overflow-hidden border-t-2 bg-card">
        <div className="grid h-9 grid-cols-[236px_minmax(32rem,1fr)] border-b">
          <div className="bg-secondary/45" />
          <div className="flex items-center gap-5 border-l bg-secondary/45 px-3">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton
                key={index}
                className={cn("h-3", index % 2 === 0 ? "w-14" : "w-8")}
              />
            ))}
          </div>
        </div>

        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="grid h-[52px] grid-cols-[236px_minmax(32rem,1fr)] border-b last:border-b-0"
          >
            <div className="flex items-center gap-2 bg-secondary/60 px-3">
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
            </div>
            <div className="flex items-center border-l bg-[#FFFEFA] px-3">
              <Skeleton
                className={cn(
                  "h-5 rounded-sm bg-foreground/15",
                  index % 3 === 0 ? "w-4/5" : index % 3 === 1 ? "w-3/5" : "w-11/12",
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MixStateSynchronizer({
  effectiveStates,
  mixId,
  mixerTracks,
  selectedTrackId,
  waveformRootRef,
}: {
  effectiveStates: Array<{ name: SongMixerStateName; values: SongMixerStateValues }>;
  mixId: SongMixerMixId;
  mixerTracks: SongMixerTrack[];
  selectedTrackId: string | null;
  waveformRootRef: RefObject<HTMLDivElement | null>;
}) {
  const playlistData = usePlaylistData();
  const { setTrackMute, setTrackPan, setTrackSolo, setTrackVolume } = usePlaylistControls();
  const applyControlAction = useEffectEvent((action: MixerControlAction) => {
    if (action.control === "solo") setTrackSolo(action.trackIndex, action.value);
    if (action.control === "volume") setTrackVolume(action.trackIndex, action.value);
    if (action.control === "pan") setTrackPan(action.trackIndex, action.value);
    if (action.control === "mute") setTrackMute(action.trackIndex, action.value);
  });
  const synchronizeAudio = useEffectEvent(
    (states: Array<{ name: SongMixerStateName; values: SongMixerStateValues }>) => {
      const { playoutRef, tracks, trackStates } = playlistData;
      const actions: MixerControlAction[] = [];

      states.forEach(({ values }, trackIndex) => {
        const trackId = tracks[trackIndex]?.id;
        const currentState = trackStates[trackIndex];
        const volume = values.volume / 100;
        const pan = values.pan / 100;

        if (trackId && playoutRef.current) {
          playoutRef.current.setTrackSolo(trackId, false);
          playoutRef.current.setTrackVolume(trackId, volume);
          playoutRef.current.setTrackPan(trackId, pan);
          playoutRef.current.setTrackMute(trackId, values.muted);
        }

        if (!currentState) return;
        if (currentState.soloed) actions.push({ control: "solo", trackIndex, value: false });
        if (Math.abs(currentState.volume - volume) > 0.001) {
          actions.push({ control: "volume", trackIndex, value: volume });
        }
        if (Math.abs(currentState.pan - pan) > 0.001) {
          actions.push({ control: "pan", trackIndex, value: pan });
        }
        if (currentState.muted !== values.muted) {
          actions.push({ control: "mute", trackIndex, value: values.muted });
        }
      });

      let frame = 0;
      let actionIndex = 0;

      const applyNextAction = () => {
        const action = actions[actionIndex];
        if (!action) return;

        applyControlAction(action);
        actionIndex += 1;
        frame = window.requestAnimationFrame(applyNextAction);
      };

      frame = window.requestAnimationFrame(applyNextAction);
      return () => window.cancelAnimationFrame(frame);
    },
  );

  useEffect(() => {
    if (!playlistData.isReady) return;
    return synchronizeAudio(effectiveStates);
  }, [effectiveStates, playlistData.isReady]);

  useEffect(() => {
    if (!playlistData.isReady) return;
    const frame = window.requestAnimationFrame(() => {
      const waveformElements = Array.from(
        waveformRootRef.current?.querySelectorAll<HTMLElement>("[data-track-id]") ?? [],
      ).filter((element) => !element.parentElement?.closest("[data-track-id]"));
      const controlElements = Array.from(
        waveformRootRef.current?.querySelectorAll<HTMLElement>("[data-mixer-track-index]") ?? [],
      );
      const trackIndexes = new Map<string, number>();

      waveformElements.forEach((element) => {
        const waveformTrackId = element.dataset.trackId;
        if (!waveformTrackId) return;

        if (!trackIndexes.has(waveformTrackId)) {
          trackIndexes.set(waveformTrackId, trackIndexes.size);
        }

        const trackIndex = trackIndexes.get(waveformTrackId);
        if (trackIndex === undefined) return;

        const channelCount = Math.max(
          1,
          playlistData.audioBuffers[trackIndex]?.numberOfChannels ?? 1,
        );
        const naturalHeight = BASE_WAVE_HEIGHT * channelCount;
        const configuredScale = effectiveStates[trackIndex]?.values.scale ?? 1;
        const isMuted = playlistData.trackStates[trackIndex]?.muted ?? false;
        const mixerTrack = mixerTracks[trackIndex];
        const isSelectedPart = Boolean(
          mixerTrack && !mixerTrack.isBackgroundMix && mixerTrack.id === selectedTrackId,
        );
        const selectedScale = isSelectedPart ? SELECTED_PART_SCALE : 1;
        const visualScale = Math.max(configuredScale, selectedScale);
        const displayHeight = Math.round(naturalHeight * visualScale);
        const waveformRow = element.parentElement;
        const controlRow = controlElements[trackIndex]?.parentElement;

        element.dataset.mixerWaveContent = "";
        element.dataset.mixerTrackKind = mixerTrack?.isBackgroundMix ? "background" : "part";
        if (mixerTrack?.isBackgroundMix) {
          delete element.dataset.mixerPartColor;
          delete element.dataset.mixerPartEmphasis;
        } else if (mixerTrack) {
          element.dataset.mixerPartColor = String(partColorSlot(mixerTracks, trackIndex));
          element.dataset.mixerPartEmphasis = isMuted
            ? "muted"
            : mixId === "learn"
              ? isSelectedPart
                ? "featured"
                : "unfeatured"
              : "basic";
        }
        element.style.height = `${naturalHeight}px`;
        element.style.transform = `scaleY(${visualScale})`;
        element.style.transformOrigin = "top left";

        if (waveformRow) {
          waveformRow.dataset.mixerTrackRow = "";
          waveformRow.style.height = `${displayHeight}px`;
        }

        if (controlRow) {
          controlRow.dataset.mixerControlRow = "";
          controlRow.style.height = `${displayHeight}px`;
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    effectiveStates,
    mixId,
    mixerTracks,
    playlistData.audioBuffers,
    playlistData.isReady,
    playlistData.trackStates,
    selectedTrackId,
    waveformRootRef,
  ]);

  return null;
}

function SuppressWaveformTrackSelection() {
  const { selectedTrackId } = usePlaylistState();
  const { setSelectedTrackId } = usePlaylistControls();

  useEffect(() => {
    if (selectedTrackId) setSelectedTrackId(null);
  }, [selectedTrackId, setSelectedTrackId]);

  return null;
}

function WaveformPartColorFilters() {
  return (
    <svg aria-hidden className="absolute size-0 overflow-hidden" focusable="false">
      <defs>
        <filter id="swell-muted-wave-filter" colorInterpolationFilters="sRGB">
          <feFlood floodColor="var(--swell-muted-waveform)" result="wave-color" />
          <feComposite in="wave-color" in2="SourceGraphic" operator="in" />
        </filter>
        {Array.from({ length: PART_COLOR_COUNT }, (_, index) => {
          const partNumber = index + 1;

          return (
            <Fragment key={partNumber}>
              <filter id={`swell-part-${partNumber}-wave-filter`} colorInterpolationFilters="sRGB">
                <feFlood floodColor={`var(--swell-part-${partNumber})`} result="wave-color" />
                <feComposite in="wave-color" in2="SourceGraphic" operator="in" />
              </filter>
              <filter id={`swell-part-${partNumber}-muted-wave-filter`} colorInterpolationFilters="sRGB">
                <feFlood floodColor={`var(--swell-part-${partNumber}-muted)`} result="wave-color" />
                <feComposite in="wave-color" in2="SourceGraphic" operator="in" />
              </filter>
            </Fragment>
          );
        })}
      </defs>
    </svg>
  );
}

function partColorSlot(tracks: SongMixerTrack[], trackIndex: number) {
  const track = tracks[trackIndex];
  if (!track) return 1;

  const searchableName = `${track.filename} ${track.displayName}`.replace(/\.[^./\s]+/g, "");
  const numberedPart = searchableName.match(/(?:^|[^0-9])([1-5])(?:[^0-9]|$)/)?.[1];
  if (numberedPart) return Number(numberedPart);

  const featureableIndex = tracks
    .slice(0, trackIndex)
    .filter((candidate) => !candidate.isBackgroundMix).length;

  return (featureableIndex % PART_COLOR_COUNT) + 1;
}

type MixerControlAction =
  | { control: "solo"; trackIndex: number; value: boolean }
  | { control: "volume"; trackIndex: number; value: number }
  | { control: "pan"; trackIndex: number; value: number }
  | { control: "mute"; trackIndex: number; value: boolean };

function MixerTransport({
  loading,
  loadedCount,
  totalCount,
  annotations,
}: {
  loading: boolean;
  loadedCount: number;
  totalCount: number;
  annotations: SongAnnotation[];
}) {
  const { currentTime, isPlaying } = usePlaybackAnimation();
  const { activeAnnotationId } = usePlaylistState();
  const { duration, isReady } = usePlaylistData();
  const { pause, play } = usePlaylistControls();
  const navigateToAnnotation = useAnnotationNavigation();
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const safeCurrentTime = Math.min(Number.isFinite(currentTime) ? currentTime : 0, safeDuration);
  const orderedAnnotations = useMemo(
    () => [...annotations].sort((left, right) => left.start - right.start || left.end - right.end),
    [annotations],
  );
  const activeAnnotationIndex = orderedAnnotations.findIndex(
    (annotation) => annotation.id === activeAnnotationId,
  );
  const currentTimeAnnotationIndex = orderedAnnotations.reduce(
    (currentIndex, annotation, index) =>
      safeCurrentTime >= annotation.start ? index : currentIndex,
    -1,
  );
  const currentAnnotationIndex =
    activeAnnotationIndex >= 0 ? activeAnnotationIndex : currentTimeAnnotationIndex;
  const previousAnnotation =
    currentAnnotationIndex > 0 ? orderedAnnotations[currentAnnotationIndex - 1] : null;
  const nextAnnotation = orderedAnnotations[currentAnnotationIndex + 1] ?? null;

  return (
    <section
      className="grid gap-2 border-t-2 bg-secondary/70 p-3 sm:p-4"
      aria-label="Playback controls"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch">
        <Button
          size="lg"
          className="col-span-2 min-h-16 w-full gap-3 text-lg sm:col-span-1 sm:w-auto sm:flex-[1.25]"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!isReady}
          onClick={() => {
            if (isPlaying) {
              pause();
            } else {
              void play();
            }
          }}
        >
          {isPlaying ? (
            <PauseIcon className="size-7 fill-current" aria-hidden />
          ) : (
            <PlayIcon className="size-7 fill-current" aria-hidden />
          )}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-h-12 min-w-0 flex-1 px-3 sm:min-w-40"
          disabled={!isReady || !previousAnnotation}
          onClick={() => navigateToAnnotation(previousAnnotation)}
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
          <span>Prev section</span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-h-12 min-w-0 flex-1 px-3 sm:min-w-40"
          disabled={!isReady || !nextAnnotation}
          onClick={() => navigateToAnnotation(nextAnnotation)}
        >
          <span>Next section</span>
          <ChevronRightIcon className="size-5" aria-hidden />
        </Button>
      </div>

      <div className="justify-self-end font-mono text-sm tabular-nums" aria-live="off">
        {loading ? (
          <span className="font-sans text-xs text-muted-foreground">
            Loading stems {loadedCount}/{totalCount}
          </span>
        ) : (
          <>
            {formatTime(safeCurrentTime)}{" "}
            <span className="text-muted-foreground">/ {formatTime(safeDuration)}</span>
          </>
        )}
      </div>
    </section>
  );
}

function MixerSpacebarShortcut() {
  const { isPlaying } = usePlaybackAnimation();
  const { isReady } = usePlaylistData();
  const { pause, play } = usePlaylistControls();
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const isSpace = event.code === "Space" || event.key === " ";

    if (
      !isSpace
      || event.defaultPrevented
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || !isReady
      || isSpacebarEditingTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    if (event.repeat) return;

    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return null;
}

function isSpacebarEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'input, select, textarea, [contenteditable="true"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="textbox"]',
    ),
  );
}

type MixerTrackControlProps = {
  trackIndex: number;
  track: SongMixerTrack | undefined;
  mixId: SongMixerMixId;
  selected: boolean;
  selectable: boolean;
  practiceQuickMute: boolean;
  onSelect: () => void;
  onStateValueChange: (key: "volume" | "pan" | "muted", value: number | boolean) => void;
};

function MixerTrackControls(props: MixerTrackControlProps) {
  return <DialogMixerTrackControls {...props} />;
}

function DialogMixerTrackControls({
  trackIndex,
  track,
  mixId,
  selected,
  selectable,
  practiceQuickMute,
  onSelect,
  onStateValueChange,
}: MixerTrackControlProps) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const { trackStates } = usePlaylistData();
  const { setTrackMute, setTrackPan, setTrackSolo, setTrackVolume } = usePlaylistControls();
  const state = trackStates[trackIndex];

  if (!track || !state) return null;

  const showsSelectAction = selectable && !practiceQuickMute;
  const showsPracticeMuteAction = selectable && practiceQuickMute;
  const dialogTitle = `${track.displayName} track controls`;
  const visibleTrackName = track.displayName.slice(0, 5);
  const changeVolume = (volume: number) => {
    setTrackVolume(trackIndex, volume);
    onStateValueChange("volume", Math.round(volume * 100));
  };
  const changePan = (pan: number) => {
    setTrackPan(trackIndex, pan);
    onStateValueChange("pan", Math.round(pan * 100));
  };
  const toggleMute = () => {
    const muted = !state.muted;
    setTrackMute(trackIndex, muted);
    if (!practiceQuickMute) onStateValueChange("muted", muted);
  };

  return (
    <div
      data-mixer-track-index={trackIndex}
      className="relative h-full min-h-10 border-r-2 bg-secondary/60"
    >
      {showsSelectAction ? (
        <Button
          type="button"
          size="xs"
          variant={selected && mixId === "learn" ? "default" : selected ? "secondary" : "outline"}
          aria-pressed={selected && mixId === "learn"}
          aria-label={
            selected
              ? mixId === "learn"
                ? `Return ${track.displayName} to Basic Mix`
                : `Switch ${track.displayName} to Learn Part`
              : mixId === "listen"
                ? `Select ${track.displayName} and switch to Learn Part`
                : `Select ${track.displayName}`
          }
          title={track.displayName}
          className="absolute inset-y-0 left-1 right-12 z-10 my-auto min-w-0 justify-start"
          onClick={onSelect}
        >
          <span className="truncate">{visibleTrackName}</span>
        </Button>
      ) : showsPracticeMuteAction ? (
        <Button
          type="button"
          size="xs"
          variant={state.muted ? "default" : "secondary"}
          aria-pressed={state.muted}
          aria-label={`${state.muted ? "Unmute" : "Mute"} ${track.displayName} for this practice session`}
          title={`${state.muted ? "Unmute" : "Mute"} ${track.displayName}`}
          className="absolute inset-y-0 left-1 right-12 z-10 my-auto min-w-0 justify-start"
          onClick={toggleMute}
        >
          <span className="truncate">{state.muted ? "Unmute" : "Mute"}</span>
        </Button>
      ) : (
        <span
          className="absolute inset-y-0 left-2 right-12 flex min-w-0 items-center truncate text-sm font-semibold"
          title={track.displayName}
        >
          {visibleTrackName}
        </span>
      )}

      <Dialog open={controlsOpen} onOpenChange={setControlsOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="absolute inset-y-0 right-0 z-20 my-auto size-11"
              aria-label={`Open ${dialogTitle}`}
              title={dialogTitle}
            />
          }
        >
          <Settings2Icon aria-hidden />
        </DialogTrigger>
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {practiceQuickMute
                ? "Mute changes apply only during this practice session. Other controls take effect immediately."
                : "Changes take effect immediately for this mix."}
            </DialogDescription>
          </DialogHeader>

          <FieldSet>
            <FieldLegend className="sr-only">{dialogTitle}</FieldLegend>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={`compact-volume-${track.id}`} className="w-full justify-between">
                  Volume
                  <output className="font-mono tabular-nums">{Math.round(state.volume * 100)}%</output>
                </FieldLabel>
                <input
                  id={`compact-volume-${track.id}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.volume}
                  onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                  className="swell-mixer-range h-4 w-full"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`compact-pan-${track.id}`} className="w-full justify-between">
                  Pan
                  <output className="font-mono tabular-nums">{formatPan(state.pan)}</output>
                </FieldLabel>
                <input
                  id={`compact-pan-${track.id}`}
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={state.pan}
                  onChange={(event) => changePan(Number(event.currentTarget.value))}
                  className="swell-mixer-range h-4 w-full"
                />
              </Field>

              <Field>
                <FieldLabel>Playback</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={state.muted ? "default" : "secondary"}
                    aria-pressed={state.muted}
                    onClick={toggleMute}
                  >
                    {state.muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    type="button"
                    variant={state.soloed ? "default" : "secondary"}
                    aria-pressed={state.soloed}
                    onClick={() => setTrackSolo(trackIndex, !state.soloed)}
                  >
                    Solo
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </FieldSet>

          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 sm:justify-end">
            <DialogClose render={<Button className="w-full sm:w-auto" />}>OK</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function formatPan(pan: number) {
  if (Math.abs(pan) < 0.01) return "C";
  return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
}
