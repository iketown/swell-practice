import { z } from "zod";
import type { Gear, Plot } from "./model";

const port = z.number().int().min(3).max(8);
export const rackMapSchema = z.object({
  layout: z.enum(["s16-v1", "s16-v2"]),
  housePorts: z
    .tuple([port, port, port])
    .refine(
      (ports) => new Set(ports).size === 3,
      "Give each playback stem a separate XLR output.",
    ),
});
export type RackMap = z.infer<typeof rackMapSchema>;
export const standardRackMap: RackMap = {
  layout: "s16-v2",
  housePorts: [3, 4, 5],
};
export const stems = ["Perc", "Inst", "Vox"] as const;
export const ears = ["Joe", "Chris", "Brian", "Jackson", "Sam"].map(
  (name, i) => ({
    name,
    tx: i + 1,
    bus: 2 * i + 1,
    device: i === 4 ? "X32" : "S16",
    out: i === 4 ? 1 : 2 * i + 1,
  }),
);

export function supportsRackMap(p: Plot) {
  return (
    p.inputs.length === 18 &&
    Array.from({ length: 16 }, (_, i) => i + 1).every((n) =>
      p.inputs.some((input) => input.number === n),
    ) &&
    [17, 18].every((n) =>
      p.inputs.some(
        (input) => input.number === n && input.id === "wl-vocal-" + n,
      ),
    )
  );
}

export function wirelessPort(map: RackMap, port: number) {
  return map.layout === "s16-v2" ? `XLR IN ${port}` : `AUX IN ${port}`;
}

function patchWireless(p: Plot, map: RackMap): Plot {
  const local = map.layout === "s16-v2";
  return {
    ...p,
    rackMap: map,
    gear: p.gear.map((row) => {
      const receiver = /^wl-mic-lead-([12])$/.exec(row.id);
      if (!receiver) return row;
      const port = Number(receiver[1]);
      return {
        ...row,
        spec: local
          ? "Balanced XLR female to XLR male"
          : "Balanced XLR female to ¼-inch TRS male",
        notes: `Band split tail ${16 + port} → X32 Rack ${wirelessPort(map, port)} → CH ${16 + port}. Phantom off. Match the receiver output level at soundcheck.`,
      };
    }),
    inputs: p.inputs.map((input) =>
      input.number < 17
        ? input
        : {
            ...input,
            patch: `Receiver XLR → split ${input.number} → house tail and X32 Rack ${wirelessPort(map, input.number - 16)} → CH ${input.number}.`,
            phantom: "Off",
          },
    ),
  };
}

// Apply the physical patch to the selected working revision only. Keep the existing allocations and suppliers.
export function applyRackMap(p: Plot, map: RackMap): Plot {
  if (!supportsRackMap(p))
    throw Error(
      "This guide requires the 16 wired inputs and Brian / Chris wireless channels 17 and 18.",
    );
  if (p.rackMap?.layout === map.layout) return { ...p, rackMap: map };
  const patched = patchWireless(p, map);
  if (p.rackMap) return patched;
  const gear = patched.gear.map((row) => {
    const lead = /^wl-iem-lead-(\d+)$/.exec(row.id);
    if (lead) {
      const side = Number(lead[1]) - 1;
      const mix = ears[Math.floor(side / 2)];
      if (mix)
        return {
          ...row,
          spec: "Balanced XLR female to XLR male",
          notes: `${mix.name} bus ${side + 1} → ${mix.device} XLR Out ${mix.out + (side % 2)} → IEM TX ${mix.tx} ${side % 2 ? "R" : "L"}. Confirm cable supplier and length.`,
        };
    }
    return row;
  });
  const extra = (
    id: string,
    item: string,
    spec: string,
    quantity = 1,
  ): Gear => ({
    id,
    item,
    spec,
    provider: "To confirm",
    station: "Stage-left rack",
    sourceIds: [],
    quantity,
    required: true,
    confirmed: false,
    notes: "",
  });
  gear.push(
    extra(
      "rack-map-s16",
      "Behringer S16",
      "16 inputs / 8 XLR outputs at the stage-left monitor rack",
    ),
    extra(
      "rack-map-split",
      "Analog splitter with tails",
      "At least 18 channels, labeled house and monitor tails; support mic and receiver line levels",
    ),
    extra(
      "rack-map-rx-patch",
      "Audio cable",
      "Balanced XLR from wireless receiver to analog split 17 or 18",
      2,
    ),
    extra(
      "rack-map-stems",
      "Audio cable",
      "Balanced XLR from monitor rack to house playback line input",
      3,
    ),
    extra(
      "rack-map-aes",
      "AES50 cable",
      "Shielded Cat5e etherCON, S16 AES50 A to X32 Rack AES50 A",
    ),
  );
  return {
    ...patched,
    gear,
    monitors:
      "Five independent stereo IEM mixes. S16 XLR Out 1–8 → TX1–4. X32 Rack XLR Out 1/2 → TX5 Sam. TX6 spare. See the stage-left rack channel guide for the analog split, wireless receivers and playback handoff.",
  };
}
