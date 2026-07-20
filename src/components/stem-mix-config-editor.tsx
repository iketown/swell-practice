"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyPlusIcon,
  FileAudioIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SongMixerConfiguration, SongMixerTrack } from "@/lib/domain";

export function StemMixConfigEditor({
  configurations,
  tracks,
  onChange,
}: {
  configurations: SongMixerConfiguration[];
  tracks: SongMixerTrack[];
  onChange: (configurations: SongMixerConfiguration[]) => void;
}) {
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(
    configurations[0]?.id ?? null,
  );
  const effectiveSelectedConfigurationId = configurations.some(
    (configuration) => configuration.id === selectedConfigurationId,
  )
    ? selectedConfigurationId
    : configurations[0]?.id ?? null;
  const selectedConfiguration =
    configurations.find(
      (configuration) => configuration.id === effectiveSelectedConfigurationId,
    ) ?? null;
  const selectedTrackIds = useMemo(
    () => new Set(selectedConfiguration?.trackIds ?? []),
    [selectedConfiguration?.trackIds],
  );
  const normalizedNames = configurations.map((configuration) =>
    configuration.name.trim().toLocaleLowerCase(),
  );
  const hasDuplicateNames =
    normalizedNames.filter(Boolean).length !== new Set(normalizedNames.filter(Boolean)).size;

  const updateSelectedConfiguration = (
    update: (configuration: SongMixerConfiguration) => SongMixerConfiguration,
  ) => {
    if (!effectiveSelectedConfigurationId) return;
    onChange(
      configurations.map((configuration) =>
        configuration.id === effectiveSelectedConfigurationId
          ? update(configuration)
          : configuration,
      ),
    );
  };

  const addMix = () => {
    const id = `mix-${crypto.randomUUID()}`;
    onChange([
      ...configurations,
      {
        id,
        name: nextMixName(configurations),
        trackIds: [],
        orderIndex: configurations.length,
      },
    ]);
    setSelectedConfigurationId(id);
  };

  const removeSelectedMix = () => {
    if (!selectedConfiguration || configurations.length <= 1) return;
    const selectedIndex = configurations.findIndex(
      (configuration) => configuration.id === selectedConfiguration.id,
    );
    const nextConfigurations = configurations
      .filter((configuration) => configuration.id !== selectedConfiguration.id)
      .map((configuration, orderIndex) => ({ ...configuration, orderIndex }));
    onChange(nextConfigurations);
    setSelectedConfigurationId(
      nextConfigurations[Math.min(selectedIndex, nextConfigurations.length - 1)]?.id ?? null,
    );
  };

  const moveSelectedMix = (direction: -1 | 1) => {
    if (!selectedConfiguration) return;
    const sourceIndex = configurations.findIndex(
      (configuration) => configuration.id === selectedConfiguration.id,
    );
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= configurations.length) return;

    const nextConfigurations = [...configurations];
    const [moved] = nextConfigurations.splice(sourceIndex, 1);
    if (!moved) return;
    nextConfigurations.splice(targetIndex, 0, moved);
    onChange(
      nextConfigurations.map((configuration, orderIndex) => ({
        ...configuration,
        orderIndex,
      })),
    );
  };

  const setTrackIncluded = (trackId: string, included: boolean) => {
    updateSelectedConfiguration((configuration) => {
      const nextTrackIds = new Set(configuration.trackIds);
      if (included) nextTrackIds.add(trackId);
      else nextTrackIds.delete(trackId);

      return {
        ...configuration,
        trackIds: tracks.flatMap((track) => (nextTrackIds.has(track.id) ? [track.id] : [])),
      };
    });
  };

  if (!selectedConfiguration) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">This song does not have a player mix yet.</p>
        <Button type="button" size="sm" onClick={addMix}>
          <CopyPlusIcon data-icon="inline-start" />
          Create mix
        </Button>
      </div>
    );
  }

  const selectedIndex = configurations.findIndex(
    (configuration) => configuration.id === selectedConfiguration.id,
  );
  const nameIsEmpty = !selectedConfiguration.name.trim();
  const nameIsDuplicate =
    !nameIsEmpty
    && normalizedNames.filter(
      (name) => name === selectedConfiguration.name.trim().toLocaleLowerCase(),
    ).length > 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="stem-mix-selector">Mix to edit</FieldLabel>
          <Select
            items={configurations.map((configuration) => ({
              label: configuration.name || "Untitled Mix",
              value: configuration.id,
            }))}
            value={effectiveSelectedConfigurationId}
            onValueChange={setSelectedConfigurationId}
          >
            <SelectTrigger id="stem-mix-selector" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {configurations.map((configuration) => (
                  <SelectItem key={configuration.id} value={configuration.id}>
                    {configuration.name || "Untitled Mix"}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Button type="button" variant="outline" size="sm" onClick={addMix}>
          <CopyPlusIcon data-icon="inline-start" />
          New mix
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Move ${selectedConfiguration.name || "mix"} up`}
          disabled={selectedIndex === 0}
          onClick={() => moveSelectedMix(-1)}
        >
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Move ${selectedConfiguration.name || "mix"} down`}
          disabled={selectedIndex === configurations.length - 1}
          onClick={() => moveSelectedMix(1)}
        >
          <ArrowDownIcon aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Remove ${selectedConfiguration.name || "mix"}`}
          disabled={configurations.length <= 1}
          onClick={removeSelectedMix}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>

      <Field data-invalid={nameIsEmpty || nameIsDuplicate}>
        <FieldLabel htmlFor={`stem-mix-name-${selectedConfiguration.id}`}>Mix name</FieldLabel>
        <Input
          id={`stem-mix-name-${selectedConfiguration.id}`}
          value={selectedConfiguration.name}
          aria-invalid={nameIsEmpty || nameIsDuplicate}
          onChange={(event) =>
            updateSelectedConfiguration((configuration) => ({
              ...configuration,
              name: event.target.value,
            }))
          }
        />
        {nameIsEmpty ? <FieldError>Enter a name for this mix.</FieldError> : null}
        {nameIsDuplicate ? <FieldError>Mix names must be unique.</FieldError> : null}
      </Field>

      <FieldSet>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <FieldLegend>Stems in this mix</FieldLegend>
            <FieldDescription>
              Only these MP3s load when a member chooses {selectedConfiguration.name || "this mix"}.
            </FieldDescription>
          </div>
          <Badge variant="secondary">
            {selectedTrackIds.size} stem{selectedTrackIds.size === 1 ? "" : "s"}
          </Badge>
        </div>

        <FieldGroup data-slot="checkbox-group" className="gap-2">
          {tracks.map((track) => {
            const checked = selectedTrackIds.has(track.id);
            const disabled = !track.shown;

            return (
              <Field
                key={track.id}
                orientation="horizontal"
                data-disabled={disabled}
                className="rounded-md border bg-card px-3 py-2.5"
              >
                <Checkbox
                  id={`mix-${selectedConfiguration.id}-track-${track.id}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) =>
                    setTrackIncluded(track.id, nextChecked)
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor={`mix-${selectedConfiguration.id}-track-${track.id}`}>
                    <FileAudioIcon className="size-4 text-primary" aria-hidden />
                    {track.displayName}
                  </FieldLabel>
                  <FieldDescription>
                    {track.isBackgroundMix ? "Background premix" : "Selectable part"}
                    {disabled ? " · Hidden on the Stems tab" : ""}
                  </FieldDescription>
                </FieldContent>
              </Field>
            );
          })}
        </FieldGroup>
      </FieldSet>

      {hasDuplicateNames ? (
        <p className="text-sm text-destructive">
          Give every mix a unique name before saving.
        </p>
      ) : null}
    </div>
  );
}

function nextMixName(configurations: SongMixerConfiguration[]) {
  const existingNames = new Set(
    configurations.map((configuration) => configuration.name.trim().toLocaleLowerCase()),
  );
  let suffix = configurations.length + 1;
  let candidate = `Mix ${suffix}`;

  while (existingNames.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `Mix ${suffix}`;
  }

  return candidate;
}
