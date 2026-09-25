"use client";

import Link from "next/link";
import { BookOpenCheckIcon, EyeOffIcon, ListFilterIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { MemberAvatar } from "@/components/member-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import { getMemberAssignmentPage, type MemberAssignmentPageData } from "@/lib/assignments";
import { isSongPublished, partLabel } from "@/lib/domain";

function defaultTagIdsForPage(data: MemberAssignmentPageData | null) {
  if (!data) return [];
  const tagIdsUsedByPublishedSongs = new Set(
    data.rows
      .filter((row) => isSongPublished(row.song))
      .flatMap((row) => row.song.tagIds),
  );
  return data.tags
    .filter((tag) => tag.filteredByDefault && tagIdsUsedByPublishedSongs.has(tag.id))
    .map((tag) => tag.id);
}

function MemberSongList({ rows, isAdmin, memberSlug }: {
  rows: MemberAssignmentPageData["rows"];
  isAdmin: boolean;
  memberSlug: string;
}) {
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li
          key={row.song.id}
          className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold" title={row.song.title}>
                {row.song.title}
              </p>
              {isAdmin && !isSongPublished(row.song) ? (
                <Badge variant="outline">
                  <EyeOffIcon aria-hidden />
                  Unpublished
                </Badge>
              ) : null}
            </div>
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
                    render={<Link href={`/songs/${row.song.slug}?mix=${mix}&part=${partSlug}&member=${memberSlug}`} />}
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
  );
}

function tagFilterStorageKey(data: MemberAssignmentPageData) {
  return `swell:member-tag-filters:${data.member.slug}:${data.selectedBand.id}`;
}

function restoredTagIdsForPage(data: MemberAssignmentPageData | null) {
  if (!data) return [];
  try {
    const stored = window.localStorage.getItem(tagFilterStorageKey(data));
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
        const usedTagIds = new Set(data.rows.flatMap((row) => row.song.tagIds));
        const validTagIds = new Set(data.tags.map((tag) => tag.id));
        return parsed.filter((id) => validTagIds.has(id) && usedTagIds.has(id));
      }
    }
  } catch {
    // Storage may be unavailable or contain malformed data; use page defaults.
  }
  return defaultTagIdsForPage(data);
}

export function MemberPartsClient({ memberSlug }: { memberSlug: string }) {
  const admin = useAdmin();
  const [data, setData] = useState<MemberAssignmentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const load = useCallback(async (bandId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMemberAssignmentPage(memberSlug, bandId);
      setData(next);
      setSelectedTagIds(restoredTagIdsForPage(next));
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
        setSelectedTagIds(restoredTagIdsForPage(next));
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

  const visibleRows = useMemo(
    () => data?.rows.filter((row) => admin.isAdmin || isSongPublished(row.song)) ?? [],
    [admin.isAdmin, data],
  );
  const assignedSongCount = useMemo(
    () => visibleRows.filter((row) => row.partSlugs.length).length,
    [visibleRows],
  );
  const availableFilterTags = useMemo(() => {
    if (!data) return [];
    const usedTagIds = new Set(visibleRows.flatMap((row) => row.song.tagIds));
    return data.tags.filter((tag) => usedTagIds.has(tag.id));
  }, [data, visibleRows]);
  const filteredRows = useMemo(
    () => selectedTagIds.length
      ? visibleRows.filter((row) => selectedTagIds.some((tagId) => row.song.tagIds.includes(tagId)))
      : visibleRows,
    [selectedTagIds, visibleRows],
  );

  const excludedRows = useMemo(
    () => selectedTagIds.length
      ? visibleRows.filter((row) => !selectedTagIds.some((tagId) => row.song.tagIds.includes(tagId)))
      : [],
    [selectedTagIds, visibleRows],
  );

  function updateSelectedTagIds(tagIds: string[]) {
    setSelectedTagIds(tagIds);
    if (!data) return;
    try {
      // Save immediately so navigation cannot interrupt persistence. An empty
      // array remembers Show All instead of restoring the default tags.
      window.localStorage.setItem(tagFilterStorageKey(data), JSON.stringify(tagIds));
    } catch {
      // Filtering remains usable when browser storage is unavailable.
    }
  }

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
        {availableFilterTags.length ? (
          <section aria-labelledby="member-tag-filter-title" className="flex flex-col gap-3 rounded-lg bg-muted/45 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <ListFilterIcon aria-hidden />
                <div>
                  <h2 id="member-tag-filter-title" className="text-sm font-semibold">Filter by tags</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedTagIds.length
                      ? `${filteredRows.length} of ${visibleRows.length} songs match any selected tag`
                      : `${visibleRows.length} songs · select one or more tags`}
                  </p>
                </div>
              </div>
              {selectedTagIds.length ? (
                <Button onClick={() => updateSelectedTagIds([])} size="xs" type="button" variant="ghost">
                  <XIcon data-icon="inline-start" />
                  Clear
                </Button>
              ) : null}
            </div>
            <ToggleGroup
              aria-label="Song tag filters"
              className="flex w-full flex-wrap justify-start"
              multiple
              onValueChange={updateSelectedTagIds}
              size="sm"
              value={selectedTagIds}
              variant="outline"
            >
              {availableFilterTags.map((tag) => (
                <ToggleGroupItem
                  key={tag.id}
                  value={tag.id}
                  className="aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background"
                >
                  {tag.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="member-set-list-title">
        <header className="flex flex-col gap-1 px-1">
          <h2 id="member-set-list-title" className="text-xl font-semibold">Set list</h2>
          <p className="text-sm text-muted-foreground">
            {selectedTagIds.length
              ? `${filteredRows.length} matching ${filteredRows.length === 1 ? "song" : "songs"}. Choose a part to open it.`
              : "Choose a part to open it in the song player."}
          </p>
        </header>
        <div className="swell-panel overflow-hidden">
          {filteredRows.length ? (
            <MemberSongList rows={filteredRows} isAdmin={admin.isAdmin} memberSlug={data.member.slug} />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No songs match these tags</EmptyTitle>
                <EmptyDescription>Clear a tag or choose another combination.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
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
      {excludedRows.length ? (
        <section className="flex flex-col gap-4" aria-labelledby="member-filtered-title">
          <header className="flex items-center gap-3 px-1">
            <h2 id="member-filtered-title" className="text-xl font-semibold">Filtered</h2>
            <Button onClick={() => updateSelectedTagIds([])} size="xs" type="button" variant="outline">
              Show All
            </Button>
          </header>
          <div className="swell-panel overflow-hidden opacity-50">
            <MemberSongList rows={excludedRows} isAdmin={admin.isAdmin} memberSlug={data.member.slug} />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
