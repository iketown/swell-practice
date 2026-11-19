import type { Input, Plot } from "./model";
import { stageAnchor } from "./placement";
import { boxFrame } from "./stage-box";

type Point = { x: number; y: number };
const stockLengths = [10, 25, 50, 100];

/** Planning estimates in saved feet, independent of decorative artwork scaling.
 * The front-centre corridor is never used as a shortcut. Local drum connections
 * can run within the kit; other sources approach via a side or the upstage edge.
 */
export function estimateInputXlr(plot: Plot, input: Input) {
  if (!input.stageBoxId) return null;
  const box = plot.stageBoxes.find(box => box.id === input.stageBoxId);
  if (!box) return null;
  const frame = boxFrame(plot, box, plot.inputs.filter(source => source.stageBoxId === box.id));
  const destination = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const standIds = plot.gear.filter(g => g.sourceIds.includes(input.id) && /stand|mount/i.test(g.item)).flatMap(g => g.plotIds ?? []);
  const stand = plot.objects.find(o => standIds.includes(o.id) && (o.asset === "boom" || o.asset === "drum-boom"));
  const source = stand ? stageAnchor(stand) : { x: input.x, y: input.y };
  const rear = .2, left = .25, right = plot.width - .25;
  const side = source.x < plot.width / 2 ? left : right;
  const targetOutside = destination.x > plot.width;
  const localDrums = input.kind === "Mic" && (input.station === "Sam" || /kick|snare|hi.hat|overhead|drum|\btom\b/i.test(input.source));
  const sidePath: Point[] = targetOutside && side === right
    ? [source, { x: side, y: source.y }, { x: side, y: destination.y }, destination]
    : [source, { x: side, y: source.y }, { x: side, y: rear }, { x: targetOutside ? right : destination.x, y: rear }, ...(targetOutside ? [{ x: right, y: destination.y }] : []), destination];
  const candidates = [sidePath];
  if (localDrums) candidates.push([source, { x: destination.x, y: source.y }, destination]);
  else if (source.y < plot.depth * .61) candidates.push([source, { x: source.x, y: rear }, { x: targetOutside ? right : destination.x, y: rear }, ...(targetOutside ? [{ x: right, y: destination.y }] : []), destination]);
  const distance = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
  const route = candidates.sort((a, b) => distance(a) - distance(b))[0];
  const floorFeet = distance(route);
  const riseFeet = input.kind !== "Mic" ? 0 : /kick/i.test(input.source) ? 2 : /overhead/i.test(input.source) ? 8 : /snare|hi.hat/i.test(input.source) ? 4 : /vocal/i.test(input.source) ? 7 : 6;
  const slackFeet = 5;
  // Once an XLR is drawn, estimate that saved traversal rather than a shorter
  // suggested corridor. Decorative parallel-lane offsets do not add floor length.
  const allocation = inputXlrAllocation(plot, input);
  const drawn = (plot.cables ?? []).find(run => run.gearId === allocation?.id &&
    ((run.fromId === input.id && run.toId === box.id) || (run.toId === input.id && run.fromId === box.id)));
  const bends = drawn?.nodeIds.map(id => plot.cableNodes.find(node => node.id === id));
  const routed = !!drawn && bends?.every(node => !!node);
  const explicit = routed ? [
    { ...source, diagonal: false },
    ...(drawn.fromId === input.id ? bends : [...bends].reverse()).map(node => node!),
    { ...destination, diagonal: false },
  ] : null;
  const routedFloorFeet = explicit?.slice(1).reduce((sum, point, index) => {
    const previous = explicit[index];
    const dx = Math.abs(point.x - previous.x), dy = Math.abs(point.y - previous.y);
    return sum + (point.diagonal || previous.diagonal ? Math.hypot(dx, dy) : dx + dy);
  }, 0) ?? floorFeet;
  const totalFeet = routedFloorFeet + riseFeet + slackFeet;
  const stockFeet = stockLengths.find(length => length >= totalFeet) ?? null;
  return { source, destination, route: explicit ?? route, routed: !!routed, floorFeet: routedFloorFeet, riseFeet, slackFeet, totalFeet, stockFeet };
}

export function inputXlrAllocation(plot: Plot, input: Input) {
  return plot.gear.find(g => /^xlr cables?$/i.test(g.item) && g.sourceIds.includes(input.id));
}

/** Update planning allocations from the current layout before display or save. */
export function updateEstimatedInputXlr(plot: Plot): Plot {
  const updates = new Map<string, Plot["gear"][number]>();
  for (const input of plot.inputs) {
    const allocation = inputXlrAllocation(plot, input);
    if (!allocation || allocation.confirmed || !allocation.required ||
      allocation.quantity !== 1 || allocation.sourceIds.length !== 1 ||
      !allocation.notes.startsWith("Stage-input estimate:")) continue;

    const autoSpec = allocation.notes.match(/\bSelect (\d+ ft) stock\./i)?.[1];
    if (autoSpec && autoSpec !== allocation.spec) continue;
    const reach = /verify reach at setup\./i.exec(allocation.notes);
    if (!reach) continue;
    const estimate = estimateInputXlr(plot, input);
    const box = plot.stageBoxes.find(box => box.id === input.stageBoxId);
    if (!estimate || !box) continue;

    const { floorFeet, riseFeet, slackFeet, totalFeet, stockFeet, routed } = estimate;
    const spec = stockFeet === null ? "" : `${stockFeet} ft`;
    const selection = spec ? `Select ${spec} stock.` : "Length to confirm: exceeds configured stock.";
    const extraNotes = allocation.notes.slice(reach.index + reach[0].length).trim();
    const notes = `Stage-input estimate: #${input.number} ${input.source} to ${box.label}. ${routed ? "Saved" : "Suggested"} path ${floorFeet.toFixed(2)} ft + mic/boom rise ${riseFeet} ft + slack ${slackFeet} ft = ${totalFeet.toFixed(2)} ft. ${selection} One 3-pin XLR female-to-male lead. Verify reach at setup.` +
      (extraNotes ? ` ${extraNotes}` : "");
    if (spec !== allocation.spec || notes !== allocation.notes) {
      updates.set(allocation.id, { ...allocation, spec, notes });
    }
  }
  return updates.size ? { ...plot, gear: plot.gear.map(g => updates.get(g.id) ?? g) } : plot;
}
