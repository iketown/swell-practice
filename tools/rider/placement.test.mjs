import test from "node:test";
import assert from "node:assert/strict";
import { objectAnchor, stageAnchor, withAnchor } from "../../src/lib/rider/placement.ts";
import { overviewPlot, symbolTransform } from "../../src/lib/rider/screen-layout.ts";

const stand = { id: "mic-brian", label: "Brian vocal boom", asset: "boom", x: 14, y: 12, w: 2, h: 4, opacity: 1 };
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("legacy stand base, generic centre and rug front use distinct reference points", () => {
  assert.deepEqual(objectAnchor(stand), { x: 1, y: 3.4 });
  assert.deepEqual(objectAnchor({ ...stand, asset: "telecaster" }), { x: 1, y: 2 });
  assert.deepEqual(objectAnchor({ ...stand, asset: "drum-rug" }), { x: 1, y: 4 });
});

test("calibration moves artwork around a fixed physical point without changing its size", () => {
  const original = structuredClone(stand);
  const before = stageAnchor(stand);
  const calibrated = withAnchor(stand, { x: .7, y: 3.8 });
  near(stageAnchor(calibrated).x, before.x);
  near(stageAnchor(calibrated).y, before.y);
  assert.notEqual(calibrated.y, stand.y);
  assert.equal(calibrated.w, stand.w);
  assert.equal(calibrated.h, stand.h);
  assert.deepEqual(stand, original);
});

test("overview scaling leaves the calibrated reference on the same grid point", () => {
  const calibrated = withAnchor(stand, { x: .7, y: 3.8 });
  const anchor = objectAnchor(calibrated);
  const transform = symbolTransform(calibrated.x, calibrated.y, 1 / 1.2, calibrated.w, calibrated.h, anchor);
  const [, x, y, scale] = transform.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/).map(Number);
  near(x + anchor.x * scale, stageAnchor(calibrated).x);
  near(y + anchor.y * scale, stageAnchor(calibrated).y);
});

test("schematic icon and badge positions are confined to the overview", () => {
  const mixer = { ...stand, x: 25, y: 8, overviewPosition: { x: 26, y: 12 } };
  const receiver = { id: "wireless", x: 25, y: 11, overviewPosition: { x: 26, y: 4 } };
  const physical = { objects: [stand, mixer], inputs: [receiver] };
  const overview = overviewPlot(physical);
  assert.equal(overview.objects[0], stand);
  assert.deepEqual([overview.objects[1].x, overview.objects[1].y], [26, 12]);
  assert.deepEqual([overview.inputs[0].x, overview.inputs[0].y], [26, 4]);
  assert.deepEqual([physical.objects[1].x, physical.objects[1].y], [25, 8]);
  assert.deepEqual([physical.inputs[0].x, physical.inputs[0].y], [25, 11]);
});
