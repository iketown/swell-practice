"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { Song } from "@/lib/domain";
import { createSong, deleteSong, listSongs, updateSong } from "@/lib/firestore";

export function AdminPageClient() {
  const admin = useAdmin();
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) {
      router.replace("/");
    }
  }, [admin.isAdmin, admin.loading, router]);

  const refreshSongs = useCallback(async () => {
    setSongsLoading(true);
    setListError(null);

    try {
      setSongs(await listSongs());
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "Could not load songs.");
    } finally {
      setSongsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.isAdmin) return;

    let active = true;

    listSongs()
      .then((items) => {
        if (!active) return;
        setSongs(items);
        setListError(null);
      })
      .catch((caught) => {
        if (active) setListError(caught instanceof Error ? caught.message : "Could not load songs.");
      })
      .finally(() => {
        if (active) setSongsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [admin.isAdmin]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const slug = await createSong(title);
      setCreatedSlug(slug);
      setTitle("");
      await refreshSongs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create song.");
    } finally {
      setSaving(false);
    }
  }

  async function onEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSong) return;

    setEditing(true);
    setEditError(null);

    try {
      await updateSong(editingSong, editTitle);
      setEditingSong(null);
      setEditTitle("");
      await refreshSongs();
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "Could not update song.");
    } finally {
      setEditing(false);
    }
  }

  async function onDeleteConfirm() {
    if (!deletingSong) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteSong(deletingSong);
      setDeletingSong(null);
      await refreshSongs();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Could not delete song.");
    } finally {
      setDeleting(false);
    }
  }

  function openEditDialog(song: Song) {
    setEditingSong(song);
    setEditTitle(song.title);
    setEditError(null);
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <p className="swell-page-kicker">Owner tools</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Admin</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Create songs, then upload and assign files from each song page.</p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Create song</CardTitle>
          <CardDescription>New songs automatically get VOC 1-5, GUIT A/B, BASS, and KEYS.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="song-title">Song title</FieldLabel>
                <Input
                  id="song-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="I Get Around"
                  aria-invalid={Boolean(error)}
                  required
                />
                <FieldDescription>{error ?? "A URL slug will be generated from the title."}</FieldDescription>
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!title.trim() || saving}>
                <PlusIcon data-icon="inline-start" />
                {saving ? "Creating..." : "Create song"}
              </Button>
              {createdSlug ? (
                <Button render={<Link href={`/songs/${createdSlug}`} />} variant="secondary" nativeButton={false}>
                  Open new song
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Songs</CardTitle>
          <CardDescription>Rename, open, or remove songs from the library.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => void refreshSongs()} disabled={songsLoading}>
              <RefreshCwIcon data-icon="inline-start" />
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {songsLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : listError ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load songs</EmptyTitle>
                <EmptyDescription>{listError}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : songs.length ? (
            <div className="flex flex-col gap-2">
              {songs.map((song) => (
                <div key={song.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/songs/${song.slug}`} className="font-medium hover:underline">
                      {song.title}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">/songs/{song.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button render={<Link href={`/songs/${song.slug}`} />} variant="secondary" size="sm" nativeButton={false}>
                      <ExternalLinkIcon data-icon="inline-start" />
                      Open
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(song)}>
                      <PencilIcon data-icon="inline-start" />
                      Rename
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeletingSong(song);
                        setDeleteError(null);
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No songs yet</EmptyTitle>
                <EmptyDescription>Create the first song above. Default parts will be added automatically.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingSong)} onOpenChange={(open) => (!open && !editing ? setEditingSong(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename song</DialogTitle>
            <DialogDescription>The public song URL will update to match the new title.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onEditSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(editError)}>
                <FieldLabel htmlFor="edit-song-title">Song title</FieldLabel>
                <Input
                  id="edit-song-title"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  aria-invalid={Boolean(editError)}
                  required
                />
                <FieldDescription>{editError ?? "A unique URL slug will be generated from the title."}</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSong(null)} disabled={editing}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editTitle.trim() || editing}>
                {editing ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingSong)} onOpenChange={(open) => (!open && !deleting ? setDeletingSong(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete song</DialogTitle>
            <DialogDescription>
              {deletingSong ? `Delete "${deletingSong.title}" and its assigned part records? Uploaded storage files are not removed.` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingSong(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void onDeleteConfirm()} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete song"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
