import { riserDimensions } from "./placement";
import artwork from "./assets.json";
import type { Plot, PlotObject } from "./model";

const people = new Set(["joe", "chris", "brian", "jackson"]);
export function isEquipmentObject(o: PlotObject) {
  return (
    o.asset !== "label" &&
    (o.asset === "sam" || (o.layer !== "people" && !people.has(o.asset)))
  );
}

// The original import has stable object/allocation identities. Reuse those requirements.
const importedLinks: Record<string, string[]> = {
  sax: ["EQ-051", "EQ-052"],
  cello: ["EQ-016", "EQ-017"],
  acoustic: ["EQ-041", "EQ-042"],
  telecaster: ["EQ-021", "EQ-022"],
  bass: ["EQ-036", "EQ-037"],
  sam: ["EQ-056"],
  nord: ["nord-backline", "nord-stand"],
  "mic-joe": ["EQ-002"],
  "mic-chris": ["EQ-005"],
  "mic-brian": ["EQ-008"],
  "mic-jackson": ["EQ-011"],
  "mic-sam": ["EQ-014"],
  "ac-joe": ["power-joe"],
  "ac-chris": ["power-chris"],
  "ac-brian": ["power-brian"],
  "ac-jackson": ["power-jackson"],
};

export function linkedEquipment(p: Plot, pointId: string) {
  const person = p.objects.find(
    (o) => o.id === pointId && !isEquipmentObject(o),
  );
  const station =
    person?.asset === "label"
      ? p.objects.find((o) => "name-" + o.id === person.id)?.label
      : person?.label;
  return p.gear.filter(
    (g) =>
      g.plotIds?.includes(pointId) ||
      g.sourceIds.includes(pointId) ||
      (!!station && g.station.toLowerCase() === station.toLowerCase()),
  );
}

export function reconcileEquipment(p: Plot): Plot {
  let gear = [...p.gear];
  const usedIds = new Set(
    [
      ...p.objects,
      ...p.stageBoxes,
      ...p.inputs,
      ...p.gear,
      ...p.cables,
      ...p.cableNodes,
    ].map((point) => point.id),
  );
  const assets: Record<string, { label: string }> = artwork;
  const points = [
    ...p.objects.filter(isEquipmentObject).map((o) => ({
      id: o.id,
      asset: o.asset,
      label: o.asset === "sam" ? "Drum kit" : o.label,
      station: "",
      spec: o.asset === "stage-riser" ? riserDimensions(o) :
        assets[o.asset]?.label === o.label
          ? ""
          : (assets[o.asset]?.label ?? ""),
    })),
    ...p.stageBoxes.map((b) => ({
      id: b.id,
      asset: "",
      label: "Stage box · " + b.label,
      spec: "",
      station: "",
    })),
  ];
  gear = gear.map((g) => {
    const point =
      g.createdForPlot &&
      g.plotIds?.length === 1 &&
      points.find((point) => point.id === g.plotIds![0]);
    if (!point) return g;
    return { ...g, item: point.label, ...(point.asset === "stage-riser" ? { spec: point.spec } : {}) };
  });
  for (const point of points) {
    if (gear.some((g) => g.plotIds?.includes(point.id))) continue;
    const imported = importedLinks[point.id] ?? [];
    let reused = false;
    for (let index = 0; index < gear.length; index++) {
      const g = gear[index];
      if (imported.includes(g.id) && !g.plotIds?.length) {
        gear[index] = { ...g, plotIds: [point.id] };
        reused = true;
      }
    }
    if (reused) continue;
    const base = "plot-gear-" + point.id.slice(0, 70);
    let id = base,
      suffix = 1;
    while (usedIds.has(id)) id = base + "-" + suffix++;
    usedIds.add(id);
    gear.push({
      id,
      item: point.label,
      spec: point.spec,
      quantity: 1,
      provider: "To confirm",
      station: point.station,
      sourceIds: [],
      plotIds: [point.id],
      createdForPlot: true,
      required: true,
      confirmed: false,
      notes: "",
    });
  }
  for (const input of p.inputs) {
    if (gear.some((g) => g.sourceIds.includes(input.id))) continue;
    const base = "input-gear-" + input.id.slice(0, 70);
    let id = base,
      suffix = 1;
    while (usedIds.has(id)) id = base + "-" + suffix++;
    usedIds.add(id);
    gear.push({
      id,
      item:
        input.kind === "DI"
          ? "DI box / channels"
          : input.kind === "Mic"
            ? "Microphone"
            : "Line connection",
      spec: "",
      quantity: null,
      provider: "To confirm",
      station: input.station,
      sourceIds: [input.id],
      plotIds: [],
      createdForPlot: true,
      required: true,
      confirmed: false,
      notes: "Connection requirements for " + input.source + " to confirm.",
    });
  }
  return { ...p, gear };
}

export function allocationPoints(p: Plot, ids: string[]) {
  const entries = p.gear.filter((g) => ids.includes(g.id));
  const runs = p.cables.filter((c) => ids.includes(c.gearId));
  return [
    ...new Set([
      ...entries.flatMap((g) => [...g.sourceIds, ...(g.plotIds ?? [])]),
      ...runs.flatMap((c) => [c.fromId, c.toId]),
    ]),
  ];
}
