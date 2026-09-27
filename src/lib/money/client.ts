"use client";
import {
  changeCategories,
  initialCategories,
  type MoneyCategory,
  type CategoryAction,
} from "@/lib/money/categories";
import {
  editRequestSchema,
  editableFields,
  prepareMoneyEdit,
  type MoneyEdit,
  type MoneyEditRequest,
} from "@/lib/money/edits";
import { auth } from "@/lib/firebase";
import { readDemoStore, writeDemoStore } from "@/lib/gear/repository";
import {
  assertDistribution,
  assertRefund,
  effectsFor,
  isExpenseKind,
  entrySchema,
  makeAssets,
  type EntryInput,
  type MoneyDraft,
  type MoneyEntry,
  type MoneySnapshot,
} from "@/lib/money/domain";
const KEY = "swell-parts:money:demo:v1";
export async function moneyRequest<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  if (!auth?.currentUser) throw new Error("Sign in as an administrator.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  if (typeof init.body === "string")
    headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "The request failed. Try again.");
  }
  return response.json() as Promise<T>;
}
function demoLedger(): {
  entries: MoneyEntry[];
  edits: MoneyEdit[];
  drafts: MoneyDraft[];
  categories: MoneyCategory[];
} {
  const raw = window.localStorage.getItem(KEY);
  const data = raw ? JSON.parse(raw) : { entries: [], drafts: [] };
  return {
    ...data,
    edits: data.edits ?? [],
    categories:
      data.categories ??
      initialCategories(data.entries.map((e: MoneyEntry) => e.category)),
  };
}
export async function loadMoney(demo: boolean): Promise<MoneySnapshot> {
  if (!demo) return moneyRequest("/api/money");
  return {
    ...demoLedger(),
    assets: readDemoStore().assets,
    telegramConfigured: false,
  };
}
export async function saveEntry(
  input: EntryInput,
  operationId: string,
  demo: boolean,
  draftId?: string,
) {
  if (!demo)
    return moneyRequest<MoneyEntry>("/api/money", {
      method: "POST",
      body: JSON.stringify({ input, operationId, draftId }),
    });
  const parsed = entrySchema.parse(input),
    store = demoLedger(),
    gear = readDemoStore(),
    id = `money-${operationId}`;
  const existing = store.entries.find((e) => e.id === id);
  if (existing) return existing;
  if (!store.categories.some((c) => !c.deleted && c.name === parsed.category))
    throw new Error(
      "Choose an available category, or add one in Manage categories.",
    );
  assertRefund(parsed, store.entries);
  assertDistribution(parsed, store.entries);
  const reversed = new Set(
    store.entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])),
  );
  if (
    !parsed.duplicateReason &&
    store.entries.some(
      (e) =>
        (e.kind === parsed.kind ||
          (isExpenseKind(e.kind) && isExpenseKind(parsed.kind))) &&
        e.description === parsed.description &&
        e.date === parsed.date &&
        e.amountCents === parsed.amountCents &&
        !reversed.has(e.id),
    )
  )
    throw new Error(
      "Possible duplicate. Enter a reason if this is a separate payment.",
    );
  if (parsed.kind === "purchase" && parsed.vendorOrderNumber && store.entries.some((e) =>
    e.kind === "purchase" && !reversed.has(e.id) &&
    e.vendorOrderNumber?.toLowerCase() === parsed.vendorOrderNumber.toLowerCase() &&
    e.counterparty.trim().toLowerCase() === parsed.counterparty.trim().toLowerCase()
  ))
    throw new Error("This vendor order already has a ledger purchase.");
  const now = Date.now(),
    created = makeAssets(
      parsed,
      id,
      gear.assets.map((a) => a.assetTag),
      now,
    );
  const order = parsed.purchaseOrderId
    ? gear.orders.find((o) => o.id === parsed.purchaseOrderId)
    : undefined;
  const ids = [
    ...new Set([
      ...parsed.existingAssetIds,
      ...(order?.lines.flatMap((l) => l.assetIds) ?? []),
    ]),
  ];
  const linked = ids.map((assetId) =>
    gear.assets.find((a) => a.id === assetId)!,
  );
  if (
    linked.some((a) => !a || (a.moneyEntryId && !reversed.has(a.moneyEntryId)))
  )
    throw new Error(
      "Selected gear is missing or already linked to another entry.",
    );
  for (const a of linked) {
    a.moneyEntryId = id;
    a.ownerPartyId =
      parsed.kind === "loaned_gear"
        ? parsed.person === "ike"
          ? "party-ike"
          : "party-cron"
        : "party-the-swell";
  }
  gear.assets.push(...created);
  const entry: MoneyEntry = {
    ...parsed,
    id,
    effects: effectsFor(parsed),
    assetIds: [...linked, ...created].map((a) => a.id),
    assetTags: [...linked, ...created].map((a) => a.assetTag),
    source: "web",
    createdBy: "Demo admin",
    createdAt: now,
  };
  store.entries.unshift(entry);
  writeDemoStore(gear);
  window.localStorage.setItem(KEY, JSON.stringify(store));
  return entry;
}
export async function reverseEntry(
  entry: MoneyEntry,
  reason: string,
  demo: boolean,
) {
  if (!demo)
    return moneyRequest(`/api/money/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reverse", reason }),
    });
  const store = demoLedger();
  if (store.entries.some((e) => e.reversesId === entry.id)) return;
  if (!reason.trim()) throw new Error("Enter a reason.");
  store.entries.unshift({
    ...entry,
    id: `reverse-${entry.id}`,
    kind: "reversal",
    reversesId: entry.id,
    description: `Reversal: ${entry.description}`,
    notes: reason,
    createdAt: Date.now(),
    effects: Object.fromEntries(
      Object.entries(entry.effects).map(([k, v]) => [k, -v]),
    ) as unknown as MoneyEntry["effects"],
  });
  window.localStorage.setItem(KEY, JSON.stringify(store));
}
export async function saveGearDetails(
  entryId: string,
  details: {
    assetIds: string[];
    lengthInches?: number;
    manufacturer?: string;
    definitionId?: string;
    label?: string;
  },
  demo: boolean,
) {
  if (!demo)
    return moneyRequest(`/api/money/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "gear", details }),
    });
  const gear = readDemoStore();
  for (const a of gear.assets.filter((a) => details.assetIds.includes(a.id))) {
    if (details.definitionId) a.definitionId = details.definitionId;
    if (details.lengthInches && a.tags.includes("Cables"))
      a.cableLengthInches = details.lengthInches;
    if (details.manufacturer !== undefined)
      a.cableManufacturer = details.manufacturer;
    if (details.label) a.label = details.label;
    a.detailsNeeded =
      !a.definitionId || (a.tags.includes("Cables") && !a.cableLengthInches);
  }
  writeDemoStore(gear);
}
export async function viewReceipt(id: string) {
  if (!auth?.currentUser) throw new Error("Sign in first.");
  const response = await fetch(`/api/money/receipts/${id}`, {
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not open the receipt.");
  return URL.createObjectURL(await response.blob());
}

export async function attachReceipt(entryId: string, file: File) {
  if (!file.size || file.size > 4 * 1024 * 1024)
    throw new Error("Use a nonempty receipt smaller than 4 MB.");
  const form = new FormData();
  form.set("file", file);
  const receipt = await moneyRequest<{ id: string }>("/api/money/receipts", {
    method: "POST",
    body: form,
  });
  return moneyRequest<MoneyEntry>(`/api/money/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "receipt", receiptId: receipt.id }),
  });
}

export async function saveCategory(
  action: CategoryAction,
  demo: boolean,
): Promise<MoneyCategory[]> {
  if (!demo)
    return moneyRequest("/api/money/categories", {
      method: "PATCH",
      body: JSON.stringify(action),
    });
  const store = demoLedger();
  store.categories = changeCategories(
    store.categories,
    action,
    crypto.randomUUID(),
  );
  window.localStorage.setItem(KEY, JSON.stringify(store));
  return store.categories;
}

export async function editEntry(
  entryId: string,
  raw: MoneyEditRequest,
  demo: boolean,
): Promise<MoneyEntry> {
  if (!demo)
    return moneyRequest(`/api/money/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "edit", details: raw }),
    });
  const request = editRequestSchema.parse(raw);
  const store = demoLedger();
  const original = store.entries.find((e) => e.id === entryId);
  if (!original) throw new Error("Transaction not found.");
  const previous = store.edits.find((e) => e.id === request.operationId);
  if (previous) {
    if (
      previous.entryId !== entryId ||
      JSON.stringify(previous.after) !== JSON.stringify(request.fields) ||
      previous.reason !== request.reason ||
      previous.revision !== request.revision + 1
    )
      throw new Error(
        "This edit was already submitted with different details.",
      );
    return original;
  }
  const next = prepareMoneyEdit(
    original,
    request,
    store.entries,
    store.categories,
  );
  const before = editableFields(original),
    after = editableFields(next);
  if (JSON.stringify(before) === JSON.stringify(after)) return original;
  next.revision = (original.revision ?? 0) + 1;
  next.updatedAt = Date.now();
  next.updatedBy = "Demo admin";
  store.edits.unshift({
    id: request.operationId,
    entryId,
    revision: next.revision,
    editedAt: next.updatedAt,
    editedBy: next.updatedBy,
    reason: request.reason,
    before,
    after,
  });
  store.entries = store.entries.map((e) => (e.id === entryId ? next : e));
  window.localStorage.setItem(KEY, JSON.stringify(store));
  return next;
}
