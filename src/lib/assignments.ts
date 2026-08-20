"use client";

import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import type {
  Band,
  BandMember,
  BandSongOverride,
  MemberSongDefault,
  Song,
  SongAssignmentBundle,
  SongTag,
  VocalPartSlug,
} from "@/lib/domain";
import {
  ASSIGNMENT_STEM_PART_BY_INSTRUMENT_ID,
  createBandCode,
  DEFAULT_PARTS,
  samePartSlugs,
  slugify,
  sortPartSlugs,
  VOCAL_PART_SLUGS,
} from "@/lib/domain";
import { db, hasFirebaseConfig, storage } from "@/lib/firebase";
import { getSongBundle, listBandSongArrangements, listSongs } from "@/lib/firestore";
import {
  sampleBands,
  sampleBandSongOverrides,
  sampleMembers,
  sampleMemberSongDefaults,
} from "@/lib/sample-assignments";
import { sampleSongBundle, sampleSongList } from "@/lib/sample-data";
import { applyDemoSongTags, listSongTags } from "@/lib/song-tags";

const DEMO_STORE_KEY = "swell-parts:assignments:v1";

function isDemoAssignments() {
  return !hasFirebaseConfig || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1");
}

interface DemoAssignmentStore {
  members: BandMember[];
  bands: Band[];
  defaults: MemberSongDefault[];
  overrides: BandSongOverride[];
}

export interface MemberSongAssignmentRow {
  song: Song;
  partSlugs: string[];
}

export interface MemberAssignmentPageData {
  member: BandMember;
  bands: Band[];
  selectedBand: Band;
  tags: SongTag[];
  rows: MemberSongAssignmentRow[];
}

export interface AssignmentChange {
  memberId: string;
  partSlugs: string[];
}

function seedStore(): DemoAssignmentStore {
  return {
    members: structuredClone(sampleMembers),
    bands: structuredClone(sampleBands),
    defaults: structuredClone(sampleMemberSongDefaults),
    overrides: structuredClone(sampleBandSongOverrides),
  };
}

function readDemoStore() {
  if (typeof window === "undefined") return seedStore();

  const stored = window.localStorage.getItem(DEMO_STORE_KEY);
  if (!stored) {
    const seed = seedStore();
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(stored) as DemoAssignmentStore;
    return {
      ...parsed,
      bands: parsed.bands.map((band) => ({
        ...band,
        vocalPartByMemberId: band.vocalPartByMemberId ?? {},
      })),
    };
  } catch {
    const seed = seedStore();
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeDemoStore(store: DemoAssignmentStore) {
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function memberFromDoc(id: string, data: Record<string, unknown>): BandMember {
  return {
    id,
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    displayName: String(data.displayName ?? data.firstName ?? ""),
    slug: String(data.slug ?? id),
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
    photoStoragePath: typeof data.photoStoragePath === "string" ? data.photoStoragePath : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare this headshot."));
    reader.readAsDataURL(blob);
  });
}

function bandFromDoc(id: string, data: Record<string, unknown>): Band {
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

function cleanVocalPartMap(
  memberIds: string[],
  vocalPartByMemberId: Partial<Record<string, VocalPartSlug>>,
) {
  const memberIdSet = new Set(memberIds);
  const usedParts = new Set<VocalPartSlug>();

  return Object.fromEntries(
    Object.entries(vocalPartByMemberId).flatMap(([memberId, partSlug]) => {
      if (
        !memberIdSet.has(memberId)
        || !partSlug
        || !VOCAL_PART_SLUGS.includes(partSlug)
        || usedParts.has(partSlug)
      ) {
        return [];
      }
      usedParts.add(partSlug);
      return [[memberId, partSlug]];
    }),
  ) as Partial<Record<string, VocalPartSlug>>;
}

function defaultFromDoc(data: Record<string, unknown>): MemberSongDefault {
  return {
    memberId: String(data.memberId ?? ""),
    songId: String(data.songId ?? ""),
    partSlugs: Array.isArray(data.partSlugs) ? data.partSlugs.map(String) : [],
  };
}

function overrideFromDoc(data: Record<string, unknown>): BandSongOverride {
  return {
    bandId: String(data.bandId ?? ""),
    songId: String(data.songId ?? ""),
    memberId: String(data.memberId ?? ""),
    partSlugs: Array.isArray(data.partSlugs) ? data.partSlugs.map(String) : [],
  };
}

function requireDb() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

async function nextMemberSlug(value: string, ignoredMemberId?: string) {
  const base = slugify(value) || "member";

  if (isDemoAssignments() || !db) {
    const members = readDemoStore().members;
    let candidate = base;
    let suffix = 2;
    while (members.some((member) => member.slug === candidate && member.id !== ignoredMemberId)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  let candidate = base;
  let suffix = 2;
  while (true) {
    const snaps = await getDocs(query(collection(db, "members"), where("slug", "==", candidate), limit(1)));
    const existing = snaps.docs[0];
    if (!existing || existing.id === ignoredMemberId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function publicMember(member: BandMember): BandMember {
  return { ...member, email: undefined, phone: undefined, notes: undefined };
}

export async function listMembers(includePrivate = false): Promise<BandMember[]> {
  if (isDemoAssignments() || !db) {
    return readDemoStore().members
      .map((member) => includePrivate ? member : publicMember(member))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  const snaps = await getDocs(query(collection(db, "members"), orderBy("displayName", "asc")));
  const members = snaps.docs.map((snap) => memberFromDoc(snap.id, snap.data()));
  if (!includePrivate) return members;
  const privateSnaps = await getDocs(collection(db, "memberPrivate"));
  const privateMap = new Map(privateSnaps.docs.map((snap) => [snap.id, snap.data()]));
  return members.map((member) => {
    const privateData = privateMap.get(member.id);
    return privateData ? {
      ...member,
      email: typeof privateData.email === "string" ? privateData.email : undefined,
      phone: typeof privateData.phone === "string" ? privateData.phone : undefined,
      notes: typeof privateData.notes === "string" ? privateData.notes : undefined,
    } : member;
  });
}

export async function getMemberBySlug(slug: string) {
  if (isDemoAssignments() || !db) {
    const member = readDemoStore().members.find((item) => item.slug === slug);
    return member ? publicMember(member) : null;
  }

  const snaps = await getDocs(query(collection(db, "members"), where("slug", "==", slug), limit(1)));
  const snap = snaps.docs[0];
  return snap ? memberFromDoc(snap.id, snap.data()) : null;
}

export async function createMember(input: Omit<BandMember, "id" | "slug">) {
  const displayName = input.displayName.trim() || input.firstName.trim();
  const slug = await nextMemberSlug(displayName);

  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    const member: BandMember = { ...input, id: `member-${slug}-${Date.now()}`, displayName, slug };
    store.members.push(member);
    writeDemoStore(store);
    return member;
  }

  const firestore = requireDb();
  const memberRef = doc(collection(firestore, "members"));
  const member = { firstName: input.firstName, lastName: input.lastName, displayName, slug };
  const batch = writeBatch(firestore);
  batch.set(memberRef, { ...member, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(doc(firestore, "memberPrivate", memberRef.id), {
    email: input.email ?? "",
    phone: input.phone ?? "",
    notes: input.notes ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return { ...input, ...member, id: memberRef.id };
}

export async function updateMember(member: BandMember, input: Omit<BandMember, "id" | "slug">) {
  const displayName = input.displayName.trim() || input.firstName.trim();
  const slug = await nextMemberSlug(displayName, member.id);

  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    store.members = store.members.map((item) =>
      item.id === member.id ? { ...input, id: member.id, displayName, slug } : item,
    );
    writeDemoStore(store);
    return;
  }

  const firestore = requireDb();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "members", member.id), {
    firstName: input.firstName,
    lastName: input.lastName,
    displayName,
    slug,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(firestore, "memberPrivate", member.id), {
    email: input.email ?? "",
    phone: input.phone ?? "",
    notes: input.notes ?? "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

export async function saveMemberHeadshot(memberId: string, image: Blob) {
  if (isDemoAssignments() || !storage) {
    const photoUrl = await blobToDataUrl(image);
    const photoStoragePath = `demo/members/${memberId}/headshot.jpg`;
    const store = readDemoStore();
    store.members = store.members.map((member) => (
      member.id === memberId ? { ...member, photoUrl, photoStoragePath } : member
    ));
    writeDemoStore(store);
    return { photoUrl, photoStoragePath };
  }

  const photoStoragePath = `members/${memberId}/headshot.jpg`;
  const uploadRef = ref(storage, photoStoragePath);
  await uploadBytes(uploadRef, image, { contentType: "image/jpeg" });
  const photoUrl = await getDownloadURL(uploadRef);
  await updateDoc(doc(requireDb(), "members", memberId), {
    photoUrl,
    photoStoragePath,
    updatedAt: serverTimestamp(),
  });
  return { photoUrl, photoStoragePath };
}

export async function deleteMember(memberId: string) {
  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    store.members = store.members.filter((member) => member.id !== memberId);
    store.bands = store.bands.map((band) => ({
      ...band,
      memberIds: band.memberIds.filter((id) => id !== memberId),
      vocalPartByMemberId: Object.fromEntries(
        Object.entries(band.vocalPartByMemberId).filter(([id]) => id !== memberId),
      ),
    }));
    store.defaults = store.defaults.filter((item) => item.memberId !== memberId);
    store.overrides = store.overrides.filter((item) => item.memberId !== memberId);
    writeDemoStore(store);
    return;
  }

  const firestore = requireDb();
  const [bands, defaults, overrides] = await Promise.all([
    getDocs(query(collection(firestore, "bands"), where("memberIds", "array-contains", memberId))),
    getDocs(query(collection(firestore, "memberSongDefaults"), where("memberId", "==", memberId))),
    getDocs(query(collection(firestore, "bandSongOverrides"), where("memberId", "==", memberId))),
  ]);
  const batch = writeBatch(firestore);
  bands.docs.forEach((bandSnapshot) => {
    const band = bandFromDoc(bandSnapshot.id, bandSnapshot.data());
    batch.update(bandSnapshot.ref, {
      memberIds: arrayRemove(memberId),
      vocalPartByMemberId: Object.fromEntries(
        Object.entries(band.vocalPartByMemberId).filter(([id]) => id !== memberId),
      ),
      updatedAt: serverTimestamp(),
    });
  });
  defaults.docs.forEach((item) => batch.delete(item.ref));
  overrides.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(firestore, "memberPrivate", memberId));
  batch.delete(doc(firestore, "members", memberId));
  await batch.commit();
}

export async function listBands(): Promise<Band[]> {
  if (isDemoAssignments() || !db) {
    return readDemoStore().bands.sort((left, right) => left.title.localeCompare(right.title));
  }

  const snaps = await getDocs(query(collection(db, "bands"), orderBy("title", "asc")));
  return snaps.docs.map((snap) => bandFromDoc(snap.id, snap.data()));
}

async function uniqueBandCode(ignoredBandId?: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = createBandCode();
    if (isDemoAssignments() || !db) {
      if (!readDemoStore().bands.some((band) => band.code === code && band.id !== ignoredBandId)) return code;
      continue;
    }
    const snaps = await getDocs(query(collection(db, "bands"), where("code", "==", code), limit(1)));
    const existing = snaps.docs[0];
    if (!existing || existing.id === ignoredBandId) return code;
  }
  throw new Error("Could not generate a unique band code. Try again.");
}

export async function createBand(
  title: string,
  memberIds: string[],
  vocalPartByMemberId: Partial<Record<string, VocalPartSlug>> = {},
) {
  const code = await uniqueBandCode();
  const cleanTitle = title.trim();
  const uniqueMemberIds = [...new Set(memberIds)];
  const cleanVocalParts = cleanVocalPartMap(uniqueMemberIds, vocalPartByMemberId);

  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    const band: Band = {
      id: `band-${code.toLowerCase()}`,
      title: cleanTitle,
      code,
      memberIds: uniqueMemberIds,
      vocalPartByMemberId: cleanVocalParts,
    };
    store.bands.push(band);
    writeDemoStore(store);
    return band;
  }

  const firestore = requireDb();
  const bandRef = doc(collection(firestore, "bands"));
  const band = {
    title: cleanTitle,
    code,
    memberIds: uniqueMemberIds,
    vocalPartByMemberId: cleanVocalParts,
  };
  await setDoc(bandRef, { ...band, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { ...band, id: bandRef.id };
}

export async function updateBand(
  band: Band,
  title: string,
  memberIds: string[],
  vocalPartByMemberId: Partial<Record<string, VocalPartSlug>> = {},
) {
  const uniqueMemberIds = [...new Set(memberIds)];
  const next = {
    ...band,
    title: title.trim(),
    memberIds: uniqueMemberIds,
    vocalPartByMemberId: cleanVocalPartMap(uniqueMemberIds, vocalPartByMemberId),
  };
  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    store.bands = store.bands.map((item) => (item.id === band.id ? next : item));
    writeDemoStore(store);
    return;
  }

  await updateDoc(doc(requireDb(), "bands", band.id), {
    title: next.title,
    memberIds: next.memberIds,
    vocalPartByMemberId: next.vocalPartByMemberId,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBand(bandId: string) {
  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    store.bands = store.bands.filter((band) => band.id !== bandId);
    store.overrides = store.overrides.filter((item) => item.bandId !== bandId);
    writeDemoStore(store);
    return;
  }

  const firestore = requireDb();
  const [overrides, arrangements] = await Promise.all([
    getDocs(query(collection(firestore, "bandSongOverrides"), where("bandId", "==", bandId))),
    getDocs(query(collection(firestore, "bandSongArrangements"), where("bandId", "==", bandId))),
  ]);
  const batch = writeBatch(firestore);
  overrides.docs.forEach((item) => batch.delete(item.ref));
  arrangements.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(doc(firestore, "bands", bandId));
  await batch.commit();
}

async function defaultsForSong(songId: string) {
  if (isDemoAssignments() || !db) return readDemoStore().defaults.filter((item) => item.songId === songId);
  const snaps = await getDocs(query(collection(db, "memberSongDefaults"), where("songId", "==", songId)));
  return snaps.docs.map((snap) => defaultFromDoc(snap.data()));
}

async function overridesForBand(bandId: string) {
  if (isDemoAssignments() || !db) return readDemoStore().overrides.filter((item) => item.bandId === bandId);
  const snaps = await getDocs(query(collection(db, "bandSongOverrides"), where("bandId", "==", bandId)));
  return snaps.docs.map((snap) => overrideFromDoc(snap.data()));
}

export async function getSongAssignments(songSlug: string, bandId?: string): Promise<SongAssignmentBundle | null> {
  const [songBundle, bands, members] = await Promise.all([
    isDemoAssignments() ? Promise.resolve(sampleSongBundle(songSlug)) : getSongBundle(songSlug),
    listBands(),
    listMembers(),
  ]);
  if (!songBundle || !bands.length) return null;
  const band = bands.find((item) => item.id === bandId) ?? bands[0];
  const [defaults, bandOverrides] = await Promise.all([defaultsForSong(songBundle.song.id), overridesForBand(band.id)]);
  const overrideMap = new Map(
    bandOverrides.filter((item) => item.songId === songBundle.song.id).map((item) => [item.memberId, item]),
  );
  const defaultMap = new Map(defaults.map((item) => [item.memberId, item]));
  const memberMap = new Map(members.map((member) => [member.id, member]));

  return {
    song: songBundle.song,
    parts: songBundle.parts,
    band,
    assignments: band.memberIds.flatMap((memberId) => {
      const member = memberMap.get(memberId);
      if (!member) return [];
      const memberDefault = defaultMap.get(memberId)?.partSlugs ?? [];
      const override = overrideMap.get(memberId);
      return [{
        member,
        defaultPartSlugs: sortPartSlugs(memberDefault, songBundle.parts),
        effectivePartSlugs: sortPartSlugs(override?.partSlugs ?? memberDefault, songBundle.parts),
        hasOverride: Boolean(override),
      }];
    }),
  };
}

export async function saveAssignmentChanges(
  songId: string,
  bandId: string,
  changes: AssignmentChange[],
  mode: "default" | "override",
) {
  if (isDemoAssignments() || !db) {
    const store = readDemoStore();
    for (const change of changes) {
      const defaultIndex = store.defaults.findIndex(
        (item) => item.memberId === change.memberId && item.songId === songId,
      );
      const existingDefault = defaultIndex >= 0 ? store.defaults[defaultIndex] : null;
      const normalized = [...new Set(change.partSlugs)];

      if (!existingDefault || mode === "default") {
        const nextDefault = { memberId: change.memberId, songId, partSlugs: normalized };
        if (defaultIndex >= 0) store.defaults[defaultIndex] = nextDefault;
        else store.defaults.push(nextDefault);
        store.overrides = store.overrides.filter(
          (item) =>
            !(item.memberId === change.memberId && item.songId === songId && samePartSlugs(item.partSlugs, normalized)),
        );
      } else {
        const overrideIndex = store.overrides.findIndex(
          (item) => item.bandId === bandId && item.songId === songId && item.memberId === change.memberId,
        );
        if (samePartSlugs(existingDefault.partSlugs, normalized)) {
          if (overrideIndex >= 0) store.overrides.splice(overrideIndex, 1);
        } else {
          const nextOverride = { bandId, songId, memberId: change.memberId, partSlugs: normalized };
          if (overrideIndex >= 0) store.overrides[overrideIndex] = nextOverride;
          else store.overrides.push(nextOverride);
        }
      }
    }
    writeDemoStore(store);
    return;
  }

  const firestore = requireDb();
  const batch = writeBatch(firestore);
  for (const change of changes) {
    const defaultId = `${change.memberId}_${songId}`;
    const overrideId = `${bandId}_${songId}_${change.memberId}`;
    const defaultSnaps = await getDocs(
      query(collection(firestore, "memberSongDefaults"), where("memberId", "==", change.memberId)),
    );
    const existingDefaultSnap = defaultSnaps.docs.find((item) => item.data().songId === songId);
    const existingDefault = existingDefaultSnap ? defaultFromDoc(existingDefaultSnap.data()) : null;
    const normalized = [...new Set(change.partSlugs)];

    if (!existingDefault || mode === "default") {
      batch.set(doc(firestore, "memberSongDefaults", defaultId), {
        memberId: change.memberId,
        songId,
        partSlugs: normalized,
        createdAt: existingDefault ? existingDefaultSnap?.data().createdAt ?? serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const overrideSnaps = await getDocs(
        query(collection(firestore, "bandSongOverrides"), where("memberId", "==", change.memberId)),
      );
      overrideSnaps.docs
        .filter((item) => item.data().songId === songId && samePartSlugs(overrideFromDoc(item.data()).partSlugs, normalized))
        .forEach((item) => batch.delete(item.ref));
    } else if (samePartSlugs(existingDefault.partSlugs, normalized)) {
      batch.delete(doc(firestore, "bandSongOverrides", overrideId));
    } else {
      batch.set(doc(firestore, "bandSongOverrides", overrideId), {
        bandId,
        songId,
        memberId: change.memberId,
        partSlugs: normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

const STARTUP_MEMBER_ORDER = ["ike", "jackson", "joe", "sam", "cron"] as const;

function assignmentMemberIdsForBand(band: Band, members: BandMember[]) {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const usedParts = new Set<VocalPartSlug>();
  const orderedMemberIds = band.memberIds.flatMap((memberId) => {
    const vocalPart = band.vocalPartByMemberId[memberId];
    if (!memberMap.has(memberId) || !vocalPart || usedParts.has(vocalPart)) return [];
    usedParts.add(vocalPart);
    return [{ memberId, vocalPart }];
  });

  if (Object.keys(band.vocalPartByMemberId).length) {
    return orderedMemberIds
      .sort(
        (left, right) =>
          VOCAL_PART_SLUGS.indexOf(left.vocalPart)
          - VOCAL_PART_SLUGS.indexOf(right.vocalPart),
      )
      .map(({ memberId }) => memberId);
  }

  const fallbackMemberIds = band.title.trim().toLowerCase().includes("startup")
    ? [...band.memberIds].sort((leftId, rightId) => {
        const leftName = memberMap.get(leftId)?.displayName.trim().toLowerCase() ?? "";
        const rightName = memberMap.get(rightId)?.displayName.trim().toLowerCase() ?? "";
        const leftOrder = STARTUP_MEMBER_ORDER.indexOf(
          leftName as (typeof STARTUP_MEMBER_ORDER)[number],
        );
        const rightOrder = STARTUP_MEMBER_ORDER.indexOf(
          rightName as (typeof STARTUP_MEMBER_ORDER)[number],
        );
        return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
      })
    : band.memberIds;

  return fallbackMemberIds
    .filter((memberId) => memberMap.has(memberId))
    .slice(0, VOCAL_PART_SLUGS.length);
}

export async function getMemberAssignmentPage(memberSlug: string, bandId?: string): Promise<MemberAssignmentPageData | null> {
  const [member, bands, members, songs, tags] = await Promise.all([
    getMemberBySlug(memberSlug),
    listBands(),
    listMembers(),
    isDemoAssignments()
      ? Promise.resolve(applyDemoSongTags(sampleSongList()))
      : listSongs(),
    listSongTags(),
  ]);
  if (!member) return null;
  const memberBands = bands.filter((band) => band.memberIds.includes(member.id));
  if (!memberBands.length) return null;
  const selectedBand = memberBands.find((band) => band.id === bandId) ?? memberBands[0];
  const arrangements = isDemoAssignments()
    ? []
    : await listBandSongArrangements(selectedBand.id);
  const arrangementBySongId = new Map(
    arrangements.map((arrangement) => [arrangement.songId, arrangement]),
  );
  const assignmentMemberIds = assignmentMemberIdsForBand(selectedBand, members);
  const memberSlotIndex = assignmentMemberIds.indexOf(member.id);
  const usesConfiguredVocalParts = Boolean(
    Object.keys(selectedBand.vocalPartByMemberId).length,
  );

  const rows = songs.map((song) => {
    const arrangement = arrangementBySongId.get(song.id);
    const instrumentAssignments =
      arrangement?.instrumentAssignments ?? song.instrumentAssignments;
    const instrumentAssignment = memberSlotIndex >= 0
      ? instrumentAssignments.players[memberSlotIndex]
      : null;
    const instrumentPartSlug = typeof instrumentAssignment === "string"
      ? ASSIGNMENT_STEM_PART_BY_INSTRUMENT_ID[instrumentAssignment]
      : undefined;
    const vocalPartSlug = arrangement?.vocalAssignments === undefined
      ? selectedBand.vocalPartByMemberId[member.id]
        ?? (!usesConfiguredVocalParts && memberSlotIndex >= 0
          ? VOCAL_PART_SLUGS[memberSlotIndex]
          : undefined)
      : arrangement.vocalAssignments.find(
          (assignment) => assignment.memberId === member.id,
        )?.partSlug;

    return {
      song,
      partSlugs: sortPartSlugs(
        [instrumentPartSlug, vocalPartSlug].filter(
          (partSlug): partSlug is string => Boolean(partSlug),
        ),
        DEFAULT_PARTS,
      ),
    };
  });

  return {
    member,
    bands: memberBands,
    selectedBand,
    tags,
    rows,
  };
}

export async function resetAssignmentDemo() {
  if (typeof window !== "undefined") writeDemoStore(seedStore());
}
