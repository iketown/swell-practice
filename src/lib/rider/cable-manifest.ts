import { pointFor, replaceRuns, type Gear, type Plot } from "./model";

type Run = Plot["cables"][number];
export const cableTypes = [
  "Instrument cable",
  "XLR cable",
  "Audio cable",
  "Power cable",
  "Speaker cable",
  "Ethernet cable",
  "MIDI cable",
];
export const isCableAllocation = (g: Gear) =>
  g.createdForCable || /cable|lead|snake|loom|trunk/i.test(g.item);

export function cableName(p: Plot, run: Pick<Run, "fromId" | "toId">) {
  return [run.fromId, run.toId]
    .map((id) => pointFor(p, id)?.label ?? "")
    .join(" → ");
}

function cableSpec(value: string) {
  const clean = value.trim();
  const feet = /^(\d+(?:\.\d+)?)\s*(?:ft\.?|feet|foot|['′’])?$/i.exec(clean);
  if (!feet) return clean;
  if (Number(feet[1]) <= 0)
    throw Error("Enter a cable length greater than zero.");
  return Number(feet[1]) + " ft";
}

function sourcePlan(p: Plot, inputIds: string[], item: string, spec: string) {
  if (!inputIds.length) return;
  const match = p.gear.filter(
    (g) =>
      g.item.toLowerCase() === item.toLowerCase() &&
      g.sourceIds.length === inputIds.length &&
      inputIds.every((id) => g.sourceIds.includes(id)) &&
      (!g.spec || g.spec.toLowerCase() === spec.toLowerCase()) &&
      !p.cables.some((c) => c.gearId === g.id),
  );
  if (match.length === 1) return match[0];
}

type CableRequest = Pick<Run, "id" | "fromId" | "toId" | "nodeIds"> & {
  item: string;
  spec: string;
  allocationId?: string;
};
export function saveCable(p: Plot, request: CableRequest): Plot {
  const { id, fromId, toId, nodeIds } = request;
  if (!fromId || !toId || fromId === toId)
    throw Error("Choose two different endpoints.");
  const item = request.item.trim();
  if (!item) throw Error("Enter a cable type.");
  const spec = cableSpec(request.spec);
  const previous = p.cables.find((c) => c.id === id);
  const allocationId = previous?.gearId ?? request.allocationId;
  const inputs = p.inputs.filter((i) => i.id === fromId || i.id === toId);
  const sourceIds = inputs.map((i) => i.id);
  const original = allocationId
    ? p.gear.find((g) => g.id === allocationId)
    : sourcePlan(p, sourceIds, item, spec);
  if (allocationId && !original)
    throw Error("This equipment entry is no longer available.");
  const otherRuns = p.cables.filter(
    (c) => c.gearId === original?.id && c.id !== id,
  );
  if (original?.quantity != null && otherRuns.length >= original.quantity)
    throw Error("All cables from this equipment entry already have a run.");

  const shared =
    !!original && ((original.quantity ?? 0) > 1 || otherRuns.length > 0);
  const changedSpec =
    !!original && (item !== original.item || spec !== original.spec);
  // Changing one cable in a pooled allocation keeps its siblings' lengths and quantities.
  const split = shared && changedSpec;
  let gear = p.gear;
  if (split && original?.quantity != null) {
    const remaining = original.quantity - 1;
    gear = gear.map((g) =>
      g.id === original.id
        ? { ...g, quantity: remaining, createdForCable: false }
        : g,
    );
  }
  let entry = original;
  if (!shared || split) {
    const station = [...new Set(inputs.map((i) => i.station))].join(", ");
    const endpointChanged =
      previous && (previous.fromId !== fromId || previous.toId !== toId);
    const notes = original?.notes ?? "";
    const importedNote =
      /^Original Instrument cable value: "[^"]+"\. Confirm meaning, quantity, connectors at both ends, length and units\.$/.test(
        notes,
      ) ||
      notes ===
        "Planning placeholder. Confirm signal path, cable segments, connectors, quantities and lengths; do not infer one cable per input.";
    entry = {
      ...(original && !split ? original : {}),
      id: original && !split ? original.id : crypto.randomUUID(),
      ...(original?.createdForCable || !original || split
        ? { createdForCable: true }
        : {}),
      item,
      spec,
      quantity: 1,
      required: true,
      provider: original?.provider ?? "To confirm",
      confirmed: !!original?.confirmed && !changedSpec,
      station: station || original?.station || "",
      sourceIds:
        sourceIds.length || (original?.createdForCable && endpointChanged)
          ? sourceIds
          : (original?.sourceIds ?? []),
      notes: importedNote ? "" : notes,
    };
    gear =
      original && !split
        ? gear.map((g) => (g.id === original.id ? entry! : g))
        : [...gear, entry];
  }
  const run: Run = { id, fromId, toId, nodeIds, gearId: entry!.id };
  const cables = previous
    ? p.cables.map((c) => (c.id === id ? run : c))
    : [...p.cables, run];
  return replaceRuns({ ...p, gear }, cables);
}
