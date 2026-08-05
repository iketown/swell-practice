"use client";

import {
  DragDropProvider,
  type DragDropManager,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import {
  CheckIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  Mic2Icon,
  Music2Icon,
  PencilIcon,
  PlayIcon,
  StickyNoteIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertTitle } from "@/components/ui/alert";
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
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { listBands, listMembers } from "@/lib/assignments";
import {
  INSTRUMENT_IDS,
  partLabel,
  VOCAL_PART_SLUGS,
  type Band,
  type BandMember,
  type BandSongArrangement,
  type InstrumentId,
  type Song,
  type SongInstrumentAssignment,
  type SongInstrumentAssignments,
  type SongInstrumentNote,
  type SongVocalAssignment,
  type VocalPartSlug,
} from "@/lib/domain";
import {
  acquireInstrumentAssignmentLock,
  InstrumentAssignmentLockedError,
  refreshInstrumentAssignmentLock,
  releaseInstrumentAssignmentLock,
  saveBandSongVocalAssignments,
  saveSongInstrumentAssignmentMove,
  saveSongInstrumentAssignments,
  saveSongNotes,
  saveSongInstrumentOrder,
  subscribeInstrumentAssignmentCollaboration,
  subscribeBandSongArrangements,
  subscribeSongMixerStemParts,
  subscribeSongs,
  uploadSongOriginalRecording,
  type InstrumentAssignmentCollaborationState,
  type InstrumentAssignmentLastMove,
  type InstrumentAssignmentMoveTarget,
  type VocalAssignmentMoveTarget,
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
  cello: { label: "Cello", imageSrc: "/icons/cello.jpg" },
  alto_sax: { label: "Alto sax", imageSrc: "/icons/alto_sax.jpg" },
  acoustic: { label: "Acoustic guitar", imageSrc: "/icons/acoustic.jpg" },
  sax_sect: { label: "Sax section", imageSrc: "/icons/sax_sect.jpg" },
  horn_sect: { label: "Horn section", imageSrc: "/icons/horn_sect.jpg" },
  notes: { label: "Notes" },
};

const SELECTED_BAND_STORAGE_KEY = "swell-parts:instrument-assignment-band";
const STARTUP_MEMBER_ORDER = ["ike", "jackson", "joe", "sam", "cron"] as const;
const PLAYER_STEM_BY_INSTRUMENT_ID: Partial<
  Record<InstrumentId, { mix: "inst"; part: string }>
> = {
  guit_a: { mix: "inst", part: "guit_a" },
  guit_b: { mix: "inst", part: "guit_b" },
  bass: { mix: "inst", part: "bass" },
  keys: { mix: "inst", part: "keys" },
  drums: { mix: "inst", part: "drums" },
  acoustic: { mix: "inst", part: "guit_acoustic" },
  alto_sax: { mix: "inst", part: "sax" },
  accordion: { mix: "inst", part: "accordion" },
};
const EMPTY_STEM_PARTS: ReadonlySet<string> = new Set();

type BandColumn = {
  member: BandMember;
  defaultVocalPart: VocalPartSlug;
};

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

type VocalDragData = {
  kind: "vocal";
  songId: string;
  slotIndex: number;
  assignment: SongVocalAssignment;
};

type VocalDropData = {
  kind: "vocal-drop";
  zone: "vocal";
  songId: string;
  slotIndex: number;
};

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
  lastMove: InstrumentAssignmentMoveTarget | null;
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

type VocalArrangementState = {
  showVocals: boolean;
  vocalAssignments: Array<SongVocalAssignment | null>;
};

type AssignmentStemLink = {
  href?: string;
  label: string;
  availability: "available" | "missing" | "unknown";
};

type AssignmentDragEndEvent = Parameters<DragEndEvent>[0];
type AssignmentDragStartEvent = Parameters<DragStartEvent>[0];

type ActiveAssignmentDrag = {
  id: string;
  phase: "dragging" | "ending" | "awaiting-confirmation";
  manager: DragDropManager;
  lockPromise: Promise<boolean>;
  heartbeatId: number | null;
};

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

function columnsForBand(band: Band | null, members: BandMember[]): BandColumn[] {
  if (!band) return [];
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const usedParts = new Set<VocalPartSlug>();
  const columns: BandColumn[] = [];

  band.memberIds.forEach((memberId) => {
    const member = memberMap.get(memberId);
    const defaultVocalPart = band.vocalPartByMemberId[memberId];
    if (!member || !defaultVocalPart || usedParts.has(defaultVocalPart)) return;
    usedParts.add(defaultVocalPart);
    columns.push({ member, defaultVocalPart });
  });

  if (!Object.keys(band.vocalPartByMemberId).length) {
    const fallbackMemberIds = band.title.trim().toLowerCase().includes("startup")
      ? [...band.memberIds].sort((leftId, rightId) => {
          const leftName = memberMap.get(leftId)?.displayName.trim().toLowerCase() ?? "";
          const rightName = memberMap.get(rightId)?.displayName.trim().toLowerCase() ?? "";
          const leftOrder = STARTUP_MEMBER_ORDER.indexOf(leftName as (typeof STARTUP_MEMBER_ORDER)[number]);
          const rightOrder = STARTUP_MEMBER_ORDER.indexOf(rightName as (typeof STARTUP_MEMBER_ORDER)[number]);
          return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
        })
      : band.memberIds;
    fallbackMemberIds.forEach((memberId) => {
      if (columns.length >= VOCAL_PART_SLUGS.length) return;
      if (columns.some((column) => column.member.id === memberId)) return;
      const member = memberMap.get(memberId);
      const defaultVocalPart = VOCAL_PART_SLUGS.find((partSlug) => !usedParts.has(partSlug));
      if (!member || !defaultVocalPart) return;
      usedParts.add(defaultVocalPart);
      columns.push({ member, defaultVocalPart });
    });
  }

  return columns.sort(
    (left, right) =>
      VOCAL_PART_SLUGS.indexOf(left.defaultVocalPart)
      - VOCAL_PART_SLUGS.indexOf(right.defaultVocalPart),
  );
}

function normalizeVocalAssignments(
  storedAssignments: SongVocalAssignment[] | undefined,
  columns: BandColumn[],
): Array<SongVocalAssignment | null> {
  if (storedAssignments === undefined) {
    return columns.map((column) => ({
      memberId: column.member.id,
      partSlug: column.defaultVocalPart,
      lead: false,
    }));
  }

  const storedByMemberId = new Map(
    storedAssignments.map((assignment) => [assignment.memberId, assignment]),
  );
  const usedParts = new Set<VocalPartSlug>();

  return columns.map((column) => {
    const stored = storedByMemberId.get(column.member.id);
    if (!stored || usedParts.has(stored.partSlug)) return null;

    usedParts.add(stored.partSlug);
    return {
      memberId: column.member.id,
      partSlug: stored.partSlug,
      lead: stored.lead === true,
    } satisfies SongVocalAssignment;
  });
}

function persistedVocalAssignments(state: VocalArrangementState) {
  return state.vocalAssignments.filter(
    (assignment): assignment is SongVocalAssignment => assignment !== null,
  );
}

function assignmentPlayerHref({
  songSlug,
  mix,
  part,
  memberSlug,
}: {
  songSlug: string;
  mix: "inst" | "voc";
  part: string;
  memberSlug: string;
}) {
  const searchParams = new URLSearchParams({
    mix,
    part,
    member: memberSlug,
  });
  return `/songs/${encodeURIComponent(songSlug)}?${searchParams.toString()}`;
}

function AssignmentStemAffordance({
  stemLink,
  modifierPressed,
}: {
  stemLink: AssignmentStemLink | undefined;
  modifierPressed: boolean;
}) {
  if (!stemLink) return null;

  return (
    <>
      {stemLink.availability === "missing" ? (
        <Badge
          variant="destructive"
          className="pointer-events-none absolute -top-1 -right-1 size-4 p-0 text-[10px] shadow-sm"
          aria-label={`No playable ${stemLink.label} stem is uploaded`}
          title={`No playable ${stemLink.label} stem is uploaded`}
        >
          ?
        </Badge>
      ) : null}
      {stemLink.availability === "available" && stemLink.href ? (
        <a
          href={stemLink.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={modifierPressed ? 0 : -1}
          aria-hidden={!modifierPressed}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-[inherit] bg-foreground/90 px-1 text-center text-[9px] font-bold leading-tight text-background opacity-0 outline-none transition-opacity duration-150 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/40",
            modifierPressed
              ? "pointer-events-auto group-hover/part-link:opacity-100"
              : "pointer-events-none",
          )}
          aria-label={`Go to ${stemLink.label} part`}
          title={`Go to ${stemLink.label} part`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          Go to part
        </a>
      ) : null}
    </>
  );
}

function songsWithBandArrangements(
  baseSongs: Song[],
  arrangementsBySongId: Map<string, BandSongArrangement>,
) {
  return sortSongsByInstrumentOrder(baseSongs.map((song) => ({
    ...song,
    instrumentAssignments:
      arrangementsBySongId.get(song.id)?.instrumentAssignments
      ?? song.instrumentAssignments,
  })));
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

function instrumentAssignmentKey(
  assignment: InstrumentId | SongInstrumentAssignment,
) {
  const instrumentId = assignmentInstrumentId(assignment);
  return isInstrumentNote(assignment)
    ? `${instrumentId}:${assignment.id}`
    : instrumentId;
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
  bandId: string,
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
  let lastMove: InstrumentAssignmentMoveTarget | null = null;

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
    lastMove = {
      kind: "instrument",
      bandId,
      songId: targetSong.id,
      assignmentKey: instrumentAssignmentKey(assignmentToPlace),
      instrumentId: assignmentInstrumentId(assignmentToPlace),
      zone: "player",
      slotIndex: targetData.slotIndex,
    };

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
    const trackIndex = targetSong.instrumentAssignments.tracks.length;
    targetSong.instrumentAssignments.tracks.push(assignmentToPlace);
    changedSongIds.add(targetSong.id);
    lastMove = {
      kind: "instrument",
      bandId,
      songId: targetSong.id,
      assignmentKey: instrumentAssignmentKey(assignmentToPlace),
      instrumentId: assignmentInstrumentId(assignmentToPlace),
      zone: "tracks",
      trackIndex,
    };
  }

  if (!changedSongIds.size) return null;

  const changes = [...changedSongIds].flatMap((songId) => {
    const song = songById.get(songId);
    return song
      ? [{ songId, assignments: cloneAssignments(song.instrumentAssignments) }]
      : [];
  });

  return { nextSongs, changes, lastMove };
}

function instrumentCount(song: Song, instrumentId: InstrumentId) {
  return song.instrumentAssignments.players.filter(
    (item) => item && assignmentInstrumentId(item) === instrumentId,
  ).length
    + song.instrumentAssignments.tracks.filter(
      (item) => assignmentInstrumentId(item) === instrumentId,
    ).length;
}

function unassignedStemInstrumentIds(
  song: Song,
  stemParts: ReadonlySet<string>,
) {
  const coveredInstrumentIds = new Set<InstrumentId>();
  song.instrumentAssignments.players.forEach((assignment) => {
    if (assignment) {
      coveredInstrumentIds.add(assignmentInstrumentId(assignment));
    }
  });
  song.instrumentAssignments.tracks.forEach((assignment) => {
    coveredInstrumentIds.add(assignmentInstrumentId(assignment));
  });

  return INSTRUMENT_IDS.filter((instrumentId) => {
    const playerStem = PLAYER_STEM_BY_INSTRUMENT_ID[instrumentId];
    return Boolean(
      playerStem
      && stemParts.has(playerStem.part)
      && !coveredInstrumentIds.has(instrumentId),
    );
  });
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
  source: InstrumentSource,
  assignment: InstrumentId | SongInstrumentAssignment,
) {
  const assignmentKey = instrumentAssignmentKey(assignment);
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
  recentlyMoved = false,
  onActivate,
}: {
  assignment: InstrumentId | SongInstrumentAssignment;
  source: InstrumentSource;
  disabled: boolean;
  recentlyMoved?: boolean;
  onActivate?: () => void;
}) {
  const instrumentId = assignmentInstrumentId(assignment);
  const instrument = INSTRUMENTS[instrumentId];
  const label = isInstrumentNote(assignment)
    ? assignment.title.trim() || "Notes"
    : instrument.label;
  const { ref, isDragging } = useDraggable<InstrumentDragData>({
    id: instrumentDragId(source, assignment),
    type: "instrument",
    data: { kind: "instrument", instrumentId, assignment, source },
    disabled,
    feedback: "clone",
  });

  return (
    <div
      ref={!disabled ? ref : undefined}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={onActivate ? `Drag ${label}, or click to edit notes` : `Drag ${label}`}
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
        recentlyMoved && "swell-recent-assignment",
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
  memberName,
  memberSlug,
  modifierPressed,
  stemParts,
  stemPartsReady,
  disabled,
  recentMove,
  onOpenNotes,
}: {
  song: Song;
  slotIndex: number;
  memberName: string;
  memberSlug: string;
  modifierPressed: boolean;
  stemParts: ReadonlySet<string>;
  stemPartsReady: boolean;
  disabled: boolean;
  recentMove: InstrumentAssignmentLastMove | null;
  onOpenNotes: (note: SongInstrumentNote) => void;
}) {
  const assignment = song.instrumentAssignments.players[slotIndex];
  const assignedInstrumentId = assignment
    ? assignmentInstrumentId(assignment)
    : null;
  const playerStem = assignedInstrumentId
    ? PLAYER_STEM_BY_INSTRUMENT_ID[assignedInstrumentId]
    : undefined;
  const stemLink: AssignmentStemLink | undefined = assignment
    && assignedInstrumentId
    && assignedInstrumentId !== "notes"
    ? playerStem
      ? {
          href: assignmentPlayerHref({
            songSlug: song.slug,
            mix: playerStem.mix,
            part: playerStem.part,
            memberSlug,
          }),
          label: INSTRUMENTS[assignedInstrumentId].label,
          availability: stemPartsReady
            ? stemParts.has(playerStem.part) ? "available" : "missing"
            : "unknown",
        }
      : {
          label: INSTRUMENTS[assignedInstrumentId].label,
          availability: "missing",
        }
    : undefined;
  const recentlyMoved = Boolean(
    assignment
    && recentMove?.kind === "instrument"
    && recentMove?.zone === "player"
    && recentMove.songId === song.id
    && recentMove.slotIndex === slotIndex
    && recentMove.assignmentKey === instrumentAssignmentKey(assignment),
  );
  const { ref, isDropTarget } = useDroppable<InstrumentDropData>({
    id: `drop:player:${song.id}:${slotIndex}`,
    type: "instrument-slot",
    accept: "instrument",
    data: { kind: "instrument-drop", zone: "player", songId: song.id, slotIndex },
    disabled,
  });

  return (
    <div
      ref={!disabled ? ref : undefined}
      data-testid={`player-slot-${song.id}-${slotIndex}`}
      aria-label={`${memberName} instrument for ${song.title}`}
      className={cn(
        "group/part-link relative mx-auto flex size-16 items-center justify-center rounded-md border-2 border-dashed bg-muted/35 transition-[background-color,border-color,transform] duration-150",
        assignment && "border-solid bg-card",
        isDropTarget && "scale-[1.04] border-primary bg-accent",
      )}
    >
      {assignment ? (
        <DraggableInstrument
          assignment={assignment}
          source={{ zone: "player", songId: song.id, slotIndex }}
          disabled={disabled}
          recentlyMoved={recentlyMoved}
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
      {assignment ? (
        <AssignmentStemAffordance
          stemLink={stemLink}
          modifierPressed={modifierPressed}
        />
      ) : null}
    </div>
  );
}

function DraggableVocalAssignment({
  song,
  slotIndex,
  assignment,
  disabled,
  recentMove,
  onToggleLead,
}: {
  song: Song;
  slotIndex: number;
  assignment: SongVocalAssignment;
  disabled: boolean;
  recentMove: InstrumentAssignmentLastMove | null;
  onToggleLead: () => void;
}) {
  const { ref, isDragging } = useDraggable<VocalDragData>({
    id: `vocal:${song.id}:${slotIndex}:${assignment.partSlug}`,
    type: "vocal",
    data: { kind: "vocal", songId: song.id, slotIndex, assignment },
    disabled,
    feedback: "clone",
  });
  const recentlyMoved = Boolean(
    recentMove?.kind === "vocal"
    && recentMove.songId === song.id
    && recentMove.slotIndex === slotIndex
    && recentMove.assignmentKey === assignment.partSlug,
  );

  return (
    <div
      ref={!disabled ? ref : undefined}
      role="button"
      tabIndex={!disabled ? 0 : -1}
      aria-disabled={disabled}
      aria-label={`${partLabel(assignment.partSlug)}${assignment.lead ? ", lead vocal" : ""}. Drag to move; Alt click to toggle lead.`}
      title={`${partLabel(assignment.partSlug)} · Alt/Option-click to toggle lead`}
      onClick={(event) => {
        if (!disabled && event.altKey) onToggleLead();
      }}
      onKeyDown={(event) => {
        if (!disabled && event.altKey && event.key === "Enter") {
          event.preventDefault();
          onToggleLead();
        }
      }}
      className={cn(
        "swell-vocal-tile flex h-5 w-16 touch-none select-none items-center justify-center rounded-sm border border-input bg-card px-1 font-mono text-[9px] font-bold leading-none uppercase text-foreground outline-none transition-[transform,opacity,box-shadow,border-color,background-color] duration-150 focus-visible:ring-3 focus-visible:ring-ring/40",
        !disabled ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        assignment.lead && "swell-lead-vocal",
        isDragging && "opacity-35",
        recentlyMoved && "swell-recent-assignment",
      )}
    >
      <span>{partLabel(assignment.partSlug)}</span>
    </div>
  );
}

function VocalSlot({
  song,
  slotIndex,
  memberSlug,
  modifierPressed,
  stemParts,
  stemPartsReady,
  assignment,
  editable,
  disabled,
  recentMove,
  onToggleLead,
}: {
  song: Song;
  slotIndex: number;
  memberSlug: string;
  modifierPressed: boolean;
  stemParts: ReadonlySet<string>;
  stemPartsReady: boolean;
  assignment: SongVocalAssignment | null;
  editable: boolean;
  disabled: boolean;
  recentMove: InstrumentAssignmentLastMove | null;
  onToggleLead: () => void;
}) {
  const { ref, isDropTarget } = useDroppable<VocalDropData>({
    id: `drop:vocal:${song.id}:${slotIndex}`,
    type: "vocal-slot",
    accept: "vocal",
    data: { kind: "vocal-drop", zone: "vocal", songId: song.id, slotIndex },
    disabled: disabled || !editable,
  });
  const recentlyCleared = Boolean(
    !assignment
    && recentMove?.kind === "vocal"
    && recentMove.removed
    && recentMove.songId === song.id
    && recentMove.slotIndex === slotIndex,
  );
  const stemLink: AssignmentStemLink | undefined = assignment
    ? {
        href: assignmentPlayerHref({
          songSlug: song.slug,
          mix: "voc",
          part: assignment.partSlug,
          memberSlug,
        }),
        label: partLabel(assignment.partSlug),
        availability: stemPartsReady
          ? stemParts.has(assignment.partSlug) ? "available" : "missing"
          : "unknown",
      }
    : undefined;

  return (
    <div
      ref={editable ? ref : undefined}
      data-testid={`vocal-slot-${song.id}-${slotIndex}`}
      aria-label={!assignment
        ? editable
          ? `No vocal part for slot ${slotIndex + 1}. Drop a vocal part here.`
          : `No vocal part for slot ${slotIndex + 1}.`
        : undefined}
      className={cn(
        "group/part-link relative mx-auto mt-0.5 flex h-6 w-16 items-center justify-center rounded-md border border-dashed border-transparent transition-[background-color,border-color,box-shadow,transform] duration-150",
        editable && !assignment && "border-input bg-muted/35",
        isDropTarget && "scale-[1.04] border-primary bg-accent",
        recentlyCleared && "swell-recent-assignment",
      )}
    >
      {assignment ? (
        editable ? (
          <DraggableVocalAssignment
            song={song}
            slotIndex={slotIndex}
            assignment={assignment}
            disabled={disabled}
            recentMove={recentMove}
            onToggleLead={onToggleLead}
          />
        ) : (
          <div
            aria-label={`${partLabel(assignment.partSlug)}${assignment.lead ? ", lead vocal" : ""}.`}
            title={partLabel(assignment.partSlug)}
            className={cn(
              "swell-vocal-tile flex h-5 w-16 select-none items-center justify-center rounded-sm border border-transparent bg-transparent px-1 font-mono text-[9px] font-semibold leading-none uppercase text-muted-foreground",
              assignment.lead && "swell-lead-vocal",
              recentMove?.kind === "vocal"
                && recentMove.songId === song.id
                && recentMove.slotIndex === slotIndex
                && recentMove.assignmentKey === assignment.partSlug
                && "swell-recent-assignment",
            )}
          >
            <span>{partLabel(assignment.partSlug)}</span>
          </div>
        )
      ) : editable ? null : (
        <span aria-hidden className="font-mono text-[10px] font-semibold text-muted-foreground">
          –
        </span>
      )}
      {assignment ? (
        <AssignmentStemAffordance
          stemLink={stemLink}
          modifierPressed={modifierPressed}
        />
      ) : null}
    </div>
  );
}

function TracksSlot({
  song,
  disabled,
  recentMove,
  onOpenNotes,
}: {
  song: Song;
  disabled: boolean;
  recentMove: InstrumentAssignmentLastMove | null;
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
              recentlyMoved={Boolean(
                recentMove?.kind === "instrument"
                && recentMove.zone === "tracks"
                && recentMove.songId === song.id
                && recentMove.trackIndex === trackIndex
                && recentMove.assignmentKey === instrumentAssignmentKey(assignment)
              )}
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

function UnassignedStemSlot({
  song,
  stemParts,
  stemPartsReady,
}: {
  song: Song;
  stemParts: ReadonlySet<string>;
  stemPartsReady: boolean;
}) {
  const instrumentIds = stemPartsReady
    ? unassignedStemInstrumentIds(song, stemParts)
    : [];
  const labels = instrumentIds.map((instrumentId) => INSTRUMENTS[instrumentId].label);

  return (
    <div
      data-testid={`unassigned-stems-${song.id}`}
      aria-busy={!stemPartsReady}
      aria-label={stemPartsReady
        ? labels.length
          ? `Unassigned stems for ${song.title}: ${labels.join(", ")}`
          : `No unassigned stems for ${song.title}`
        : `Loading unassigned stems for ${song.title}`}
      className="flex min-h-16 flex-wrap items-center justify-center gap-1.5 py-1"
    >
      {!stemPartsReady ? (
        <Skeleton className="size-9 rounded-md" />
      ) : instrumentIds.length ? (
        instrumentIds.map((instrumentId) => {
          const instrument = INSTRUMENTS[instrumentId];
          if (!instrument.imageSrc) return null;

          return (
            <div
              key={instrumentId}
              data-testid={`unassigned-stem-${song.id}-${instrumentId}`}
              title={`${instrument.label} stem is not assigned to a band member`}
              className="size-9 shrink-0 rounded-md border bg-card p-0.5 opacity-70 shadow-sm"
            >
              <Image
                src={instrument.imageSrc}
                alt={`${instrument.label} stem is unassigned`}
                width={170}
                height={170}
                draggable={false}
                className="size-full rounded-[calc(var(--radius-md)-3px)] object-cover"
              />
            </div>
          );
        })
      ) : (
        <span aria-hidden className="font-mono text-xs font-semibold text-muted-foreground/55">
          –
        </span>
      )}
    </div>
  );
}

function TrashDropZone({ disabled }: { disabled: boolean }) {
  const { ref, isDropTarget } = useDroppable<InstrumentDropData>({
    id: "drop:trash",
    type: "instrument-trash",
    accept: ["instrument", "vocal"],
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
  columns,
  vocalState,
  canEdit,
  disabled,
  uploading,
  uploadProgress,
  canUpload,
  recentMove,
  modifierPressed,
  stemParts,
  stemPartsReady,
  onPlay,
  onUpload,
  onOpenSongNotes,
  onOpenInstrumentNote,
  onShowVocalsChange,
  onToggleLead,
}: {
  song: Song;
  columns: BandColumn[];
  vocalState: VocalArrangementState;
  canEdit: boolean;
  disabled: boolean;
  uploading: boolean;
  uploadProgress: number;
  canUpload: boolean;
  recentMove: InstrumentAssignmentLastMove | null;
  modifierPressed: boolean;
  stemParts: ReadonlySet<string>;
  stemPartsReady: boolean;
  onPlay: () => void;
  onUpload: () => void;
  onOpenSongNotes: () => void;
  onOpenInstrumentNote: (note: SongInstrumentNote) => void;
  onShowVocalsChange: (checked: boolean) => void;
  onToggleLead: (slotIndex: number) => void;
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
          {canEdit ? (
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
          ) : null}
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
              {canEdit && song.notes?.trim() ? (
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
              ) : canEdit ? (
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
              ) : null}
            </div>
            {canEdit ? (
              <label
                htmlFor={`edit-vocals-${song.id}`}
                className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                <Switch
                  id={`edit-vocals-${song.id}`}
                  size="sm"
                  checked={vocalState.showVocals}
                  disabled={disabled}
                  onCheckedChange={onShowVocalsChange}
                />
                Edit vocals
              </label>
            ) : null}
          </div>
        </div>
      </TableCell>
      {columns.map((column, slotIndex) => (
        <TableCell key={column.member.id} className="px-2 py-1 text-center align-middle">
          <PlayerSlot
            song={song}
            slotIndex={slotIndex}
            memberName={column.member.displayName}
            memberSlug={column.member.slug}
            modifierPressed={modifierPressed}
            stemParts={stemParts}
            stemPartsReady={stemPartsReady}
            disabled={disabled}
            recentMove={recentMove}
            onOpenNotes={onOpenInstrumentNote}
          />
          <VocalSlot
            song={song}
            slotIndex={slotIndex}
            memberSlug={column.member.slug}
            modifierPressed={modifierPressed}
            stemParts={stemParts}
            stemPartsReady={stemPartsReady}
            assignment={vocalState.vocalAssignments[slotIndex] ?? null}
            editable={canEdit && vocalState.showVocals}
            disabled={disabled}
            recentMove={recentMove}
            onToggleLead={() => onToggleLead(slotIndex)}
          />
        </TableCell>
      ))}
      <TableCell className="p-2 pr-4">
        <TracksSlot
          song={song}
          disabled={disabled}
          recentMove={recentMove}
          onOpenNotes={onOpenInstrumentNote}
        />
      </TableCell>
      <TableCell className="px-2 py-1 text-center align-middle">
        <UnassignedStemSlot
          song={song}
          stemParts={stemParts}
          stemPartsReady={stemPartsReady}
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
  const [assignmentSessionId] = useState(() => crypto.randomUUID());
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [stemPartsBySongId, setStemPartsBySongId] =
    useState<Map<string, Set<string>>>(new Map());
  const [stemPartsSnapshotKey, setStemPartsSnapshotKey] =
    useState<string | null>(null);
  const [stemPartsError, setStemPartsError] = useState<string | null>(null);
  const [partLinkModifierPressed, setPartLinkModifierPressed] = useState(false);
  const [bandsLoading, setBandsLoading] = useState(true);
  const [bands, setBands] = useState<Band[]>([]);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [selectedBandId, setSelectedBandId] = useState("");
  const [arrangementsBySongId, setArrangementsBySongId] =
    useState<Map<string, BandSongArrangement>>(new Map());
  const [arrangementsReady, setArrangementsReady] = useState(false);
  const [arrangementsError, setArrangementsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collaborationState, setCollaborationState] =
    useState<InstrumentAssignmentCollaborationState>({
      lock: null,
      lastMove: null,
    });
  const [collaborationReady, setCollaborationReady] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const [recentMove, setRecentMove] =
    useState<InstrumentAssignmentLastMove | null>(null);
  const [assignmentDragActive, setAssignmentDragActive] = useState(false);
  const [localAssignmentInProgress, setLocalAssignmentInProgress] =
    useState(false);
  const [localFinalizing, setLocalFinalizing] = useState(false);
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
  const songsRef = useRef<Song[]>([]);
  const baseSongsRef = useRef<Song[]>([]);
  const arrangementsRef = useRef<Map<string, BandSongArrangement>>(new Map());
  const latestSnapshotSongsRef = useRef<Song[]>([]);
  const activeDragRef = useRef<ActiveAssignmentDrag | null>(null);
  const collaborationInitializedRef = useRef(false);
  const lastSeenMoveIdRef = useRef<string | null>(null);
  const recentMoveTimeoutRef = useRef<number | null>(null);

  const assignmentUserLabel =
    admin.user?.displayName?.trim()
    || admin.user?.email?.split("@")[0]
    || "Admin";
  const selectedBand = useMemo(
    () => bands.find((band) => band.id === selectedBandId) ?? null,
    [bands, selectedBandId],
  );
  const columns = useMemo(
    () => columnsForBand(selectedBand, members),
    [members, selectedBand],
  );
  const songIdsKey = useMemo(
    () => songs.map((song) => song.id).sort().join(","),
    [songs],
  );
  const stemPartsReady = stemPartsSnapshotKey === songIdsKey;

  function changeSelectedBand(bandId: string) {
    const emptyArrangements = new Map<string, BandSongArrangement>();
    arrangementsRef.current = emptyArrangements;
    setArrangementsBySongId(emptyArrangements);
    setArrangementsError(null);
    setArrangementsReady(false);
    const fallbackSongs = songsWithBandArrangements(baseSongsRef.current, emptyArrangements);
    latestSnapshotSongsRef.current = fallbackSongs;
    songsRef.current = fallbackSongs;
    setSongs(fallbackSongs);
    setSelectedBandId(bandId);
  }

  useEffect(() => {
    let active = true;
    Promise.all([listBands(), listMembers()])
      .then(([nextBands, nextMembers]) => {
        if (!active) return;
        setBands(nextBands);
        setMembers(nextMembers);
        const rememberedBandId = window.localStorage.getItem(SELECTED_BAND_STORAGE_KEY);
        const initialBand = nextBands.find((band) => band.id === rememberedBandId)
          ?? nextBands.find((band) => band.title.trim().toLowerCase() === "startup")
          ?? nextBands[0];
        setSelectedBandId(initialBand?.id ?? "");
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(caught instanceof Error ? caught.message : "Could not load bands.");
      })
      .finally(() => {
        if (active) setBandsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return subscribeSongs(
      (items) => {
        baseSongsRef.current = items;
        const nextSongs = songsWithBandArrangements(items, arrangementsRef.current);
        latestSnapshotSongsRef.current = nextSongs;
        songsRef.current = nextSongs;
        setSongs(nextSongs);
        setLoadError(null);
        setSongsLoading(false);
      },
      (caught) => {
        setLoadError(caught.message || "Could not load songs.");
        setSongsLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    return subscribeSongMixerStemParts(
      songIdsKey ? songIdsKey.split(",") : [],
      (partsBySongId) => {
        setStemPartsBySongId(partsBySongId);
        setStemPartsSnapshotKey(songIdsKey);
        setStemPartsError(null);
      },
      (caught) => {
        setStemPartsSnapshotKey(null);
        setStemPartsError(caught.message || "Could not load stem links.");
      },
    );
  }, [songIdsKey]);

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => {
      setPartLinkModifierPressed(event.ctrlKey || event.metaKey);
    };
    const clearModifier = () => setPartLinkModifierPressed(false);

    window.addEventListener("keydown", updateModifier);
    window.addEventListener("keyup", updateModifier);
    window.addEventListener("blur", clearModifier);
    return () => {
      window.removeEventListener("keydown", updateModifier);
      window.removeEventListener("keyup", updateModifier);
      window.removeEventListener("blur", clearModifier);
    };
  }, []);

  useEffect(() => {
    if (!selectedBandId) return;

    window.localStorage.setItem(SELECTED_BAND_STORAGE_KEY, selectedBandId);
    return subscribeBandSongArrangements(
      selectedBandId,
      (arrangements) => {
        const nextBySongId = new Map(
          arrangements.map((arrangement) => [arrangement.songId, arrangement]),
        );
        arrangementsRef.current = nextBySongId;
        setArrangementsBySongId(nextBySongId);
        const nextSongs = songsWithBandArrangements(baseSongsRef.current, nextBySongId);
        latestSnapshotSongsRef.current = nextSongs;
        songsRef.current = nextSongs;
        setSongs(nextSongs);
        setArrangementsError(null);
        setArrangementsReady(true);
      },
      (caught) => {
        setArrangementsError(caught.message || "Could not load this band’s arrangements.");
        setArrangementsReady(true);
      },
    );
  }, [selectedBandId]);

  useEffect(() => {
    return subscribeInstrumentAssignmentCollaboration(
      (nextState) => {
        setCollaborationState(nextState);
        setCollaborationError(null);
        setCollaborationReady(true);

        const nextMoveId = nextState.lastMove?.changeId ?? null;
        if (!collaborationInitializedRef.current) {
          collaborationInitializedRef.current = true;
          lastSeenMoveIdRef.current = nextMoveId;
          return;
        }

        if (nextState.lastMove && nextMoveId !== lastSeenMoveIdRef.current) {
          lastSeenMoveIdRef.current = nextMoveId;
          setRecentMove(nextState.lastMove);
          if (recentMoveTimeoutRef.current !== null) {
            window.clearTimeout(recentMoveTimeoutRef.current);
          }
          recentMoveTimeoutRef.current = window.setTimeout(() => {
            setRecentMove(null);
            recentMoveTimeoutRef.current = null;
          }, 2_000);
        }
      },
      (caught) => {
        setCollaborationError(
          caught.message || "Live assignment activity is unavailable.",
        );
        setCollaborationReady(true);
      },
    );
  }, []);

  useEffect(() => {
    const lock = collaborationState.lock;
    if (!lock) return;

    const timeoutId = window.setTimeout(() => {
      setCollaborationState((current) =>
        current.lock?.sessionId === lock.sessionId
          ? { ...current, lock: null }
          : current,
      );
    }, Math.max(0, lock.expiresAt - Date.now()) + 100);

    return () => window.clearTimeout(timeoutId);
  }, [collaborationState.lock]);

  useEffect(() => {
    return () => {
      if (recentMoveTimeoutRef.current !== null) {
        window.clearTimeout(recentMoveTimeoutRef.current);
      }
      const activeDrag = activeDragRef.current;
      if (activeDrag && activeDrag.heartbeatId !== null) {
        window.clearInterval(activeDrag.heartbeatId);
      }
      if (activeDrag) {
        void releaseInstrumentAssignmentLock(assignmentSessionId);
      }
    };
  }, [assignmentSessionId]);

  async function runDatabaseSave(
    save: () => Promise<void>,
    failureMessage: string,
  ) {
    setPendingSaves((current) => current + 1);
    setSaveFailed(false);

    try {
      await save();
      return true;
    } catch (caught) {
      setSaveFailed(true);
      toast.error(
        caught instanceof Error
          ? `${failureMessage}: ${caught.message}`
          : `${failureMessage}.`,
      );
      return false;
    } finally {
      setPendingSaves((current) => Math.max(0, current - 1));
    }
  }

  function clearActiveDrag(activeDrag: ActiveAssignmentDrag) {
    if (activeDragRef.current?.id !== activeDrag.id) return;
    if (activeDrag.heartbeatId !== null) {
      window.clearInterval(activeDrag.heartbeatId);
    }
    activeDragRef.current = null;
    setAssignmentDragActive(false);
    setLocalAssignmentInProgress(false);
    setLocalFinalizing(false);
  }

  async function releaseActiveDrag(activeDrag: ActiveAssignmentDrag) {
    try {
      await releaseInstrumentAssignmentLock(assignmentSessionId);
    } catch (caught) {
      console.warn("[swell-parts] Could not release the assignment lock.", caught);
    } finally {
      clearActiveDrag(activeDrag);
    }
  }

  async function commitInstrumentDrop(
    result: InstrumentDropResult,
    activeDrag: ActiveAssignmentDrag,
  ) {
    if (!selectedBandId) {
      await releaseActiveDrag(activeDrag);
      return;
    }
    const previousArrangements = arrangementsRef.current;
    const nextArrangements = new Map(previousArrangements);
    result.changes.forEach(({ songId, assignments }) => {
      const existing = nextArrangements.get(songId);
      nextArrangements.set(songId, {
        bandId: selectedBandId,
        songId,
        instrumentAssignments: assignments,
        showVocals: existing?.showVocals ?? false,
        vocalAssignments: existing?.vocalAssignments,
      });
    });
    arrangementsRef.current = nextArrangements;
    setArrangementsBySongId(nextArrangements);
    songsRef.current = result.nextSongs;
    setSongs(result.nextSongs);
    const lastMove = result.lastMove
      ? { ...result.lastMove, changeId: crypto.randomUUID() }
      : null;
    const saved = await runDatabaseSave(
      () => saveSongInstrumentAssignmentMove(
        selectedBandId,
        result.changes,
        assignmentSessionId,
        lastMove,
      ),
      "Instrument change was not saved",
    );

    if (saved) {
      clearActiveDrag(activeDrag);
      return;
    }

    arrangementsRef.current = previousArrangements;
    setArrangementsBySongId(previousArrangements);
    songsRef.current = latestSnapshotSongsRef.current;
    setSongs(latestSnapshotSongsRef.current);
    await releaseActiveDrag(activeDrag);
  }

  function vocalStateForSong(songId: string): VocalArrangementState {
    const arrangement = arrangementsBySongId.get(songId);
    return {
      showVocals: arrangement?.showVocals ?? false,
      vocalAssignments: normalizeVocalAssignments(
        arrangement?.vocalAssignments,
        columns,
      ),
    };
  }

  function setLocalVocalArrangement(
    songId: string,
    nextState: VocalArrangementState,
  ) {
    if (!selectedBandId) return;
    const nextArrangements = new Map(arrangementsRef.current);
    const existing = nextArrangements.get(songId);
    nextArrangements.set(songId, {
      bandId: selectedBandId,
      songId,
      instrumentAssignments: existing?.instrumentAssignments,
      showVocals: nextState.showVocals,
      vocalAssignments: persistedVocalAssignments(nextState),
    });
    arrangementsRef.current = nextArrangements;
    setArrangementsBySongId(nextArrangements);
  }

  async function commitVocalDrop(
    songId: string,
    nextState: VocalArrangementState,
    moveTarget: VocalAssignmentMoveTarget,
    activeDrag: ActiveAssignmentDrag,
  ) {
    if (!selectedBandId) {
      await releaseActiveDrag(activeDrag);
      return;
    }
    const previousArrangements = arrangementsRef.current;
    setLocalVocalArrangement(songId, nextState);
    const lastMove: InstrumentAssignmentLastMove = {
      ...moveTarget,
      changeId: crypto.randomUUID(),
    };
    const saved = await runDatabaseSave(
      () => saveBandSongVocalAssignments(
        selectedBandId,
        songId,
        nextState.showVocals,
        persistedVocalAssignments(nextState),
        assignmentSessionId,
        lastMove,
      ),
      "Vocal change was not saved",
    );
    if (saved) {
      clearActiveDrag(activeDrag);
      return;
    }
    arrangementsRef.current = previousArrangements;
    setArrangementsBySongId(previousArrangements);
    await releaseActiveDrag(activeDrag);
  }

  async function saveVocalSetting(
    songId: string,
    nextState: VocalArrangementState,
  ) {
    if (!selectedBandId || editingDisabled) return;
    const previousArrangements = arrangementsRef.current;
    setLocalAssignmentInProgress(true);
    try {
      await acquireInstrumentAssignmentLock(
        assignmentSessionId,
        assignmentUserLabel,
      );
      setLocalVocalArrangement(songId, nextState);
      const saved = await runDatabaseSave(
        () => saveBandSongVocalAssignments(
          selectedBandId,
          songId,
          nextState.showVocals,
          persistedVocalAssignments(nextState),
          assignmentSessionId,
        ),
        "Vocal setting was not saved",
      );
      if (!saved) {
        arrangementsRef.current = previousArrangements;
        setArrangementsBySongId(previousArrangements);
      }
    } catch (caught) {
      arrangementsRef.current = previousArrangements;
      setArrangementsBySongId(previousArrangements);
      toast.info(
        caught instanceof InstrumentAssignmentLockedError
          ? `Assignment in progress: ${caught.userLabel}`
          : "Could not change this vocal setting.",
      );
    } finally {
      await releaseInstrumentAssignmentLock(assignmentSessionId).catch(() => undefined);
      setLocalAssignmentInProgress(false);
    }
  }

  function handleDragStart(
    _event: AssignmentDragStartEvent,
    manager: DragDropManager,
  ) {
    if (!admin.isAdmin) return;

    const dragId = crypto.randomUUID();
    setAssignmentDragActive(true);
    setLocalAssignmentInProgress(true);
    setLocalFinalizing(false);

    const lockPromise = acquireInstrumentAssignmentLock(
      assignmentSessionId,
      assignmentUserLabel,
    )
      .then(() => {
        const activeDrag = activeDragRef.current;
        if (activeDrag?.id !== dragId) return false;

        activeDrag.heartbeatId = window.setInterval(() => {
          void refreshInstrumentAssignmentLock(assignmentSessionId)
            .then((stillOwnsLock) => {
              const currentDrag = activeDragRef.current;
              if (stillOwnsLock || currentDrag?.id !== dragId) return;

              toast.error("The assignment lock was lost. Try the move again.");
              setPendingDuplicateDrop(null);
              clearActiveDrag(currentDrag);
              if (currentDrag.phase === "dragging") {
                currentDrag.manager.actions.stop({ canceled: true });
              }
            })
            .catch((caught) => {
              console.warn(
                "[swell-parts] Could not refresh the assignment lock.",
                caught,
              );
            });
        }, 5_000);
        return true;
      })
      .catch((caught) => {
        const activeDrag = activeDragRef.current;
        const message = caught instanceof InstrumentAssignmentLockedError
          ? `Assignment in progress: ${caught.userLabel}`
          : "Could not start this assignment. Check the live connection and try again.";
        toast.info(message);

        if (activeDrag?.id === dragId && activeDrag.phase === "dragging") {
          activeDrag.manager.actions.stop({ canceled: true });
        }
        return false;
      });

    activeDragRef.current = {
      id: dragId,
      phase: "dragging",
      manager,
      lockPromise,
      heartbeatId: null,
    };
  }

  function handleDragEnd(event: AssignmentDragEndEvent) {
    setAssignmentDragActive(false);
    const activeDrag = activeDragRef.current;
    if (!activeDrag || activeDrag.phase !== "dragging") return;

    activeDrag.phase = "ending";
    setLocalFinalizing(true);
    void finishDragEnd(event, activeDrag);
  }

  async function finishDragEnd(
    event: AssignmentDragEndEvent,
    activeDrag: ActiveAssignmentDrag,
  ) {
    const acquired = await activeDrag.lockPromise;
    if (!acquired) {
      clearActiveDrag(activeDrag);
      return;
    }

    if (event.canceled || !admin.isAdmin) {
      await releaseActiveDrag(activeDrag);
      return;
    }

    const sourceData = event.operation.source?.data as
      | InstrumentDragData
      | VocalDragData
      | SongRowDragData
      | undefined;
    const targetData = event.operation.target?.data as
      | InstrumentDropData
      | VocalDropData
      | SongRowDropData
      | undefined;

    if (sourceData?.kind === "song-row") {
      if (targetData?.kind !== "song-row-drop") {
        await releaseActiveDrag(activeDrag);
        return;
      }

      const currentSongs = songsRef.current;
      const sourceIndex = currentSongs.findIndex((song) => song.id === sourceData.songId);
      const targetIndex = currentSongs.findIndex((song) => song.id === targetData.songId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        await releaseActiveDrag(activeDrag);
        return;
      }

      const reorderedSongs = [...currentSongs];
      const movedSong = reorderedSongs.splice(sourceIndex, 1)[0];
      if (!movedSong) {
        await releaseActiveDrag(activeDrag);
        return;
      }
      reorderedSongs.splice(targetIndex, 0, movedSong);

      const nextSongs = reorderedSongs.map((song, instrumentOrder) => ({
        ...song,
        instrumentOrder,
      }));
      const changes = nextSongs.map((song) => ({
        songId: song.id,
        instrumentOrder: song.instrumentOrder ?? 0,
      }));

      songsRef.current = nextSongs;
      setSongs(nextSongs);
      const saved = await runDatabaseSave(
        () => saveSongInstrumentOrder(changes),
        "Song order was not saved",
      );
      if (!saved) {
        songsRef.current = latestSnapshotSongsRef.current;
        setSongs(latestSnapshotSongsRef.current);
      }
      await releaseActiveDrag(activeDrag);
      return;
    }

    if (sourceData?.kind === "vocal") {
      if (!selectedBandId) {
        await releaseActiveDrag(activeDrag);
        return;
      }

      const currentState = {
        showVocals: arrangementsRef.current.get(sourceData.songId)?.showVocals ?? true,
        vocalAssignments: normalizeVocalAssignments(
          arrangementsRef.current.get(sourceData.songId)?.vocalAssignments,
          columns,
        ),
      };
      const sourceAssignment = currentState.vocalAssignments[sourceData.slotIndex];
      if (!sourceAssignment) {
        await releaseActiveDrag(activeDrag);
        return;
      }

      if (targetData?.kind === "instrument-drop" && targetData.zone === "trash") {
        const nextAssignments = [...currentState.vocalAssignments];
        nextAssignments[sourceData.slotIndex] = null;
        await commitVocalDrop(
          sourceData.songId,
          { showVocals: currentState.showVocals, vocalAssignments: nextAssignments },
          {
            kind: "vocal",
            bandId: selectedBandId,
            songId: sourceData.songId,
            assignmentKey: sourceAssignment.partSlug,
            partSlug: sourceAssignment.partSlug,
            zone: "vocal",
            slotIndex: sourceData.slotIndex,
            removed: true,
          },
          activeDrag,
        );
        return;
      }

      if (
        targetData?.kind !== "vocal-drop"
        || sourceData.songId !== targetData.songId
        || sourceData.slotIndex === targetData.slotIndex
      ) {
        await releaseActiveDrag(activeDrag);
        return;
      }

      const targetAssignment = currentState.vocalAssignments[targetData.slotIndex];
      const sourceMemberId = columns[sourceData.slotIndex]?.member.id;
      const targetMemberId = columns[targetData.slotIndex]?.member.id;
      if (!sourceMemberId || !targetMemberId) {
        await releaseActiveDrag(activeDrag);
        return;
      }

      const nextAssignments = [...currentState.vocalAssignments];
      nextAssignments[sourceData.slotIndex] = targetAssignment
        ? {
            memberId: sourceMemberId,
            partSlug: targetAssignment.partSlug,
            lead: targetAssignment.lead,
          }
        : null;
      nextAssignments[targetData.slotIndex] = {
        memberId: targetMemberId,
        partSlug: sourceAssignment.partSlug,
        lead: sourceAssignment.lead,
      };
      await commitVocalDrop(
        sourceData.songId,
        { showVocals: currentState.showVocals, vocalAssignments: nextAssignments },
        {
          kind: "vocal",
          bandId: selectedBandId,
          songId: sourceData.songId,
          assignmentKey: sourceAssignment.partSlug,
          partSlug: sourceAssignment.partSlug,
          zone: "vocal",
          slotIndex: targetData.slotIndex,
        },
        activeDrag,
      );
      return;
    }

    if (sourceData?.kind !== "instrument") {
      await releaseActiveDrag(activeDrag);
      return;
    }

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
      await releaseActiveDrag(activeDrag);
      return;
    }

    if (
      sourceData.source.zone === "player"
      && instrumentTarget.zone === "player"
      && sourceData.source.songId === instrumentTarget.songId
      && sourceData.source.slotIndex === instrumentTarget.slotIndex
    ) {
      await releaseActiveDrag(activeDrag);
      return;
    }

    if (
      sourceData.source.zone === "tracks"
      && instrumentTarget.zone === "tracks"
      && sourceData.source.songId === instrumentTarget.songId
      && !copyRequested
    ) {
      await releaseActiveDrag(activeDrag);
      return;
    }

    const currentSongs = songsRef.current;
    const result = planInstrumentDrop(
      currentSongs,
      selectedBandId,
      sourceData,
      instrumentTarget,
      copyRequested,
    );
    if (!result) {
      await releaseActiveDrag(activeDrag);
      return;
    }

    const warnings = findIntroducedDuplicates(currentSongs, result);
    if (warnings.length) {
      activeDrag.phase = "awaiting-confirmation";
      setPendingDuplicateDrop({ result, warnings });
      return;
    }

    await commitInstrumentDrop(result, activeDrag);
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
    if (!notesSongId || !admin.isAdmin || editingDisabled) return;

    const song = songs.find((item) => item.id === notesSongId);
    if (!song) return;

    const notesTitle = notesTitleDraft.trim() || "Notes";
    const notes = notesDraft.trim();
    let instrumentNoteLockAcquired = false;
    setNotesSaving(true);
    setNotesError(null);

    try {
      if (notesInstrumentId) {
        setLocalAssignmentInProgress(true);
        await acquireInstrumentAssignmentLock(
          assignmentSessionId,
          assignmentUserLabel,
        );
        instrumentNoteLockAcquired = true;
        const assignments = updateInstrumentNoteAssignment(
          song.instrumentAssignments,
          notesInstrumentId,
          notesTitle,
          notes,
        );
        if (!assignments) {
          throw new Error("This Notes tile is no longer assigned to the song.");
        }

        if (!selectedBandId) throw new Error("Choose a band before editing assignments.");
        await saveSongInstrumentAssignments(selectedBandId, [
          { songId: song.id, assignments },
        ]);
        const nextArrangements = new Map(arrangementsRef.current);
        const existing = nextArrangements.get(song.id);
        nextArrangements.set(song.id, {
          bandId: selectedBandId,
          songId: song.id,
          instrumentAssignments: assignments,
          showVocals: existing?.showVocals ?? false,
          vocalAssignments: existing?.vocalAssignments,
        });
        arrangementsRef.current = nextArrangements;
        setArrangementsBySongId(nextArrangements);
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
      if (instrumentNoteLockAcquired) {
        await releaseInstrumentAssignmentLock(assignmentSessionId).catch(
          (caught) => {
            console.warn(
              "[swell-parts] Could not release the assignment lock.",
              caught,
            );
          },
        );
      }
      setLocalAssignmentInProgress(false);
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
  const activeAssignmentLock = collaborationState.lock;
  const assignmentLockedByOther = Boolean(
    activeAssignmentLock
    && activeAssignmentLock.sessionId !== assignmentSessionId,
  );
  const assignmentInProgress = Boolean(
    localAssignmentInProgress || activeAssignmentLock,
  );
  const loading = songsLoading || bandsLoading || Boolean(selectedBandId && !arrangementsReady);
  const editingDisabled =
    !admin.isAdmin
    || admin.loading
    || !selectedBandId
    || !columns.length
    || !arrangementsReady
    || Boolean(arrangementsError)
    || !collaborationReady
    || Boolean(collaborationError)
    || assignmentLockedByOther
    || localFinalizing;
  const visibleRecentMove = recentMove?.bandId === selectedBandId
    ? recentMove
    : null;
  const recentMoveSong = visibleRecentMove
    ? songs.find((song) => song.id === visibleRecentMove.songId)
    : null;
  const recentMoveDestination = visibleRecentMove?.zone === "player"
    ? columns[visibleRecentMove.slotIndex]?.member.displayName ?? `person ${visibleRecentMove.slotIndex + 1}`
    : visibleRecentMove?.zone === "vocal"
      ? columns[visibleRecentMove.slotIndex]?.member.displayName ?? `person ${visibleRecentMove.slotIndex + 1}`
      : visibleRecentMove?.zone === "tracks"
      ? "Trax"
      : null;
  const recentMoveLabel = visibleRecentMove?.kind === "instrument"
    ? INSTRUMENTS[visibleRecentMove.instrumentId].label
    : visibleRecentMove?.kind === "vocal"
      ? partLabel(visibleRecentMove.partSlug)
      : null;
  const recentMoveAnnouncement = visibleRecentMove && recentMoveSong && recentMoveDestination && recentMoveLabel
    ? visibleRecentMove.kind === "vocal" && visibleRecentMove.removed
      ? `${recentMoveLabel} removed from ${recentMoveDestination} for ${recentMoveSong.title}.`
      : `${recentMoveLabel} moved to ${recentMoveDestination} for ${recentMoveSong.title}.`
    : "";

  function handleShowVocalsChange(songId: string, checked: boolean) {
    const current = vocalStateForSong(songId);
    void saveVocalSetting(songId, { ...current, showVocals: checked });
  }

  function handleToggleLead(songId: string, slotIndex: number) {
    const current = vocalStateForSong(songId);
    const nextAssignments = current.vocalAssignments.map((assignment, index) =>
      index === slotIndex && assignment
        ? { ...assignment, lead: !assignment.lead }
        : assignment,
    );
    void saveVocalSetting(songId, {
      ...current,
      vocalAssignments: nextAssignments,
    });
  }

  function cancelPendingDuplicateDrop() {
    setPendingDuplicateDrop(null);
    const activeDrag = activeDragRef.current;
    if (!activeDrag || activeDrag.phase !== "awaiting-confirmation") return;

    activeDrag.phase = "ending";
    void releaseActiveDrag(activeDrag);
  }

  return (
    <AppShell contentClassName="max-w-[88rem]">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {recentMoveAnnouncement}
      </p>
      <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <section className="swell-panel flex h-[calc(100dvh-11.5rem)] min-h-[32rem] flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <p className="swell-page-kicker">Live arrangement</p>
                <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  Band assignments
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              {bands.length ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="assignment-band" className="text-xs font-semibold text-muted-foreground">
                    Band
                  </label>
                  <Select
                    items={bands.map((band) => ({ label: band.title, value: band.id }))}
                    value={selectedBandId}
                    onValueChange={(value) => {
                      if (value) changeSelectedBand(value);
                    }}
                    disabled={assignmentInProgress}
                  >
                    <SelectTrigger id="assignment-band" className="min-w-44 max-w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {bands.map((band) => <SelectItem key={band.id} value={band.id}>{band.title}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {!collaborationReady ? (
                <Badge variant="outline">
                  <LoaderCircleIcon aria-hidden className="animate-spin" />
                  Connecting live updates
                </Badge>
              ) : collaborationError ? (
                <Badge variant="destructive" title={collaborationError}>
                  Live sync unavailable
                </Badge>
              ) : arrangementsError ? (
                <Badge variant="destructive" title={arrangementsError}>
                  Band sync unavailable
                </Badge>
              ) : null}
              {stemPartsError ? (
                <Badge variant="destructive" title={stemPartsError}>
                  Stem links unavailable
                </Badge>
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
            <ul className="grid max-w-3xl list-disc gap-x-8 gap-y-1 pl-5 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
              <li>
                Hold <Kbd>ctrl</Kbd> or <Kbd>cmd</Kbd> while hovering to link to stem
              </li>
              <li>
                If <Kbd>?</Kbd> is shown there is no associated stem / link
              </li>
              {admin.isAdmin ? (
                <>
                  <li>
                    <Kbd>alt</Kbd> + drag to copy instrument
                  </li>
                  <li>
                    <Kbd>alt</Kbd> + click on vocal part to assign lead
                  </li>
                </>
              ) : null}
            </ul>
          </div>

          <div className="relative min-h-0 flex-1">
            {assignmentLockedByOther ? (
              <div className="absolute inset-0 z-40 flex items-start justify-center bg-card/20 px-4 pt-16">
                <Alert className="w-auto max-w-sm shadow-md">
                  <LoaderCircleIcon aria-hidden className="animate-spin" />
                  <AlertTitle>
                    Assignment in progress
                    {activeAssignmentLock?.userLabel
                      ? `: ${activeAssignmentLock.userLabel}`
                      : ""}
                  </AlertTitle>
                </Alert>
              </div>
            ) : null}
            <div
              className={cn(
                "h-full transition-[filter,opacity] duration-150",
                assignmentDragActive ? "overflow-hidden" : "overflow-auto",
                assignmentLockedByOther && "pointer-events-none blur-[2px] opacity-70",
              )}
            >
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
            ) : !bands.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Music2Icon aria-hidden className="text-muted-foreground" />
                <p className="font-semibold">No band selected</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Create a band and give its members default vocal parts in the band editor.
                </p>
              </div>
            ) : !columns.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Mic2Icon aria-hidden className="text-muted-foreground" />
                <p className="font-semibold">This band has no assignment columns</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Edit the band and assign at least one member a default vocal part.
                </p>
              </div>
            ) : songs.length ? (
              <Table
                containerClassName="overflow-visible"
                className="min-w-[74rem] table-fixed"
              >
                <TableCaption className="sr-only">
                  Live instrument, vocal, and tracks assignments for every song.
                </TableCaption>
                <colgroup>
                  <col className="w-72" />
                  {columns.map((column) => (
                    <col key={column.member.id} className="w-24" />
                  ))}
                  <col className="w-80" />
                  <col className="w-24" />
                </colgroup>
                <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
                  <TableRow className="hover:bg-card">
                    <TableHead className="sticky left-0 z-30 bg-card px-4">
                      Song
                    </TableHead>
                    {columns.map((column) => (
                      <TableHead
                        key={column.member.id}
                        className="text-center text-base font-semibold"
                      >
                        <span>{column.member.displayName}</span>
                        <span className="mt-0.5 block font-mono text-[10px] font-medium text-muted-foreground">
                          {partLabel(column.defaultVocalPart)}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="px-3 text-base font-semibold">Trax</TableHead>
                    <TableHead className="px-2 text-center text-xs font-semibold">
                      Unassigned
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {songs.map((song) => (
                    <InstrumentAssignmentRow
                      key={song.id}
                      song={song}
                      columns={columns}
                      vocalState={vocalStateForSong(song.id)}
                      canEdit={admin.isAdmin}
                      disabled={editingDisabled}
                      uploading={uploadingSongId === song.id}
                      uploadProgress={uploadProgress}
                      canUpload={admin.isAdmin}
                      recentMove={visibleRecentMove}
                      modifierPressed={partLinkModifierPressed}
                      stemParts={stemPartsBySongId.get(song.id) ?? EMPTY_STEM_PARTS}
                      stemPartsReady={stemPartsReady}
                      onPlay={() => setPlayingSongId(song.id)}
                      onUpload={() => chooseOriginalRecording(song)}
                      onOpenSongNotes={() => openSongNotes(song)}
                      onOpenInstrumentNote={(note) =>
                        openInstrumentNote(song, note)
                      }
                      onShowVocalsChange={(checked) => handleShowVocalsChange(song.id, checked)}
                      onToggleLead={(slotIndex) => handleToggleLead(song.id, slotIndex)}
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
          </div>

          {admin.isAdmin ? (
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
          ) : null}
        </section>
      </DragDropProvider>

      <AlertDialog
        open={Boolean(pendingDuplicateDrop)}
        onOpenChange={(open) => {
          if (!open) cancelPendingDuplicateDrop();
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
            <AlertDialogCancel onClick={cancelPendingDuplicateDrop}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDuplicateDrop) return;
                const activeDrag = activeDragRef.current;
                if (!activeDrag || activeDrag.phase !== "awaiting-confirmation") {
                  setPendingDuplicateDrop(null);
                  return;
                }
                const result = pendingDuplicateDrop.result;
                activeDrag.phase = "ending";
                setPendingDuplicateDrop(null);
                void commitInstrumentDrop(result, activeDrag);
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
                    disabled={notesSaving || editingDisabled}
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
                  disabled={notesSaving || editingDisabled}
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
              <Button type="submit" disabled={notesSaving || editingDisabled}>
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
