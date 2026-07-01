"use client";

import Link from "next/link";
import { MusicIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { Song } from "@/lib/domain";
import { DEFAULT_PART_SLUGS, partLabel } from "@/lib/domain";
import { listSongs } from "@/lib/firestore";

export function SongIndexClient() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

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
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-[0_14px_36px_-32px_rgba(20,38,54,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Songs</h1>
            <p className="max-w-2xl text-muted-foreground">
              Pick a song to see every assigned part, or jump straight to the role you sing or play.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_PART_SLUGS.map((slug) => (
            <Button key={slug} render={<Link href={`/parts/${slug}`} />} variant="outline" nativeButton={false}>
              {partLabel(slug)}
            </Button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : songs.length ? (
        <section className="grid gap-2.5">
          {songs.map((song) => (
            <Card key={song.id} size="sm" className="transition-colors hover:bg-card/80">
              <CardHeader>
                <CardTitle>
                  <Link href={`/songs/${song.slug}`} className="hover:underline">
                    {song.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button render={<Link href={`/songs/${song.slug}`} />} variant="secondary" size="sm" nativeButton={false}>
                  Open song
                </Button>
              </CardContent>
            </Card>
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
