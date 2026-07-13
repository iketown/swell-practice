"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ClipboardListIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { Song } from "@/lib/domain";
import { listSongs } from "@/lib/firestore";

export function AssignmentIndexClient() {
  const admin = useAdmin();
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    listSongs().then(setSongs).finally(() => setLoading(false));
  }, [admin.isAdmin]);

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-1 p-4 sm:p-5">
        <p className="swell-page-kicker">Owner tools</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Assignments</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Choose a song, then check coverage for any saved band.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Songs</CardTitle>
          <CardDescription>Every board begins with the members&apos; saved defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : songs.length ? (
            <div className="divide-y rounded-lg border bg-card">
              {songs.map((song) => (
                <div key={song.id} className="flex items-center justify-between gap-3 p-3 sm:p-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{song.title}</h2>
                    <p className="truncate text-sm text-muted-foreground">/assignments/{song.slug}</p>
                  </div>
                  <Button render={<Link href={`/assignments/${song.slug}`} />} variant="secondary" size="sm" nativeButton={false}>
                    Assign
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClipboardListIcon aria-hidden /></EmptyMedia>
                <EmptyTitle>No songs to assign</EmptyTitle>
                <EmptyDescription>Create a song from Admin first.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
