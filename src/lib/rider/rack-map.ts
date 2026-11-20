import { z } from "zod";
import type { Gear, Plot } from "./model";

export const rackTableXlr = "Balanced XLR female to XLR male, approx. 10 ft";

const port = z.number().int().min(3).max(8);
const housePort = port.min(5);
export const standardS16Inputs = Array.from({ length: 16 }, (_, index) => index + 1);
export const standardWirelessInputs = [1, 2];
const fivePairs = [1, 2, 3, 4, 5];
const sixPairs = [...fivePairs, 6];
export function earPairOptions(map: RackMap) {
  return map.housePorts.length === 4 ? sixPairs : fivePairs;
}
function portOrder(size: number) {
  return z.array(z.number().int().min(1).max(size)).length(size)
    .refine(ports => new Set(ports).size === size, "Assign each port once.").optional();
}
export const rackMapSchema = z.object({
  layout: z.enum(["s16-v1", "s16-v2"]),
  // Index is the split / console channel minus one. Presence enables the patch sheets.
  s16Inputs: portOrder(16),
  wirelessInputs: portOrder(2),
  playbackOrder: z.literal("house-first").optional(),
  earPairs: z.union([portOrder(5), portOrder(6)]),
  housePorts: z.union([z.tuple([port, port, port]), z.tuple([housePort, housePort, housePort, housePort])])
    .refine(
      (ports) => new Set(ports).size === ports.length,
      "Give each playback stem a separate XLR output.",
    ),
}).refine(map => !map.earPairs || map.earPairs.length === map.housePorts.length + 2, "Match the stereo pairs to the output configuration.");
export type RackMap = z.infer<typeof rackMapSchema>;
export const standardRackMap: RackMap = {
  layout: "s16-v2",
  housePorts: [5, 6, 7, 8],
  playbackOrder: "house-first",
  s16Inputs: standardS16Inputs,
};
const playbackStems = [
  { label: "Percussion", source: "Percussion playback", usb: 2, channel: 30, foh: 19 },
  { label: "Instrument", source: "Instrument playback", usb: 3, channel: 31, foh: 20 },
  { label: "Vocal", source: "Vocal playback", usb: 4, channel: 32, foh: 21 },
  { label: "Extras", source: "Extras", usb: 5, channel: 28, foh: 22 },
] as const;

export function housePlayback(map: RackMap) {
  return map.housePorts.map((port, i) => ({
    ...playbackStems[i],
    channel: map.playbackOrder === "house-first" ? 28 + i : playbackStems[i].channel,
    port,
  }));
}

export function playbackChannels(map: RackMap) {
  const click = { label: "Click", usb: 1, channel: map.playbackOrder === "house-first" ? 32 : 29, port: null, foh: null };
  return [...housePlayback(map), click].sort((a, b) => a.channel - b.channel);
}

export function splitHouseChannel(input: Plot["inputs"][number]) {
  return input.foh.trim() || String(input.number);
}

export function earRoutes(map: RackMap) {
  const pairs = map.earPairs ?? earPairOptions(map);
  return pairs.map((pair, i) => ({
    name: ["Joe", "Chris", "Brian", "Jackson", "Sam", "Extra"][i],
    tx: i + 1,
    bus: 2 * i + 1,
    device: pair >= 5 ? "X32" : "S16",
    out: pair >= 5 ? (pair - 5) * 2 + 1 : 2 * pair - 1,
  }));
}

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

export function wirelessPort(map: RackMap, receiver: number) {
  const port = map.wirelessInputs?.[receiver - 1] ?? receiver;
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
          ? (row.spec === rackTableXlr ? rackTableXlr : "Balanced XLR female to XLR male")
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
  const sameWireless = p.rackMap?.layout === map.layout && standardWirelessInputs.every((n, i) =>
    (p.rackMap?.wirelessInputs?.[i] ?? n) === (map.wirelessInputs?.[i] ?? n));
  const patched = sameWireless ? { ...p, rackMap: map } : patchWireless(p, map);
  const sameEars = p.rackMap && p.rackMap.housePorts.length === map.housePorts.length && earPairOptions(map).every((n,i) => (p.rackMap?.earPairs?.[i] ?? n) === (map.earPairs?.[i] ?? n));
  if (sameEars) return patched;
  const ears = earRoutes(map);
  const monitors = ears.length + " independent stereo IEM mixes. " + ears.map(m => `${m.device} OUT ${m.out}/${m.out + 1} → TX${m.tx} ${m.name}`).join(" · ") + (ears.length === 6 ? ". TX6 Extra feeds its matched guest bodypack." : ". TX6 spare.");
  const gear = patched.gear.map((row) => {
    const lead = /^wl-iem-lead-(\d+)$/.exec(row.id);
    if (lead) {
      const side = Number(lead[1]) - 1;
      const mix = ears[Math.floor(side / 2)];
      if (mix)
        return {
          ...row,
          spec: row.spec === rackTableXlr ? rackTableXlr : "Balanced XLR female to XLR male",
          notes: `${mix.name} bus ${side + 1} → ${mix.device} XLR Out ${mix.out + (side % 2)} → IEM TX ${mix.tx} ${side % 2 ? "R" : "L"}.`,
        };
    }
    return row;
  });
  if (p.rackMap) return { ...patched, gear, monitors };
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
      map.housePorts.length,
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
    monitors,
  };
}
