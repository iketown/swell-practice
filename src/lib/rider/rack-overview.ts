import { boxCode } from "./rack-inputs";
import type { Plot } from "./model";
import type { StageView } from "./plot-layers";
import { boxFrame } from "./stage-box";

export const rackOverviewWidth = 13;
export function rackCable(run: Plot["cables"][number]) {
  return /^wl-(mic|iem)-lead-\d+$/.test(run.gearId ?? "");
}

export function rackOverview(plot: Plot, view: StageView) {
  if (view !== "Cable patch and routing" || !plot.rackMap?.s16Inputs) return null;
  const boxes = plot.stageBoxes.flatMap(box => {
    const members = plot.inputs.filter(input => input.stageBoxId === box.id);
    if (!members.some(input => input.number <= 16)) return [];
    return [{ ...boxFrame(plot, box, members), id: box.id, label: box.label, code: boxCode(box.label) }];
  }).sort((a, b) => a.x - b.x);
  const sideBoxes = boxes.filter(box => box.x >= plot.width);
  const top = Math.max(6.5, ...sideBoxes.map(box => box.y + box.height + .65));
  const rear = Math.min(-1.65, ...boxes.map(box => box.y - .55));
  const devices = new Set(plot.cables.filter(rackCable).flatMap(run => [run.fromId, run.toId]));
  for (const gear of plot.gear) {
    if (gear.id === "rack-map-s16" || gear.id === "rack-map-split") {
      for (const id of gear.plotIds ?? []) devices.add(id);
    }
  }
  return { playbackCount: plot.rackMap.housePorts?.length ?? 3, boxes, devices, top, rear, bottom: top + 12.4 };
}
export type RackOverview = NonNullable<ReturnType<typeof rackOverview>>;
