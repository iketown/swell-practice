"use client";

import {
  LoaderCircleIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WAVE_HEIGHT = 104;
const ANNOTATION_HEIGHT = 36;
const MIN_SELECTION_SECONDS = 0.001;
const MAX_CANVAS_TILE_WIDTH = 8192;
const ZOOM_LEVELS = [24, 40, 64, 96, 144, 216, 320, 480] as const;

export type WaveformWord = {
  id: string;
  text: string;
  start: number;
  end: number;
};

type DragState = {
  edge: "start" | "end";
  pointerId: number;
  start: number;
  end: number;
};

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function LyricTimingWaveform({
  audioUrl,
  currentTime,
  duration,
  words,
  selectedId,
  selectedLabel,
  selectedStart,
  selectedEnd,
  onSeek,
  onSelectWord,
  onSelectionChange,
  onSelectionCommit,
  onAudition,
}: {
  audioUrl: string;
  currentTime: number;
  duration: number;
  words: WaveformWord[];
  selectedId: string | null;
  selectedLabel: string | null;
  selectedStart: number | null;
  selectedEnd: number | null;
  onSeek: (time: number) => void;
  onSelectWord: (wordId: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  onSelectionCommit: () => void;
  onAudition: (start: number, end: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const dragRef = useRef<DragState | null>(null);
  const latestSelectionRef = useRef({
    start: selectedStart ?? 0,
    end: selectedEnd ?? 0,
  });

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformError, setWaveformError] = useState("");
  const [zoomIndex, setZoomIndex] = useState(2);
  const pixelsPerSecond = ZOOM_LEVELS[zoomIndex];
  const safeDuration = Math.max(duration, audioBuffer?.duration ?? 0, 1);
  const timelineWidth = Math.ceil(safeDuration * pixelsPerSecond);
  const canvasTiles = useMemo(
    () =>
      Array.from(
        { length: Math.ceil(timelineWidth / MAX_CANVAS_TILE_WIDTH) },
        (_, index) => {
          const startPixel = index * MAX_CANVAS_TILE_WIDTH;
          return {
            index,
            startPixel,
            width: Math.min(
              MAX_CANVAS_TILE_WIDTH,
              timelineWidth - startPixel,
            ),
          };
        },
      ),
    [timelineWidth],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const audioContext = new AudioContext();
    let audioContextClosing = false;
    const closeAudioContext = () => {
      if (
        audioContextClosing ||
        audioContext.state === "closed"
      ) {
        return;
      }
      audioContextClosing = true;
      void audioContext.close().catch(() => undefined);
    };

    fetch(audioUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Waveform request failed with ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer))
      .then((decoded) => {
        if (active) setAudioBuffer(decoded);
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setWaveformError(
          error instanceof Error ? error.message : "Could not draw waveform.",
        );
      })
      .finally(() => {
        closeAudioContext();
      });

    return () => {
      active = false;
      controller.abort();
      closeAudioContext();
    };
  }, [audioUrl]);

  useLayoutEffect(() => {
    latestSelectionRef.current = {
      start: selectedStart ?? 0,
      end: selectedEnd ?? 0,
    };
  }, [selectedEnd, selectedStart]);

  useEffect(() => {
    const firstCanvas = canvasRefs.current[0];
    if (!firstCanvas || !audioBuffer) return;

    const styles = window.getComputedStyle(firstCanvas);
    const waveColor =
      styles.getPropertyValue("--muted-foreground").trim() || "#6f6257";
    const borderColor = styles.getPropertyValue("--border").trim() || "#e3d6c2";
    const channelData = Array.from(
      { length: audioBuffer.numberOfChannels },
      (_, channel) => audioBuffer.getChannelData(channel),
    );
    const center = WAVE_HEIGHT / 2;
    const amplitude = WAVE_HEIGHT * 0.44;
    const samplesPerPixel = audioBuffer.length / timelineWidth;

    canvasTiles.forEach((tile) => {
      const canvas = canvasRefs.current[tile.index];
      if (!canvas) return;
      canvas.width = tile.width;
      canvas.height = WAVE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, tile.width, WAVE_HEIGHT);
      context.fillStyle = borderColor;
      context.fillRect(0, Math.floor(center), tile.width, 1);
      context.fillStyle = waveColor;
      context.globalAlpha = 0.82;

      for (let pixel = 0; pixel < tile.width; pixel += 1) {
        const globalPixel = tile.startPixel + pixel;
        const sampleStart = Math.floor(globalPixel * samplesPerPixel);
        const sampleEnd = Math.min(
          audioBuffer.length,
          Math.max(
            sampleStart + 1,
            Math.floor((globalPixel + 1) * samplesPerPixel),
          ),
        );
        let minimum = 1;
        let maximum = -1;

        for (const channel of channelData) {
          for (let sample = sampleStart; sample < sampleEnd; sample += 1) {
            const value = channel[sample];
            if (value < minimum) minimum = value;
            if (value > maximum) maximum = value;
          }
        }

        const top = center + minimum * amplitude;
        const height = Math.max(1, (maximum - minimum) * amplitude);
        context.fillRect(pixel, top, 1, height);
      }
    });
  }, [audioBuffer, canvasTiles, timelineWidth]);

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || selectedId === null) return;
    const selection = latestSelectionRef.current;
    const centerPixel =
      ((selection.start + selection.end) / 2) * pixelsPerSecond;
    const maximumScroll = Math.max(
      0,
      scrollContainer.scrollWidth - scrollContainer.clientWidth,
    );
    scrollContainer.scrollLeft = clamp(
      centerPixel - scrollContainer.clientWidth / 2,
      0,
      maximumScroll,
    );

    // Boundary movement intentionally is not a dependency. Re-centering while
    // a handle moves creates a feedback loop that accelerates the drag.
  }, [audioUrl, pixelsPerSecond, selectedId, selectedLabel]);

  const selectedWidth =
    selectedStart !== null && selectedEnd !== null
      ? Math.max(2, (selectedEnd - selectedStart) * pixelsPerSecond)
      : 0;

  const secondMarkers = useMemo(() => {
    const interval =
      pixelsPerSecond >= 320
        ? 0.25
        : pixelsPerSecond >= 144
          ? 0.5
          : pixelsPerSecond >= 96
            ? 1
            : pixelsPerSecond >= 40
              ? 5
              : 10;
    const markers: number[] = [];
    for (let time = 0; time <= safeDuration; time += interval) {
      markers.push(time);
    }
    return markers;
  }, [pixelsPerSecond, safeDuration]);

  function pointerTime(event: { clientX: number }) {
    const timeline = timelineRef.current;
    if (!timeline) return 0;
    const bounds = timeline.getBoundingClientRect();
    return clamp(
      (event.clientX - bounds.left) / pixelsPerSecond,
      0,
      safeDuration,
    );
  }

  function startBoundaryDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: "start" | "end",
  ) {
    if (selectedStart === null || selectedEnd === null) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      edge,
      pointerId: event.pointerId,
      start: selectedStart,
      end: selectedEnd,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveBoundary(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();

    const requested = pointerTime(event);
    const next =
      drag.edge === "start"
        ? {
            start: clamp(
              requested,
              0,
              drag.end - MIN_SELECTION_SECONDS,
            ),
            end: drag.end,
          }
        : {
            start: drag.start,
            end: clamp(
              requested,
              drag.start + MIN_SELECTION_SECONDS,
              safeDuration,
            ),
          };

    latestSelectionRef.current = next;
    onSelectionChange(next.start, next.end);
  }

  function finishBoundaryDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const selection = latestSelectionRef.current;
    if (
      selection.start !== drag.start ||
      selection.end !== drag.end
    ) {
      onSelectionCommit();
    }
    onAudition(selection.start, selection.end);
  }

  function adjustBoundaryWithKeyboard(
    event: React.KeyboardEvent<HTMLButtonElement>,
    edge: "start" | "end",
  ) {
    if (
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
      selectedStart === null ||
      selectedEnd === null
    ) {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -0.01 : 0.01;
    const next =
      edge === "start"
        ? {
            start: clamp(
              selectedStart + delta,
              0,
              selectedEnd - MIN_SELECTION_SECONDS,
            ),
            end: selectedEnd,
          }
        : {
            start: selectedStart,
            end: clamp(
              selectedEnd + delta,
              selectedStart + MIN_SELECTION_SECONDS,
              safeDuration,
            ),
    };
    onSelectionChange(next.start, next.end);
    if (
      next.start !== selectedStart ||
      next.end !== selectedEnd
    ) {
      onSelectionCommit();
    }
    onAudition(next.start, next.end);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {selectedLabel ? `Selected: ${selectedLabel}` : "Select a word"}
          </Badge>
          {selectedStart !== null && selectedEnd !== null ? (
            <span className="font-mono text-xs text-muted-foreground">
              {formatSeconds(selectedStart)} to {formatSeconds(selectedEnd)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Zoom waveform out"
            disabled={zoomIndex === 0}
            onClick={() =>
              setZoomIndex((current) => Math.max(0, current - 1))
            }
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ZoomOutIcon />
          </Button>
          <span className="w-20 text-center text-xs font-medium text-muted-foreground">
            {pixelsPerSecond}px/s
          </span>
          <Button
            aria-label="Zoom waveform in"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() =>
              setZoomIndex((current) =>
                Math.min(ZOOM_LEVELS.length - 1, current + 1),
              )
            }
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ZoomInIcon />
          </Button>
        </div>
      </div>

      <div
        aria-label="Scrollable lyric waveform"
        className="overflow-x-auto rounded-lg border bg-card"
        ref={scrollRef}
      >
        <div
          className="relative min-w-full select-none"
          ref={timelineRef}
          style={{
            height: ANNOTATION_HEIGHT + WAVE_HEIGHT + 24,
            width: timelineWidth,
          }}
        >
          <div
            aria-label="Word annotations"
            className="absolute inset-x-0 top-0 h-9 border-b bg-secondary/60"
          >
            {words.map((word) => {
              const width = Math.max(
                2,
                (word.end - word.start) * pixelsPerSecond,
              );
              return (
                <button
                  aria-label={`Play ${word.text}, ${formatSeconds(word.start)} to ${formatSeconds(word.end)}`}
                  className={cn(
                    "absolute top-1 h-7 truncate rounded-sm border px-1 text-left text-[11px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                    selectedId === word.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  key={word.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectWord(word.id);
                  }}
                  style={{
                    left: word.start * pixelsPerSecond,
                    width,
                  }}
                  title={`${word.text}: ${formatSeconds(word.start)} to ${formatSeconds(word.end)}`}
                  type="button"
                >
                  {width >= 20 ? word.text : ""}
                </button>
              );
            })}
          </div>

          <button
            aria-label={`Seek waveform to ${formatSeconds(currentTime)}`}
            className="absolute inset-x-0 top-9 cursor-crosshair border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-primary"
            onClick={(event) => onSeek(pointerTime(event))}
            style={{ height: WAVE_HEIGHT }}
            type="button"
          >
            <span className="flex h-[104px]" aria-hidden>
              {canvasTiles.map((tile) => (
                <canvas
                  className="block shrink-0"
                  height={WAVE_HEIGHT}
                  key={tile.startPixel}
                  ref={(node) => {
                    canvasRefs.current[tile.index] = node;
                  }}
                  width={tile.width}
                />
              ))}
            </span>
          </button>

          {selectedStart !== null && selectedEnd !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute top-9 border-x-2 border-primary bg-primary/15"
              style={{
                height: WAVE_HEIGHT,
                left: selectedStart * pixelsPerSecond,
                width: selectedWidth,
              }}
            />
          ) : null}

          {selectedStart !== null && selectedEnd !== null ? (
            <>
              <button
                aria-label={`Adjust start of ${selectedLabel ?? "selection"}`}
                aria-valuemax={selectedEnd}
                aria-valuemin={0}
                aria-valuenow={selectedStart}
                className="absolute top-9 z-10 h-[104px] w-3 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-primary"
                onKeyDown={(event) =>
                  adjustBoundaryWithKeyboard(event, "start")
                }
                onPointerCancel={finishBoundaryDrag}
                onPointerDown={(event) => startBoundaryDrag(event, "start")}
                onPointerMove={moveBoundary}
                onPointerUp={finishBoundaryDrag}
                role="slider"
                style={{ left: selectedStart * pixelsPerSecond }}
                type="button"
              >
                <span className="mx-auto block h-full w-1 bg-primary" />
              </button>
              <button
                aria-label={`Adjust end of ${selectedLabel ?? "selection"}`}
                aria-valuemax={safeDuration}
                aria-valuemin={selectedStart}
                aria-valuenow={selectedEnd}
                className="absolute top-9 z-10 h-[104px] w-3 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-primary"
                onKeyDown={(event) =>
                  adjustBoundaryWithKeyboard(event, "end")
                }
                onPointerCancel={finishBoundaryDrag}
                onPointerDown={(event) => startBoundaryDrag(event, "end")}
                onPointerMove={moveBoundary}
                onPointerUp={finishBoundaryDrag}
                role="slider"
                style={{ left: selectedEnd * pixelsPerSecond }}
                type="button"
              >
                <span className="mx-auto block h-full w-1 bg-primary" />
              </button>
            </>
          ) : null}

          <div
            aria-hidden
            className="pointer-events-none absolute top-9 z-20 w-0.5 bg-destructive"
            style={{
              height: WAVE_HEIGHT,
              transform: `translateX(${currentTime * pixelsPerSecond}px)`,
            }}
          />

          <div className="absolute inset-x-0 bottom-0 h-6 border-t bg-muted/45">
            {secondMarkers.map((time) => (
              <span
                className="absolute top-0 border-l pl-1 font-mono text-[10px] leading-6 text-muted-foreground"
                key={time}
                style={{ left: time * pixelsPerSecond }}
              >
                {formatSeconds(time)}
              </span>
            ))}
          </div>

          {!audioBuffer && !waveformError ? (
            <div className="absolute inset-x-0 top-9 flex h-[104px] items-center justify-center bg-card/85">
              <Badge variant="secondary">
                <LoaderCircleIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
                Drawing waveform
              </Badge>
            </div>
          ) : null}
        </div>
      </div>

      {waveformError ? (
        <p className="text-sm text-destructive">{waveformError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Click a word annotation to audition it. Drag a blue boundary into a
          neighboring word to move their shared edge and prevent an overlap.
        </p>
      )}
    </div>
  );
}
