import { SongPlayerPageClient } from "@/components/song-player-page-client";

export default async function SongPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ songSlug: string }>;
  searchParams: Promise<{ mix?: string | string[]; part?: string | string[]; member?: string | string[] }>;
}) {
  const [{ songSlug }, query] = await Promise.all([params, searchParams]);
  return (
    <SongPlayerPageClient
      slug={songSlug}
      requestedMix={queryValue(query.mix)}
      requestedPart={queryValue(query.part)}
      requestedMember={queryValue(query.member)}
    />
  );
}

function queryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
