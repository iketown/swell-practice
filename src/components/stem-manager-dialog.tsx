"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileAudioIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StemMixConfigEditor } from "@/components/stem-mix-config-editor";
import { StemMixStateEditor } from "@/components/stem-mix-state-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_PARTS, DEFAULT_SONG_MIXER_CONFIGURATION_IDS, partLabel } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type {
  SongMixerConfiguration,
  SongMixerSettings,
  SongMixerStateOverrides,
  SongMixerTrack,
} from "@/lib/domain";

export function StemManagerDialog({
  tracks,
  configurations,
  settings,
  deletingTrackId,
  onDeleteTrack,
  onSave,
}: {
  tracks: SongMixerTrack[];
  configurations: SongMixerConfiguration[];
  settings: SongMixerSettings;
  deletingTrackId: string | null;
  onDeleteTrack: (track: SongMixerTrack) => Promise<boolean>;
  onSave: (
    tracks: SongMixerTrack[],
    configurations: SongMixerConfiguration[],
    settings: SongMixerSettings,
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draftTracks, setDraftTracks] = useState(tracks);
  const [draftConfigurations, setDraftConfigurations] = useState(configurations);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState("stems");
  const [overrideTrackId, setOverrideTrackId] = useState<string | null>(tracks[0]?.id ?? null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const configurationsAreValid =
    draftConfigurations.length > 0
    && draftConfigurations.every((configuration) => configuration.name.trim())
    && new Set(
      draftConfigurations.map((configuration) =>
        configuration.name.trim().toLocaleLowerCase(),
      ),
    ).size === draftConfigurations.length;
  const stemNamesAreValid = draftTracks.every((track) => track.displayName.trim());
  const isDirty = useMemo(
    () =>
      mixerConfigurationKey(draftTracks, draftConfigurations, draftSettings)
      !== mixerConfigurationKey(tracks, configurations, settings),
    [configurations, draftConfigurations, draftSettings, draftTracks, settings, tracks],
  );

  const setDialogOpen = (nextOpen: boolean) => {
    if (saving) return;
    setOpen(nextOpen);

    if (nextOpen) {
      setDraftTracks(tracks);
      setDraftConfigurations(configurations);
      setDraftSettings(settings);
      setActiveTab("stems");
      setOverrideTrackId(tracks[0]?.id ?? null);
      setAnnouncement("");
    }
  };

  const updateShown = (trackId: string, shown: boolean) => {
    setDraftTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, shown } : track)),
    );
  };

  const updateBackgroundMix = (trackId: string, isBackgroundMix: boolean) => {
    setDraftTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, isBackgroundMix } : track,
      ),
    );
  };

  const updateDisplayName = (trackId: string, displayName: string) => {
    setDraftTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, displayName } : track)),
    );
  };

  const updatePartAssignment = (trackId: string, partSlug: string | null) => {
    setDraftTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, partSlug } : track)),
    );
  };

  const moveTrack = (trackId: string, targetIndex: number) => {
    setDraftTracks((current) => {
      const sourceIndex = current.findIndex((track) => track.id === trackId);
      if (sourceIndex < 0 || sourceIndex === targetIndex || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return current;
      next.splice(targetIndex, 0, moved);
      setAnnouncement(`${moved.displayName} moved to position ${targetIndex + 1}.`);
      return next;
    });
  };

  const dropTrack = (targetTrackId: string) => {
    if (!draggedTrackId || draggedTrackId === targetTrackId) return;
    const targetIndex = draftTracks.findIndex((track) => track.id === targetTrackId);
    moveTrack(draggedTrackId, targetIndex);
    setDraggedTrackId(null);
  };

  const deleteTrack = async (track: SongMixerTrack) => {
    const deleted = await onDeleteTrack(track);
    if (!deleted) return;

    setDraftTracks((current) => current.filter((currentTrack) => currentTrack.id !== track.id));
    setDraftConfigurations((current) =>
      current.map((configuration) => ({
        ...configuration,
        trackIds: configuration.trackIds.filter((trackId) => trackId !== track.id),
      })),
    );
    if (overrideTrackId === track.id) {
      setOverrideTrackId(draftTracks.find((currentTrack) => currentTrack.id !== track.id)?.id ?? null);
    }
    setAnnouncement(`${track.displayName} was permanently deleted.`);
  };

  const updateTrackOverrides = (trackId: string, stateOverrides: SongMixerStateOverrides) => {
    setDraftTracks((current) =>
      current.map((track) => (track.id === trackId ? { ...track, stateOverrides } : track)),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const tracksForSave = draftTracks.map((track, orderIndex) => ({
        ...track,
        orderIndex,
      }));
      const saved = await onSave(
        tracksForSave,
        configurationsForPartAssignments(tracksForSave, draftConfigurations),
        draftSettings,
      );

      if (saved) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger
        render={
          <Button variant="secondary" size="sm">
            <SlidersHorizontalIcon data-icon="inline-start" />
            Manage stems
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Stem manager</DialogTitle>
            <Badge variant="secondary">
              {draftConfigurations.length} mix{draftConfigurations.length === 1 ? "" : "es"} ·{" "}
              {draftTracks.length} stem{draftTracks.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <DialogDescription>
            Upload stems once, then choose which stems load in each player mix.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(String(value))}
          className="min-h-0 gap-0 overflow-hidden"
        >
          <div className="border-b bg-secondary/45 px-4 py-2">
            <TabsList className="h-9">
              <TabsTrigger value="stems" className="px-4 py-1.5">
                Stems
              </TabsTrigger>
              <TabsTrigger value="mixes" className="px-4 py-1.5">
                Mixes
              </TabsTrigger>
              <TabsTrigger value="mix-states" className="px-4 py-1.5">
                Mix states
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stems" className="min-h-0 overflow-y-auto p-4">
            <ol className="grid gap-2" aria-label="Uploaded mixer stems">
              {draftTracks.map((track, index) => {
                const deleting = deletingTrackId === track.id;
                const nameIsInvalid = !track.displayName.trim();

                return (
                  <li
                    key={track.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropTrack(track.id);
                    }}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border bg-card p-3 transition-[background-color,opacity] sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                      draggedTrackId === track.id && "opacity-55",
                    )}
                  >
                    <button
                      type="button"
                      draggable
                      aria-label={`Drag ${track.displayName} to reorder`}
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        setDraggedTrackId(track.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", track.id);
                      }}
                      onDragEnd={() => setDraggedTrackId(null)}
                      className="grid size-9 cursor-grab place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                    >
                      <GripVerticalIcon aria-hidden />
                    </button>

                    <div className="grid min-w-0 gap-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileAudioIcon className="size-4 shrink-0 text-primary" aria-hidden />
                        <Field data-invalid={nameIsInvalid} className="min-w-0 flex-1 gap-1">
                          <FieldLabel htmlFor={`stem-name-${track.id}`} className="sr-only">
                            Stem name
                          </FieldLabel>
                          <Input
                            id={`stem-name-${track.id}`}
                            value={track.displayName}
                            maxLength={80}
                            required
                            aria-invalid={nameIsInvalid}
                            onChange={(event) => updateDisplayName(track.id, event.currentTarget.value)}
                            className="h-8 font-medium"
                          />
                        </Field>
                        {track.isBackgroundMix ? (
                          <Badge variant="outline" className="shrink-0">
                            BG
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate" title={track.filename}>
                          File: {track.filename}
                        </span>
                        <span>Position {index + 1}</span>
                        <span>{formatBytes(track.size)}</span>
                      </div>
                      <Field className="grid gap-1.5 border-t pt-2 sm:grid-cols-[auto_minmax(10rem,1fr)] sm:items-center">
                        <FieldLabel htmlFor={`stem-part-${track.id}`} className="text-xs">
                          Linked part
                        </FieldLabel>
                        <Select
                          items={[
                            { label: "No linked part", value: "unassigned" },
                            ...DEFAULT_PARTS.map((part) => ({
                              label: partLabel(part.slug),
                              value: part.slug,
                            })),
                          ]}
                          value={track.partSlug ?? "unassigned"}
                          onValueChange={(value) =>
                            updatePartAssignment(track.id, value === "unassigned" ? null : value ?? null)
                          }
                        >
                          <SelectTrigger id={`stem-part-${track.id}`} size="sm" className="w-full bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="start">
                            <SelectGroup>
                              <SelectItem value="unassigned">No linked part</SelectItem>
                              {DEFAULT_PARTS.map((part) => (
                                <SelectItem key={part.slug} value={part.slug}>
                                  {partLabel(part.slug)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="col-span-2 flex flex-wrap items-center justify-end gap-1 sm:col-span-1">
                      <Field orientation="horizontal" className="mr-2 w-auto gap-1.5">
                        <Checkbox
                          id={`background-mix-${track.id}`}
                          checked={track.isBackgroundMix}
                          onCheckedChange={(checked) => updateBackgroundMix(track.id, checked)}
                        />
                        <FieldLabel htmlFor={`background-mix-${track.id}`}>BG mix</FieldLabel>
                      </Field>
                      <Field orientation="horizontal" className="mr-1 w-auto gap-1.5">
                        <Checkbox
                          id={`show-${track.id}`}
                          checked={track.shown}
                          onCheckedChange={(checked) => updateShown(track.id, checked)}
                        />
                        <FieldLabel htmlFor={`show-${track.id}`}>Available</FieldLabel>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${track.displayName} up`}
                        disabled={index === 0}
                        onClick={() => moveTrack(track.id, index - 1)}
                      >
                        <ArrowUpIcon aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${track.displayName} down`}
                        disabled={index === draftTracks.length - 1}
                        onClick={() => moveTrack(track.id, index + 1)}
                      >
                        <ArrowDownIcon aria-hidden />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Permanently delete ${track.displayName}`}
                              disabled={deleting}
                              className="text-muted-foreground hover:text-destructive"
                            />
                          }
                        >
                          {deleting ? (
                            <LoaderCircleIcon className="animate-spin" aria-hidden />
                          ) : (
                            <Trash2Icon aria-hidden />
                          )}
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this stem permanently?</AlertDialogTitle>
                            <AlertDialogDescription>
                              “{track.displayName}” will be removed from this song and deleted from Firebase Storage.
                              Rehearsal MP3s on the song and parts pages are not affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep stem</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => void deleteTrack(track)}>
                              Delete MP3
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </TabsContent>

          <TabsContent value="mixes" className="min-h-0 overflow-y-auto p-4">
            <StemMixConfigEditor
              configurations={draftConfigurations}
              tracks={draftTracks}
              onChange={setDraftConfigurations}
            />
          </TabsContent>

          <TabsContent value="mix-states" className="min-h-0 overflow-y-auto p-4">
            <StemMixStateEditor
              settings={draftSettings}
              tracks={draftTracks}
              selectedTrackId={overrideTrackId}
              onSelectedTrackChange={setOverrideTrackId}
              onSettingsChange={setDraftSettings}
              onTrackOverridesChange={updateTrackOverrides}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <DialogClose render={<Button variant="outline" disabled={saving} />}>Cancel</DialogClose>
          <Button
            disabled={!isDirty || !configurationsAreValid || !stemNamesAreValid || saving}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
            Save mixer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mixerConfigurationKey(
  tracks: SongMixerTrack[],
  configurations: SongMixerConfiguration[],
  settings: SongMixerSettings,
) {
  return JSON.stringify({
    tracks: tracks.map((track) => ({
      id: track.id,
      displayName: track.displayName,
      partSlug: track.partSlug,
      shown: track.shown,
      isBackgroundMix: track.isBackgroundMix,
      stateOverrides: track.stateOverrides,
    })),
    configurations: configurations.map((configuration) => ({
      id: configuration.id,
      name: configuration.name,
      trackIds: configuration.trackIds,
    })),
    settings,
  });
}

function configurationsForPartAssignments(
  tracks: SongMixerTrack[],
  configurations: SongMixerConfiguration[],
) {
  return configurations.map((configuration, orderIndex) => {
    const isVocalMix = configuration.id === DEFAULT_SONG_MIXER_CONFIGURATION_IDS.vocals;
    const isInstrumentMix = configuration.id === DEFAULT_SONG_MIXER_CONFIGURATION_IDS.instruments;
    const isDefaultPartMix = isVocalMix || isInstrumentMix;

    return {
      ...configuration,
      orderIndex,
      trackIds: tracks.flatMap((track) => {
        const hasLinkedPart = Boolean(track.partSlug);
        const belongsInMix = (isVocalMix && track.partSlug?.startsWith("voc_"))
          || (isInstrumentMix && typeof track.partSlug === "string" && !track.partSlug.startsWith("voc_"));
        const remainsInMix = configuration.trackIds.includes(track.id)
          && (!isDefaultPartMix || !hasLinkedPart);

        return belongsInMix || remainsInMix ? [track.id] : [];
      }),
    };
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 || value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
