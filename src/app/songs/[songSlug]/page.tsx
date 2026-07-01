import { SongPageClient } from "@/components/song-page-client";

export default async function SongPage({
  params,
}: {
  params: Promise<{ songSlug: string }>;
}) {
  const { songSlug } = await params;
  return <SongPageClient slug={songSlug} />;
}
