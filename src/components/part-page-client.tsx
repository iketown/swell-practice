"use client";

import Link from "next/link";
import { Music2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { AssetLinks } from "@/components/asset-links";
import { SongFilterInput } from "@/components/song-filter-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { partLabel, rankSongsForQuery, type PartSongRow } from "@/lib/domain";
import { getPartRows } from "@/lib/firestore";
import { cn } from "@/lib/utils";

export function PartPageClient({ partSlug }: { partSlug: string }) {
  const [rows, setRows] = useState<PartSongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [songQuery, setSongQuery] = useState("");
  const rowsBySongId = new Map(rows.map((row) => [row.song.id, row]));
  const rankedRows = rankSongsForQuery(
    rows.map((row) => row.song),
    songQuery,
  ).flatMap(({ song, matchesQuery }) => {
    const row = rowsBySongId.get(song.id);
    return row ? [{ row, matchesQuery }] : [];
  });
  const matchingSongCount = rankedRows.filter((item) => item.matchesQuery).length;

  useEffect(() => {
    let active = true;

    getPartRows(partSlug)
      .then((items) => {
        if (active) setRows(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [partSlug]);

  return (
    <AppShell>
      <section className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] sm:items-end">
        <header className="py-1 sm:py-2">
          <h1 className="swell-part-title">{partLabel(partSlug)}</h1>
        </header>
        <div className="swell-panel w-full bg-card/50 p-4 shadow-none sm:justify-self-end sm:p-5">
          <SongFilterInput
            id={`part-${partSlug}-song-search`}
            songs={rows.map((row) => row.song)}
            value={songQuery}
            onChange={setSongQuery}
            matchCount={matchingSongCount}
            className="max-w-none"
          />
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : rows.length ? (
        <section className="grid gap-2.5">
          {rankedRows.map(({ row, matchesQuery }) => (
            <div
              key={`${row.song.id}-${row.part.slug}`}
              className={cn("transition-opacity", songQuery.trim() && !matchesQuery ? "opacity-50" : "opacity-100")}
            >
              <Card
                size="sm"
                className="transform-gpu transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:shadow-[0_18px_42px_-32px_var(--swell-espresso)]"
              >
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/songs/${row.song.slug}`} className="hover:underline">
                      {row.song.title.toUpperCase()}
                    </Link>
                    <Badge variant="secondary">{row.assets.length} files</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <AssetLinks assets={row.assets} />
                  <Button render={<Link href={`/songs/${row.song.slug}`} />} variant="outline" size="sm" nativeButton={false} className="self-start bg-card">
                    Open song
                  </Button>
                </CardContent>
              </Card>
            </div>
          ))}
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Music2Icon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No files assigned</EmptyTitle>
            <EmptyDescription>This part does not have assigned assets yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </AppShell>
  );
}
