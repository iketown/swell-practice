"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SONG_MIXER_MIXES,
  type SongMixerMixId,
  type SongMixerSettings,
  type SongMixerStateOverrides,
  type SongMixerTrack,
} from "@/lib/domain";

const SongMixerWaveform = dynamic(
  () => import("@/components/song-mixer-waveform").then((module) => module.SongMixerWaveform),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-3 p-4" aria-label="Loading mixer">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    ),
  },
);

export function SongMixerPlayer({
  tracks,
  settings,
  canSaveOverrides,
  autoSaveOverrides,
  hasUnsavedOverrideChanges,
  overrideSaveStatus,
  manageStemsAction,
  onAutoSaveOverridesChange,
  onSaveOverrides,
  onRevertOverrides,
  onTrackOverridesChange,
}: {
  tracks: SongMixerTrack[];
  settings: SongMixerSettings;
  canSaveOverrides: boolean;
  autoSaveOverrides: boolean;
  hasUnsavedOverrideChanges: boolean;
  overrideSaveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  manageStemsAction?: ReactNode;
  onAutoSaveOverridesChange: (autoSave: boolean) => void;
  onSaveOverrides: () => void;
  onRevertOverrides: () => void;
  onTrackOverridesChange: (trackId: string, stateOverrides: SongMixerStateOverrides) => void;
}) {
  const featureableTracks = useMemo(
    () => tracks.filter((track) => !track.isBackgroundMix),
    [tracks],
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    featureableTracks[0]?.id ?? null,
  );
  const [mixId, setMixId] = useState<SongMixerMixId>("listen");
  const activeMix = SONG_MIXER_MIXES.find((mix) => mix.id === mixId) ?? SONG_MIXER_MIXES[2];
  const effectiveSelectedTrackId = featureableTracks.some((track) => track.id === selectedTrackId)
    ? selectedTrackId
    : featureableTracks[0]?.id ?? null;
  const overridesObject = useMemo(() => songOverridesObject(tracks), [tracks]);
  const overrideValueCount = useMemo(() => countOverrideValues(tracks), [tracks]);
  const overrideStatusLabel = !canSaveOverrides
    ? "Read only"
    : overrideSaveStatus === "saving"
      ? "Saving"
      : overrideSaveStatus === "error"
        ? "Save failed"
        : hasUnsavedOverrideChanges || overrideSaveStatus === "dirty"
          ? "Unsaved"
          : overrideSaveStatus === "saved"
            ? "Saved"
            : "Stored";

  return (
    <>
      <div className="grid gap-3 border-b-2 bg-card p-3 sm:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1fr)] sm:items-start sm:p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="selected-mixer-stem">Selected part</Label>
          <Select
            items={featureableTracks.map((track) => ({
              label: track.displayName,
              value: track.id,
            }))}
            value={effectiveSelectedTrackId}
            disabled={!featureableTracks.length}
            onValueChange={setSelectedTrackId}
          >
            <SelectTrigger id="selected-mixer-stem" className="h-10 w-full bg-background">
              <SelectValue placeholder="No selectable parts" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {featureableTracks.map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {manageStemsAction ? <div className="pt-1">{manageStemsAction}</div> : null}
        </div>

        <div className="grid min-w-0 gap-1.5">
          <Label>Custom mix</Label>
          <Tabs
            value={mixId}
            onValueChange={(value) => setMixId(value as SongMixerMixId)}
            className="min-w-0 gap-1.5"
          >
            <TabsList className="grid h-auto w-full grid-cols-3">
              {SONG_MIXER_MIXES.map((mix) => (
                <TabsTrigger key={mix.id} value={mix.id} className="min-h-9 px-2 text-xs sm:text-sm">
                  {mix.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <p className="text-xs text-muted-foreground sm:col-span-2">
          {activeMix?.description}
        </p>

        {canSaveOverrides ? (
          <Accordion defaultValue={[]} className="gap-0 sm:col-span-2">
            <AccordionItem value="song-overrides" className="rounded-md border bg-secondary/35 shadow-none">
              <AccordionTrigger className="min-h-10 px-3 py-2 font-body hover:bg-secondary/55">
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="font-semibold">Song overrides</span>
                  <Badge variant="outline">
                    {overrideValueCount} value{overrideValueCount === 1 ? "" : "s"}
                  </Badge>
                  <Badge
                    variant={overrideSaveStatus === "error" ? "destructive" : "secondary"}
                    aria-live="polite"
                  >
                    {overrideStatusLabel}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="grid gap-2 border-t px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                  <Field orientation="horizontal" className="w-auto gap-2">
                    <Switch
                      id="auto-save-mixer-overrides"
                      checked={autoSaveOverrides}
                      disabled={overrideSaveStatus === "saving"}
                      onCheckedChange={onAutoSaveOverridesChange}
                    />
                    <FieldLabel htmlFor="auto-save-mixer-overrides">
                      Save moves to overrides
                    </FieldLabel>
                  </Field>

                  {!autoSaveOverrides ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        disabled={
                          !hasUnsavedOverrideChanges || overrideSaveStatus === "saving"
                        }
                        onClick={onSaveOverrides}
                      >
                        Save overrides
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={
                          !hasUnsavedOverrideChanges || overrideSaveStatus === "saving"
                        }
                        onClick={onRevertOverrides}
                      >
                        Revert to saved
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="max-w-3xl text-xs text-muted-foreground">
                  {autoSaveOverrides
                    ? "Adjust volume, pan, or mute while a stem is in a mix state. Each move is saved automatically."
                    : "Changes are held in this page until you save them. Revert restores the last values loaded from the database."}
                </p>
                <pre
                  data-testid="song-mixer-overrides-json"
                  aria-label="Song mixer overrides JSON"
                  className="max-h-48 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed"
                >
                  {JSON.stringify(overridesObject, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </div>

      <SongMixerWaveform
        key={tracks.map((track) => track.id).join(":")}
        tracks={tracks}
        settings={settings}
        mixId={mixId}
        selectedTrackId={effectiveSelectedTrackId}
        onSelectedTrackChange={setSelectedTrackId}
        onTrackOverridesChange={canSaveOverrides ? onTrackOverridesChange : undefined}
      />
    </>
  );
}

function songOverridesObject(tracks: SongMixerTrack[]) {
  const duplicateNames = new Set(
    tracks
      .map((track) => track.displayName)
      .filter((displayName, index, names) => names.indexOf(displayName) !== index),
  );

  return Object.fromEntries(
    tracks.flatMap((track) => {
      if (!Object.keys(track.stateOverrides).length) return [];
      const key = duplicateNames.has(track.displayName)
        ? `${track.displayName} (${track.id})`
        : track.displayName;

      return [[key, track.stateOverrides]];
    }),
  );
}

function countOverrideValues(tracks: SongMixerTrack[]) {
  return tracks.reduce(
    (total, track) =>
      total
      + Object.values(track.stateOverrides).reduce(
        (stateTotal, stateOverride) => stateTotal + Object.keys(stateOverride ?? {}).length,
        0,
      ),
    0,
  );
}
