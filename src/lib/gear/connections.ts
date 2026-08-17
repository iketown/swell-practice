import type {
  InventoryAsset,
  InventoryConnectionSet,
  InventoryConnectorReference,
} from "@/lib/gear/domain";
import { formatCableDefinitionConnector, isCableDefinition } from "@/lib/setup-designer/cable-definitions";
import type { ConnectorSnapshot, EquipmentTemplate, PortDirection } from "@/lib/setup-designer/domain";

export interface InventoryConnectorOption {
  id: string;
  assetId: string;
  assetTag: string;
  label: string;
  connector: ConnectorSnapshot;
  defaultDirection?: PortDirection;
}

export function connectorReferenceKey(reference: InventoryConnectorReference) {
  return `${reference.assetId}:${reference.connectorId}`;
}

export function connectionSetForAsset(
  asset: Pick<InventoryAsset, "id" | "connectionSetId">,
  connectionSets: readonly InventoryConnectionSet[],
) {
  return connectionSets.find((item) => item.id === asset.connectionSetId)
    ?? connectionSets.find((item) => item.memberAssetIds.includes(asset.id));
}

export function inventoryAssetConnectors(
  asset: InventoryAsset,
  definition?: EquipmentTemplate,
): InventoryConnectorOption[] {
  if (!definition) return [];
  if (isCableDefinition(definition) && definition.cableEnds) {
    return (["end1", "end2"] as const).flatMap((end) => definition.cableEnds![end].map((connector, index) => ({
      id: `cable:${end}:${index}`,
      assetId: asset.id,
      assetTag: asset.assetTag,
      label: `${end === "end1" ? "End 1" : "End 2"}${definition.cableEnds![end].length > 1 ? ` · ${index + 1}` : ""} · ${formatCableDefinitionConnector(connector)}`,
      connector: structuredClone(connector),
    })));
  }
  return definition.ports.map((port) => ({
    id: `port:${port.id}`,
    assetId: asset.id,
    assetTag: asset.assetTag,
    label: `${port.label || `Port ${port.number}`} · ${formatCableDefinitionConnector(port.connector)}`,
    connector: structuredClone(port.connector),
    defaultDirection: port.direction,
  }));
}

export function connectorForReference(
  reference: InventoryConnectorReference,
  assetsById: ReadonlyMap<string, InventoryAsset>,
  definitionsById: ReadonlyMap<string, EquipmentTemplate>,
) {
  const asset = assetsById.get(reference.assetId);
  if (!asset) return undefined;
  return inventoryAssetConnectors(asset, definitionsById.get(asset.definitionId))
    .find((connector) => connector.id === reference.connectorId);
}

export function usedInternalConnectorKeys(connectionSet: Pick<InventoryConnectionSet, "links">) {
  return new Set(connectionSet.links.flatMap((link) => [connectorReferenceKey(link.a), connectorReferenceKey(link.b)]));
}

export function inventoryConnectorsMate(left: ConnectorSnapshot, right: ConnectorSnapshot) {
  const leftTypes = new Set([left.typeId, ...(left.acceptedCableTypeIds ?? [])]);
  const rightTypes = new Set([right.typeId, ...(right.acceptedCableTypeIds ?? [])]);
  const typeMatches = [...leftTypes].some((typeId) => rightTypes.has(typeId));
  const genderMatches = left.gender === "none" || right.gender === "none" || left.gender !== right.gender;
  return typeMatches && genderMatches;
}

export function connectedInventoryTemplate(
  connectionSet: InventoryConnectionSet,
  assets: readonly InventoryAsset[],
  definitions: readonly EquipmentTemplate[],
): EquipmentTemplate | undefined {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const members = connectionSet.memberAssetIds
    .flatMap((assetId) => {
      const asset = assetsById.get(assetId);
      return asset ? [asset] : [];
    })
    .sort((left, right) => left.assetTag.localeCompare(right.assetTag));
  if (members.length < 2) return undefined;

  const resolved = connectionSet.signalConnectors.flatMap((signalConnector) => {
    const connector = connectorForReference(signalConnector.endpoint, assetsById, definitionsById);
    return connector ? [{ ...signalConnector, connector }] : [];
  });
  const inputs = resolved.filter((item) => item.direction === "input");
  const outputs = resolved.filter((item) => item.direction === "output");
  if (!inputs.length || !outputs.length) return undefined;

  const memberAssetIds = members.map((asset) => asset.id);
  const memberAssetTags = members.map((asset) => asset.assetTag);
  const inputLabels = inputs.map((item) => `${item.connector.assetTag} · ${item.connector.label}`);
  const outputLabels = outputs.map((item) => `${item.connector.assetTag} · ${item.connector.label}`);
  const connectedInventory = {
    connectionSetId: connectionSet.id,
    memberAssetIds,
    memberAssetTags,
    inputLabels,
    outputLabels,
  };

  return {
    id: `connected-inventory:${connectionSet.id}`,
    name: memberAssetTags.join(" + "),
    definitionKind: "cable",
    category: "Connected gear",
    equipmentKind: "device",
    description: `Kept connected: ${members.map((asset) => `${asset.assetTag} ${asset.label}`).join(", ")}.`,
    referenceImages: [],
    cableEnds: {
      end1: inputs.map((item) => structuredClone(item.connector.connector)),
      end2: outputs.map((item) => structuredClone(item.connector.connector)),
    },
    ports: [],
    needsPowerSource: false,
    needsPowerAdapter: false,
    connectedInventory,
    showInSignalView: false,
    showPortNumbers: false,
    showPortLabels: true,
    version: Math.max(1, Math.floor(connectionSet.updatedAt || 1)),
    status: "active",
  };
}
