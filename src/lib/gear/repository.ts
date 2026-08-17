"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { sanitizeFilename } from "@/lib/domain";
import { db, hasFirebaseConfig, storage } from "@/lib/firebase";
import {
  canonicalizeAssetTag,
  createInventoryAssetCode,
  createGearId,
  inferInventoryAssetCodeGroup,
  isCableInventoryAsset,
  isInventoryAssetCode,
  lifecycleForOrderStatus,
  MAX_INVENTORY_TAGS,
  INVENTORY_ASSET_CODE_SCHEME_VERSION,
  normalizeAssetPurchaseUrl,
  normalizeCableColor,
  normalizeCableLengthInches,
  normalizeInventoryAssetCodeGroup,
  normalizeInventoryTags,
  type CheckInMethod,
  type GearLocation,
  type GearLocationKind,
  type GearParty,
  type GearPartyKind,
  type InventoryAsset,
  type InventoryAssetCodeGroup,
  type InventoryAssetLifecycle,
  type InventoryCheckIn,
  type InventoryConnectionLink,
  type InventoryConnectionSet,
  type InventorySignalConnector,
  type PaymentStatus,
  type PublicGearAsset,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/gear/domain";
import { normalizePowerDependencies, type EquipmentImage, type EquipmentTemplate } from "@/lib/setup-designer/domain";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";

const DEMO_STORE_KEY = "swell-parts:gear:v1";
const INVENTORY_CODE_GROUP_ORDER: InventoryAssetCodeGroup[] = [
  "microphone",
  "stand",
  "instrument",
  "pedal",
  "rack",
  "general",
  "cable",
];

interface GearDemoStore {
  parties: GearParty[];
  locations: GearLocation[];
  assets: InventoryAsset[];
  orders: PurchaseOrder[];
  checkIns: InventoryCheckIn[];
  connectionSets: InventoryConnectionSet[];
}

export interface InventoryConnectionSetInput {
  id?: string;
  sourceAssetId: string;
  memberAssetIds: string[];
  links: InventoryConnectionLink[];
  signalConnectors: InventorySignalConnector[];
  nodePositions?: InventoryConnectionSet["nodePositions"];
  createdAt?: number;
}

export interface InventoryAssetInput {
  id?: string;
  assetTag?: string;
  assetCodeGroup?: InventoryAssetCodeGroup;
  definitionId: string;
  label: string;
  cableManufacturer?: string;
  cableLengthInches?: number;
  cableColor?: InventoryAsset["cableColor"];
  lifecycleStatus: InventoryAssetLifecycle;
  stageOnly?: boolean;
  tags?: string[];
  ownerPartyId?: string;
  currentLocationId?: string;
  serialNumber?: string;
  purchaseUrl?: string;
  notes?: string;
  sourceSetupId?: string;
  photos?: EquipmentImage[];
  createdAt?: number;
}

export interface PurchaseOrderInput {
  id?: string;
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
  createdAt?: number;
}

const DEFAULT_PARTIES: GearParty[] = [
  { id: "party-the-swell", name: "The Swell", kind: "band", status: "active", updatedAt: 0 },
  { id: "party-ike", name: "Ike", kind: "person", status: "active", updatedAt: 0 },
  { id: "party-cron", name: "Cron", kind: "person", status: "active", updatedAt: 0 },
  { id: "party-backline", name: "Backline company", kind: "provider", status: "active", updatedAt: 0 },
];

const DEFAULT_LOCATIONS: GearLocation[] = [
  { id: "location-ike-house", name: "Ike's house", kind: "house", status: "active", updatedAt: 0 },
  { id: "location-cron-house", name: "Cron's house", kind: "house", status: "active", updatedAt: 0 },
  { id: "location-ike-car", name: "Ike's car", kind: "vehicle", status: "active", updatedAt: 0 },
  { id: "location-rehearsal", name: "Rehearsal studio", kind: "studio", status: "active", updatedAt: 0 },
];

function seedDemoStore(): GearDemoStore {
  const now = Date.now();
  return {
    parties: structuredClone(DEFAULT_PARTIES),
    locations: structuredClone(DEFAULT_LOCATIONS),
    assets: [
      {
        id: "asset-sm58-ike-01",
        assetTag: "0100",
        assetCodeGroup: "microphone",
        assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
        definitionId: "template-vocal-mic",
        label: "Ike's SM58 #1",
        lifecycleStatus: "active",
        stageOnly: false,
        tags: [],
        ownerPartyId: "party-ike",
        currentLocationId: "location-ike-house",
        photos: [],
        createdAt: now - 1000 * 60 * 60 * 24 * 30,
        updatedAt: now - 1000 * 60 * 60 * 24 * 4,
      },
      {
        id: "asset-radial-jdi-planned",
        assetTag: "0500",
        assetCodeGroup: "rack",
        assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
        definitionId: "template-guitar-di",
        label: "Second Radial JDI",
        lifecycleStatus: "planned",
        stageOnly: false,
        tags: [],
        ownerPartyId: "party-the-swell",
        notes: "Needed for the expanded live setup.",
        photos: [],
        createdAt: now - 1000 * 60 * 60 * 24 * 2,
        updatedAt: now - 1000 * 60 * 60 * 24 * 2,
      },
    ],
    orders: [],
    checkIns: [],
    connectionSets: [],
  };
}

function isDemoMode() {
  return !hasFirebaseConfig || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1");
}

function readDemoStore() {
  if (typeof window === "undefined") return seedDemoStore();
  const stored = window.localStorage.getItem(DEMO_STORE_KEY);
  if (!stored) {
    const seed = seedDemoStore();
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const value = JSON.parse(stored) as Partial<GearDemoStore>;
    return {
      parties: Array.isArray(value.parties) ? value.parties : structuredClone(DEFAULT_PARTIES),
      locations: Array.isArray(value.locations) ? value.locations : structuredClone(DEFAULT_LOCATIONS),
      assets: Array.isArray(value.assets) ? value.assets.map((asset) => ({
        ...asset,
        cableManufacturer: typeof asset.cableManufacturer === "string" && asset.cableManufacturer.trim() ? asset.cableManufacturer.trim() : undefined,
        cableLengthInches: normalizeCableLengthInches(asset.cableLengthInches),
        cableColor: normalizeCableColor(asset.cableColor),
        purchaseUrl: normalizeAssetPurchaseUrl(asset.purchaseUrl),
        stageOnly: asset.stageOnly === true,
        tags: normalizeInventoryTags(asset.tags ?? []).slice(0, MAX_INVENTORY_TAGS),
      })) : [],
      orders: Array.isArray(value.orders) ? value.orders : [],
      checkIns: Array.isArray(value.checkIns) ? value.checkIns : [],
      connectionSets: Array.isArray(value.connectionSets)
        ? value.connectionSets.flatMap((item) => {
            const normalized = connectionSetFromData(item.id, item as unknown as Record<string, unknown>);
            return normalized.memberAssetIds.length > 1 ? [normalized] : [];
          })
        : [],
    };
  } catch {
    return seedDemoStore();
  }
}

function writeDemoStore(store: GearDemoStore) {
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function timestampMillis(value: unknown, fallback = Date.now()) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function powerDependencyOverridesFromData(value: {
  needsPowerSource?: unknown;
  needsPowerAdapter?: unknown;
}): Partial<Pick<InventoryAsset, "needsPowerSource" | "needsPowerAdapter">> {
  if (typeof value.needsPowerSource !== "boolean" && typeof value.needsPowerAdapter !== "boolean") return {};
  return normalizePowerDependencies(value);
}

function connectorReferenceFromData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.assetId !== "string" || typeof data.connectorId !== "string") return undefined;
  return { assetId: data.assetId, connectorId: data.connectorId };
}

function connectionSetFromData(id: string, value: Record<string, unknown>): InventoryConnectionSet {
  const memberAssetIds = Array.isArray(value.memberAssetIds)
    ? [...new Set(value.memberAssetIds.filter((item): item is string => typeof item === "string" && Boolean(item)))]
    : [];
  const memberIds = new Set(memberAssetIds);
  const links = Array.isArray(value.links) ? value.links.flatMap((item, index): InventoryConnectionLink[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    const a = connectorReferenceFromData(data.a);
    const b = connectorReferenceFromData(data.b);
    if (!a || !b || !memberIds.has(a.assetId) || !memberIds.has(b.assetId) || a.assetId === b.assetId) return [];
    return [{ id: typeof data.id === "string" && data.id ? data.id : `${id}-link-${index + 1}`, a, b }];
  }) : [];
  const internalConnectorKeys = new Set(links.flatMap((link) => [
    `${link.a.assetId}:${link.a.connectorId}`,
    `${link.b.assetId}:${link.b.connectorId}`,
  ]));
  const signalConnectors = Array.isArray(value.signalConnectors) ? value.signalConnectors.flatMap((item): InventorySignalConnector[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    const endpoint = connectorReferenceFromData(data.endpoint);
    if (!endpoint || !memberIds.has(endpoint.assetId) || internalConnectorKeys.has(`${endpoint.assetId}:${endpoint.connectorId}`)) return [];
    if (data.direction !== "input" && data.direction !== "output") return [];
    return [{ endpoint, direction: data.direction }];
  }) : [];
  const nodePositions = value.nodePositions && typeof value.nodePositions === "object" && !Array.isArray(value.nodePositions)
    ? Object.fromEntries(Object.entries(value.nodePositions).flatMap(([assetId, position]) => {
      if (!memberIds.has(assetId) || !position || typeof position !== "object" || Array.isArray(position)) return [];
      const data = position as Record<string, unknown>;
      if (typeof data.x !== "number" || !Number.isFinite(data.x) || typeof data.y !== "number" || !Number.isFinite(data.y)) return [];
      return [[assetId, { x: data.x, y: data.y }]];
    }))
    : {};
  return {
    id,
    memberAssetIds,
    links,
    signalConnectors,
    nodePositions,
    createdAt: timestampMillis(value.createdAt),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function connectionSetDocumentValue(value: InventoryConnectionSet) {
  return {
    memberAssetIds: value.memberAssetIds,
    links: value.links,
    signalConnectors: value.signalConnectors,
    nodePositions: value.nodePositions ?? {},
  };
}

function imageFromData(value: unknown): EquipmentImage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const contentType = data.contentType;
  if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") return undefined;
  if (typeof data.downloadUrl !== "string" || typeof data.storagePath !== "string") return undefined;
  return {
    filename: String(data.filename ?? "gear-photo"),
    contentType,
    size: Number(data.size ?? 0),
    storagePath: data.storagePath,
    downloadUrl: data.downloadUrl,
  };
}

function partyFromData(id: string, value: Record<string, unknown>): GearParty {
  const kinds: GearPartyKind[] = ["person", "band", "company", "provider", "vendor"];
  return {
    id,
    name: String(value.name ?? "Unnamed owner"),
    kind: kinds.includes(value.kind as GearPartyKind) ? value.kind as GearPartyKind : "person",
    notes: stringValue(value.notes),
    status: value.status === "archived" ? "archived" : "active",
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function locationFromData(id: string, value: Record<string, unknown>): GearLocation {
  const kinds: GearLocationKind[] = ["house", "vehicle", "studio", "venue", "warehouse", "container", "other"];
  return {
    id,
    name: String(value.name ?? "Unnamed location"),
    kind: kinds.includes(value.kind as GearLocationKind) ? value.kind as GearLocationKind : "other",
    notes: stringValue(value.notes),
    status: value.status === "archived" ? "archived" : "active",
    lastCheckInAt: value.lastCheckInAt ? timestampMillis(value.lastCheckInAt) : undefined,
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function publicGearAssetFromData(value: Record<string, unknown>): PublicGearAsset {
  return {
    assetTag: String(value.assetTag ?? ""),
    label: String(value.label ?? "Unnamed gear"),
    updatedAt: timestampMillis(value.updatedAt, 0),
  };
}

function publicGearAssetId(assetTag: string) {
  return encodeURIComponent(canonicalizeAssetTag(assetTag).toLowerCase());
}

function publicGearAssetDocumentValue(asset: Pick<InventoryAsset, "assetTag" | "label">) {
  return {
    assetTag: canonicalizeAssetTag(asset.assetTag),
    label: asset.label,
    updatedAt: serverTimestamp(),
  };
}

function assetFromData(id: string, value: Record<string, unknown>): InventoryAsset {
  const lifecycleValues: InventoryAssetLifecycle[] = ["planned", "cart", "ordered", "in_transit", "awaiting_check_in", "active", "retired", "cancelled"];
  return {
    id,
    assetTag: String(value.assetTag ?? id),
    assetCodeGroup: normalizeInventoryAssetCodeGroup(value.assetCodeGroup),
    assetCodeVersion: typeof value.assetCodeVersion === "number" && Number.isInteger(value.assetCodeVersion)
      ? value.assetCodeVersion
      : undefined,
    definitionId: String(value.definitionId ?? ""),
    label: String(value.label ?? "Unnamed gear"),
    cableManufacturer: stringValue(value.cableManufacturer),
    cableLengthInches: normalizeCableLengthInches(value.cableLengthInches),
    cableColor: normalizeCableColor(value.cableColor),
    lifecycleStatus: lifecycleValues.includes(value.lifecycleStatus as InventoryAssetLifecycle) ? value.lifecycleStatus as InventoryAssetLifecycle : "planned",
    stageOnly: value.stageOnly === true,
    ...powerDependencyOverridesFromData(value),
    connectionSetId: stringValue(value.connectionSetId),
    tags: Array.isArray(value.tags)
      ? normalizeInventoryTags(value.tags.filter((tag): tag is string => typeof tag === "string")).slice(0, MAX_INVENTORY_TAGS)
      : [],
    ownerPartyId: stringValue(value.ownerPartyId),
    currentLocationId: stringValue(value.currentLocationId),
    serialNumber: stringValue(value.serialNumber),
    purchaseUrl: normalizeAssetPurchaseUrl(value.purchaseUrl),
    notes: stringValue(value.notes),
    photos: Array.isArray(value.photos) ? value.photos.flatMap((item) => {
      const image = imageFromData(item);
      return image ? [image] : [];
    }) : [],
    sourceSetupId: stringValue(value.sourceSetupId),
    purchaseOrderId: stringValue(value.purchaseOrderId),
    purchaseOrderLineId: stringValue(value.purchaseOrderLineId),
    createdAt: timestampMillis(value.createdAt),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function orderFromData(id: string, value: Record<string, unknown>): PurchaseOrder {
  const statuses: PurchaseOrderStatus[] = ["draft", "cart", "ordered", "partially_shipped", "shipped", "received", "cancelled"];
  const paymentStatuses: PaymentStatus[] = ["not_paid", "partially_paid", "paid", "refunded"];
  return {
    id,
    vendor: String(value.vendor ?? "Unknown vendor"),
    vendorUrl: stringValue(value.vendorUrl),
    status: statuses.includes(value.status as PurchaseOrderStatus) ? value.status as PurchaseOrderStatus : "draft",
    paymentStatus: paymentStatuses.includes(value.paymentStatus as PaymentStatus) ? value.paymentStatus as PaymentStatus : "not_paid",
    orderedByPartyId: stringValue(value.orderedByPartyId),
    paidByPartyId: stringValue(value.paidByPartyId),
    paymentAccountLabel: stringValue(value.paymentAccountLabel),
    orderNumber: stringValue(value.orderNumber),
    carrier: stringValue(value.carrier),
    trackingNumber: stringValue(value.trackingNumber),
    expectedArrivalDate: stringValue(value.expectedArrivalDate),
    orderedDate: stringValue(value.orderedDate),
    shippedDate: stringValue(value.shippedDate),
    receivedDate: stringValue(value.receivedDate),
    notes: stringValue(value.notes),
    lines: Array.isArray(value.lines) ? structuredClone(value.lines) as PurchaseOrderLine[] : [],
    createdAt: timestampMillis(value.createdAt),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function firestoreOrThrow() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

function storageOrThrow() {
  if (!storage) throw new Error("Firebase Storage is not configured.");
  return storage;
}

function mergeDefaults<T extends { id: string }>(stored: T[], defaults: T[]) {
  const ids = new Set(stored.map((item) => item.id));
  return [...stored, ...defaults.filter((item) => !ids.has(item.id))];
}

export async function listGearParties() {
  if (isDemoMode() || !db) return readDemoStore().parties.filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const snapshots = await getDocs(collection(db, "gearParties"));
  return mergeDefaults(snapshots.docs.map((item) => partyFromData(item.id, item.data())), DEFAULT_PARTIES)
    .filter((item) => item.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createGearParty(input: { name: string; kind: GearPartyKind; notes?: string }) {
  const id = isDemoMode() || !db ? createGearId("party") : doc(collection(firestoreOrThrow(), "gearParties")).id;
  const value: GearParty = { id, name: input.name.trim(), kind: input.kind, notes: input.notes?.trim() || undefined, status: "active", updatedAt: Date.now() };
  if (!value.name) throw new Error("Owner or provider name is required.");
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.parties.push(value);
    writeDemoStore(store);
    return value;
  }
  await setDoc(doc(firestoreOrThrow(), "gearParties", id), {
    id: value.id,
    name: value.name,
    kind: value.kind,
    notes: value.notes ?? "",
    status: value.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return value;
}

export async function listGearLocations() {
  if (isDemoMode() || !db) return readDemoStore().locations.filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const snapshots = await getDocs(collection(db, "gearLocations"));
  return mergeDefaults(snapshots.docs.map((item) => locationFromData(item.id, item.data())), DEFAULT_LOCATIONS)
    .filter((item) => item.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createGearLocation(input: { name: string; kind: GearLocationKind; notes?: string }) {
  const id = isDemoMode() || !db ? createGearId("location") : doc(collection(firestoreOrThrow(), "gearLocations")).id;
  const value: GearLocation = { id, name: input.name.trim(), kind: input.kind, notes: input.notes?.trim() || undefined, status: "active", updatedAt: Date.now() };
  if (!value.name) throw new Error("Location name is required.");
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.locations.push(value);
    writeDemoStore(store);
    return value;
  }
  await setDoc(doc(firestoreOrThrow(), "gearLocations", id), {
    id: value.id,
    name: value.name,
    kind: value.kind,
    notes: value.notes ?? "",
    status: value.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return value;
}

export async function listInventoryAssets() {
  const assets = isDemoMode() || !db
    ? readDemoStore().assets
    : (await getDocs(collection(db, "inventoryAssets"))).docs.map((item) => assetFromData(item.id, item.data()));
  const definitions = await listEquipmentTemplates(true).catch(() => []);
  const migrated = await assignMissingInventoryAssetCodes(assets, definitions);
  return migrated.sort((a, b) => b.updatedAt - a.updatedAt);
}

function assetCodeGroupFor(
  asset: InventoryAsset,
  definitionsById: ReadonlyMap<string, EquipmentTemplate>,
) {
  if (asset.assetCodeVersion === INVENTORY_ASSET_CODE_SCHEME_VERSION && asset.assetCodeGroup) return asset.assetCodeGroup;
  const definition = definitionsById.get(asset.definitionId);
  return inferInventoryAssetCodeGroup({
    isCable: isCableInventoryAsset(asset),
    label: asset.label,
    tags: asset.tags,
    definitionName: definition?.name,
    definitionCategory: definition?.category,
  });
}

async function assignMissingInventoryAssetCodes(
  assets: InventoryAsset[],
  definitions: EquipmentTemplate[],
) {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const usedCodes = new Set(assets
    .filter((asset) => asset.assetCodeVersion === INVENTORY_ASSET_CODE_SCHEME_VERSION)
    .map((asset) => asset.assetTag)
    .filter(isInventoryAssetCode));
  const replacements = new Map<string, { code: string; group: InventoryAssetCodeGroup }>();
  const orderedAssets = [...assets].sort((left, right) => {
    const leftGroup = assetCodeGroupFor(left, definitionsById);
    const rightGroup = assetCodeGroupFor(right, definitionsById);
    return INVENTORY_CODE_GROUP_ORDER.indexOf(leftGroup) - INVENTORY_CODE_GROUP_ORDER.indexOf(rightGroup)
      || left.createdAt - right.createdAt
      || left.id.localeCompare(right.id);
  });

  for (const asset of orderedAssets) {
    const group = assetCodeGroupFor(asset, definitionsById);
    const code = asset.assetCodeVersion === INVENTORY_ASSET_CODE_SCHEME_VERSION && isInventoryAssetCode(asset.assetTag)
      ? asset.assetTag
      : createInventoryAssetCode(usedCodes, group);
    usedCodes.add(code);
    if (code !== asset.assetTag || group !== asset.assetCodeGroup || asset.assetCodeVersion !== INVENTORY_ASSET_CODE_SCHEME_VERSION) {
      replacements.set(asset.id, { code, group });
    }
  }
  if (!replacements.size) return assets;

  const migrated = assets.map((asset) => {
    const replacement = replacements.get(asset.id);
    return replacement ? {
      ...asset,
      assetTag: replacement.code,
      assetCodeGroup: replacement.group,
      assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
    } : asset;
  });
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.assets = store.assets.map((asset) => {
      const replacement = replacements.get(asset.id);
      return replacement ? {
        ...asset,
        assetTag: replacement.code,
        assetCodeGroup: replacement.group,
        assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
      } : asset;
    });
    writeDemoStore(store);
    return migrated;
  }

  const changedAssets = migrated.filter((asset) => replacements.has(asset.id));
  for (let start = 0; start < changedAssets.length; start += 400) {
    const batch = writeBatch(db);
    for (const asset of changedAssets.slice(start, start + 400)) {
      const replacement = replacements.get(asset.id)!;
      batch.update(doc(db, "inventoryAssets", asset.id), {
        assetTag: replacement.code,
        assetCodeGroup: replacement.group,
        assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await syncPublicGearAssetRecords(migrated);
  return migrated;
}

export async function getPublicGearAssetByTag(assetTag: string): Promise<PublicGearAsset | null> {
  const canonicalTag = canonicalizeAssetTag(assetTag);
  if (isDemoMode() || !db) {
    const asset = readDemoStore().assets.find((item) => canonicalizeAssetTag(item.assetTag) === canonicalTag);
    return asset ? { assetTag: asset.assetTag, label: asset.label, updatedAt: asset.updatedAt } : null;
  }
  const snapshot = await getDoc(doc(db, "gearPublicAssets", publicGearAssetId(canonicalTag)));
  return snapshot.exists() ? publicGearAssetFromData(snapshot.data()) : null;
}

export async function getInventoryAssetByTag(assetTag: string): Promise<InventoryAsset | null> {
  const canonicalTag = canonicalizeAssetTag(assetTag);
  if (isDemoMode() || !db) {
    return readDemoStore().assets.find((item) => canonicalizeAssetTag(item.assetTag) === canonicalTag) ?? null;
  }
  const snapshots = await getDocs(query(
    collection(db, "inventoryAssets"),
    where("assetTag", "==", canonicalTag),
    limit(1),
  ));
  const snapshot = snapshots.docs[0];
  return snapshot ? assetFromData(snapshot.id, snapshot.data()) : null;
}

export async function syncPublicGearAssetRecords(assets: InventoryAsset[]) {
  if (isDemoMode() || !db) return;
  const existingSnapshots = await getDocs(collection(db, "gearPublicAssets"));
  const existing = new Map(existingSnapshots.docs.map((item) => [item.id, publicGearAssetFromData(item.data())]));
  const currentTags = new Set(assets.map((asset) => canonicalizeAssetTag(asset.assetTag)));
  const obsoleteSnapshots = existingSnapshots.docs.filter((item) => {
    const storedTag = canonicalizeAssetTag(String(item.data().assetTag ?? ""));
    return !isInventoryAssetCode(storedTag) || !currentTags.has(storedTag);
  });
  for (let start = 0; start < obsoleteSnapshots.length; start += 400) {
    const batch = writeBatch(db);
    for (const snapshot of obsoleteSnapshots.slice(start, start + 400)) batch.delete(snapshot.ref);
    await batch.commit();
  }
  const changed = assets.filter((asset) => {
    const stored = existing.get(publicGearAssetId(asset.assetTag));
    return !stored || stored.assetTag !== canonicalizeAssetTag(asset.assetTag) || stored.label !== asset.label;
  });
  for (let start = 0; start < changed.length; start += 400) {
    const batch = writeBatch(db);
    for (const asset of changed.slice(start, start + 400)) {
      batch.set(
        doc(db, "gearPublicAssets", publicGearAssetId(asset.assetTag)),
        publicGearAssetDocumentValue(asset),
        { merge: true },
      );
    }
    await batch.commit();
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare the gear photo."));
    reader.readAsDataURL(file);
  });
}

async function uploadAssetPhoto(assetId: string, file: File, onProgress?: (progress: number) => void): Promise<EquipmentImage> {
  if (isDemoMode() || !storage) {
    onProgress?.(100);
    return {
      filename: file.name,
      contentType: file.type as EquipmentImage["contentType"],
      size: file.size,
      storagePath: `demo/gear-assets/${assetId}/${file.name}`,
      downloadUrl: await fileToDataUrl(file),
    };
  }
  const storagePath = `gear-assets/${assetId}/${createGearId("photo")}-${sanitizeFilename(file.name)}`;
  const uploadTask = uploadBytesResumable(ref(storageOrThrow(), storagePath), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    uploadTask.on("state_changed", (snapshot) => {
      onProgress?.(snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0);
    }, reject, resolve);
  });
  return {
    filename: file.name,
    contentType: file.type as EquipmentImage["contentType"],
    size: file.size,
    storagePath,
    downloadUrl: await getDownloadURL(uploadTask.snapshot.ref),
  };
}

function assetDocumentValue(asset: InventoryAsset) {
  return {
    assetTag: asset.assetTag,
    assetCodeGroup: asset.assetCodeGroup ?? "general",
    assetCodeVersion: asset.assetCodeVersion ?? INVENTORY_ASSET_CODE_SCHEME_VERSION,
    definitionId: asset.definitionId,
    label: asset.label,
    cableManufacturer: asset.cableManufacturer ?? "",
    cableLengthInches: asset.cableLengthInches ?? null,
    cableColor: asset.cableColor ?? "",
    lifecycleStatus: asset.lifecycleStatus,
    stageOnly: asset.stageOnly,
    needsPowerSource: asset.needsPowerSource ?? false,
    needsPowerAdapter: asset.needsPowerAdapter ?? false,
    connectionSetId: asset.connectionSetId ?? "",
    tags: asset.tags,
    ownerPartyId: asset.ownerPartyId ?? "",
    currentLocationId: asset.currentLocationId ?? "",
    serialNumber: asset.serialNumber ?? "",
    purchaseUrl: asset.purchaseUrl ?? "",
    notes: asset.notes ?? "",
    photos: asset.photos,
    sourceSetupId: asset.sourceSetupId ?? "",
    purchaseOrderId: asset.purchaseOrderId ?? "",
    purchaseOrderLineId: asset.purchaseOrderLineId ?? "",
  };
}

export async function saveInventoryAsset(
  input: InventoryAssetInput,
  photoFiles: File[] = [],
  onProgress?: (progress: number) => void,
) {
  const firestore = db;
  const id = input.id ?? ((isDemoMode() || !firestore) ? createGearId("asset") : doc(collection(firestoreOrThrow(), "inventoryAssets")).id);
  const existingAssets = await listInventoryAssets();
  const previousAsset = existingAssets.find((item) => item.id === id);
  const tags = normalizeInventoryTags(input.tags ?? []).slice(0, MAX_INVENTORY_TAGS);
  const isCable = isCableInventoryAsset({ tags });
  const cableManufacturer = isCable ? input.cableManufacturer?.trim() || undefined : undefined;
  const cableLengthInches = isCable ? normalizeCableLengthInches(input.cableLengthInches) : undefined;
  const cableColor = isCable ? normalizeCableColor(input.cableColor) ?? "black" : undefined;
  const purchaseUrlInput = input.purchaseUrl?.trim() ?? "";
  const purchaseUrl = purchaseUrlInput ? normalizeAssetPurchaseUrl(purchaseUrlInput) : undefined;
  if (isCable && !cableLengthInches) throw new Error("Enter the cable length in feet or inches.");
  if (purchaseUrlInput && !purchaseUrl) throw new Error("Use a complete http:// or https:// purchase URL.");
  const existingAssetTags = existingAssets.filter((item) => item.id !== id).map((item) => item.assetTag);
  const assetCodeGroup = input.assetCodeGroup
    ?? previousAsset?.assetCodeGroup
    ?? inferInventoryAssetCodeGroup({ isCable, label: input.label, tags });
  const previousCode = previousAsset && isInventoryAssetCode(previousAsset.assetTag) ? previousAsset.assetTag : "";
  const requestedCode = isInventoryAssetCode(input.assetTag ?? "") && !existingAssetTags.includes(input.assetTag?.trim() ?? "")
    ? input.assetTag?.trim() ?? ""
    : "";
  const assetTag = previousCode || requestedCode || createInventoryAssetCode(existingAssetTags, assetCodeGroup);
  const duplicate = existingAssets.find((item) => item.id !== id && canonicalizeAssetTag(item.assetTag) === assetTag);
  if (duplicate) throw new Error(`${assetTag} is already assigned to ${duplicate.label}.`);
  const uploaded: EquipmentImage[] = [];
  for (const [index, file] of photoFiles.entries()) {
    uploaded.push(await uploadAssetPhoto(id, file, (fileProgress) => {
      onProgress?.(Math.round(((index + fileProgress / 100) / photoFiles.length) * 100));
    }));
  }
  const now = Date.now();
  const asset: InventoryAsset = {
    id,
    assetTag,
    assetCodeGroup,
    assetCodeVersion: INVENTORY_ASSET_CODE_SCHEME_VERSION,
    definitionId: input.definitionId,
    label: input.label.trim(),
    cableManufacturer,
    cableLengthInches,
    cableColor,
    lifecycleStatus: input.lifecycleStatus,
    stageOnly: isCable ? false : input.stageOnly === true,
    tags,
    ownerPartyId: input.ownerPartyId || undefined,
    currentLocationId: input.currentLocationId || undefined,
    serialNumber: isCable ? undefined : input.serialNumber?.trim() || undefined,
    purchaseUrl,
    notes: input.notes?.trim() || undefined,
    photos: [...(input.photos ?? []), ...uploaded],
    sourceSetupId: input.sourceSetupId || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  if (!asset.label) throw new Error("Asset name is required.");

  if (isDemoMode() || !firestore) {
    const store = readDemoStore();
    const index = store.assets.findIndex((item) => item.id === id);
    if (index >= 0) asset.purchaseOrderId = store.assets[index].purchaseOrderId;
    if (index >= 0) asset.purchaseOrderLineId = store.assets[index].purchaseOrderLineId;
    if (index >= 0) store.assets[index] = asset;
    else store.assets.push(asset);
    writeDemoStore(store);
    return asset;
  }
  const existing = input.id ? await getDoc(doc(firestoreOrThrow(), "inventoryAssets", id)) : null;
  const existingData = existing?.exists() ? existing.data() : undefined;
  const existingAsset = existingData && existing ? assetFromData(existing.id, existingData) : undefined;
  const storedAsset = {
    ...asset,
    purchaseOrderId: existingAsset?.purchaseOrderId,
    purchaseOrderLineId: existingAsset?.purchaseOrderLineId,
  };
  await setDoc(doc(firestoreOrThrow(), "inventoryAssets", id), {
    ...assetDocumentValue(storedAsset),
    createdAt: existingAsset ? existingData?.createdAt ?? serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await syncPublicGearAssetRecords([storedAsset]).catch((syncError) => {
    console.warn("Could not update the public QR label record.", syncError);
  });
  return storedAsset;
}

export async function listInventoryConnectionSets() {
  if (isDemoMode() || !db) return readDemoStore().connectionSets.sort((left, right) => right.updatedAt - left.updatedAt);
  const snapshots = await getDocs(collection(db, "inventoryConnectionSets"));
  return snapshots.docs
    .map((item) => connectionSetFromData(item.id, item.data()))
    .filter((item) => item.memberAssetIds.length > 1)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function saveInventoryConnectionSet(input: InventoryConnectionSetInput) {
  const now = Date.now();
  const originalId = input.id ?? createGearId("connection-set");
  const desiredSets = partitionConnectionSetInput({ ...input, id: originalId }, now);

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const previousSet = store.connectionSets.find((item) => item.id === originalId);
    const affectedAssetIds = new Set([
      ...(previousSet?.memberAssetIds ?? []),
      ...desiredSets.flatMap((item) => item.memberAssetIds),
    ]);
    const desiredSetIdByAssetId = new Map(desiredSets.flatMap((item) => item.memberAssetIds.map((assetId) => [assetId, item.id] as const)));
    for (const assetId of desiredSetIdByAssetId.keys()) {
      const asset = store.assets.find((item) => item.id === assetId);
      if (!asset) throw new Error("One of the connected items no longer exists.");
      if (asset.connectionSetId && asset.connectionSetId !== originalId) {
        throw new Error(`${asset.assetTag} is already connected to other gear. Disconnect it there first.`);
      }
    }
    store.connectionSets = [
      ...store.connectionSets.filter((item) => item.id !== originalId && !desiredSets.some((desired) => desired.id === item.id)),
      ...desiredSets,
    ];
    store.assets = store.assets.map((asset) => affectedAssetIds.has(asset.id) ? {
      ...asset,
      connectionSetId: desiredSetIdByAssetId.get(asset.id),
      updatedAt: now,
    } : asset);
    writeDemoStore(store);
    return desiredSets;
  }

  const firestore = firestoreOrThrow();
  await runTransaction(firestore, async (transaction) => {
    const previousReference = doc(firestore, "inventoryConnectionSets", originalId);
    const previousSnapshot = await transaction.get(previousReference);
    const previousSet = previousSnapshot.exists() ? connectionSetFromData(previousSnapshot.id, previousSnapshot.data()) : undefined;
    const affectedAssetIds = [...new Set([
      ...(previousSet?.memberAssetIds ?? []),
      ...desiredSets.flatMap((item) => item.memberAssetIds),
    ])];
    const assetReferences = affectedAssetIds.map((assetId) => doc(firestore, "inventoryAssets", assetId));
    const assetSnapshots = await Promise.all(assetReferences.map((reference) => transaction.get(reference)));
    const desiredSetIdByAssetId = new Map(desiredSets.flatMap((item) => item.memberAssetIds.map((assetId) => [assetId, item.id] as const)));

    for (const snapshot of assetSnapshots) {
      if (!snapshot.exists()) throw new Error("One of the connected items no longer exists.");
      const asset = assetFromData(snapshot.id, snapshot.data());
      if (desiredSetIdByAssetId.has(asset.id) && asset.connectionSetId && asset.connectionSetId !== originalId) {
        throw new Error(`${asset.assetTag} is already connected to other gear. Disconnect it there first.`);
      }
    }

    const desiredIds = new Set(desiredSets.map((item) => item.id));
    if (!desiredIds.has(originalId) && previousSnapshot.exists()) transaction.delete(previousReference);
    for (const connectionSet of desiredSets) {
      const reference = doc(firestore, "inventoryConnectionSets", connectionSet.id);
      transaction.set(reference, {
        ...connectionSetDocumentValue(connectionSet),
        createdAt: connectionSet.id === originalId && previousSnapshot.exists()
          ? previousSnapshot.data().createdAt ?? serverTimestamp()
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    for (const reference of assetReferences) {
      transaction.update(reference, {
        connectionSetId: desiredSetIdByAssetId.get(reference.id) ?? "",
        updatedAt: serverTimestamp(),
      });
    }
  });
  return desiredSets;
}

function partitionConnectionSetInput(input: InventoryConnectionSetInput & { id: string }, now: number) {
  const memberAssetIds = [...new Set([input.sourceAssetId, ...input.memberAssetIds].filter(Boolean))];
  const memberIds = new Set(memberAssetIds);
  const connectorKeys = new Set<string>();
  const links = input.links.flatMap((link): InventoryConnectionLink[] => {
    if (!memberIds.has(link.a.assetId) || !memberIds.has(link.b.assetId) || link.a.assetId === link.b.assetId) return [];
    const aKey = `${link.a.assetId}:${link.a.connectorId}`;
    const bKey = `${link.b.assetId}:${link.b.connectorId}`;
    if (connectorKeys.has(aKey) || connectorKeys.has(bKey)) throw new Error("Each physical connector can be used by only one kept connection.");
    connectorKeys.add(aKey);
    connectorKeys.add(bKey);
    return [{ ...structuredClone(link), id: link.id || createGearId("connection-link") }];
  });
  const adjacency = new Map(memberAssetIds.map((assetId) => [assetId, new Set<string>()]));
  for (const link of links) {
    adjacency.get(link.a.assetId)?.add(link.b.assetId);
    adjacency.get(link.b.assetId)?.add(link.a.assetId);
  }
  const components: string[][] = [];
  const visited = new Set<string>();
  for (const assetId of memberAssetIds) {
    if (visited.has(assetId)) continue;
    const component: string[] = [];
    const pending = [assetId];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    components.push(component);
  }
  const connectedComponents = components.filter((component) => component.length > 1);
  return connectedComponents.map((component) => {
    const componentIds = new Set(component);
    const id = componentIds.has(input.sourceAssetId) ? input.id : createGearId("connection-set");
    return {
      id,
      memberAssetIds: component,
      links: links.filter((link) => componentIds.has(link.a.assetId) && componentIds.has(link.b.assetId)),
      signalConnectors: input.signalConnectors.filter((item) => (
        componentIds.has(item.endpoint.assetId)
        && !connectorKeys.has(`${item.endpoint.assetId}:${item.endpoint.connectorId}`)
      )),
      nodePositions: Object.fromEntries(component.flatMap((assetId) => {
        const position = input.nodePositions?.[assetId];
        return position ? [[assetId, structuredClone(position)]] : [];
      })),
      createdAt: id === input.id ? input.createdAt ?? now : now,
      updatedAt: now,
    } satisfies InventoryConnectionSet;
  });
}

export async function deleteInventoryAssets(assets: readonly InventoryAsset[]) {
  if (!assets.length) return;
  const deletedAssetIds = new Set(assets.map((asset) => asset.id));

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.assets = store.assets.filter((asset) => !deletedAssetIds.has(asset.id));
    store.checkIns = store.checkIns.filter((checkIn) => !deletedAssetIds.has(checkIn.assetId));
    store.orders = store.orders.flatMap((order): PurchaseOrder[] => {
      const lines = order.lines.flatMap((line): PurchaseOrderLine[] => {
        const assetIds = line.assetIds.filter((assetId) => !deletedAssetIds.has(assetId));
        return assetIds.length ? [{ ...line, assetIds, quantity: assetIds.length }] : [];
      });
      return lines.length ? [{ ...order, lines, updatedAt: Date.now() }] : [];
    });
    writeDemoStore(store);
    return;
  }

  const firestore = firestoreOrThrow();
  const referencesToDelete: Array<ReturnType<typeof doc>> = [];
  for (const asset of assets) {
    const checkIns = await getDocs(collection(firestore, "inventoryAssets", asset.id, "checkIns"));
    referencesToDelete.push(...checkIns.docs.map((snapshot) => snapshot.ref));
    referencesToDelete.push(doc(firestore, "inventoryAssets", asset.id));
    referencesToDelete.push(doc(firestore, "gearPublicAssets", publicGearAssetId(asset.assetTag)));
  }
  for (let start = 0; start < referencesToDelete.length; start += 400) {
    const batch = writeBatch(firestore);
    for (const reference of referencesToDelete.slice(start, start + 400)) batch.delete(reference);
    await batch.commit();
  }

  const orderSnapshots = await getDocs(collection(firestore, "purchaseOrders"));
  const affectedOrders = orderSnapshots.docs.flatMap((snapshot) => {
    const order = orderFromData(snapshot.id, snapshot.data());
    if (!order.lines.some((line) => line.assetIds.some((assetId) => deletedAssetIds.has(assetId)))) return [];
    const lines = order.lines.flatMap((line): PurchaseOrderLine[] => {
      const assetIds = line.assetIds.filter((assetId) => !deletedAssetIds.has(assetId));
      return assetIds.length ? [{ ...line, assetIds, quantity: assetIds.length }] : [];
    });
    return [{ snapshot, order: { ...order, lines, updatedAt: Date.now() } }];
  });
  for (let start = 0; start < affectedOrders.length; start += 400) {
    const batch = writeBatch(firestore);
    for (const { snapshot, order } of affectedOrders.slice(start, start + 400)) {
      if (!order.lines.length) {
        batch.delete(snapshot.ref);
      } else {
        batch.set(snapshot.ref, {
          ...orderDocumentValue(order),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }
    await batch.commit();
  }
}

export async function listPurchaseOrders() {
  if (isDemoMode() || !db) return readDemoStore().orders.sort((a, b) => b.updatedAt - a.updatedAt);
  const snapshots = await getDocs(collection(db, "purchaseOrders"));
  return snapshots.docs.map((item) => orderFromData(item.id, item.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

function orderDocumentValue(order: PurchaseOrder) {
  return {
    vendor: order.vendor,
    vendorUrl: order.vendorUrl ?? "",
    status: order.status,
    paymentStatus: order.paymentStatus,
    orderedByPartyId: order.orderedByPartyId ?? "",
    paidByPartyId: order.paidByPartyId ?? "",
    paymentAccountLabel: order.paymentAccountLabel ?? "",
    orderNumber: order.orderNumber ?? "",
    carrier: order.carrier ?? "",
    trackingNumber: order.trackingNumber ?? "",
    expectedArrivalDate: order.expectedArrivalDate ?? "",
    orderedDate: order.orderedDate ?? "",
    shippedDate: order.shippedDate ?? "",
    receivedDate: order.receivedDate ?? "",
    notes: order.notes ?? "",
    lines: order.lines.map((line) => ({
      id: line.id,
      definitionId: line.definitionId,
      description: line.description,
      quantity: line.quantity,
      assetIds: line.assetIds,
      productUrl: line.productUrl ?? "",
      unitPrice: line.unitPrice ?? null,
      currency: line.currency ?? "",
    })),
  };
}

export async function savePurchaseOrder(input: PurchaseOrderInput) {
  const id = input.id ?? ((isDemoMode() || !db) ? createGearId("order") : doc(collection(firestoreOrThrow(), "purchaseOrders")).id);
  const now = Date.now();
  const order: PurchaseOrder = {
    ...structuredClone(input),
    id,
    vendor: input.vendor.trim(),
    vendorUrl: input.vendorUrl?.trim() || undefined,
    paymentAccountLabel: input.paymentAccountLabel?.trim() || undefined,
    orderNumber: input.orderNumber?.trim() || undefined,
    carrier: input.carrier?.trim() || undefined,
    trackingNumber: input.trackingNumber?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  if (!order.vendor) throw new Error("Vendor is required.");
  if (!order.lines.length) throw new Error("Add at least one planned asset to this order.");
  const nextAssetIds = new Set(order.lines.flatMap((line) => line.assetIds));

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const existing = store.orders.find((item) => item.id === id);
    const previousAssetIds = new Set(existing?.lines.flatMap((line) => line.assetIds) ?? []);
    store.assets = store.assets.map((asset) => {
      if (nextAssetIds.has(asset.id)) {
        const line = order.lines.find((item) => item.assetIds.includes(asset.id));
        return { ...asset, lifecycleStatus: lifecycleForOrderStatus(order.status), purchaseOrderId: id, purchaseOrderLineId: line?.id, updatedAt: now };
      }
      if (previousAssetIds.has(asset.id)) return { ...asset, lifecycleStatus: "planned", purchaseOrderId: undefined, purchaseOrderLineId: undefined, updatedAt: now };
      return asset;
    });
    const orderIndex = store.orders.findIndex((item) => item.id === id);
    if (orderIndex >= 0) store.orders[orderIndex] = order;
    else store.orders.push(order);
    writeDemoStore(store);
    return order;
  }

  const firestore = firestoreOrThrow();
  const existingSnapshot = input.id ? await getDoc(doc(firestore, "purchaseOrders", id)) : null;
  const existingOrder = existingSnapshot?.exists() ? orderFromData(existingSnapshot.id, existingSnapshot.data()) : undefined;
  const previousAssetIds = new Set(existingOrder?.lines.flatMap((line) => line.assetIds) ?? []);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "purchaseOrders", id), {
    ...orderDocumentValue(order),
    createdAt: existingSnapshot?.exists() ? existingSnapshot.data().createdAt ?? serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  for (const line of order.lines) {
    for (const assetId of line.assetIds) {
      batch.update(doc(firestore, "inventoryAssets", assetId), {
        lifecycleStatus: lifecycleForOrderStatus(order.status),
        purchaseOrderId: id,
        purchaseOrderLineId: line.id,
        updatedAt: serverTimestamp(),
      });
    }
  }
  for (const assetId of previousAssetIds) {
    if (nextAssetIds.has(assetId)) continue;
    batch.update(doc(firestore, "inventoryAssets", assetId), {
      lifecycleStatus: "planned",
      purchaseOrderId: "",
      purchaseOrderLineId: "",
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return order;
}

export async function checkInInventoryAsset(input: {
  assetId: string;
  locationId: string;
  method: CheckInMethod;
  actorId: string;
  operationId?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  notes?: string;
}) {
  const id = input.operationId
    ? `${input.operationId}-${input.assetId}`
    : createGearId("checkin");
  const value: InventoryCheckIn = {
    id,
    assetId: input.assetId,
    locationId: input.locationId,
    method: input.method,
    actorId: input.actorId,
    operationId: input.operationId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    notes: input.notes?.trim() || undefined,
    checkedInAt: Date.now(),
  };
  if (!value.locationId) throw new Error("Choose a check-in location.");
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    if (!store.checkIns.some((checkIn) => checkIn.id === value.id)) {
      store.checkIns.push(value);
    }
    store.assets = store.assets.map((asset) => asset.id === input.assetId ? {
      ...asset,
      lifecycleStatus: "active",
      currentLocationId: input.locationId,
      updatedAt: value.checkedInAt,
    } : asset);
    store.locations = store.locations.map((location) => location.id === input.locationId ? {
      ...location,
      lastCheckInAt: value.checkedInAt,
    } : location);
    writeDemoStore(store);
    return value;
  }
  const firestore = firestoreOrThrow();
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "inventoryAssets", input.assetId, "checkIns", id), {
    id: value.id,
    assetId: value.assetId,
    locationId: value.locationId,
    method: value.method,
    actorId: value.actorId,
    operationId: value.operationId ?? "",
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    accuracyMeters: value.accuracyMeters ?? null,
    notes: value.notes ?? "",
    checkedInAt: serverTimestamp(),
  });
  batch.update(doc(firestore, "inventoryAssets", input.assetId), {
    lifecycleStatus: "active",
    currentLocationId: input.locationId,
    updatedAt: serverTimestamp(),
  });
  const defaultLocation = DEFAULT_LOCATIONS.find((location) => location.id === input.locationId);
  batch.set(doc(firestore, "gearLocations", input.locationId), {
    ...(defaultLocation ? {
      name: defaultLocation.name,
      kind: defaultLocation.kind,
      notes: defaultLocation.notes ?? "",
      status: defaultLocation.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } : {}),
    lastCheckInAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return value;
}
