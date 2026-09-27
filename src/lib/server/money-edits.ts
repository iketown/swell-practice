import { createHash } from "node:crypto";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { MoneyError, validMoneyId } from "@/lib/server/money-auth";
import { initialCategories, type MoneyCategory } from "@/lib/money/categories";
import { isExpenseKind, type MoneyEntry } from "@/lib/money/domain";
import {
  editRequestSchema,
  editableFields,
  prepareMoneyEdit,
  type MoneyEdit,
} from "@/lib/money/edits";

export async function editMoney(entryId: string, raw: unknown, actor: string) {
  validMoneyId(entryId);
  const request = editRequestSchema.parse(raw);
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ entryId, ...request }))
    .digest("hex");
  const db = getServerFirestore();
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`moneyEntries/${entryId}`);
    const editRef = db.doc(`moneyEdits/${request.operationId}`);
    const [record, operation, ledger, catalog] = await Promise.all([
      tx.get(ref),
      tx.get(editRef),
      tx.get(db.collection("moneyEntries")),
      tx.get(db.doc("moneySettings/categories")),
    ]);
    if (!record.exists) throw new MoneyError("Transaction not found.", 404);
    const original = record.data() as MoneyEntry;
    if (operation.exists) {
      if (operation.data()?.requestHash !== requestHash)
        throw new MoneyError(
          "This edit was already submitted with different details. Reopen the editor.",
          409,
        );
      return original;
    }
    const entries = ledger.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as MoneyEntry,
    );
    const categories: MoneyCategory[] = catalog.exists
      ? catalog.data()!.items
      : initialCategories(entries.map((e) => e.category));
    let next: MoneyEntry;
    try {
      next = prepareMoneyEdit(original, request, entries, categories);
    } catch (error) {
      throw new MoneyError((error as Error).message, 409);
    }
    const before = editableFields(original),
      after = editableFields(next);
    if (JSON.stringify(before) === JSON.stringify(after)) return original;
    const receipts = original.receiptIds.length
      ? await tx.getAll(
          ...original.receiptIds.map((id) =>
            db.doc(`moneyReceipts/${validMoneyId(id)}`),
          ),
        )
      : [];
    const reversed = new Set(
      entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])),
    );
    if (
      isExpenseKind(next.kind) &&
      receipts.some(
        (r) =>
          r.data()?.purchaseEntryId &&
          r.data()?.purchaseEntryId !== entryId &&
          !reversed.has(r.data()!.purchaseEntryId),
      )
    )
      throw new MoneyError(
        "A receipt on this transaction already belongs to another purchase or band member payment.",
        409,
      );
    const now = Date.now(),
      revision = (original.revision ?? 0) + 1;
    const edit: MoneyEdit = {
      id: request.operationId,
      entryId,
      revision,
      editedAt: now,
      editedBy: actor,
      reason: request.reason,
      before,
      after,
    };
    const patch = {
      ...after,
      effects: next.effects,
      revision,
      updatedAt: now,
      updatedBy: actor,
    };
    // Only financial/description fields change; concurrent receipt additions and gear links survive.
    tx.update(ref, patch);
    tx.create(editRef, { ...edit, requestHash });
    for (const receipt of receipts) {
      if (!receipt.exists) continue;
      if (isExpenseKind(next.kind))
        tx.update(receipt.ref, { purchaseEntryId: entryId });
      else if (receipt.data()?.purchaseEntryId === entryId) {
        // Empty is treated as unclaimed by all posting/attachment checks.
        tx.update(receipt.ref, { purchaseEntryId: "" });
      }
    }
    return { ...original, ...patch };
  });
}
