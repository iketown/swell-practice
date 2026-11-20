import { stageBoxPatch, type Plot } from "./model";
import { wirelessPort, type RackMap } from "./rack-map";

export function boxCode(label: string) {
  if (/^upstage(?: box)?$/i.test(label.trim())) return "U";
  if (/^stage[ -]left(?: box)?$/i.test(label.trim())) return "L";
  return null;
}

export type RackInput = ReturnType<typeof rackInputs>[number];
export function rackInputs(plot: Plot, map = plot.rackMap) {
  return stageBoxPatch(plot)
    .filter(({ input }) => input.number <= 16)
    .map(({ input, box, channel }) => ({
      number: input.number,
      source: input.source,
      boxId: box?.id,
      boxName: box?.label,
      channel,
      socket: box ? (boxCode(box.label) ?? box.label) + "·" + channel : "Unassigned",
      s16: map?.s16Inputs?.[input.number - 1] ?? input.number,
    }));
}

export function wirelessRoutes(plot: Plot, map: RackMap) {
  return [1, 2].map(port => {
    const channel = 16 + port;
    const source = plot.inputs.find(input => input.number === channel)?.source ?? "Wireless vocal";
    return { channel, port: map.wirelessInputs?.[port - 1] ?? port, source, input: wirelessPort(map, port) };
  });
}

// Public design template. Saved rider packets always read their own revision's input key.
export const standardInputs = [
  ["Joe vocal", "U·1"],
  ["Chris wired vocal backup", "U·2"],
  ["Brian wired vocal backup", "L·1"],
  ["Jackson vocal", "L·2"],
  ["Sam vocal", "U·3"],
  ["Cello", "U·4"],
  ["Joe electric guitar", "U·5"],
  ["Joe acoustic guitar", "U·6"],
  ["Nord A", "U·7"],
  ["Nord B", "U·8"],
  ["Bass", "U·9"],
  ["Jackson electric guitar", "L·3"],
  ["Sax", "L·4"],
  ["Kick", "U·10"],
  ["Hi-hat / snare", "U·11"],
  ["Overhead", "U·12"],
].map(([source, socket], i) => ({ number: i + 1, source, socket }));
