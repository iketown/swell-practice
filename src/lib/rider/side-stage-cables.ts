import type { Plot } from "./model";
import { earRoutes, rackTableXlr, standardWirelessInputs } from "./rack-map";

// Summarize only complete, matching allocations. A different supplier, length,
// optional spare or nonstandard quantity stays in its normal equipment list.
export function sideStageCables(plot: Plot) {
  const included = new Set<string>();
  const monitors: string[] = [];
  const wireless: string[] = [];
  const map = plot.rackMap;
  if (map?.layout !== "s16-v2") return { included, monitors, wireless };

  const leads = new Map(plot.gear.filter(g =>
    g.provider === "Venue production" && g.required && g.spec === rackTableXlr
  ).map(g => [g.id, g.quantity]));

  function include(ids: string[], quantity = 1) {
    if (!ids.every(id => leads.get(id) === quantity)) return false;
    ids.forEach(id => included.add(id));
    return true;
  }

  const routes = earRoutes(map);
  for (const device of ["S16", "X32"]) {
    const mixes = routes.filter(m => m.device === device).sort((a, b) => a.out - b.out);
    const cableIds = mixes.flatMap(m => [m.bus, m.bus + 1].map(bus => "wl-iem-lead-" + bus));
    if (!mixes.length || !include(cableIds)) continue;
    const tx = mixes.map(m => m.tx).join(", ");
    monitors.push(device === "S16"
      ? `1 eight-channel XLR snake or 8 individual XLR cables · S16 OUT 1–8 → IEM TX ${tx} (one stereo pair each).`
      : `2 XLR cables · X32 Rack OUT 1/2 → IEM TX ${tx} L/R.`);
  }

  if (include(["rack-map-rx-patch"], 2))
    wireless.push("2 XLR cables · wireless mic receivers → splitter inputs 17 and 18.");
  if (include(["wl-mic-lead-1", "wl-mic-lead-2"])) {
    const ports = map.wirelessInputs ?? standardWirelessInputs;
    wireless.push(`2 XLR cables · splitter monitor tails 17 and 18 → X32 Rack inputs ${ports.join(" and ")}, respectively.`);
  }
  return { included, monitors, wireless };
}
