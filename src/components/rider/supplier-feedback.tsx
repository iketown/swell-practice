"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { allocationPoints } from "@/lib/rider/equipment";
import { quantityText, rollup, type Plot, type Provider } from "@/lib/rider/model";

const sections: { provider: Provider; title: string; side: "left" | "right" }[] = [
  { provider: "The Swell", title: "The Swell brings", side: "left" },
  { provider: "To confirm", title: "To confirm", side: "left" },
  { provider: "Backline", title: "Backline brings", side: "right" },
  { provider: "Venue production", title: "Venue production provides", side: "right" },
];

export function SupplierFeedback({
  plot,
  onHighlight,
  onReview,
}: {
  plot: Plot;
  onHighlight: (ids: string[]) => void;
  onReview: (allocationId: string) => void;
}) {
  // Always use the complete live draft, independent of the equipment tab filters.
  const totals = rollup(plot.gear);
  return (
    <div className="supplier-feedback">
      {(["left", "right"] as const).map((side) => (
        <aside
          key={side}
          className={`supplier-rail supplier-rail-${side}`}
          aria-label={side === "left" ? "Band and unassigned equipment" : "Production suppliers"}
        >
          <p className="supplier-rail-heading">Supply plan <span>Live draft</span></p>
          <Accordion.Root
            className="supplier-accordion"
            multiple
            defaultValue={side === "left" ? ["The Swell"] : ["Backline", "Venue production"]}
          >
            {sections.filter((section) => section.side === side).map(({ provider, title }) => {
              const rows = totals.filter((g) => g.provider === provider);
              const allocations = rows.reduce((count, g) => count + g.allocations.length, 0);
              return (
                <Accordion.Item key={provider} value={provider} className="supplier-section">
                  <Accordion.Header>
                    <Accordion.Trigger className="supplier-trigger">
                      <span>{title}<small>{allocations} {allocations === 1 ? "requirement" : "requirements"}</small></span>
                      <ChevronDown aria-hidden="true" size={16} />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Panel className="supplier-panel">
                    {rows.length ? (
                      <ul>
                        {rows.map((group) => {
                          const ids = group.allocations.map((g) => g.id);
                          const points = allocationPoints(plot, ids);
                          const inputs = [...new Set(group.allocations.flatMap((g) => g.sourceIds))]
                            .map((id) => plot.inputs.find((i) => i.id === id)?.number)
                            .filter((n) => n !== undefined)
                            .sort((a, b) => a - b);
                          return (
                            <li key={ids[0]} data-supplier-allocation={ids[0]}>
                              <button
                                type="button"
                                className="supplier-equipment"
                                aria-label={`Review ${provider}: ${group.spec || group.item}`}
                                onMouseEnter={() => onHighlight(points)}
                                onMouseLeave={() => onHighlight([])}
                                onFocus={() => onHighlight(points)}
                                onBlur={() => onHighlight([])}
                                onClick={() => onReview(ids[0])}
                              >
                                <b className="supplier-quantity">{quantityText(group)}</b>
                                <span>
                                  <strong>{group.item}</strong>
                                  {group.spec && <small>{group.spec}</small>}
                                  <small>{[[...group.stations].join(", "), inputs.map((n) => "#" + n).join(", ")].filter(Boolean).join(" · ")}</small>
                                  <small className="supplier-status">
                                    {!group.required ? "Need to confirm" : group.unknown ? "Quantity to confirm" : group.confirmed ? "Confirmed" : "Planned"}
                                  </small>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="supplier-empty">No equipment assigned yet.</p>}
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion.Root>
          <p className="supplier-rail-note">Select a requirement to review its allocations. TBD quantities still need confirmation.</p>
        </aside>
      ))}
    </div>
  );
}
