"use client";

import Link from "next/link";
import { Clock3Icon, EyeOffIcon, MusicIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { SongFilterInput } from "@/components/song-filter-input";
import {
  SongTagAssignmentField,
  SongTagBadges,
  SongTagManager,
} from "@/components/song-tag-controls";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { Song, SongTag } from "@/lib/domain";
import { isSongPublished, rankSongsForQuery } from "@/lib/domain";
import { listSongs } from "@/lib/firestore";
import {
  createSongTag,
  deleteSongTag,
  listSongTags,
  updateSongTag,
  updateSongTagIds,
} from "@/lib/song-tags";
import { cn } from "@/lib/utils";

export function SongIndexClient() {
  const admin = useAdmin();
  const [songs, setSongs] = useState<Song[]>([]);
  const [tags, setTags] = useState<SongTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [songQuery, setSongQuery] = useState("");
  const visibleSongs = admin.isAdmin
    ? songs
    : songs.filter(isSongPublished);
  const rankedSongs = rankSongsForQuery(visibleSongs, songQuery);
  const matchingSongCount = rankedSongs.filter((item) => item.matchesQuery).length;

  useEffect(() => {
    let active = true;

    Promise.all([listSongs(), listSongTags()])
      .then(([songItems, tagItems]) => {
        if (!active) return;
        setSongs(songItems);
        setTags(tagItems);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleCreateTag(label: string) {
    try {
      const tag = await createSongTag(label);
      setTags((current) => [...current, tag].sort((left, right) => left.label.localeCompare(right.label)));
      toast.success(`Created “${tag.label}”.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create that tag.");
      throw caught;
    }
  }

  async function handleRenameTag(tag: SongTag, label: string) {
    try {
      const updatedTag = await updateSongTag(tag.id, label);
      setTags((current) => current
        .map((item) => item.id === tag.id ? updatedTag : item)
        .sort((left, right) => left.label.localeCompare(right.label)));
      toast.success(`Renamed “${tag.label}” to “${updatedTag.label}”.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not rename that tag.");
      throw caught;
    }
  }

  async function handleDeleteTag(tag: SongTag) {
    try {
      await deleteSongTag(tag.id);
      setTags((current) => current.filter((item) => item.id !== tag.id));
      setSongs((current) => current.map((song) => ({
        ...song,
        tagIds: song.tagIds.filter((tagId) => tagId !== tag.id),
      })));
      toast.success(`Deleted “${tag.label}”.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not delete that tag.");
      throw caught;
    }
  }

  async function handleSongTagsChange(song: Song, tagIds: string[]) {
    const previousTagIds = song.tagIds;
    setSongs((current) => current.map((item) => item.id === song.id ? { ...item, tagIds } : item));
    try {
      await updateSongTagIds(song.id, tagIds);
    } catch (caught) {
      setSongs((current) => current.map((item) => item.id === song.id ? { ...item, tagIds: previousTagIds } : item));
      toast.error(caught instanceof Error ? caught.message : `Could not update tags for ${song.title}.`);
      throw caught;
    }
  }

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
        {admin.isAdmin ? (
          <SongTagManager
            onCreate={handleCreateTag}
            onDelete={handleDeleteTag}
            onRename={handleRenameTag}
            songs={songs}
            tags={tags}
          />
        ) : null}
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visibleSongs.length ? (
        <section className="grid gap-2.5">
          {rankedSongs.map(({ song, matchesQuery }) => (
            <Card
              key={song.id}
              size="sm"
              className={cn(
                "transition-[background-color,opacity] hover:bg-muted/35",
                songQuery.trim() && !matchesQuery ? "opacity-50" : "opacity-100"
              )}
            >
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link className="underline-offset-4 hover:underline" href={`/songs/${song.slug}`}>{song.title}</Link>
                    {!isSongPublished(song) ? (
                      <Badge variant="outline">
                        <EyeOffIcon aria-hidden />
                        Unpublished
                      </Badge>
                    ) : null}
                  </span>
                </CardTitle>
                <CardAction>
                  <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/songs/${song.slug}`}>Open</Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] sm:items-end">
                  <p className="truncate text-sm text-muted-foreground">/songs/{song.slug}</p>
                  {admin.isAdmin ? (
                    <SongTagAssignmentField
                      onChange={(tagIds) => handleSongTagsChange(song, tagIds)}
                      song={song}
                      tags={tags}
                    />
                  ) : (
                    <SongTagBadges tagIds={song.tagIds} tags={tags} />
                  )}
                </div>
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
