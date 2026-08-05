import type { Metadata } from "next";

import { SongTimingClient } from "@/components/song-timing-client";

export const metadata: Metadata = {
  title: "Song Timing | The Swell Parts",
  description: "Assign arbitrary attributes to song timelines and total their cumulative time.",
};

export default function SongTimingPage() {
  return <SongTimingClient />;
}
