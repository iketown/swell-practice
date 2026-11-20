import assert from "node:assert/strict";
import test from "node:test";
import { stageBoxPatch } from "../../src/lib/rider/model.ts";

test("box channels follow plot numbers independently of saved order, box names and direct inputs", () => {
  const stageBoxes = [{ id: "up", label: "Upstage" }, { id: "sl", label: "Stage left" }];
  const inputs = [[6, "up"], [17, null], [4, "sl"], [2, "up"], [5, "up"], [3, "sl"], [1, "up"]]
    .map(([number, stageBoxId]) => ({ id: String(number), number, stageBoxId }));
  const channels = inputs => stageBoxPatch({ inputs, stageBoxes }).map(({ channel }) => channel);
  assert.deepEqual(channels(inputs), [1, 2, 1, 2, 3, 4, null]);
  const reassigned = inputs.map(input => input.number === 2 ? { ...input, stageBoxId: "sl" } : input);
  assert.deepEqual(channels(reassigned), [1, 1, 2, 3, 2, 3, null]);
});

test("four assigned channels fit a two-foot-wide two-by-two box while twelve keep three columns", async () => {
  const { boxFrame, boxHeaderHeight, boxRowHeight } = await import("../../src/lib/rider/stage-box.ts");
  const plot = { width: 24, depth: 20 };
  const box = { label: "stage left box", x: 20.75, y: 2.79 };
  const frame = count => boxFrame(plot, box, Array.from({ length: count }, (_, number) => ({ number })));
  const small = frame(4);
  assert.deepEqual([small.x, small.y, small.columns, small.width], [box.x, box.y, 2, 2]);
  assert.equal(small.height, boxHeaderHeight + 2 * boxRowHeight + 0.08);
  assert.equal(frame(12).columns, 3);
});

test("the saved stage-left box fits onstage and feeds the rack overview from that position", async () => {
  const { rackOverview } = await import("../../src/lib/rider/rack-overview.ts");
  const box = { id: "left", label: "stage left box", x: 20.75, y: 2.79 };
  const plot = { width: 24, depth: 20, stageBoxes: [box], inputs: [{ number: 3, stageBoxId: box.id }],
    gear: [], cables: [], rackMap: { s16Inputs: Array.from({ length: 16 }, (_, i) => i + 1) } };
  const [frame] = rackOverview(plot, "Cable patch and routing").boxes;
  assert.deepEqual([frame.x, frame.y, frame.code], [box.x, box.y, "L"]);
  assert.ok(frame.x + frame.width < plot.width);
  assert.equal(rackOverview(plot, "Overview"), null);
});
