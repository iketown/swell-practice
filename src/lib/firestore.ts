"use client";

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";

import {
  createDefaultSongMixerConfigurations,
  createDefaultSongMixerSettings,
  createEmptyInstrumentAssignments,
  DEFAULT_SONG_MIXER_CONFIGURATION_IDS,
  DEFAULT_PARTS,
  fileTypeFromFile,
  inferPartSlugs,
  INSTRUMENT_IDS,
  VOCAL_PART_SLUGS,
  SONG_MIXER_STATE_NAMES,
  sanitizeFilename,
  slugify,
  sortPartSlugs,
  sortTitle,
  stemDisplayNameFromFilename,
  type InstrumentId,
  type BandSongArrangement,
  type Song,
  type SongAsset,
  type SongAnnotation,
  type SongBundle,
  type SongInstrumentAssignment,
  type SongMixerBundle,
  type SongMixerConfiguration,
  type SongMixerDownload,
  type SongMixerSettings,
  type SongMixerStateName,
  type SongMixerStateOverride,
  type SongMixerStateOverrides,
  type SongMixerStateValues,
  type SongMixerTrack,
  type SongMixerVideo,
  type SongPart,
  type PartSongRow,
  type SongInstrumentAssignments,
  type SongOriginalRecording,
  type SongVocalAssignment,
  type VocalPartSlug,
} from "@/lib/domain";
import { db, hasFirebaseConfig, storage } from "@/lib/firebase";
import {
  createStoredLyricAlignment,
  isElevenLabsAlignment,
  isStoredLyricAlignment,
  type ElevenLabsAlignment,
  type LyricAlignmentAudio,
  type LyricAlignmentSong,
  type LyricAlignmentStatus,
  type LyricAlignmentWorkspace,
  type StoredLyricAlignment,
} from "@/lib/lyric-alignment";
import { samplePartRows, sampleSongBundle, sampleSongList } from "@/lib/sample-data";
import { applyDemoSongTags, isSongTagDemoMode } from "@/lib/song-tags";

function requireFirebase() {
  if (!db || !storage) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values to .env.local.");
  }

  return { db, storage };
}

function songFromDoc(id: string, data: Record<string, unknown>): Song {
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

function bandSongArrangementFromDoc(
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

function partFromDoc(id: string, data: Record<string, unknown>): SongPart {
  return {
    slug: String(data.slug ?? id),
    label: String(data.label ?? id.toUpperCase()),
    sortOrder: Number(data.sortOrder ?? 0),
    assetIds: Array.isArray(data.assetIds) ? data.assetIds.map(String) : [],
  };
}

function assetFromDoc(id: string, data: Record<string, unknown>): SongAsset {
  return {
    id,
    filename: String(data.filename ?? ""),
    displayName: String(data.displayName ?? data.filename ?? ""),
    contentType: String(data.contentType ?? ""),
    fileType: (data.fileType as SongAsset["fileType"]) ?? "other",
    size: Number(data.size ?? 0),
    storagePath: String(data.storagePath ?? ""),
    downloadUrl: typeof data.downloadUrl === "string" ? data.downloadUrl : undefined,
    thumbnailStoragePath: typeof data.thumbnailStoragePath === "string" ? data.thumbnailStoragePath : undefined,
    thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : undefined,
    thumbnailTime: typeof data.thumbnailTime === "number" ? data.thumbnailTime : undefined,
    assignedPartSlugs: Array.isArray(data.assignedPartSlugs) ? data.assignedPartSlugs.map(String) : [],
    suggestedPartSlugs: Array.isArray(data.suggestedPartSlugs) ? data.suggestedPartSlugs.map(String) : [],
  };
}

function mixerTrackFromDoc(id: string, data: Record<string, unknown>, fallbackOrderIndex: number): SongMixerTrack {
  const filename = String(data.filename ?? "");
  const storedDisplayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
  const displayNameIsCustom = data.displayNameIsCustom === true;

  return {
    id,
    filename,
    // Existing tracks used the complete filename as their display name before
    // stem names became editable. The marker keeps a custom title intact even
    // when it intentionally includes a filename extension.
    displayName:
      !storedDisplayName || (!displayNameIsCustom && hasFilenameExtension(storedDisplayName))
        ? stemDisplayNameFromFilename(filename)
        : storedDisplayName,
    // Older mixer tracks did not store their part association. Their original
    // filename remains immutable, so it is a stable source for the same
    // normalization used for newly uploaded stems.
    partSlug: mixerPartSlugFromData(data, filename),
    contentType: String(data.contentType ?? "audio/mpeg"),
    size: Number(data.size ?? 0),
    storagePath: String(data.storagePath ?? ""),
    downloadUrl: typeof data.downloadUrl === "string" ? data.downloadUrl : undefined,
    shown: data.shown !== false,
    isBackgroundMix: data.isBackgroundMix === true,
    orderIndex: typeof data.orderIndex === "number" ? data.orderIndex : fallbackOrderIndex,
    stateOverrides: mixerStateOverridesFromData(data.stateOverrides),
  };
}

function mixerVideoFromDoc(id: string, data: Record<string, unknown>): SongMixerVideo {
  const filename = String(data.filename ?? "");
  const storedDisplayName = typeof data.displayName === "string" ? data.displayName.trim() : "";

  return {
    id,
    filename,
    displayName: storedDisplayName || stemDisplayNameFromFilename(filename),
    partSlug: mixerPartSlugFromData(data, filename),
    contentType: String(data.contentType ?? "video/mp4"),
    size: Number(data.size ?? 0),
    storagePath: String(data.storagePath ?? ""),
    downloadUrl: typeof data.downloadUrl === "string" ? data.downloadUrl : undefined,
  };
}

function mixerDownloadFromDoc(id: string, data: Record<string, unknown>): SongMixerDownload {
  const filename = String(data.filename ?? "");
  const storedDisplayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
  const fileType = data.fileType === "zip" ? "zip" : "midi";

  return {
    id,
    filename,
    displayName: storedDisplayName || stemDisplayNameFromFilename(filename),
    contentType: String(
      data.contentType ?? (fileType === "zip" ? "application/zip" : "audio/midi"),
    ),
    fileType,
    size: Number(data.size ?? 0),
    storagePath: String(data.storagePath ?? ""),
    downloadUrl: typeof data.downloadUrl === "string" ? data.downloadUrl : undefined,
  };
}

function hasFilenameExtension(value: string) {
  return /\.[^./\\]+$/.test(value);
}

function mixerPartSlugFromData(data: Record<string, unknown>, filename: string) {
  const validSlugs = new Set(DEFAULT_PARTS.map((part) => part.slug));
  const storedPartSlug = typeof data.partSlug === "string" ? data.partSlug : undefined;
  const legacyPartSlug = Array.isArray(data.partSlugs)
    ? data.partSlugs.map(String).find((partSlug) => validSlugs.has(partSlug))
    : undefined;
  const partSlug = storedPartSlug ?? legacyPartSlug;

  if (partSlug && validSlugs.has(partSlug)) return partSlug;

  const inferredPartSlugs = inferPartSlugs(filename);
  return inferredPartSlugs.length === 1 ? inferredPartSlugs[0] ?? null : null;
}

function mixerConfigurationFromData(
  value: unknown,
  fallbackOrderIndex: number,
): SongMixerConfiguration {
  const data = objectValue(value);

  return {
    id: String(data.id ?? `mix-${fallbackOrderIndex + 1}`),
    name: String(data.name ?? "Untitled Mix").trim() || "Untitled Mix",
    trackIds: Array.isArray(data.trackIds)
      ? [...new Set(data.trackIds.map(String))]
      : [],
    orderIndex: typeof data.orderIndex === "number" ? data.orderIndex : fallbackOrderIndex,
  };
}

function annotationFromDoc(id: string, data: Record<string, unknown>): SongAnnotation {
  const start = boundedNumber(data.start, 0, 0, Number.MAX_SAFE_INTEGER);

  return {
    id,
    title: String(data.title ?? "Untitled section"),
    start,
    end: boundedNumber(data.end, start + 0.1, start + 0.1, Number.MAX_SAFE_INTEGER),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function mixerStateValuesFromData(value: unknown, fallback: SongMixerStateValues): SongMixerStateValues {
  const data = objectValue(value);

  return {
    volume: boundedNumber(data.volume, fallback.volume, 0, 100),
    pan: boundedNumber(data.pan, fallback.pan, -100, 100),
    muted: typeof data.muted === "boolean" ? data.muted : fallback.muted,
    scale: boundedNumber(data.scale, fallback.scale, 0.25, 2),
  };
}

function mixerSettingsFromData(value: unknown): SongMixerSettings {
  const defaults = createDefaultSongMixerSettings();
  const data = objectValue(value);
  const states = objectValue(data.states);

  for (const stateName of SONG_MIXER_STATE_NAMES) {
    defaults.states[stateName] = mixerStateValuesFromData(states[stateName], defaults.states[stateName]);
  }

  return defaults;
}

function mixerStateOverrideFromData(value: unknown): SongMixerStateOverride {
  const data = objectValue(value);
  const override: SongMixerStateOverride = {};

  if (typeof data.volume === "number" && Number.isFinite(data.volume)) {
    override.volume = boundedNumber(data.volume, 0, 0, 100);
  }
  if (typeof data.pan === "number" && Number.isFinite(data.pan)) {
    override.pan = boundedNumber(data.pan, 0, -100, 100);
  }
  if (typeof data.muted === "boolean") {
    override.muted = data.muted;
  }
  if (typeof data.scale === "number" && Number.isFinite(data.scale)) {
    override.scale = boundedNumber(data.scale, 1, 0.25, 2);
  }

  return override;
}

function mixerStateOverridesFromData(value: unknown): SongMixerStateOverrides {
  const data = objectValue(value);
  const overrides: SongMixerStateOverrides = {};

  for (const stateName of SONG_MIXER_STATE_NAMES) {
    const override = mixerStateOverrideFromData(data[stateName]);
    if (Object.keys(override).length) overrides[stateName] = override;
  }

  return overrides;
}

function serializeMixerStateOverrides(overrides: SongMixerStateOverrides) {
  return Object.fromEntries(
    SONG_MIXER_STATE_NAMES.flatMap((stateName) => {
      const override = overrides[stateName];
      return override && Object.keys(override).length ? [[stateName, override]] : [];
    }),
  ) as Partial<Record<SongMixerStateName, SongMixerStateOverride>>;
}

function warnReadFailure(scope: string, caught: unknown) {
  console.warn(`[swell-parts] Could not read ${scope} from Firestore.`, caught);
}

async function nextAvailableSongSlug(baseSlug: string, ignoredSongId?: string) {
  const { db } = requireFirebase();
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const snaps = await getDocs(query(collection(db, "songs"), where("slug", "==", candidate), limit(1)));
    const existing = snaps.docs[0];

    if (!existing || existing.id === ignoredSongId) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function listSongs(): Promise<Song[]> {
  if (isSongTagDemoMode() || !hasFirebaseConfig || !db) {
    return applyDemoSongTags(sampleSongList());
  }

  try {
    const firestore = db;
    const snaps = await getDocs(query(collection(firestore, "songs"), orderBy("sortTitle", "asc")));
    return snaps.docs.map((snap) => songFromDoc(snap.id, snap.data()));
  } catch (caught) {
    warnReadFailure("songs", caught);
    return [];
  }
}

export function subscribeSongs(
  onSongs: (songs: Song[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (isSongTagDemoMode() || !hasFirebaseConfig || !db) {
    let active = true;
    queueMicrotask(() => {
      if (active) onSongs(applyDemoSongTags(sampleSongList()));
    });
    return () => {
      active = false;
    };
  }

  return onSnapshot(
    query(collection(db, "songs"), orderBy("sortTitle", "asc")),
    (snapshot) => {
      onSongs(
        snapshot.docs.map((songSnapshot) =>
          songFromDoc(songSnapshot.id, songSnapshot.data()),
        ),
      );
    },
    (caught) => {
      warnReadFailure("live songs", caught);
      onError(
        caught instanceof Error
          ? caught
          : new Error("Could not subscribe to song changes."),
      );
    },
  );
}

export function subscribeSongMixerStemParts(
  songIds: readonly string[],
  onParts: (partsBySongId: Map<string, Set<string>>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const uniqueSongIds = [...new Set(songIds)];
  if (!hasFirebaseConfig || !db || !uniqueSongIds.length) {
    let active = true;
    queueMicrotask(() => {
      if (active) onParts(new Map());
    });
    return () => {
      active = false;
    };
  }

  const firestore = db;
  let active = true;
  const readySongIds = new Set<string>();
  const partsBySongId = new Map<string, Set<string>>();
  const subscriptions = uniqueSongIds.map((songId) => onSnapshot(
    collection(firestore, "songs", songId, "mixerTracks"),
    (snapshot) => {
      const songParts = new Set<string>();
      snapshot.docs.forEach((trackSnapshot) => {
        const data = trackSnapshot.data();
        const partSlug = mixerPartSlugFromData(
          data,
          String(data.filename ?? ""),
        );
        const playable = data.shown !== false && data.isBackgroundMix !== true;
        if (!partSlug || !playable) return;

        songParts.add(partSlug);
      });

      partsBySongId.set(songId, songParts);
      readySongIds.add(songId);
      if (active && readySongIds.size === uniqueSongIds.length) {
        onParts(new Map(partsBySongId));
      }
    },
    (caught) => {
      warnReadFailure(`live mixer stem parts for song "${songId}"`, caught);
      if (!active) return;
      onError(
        caught instanceof Error
          ? caught
          : new Error("Could not subscribe to mixer stem changes."),
      );
    },
  ));

  return () => {
    active = false;
    subscriptions.forEach((unsubscribe) => unsubscribe());
  };
}

export function subscribeBandSongArrangements(
  bandId: string,
  onArrangements: (arrangements: BandSongArrangement[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!hasFirebaseConfig || !db) {
    let active = true;
    queueMicrotask(() => {
      if (active) onArrangements([]);
    });
    return () => {
      active = false;
    };
  }

  return onSnapshot(
    query(collection(db, "bandSongArrangements"), where("bandId", "==", bandId)),
    (snapshot) => {
      onArrangements(
        snapshot.docs.map((arrangementSnapshot) =>
          bandSongArrangementFromDoc(arrangementSnapshot.data()),
        ),
      );
    },
    (caught) => {
      warnReadFailure(`live arrangements for band "${bandId}"`, caught);
      onError(
        caught instanceof Error
          ? caught
          : new Error("Could not subscribe to band arrangement changes."),
      );
    },
  );
}

export async function listBandSongArrangements(
  bandId: string,
): Promise<BandSongArrangement[]> {
  if (!hasFirebaseConfig || !db) return [];

  const snapshot = await getDocs(
    query(collection(db, "bandSongArrangements"), where("bandId", "==", bandId)),
  );
  return snapshot.docs.map((arrangementSnapshot) =>
    bandSongArrangementFromDoc(arrangementSnapshot.data()),
  );
}

export async function getSongBundle(slug: string): Promise<SongBundle | null> {
  if (!hasFirebaseConfig || !db) return sampleSongBundle(slug);

  try {
    const firestore = db;
    const songSnaps = await getDocs(query(collection(firestore, "songs"), where("slug", "==", slug), limit(1)));
    const songSnap = songSnaps.docs[0];
    if (!songSnap) return null;

    const partsSnap = await getDocs(query(collection(firestore, "songs", songSnap.id, "parts"), orderBy("sortOrder", "asc")));
    const assetsSnap = await getDocs(collection(firestore, "songs", songSnap.id, "assets"));

    return {
      song: songFromDoc(songSnap.id, songSnap.data()),
      parts: partsSnap.docs.map((snap) => partFromDoc(snap.id, snap.data())),
      assets: assetsSnap.docs.map((snap) => assetFromDoc(snap.id, snap.data())),
    };
  } catch (caught) {
    warnReadFailure(`song "${slug}"`, caught);
    return null;
  }
}

export async function getSongMixerBundle(slug: string): Promise<SongMixerBundle | null> {
  if (!hasFirebaseConfig || !db) {
    const bundle = sampleSongBundle(slug);
    return bundle
      ? {
          song: bundle.song,
          tracks: [],
          videos: [],
          downloads: [],
          configurations: createDefaultSongMixerConfigurations([]),
          settings: createDefaultSongMixerSettings(),
          annotations: [],
        }
      : null;
  }

  try {
    const firestore = db;
    const songSnaps = await getDocs(query(collection(firestore, "songs"), where("slug", "==", slug), limit(1)));
    const songSnap = songSnaps.docs[0];
    if (!songSnap) return null;

    const [tracksSnap, videosSnap, downloadsSnap, settingsSnap, annotationsSnap] = await Promise.all([
      getDocs(collection(firestore, "songs", songSnap.id, "mixerTracks")),
      getDocs(collection(firestore, "songs", songSnap.id, "mixerVideos")).catch((caught) => {
        warnReadFailure(`mixer videos for song "${slug}"`, caught);
        return null;
      }),
      getDocs(collection(firestore, "songs", songSnap.id, "mixerDownloads")).catch((caught) => {
        warnReadFailure(`mixer downloads for song "${slug}"`, caught);
        return null;
      }),
      getDoc(doc(firestore, "songs", "global-mixer-defaults", "mixerSettings", "main")),
      getDocs(collection(firestore, "songs", songSnap.id, "annotations")).catch((caught) => {
        warnReadFailure(`annotations for song "${slug}"`, caught);
        return null;
      }),
    ]);

    const tracks = tracksSnap.docs
      .map((snap, index) => mixerTrackFromDoc(snap.id, snap.data(), index))
      .sort((left, right) => left.orderIndex - right.orderIndex || left.displayName.localeCompare(right.displayName));
    const trackIds = new Set(tracks.map((track) => track.id));
    const songData = songSnap.data();
    const savedConfigurations = (Array.isArray(songData.mixerMixes) ? songData.mixerMixes : [])
      .map((value, index) => mixerConfigurationFromData(value, index))
      .map((configuration) => ({
        ...configuration,
        trackIds: configuration.trackIds.filter((trackId) => trackIds.has(trackId)),
      }))
      .sort((left, right) => left.orderIndex - right.orderIndex || left.name.localeCompare(right.name));

    return {
      song: songFromDoc(songSnap.id, songSnap.data()),
      tracks,
      videos: (videosSnap?.docs ?? [])
        .map((snap) => mixerVideoFromDoc(snap.id, snap.data()))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      downloads: (downloadsSnap?.docs ?? [])
        .map((snap) => mixerDownloadFromDoc(snap.id, snap.data()))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      configurations: savedConfigurations.length
        ? savedConfigurations
        : createDefaultSongMixerConfigurations(tracks),
      settings: mixerSettingsFromData(settingsSnap.exists() ? settingsSnap.data() : undefined),
      annotations: (annotationsSnap?.docs ?? [])
        .map((snap) => annotationFromDoc(snap.id, snap.data()))
        .sort((left, right) => left.start - right.start || left.end - right.end),
    };
  } catch (caught) {
    warnReadFailure(`mixer tracks for song "${slug}"`, caught);
    return null;
  }
}

export async function getPartRows(partSlug: string): Promise<PartSongRow[]> {
  if (!hasFirebaseConfig || !db) return samplePartRows(partSlug);

  try {
    const firestore = db;
    const songSnaps = await getDocs(query(collection(firestore, "songs"), orderBy("sortTitle", "asc")));
    const rows = await Promise.all(
      songSnaps.docs.map(async (songSnap) => {
        const [partSnap, assetsSnap] = await Promise.all([
          getDoc(doc(firestore, "songs", songSnap.id, "parts", partSlug)),
          getDocs(collection(firestore, "songs", songSnap.id, "assets")),
        ]);

        if (!partSnap.exists()) return null;

        const part = partFromDoc(partSnap.id, partSnap.data());
        const assetIds = new Set(part.assetIds);
        const assets = assetsSnap.docs
          .map((snap) => assetFromDoc(snap.id, snap.data()))
          .filter((assetItem) => assetIds.has(assetItem.id));

        if (!assets.length) return null;

        return {
          song: songFromDoc(songSnap.id, songSnap.data()),
          part,
          assets,
        };
      }),
    );

    return rows
      .filter((row): row is PartSongRow => Boolean(row))
      .sort((a, b) => a.song.sortTitle.localeCompare(b.song.sortTitle));
  } catch (caught) {
    warnReadFailure(`part "${partSlug}"`, caught);
    return [];
  }
}

export async function createSong(title: string) {
  const { db } = requireFirebase();
  const trimmedTitle = title.trim();
  const baseSlug = slugify(trimmedTitle);
  if (!baseSlug) throw new Error("Song title must include at least one letter or number.");

  const slug = await nextAvailableSongSlug(baseSlug);
  const songRef = doc(collection(db, "songs"));
  const batch = writeBatch(db);

  batch.set(songRef, {
    title: trimmedTitle,
    slug,
    sortTitle: sortTitle(trimmedTitle),
    tagIds: [],
    published: true,
    instrumentAssignments: createEmptyInstrumentAssignments(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const part of DEFAULT_PARTS) {
    batch.set(doc(db, "songs", songRef.id, "parts", part.slug), {
      ...part,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return slug;
}

export async function updateSong(song: Song, title: string) {
  const { db } = requireFirebase();
  const trimmedTitle = title.trim();
  const baseSlug = slugify(trimmedTitle);
  if (!baseSlug) throw new Error("Song title must include at least one letter or number.");

  const slug = await nextAvailableSongSlug(baseSlug, song.id);

  await updateDoc(doc(db, "songs", song.id), {
    title: trimmedTitle,
    slug,
    sortTitle: sortTitle(trimmedTitle),
    updatedAt: serverTimestamp(),
  });

  return slug;
}

export async function updateSongPublished(songId: string, published: boolean) {
  const { db } = requireFirebase();

  await updateDoc(doc(db, "songs", songId), {
    published,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSong(song: Song) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);
  const [partsSnap, assetsSnap, arrangementsSnap] = await Promise.all([
    getDocs(collection(db, "songs", song.id, "parts")),
    getDocs(collection(db, "songs", song.id, "assets")),
    getDocs(query(collection(db, "bandSongArrangements"), where("songId", "==", song.id))),
  ]);

  for (const snap of partsSnap.docs) {
    batch.delete(snap.ref);
  }

  for (const snap of assetsSnap.docs) {
    batch.delete(snap.ref);
  }

  for (const snap of arrangementsSnap.docs) {
    batch.delete(snap.ref);
  }

  batch.delete(doc(db, "songs", song.id));
  await batch.commit();
}

export type SongAssetUploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
};

export type SongAssetUploadOptions = {
  onProgress?: (progress: SongAssetUploadProgress) => void;
  signal?: AbortSignal;
};

export type SongMixerTrackUploadOptions = SongAssetUploadOptions & {
  orderIndex?: number;
};

const INSTRUMENT_ASSIGNMENT_COLLABORATION_DOCUMENT = "instrument-assignments";
const INSTRUMENT_ASSIGNMENT_LOCK_DURATION_MS = 15_000;

export type InstrumentAssignmentMoveTarget = {
  kind: "instrument";
  bandId: string;
  songId: string;
  assignmentKey: string;
  instrumentId: InstrumentId;
} & (
  | { zone: "player"; slotIndex: number }
  | { zone: "tracks"; trackIndex: number }
);

export type VocalAssignmentMoveTarget = {
  kind: "vocal";
  bandId: string;
  songId: string;
  assignmentKey: string;
  partSlug: VocalPartSlug;
  zone: "vocal";
  slotIndex: number;
  removed?: boolean;
};

export type AssignmentMoveTarget =
  | InstrumentAssignmentMoveTarget
  | VocalAssignmentMoveTarget;

export type InstrumentAssignmentLastMove = AssignmentMoveTarget & {
  changeId: string;
};

export type InstrumentAssignmentLock = {
  sessionId: string;
  userLabel: string;
  expiresAt: number;
};

export type InstrumentAssignmentCollaborationState = {
  lock: InstrumentAssignmentLock | null;
  lastMove: InstrumentAssignmentLastMove | null;
};

export class InstrumentAssignmentLockedError extends Error {
  userLabel: string;

  constructor(userLabel: string) {
    super(`${userLabel} is already moving an assignment.`);
    this.name = "InstrumentAssignmentLockedError";
    this.userLabel = userLabel;
  }
}

function instrumentAssignmentCollaborationRef(firestore: NonNullable<typeof db>) {
  return doc(
    firestore,
    "collaboration",
    INSTRUMENT_ASSIGNMENT_COLLABORATION_DOCUMENT,
  );
}

function bandSongArrangementRef(
  firestore: NonNullable<typeof db>,
  bandId: string,
  songId: string,
) {
  return doc(firestore, "bandSongArrangements", `${bandId}_${songId}`);
}

function timestampMilliseconds(value: unknown) {
  return value instanceof Timestamp ? value.toMillis() : null;
}

function instrumentAssignmentLockFromData(
  data: Record<string, unknown>,
): InstrumentAssignmentLock | null {
  const sessionId = typeof data.activeSessionId === "string"
    ? data.activeSessionId
    : "";
  const userLabel = typeof data.activeUserLabel === "string"
    ? data.activeUserLabel
    : "Another admin";
  const expiresAt = timestampMilliseconds(data.lockExpiresAt);

  return sessionId && expiresAt !== null
    ? { sessionId, userLabel, expiresAt }
    : null;
}

function instrumentAssignmentLastMoveFromData(
  value: unknown,
): InstrumentAssignmentLastMove | null {
  const data = objectValue(value);
  const bandId = typeof data.bandId === "string" ? data.bandId : "";
  const partSlug = typeof data.partSlug === "string"
    && VOCAL_PART_SLUGS.includes(data.partSlug as VocalPartSlug)
    ? data.partSlug as VocalPartSlug
    : null;
  if (
    data.kind === "vocal"
    && typeof data.changeId === "string"
    && typeof data.songId === "string"
    && typeof data.assignmentKey === "string"
    && partSlug
    && data.zone === "vocal"
    && typeof data.slotIndex === "number"
    && Number.isInteger(data.slotIndex)
  ) {
    return {
      kind: "vocal",
      bandId,
      changeId: data.changeId,
      songId: data.songId,
      assignmentKey: data.assignmentKey,
      partSlug,
      zone: "vocal",
      slotIndex: data.slotIndex,
      removed: data.removed === true ? true : undefined,
    };
  }
  const instrumentId = typeof data.instrumentId === "string"
    && INSTRUMENT_IDS.includes(data.instrumentId as InstrumentId)
    ? data.instrumentId as InstrumentId
    : null;

  if (
    typeof data.changeId !== "string"
    || typeof data.songId !== "string"
    || typeof data.assignmentKey !== "string"
    || !instrumentId
  ) {
    return null;
  }

  if (
    data.zone === "player"
    && typeof data.slotIndex === "number"
    && Number.isInteger(data.slotIndex)
  ) {
    return {
      kind: "instrument",
      bandId,
      changeId: data.changeId,
      songId: data.songId,
      assignmentKey: data.assignmentKey,
      instrumentId,
      zone: "player",
      slotIndex: data.slotIndex,
    };
  }

  if (
    data.zone === "tracks"
    && typeof data.trackIndex === "number"
    && Number.isInteger(data.trackIndex)
  ) {
    return {
      kind: "instrument",
      bandId,
      changeId: data.changeId,
      songId: data.songId,
      assignmentKey: data.assignmentKey,
      instrumentId,
      zone: "tracks",
      trackIndex: data.trackIndex,
    };
  }

  return null;
}

export function subscribeInstrumentAssignmentCollaboration(
  onState: (state: InstrumentAssignmentCollaborationState) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  if (!hasFirebaseConfig || !db) {
    let active = true;
    queueMicrotask(() => {
      if (active) onState({ lock: null, lastMove: null });
    });
    return () => {
      active = false;
    };
  }

  return onSnapshot(
    instrumentAssignmentCollaborationRef(db),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      onState({
        lock: instrumentAssignmentLockFromData(data),
        lastMove: instrumentAssignmentLastMoveFromData(data.lastMove),
      });
    },
    (caught) => {
      onError(
        caught instanceof Error
          ? caught
          : new Error("Could not subscribe to assignment activity."),
      );
    },
  );
}

export async function acquireInstrumentAssignmentLock(
  sessionId: string,
  userLabel: string,
) {
  if (!hasFirebaseConfig || !db) return;

  const collaborationRef = instrumentAssignmentCollaborationRef(db);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(collaborationRef);
    const currentLock = snapshot.exists()
      ? instrumentAssignmentLockFromData(snapshot.data())
      : null;
    const now = Date.now();

    if (
      currentLock
      && currentLock.sessionId !== sessionId
      && currentLock.expiresAt > now
    ) {
      throw new InstrumentAssignmentLockedError(currentLock.userLabel);
    }

    transaction.set(
      collaborationRef,
      {
        activeSessionId: sessionId,
        activeUserLabel: userLabel.trim() || "Another admin",
        lockExpiresAt: Timestamp.fromMillis(
          now + INSTRUMENT_ASSIGNMENT_LOCK_DURATION_MS,
        ),
        lockStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function refreshInstrumentAssignmentLock(sessionId: string) {
  if (!hasFirebaseConfig || !db) return true;

  const collaborationRef = instrumentAssignmentCollaborationRef(db);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(collaborationRef);
    const currentLock = snapshot.exists()
      ? instrumentAssignmentLockFromData(snapshot.data())
      : null;

    if (currentLock?.sessionId !== sessionId) return false;

    transaction.update(collaborationRef, {
      lockExpiresAt: Timestamp.fromMillis(
        Date.now() + INSTRUMENT_ASSIGNMENT_LOCK_DURATION_MS,
      ),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

export async function releaseInstrumentAssignmentLock(sessionId: string) {
  if (!hasFirebaseConfig || !db) return;

  const collaborationRef = instrumentAssignmentCollaborationRef(db);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(collaborationRef);
    const currentLock = snapshot.exists()
      ? instrumentAssignmentLockFromData(snapshot.data())
      : null;

    if (currentLock?.sessionId !== sessionId) return;

    transaction.update(collaborationRef, {
      activeSessionId: null,
      activeUserLabel: null,
      lockExpiresAt: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function saveSongInstrumentAssignmentMove(
  bandId: string,
  changes: Array<{ songId: string; assignments: SongInstrumentAssignments }>,
  sessionId: string,
  lastMove: InstrumentAssignmentLastMove | null,
) {
  const { db } = requireFirebase();
  const collaborationRef = instrumentAssignmentCollaborationRef(db);
  const latestBySongId = new Map(
    changes.map((change) => [change.songId, change.assignments]),
  );

  await runTransaction(db, async (transaction) => {
    const collaborationSnapshot = await transaction.get(collaborationRef);
    const currentLock = collaborationSnapshot.exists()
      ? instrumentAssignmentLockFromData(collaborationSnapshot.data())
      : null;

    if (currentLock?.sessionId !== sessionId) {
      throw new InstrumentAssignmentLockedError(
        currentLock?.userLabel ?? "Another admin",
      );
    }

    latestBySongId.forEach((assignments, songId) => {
      transaction.set(bandSongArrangementRef(db, bandId, songId), {
        bandId,
        songId,
        instrumentAssignments: assignments,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    const collaborationUpdate: Record<string, unknown> = {
      activeSessionId: null,
      activeUserLabel: null,
      lockExpiresAt: null,
      updatedAt: serverTimestamp(),
    };
    if (lastMove) {
      collaborationUpdate.lastMove = {
        ...lastMove,
        committedAt: serverTimestamp(),
      };
    }
    transaction.update(collaborationRef, collaborationUpdate);
  });
}

export async function saveSongInstrumentAssignments(
  bandId: string,
  changes: Array<{ songId: string; assignments: SongInstrumentAssignments }>,
) {
  const { db } = requireFirebase();
  const latestBySongId = new Map(changes.map((change) => [change.songId, change.assignments]));
  const batch = writeBatch(db);

  latestBySongId.forEach((assignments, songId) => {
    batch.set(bandSongArrangementRef(db, bandId, songId), {
      bandId,
      songId,
      instrumentAssignments: assignments,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

export async function saveBandSongVocalAssignments(
  bandId: string,
  songId: string,
  showVocals: boolean,
  vocalAssignments: SongVocalAssignment[],
  sessionId: string,
  lastMove: InstrumentAssignmentLastMove | null = null,
) {
  const { db } = requireFirebase();
  const collaborationRef = instrumentAssignmentCollaborationRef(db);

  await runTransaction(db, async (transaction) => {
    const collaborationSnapshot = await transaction.get(collaborationRef);
    const currentLock = collaborationSnapshot.exists()
      ? instrumentAssignmentLockFromData(collaborationSnapshot.data())
      : null;

    if (currentLock?.sessionId !== sessionId) {
      throw new InstrumentAssignmentLockedError(
        currentLock?.userLabel ?? "Another admin",
      );
    }

    transaction.set(bandSongArrangementRef(db, bandId, songId), {
      bandId,
      songId,
      showVocals,
      vocalAssignments,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    const collaborationUpdate: Record<string, unknown> = {
      activeSessionId: null,
      activeUserLabel: null,
      lockExpiresAt: null,
      updatedAt: serverTimestamp(),
    };
    if (lastMove) {
      collaborationUpdate.lastMove = {
        ...lastMove,
        committedAt: serverTimestamp(),
      };
    }
    transaction.update(collaborationRef, collaborationUpdate);
  });
}

export async function saveSongInstrumentOrder(
  changes: Array<{ songId: string; instrumentOrder: number }>,
) {
  const { db } = requireFirebase();
  const latestBySongId = new Map(
    changes.map((change) => [change.songId, change.instrumentOrder]),
  );
  const batch = writeBatch(db);

  latestBySongId.forEach((instrumentOrder, songId) => {
    batch.update(doc(db, "songs", songId), {
      instrumentOrder,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function saveSongNotes(songId: string, notes: string) {
  const { db } = requireFirebase();

  await updateDoc(doc(db, "songs", songId), {
    notes: notes.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadSongOriginalRecording(
  song: Song,
  file: File,
  options: SongAssetUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const { onProgress, signal } = options;

  if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
    throw new Error("Original recordings must be MP3 files.");
  }

  const filename = sanitizeFilename(file.name);
  const storagePath = `songs/${song.slug}/original/${crypto.randomUUID()}-${filename}`;
  const uploadRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(uploadRef, file, {
    contentType: file.type || "audio/mpeg",
    cacheControl: "public,max-age=31536000,immutable",
  });
  const cancelUpload = () => uploadTask.cancel();

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => onProgress?.({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        }),
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  const ensureNotCanceled = async () => {
    if (!signal?.aborted) return;

    try {
      await deleteObject(uploadRef);
    } catch (caught) {
      if (!isMissingStorageObject(caught)) throw caught;
    }

    throw new DOMException("The upload was canceled.", "AbortError");
  };

  await ensureNotCanceled();
  const downloadUrl = await getDownloadURL(uploadRef);
  await ensureNotCanceled();

  const originalRecording: SongOriginalRecording = {
    filename,
    contentType: file.type || "audio/mpeg",
    size: file.size,
    storagePath,
    downloadUrl,
  };

  await updateDoc(doc(db, "songs", song.id), {
    originalRecording,
    updatedAt: serverTimestamp(),
  });

  if (song.originalRecording?.storagePath && song.originalRecording.storagePath !== storagePath) {
    try {
      await deleteObject(ref(storage, song.originalRecording.storagePath));
    } catch (caught) {
      if (!isMissingStorageObject(caught)) {
        console.warn("[swell-parts] Could not remove the replaced original recording.", caught);
      }
    }
  }

  return originalRecording;
}

export async function uploadSongMixerVideo(
  bundle: SongMixerBundle,
  file: File,
  options: SongAssetUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const { onProgress, signal } = options;

  if (!file.name.toLowerCase().endsWith(".mp4") && file.type !== "video/mp4") {
    throw new Error("Mixer videos must be MP4 files.");
  }

  const videoRef = doc(collection(db, "songs", bundle.song.id, "mixerVideos"));
  const filename = sanitizeFilename(file.name);
  const storagePath = `songs/${bundle.song.slug}/mixer-videos/${videoRef.id}-${filename}`;
  const uploadRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(uploadRef, file, {
    contentType: file.type || "video/mp4",
    cacheControl: "public,max-age=31536000,immutable",
  });
  const cancelUpload = () => uploadTask.cancel();

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => onProgress?.({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        }),
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  const ensureNotCanceled = async () => {
    if (!signal?.aborted) return;

    try {
      await deleteObject(uploadRef);
    } catch (caught) {
      if (!isMissingStorageObject(caught)) throw caught;
    }

    throw new DOMException("The upload was canceled.", "AbortError");
  };

  await ensureNotCanceled();
  const downloadUrl = await getDownloadURL(uploadRef);
  await ensureNotCanceled();
  const inferredPartSlugs = inferPartSlugs(file.name);

  await writeBatch(db)
    .set(videoRef, {
      filename,
      displayName: stemDisplayNameFromFilename(file.name),
      partSlug: inferredPartSlugs.length === 1 ? inferredPartSlugs[0] ?? null : null,
      contentType: file.type || "video/mp4",
      size: file.size,
      storagePath,
      downloadUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    .commit();

  return videoRef.id;
}

export async function uploadSongMixerTrack(
  bundle: SongMixerBundle,
  file: File,
  options: SongMixerTrackUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const { onProgress, orderIndex = bundle.tracks.length, signal } = options;

  if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
    throw new Error("Mixer tracks must be MP3 files.");
  }

  const trackRef = doc(collection(db, "songs", bundle.song.id, "mixerTracks"));
  const filename = sanitizeFilename(file.name);
  const storagePath = `songs/${bundle.song.slug}/mixer/${trackRef.id}-${filename}`;
  const uploadRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(uploadRef, file, {
    contentType: file.type || "audio/mpeg",
    cacheControl: "public,max-age=31536000,immutable",
  });
  const cancelUpload = () => {
    uploadTask.cancel();
  };

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        },
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  const ensureNotCanceled = async () => {
    if (!signal?.aborted) return;

    try {
      await deleteObject(uploadRef);
    } catch (caught) {
      if (!isMissingStorageObject(caught)) throw caught;
    }

    throw new DOMException("The upload was canceled.", "AbortError");
  };

  await ensureNotCanceled();
  const downloadUrl = await getDownloadURL(uploadRef);
  await ensureNotCanceled();
  const inferredPartSlugs = inferPartSlugs(file.name);
  const partSlug = inferredPartSlugs.length === 1 ? inferredPartSlugs[0] ?? null : null;
  const songRef = doc(db, "songs", bundle.song.id);

  await runTransaction(db, async (transaction) => {
    const songSnap = await transaction.get(songRef);
    const songData = songSnap.data();
    const savedMixerMixes: unknown[] = Array.isArray(songData?.mixerMixes)
      ? songData.mixerMixes
      : [];
    const savedConfigurations = savedMixerMixes.map((value, index) =>
      mixerConfigurationFromData(value, index),
    );
    const targetConfiguration = configurationForUploadedStem(savedConfigurations, partSlug);

    transaction.set(trackRef, {
      filename,
      displayName: stemDisplayNameFromFilename(file.name),
      displayNameIsCustom: false,
      partSlug,
      contentType: file.type || "audio/mpeg",
      size: file.size,
      storagePath,
      downloadUrl,
      shown: true,
      isBackgroundMix: false,
      orderIndex,
      stateOverrides: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (targetConfiguration) {
      transaction.update(songRef, {
        mixerMixes: savedConfigurations.map((configuration) => ({
          ...configuration,
          trackIds: configuration.id === targetConfiguration.id
            ? [...new Set([...configuration.trackIds, trackRef.id])]
            : configuration.trackIds,
        })),
        updatedAt: serverTimestamp(),
      });
    }
  });

  return trackRef.id;
}

export async function uploadSongMixerDownload(
  bundle: SongMixerBundle,
  file: File,
  options: SongAssetUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const { onProgress, signal } = options;
  const lowerName = file.name.toLowerCase();
  const fileType: SongMixerDownload["fileType"] | null = lowerName.endsWith(".zip")
    ? "zip"
    : lowerName.endsWith(".mid") || lowerName.endsWith(".midi")
      ? "midi"
      : null;

  if (!fileType) {
    throw new Error("Download-only mixer files must be MIDI or ZIP files.");
  }

  const downloadRef = doc(collection(db, "songs", bundle.song.id, "mixerDownloads"));
  const filename = sanitizeFilename(file.name);
  const storagePath = `songs/${bundle.song.slug}/mixer-downloads/${downloadRef.id}-${filename}`;
  const uploadRef = ref(storage, storagePath);
  const fallbackContentType = fileType === "zip" ? "application/zip" : "audio/midi";
  const uploadTask = uploadBytesResumable(uploadRef, file, {
    contentType: file.type || fallbackContentType,
    cacheControl: "public,max-age=31536000,immutable",
  });
  const cancelUpload = () => uploadTask.cancel();

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => onProgress?.({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        }),
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  const ensureNotCanceled = async () => {
    if (!signal?.aborted) return;

    try {
      await deleteObject(uploadRef);
    } catch (caught) {
      if (!isMissingStorageObject(caught)) throw caught;
    }

    throw new DOMException("The upload was canceled.", "AbortError");
  };

  await ensureNotCanceled();
  const downloadUrl = await getDownloadURL(uploadRef);
  await ensureNotCanceled();

  await writeBatch(db)
    .set(downloadRef, {
      filename,
      displayName: stemDisplayNameFromFilename(file.name),
      contentType: file.type || fallbackContentType,
      fileType,
      size: file.size,
      storagePath,
      downloadUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    .commit();

  return downloadRef.id;
}

function configurationForUploadedStem(
  configurations: SongMixerConfiguration[],
  partSlug: string | null,
) {
  const targetId = partSlug?.startsWith("voc_")
    ? DEFAULT_SONG_MIXER_CONFIGURATION_IDS.vocals
    : partSlug
      ? DEFAULT_SONG_MIXER_CONFIGURATION_IDS.instruments
      : null;

  if (!targetId) return null;

  return configurations.find((configuration) => configuration.id === targetId) ?? null;
}

export async function saveSongMixerConfiguration(
  bundle: SongMixerBundle,
  tracks: SongMixerTrack[],
  videos: SongMixerVideo[],
  configurations: SongMixerConfiguration[],
  settings: SongMixerSettings,
  saveGlobalSettings: boolean,
) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);

  tracks.forEach((track, orderIndex) => {
    const displayName = track.displayName.trim() || stemDisplayNameFromFilename(track.filename);

    batch.update(doc(db, "songs", bundle.song.id, "mixerTracks", track.id), {
      displayName,
      displayNameIsCustom: displayName !== stemDisplayNameFromFilename(track.filename),
      partSlug: track.partSlug,
      shown: track.shown,
      isBackgroundMix: track.isBackgroundMix,
      orderIndex,
      stateOverrides: serializeMixerStateOverrides(track.stateOverrides),
      updatedAt: serverTimestamp(),
    });
  });

  videos.forEach((video) => {
    const displayName = video.displayName.trim() || stemDisplayNameFromFilename(video.filename);

    batch.update(doc(db, "songs", bundle.song.id, "mixerVideos", video.id), {
      displayName,
      partSlug: video.partSlug,
      updatedAt: serverTimestamp(),
    });
  });

  const trackIds = new Set(tracks.map((track) => track.id));
  batch.update(doc(db, "songs", bundle.song.id), {
    mixerMixes: configurations.map((configuration, orderIndex) => ({
      id: configuration.id,
      name: configuration.name.trim(),
      trackIds: configuration.trackIds.filter((trackId) => trackIds.has(trackId)),
      orderIndex,
    })),
    updatedAt: serverTimestamp(),
  });

  if (saveGlobalSettings) {
    batch.set(
      doc(db, "songs", "global-mixer-defaults", "mixerSettings", "main"),
      {
        states: settings.states,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

export async function saveSongMixerTrackOverrides(
  bundle: SongMixerBundle,
  trackId: string,
  stateOverrides: SongMixerStateOverrides,
) {
  const { db } = requireFirebase();

  await updateDoc(doc(db, "songs", bundle.song.id, "mixerTracks", trackId), {
    stateOverrides: serializeMixerStateOverrides(stateOverrides),
    updatedAt: serverTimestamp(),
  });
}

export async function saveSongMixerTrackOverridesBatch(
  bundle: SongMixerBundle,
  changes: Array<{ trackId: string; stateOverrides: SongMixerStateOverrides }>,
) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);

  changes.forEach(({ trackId, stateOverrides }) => {
    batch.update(doc(db, "songs", bundle.song.id, "mixerTracks", trackId), {
      stateOverrides: serializeMixerStateOverrides(stateOverrides),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function createSongAnnotation(
  bundle: SongMixerBundle,
  annotation: Omit<SongAnnotation, "id">,
) {
  const { db } = requireFirebase();
  const annotationRef = doc(collection(db, "songs", bundle.song.id, "annotations"));
  const batch = writeBatch(db);

  batch.set(annotationRef, {
    title: annotation.title,
    start: annotation.start,
    end: annotation.end,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return { id: annotationRef.id, ...annotation } satisfies SongAnnotation;
}

export async function updateSongAnnotation(
  bundle: SongMixerBundle,
  annotation: SongAnnotation,
) {
  const { db } = requireFirebase();

  await updateDoc(doc(db, "songs", bundle.song.id, "annotations", annotation.id), {
    title: annotation.title,
    start: annotation.start,
    end: annotation.end,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSongAnnotation(bundle: SongMixerBundle, annotationId: string) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);

  batch.delete(doc(db, "songs", bundle.song.id, "annotations", annotationId));
  await batch.commit();
}

export async function replaceSongAnnotations(
  bundle: SongMixerBundle,
  annotations: Array<Omit<SongAnnotation, "id">>,
) {
  const { db } = requireFirebase();
  const annotationsRef = collection(db, "songs", bundle.song.id, "annotations");
  const existingAnnotations = await getDocs(annotationsRef);

  if (existingAnnotations.size + annotations.length > 500) {
    throw new Error("Too many annotations to replace in one operation.");
  }

  const batch = writeBatch(db);
  existingAnnotations.docs.forEach((annotation) => batch.delete(annotation.ref));

  const replacements = annotations.map((annotation) => {
    const annotationRef = doc(annotationsRef);
    batch.set(annotationRef, {
      title: annotation.title,
      start: annotation.start,
      end: annotation.end,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { id: annotationRef.id, ...annotation } satisfies SongAnnotation;
  });

  await batch.commit();
  return replacements;
}

export async function deleteSongMixerTrack(bundle: SongMixerBundle, track: SongMixerTrack) {
  const { db, storage } = requireFirebase();

  try {
    await deleteObject(ref(storage, track.storagePath));
  } catch (caught) {
    if (!isMissingStorageObject(caught)) throw caught;
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, "songs", bundle.song.id, "mixerTracks", track.id));
  batch.update(doc(db, "songs", bundle.song.id), {
    mixerMixes: bundle.configurations.map((configuration, orderIndex) => ({
      id: configuration.id,
      name: configuration.name,
      trackIds: configuration.trackIds.filter((trackId) => trackId !== track.id),
      orderIndex,
    })),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteSongMixerVideo(bundle: SongMixerBundle, video: SongMixerVideo) {
  const { db, storage } = requireFirebase();

  try {
    await deleteObject(ref(storage, video.storagePath));
  } catch (caught) {
    if (!isMissingStorageObject(caught)) throw caught;
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, "songs", bundle.song.id, "mixerVideos", video.id));
  await batch.commit();
}

export async function deleteSongMixerDownload(
  bundle: SongMixerBundle,
  download: SongMixerDownload,
) {
  const { db, storage } = requireFirebase();

  try {
    await deleteObject(ref(storage, download.storagePath));
  } catch (caught) {
    if (!isMissingStorageObject(caught)) throw caught;
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, "songs", bundle.song.id, "mixerDownloads", download.id));
  await batch.commit();
}

export async function uploadSongAsset(
  bundle: SongBundle,
  file: File,
  options: SongAssetUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const { onProgress, signal } = options;
  const assetRef = doc(collection(db, "songs", bundle.song.id, "assets"));
  const partBySlug = new Map(DEFAULT_PARTS.map((part) => [part.slug, part]));

  for (const part of bundle.parts) {
    partBySlug.set(part.slug, part);
  }

  const availablePartSlugs = [...partBySlug.keys()];
  const suggestedPartSlugs = inferPartSlugs(file.name, availablePartSlugs);
  const filename = sanitizeFilename(file.name);
  const storagePath = `songs/${bundle.song.slug}/${assetRef.id}-${filename}`;
  const uploadRef = ref(storage, storagePath);

  const uploadTask = uploadBytesResumable(uploadRef, file, { contentType: file.type || undefined });
  const cancelUpload = () => {
    uploadTask.cancel();
  };

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        },
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  const ensureNotCanceled = async () => {
    if (!signal?.aborted) return;

    try {
      await deleteObject(uploadRef);
    } catch (caught) {
      if (!isMissingStorageObject(caught)) throw caught;
    }

    throw new DOMException("The upload was canceled.", "AbortError");
  };

  await ensureNotCanceled();
  const downloadUrl = await getDownloadURL(uploadRef);
  await ensureNotCanceled();

  const asset: Omit<SongAsset, "id"> = {
    filename,
    displayName: file.name,
    contentType: file.type || "application/octet-stream",
    fileType: fileTypeFromFile(file),
    size: file.size,
    storagePath,
    downloadUrl,
    assignedPartSlugs: suggestedPartSlugs,
    suggestedPartSlugs,
  };

  const batch = writeBatch(db);
  batch.set(assetRef, {
    ...asset,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const partSlug of suggestedPartSlugs) {
    const part = partBySlug.get(partSlug);

    if (!part) continue;

    batch.set(
      doc(db, "songs", bundle.song.id, "parts", partSlug),
      {
        slug: part.slug,
        label: part.label,
        sortOrder: part.sortOrder,
        assetIds: arrayUnion(assetRef.id),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await ensureNotCanceled();
  await batch.commit();
  return assetRef.id;
}

export async function saveAssetAssignments(bundle: SongBundle, assetId: string, nextPartSlugs: string[]) {
  const { db } = requireFirebase();
  const current = bundle.assets.find((asset) => asset.id === assetId);
  const previous = new Set(current?.assignedPartSlugs ?? []);
  const partBySlug = new Map(DEFAULT_PARTS.map((part) => [part.slug, part]));

  for (const part of bundle.parts) {
    partBySlug.set(part.slug, part);
  }

  const assignmentParts = [...partBySlug.values()];
  const sortedNextPartSlugs = sortPartSlugs(nextPartSlugs, assignmentParts);
  const next = new Set(sortedNextPartSlugs);
  const assetRef = doc(db, "songs", bundle.song.id, "assets", assetId);
  const batch = writeBatch(db);

  batch.update(assetRef, {
    assignedPartSlugs: sortedNextPartSlugs,
    updatedAt: serverTimestamp(),
  });

  for (const part of assignmentParts) {
    const partRef = doc(db, "songs", bundle.song.id, "parts", part.slug);

    if (next.has(part.slug) && !previous.has(part.slug)) {
      batch.set(
        partRef,
        {
          slug: part.slug,
          label: part.label,
          sortOrder: part.sortOrder,
          assetIds: arrayUnion(assetId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (!next.has(part.slug) && previous.has(part.slug)) {
      batch.set(
        partRef,
        {
          slug: part.slug,
          label: part.label,
          sortOrder: part.sortOrder,
          assetIds: arrayRemove(assetId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  await batch.commit();
}

function isMissingStorageObject(caught: unknown) {
  return (
    typeof caught === "object"
    && caught !== null
    && "code" in caught
    && caught.code === "storage/object-not-found"
  );
}

export async function deleteSongAsset(bundle: SongBundle, asset: SongAsset) {
  const { db, storage } = requireFirebase();
  const storagePaths = [
    ...new Set(
      [asset.storagePath, asset.thumbnailStoragePath].filter(
        (storagePath): storagePath is string => Boolean(storagePath),
      ),
    ),
  ];

  // Keep the metadata available for a retry until every owned storage object is gone.
  await Promise.all(
    storagePaths.map(async (storagePath) => {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (caught) {
        if (!isMissingStorageObject(caught)) throw caught;
      }
    }),
  );

  const batch = writeBatch(db);

  for (const part of bundle.parts) {
    batch.update(doc(db, "songs", bundle.song.id, "parts", part.slug), {
      assetIds: arrayRemove(asset.id),
      updatedAt: serverTimestamp(),
    });
  }

  batch.delete(doc(db, "songs", bundle.song.id, "assets", asset.id));
  await batch.commit();
}

export async function renameAsset(bundle: SongBundle, assetId: string, displayName: string) {
  if (!db) throw new Error("Firebase is not configured.");
  await updateDoc(doc(db, "songs", bundle.song.id, "assets", assetId), {
    displayName,
    updatedAt: serverTimestamp(),
  });
}

export async function saveVideoThumbnail(bundle: SongBundle, asset: SongAsset, thumbnail: Blob, thumbnailTime: number) {
  const { db, storage } = requireFirebase();
  const thumbnailStoragePath = `songs/${bundle.song.slug}/thumbnails/${asset.id}.jpg`;
  const thumbnailRef = ref(storage, thumbnailStoragePath);

  await uploadBytes(thumbnailRef, thumbnail, { contentType: "image/jpeg" });
  const thumbnailUrl = await getDownloadURL(thumbnailRef);

  await updateDoc(doc(db, "songs", bundle.song.id, "assets", asset.id), {
    thumbnailStoragePath,
    thumbnailUrl,
    thumbnailTime,
    updatedAt: serverTimestamp(),
  });

  return { thumbnailStoragePath, thumbnailUrl, thumbnailTime };
}

function lyricAlignmentSongFromDoc(
  id: string,
  data: Record<string, unknown>,
): LyricAlignmentSong {
  const audioData = objectValue(data.audio);
  const audio: LyricAlignmentAudio = {
    filename: String(audioData.filename ?? ""),
    contentType: String(audioData.contentType ?? "audio/mpeg"),
    size: Number(audioData.size ?? 0),
    storagePath: String(audioData.storagePath ?? ""),
    downloadUrl: String(audioData.downloadUrl ?? ""),
  };
  const storedStatus = String(data.status ?? "ready");
  const status: LyricAlignmentStatus = [
    "ready",
    "aligning",
    "aligned",
    "error",
  ].includes(storedStatus)
    ? (storedStatus as LyricAlignmentStatus)
    : "ready";

  return {
    id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? id),
    sortTitle: String(data.sortTitle ?? data.title ?? ""),
    lyrics: String(data.lyrics ?? ""),
    audio,
    status,
    errorMessage:
      typeof data.errorMessage === "string" && data.errorMessage
        ? data.errorMessage
        : undefined,
  };
}

async function nextAvailableLyricAlignmentSlug(baseSlug: string) {
  const { db } = requireFirebase();
  let candidate = baseSlug;
  let suffix = 2;

  while (
    (
      await getDoc(doc(db, "lyricAlignments", candidate))
    ).exists()
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function listLyricAlignmentSongs(): Promise<
  LyricAlignmentSong[]
> {
  if (!hasFirebaseConfig || !db) return [];

  const snaps = await getDocs(
    query(collection(db, "lyricAlignments"), orderBy("sortTitle", "asc")),
  );
  return snaps.docs.map((snap) =>
    lyricAlignmentSongFromDoc(snap.id, snap.data()),
  );
}

export async function getLyricAlignmentWorkspace(
  slug: string,
): Promise<LyricAlignmentWorkspace | null> {
  if (!hasFirebaseConfig || !db) return null;

  const [songSnap, originalSnap, currentSnap] = await Promise.all([
    getDoc(doc(db, "lyricAlignments", slug)),
    getDoc(doc(db, "lyricAlignments", slug, "versions", "original")),
    getDoc(doc(db, "lyricAlignments", slug, "versions", "current")),
  ]);

  if (!songSnap.exists()) return null;

  const originalValue = originalSnap.data()?.alignment;
  const currentValue = currentSnap.data()?.alignment;

  return {
    song: lyricAlignmentSongFromDoc(songSnap.id, songSnap.data()),
    original: isElevenLabsAlignment(originalValue) ? originalValue : null,
    current: isStoredLyricAlignment(currentValue) ? currentValue : null,
  };
}

export async function createLyricAlignmentSong(
  title: string,
  lyrics: string,
  file: File,
  options: SongAssetUploadOptions = {},
) {
  const { db, storage } = requireFirebase();
  const trimmedTitle = title.trim();
  const trimmedLyrics = lyrics.trim();
  const baseSlug = slugify(trimmedTitle);

  if (!baseSlug) {
    throw new Error("Song title must include at least one letter or number.");
  }
  if (!trimmedLyrics) {
    throw new Error("Paste the song lyrics before creating the alignment.");
  }

  const slug = await nextAvailableLyricAlignmentSlug(baseSlug);
  const audio = await uploadLyricAlignmentAudio(slug, file, options);
  const uploadRef = ref(storage, audio.storagePath);

  try {
    await writeBatch(db)
      .set(doc(db, "lyricAlignments", slug), {
        title: trimmedTitle,
        slug,
        sortTitle: sortTitle(trimmedTitle),
        lyrics: trimmedLyrics,
        audio,
        status: "ready",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      .commit();
  } catch (caught) {
    await deleteObject(uploadRef).catch(() => undefined);
    throw caught;
  }

  return slug;
}

export async function uploadLyricAlignmentAudio(
  slug: string,
  file: File,
  options: SongAssetUploadOptions = {},
): Promise<LyricAlignmentAudio> {
  const { storage } = requireFirebase();
  const { onProgress, signal } = options;

  if (!file.name.toLowerCase().endsWith(".mp3") && file.type !== "audio/mpeg") {
    throw new Error("Lyric alignment audio must be an MP3 file.");
  }
  if (file.size >= 200 * 1024 * 1024) {
    throw new Error("The MP3 must be smaller than 200 MB.");
  }

  const filename = sanitizeFilename(file.name);
  const storagePath = `lyric-alignments/${slug}/source/${crypto.randomUUID()}-${filename}`;
  const uploadRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(uploadRef, file, {
    contentType: "audio/mpeg",
    cacheControl: "public,max-age=31536000,immutable",
  });
  const cancelUpload = () => uploadTask.cancel();

  if (signal?.aborted) cancelUpload();
  signal?.addEventListener("abort", cancelUpload, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) =>
          onProgress?.({
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          }),
        reject,
        resolve,
      );
    });
  } finally {
    signal?.removeEventListener("abort", cancelUpload);
  }

  if (signal?.aborted) {
    await deleteObject(uploadRef).catch(() => undefined);
    throw new DOMException("The upload was canceled.", "AbortError");
  }

  return {
    filename,
    contentType: "audio/mpeg",
    size: file.size,
    storagePath,
    downloadUrl: await getDownloadURL(uploadRef),
  };
}

export async function deleteLyricAlignmentAudio(storagePath: string) {
  const { storage } = requireFirebase();
  await deleteObject(ref(storage, storagePath));
}

export async function setLyricAlignmentStatus(
  slug: string,
  status: LyricAlignmentStatus,
  errorMessage = "",
) {
  const { db } = requireFirebase();
  await updateDoc(doc(db, "lyricAlignments", slug), {
    status,
    errorMessage,
    updatedAt: serverTimestamp(),
  });
}

export async function saveLyricAlignmentResult(
  song: LyricAlignmentSong,
  alignment: ElevenLabsAlignment,
) {
  const { db } = requireFirebase();
  const originalRef = doc(
    db,
    "lyricAlignments",
    song.slug,
    "versions",
    "original",
  );
  const existingOriginal = await getDoc(originalRef);
  if (existingOriginal.exists()) {
    throw new Error(
      "This song already has an original ElevenLabs alignment.",
    );
  }

  const current = createStoredLyricAlignment(alignment, song.lyrics);
  const batch = writeBatch(db);
  batch.set(originalRef, {
    alignment,
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, "lyricAlignments", song.slug, "versions", "current"),
    {
      alignment: current,
      savedAt: serverTimestamp(),
    },
  );
  batch.update(doc(db, "lyricAlignments", song.slug), {
    status: "aligned",
    errorMessage: "",
    alignedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return current;
}

export async function replaceLyricAlignmentResult(
  song: LyricAlignmentSong,
  audio: LyricAlignmentAudio,
  alignment: ElevenLabsAlignment,
) {
  const { db, storage } = requireFirebase();
  const current = createStoredLyricAlignment(alignment, song.lyrics);
  const batch = writeBatch(db);

  batch.set(
    doc(db, "lyricAlignments", song.slug, "versions", "original"),
    {
      alignment,
      createdAt: serverTimestamp(),
    },
  );
  batch.set(
    doc(db, "lyricAlignments", song.slug, "versions", "current"),
    {
      alignment: current,
      savedAt: serverTimestamp(),
    },
  );
  batch.update(doc(db, "lyricAlignments", song.slug), {
    audio,
    status: "aligned",
    errorMessage: "",
    alignedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  if (song.audio.storagePath !== audio.storagePath) {
    await deleteObject(ref(storage, song.audio.storagePath)).catch(
      () => undefined,
    );
  }

  return current;
}

export async function saveLyricAlignmentDraft(
  slug: string,
  alignment: StoredLyricAlignment,
) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);
  batch.set(
    doc(db, "lyricAlignments", slug, "versions", "current"),
    {
      alignment,
      savedAt: serverTimestamp(),
    },
  );
  batch.update(doc(db, "lyricAlignments", slug), {
    status: "aligned",
    errorMessage: "",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
