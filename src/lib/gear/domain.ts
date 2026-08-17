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
export type CheckInMethod =
  | "manual_single"
  | "manual_bulk"
  | "qr_camera"
  | "manual"
  | "qr";

export type AssetPlacement =
  | { kind: "location"; locationId: string }
  | { kind: "container"; containerAssetId: string };

export type CheckInDestination = AssetPlacement;

export const MAX_INVENTORY_TAGS = 12;
export const MAX_INVENTORY_TAG_LENGTH = 32;
export const MAX_ASSET_PURCHASE_URL_LENGTH = 2048;
export const CABLE_INVENTORY_TAG = "Cables";
export const INVENTORY_ASSET_CODE_LENGTH = 4;
export const INVENTORY_ASSET_CODE_SCHEME_VERSION = 2;
export const INVENTORY_ASSET_CODE_STARTS = {
  cable: 1,
  microphone: 100,
  stand: 200,
  instrument: 300,
  pedal: 400,
  rack: 500,
  general: 600,
  container: 1000,
} as const;
export type InventoryAssetCodeGroup = keyof typeof INVENTORY_ASSET_CODE_STARTS;
const INVENTORY_ASSET_CODE_RANGES: Record<InventoryAssetCodeGroup, Array<readonly [number, number]>> = {
  cable: [[1, 99]],
  microphone: [[100, 199]],
  stand: [[200, 299]],
  instrument: [[300, 399]],
  pedal: [[400, 499]],
  rack: [[500, 599]],
  general: [[600, 999], [2000, 9999]],
  container: [[1000, 1999]],
};
export const CABLE_COLOR_OPTIONS = ["black", "grey", "white", "blue", "purple", "red", "green", "orange", "yellow"] as const;
export type CableColor = (typeof CABLE_COLOR_OPTIONS)[number];

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
  lastCheckInAt?: number;
  updatedAt: number;
}

export interface PublicGearAsset {
  assetTag: string;
  label: string;
  updatedAt: number;
}

export interface InventoryAsset {
  id: string;
  assetTag: string;
  assetCodeGroup?: InventoryAssetCodeGroup;
  assetCodeVersion?: number;
  definitionId: string;
  label: string;
  cableManufacturer?: string;
  cableLengthInches?: number;
  cableColor?: CableColor;
  lifecycleStatus: InventoryAssetLifecycle;
  stageOnly: boolean;
  /** Per-item override. When omitted, the reusable definition provides the default. */
  needsPowerSource?: boolean;
  /** Per-item override for a separately labeled adapter. Implies needsPowerSource. */
  needsPowerAdapter?: boolean;
  /** Hidden membership pointer for items that travel and check in while connected. */
  connectionSetId?: string;
  tags: string[];
  ownerPartyId?: string;
  canContainAssets?: boolean;
  /** Stable asset IDs expected to be placed directly inside this container. Undefined means no manifest is configured. */
  expectedContentAssetIds?: string[];
  currentPlacement?: AssetPlacement;
  effectiveLocationId?: string;
  locationInheritedFromAssetId?: string;
  ancestorContainerIds?: string[];
  lastPlacedAt?: number;
  /** Legacy effective-location snapshot retained while older screens migrate. */
  currentLocationId?: string;
  serialNumber?: string;
  purchaseUrl?: string;
  notes?: string;
  photos: EquipmentImage[];
  sourceSetupId?: string;
  purchaseOrderId?: string;
  purchaseOrderLineId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryConnectorReference {
  assetId: string;
  /** Stable connector ID derived from the reusable definition. */
  connectorId: string;
}

export interface InventoryConnectionLink {
  id: string;
  a: InventoryConnectorReference;
  b: InventoryConnectorReference;
}

export interface InventorySignalConnector {
  endpoint: InventoryConnectorReference;
  direction: "input" | "output";
}

export interface InventoryConnectionNodePosition {
  x: number;
  y: number;
}

/** Persisted internally; the product UI describes only the item-to-item connections. */
export interface InventoryConnectionSet {
  id: string;
  memberAssetIds: string[];
  links: InventoryConnectionLink[];
  signalConnectors: InventorySignalConnector[];
  nodePositions?: Record<string, InventoryConnectionNodePosition>;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryCheckInOutcome {
  operationId: string;
  checkIns: InventoryCheckIn[];
  assets: InventoryAsset[];
  propagatedAssets?: InventoryAsset[];
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
  destination: CheckInDestination;
  /** Legacy compatibility field for location check-ins created before destinations. */
  locationId?: string;
  method: CheckInMethod;
  operationId?: string;
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

export function normalizeInventoryTags(values: Iterable<string>) {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalizedTag = value.trim().replace(/\s+/g, " ");
    const tag = normalizedTag.toLocaleLowerCase() === CABLE_INVENTORY_TAG.toLocaleLowerCase()
      ? CABLE_INVENTORY_TAG
      : normalizedTag;
    if (!tag || tag.length > MAX_INVENTORY_TAG_LENGTH) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function isCableInventoryAsset(asset: Pick<InventoryAsset, "tags">) {
  const cableTagKey = CABLE_INVENTORY_TAG.toLocaleLowerCase();
  return asset.tags.some((tag) => tag.trim().toLocaleLowerCase() === cableTagKey);
}

export function normalizeCableColor(value: unknown): CableColor | undefined {
  return typeof value === "string" && CABLE_COLOR_OPTIONS.includes(value.toLocaleLowerCase() as CableColor)
    ? value.toLocaleLowerCase() as CableColor
    : undefined;
}

export function cableColorLabel(value: CableColor) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function normalizeAssetPurchaseUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ASSET_PURCHASE_URL_LENGTH) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeCableLengthInches(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 1000) / 1000;
}

export function formatCableLength(value: unknown) {
  const normalized = normalizeCableLengthInches(value);
  if (!normalized) return "";

  const rounded = Math.round(normalized * 100) / 100;
  if (rounded < 12) return `${formatMeasurement(rounded)}\"`;

  let feet = Math.floor(rounded / 12);
  let inches = Math.round((rounded - feet * 12) * 100) / 100;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return inches ? `${feet}' ${formatMeasurement(inches)}\"` : `${feet}'`;
}

export function formatCableAssetLabel(label: string, cableLengthInches: unknown) {
  const trimmedLabel = label.trim();
  const formattedLength = formatCableLength(cableLengthInches);
  if (!formattedLength || trimmedLabel === formattedLength || trimmedLabel.startsWith(`${formattedLength} `)) return trimmedLabel;
  return `${formattedLength} ${trimmedLabel}`;
}

function formatMeasurement(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function isInventoryAssetCode(value: string) {
  const code = value.trim();
  return /^\d{4}$/.test(code) && code !== "0000";
}

export function normalizeInventoryAssetCode(value: string) {
  const digits = value.trim();
  if (!/^\d{1,4}$/.test(digits)) return "";
  const code = digits.padStart(INVENTORY_ASSET_CODE_LENGTH, "0");
  return code === "0000" ? "" : code;
}

export function createInventoryAssetCode(
  existingCodes: Iterable<string>,
  group: InventoryAssetCodeGroup = "general",
) {
  const used = new Set(
    Array.from(existingCodes, (value) => value.trim()).filter(isInventoryAssetCode),
  );
  for (const [start, end] of INVENTORY_ASSET_CODE_RANGES[group]) {
    for (let value = start; value <= end; value += 1) {
      const code = String(value).padStart(INVENTORY_ASSET_CODE_LENGTH, "0");
      if (!used.has(code)) return code;
    }
  }
  if (group !== "general") {
    for (const [start, end] of INVENTORY_ASSET_CODE_RANGES.general) {
      for (let value = start; value <= end; value += 1) {
        const code = String(value).padStart(INVENTORY_ASSET_CODE_LENGTH, "0");
        if (!used.has(code)) return code;
      }
    }
  }
  throw new Error("No four-digit inventory IDs remain.");
}

export function inferInventoryAssetCodeGroup(input: {
  isCable?: boolean;
  isContainer?: boolean;
  label?: string;
  tags?: Iterable<string>;
  definitionName?: string;
  definitionCategory?: string;
}): InventoryAssetCodeGroup {
  if (input.isContainer) return "container";
  if (input.isCable) return "cable";
  const searchable = [
    input.label,
    input.definitionName,
    input.definitionCategory,
    ...Array.from(input.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

  if (/\b(stand|stands|tripod|tripods|boom|booms)\b/.test(searchable)) return "stand";
  if (/\b(mic|mics|microphone|microphones)\b/.test(searchable)) return "microphone";
  if (/\b(pedal|pedals|stompbox|stompboxes|footswitch|footswitches)\b/.test(searchable)) return "pedal";
  if (/\b(instrument|instruments|guitar|guitars|bass|basses|keyboard|keyboards|piano|pianos|synth|synthesizer|synthesizers|drum|drums|cymbal|cymbals|sax|saxophone|saxophones|trumpet|trumpets|trombone|trombones|horn|horns|violin|violins|cello|cellos|accordion|accordions|percussion)\b/.test(searchable)) return "instrument";
  if (/\b(rack|racks|mixer|mixers|console|consoles|stage box|stage boxes|direct box|direct boxes|di|wireless|receiver|receivers|transmitter|transmitters|processor|processors|interface|interfaces|amplifier|amplifiers|amp|amps|preamp|preamps|compressor|compressors|equalizer|equalizers|power conditioner|power conditioners)\b/.test(searchable)) return "rack";
  return "general";
}

export function normalizeInventoryAssetCodeGroup(value: unknown): InventoryAssetCodeGroup | undefined {
  return typeof value === "string" && value in INVENTORY_ASSET_CODE_STARTS
    ? value as InventoryAssetCodeGroup
    : undefined;
}

export function isContainerInventoryAsset(asset: Pick<InventoryAsset, "canContainAssets">) {
  return asset.canContainAssets === true;
}

export function directAssetPlacement(asset: Pick<InventoryAsset, "currentPlacement" | "currentLocationId">): AssetPlacement | undefined {
  if (asset.currentPlacement) return asset.currentPlacement;
  return asset.currentLocationId ? { kind: "location", locationId: asset.currentLocationId } : undefined;
}

export function inventoryAssetLocationChain(
  asset: InventoryAsset,
  assets: readonly InventoryAsset[],
  locations: readonly GearLocation[],
) {
  const assetById = new Map(assets.map((item) => [item.id, item]));
  const locationById = new Map(locations.map((item) => [item.id, item]));
  const containerLabels: string[] = [];
  const visited = new Set([asset.id]);
  let cursor = asset;
  let locationId: string | undefined;

  for (let depth = 0; depth < 8; depth += 1) {
    const placement = directAssetPlacement(cursor);
    if (!placement) break;
    if (placement.kind === "location") {
      locationId = placement.locationId;
      break;
    }
    const container = assetById.get(placement.containerAssetId);
    if (!container || visited.has(container.id)) break;
    visited.add(container.id);
    containerLabels.push(container.label);
    cursor = container;
  }

  locationId ??= asset.effectiveLocationId ?? asset.currentLocationId;
  const locationName = locationId ? locationById.get(locationId)?.name : undefined;
  return [locationName ?? "Location unknown", ...containerLabels.map((label) => `in ${label}`)].join(" | ");
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
