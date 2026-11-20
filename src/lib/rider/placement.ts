import type { PlotObject } from "./model";

export function riserDimensions(o: PlotObject) {
  return `${o.w}′ × ${o.h}′ · ${o.riserHeightInches}″ high`;
}

export function objectAnchor(o: Pick<PlotObject, "asset" | "layer" | "w" | "h" | "placement">) {
  return o.placement ?? {
    x: o.w / 2,
    y: o.asset === "drum-rug" ? o.h : o.asset === "hercules-gs414b-plus" ? o.h * .75 :
      o.layer === "stands" || o.asset === "boom" || o.asset === "drum-boom" || o.asset === "hercules-gs414b-plus" ? o.h * 0.85 : o.h / 2,
  };
}
export function stageAnchor(o: PlotObject) {
  const anchor = objectAnchor(o);
  return { x: o.x + anchor.x, y: o.y + anchor.y };
}

export function withAnchor(o: PlotObject, anchor: { x: number; y: number }): PlotObject {
  const fixed = stageAnchor(o);
  return { ...o, x: fixed.x - anchor.x, y: fixed.y - anchor.y, placement: anchor };
}
