"use client";

import { BookOpenCheckIcon, Layers3Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { AssetLinks } from "@/components/asset-links";
import { MemberAvatar } from "@/components/member-avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">Usual</Badge><span className="text-muted-foreground">Your saved default</span>
          <Badge>Changed</Badge><span className="text-muted-foreground">Only for this band</span>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="member-set-list-title">
        <header className="flex flex-col gap-1 px-1">
          <h2 id="member-set-list-title" className="text-xl font-semibold">Set list</h2>
          <p className="text-sm text-muted-foreground">Open a song to get the files for your assigned parts.</p>
        </header>
        <Accordion multiple>
          {data.rows.map((row) => (
            <AccordionItem key={row.song.id} value={row.song.id} disabled={!row.effectivePartSlugs.length}>
              <AccordionTrigger>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.song.title}</span>
                    {row.hasOverride ? <Badge variant="outline">Band change</Badge> : null}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {row.effectivePartSlugs.length ? row.effectivePartSlugs.map((partSlug) => {
                      const changed = !row.defaultPartSlugs.includes(partSlug);
                      return <Badge key={partSlug} variant={changed ? "default" : "secondary"}>{partLabel(partSlug)}{changed ? " · Changed" : ""}</Badge>;
                    }) : <span className="text-sm font-normal text-muted-foreground">No assignment for this song</span>}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="border-t">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium text-foreground">Learning materials</h3>
                    <Badge variant="outline">{row.assets.length} {row.assets.length === 1 ? "file" : "files"}</Badge>
                  </div>
                  <AssetLinks assets={row.assets} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

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
