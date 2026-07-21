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
  DEFAULT_SONG_MIXER_CONFIGURATION_IDS,
  type SongAnnotation,
  type SongMixerConfiguration,
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
  configurations,
  requestedMix,
  requestedPart,
  settings,
  annotations,
  canSaveOverrides,
  canEditAnnotations,
  autoSaveOverrides,
  hasUnsavedOverrideChanges,
  overrideSaveStatus,
  manageStemsAction,
  onAutoSaveOverridesChange,
  onSaveOverrides,
  onRevertOverrides,
  onTrackOverridesChange,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onImportAnnotations,
  onAnnotationsChange,
}: {
  tracks: SongMixerTrack[];
  configurations: SongMixerConfiguration[];
  requestedMix?: string;
  requestedPart?: string;
  settings: SongMixerSettings;
  annotations: SongAnnotation[];
  canSaveOverrides: boolean;
  canEditAnnotations: boolean;
  autoSaveOverrides: boolean;
  hasUnsavedOverrideChanges: boolean;
  overrideSaveStatus: "idle" | "dirty" | "saving" | "saved" | "error";
  manageStemsAction?: ReactNode;
  onAutoSaveOverridesChange: (autoSave: boolean) => void;
  onSaveOverrides: () => void;
  onRevertOverrides: () => void;
  onTrackOverridesChange: (trackId: string, stateOverrides: SongMixerStateOverrides) => void;
  onCreateAnnotation: (annotation: Omit<SongAnnotation, "id">) => Promise<SongAnnotation | null>;
  onUpdateAnnotation: (annotation: SongAnnotation) => Promise<boolean>;
  onDeleteAnnotation: (annotation: SongAnnotation) => Promise<boolean>;
  onImportAnnotations: (
    annotations: Array<Omit<SongAnnotation, "id">>,
  ) => Promise<SongAnnotation[] | null>;
  onAnnotationsChange: (annotations: SongAnnotation[]) => void;
}) {
  const requestedConfiguration = configurationForAddressMix(configurations, requestedMix);
  const initialConfiguration = requestedConfiguration ?? configurations[0] ?? null;
  const initialFeatureableTracks = tracks.filter(
    (track) => initialConfiguration?.trackIds.includes(track.id) && !track.isBackgroundMix,
  );
  const initialRequestedTrack = trackForAddressPart(initialFeatureableTracks, requestedPart);
  const [configurationId, setConfigurationId] = useState<string | null>(
    initialConfiguration?.id ?? null,
  );
  const effectiveConfigurationId = configurations.some(
    (configuration) => configuration.id === configurationId,
  )
    ? configurationId
    : configurations[0]?.id ?? null;
  const activeConfiguration =
    configurations.find((configuration) => configuration.id === effectiveConfigurationId)
    ?? null;
  const activeTrackIds = useMemo(
    () => new Set(activeConfiguration?.trackIds ?? []),
    [activeConfiguration?.trackIds],
  );
  const activeTracks = useMemo(
    () => tracks.filter((track) => activeTrackIds.has(track.id)),
    [activeTrackIds, tracks],
  );
  const featureableTracks = useMemo(
    () => activeTracks.filter((track) => !track.isBackgroundMix),
    [activeTracks],
  );
  const [selectedTrackIdsByConfiguration, setSelectedTrackIdsByConfiguration] = useState<
    Record<string, string | null>
  >(
    initialConfiguration
      ? { [initialConfiguration.id]: initialRequestedTrack?.id ?? initialFeatureableTracks[0]?.id ?? null }
      : {},
  );
  const [mixId, setMixId] = useState<SongMixerMixId>(
    requestedConfiguration || initialRequestedTrack ? "learn" : "listen",
  );
  const requestedSelectedTrackId = effectiveConfigurationId
    ? selectedTrackIdsByConfiguration[effectiveConfigurationId]
    : null;
  const effectiveSelectedTrackId = featureableTracks.some(
    (track) => track.id === requestedSelectedTrackId,
  )
    ? requestedSelectedTrackId ?? null
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
  const setSelectedTrackId = (trackId: string | null) => {
    if (!effectiveConfigurationId) return;
    setSelectedTrackIdsByConfiguration((current) => ({
      ...current,
      [effectiveConfigurationId]: trackId,
    }));
  };
  const selectTrackFromWaveform = (trackId: string) => {
    if (mixId === "learn" && trackId === effectiveSelectedTrackId) {
      setMixId("listen");
      return;
    }

    setSelectedTrackId(trackId);
    if (mixId === "listen") setMixId("learn");
  };

  const partAndMixControls = (
    <section
      className="grid gap-3 border-t-2 bg-card p-3 sm:grid-cols-[minmax(10rem,0.65fr)_minmax(12rem,0.8fr)_minmax(0,1.2fr)] sm:items-end sm:p-4"
      aria-label="Player mix, selected part, and part mode"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="selected-player-mix">Player mix</Label>
        <Select
          items={configurations.map((configuration) => ({
            label: configuration.name,
            value: configuration.id,
          }))}
          value={effectiveConfigurationId}
          disabled={!configurations.length}
          onValueChange={setConfigurationId}
        >
          <SelectTrigger id="selected-player-mix" className="h-11 w-full bg-background">
            <SelectValue placeholder="No player mixes" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {configurations.map((configuration) => (
                <SelectItem key={configuration.id} value={configuration.id}>
                  {configuration.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {manageStemsAction ? <div className="pt-1">{manageStemsAction}</div> : null}
      </div>

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
          <SelectTrigger id="selected-mixer-stem" className="h-11 w-full bg-background">
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
      </div>

      <div className="grid min-w-0 gap-1.5">
        <Label>Part mode</Label>
        <Tabs
          value={mixId}
          onValueChange={(value) => setMixId(value as SongMixerMixId)}
          className="min-w-0 gap-1.5"
        >
          <TabsList className="grid h-auto w-full grid-cols-3">
            {SONG_MIXER_MIXES.map((mix) => (
              <TabsTrigger
                key={mix.id}
                value={mix.id}
                className="min-h-10 px-2 text-xs sm:text-sm"
              >
                {mix.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {canSaveOverrides ? (
        <Accordion defaultValue={[]} className="gap-0 sm:col-span-3">
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
    </section>
  );

  if (!activeTracks.length) {
    return (
      <div>
        {partAndMixControls}
        <section className="grid min-h-48 place-items-center border-t-2 bg-secondary/25 p-6 text-center">
          <div className="grid max-w-md gap-1">
            <p className="font-semibold">No stems in {activeConfiguration?.name ?? "this mix"}</p>
            <p className="text-sm text-muted-foreground">
              {canSaveOverrides
                ? "Open Manage stems, choose Mixes, and add the MP3s this mix should load."
                : "An administrator has not added any available stems to this mix yet."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <SongMixerWaveform
      key={`${effectiveConfigurationId ?? "no-mix"}:${activeTracks
        .map((track) => track.id)
        .join(":")}`}
      tracks={activeTracks}
      settings={settings}
      annotations={annotations}
      partAndMixControls={partAndMixControls}
      mixId={mixId}
      selectedTrackId={effectiveSelectedTrackId}
      onSelectedTrackChange={selectTrackFromWaveform}
      onTrackOverridesChange={canSaveOverrides ? onTrackOverridesChange : undefined}
      canEditAnnotations={canEditAnnotations}
      onCreateAnnotation={onCreateAnnotation}
      onUpdateAnnotation={onUpdateAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
      onImportAnnotations={onImportAnnotations}
      onAnnotationsChange={onAnnotationsChange}
    />
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

function configurationForAddressMix(
  configurations: SongMixerConfiguration[],
  requestedMix: string | undefined,
) {
  const mix = normalizeAddressValue(requestedMix);
  if (!mix) return null;

  const directMatch = configurations.find(
    (configuration) => normalizeAddressValue(configuration.id) === mix,
  );
  if (directMatch) return directMatch;

  if (mix === "voc" || mix === "vocal" || mix === "vocals") {
    return (
      configurations.find(
        (configuration) => configuration.id === DEFAULT_SONG_MIXER_CONFIGURATION_IDS.vocals,
      )
      ?? configurations.find((configuration) => /\bvocals?\b/i.test(configuration.name))
      ?? null
    );
  }

  if (mix === "inst" || mix === "instrument" || mix === "instruments") {
    return (
      configurations.find(
        (configuration) => configuration.id === DEFAULT_SONG_MIXER_CONFIGURATION_IDS.instruments,
      )
      ?? configurations.find((configuration) => /\binstruments?\b/i.test(configuration.name))
      ?? null
    );
  }

  return null;
}

function trackForAddressPart(tracks: SongMixerTrack[], requestedPart: string | undefined) {
  const part = normalizeAddressValue(requestedPart);
  if (!part) return null;

  return (
    tracks.find((track) => track.partSlug === part)
    ?? null
  );
}

function normalizeAddressValue(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") ?? "";
}
