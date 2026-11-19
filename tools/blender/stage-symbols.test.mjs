import assert from "node:assert/strict";
import test from "node:test";
import { stageSymbolForEquipment } from "../../src/lib/setup-designer/stage-symbols.ts";
import { stagePositionForNode, stageAnchorCanvasPlacement } from "../../src/lib/setup-designer/stage-plot.ts";
import { poseToBlenderTransform } from "../../src/lib/setup-designer/blender-coordinates.ts";

test("microphone plan symbols exclude accessories and retain renamed template identity", () => {
  for (const name of ["cron mic", "Condenser Microphones", "Snare microphone"]) {
    assert.equal(stageSymbolForEquipment({ name, category: "Equipment" }), "microphone");
  }
  assert.equal(stageSymbolForEquipment({ name: "Joe's stand", category: "Stand", templateId: "template-microphone-stand" }), "mic-stand");
  assert.equal(stageSymbolForEquipment({ name: "Microphone stand", category: "Stand" }), "mic-stand");
  assert.equal(stageSymbolForEquipment({ name: "Drum kit", category: "Stage planning" }), "drum-kit");
  assert.equal(stageSymbolForEquipment({ name: "Drum kit mic", category: "Microphone" }), "microphone");
  assert.equal(stageSymbolForEquipment({ name: "Kick mic stand · short boom", category: "Stand" }), "mic-stand");
  for (const name of ["MicroMON MA400 Monitor Headphone Amplifier", "Microphone preamp", "Mic cable", "Guitar stand", "Wireless microphone receiver"]) {
    assert.equal(stageSymbolForEquipment({ name, category: "Equipment" }), undefined);
  }
});

test("microphone cable remains opposite Blender's facing direction at every stage heading", () => {
  for (const heading of [0, 90, 164.7079, 180, 270]) {
    const node = { data: { name: "joe mic", category: "Microphone", ports: [] }, position: { x: 0, y: 0 },
      stagePosition: { xFeet: 2, yFeet: 3, widthFeet: 1 / 3, depthFeet: 1, rotationDegrees: heading, outputAnchor: { side: "bottom", offset: .1 } } };
    const position = stagePositionForNode(node, { widthFeet: 46, depthFeet: 24 });
    const output = stageAnchorCanvasPlacement(position, "output");
    const transform = poseToBlenderTransform({ centerXMeters: 0, centerYMeters: 0, elevationMeters: 0, headingDegrees: heading, pitchDegrees: 0, rollDegrees: 0 },
      { frameYawDegrees: 0, metersPerBlenderUnit: 1, originWorldMeters: { x: 0, y: 0, z: 0 } });
    // Blender local -Y facing, reflected into the website's downward-positive Y.
    const forward = { x: Math.sin(transform.rotationXYZ.z), y: Math.cos(transform.rotationXYZ.z) };
    const radians = heading * Math.PI / 180;
    const width = Math.abs(position.widthFeet * Math.cos(radians)) + Math.abs(position.depthFeet * Math.sin(radians));
    const height = Math.abs(position.widthFeet * Math.sin(radians)) + Math.abs(position.depthFeet * Math.cos(radians));
    const rear = { x: output.x - width * 16, y: output.y - height * 16 };
    assert.ok(rear.x * forward.x + rear.y * forward.y < 0, `Cable must be behind grille at ${heading} degrees`);
    assert.deepEqual(position.outputAnchor, { side: "top", offset: .5 });
    assert.equal(position.rotationDegrees, heading);
  }
});
