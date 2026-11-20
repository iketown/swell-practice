import type { Input, Plot, StageBox } from "./model";

export const boxColors = {
  Green: "#347549",
  Blue: "#315e9a",
  Red: "#a03c42",
  Violet: "#72509b",
  Amber: "#915b17",
  Teal: "#176c74",
} as const;

// Diagram coordinates use feet. The perimeter accommodates callouts outside the playing area.
export const plotPerimeter = { left: 4.4, right: 3.9, top: 2.8, bottom: 3.4 };
export const sideStageWidth = 5;
export const boxHeaderHeight = 0.62;
export const boxRowHeight = 0.64;

export function boxFrame(plot: Plot, box: StageBox, inputs: Input[]) {
  const compact = inputs.length > 0 && inputs.length <= 4;
  const columns = compact ? 2 : Math.max(3, Math.ceil(Math.sqrt(inputs.length / 1.4)));
  const rows = Math.max(1, Math.ceil(inputs.length / columns));
  const naturalWidth = compact ? 2 : Math.max(
    columns * 0.82,
    Math.min(6, box.label.length * 0.22 + 0.24),
  );
  // Let an onstage label use the available space when its channel cells already fit.
  const onstageSpace = plot.width - box.x - .05;
  const width = onstageSpace >= columns * .82 ? Math.min(naturalWidth, onstageSpace) : naturalWidth;
  const height = boxHeaderHeight + rows * boxRowHeight + 0.08;
  const inset = 0.18;
  const x = Math.max(
    -plotPerimeter.left + inset,
    Math.min(
      box.x,
      plot.width + sideStageWidth + plotPerimeter.right - width - inset,
    ),
  );
  const y = Math.max(
    -plotPerimeter.top + inset,
    Math.min(box.y, plot.depth + plotPerimeter.bottom - height - inset),
  );
  return { x, y, width, height, columns, cellWidth: width / columns };
}
