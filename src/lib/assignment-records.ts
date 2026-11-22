import {
  INSTRUMENT_IDS,
  VOCAL_PART_SLUGS,
  type Band,
  type BandMember,
  type BandSongArrangement,
  type Song,
  type SongInstrumentAssignment,
  type SongInstrumentAssignments,
  type SongOriginalRecording,
  type SongTag,
  type VocalPartSlug,
} from "@/lib/domain";

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function memberFromDoc(id: string, data: Record<string, unknown>): BandMember {
  return {
    id,
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    displayName: String(data.displayName ?? data.firstName ?? ""),
    slug: String(data.slug ?? id),
    hidden: data.hidden === true,
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
    photoStoragePath: typeof data.photoStoragePath === "string" ? data.photoStoragePath : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  };
}

export function bandFromDoc(id: string, data: Record<string, unknown>): Band {
  const vocalPartData = data.vocalPartByMemberId && typeof data.vocalPartByMemberId === "object"
    ? data.vocalPartByMemberId as Record<string, unknown>
    : {};
  const vocalPartByMemberId = Object.fromEntries(
    Object.entries(vocalPartData).flatMap(([memberId, value]) =>
      typeof value === "string" && VOCAL_PART_SLUGS.includes(value as VocalPartSlug)
        ? [[memberId, value as VocalPartSlug]]
        : [],
    ),
  );

  return {
    id,
    title: String(data.title ?? ""),
    code: String(data.code ?? ""),
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
    vocalPartByMemberId,
  };
}

export function publicMember(member: BandMember): BandMember {
  return { ...member, email: undefined, phone: undefined, notes: undefined };
}

export function tagFromDoc(id: string, data: Record<string, unknown>): SongTag {
  return {
    id,
    label: String(data.label ?? ""),
    filteredByDefault: data.filteredByDefault === true,
  };
}

export function songFromDoc(id: string, data: Record<string, unknown>): Song {
  return {
    id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? ""),
    sortTitle: String(data.sortTitle ?? data.title ?? ""),
    tagIds: Array.isArray(data.tagIds) ? data.tagIds.map(String) : [],
    published: data.published !== false,
    notes: typeof data.notes === "string" ? data.notes : undefined,
    instrumentOrder:
      typeof data.instrumentOrder === "number" && Number.isFinite(data.instrumentOrder)
        ? data.instrumentOrder
        : undefined,
    timingDurationSeconds:
      typeof data.timingDurationSeconds === "number"
      && Number.isFinite(data.timingDurationSeconds)
      && data.timingDurationSeconds > 0
        ? data.timingDurationSeconds
        : undefined,
    instrumentAssignments: instrumentAssignmentsFromData(
      data.instrumentAssignments,
      {
        title:
          typeof data.notesTitle === "string" ? data.notesTitle : "Notes",
        notes: typeof data.notes === "string" ? data.notes : "",
      },
    ),
    originalRecording: originalRecordingFromData(data.originalRecording),
  };
}

export function bandSongArrangementFromDoc(
  data: Record<string, unknown>,
): BandSongArrangement {
  const vocalAssignments = Array.isArray(data.vocalAssignments)
    ? data.vocalAssignments.flatMap((value) => {
        const assignment = objectValue(value);
        const partSlug = typeof assignment.partSlug === "string"
          && VOCAL_PART_SLUGS.includes(assignment.partSlug as VocalPartSlug)
          ? assignment.partSlug as VocalPartSlug
          : null;
        return typeof assignment.memberId === "string" && partSlug
          ? [{
              memberId: assignment.memberId,
              partSlug,
              lead: assignment.lead === true,
            }]
          : [];
      })
    : undefined;

  return {
    bandId: String(data.bandId ?? ""),
    songId: String(data.songId ?? ""),
    instrumentAssignments: data.instrumentAssignments === undefined
      ? undefined
      : instrumentAssignmentsFromData(data.instrumentAssignments, {
          title: "Notes",
          notes: "",
        }),
    showVocals: data.showVocals === true,
    vocalAssignments,
  };
}

function instrumentAssignmentsFromData(
  value: unknown,
  legacyNote: { title: string; notes: string },
): SongInstrumentAssignments {
  const data = objectValue(value);
  const validInstrumentIds = new Set<string>(
    INSTRUMENT_IDS.filter((instrumentId) => instrumentId !== "notes"),
  );
  const assignmentFromData = (
    storedValue: unknown,
    fallbackId: string,
  ): SongInstrumentAssignment | null => {
    if (typeof storedValue === "string") {
      if (storedValue === "notes") {
        return {
          kind: "notes",
          id: `legacy-${fallbackId}`,
          title: legacyNote.title.trim() || "Notes",
          notes: legacyNote.notes,
        };
      }

      return validInstrumentIds.has(storedValue)
        ? storedValue as SongInstrumentAssignment
        : null;
    }

    const storedNote = objectValue(storedValue);
    if (storedNote.kind !== "notes") return null;

    return {
      kind: "notes",
      id:
        typeof storedNote.id === "string" && storedNote.id
          ? storedNote.id
          : `legacy-${fallbackId}`,
      title:
        typeof storedNote.title === "string" && storedNote.title.trim()
          ? storedNote.title
          : "Notes",
      notes: typeof storedNote.notes === "string" ? storedNote.notes : "",
    };
  };
  const storedPlayers = Array.isArray(data.players) ? data.players : [];
  const players = Array.from({ length: 5 }, (_, index) => {
    return assignmentFromData(storedPlayers[index], `player-${index}`);
  }) as SongInstrumentAssignments["players"];
  const tracks = Array.isArray(data.tracks)
    ? data.tracks
        .map((storedValue, index) =>
          assignmentFromData(storedValue, `track-${index}`),
        )
        .filter(
          (assignment): assignment is SongInstrumentAssignment =>
            assignment !== null,
        )
    : [];

  return { players, tracks };
}

function originalRecordingFromData(value: unknown): SongOriginalRecording | undefined {
  const data = objectValue(value);
  const downloadUrl = typeof data.downloadUrl === "string" ? data.downloadUrl : "";
  const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";

  if (!downloadUrl || !storagePath) return undefined;

  return {
    filename: String(data.filename ?? "Original recording.mp3"),
    contentType: String(data.contentType ?? "audio/mpeg"),
    size: Number(data.size ?? 0),
    storagePath,
    downloadUrl,
  };
}
