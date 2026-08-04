"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
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
  createAssetTag,
  createGearId,
  isStandardAssetTag,
  lifecycleForOrderStatus,
  type CheckInMethod,
  type GearLocation,
  type GearLocationKind,
  type GearParty,
  type GearPartyKind,
  type InventoryAsset,
  type InventoryAssetLifecycle,
  type InventoryCheckIn,
  type PaymentStatus,
  type PublicGearAsset,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/gear/domain";
import type { EquipmentImage } from "@/lib/setup-designer/domain";

const DEMO_STORE_KEY = "swell-parts:gear:v1";

interface GearDemoStore {
  parties: GearParty[];
  locations: GearLocation[];
  assets: InventoryAsset[];
  orders: PurchaseOrder[];
  checkIns: InventoryCheckIn[];
}

export interface InventoryAssetInput {
  id?: string;
  assetTag?: string;
  definitionId: string;
  label: string;
  lifecycleStatus: InventoryAssetLifecycle;
  ownerPartyId?: string;
  currentLocationId?: string;
  serialNumber?: string;
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
        assetTag: "SWL-SM580001",
        definitionId: "template-vocal-mic",
        label: "Ike's SM58 #1",
        lifecycleStatus: "active",
        ownerPartyId: "party-ike",
        currentLocationId: "location-ike-house",
        photos: [],
        createdAt: now - 1000 * 60 * 60 * 24 * 30,
        updatedAt: now - 1000 * 60 * 60 * 24 * 4,
      },
      {
        id: "asset-radial-jdi-planned",
        assetTag: "SWL-JDI00002",
        definitionId: "template-guitar-di",
        label: "Second Radial JDI",
        lifecycleStatus: "planned",
        ownerPartyId: "party-the-swell",
        notes: "Needed for the expanded live setup.",
        photos: [],
        createdAt: now - 1000 * 60 * 60 * 24 * 2,
        updatedAt: now - 1000 * 60 * 60 * 24 * 2,
      },
    ],
    orders: [],
    checkIns: [],
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
      assets: Array.isArray(value.assets) ? value.assets : [],
      orders: Array.isArray(value.orders) ? value.orders : [],
      checkIns: Array.isArray(value.checkIns) ? value.checkIns : [],
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
    definitionId: String(value.definitionId ?? ""),
    label: String(value.label ?? "Unnamed gear"),
    lifecycleStatus: lifecycleValues.includes(value.lifecycleStatus as InventoryAssetLifecycle) ? value.lifecycleStatus as InventoryAssetLifecycle : "planned",
    ownerPartyId: stringValue(value.ownerPartyId),
    currentLocationId: stringValue(value.currentLocationId),
    serialNumber: stringValue(value.serialNumber),
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
  if (isDemoMode() || !db) return readDemoStore().assets.sort((a, b) => b.updatedAt - a.updatedAt);
  const snapshots = await getDocs(collection(db, "inventoryAssets"));
  return snapshots.docs.map((item) => assetFromData(item.id, item.data())).sort((a, b) => b.updatedAt - a.updatedAt);
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
  if (isDemoMode() || !db || !assets.length) return;
  const existingSnapshots = await getDocs(collection(db, "gearPublicAssets"));
  const existing = new Map(existingSnapshots.docs.map((item) => [item.id, publicGearAssetFromData(item.data())]));
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
    definitionId: asset.definitionId,
    label: asset.label,
    lifecycleStatus: asset.lifecycleStatus,
    ownerPartyId: asset.ownerPartyId ?? "",
    currentLocationId: asset.currentLocationId ?? "",
    serialNumber: asset.serialNumber ?? "",
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
  const assetTag = canonicalizeAssetTag(input.assetTag || createAssetTag(input.label, existingAssets.map((item) => item.assetTag)));
  const retainsLegacyTag = previousAsset && canonicalizeAssetTag(previousAsset.assetTag) === assetTag;
  if (!retainsLegacyTag && !isStandardAssetTag(assetTag)) {
    throw new Error("Use a three-letter ID followed by a sequence, such as HXS-01 or XLR-04-25.");
  }
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
    definitionId: input.definitionId,
    label: input.label.trim(),
    lifecycleStatus: input.lifecycleStatus,
    ownerPartyId: input.ownerPartyId || undefined,
    currentLocationId: input.currentLocationId || undefined,
    serialNumber: input.serialNumber?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    photos: [...(input.photos ?? []), ...uploaded],
    sourceSetupId: input.sourceSetupId || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  if (!asset.definitionId) throw new Error("Choose a gear definition.");
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
