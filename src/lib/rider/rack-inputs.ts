import { stageBoxPatch, type Plot } from "./model";

export type RackInput = { number: number; source: string; socket: string };
export function rackInputs(plot: Plot): RackInput[] {
  return stageBoxPatch(plot)
    .filter(({ input }) => input.number <= 16)
    .map(({ input, box, channel }) => ({
      number: input.number,
      source: input.source,
      socket: box
        ? (/^upstage box$/i.test(box.label)
            ? "U"
            : /^stage left box$/i.test(box.label)
              ? "L"
              : box.label) +
          "·" +
          channel
        : "Unassigned",
    }));
}

// Public design template. Saved rider packets always read their own revision's input key.
export const standardInputs: RackInput[] = [
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
