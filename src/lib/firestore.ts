"use client";

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";

import {
  createDefaultSongMixerConfigurations,
  createDefaultSongMixerSettings,
  DEFAULT_SONG_MIXER_CONFIGURATION_IDS,
  DEFAULT_PARTS,
  fileTypeFromFile,
  inferPartSlugs,
  SONG_MIXER_STATE_NAMES,
  sanitizeFilename,
  slugify,
  sortPartSlugs,
  sortTitle,
  stemDisplayNameFromFilename,
  type Song,
  type SongAsset,
  type SongAnnotation,
  type SongBundle,
  type SongMixerBundle,
  type SongMixerConfiguration,
  type SongMixerSettings,
  type SongMixerStateName,
  type SongMixerStateOverride,
  type SongMixerStateOverrides,
  type SongMixerStateValues,
  type SongMixerTrack,
  type SongPart,
  type PartSongRow,
} from "@/lib/domain";
import { db, hasFirebaseConfig, storage } from "@/lib/firebase";
import { samplePartRows, sampleSongBundle, sampleSongList } from "@/lib/sample-data";

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
    notes: typeof data.notes === "string" ? data.notes : undefined,
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
  if (!hasFirebaseConfig || !db) return sampleSongList();

  try {
    const firestore = db;
    const snaps = await getDocs(query(collection(firestore, "songs"), orderBy("sortTitle", "asc")));
    return snaps.docs.map((snap) => songFromDoc(snap.id, snap.data()));
  } catch (caught) {
    warnReadFailure("songs", caught);
    return [];
  }
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

    const [tracksSnap, settingsSnap, annotationsSnap] = await Promise.all([
      getDocs(collection(firestore, "songs", songSnap.id, "mixerTracks")),
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

export async function deleteSong(song: Song) {
  const { db } = requireFirebase();
  const batch = writeBatch(db);
  const [partsSnap, assetsSnap] = await Promise.all([
    getDocs(collection(db, "songs", song.id, "parts")),
    getDocs(collection(db, "songs", song.id, "assets")),
  ]);

  for (const snap of partsSnap.docs) {
    batch.delete(snap.ref);
  }

  for (const snap of assetsSnap.docs) {
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
