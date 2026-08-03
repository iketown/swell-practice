import type { Edge, Node, Viewport } from "@xyflow/react";

export type PortDirection = "input" | "output";
export type ConnectorGender = "male" | "female" | "none";
export type FulfillmentStatus = "unplanned" | "owned" | "rent" | "buy";

export interface ConnectorSnapshot {
  typeId: string;
  label: string;
  gender: ConnectorGender;
  specification?: string;
  acceptedCableTypeIds?: string[];
}

export interface EquipmentPort {
  id: string;
  direction: PortDirection;
  number: number;
  label?: string;
  connector: ConnectorSnapshot;
  signalType?: string;
  channelCapacity?: number;
}

export interface EquipmentImage {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  storagePath: string;
  downloadUrl: string;
}

export interface EquipmentReferenceImage {
  url: string;
  sourceUrl: string;
  altText?: string;
}

export interface EquipmentPurchaseSource {
  url: string;
  vendor?: string;
  priceAmount?: number;
  priceCurrency?: string;
  priceDisplay?: string;
  observedAt: number;
}

export interface EquipmentAiImport {
  model: string;
  sourceUrl: string;
  importedAt: number;
  confidence?: "high" | "medium" | "low";
  sources: Array<{
    url: string;
    title?: string;
  }>;
  warnings: string[];
}

export interface OwnedEquipmentUnit {
  id: string;
  label: string;
  owner?: string;
  notes?: string;
}

export interface EquipmentTemplate {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  category: string;
  description?: string;
  notes?: string;
  purchaseSource?: EquipmentPurchaseSource;
  referenceImages: EquipmentReferenceImage[];
  aiImport?: EquipmentAiImport;
  image?: EquipmentImage;
  detailImages?: EquipmentImage[];
  ports: EquipmentPort[];
  showPortNumbers: boolean;
  showPortLabels: boolean;
  ownedUnits: OwnedEquipmentUnit[];
  version: number;
  status: "active" | "archived";
}

export interface ImportedEquipmentDraft {
  name: string;
  manufacturer?: string;
  model?: string;
  category: string;
  description?: string;
  purchaseSource: EquipmentPurchaseSource;
  ports: EquipmentPort[];
  referenceImages: EquipmentReferenceImage[];
  sources: Array<{
    url: string;
    title?: string;
  }>;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  aiImport: EquipmentAiImport;
}

export interface EquipmentNodeData extends Record<string, unknown> {
  templateId?: string;
  templateVersion?: number;
  name: string;
  category: string;
  notes?: string;
  image?: Pick<EquipmentImage, "storagePath" | "downloadUrl" | "contentType">;
  ports: EquipmentPort[];
  showPortNumbers: boolean;
  showPortLabels: boolean;
  isExpanded?: boolean;
  assignedUnitId?: string;
  assignedUnitLabel?: string;
  fulfillment: FulfillmentStatus;
}

export type SetupNode = Node<EquipmentNodeData, "equipment">;

export interface CableEdgeData extends Record<string, unknown> {
  name?: string;
  color: string;
  endA: ConnectorSnapshot;
  endB: ConnectorSnapshot;
  signalType?: string;
  channelCapacity?: number;
  cableSpecification?: string;
  estimatedLength?: number;
  lengthUnit: "ft" | "m";
  fulfillment: FulfillmentStatus;
  assignedInventoryLabel?: string;
  notes?: string;
  exception?: {
    reason: string;
  };
}

export type CableEdge = Edge<CableEdgeData, "signalCable"> & {
  sourceHandle: string;
  targetHandle: string;
  data: CableEdgeData;
};

export interface SetupGraph {
  schemaVersion: 1;
  revision: number;
  nodes: SetupNode[];
  edges: CableEdge[];
  viewport: Viewport;
}

export interface SetupMetadata {
  id: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  sourceSetupId?: string;
  graphSchemaVersion: 1;
  revision: number;
  nodeCount: number;
  cableCount: number;
  updatedAt: number;
}

export interface SetupWorkspace {
  metadata: SetupMetadata;
  graph: SetupGraph;
}

export interface ConnectorType {
  id: string;
  label: string;
  family: string;
  usesGender: boolean;
  fixedGender?: ConnectorGender;
  portOnly?: boolean;
  acceptedCableTypeIds?: string[];
  defaultSignalTypes: string[];
}

export interface CableRunRow {
  edgeId: string;
  cable: string;
  from: string;
  to: string;
  length?: number;
  lengthUnit: "ft" | "m";
  fulfillment: FulfillmentStatus;
  assignedInventoryLabel?: string;
  notes?: string;
  exceptionReason?: string;
  unresolved: boolean;
  groupKey: string;
}

export interface CableRunGroup {
  key: string;
  cable: string;
  length?: number;
  lengthUnit: "ft" | "m";
  quantity: number;
  owned: number;
  rent: number;
  buy: number;
  unplanned: number;
}

export interface EquipmentUsageRow {
  nodeId: string;
  name: string;
  category: string;
  assignedUnitLabel?: string;
  fulfillment: FulfillmentStatus;
  inputCount: number;
  outputCount: number;
}

export function createSetupId(prefix: string) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function emptySetupGraph(revision = 0): SetupGraph {
  return {
    schemaVersion: 1,
    revision,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
