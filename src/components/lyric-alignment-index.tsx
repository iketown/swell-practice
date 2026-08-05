"use client";

import {
  FileAudioIcon,
  Music2Icon,
  PlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/hooks/use-admin";
import {
  createLyricAlignmentSong,
  listLyricAlignmentSongs,
} from "@/lib/firestore";
import type {
  LyricAlignmentSong,
  LyricAlignmentStatus,
} from "@/lib/lyric-alignment";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<LyricAlignmentStatus, string> = {
  ready: "Ready to align",
  aligning: "Aligning",
  aligned: "Editing",
  error: "Needs attention",
};

export function LyricAlignmentIndex() {
  const admin = useAdmin();
  const router = useRouter();
  const [songs, setSongs] = useState<LyricAlignmentSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [formError, setFormError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      setSongs(await listLyricAlignmentSongs());
    } catch (caught) {
      setListError(
        caught instanceof Error
          ? caught.message
          : "Could not load lyric projects.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (admin.loading || !admin.isAdmin) return;
    let active = true;

    listLyricAlignmentSongs()
      .then((items) => {
        if (!active) return;
        setSongs(items);
        setListError("");
      })
      .catch((caught) => {
        if (!active) return;
        setListError(
          caught instanceof Error
            ? caught.message
            : "Could not load lyric projects.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [admin.isAdmin, admin.loading]);

  const canCreate = useMemo(
    () =>
      Boolean(
        title.trim() &&
          lyrics.trim() &&
          file &&
          !creating &&
          admin.isAdmin,
      ),
    [admin.isAdmin, creating, file, lyrics, title],
  );

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !canCreate) return;

    setCreating(true);
    setUploadPercent(0);
    setFormError("");

    try {
      const slug = await createLyricAlignmentSong(title, lyrics, file, {
        onProgress: ({ bytesTransferred, totalBytes }) => {
          setUploadPercent(
            totalBytes
              ? Math.round((bytesTransferred / totalBytes) * 100)
              : 0,
          );
        },
      });
      router.push(`/songs/align/${slug}`);
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Could not create the lyric project.",
      );
      setCreating(false);
    }
  }

  if (admin.loading) {
    return (
      <AppShell>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  }

  if (!admin.isAdmin) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Administrator access required</CardTitle>
            <CardDescription>
              Sign in with an administrator account before creating or editing
              lyric timing projects.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin"
            >
              Open admin
            </Link>
          </CardFooter>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1.5">
          <p className="swell-page-kicker">Lyric timing</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            Alignment projects
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Add the final lyrics and vocal MP3, then generate a word timing map
            to review against the waveform.
          </p>
        </div>
        <Badge variant="secondary">
          {loading ? "Loading" : `${songs.length} projects`}
        </Badge>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Create a lyric project</CardTitle>
          <CardDescription>
            The MP3 is stored in Firebase. The ElevenLabs key stays on the
            server and is only used after you start alignment.
          </CardDescription>
          <CardAction>
            <WandSparklesIcon aria-hidden className="text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <form onSubmit={createProject}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="lyric-project-title">
                  Song title
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="lyric-project-title"
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder="Help Me, Rhonda"
                  value={title}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="lyric-project-lyrics">
                  Final lyrics
                </FieldLabel>
                <Textarea
                  className="min-h-72 font-mono text-sm leading-6"
                  id="lyric-project-lyrics"
                  onChange={(event) => setLyrics(event.currentTarget.value)}
                  placeholder={"Well, she got her daddy's car\nAnd she cruised through the hamburger stand now"}
                  value={lyrics}
                />
                <FieldDescription>
                  Keep the line breaks you want to see in the editor. Send only
                  the words that are sung in this MP3.
                </FieldDescription>
              </Field>

              <Field data-invalid={Boolean(formError)}>
                <FieldLabel htmlFor="lyric-project-audio">
                  Vocal MP3
                </FieldLabel>
                <Input
                  accept=".mp3,audio/mpeg"
                  aria-invalid={Boolean(formError)}
                  id="lyric-project-audio"
                  onChange={(event) =>
                    setFile(event.currentTarget.files?.[0] ?? null)
                  }
                  type="file"
                />
                <FieldDescription>
                  Use the cleanest vocal-forward mix you have, up to 200 MB.
                </FieldDescription>
                {file ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileAudioIcon aria-hidden className="size-4" />
                    <span className="truncate">{file.name}</span>
                    <span>
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </p>
                ) : null}
                {formError ? <FieldError>{formError}</FieldError> : null}
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-between">
            <p className="text-xs text-muted-foreground">
              {creating
                ? `Uploading MP3, ${uploadPercent}%`
                : "The project opens at /songs/align/song-slug."}
            </p>
            <Button disabled={!canCreate} type="submit">
              <PlusIcon data-icon="inline-start" />
              {creating ? "Creating project" : "Create project"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <section className="grid gap-3" aria-labelledby="alignment-project-list">
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-lg font-semibold tracking-tight"
            id="alignment-project-list"
          >
            Existing projects
          </h2>
          {listError ? (
            <Button onClick={() => void refresh()} size="sm" variant="outline">
              Try again
            </Button>
          ) : null}
        </div>

        {listError ? (
          <p className="text-sm text-destructive">{listError}</p>
        ) : loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : songs.length ? (
          <div className="grid gap-2.5">
            {songs.map((song) => (
              <Link
                aria-label={`Open ${song.title}`}
                className="group block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                href={`/songs/align/${song.slug}`}
                key={song.id}
              >
                <Card
                  className="cursor-pointer transition-colors hover:bg-muted/70"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle className="text-base">
                      <span className="group-hover:underline">
                        {song.title}
                      </span>
                    </CardTitle>
                    <CardDescription className="truncate">
                      {song.audio.filename}
                    </CardDescription>
                    <CardAction>
                      <Badge
                        variant={
                          song.status === "error"
                            ? "destructive"
                            : song.status === "aligned"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {STATUS_LABELS[song.status]}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={cn(
                        "text-xs text-muted-foreground",
                        song.errorMessage && "text-destructive",
                      )}
                    >
                      {song.errorMessage ||
                        `/songs/align/${song.slug}`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Music2Icon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No lyric projects yet</EmptyTitle>
              <EmptyDescription>
                Create the first one with the form above.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </AppShell>
  );
}
