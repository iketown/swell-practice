import type { PlotObject } from "./model";

const names: Record<string, string> = {
  telecaster: "elec gtr",
  "telecaster-yellow": "elec gtr",
  "telecaster-green": "elec gtr",
  "mustang-blue": "bass",
  "acoustic-only": "aco gtr",
  bass: "bass",
  acoustic: "aco gtr",
  cello: "cello",
  sax: "sax",
};

export function instrumentLabel(object: PlotObject) {
  if (object.asset === "sennheiser-ek-iem-g4")
    return /^RX\d+/.exec(object.label)?.[0] ?? "IEM";
  if (object.layer === "people" || !names[object.asset]) return null;
  const backup = /^(?:backup|bckup)\s+(gtr|guitar|bass)(?:\s+([12]))?$/i.exec(
    object.label.trim(),
  );
  if (backup) {
    if (backup[1].toLowerCase() === "bass") return "bckup bass";
    return "bckup gtr" + (backup[2] ? " " + backup[2] : "");
  }
  return names[object.asset];
}
