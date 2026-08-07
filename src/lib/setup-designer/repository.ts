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
import { normalizeCableDefinitionEnds } from "@/lib/setup-designer/cable-definitions";
import {
  duplicateAssetAssignmentMessage,
  duplicateCableAssetAssignmentMessage,
  findDuplicateAssetAssignment,
  findDuplicateCableAssetAssignment,
} from "@/lib/setup-designer/asset-assignments";
import {
  createSetupId,
  emptySetupGraph,
  type ConnectorSnapshot,
  type EquipmentImage,
  type EquipmentAiImport,
  type EquipmentPhysicalDimensions,
  type EquipmentPurchaseSource,
  type EquipmentReferenceImage,
  type EquipmentTemplate,
  type EquipmentTransportTopology,
  type SetupGraph,
  type SetupMetadata,
  type SetupWorkspace,
} from "@/lib/setup-designer/domain";
import { normalizeSetupGraph, setupGraphFromData } from "@/lib/setup-designer/serialization";
import { SAMPLE_EQUIPMENT_TEMPLATES, SAMPLE_SETUP_WORKSPACE } from "@/lib/setup-designer/sample-data";
import { equipmentPortsFromData } from "@/lib/setup-designer/ports";
import { externalCableCount } from "@/lib/setup-designer/snake-topology";

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
    const normalizedTemplates = parsed.templates.map((template) => {
      const ports = equipmentPortsFromData(template.ports);
      const cableEnds = normalizeCableDefinitionEnds(template.cableEnds);
      const definitionKind = template.definitionKind === "cable" || cableEnds ? "cable" : "equipment";
      return {
        ...template,
        definitionKind,
        equipmentKind: template.equipmentKind === "snake" || template.equipmentKind === "split-snake" ? template.equipmentKind : "device",
        transport: transportFromData(template.transport),
        physicalDimensions: physicalDimensionsFromData(template.physicalDimensions),
        ...(definitionKind === "cable" && cableEnds ? { cableEnds } : { cableEnds: undefined }),
        ports: definitionKind === "cable" ? [] : ports,
        showInSignalView: definitionKind === "cable" ? false : typeof template.showInSignalView === "boolean" ? template.showInSignalView : ports.length > 0,
        referenceImages: Array.isArray(template.referenceImages) ? template.referenceImages : [],
      } satisfies EquipmentTemplate;
    });
    const normalizedTemplateIds = new Set(normalizedTemplates.map((template) => template.id));
    return {
      ...parsed,
      graphs: Object.fromEntries(Object.entries(parsed.graphs).map(([setupId, graph]) => [setupId, setupGraphFromData(graph, graph?.revision ?? 0)])),
      templates: [...normalizedTemplates, ...SAMPLE_EQUIPMENT_TEMPLATES.filter((template) => !normalizedTemplateIds.has(template.id))],
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
    graphSchemaVersion: Number(value.graphSchemaVersion) === 2 ? 2 : 1,
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

function physicalDimensionsFromData(value: unknown): EquipmentPhysicalDimensions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const positiveNumber = (candidate: unknown) => {
    const number = Number(candidate);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  };
  const dimensions: EquipmentPhysicalDimensions = {
    widthInches: positiveNumber(data.widthInches),
    depthInches: positiveNumber(data.depthInches),
    heightInches: positiveNumber(data.heightInches),
    weightPounds: positiveNumber(data.weightPounds),
    sourceText: typeof data.sourceText === "string" && data.sourceText.trim() ? data.sourceText.trim() : undefined,
  };
  return dimensions.widthInches || dimensions.depthInches || dimensions.heightInches || dimensions.weightPounds || dimensions.sourceText
    ? dimensions
    : undefined;
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

function transportFromData(value: unknown): EquipmentTransportTopology | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (data.kind !== "snake" && data.kind !== "split-snake") return undefined;
  const expectedEndpoints = data.kind === "split-snake" ? 3 : 2;
  const endpoints = Array.isArray(data.endpoints) ? data.endpoints.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const endpoint = item as Record<string, unknown>;
    if (typeof endpoint.id !== "string" || typeof endpoint.label !== "string") return [];
    const style: "box" | "fan" | "tail" = endpoint.style === "fan" || endpoint.style === "tail" ? endpoint.style : "box";
    return [{ id: endpoint.id, label: endpoint.label, style }];
  }) : [];
  if (endpoints.length !== expectedEndpoints) return undefined;
  const rawLength = Number(data.length);
  return {
    kind: data.kind,
    ...(Number.isFinite(rawLength) && rawLength > 0 ? { length: rawLength } : {}),
    lengthUnit: data.lengthUnit === "m" ? "m" : "ft",
    channelCount: Math.max(1, Math.floor(Number(data.channelCount) || 1)),
    endpoints,
  };
}

function templateFromData(id: string, value: Record<string, unknown>): EquipmentTemplate {
  const cableEnds = normalizeCableDefinitionEnds(value.cableEnds);
  const definitionKind = value.definitionKind === "cable" || cableEnds ? "cable" : "equipment";
  return {
    id,
    name: String(value.name ?? "Untitled equipment"),
    definitionKind,
    manufacturer: typeof value.manufacturer === "string" && value.manufacturer ? value.manufacturer : undefined,
    model: typeof value.model === "string" && value.model ? value.model : undefined,
    category: String(value.category ?? "Other"),
    equipmentKind: value.equipmentKind === "snake" || value.equipmentKind === "split-snake" ? value.equipmentKind : "device",
    transport: transportFromData(value.transport),
    description: typeof value.description === "string" && value.description ? value.description : undefined,
    notes: typeof value.notes === "string" && value.notes ? value.notes : undefined,
    physicalDimensions: physicalDimensionsFromData(value.physicalDimensions),
    purchaseSource: purchaseSourceFromData(value.purchaseSource),
    referenceImages: referenceImagesFromData(value.referenceImages),
    aiImport: aiImportFromData(value.aiImport),
    image: imageFromData(value.image),
    stageImage: imageFromData(value.stageImage),
    detailImages: imagesFromData(value.detailImages),
    ...(definitionKind === "cable" && cableEnds ? { cableEnds } : {}),
    ports: definitionKind === "cable" ? [] : equipmentPortsFromData(value.ports),
    showInSignalView: definitionKind === "cable" ? false : typeof value.showInSignalView === "boolean" ? value.showInSignalView : equipmentPortsFromData(value.ports).length > 0,
    showPortNumbers: value.showPortNumbers !== false,
    showPortLabels: value.showPortLabels !== false,
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
    return metadata && graph ? { metadata: structuredClone(metadata), graph: setupGraphFromData(graph, metadata.revision) } : null;
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
    graphSchemaVersion: 2,
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
    graphSchemaVersion: 2,
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
  const equipmentCount = new Set(graph.nodes.map((node) => node.data.assemblyId ?? node.id)).size;
  const cableCount = externalCableCount(graph.edges);
  const duplicateAsset = findDuplicateAssetAssignment(graph.nodes);
  if (duplicateAsset) throw new Error(duplicateAssetAssignmentMessage(duplicateAsset));
  const duplicateCableAsset = findDuplicateCableAssetAssignment(graph.edges);
  if (duplicateCableAsset) throw new Error(duplicateCableAssetAssignmentMessage(duplicateCableAsset));
  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const index = store.setups.findIndex((setup) => setup.id === setupId);
    if (index < 0) throw new Error("Setup not found.");
    if (store.setups[index].revision !== expectedRevision) throw new SetupRevisionConflictError(store.setups[index].revision);
    store.setups[index] = {
      ...store.setups[index],
      ...(sourceSetupId ? { sourceSetupId } : {}),
      revision: nextRevision,
      graphSchemaVersion: graph.schemaVersion,
      nodeCount: equipmentCount,
      cableCount,
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
      graphSchemaVersion: graph.schemaVersion,
      nodeCount: equipmentCount,
      cableCount,
      updatedBy: actorId,
      updatedAt: serverTimestamp(),
    });
    transaction.set(graphRef, { ...graph, updatedAt: serverTimestamp() });
  });
  return nextRevision;
}

export async function unassignInventoryAssetsFromSetups(assetIds: Iterable<string>, actorId = "admin") {
  const deletedAssetIds = new Set(Array.from(assetIds, (assetId) => assetId.trim()).filter(Boolean));
  if (!deletedAssetIds.size) return 0;

  const setups = await listSetups(true);
  let updatedSetupCount = 0;
  for (const setup of setups) {
    const workspace = await getSetupWorkspace(setup.id);
    if (!workspace) continue;
    let changed = false;
    const nodes = workspace.graph.nodes.map((node) => {
      if (!node.data.assignedAssetId || !deletedAssetIds.has(node.data.assignedAssetId)) return node;
      changed = true;
      const data = { ...node.data };
      delete data.assignedAssetId;
      delete data.assignedAssetLabel;
      return {
        ...node,
        data: {
          ...data,
          fulfillment: "unplanned" as const,
        },
      };
    });
    const edges = workspace.graph.edges.map((edge) => {
      if (!edge.data.assignedInventoryAssetId || !deletedAssetIds.has(edge.data.assignedInventoryAssetId)) return edge;
      changed = true;
      const data = { ...edge.data };
      delete data.assignedInventoryAssetId;
      delete data.assignedInventoryLabel;
      return {
        ...edge,
        data: {
          ...data,
          fulfillment: "unplanned" as const,
        },
      };
    });
    if (!changed) continue;
    await saveSetupWorkspace(
      setup.id,
      { ...workspace.graph, nodes, edges },
      workspace.metadata.revision,
      actorId,
    );
    updatedSetupCount += 1;
  }
  return updatedSetupCount;
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
    definitionKind: template.definitionKind,
    manufacturer: template.manufacturer ?? "",
    model: template.model ?? "",
    category: template.category,
    equipmentKind: template.equipmentKind,
    transport: template.transport ? {
      kind: template.transport.kind,
      length: template.transport.length ?? null,
      lengthUnit: template.transport.lengthUnit,
      channelCount: template.transport.channelCount,
      endpoints: template.transport.endpoints.map((endpoint) => ({ ...endpoint })),
    } : null,
    description: template.description ?? "",
    notes: template.notes ?? "",
    physicalDimensions: template.physicalDimensions ? {
      widthInches: template.physicalDimensions.widthInches ?? null,
      depthInches: template.physicalDimensions.depthInches ?? null,
      heightInches: template.physicalDimensions.heightInches ?? null,
      weightPounds: template.physicalDimensions.weightPounds ?? null,
      sourceText: template.physicalDimensions.sourceText ?? "",
    } : null,
    purchaseSource: template.purchaseSource ? {
      url: template.purchaseSource.url,
      vendor: template.purchaseSource.vendor ?? "",
      priceAmount: template.purchaseSource.priceAmount ?? null,
      priceCurrency: template.purchaseSource.priceCurrency ?? "",
      priceDisplay: template.purchaseSource.priceDisplay ?? "",
      observedAt: template.purchaseSource.observedAt,
    } : null,
    referenceImages: template.referenceImages.map((image) => ({
      url: image.url,
      sourceUrl: image.sourceUrl,
      altText: image.altText ?? "",
    })),
    aiImport: template.aiImport ? {
      model: template.aiImport.model,
      sourceUrl: template.aiImport.sourceUrl,
      importedAt: template.aiImport.importedAt,
      confidence: template.aiImport.confidence ?? "",
      sources: template.aiImport.sources.map((source) => ({ url: source.url, title: source.title ?? "" })),
      warnings: template.aiImport.warnings,
    } : null,
    image: template.image ?? null,
    stageImage: template.stageImage ?? null,
    detailImages: template.detailImages ?? [],
    cableEnds: template.definitionKind === "cable" && template.cableEnds ? {
      end1: template.cableEnds.end1.map(cableConnectorDocumentValue),
      end2: template.cableEnds.end2.map(cableConnectorDocumentValue),
    } : null,
    ports: template.ports.map((port) => ({
      id: port.id,
      direction: port.direction,
      number: port.number,
      label: port.label ?? "",
      connector: {
        typeId: port.connector.typeId,
        label: port.connector.label,
        gender: port.connector.gender,
        specification: port.connector.specification ?? "",
        acceptedCableTypeIds: port.connector.acceptedCableTypeIds ?? [],
      },
      signalType: port.signalType ?? "",
      channelCapacity: port.channelCapacity ?? null,
      endpointId: port.endpointId ?? "",
      channelKey: port.channelKey ?? "",
    })),
    showPortNumbers: template.showPortNumbers,
    showPortLabels: template.showPortLabels,
    showInSignalView: template.showInSignalView,
    version: template.version,
    status: template.status,
  };
}

function cableConnectorDocumentValue(connector: ConnectorSnapshot) {
  return {
    typeId: connector.typeId,
    label: connector.label,
    gender: connector.gender,
    specification: connector.specification ?? "",
    acceptedCableTypeIds: connector.acceptedCableTypeIds ?? [],
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
    stageFile?: File;
    detailFiles?: File[];
  },
  onProgress?: (progress: number) => void,
) {
  const uploads = [
    ...(files.iconFile ? [{ kind: "icon" as const, file: files.iconFile }] : []),
    ...(files.stageFile ? [{ kind: "stage" as const, file: files.stageFile }] : []),
    ...(files.detailFiles ?? []).map((file) => ({ kind: "detail" as const, file })),
  ];
  if (!uploads.length) return template;

  const uploaded: Array<{ kind: "icon" | "stage" | "detail"; image: EquipmentImage }> = [];
  for (const [index, upload] of uploads.entries()) {
    const image = await uploadEquipmentImage(template.id, upload.file, (fileProgress) => {
      onProgress?.(Math.round(((index + fileProgress / 100) / uploads.length) * 100));
    });
    uploaded.push({ kind: upload.kind, image });
  }

  const icon = uploaded.find((item) => item.kind === "icon")?.image;
  const stageImage = uploaded.find((item) => item.kind === "stage")?.image;
  const details = uploaded.filter((item) => item.kind === "detail").map((item) => item.image);
  const updated: EquipmentTemplate = {
    ...structuredClone(template),
    ...(icon ? { image: icon } : {}),
    ...(stageImage ? { stageImage } : {}),
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
  const cableEnds = input.definitionKind === "cable" ? normalizeCableDefinitionEnds(input.cableEnds) : undefined;
  if (input.definitionKind === "cable" && !cableEnds) throw new Error("Cable definitions need at least one connector on each end.");
  const templateValue: EquipmentTemplate = {
    ...structuredClone(input),
    id: templateId,
    ...(image ? { image } : {}),
    cableEnds,
    ports: input.definitionKind === "cable" ? [] : structuredClone(input.ports),
    showInSignalView: input.definitionKind === "cable" ? false : input.showInSignalView,
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

export async function updateEquipmentTemplate(
  template: EquipmentTemplate,
  imageFile?: File,
  onProgress?: (progress: number) => void,
) {
  const image = imageFile ? await uploadEquipmentImage(template.id, imageFile, onProgress) : template.image;
  const cableEnds = template.definitionKind === "cable" ? normalizeCableDefinitionEnds(template.cableEnds) : undefined;
  if (template.definitionKind === "cable" && !cableEnds) throw new Error("Cable definitions need at least one connector on each end.");
  const updated: EquipmentTemplate = {
    ...structuredClone(template),
    ...(image ? { image } : {}),
    cableEnds,
    ports: template.definitionKind === "cable" ? [] : structuredClone(template.ports),
    showInSignalView: template.definitionKind === "cable" ? false : template.showInSignalView,
    version: template.version + 1,
    status: "active",
  };

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const index = store.templates.findIndex((item) => item.id === updated.id);
    if (index >= 0) store.templates[index] = updated;
    else store.templates.push(updated);
    writeDemoStore(store);
    return updated;
  }

  await setDoc(doc(firestoreOrThrow(), "equipmentTemplates", updated.id), {
    ...equipmentTemplateDocumentValue(updated),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return updated;
}

export async function archiveEquipmentTemplate(template: EquipmentTemplate) {
  const archived: EquipmentTemplate = {
    ...structuredClone(template),
    version: template.version + 1,
    status: "archived",
  };

  if (isDemoMode() || !db) {
    const store = readDemoStore();
    const index = store.templates.findIndex((item) => item.id === archived.id);
    if (index >= 0) store.templates[index] = archived;
    else store.templates.push(archived);
    writeDemoStore(store);
    return archived;
  }

  await setDoc(doc(firestoreOrThrow(), "equipmentTemplates", archived.id), {
    ...equipmentTemplateDocumentValue(archived),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return archived;
}
