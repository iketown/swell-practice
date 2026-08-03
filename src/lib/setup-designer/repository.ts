"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { sanitizeFilename } from "@/lib/domain";
import { db, hasFirebaseConfig, storage } from "@/lib/firebase";
import {
  createSetupId,
  emptySetupGraph,
  type EquipmentImage,
  type EquipmentAiImport,
  type EquipmentPurchaseSource,
  type EquipmentReferenceImage,
  type EquipmentTemplate,
  type SetupGraph,
  type SetupMetadata,
  type SetupWorkspace,
} from "@/lib/setup-designer/domain";
import { normalizeSetupGraph, setupGraphFromData } from "@/lib/setup-designer/serialization";
import { SAMPLE_EQUIPMENT_TEMPLATES, SAMPLE_SETUP_WORKSPACE } from "@/lib/setup-designer/sample-data";
import { equipmentPortsFromData } from "@/lib/setup-designer/ports";

const DEMO_STORE_KEY = "swell-parts:setup-designer:v1";

interface DemoStore {
  setups: SetupMetadata[];
  graphs: Record<string, SetupGraph>;
  templates: EquipmentTemplate[];
}

export class SetupRevisionConflictError extends Error {
  constructor(public readonly latestRevision: number) {
    super("This setup was saved somewhere else after you opened it.");
    this.name = "SetupRevisionConflictError";
  }
}

function isDemoMode() {
  return !hasFirebaseConfig || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1");
}

function seedDemoStore(): DemoStore {
  return {
    setups: [structuredClone(SAMPLE_SETUP_WORKSPACE.metadata)],
    graphs: { [SAMPLE_SETUP_WORKSPACE.metadata.id]: structuredClone(SAMPLE_SETUP_WORKSPACE.graph) },
    templates: structuredClone(SAMPLE_EQUIPMENT_TEMPLATES),
  };
}

function readDemoStore(): DemoStore {
  if (typeof window === "undefined") return seedDemoStore();
  const stored = window.localStorage.getItem(DEMO_STORE_KEY);
  if (!stored) {
    const seed = seedDemoStore();
    window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(stored) as DemoStore;
    if (!parsed || !Array.isArray(parsed.setups) || !parsed.graphs || !Array.isArray(parsed.templates)) return seedDemoStore();
    return {
      ...parsed,
      templates: parsed.templates.map((template) => ({
        ...template,
        ports: equipmentPortsFromData(template.ports),
        referenceImages: Array.isArray(template.referenceImages) ? template.referenceImages : [],
      })),
    };
  } catch {
    return seedDemoStore();
  }
}

function writeDemoStore(store: DemoStore) {
  window.localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function timestampMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return Date.now();
}

function setupMetadataFromData(id: string, value: Record<string, unknown>): SetupMetadata {
  return {
    id,
    name: String(value.name ?? "Untitled setup"),
    description: typeof value.description === "string" && value.description ? value.description : undefined,
    status: value.status === "archived" ? "archived" : "active",
    sourceSetupId: typeof value.sourceSetupId === "string" ? value.sourceSetupId : undefined,
    graphSchemaVersion: 1,
    revision: Number(value.revision ?? 0),
    nodeCount: Number(value.nodeCount ?? 0),
    cableCount: Number(value.cableCount ?? 0),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

function imageFromData(value: unknown): EquipmentImage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const contentType = data.contentType;
  if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") return undefined;
  if (typeof data.downloadUrl !== "string" || typeof data.storagePath !== "string") return undefined;
  return {
    filename: String(data.filename ?? "equipment-image"),
    contentType,
    size: Number(data.size ?? 0),
    storagePath: data.storagePath,
    downloadUrl: data.downloadUrl,
  };
}

function imagesFromData(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const image = imageFromData(item);
    return image ? [image] : [];
  });
}

function purchaseSourceFromData(value: unknown): EquipmentPurchaseSource | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.url !== "string" || !data.url) return undefined;
  return {
    url: data.url,
    vendor: typeof data.vendor === "string" && data.vendor ? data.vendor : undefined,
    priceAmount: typeof data.priceAmount === "number" && Number.isFinite(data.priceAmount) ? data.priceAmount : undefined,
    priceCurrency: typeof data.priceCurrency === "string" && data.priceCurrency ? data.priceCurrency : undefined,
    priceDisplay: typeof data.priceDisplay === "string" && data.priceDisplay ? data.priceDisplay : undefined,
    observedAt: Number(data.observedAt ?? Date.now()),
  };
}

function referenceImagesFromData(value: unknown): EquipmentReferenceImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (typeof data.url !== "string" || typeof data.sourceUrl !== "string") return [];
    return [{
      url: data.url,
      sourceUrl: data.sourceUrl,
      altText: typeof data.altText === "string" && data.altText ? data.altText : undefined,
    }];
  });
}

function aiImportFromData(value: unknown): EquipmentAiImport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.model !== "string" || typeof data.sourceUrl !== "string") return undefined;
  return {
    model: data.model,
    sourceUrl: data.sourceUrl,
    importedAt: Number(data.importedAt ?? Date.now()),
    confidence: data.confidence === "high" || data.confidence === "medium" || data.confidence === "low" ? data.confidence : undefined,
    sources: Array.isArray(data.sources) ? data.sources.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const source = item as Record<string, unknown>;
      if (typeof source.url !== "string") return [];
      return [{
        url: source.url,
        title: typeof source.title === "string" && source.title ? source.title : undefined,
      }];
    }) : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((item): item is string => typeof item === "string") : [],
  };
}

function templateFromData(id: string, value: Record<string, unknown>): EquipmentTemplate {
  return {
    id,
    name: String(value.name ?? "Untitled equipment"),
    manufacturer: typeof value.manufacturer === "string" && value.manufacturer ? value.manufacturer : undefined,
    model: typeof value.model === "string" && value.model ? value.model : undefined,
    category: String(value.category ?? "Other"),
    description: typeof value.description === "string" && value.description ? value.description : undefined,
    notes: typeof value.notes === "string" && value.notes ? value.notes : undefined,
    purchaseSource: purchaseSourceFromData(value.purchaseSource),
    referenceImages: referenceImagesFromData(value.referenceImages),
    aiImport: aiImportFromData(value.aiImport),
    image: imageFromData(value.image),
    detailImages: imagesFromData(value.detailImages),
    ports: equipmentPortsFromData(value.ports),
    showPortNumbers: value.showPortNumbers !== false,
    showPortLabels: value.showPortLabels !== false,
    ownedUnits: Array.isArray(value.ownedUnits) ? structuredClone(value.ownedUnits) as EquipmentTemplate["ownedUnits"] : [],
    version: Number(value.version ?? 1),
    status: value.status === "archived" ? "archived" : "active",
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

export async function listSetups(includeArchived = false): Promise<SetupMetadata[]> {
  if (isDemoMode() || !db) {
    return readDemoStore().setups
      .filter((setup) => includeArchived || setup.status === "active")
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }
  const snapshots = await getDocs(query(collection(db, "setups"), orderBy("updatedAt", "desc")));
  return snapshots.docs
    .map((snapshot) => setupMetadataFromData(snapshot.id, snapshot.data()))
    .filter((setup) => includeArchived || setup.status === "active");
}

export async function getSetupWorkspace(setupId: string): Promise<SetupWorkspace | null> {
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const metadata = store.setups.find((setup) => setup.id === setupId);
    const graph = store.graphs[setupId];
    return metadata && graph ? { metadata: structuredClone(metadata), graph: structuredClone(graph) } : null;
  }
  const firestore = firestoreOrThrow();
  const [metadataSnapshot, graphSnapshot] = await Promise.all([
    getDoc(doc(firestore, "setups", setupId)),
    getDoc(doc(firestore, "setups", setupId, "graphs", "current")),
  ]);
  if (!metadataSnapshot.exists()) return null;
  const metadata = setupMetadataFromData(metadataSnapshot.id, metadataSnapshot.data());
  const graph = graphSnapshot.exists()
    ? setupGraphFromData(graphSnapshot.data(), metadata.revision)
    : emptySetupGraph(metadata.revision);
  return { metadata, graph };
}

export async function createSetup(name: string, description = "", actorId = "admin") {
  const trimmedName = name.trim() || "Untitled setup";
  const setupId = isDemoMode() || !db ? createSetupId("setup") : doc(collection(firestoreOrThrow(), "setups")).id;
  const now = Date.now();
  const metadata: SetupMetadata = {
    id: setupId,
    name: trimmedName,
    ...(description.trim() ? { description: description.trim() } : {}),
    status: "active",
    graphSchemaVersion: 1,
    revision: 0,
    nodeCount: 0,
    cableCount: 0,
    updatedAt: now,
  };
  const graph = emptySetupGraph(0);

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.setups.push(metadata);
    store.graphs[setupId] = graph;
    writeDemoStore(store);
    return setupId;
  }

  const firestore = firestoreOrThrow();
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "setups", setupId), {
    name: metadata.name,
    description: metadata.description ?? "",
    status: "active",
    graphSchemaVersion: 1,
    revision: 0,
    nodeCount: 0,
    cableCount: 0,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(firestore, "setups", setupId, "graphs", "current"), {
    ...graph,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return setupId;
}

export async function renameSetup(setupId: string, name: string, description = "", actorId = "admin") {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Setup name is required.");
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.setups = store.setups.map((setup) => setup.id === setupId ? {
      ...setup,
      name: trimmedName,
      description: description.trim() || undefined,
      updatedAt: Date.now(),
    } : setup);
    writeDemoStore(store);
    return;
  }
  await updateDoc(doc(firestoreOrThrow(), "setups", setupId), {
    name: trimmedName,
    description: description.trim(),
    updatedBy: actorId,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveSetup(setupId: string, actorId = "admin") {
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.setups = store.setups.map((setup) => setup.id === setupId ? { ...setup, status: "archived", updatedAt: Date.now() } : setup);
    writeDemoStore(store);
    return;
  }
  await updateDoc(doc(firestoreOrThrow(), "setups", setupId), {
    status: "archived",
    updatedBy: actorId,
    updatedAt: serverTimestamp(),
  });
}

export async function duplicateSetup(setupId: string, actorId = "admin") {
  const workspace = await getSetupWorkspace(setupId);
  if (!workspace) throw new Error("Setup not found.");
  const duplicateId = await createSetup(`${workspace.metadata.name} Copy`, workspace.metadata.description ?? "", actorId);
  const duplicate = await getSetupWorkspace(duplicateId);
  if (!duplicate) throw new Error("Could not create the setup copy.");
  const graph = normalizeSetupGraph({ ...workspace.graph, revision: duplicate.metadata.revision });
  await saveSetupWorkspace(duplicateId, graph, duplicate.metadata.revision, actorId, setupId);
  return duplicateId;
}

export async function saveSetupWorkspace(
  setupId: string,
  graphInput: SetupGraph,
  expectedRevision: number,
  actorId = "admin",
  sourceSetupId?: string,
): Promise<number> {
  const nextRevision = expectedRevision + 1;
  const graph = normalizeSetupGraph({ ...graphInput, revision: nextRevision });
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const index = store.setups.findIndex((setup) => setup.id === setupId);
    if (index < 0) throw new Error("Setup not found.");
    if (store.setups[index].revision !== expectedRevision) throw new SetupRevisionConflictError(store.setups[index].revision);
    store.setups[index] = {
      ...store.setups[index],
      ...(sourceSetupId ? { sourceSetupId } : {}),
      revision: nextRevision,
      nodeCount: graph.nodes.length,
      cableCount: graph.edges.length,
      updatedAt: Date.now(),
    };
    store.graphs[setupId] = graph;
    writeDemoStore(store);
    return nextRevision;
  }

  const firestore = firestoreOrThrow();
  const metadataRef = doc(firestore, "setups", setupId);
  const graphRef = doc(firestore, "setups", setupId, "graphs", "current");
  await runTransaction(firestore, async (transaction) => {
    const currentSnapshot = await transaction.get(metadataRef);
    if (!currentSnapshot.exists()) throw new Error("Setup not found.");
    const currentRevision = Number(currentSnapshot.data().revision ?? 0);
    if (currentRevision !== expectedRevision) throw new SetupRevisionConflictError(currentRevision);
    transaction.update(metadataRef, {
      ...(sourceSetupId ? { sourceSetupId } : {}),
      revision: nextRevision,
      nodeCount: graph.nodes.length,
      cableCount: graph.edges.length,
      updatedBy: actorId,
      updatedAt: serverTimestamp(),
    });
    transaction.set(graphRef, { ...graph, updatedAt: serverTimestamp() });
  });
  return nextRevision;
}

export async function listEquipmentTemplates(includeArchived = false): Promise<EquipmentTemplate[]> {
  if (isDemoMode() || !db) {
    return readDemoStore().templates
      .filter((template) => includeArchived || template.status === "active")
      .sort((left, right) => left.name.localeCompare(right.name));
  }
  const snapshots = await getDocs(query(collection(db, "equipmentTemplates"), orderBy("name", "asc")));
  const stored = snapshots.docs.map((snapshot) => templateFromData(snapshot.id, snapshot.data()));
  const storedIds = new Set(stored.map((template) => template.id));
  return [...stored, ...SAMPLE_EQUIPMENT_TEMPLATES.filter((template) => !storedIds.has(template.id))]
    .filter((template) => includeArchived || template.status === "active")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare the equipment image."));
    reader.readAsDataURL(file);
  });
}

async function uploadEquipmentImage(templateId: string, file: File, onProgress?: (progress: number) => void): Promise<EquipmentImage> {
  if (isDemoMode() || !storage) {
    onProgress?.(100);
    return {
      filename: file.name,
      contentType: file.type as EquipmentImage["contentType"],
      size: file.size,
      storagePath: `demo/setup-designer/equipment/${templateId}/${file.name}`,
      downloadUrl: await fileToDataUrl(file),
    };
  }
  const imageId = createSetupId("image");
  const storagePath = `setup-designer/equipment/${templateId}/${imageId}-${sanitizeFilename(file.name)}`;
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

function equipmentTemplateDocumentValue(template: EquipmentTemplate) {
  return {
    name: template.name,
    manufacturer: template.manufacturer ?? "",
    model: template.model ?? "",
    category: template.category,
    description: template.description ?? "",
    notes: template.notes ?? "",
    purchaseSource: template.purchaseSource ?? null,
    referenceImages: template.referenceImages,
    aiImport: template.aiImport ?? null,
    image: template.image ?? null,
    detailImages: template.detailImages ?? [],
    ports: template.ports,
    showPortNumbers: template.showPortNumbers,
    showPortLabels: template.showPortLabels,
    ownedUnits: template.ownedUnits,
    version: template.version,
    status: template.status,
  };
}

export async function replaceEquipmentTemplateImage(
  template: EquipmentTemplate,
  imageFile: File,
  onProgress?: (progress: number) => void,
) {
  return updateEquipmentTemplateImages(template, { iconFile: imageFile }, onProgress);
}

export async function updateEquipmentTemplateImages(
  template: EquipmentTemplate,
  files: {
    iconFile?: File;
    detailFiles?: File[];
  },
  onProgress?: (progress: number) => void,
) {
  const uploads = [
    ...(files.iconFile ? [{ kind: "icon" as const, file: files.iconFile }] : []),
    ...(files.detailFiles ?? []).map((file) => ({ kind: "detail" as const, file })),
  ];
  if (!uploads.length) return template;

  const uploaded: Array<{ kind: "icon" | "detail"; image: EquipmentImage }> = [];
  for (const [index, upload] of uploads.entries()) {
    const image = await uploadEquipmentImage(template.id, upload.file, (fileProgress) => {
      onProgress?.(Math.round(((index + fileProgress / 100) / uploads.length) * 100));
    });
    uploaded.push({ kind: upload.kind, image });
  }

  const icon = uploaded.find((item) => item.kind === "icon")?.image;
  const details = uploaded.filter((item) => item.kind === "detail").map((item) => item.image);
  const updated: EquipmentTemplate = {
    ...structuredClone(template),
    ...(icon ? { image: icon } : {}),
    detailImages: [...(template.detailImages ?? []), ...details],
    version: template.version + 1,
  };

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const existingIndex = store.templates.findIndex((item) => item.id === template.id);
    if (existingIndex >= 0) store.templates[existingIndex] = updated;
    else store.templates.push(updated);
    writeDemoStore(store);
    return updated;
  }

  await setDoc(doc(firestoreOrThrow(), "equipmentTemplates", template.id), {
    ...equipmentTemplateDocumentValue(updated),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return updated;
}

export async function createEquipmentTemplate(
  input: Omit<EquipmentTemplate, "id" | "version" | "status" | "image">,
  imageFile?: File,
  onProgress?: (progress: number) => void,
) {
  const templateId = isDemoMode() || !db ? createSetupId("template") : doc(collection(firestoreOrThrow(), "equipmentTemplates")).id;
  const image = imageFile ? await uploadEquipmentImage(templateId, imageFile, onProgress) : undefined;
  const templateValue: EquipmentTemplate = {
    ...structuredClone(input),
    id: templateId,
    ...(image ? { image } : {}),
    version: 1,
    status: "active",
  };

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    store.templates.push(templateValue);
    writeDemoStore(store);
    return templateValue;
  }

  await setDoc(doc(firestoreOrThrow(), "equipmentTemplates", templateId), {
    ...equipmentTemplateDocumentValue(templateValue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return templateValue;
}
