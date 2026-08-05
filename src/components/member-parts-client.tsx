"use client";

import Link from "next/link";
import { BookOpenCheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
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

  const assignedSongCount = useMemo(
    () => data?.rows.filter((row) => row.partSlugs.length).length ?? 0,
    [data],
  );

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
            <div className="flex items-center gap-3">
              <MemberAvatar displayName={data.member.displayName} photoUrl={data.member.photoUrl} className="size-14 text-base" />
              <h1 className="swell-song-title">{data.member.displayName}</h1>
            </div>
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
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="member-set-list-title">
        <header className="flex flex-col gap-1 px-1">
          <h2 id="member-set-list-title" className="text-xl font-semibold">Set list</h2>
          <p className="text-sm text-muted-foreground">Choose a part to open it in the song player.</p>
        </header>
        <div className="swell-panel overflow-hidden">
          <ul className="divide-y">
            {data.rows.map((row) => (
              <li
                key={row.song.id}
                className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={row.song.title}>
                    {row.song.title}
                  </p>
                  {!row.partSlugs.length ? (
                    <p className="text-sm text-muted-foreground">No assignment for this song</p>
                  ) : null}
                </div>
                {row.partSlugs.length ? (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {row.partSlugs.map((partSlug) => {
                      const mix = partSlug.startsWith("voc_") ? "voc" : "inst";
                      return (
                        <Button
                          key={partSlug}
                          render={<Link href={`/songs/${row.song.slug}?mix=${mix}&part=${partSlug}&member=${data.member.slug}`} />}
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                        >
                          {partLabel(partSlug)}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {!assignedSongCount ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenCheckIcon aria-hidden /></EmptyMedia>
            <EmptyTitle>No parts assigned in this band</EmptyTitle>
            <EmptyDescription>An admin can add parts from the Band Assignments page.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </AppShell>
  );
}
