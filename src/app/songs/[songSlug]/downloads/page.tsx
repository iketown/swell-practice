import { SongPageClient } from "@/components/song-page-client";

export default async function SongDownloadsPage({
  params,
}: {
  params: Promise<{ songSlug: string }>;
}) {
  const { songSlug } = await params;
  return <SongPageClient slug={songSlug} />;
}
