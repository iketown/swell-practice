"use client";

import Link from "next/link";
import { Music2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { AssetLinks } from "@/components/asset-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { partLabel, type PartSongRow } from "@/lib/domain";
import { getPartRows } from "@/lib/firestore";

export function PartPageClient({ partSlug }: { partSlug: string }) {
  const [rows, setRows] = useState<PartSongRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1.5">
          <p className="swell-page-kicker">Part page</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{partLabel(partSlug)}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Every song with files assigned to this part.</p>
        </div>
        <Badge variant="secondary">{loading ? "Loading" : `${rows.length} songs`}</Badge>
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : rows.length ? (
        <section className="grid gap-2.5">
          {rows.map((row) => (
            <Card key={`${row.song.id}-${row.part.slug}`} size="sm" className="transition-colors hover:bg-muted/35">
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
