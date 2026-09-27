import { randomUUID } from "node:crypto";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import {
  categoryActionSchema,
  changeCategories,
  initialCategories,
  type MoneyCategory,
} from "@/lib/money/categories";
import { MoneyError } from "@/lib/server/money-auth";

export async function readMoneyCategories(): Promise<MoneyCategory[]> {
  const db = getServerFirestore();
  return db.runTransaction(
    async (tx) => {
      const doc = await tx.get(db.doc("moneySettings/categories"));
      if (doc.exists) return doc.data()!.items as MoneyCategory[];
      const entries = await tx.get(db.collection("moneyEntries"));
      return initialCategories(
        entries.docs.map((d) => String(d.data().category ?? "")),
      );
    },
    { readOnly: true },
  );
}

// Existing catalogs predate the assistant's meal workflow. Respect a category
// an admin previously deleted instead of silently restoring it.
export async function ensureMealsCategory(actor: string): Promise<void> {
  const db = getServerFirestore();
  const ref = db.doc("moneySettings/categories");
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return; // initialCategories already includes Meals.
    const items = doc.data()!.items as MoneyCategory[];
    if (items.some((category) => category.name.toLowerCase() === "meals")) return;
    if (items.length >= 500) return;
    tx.set(ref, {
      items: [...items, { id: "category-meals", name: "Meals", deleted: false }],
      updatedAt: Date.now(), updatedBy: actor,
    });
  });
}

export async function updateMoneyCategories(
  raw: unknown,
  actor: string,
): Promise<MoneyCategory[]> {
  const action = categoryActionSchema.parse(raw);
  const db = getServerFirestore();
  const ref = db.doc("moneySettings/categories");
  const newId = randomUUID();
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    // Carry forward custom labels from the original free-text category field.
    const legacy = doc.exists
      ? []
      : (await tx.get(db.collection("moneyEntries"))).docs.map((d) =>
          String(d.data().category ?? ""),
        );
    const current: MoneyCategory[] = doc.exists
      ? doc.data()!.items
      : initialCategories(legacy);
    let items: MoneyCategory[];
    try {
      items = changeCategories(current, action, newId);
    } catch (error) {
      throw new MoneyError((error as Error).message, 409);
    }
    tx.set(ref, { items, updatedAt: Date.now(), updatedBy: actor });
    return items;
  });
}
