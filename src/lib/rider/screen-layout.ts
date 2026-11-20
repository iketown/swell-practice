import type { Plot } from "./model";

export function overviewPoint<T extends { overviewPosition?: { x: number; y: number } }>(point: T): T {
  return point.overviewPosition ? { ...point, ...point.overviewPosition } : point;
}

export function overviewPlot(plot: Plot): Plot {
  return { ...plot, objects: plot.objects.map(overviewPoint), inputs: plot.inputs.map(overviewPoint) };
}

// Scale decorative artwork around its physical anchor, so screen zoom/spacing
// cannot separate a stand base or cable attachment from its saved stage point.
export const screenStageSpacing = 1.2;

export function symbolTransform(
  x: number,
  y: number,
  scale: number,
  width = 0,
  height = 0,
  anchor = { x: width / 2, y: height / 2 },
) {
  if (scale === 1) return `translate(${x} ${y})`;
  return `translate(${x + anchor.x * (1 - scale)} ${y + anchor.y * (1 - scale)}) scale(${scale})`;
}
