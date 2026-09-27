import { duplicateKey, type MoneyEdit } from "@/lib/money/edits";
import { initialCategories, type MoneyCategory } from "@/lib/money/categories";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { MoneyError, validMoneyId } from "@/lib/server/money-auth";
import {
  assertDistribution,
  assertRefund,
  effectsFor,
  isExpenseKind,
  entrySchema,
  makeAssets,
  type MoneyDraft,
  type MoneyEntry,
  type MoneySnapshot,
} from "@/lib/money/domain";
import { type InventoryAsset } from "@/lib/gear/domain";

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_WEBHOOK_SECRET &&
    process.env.TELEGRAM_FINANCE_CHAT_ID &&
    process.env.TELEGRAM_IKE_USER_ID &&
    process.env.TELEGRAM_CHRIS_USER_ID &&
    process.env.OPEN_ROUTER_API_KEY &&
    process.env.MONEY_SITE_URL,
  );
}
export async function readMoney(): Promise<MoneySnapshot> {
  const db = getServerFirestore();
  // Keep balances and the visible ledger on the same database snapshot.
  return db.runTransaction(
    async (tx) => {
      const [ledger, drafts, inventory, categories, edits] = await Promise.all([
        tx.get(db.collection("moneyEntries")),
        tx.get(db.collection("moneyDrafts").where("status", "==", "pending")),
        tx.get(db.collection("inventoryAssets")),
        tx.get(db.doc("moneySettings/categories")),
        tx.get(db.collection("moneyEdits")),
      ]);
      return {
        edits: edits.docs
          .map((d) => ({ ...d.data(), id: d.id }) as MoneyEdit)
          .sort((a, b) => b.editedAt - a.editedAt),
        categories: categories.exists
          ? (categories.data()!.items as MoneyCategory[])
          : initialCategories(
              ledger.docs.map((d) => String(d.data().category ?? "")),
            ),
        entries: ledger.docs
          .map((d) => ({ ...d.data(), id: d.id }) as MoneyEntry)
          .sort(
            (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
          ),
        drafts: drafts.docs
          .map((d) => ({ ...d.data(), id: d.id }) as MoneyDraft)
          .sort((a, b) => b.createdAt - a.createdAt),
        assets: inventory.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as InventoryAsset,
        ),
        telegramConfigured: telegramConfigured(),
      };
    },
    { readOnly: true },
  );
}

export async function postMoney(
  raw: unknown,
  operationId: string,
  actor: string,
  source: "web" | "telegram",
  draftId?: string,
) {
  validMoneyId(operationId);
  if (draftId) validMoneyId(draftId);
  const input = entrySchema.parse(raw),
    db = getServerFirestore(),
    id = `money-${operationId}`;
  validMoneyId(id);
  const entryRef = db.doc(`moneyEntries/${id}`),
    operationRef = db.doc(`moneyOperations/${operationId}`);
  const requestHash = hash(input);
  const fingerprint = hash([
    isExpenseKind(input.kind) ? "purchase" : input.kind,
    input.date,
    input.amountCents,
    input.counterparty.trim().toLowerCase(),
    input.description.trim().toLowerCase(),
    input.funding,
    input.person,
  ]);
  return db.runTransaction(async (tx) => {
    const operation = await tx.get(operationRef);
    if (operation.exists) {
      if (operation.data()?.requestHash !== requestHash)
        throw new MoneyError(
          "This submission was already used for different details. Reload before making a new entry.",
          409,
        );
      return (await tx.get(entryRef)).data() as MoneyEntry;
    }
    const registryRef = db.doc("gearCodeRegistry/current"),
      duplicateRef = db.doc(`moneyFingerprints/${fingerprint}`);
    const [registry, inventory, ledger, categories] = await Promise.all([
      tx.get(registryRef),
      tx.get(db.collection("inventoryAssets")),
      tx.get(db.collection("moneyEntries")),
      tx.get(db.doc("moneySettings/categories")),
    ]);
    const entries = ledger.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as MoneyEntry,
    );
    const availableCategories: MoneyCategory[] = categories.exists
      ? categories.data()!.items
      : initialCategories(entries.map((e) => e.category));
    if (
      !availableCategories.some((c) => !c.deleted && c.name === input.category)
    )
      throw new MoneyError(
        "Choose an available category, or add one in Manage categories.",
        409,
      );
    const reversed = new Set(
      entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])),
    );
    const duplicate = entries.find(
      (e) =>
        e.kind !== "reversal" &&
        !reversed.has(e.id) &&
        duplicateKey(e) === duplicateKey(input),
    );
    if (duplicate && !input.duplicateReason)
      throw new MoneyError(
        `Possible duplicate of ${duplicate.id}. Review it, or enter a reason this is a separate payment.`,
        409,
      );
    if (input.kind === "purchase" && input.vendorOrderNumber && entries.some((e) =>
      e.kind === "purchase" && !reversed.has(e.id) &&
      e.vendorOrderNumber?.toLowerCase() === input.vendorOrderNumber.toLowerCase() &&
      e.counterparty.trim().toLowerCase() === input.counterparty.trim().toLowerCase()
    ))
      throw new MoneyError("This vendor order already has a ledger purchase. Open that transaction instead.", 409);
    try {
      assertRefund(input, entries);
      assertDistribution(input, entries);
    } catch (error) {
      throw new MoneyError((error as Error).message);
    }
    const receipts = input.receiptIds.length
      ? await tx.getAll(
          ...input.receiptIds.map((r) => db.doc(`moneyReceipts/${r}`)),
        )
      : [];
    if (receipts.some((r) => !r.exists))
      throw new MoneyError("A receipt could not be found. Attach it again.");
    if (
      isExpenseKind(input.kind) &&
      receipts.some(
        (r) =>
          r.data()?.purchaseEntryId && !reversed.has(r.data()?.purchaseEntryId),
      )
    )
      throw new MoneyError(
        "This receipt is already attached to a purchase or band member payment. Open that transaction instead.",
        409,
      );
    const definitionIds = [
      ...new Set(input.gear.map((g) => g.definitionId).filter(Boolean)),
    ];
    const definitions = definitionIds.length
      ? await tx.getAll(
          ...definitionIds.map((d) =>
            db.doc(`equipmentTemplates/${validMoneyId(d)}`),
          ),
        )
      : [];
    if (definitions.some((d) => !d.exists))
      throw new MoneyError("A selected gear definition no longer exists.");
    for (const line of input.gear) {
      const definition = definitions.find((d) => d.id === line.definitionId);
      if (
        definition &&
        line.isCable !== (definition.data()?.definitionKind === "cable")
      )
        throw new MoneyError(
          "The selected definition does not match the gear kind.",
        );
    }
    const draft = draftId
      ? await tx.get(db.doc(`moneyDrafts/${draftId}`))
      : null;
    if (draft && (!draft.exists || draft.data()?.status !== "pending"))
      throw new MoneyError(
        "This draft was already handled. Reload Money.",
        409,
      );
    const order = input.purchaseOrderId
      ? await tx.get(db.doc(`purchaseOrders/${input.purchaseOrderId}`))
      : null;
    if (order && !order.exists)
      throw new MoneyError("The purchase order no longer exists.");
    if (
      input.purchaseOrderId &&
      entries.some(
        (e) =>
          e.kind === "purchase" &&
          e.purchaseOrderId === input.purchaseOrderId &&
          !reversed.has(e.id),
      )
    )
      throw new MoneyError(
        "This order already has a ledger purchase. Open that transaction to correct it.",
        409,
      );
    const allAssets = inventory.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as InventoryAsset,
    );
    const orderAssets = order
      ? ((order.data()?.lines ?? []) as Array<{ assetIds?: string[] }>).flatMap(
          (l) => l.assetIds ?? [],
        )
      : [];
    const linkedIds = [...new Set([...input.existingAssetIds, ...orderAssets])];
    const linked = linkedIds.map((assetId) =>
      allAssets.find((a) => a.id === assetId),
    );
    if (linked.some((a) => !a))
      throw new MoneyError(
        "Some linked gear was removed. Review the purchase.",
      );
    if (linked.some((a) => a?.moneyEntryId && !reversed.has(a.moneyEntryId)))
      throw new MoneyError(
        "Some of this gear already belongs to another ledger entry. Open that entry instead.",
        409,
      );
    if (linkedIds.length + input.gear.reduce((n, g) => n + g.quantity, 0) > 100)
      throw new MoneyError("Link no more than 100 pieces of gear at once.");
    const usedCodes = [
      ...(registry.data()?.usedCodes ?? []),
      ...allAssets.map((a) => a.assetTag),
    ];
    const now = Date.now(),
      newAssets = makeAssets(input, id, usedCodes, now);
    const assets = [...(linked as InventoryAsset[]), ...newAssets];
    if (
      assets.some((a) => !/^\d{4}$/.test(a.assetTag) || a.assetTag === "0000")
    )
      throw new MoneyError(
        "Open Gear once to finish assigning four-digit codes, then record this purchase.",
      );
    const entry: MoneyEntry = {
      ...input,
      id,
      effects: effectsFor(input),
      createdAt: now,
      createdBy: actor,
      source,
      assetIds: assets.map((a) => a.id),
      assetTags: assets.map((a) => a.assetTag),
    };
    // No write happens until every reference, duplicate and refund check succeeds.
    tx.create(entryRef, clean(entry));
    tx.create(operationRef, { requestHash, entryId: id, createdAt: now });
    tx.set(duplicateRef, { entryId: id });
    if (newAssets.length)
      tx.set(registryRef, {
        usedCodes: [
          ...new Set([...usedCodes, ...newAssets.map((a) => a.assetTag)]),
        ],
      });
    for (const asset of newAssets) {
      tx.create(db.doc(`inventoryAssets/${asset.id}`), clean(asset));
      tx.set(db.doc(`gearPublicAssets/${asset.assetTag}`), {
        assetTag: asset.assetTag,
        label: asset.label,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const asset of linked as InventoryAsset[])
      tx.update(db.doc(`inventoryAssets/${asset.id}`), {
        moneyEntryId: id,
        ownerPartyId:
          input.kind === "loaned_gear"
            ? input.person === "ike"
              ? "party-ike"
              : "party-cron"
            : "party-the-swell",
        updatedAt: FieldValue.serverTimestamp(),
      });
    if (isExpenseKind(input.kind))
      for (const receipt of receipts)
        tx.update(receipt.ref, { purchaseEntryId: id });
    if (draftId)
      tx.update(db.doc(`moneyDrafts/${draftId}`), {
        status: "posted",
        entryId: id,
        resolvedBy: actor,
        resolvedAt: now,
      });
    return entry;
  });
}

export async function attachMoneyReceipt(
  entryId: string,
  receiptId: string,
  actor: string,
) {
  validMoneyId(entryId);
  validMoneyId(receiptId);
  const db = getServerFirestore();
  return db.runTransaction(async (tx) => {
    const entryRef = db.doc(`moneyEntries/${entryId}`);
    const receiptRef = db.doc(`moneyReceipts/${receiptId}`);
    const [record, receipt] = await Promise.all([
      tx.get(entryRef),
      tx.get(receiptRef),
    ]);
    if (!record.exists) throw new MoneyError("Transaction not found.", 404);
    if (!receipt.exists)
      throw new MoneyError("Receipt not found. Upload it again.", 404);
    const entry = record.data() as MoneyEntry;
    if (entry.kind === "reversal")
      throw new MoneyError(
        "Add receipts to the original transaction, not its reversal.",
      );
    if (entry.receiptIds.includes(receiptId)) return entry;
    if (entry.receiptIds.length >= 10)
      throw new MoneyError("A transaction can have up to 10 receipts.");
    // Keep the same receipt reuse protection as initial purchase posting.
    const linkedId = receipt.data()?.purchaseEntryId as string | undefined;
    if (isExpenseKind(entry.kind) && linkedId && linkedId !== entryId) {
      const reversal = await tx.get(
        db.doc(`moneyEntries/reverse-${validMoneyId(linkedId)}`),
      );
      if (!reversal.exists)
        throw new MoneyError(
          "This receipt is already attached to another purchase or band member payment. Open that transaction instead.",
          409,
        );
    }
    const patch = {
      receiptIds: [...entry.receiptIds, receiptId],
      receiptAttachments: [
        ...(entry.receiptAttachments ?? []),
        { receiptId, addedBy: actor, addedAt: Date.now() },
      ],
    };
    tx.update(entryRef, patch);
    if (isExpenseKind(entry.kind))
      tx.update(receiptRef, { purchaseEntryId: entryId });
    return { ...entry, ...patch };
  });
}

export async function reverseMoney(id: string, reason: string, actor: string) {
  validMoneyId(id);
  if (!reason.trim() || reason.length > 1000)
    throw new MoneyError("Describe why this entry is being reversed.");
  const db = getServerFirestore();
  return db.runTransaction(async (tx) => {
    const originalRef = db.doc(`moneyEntries/${id}`),
      reverseRef = db.doc(`moneyEntries/reverse-${id}`);
    const [original, existing, ledger] = await Promise.all([
      tx.get(originalRef),
      tx.get(reverseRef),
      tx.get(db.collection("moneyEntries")),
    ]);
    if (existing.exists) return existing.data() as MoneyEntry;
    if (!original.exists || original.data()?.kind === "reversal")
      throw new MoneyError("Choose an original transaction to reverse.");
    const reversed = new Set(
      ledger.docs.map((d) => d.data().reversesId).filter(Boolean),
    );
    if (
      ledger.docs.some(
        (d) =>
          d.data().kind === "refund" &&
          d.data().relatedEntryId === id &&
          !reversed.has(d.id),
      )
    )
      throw new MoneyError(
        "Reverse the linked refunds before reversing this purchase.",
      );
    const entry = original.data() as MoneyEntry;
    const reversal: MoneyEntry = {
      ...entry,
      id: reverseRef.id,
      kind: "reversal",
      reversesId: id,
      description: `Reversal: ${entry.description}`,
      notes: reason.trim(),
      source: "web",
      createdBy: actor,
      createdAt: Date.now(),
      effects: Object.fromEntries(
        Object.entries(entry.effects).map(([k, v]) => [k, -v]),
      ) as unknown as MoneyEntry["effects"],
    };
    tx.create(reverseRef, reversal);
    return reversal;
  });
}

export const detailsSchema = z.object({
  assetIds: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/))
    .min(1)
    .max(100),
  definitionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  lengthInches: z.number().positive().max(120000).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  label: z.string().trim().min(1).max(160).optional(),
});
export async function updateMoneyGear(
  entryId: string,
  raw: unknown,
  actor: string,
) {
  validMoneyId(entryId);
  const input = detailsSchema.parse(raw),
    db = getServerFirestore();
  await db.runTransaction(async (tx) => {
    const entry = await tx.get(db.doc(`moneyEntries/${entryId}`));
    if (!entry.exists) throw new MoneyError("Transaction not found.", 404);
    const records = await tx.getAll(
      ...input.assetIds.map((id) => db.doc(`inventoryAssets/${id}`)),
    );
    const definition = input.definitionId
      ? await tx.get(db.doc(`equipmentTemplates/${input.definitionId}`))
      : null;
    if (definition && !definition.exists)
      throw new MoneyError("Gear definition not found.");
    if (
      records.some(
        (r) => !r.exists || !(entry.data()?.assetIds ?? []).includes(r.id),
      )
    )
      throw new MoneyError("Select gear linked to this transaction.");
    const patches = records.map((record) => {
      const old = record.data()!,
        isCable = (old.tags ?? []).includes("Cables");
      if (
        definition &&
        isCable !== (definition.data()?.definitionKind === "cable")
      )
        throw new MoneyError(
          "Choose a definition of the same kind as the selected gear.",
        );
      const patch = {
        ...(input.definitionId ? { definitionId: input.definitionId } : {}),
        ...(input.lengthInches && isCable
          ? { cableLengthInches: input.lengthInches }
          : {}),
        ...(input.manufacturer !== undefined
          ? { cableManufacturer: input.manufacturer }
          : {}),
        ...(input.label ? { label: input.label } : {}),
      };
      const next = { ...old, ...patch };
      return {
        record,
        old,
        patch: {
          ...patch,
          detailsNeeded:
            !next.definitionId || (isCable && !next.cableLengthInches),
          updatedAt: FieldValue.serverTimestamp(),
        },
      };
    });
    for (const { record, old, patch } of patches) {
      tx.update(record.ref, patch);
      if (input.label)
        tx.set(db.doc(`gearPublicAssets/${old.assetTag}`), {
          assetTag: old.assetTag,
          label: input.label,
          updatedAt: FieldValue.serverTimestamp(),
        });
    }
    tx.create(db.collection("moneyGearEdits").doc(), {
      entryId,
      actor,
      changes: clean(input),
      before: clean(
        patches.map((p) => ({
          id: p.record.id,
          definitionId: p.old.definitionId ?? "",
          lengthInches: p.old.cableLengthInches ?? null,
          label: p.old.label ?? "",
          manufacturer: p.old.cableManufacturer ?? "",
        })),
      ),
      createdAt: Date.now(),
    });
  });
}
