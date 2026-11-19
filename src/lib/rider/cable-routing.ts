import { pointFor, replaceRuns, type Plot } from "./model";
import { plotPerimeter, sideStageWidth } from "./stage-box";

export type Point = { x: number; y: number };
type Node = Plot["cableNodes"][number];
export type Run = Plot["cables"][number];
type Leg = {
  runId: string;
  span: number;
  a: Point;
  b: Point;
  dx: number;
  dy: number;
  length: number;
  offset: Point;
};
type DrawnLeg = { span: number; a: Point; b: Point; points: Point[] };
export type DrawnRun = {
  run: Run;
  from: Point & { label: string };
  to: Point & { label: string };
  legs: DrawnLeg[];
  path: string;
  color: string;
};

const palette = [
  "#196d84",
  "#a14428",
  "#794e9d",
  "#34753e",
  "#996117",
  "#a53765",
];
const laneSpacing = 0.115;
const zero = { x: 0, y: 0 };
const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const interpolate = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function cablePosition(plot: Plot, point: Point): Point {
  const bound = (v: number, lo: number, hi: number) =>
    Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100;
  return {
    x: bound(
      point.x,
      -plotPerimeter.left + 0.2,
      plot.width + sideStageWidth + plotPerimeter.right - 0.2,
    ),
    y: bound(
      point.y,
      -plotPerimeter.top + 0.2,
      plot.depth + plotPerimeter.bottom - 0.2,
    ),
  };
}

export function insertNode(
  p: Plot,
  runId: string,
  index: number,
  node: Node,
): Plot {
  return {
    ...p,
    cableNodes: [...p.cableNodes, node],
    cables: p.cables.map((c) =>
      c.id === runId
        ? {
            ...c,
            nodeIds: [
              ...c.nodeIds.slice(0, index),
              node.id,
              ...c.nodeIds.slice(index),
            ],
          }
        : c,
    ),
  };
}

/** A junction is shared physical routing: removing it releases every attached run. */
export function removeNode(p: Plot, id: string): Plot {
  if (!p.cableNodes.some(node => node.id === id)) return p;
  return replaceRuns(p, p.cables.map(run => ({
    ...run,
    nodeIds: run.nodeIds.filter(nodeId => nodeId !== id),
  })));
}

export function moveNode(
  p: Plot,
  id: string,
  point: Point,
  share?: string,
  diagonal?: boolean,
): Plot {
  if (share && share !== id && p.cableNodes.some((n) => n.id === share)) {
    const cables = p.cables.map((c) => {
      if (!c.nodeIds.includes(id)) return c;
      const ids = c.nodeIds.map((n) => (n === id ? share : n));
      return { ...c, nodeIds: ids.filter((n, i) => !i || ids[i - 1] !== n) };
    });
    // Merging distant bends on the same run would change its traversal order.
    if (cables.every((c) => new Set(c.nodeIds).size === c.nodeIds.length))
      return replaceRuns(p, cables);
  }
  return {
    ...p,
    cableNodes: p.cableNodes.map((n) =>
      n.id === id
        ? {
            ...n,
            x: point.x,
            y: point.y,
            ...(diagonal === undefined ? {} : { diagonal }),
          }
        : n,
    ),
  };
}

export function snapNode(p: Plot, id: string, point: Point, radius: number) {
  const excluded = new Set([id]);
  for (const c of p.cables) {
    const index = c.nodeIds.indexOf(id);
    if (index >= 0)
      c.nodeIds.forEach((n, i) => {
        if (Math.abs(i - index) > 1) excluded.add(n);
      });
  }
  let best: Node | undefined;
  for (const node of p.cableNodes) {
    const d = distance(point, node);
    if (!excluded.has(node.id) && d <= radius) {
      best = node;
      radius = d;
    }
  }
  return best;
}

export function dragPlacement(
  p: Plot,
  id: string,
  origin: Point,
  cursor: Point,
  free: boolean,
  radius: number,
) {
  const dx = cursor.x - origin.x,
    dy = cursor.y - origin.y;
  const point = cablePosition(p, cursor);
  if (!free) {
    if (Math.abs(dx) >= Math.abs(dy)) point.y = origin.y;
    else point.x = origin.x;
  }
  const moved = Math.hypot(dx, dy) > 0.015;
  const target = moved ? snapNode(p, id, point, radius) : undefined;
  return { point: target ?? point, target: target?.id, moved };
}

type PerimeterEntry = {
  boxId: string;
  side: "west" | "east";
  joinY: number;
  approachLength: number;
  reversed: boolean;
};

type BoxLane = { bundle: string; shift: number };

// Trace common approaches back from the box to order cables by which side
// they enter from. Carry that order upstream so lanes do not recenter at merges.
function boxLanes(
  plot: Plot,
  runs: { run: Run; legs: Leg[] }[],
  perimeter: Map<string, PerimeterEntry>,
): Map<string, BoxLane> {
  const boxes = new Set(plot.stageBoxes.map(box => box.id));
  const bundles = new Map<string, { id: string; reversed: boolean; legs: Leg[] }[]>();
  for (const { run, legs } of runs) {
    if (perimeter.has(run.id) || !legs.length) continue;
    const reversed = boxes.has(run.fromId);
    const box = reversed ? run.fromId : run.toId;
    if (!boxes.has(box)) continue;
    const approach = reversed
      ? [...legs].reverse().map(leg => ({ ...leg, a: leg.b, b: leg.a, dx: -leg.dx, dy: -leg.dy }))
      : legs;
    const { a } = approach[approach.length - 1];
    const key = JSON.stringify([box, a.x, a.y]);
    const entry = { id: run.id, reversed, legs: approach };
    const bundle = bundles.get(key);
    if (bundle) bundle.push(entry);
    else bundles.set(key, [entry]);
  }

  function entryAngle(outgoing: Leg, incoming?: Leg) {
    if (!incoming) return 0;
    const dot = outgoing.dx * incoming.dx + outgoing.dy * incoming.dy;
    const cross = outgoing.dx * incoming.dy - outgoing.dy * incoming.dx;
    return cross === 0 && dot > 0 ? 0 : Math.atan2(-cross, dot);
  }

  const lanes = new Map<string, BoxLane>();
  for (const [bundle, entries] of bundles) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => {
      let i = a.legs.length - 1;
      let j = b.legs.length - 1;
      while (i >= 0 && j >= 0 && distance(a.legs[i].a, b.legs[j].a) < .001) {
        const side = entryAngle(a.legs[i], a.legs[i - 1]) - entryAngle(b.legs[j], b.legs[j - 1]);
        if (Math.abs(side) > .001) return side;
        i--;
        j--;
      }
      return a.id.localeCompare(b.id);
    });
    entries.forEach(({ id, reversed }, index) => {
      const offset = (index - (entries.length - 1) / 2) * laneSpacing;
      lanes.set(id, { bundle, shift: reversed ? -offset : offset });
    });
  }
  return lanes;
}

function perimeterEntry(plot: Plot, run: Run, legs: Leg[]): PerimeterEntry | undefined {
  const target = plot.stageBoxes.find(box => box.id === run.toId || box.id === run.fromId);
  if (!target) return;
  const reversed = run.fromId === target.id;
  let approachLength = 0;
  for (const leg of reversed ? [...legs].reverse() : legs) {
    const start = reversed ? leg.b : leg.a;
    const end = reversed ? leg.a : leg.b;
    // The dotted guide runs a quarter foot in from either edge. Leave room
    // for a corridor bend to be nudged while still following the perimeter.
    const side = Math.abs(start.x) <= .75 ? "west"
      : Math.abs(start.x - plot.width) <= .75 ? "east" : undefined;
    if (side && start.x === end.x && end.y < start.y) {
      return { boxId: target.id, side, joinY: start.y, approachLength, reversed };
    }
    approachLength += leg.length;
  }
}

// Legs that leave the same junction in the same direction occupy a common corridor.
// Group the whole corridor before offsetting it, so reverse-traveling cables and
// different-length approaches get consistent lanes at both ends.
function spaceLanes(
  legs: Leg[],
  ports: Map<string, { leg: number; dx: number; dy: number }[]>,
  perimeter: Map<string, PerimeterEntry>,
  boxLaneByRun: Map<string, BoxLane>,
) {
  const parent = legs.map((_, i) => i);
  function root(i: number) {
    while (i !== parent[i]) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (const entries of ports.values()) {
    const bearings: typeof entries = [];
    for (const entry of entries) {
      const match = bearings.find(
        (b) => b.dx * entry.dx + b.dy * entry.dy >= Math.cos(Math.PI / 15),
      );
      if (match) parent[root(entry.leg)] = root(match.leg);
      else bearings.push(entry);
    }
  }
  const groups = new Map<number, Leg[]>();
  legs.forEach((leg, i) => {
    const key = root(i);
    const group = groups.get(key);
    if (group) group.push(leg);
    else groups.set(key, [leg]);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ids = [...new Set(group.map((l) => l.runId))].sort();
    const first = perimeter.get(ids[0]);
    if (first && ids.every(id => {
      const entry = perimeter.get(id);
      return entry?.side === first.side && entry.boxId === first.boxId;
    })) {
      ids.sort((a, b) => {
        const left = perimeter.get(a)!;
        const right = perimeter.get(b)!;
        return right.joinY - left.joinY || right.approachLength - left.approachLength || a.localeCompare(b);
      });
      const ranks = new Map(ids.map((id, i) => [id, i]));
      for (const leg of group) {
        const entry = perimeter.get(leg.runId)!;
        // Viewed toward the box, the west corridor grows on the right of
        // travel and the east corridor grows on the left.
        const inward = entry.side === "west" ? 1 : -1;
        const shift = ranks.get(leg.runId)! * laneSpacing * inward * (entry.reversed ? -1 : 1);
        leg.offset = { x: -leg.dy * shift, y: leg.dx * shift };
      }
      continue;
    }
    const boxLane = boxLaneByRun.get(ids[0]);
    if (boxLane && ids.every(id => boxLaneByRun.get(id)?.bundle === boxLane.bundle)) {
      for (const leg of group) {
        const { shift } = boxLaneByRun.get(leg.runId)!;
        leg.offset = { x: -leg.dy * shift, y: leg.dx * shift };
      }
      continue;
    }
    const lead = group.find((l) => l.runId === ids[0])!;
    const shifts = new Map(
      ids.map((id, i) => [id, (i - (ids.length - 1) / 2) * laneSpacing]),
    );
    for (const leg of group) {
      const sign = leg.dx * lead.dx + leg.dy * lead.dy < 0 ? -1 : 1;
      const shift = sign * shifts.get(leg.runId)!;
      leg.offset = { x: -leg.dy * shift, y: leg.dx * shift };
    }
  }
}

// Join neighboring offset lines at their intersection. Bevel tight reversals
// instead of extending a miter far outside the physical bend.
function joinLegs(prev: Leg, next: Leg): Point[] {
  const a = add(prev.b, prev.offset),
    b = add(next.a, next.offset);
  if ((prev.dx === 0 && next.dy === 0) || (prev.dy === 0 && next.dx === 0)) {
    return [prev.dx === 0 ? { x: a.x, y: b.y } : { x: b.x, y: a.y }];
  }
  if (distance(a, b) < 0.001) return [a];
  const cross = prev.dx * next.dy - prev.dy * next.dx;
  if (Math.abs(cross) > 0.02) {
    const t = ((b.x - a.x) * next.dy - (b.y - a.y) * next.dx) / cross;
    const joint = { x: a.x + t * prev.dx, y: a.y + t * prev.dy };
    if (
      distance(joint, prev.b) <=
      Math.min(
        prev.length / 2,
        next.length / 2,
        Math.max(distance(zero, prev.offset), distance(zero, next.offset)) * 3,
      )
    )
      return [joint];
  }
  return [a, b];
}
function endLead(leg: Leg, atStart: boolean): Point[] {
  const tip = atStart ? leg.a : leg.b;
  const shift = distance(leg.offset, zero);
  if (!shift) return [tip];
  if (leg.dx === 0 || leg.dy === 0) {
    const lane = add(tip, leg.offset);
    return atStart ? [tip, lane] : [lane, tip];
  }
  const d =
    Math.min(leg.length / 4, Math.max(0.25, shift * 1.5)) * (atStart ? 1 : -1);
  const lane = add(add(tip, leg.offset), { x: leg.dx * d, y: leg.dy * d });
  return atStart ? [tip, lane] : [lane, tip];
}

export function drawCables(p: Plot): DrawnRun[] {
  const nodes = new Map(p.cableNodes.map((n) => [n.id, n]));
  const all: Leg[] = [];
  const ports = new Map<string, { leg: number; dx: number; dy: number }[]>();
  const runs = p.cables.flatMap((run, index) => {
    const from = pointFor(p, run.fromId),
      to = pointFor(p, run.toId);
    if (!from || !to) return [];
    const anchors = [
      { id: run.fromId, point: from, diagonal: false },
      ...run.nodeIds.map((id) => {
        const n = nodes.get(id)!;
        return { id, point: n, diagonal: n.diagonal };
      }),
      { id: run.toId, point: to, diagonal: false },
    ];
    const legs: Leg[] = [];
    function addLeg(
      a: Point,
      b: Point,
      start: string,
      end: string,
      span: number,
    ) {
      const length = distance(a, b);
      if (!length) return;
      const dx = (b.x - a.x) / length,
        dy = (b.y - a.y) / length;
      const leg = { runId: run.id, span, a, b, dx, dy, length, offset: zero };
      const k = all.push(leg) - 1;
      legs.push(leg);
      for (const [id, sign] of [
        [start, 1],
        [end, -1],
      ] as const) {
        const entry = { leg: k, dx: dx * sign, dy: dy * sign };
        const list = ports.get(id);
        if (list) list.push(entry);
        else ports.set(id, [entry]);
      }
    }
    for (let span = 0; span < anchors.length - 1; span++) {
      const start = anchors[span],
        end = anchors[span + 1];
      const a = start.point,
        b = end.point;
      // Namespace real and automatic corners separately. Opposite-traveling
      // cables through the same two anchors share the very same elbow.
      const startKey = JSON.stringify(start.id),
        endKey = JSON.stringify(end.id);
      if (start.diagonal || end.diagonal || a.x === b.x || a.y === b.y) {
        addLeg(a, b, startKey, endKey, span);
      } else {
        const elbow = { x: Math.max(a.x, b.x), y: a.x < b.x ? a.y : b.y };
        const elbowKey = JSON.stringify([start.id, end.id].sort());
        addLeg(a, elbow, startKey, elbowKey, span);
        addLeg(elbow, b, elbowKey, endKey, span);
      }
    }
    return [{ run, from, to, legs, color: palette[index % palette.length] }];
  });
  const perimeter = new Map<string, PerimeterEntry>();
  for (const { run, legs } of runs) {
    const entry = perimeterEntry(p, run, legs);
    if (entry) perimeter.set(run.id, entry);
  }
  const approachLanes = boxLanes(p, runs, perimeter);
  spaceLanes(all, ports, perimeter, approachLanes);
  for (const { run, legs } of runs) {
    if (!approachLanes.has(run.id)) continue;
    // A cable already following the corridor stays in its lane before a
    // new cable joins from the side. Otherwise it steps across the feeder.
    for (let start = 0; start < legs.length;) {
      const bearing = legs[start];
      let end = start + 1;
      while (end < legs.length && legs[end].dx === bearing.dx && legs[end].dy === bearing.dy) end++;
      const corridor = legs.slice(start, end);
      const spaced = corridor.find(leg => leg.offset !== zero);
      if (spaced) for (const leg of corridor) if (leg.offset === zero) leg.offset = spaced.offset;
      start = end;
    }
  }
  return runs.map((route) => {
    const legs = route.legs.map((leg, i) => {
      const start =
        i === 0
          ? endLead(leg, true)
          : joinLegs(route.legs[i - 1], leg).slice(-1);
      const end =
        i === route.legs.length - 1
          ? endLead(leg, false)
          : joinLegs(leg, route.legs[i + 1]);
      return { span: leg.span, a: leg.a, b: leg.b, points: [...start, ...end] };
    });
    const path = legs
      .flatMap((leg, i) => (i ? leg.points.slice(1) : leg.points))
      .map((p, i) => (i ? "L" : "M") + p.x + " " + p.y)
      .join(" ");
    return { ...route, legs, path };
  });
}

function project(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t =
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1);
  return interpolate(a, b, Math.min(1, Math.max(0, t)));
}

// Use visible lane geometry for hit testing, even when wide pointer targets
// overlap. Store the insertion on the underlying physical run.
export function nearestLeg(routes: DrawnRun[], point: Point) {
  let best:
    | { id: string; index: number; point: Point; diagonal: boolean }
    | undefined;
  let min = Infinity;
  for (const route of routes)
    route.legs.forEach((leg) => {
      for (let i = 1; i < leg.points.length; i++) {
        const hit = project(point, leg.points[i - 1], leg.points[i]);
        const d = distance(hit, point);
        if (d < min) {
          min = d;
          best = {
            id: route.run.id,
            index: leg.span,
            point: project(hit, leg.a, leg.b),
            diagonal: leg.a.x !== leg.b.x && leg.a.y !== leg.b.y,
          };
        }
      }
    });
  return best;
}
