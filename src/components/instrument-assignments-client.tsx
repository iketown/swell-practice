"use client";

import {
  DragDropProvider,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import {
  CheckIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  Music2Icon,
  PencilIcon,
  PlayIcon,
  StickyNoteIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/hooks/use-admin";
import {
  INSTRUMENT_IDS,
  type InstrumentId,
  type Song,
  type SongInstrumentAssignment,
  type SongInstrumentAssignments,
  type SongInstrumentNote,
} from "@/lib/domain";
import {
  listSongs,
  saveSongInstrumentAssignments,
  saveSongNotes,
  saveSongInstrumentOrder,
  uploadSongOriginalRecording,
} from "@/lib/firestore";
import { cn } from "@/lib/utils";

const INSTRUMENTS: Record<
  InstrumentId,
  { label: string; imageSrc?: string }
> = {
  guit_a: { label: "Guitar A", imageSrc: "/icons/guit_a.jpg" },
  guit_b: { label: "Guitar B", imageSrc: "/icons/guit_b.jpg" },
  bass: { label: "Bass", imageSrc: "/icons/bass.jpg" },
  drums: { label: "Drums", imageSrc: "/icons/drums.jpg" },
  keys: { label: "Keys", imageSrc: "/icons/keys.jpg" },
  perc: { label: "Percussion", imageSrc: "/icons/perc.jpg" },
  horns: { label: "Horns", imageSrc: "/icons/horns.jpg" },
  strings: { label: "Strings", imageSrc: "/icons/strings.jpg" },
  voc: { label: "Vocals", imageSrc: "/icons/voc.jpg" },
  xtra_vox: { label: "Extra vocals", imageSrc: "/icons/xtra%20vox.jpg" },
  lion: { label: "Lion Vox", imageSrc: "/icons/lion.jpg" },
  accordion: { label: "Accordion", imageSrc: "/icons/accordion.jpg" },
  notes: { label: "Notes" },
};

const PERFORMER_COLUMN_LABELS = ["ike", "2", "3", "4", "cron"] as const;

type InstrumentSource =
  | { zone: "collection" }
  | { zone: "player"; songId: string; slotIndex: number }
  | { zone: "tracks"; songId: string; trackIndex: number };

type InstrumentDragData = {
  kind: "instrument";
  instrumentId: InstrumentId;
  assignment: InstrumentId | SongInstrumentNote;
  source: InstrumentSource;
};

type InstrumentDropData =
  | { kind: "instrument-drop"; zone: "player"; songId: string; slotIndex: number }
  | { kind: "instrument-drop"; zone: "tracks"; songId: string }
  | { kind: "instrument-drop"; zone: "trash" };

type SongRowDragData = {
  kind: "song-row";
  songId: string;
};

type SongRowDropData = {
  kind: "song-row-drop";
  songId: string;
};

type InstrumentAssignmentChange = {
  songId: string;
  assignments: SongInstrumentAssignments;
};

type InstrumentDropResult = {
  nextSongs: Song[];
  changes: InstrumentAssignmentChange[];
};

type DuplicateWarning = {
  songTitle: string;
  instrumentId: InstrumentId;
  count: number;
};

type PendingDuplicateDrop = {
  result: InstrumentDropResult;
  warnings: DuplicateWarning[];
};

type AssignmentDragEndEvent = Parameters<DragEndEvent>[0];

function sortSongsByInstrumentOrder(songs: Song[]) {
  return [...songs].sort((left, right) => {
    const leftOrder = left.instrumentOrder;
    const rightOrder = right.instrumentOrder;

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder || left.sortTitle.localeCompare(right.sortTitle);
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.sortTitle.localeCompare(right.sortTitle);
  });
}

function isInstrumentNote(
  assignment: InstrumentId | SongInstrumentAssignment | null,
): assignment is SongInstrumentNote {
  return typeof assignment === "object" && assignment?.kind === "notes";
}

function assignmentInstrumentId(
  assignment: InstrumentId | SongInstrumentAssignment,
): InstrumentId {
  return isInstrumentNote(assignment) ? "notes" : assignment;
}

function noteAssignment(title = "Notes", notes = ""): SongInstrumentNote {
  return {
    kind: "notes",
    id: crypto.randomUUID(),
    title,
    notes,
  };
}

function cloneAssignments(assignments: SongInstrumentAssignments): SongInstrumentAssignments {
  return {
    players: [...assignments.players] as SongInstrumentAssignments["players"],
    tracks: [...assignments.tracks],
  };
}

function updateInstrumentNoteAssignment(
  assignments: SongInstrumentAssignments,
  noteId: string,
  title: string,
  notes: string,
) {
  let found = false;
  const updateAssignment = (
    assignment: SongInstrumentAssignment | null,
  ): SongInstrumentAssignment | null => {
    if (!isInstrumentNote(assignment) || assignment.id !== noteId) {
      return assignment;
    }

    found = true;
    return { ...assignment, title, notes };
  };
  const nextAssignments: SongInstrumentAssignments = {
    players: assignments.players.map(
      updateAssignment,
    ) as SongInstrumentAssignments["players"],
    tracks: assignments.tracks.map(
      (assignment) => updateAssignment(assignment) as SongInstrumentAssignment,
    ),
  };

  return found ? nextAssignments : null;
}

function planInstrumentDrop(
  songs: Song[],
  sourceData: InstrumentDragData,
  targetData: InstrumentDropData,
  copyRequested: boolean,
): InstrumentDropResult | null {
  const nextSongs = songs.map((song) => ({
    ...song,
    instrumentAssignments: cloneAssignments(song.instrumentAssignments),
  }));
  const songById = new Map(nextSongs.map((song) => [song.id, song]));
  const changedSongIds = new Set<string>();
  const source = sourceData.source;
  const sourceSong = source.zone === "collection"
    ? undefined
    : songById.get(source.songId);
  const assignmentToPlace: SongInstrumentAssignment =
    sourceData.instrumentId === "notes"
      ? isInstrumentNote(sourceData.assignment)
        ? copyRequested
          ? noteAssignment(
              sourceData.assignment.title,
              sourceData.assignment.notes,
            )
          : sourceData.assignment
        : noteAssignment()
      : sourceData.instrumentId as SongInstrumentAssignment;

  if (source.zone !== "collection" && !sourceSong) return null;

  if (!copyRequested && source.zone === "player" && sourceSong) {
    sourceSong.instrumentAssignments.players[source.slotIndex] = null;
    changedSongIds.add(sourceSong.id);
  }

  if (!copyRequested && source.zone === "tracks" && sourceSong) {
    sourceSong.instrumentAssignments.tracks.splice(source.trackIndex, 1);
    changedSongIds.add(sourceSong.id);
  }

  if (targetData.zone === "player") {
    const targetSong = songById.get(targetData.songId);
    if (!targetSong) return null;

    const displacedInstrument =
      targetSong.instrumentAssignments.players[targetData.slotIndex];
    targetSong.instrumentAssignments.players[targetData.slotIndex] =
      assignmentToPlace;
    changedSongIds.add(targetSong.id);

    if (
      !copyRequested
      && displacedInstrument
      && source.zone === "player"
      && sourceSong
    ) {
      sourceSong.instrumentAssignments.players[source.slotIndex] =
        displacedInstrument;
    } else if (
      !copyRequested
      && displacedInstrument
      && source.zone === "tracks"
      && sourceSong
    ) {
      sourceSong.instrumentAssignments.tracks.splice(
        source.trackIndex,
        0,
        displacedInstrument,
      );
    }
  }

  if (targetData.zone === "tracks") {
    const targetSong = songById.get(targetData.songId);
    if (!targetSong) return null;
    targetSong.instrumentAssignments.tracks.push(assignmentToPlace);
    changedSongIds.add(targetSong.id);
  }

  if (!changedSongIds.size) return null;

  const changes = [...changedSongIds].flatMap((songId) => {
    const song = songById.get(songId);
    return song
      ? [{ songId, assignments: cloneAssignments(song.instrumentAssignments) }]
      : [];
  });

  return { nextSongs, changes };
}

function instrumentCount(song: Song, instrumentId: InstrumentId) {
  return song.instrumentAssignments.players.filter(
    (item) => item && assignmentInstrumentId(item) === instrumentId,
  ).length
    + song.instrumentAssignments.tracks.filter(
      (item) => assignmentInstrumentId(item) === instrumentId,
    ).length;
}

function findIntroducedDuplicates(
  currentSongs: Song[],
  result: InstrumentDropResult,
): DuplicateWarning[] {
  const currentById = new Map(currentSongs.map((song) => [song.id, song]));
  const nextById = new Map(result.nextSongs.map((song) => [song.id, song]));

  return result.changes.flatMap(({ songId }) => {
    const currentSong = currentById.get(songId);
    const nextSong = nextById.get(songId);
    if (!currentSong || !nextSong) return [];

    return INSTRUMENT_IDS.flatMap((instrumentId) => {
      if (instrumentId === "voc") return [];

      const beforeCount = instrumentCount(currentSong, instrumentId);
      const afterCount = instrumentCount(nextSong, instrumentId);
      return afterCount > 1 && afterCount > beforeCount
        ? [{ songTitle: nextSong.title, instrumentId, count: afterCount }]
        : [];
    });
  });
}

function altKeyPressed(event: Event | undefined) {
  return Boolean(
    event
    && "altKey" in event
    && (event as MouseEvent | KeyboardEvent).altKey,
  );
}

function instrumentDragId(
  instrumentId: InstrumentId,
  source: InstrumentSource,
  assignment: InstrumentId | SongInstrumentAssignment,
) {
  const assignmentKey = isInstrumentNote(assignment)
    ? `${instrumentId}:${assignment.id}`
    : instrumentId;
  if (source.zone === "collection") return `collection:${assignmentKey}`;
  if (source.zone === "player") {
    return `player:${source.songId}:${source.slotIndex}:${assignmentKey}`;
  }
  return `tracks:${source.songId}:${source.trackIndex}:${assignmentKey}`;
}

function DraggableInstrument({
  assignment,
  source,
  disabled,
  onActivate,
}: {
  assignment: InstrumentId | SongInstrumentAssignment;
  source: InstrumentSource;
  disabled: boolean;
  onActivate?: () => void;
}) {
  const instrumentId = assignmentInstrumentId(assignment);
  const instrument = INSTRUMENTS[instrumentId];
  const label = isInstrumentNote(assignment)
    ? assignment.title.trim() || "Notes"
    : instrument.label;
  const { ref, isDragging } = useDraggable<InstrumentDragData>({
    id: instrumentDragId(instrumentId, source, assignment),
    type: "instrument",
    data: { kind: "instrument", instrumentId, assignment, source },
    disabled,
    feedback: "clone",
  });

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={
        onActivate
          ? `Drag ${label}, or click to edit notes`
          : `Drag ${label}`
      }
      title={onActivate ? `${label}: click to edit notes` : label}
      onClick={() => {
        if (!disabled) onActivate?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !disabled && onActivate) {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group/instrument relative size-14 shrink-0 touch-none select-none rounded-md border bg-card p-0.5 shadow-sm outline-none transition-[transform,opacity,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/40",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-35",
      )}
    >
      {instrument.imageSrc ? (
        <Image
          src={instrument.imageSrc}
          alt={instrument.label}
          width={170}
          height={170}
          draggable={false}
          className="size-full rounded-[calc(var(--radius-md)-3px)] object-cover"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-0.5 rounded-[calc(var(--radius-md)-3px)] bg-muted px-1 text-center">
          <StickyNoteIcon aria-hidden className="size-4 shrink-0" />
          <span className="line-clamp-2 max-w-full text-[9px] leading-tight font-semibold">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({
  song,
  slotIndex,
  disabled,
  onOpenNotes,
}: {
  song: Song;
  slotIndex: number;
  disabled: boolean;
  onOpenNotes: (note: SongInstrumentNote) => void;
}) {
  const assignment = song.instrumentAssignments.players[slotIndex];
  const { ref, isDropTarget } = useDroppable<InstrumentDropData>({
    id: `drop:player:${song.id}:${slotIndex}`,
    type: "instrument-slot",
    accept: "instrument",
    data: { kind: "instrument-drop", zone: "player", songId: song.id, slotIndex },
    disabled,
  });

  return (
    <div
      ref={ref}
      data-testid={`player-slot-${song.id}-${slotIndex}`}
      aria-label={`Person ${slotIndex + 1} instrument for ${song.title}`}
      className={cn(
        "mx-auto flex size-16 items-center justify-center rounded-md border-2 border-dashed bg-muted/35 transition-[background-color,border-color,transform] duration-150",
        assignment && "border-solid bg-card",
        isDropTarget && "scale-[1.04] border-primary bg-accent",
      )}
    >
      {assignment ? (
        <DraggableInstrument
          assignment={assignment}
          source={{ zone: "player", songId: song.id, slotIndex }}
          disabled={disabled}
          onActivate={
            isInstrumentNote(assignment)
              ? () => onOpenNotes(assignment)
              : undefined
          }
        />
      ) : (
        <span aria-hidden className="text-xs font-semibold text-muted-foreground/55">
          {slotIndex + 1}
        </span>
      )}
    </div>
  );
}

function TracksSlot({
  song,
  disabled,
  onOpenNotes,
}: {
  song: Song;
  disabled: boolean;
  onOpenNotes: (note: SongInstrumentNote) => void;
}) {
  const { ref, isDropTarget } = useDroppable<InstrumentDropData>({
    id: `drop:tracks:${song.id}`,
    type: "instrument-slot",
    accept: "instrument",
    data: { kind: "instrument-drop", zone: "tracks", songId: song.id },
    disabled,
  });

  return (
    <div
      ref={ref}
      data-testid={`tracks-slot-${song.id}`}
      aria-label={`Tracks instruments for ${song.title}`}
      className={cn(
        "flex min-h-16 min-w-64 flex-wrap items-center gap-1.5 rounded-md border-2 border-dashed bg-muted/35 p-1 transition-[background-color,border-color] duration-150",
        song.instrumentAssignments.tracks.length && "border-solid bg-card",
        isDropTarget && "border-primary bg-accent",
      )}
    >
      {song.instrumentAssignments.tracks.length ? (
        song.instrumentAssignments.tracks.map((assignment, trackIndex) => {
          const assignmentKey = isInstrumentNote(assignment)
            ? assignment.id
            : assignment;

          return (
            <DraggableInstrument
              key={`${song.id}:${trackIndex}:${assignmentKey}`}
              assignment={assignment}
              source={{ zone: "tracks", songId: song.id, trackIndex }}
              disabled={disabled}
              onActivate={
                isInstrumentNote(assignment)
                  ? () => onOpenNotes(assignment)
                  : undefined
              }
            />
          );
        })
      ) : (
        <span className="px-2 text-xs font-medium text-muted-foreground">
          Ableton tracks
        </span>
      )}
    </div>
  );
}

function TrashDropZone({ disabled }: { disabled: boolean }) {
  const { ref, isDropTarget } = useDroppable<InstrumentDropData>({
    id: "drop:trash",
    type: "instrument-trash",
    accept: "instrument",
    data: { kind: "instrument-drop", zone: "trash" },
    disabled,
  });

  return (
    <div
      ref={ref}
      data-testid="instrument-trash"
      className={cn(
        "flex min-h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs font-semibold text-muted-foreground transition-[background-color,border-color,color,transform] duration-150 sm:w-28",
        isDropTarget && "scale-[1.03] border-destructive bg-destructive/10 text-destructive",
      )}
    >
      <Trash2Icon aria-hidden />
      Remove
    </div>
  );
}

function InstrumentAssignmentRow({
  song,
  disabled,
  uploading,
  uploadProgress,
  canUpload,
  onPlay,
  onUpload,
  onOpenSongNotes,
  onOpenInstrumentNote,
}: {
  song: Song;
  disabled: boolean;
  uploading: boolean;
  uploadProgress: number;
  canUpload: boolean;
  onPlay: () => void;
  onUpload: () => void;
  onOpenSongNotes: () => void;
  onOpenInstrumentNote: (note: SongInstrumentNote) => void;
}) {
  const {
    ref: draggableRef,
    handleRef,
    isDragging,
  } = useDraggable<SongRowDragData>({
    id: `song-row:${song.id}`,
    type: "song-row",
    data: { kind: "song-row", songId: song.id },
    disabled,
    feedback: "clone",
  });
  const { ref: droppableRef, isDropTarget } = useDroppable<SongRowDropData>({
    id: `song-row-drop:${song.id}`,
    type: "song-row-drop",
    accept: "song-row",
    data: { kind: "song-row-drop", songId: song.id },
    disabled,
  });
  const setRowRef = (element: HTMLTableRowElement | null) => {
    draggableRef(element);
    droppableRef(element);
  };

  return (
    <TableRow
      ref={setRowRef}
      data-testid={`song-row-${song.id}`}
      className={cn(
        "h-24 bg-card/60 transition-[background-color,opacity,box-shadow] duration-150 hover:bg-muted/55",
        isDragging && "opacity-35",
        isDropTarget && !isDragging && "bg-accent shadow-[inset_0_2px_0_var(--primary)]",
      )}
    >
      <TableCell className="sticky left-0 z-10 bg-card px-2 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            ref={handleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            data-testid={`song-handle-${song.id}`}
            aria-label={`Reorder ${song.title}`}
            title="Drag to reorder"
            className="shrink-0 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
          >
            <GripVerticalIcon aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span className="max-w-48 truncate font-semibold" title={song.title}>
              {song.title}
            </span>
            <div className="flex items-center gap-1.5">
              {song.originalRecording ? (
                <Button type="button" size="xs" variant="secondary" onClick={onPlay}>
                  <PlayIcon data-icon="inline-start" />
                  Play
                </Button>
              ) : canUpload ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={uploading}
                  onClick={onUpload}
                >
                  {uploading ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <UploadIcon data-icon="inline-start" />
                  )}
                  {uploading ? `Uploading ${uploadProgress}%` : "Upload MP3"}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">No recording</span>
              )}
              {song.notes?.trim() ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={disabled}
                  data-testid={`song-notes-${song.id}`}
                  onClick={onOpenSongNotes}
                >
                  Notes
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={disabled}
                  data-testid={`song-notes-${song.id}`}
                  aria-label={`Add notes for ${song.title}`}
                  title="Add notes"
                  onClick={onOpenSongNotes}
                >
                  <PencilIcon aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      {song.instrumentAssignments.players.map((_, slotIndex) => (
        <TableCell key={slotIndex} className="p-2 text-center">
          <PlayerSlot
            song={song}
            slotIndex={slotIndex}
            disabled={disabled}
            onOpenNotes={onOpenInstrumentNote}
          />
        </TableCell>
      ))}
      <TableCell className="p-2 pr-4">
        <TracksSlot
          song={song}
          disabled={disabled}
          onOpenNotes={onOpenInstrumentNote}
        />
      </TableCell>
    </TableRow>
  );
}

function OriginalRecordingDialog({
  song,
  onOpenChange,
  onReplace,
}: {
  song: Song | null;
  onOpenChange: (open: boolean) => void;
  onReplace: (song: Song) => void;
}) {
  const admin = useAdmin();

  return (
    <Dialog open={Boolean(song)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{song?.title ?? "Original recording"}</DialogTitle>
          <DialogDescription>
            Listen to the original recording while planning the live arrangement.
          </DialogDescription>
        </DialogHeader>
        {song?.originalRecording ? (
          <div className="flex flex-col gap-3">
            <audio
              key={song.originalRecording.downloadUrl}
              controls
              autoPlay
              preload="metadata"
              src={song.originalRecording.downloadUrl}
              className="w-full"
            />
            {admin.isAdmin ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onReplace(song)}>
                <UploadIcon data-icon="inline-start" />
                Replace recording
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function InstrumentAssignmentsClient() {
  const admin = useAdmin();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Song | null>(null);
  const [uploadingSongId, setUploadingSongId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingDuplicateDrop, setPendingDuplicateDrop] =
    useState<PendingDuplicateDrop | null>(null);
  const [notesSongId, setNotesSongId] = useState<string | null>(null);
  const [notesInstrumentId, setNotesInstrumentId] = useState<string | null>(null);
  const [notesTitleDraft, setNotesTitleDraft] = useState("Notes");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;

    listSongs()
      .then((items) => {
        if (!active) return;
        setSongs(sortSongsByInstrumentOrder(items));
        setLoadError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(caught instanceof Error ? caught.message : "Could not load songs.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function queueDatabaseSave(save: () => Promise<void>, failureMessage: string) {
    setPendingSaves((current) => current + 1);
    setSaveFailed(false);

    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(save);

    saveQueueRef.current = operation;
    void operation
      .catch((caught) => {
        setSaveFailed(true);
        toast.error(
          caught instanceof Error
            ? `${failureMessage}: ${caught.message}`
            : `${failureMessage}.`,
        );
      })
      .finally(() => setPendingSaves((current) => Math.max(0, current - 1)));
  }

  function commitInstrumentDrop(result: InstrumentDropResult) {
    setSongs(result.nextSongs);
    queueDatabaseSave(
      () => saveSongInstrumentAssignments(result.changes),
      "Instrument change was not saved",
    );
  }

  function handleDragEnd(event: AssignmentDragEndEvent) {
    if (event.canceled || !admin.isAdmin) return;

    const sourceData = event.operation.source?.data as
      | InstrumentDragData
      | SongRowDragData
      | undefined;
    const targetData = event.operation.target?.data as
      | InstrumentDropData
      | SongRowDropData
      | undefined;

    if (sourceData?.kind === "song-row") {
      if (targetData?.kind !== "song-row-drop") return;

      const sourceIndex = songs.findIndex((song) => song.id === sourceData.songId);
      const targetIndex = songs.findIndex((song) => song.id === targetData.songId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

      const reorderedSongs = [...songs];
      const movedSong = reorderedSongs.splice(sourceIndex, 1)[0];
      if (!movedSong) return;
      reorderedSongs.splice(targetIndex, 0, movedSong);

      const nextSongs = reorderedSongs.map((song, instrumentOrder) => ({
        ...song,
        instrumentOrder,
      }));
      const changes = nextSongs.map((song) => ({
        songId: song.id,
        instrumentOrder: song.instrumentOrder ?? 0,
      }));

      setSongs(nextSongs);
      queueDatabaseSave(
        () => saveSongInstrumentOrder(changes),
        "Song order was not saved",
      );
      return;
    }

    if (sourceData?.kind !== "instrument") return;

    const instrumentTarget = targetData?.kind === "instrument-drop"
      ? targetData
      : undefined;
    const copyRequested = Boolean(
      sourceData.source.zone !== "collection"
      && altKeyPressed(event.nativeEvent),
    );

    if (
      !instrumentTarget
      || (
        sourceData.source.zone === "collection"
        && instrumentTarget.zone === "trash"
      )
      || (copyRequested && instrumentTarget.zone === "trash")
    ) {
      return;
    }

    if (
      sourceData.source.zone === "player"
      && instrumentTarget.zone === "player"
      && sourceData.source.songId === instrumentTarget.songId
      && sourceData.source.slotIndex === instrumentTarget.slotIndex
    ) {
      return;
    }

    if (
      sourceData.source.zone === "tracks"
      && instrumentTarget.zone === "tracks"
      && sourceData.source.songId === instrumentTarget.songId
      && !copyRequested
    ) {
      return;
    }

    const result = planInstrumentDrop(
      songs,
      sourceData,
      instrumentTarget,
      copyRequested,
    );
    if (!result) return;

    const warnings = findIntroducedDuplicates(songs, result);
    if (warnings.length) {
      setPendingDuplicateDrop({ result, warnings });
      return;
    }

    commitInstrumentDrop(result);
  }

  function chooseOriginalRecording(song: Song) {
    setUploadTarget(song);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
      uploadInputRef.current.click();
    }
  }

  function openSongNotes(song: Song) {
    setNotesSongId(song.id);
    setNotesInstrumentId(null);
    setNotesTitleDraft("Notes");
    setNotesDraft(song.notes ?? "");
    setNotesError(null);
  }

  function openInstrumentNote(song: Song, note: SongInstrumentNote) {
    setNotesSongId(song.id);
    setNotesInstrumentId(note.id);
    setNotesTitleDraft(note.title);
    setNotesDraft(note.notes);
    setNotesError(null);
  }

  function closeSongNotes() {
    if (notesSaving) return;
    setNotesSongId(null);
    setNotesInstrumentId(null);
    setNotesTitleDraft("Notes");
    setNotesDraft("");
    setNotesError(null);
  }

  async function handleNotesSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notesSongId || !admin.isAdmin) return;

    const song = songs.find((item) => item.id === notesSongId);
    if (!song) return;

    const notesTitle = notesTitleDraft.trim() || "Notes";
    const notes = notesDraft.trim();
    setNotesSaving(true);
    setNotesError(null);

    try {
      if (notesInstrumentId) {
        const assignments = updateInstrumentNoteAssignment(
          song.instrumentAssignments,
          notesInstrumentId,
          notesTitle,
          notes,
        );
        if (!assignments) {
          throw new Error("This Notes tile is no longer assigned to the song.");
        }

        await saveSongInstrumentAssignments([
          { songId: song.id, assignments },
        ]);
        setSongs((current) =>
          current.map((item) =>
            item.id === song.id
              ? { ...item, instrumentAssignments: assignments }
              : item,
          ),
        );
        toast.success(`${notesTitle} saved.`);
      } else {
        await saveSongNotes(song.id, notes);
        setSongs((current) =>
          current.map((item) =>
            item.id === song.id
              ? { ...item, notes: notes || undefined }
              : item,
          ),
        );
        toast.success(
          notes
            ? `Song notes saved for ${song.title}.`
            : `Song notes cleared for ${song.title}.`,
        );
      }

      setNotesSongId(null);
      setNotesInstrumentId(null);
      setNotesTitleDraft("Notes");
      setNotesDraft("");
    } catch (caught) {
      setNotesError(
        caught instanceof Error ? caught.message : "Could not save notes.",
      );
    } finally {
      setNotesSaving(false);
    }
  }

  async function uploadOriginalRecording(file: File) {
    const song = uploadTarget;
    if (!song) return;

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

      setSongs((current) =>
        current.map((item) =>
          item.id === song.id ? { ...item, originalRecording } : item,
        ),
      );
      toast.success(`Original recording uploaded for ${song.title}.`);
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

  const playingSong = playingSongId
    ? songs.find((song) => song.id === playingSongId) ?? null
    : null;
  const notesSong = notesSongId
    ? songs.find((song) => song.id === notesSongId) ?? null
    : null;
  const duplicatePromptTitle = pendingDuplicateDrop
    ? `${pendingDuplicateDrop.warnings
        .map(
          ({ count, instrumentId }) =>
            `${count} x ${INSTRUMENTS[instrumentId].label.toLowerCase()}`,
        )
        .join(" and ")}? Really?`
    : "";
  const duplicatePromptDescription = pendingDuplicateDrop
    ? pendingDuplicateDrop.warnings
        .map(
          ({ songTitle, instrumentId, count }) =>
            `${songTitle} would contain ${count} ${INSTRUMENTS[
              instrumentId
            ].label.toLowerCase()} icons.`,
        )
        .join(" ")
    : "";
  const editingDisabled = !admin.isAdmin || admin.loading;

  return (
    <AppShell>
      <DragDropProvider onDragEnd={handleDragEnd}>
        <section className="swell-panel flex h-[calc(100dvh-11.5rem)] min-h-[32rem] flex-col overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
            <div className="flex flex-col gap-1.5">
              <p className="swell-page-kicker">Live arrangement</p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                Instrument assignments
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Use the left handle to reorder songs. Drag one instrument to each
                person, add any number to Trax, and hold Alt/Option to copy.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!admin.loading && !admin.isAdmin ? (
                <Badge variant="secondary">Sign in to edit</Badge>
              ) : null}
              <Badge variant={saveFailed ? "destructive" : "secondary"}>
                {!admin.loading && !admin.isAdmin ? (
                  "View only"
                ) : saveFailed ? (
                  "Save failed"
                ) : pendingSaves ? (
                  <>
                    <LoaderCircleIcon aria-hidden className="animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <CheckIcon aria-hidden />
                    Autosave on
                  </>
                )}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {loading ? (
              <div className="flex min-w-[64rem] flex-col gap-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : loadError ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
                {loadError}
              </div>
            ) : songs.length ? (
              <Table
                containerClassName="overflow-visible"
                className="min-w-[66rem] table-fixed"
              >
                <TableCaption className="sr-only">
                  Live instrument and tracks assignments for every song.
                </TableCaption>
                <colgroup>
                  <col className="w-72" />
                  {PERFORMER_COLUMN_LABELS.map((label) => (
                    <col key={label} className="w-24" />
                  ))}
                  <col className="w-80" />
                </colgroup>
                <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
                  <TableRow className="hover:bg-card">
                    <TableHead className="sticky left-0 z-30 bg-card px-4">
                      Song
                    </TableHead>
                    {PERFORMER_COLUMN_LABELS.map((label, index) => (
                      <TableHead
                        key={label}
                        aria-label={
                          index === 0
                            ? "Ike"
                            : index === 4
                              ? "Cron"
                              : `Person ${label}`
                        }
                        className="text-center text-base font-semibold"
                      >
                        <span aria-hidden>{label}</span>
                      </TableHead>
                    ))}
                    <TableHead className="px-3 text-base font-semibold">Trax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {songs.map((song) => (
                    <InstrumentAssignmentRow
                      key={song.id}
                      song={song}
                      disabled={editingDisabled}
                      uploading={uploadingSongId === song.id}
                      uploadProgress={uploadProgress}
                      canUpload={admin.isAdmin}
                      onPlay={() => setPlayingSongId(song.id)}
                      onUpload={() => chooseOriginalRecording(song)}
                      onOpenSongNotes={() => openSongNotes(song)}
                      onOpenInstrumentNote={(note) =>
                        openInstrumentNote(song, note)
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Music2Icon aria-hidden className="text-muted-foreground" />
                <p className="font-semibold">No songs yet</p>
                <p className="text-sm text-muted-foreground">
                  Songs added to the library will appear here automatically.
                </p>
              </div>
            )}
          </div>

          <div data-testid="instrument-dock" className="shrink-0 border-t bg-card p-3 sm:p-4">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Instrument collection</p>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    Drag copies into the table
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {INSTRUMENT_IDS.map((instrumentId) => (
                    <DraggableInstrument
                      key={instrumentId}
                      assignment={instrumentId}
                      source={{ zone: "collection" }}
                      disabled={editingDisabled}
                    />
                  ))}
                </div>
              </div>
              <TrashDropZone disabled={editingDisabled} />
            </div>
          </div>
        </section>
      </DragDropProvider>

      <AlertDialog
        open={Boolean(pendingDuplicateDrop)}
        onOpenChange={(open) => {
          if (!open) setPendingDuplicateDrop(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{duplicatePromptTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicatePromptDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDuplicateDrop(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDuplicateDrop) return;
                const result = pendingDuplicateDrop.result;
                setPendingDuplicateDrop(null);
                commitInstrumentDrop(result);
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(notesSong)}
        onOpenChange={(open) => {
          if (!open) closeSongNotes();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {notesInstrumentId
                ? "Edit Notes tile"
                : notesSong
                  ? `${notesSong.title} notes`
                  : "Song notes"}
            </DialogTitle>
            <DialogDescription>
              {notesInstrumentId
                ? `Edit this draggable note for ${notesSong?.title ?? "the song"}.`
                : "Add anything the band should remember about this arrangement."}
            </DialogDescription>
          </DialogHeader>
          <form className="contents" onSubmit={handleNotesSave}>
            <FieldGroup>
              {notesInstrumentId ? (
                <Field>
                  <FieldLabel htmlFor="song-notes-title">Title</FieldLabel>
                  <Input
                    id="song-notes-title"
                    name="song-notes-title"
                    value={notesTitleDraft}
                    maxLength={40}
                    autoFocus
                    disabled={notesSaving}
                    placeholder="Notes"
                    onChange={(event) => setNotesTitleDraft(event.target.value)}
                  />
                  <FieldDescription>
                    This title appears on the draggable Notes tile.
                  </FieldDescription>
                </Field>
              ) : null}
              <Field data-invalid={Boolean(notesError)}>
                <FieldLabel htmlFor="song-notes">Notes</FieldLabel>
                <Textarea
                  id="song-notes"
                  name="song-notes"
                  value={notesDraft}
                  rows={9}
                  autoFocus={!notesInstrumentId}
                  disabled={notesSaving}
                  aria-invalid={Boolean(notesError)}
                  placeholder="Add notes for this song..."
                  className="min-h-52 resize-y"
                  onChange={(event) => setNotesDraft(event.target.value)}
                />
                <FieldDescription>
                  {notesInstrumentId
                    ? "These notes belong only to this draggable tile."
                    : "These are the song’s general notes."}
                </FieldDescription>
                {notesError ? <FieldError>{notesError}</FieldError> : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={notesSaving}
                onClick={closeSongNotes}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={notesSaving}>
                {notesSaving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        className="sr-only"
        aria-label="Choose original recording MP3"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadOriginalRecording(file);
        }}
      />

      <OriginalRecordingDialog
        song={playingSong}
        onOpenChange={(open) => {
          if (!open) setPlayingSongId(null);
        }}
        onReplace={(song) => {
          setPlayingSongId(null);
          chooseOriginalRecording(song);
        }}
      />
    </AppShell>
  );
}
