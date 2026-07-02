"use client";

import Link from "next/link";
import { MusicIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { SongFilterInput } from "@/components/song-filter-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Song } from "@/lib/domain";
import { DEFAULT_PART_SLUGS, partLabel, rankSongsForQuery } from "@/lib/domain";
import { listSongs } from "@/lib/firestore";
import { cn } from "@/lib/utils";

export function SongIndexClient() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [songQuery, setSongQuery] = useState("");
  const rankedSongs = rankSongsForQuery(songs, songQuery);
  const matchingSongCount = rankedSongs.filter((item) => item.matchesQuery).length;

  useEffect(() => {
    let active = true;

    listSongs()
      .then((items) => {
        if (active) setSongs(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="swell-page-kicker">Practice library</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Songs</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Pick a song to see every assigned part, or jump straight to the role you sing or play.
            </p>
          </div>
          <Badge variant="secondary" className="mt-1">
            {loading ? "Loading" : `${songs.length} songs`}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_PART_SLUGS.map((slug) => (
            <Button key={slug} render={<Link href={`/parts/${slug}`} />} variant="outline" nativeButton={false} className="bg-card">
              {partLabel(slug)}
            </Button>
          ))}
        </div>
        <SongFilterInput id="public-song-search" songs={songs} value={songQuery} onChange={setSongQuery} matchCount={matchingSongCount} />
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : songs.length ? (
        <section className="grid gap-2.5">
          {rankedSongs.map(({ song, matchesQuery }) => (
            <Link
              key={song.id}
              href={`/songs/${song.slug}`}
              aria-label={`Open ${song.title}`}
              className={cn(
                "group/song-card block rounded-lg outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/40",
                songQuery.trim() && !matchesQuery ? "opacity-50" : "opacity-100"
              )}
            >
              <Card size="sm" className="cursor-pointer transition-colors hover:bg-muted/70">
                <CardHeader>
                  <CardTitle className="text-base">
                    <span className="group-hover/song-card:underline">{song.title}</span>
                  </CardTitle>
                  <CardAction>
                    <span className={buttonVariants({ variant: "secondary", size: "sm", className: "pointer-events-none" })}>Open</span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <p className="truncate text-sm text-muted-foreground">/songs/{song.slug}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MusicIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No songs yet</EmptyTitle>
            <EmptyDescription>Create the first song from the admin page.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </AppShell>
  );
}
