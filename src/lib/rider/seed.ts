import initial from "./initial.json";
import { plotSchema, type Published } from "./model";

export function initialRider(): Published {
  return { revision: 0, date: "2026-11-16", plot: plotSchema.parse(initial) };
}
