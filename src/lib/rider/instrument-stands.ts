import artwork from "./assets.json";
import type { Plot, PlotObject } from "./model";
import { stageAnchor } from "./placement";

export const herculesStandSpec = "Hercules GS414B Plus · Auto Grip System";
const instrumentAssets = new Set(["telecaster", "telecaster-yellow", "telecaster-green", "bass", "mustang-blue", "acoustic", "acoustic-only"]);
export const needsInstrumentStand = (o: PlotObject) => instrumentAssets.has(o.asset) && !o.standId;

/** Explicit draft migration. Historic revisions are never rewritten on reading. */
export function separateInstrumentStands(p: Plot): Plot {
  let gear = [...p.gear];
  const stands: PlotObject[] = [];
  const objects = p.objects.map((o) => {
    if (!needsInstrumentStand(o)) return o;
    const standId = "stand-" + o.id;
    if (p.objects.some((item) => item.id === standId)) throw Error("A stand with this identity already exists.");
    const label = o.id === "telecaster" ? "Joe guitar stand" : o.asset === "acoustic" || o.asset === "acoustic-only" ? "Acoustic guitar stand" : /jackson/i.test(o.label) ? "Jackson guitar stand" : o.id === "bass" ? "Brian bass stand" : o.label + " stand";
    // Start at the old illustration's approximate floor location; admins can
    // calibrate and measure the independent stand using the same anchor editor.
    const { w, h } = artwork["hercules-gs414b-plus"];
    stands.push({ id: standId, label, asset: "hercules-gs414b-plus", layer: "stands", x: o.x + o.w / 2 - w / 2, y: o.y + o.h - h, w, h, opacity: 1 });
    const ownSources = new Set(gear.filter((g) => g.plotIds?.includes(o.id)).flatMap((g) => g.sourceIds));
    if (/jackson/i.test(o.label)) ownSources.add("src-12");
    const candidates = gear.filter((g) => /(?:guitar|bass|instrument).*stand/i.test(g.item) &&
      (g.plotIds?.includes(o.id) || (!g.plotIds?.length && g.sourceIds.some((id) => ownSources.has(id)))));
    if (candidates.length > 1) throw Error(`Review duplicate stand allocations for ${o.label} before separating it.`);
    const existing = candidates[0];
    const { createdForPlot: _generated, ...allocation } = existing ?? {
      id: "gear-" + standId, item: "Guitar / bass stand", spec: "", quantity: 1,
      provider: "To confirm" as const, sourceIds: [], station: "", required: true,
      confirmed: false, notes: "", plotIds: [], createdForPlot: false,
    };
    void _generated;
    const entry = { ...allocation, item: "Guitar / bass stand", spec: herculesStandSpec, quantity: 1,
      plotIds: [standId], required: true, confirmed: false,
      notes: [allocation.notes, `Dedicated stand for ${o.label}; instrument and stand are separate linked plot items.`].filter(Boolean).join("\n") };
    gear = existing ? gear.map((g) => g.id === existing.id ? entry : g) : [...gear, entry];
    let asset = o.asset;
    if (asset === "telecaster") asset = /jackson|(?:gtr|guitar)\s*2$/i.test(o.label) ? "telecaster-green" : "telecaster-yellow";
    if (asset === "bass") asset = "mustang-blue";
    if (asset === "acoustic") asset = "acoustic-only";
    return { ...o, asset, standId, label: o.id === "telecaster" ? "Joe Telecaster" : o.id === "bass" ? "Mustang bass" : o.label };
  });
  return { ...p, objects: [...stands, ...objects], gear };
}

export function syncStandMovement(before: Plot, after: Plot, id: string): Plot {
  const old = before.objects.find((o) => o.id === id), next = after.objects.find((o) => o.id === id);
  if (!old || !next) return after;
  const a = stageAnchor(old), b = stageAnchor(next), dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return after;
  const partners = new Set([...(old.standId ? [old.standId] : []), ...before.objects.filter((o) => o.standId === id).map((o) => o.id)]);
  return { ...after, objects: after.objects.map((o) => partners.has(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o) };
}

export function moveStandPair(p: Plot, id: string, x: number, y: number): PlotObject[] {
  const old = p.objects.find((o) => o.id === id);
  if (!old) return p.objects;
  const group = p.objects.filter((o) => o.id === id || o.id === old.standId || o.standId === id);
  let dx = x - old.x, dy = y - old.y;
  for (const o of group) {
    const rightEdge = o.asset === "stage-riser" ? p.width : p.width + 5;
    dx = Math.max(-o.x, Math.min(rightEdge - o.w - o.x, dx));
    dy = Math.max(-o.y, Math.min(p.depth - o.h - o.y, dy));
  }
  const ids = new Set(group.map((o) => o.id));
  return p.objects.map((o) => ids.has(o.id) ? { ...o, x: Math.round((o.x + dx) * 100) / 100, y: Math.round((o.y + dy) * 100) / 100 } : o);
}
