import type { EquipmentImage } from "@/lib/setup-designer/domain";

export type GearPartyKind = "person" | "band" | "company" | "provider" | "vendor";
export type GearLocationKind = "house" | "vehicle" | "studio" | "venue" | "warehouse" | "container" | "other";
export type InventoryAssetLifecycle =
  | "planned"
  | "cart"
  | "ordered"
  | "in_transit"
  | "awaiting_check_in"
  | "active"
  | "retired"
  | "cancelled";
export type PurchaseOrderStatus = "draft" | "cart" | "ordered" | "partially_shipped" | "shipped" | "received" | "cancelled";
export type PaymentStatus = "not_paid" | "partially_paid" | "paid" | "refunded";
export type CheckInMethod = "manual" | "qr";

export interface GearParty {
  id: string;
  name: string;
  kind: GearPartyKind;
  notes?: string;
  status: "active" | "archived";
  updatedAt: number;
}

export interface GearLocation {
  id: string;
  name: string;
  kind: GearLocationKind;
  notes?: string;
  status: "active" | "archived";
  updatedAt: number;
}

export interface InventoryAsset {
  id: string;
  assetTag: string;
  definitionId: string;
  label: string;
  lifecycleStatus: InventoryAssetLifecycle;
  ownerPartyId?: string;
  currentLocationId?: string;
  serialNumber?: string;
  notes?: string;
  photos: EquipmentImage[];
  sourceSetupId?: string;
  purchaseOrderId?: string;
  purchaseOrderLineId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseOrderLine {
  id: string;
  definitionId: string;
  description: string;
  quantity: number;
  assetIds: string[];
  productUrl?: string;
  unitPrice?: number;
  currency?: string;
}

export interface PurchaseOrder {
  id: string;
  vendor: string;
  vendorUrl?: string;
  status: PurchaseOrderStatus;
  paymentStatus: PaymentStatus;
  orderedByPartyId?: string;
  paidByPartyId?: string;
  paymentAccountLabel?: string;
  orderNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  expectedArrivalDate?: string;
  orderedDate?: string;
  shippedDate?: string;
  receivedDate?: string;
  notes?: string;
  lines: PurchaseOrderLine[];
  createdAt: number;
  updatedAt: number;
}

export interface InventoryCheckIn {
  id: string;
  assetId: string;
  locationId: string;
  method: CheckInMethod;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  notes?: string;
  actorId: string;
  checkedInAt: number;
}

export const ASSET_LIFECYCLE_OPTIONS: Array<{ value: InventoryAssetLifecycle; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "cart", label: "In cart" },
  { value: "ordered", label: "Ordered" },
  { value: "in_transit", label: "In transit" },
  { value: "awaiting_check_in", label: "Awaiting check-in" },
  { value: "active", label: "On hand" },
  { value: "retired", label: "Retired" },
  { value: "cancelled", label: "Cancelled" },
];

export const PURCHASE_ORDER_STATUS_OPTIONS: Array<{ value: PurchaseOrderStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "cart", label: "In cart" },
  { value: "ordered", label: "Ordered" },
  { value: "partially_shipped", label: "Partially shipped" },
  { value: "shipped", label: "Shipped" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export const PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = [
  { value: "not_paid", label: "Not paid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
];

export function lifecycleLabel(value: InventoryAssetLifecycle) {
  return ASSET_LIFECYCLE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function purchaseOrderStatusLabel(value: PurchaseOrderStatus) {
  return PURCHASE_ORDER_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function paymentStatusLabel(value: PaymentStatus) {
  return PAYMENT_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function lifecycleForOrderStatus(status: PurchaseOrderStatus): InventoryAssetLifecycle {
  if (status === "cart") return "cart";
  if (status === "ordered" || status === "partially_shipped") return "ordered";
  if (status === "shipped") return "in_transit";
  if (status === "received") return "awaiting_check_in";
  if (status === "cancelled") return "planned";
  return "planned";
}

export function createGearId(prefix: string) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function normalizeGearSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function canonicalizeAssetTag(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  const structured = normalized.match(/^([A-Z]{3})-(\d+)(?:-(\d+))?$/);
  if (!structured) return normalized;
  const sequence = structured[2].padStart(2, "0");
  const detail = structured[3]?.padStart(2, "0");
  return `${structured[1]}-${sequence}${detail ? `-${detail}` : ""}`;
}

export function isStandardAssetTag(value: string) {
  return /^[A-Z]{3}-\d{2,}(?:-\d{2})?$/.test(canonicalizeAssetTag(value));
}

export function assetTagPrefix(itemName: string) {
  const normalized = itemName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = normalized.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const exactCode = tokens.find((token) => /^[A-Z]{3}$/.test(token));
  if (exactCode) return exactCode;
  const shortCodeIndex = tokens.findIndex((token) => /^[A-Z]{2}$/.test(token));
  if (shortCodeIndex >= 0) {
    const nextLetter = tokens.slice(shortCodeIndex + 1).join("").match(/[A-Za-z]/)?.[0];
    if (nextLetter) return `${tokens[shortCodeIndex]}${nextLetter}`.toUpperCase();
  }
  const letters = normalized.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 3) || "GEA").padEnd(3, "X");
}

export function createAssetTag(itemName: string, existingTags: Iterable<string> = []) {
  const prefix = assetTagPrefix(itemName);
  const matchingTag = new RegExp(`^${prefix}-(\\d+)(?:-\\d{2})?$`, "i");
  let highestSequence = 0;
  for (const existingTag of existingTags) {
    const match = canonicalizeAssetTag(existingTag).match(matchingTag);
    if (!match) continue;
    highestSequence = Math.max(highestSequence, Number(match[1]));
  }
  return `${prefix}-${String(highestSequence + 1).padStart(2, "0")}`;
}
