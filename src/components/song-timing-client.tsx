"use client";

import {
  Clock3Icon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAdmin } from "@/hooks/use-admin";
import type {
  Song,
  SongTimingWorkspace,
  TimingAttribute,
  TimingSegment,
} from "@/lib/domain";
import { uploadSongOriginalRecording } from "@/lib/firestore";
import {
  createTimingAttribute,
  deleteTimingAttribute,
  loadSongTimingWorkspace,
  normalizeTimingSegments,
  saveSongTimingDuration,
  saveSongTimingSegments,
  updateTimingAttribute,
} from "@/lib/song-timing";
import { cn } from "@/lib/utils";

const ATTRIBUTE_COLORS = [
  { bar: "bg-chart-1", dot: "bg-chart-1" },
  { bar: "bg-chart-2", dot: "bg-chart-2" },
  { bar: "bg-chart-3", dot: "bg-chart-3" },
  { bar: "bg-chart-4", dot: "bg-chart-4" },
  { bar: "bg-chart-5", dot: "bg-chart-5" },
] as const;

const SNAP_TOLERANCE_PERCENT = 3;
const TIMELINE_GRID_CLASS =
  "grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_11rem] sm:items-center sm:gap-x-4";

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

function isButtonOrLinkTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, a, [role="button"]'));
}

function colorForAttribute(index: number) {
  return ATTRIBUTE_COLORS[index % ATTRIBUTE_COLORS.length];
}

function formatClock(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "Length needed";
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function formatSeconds(seconds: number) {
  return `${Math.round(seconds).toLocaleString()} sec`;
}

function sectionLabel(count: number) {
  return `${count} ${count === 1 ? "section" : "sections"}`;
}

function secondsForSegments(segments: TimingSegment[], durationSeconds?: number) {
  if (!durationSeconds) return 0;
  return segments.reduce(
    (total, segment) => segment.endPercent === null
      ? total
      : total + ((segment.endPercent - segment.startPercent) / 100) * durationSeconds,
    0,
  );
}

function completedSegments(segments: TimingSegment[]) {
  return segments.filter(
    (segment): segment is TimingSegment & { endPercent: number } =>
      segment.endPercent !== null,
  );
}

function parseDuration(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  const parts = trimmed.split(":");
  if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

type TimingHandle = {
  edge: "start" | "end";
  segmentIndex: number;
  value: number;
};

function timingHandles(segments: TimingSegment[]): TimingHandle[] {
  return segments
    .flatMap((segment, segmentIndex): TimingHandle[] => [
      { edge: "start", segmentIndex, value: segment.startPercent },
      ...(segment.endPercent === null
        ? []
        : [{ edge: "end" as const, segmentIndex, value: segment.endPercent }]),
    ])
    .sort((left, right) => left.value - right.value || left.segmentIndex - right.segmentIndex);
}

function segmentsFromHandleValues(
  segments: TimingSegment[],
  handles: TimingHandle[],
  values: readonly number[],
  activeThumbIndex: number,
  playheadPercent: number,
  snapEnabled: boolean,
) {
  const nextSegments = segments.map((segment) => ({ ...segment }));
  const snappedValues = [...values];
  const activeValue = snappedValues[activeThumbIndex];

  if (
    snapEnabled
    && typeof activeValue === "number"
    && Math.abs(activeValue - playheadPercent) <= SNAP_TOLERANCE_PERCENT
  ) {
    snappedValues[activeThumbIndex] = playheadPercent;
  }

  handles.forEach((handle, index) => {
    const value = snappedValues[index];
    const segment = nextSegments[handle.segmentIndex];
    if (!segment || typeof value !== "number") return;
    if (handle.edge === "start") segment.startPercent = value;
    else segment.endPercent = value;
  });

  return normalizeTimingSegments(nextSegments);
}

function TimingRangeSlider({
  attributeLabel,
  colorClassName,
  disabled,
  durationSeconds,
  playheadPercent,
  segments,
  snapEnabled,
  onChange,
  onCommit,
}: {
  attributeLabel: string;
  colorClassName: string;
  disabled: boolean;
  durationSeconds?: number;
  playheadPercent: number;
  segments: TimingSegment[];
  snapEnabled: boolean;
  onChange: (segments: TimingSegment[]) => void;
  onCommit: (segments: TimingSegment[]) => void;
}) {
  const handles = timingHandles(segments);
  const values = handles.map((handle) => handle.value);
  const activeThumbIndexRef = useRef(0);

  function nextSegments(
    nextValue: number | readonly number[],
    activeThumbIndex: number,
  ) {
    return Array.isArray(nextValue)
      ? segmentsFromHandleValues(
          segments,
          handles,
          nextValue,
          activeThumbIndex,
          playheadPercent,
          snapEnabled,
        )
      : segments;
  }

  return (
    <div className="relative h-11 min-w-0">
      <div
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full border bg-muted"
      >
        {completedSegments(segments).map((segment, index) => (
          <span
            className={cn("absolute inset-y-0 rounded-full", colorClassName)}
            key={`${segment.startPercent}-${segment.endPercent}-${index}`}
            style={{
              left: `${segment.startPercent}%`,
              width: `${segment.endPercent - segment.startPercent}%`,
            }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 h-7 w-px -translate-y-1/2 bg-foreground/65",
          snapEnabled && "ring-2 ring-background",
        )}
        style={{ left: `${playheadPercent}%` }}
      />
      {values.length ? (
        <Slider
          aria-label={`${attributeLabel} assigned sections`}
          className="absolute inset-0 [&>div]:h-full [&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:after:-inset-4 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-transparent"
          disabled={disabled}
          getThumbAriaLabel={(index) => {
            const handle = handles[index];
            return `${attributeLabel}, section ${(handle?.segmentIndex ?? 0) + 1} ${handle?.edge ?? "boundary"}`;
          }}
          getThumbAriaValueText={(_, value) => {
            if (!durationSeconds) return `${Math.round(value)} percent`;
            return `${formatClock((value / 100) * durationSeconds)}, ${Math.round(value)} percent`;
          }}
          max={100}
          min={0}
          minStepsBetweenValues={0}
          step={0.25}
          thumbCollisionBehavior="none"
          value={values}
          onValueChange={(nextValue, details) => {
            activeThumbIndexRef.current = details.activeThumbIndex;
            onChange(nextSegments(nextValue, details.activeThumbIndex));
          }}
          onValueCommitted={(nextValue) => {
            onCommit(nextSegments(nextValue, activeThumbIndexRef.current));
          }}
        />
      ) : null}
    </div>
  );
}

function SongSummary({
  attributes,
  assignments,
  durationSeconds,
}: {
  attributes: TimingAttribute[];
  assignments: Record<string, TimingSegment[]>;
  durationSeconds?: number;
}) {
  const summaryRows = attributes.flatMap((attribute, index) => {
    const segments = assignments[attribute.id] ?? [];
    return segments.length
      ? [{ attribute, index, segments }]
      : [];
  });

  if (!summaryRows.length) {
    return (
      <span className="text-xs font-normal text-muted-foreground">
        {attributes.length ? "No sections assigned" : "No visible attributes"}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1.5">
      {summaryRows.map(({ attribute, index, segments }) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-normal" key={attribute.id}>
          <span aria-hidden className={cn("size-2 rounded-full", colorForAttribute(index).dot)} />
          <span className="font-medium text-foreground">{attribute.label}</span>
          <span className="text-muted-foreground">
            {sectionLabel(completedSegments(segments).length)}, {formatSeconds(secondsForSegments(segments, durationSeconds))}
            {segments.some((segment) => segment.endPercent === null) ? " · On waiting for Off" : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

function SongAudioPlayer({
  active,
  canUpload,
  currentTime,
  durationSeconds,
  playing,
  song,
  uploading,
  uploadProgress,
  onActivate,
  onCurrentTimeChange,
  onDurationDetected,
  onPlayingChange,
  onUpload,
}: {
  active: boolean;
  canUpload: boolean;
  currentTime: number;
  durationSeconds?: number;
  playing: boolean;
  song: Song;
  uploading: boolean;
  uploadProgress: number;
  onActivate: () => void;
  onCurrentTimeChange: (seconds: number) => void;
  onDurationDetected: (seconds: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onUpload: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekSurfaceRef = useRef<HTMLDivElement>(null);
  const seekingPointerIdRef = useRef<number | null>(null);
  const [mediaDuration, setMediaDuration] = useState(durationSeconds ?? 0);
  const effectiveDuration = mediaDuration || durationSeconds || 0;

  function seek(seconds: number) {
    const boundedSeconds = Math.min(effectiveDuration, Math.max(0, seconds));
    if (audioRef.current) audioRef.current.currentTime = boundedSeconds;
    onCurrentTimeChange(boundedSeconds);
  }

  function seekFromClientX(clientX: number) {
    const seekSurface = seekSurfaceRef.current;
    if (!seekSurface || !effectiveDuration) return;
    const rect = seekSurface.getBoundingClientRect();
    if (!rect.width) return;
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(percent * effectiveDuration);
  }

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        toast.error("The MP3 could not start playing.");
      }
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    if (!active || !song.originalRecording?.downloadUrl) return;

    function handleSpacebar(event: KeyboardEvent) {
      if (
        event.code !== "Space"
        || event.repeat
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || isTextEntryTarget(event.target)
        || isButtonOrLinkTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      void togglePlayback();
    }

    window.addEventListener("keydown", handleSpacebar);
    return () => window.removeEventListener("keydown", handleSpacebar);
  }, [active, song.originalRecording?.downloadUrl, togglePlayback]);

  if (!song.originalRecording?.downloadUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed bg-muted/25 p-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">No original MP3</p>
          <p className="text-xs text-muted-foreground">Upload a recording to enable playback and timing capture.</p>
        </div>
        {canUpload ? (
          <Button disabled={uploading} onClick={onUpload} size="sm" type="button" variant="outline">
            {uploading ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {uploading ? `Uploading ${uploadProgress}%` : "Upload MP3"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-label={`${song.title} audio player`}
      className={cn(
        "flex flex-col gap-2 rounded-md bg-muted/35 py-3 transition-[box-shadow]",
        active ? "ring-2 ring-primary/45" : "ring-1 ring-border",
      )}
      onPointerDownCapture={onActivate}
    >
      <audio
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
          setMediaDuration(nextDuration);
          if (Math.abs(nextDuration - (durationSeconds ?? 0)) >= 1) {
            onDurationDetected(nextDuration);
          }
        }}
        onEnded={() => onPlayingChange(false)}
        onPause={() => onPlayingChange(false)}
        onPlay={() => onPlayingChange(true)}
        onTimeUpdate={(event) => onCurrentTimeChange(event.currentTarget.currentTime)}
        preload="metadata"
        ref={audioRef}
        src={song.originalRecording.downloadUrl}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 text-xs text-muted-foreground">
        <span className="flex shrink-0 items-center gap-2 font-medium text-foreground">
          Original MP3
          {active ? <Badge variant="secondary">Active</Badge> : null}
        </span>
        <span className="min-w-36 flex-1 truncate text-right" title={song.originalRecording.filename}>
          {song.originalRecording.filename}
        </span>
        {canUpload ? (
          <Button disabled={uploading} onClick={onUpload} size="xs" type="button" variant="outline">
            {uploading ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {uploading ? `Uploading ${uploadProgress}%` : "Replace MP3"}
          </Button>
        ) : null}
      </div>
      <div className={TIMELINE_GRID_CLASS}>
        <div className="flex items-center gap-2">
          <Button
            aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}
            onClick={() => void togglePlayback()}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          </Button>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatClock(currentTime)}
          </span>
        </div>
        <div
          className="cursor-pointer active:cursor-grabbing"
          onPointerCancel={() => {
            seekingPointerIdRef.current = null;
          }}
          onPointerDown={(event) => {
            if (!effectiveDuration) return;
            seekingPointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (seekingPointerIdRef.current !== event.pointerId) return;
            seekFromClientX(event.clientX);
          }}
          onPointerUp={(event) => {
            if (seekingPointerIdRef.current !== event.pointerId) return;
            seekFromClientX(event.clientX);
            seekingPointerIdRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          ref={seekSurfaceRef}
        >
          <Slider
            aria-label={`${song.title} playback position`}
            className="h-11 [&>div]:h-full [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:after:-inset-4 [&_[data-slot=slider-track]]:h-2"
            disabled={!effectiveDuration}
            getThumbAriaLabel={() => `${song.title} playback position`}
            getThumbAriaValueText={(_, value) => formatClock(value)}
            max={effectiveDuration || 1}
            min={0}
            step={0.05}
            value={[Math.min(currentTime, effectiveDuration || 0)]}
            onValueChange={(value) => {
              if (Array.isArray(value) && typeof value[0] === "number") seek(value[0]);
            }}
          />
        </div>
        <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
          {formatClock(effectiveDuration || durationSeconds)}
        </span>
      </div>
      <p className="px-3 text-xs text-muted-foreground">
        Click or drag the timeline to scan. Pause at a boundary, then use On or Off below.
        Space plays or pauses the active song. Handles within 3% of the playhead snap to it.
      </p>
    </section>
  );
}

function AttributeTimeline({
  attribute,
  attributeIndex,
  captureEnabled,
  disabled,
  durationSeconds,
  playheadPercent,
  segments,
  snapEnabled,
  onChange,
  onCommit,
}: {
  attribute: TimingAttribute;
  attributeIndex: number;
  captureEnabled: boolean;
  disabled: boolean;
  durationSeconds?: number;
  playheadPercent: number;
  segments: TimingSegment[];
  snapEnabled: boolean;
  onChange: (segments: TimingSegment[]) => void;
  onCommit: (segments: TimingSegment[]) => void;
}) {
  const color = colorForAttribute(attributeIndex);
  const completeSegments = completedSegments(segments);
  const pendingSegmentIndex = segments.findIndex((segment) => segment.endPercent === null);
  const pendingSegment = pendingSegmentIndex >= 0 ? segments[pendingSegmentIndex] : null;
  const assignedSeconds = secondsForSegments(segments, durationSeconds);

  function commit(nextSegments: TimingSegment[]) {
    const normalizedSegments = normalizeTimingSegments(nextSegments);
    onChange(normalizedSegments);
    onCommit(normalizedSegments);
  }

  function captureOn() {
    if (pendingSegment) {
      toast.info(`Finish ${attribute.label} with Off before adding another On.`);
      return;
    }

    const startPercent = Math.round(playheadPercent * 100) / 100;
    if (startPercent >= 100) {
      toast.error("Move the playhead before the end of the song to add On.");
      return;
    }
    if (completeSegments.some(
      (segment) => startPercent > segment.startPercent && startPercent < segment.endPercent,
    )) {
      toast.error(`${attribute.label} is already on at ${formatClock((startPercent / 100) * (durationSeconds ?? 0))}.`);
      return;
    }

    commit([...segments, { startPercent, endPercent: null }]);
  }

  function captureOff() {
    if (!pendingSegment || pendingSegmentIndex < 0) {
      toast.info(`Add ${attribute.label} On before adding Off.`);
      return;
    }

    const endPercent = Math.round(playheadPercent * 100) / 100;
    if (endPercent <= pendingSegment.startPercent) {
      toast.error("Move the playhead after the On boundary before adding Off.");
      return;
    }
    if (completeSegments.some(
      (segment) =>
        segment.startPercent < endPercent
        && segment.endPercent > pendingSegment.startPercent,
    )) {
      toast.error(`${attribute.label} already has a section inside that range.`);
      return;
    }

    commit(segments.map((segment, index) =>
      index === pendingSegmentIndex ? { ...segment, endPercent } : segment,
    ));
  }

  function removeSegment(segmentIndex: number) {
    commit(segments.filter((_, index) => index !== segmentIndex));
  }

  return (
    <div className={cn(TIMELINE_GRID_CLASS, "py-3")}>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", color.dot)} />
        <span className="truncate text-sm font-semibold text-foreground" title={attribute.label}>
          {attribute.label}
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground sm:hidden">
          {sectionLabel(completeSegments.length)}, {formatSeconds(assignedSeconds)}
        </span>
      </div>

      <div className="min-w-0">
        <TimingRangeSlider
          attributeLabel={attribute.label}
          colorClassName={color.bar}
          disabled={disabled}
          durationSeconds={durationSeconds}
          playheadPercent={playheadPercent}
          segments={segments}
          snapEnabled={snapEnabled}
          onChange={onChange}
          onCommit={onCommit}
        />
        {segments.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {segments.map((segment, index) => (
              <Button
                aria-label={`Remove ${attribute.label} section ${index + 1}`}
                disabled={disabled}
                key={`${segment.startPercent}-${segment.endPercent}-${index}`}
                onClick={() => removeSegment(index)}
                size="xs"
                title="Remove section"
                type="button"
                variant="secondary"
              >
                {segment.endPercent === null
                  ? `On ${formatClock((segment.startPercent / 100) * (durationSeconds ?? 0))}, waiting for Off`
                  : durationSeconds
                  ? `${formatClock((segment.startPercent / 100) * durationSeconds)}–${formatClock((segment.endPercent / 100) * durationSeconds)}`
                  : `${Math.round(segment.startPercent)}–${Math.round(segment.endPercent)}%`}
                <XIcon data-icon="inline-end" />
              </Button>
            ))}
          </div>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">No sections yet.</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="hidden min-w-28 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {sectionLabel(completeSegments.length)}, {formatSeconds(assignedSeconds)}
        </span>
        <Button
          aria-label={`Add ${attribute.label} On at ${formatClock((playheadPercent / 100) * (durationSeconds ?? 0))}`}
          disabled={disabled || !captureEnabled || Boolean(pendingSegment)}
          onClick={captureOn}
          size="xs"
          title={`Set On at ${formatClock((playheadPercent / 100) * (durationSeconds ?? 0))}`}
          type="button"
          variant="outline"
        >
          + On
        </Button>
        <Button
          aria-label={`Add ${attribute.label} Off at ${formatClock((playheadPercent / 100) * (durationSeconds ?? 0))}`}
          disabled={disabled || !captureEnabled || !pendingSegment}
          onClick={captureOff}
          size="xs"
          title={`Set Off at ${formatClock((playheadPercent / 100) * (durationSeconds ?? 0))}`}
          type="button"
          variant={pendingSegment ? "secondary" : "outline"}
        >
          − Off
        </Button>
      </div>
    </div>
  );
}

function SongTimingEditor({
  active,
  attributes,
  assignments,
  canUpload,
  disabled,
  song,
  uploading,
  uploadProgress,
  onActivate,
  onDurationChange,
  onDurationDetected,
  onSegmentsChange,
  onSegmentsCommit,
  onUpload,
}: {
  active: boolean;
  attributes: TimingAttribute[];
  assignments: Record<string, TimingSegment[]>;
  canUpload: boolean;
  disabled: boolean;
  song: Song;
  uploading: boolean;
  uploadProgress: number;
  onActivate: () => void;
  onDurationChange: (durationSeconds: number) => void;
  onDurationDetected: (durationSeconds: number) => void;
  onSegmentsChange: (attributeId: string, segments: TimingSegment[]) => void;
  onSegmentsCommit: (attributeId: string, segments: TimingSegment[]) => void;
  onUpload: () => void;
}) {
  const [durationDraft, setDurationDraft] = useState(formatClock(song.timingDurationSeconds));
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playheadPercent = song.timingDurationSeconds
    ? Math.min(100, Math.max(0, (currentTime / song.timingDurationSeconds) * 100))
    : 0;

  function commitDuration() {
    const durationSeconds = parseDuration(durationDraft);
    if (!durationSeconds) {
      setDurationDraft(formatClock(song.timingDurationSeconds));
      toast.error("Enter a song length as m:ss or total seconds.");
      return;
    }
    setDurationDraft(formatClock(durationSeconds));
    if (Math.round(durationSeconds) !== Math.round(song.timingDurationSeconds ?? 0)) {
      onDurationChange(durationSeconds);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 pt-1"
      onFocusCapture={onActivate}
      onPointerDownCapture={onActivate}
    >
      <SongAudioPlayer
        active={active}
        canUpload={canUpload}
        currentTime={currentTime}
        durationSeconds={song.timingDurationSeconds}
        onActivate={onActivate}
        onCurrentTimeChange={setCurrentTime}
        onDurationDetected={onDurationDetected}
        onPlayingChange={setPlaying}
        onUpload={onUpload}
        playing={playing}
        song={song}
        uploading={uploading}
        uploadProgress={uploadProgress}
      />
      <FieldGroup>
        <Field orientation="responsive" className="items-start rounded-md border bg-muted/35 p-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <FieldLabel htmlFor={`duration-${song.id}`}>Song length</FieldLabel>
            <FieldDescription>
              Percentages use this length to calculate seconds.
              {song.originalRecording ? " The MP3 length fills this automatically when available." : " Enter m:ss or total seconds."}
            </FieldDescription>
          </div>
          <Input
            aria-label={`${song.title} length`}
            className="w-full font-mono tabular-nums @md/field-group:w-28"
            disabled={disabled}
            id={`duration-${song.id}`}
            inputMode="numeric"
            onBlur={commitDuration}
            onChange={(event) => setDurationDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDurationDraft(formatClock(song.timingDurationSeconds));
                event.currentTarget.blur();
              }
            }}
            placeholder="3:24"
            value={durationDraft === "Length needed" ? "" : durationDraft}
          />
        </Field>
      </FieldGroup>

      {attributes.length ? (
        <div className="divide-y">
          {attributes.map((attribute, index) => (
            <AttributeTimeline
              attribute={attribute}
              attributeIndex={index}
              captureEnabled={Boolean(song.originalRecording?.downloadUrl && song.timingDurationSeconds)}
              disabled={disabled || !song.timingDurationSeconds}
              durationSeconds={song.timingDurationSeconds}
              key={attribute.id}
              playheadPercent={playheadPercent}
              onChange={(segments) => onSegmentsChange(attribute.id, segments)}
              onCommit={(segments) => onSegmentsCommit(attribute.id, segments)}
              segments={assignments[attribute.id] ?? []}
              snapEnabled={!playing}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Turn on an attribute below to add timeline sections.
        </p>
      )}
      {!song.timingDurationSeconds ? (
        <p className="text-xs font-medium text-muted-foreground">
          Add the song length before assigning sections.
        </p>
      ) : null}
    </div>
  );
}

function AttributeEditorRow({
  attribute,
  assignedSectionCount,
  disabled,
  onDelete,
  onLabelChange,
  onVisibilityChange,
}: {
  attribute: TimingAttribute;
  assignedSectionCount: number;
  disabled: boolean;
  onDelete: () => void;
  onLabelChange: (label: string) => void;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(attribute.label);

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelDraft(attribute.label);
      toast.error("Attribute name is required.");
      return;
    }
    if (trimmed !== attribute.label) onLabelChange(trimmed);
  }

  return (
    <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-[minmax(10rem,1fr)_auto_auto] sm:items-center">
      <Field>
        <FieldLabel className="sr-only" htmlFor={`attribute-${attribute.id}`}>
          Attribute name
        </FieldLabel>
        <Input
          disabled={disabled}
          id={`attribute-${attribute.id}`}
          onBlur={commitLabel}
          onChange={(event) => setLabelDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setLabelDraft(attribute.label);
              event.currentTarget.blur();
            }
          }}
          value={labelDraft}
        />
        <FieldDescription>{sectionLabel(assignedSectionCount)} assigned</FieldDescription>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <Switch
          aria-label={`Show ${attribute.label}`}
          checked={attribute.visible}
          disabled={disabled}
          id={`visibility-${attribute.id}`}
          onCheckedChange={onVisibilityChange}
        />
        <FieldLabel htmlFor={`visibility-${attribute.id}`}>Visible</FieldLabel>
      </Field>
      <Button
        aria-label={`Delete ${attribute.label}`}
        disabled={disabled}
        onClick={onDelete}
        size="icon-sm"
        title={`Delete ${attribute.label}`}
        type="button"
        variant="ghost"
      >
        <Trash2Icon aria-hidden />
      </Button>
    </div>
  );
}

function AttributeManager({
  assignments,
  attributes,
  disabled,
  onCreate,
  onDelete,
  onLabelChange,
  onVisibilityChange,
}: {
  assignments: SongTimingWorkspace["assignments"];
  attributes: TimingAttribute[];
  disabled: boolean;
  onCreate: (label: string) => Promise<void>;
  onDelete: (attribute: TimingAttribute) => Promise<void>;
  onLabelChange: (attribute: TimingAttribute, label: string) => Promise<void>;
  onVisibilityChange: (attribute: TimingAttribute, visible: boolean) => Promise<void>;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TimingAttribute | null>(null);

  const sectionCounts = useMemo(
    () => Object.fromEntries(
      attributes.map((attribute) => [
        attribute.id,
        Object.values(assignments).reduce(
          (total, songAssignments) =>
            total + completedSegments(songAssignments[attribute.id] ?? []).length,
          0,
        ),
      ]),
    ),
    [assignments, attributes],
  );

  async function submitNewAttribute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setNewLabel("");
  }

  return (
    <>
      <Accordion defaultValue={[]}>
        <AccordionItem value="attributes">
          <AccordionTrigger className="px-4 py-4 sm:px-5">
            <span className="flex flex-1 items-center justify-between gap-3 pr-2">
              <span className="flex items-center gap-2">
                <SlidersHorizontalIcon aria-hidden />
                <span>Manage attributes</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {attributes.length} total, {attributes.filter((attribute) => attribute.visible).length} visible
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Attributes can be people, instruments, solo types, or anything else you want to total across the song library.
            </p>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submitNewAttribute}>
              <Field className="flex-1">
                <FieldLabel htmlFor="new-timing-attribute">New attribute</FieldLabel>
                <Input
                  disabled={disabled}
                  id="new-timing-attribute"
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="Brian, guitar, sax…"
                  value={newLabel}
                />
              </Field>
              <Button disabled={disabled || !newLabel.trim()} type="submit">
                <PlusIcon data-icon="inline-start" />
                Add attribute
              </Button>
            </form>
            {attributes.length ? (
              <div className="flex flex-col gap-2">
                {attributes.map((attribute) => (
                  <AttributeEditorRow
                    assignedSectionCount={sectionCounts[attribute.id] ?? 0}
                    attribute={attribute}
                    disabled={disabled}
                    key={`${attribute.id}:${attribute.label}`}
                    onDelete={() => setDeleteTarget(attribute)}
                    onLabelChange={(label) => void onLabelChange(attribute, label)}
                    onVisibilityChange={(visible) => void onVisibilityChange(attribute, visible)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Add your first attribute to create a timeline row in every song.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.label ?? "attribute"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the attribute and all of its assigned timeline sections from every song. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled}
              onClick={() => {
                if (!deleteTarget) return;
                const target = deleteTarget;
                setDeleteTarget(null);
                void onDelete(target);
              }}
            >
              Delete attribute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SongTimingClient() {
  const admin = useAdmin();
  const [workspace, setWorkspace] = useState<SongTimingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSongs, setOpenSongs] = useState<string[]>([]);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Song | null>(null);
  const [uploadingSongId, setUploadingSongId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingSaves, setPendingSaves] = useState(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      setWorkspace(await loadSongTimingWorkspace());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load song timing.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    loadSongTimingWorkspace()
      .then((nextWorkspace) => {
        if (active) setWorkspace(nextWorkspace);
      })
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : "Could not load song timing.";
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const runSave = useCallback(
    async (operation: () => Promise<void>, reloadOnError = true) => {
      setPendingSaves((count) => count + 1);
      try {
        await operation();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "The change could not be saved.";
        toast.error(message);
        if (reloadOnError) await loadWorkspace(false);
      } finally {
        setPendingSaves((count) => Math.max(0, count - 1));
      }
    },
    [loadWorkspace],
  );

  const visibleAttributes = useMemo(
    () => workspace?.attributes.filter((attribute) => attribute.visible) ?? [],
    [workspace?.attributes],
  );

  const totals = useMemo(() => {
    if (!workspace) return [];
    return visibleAttributes.map((attribute, attributeIndex) => {
      let sections = 0;
      let seconds = 0;
      workspace.songs.forEach((song) => {
        const segments = workspace.assignments[song.id]?.[attribute.id] ?? [];
        sections += completedSegments(segments).length;
        seconds += secondsForSegments(segments, song.timingDurationSeconds);
      });
      return { attribute, attributeIndex, sections, seconds };
    });
  }, [visibleAttributes, workspace]);

  function setSongSegments(songId: string, attributeId: string, segments: TimingSegment[]) {
    setWorkspace((current) => {
      if (!current) return current;
      const songAssignments = { ...(current.assignments[songId] ?? {}) };
      if (segments.length) songAssignments[attributeId] = segments;
      else delete songAssignments[attributeId];
      const assignments = { ...current.assignments };
      if (Object.keys(songAssignments).length) assignments[songId] = songAssignments;
      else delete assignments[songId];
      return { ...current, assignments };
    });
  }

  function commitSongSegments(songId: string, attributeId: string, segments: TimingSegment[]) {
    void runSave(() => saveSongTimingSegments(songId, attributeId, segments));
  }

  function changeDuration(songId: string, durationSeconds: number) {
    const normalizedDuration = Math.round(durationSeconds);
    setWorkspace((current) => current ? {
      ...current,
      songs: current.songs.map((song) =>
        song.id === songId ? { ...song, timingDurationSeconds: normalizedDuration } : song,
      ),
    } : current);
    void runSave(() => saveSongTimingDuration(songId, normalizedDuration));
  }

  function detectDuration(songId: string, durationSeconds: number) {
    const normalizedDuration = Math.round(durationSeconds);
    setWorkspace((current) => current ? {
      ...current,
      songs: current.songs.map((song) =>
        song.id === songId ? { ...song, timingDurationSeconds: normalizedDuration } : song,
      ),
    } : current);
    if (admin.isAdmin) {
      void runSave(() => saveSongTimingDuration(songId, normalizedDuration), false);
    }
  }

  function chooseOriginalRecording(song: Song) {
    setUploadTarget(song);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
      uploadInputRef.current.click();
    }
  }

  async function uploadOriginalRecording(file: File) {
    const song = uploadTarget;
    if (!song) return;

    const replacing = Boolean(song.originalRecording);
    setUploadingSongId(song.id);
    setUploadProgress(0);

    try {
      const originalRecording = await uploadSongOriginalRecording(song, file, {
        onProgress: ({ bytesTransferred, totalBytes }) => {
          setUploadProgress(
            totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0,
          );
        },
      });

      setWorkspace((current) => current ? {
        ...current,
        songs: current.songs.map((item) =>
          item.id === song.id ? { ...item, originalRecording } : item,
        ),
      } : current);
      toast.success(
        `${replacing ? "Original recording replaced" : "Original recording uploaded"} for ${song.title}.`,
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? `Original recording was not uploaded: ${caught.message}`
          : "Original recording was not uploaded.",
      );
    } finally {
      setUploadingSongId(null);
      setUploadProgress(0);
      setUploadTarget(null);
    }
  }

  async function createAttribute(label: string) {
    if (!workspace) return;
    if (workspace.attributes.some((attribute) => attribute.label.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      toast.error(`${label} already exists.`);
      return;
    }
    await runSave(async () => {
      const attribute = await createTimingAttribute(label, workspace.attributes.length);
      setWorkspace((current) => current ? {
        ...current,
        attributes: [...current.attributes, attribute],
      } : current);
      toast.success(`${attribute.label} added to every song.`);
    });
  }

  async function changeAttributeLabel(attribute: TimingAttribute, label: string) {
    await runSave(async () => {
      await updateTimingAttribute(attribute.id, { label });
      setWorkspace((current) => current ? {
        ...current,
        attributes: current.attributes.map((item) =>
          item.id === attribute.id ? { ...item, label } : item,
        ),
      } : current);
    });
  }

  async function changeAttributeVisibility(attribute: TimingAttribute, visible: boolean) {
    setWorkspace((current) => current ? {
      ...current,
      attributes: current.attributes.map((item) =>
        item.id === attribute.id ? { ...item, visible } : item,
      ),
    } : current);
    await runSave(() => updateTimingAttribute(attribute.id, { visible }));
  }

  async function removeAttribute(attribute: TimingAttribute) {
    if (!workspace) return;
    await runSave(async () => {
      await deleteTimingAttribute(attribute.id, workspace.songs.map((song) => song.id));
      setWorkspace((current) => {
        if (!current) return current;
        const assignments = Object.fromEntries(
          Object.entries(current.assignments).map(([songId, songAssignments]) => {
            const nextAssignments = { ...songAssignments };
            delete nextAssignments[attribute.id];
            return [songId, nextAssignments];
          }),
        );
        return {
          ...current,
          attributes: current.attributes.filter((item) => item.id !== attribute.id),
          assignments,
        };
      });
      toast.success(`${attribute.label} deleted.`);
    });
  }

  const grandSections = totals.reduce((sum, total) => sum + total.sections, 0);
  const grandSeconds = totals.reduce((sum, total) => sum + total.seconds, 0);
  const controlsDisabled = !admin.isAdmin;

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="swell-page-kicker">Song analysis</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Timing totals</h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              Mark any attribute across each song, then compare its cumulative time across the full library.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {loading ? "Loading" : `${workspace?.songs.length ?? 0} songs`}
            </Badge>
            {pendingSaves ? (
              <Badge variant="outline">
                <LoaderCircleIcon aria-hidden className="animate-spin" />
                Saving
              </Badge>
            ) : admin.isAdmin ? (
              <Badge variant="outline">Saved</Badge>
            ) : (
              <Badge variant="outline">Read only</Badge>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !workspace?.songs.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock3Icon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No songs to time</EmptyTitle>
            <EmptyDescription>Add songs to the library, then return here to assign sections.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Accordion multiple onValueChange={setOpenSongs} value={openSongs}>
            {workspace.songs.map((song) => {
              const assignments = workspace.assignments[song.id] ?? {};
              return (
                <AccordionItem key={song.id} value={song.id}>
                  <AccordionTrigger className="px-4 py-4 sm:px-5">
                    <span className="grid min-w-0 flex-1 gap-2 pr-2 sm:grid-cols-[minmax(11rem,0.7fr)_minmax(0,1.3fr)] sm:items-center sm:gap-5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-base font-semibold" title={song.title}>{song.title}</span>
                        <span className="shrink-0 font-mono text-xs font-normal tabular-nums text-muted-foreground">
                          {formatClock(song.timingDurationSeconds)}
                        </span>
                      </span>
                      <SongSummary
                        assignments={assignments}
                        attributes={visibleAttributes}
                        durationSeconds={song.timingDurationSeconds}
                      />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 sm:px-5 sm:pb-5">
                    <SongTimingEditor
                      active={activeSongId === song.id}
                      assignments={assignments}
                      attributes={visibleAttributes}
                      canUpload={admin.isAdmin}
                      disabled={controlsDisabled}
                      key={`${song.id}:${song.timingDurationSeconds ?? 0}:${song.originalRecording?.downloadUrl ?? "none"}`}
                      onActivate={() => setActiveSongId(song.id)}
                      onDurationChange={(durationSeconds) => changeDuration(song.id, durationSeconds)}
                      onDurationDetected={(durationSeconds) => detectDuration(song.id, durationSeconds)}
                      onSegmentsChange={(attributeId, segments) => setSongSegments(song.id, attributeId, segments)}
                      onSegmentsCommit={(attributeId, segments) => commitSongSegments(song.id, attributeId, segments)}
                      onUpload={() => chooseOriginalRecording(song)}
                      song={song}
                      uploading={uploadingSongId === song.id}
                      uploadProgress={uploadProgress}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <section className="swell-panel overflow-hidden" aria-labelledby="timing-totals-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-1">
                <p className="swell-page-kicker">Across all songs</p>
                <h2 className="text-lg font-semibold" id="timing-totals-heading">Cumulative totals</h2>
              </div>
              <p className="w-full text-sm font-semibold tabular-nums sm:w-auto">
                {sectionLabel(grandSections)}, {formatSeconds(grandSeconds)} total
              </p>
            </div>
            {totals.length ? (
              <div className="divide-y">
                {totals.map((total) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-5" key={total.attribute.id}>
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", colorForAttribute(total.attributeIndex).dot)} />
                      <span className="truncate">{total.attribute.label}</span>
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {sectionLabel(total.sections)}, <strong className="font-semibold text-foreground">{formatSeconds(total.seconds)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
                No attributes are visible. Open Manage attributes below to add or show one.
              </p>
            )}
          </section>

          <AttributeManager
            assignments={workspace.assignments}
            attributes={workspace.attributes}
            disabled={controlsDisabled}
            onCreate={createAttribute}
            onDelete={removeAttribute}
            onLabelChange={changeAttributeLabel}
            onVisibilityChange={changeAttributeVisibility}
          />
        </>
      )}

      <input
        accept=".mp3,audio/mpeg"
        aria-label="Choose original recording MP3"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadOriginalRecording(file);
        }}
        ref={uploadInputRef}
        type="file"
      />
    </AppShell>
  );
}
