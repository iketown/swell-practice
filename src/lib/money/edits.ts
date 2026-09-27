import { z } from "zod";
import {
  assertDistribution,
  assertRefund,
  effectsFor,
  entrySchema,
  isExpenseKind,
  totals,
  type MoneyEntry,
} from "@/lib/money/domain";
import type { MoneyCategory } from "@/lib/money/categories";

const shape = entrySchema.shape;
export const editFieldsSchema = z
  .object({
    kind: shape.kind,
    date: shape.date,
    description: shape.description,
    counterparty: shape.counterparty,
    category: shape.category,
    amountCents: shape.amountCents,
    funding: shape.funding,
    person: shape.person,
    notes: shape.notes,
    vendorOrderNumber: shape.vendorOrderNumber,
    relatedEntryId: shape.relatedEntryId,
    duplicateReason: shape.duplicateReason,
  })
  .strict();
export type MoneyEditFields = z.infer<typeof editFieldsSchema>;
export const editRequestSchema = z.object({
  fields: editFieldsSchema,
  revision: z.number().int().min(0),
  operationId: z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  reason: z.string().trim().max(1000).default(""),
});
export type MoneyEditRequest = z.infer<typeof editRequestSchema>;
export interface MoneyEdit {
  id: string;
  entryId: string;
  revision: number;
  editedAt: number;
  editedBy: string;
  reason: string;
  before: MoneyEditFields;
  after: MoneyEditFields;
}
export function editableFields(
  entry: MoneyEntry | MoneyEditFields,
): MoneyEditFields {
  return editFieldsSchema.parse(
    Object.fromEntries(
      Object.keys(editFieldsSchema.shape).map((key) => [
        key,
        entry[key as keyof typeof entry],
      ]),
    ),
  );
}
export function duplicateKey(entry: MoneyEditFields | MoneyEntry) {
  return JSON.stringify([
    isExpenseKind(entry.kind) ? "purchase" : entry.kind,
    entry.date,
    entry.amountCents,
    entry.counterparty.trim().toLowerCase(),
    entry.description.trim().toLowerCase(),
    entry.funding.ike,
    entry.funding.chris,
    entry.funding.company,
    entry.person,
  ]);
}
export function prepareMoneyEdit(
  original: MoneyEntry,
  request: MoneyEditRequest,
  entries: MoneyEntry[],
  categories: MoneyCategory[],
) {
  const reversed = new Set(
    entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])),
  );
  if (original.kind === "reversal" || reversed.has(original.id))
    throw new Error(
      "This transaction has been reversed. Edit its active replacement instead.",
    );
  if ((original.revision ?? 0) !== request.revision)
    throw new Error(
      "This transaction changed while you were editing. Cancel and reopen Edit transaction to load the latest version.",
    );
  const fields = editFieldsSchema.parse(request.fields);
  if (
    fields.category !== original.category &&
    !categories.some((c) => !c.deleted && c.name === fields.category)
  )
    throw new Error("Choose an available category or add one first.");
  if (
    (original.assetIds.length || original.purchaseOrderId) &&
    fields.kind !== original.kind
  )
    throw new Error(
      "This transaction has linked gear. Its type must stay the same to preserve gear ownership.",
    );
  if (
    original.kind === "loaned_gear" &&
    original.assetIds.length &&
    fields.person !== original.person
  )
    throw new Error(
      "Changing the owner of loaned gear requires an ownership correction, not a financial edit.",
    );
  const input = entrySchema.parse({ ...original, ...fields });
  const next = { ...original, ...input, effects: effectsFor(input) };
  const other = entries.filter((e) => e.id !== original.id);
  if (next.kind === "purchase" && next.vendorOrderNumber && other.some((entry) =>
    entry.kind === "purchase" && !reversed.has(entry.id) &&
    entry.vendorOrderNumber?.toLowerCase() === next.vendorOrderNumber.toLowerCase() &&
    entry.counterparty.trim().toLowerCase() === next.counterparty.trim().toLowerCase()
  ))
    throw new Error("This vendor order already has a ledger purchase.");
  if (
    !fields.duplicateReason &&
    other.some(
      (e) =>
        e.kind !== "reversal" &&
        !reversed.has(e.id) &&
        duplicateKey(e) === duplicateKey(next),
    )
  )
    throw new Error(
      "Possible duplicate. Enter a reason if this is a separate payment.",
    );
  const ledger = [...other, next];
  for (const refund of ledger.filter(
    (e) => e.kind === "refund" && !reversed.has(e.id),
  ))
    assertRefund(
      { ...refund, kind: "refund" },
      ledger.filter((e) => e.id !== refund.id),
    );
  if (
    Object.keys(next.effects).some(
      (key) =>
        next.effects[key as keyof typeof next.effects] !==
        original.effects[key as keyof typeof original.effects],
    ) ||
    next.kind !== original.kind
  ) {
    assertDistribution(input, other);
    if (ledger.some((e) => e.kind === "distribution" && !reversed.has(e.id))) {
      const before = totals(entries),
        after = totals(ledger);
      if (
        after.ike > Math.max(0, before.ike) ||
        after.chris > Math.max(0, before.chris)
      )
        throw new Error(
          "This edit would increase unpaid owner advances while profit distributions are recorded. Correct the related repayments or distributions first.",
        );
    }
  }
  return next;
}
