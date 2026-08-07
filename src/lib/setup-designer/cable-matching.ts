import {
  formatCableAssetLabel,
  isCableInventoryAsset,
  normalizeCableLengthInches,
  type InventoryAsset,
} from "@/lib/gear/domain";
import { isCableDefinition } from "@/lib/setup-designer/cable-definitions";
import type { CableEdge, ConnectorSnapshot, EquipmentTemplate } from "@/lib/setup-designer/domain";

export interface CableInventoryMatch {
  edgeId: string;
  requiredInches?: number;
  compatibleAssets: InventoryAsset[];
  suitableAssets: InventoryAsset[];
  suggestedAsset?: InventoryAsset;
}

export function cableRequiredInches(edge: CableEdge) {
  if (!edge.data.estimatedLength || edge.data.estimatedLength <= 0) return undefined;
  return normalizeCableLengthInches(
    edge.data.lengthUnit === "m"
      ? edge.data.estimatedLength * 39.3700787402
      : edge.data.estimatedLength * 12,
  );
}

export function cableInventoryAssignmentLabel(asset: InventoryAsset) {
  return `${asset.assetTag} · ${formatCableAssetLabel(asset.label, asset.cableLengthInches)}`;
}

export function cableAssetMatchesRun(
  asset: InventoryAsset,
  edge: CableEdge,
  templatesById: ReadonlyMap<string, EquipmentTemplate>,
) {
  if (!isCableInventoryAsset(asset) || asset.lifecycleStatus !== "active") return false;
  const definition = templatesById.get(asset.definitionId);
  const ends = definition && isCableDefinition(definition) ? definition.cableEnds : undefined;
  if (!ends || ends.end1.length !== 1 || ends.end2.length !== 1) return false;
  const [end1] = ends.end1;
  const [end2] = ends.end2;
  return (
    connectorsMatch(end1, edge.data.endA) && connectorsMatch(end2, edge.data.endB)
  ) || (
    connectorsMatch(end1, edge.data.endB) && connectorsMatch(end2, edge.data.endA)
  );
}

export function buildCableInventoryMatches(
  edges: readonly CableEdge[],
  templates: readonly EquipmentTemplate[],
  assets: readonly InventoryAsset[],
) {
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const requirements = edges
    .filter((edge) => !edge.data.internalTransport)
    .map((edge) => {
      const requiredInches = cableRequiredInches(edge);
      const compatibleAssets = assets
        .filter((asset) => cableAssetMatchesRun(asset, edge, templatesById))
        .sort(compareCableAssets);
      const suitableAssets = requiredInches
        ? compatibleAssets.filter((asset) => (asset.cableLengthInches ?? 0) >= requiredInches)
        : [];
      return { edgeId: edge.id, requiredInches, compatibleAssets, suitableAssets };
    })
    .sort((left, right) => (right.requiredInches ?? 0) - (left.requiredInches ?? 0));

  const usedAssetIds = new Set<string>();
  const suggestions = new Map<string, InventoryAsset>();
  for (const requirement of requirements) {
    const asset = requirement.suitableAssets.find((candidate) => !usedAssetIds.has(candidate.id));
    if (!asset) continue;
    suggestions.set(requirement.edgeId, asset);
    usedAssetIds.add(asset.id);
  }

  return requirements.map((requirement): CableInventoryMatch => ({
    ...requirement,
    suggestedAsset: suggestions.get(requirement.edgeId),
  }));
}

function connectorsMatch(left: ConnectorSnapshot, right: ConnectorSnapshot) {
  if (left.typeId !== right.typeId || left.gender !== right.gender) return false;
  const leftSpecification = left.specification?.trim().toLocaleLowerCase();
  const rightSpecification = right.specification?.trim().toLocaleLowerCase();
  return !leftSpecification || !rightSpecification || leftSpecification === rightSpecification;
}

function compareCableAssets(left: InventoryAsset, right: InventoryAsset) {
  return (left.cableLengthInches ?? Number.POSITIVE_INFINITY) - (right.cableLengthInches ?? Number.POSITIVE_INFINITY)
    || left.assetTag.localeCompare(right.assetTag);
}
