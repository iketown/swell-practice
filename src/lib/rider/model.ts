import { z } from "zod";
import artwork from "./assets.json";
import { objectAnchor } from "./placement";
import { reconcileEquipment } from "./equipment";
import { boxColors, boxFrame } from "./stage-box";

export const catalog: Record<
  string,
  { label: string; w: number; h: number; opacity: number }
> = artwork;
export const providers = [
  "To confirm",
  "The Swell",
  "Venue production",
  "Backline",
] as const;
const id = z.string().min(1).max(90);
const name = z.string().trim().min(1).max(150);
const detail = z.string().max(1400);
const position = {
  x: z.number().min(-2).max(150),
  y: z.number().min(-2).max(100),
};
const object = z.object({
  id,
  label: name,
  layer: z.enum(["people", "stands", "equipment"]).optional(),
  standId: id.optional(),
  placement: z.object({
    // Local offsets in physical feet, independent of artwork scaling.
    x: z.number().min(0).max(60),
    y: z.number().min(0).max(60),
  }).optional(),
  asset: z
    .string()
    .refine(
      (key) =>
        key === "label" ||
        key === "symbol" ||
        Object.hasOwn(catalog, key) ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,180000}$/.test(
          key,
        ),
    ),
  ...position,
  w: z.number().min(0.15).max(60),
  h: z.number().min(0.15).max(60),
  opacity: z.number().min(0.05).max(1),
});
const input = z.object({
  id,
  number: z.number().int().min(1).max(999),
  source: name,
  station: name,
  kind: z.enum(["Mic", "DI", "Line"]),
  stageBoxId: id.nullable().default(null),
  foh: z.string().max(60),
  patch: detail,
  phantom: z.string().max(70),
  notes: detail,
  ...position,
});
const allocation = z.object({
  id,
  createdForCable: z.boolean().optional(),
  createdForPlot: z.boolean().optional(),
  plotIds: z.array(id).max(300).optional(),
  item: name,
  spec: z.string().max(180),
  quantity: z.number().int().positive().max(999).nullable(),
  provider: z.enum(providers),
  sourceIds: z.array(id).max(128),
  station: z.string().max(150),
  required: z.boolean(),
  confirmed: z.boolean().default(false),
  notes: detail,
});
const rawPlotSchema = z
  .object({
    width: z.number().min(6).max(120),
    depth: z.number().min(6).max(90),
    configuration: name,
    contact: detail,
    monitors: detail,
    power: detail,
    objects: z.array(object).max(300),
    stageBoxes: z
      .array(
        z.object({
          id,
          label: z.string().trim().min(1).max(30),
          color: z.enum(
            Object.keys(boxColors) as [
              keyof typeof boxColors,
              ...(keyof typeof boxColors)[],
            ],
          ),
          x: z.number().min(-5).max(150),
          y: z.number().min(-3).max(100),
        }),
      )
      .max(128)
      .default([]),
    inputs: z.array(input).max(128),
    gear: z.array(allocation).max(650),
    cableNodes: z
      .array(
        z.object({
          id,
          diagonal: z.boolean().optional(),
          x: z.number().min(-5).max(150),
          y: z.number().min(-3).max(100),
        }),
      )
      .max(4000)
      .default([]),
    cables: z
      .array(
        z.object({
          id,
          gearId: id,
          fromId: id,
          toId: id,
          nodeIds: z.array(id).max(128).default([]),
        }),
      )
      .max(500),
  })
  .superRefine((p, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const standIds = p.objects.flatMap((o) => o.standId ? [o.standId] : []);
    if (new Set(standIds).size !== standIds.length) problem("Each instrument needs its own stand.");
    for (const o of p.objects) if (o.standId && !p.objects.some((s) => s.id === o.standId && s.id !== o.id && s.asset === "hercules-gs414b-plus" && !s.standId)) problem("An instrument refers to a missing or invalid stand.");
    const inputIds = new Set(p.inputs.map((i) => i.id));
    const boxIds = new Set(p.stageBoxes.map((b) => b.id));
    const points = new Set([
      ...inputIds,
      ...boxIds,
      ...p.objects.map((o) => o.id),
    ]);
    if (
      p.inputs.some((i) => i.stageBoxId !== null && !boxIds.has(i.stageBoxId))
    )
      problem("An input refers to a missing stage box.");
    if (
      new Set(p.stageBoxes.map((b) => b.label.toLowerCase())).size !==
      p.stageBoxes.length
    )
      problem("Give each stage box a distinct name.");
    const ids = [
      ...p.objects,
      ...p.inputs,
      ...p.gear,
      ...p.cables,
      ...p.cableNodes,
      ...p.stageBoxes,
    ].map((i) => i.id);
    if (new Set(ids).size !== ids.length)
      problem("Each entry needs a unique ID.");
    if (new Set(p.inputs.map((i) => i.number)).size !== p.inputs.length)
      problem("Each input needs a unique plot number.");
    for (const g of p.gear) {
      if (g.plotIds?.some((id) => !points.has(id)))
        problem("Equipment refers to a missing stage item.");
      if (g.sourceIds.some((i) => !inputIds.has(i)))
        problem("An allocation links to a missing input.");
      if (
        g.confirmed &&
        (!g.required || !g.quantity || g.provider === "To confirm")
      )
        problem(
          "A supplier request needs a required item, quantity and provider.",
        );
    }
    const cableGear = new Map(p.gear.map((g) => [g.id, g]));
    const used = new Map<string, number>();
    const nodes = new Set(p.cableNodes.map((n) => n.id));
    for (const c of p.cables) {
      if (
        c.nodeIds.some((id) => !nodes.has(id)) ||
        new Set(c.nodeIds).size !== c.nodeIds.length
      )
        problem(
          "Each bend in a cable must reference a distinct routing node on the plot.",
        );
      if (
        !points.has(c.fromId) ||
        !points.has(c.toId) ||
        c.fromId === c.toId ||
        !cableGear.has(c.gearId)
      )
        problem("Each cable needs an allocation and two different endpoints.");
      used.set(c.gearId, (used.get(c.gearId) ?? 0) + 1);
    }
    for (const [key, count] of used) {
      const q = cableGear.get(key)?.quantity;
      if (q != null && count > q)
        problem("The number of cable runs exceeds the allocated quantity.");
    }
  });
export type Plot = z.infer<typeof rawPlotSchema>;
export const plotSchema = rawPlotSchema
  .transform(reconcileEquipment)
  .superRefine((p, ctx) => {
    if (p.gear.length > 650)
      ctx.addIssue({
        code: "custom",
        message: "This plot exceeds the equipment limit of 650 entries.",
      });
  });
export type PlotObject = Plot["objects"][number];
export type StageBox = Plot["stageBoxes"][number];
export type Input = Plot["inputs"][number];
export type Gear = Plot["gear"][number];
export type Provider = Gear["provider"];
export type Published = {
  releaseNumber?: number;
  revision: number;
  date: string;
  plot: Plot;
  versionId?: string;
  versionName?: string;
  versionRevision?: number;
};
export const canonical = "https://theswell.live/stage-plot";

export function resizePlayingArea(
  p: Plot,
  width: number,
  depth: number,
  upstage: boolean,
): Plot {
  if (width === p.width && depth === p.depth) return p;
  const extraDepth = upstage ? Math.max(0, depth - p.depth) : 0;
  function place<T extends { x: number; y: number }>(
    point: T,
    perimeter = false,
  ): T {
    return {
      ...point,
      x:
        width < p.width && (!perimeter || point.x >= 0)
          ? (point.x * width) / p.width
          : point.x,
      y:
        depth < p.depth && (!perimeter || point.y >= 0)
          ? (point.y * depth) / p.depth
          : point.y + extraDepth,
    };
  }
  return {
    ...p,
    width,
    depth,
    objects: p.objects.map((point) => place(point)),
    inputs: p.inputs.map((point) => place(point)),
    stageBoxes: p.stageBoxes.map((point) => place(point, true)),
    cableNodes: p.cableNodes.map((point) => place(point, true)),
  };
}

export function rollup(rows: Gear[]) {
  type Group = Pick<
    Gear,
    "item" | "spec" | "provider" | "confirmed" | "required"
  > & {
    quantity: number;
    unknown: number;
    stations: Set<string>;
    allocations: Gear[];
  };
  const groups = new Map<string, Group>();
  for (const g of rows) {
    const key = JSON.stringify([
      g.item.trim().toLowerCase(),
      g.spec.trim().toLowerCase(),
      g.provider,
      g.required,
      g.confirmed,
    ]);
    const group = groups.get(key) ?? {
      item: g.item,
      spec: g.spec,
      provider: g.provider,
      confirmed: g.confirmed,
      required: g.required,
      quantity: 0,
      unknown: 0,
      stations: new Set<string>(),
      allocations: [],
    };
    if (g.quantity === null) group.unknown++;
    else group.quantity += g.quantity;
    if (g.station) group.stations.add(g.station);
    group.allocations.push(g);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.confirmed) - Number(a.confirmed) ||
      Number(b.quantity > 0) - Number(a.quantity > 0) ||
      a.item.localeCompare(b.item) ||
      a.spec.localeCompare(b.spec),
  );
}
export function quantityText(g: { quantity: number; unknown: number }) {
  if (!g.unknown) return String(g.quantity);
  return g.quantity ? g.quantity + " + TBD" : "TBD";
}
export function byNumber(p: Plot) {
  return [...p.inputs].sort((a, b) => a.number - b.number);
}
/** Assign sockets independently in each box, in ascending plot-input order. */
export function stageBoxPatch(plot: Plot) {
  const boxes = new Map(plot.stageBoxes.map(box => [box.id, box]));
  const lastChannel = new Map<string, number>();
  return byNumber(plot).map(input => {
    const box = input.stageBoxId ? boxes.get(input.stageBoxId) : undefined;
    if (!box) return { input, box, channel: null };
    const channel = (lastChannel.get(box.id) ?? 0) + 1;
    lastChannel.set(box.id, channel);
    return { input, box, channel };
  });
}

export function micFor(p: Plot, i: Input) {
  const integrated = p.gear.find(g => g.sourceIds.includes(i.id) && /preamp\s*\/\s*DI pedal/i.test(g.item));
  if (i.kind === "Line" && integrated) return `${integrated.spec || integrated.item} · balanced XLR`;
  if (i.kind === "DI") {
    return integrated ? `${integrated.spec || integrated.item} (built-in DI)` : "DI required";
  }
  const mic = p.gear.find(
    (g) => g.sourceIds.includes(i.id) && g.item.toLowerCase() === "microphone",
  );
  return mic?.spec || i.kind;
}
export function objectImage(asset: string) {
  return asset.startsWith("data:")
    ? asset
    : "/stage-plot-art/" + asset + ".webp";
}
export function pointFor(p: Plot, id: string) {
  const o = p.objects.find((o) => o.id === id);
  if (o)
    return {
      x: o.x + objectAnchor(o).x,
      y: o.y + objectAnchor(o).y,
      label:
        o.asset === "nord" && o.label === catalog.nord.label ? "Nord" : o.label,
    };
  const box = p.stageBoxes.find((b) => b.id === id);
  if (box) {
    const frame = boxFrame(
      p,
      box,
      p.inputs.filter((input) => input.stageBoxId === id),
    );
    return {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
      label: box.label,
    };
  }
  const i = p.inputs.find((i) => i.id === id);
  return i
    ? {
        x: i.x,
        y: i.y,
        label:
          i.kind === "DI"
            ? "Direct box " + i.number
            : i.number + " · " + i.source,
      }
    : null;
}
export function replaceRuns(p: Plot, cables: Plot["cables"]): Plot {
  const used = new Set(cables.flatMap((c) => c.nodeIds));
  const previousGear = new Set(p.cables.map((c) => c.gearId));
  const usedGear = new Set(cables.map((c) => c.gearId));
  return {
    ...p,
    cables,
    cableNodes: p.cableNodes.filter((n) => used.has(n.id)),
    gear: p.gear.filter(
      (g) =>
        !(
          g.createdForCable &&
          g.quantity === 1 &&
          previousGear.has(g.id) &&
          !usedGear.has(g.id)
        ),
    ),
  };
}

export function removePoint(p: Plot, id: string): Plot {
  const next = replaceRuns(
    p,
    p.cables.filter((c) => c.fromId !== id && c.toId !== id),
  );
  return {
    ...next,
    objects: p.objects.filter((o) => o.id !== id).map((o) => { if (o.standId !== id) return o; const { standId: _stand, ...rest } = o; void _stand; return rest; }),
    stageBoxes: p.stageBoxes.filter((b) => b.id !== id),
    inputs: p.inputs
      .filter((i) => i.id !== id)
      .map((i) => (i.stageBoxId === id ? { ...i, stageBoxId: null } : i)),
    gear: next.gear
      .filter(
        (g) =>
          !(
            g.createdForPlot &&
            ((g.plotIds?.length === 1 && g.plotIds[0] === id) ||
              (!g.plotIds?.length &&
                g.sourceIds.length === 1 &&
                g.sourceIds[0] === id))
          ),
      )
      .map((g) => ({
        ...g,
        sourceIds: g.sourceIds.filter((i) => i !== id),
        ...(g.plotIds ? { plotIds: g.plotIds.filter((i) => i !== id) } : {}),
      })),
  };
}
