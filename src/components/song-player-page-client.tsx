"use client";

import Link from "next/link";
import { ArrowLeftIcon, FileAudioIcon, UploadIcon, XIcon } from "lucide-react";
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
  SongAnnotation,
  SongMixerBundle,
  SongMixerConfiguration,
  SongMixerSettings,
  SongMixerStateOverrides,
  SongMixerTrack,
} from "@/lib/domain";
import {
  createSongAnnotation,
  deleteSongAnnotation,
  deleteSongMixerTrack,
  getSongMixerBundle,
  replaceSongAnnotations,
  saveSongMixerConfiguration,
  saveSongMixerTrackOverrides,
  saveSongMixerTrackOverridesBatch,
  updateSongAnnotation,
  uploadSongMixerTrack,
  type SongAssetUploadProgress,
} from "@/lib/firestore";

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
  const annotationSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const annotationDraftRef = useRef<SongAnnotation[]>([]);
  const overrideSaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const overrideSaveVersions = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    const next = await getSongMixerBundle(slug);
    setBundle(next);
    annotationDraftRef.current = next?.annotations ?? [];
    setSavedTrackOverrides(savedOverridesFromBundle(next));
    setOverrideSaveStatus("idle");
  }, [slug]);

  useEffect(() => {
    let active = true;

    getSongMixerBundle(slug)
      .then((next) => {
        if (!active) return;
        setBundle(next);
        annotationDraftRef.current = next?.annotations ?? [];
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
    const annotationTimers = annotationSaveTimers.current;
    const timers = overrideSaveTimers.current;

    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      annotationTimers.forEach((timer) => clearTimeout(timer));
      annotationTimers.clear();
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

      const queuedUploads = files.map((file) => {
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
    [bundle, refresh],
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

  const createAnnotation = useCallback(
    async (annotation: Omit<SongAnnotation, "id">) => {
      if (!bundle || !admin.isAdmin) return null;

      try {
        const created = await createSongAnnotation(bundle, annotation);
        const nextAnnotations = sortSongAnnotations([...annotationDraftRef.current, created]);
        annotationDraftRef.current = nextAnnotations;
        setBundle((current) => current ? { ...current, annotations: nextAnnotations } : current);
        toast.success(`${created.title} annotation created`);
        return created;
      } catch (caught) {
        toast.error("Annotation could not be created", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return null;
      }
    },
    [admin.isAdmin, bundle],
  );

  const updateAnnotation = useCallback(
    async (annotation: SongAnnotation) => {
      if (!bundle || !admin.isAdmin) return false;

      const pendingTimer = annotationSaveTimers.current.get(annotation.id);
      if (pendingTimer) clearTimeout(pendingTimer);
      annotationSaveTimers.current.delete(annotation.id);

      try {
        await updateSongAnnotation(bundle, annotation);
        const nextAnnotations = sortSongAnnotations(
          annotationDraftRef.current.map((current) =>
            current.id === annotation.id ? annotation : current,
          ),
        );
        annotationDraftRef.current = nextAnnotations;
        setBundle((current) => current ? { ...current, annotations: nextAnnotations } : current);
        toast.success("Annotation saved");
        return true;
      } catch (caught) {
        toast.error("Annotation could not be saved", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return false;
      }
    },
    [admin.isAdmin, bundle],
  );

  const deleteAnnotation = useCallback(
    async (annotation: SongAnnotation) => {
      if (!bundle || !admin.isAdmin) return false;

      const pendingTimer = annotationSaveTimers.current.get(annotation.id);
      if (pendingTimer) clearTimeout(pendingTimer);
      annotationSaveTimers.current.delete(annotation.id);

      try {
        await deleteSongAnnotation(bundle, annotation.id);
        const nextAnnotations = annotationDraftRef.current.filter(
          (current) => current.id !== annotation.id,
        );
        annotationDraftRef.current = nextAnnotations;
        setBundle((current) => current ? { ...current, annotations: nextAnnotations } : current);
        toast.success(`${annotation.title} annotation deleted`);
        return true;
      } catch (caught) {
        toast.error("Annotation could not be deleted", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return false;
      }
    },
    [admin.isAdmin, bundle],
  );

  const importAnnotations = useCallback(
    async (annotations: Array<Omit<SongAnnotation, "id">>) => {
      if (!bundle || !admin.isAdmin) return null;

      annotationSaveTimers.current.forEach((timer) => clearTimeout(timer));
      annotationSaveTimers.current.clear();

      try {
        const replacements = await replaceSongAnnotations(bundle, annotations);
        const nextAnnotations = sortSongAnnotations(replacements);
        annotationDraftRef.current = nextAnnotations;
        setBundle((current) => current ? { ...current, annotations: nextAnnotations } : current);
        toast.success(
          `${nextAnnotations.length} annotation${nextAnnotations.length === 1 ? "" : "s"} imported from MIDI`,
        );
        return nextAnnotations;
      } catch (caught) {
        toast.error("MIDI annotations could not be saved", {
          description: caught instanceof Error ? caught.message : "Please try again.",
        });
        return null;
      }
    },
    [admin.isAdmin, bundle],
  );

  const changeAnnotationBoundaries = useCallback(
    (annotations: SongAnnotation[]) => {
      if (!bundle || !admin.isAdmin) return;

      const previousById = new Map(
        annotationDraftRef.current.map((annotation) => [annotation.id, annotation]),
      );
      const nextAnnotations = sortSongAnnotations(annotations);
      annotationDraftRef.current = nextAnnotations;
      setBundle((current) => current ? { ...current, annotations: nextAnnotations } : current);

      nextAnnotations.forEach((annotation) => {
        const previous = previousById.get(annotation.id);
        if (
          !previous
          || (previous.start === annotation.start && previous.end === annotation.end)
        ) {
          return;
        }

        const pendingTimer = annotationSaveTimers.current.get(annotation.id);
        if (pendingTimer) clearTimeout(pendingTimer);

        const timer = setTimeout(async () => {
          annotationSaveTimers.current.delete(annotation.id);

          try {
            await updateSongAnnotation(bundle, annotation);
          } catch (caught) {
            toast.error("Dragged annotation could not be saved", {
              description: caught instanceof Error ? caught.message : "Please try again.",
            });
            await refresh();
          }
        }, 450);

        annotationSaveTimers.current.set(annotation.id, timer);
      });
    },
    [admin.isAdmin, bundle, refresh],
  );

  const saveMixerConfiguration = useCallback(
    async (
      tracks: SongMixerTrack[],
      configurations: SongMixerConfiguration[],
      settings: SongMixerSettings,
    ) => {
      if (!bundle) return false;

      try {
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(bundle.settings);
        await saveSongMixerConfiguration(
          bundle,
          tracks,
          configurations,
          settings,
          settingsChanged,
        );
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
      configurations={bundle.configurations}
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
            {trackCount} stem{trackCount === 1 ? "" : "s"} uploaded
          </Badge>
        </div>
      </header>

      {showAdminControls ? (
        <MixerUploadPanel
          onDrop={onDrop}
          onCancel={cancelUpload}
          uploadItems={uploadItems}
        />
      ) : null}

      {visibleTracks.length ? (
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            <SongMixerPlayer
              tracks={visibleTracks}
              configurations={bundle.configurations}
              settings={bundle.settings}
              annotations={bundle.annotations}
              canSaveOverrides={showAdminControls}
              canEditAnnotations={showAdminControls}
              autoSaveOverrides={autoSaveOverrides}
              hasUnsavedOverrideChanges={hasUnsavedOverrideChanges}
              overrideSaveStatus={overrideSaveStatus}
              manageStemsAction={manageStemsAction}
              onAutoSaveOverridesChange={changeAutoSaveOverrides}
              onSaveOverrides={() => void saveDraftOverrides()}
              onRevertOverrides={revertDraftOverrides}
              onTrackOverridesChange={saveTrackOverrides}
              onCreateAnnotation={createAnnotation}
              onUpdateAnnotation={updateAnnotation}
              onDeleteAnnotation={deleteAnnotation}
              onImportAnnotations={importAnnotations}
              onAnnotationsChange={changeAnnotationBoundaries}
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
                  ? "Open Manage stems and make at least one MP3 available."
                  : "An administrator has hidden every uploaded stem from the mixer."
                : showAdminControls
                  ? "Upload mono or stereo MP3 stems, then organize them into focused player mixes."
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

function sortSongAnnotations(annotations: SongAnnotation[]) {
  return [...annotations].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
}

function MixerUploadPanel({
  onDrop,
  onCancel,
  uploadItems,
}: {
  onDrop: (files: File[]) => Promise<void>;
  onCancel: (id: string) => void;
  uploadItems: UploadItem[];
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/mp3": [".mp3"],
    },
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
            "cursor-pointer hover:bg-accent",
            isDragActive ? "border-primary bg-accent" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <span className="grid size-10 place-items-center rounded-full border-2 bg-card text-primary">
            <UploadIcon aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <p className="font-medium">
              {isDragActive ? "Drop MP3 stems here" : "Drop MP3 stems or click to choose"}
            </p>
            <p className="text-sm text-muted-foreground">
              Each file becomes an available stem that you can add to one or more mixes.
            </p>
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
