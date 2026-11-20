import type { PlotObject } from "./model";

export const stageViews = ["Overview", "Stand placement", "Cable patch and routing"] as const;
export type StageView = (typeof stageViews)[number];
export function viewLayers(view: StageView, overview: PlotLayers): PlotLayers {
  if (view === "Overview") return overview;
  return { people: false, stands: true, inputs: view !== "Stand placement", stageBoxes: view !== "Stand placement", cables: view === "Cable patch and routing" };
}
export const layerLabels = {
  people: "People",
  stands: "Stands",
  cables: "Cables",
  inputs: "Inputs",
  stageBoxes: "Stage boxes",
};
export type PlotLayers = Record<keyof typeof layerLabels, boolean>;
export const defaultLayers: PlotLayers = {
  people: true,
  stands: true,
  inputs: true,
  stageBoxes: true,
  cables: false,
};

const people = new Set(["joe", "chris", "sam", "brian", "jackson"]);

export function visibleObject(o: PlotObject, layers: PlotLayers) {
  const layer =
    o.layer ??
    (people.has(o.asset) ||
    (o.asset === "label" &&
      o.id.startsWith("name-") &&
      people.has(o.id.slice(5)))
      ? "people"
      : o.asset === "boom" || o.asset === "drum-boom" || o.asset === "hercules-gs414b-plus"
        ? "stands"
        : "equipment");
  return layer === "equipment" || layers[layer];
}
