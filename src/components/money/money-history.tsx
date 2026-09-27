"use client";
import { KINDS, PEOPLE, money } from "@/lib/money/domain";
import type { MoneyEdit, MoneyEditFields } from "@/lib/money/edits";

const labels: Record<keyof MoneyEditFields, string> = {
  kind: "Transaction type",
  date: "Payment date",
  description: "Description",
  counterparty: "Merchant / recipient",
  category: "Category",
  amountCents: "Amount",
  funding: "Who paid",
  person: "Partner",
  notes: "Notes",
  vendorOrderNumber: "Vendor order number",
  relatedEntryId: "Original purchase",
  duplicateReason: "Duplicate explanation",
};
function display(fields: MoneyEditFields, key: keyof MoneyEditFields) {
  if (key === "kind") return KINDS[fields.kind];
  if (key === "amountCents") return money(fields.amountCents);
  if (key === "person") return PEOPLE[fields.person];
  if (key === "funding")
    return (
      Object.entries(fields.funding)
        .filter(([, amount]) => amount)
        .map(
          ([person, amount]) =>
            `${person === "company" ? "The Swell" : PEOPLE[person as keyof typeof PEOPLE]}: ${money(amount)}`,
        )
        .join(" · ") || "No personal or company payment split"
    );
  return String(fields[key] || "—");
}
export function MoneyHistory({ edits }: { edits: MoneyEdit[] }) {
  return (
    <section className="swell-panel p-5 sm:p-6" aria-label="Change history">
      <h2 className="text-lg font-semibold">Change history</h2>
      {!edits.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No edits yet. Saved changes will show the previous and new values
          here.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-5">
          {[...edits]
            .sort((a, b) => b.revision - a.revision)
            .map((edit) => (
              <li key={edit.id}>
                <details
                  open={
                    edit.revision === Math.max(...edits.map((e) => e.revision))
                  }
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Edit {edit.revision} ·{" "}
                    {new Date(edit.editedAt).toLocaleString()}
                  </summary>
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Edited by {edit.editedBy}
                  </p>
                  {edit.reason ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {edit.reason}
                    </p>
                  ) : null}
                  <dl className="mt-3 flex flex-col gap-3">
                    {(Object.keys(labels) as Array<keyof MoneyEditFields>)
                      .filter(
                        (key) =>
                          JSON.stringify(edit.before[key]) !==
                          JSON.stringify(edit.after[key]),
                      )
                      .map((key) => (
                        <div key={key} className="min-w-0">
                          <dt className="text-sm font-medium">{labels[key]}</dt>
                          <dd className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
                            <div className="min-w-0 whitespace-pre-wrap break-words text-muted-foreground">
                              <span className="font-medium">Before: </span>
                              {display(edit.before, key)}
                            </div>
                            <div className="min-w-0 whitespace-pre-wrap break-words">
                              <span className="font-medium">After: </span>
                              {display(edit.after, key)}
                            </div>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
