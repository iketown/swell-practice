import { SongPlayerPageClient } from "@/components/song-player-page-client";

export default async function SongPlayerPage({
  params,
}: {
  params: Promise<{ songSlug: string }>;
}) {
  const { songSlug } = await params;
  return <SongPlayerPageClient slug={songSlug} />;
}
