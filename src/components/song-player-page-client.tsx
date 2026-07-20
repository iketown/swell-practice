"use client";

import Link from "next/link";
import { ArrowLeftIcon, FileAudioIcon, InfoIcon, UploadIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { SongMixerPlayer } from "@/components/song-mixer-player";
import { StemManagerDialog } from "@/components/stem-manager-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import type {
  SongMixerBundle,
  SongMixerSettings,
  SongMixerStateOverrides,
  SongMixerTrack,
} from "@/lib/domain";
import {
  deleteSongMixerTrack,
  getSongMixerBundle,
  saveSongMixerConfiguration,
  saveSongMixerTrackOverrides,
  saveSongMixerTrackOverridesBatch,
  uploadSongMixerTrack,
  type SongAssetUploadProgress,
} from "@/lib/firestore";

const MAX_MIXER_TRACKS = 8;

type UploadItem = {
  id: string;
  filename: string;
  bytesTransferred: number;
  totalBytes: number;
  status: "uploading" | "error";
};

type OverrideSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type SavedTrackOverrides = Record<string, SongMixerStateOverrides>;
type PlayerView = "admin" | "user";

export function SongPlayerPageClient({ slug }: { slug: string }) {
  const admin = useAdmin();
  const [bundle, setBundle] = useState<SongMixerBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [playerView, setPlayerView] = useState<PlayerView>("admin");
  const [autoSaveOverrides, setAutoSaveOverrides] = useState(false);
  const [overrideSaveStatus, setOverrideSaveStatus] = useState<OverrideSaveStatus>("idle");
  const [savedTrackOverrides, setSavedTrackOverrides] = useState<SavedTrackOverrides>({});
  const uploadControllers = useRef(new Map<string, AbortController>());
  const overrideSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const overrideSaveVersions = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    const next = await getSongMixerBundle(slug);
    setBundle(next);
    setSavedTrackOverrides(savedOverridesFromBundle(next));
    setOverrideSaveStatus("idle");
  }, [slug]);

  useEffect(() => {
    let active = true;

    getSongMixerBundle(slug)
      .then((next) => {
        if (!active) return;
        setBundle(next);
        setSavedTrackOverrides(savedOverridesFromBundle(next));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const controllers = uploadControllers.current;
    const timers = overrideSaveTimers.current;

    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const cancelUpload = useCallback((id: string) => {
    uploadControllers.current.get(id)?.abort();
    uploadControllers.current.delete(id);
    setUploadItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!bundle || !files.length) return;

      const activeUploadCount = uploadItems.filter((item) => item.status === "uploading").length;
      const availableSlots = Math.max(0, MAX_MIXER_TRACKS - bundle.tracks.length - activeUploadCount);
      const acceptedFiles = files.slice(0, availableSlots);

      if (!availableSlots) {
        toast.error("This mixer is full", { description: "Remove a track before adding another MP3." });
        return;
      }

      if (files.length > acceptedFiles.length) {
        toast.info(`Only ${availableSlots} track${availableSlots === 1 ? "" : "s"} added`, {
          description: "The test mixer supports up to 8 tracks.",
        });
      }

      const queuedUploads = acceptedFiles.map((file) => {
        const item: UploadItem = {
          id: crypto.randomUUID(),
          filename: file.name,
          bytesTransferred: 0,
          totalBytes: file.size,
          status: "uploading",
        };

        return { controller: new AbortController(), file, item };
      });

      queuedUploads.forEach(({ controller, item }) => {
        uploadControllers.current.set(item.id, controller);
      });
      setUploadItems((current) => [...current.filter((item) => item.status === "uploading"), ...queuedUploads.map(({ item }) => item)]);

      const updateUpload = (id: string, update: Partial<UploadItem>) => {
        setUploadItems((current) =>
          current.map((item) => (item.id === id ? { ...item, ...update } : item)),
        );
      };

      await Promise.all(
        queuedUploads.map(async ({ controller, file, item }, uploadIndex) => {
          try {
            await uploadSongMixerTrack(bundle, file, {
              signal: controller.signal,
              orderIndex: bundle.tracks.length + uploadIndex,
              onProgress: (progress: SongAssetUploadProgress) => updateUpload(item.id, progress),
            });

            if (controller.signal.aborted) return;
            setUploadItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
            toast.success(`${file.name} added to the mixer`);
          } catch (caught) {
            if (controller.signal.aborted) {
              setUploadItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
              return;
            }

            const description = caught instanceof Error ? caught.message : "Please try again.";
            updateUpload(item.id, { status: "error" });
            toast.error(`${file.name} could not be uploaded`, { description });
          } finally {
            uploadControllers.current.delete(item.id);
          }
        }),
      );

      await refresh();
    },
    [bundle, refresh, uploadItems],
  );

  const deleteTrack = useCallback(
    async (track: SongMixerTrack) => {
      if (!bundle) return false;

      setDeletingTrackId(track.id);
      try {
        await deleteSongMixerTrack(bundle, track);
        toast.success(`${track.displayName} deleted from the project`);
        await refresh();
        return true;
      } catch (caught) {
        toast.error("Track could not be deleted", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return false;
      } finally {
        setDeletingTrackId(null);
      }
    },
    [bundle, refresh],
  );

  const saveMixerConfiguration = useCallback(
    async (tracks: SongMixerTrack[], settings: SongMixerSettings) => {
      if (!bundle) return false;

      try {
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(bundle.settings);
        await saveSongMixerConfiguration(bundle, tracks, settings, settingsChanged);
        toast.success("Mixer settings updated");
        await refresh();
        return true;
      } catch (caught) {
        toast.error("Stem settings could not be saved", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return false;
      }
    },
    [bundle, refresh],
  );

  const saveTrackOverrides = useCallback(
    (trackId: string, stateOverrides: SongMixerStateOverrides) => {
      if (!bundle || !admin.isAdmin) return;

      setBundle((current) => {
        if (!current) return current;

        return {
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId ? { ...track, stateOverrides } : track,
          ),
        };
      });

      if (!autoSaveOverrides) {
        setOverrideSaveStatus("dirty");
        return;
      }

      const version = (overrideSaveVersions.current.get(trackId) ?? 0) + 1;
      overrideSaveVersions.current.set(trackId, version);
      setOverrideSaveStatus("saving");

      const previousTimer = overrideSaveTimers.current.get(trackId);
      if (previousTimer) clearTimeout(previousTimer);

      const timer = setTimeout(async () => {
        overrideSaveTimers.current.delete(trackId);

        try {
          await saveSongMixerTrackOverrides(bundle, trackId, stateOverrides);
          if (overrideSaveVersions.current.get(trackId) !== version) return;

          overrideSaveVersions.current.delete(trackId);
          setSavedTrackOverrides((current) => ({
            ...current,
            [trackId]: stateOverrides,
          }));
          if (!overrideSaveVersions.current.size) setOverrideSaveStatus("saved");
        } catch (caught) {
          if (overrideSaveVersions.current.get(trackId) !== version) return;

          overrideSaveVersions.current.delete(trackId);
          setOverrideSaveStatus("error");
          toast.error("Stem override could not be saved", {
            description: caught instanceof Error ? caught.message : "Please try again.",
          });
        }
      }, 350);

      overrideSaveTimers.current.set(trackId, timer);
    },
    [admin.isAdmin, autoSaveOverrides, bundle],
  );

  const dirtyOverrideChanges = useMemo(() => {
    if (!bundle) return [];

    return bundle.tracks.flatMap((track) =>
      overridesKey(track.stateOverrides) === overridesKey(savedTrackOverrides[track.id] ?? {})
        ? []
        : [{ trackId: track.id, stateOverrides: track.stateOverrides }],
    );
  }, [bundle, savedTrackOverrides]);
  const hasUnsavedOverrideChanges = dirtyOverrideChanges.length > 0;

  const saveDraftOverrides = useCallback(async () => {
    if (!bundle || !admin.isAdmin || !dirtyOverrideChanges.length) return;

    overrideSaveTimers.current.forEach((timer) => clearTimeout(timer));
    overrideSaveTimers.current.clear();
    overrideSaveVersions.current.clear();
    setOverrideSaveStatus("saving");

    try {
      await saveSongMixerTrackOverridesBatch(bundle, dirtyOverrideChanges);
      setSavedTrackOverrides(overridesFromTracks(bundle.tracks));
      setOverrideSaveStatus("saved");
    } catch (caught) {
      setOverrideSaveStatus("error");
      toast.error("Song overrides could not be saved", {
        description: caught instanceof Error ? caught.message : "Please try again.",
      });
    }
  }, [admin.isAdmin, bundle, dirtyOverrideChanges]);

  const revertDraftOverrides = useCallback(() => {
    overrideSaveTimers.current.forEach((timer) => clearTimeout(timer));
    overrideSaveTimers.current.clear();
    overrideSaveVersions.current.clear();
    setBundle((current) => {
      if (!current) return current;

      return {
        ...current,
        tracks: current.tracks.map((track) => ({
          ...track,
          stateOverrides: savedTrackOverrides[track.id] ?? {},
        })),
      };
    });
    setOverrideSaveStatus("idle");
  }, [savedTrackOverrides]);

  const changeAutoSaveOverrides = useCallback(
    (nextAutoSave: boolean) => {
      setAutoSaveOverrides(nextAutoSave);
      if (nextAutoSave && hasUnsavedOverrideChanges) void saveDraftOverrides();
    },
    [hasUnsavedOverrideChanges, saveDraftOverrides],
  );

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  }

  if (!bundle) {
    return (
      <AppShell>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Song not found</EmptyTitle>
            <EmptyDescription>No song exists at `/songs/{slug}` yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  }

  const activeUploadCount = uploadItems.filter((item) => item.status === "uploading").length;
  const trackCount = bundle.tracks.length + activeUploadCount;
  const visibleTracks = bundle.tracks.filter((track) => track.shown);
  const showAdminControls = admin.isAdmin && playerView === "admin";
  const manageStemsAction = showAdminControls && bundle.tracks.length ? (
    <StemManagerDialog
      tracks={bundle.tracks}
      settings={bundle.settings}
      deletingTrackId={deletingTrackId}
      onDeleteTrack={deleteTrack}
      onSave={saveMixerConfiguration}
    />
  ) : null;

  return (
    <AppShell>
      <header className="grid gap-3 py-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:py-2">
        <div className="grid gap-2">
          <Button
            render={<Link href={`/songs/${bundle.song.slug}`} />}
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="w-fit"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Song files
          </Button>
          <div>
            <p className="swell-page-kicker">Test mixer</p>
            <h1 className="swell-song-title">{bundle.song.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {admin.isAdmin ? (
            <ToggleGroup
              aria-label="Player view"
              variant="outline"
              size="sm"
              spacing={0}
              value={[playerView]}
              onValueChange={(value) => {
                const nextView = value[0] as PlayerView | undefined;
                if (nextView) setPlayerView(nextView);
              }}
            >
              <ToggleGroupItem value="admin">ADMIN</ToggleGroupItem>
              <ToggleGroupItem value="user">USER</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          <Badge variant="secondary" className="w-fit">
            {trackCount} / {MAX_MIXER_TRACKS} uploaded
          </Badge>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-md border bg-secondary/75 px-3 py-2.5 text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          Mixer stems live separately from the rehearsal files on the song and parts pages. Adding or deleting a
          track here will not change those files.
        </p>
      </div>

      {showAdminControls ? (
        <MixerUploadPanel
          disabled={trackCount >= MAX_MIXER_TRACKS}
          onDrop={onDrop}
          onCancel={cancelUpload}
          uploadItems={uploadItems}
        />
      ) : null}

      {visibleTracks.length ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle>Multitrack player</CardTitle>
            <CardDescription>
              Open a stem to adjust volume, pan, mute, and solo. The timeline and waveforms scroll horizontally
              when zoomed.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <SongMixerPlayer
              tracks={visibleTracks}
              settings={bundle.settings}
              canSaveOverrides={showAdminControls}
              autoSaveOverrides={autoSaveOverrides}
              hasUnsavedOverrideChanges={hasUnsavedOverrideChanges}
              overrideSaveStatus={overrideSaveStatus}
              manageStemsAction={manageStemsAction}
              onAutoSaveOverridesChange={changeAutoSaveOverrides}
              onSaveOverrides={() => void saveDraftOverrides()}
              onRevertOverrides={revertDraftOverrides}
              onTrackOverridesChange={saveTrackOverrides}
            />
          </CardContent>
        </Card>
      ) : (
        <Empty className="min-h-72 border-2 bg-card">
          <EmptyHeader>
            <span className="mx-auto grid size-12 place-items-center rounded-full border-2 bg-secondary text-primary">
              <FileAudioIcon aria-hidden />
            </span>
            <EmptyTitle>{bundle.tracks.length ? "No stems selected" : "No mixer stems yet"}</EmptyTitle>
            <EmptyDescription>
              {bundle.tracks.length
                ? showAdminControls
                  ? "Open Manage stems and check Show next to the MP3s you want in this mixer."
                  : "An administrator has hidden every uploaded stem from the mixer."
                : showAdminControls
                  ? "Upload up to eight mono or stereo MP3 stems to draw their waveforms and build this song’s test mix."
                : "An administrator has not added mixer stems for this song yet."}
            </EmptyDescription>
          </EmptyHeader>
          {manageStemsAction ? <EmptyContent>{manageStemsAction}</EmptyContent> : null}
        </Empty>
      )}
    </AppShell>
  );
}

function savedOverridesFromBundle(bundle: SongMixerBundle | null): SavedTrackOverrides {
  return bundle ? overridesFromTracks(bundle.tracks) : {};
}

function overridesFromTracks(tracks: SongMixerTrack[]): SavedTrackOverrides {
  return Object.fromEntries(
    tracks.map((track) => [track.id, track.stateOverrides]),
  );
}

function overridesKey(overrides: SongMixerStateOverrides) {
  return JSON.stringify(overrides);
}

function MixerUploadPanel({
  disabled,
  onDrop,
  onCancel,
  uploadItems,
}: {
  disabled: boolean;
  onDrop: (files: File[]) => Promise<void>;
  onCancel: (id: string) => void;
  uploadItems: UploadItem[];
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/mp3": [".mp3"],
    },
    disabled,
    multiple: true,
    onDropAccepted: (files) => void onDrop(files),
    onDropRejected: (rejections) => {
      const hasInvalidType = rejections.some((rejection) =>
        rejection.errors.some((error) => error.code === "file-invalid-type"),
      );
      toast.error(hasInvalidType ? "Choose MP3 files only" : "Those files could not be added.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add mixer stems</CardTitle>
        <CardDescription>Mono and stereo MP3s are both supported. All stems should begin at the same song start.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          {...getRootProps()}
          className={[
            "flex min-h-28 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-secondary/55 p-5 text-center transition-colors",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent",
            isDragActive ? "border-primary bg-accent" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <span className="grid size-10 place-items-center rounded-full border-2 bg-card text-primary">
            <UploadIcon aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <p className="font-medium">
              {disabled ? "Eight-track limit reached" : isDragActive ? "Drop MP3 stems here" : "Drop MP3 stems or click to choose"}
            </p>
            <p className="text-sm text-muted-foreground">Each file becomes one independent mixer track.</p>
          </div>
        </div>

        {uploadItems.length ? (
          <div className="grid gap-2" aria-label="Mixer upload progress">
            {uploadItems.map((item) => {
              const percentage =
                item.totalBytes > 0 ? Math.round((item.bytesTransferred / item.totalBytes) * 100) : 0;

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-card p-3"
                >
                  <FileAudioIcon className="size-4 text-primary" aria-hidden />
                  <Progress value={percentage} className="min-w-0 gap-2">
                    <ProgressLabel className="min-w-0 flex-1 truncate">{item.filename}</ProgressLabel>
                    <ProgressValue />
                  </Progress>
                  {item.status === "uploading" && percentage < 100 ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Cancel ${item.filename}`} onClick={() => onCancel(item.id)}>
                      <XIcon aria-hidden />
                    </Button>
                  ) : (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
