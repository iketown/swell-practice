import { stageAnchor } from "./placement";
import type { Plot } from "./model";
import type { StageView } from "./plot-layers";
import { boxFrame, sideStageWidth } from "./stage-box";

// Crop spare editing space, not physical geometry. Keep real outlying equipment,
// box frames and cable nodes in print even when a version uses the stage margins.
export function printFrame(p: Plot, view: StageView) {
  let left = -1.1, top = -1.05;
  let right = p.width + sideStageWidth + 0.2, bottom = p.depth + 2.4;
  function include(x: number, y: number, w = 0, h = 0) {
    left = Math.min(left, x - 0.2);
    top = Math.min(top, y - 0.2);
    right = Math.max(right, x + w + 0.2);
    bottom = Math.max(bottom, y + h + 0.2);
  }
  for (const o of p.objects) {
    include(o.x, o.y, o.w, o.h + 0.5);
    if (view === "Stand placement" && (o.layer === "stands" || ["boom", "drum-boom", "drum-rug", "hercules-gs414b-plus"].includes(o.asset))) {
      const { x, y } = stageAnchor(o);
      include(x - 3.5, y - .55, 7, 3.55);
    }
  }
  if (view !== "Stand placement") {
    for (const input of p.inputs) include(input.x - 0.5, input.y - 0.6, 1, 1.2);
    for (const box of p.stageBoxes) {
      const frame = boxFrame(p, box, p.inputs.filter((input) => input.stageBoxId === box.id));
      include(frame.x, frame.y, frame.width, frame.height);
    }
  }
  if (view === "Cable patch and routing") {
    const used = new Set(p.cables.flatMap((run) => run.nodeIds));
    for (const node of p.cableNodes) if (used.has(node.id)) include(node.x, node.y);
  }
  return [left, top, right - left, bottom - top].join(" ");
}
