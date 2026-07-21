"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createDefaultSongMixerSettings,
  SONG_MIXER_STATE_NAMES,
  type SongMixerSettings,
  type SongMixerStateName,
  type SongMixerStateOverride,
  type SongMixerStateOverrides,
  type SongMixerTrack,
} from "@/lib/domain";

const STATE_LABELS: Record<SongMixerStateName, string> = {
  featured: "Featured",
  unfeatured: "Unfeatured",
  default: "Default",
  muted: "Muted",
  practice: "Practice part",
  practiceBackground: "Practice backing",
};

type NumericSetting = "volume" | "pan" | "scale";

const NUMERIC_SETTINGS: Array<{
  key: NumericSetting;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "volume", label: "Volume", shortLabel: "Volume", min: 0, max: 100, step: 1 },
  { key: "pan", label: "Pan", shortLabel: "Pan", min: -100, max: 100, step: 1 },
  { key: "scale", label: "Waveform height", shortLabel: "Wave height", min: 0.25, max: 2, step: 0.05 },
];

export function StemMixStateEditor({
  settings,
  tracks,
  selectedTrackId,
  onSelectedTrackChange,
  onSettingsChange,
  onTrackOverridesChange,
}: {
  settings: SongMixerSettings;
  tracks: SongMixerTrack[];
  selectedTrackId: string | null;
  onSelectedTrackChange: (trackId: string | null) => void;
  onSettingsChange: (settings: SongMixerSettings) => void;
  onTrackOverridesChange: (trackId: string, overrides: SongMixerStateOverrides) => void;
}) {
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];

  const updateGlobalNumber = (
    stateName: SongMixerStateName,
    key: NumericSetting,
    value: string,
    min: number,
    max: number,
  ) => {
    if (!value.length) return;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    onSettingsChange({
      states: {
        ...settings.states,
        [stateName]: {
          ...settings.states[stateName],
          [key]: clamp(nextValue, min, max),
        },
      },
    });
  };

  const updateGlobalMuted = (stateName: SongMixerStateName, muted: boolean) => {
    onSettingsChange({
      states: {
        ...settings.states,
        [stateName]: {
          ...settings.states[stateName],
          muted,
        },
      },
    });
  };

  const updateOverride = (
    stateName: SongMixerStateName,
    key: keyof SongMixerStateOverride,
    value: number | boolean | undefined,
  ) => {
    if (!selectedTrack) return;

    const stateOverride = { ...selectedTrack.stateOverrides[stateName] };
    if (value === undefined) {
      delete stateOverride[key];
    } else {
      Object.assign(stateOverride, { [key]: value });
    }

    const nextOverrides = { ...selectedTrack.stateOverrides };
    if (Object.keys(stateOverride).length) {
      nextOverrides[stateName] = stateOverride;
    } else {
      delete nextOverrides[stateName];
    }

    onTrackOverridesChange(selectedTrack.id, nextOverrides);
  };

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="global-mix-states-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid max-w-xl gap-1">
            <h3 id="global-mix-states-heading" className="font-head text-base font-semibold">
              App-wide stem states
            </h3>
            <p className="text-sm text-muted-foreground">
              These values affect every song unless a stem has an override. Pan runs from −100 left to +100 right;
              waveform height is a multiplier, so 2 makes a stem twice as tall as 1.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onSettingsChange(createDefaultSongMixerSettings())}>
            Reset standard values
          </Button>
        </div>

        <StateTable>
          {SONG_MIXER_STATE_NAMES.map((stateName) => (
            <tr key={stateName} className="border-t">
              <StateNameCell stateName={stateName} />
              {NUMERIC_SETTINGS.map(({ key, label, min, max, step }) => (
                <td key={key} className="p-2">
                  <Input
                    type="number"
                    aria-label={`${STATE_LABELS[stateName]} ${label}`}
                    min={min}
                    max={max}
                    step={step}
                    value={settings.states[stateName][key]}
                    onChange={(event) =>
                      updateGlobalNumber(stateName, key, event.currentTarget.value, min, max)
                    }
                    className="w-24 font-mono tabular-nums"
                  />
                </td>
              ))}
              <td className="p-2 text-center">
                <Checkbox
                  aria-label={`${STATE_LABELS[stateName]} muted`}
                  checked={settings.states[stateName].muted}
                  onCheckedChange={(checked) => updateGlobalMuted(stateName, checked)}
                />
              </td>
            </tr>
          ))}
        </StateTable>
      </section>

      <section className="grid gap-3 border-t pt-5" aria-labelledby="stem-overrides-heading">
        <div className="grid gap-1">
          <h3 id="stem-overrides-heading" className="font-head text-base font-semibold">
            Per-stem overrides
          </h3>
          <p className="text-sm text-muted-foreground">
            Leave a numeric field blank—or choose “Use global”—to inherit that state’s global value.
          </p>
        </div>

        {selectedTrack ? (
          <>
            <div className="flex max-w-xl flex-wrap items-end gap-2">
              <div className="grid min-w-64 flex-1 gap-1.5">
                <Label htmlFor="override-stem">Stem</Label>
                <Select
                  items={tracks.map((track) => ({ label: track.displayName, value: track.id }))}
                  value={selectedTrack.id}
                  onValueChange={onSelectedTrackChange}
                >
                  <SelectTrigger id="override-stem" className="h-10 w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {tracks.map((track) => (
                        <SelectItem key={track.id} value={track.id}>
                          {track.displayName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!Object.keys(selectedTrack.stateOverrides).length}
                onClick={() => onTrackOverridesChange(selectedTrack.id, {})}
              >
                Clear this stem
              </Button>
            </div>

            <StateTable>
              {SONG_MIXER_STATE_NAMES.map((stateName) => {
                const override = selectedTrack.stateOverrides[stateName] ?? {};

                return (
                  <tr key={stateName} className="border-t">
                    <StateNameCell stateName={stateName} />
                    {NUMERIC_SETTINGS.map(({ key, label, min, max, step }) => (
                      <td key={key} className="p-2">
                        <Input
                          type="number"
                          aria-label={`${selectedTrack.displayName} ${STATE_LABELS[stateName]} ${label} override`}
                          min={min}
                          max={max}
                          step={step}
                          value={override[key] ?? ""}
                          placeholder={String(settings.states[stateName][key])}
                          onChange={(event) => {
                            const rawValue = event.currentTarget.value;
                            const numericValue = Number(rawValue);
                            updateOverride(
                              stateName,
                              key,
                              rawValue.length && Number.isFinite(numericValue)
                                ? clamp(numericValue, min, max)
                                : undefined,
                            );
                          }}
                          className="w-24 font-mono tabular-nums placeholder:text-muted-foreground/65"
                        />
                      </td>
                    ))}
                    <td className="p-2">
                      <Select
                        items={[
                          {
                            label: `Use global (${settings.states[stateName].muted ? "Muted" : "Audible"})`,
                            value: "inherit",
                          },
                          { label: "Muted", value: "true" },
                          { label: "Audible", value: "false" },
                        ]}
                        value={
                          override.muted === undefined ? "inherit" : override.muted ? "true" : "false"
                        }
                        onValueChange={(value) =>
                          updateOverride(
                            stateName,
                            "muted",
                            value === "inherit" ? undefined : value === "true",
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label={`${selectedTrack.displayName} ${STATE_LABELS[stateName]} mute override`}
                          className="w-36 bg-background"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="inherit">
                              Use global ({settings.states[stateName].muted ? "Muted" : "Audible"})
                            </SelectItem>
                            <SelectItem value="true">Muted</SelectItem>
                            <SelectItem value="false">Audible</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </StateTable>
          </>
        ) : (
          <p className="rounded-md border bg-muted/45 p-3 text-sm text-muted-foreground">
            Upload a stem before adding an override.
          </p>
        )}
      </section>
    </div>
  );
}

function StateTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-[650px] w-full border-collapse text-sm">
        <thead className="bg-secondary/70 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-28 p-2 font-semibold">
              State
            </th>
            {NUMERIC_SETTINGS.map(({ key, shortLabel }) => (
              <th key={key} scope="col" className="p-2 font-semibold">
                {shortLabel}
              </th>
            ))}
            <th scope="col" className="p-2 font-semibold">
              Mute
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StateNameCell({ stateName }: { stateName: SongMixerStateName }) {
  return (
    <th scope="row" className="p-2 text-left font-semibold">
      {STATE_LABELS[stateName]}
    </th>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
