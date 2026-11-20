import test from "node:test";
import assert from "node:assert/strict";
import { drawCables, insertNode, removeNode } from "../../src/lib/rider/cable-routing.ts";

function setup() {
  return {
    width: 24, depth: 18, objects: [], stageBoxes: [],
    inputs: [
      { id: "a", number: 1, source: "A", kind: "Mic", x: 4, y: 11 },
      { id: "b", number: 2, source: "B", kind: "Mic", x: 8, y: 16 },
      { id: "end", number: 3, source: "End", kind: "Line", x: 10, y: 1 },
    ],
    gear: [{ id: "lead-a", quantity: 1 }, { id: "lead-b", quantity: 1 }],
    cableNodes: [{ id: "shared", x: .25, y: 11 }, { id: "rear", x: .25, y: .2 }],
    cables: [
      { id: "a", gearId: "lead-a", fromId: "a", toId: "end", nodeIds: ["shared", "rear"] },
      { id: "b", gearId: "lead-b", fromId: "b", toId: "end", nodeIds: ["shared", "rear"] },
    ],
  };
}

test("removing a shared bend releases it from every cable without deleting leads or changing endpoints", () => {
  const plot = setup(), before = structuredClone(plot);
  const next = removeNode(plot, "shared");
  assert.deepEqual(plot, before);
  assert.deepEqual(next.gear, before.gear);
  assert.deepEqual(next.inputs, before.inputs);
  assert.deepEqual(next.cableNodes.map(n => n.id), ["rear"]);
  assert(next.cables.every(run => run.nodeIds.join() === "rear"));
  assert(next.cables.every((run, i) => run.fromId === before.cables[i].fromId && run.toId === before.cables[i].toId));
  assert.equal(removeNode(plot, "missing"), plot);
});

test("adding then removing an individual bend preserves shared routing and produces connected right-angle paths", () => {
  const plot = setup();
  const inserted = insertNode(plot, "b", 0, { id: "south", x: 8, y: 17.7 });
  assert.deepEqual(inserted.cables[0], plot.cables[0]);
  assert.deepEqual(inserted.cables[1].nodeIds, ["south", "shared", "rear"]);
  const routes = drawCables(inserted);
  assert.equal(routes.length, 2);
  for (const route of routes) {
    const points = route.legs.flatMap((leg, i) => i ? leg.points.slice(1) : leg.points);
    assert.equal(points[0].x, route.from.x);
    assert.equal(points[0].y, route.from.y);
    assert.equal(points.at(-1).x, route.to.x);
    assert.equal(points.at(-1).y, route.to.y);
    points.slice(1).forEach((p, i) => assert(p.x === points[i].x || p.y === points[i].y));
  }
  assert.deepEqual(removeNode(inserted, "south"), plot);
});

test("rug approaches keep their side through the merge and turn into the stage box", () => {
  const box = { id: "box", label: "Box", x: 4.575, y: -.5 };
  const nodes = [
    ["west-low", 8, 8], ["west-mid", 8, 6], ["merge", 8, 3],
    ["east-low", 15, 8], ["east-mid", 15, 7], ["east-high", 15, 6],
    ["east-turn", 15, 3], ["box-turn", 6, 3],
  ];
  const lanes = [
    [10, 16, 8, ["east-low", "east-mid", "east-high", "east-turn", "merge"]],
    [5, 14, 7, ["east-mid", "east-high", "east-turn", "merge"]],
    [16, 9, 6, ["west-mid", "merge"]],
    [15, 14, 6, ["east-high", "east-turn", "merge"]],
    [14, 10, 8, ["west-low", "west-mid", "merge"]],
  ];
  const plot = {
    ...setup(), stageBoxes: [box],
    cableNodes: nodes.map(([id, x, y]) => ({ id, x, y })),
    inputs: lanes.map(([number, x, y]) => ({ id: String(number), number, x, y, stageBoxId: box.id })),
    cables: lanes.map(([number, , , nodeIds]) => ({
      id: String(number), fromId: String(number), toId: box.id, nodeIds: [...nodeIds, "box-turn"],
    })),
  };
  const segments = new Map(drawCables(plot).map(route => {
    const points = route.legs.flatMap((leg, index) => index ? leg.points.slice(1) : leg.points);
    return [route.run.id, points.slice(1).map((b, i) => [points[i], b])];
  }));
  const xAt = (id, y) => segments.get(id).find(([a, b]) => a.x === b.x && Math.min(a.y, b.y) < y && Math.max(a.y, b.y) > y)[0].x;
  const order = ["14", "16", "15", "5", "10"].map(id => xAt(id, 2.2));
  assert(order.every((x, i) => !i || x > order[i - 1]));
  assert(xAt("14", 7) < xAt("16", 5), "the kick stays outside before the overhead joins");
  const eastBefore = segments.get("10").find(([a, b]) => a.x > 12 && b.x === 8 && a.y === b.y);
  const eastAfter = segments.get("10").find(([a, b]) => a.x === 8 && b.x < 7 && a.y === b.y);
  assert(eastBefore && eastAfter);
  assert.equal(eastBefore[0].y, eastAfter[0].y, "the east bundle stays straight past the merge");
});
