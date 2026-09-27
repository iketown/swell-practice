import type { MoneyCategory } from "@/lib/money/categories";
import type { MoneyEdit } from "@/lib/money/edits";
import type { GearChoicePlan, GearLinkProposal } from "@/lib/money/gear-match";
import { z } from "zod";
import {
  createInventoryAssetCode,
  inferInventoryAssetCodeGroup,
  INVENTORY_ASSET_CODE_SCHEME_VERSION,
  type InventoryAsset,
} from "@/lib/gear/domain";

export const PEOPLE = { ike: "Ike", chris: "Chris" } as const;
export type Person = keyof typeof PEOPLE;
export const KINDS = {
  purchase: "Purchase / expense",
  band_payment: "Pay band members",
  transfer: "Partner equalization",
  repayment: "Company repayment",
  deposit: "Owner cash deposit",
  refund: "Vendor refund",
  income: "Income received (gigs, etc.)",
  distribution: "Profit distribution",
  loaned_gear: "Personally owned gear on loan",
} as const;
export type EntryKind = keyof typeof KINDS;
export function isExpenseKind(kind: string) {
  return kind === "purchase" || kind === "band_payment";
}
const cents = z.number().int().min(0).max(100_000_000);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const gearLineSchema = z.object({
  label: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(100),
  isCable: z.boolean().default(false),
  definitionId: z.string().max(128).default(""),
  lengthInches: z.number().positive().max(120000).optional(),
  manufacturer: z.string().trim().max(100).default(""),
});
export const entrySchema = z
  .object({
    kind: z.enum([
      "purchase",
      "band_payment",
      "transfer",
      "repayment",
      "deposit",
      "refund",
      "income",
      "distribution",
      "loaned_gear",
    ]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          Number.isFinite(Date.parse(v)) &&
          new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v,
        "Use a valid date.",
      ),
    description: z.string().trim().min(1).max(500),
    counterparty: z.string().trim().max(200).default(""),
    category: z.string().trim().max(100).default("Other"),
    amountCents: cents,
    funding: z.object({ ike: cents, chris: cents, company: cents }),
    person: z.enum(["ike", "chris"]).default("ike"),
    notes: z.string().trim().max(4000).default(""),
    gear: z.array(gearLineSchema).max(30).default([]),
    existingAssetIds: z.array(identifier).max(100).default([]),
    purchaseOrderId: z
      .string()
      .regex(/^[A-Za-z0-9_-]*$/)
      .max(128)
      .default(""),
    vendorOrderNumber: z.string().trim().max(100).default(""),
    receiptIds: z.array(identifier).max(10).default([]),
    relatedEntryId: z
      .string()
      .regex(/^[A-Za-z0-9_-]*$/)
      .max(128)
      .default(""),
    duplicateReason: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (v.kind === "loaned_gear" ? v.amountCents !== 0 : v.amountCents <= 0)
      fail("Enter a positive amount; loaned gear has no reimbursement amount.");
    if (isExpenseKind(v.kind) || v.kind === "refund") {
      if (v.funding.ike + v.funding.chris + v.funding.company !== v.amountCents)
        fail("The payer amounts must equal the transaction total.");
    } else if (Object.values(v.funding).some(Boolean))
      fail(
        "Payer splits apply only to expenses, band member payments, and refunds.",
      );
    if (
      !["purchase", "loaned_gear"].includes(v.kind) &&
      (v.gear.length || v.existingAssetIds.length || v.purchaseOrderId)
    )
      fail("Only purchases or loaned gear may register inventory.");
    if (
      v.kind === "loaned_gear" &&
      ((!v.gear.length && !v.existingAssetIds.length) || v.purchaseOrderId)
    )
      fail(
        "Add or link personally owned gear. Loaned gear does not use a purchase order.",
      );
    if (
      v.gear.reduce((n, g) => n + g.quantity, 0) + v.existingAssetIds.length >
      100
    )
      fail("Register at most 100 pieces of gear at a time.");
    if (v.kind === "band_payment" && !v.counterparty)
      fail("Enter the band member or members who were paid.");
    if (v.kind === "refund" && !v.relatedEntryId)
      fail("Link a refund to its original purchase.");
    if (v.kind !== "refund" && v.relatedEntryId)
      fail("Only refunds link to an original purchase.");
    if (new Set(v.existingAssetIds).size !== v.existingAssetIds.length)
      fail("A gear item may only be linked once.");
  });
export type EntryInput = z.infer<typeof entrySchema>;
/** Keep well-typed fields for review even when an AI response is incomplete. */
export function safeDraftInput(
  value: Record<string, unknown>,
): Partial<EntryInput> {
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(entrySchema.shape)) {
    const parsed = schema.safeParse(value[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as Partial<EntryInput>;
}
export interface Effects {
  ike: number;
  chris: number;
  company: number;
  spending: number;
  income: number;
  distributions: number;
}
export interface MoneyEntry extends Omit<EntryInput, "kind"> {
  revision?: number;
  updatedAt?: number;
  updatedBy?: string;
  id: string;
  kind: EntryKind | "reversal";
  effects: Effects;
  createdAt: number;
  createdBy: string;
  source: "web" | "telegram";
  assetIds: string[];
  assetTags: string[];
  reversesId?: string;
  receiptAttachments?: Array<{
    receiptId: string;
    addedAt: number;
    addedBy: string;
  }>;
}
export interface MoneyDraft {
  id: string;
  text: string;
  questions: string[];
  input: Partial<EntryInput> | null;
  receiptIds: string[];
  createdAt: number;
  status: "pending" | "posted" | "dismissed";
  entryId?: string;
  gearProposal?: GearLinkProposal;
  gearChoices?: GearChoicePlan;
  gearExtractedAt?: number;
  gearExtractedBy?: string;
}
export interface MoneySnapshot {
  edits: MoneyEdit[];
  categories: MoneyCategory[];
  entries: MoneyEntry[];
  drafts: MoneyDraft[];
  assets: InventoryAsset[];
  telegramConfigured: boolean;
}
export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
export function parseMoney(value: string): number {
  const clean = value.trim().replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error("Use dollars and cents, such as 125.50.");
  const [whole, fraction = ""] = clean.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 100_000_000)
    throw new Error("Amount is too large.");
  return amount;
}
export function effectsFor(v: EntryInput): Effects {
  const e: Effects = {
    ike: 0,
    chris: 0,
    company: 0,
    spending: 0,
    income: 0,
    distributions: 0,
  };
  if (isExpenseKind(v.kind) || v.kind === "refund") {
    const sign = v.kind === "refund" ? -1 : 1;
    e.ike = sign * v.funding.ike;
    e.chris = sign * v.funding.chris;
    e.company = -sign * v.funding.company;
    e.spending = sign * v.amountCents;
  } else if (v.kind === "transfer") {
    e[v.person] = v.amountCents;
    e[v.person === "ike" ? "chris" : "ike"] = -v.amountCents;
  } else if (v.kind === "deposit" || v.kind === "repayment") {
    const sign = v.kind === "deposit" ? 1 : -1;
    e[v.person] = sign * v.amountCents;
    e.company = sign * v.amountCents;
  } else if (v.kind === "income") {
    e.company = v.amountCents;
    e.income = v.amountCents;
  } else if (v.kind === "distribution") {
    e.company = -v.amountCents;
    e.distributions = v.amountCents;
  }
  return e;
}
export function totals(entries: readonly MoneyEntry[]): Effects {
  return entries.reduce(
    (sum, entry) => {
      for (const key of Object.keys(sum) as (keyof Effects)[])
        sum[key] += entry.effects[key];
      return sum;
    },
    { ike: 0, chris: 0, company: 0, spending: 0, income: 0, distributions: 0 },
  );
}
export function equalization(entries: readonly MoneyEntry[]) {
  const balance = totals(entries),
    difference = Math.abs(balance.ike - balance.chris);
  return {
    difference,
    transferCents: Math.floor(difference / 2),
    remainderCents: difference % 2,
    from: (balance.ike < balance.chris ? "ike" : "chris") as Person,
  };
}
export function makeAssets(
  input: EntryInput,
  entryId: string,
  existingCodes: Iterable<string>,
  now: number,
): InventoryAsset[] {
  const used = new Set(existingCodes),
    assets: InventoryAsset[] = [];
  for (const line of input.gear) {
    const group = inferInventoryAssetCodeGroup({
      isCable: line.isCable,
      label: line.label,
    });
    for (let i = 0; i < line.quantity; i++) {
      const assetTag = createInventoryAssetCode(used, group);
      used.add(assetTag);
      assets.push({
        id: `${entryId}-gear-${assets.length + 1}`,
        assetTag,
        assetCodeGroup: group,
        assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
        definitionId: line.definitionId,
        label: line.label,
        lifecycleStatus: "awaiting_check_in",
        stageOnly: false,
        tags: line.isCable ? ["Cables"] : [],
        ownerPartyId:
          input.kind === "loaned_gear"
            ? input.person === "ike"
              ? "party-ike"
              : "party-cron"
            : "party-the-swell",
        ...(line.lengthInches ? { cableLengthInches: line.lengthInches } : {}),
        ...(line.manufacturer ? { cableManufacturer: line.manufacturer } : {}),
        moneyEntryId: entryId,
        detailsNeeded:
          !line.definitionId || (line.isCable && !line.lengthInches),
        photos: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return assets;
}
export function assertRefund(input: EntryInput, entries: MoneyEntry[]) {
  if (input.kind !== "refund") return;
  const reversed = new Set(
    entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])),
  );
  const original = entries.find(
    (e) =>
      e.id === input.relatedEntryId &&
      e.kind === "purchase" &&
      !reversed.has(e.id),
  );
  if (!original)
    throw new Error("Choose an unreversed purchase for this refund.");
  const refunded = entries
    .filter(
      (e) =>
        e.kind === "refund" &&
        e.relatedEntryId === original.id &&
        !reversed.has(e.id),
    )
    .reduce((n, e) => n + e.amountCents, 0);
  if (refunded + input.amountCents > original.amountCents)
    throw new Error("Refunds cannot exceed the original purchase total.");
}
export function assertDistribution(input: EntryInput, entries: MoneyEntry[]) {
  if (input.kind !== "distribution") return;
  const balance = totals(entries);
  if (balance.ike > 0 || balance.chris > 0)
    throw new Error(
      "Repay outstanding owner advances before recording profit distributions.",
    );
}
export function csvExport(entries: readonly MoneyEntry[]) {
  const cell = (v: unknown) => {
    const text = String(v ?? "");
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [
    [
      "ID",
      "Date",
      "Type",
      "Description",
      "Payee / merchant",
      "Category",
      "Amount USD",
      "Ike funding change USD",
      "Chris funding change USD",
      "Company cash change USD",
      "Gear codes",
      "Vendor order number",
      "Source",
      "Recorded by",
      "Reverses",
      "Notes",
    ],
  ];
  for (const e of entries)
    rows.push([
      e.id,
      e.date,
      e.kind,
      e.description,
      e.counterparty,
      e.category,
      (e.amountCents / 100).toFixed(2),
      (e.effects.ike / 100).toFixed(2),
      (e.effects.chris / 100).toFixed(2),
      (e.effects.company / 100).toFixed(2),
      e.assetTags.join(" "),
      e.vendorOrderNumber,
      e.source,
      e.createdBy,
      e.reversesId,
      e.notes,
    ]);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
