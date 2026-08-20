"use client";

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import type { Song, SongTag } from "@/lib/domain";
import { slugify } from "@/lib/domain";
import { db, hasFirebaseConfig } from "@/lib/firebase";

const DEMO_STORE_KEY = "swell-parts:song-tags:v1";

interface DemoSongTagStore {
  tags: SongTag[];
  songTagIds: Record<string, string[]>;
}

function seedDemoStore(): DemoSongTagStore {
  return {
    tags: [
      { id: "demo-up-tempo", label: "Up-tempo" },
      { id: "demo-vocal-feature", label: "Vocal feature" },
      { id: "demo-rehearsal-focus", label: "Rehearsal focus" },
    ],
    songTagIds: {
      "demo-california-girls": ["demo-up-tempo"],
      "demo-i-get-around": ["demo-up-tempo", "demo-vocal-feature"],
      "demo-rhonda": ["demo-vocal-feature", "demo-rehearsal-focus"],
    },
  };
}

export function isSongTagDemoMode() {
  return !hasFirebaseConfig
    || (typeof window !== "undefined"
      && new URLSearchParams(window.location.search).get("demo") === "1");
}

function readDemoStore(): DemoSongTagStore {
  const seed = seedDemoStore();
  if (typeof window === "undefined") return seed;

  const stored = window.localStorage.getItem(DEMO_STORE_KEY);
  if (!stored) {
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<DemoSongTagStore>;
    return {
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.flatMap((tag) => (
            tag && typeof tag.id === "string" && typeof tag.label === "string"
              ? [{ id: tag.id, label: tag.label }]
              : []
          ))
        : seed.tags,
      songTagIds: parsed.songTagIds && typeof parsed.songTagIds === "object"
        ? Object.fromEntries(
            Object.entries(parsed.songTagIds).map(([songId, tagIds]) => [
              songId,
              Array.isArray(tagIds) ? tagIds.map(String) : [],
            ]),
          )
        : seed.songTagIds,
    };
  } catch {
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeDemoStore(store: DemoSongTagStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function cleanLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

function sortLabel(label: string) {
  return cleanLabel(label).toLocaleLowerCase();
}

function validateLabel(label: string) {
  const cleaned = cleanLabel(label);
  if (!cleaned) throw new Error("Enter a tag name.");
  if (cleaned.length > 40) throw new Error("Tag names must be 40 characters or fewer.");
  return cleaned;
}

function sortTags(tags: SongTag[]) {
  return [...tags].sort((left, right) => left.label.localeCompare(right.label));
}

function tagFromDoc(id: string, data: Record<string, unknown>): SongTag {
  return {
    id,
    label: String(data.label ?? ""),
  };
}

async function ensureUniqueLabel(label: string, ignoredTagId?: string) {
  const normalized = sortLabel(label);

  if (isSongTagDemoMode() || !db) {
    const duplicate = readDemoStore().tags.find(
      (tag) => tag.id !== ignoredTagId && sortLabel(tag.label) === normalized,
    );
    if (duplicate) throw new Error(`A tag named “${label}” already exists.`);
    return;
  }

  const snapshot = await getDocs(
    query(collection(db, "songTags"), where("sortLabel", "==", normalized)),
  );
  if (snapshot.docs.some((tagSnapshot) => tagSnapshot.id !== ignoredTagId)) {
    throw new Error(`A tag named “${label}” already exists.`);
  }
}

export function applyDemoSongTags(songs: Song[]) {
  if (!isSongTagDemoMode()) return songs;
  const store = readDemoStore();
  return songs.map((song) => ({
    ...song,
    tagIds: store.songTagIds[song.id] ?? song.tagIds ?? [],
  }));
}

export async function listSongTags(): Promise<SongTag[]> {
  if (isSongTagDemoMode() || !db) return sortTags(readDemoStore().tags);

  try {
    const snapshot = await getDocs(
      query(collection(db, "songTags"), orderBy("sortLabel", "asc")),
    );
    return snapshot.docs
      .map((tagSnapshot) => tagFromDoc(tagSnapshot.id, tagSnapshot.data()))
      .filter((tag) => tag.label);
  } catch (caught) {
    console.warn("[swell-parts] Could not read song tags from Firestore.", caught);
    return [];
  }
}

export async function createSongTag(label: string): Promise<SongTag> {
  const cleaned = validateLabel(label);
  await ensureUniqueLabel(cleaned);

  if (isSongTagDemoMode() || !db) {
    const store = readDemoStore();
    const tag = {
      id: `demo-${slugify(cleaned) || "tag"}-${Date.now()}`,
      label: cleaned,
    };
    store.tags = sortTags([...store.tags, tag]);
    writeDemoStore(store);
    return tag;
  }

  const tagRef = doc(collection(db, "songTags"));
  await setDoc(tagRef, {
    label: cleaned,
    sortLabel: sortLabel(cleaned),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: tagRef.id, label: cleaned };
}

export async function updateSongTag(tagId: string, label: string): Promise<SongTag> {
  const cleaned = validateLabel(label);
  await ensureUniqueLabel(cleaned, tagId);

  if (isSongTagDemoMode() || !db) {
    const store = readDemoStore();
    store.tags = sortTags(
      store.tags.map((tag) => tag.id === tagId ? { ...tag, label: cleaned } : tag),
    );
    writeDemoStore(store);
    return { id: tagId, label: cleaned };
  }

  await updateDoc(doc(db, "songTags", tagId), {
    label: cleaned,
    sortLabel: sortLabel(cleaned),
    updatedAt: serverTimestamp(),
  });
  return { id: tagId, label: cleaned };
}

export async function deleteSongTag(tagId: string) {
  if (isSongTagDemoMode() || !db) {
    const store = readDemoStore();
    store.tags = store.tags.filter((tag) => tag.id !== tagId);
    store.songTagIds = Object.fromEntries(
      Object.entries(store.songTagIds).map(([songId, tagIds]) => [
        songId,
        tagIds.filter((id) => id !== tagId),
      ]),
    );
    writeDemoStore(store);
    return;
  }

  const songsSnapshot = await getDocs(collection(db, "songs"));
  const batch = writeBatch(db);
  songsSnapshot.docs.forEach((songSnapshot) => {
    const tagIds: string[] = Array.isArray(songSnapshot.data().tagIds)
      ? songSnapshot.data().tagIds.map(String)
      : [];
    if (tagIds.includes(tagId)) {
      batch.update(songSnapshot.ref, {
        tagIds: tagIds.filter((id) => id !== tagId),
        updatedAt: serverTimestamp(),
      });
    }
  });
  batch.delete(doc(db, "songTags", tagId));
  await batch.commit();
}

export async function updateSongTagIds(songId: string, tagIds: string[]) {
  const normalized = [...new Set(tagIds)];

  if (isSongTagDemoMode() || !db) {
    const store = readDemoStore();
    const validTagIds = new Set(store.tags.map((tag) => tag.id));
    store.songTagIds[songId] = normalized.filter((tagId) => validTagIds.has(tagId));
    writeDemoStore(store);
    return;
  }

  await updateDoc(doc(db, "songs", songId), {
    tagIds: normalized,
    updatedAt: serverTimestamp(),
  });
}
