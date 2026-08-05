import type { Metadata } from "next";

import { LyricAlignmentEditor } from "@/components/lyric-alignment-editor";

export const metadata: Metadata = {
  title: "Lyric Timing Editor | The Swell Parts",
  description: "Review and adjust word and syllable timing against a waveform.",
};

export default async function LyricAlignmentSongPage({
  params,
}: {
  params: Promise<{ songSlug: string }>;
}) {
  const { songSlug } = await params;
  return <LyricAlignmentEditor songSlug={songSlug} />;
}
