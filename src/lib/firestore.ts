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
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";

import {
  DEFAULT_PARTS,
  fileTypeFromFile,
  inferPartSlugs,
  sanitizeFilename,
  slugify,
  sortPartSlugs,
  sortTitle,
  type Song,
  type SongAsset,
  type SongBundle,
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
