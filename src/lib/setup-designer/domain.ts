import type { Edge, Node, Viewport } from "@xyflow/react";

export type PortDirection = "input" | "output";
export type ConnectorGender = "male" | "female" | "none";
export type FulfillmentStatus = "unplanned" | "owned" | "rent" | "buy";
export type EquipmentKind = "device" | "snake" | "split-snake";
export type GearDefinitionKind = "equipment" | "cable";
export type SetupWorkspaceView = "signal" | "stage";
export type StageConnectionSide = "top" | "right" | "bottom" | "left";

export interface StageConnectionAnchor {
  side: StageConnectionSide;
  /** Position along the selected side, expressed from 0 to 1. */
  offset: number;
}

export interface StagePosition {
  xFeet: number;
  yFeet: number;
  widthFeet?: number;
  depthFeet?: number;
  rotationDegrees?: number;
  inputAnchor?: StageConnectionAnchor;
  outputAnchor?: StageConnectionAnchor;
}

export interface StageWaypoint {
  id: string;
  label: string;
  position: {
    xFeet: number;
    yFeet: number;
  };
}

export interface StageArea {
  id: string;
  label: string;
  xFeet: number;
  yFeet: number;
  widthFeet: number;
  depthFeet: number;
}

export interface StagePlan {
  widthFeet: number;
  depthFeet: number;
  viewport: Viewport;
  areas: StageArea[];
  waypoints: StageWaypoint[];
}

export interface EquipmentTransportEndpoint {
  id: string;
  label: string;
  style: "box" | "fan" | "tail";
}

export interface EquipmentTransportTopology {
  kind: "snake" | "split-snake";
  length?: number;
  lengthUnit: "ft" | "m";
  channelCount: number;
  endpoints: EquipmentTransportEndpoint[];
}

export interface ConnectorSnapshot {
  typeId: string;
  label: string;
  gender: ConnectorGender;
  specification?: string;
  acceptedCableTypeIds?: string[];
}

export interface CableDefinitionEnds {
  end1: ConnectorSnapshot[];
  end2: ConnectorSnapshot[];
}

export interface ConnectedInventorySnapshot {
  connectionSetId: string;
  memberAssetIds: string[];
  memberAssetTags: string[];
  inputLabels: string[];
  outputLabels: string[];
}

export type CableDefinitionEndKey = "end1" | "end2";

/** A placed cable. Its ports are the cable's physical plugs, not equipment jacks. */
export interface CableAssemblySnapshot {
  definitionId: string;
  definitionVersion: number;
  ends: CableDefinitionEnds;
  inputEnd: CableDefinitionEndKey;
  outputEnd: CableDefinitionEndKey;
  color: string;
  connectedInventory?: ConnectedInventorySnapshot;
}

export interface EquipmentPort {
  id: string;
  direction: PortDirection;
  number: number;
  label?: string;
  connector: ConnectorSnapshot;
  signalType?: string;
  channelCapacity?: number;
  /** Snake endpoint containing this physical connector. */
  endpointId?: string;
  /** Stable route key shared by every connector on the same snake channel. */
  channelKey?: string;
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

export interface EquipmentPhysicalDimensions {
  /** Left-to-right width of the product, normalized to inches. */
  widthInches?: number;
  /** Front-to-back depth of the product, normalized to inches. */
  depthInches?: number;
  /** Bottom-to-top height of the product, normalized to inches. */
  heightInches?: number;
  /** Product weight normalized to pounds. */
  weightPounds?: number;
  /** Original dimension text retained so an administrator can verify axis interpretation. */
  sourceText?: string;
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

export interface EquipmentTemplate {
  id: string;
  name: string;
  definitionKind: GearDefinitionKind;
  manufacturer?: string;
  model?: string;
  category: string;
  equipmentKind: EquipmentKind;
  transport?: EquipmentTransportTopology;
  description?: string;
  notes?: string;
  physicalDimensions?: EquipmentPhysicalDimensions;
  purchaseSource?: EquipmentPurchaseSource;
  referenceImages: EquipmentReferenceImage[];
  aiImport?: EquipmentAiImport;
  image?: EquipmentImage;
  stageImage?: EquipmentImage;
  detailImages?: EquipmentImage[];
  cableEnds?: CableDefinitionEnds;
  ports: EquipmentPort[];
  /** The item must be placed within reach of a power source. */
  needsPowerSource: boolean;
  /** The item travels with a separately labeled adapter. Implies needsPowerSource. */
  needsPowerAdapter: boolean;
  /** Runtime-only synthetic template for a connected inventory assembly. */
  connectedInventory?: ConnectedInventorySnapshot;
  showInSignalView: boolean;
  showPortNumbers: boolean;
  showPortLabels: boolean;
  version: number;
  status: "active" | "archived";
}

export interface ImportedEquipmentDraft {
  name: string;
  manufacturer?: string;
  model?: string;
  category: string;
  equipmentKind: EquipmentKind;
  transport?: EquipmentTransportTopology;
  description?: string;
  physicalDimensions?: EquipmentPhysicalDimensions;
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
  equipmentKind?: EquipmentKind;
  transport?: EquipmentTransportTopology;
  assemblyId?: string;
  transportEndpointId?: string;
  transportEndpointLabel?: string;
  transportPrimary?: boolean;
  /** Derived Signal-view source label carried through each transport channel. Never persisted. */
  transportChannelLabels?: Record<string, string>;
  /** Derived upstream route labels keyed by target port ID. Never persisted. */
  signalPathLabels?: Record<string, string[]>;
  /** Present when this node is one physical cable placed in the signal chain. */
  cableAssembly?: CableAssemblySnapshot;
  physicalDimensions?: EquipmentPhysicalDimensions;
  notes?: string;
  image?: Pick<EquipmentImage, "storagePath" | "downloadUrl" | "contentType">;
  stageImage?: Pick<EquipmentImage, "storagePath" | "downloadUrl" | "contentType">;
  ports: EquipmentPort[];
  needsPowerSource?: boolean;
  needsPowerAdapter?: boolean;
  showInSignalView?: boolean;
  showPortNumbers: boolean;
  showPortLabels: boolean;
  isExpanded?: boolean;
  assignedAssetId?: string;
  assignedAssetLabel?: string;
  providerPartyId?: string;
  providerPartyName?: string;
  fulfillment: FulfillmentStatus;
}

export type SetupNode = Node<EquipmentNodeData, "equipment"> & {
  stagePosition?: StagePosition;
};

export interface StageRoute {
  waypointIds: string[];
  sourceDropFeet: number;
  targetDropFeet: number;
  serviceSlackFeet: number;
}

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
  stageRoute?: StageRoute;
  fulfillment: FulfillmentStatus;
  assignedInventoryAssetId?: string;
  assignedInventoryAssetIds?: string[];
  assignedInventoryLabel?: string;
  notes?: string;
  exception?: {
    reason: string;
  };
  /** Exact reusable cable definition carried by the primary leg of a placed cable. */
  cableDefinitionId?: string;
  cableDefinitionVersion?: number;
  cableEnds?: CableDefinitionEnds;
  /** Legacy single membership for saved breakout nodes. */
  cableAssemblyLeg?: {
    nodeId: string;
    portId: string;
    primary: boolean;
  };
  /** The placed cable plugs participating in this connector join. */
  cableAssemblyLegs?: Array<{
    nodeId: string;
    portId: string;
    primary: boolean;
  }>;
  internalTransport?: {
    assemblyId: string;
    kind: "snake" | "split-snake";
    channelCount: number;
    endpointAId: string;
    endpointBId: string;
    endpointALabel: string;
    endpointBLabel: string;
  };
}

export type CableEdge = Edge<CableEdgeData, "signalCable"> & {
  sourceHandle: string;
  targetHandle: string;
  data: CableEdgeData;
};

export interface SetupGraph {
  schemaVersion: 2;
  revision: number;
  nodes: SetupNode[];
  edges: CableEdge[];
  viewport: Viewport;
  stage: StagePlan;
}

export interface SetupMetadata {
  id: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  sourceSetupId?: string;
  graphSchemaVersion: 1 | 2;
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
  assignedInventoryAssetId?: string;
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
  assignmentLabel?: string;
  fulfillment: FulfillmentStatus;
  inputCount: number;
  outputCount: number;
  needsPowerSource: boolean;
  needsPowerAdapter: boolean;
  detail?: string;
}

export function normalizePowerDependencies(value: {
  needsPowerSource?: unknown;
  needsPowerAdapter?: unknown;
}) {
  const needsPowerAdapter = value.needsPowerAdapter === true;
  return {
    needsPowerSource: value.needsPowerSource === true || needsPowerAdapter,
    needsPowerAdapter,
  };
}

export function resolvePowerDependencies(
  value: { needsPowerSource?: unknown; needsPowerAdapter?: unknown },
  fallback?: { needsPowerSource?: unknown; needsPowerAdapter?: unknown },
) {
  return normalizePowerDependencies({
    needsPowerSource: typeof value.needsPowerSource === "boolean"
      ? value.needsPowerSource
      : fallback?.needsPowerSource,
    needsPowerAdapter: typeof value.needsPowerAdapter === "boolean"
      ? value.needsPowerAdapter
      : fallback?.needsPowerAdapter,
  });
}

export function powerDependencyLabel(value: {
  needsPowerSource?: unknown;
  needsPowerAdapter?: unknown;
}) {
  const dependency = normalizePowerDependencies(value);
  if (dependency.needsPowerAdapter) return "Power + adapter";
  if (dependency.needsPowerSource) return "Power";
  return undefined;
}

export function powerCheckInTag(assetTag: string, needsPowerAdapter?: unknown) {
  return needsPowerAdapter === true ? `${assetTag} + adapter` : assetTag;
}

export function createSetupId(prefix: string) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function emptySetupGraph(revision = 0): SetupGraph {
  return {
    schemaVersion: 2,
    revision,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    stage: {
      widthFeet: 40,
      depthFeet: 24,
      viewport: { x: 48, y: 72, zoom: 0.72 },
      areas: [],
      waypoints: [],
    },
  };
}
