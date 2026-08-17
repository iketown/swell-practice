import { SongPlayerPageClient } from "@/components/song-player-page-client";
import { TrafficTracker } from "@/components/traffic-tracker";

export default async function SongMixerPage({
  params,
  searchParams,
}: {
  params: Promise<{ songSlug: string }>;
  searchParams: Promise<{ mix?: string | string[]; part?: string | string[]; member?: string | string[] }>;
}) {
  const [{ songSlug }, query] = await Promise.all([params, searchParams]);
  const mix = queryValue(query.mix);
  const part = queryValue(query.part);
  const member = queryValue(query.member);

  return (
    <>
      <TrafficTracker
        songSlug={songSlug}
        path={`/songs/${songSlug}`}
        mix={mix}
        part={part}
        member={member}
      />
      <SongPlayerPageClient
        slug={songSlug}
        requestedMix={mix}
        requestedPart={part}
        requestedMember={member}
      />
    </>
  );
}

function queryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
