"use client";

import Link from "next/link";
import { ArrowRightIcon, BookOpenCheckIcon, Layers3Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getMemberAssignmentPage, type MemberAssignmentPageData } from "@/lib/assignments";
import { partLabel } from "@/lib/domain";

export function MemberPartsClient({ memberSlug }: { memberSlug: string }) {
  const [data, setData] = useState<MemberAssignmentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bandId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMemberAssignmentPage(memberSlug, bandId);
      setData(next);
      if (!next) setError("This member is not part of a saved band yet.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load these parts.");
    } finally {
      setLoading(false);
    }
  }, [memberSlug]);

  useEffect(() => {
    let active = true;
    getMemberAssignmentPage(memberSlug)
      .then((next) => {
        if (!active) return;
        setData(next);
        if (!next) setError("This member is not part of a saved band yet.");
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load these parts.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [memberSlug]);

  const assignedSongCount = useMemo(() => data?.rows.filter((row) => row.effectivePartSlugs.length).length ?? 0, [data]);

  if (loading && !data) {
    return <AppShell><Skeleton className="h-40 w-full" /><Skeleton className="h-72 w-full" /></AppShell>;
  }

  if (!data) {
    return (
      <AppShell>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Member page unavailable</EmptyTitle>
            <EmptyDescription>{error ?? "This member could not be found."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <p className="swell-page-kicker">My parts</p>
            <h1 className="swell-song-title">{data.member.displayName}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">{assignedSongCount} songs with parts in this lineup</p>
          </div>
          <div className="flex min-w-64 flex-col gap-2">
            <label htmlFor="member-band" className="text-sm font-medium">Band</label>
            <Select items={data.bands.map((band) => ({ label: band.title, value: band.id }))} value={data.selectedBand.id} onValueChange={(value) => value && void load(value)}>
              <SelectTrigger id="member-band" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>{data.bands.map((band) => <SelectItem key={band.id} value={band.id}>{band.title}</SelectItem>)}</SelectGroup>
              </SelectContent>
            </Select>
            <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground">{data.selectedBand.code}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">Usual</Badge><span className="text-muted-foreground">Your saved default</span>
          <Badge>Changed</Badge><span className="text-muted-foreground">Only for this band</span>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Set list</CardTitle>
          <CardDescription>Open a song for charts, demos, and rehearsal files.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-lg border bg-card">
            {data.rows.map((row) => (
              <article key={row.song.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{row.song.title}</h2>
                    {row.hasOverride ? <Badge variant="outline">Band change</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.effectivePartSlugs.length ? row.effectivePartSlugs.map((partSlug) => {
                      const changed = !row.defaultPartSlugs.includes(partSlug);
                      return <Badge key={partSlug} variant={changed ? "default" : "secondary"}>{partLabel(partSlug)}{changed ? " · Changed" : ""}</Badge>;
                    }) : <span className="text-sm text-muted-foreground">No assignment for this song</span>}
                  </div>
                </div>
                <Button render={<Link href={`/songs/${row.song.slug}`} />} variant="outline" size="sm" nativeButton={false}>
                  Practice files
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {!assignedSongCount ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenCheckIcon aria-hidden /></EmptyMedia>
            <EmptyTitle>No parts assigned in this band</EmptyTitle>
            <EmptyDescription>An admin can add defaults or a band-only assignment from a song board.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Layers3Icon aria-hidden /> Defaults follow you into every band. Blue changes apply only to the selected lineup.</p>
    </AppShell>
  );
}
