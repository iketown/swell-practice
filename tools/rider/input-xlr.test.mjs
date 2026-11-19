import test from "node:test";
import assert from "node:assert/strict";
import { estimateInputXlr, updateEstimatedInputXlr } from "../../src/lib/rider/input-xlr.ts";

function setup() {
  const input = { id: "chris", number: 2, source: "Chris vocal", station: "Chris", kind: "Mic", x: 8, y: 16, stageBoxId: "left" };
  const plot = { width: 24, depth: 18, inputs: [input], objects: [], gear: [], stageBoxes: [
    { id: "rear", label: "drum stagebox", x: 9.6, y: -.32 },
    { id: "left", label: "stage left box", x: 24.78, y: 2.49 },
  ] };
  return { input, plot };
}

test("opposite-side front vocal wraps upstage; a rear-box reassignment needs a shorter stock lead", () => {
  const { input, plot } = setup();
  const before = estimateInputXlr(plot, input);
  assert.equal(before.stockFeet, 100);
  assert(before.route.some(point => point.y === .2), "route uses rear edge, not a centre-front shortcut");
  for (let i = 1; i < before.route.length; i++) {
    const a = before.route[i - 1], b = before.route[i];
    assert(a.x === b.x || a.y === b.y);
    if (a.y === b.y && a.y > plot.depth * .61) {
      assert(Math.max(a.x, b.x) < plot.width * .36 || Math.min(a.x, b.x) > plot.width * .64);
    }
  }
  input.stageBoxId = "rear";
  const after = estimateInputXlr(plot, input);
  assert.equal(after.stockFeet, 50);
  assert(after.totalFeet < before.totalFeet);
});

test("vocal routes start at the calibrated stand base rather than the input badge", () => {
  const { input, plot } = setup();
  input.x = 0; input.y = 0; input.stageBoxId = "rear";
  plot.objects.push({ id: "stand", asset: "boom", x: 7, y: 13, w: 2, h: 4, placement: { x: 1, y: 3 } });
  plot.gear.push({ item: "Boom vocal mic stands", sourceIds: [input.id], plotIds: ["stand"] });
  const estimate = estimateInputXlr(plot, input);
  assert.deepEqual(estimate.source, { x: 8, y: 16 });
  assert.equal(estimate.stockFeet, 50);
});

test("drum height and slack count toward stock length without making drum cables tour the perimeter", () => {
  const { input, plot } = setup();
  Object.assign(input, { source: "Overhead", station: "Sam", x: 10, y: 6, stageBoxId: "rear" });
  const overhead = estimateInputXlr(plot, input);
  assert.equal(overhead.riseFeet, 8);
  assert.equal(overhead.slackFeet, 5);
  assert(overhead.floorFeet < 10);
  assert(overhead.stockFeet >= overhead.totalFeet);
  input.source = "Kick";
  assert.equal(estimateInputXlr(plot, input).riseFeet, 2);
});

test("missing destinations and runs beyond stock length remain unresolved", () => {
  const { input, plot } = setup();
  input.stageBoxId = null;
  assert.equal(estimateInputXlr(plot, input), null);
  input.stageBoxId = "left"; input.y = 150;
  assert.equal(estimateInputXlr(plot, input).stockFeet, null);
});

test("a floor preamp's direct XLR input has the same cable allowance as its former DI input", () => {
  const { input, plot } = setup();
  Object.assign(input, { source: "Bass", station: "Brian", kind: "DI", x: 14.673, y: 10.037, stageBoxId: "rear" });
  const before = estimateInputXlr(plot, input);
  input.kind = "Line";
  const after = estimateInputXlr(plot, input);
  assert.equal(after.riseFeet, 0);
  assert.equal(after.slackFeet, 5);
  assert.equal(after.totalFeet, before.totalFeet);
  assert.equal(after.stockFeet, 25);
});

test("saved XLR bends take precedence over a shorter suggested route", () => {
  const { input, plot } = setup();
  input.stageBoxId = "rear";
  const suggested = estimateInputXlr(plot, input);
  plot.gear.push({ id: "xlr", item: "XLR cable", sourceIds: [input.id] });
  plot.cableNodes = [{ id: "south", x: 8, y: 17.7 }, { id: "corner", x: .25, y: 17.7 }, { id: "rear", x: .25, y: .2 }];
  plot.cables = [{ id: "run", gearId: "xlr", fromId: input.id, toId: "rear", nodeIds: plot.cableNodes.map(n => n.id) }];
  const drawn = estimateInputXlr(plot, input);
  assert.equal(drawn.routed, true);
  assert(drawn.totalFeet > suggested.totalFeet);
  assert(drawn.route.some(point => point.y === 17.7));
  // Reversing the cable record does not reverse the source-relative estimate.
  plot.cables[0] = { ...plot.cables[0], fromId: "rear", toId: input.id, nodeIds: [...plot.cables[0].nodeIds].reverse() };
  assert.equal(estimateInputXlr(plot, input).totalFeet, drawn.totalFeet);
});

test("moving a stagebox updates the planning allocation in both directions", () => {
  const { input, plot } = setup();
  Object.assign(input, { source: "Sam vocal", station: "Sam", x: 12, y: 7, stageBoxId: "rear" });
  plot.gear.push({
    id: "xlr", item: "XLR cable", quantity: 1, required: true, confirmed: false,
    sourceIds: [input.id], spec: "25 ft",
    notes: "Stage-input estimate: Select 25 ft stock. Verify reach at setup. Keep at the kit.",
  });
  const longer = updateEstimatedInputXlr({
    ...plot, stageBoxes: plot.stageBoxes.map(b => b.id === "rear" ? { ...b, x: 1 } : b),
  });
  assert.equal(longer.gear[0].spec, "50 ft");
  assert.match(longer.gear[0].notes, /Select 50 ft stock\..*Keep at the kit\./);
  assert.equal(plot.gear[0].spec, "25 ft");
  const shorter = updateEstimatedInputXlr({ ...longer, stageBoxes: plot.stageBoxes });
  assert.equal(shorter.gear[0].spec, "25 ft");
  assert.equal(updateEstimatedInputXlr(shorter), shorter);
  const manual = { ...longer, gear: [{ ...longer.gear[0], spec: "100 ft" }] };
  const confirmed = { ...longer, gear: [{ ...longer.gear[0], confirmed: true }] };
  assert.equal(updateEstimatedInputXlr(manual), manual);
  assert.equal(updateEstimatedInputXlr(confirmed), confirmed);
});
