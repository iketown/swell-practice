export type FileType = "audio" | "pdf" | "video" | "zip" | "other";

export interface Song {
  id: string;
  title: string;
  slug: string;
  sortTitle: string;
  notes?: string;
}

export interface SongPart {
  slug: string;
  label: string;
  sortOrder: number;
  assetIds: string[];
}

export interface SongAsset {
  id: string;
  filename: string;
  displayName: string;
  contentType: string;
  fileType: FileType;
  size: number;
  storagePath: string;
  downloadUrl?: string;
  thumbnailStoragePath?: string;
  thumbnailUrl?: string;
  thumbnailTime?: number;
  assignedPartSlugs: string[];
  suggestedPartSlugs: string[];
}

export interface SongBundle {
  song: Song;
  parts: SongPart[];
  assets: SongAsset[];
}

export const SONG_MIXER_STATE_NAMES = ["featured", "unfeatured", "default", "muted"] as const;
export type SongMixerStateName = (typeof SONG_MIXER_STATE_NAMES)[number];

export type SongMixerStateValues = {
  volume: number;
  pan: number;
  muted: boolean;
  scale: number;
};

export type SongMixerStateOverride = Partial<SongMixerStateValues>;
export type SongMixerStateOverrides = Partial<Record<SongMixerStateName, SongMixerStateOverride>>;

export interface SongMixerSettings {
  states: Record<SongMixerStateName, SongMixerStateValues>;
}

export type SongMixerMixId = "learn" | "practice" | "listen";

export const SONG_MIXER_MIXES: ReadonlyArray<{
  id: SongMixerMixId;
  label: string;
  description: string;
}> = [
  {
    id: "learn",
    label: "Learn Part",
    description: "Feature the selected part and move the other stems into the background.",
  },
  {
    id: "practice",
    label: "Practice Part",
    description: "Mute the selected part and play the other stems at their default balance.",
  },
  {
    id: "listen",
    label: "Basic Mix",
    description: "Play every stem at its default balance.",
  },
];

export const DEFAULT_SONG_MIXER_SETTINGS: SongMixerSettings = {
  states: {
    featured: { volume: 70, pan: -50, muted: false, scale: 2 },
    unfeatured: { volume: 10, pan: 50, muted: false, scale: 1 },
    default: { volume: 40, pan: 0, muted: false, scale: 1 },
    muted: { volume: 70, pan: 0, muted: true, scale: 1 },
  },
};

export interface SongMixerTrack {
  id: string;
  filename: string;
  displayName: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl?: string;
  shown: boolean;
  isBackgroundMix: boolean;
  orderIndex: number;
  stateOverrides: SongMixerStateOverrides;
}

export interface SongAnnotation {
  id: string;
  title: string;
  start: number;
  end: number;
}

export interface SongMixerBundle {
  song: Song;
  tracks: SongMixerTrack[];
  settings: SongMixerSettings;
  annotations: SongAnnotation[];
}

export function createDefaultSongMixerSettings(): SongMixerSettings {
  return {
    states: Object.fromEntries(
      SONG_MIXER_STATE_NAMES.map((stateName) => [
        stateName,
        { ...DEFAULT_SONG_MIXER_SETTINGS.states[stateName] },
      ]),
    ) as SongMixerSettings["states"],
  };
}

export function mixerStateForTrack(
  mixId: SongMixerMixId,
  trackId: string,
  selectedTrackId: string | null,
): SongMixerStateName {
  if (mixId === "learn") {
    return trackId === selectedTrackId ? "featured" : "unfeatured";
  }

  if (mixId === "practice") {
    return trackId === selectedTrackId ? "muted" : "default";
  }

  return "default";
}

export function resolveSongMixerTrackState(
  settings: SongMixerSettings,
  track: SongMixerTrack,
  stateName: SongMixerStateName,
): SongMixerStateValues {
  return {
    ...settings.states[stateName],
    ...track.stateOverrides[stateName],
  };
}

export interface PartSongRow {
  song: Song;
  part: SongPart;
  assets: SongAsset[];
}

export interface BandMember {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  slug: string;
  photoUrl?: string;
  photoStoragePath?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface Band {
  id: string;
  title: string;
  code: string;
  memberIds: string[];
}

export interface MemberSongDefault {
  memberId: string;
  songId: string;
  partSlugs: string[];
}

export interface BandSongOverride {
  bandId: string;
  songId: string;
  memberId: string;
  partSlugs: string[];
}

export interface EffectiveMemberAssignment {
  member: BandMember;
  defaultPartSlugs: string[];
  effectivePartSlugs: string[];
  hasOverride: boolean;
}

export interface SongAssignmentBundle {
  song: Song;
  parts: SongPart[];
  band: Band;
  assignments: EffectiveMemberAssignment[];
}

export const DEFAULT_PART_SLUGS = [
  "voc_1",
  "voc_2",
  "voc_3",
  "voc_4",
  "voc_5",
  "guit_a",
  "guit_b",
  "keys",
  "drums",
  "bass",
] as const;

export const DEFAULT_PARTS: SongPart[] = DEFAULT_PART_SLUGS.map((slug, index) => ({
  slug,
  label: partLabel(slug),
  sortOrder: index,
  assetIds: [],
}));

export function partLabel(slug: string) {
  return slug.replaceAll("_", " ").toUpperCase();
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sortTitle(title: string) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

export function samePartSlugs(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((partSlug) => rightSet.has(partSlug));
}

export function sortPartSlugs(partSlugs: readonly string[], parts: readonly SongPart[]) {
  const order = new Map(parts.map((part, index) => [part.slug, part.sortOrder ?? index]));
  return [...new Set(partSlugs)].sort(
    (left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

const BAND_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createBandCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => BAND_CODE_ALPHABET[byte % BAND_CODE_ALPHABET.length]).join("");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function rankSongForQuery(song: Song, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const title = normalizeSearchText(song.title);
  const slug = normalizeSearchText(song.slug);
  const words = title.split(" ");

  if (title.startsWith(normalizedQuery)) return 0;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 1;

  const titleIndex = title.indexOf(normalizedQuery);
  if (titleIndex >= 0) return 2 + titleIndex / 1000;

  const slugIndex = slug.indexOf(normalizedQuery);
  if (slugIndex >= 0) return 3 + slugIndex / 1000;

  return null;
}

export function rankSongsForQuery(songs: Song[], query: string) {
  const hasQuery = Boolean(normalizeSearchText(query));

  return songs
    .map((song, index) => {
      const rank = rankSongForQuery(song, query);

      return {
        song,
        matchesQuery: !hasQuery || rank !== null,
        rank: rank ?? Number.POSITIVE_INFINITY,
        index,
      };
    })
    .sort((a, b) => {
      if (!hasQuery) return a.index - b.index;
      if (a.matchesQuery !== b.matchesQuery) return a.matchesQuery ? -1 : 1;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.index - b.index;
    });
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export function fileTypeFromFile(file: Pick<File, "type" | "name">): FileType {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac|aiff?)$/.test(name)) {
    return "audio";
  }

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }

  if (type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) {
    return "video";
  }

  if (/\.(zip|rar|7z)$/.test(name)) {
    return "zip";
  }

  return "other";
}

export function inferPartSlugs(filename: string, availablePartSlugs = DEFAULT_PART_SLUGS as readonly string[]) {
  const normalized = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "_");
  const tokens = new Set(normalized.split("_").filter(Boolean));
  const joined = `_${normalized}_`;
  const available = new Set<string>(availablePartSlugs);
  const inferred = new Set<string>();
  const hasVocalGroupCue =
    tokens.has("vox") ||
    tokens.has("allvox") ||
    tokens.has("allvocals") ||
    tokens.has("vocal") ||
    tokens.has("vocals");

  for (let i = 1; i <= 5; i += 1) {
    if (
      available.has(`voc_${i}`) &&
      (joined.includes(`_voc_${i}_`) ||
        joined.includes(`_voc${i}_`) ||
        joined.includes(`_vocal_${i}_`) ||
        joined.includes(`_vocal${i}_`))
    ) {
      inferred.add(`voc_${i}`);
    }
  }

  if (available.has("guit_a") && /(guit|gtr)_?a/.test(normalized)) inferred.add("guit_a");
  if (available.has("guit_b") && /(guit|gtr)_?b/.test(normalized)) inferred.add("guit_b");
  if (available.has("bass") && tokens.has("bass")) inferred.add("bass");
  if (available.has("keys") && (tokens.has("keys") || tokens.has("keyboards") || tokens.has("piano"))) {
    inferred.add("keys");
  }
  if (available.has("drums") && (tokens.has("drums") || tokens.has("drum") || tokens.has("kit"))) {
    inferred.add("drums");
  }

  if (hasVocalGroupCue) {
    for (const slug of available) {
      if (slug.startsWith("voc_")) inferred.add(slug);
    }
  }

  if (!hasVocalGroupCue && (tokens.has("all") || tokens.has("full") || tokens.has("general") || tokens.has("mix"))) {
    for (const slug of available) inferred.add(slug);
  }

  return [...inferred].sort((a, b) => {
    const ai = availablePartSlugs.indexOf(a as (typeof DEFAULT_PART_SLUGS)[number]);
    const bi = availablePartSlugs.indexOf(b as (typeof DEFAULT_PART_SLUGS)[number]);
    return ai - bi;
  });
}
