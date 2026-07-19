import type { SongAsset, SongBundle } from "@/lib/domain";
import { DEFAULT_PARTS } from "@/lib/domain";

function asset(
  id: string,
  filename: string,
  fileType: SongAsset["fileType"],
  assignedPartSlugs: string[],
): SongAsset {
  return {
    id,
    filename,
    displayName: filename,
    contentType: fileType === "pdf" ? "application/pdf" : fileType === "audio" ? "audio/mpeg" : "application/octet-stream",
    fileType,
    size: 0,
    storagePath: `demo/${filename}`,
    downloadUrl: "#",
    assignedPartSlugs,
    suggestedPartSlugs: assignedPartSlugs,
  };
}

const vocalParts = ["voc_1", "voc_2", "voc_3", "voc_4", "voc_5"];
const allParts = [...vocalParts, "guit_a", "guit_b", "keys", "drums", "bass"];

export const sampleBundles: SongBundle[] = [
  {
    song: {
      id: "demo-california-girls",
      title: "California Girls",
      slug: "california-girls",
      sortTitle: "california girls",
    },
    parts: DEFAULT_PARTS.map((part) => ({ ...part, assetIds: [] })),
    assets: [],
  },
  {
    song: {
      id: "demo-i-get-around",
      title: "I Get Around",
      slug: "i-get-around",
      sortTitle: "i get around",
    },
    parts: DEFAULT_PARTS.map((part) => ({
      ...part,
      assetIds: [
        ...(vocalParts.includes(part.slug) ? ["iga-vox", "iga-all", `iga-${part.slug}`] : []),
        ...(part.slug === "guit_a" ? ["iga-all", "iga-guit-a", "iga-guit-a-video"] : []),
        ...(part.slug === "guit_b" ? ["iga-all", "iga-guit-b"] : []),
        ...(part.slug === "keys" ? ["iga-all", "iga-keys"] : []),
        ...(part.slug === "bass" ? ["iga-all"] : []),
      ],
    })),
    assets: [
      asset("iga-vox", "i_get_around_vox.pdf", "pdf", vocalParts),
      asset("iga-all", "IGA_all.mp3", "audio", allParts),
      asset("iga-voc_1", "IGA_voc1.mp3", "audio", ["voc_1"]),
      asset("iga-voc_2", "IGA_voc2.mp3", "audio", ["voc_2"]),
      asset("iga-voc_3", "IGA_voc3.mp3", "audio", ["voc_3"]),
      asset("iga-voc_4", "IGA_voc4.mp3", "audio", ["voc_4"]),
      asset("iga-voc_5", "IGA_voc5.mp3", "audio", ["voc_5"]),
      asset("iga-guit-a", "IGA_guitA.mp3", "audio", ["guit_a"]),
      asset("iga-guit-a-video", "IGA_guitA.mp4", "video", ["guit_a"]),
      asset("iga-guit-b", "IGA_guitB.mp3", "audio", ["guit_b"]),
      asset("iga-keys", "IGA_keys.mp3", "audio", ["keys"]),
    ],
  },
  {
    song: {
      id: "demo-rhonda",
      title: "Help Me, Rhonda",
      slug: "rhonda",
      sortTitle: "help me rhonda",
    },
    parts: DEFAULT_PARTS.map((part) => ({
      ...part,
      assetIds: [
        ...(vocalParts.includes(part.slug) ? ["rhonda-vox", "rhonda-all", `rhonda-${part.slug}`] : []),
        ...(part.slug === "guit_a" ? ["rhonda-all", "rhonda-guit-a"] : []),
        ...(part.slug === "bass" ? ["rhonda-all", "rhonda-bass"] : []),
      ],
    })),
    assets: [
      asset("rhonda-vox", "rhondavox.pdf", "pdf", vocalParts),
      asset("rhonda-all", "rhonda_all.mp3", "audio", allParts),
      asset("rhonda-voc_1", "RHONDA_voc1.mp3", "audio", ["voc_1"]),
      asset("rhonda-voc_2", "RHONDA_voc2.mp3", "audio", ["voc_2"]),
      asset("rhonda-voc_3", "RHONDA_voc3.mp3", "audio", ["voc_3"]),
      asset("rhonda-voc_4", "RHONDA_voc4.mp3", "audio", ["voc_4"]),
      asset("rhonda-voc_5", "RHONDA_voc5.mp3", "audio", ["voc_5"]),
      asset("rhonda-guit-a", "RHONDA_guitA.mp3", "audio", ["guit_a"]),
      asset("rhonda-bass", "RHONDA_bass.mp3", "audio", ["bass"]),
    ],
  },
];

export function sampleSongList() {
  return sampleBundles.map((bundle) => bundle.song).sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
}

export function sampleSongBundle(slug: string) {
  return sampleBundles.find((bundle) => bundle.song.slug === slug) ?? null;
}

export function samplePartRows(partSlug: string) {
  return sampleBundles
    .map((bundle) => {
      const part = bundle.parts.find((item) => item.slug === partSlug);
      if (!part) return null;
      const assetIds = new Set(part.assetIds);
      const assets = bundle.assets.filter((assetItem) => assetIds.has(assetItem.id));
      if (!assets.length) return null;
      return { song: bundle.song, part, assets };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.song.sortTitle.localeCompare(b.song.sortTitle));
}
