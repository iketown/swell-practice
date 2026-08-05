"use client";

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SaveIcon,
  ScissorsIcon,
  SkipBackIcon,
  TimerResetIcon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppShell } from "@/components/app-shell";
import { LyricTimingWaveform } from "@/components/lyric-timing-waveform";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import {
  deleteLyricAlignmentAudio,
  getLyricAlignmentWorkspace,
  replaceLyricAlignmentResult,
  saveLyricAlignmentDraft,
  saveLyricAlignmentResult,
  setLyricAlignmentStatus,
  uploadLyricAlignmentAudio,
} from "@/lib/firestore";
import {
  createStoredLyricAlignment,
  editorWordWasAdjusted,
  isElevenLabsAlignment,
  lyricAlignmentFingerprint,
  parseLyricAlignment,
  roundTiming,
  type EditorLine,
  type EditorWord,
  type ElevenLabsAlignment,
  type LyricAlignmentAudio,
  type LyricAlignmentWorkspace,
  type StoredLyricAlignment,
  type SyllableTiming,
} from "@/lib/lyric-alignment";
import { cn } from "@/lib/utils";

const REVIEW_LOSS = 1;
const LONG_WORD_SECONDS = 1;
const NUDGE_SECONDS = 0.05;
const MIN_TIMING_SECONDS = 0.001;
const AUTOSAVE_ADJUSTMENTS = 10;
const AUTOSAVE_INTERVAL_MS = 60_000;

type TimingFilter = "all" | "review" | "long";
type SaveStatus = "saved" | "dirty" | "saving" | "error";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00.00";
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function unitIsActive(start: number, end: number, currentTime: number) {
  return currentTime >= start && currentTime < end;
}

function wordNeedsReview(word: EditorWord) {
  return (
    word.loss >= REVIEW_LOSS ||
    word.end - word.start >= LONG_WORD_SECONDS
  );
}

function boundaryValues(
  unit: { start: number; end: number },
  boundary: "start" | "end",
  effectiveValue: number,
  globalOffset: number,
) {
  const sourceValue = effectiveValue - globalOffset;
  if (boundary === "start") {
    return {
      start: roundTiming(
        Math.max(
          -globalOffset,
          Math.min(sourceValue, unit.end - MIN_TIMING_SECONDS),
        ),
      ),
      end: unit.end,
    };
  }
  return {
    start: unit.start,
    end: roundTiming(
      Math.max(unit.start + MIN_TIMING_SECONDS, sourceValue),
    ),
  };
}

function resizeEditorWord(
  word: EditorWord,
  timing: { start: number; end: number },
) {
  const next = {
    start: roundTiming(timing.start),
    end: roundTiming(timing.end),
  };
  const scale =
    word.end > word.start
      ? (next.end - next.start) / (word.end - word.start)
      : 1;

  return {
    ...word,
    ...next,
    syllables: word.syllables?.map((syllable) => ({
      ...syllable,
      start: roundTiming(
        next.start + (syllable.start - word.start) * scale,
      ),
      end: roundTiming(
        next.start + (syllable.end - word.start) * scale,
      ),
    })),
  };
}

function lyricTokenClass({
  active,
  adjusted,
  needsReview,
  past,
  selected,
}: {
  active: boolean;
  adjusted: boolean;
  needsReview: boolean;
  past: boolean;
  selected: boolean;
}) {
  return cn(
    "rounded-md border px-1.5 py-0.5 text-left font-medium transition-[background-color,color,border-color,box-shadow,outline-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    active && "border-primary bg-primary text-primary-foreground shadow-sm",
    !active && past && "border-transparent bg-primary/10 text-primary",
    !active &&
      !past &&
      !needsReview &&
      "border-transparent text-foreground hover:bg-muted",
    !active &&
      !past &&
      needsReview &&
      "border-destructive/35 bg-destructive/8 text-foreground hover:bg-destructive/15",
    adjusted &&
      "outline outline-1 outline-offset-1 outline-primary/65",
    selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
  );
}

function statusCopy(
  status: SaveStatus,
  adjustmentCount: number,
) {
  if (status === "saving") return "Saving";
  if (status === "error") return "Save failed";
  if (status === "dirty") {
    return `${adjustmentCount} of ${AUTOSAVE_ADJUSTMENTS} adjustments`;
  }
  return "Saved";
}

export function LyricAlignmentEditor({
  songSlug,
}: {
  songSlug: string;
}) {
  const admin = useAdmin();
  const audioRef = useRef<HTMLAudioElement>(null);
  const replacementInputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewUntilRef = useRef<number | null>(null);
  const savedFingerprintRef = useRef("");
  const draftRef = useRef<StoredLyricAlignment>({
    version: 1,
    lines: [],
    globalOffset: 0,
  });
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const adjustmentCountRef = useRef(0);
  const boundaryInputChangedRef = useRef(false);
  const offsetInputChangedRef = useRef(false);

  const [workspace, setWorkspace] =
    useState<LyricAlignmentWorkspace | null>(null);
  const [originalLines, setOriginalLines] = useState<EditorLine[]>([]);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [globalOffset, setGlobalOffset] = useState(0);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selectedSyllableId, setSelectedSyllableId] = useState<string | null>(
    null,
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState<TimingFilter>("all");
  const [syllableDraft, setSyllableDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [aligning, setAligning] = useState(false);
  const [alignmentError, setAlignmentError] = useState("");
  const [editorReady, setEditorReady] = useState(false);
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [saveError, setSaveError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacingAudio, setReplacingAudio] = useState(false);
  const [replacementStatus, setReplacementStatus] = useState("");
  const [replacementError, setReplacementError] = useState("");

  const hydrateWorkspace = useCallback(
    (nextWorkspace: LyricAlignmentWorkspace) => {
      previewUntilRef.current = null;
      audioRef.current?.pause();
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
      setWorkspace(nextWorkspace);
      setAlignmentError(nextWorkspace.song.errorMessage ?? "");

      if (!nextWorkspace.original) {
        setOriginalLines([]);
        setLines([]);
        setGlobalOffset(0);
        setSelectedWordId(null);
        setEditorReady(false);
        return;
      }

      const sourceLines = parseLyricAlignment(
        nextWorkspace.original,
        nextWorkspace.song.lyrics,
      );
      const current =
        nextWorkspace.current ??
        createStoredLyricAlignment(
          nextWorkspace.original,
          nextWorkspace.song.lyrics,
        );

      setOriginalLines(sourceLines);
      setLines(structuredClone(current.lines));
      setGlobalOffset(roundTiming(current.globalOffset));
      setSelectedWordId(
        current.lines[0]?.words[0]?.id ??
          sourceLines[0]?.words[0]?.id ??
          null,
      );
      setSelectedSyllableId(null);
      setSyllableDraft("");
      const fingerprint = lyricAlignmentFingerprint(current);
      savedFingerprintRef.current = fingerprint;
      setSavedFingerprint(fingerprint);
      adjustmentCountRef.current = 0;
      setAdjustmentCount(0);
      setSaveStatus("saved");
      setSaveError("");
      setEditorReady(true);
    },
    [],
  );

  useEffect(() => {
    if (admin.loading || !admin.isAdmin) return;
    let active = true;

    getLyricAlignmentWorkspace(songSlug)
      .then((nextWorkspace) => {
        if (!active) return;
        if (!nextWorkspace) {
          setLoadError("This lyric alignment project does not exist.");
          return;
        }
        hydrateWorkspace(nextWorkspace);
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(
          caught instanceof Error
            ? caught.message
            : "Could not load this lyric project.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [admin.isAdmin, admin.loading, hydrateWorkspace, songSlug]);

  useEffect(() => {
    if (!playing) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const syncPlayhead = () => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime);

      if (
        previewUntilRef.current !== null &&
        audio.currentTime >= previewUntilRef.current
      ) {
        previewUntilRef.current = null;
        audio.pause();
        return;
      }

      animationFrameRef.current =
        window.requestAnimationFrame(syncPlayhead);
    };

    animationFrameRef.current =
      window.requestAnimationFrame(syncPlayhead);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playing]);

  const currentDraft = useMemo<StoredLyricAlignment>(
    () => ({
      version: 1,
      lines,
      globalOffset,
    }),
    [globalOffset, lines],
  );
  const currentFingerprint = useMemo(
    () => lyricAlignmentFingerprint(currentDraft),
    [currentDraft],
  );
  const dirty =
    editorReady &&
    currentFingerprint !== savedFingerprint;
  const displayedSaveStatus: SaveStatus =
    saveStatus === "saving" || saveStatus === "error"
      ? saveStatus
      : dirty
        ? "dirty"
        : "saved";

  useEffect(() => {
    draftRef.current = currentDraft;
    dirtyRef.current = dirty;
  }, [currentDraft, dirty]);

  const saveCurrent = useCallback(async () => {
    if (!editorReady || savingRef.current) return;
    const draft = draftRef.current;
    const fingerprint = lyricAlignmentFingerprint(draft);
    if (fingerprint === savedFingerprintRef.current) return;

    savingRef.current = true;
    const capturedAdjustments = adjustmentCountRef.current;
    setSaveStatus("saving");
    setSaveError("");

    try {
      await saveLyricAlignmentDraft(songSlug, draft);
      savedFingerprintRef.current = fingerprint;
      setSavedFingerprint(fingerprint);
      adjustmentCountRef.current = Math.max(
        0,
        adjustmentCountRef.current - capturedAdjustments,
      );
      setAdjustmentCount(adjustmentCountRef.current);
      setSaveStatus("saved");
    } catch (caught) {
      setSaveStatus("error");
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Could not save the timing changes.",
      );
    } finally {
      savingRef.current = false;
    }
  }, [editorReady, songSlug]);

  useEffect(() => {
    if (
      editorReady &&
      dirty &&
      adjustmentCount >= AUTOSAVE_ADJUSTMENTS
    ) {
      void saveCurrent();
    }
  }, [adjustmentCount, dirty, editorReady, saveCurrent]);

  useEffect(() => {
    if (!editorReady) return;
    const interval = window.setInterval(() => {
      if (dirtyRef.current) void saveCurrent();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [editorReady, saveCurrent]);

  const allWords = useMemo(
    () => lines.flatMap((line) => line.words),
    [lines],
  );
  const selectedWord = useMemo(
    () => allWords.find((word) => word.id === selectedWordId) ?? null,
    [allWords, selectedWordId],
  );
  const selectedSyllable =
    selectedWord?.syllables?.find(
      (syllable) => syllable.id === selectedSyllableId,
    ) ?? null;
  const selectedUnit = selectedSyllable ?? selectedWord;
  const selectedEffectiveStart = selectedUnit
    ? selectedUnit.start + globalOffset
    : null;
  const selectedEffectiveEnd = selectedUnit
    ? selectedUnit.end + globalOffset
    : null;
  const selectedWordIndex = selectedWord
    ? allWords.findIndex((word) => word.id === selectedWord.id)
    : -1;

  const originalWordById = useMemo(
    () =>
      new Map(
        originalLines
          .flatMap((line) => line.words)
          .map((word) => [word.id, word]),
      ),
    [originalLines],
  );
  const adjustedWordIds = useMemo(
    () =>
      new Set(
        allWords.flatMap((word) =>
          editorWordWasAdjusted(word, originalWordById.get(word.id))
            ? [word.id]
            : [],
        ),
      ),
    [allWords, originalWordById],
  );
  const adjustedWordCount = adjustedWordIds.size;

  const waveformWords = useMemo(
    () =>
      allWords.map((word) => ({
        id: word.id,
        text: word.text,
        start: word.start + globalOffset,
        end: word.end + globalOffset,
      })),
    [allWords, globalOffset],
  );

  const workingLine =
    lines.find((line) =>
      line.words.some((word) => word.id === selectedWordId),
    ) ?? lines[0];
  const playbackLine = useMemo(() => {
    let latestLine: EditorLine | undefined;

    for (const line of lines) {
      const firstWord = line.words[0];
      if (!firstWord) continue;
      if (currentTime < firstWord.start + globalOffset) break;
      latestLine = line;
    }

    return latestLine;
  }, [currentTime, globalOffset, lines]);
  const currentLine = playbackLine ?? workingLine;
  const workingLineIndex = workingLine
    ? lines.findIndex((line) => line.id === workingLine.id)
    : -1;

  const reviewCount = allWords.filter(wordNeedsReview).length;
  const highLossCount = allWords.filter(
    (word) => word.loss >= REVIEW_LOSS,
  ).length;
  const longWordCount = allWords.filter(
    (word) => word.end - word.start >= LONG_WORD_SECONDS,
  ).length;
  const visibleLines =
    filter === "all"
      ? lines
      : lines.filter(
          (line) =>
            line.id === workingLine?.id ||
            (filter === "review"
              ? line.words.some(wordNeedsReview)
              : line.words.some(
                  (word) =>
                    word.end - word.start >= LONG_WORD_SECONDS,
                )),
        );

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(
      0,
      Math.min(time, audio.duration || time),
    );
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const auditionRange = useCallback(
    (start: number, end: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const safeStart = Math.max(0, start);
      const safeEnd = Math.max(safeStart + 0.001, end);
      previewUntilRef.current = safeEnd;
      seekTo(safeStart);
      void audio.play().catch(() => {
        previewUntilRef.current = null;
      });
    },
    [seekTo],
  );

  function markAdjustment() {
    adjustmentCountRef.current += 1;
    setAdjustmentCount(adjustmentCountRef.current);
  }

  function selectWord(word: EditorWord, audition = true) {
    setSelectedWordId(word.id);
    setSelectedSyllableId(null);
    setSyllableDraft(
      word.syllables?.map((syllable) => syllable.text).join("|") ?? "",
    );
    boundaryInputChangedRef.current = false;
    if (audition) {
      auditionRange(
        word.start + globalOffset,
        word.end + globalOffset,
      );
    } else {
      seekTo(word.start + globalOffset);
    }
  }

  function selectSyllable(
    word: EditorWord,
    syllable: SyllableTiming,
  ) {
    setSelectedWordId(word.id);
    setSelectedSyllableId(syllable.id);
    setSyllableDraft(
      word.syllables?.map((item) => item.text).join("|") ?? "",
    );
    boundaryInputChangedRef.current = false;
    auditionRange(
      syllable.start + globalOffset,
      syllable.end + globalOffset,
    );
  }

  function updateSelectedUnit(
    updater: (unit: { start: number; end: number }) => {
      start: number;
      end: number;
    },
  ) {
    if (!selectedWordId) return;

    setLines((currentLines) => {
      if (selectedSyllableId) {
        return currentLines.map((line) => ({
          ...line,
          words: line.words.map((word) => {
            if (word.id !== selectedWordId || !word.syllables) {
              return word;
            }

            return {
              ...word,
              syllables: word.syllables.map((syllable) =>
                syllable.id === selectedSyllableId
                  ? { ...syllable, ...updater(syllable) }
                  : syllable,
              ),
            };
          }),
        }));
      }

      const words = currentLines.flatMap((line) => line.words);
      const selectedIndex = words.findIndex(
        (word) => word.id === selectedWordId,
      );
      const selected = words[selectedIndex];
      if (!selected) return currentLines;

      const previous = words[selectedIndex - 1];
      const following = words[selectedIndex + 1];
      let next = updater(selected);
      const updatedWords = new Map<string, EditorWord>();

      if (
        previous &&
        next.start < selected.start &&
        next.start < previous.end
      ) {
        const earliestSharedBoundary = roundTiming(
          previous.start + MIN_TIMING_SECONDS,
        );
        const latestSharedBoundary = roundTiming(
          next.end - MIN_TIMING_SECONDS,
        );

        if (earliestSharedBoundary <= latestSharedBoundary) {
          const sharedBoundary = roundTiming(
            Math.min(
              latestSharedBoundary,
              Math.max(earliestSharedBoundary, next.start),
            ),
          );
          next = { ...next, start: sharedBoundary };
          updatedWords.set(
            previous.id,
            resizeEditorWord(previous, {
              start: previous.start,
              end: sharedBoundary,
            }),
          );
        }
      }

      if (
        following &&
        next.end > selected.end &&
        next.end > following.start
      ) {
        const earliestSharedBoundary = roundTiming(
          next.start + MIN_TIMING_SECONDS,
        );
        const latestSharedBoundary = roundTiming(
          following.end - MIN_TIMING_SECONDS,
        );

        if (earliestSharedBoundary <= latestSharedBoundary) {
          const sharedBoundary = roundTiming(
            Math.min(
              latestSharedBoundary,
              Math.max(earliestSharedBoundary, next.end),
            ),
          );
          next = { ...next, end: sharedBoundary };
          updatedWords.set(
            following.id,
            resizeEditorWord(following, {
              start: sharedBoundary,
              end: following.end,
            }),
          );
        }
      }

      updatedWords.set(selected.id, resizeEditorWord(selected, next));

      return currentLines.map((line) => ({
        ...line,
        words: line.words.map(
          (word) => updatedWords.get(word.id) ?? word,
        ),
      }));
    });
  }

  function setBoundary(boundary: "start" | "end", value: number) {
    if (!selectedUnit || !Number.isFinite(value)) return;

    updateSelectedUnit((unit) =>
      boundaryValues(unit, boundary, value, globalOffset),
    );
  }

  function commitBoundary(
    boundary: "start" | "end",
    value: number,
  ) {
    if (!selectedUnit || !Number.isFinite(value)) return;
    const next = boundaryValues(
      selectedUnit,
      boundary,
      value,
      globalOffset,
    );
    setBoundary(boundary, value);
    markAdjustment();
    auditionRange(
      next.start + globalOffset,
      next.end + globalOffset,
    );
  }

  function nudgeBoundary(
    boundary: "start" | "end",
    delta: number,
  ) {
    if (!selectedUnit) return;
    commitBoundary(
      boundary,
      selectedUnit[boundary] + globalOffset + delta,
    );
  }

  function previewSelected() {
    if (!selectedUnit) return;
    auditionRange(
      selectedUnit.start + globalOffset,
      selectedUnit.end + globalOffset,
    );
  }

  function changeGlobalOffset(value: number, audition = false) {
    if (!Number.isFinite(value)) return;
    const nextOffset = roundTiming(
      Math.max(-30, Math.min(30, value)),
    );
    if (nextOffset === globalOffset) return;
    setGlobalOffset(nextOffset);

    if (audition && selectedUnit) {
      auditionRange(
        selectedUnit.start + nextOffset,
        selectedUnit.end + nextOffset,
      );
    }
  }

  function commitGlobalOffset(value: number, audition = true) {
    if (roundTiming(value) === globalOffset) return;
    changeGlobalOffset(value, audition);
    markAdjustment();
  }

  function moveSelection(direction: -1 | 1) {
    if (!allWords.length) return;
    const nextIndex = Math.min(
      allWords.length - 1,
      Math.max(0, selectedWordIndex + direction),
    );
    selectWord(allWords[nextIndex]);
  }

  function splitIntoSyllables() {
    if (!selectedWord) return;
    const pieces = syllableDraft
      .split("|")
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length < 2) return;

    const slice =
      (selectedWord.end - selectedWord.start) / pieces.length;
    const syllables = pieces.map((text, index) => ({
      id: `${selectedWord.id}-syllable-${index}`,
      text,
      start: roundTiming(selectedWord.start + slice * index),
      end: roundTiming(
        index === pieces.length - 1
          ? selectedWord.end
          : selectedWord.start + slice * (index + 1),
      ),
    }));

    setLines((currentLines) =>
      currentLines.map((line) => ({
        ...line,
        words: line.words.map((word) =>
          word.id === selectedWord.id
            ? { ...word, syllables }
            : word,
        ),
      })),
    );
    setSelectedSyllableId(syllables[0].id);
    markAdjustment();
  }

  function mergeSyllables() {
    if (!selectedWord?.syllables?.length) return;
    setLines((currentLines) =>
      currentLines.map((line) => ({
        ...line,
        words: line.words.map((word) =>
          word.id === selectedWord.id
            ? { ...word, syllables: undefined }
            : word,
        ),
      })),
    );
    setSelectedSyllableId(null);
    setSyllableDraft("");
    markAdjustment();
  }

  function lineWasAdjusted(line: EditorLine) {
    return line.words.some((word) => adjustedWordIds.has(word.id));
  }

  function resetLine(line: EditorLine) {
    if (!lineWasAdjusted(line)) return;
    const lineIndex = lines.findIndex(
      (candidate) => candidate.id === line.id,
    );
    const source =
      originalLines.find((candidate) => candidate.id === line.id) ??
      originalLines[lineIndex];
    if (!source) return;

    setLines((currentLines) =>
      currentLines.map((candidate) =>
        candidate.id === line.id
          ? structuredClone(source)
          : candidate,
      ),
    );
    setSelectedSyllableId(null);
    setSyllableDraft("");
    markAdjustment();
  }

  function resetToSource() {
    if (!originalLines.length) return;
    const sourceLines = structuredClone(originalLines);
    setLines(sourceLines);
    setSelectedWordId(sourceLines[0]?.words[0]?.id ?? null);
    setSelectedSyllableId(null);
    setSyllableDraft("");
    setGlobalOffset(0);
    setResetOpen(false);
    markAdjustment();
  }

  function playLine(line: EditorLine) {
    const firstWord = line.words[0];
    const lastWord = line.words[line.words.length - 1];
    if (!firstWord || !lastWord) return;
    auditionRange(
      firstWord.start + globalOffset,
      lastWord.end + globalOffset,
    );
  }

  function downloadTiming() {
    if (!workspace) return;
    const exportData = {
      version: 1,
      song: workspace.song.title,
      audio: workspace.song.audio.filename,
      duration: roundTiming(duration),
      sourceAlignmentLoss: workspace.original?.loss ?? 0,
      globalOffsetApplied: globalOffset,
      timingUnit: "word with optional syllables",
      lines: lines.map((line, lineIndex) => ({
        line: lineIndex + 1,
        words: line.words.map((word) => ({
          text: word.text,
          start: roundTiming(
            Math.max(0, word.start + globalOffset),
          ),
          end: roundTiming(Math.max(0, word.end + globalOffset)),
          loss: word.loss,
          ...(word.syllables?.length
            ? {
                syllables: word.syllables.map((syllable) => ({
                  text: syllable.text,
                  start: roundTiming(
                    Math.max(0, syllable.start + globalOffset),
                  ),
                  end: roundTiming(
                    Math.max(0, syllable.end + globalOffset),
                  ),
                })),
              }
            : {}),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${workspace.song.slug}-timing-edited.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    previewUntilRef.current = null;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  async function requestAlignment(
    audio: LyricAlignmentAudio,
  ): Promise<ElevenLabsAlignment> {
    if (!workspace || !admin.user) {
      throw new Error("Sign in as an administrator to align this song.");
    }

    const token = await admin.user.getIdToken();
    const response = await fetch("/api/lyric-alignments/align", {
      body: JSON.stringify({
        audioUrl: audio.downloadUrl,
        contentType: audio.contentType,
        filename: audio.filename,
        lyrics: workspace.song.lyrics,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "ElevenLabs could not align this song.";
      throw new Error(message);
    }
    if (!isElevenLabsAlignment(payload)) {
      throw new Error(
        "ElevenLabs returned an alignment format the editor could not read.",
      );
    }

    return payload;
  }

  async function runAlignment() {
    if (!workspace || !admin.user || aligning) return;
    setAligning(true);
    setAlignmentError("");

    try {
      await setLyricAlignmentStatus(workspace.song.slug, "aligning");
      setWorkspace((current) =>
        current
          ? {
              ...current,
              song: { ...current.song, status: "aligning" },
            }
          : current,
      );

      const payload = await requestAlignment(workspace.song.audio);

      const current = await saveLyricAlignmentResult(
        workspace.song,
        payload,
      );
      hydrateWorkspace({
        song: {
          ...workspace.song,
          status: "aligned",
          errorMessage: undefined,
        },
        original: payload,
        current,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Could not complete lyric alignment.";
      setAlignmentError(message);
      setWorkspace((current) =>
        current
          ? {
              ...current,
              song: {
                ...current.song,
                status: "error",
                errorMessage: message,
              },
            }
          : current,
      );
      await setLyricAlignmentStatus(
        workspace.song.slug,
        "error",
        message,
      ).catch(() => undefined);
    } finally {
      setAligning(false);
    }
  }

  async function replaceAudioAndRealign() {
    if (
      !workspace ||
      !replacementFile ||
      !admin.user ||
      replacingAudio
    ) {
      return;
    }

    setReplacementOpen(false);
    setReplacingAudio(true);
    setReplacementError("");
    setReplacementStatus("Uploading replacement MP3");
    let uploadedAudio: LyricAlignmentAudio | null = null;

    try {
      uploadedAudio = await uploadLyricAlignmentAudio(
        workspace.song.slug,
        replacementFile,
        {
          onProgress: ({ bytesTransferred, totalBytes }) => {
            const percent = totalBytes
              ? Math.round((bytesTransferred / totalBytes) * 100)
              : 0;
            setReplacementStatus(`Uploading replacement MP3, ${percent}%`);
          },
        },
      );

      setReplacementStatus("Generating fresh word timings");
      const payload = await requestAlignment(uploadedAudio);
      setReplacementStatus("Saving replacement timing map");
      const current = await replaceLyricAlignmentResult(
        workspace.song,
        uploadedAudio,
        payload,
      );
      const nextSong = {
        ...workspace.song,
        audio: uploadedAudio,
        status: "aligned" as const,
        errorMessage: undefined,
      };

      hydrateWorkspace({
        song: nextSong,
        original: payload,
        current,
      });
      setReplacementFile(null);
      setReplacementStatus("");
    } catch (caught) {
      if (uploadedAudio) {
        await deleteLyricAlignmentAudio(uploadedAudio.storagePath).catch(
          () => undefined,
        );
      }
      setReplacementError(
        caught instanceof Error
          ? caught.message
          : "Could not replace the MP3 and rebuild its timing map.",
      );
      setReplacementStatus("");
    } finally {
      setReplacingAudio(false);
    }
  }

  function renderReplacementDialog() {
    return (
      <AlertDialog
        open={replacementOpen}
        onOpenChange={setReplacementOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <UploadIcon aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Replace the MP3 and rebuild timings?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {replacementFile?.name ?? "The selected MP3"} will be uploaded
              and sent to ElevenLabs for a fresh word map. A successful result
              replaces the current original timing map, every hand edit, and
              the global offset. If upload or alignment fails, the current MP3
              and timings stay active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current MP3</AlertDialogCancel>
            <AlertDialogAction
              disabled={!replacementFile || replacingAudio}
              onClick={() => void replaceAudioAndRealign()}
              variant="destructive"
            >
              Replace and realign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  function renderWord(word: EditorWord, preview = false) {
    const effectiveStart = word.start + globalOffset;
    const effectiveEnd = word.end + globalOffset;
    const wordActive = unitIsActive(
      effectiveStart,
      effectiveEnd,
      currentTime,
    );
    const wordPast = currentTime >= effectiveEnd;
    const selected = selectedWordId === word.id;
    const needsReview = wordNeedsReview(word);
    const adjusted = adjustedWordIds.has(word.id);

    if (word.syllables?.length) {
      return (
        <span
          className={cn(
            "mr-1 inline-flex rounded-md",
            adjusted &&
              "outline outline-1 outline-offset-1 outline-primary/65",
          )}
          key={word.id}
          title={adjusted ? "Adjusted by hand" : undefined}
        >
          {word.syllables.map((syllable, index) => {
            const active = unitIsActive(
              syllable.start + globalOffset,
              syllable.end + globalOffset,
              currentTime,
            );
            const past =
              currentTime >= syllable.end + globalOffset;
            return (
              <button
                aria-label={`${syllable.text}, ${formatTime(syllable.start + globalOffset)} to ${formatTime(syllable.end + globalOffset)}`}
                className={cn(
                  lyricTokenClass({
                    active,
                    adjusted: false,
                    needsReview,
                    past,
                    selected:
                      selected &&
                      selectedSyllableId === syllable.id &&
                      !preview,
                  }),
                  "rounded-none px-1 first:rounded-l-md last:rounded-r-md",
                  index > 0 && "-ml-px",
                  preview && "text-lg sm:text-2xl",
                )}
                key={syllable.id}
                onClick={() => selectSyllable(word, syllable)}
                type="button"
              >
                {syllable.text}
              </button>
            );
          })}
        </span>
      );
    }

    return (
      <button
        aria-label={`${word.text}, ${formatTime(effectiveStart)} to ${formatTime(effectiveEnd)}`}
        className={cn(
          lyricTokenClass({
            active: wordActive,
            adjusted,
            needsReview,
            past: wordPast,
            selected: selected && !preview,
          }),
          "mr-1",
          preview && "text-lg sm:text-2xl",
        )}
        key={word.id}
        onClick={() => selectWord(word)}
        title={adjusted ? "Adjusted by hand" : undefined}
        type="button"
      >
        {word.text}
      </button>
    );
  }

  if (admin.loading || loading) {
    return (
      <AppShell>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  }

  if (!admin.isAdmin) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Administrator access required</CardTitle>
            <CardDescription>
              Sign in with an administrator account to edit lyric timing.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin"
            >
              Open admin
            </Link>
          </CardFooter>
        </Card>
      </AppShell>
    );
  }

  if (loadError || !workspace) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Lyric project could not load</CardTitle>
            <CardDescription>
              {loadError || "This project was not found."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/songs/align"
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Alignment projects
            </Link>
          </CardFooter>
        </Card>
      </AppShell>
    );
  }

  if (!workspace.original) {
    return (
      <AppShell>
        <audio
          controls
          className="w-full"
          preload="metadata"
          src={workspace.song.audio.downloadUrl}
        />

        <section className="swell-panel flex flex-col gap-5 p-4 sm:p-5">
          <Link
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "w-fit",
            })}
            href="/songs/align"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Alignment projects
          </Link>
          <div className="grid gap-1.5">
            <p className="swell-page-kicker">Ready for alignment</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {workspace.song.title}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              The lyrics and MP3 are stored. Generate the original timing map,
              then review each line against the audio.
            </p>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Generate word timings</CardTitle>
            <CardDescription>
              ElevenLabs will align the stored lyrics to{" "}
              {workspace.song.audio.filename}. This may take a few minutes.
            </CardDescription>
            <CardAction>
              <Badge
                variant={
                  workspace.song.status === "error"
                    ? "destructive"
                    : "secondary"
                }
              >
                {aligning ? "Aligning" : "Not aligned"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/35 p-4">
              <p className="whitespace-pre-wrap font-mono text-sm leading-6">
                {workspace.song.lyrics}
              </p>
            </div>
            {alignmentError ? (
              <p className="text-sm text-destructive">
                {alignmentError}
              </p>
            ) : null}
            {replacementStatus ? (
              <p className="text-sm text-muted-foreground" role="status">
                {replacementStatus}
              </p>
            ) : null}
            {replacementError ? (
              <p className="text-sm text-destructive" role="alert">
                {replacementError} The current MP3 was not changed.
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-2">
            <div>
              <input
                accept=".mp3,audio/mpeg"
                className="sr-only"
                onChange={(event) => {
                  const file =
                    event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (!file) return;
                  setReplacementFile(file);
                  setReplacementError("");
                  setReplacementOpen(true);
                }}
                ref={replacementInputRef}
                type="file"
              />
              <Button
                disabled={replacingAudio || aligning}
                onClick={() => replacementInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                <UploadIcon data-icon="inline-start" />
                {replacingAudio
                  ? "Replacing MP3"
                  : "Replace MP3 and align"}
              </Button>
            </div>
            <Button
              disabled={aligning || replacingAudio || !admin.user}
              onClick={() => void runAlignment()}
              type="button"
            >
              <WandSparklesIcon data-icon="inline-start" />
              {aligning ? "Aligning song" : "Generate timing map"}
            </Button>
          </CardFooter>
        </Card>
        {renderReplacementDialog()}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <audio
        onDurationChange={(event) =>
          setDuration(event.currentTarget.duration)
        }
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="metadata"
        ref={audioRef}
        src={workspace.song.audio.downloadUrl}
      />

      <section className="swell-panel flex flex-col gap-5 p-4 sm:p-5">
        <Link
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "w-fit",
          })}
          href="/songs/align"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Alignment projects
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="swell-page-kicker">Lyric timing editor</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {workspace.song.title}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Click a word to hear its current range. Outlined words have been
              changed from the original ElevenLabs timing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              accept=".mp3,audio/mpeg"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                if (!file) return;
                setReplacementFile(file);
                setReplacementError("");
                setReplacementOpen(true);
              }}
              ref={replacementInputRef}
              type="file"
            />
            <Button
              disabled={
                !dirty || saveStatus === "saving" || replacingAudio
              }
              onClick={() => void saveCurrent()}
              size="sm"
              type="button"
            >
              <SaveIcon data-icon="inline-start" />
              Save now
            </Button>
            <Button
              disabled={replacingAudio || aligning}
              onClick={() => replacementInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <UploadIcon data-icon="inline-start" />
              {replacingAudio ? "Replacing MP3" : "Replace MP3"}
            </Button>
            <Button
              onClick={downloadTiming}
              size="sm"
              type="button"
              variant="outline"
            >
              <DownloadIcon data-icon="inline-start" />
              Export JSON
            </Button>
            <Button
              onClick={() => setResetOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcwIcon data-icon="inline-start" />
              Reset song
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
          <span>
            <strong>{allWords.length}</strong>{" "}
            <span className="text-muted-foreground">words</span>
          </span>
          <span>
            <strong>{adjustedWordCount}</strong>{" "}
            <span className="text-muted-foreground">adjusted</span>
          </span>
          <span>
            <strong>{highLossCount}</strong>{" "}
            <span className="text-muted-foreground">
              low confidence
            </span>
          </span>
          <span>
            <strong>{longWordCount}</strong>{" "}
            <span className="text-muted-foreground">long spans</span>
          </span>
          <Badge variant={globalOffset === 0 ? "outline" : "default"}>
            Global {globalOffset >= 0 ? "+" : ""}
            {globalOffset.toFixed(2)}s
          </Badge>
          <Badge
            className="ml-auto"
            variant={
              saveStatus === "error"
                ? "destructive"
                : dirty
                  ? "secondary"
                  : "outline"
            }
          >
            {statusCopy(displayedSaveStatus, adjustmentCount)}
          </Badge>
        </div>
        {saveError ? (
          <p className="text-sm text-destructive">{saveError}</p>
        ) : null}
        {replacementStatus ? (
          <p className="text-sm text-muted-foreground" role="status">
            {replacementStatus}
          </p>
        ) : null}
        {replacementError ? (
          <p className="text-sm text-destructive" role="alert">
            {replacementError} The current MP3 and timing map were not changed.
          </p>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Waveform and playback</CardTitle>
          <CardDescription>
            Drag the selected start or end boundary. One completed drag counts
            as one adjustment.
          </CardDescription>
          <CardAction>
            <Badge variant={playing ? "default" : "secondary"}>
              {playing ? "Playing" : "Paused"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FieldGroup className="rounded-lg border bg-muted/35 p-3">
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="global-timing-offset">
                  Global timing offset
                </FieldLabel>
                <FieldDescription>
                  Shifts playback, highlighting, and export without marking
                  every word as hand-adjusted.
                </FieldDescription>
              </FieldContent>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-label="Decrease global timing offset by 0.05 seconds"
                  onClick={() =>
                    commitGlobalOffset(
                      globalOffset - NUDGE_SECONDS,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  −0.05s
                </Button>
                <Input
                  className="w-24 font-mono"
                  id="global-timing-offset"
                  max={30}
                  min={-30}
                  onBlur={() => {
                    if (offsetInputChangedRef.current) {
                      offsetInputChangedRef.current = false;
                      markAdjustment();
                      if (selectedUnit) {
                        auditionRange(
                          selectedUnit.start + globalOffset,
                          selectedUnit.end + globalOffset,
                        );
                      }
                    }
                  }}
                  onChange={(event) => {
                    const nextValue = Number(event.currentTarget.value);
                    if (
                      Number.isFinite(nextValue) &&
                      roundTiming(nextValue) !== globalOffset
                    ) {
                      offsetInputChangedRef.current = true;
                      changeGlobalOffset(nextValue);
                    }
                  }}
                  step={0.01}
                  type="number"
                  value={globalOffset}
                />
                <Button
                  aria-label="Increase global timing offset by 0.05 seconds"
                  onClick={() =>
                    commitGlobalOffset(
                      globalOffset + NUDGE_SECONDS,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +0.05s
                </Button>
                <Button
                  disabled={globalOffset === 0}
                  onClick={() => commitGlobalOffset(0)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Reset offset
                </Button>
              </div>
            </Field>
          </FieldGroup>

          <LyricTimingWaveform
            audioUrl={workspace.song.audio.downloadUrl}
            currentTime={currentTime}
            duration={duration}
            onAudition={auditionRange}
            onSeek={seekTo}
            onSelectWord={(wordId) => {
              const word = allWords.find(
                (candidate) => candidate.id === wordId,
              );
              if (word) selectWord(word);
            }}
            onSelectionChange={(start, end) => {
              updateSelectedUnit(() => ({
                start: roundTiming(start - globalOffset),
                end: roundTiming(end - globalOffset),
              }));
            }}
            onSelectionCommit={markAdjustment}
            selectedEnd={selectedEffectiveEnd}
            selectedId={selectedWordId}
            selectedLabel={selectedUnit?.text ?? null}
            selectedStart={selectedEffectiveStart}
            words={waveformWords}
          />

          <div className="flex items-center gap-2">
            <Button
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlayback}
              size="icon-lg"
              type="button"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button
              aria-label="Skip back two seconds"
              onClick={() => seekTo(currentTime - 2)}
              size="icon"
              type="button"
              variant="outline"
            >
              <SkipBackIcon />
            </Button>
            <span className="w-14 text-right font-mono text-xs">
              {formatTime(currentTime)}
            </span>
            <span className="h-2 min-w-0 flex-1 rounded-full bg-border">
              <span
                className="block h-full rounded-full bg-primary"
                style={{
                  width: `${
                    duration
                      ? Math.min(100, (currentTime / duration) * 100)
                      : 0
                  }%`,
                }}
              />
            </span>
            <span className="w-14 font-mono text-xs text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>

          <div className="min-h-24 rounded-lg border bg-muted/35 px-4 py-5 sm:px-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current line
              </p>
              {currentLine ? (
                <Button
                  onClick={() => playLine(currentLine)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <PlayIcon data-icon="inline-start" />
                  Play line
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-y-2 leading-loose">
              {currentLine?.words.map((word) =>
                renderWord(word, true),
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-1">
              <CardTitle>Lyrics</CardTitle>
              <CardDescription>
                Outlined words are hand-adjusted. Coral cues need review.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {workingLineIndex >= 0 ? (
                <Badge variant="secondary">
                  Working line {workingLineIndex + 1} of {lines.length}
                </Badge>
              ) : null}
              <ToggleGroup
                aria-label="Filter lyric timings"
                onValueChange={(value) => {
                  const next =
                    value[0] as TimingFilter | undefined;
                  if (next) setFilter(next);
                }}
                size="sm"
                value={[filter]}
                variant="outline"
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="review">
                  Review {reviewCount}
                </ToggleGroupItem>
                <ToggleGroupItem value="long">
                  Long {longWordCount}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent
            aria-label="Lyric timing lines"
            className="max-h-[55vh] scroll-py-3 overflow-y-auto overscroll-y-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-inset lg:max-h-[42vh] [scrollbar-gutter:stable]"
            role="region"
            tabIndex={0}
          >
            <div className="grid gap-2">
              {visibleLines.map((line) => {
                const lineIndex = lines.findIndex(
                  (candidate) => candidate.id === line.id,
                );
                const isWorking = line.id === workingLine?.id;
                const wasAdjusted = lineWasAdjusted(line);

                return (
                  <div
                    className={cn(
                      "grid grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-2.5 transition-colors duration-150",
                      isWorking &&
                        "bg-primary/6 outline outline-1 outline-primary/25",
                    )}
                    key={line.id}
                  >
                    <span className="pt-1 font-mono text-xs text-muted-foreground">
                      {lineIndex + 1}
                    </span>
                    <div className="flex flex-wrap items-center gap-y-1.5 leading-8">
                      {line.words.map((word) => renderWord(word))}
                      <Button
                        aria-label={`Play line ${lineIndex + 1}`}
                        className="ml-1"
                        onClick={() => playLine(line)}
                        size="xs"
                        type="button"
                        variant="secondary"
                      >
                        <PlayIcon data-icon="inline-start" />
                        Play line
                      </Button>
                      <Button
                        aria-label={`Reset line ${lineIndex + 1} to the original alignment`}
                        disabled={!wasAdjusted}
                        onClick={() => resetLine(line)}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        Reset line
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-5">
          <CardHeader>
            <CardTitle>Timing inspector</CardTitle>
            <CardDescription>
              {selectedSyllable
                ? `Editing “${selectedSyllable.text}” inside “${selectedWord?.text}”.`
                : selectedWord
                  ? `Editing “${selectedWord.text}”.`
                  : "Select a lyric to begin."}
            </CardDescription>
            {selectedWord && wordNeedsReview(selectedWord) ? (
              <CardAction>
                <Badge variant="destructive">
                  <AlertTriangleIcon data-icon="inline-start" />
                  Review
                </Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-5">
            {selectedUnit ? (
              <>
                <div className="flex items-center justify-between rounded-lg bg-muted/55 px-3 py-2">
                  <span className="font-mono text-sm">
                    {formatTime(
                      selectedUnit.start + globalOffset,
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(selectedUnit.end - selectedUnit.start).toFixed(3)}
                    s
                  </span>
                  <span className="font-mono text-sm">
                    {formatTime(selectedUnit.end + globalOffset)}
                  </span>
                </div>

                <Button onClick={previewSelected} type="button">
                  <PlayIcon data-icon="inline-start" />
                  Preview selection
                </Button>

                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="timing-start">
                      Start time
                    </FieldLabel>
                    <Input
                      id="timing-start"
                      min={0}
                      onBlur={() => {
                        if (boundaryInputChangedRef.current) {
                          boundaryInputChangedRef.current = false;
                          markAdjustment();
                          previewSelected();
                        }
                      }}
                      onChange={(event) => {
                        const value = Number(
                          event.currentTarget.value,
                        );
                        if (
                          Number.isFinite(value) &&
                          roundTiming(value) !==
                            roundTiming(
                              selectedUnit.start + globalOffset,
                            )
                        ) {
                          boundaryInputChangedRef.current = true;
                          setBoundary("start", value);
                        }
                      }}
                      step={0.01}
                      type="number"
                      value={roundTiming(
                        selectedUnit.start + globalOffset,
                      )}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() =>
                          nudgeBoundary("start", -NUDGE_SECONDS)
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        −0.05
                      </Button>
                      <Button
                        onClick={() =>
                          commitBoundary("start", currentTime)
                        }
                        size="xs"
                        type="button"
                        variant="secondary"
                      >
                        Playhead
                      </Button>
                      <Button
                        onClick={() =>
                          nudgeBoundary("start", NUDGE_SECONDS)
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        +0.05
                      </Button>
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="timing-end">
                      End time
                    </FieldLabel>
                    <Input
                      id="timing-end"
                      min={selectedUnit.start + globalOffset}
                      onBlur={() => {
                        if (boundaryInputChangedRef.current) {
                          boundaryInputChangedRef.current = false;
                          markAdjustment();
                          previewSelected();
                        }
                      }}
                      onChange={(event) => {
                        const value = Number(
                          event.currentTarget.value,
                        );
                        if (
                          Number.isFinite(value) &&
                          roundTiming(value) !==
                            roundTiming(
                              selectedUnit.end + globalOffset,
                            )
                        ) {
                          boundaryInputChangedRef.current = true;
                          setBoundary("end", value);
                        }
                      }}
                      step={0.01}
                      type="number"
                      value={roundTiming(
                        selectedUnit.end + globalOffset,
                      )}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() =>
                          nudgeBoundary("end", -NUDGE_SECONDS)
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        −0.05
                      </Button>
                      <Button
                        onClick={() =>
                          commitBoundary("end", currentTime)
                        }
                        size="xs"
                        type="button"
                        variant="secondary"
                      >
                        Playhead
                      </Button>
                      <Button
                        onClick={() =>
                          nudgeBoundary("end", NUDGE_SECONDS)
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        +0.05
                      </Button>
                    </div>
                  </Field>
                </FieldGroup>

                {selectedWord ? (
                  <Field>
                    <FieldLabel htmlFor="syllable-split">
                      Syllable split
                    </FieldLabel>
                    <Input
                      id="syllable-split"
                      onChange={(event) =>
                        setSyllableDraft(event.currentTarget.value)
                      }
                      placeholder="ham|bur|ger"
                      value={syllableDraft}
                    />
                    <FieldDescription>
                      Separate syllables with |. Initial timings are
                      distributed evenly across the word.
                    </FieldDescription>
                    {selectedWord.syllables?.length ? (
                      <Button
                        onClick={mergeSyllables}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <TimerResetIcon data-icon="inline-start" />
                        Merge to word
                      </Button>
                    ) : (
                      <Button
                        disabled={
                          syllableDraft
                            .split("|")
                            .filter((piece) => piece.trim()).length < 2
                        }
                        onClick={splitIntoSyllables}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ScissorsIcon data-icon="inline-start" />
                        Split evenly
                      </Button>
                    )}
                  </Field>
                ) : null}

                <div className="grid grid-cols-2 gap-2 border-t pt-4">
                  <Button
                    disabled={selectedWordIndex <= 0}
                    onClick={() => moveSelection(-1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    Previous
                  </Button>
                  <Button
                    disabled={
                      selectedWordIndex >= allWords.length - 1
                    }
                    onClick={() => moveSelection(1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Next
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a word in the transcript.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RotateCcwIcon aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Reset the whole song?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every hand-adjusted word, syllable split, and global offset will
              return to the original ElevenLabs response. The original JSON
              remains stored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={resetToSource}
              variant="destructive"
            >
              Reset song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renderReplacementDialog()}
    </AppShell>
  );
}
