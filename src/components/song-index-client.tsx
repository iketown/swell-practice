"use client";

import Link from "next/link";
import { Clock3Icon, EyeOffIcon, MusicIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { SongFilterInput } from "@/components/song-filter-input";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { Song } from "@/lib/domain";
import { isSongPublished, rankSongsForQuery } from "@/lib/domain";
import { listSongs } from "@/lib/firestore";
import { cn } from "@/lib/utils";

export function SongIndexClient() {
  const admin = useAdmin();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [songQuery, setSongQuery] = useState("");
  const visibleSongs = admin.isAdmin
    ? songs
    : songs.filter(isSongPublished);
  const rankedSongs = rankSongsForQuery(visibleSongs, songQuery);
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
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Pick a song to see every assigned part.</p>
          </div>
          <div className="flex items-center gap-2">
            {admin.isAdmin ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={admin.isDemoAdmin ? "/songs/timing?demo=1" : "/songs/timing"}
              >
                <Clock3Icon data-icon="inline-start" />
                Timing
              </Link>
            ) : null}
            <Badge variant="secondary" className="mt-1">
              {loading ? "Loading" : `${visibleSongs.length} songs`}
            </Badge>
          </div>
        </div>
        <SongFilterInput id="public-song-search" songs={visibleSongs} value={songQuery} onChange={setSongQuery} matchCount={matchingSongCount} />
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visibleSongs.length ? (
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
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="group-hover/song-card:underline">{song.title}</span>
                      {!isSongPublished(song) ? (
                        <Badge variant="outline">
                          <EyeOffIcon aria-hidden />
                          Unpublished
                        </Badge>
                      ) : null}
                    </span>
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
