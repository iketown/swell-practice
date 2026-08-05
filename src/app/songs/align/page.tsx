import type { Metadata } from "next";

import { LyricAlignmentIndex } from "@/components/lyric-alignment-index";

export const metadata: Metadata = {
  title: "Lyric Alignment | The Swell Parts",
  description: "Create and open lyric timing projects.",
};

export default function LyricAlignmentPage() {
  return <LyricAlignmentIndex />;
}
