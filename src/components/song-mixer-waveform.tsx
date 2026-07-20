"use client";

import {
  ArrowRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Waveform,
  WaveformPlaylistProvider,
  usePlaybackAnimation,
  usePlaylistControls,
  usePlaylistData,
  usePlaylistState,
} from "@waveform-playlist/browser";
import { useAudioTracks, type AudioTrackConfig } from "@waveform-playlist/browser/tone";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  mixerStateForTrack,
  resolveSongMixerTrackState,
  type SongMixerMixId,
  type SongMixerSettings,
  type SongMixerStateName,
  type SongMixerStateOverride,
  type SongMixerStateOverrides,
  type SongMixerStateValues,
  type SongMixerTrack,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const BASE_WAVE_HEIGHT = 52;
const MIN_EXPANDED_TRACK_HEIGHT = 104;
const SELECTED_PART_SCALE = 2;
const PART_COLOR_COUNT = 5;

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
};

export function SongMixerWaveform({
  tracks: mixerTracks,
  settings,
  mixId,
  selectedTrackId,
  onSelectedTrackChange,
  onTrackOverridesChange,
}: {
  tracks: SongMixerTrack[];
  settings: SongMixerSettings;
  mixId: SongMixerMixId;
  selectedTrackId: string | null;
  onSelectedTrackChange: (trackId: string) => void;
  onTrackOverridesChange?: (trackId: string, stateOverrides: SongMixerStateOverrides) => void;
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
  const [expandedTrackIds, setExpandedTrackIds] = useState<string[]>([]);
  const waveformRootRef = useRef<HTMLDivElement>(null);
  const pointerOverWaveformRef = useRef(false);
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
        const name = mixerStateForTrack(mixId, track.id, selectedTrackId);

        return {
          name,
          values: resolveSongMixerTrackState(settings, track, name),
        };
      }),
    [loadedMixerTracks, mixId, selectedTrackId, settings],
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
        zoomLevels={[256, 512, 1024, 2048, 4096]}
        automaticScroll
        controls={{ show: true, width: 236 }}
        theme={MIXER_THEME}
        barWidth={2}
        barGap={1}
        roundedBars
        deferEngineRebuild={loading}
        onError={handleEngineError}
      >
        <MixStateSynchronizer
          effectiveStates={effectiveStates}
          expandedTrackIds={expandedTrackIds}
          mixerTracks={loadedMixerTracks}
          selectedTrackId={selectedTrackId}
          waveformRootRef={waveformRootRef}
        />
        <SuppressWaveformTrackSelection />
        <WaveformSpacebarShortcut pointerOverWaveformRef={pointerOverWaveformRef} />
        <MixerTransport
          loading={loading}
          loadedCount={loadedCount}
          totalCount={totalCount}
          expandedTrackCount={expandedTrackIds.filter((trackId) =>
            loadedMixerTracks.some((track) => track.id === trackId),
          ).length}
          onOpenAllControls={() => setExpandedTrackIds(loadedMixerTracks.map((track) => track.id))}
          onCloseAllControls={() => setExpandedTrackIds([])}
        />
        <div
          ref={waveformRootRef}
          aria-keyshortcuts="Space"
          onPointerEnter={(event) => {
            pointerOverWaveformRef.current = isWaveformPointerTarget(event.target);
          }}
          onPointerMove={(event) => {
            pointerOverWaveformRef.current = isWaveformPointerTarget(event.target);
          }}
          onPointerLeave={() => {
            pointerOverWaveformRef.current = false;
          }}
          className="swell-mixer-waveform min-w-0 overflow-x-auto border-t-2 bg-card"
        >
          <WaveformPartColorFilters />
          <Waveform
            showClipHeaders={false}
            interactiveClips={false}
            renderTrackControls={(trackIndex) => (
              <MixerTrackControls
                trackIndex={trackIndex}
                track={loadedMixerTracks[trackIndex]}
                expanded={expandedTrackIds.includes(loadedMixerTracks[trackIndex]?.id ?? "")}
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
                onExpandedChange={(expanded) => {
                  const trackId = loadedMixerTracks[trackIndex]?.id;
                  if (!trackId) return;

                  setExpandedTrackIds((current) =>
                    expanded
                      ? [...new Set([...current, trackId])]
                      : current.filter((currentTrackId) => currentTrackId !== trackId),
                  );
                }}
              />
            )}
          />
        </div>
      </WaveformPlaylistProvider>
    </>
  );
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
  expandedTrackIds,
  mixerTracks,
  selectedTrackId,
  waveformRootRef,
}: {
  effectiveStates: Array<{ name: SongMixerStateName; values: SongMixerStateValues }>;
  expandedTrackIds: string[];
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
        const mixerTrack = mixerTracks[trackIndex];
        const trackId = mixerTrack?.id;
        const isSelectedPart = Boolean(
          mixerTrack && !mixerTrack.isBackgroundMix && mixerTrack.id === selectedTrackId,
        );
        const selectedScale = isSelectedPart ? SELECTED_PART_SCALE : 1;
        const visualScale = Math.max(configuredScale, selectedScale);
        const isExpanded = trackId ? expandedTrackIds.includes(trackId) : false;
        const displayScale = isExpanded
          ? Math.max(visualScale, MIN_EXPANDED_TRACK_HEIGHT / naturalHeight)
          : visualScale;
        const displayHeight = Math.round(naturalHeight * displayScale);
        const waveformRow = element.parentElement;
        const controlRow = controlElements[trackIndex]?.parentElement;

        element.dataset.mixerWaveContent = "";
        element.dataset.mixerTrackKind = mixerTrack?.isBackgroundMix ? "background" : "part";
        if (mixerTrack?.isBackgroundMix) {
          delete element.dataset.mixerPartColor;
          delete element.dataset.mixerPartEmphasis;
        } else if (mixerTrack) {
          element.dataset.mixerPartColor = String(partColorSlot(mixerTracks, trackIndex));
          element.dataset.mixerPartEmphasis = isSelectedPart ? "selected" : "muted";
        }
        element.style.height = `${naturalHeight}px`;
        element.style.transform = `scaleY(${displayScale})`;
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
    expandedTrackIds,
    mixerTracks,
    playlistData.audioBuffers,
    playlistData.isReady,
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
  expandedTrackCount,
  onOpenAllControls,
  onCloseAllControls,
}: {
  loading: boolean;
  loadedCount: number;
  totalCount: number;
  expandedTrackCount: number;
  onOpenAllControls: () => void;
  onCloseAllControls: () => void;
}) {
  const { currentTime, isPlaying } = usePlaybackAnimation();
  const { duration, isReady, canZoomIn, canZoomOut } = usePlaylistData();
  const { pause, play, seekTo, stop, zoomIn, zoomOut } = usePlaylistControls();
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const safeCurrentTime = Math.min(Number.isFinite(currentTime) ? currentTime : 0, safeDuration);

  return (
    <div className="grid gap-3 bg-secondary/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon-lg"
          aria-label="Play"
          disabled={!isReady || isPlaying}
          onClick={() => void play()}
        >
          <PlayIcon className="size-4 fill-current" aria-hidden />
        </Button>
        <Button size="icon-lg" variant="secondary" aria-label="Pause" disabled={!isReady || !isPlaying} onClick={pause}>
          <PauseIcon className="size-4 fill-current" aria-hidden />
        </Button>
        <Button size="icon-lg" variant="secondary" aria-label="Stop and return to start" disabled={!isReady} onClick={stop}>
          <RotateCcwIcon className="size-4" aria-hidden />
        </Button>

        <div className="ml-1 font-mono text-sm tabular-nums" aria-live="off">
          {formatTime(safeCurrentTime)} <span className="text-muted-foreground">/ {formatTime(safeDuration)}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Button
            size="xs"
            variant="outline"
            disabled={!isReady || expandedTrackCount === totalCount}
            onClick={onOpenAllControls}
          >
            Open all controls
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!isReady || expandedTrackCount === 0}
            onClick={onCloseAllControls}
          >
            Close all controls
          </Button>
          <Button size="icon" variant="ghost" aria-label="Zoom timeline out" disabled={!canZoomOut} onClick={zoomOut}>
            <ZoomOutIcon aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Zoom timeline in" disabled={!canZoomIn} onClick={zoomIn}>
            <ZoomInIcon aria-hidden />
          </Button>
        </div>
      </div>

      <label className="grid gap-1.5">
        <span className="flex items-center justify-between gap-3 text-xs font-medium">
          <span>Timeline</span>
          <span className="text-muted-foreground">
            {loading
              ? `Loading and decoding stems ${loadedCount}/${totalCount}`
              : "Drag to seek. Space over waveforms plays or pauses."}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(safeDuration, 0.01)}
          step={0.01}
          value={safeCurrentTime}
          disabled={!isReady}
          onChange={(event) => seekTo(Number(event.currentTarget.value))}
          className="swell-mixer-range w-full"
          aria-label="Song position"
        />
      </label>
    </div>
  );
}

function WaveformSpacebarShortcut({
  pointerOverWaveformRef,
}: {
  pointerOverWaveformRef: RefObject<boolean>;
}) {
  const { isPlaying } = usePlaybackAnimation();
  const { isReady } = usePlaylistData();
  const { pause, play } = usePlaylistControls();
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const isSpace = event.code === "Space" || event.key === " ";

    if (
      !isSpace
      || event.defaultPrevented
      || event.repeat
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || !isReady
      || !pointerOverWaveformRef.current
      || isInteractiveKeyboardTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}

function isInteractiveKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest(
      'a[href], button, input, select, textarea, [contenteditable="true"], [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [role="option"], [role="slider"], [role="switch"], [role="tab"]',
    ),
  );
}

function isWaveformPointerTarget(target: EventTarget | null) {
  return target instanceof Element && !target.closest("[data-mixer-track-index]");
}

function MixerTrackControls({
  trackIndex,
  track,
  expanded,
  selected,
  selectable,
  practiceQuickMute,
  onSelect,
  onStateValueChange,
  onExpandedChange,
}: {
  trackIndex: number;
  track: SongMixerTrack | undefined;
  expanded: boolean;
  selected: boolean;
  selectable: boolean;
  practiceQuickMute: boolean;
  onSelect: () => void;
  onStateValueChange: (key: "volume" | "pan" | "muted", value: number | boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { trackStates } = usePlaylistData();
  const { setTrackMute, setTrackPan, setTrackSolo, setTrackVolume } = usePlaylistControls();
  const state = trackStates[trackIndex];

  if (!track || !state) return null;

  const showsSelectAction = selectable && !practiceQuickMute;
  const hasHeaderAction = practiceQuickMute || showsSelectAction;

  return (
    <Accordion
      value={expanded ? [track.id] : []}
      onValueChange={(values) => onExpandedChange(values.includes(track.id))}
      data-mixer-track-index={trackIndex}
      className="h-full gap-0 border-r-2 bg-secondary/60"
    >
      <AccordionItem
        value={track.id}
        className="relative min-h-full rounded-none border-0 bg-transparent shadow-none hover:shadow-none data-[open]:shadow-none"
      >
        <AccordionTrigger
          className={cn(
            "gap-2 px-2 font-body hover:bg-secondary/85 data-[open]:bg-secondary/85",
            expanded ? "h-8 min-h-8 py-0.5" : "h-full min-h-10 py-1",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={track.displayName}>
              {track.displayName}
            </span>
          </span>
          {hasHeaderAction ? <span aria-hidden className="w-[4.75rem] shrink-0" /> : null}
        </AccordionTrigger>

        {practiceQuickMute ? (
          <Button
            type="button"
            size="xs"
            variant={state.muted ? "default" : "outline"}
            aria-label={
              state.muted
                ? `Unmute ${track.displayName} for a quick check`
                : `Mute ${track.displayName} again`
            }
            className={cn(
              "absolute right-8",
              expanded ? "top-1" : "inset-y-0 my-auto",
            )}
            onClick={() => setTrackMute(trackIndex, !state.muted)}
          >
            {state.muted ? "Unmute" : "Mute"}
          </Button>
        ) : null}

        {showsSelectAction ? (
          <Button
            type="button"
            size="xs"
            variant={selected ? "secondary" : "outline"}
            disabled={selected}
            aria-label={
              selected
                ? `${track.displayName} is selected`
                : `Select ${track.displayName}`
            }
            className={cn(
              "absolute right-8",
              expanded ? "top-1" : "inset-y-0 my-auto",
            )}
            onClick={onSelect}
          >
            {selected ? "Selected" : "Select"}
            {!selected ? <ArrowRightIcon data-icon="inline-end" /> : null}
          </Button>
        ) : null}

        <AccordionContent className="grid gap-0.5 border-t px-2 py-0.5 text-foreground">
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-x-1 gap-y-0.5">
            <label htmlFor={`volume-${track.id}`} className="text-[11px] font-semibold text-muted-foreground">
              VOL
            </label>
            <input
              id={`volume-${track.id}`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.volume}
              onChange={(event) => {
                const volume = Number(event.currentTarget.value);
                setTrackVolume(trackIndex, volume);
                onStateValueChange("volume", Math.round(volume * 100));
              }}
              className="swell-mixer-range"
            />
            <output className="text-right font-mono text-[11px] tabular-nums">
              {Math.round(state.volume * 100)}
            </output>

            <label htmlFor={`pan-${track.id}`} className="text-[11px] font-semibold text-muted-foreground">
              PAN
            </label>
            <input
              id={`pan-${track.id}`}
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={state.pan}
              onChange={(event) => {
                const pan = Number(event.currentTarget.value);
                setTrackPan(trackIndex, pan);
                onStateValueChange("pan", Math.round(pan * 100));
              }}
              className="swell-mixer-range"
            />
            <output className="text-right font-mono text-[11px] tabular-nums">{formatPan(state.pan)}</output>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant={state.muted ? "default" : "secondary"}
              aria-pressed={state.muted}
              onClick={() => {
                const muted = !state.muted;
                setTrackMute(trackIndex, muted);
                onStateValueChange("muted", muted);
              }}
            >
              Mute
            </Button>
            <Button
              size="xs"
              variant={state.soloed ? "default" : "secondary"}
              aria-pressed={state.soloed}
              onClick={() => setTrackSolo(trackIndex, !state.soloed)}
            >
              Solo
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
