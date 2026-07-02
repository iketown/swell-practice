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
  assignedPartSlugs: string[];
  suggestedPartSlugs: string[];
}

export interface SongBundle {
  song: Song;
  parts: SongPart[];
  assets: SongAsset[];
}

export interface PartSongRow {
  song: Song;
  part: SongPart;
  assets: SongAsset[];
}

export const DEFAULT_PART_SLUGS = [
  "voc_1",
  "voc_2",
  "voc_3",
  "voc_4",
  "voc_5",
  "guit_a",
  "guit_b",
  "bass",
  "keys",
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
