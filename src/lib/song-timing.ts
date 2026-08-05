"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import type {
  SongTimingAssignments,
  SongTimingWorkspace,
  TimingAttribute,
  TimingSegment,
} from "@/lib/domain";
import { db, hasFirebaseConfig } from "@/lib/firebase";
import { listSongs } from "@/lib/firestore";
import { sampleSongList } from "@/lib/sample-data";

const DEMO_STORAGE_KEY = "swell-song-timing-v1";

type DemoTimingState = {
  attributes: TimingAttribute[];
  assignments: SongTimingAssignments;
  durations: Record<string, number>;
};

const DEFAULT_DEMO_STATE: DemoTimingState = {
  attributes: [
    { id: "demo-brian", label: "Brian", visible: true, orderIndex: 0 },
    { id: "demo-chris", label: "Chris", visible: true, orderIndex: 1 },
    { id: "demo-jackson", label: "Jackson", visible: true, orderIndex: 2 },
  ],
  assignments: {
    "demo-i-get-around": {
      "demo-brian": [
        { startPercent: 5, endPercent: 14 },
        { startPercent: 44, endPercent: 57 },
      ],
      "demo-chris": [
        { startPercent: 26, endPercent: 33 },
        { startPercent: 73, endPercent: 81 },
      ],
      "demo-jackson": [{ startPercent: 52, endPercent: 58 }],
    },
    "demo-rhonda": {
      "demo-brian": [{ startPercent: 12, endPercent: 22 }],
      "demo-chris": [{ startPercent: 61, endPercent: 69 }],
    },
  },
  durations: {},
};

function cloneDefaultDemoState(): DemoTimingState {
  return JSON.parse(JSON.stringify(DEFAULT_DEMO_STATE)) as DemoTimingState;
}

function readDemoState(): DemoTimingState {
  if (typeof window === "undefined") return cloneDefaultDemoState();

  const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!stored) return cloneDefaultDemoState();

  try {
    const parsed = JSON.parse(stored) as Partial<DemoTimingState>;
    return {
      attributes: Array.isArray(parsed.attributes)
        ? parsed.attributes
            .map((attribute) => attributeFromData(attribute))
            .filter((attribute): attribute is TimingAttribute => Boolean(attribute))
        : cloneDefaultDemoState().attributes,
      assignments: assignmentsFromData(parsed.assignments),
      durations: durationMapFromData(parsed.durations),
    };
  } catch {
    return cloneDefaultDemoState();
  }
}

function writeDemoState(state: DemoTimingState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

function shouldUseDemoTimingStore() {
  if (!hasFirebaseConfig || !db) return true;
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("demo") === "1";
}

function requireTimingFirestore() {
  if (!db) {
    throw new Error("Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values to .env.local.");
  }

  return db;
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampPercent(value: unknown) {
  return Math.round(Math.min(100, Math.max(0, finiteNumber(value))) * 100) / 100;
}

export function normalizeTimingSegments(value: unknown): TimingSegment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const startPercent = clampPercent(data.startPercent);
      if (data.endPercent === null || data.endPercent === undefined) {
        return { startPercent, endPercent: null };
      }
      const endPercent = clampPercent(data.endPercent);
      return endPercent > startPercent ? { startPercent, endPercent } : null;
    })
    .filter((segment): segment is TimingSegment => Boolean(segment))
    .sort(
      (left, right) =>
        left.startPercent - right.startPercent
        || (left.endPercent ?? 101) - (right.endPercent ?? 101),
    );
}

function attributeFromData(value: unknown, fallbackId = ""): TimingAttribute | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = String(data.id ?? fallbackId).trim();
  const label = String(data.label ?? "").trim();
  if (!id || !label) return null;

  return {
    id,
    label,
    visible: data.visible !== false,
    orderIndex: finiteNumber(data.orderIndex),
  };
}

function assignmentsFromData(value: unknown): SongTimingAssignments {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([songId, songValue]) => {
      const perAttribute = songValue && typeof songValue === "object"
        ? Object.fromEntries(
            Object.entries(songValue as Record<string, unknown>)
              .map(([attributeId, segments]) => [attributeId, normalizeTimingSegments(segments)])
              .filter(([, segments]) => (segments as TimingSegment[]).length > 0),
          )
        : {};
      return [songId, perAttribute];
    }),
  );
}

function durationMapFromData(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const durations: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([songId, value]) => {
    const duration = finiteNumber(value);
    if (duration > 0) durations[songId] = duration;
  });
  return durations;
}

export async function loadSongTimingWorkspace(): Promise<SongTimingWorkspace> {
  const demoMode = shouldUseDemoTimingStore();
  const songs = demoMode ? sampleSongList() : await listSongs();

  if (demoMode) {
    const demo = readDemoState();
    return {
      songs: songs.map((song) => ({
        ...song,
        timingDurationSeconds: demo.durations[song.id] ?? song.timingDurationSeconds,
      })),
      attributes: [...demo.attributes].sort(
        (left, right) => left.orderIndex - right.orderIndex || left.label.localeCompare(right.label),
      ),
      assignments: demo.assignments,
    };
  }

  const firestore = requireTimingFirestore();
  const [attributeSnaps, assignmentSnaps] = await Promise.all([
    getDocs(query(collection(firestore, "timingAttributes"), orderBy("orderIndex", "asc"))),
    Promise.all(
      songs.map((song) =>
        getDocs(collection(firestore, "songs", song.id, "timingAssignments")),
      ),
    ),
  ]);
  const attributes = attributeSnaps.docs
    .map((snap) => attributeFromData({ id: snap.id, ...snap.data() }, snap.id))
    .filter((attribute): attribute is TimingAttribute => Boolean(attribute));
  const assignments: SongTimingAssignments = {};

  assignmentSnaps.forEach((snaps, songIndex) => {
    const songId = songs[songIndex]?.id;
    if (!songId) return;

    const perAttribute = Object.fromEntries(
      snaps.docs
        .map((snap) => [snap.id, normalizeTimingSegments(snap.data().segments)] as const)
        .filter(([, segments]) => segments.length > 0),
    );
    if (Object.keys(perAttribute).length) assignments[songId] = perAttribute;
  });

  return { songs, attributes, assignments };
}

export async function createTimingAttribute(
  label: string,
  orderIndex: number,
): Promise<TimingAttribute> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error("Attribute name is required.");
  const id = crypto.randomUUID();
  const attribute: TimingAttribute = {
    id,
    label: trimmedLabel,
    visible: true,
    orderIndex,
  };

  if (shouldUseDemoTimingStore()) {
    const demo = readDemoState();
    demo.attributes.push(attribute);
    writeDemoState(demo);
    return attribute;
  }

  await setDoc(doc(requireTimingFirestore(), "timingAttributes", id), {
    label: attribute.label,
    visible: attribute.visible,
    orderIndex: attribute.orderIndex,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return attribute;
}

export async function updateTimingAttribute(
  attributeId: string,
  changes: Partial<Pick<TimingAttribute, "label" | "visible">>,
) {
  const normalizedChanges = {
    ...(typeof changes.label === "string" ? { label: changes.label.trim() } : {}),
    ...(typeof changes.visible === "boolean" ? { visible: changes.visible } : {}),
  };
  if ("label" in normalizedChanges && !normalizedChanges.label) {
    throw new Error("Attribute name is required.");
  }

  if (shouldUseDemoTimingStore()) {
    const demo = readDemoState();
    demo.attributes = demo.attributes.map((attribute) =>
      attribute.id === attributeId ? { ...attribute, ...normalizedChanges } : attribute,
    );
    writeDemoState(demo);
    return;
  }

  await updateDoc(doc(requireTimingFirestore(), "timingAttributes", attributeId), {
    ...normalizedChanges,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTimingAttribute(attributeId: string, songIds: string[]) {
  if (shouldUseDemoTimingStore()) {
    const demo = readDemoState();
    demo.attributes = demo.attributes.filter((attribute) => attribute.id !== attributeId);
    Object.values(demo.assignments).forEach((songAssignments) => {
      delete songAssignments[attributeId];
    });
    writeDemoState(demo);
    return;
  }

  const firestore = requireTimingFirestore();
  const refs = [
    doc(firestore, "timingAttributes", attributeId),
    ...songIds.map((songId) =>
      doc(firestore, "songs", songId, "timingAssignments", attributeId),
    ),
  ];

  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(firestore);
    refs.slice(index, index + 450).forEach((documentRef) => batch.delete(documentRef));
    await batch.commit();
  }
}

export async function saveSongTimingSegments(
  songId: string,
  attributeId: string,
  segments: TimingSegment[],
) {
  const normalizedSegments = normalizeTimingSegments(segments);

  if (shouldUseDemoTimingStore()) {
    const demo = readDemoState();
    const songAssignments = demo.assignments[songId] ?? {};
    if (normalizedSegments.length) songAssignments[attributeId] = normalizedSegments;
    else delete songAssignments[attributeId];
    if (Object.keys(songAssignments).length) demo.assignments[songId] = songAssignments;
    else delete demo.assignments[songId];
    writeDemoState(demo);
    return;
  }

  const assignmentRef = doc(
    requireTimingFirestore(),
    "songs",
    songId,
    "timingAssignments",
    attributeId,
  );
  if (!normalizedSegments.length) {
    await deleteDoc(assignmentRef);
    return;
  }

  await setDoc(assignmentRef, {
    segments: normalizedSegments,
    updatedAt: serverTimestamp(),
  });
}

export async function saveSongTimingDuration(songId: string, durationSeconds: number) {
  const normalizedDuration = Math.max(1, Math.round(durationSeconds));

  if (shouldUseDemoTimingStore()) {
    const demo = readDemoState();
    demo.durations[songId] = normalizedDuration;
    writeDemoState(demo);
    return;
  }

  await updateDoc(doc(requireTimingFirestore(), "songs", songId), {
    timingDurationSeconds: normalizedDuration,
    updatedAt: serverTimestamp(),
  });
}
