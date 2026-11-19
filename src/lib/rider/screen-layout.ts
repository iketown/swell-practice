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
