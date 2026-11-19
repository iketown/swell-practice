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
