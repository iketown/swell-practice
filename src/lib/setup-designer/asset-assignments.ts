import type { CableEdge, SetupNode } from "@/lib/setup-designer/domain";

export interface AssetAssignment {
  assetId: string;
  assetLabel?: string;
  nodeId: string;
  nodeName: string;
  assemblyId?: string;
}

export interface DuplicateAssetAssignment {
  assetId: string;
  assetLabel?: string;
  first: AssetAssignment;
  second: AssetAssignment;
}

export interface DuplicateCableAssetAssignment {
  assetId: string;
  assetLabel?: string;
  firstEdgeId: string;
  secondEdgeId: string;
}

export function findAssetAssignment(
  nodes: readonly SetupNode[],
  assetId: string,
  excludedNodeId?: string,
): AssetAssignment | undefined {
  const excludedAssemblyId = excludedNodeId
    ? nodes.find((item) => item.id === excludedNodeId)?.data.assemblyId
    : undefined;
  const node = nodes.find((item) => (
    item.id !== excludedNodeId
    && (!excludedAssemblyId || item.data.assemblyId !== excludedAssemblyId)
    && item.data.fulfillment === "owned"
    && (
      item.data.assignedAssetId === assetId
      || item.data.cableAssembly?.connectedInventory?.memberAssetIds.includes(assetId)
    )
  ));
  if (!node) return undefined;
  return {
    assetId,
    assetLabel: node.data.assignedAssetLabel,
    nodeId: node.id,
    nodeName: node.data.name,
    assemblyId: node.data.assemblyId,
  };
}

export function findDuplicateAssetAssignment(nodes: readonly SetupNode[]): DuplicateAssetAssignment | undefined {
  const assignments = new Map<string, AssetAssignment>();
  for (const node of nodes) {
    const assetIds = node.data.fulfillment === "owned"
      ? node.data.cableAssembly?.connectedInventory?.memberAssetIds
        ?? (node.data.assignedAssetId ? [node.data.assignedAssetId] : [])
      : [];
    for (const assetId of assetIds) {
      const assignment: AssetAssignment = {
        assetId,
        assetLabel: node.data.assignedAssetLabel ?? node.data.cableAssembly?.connectedInventory?.memberAssetTags.join(" + "),
        nodeId: node.id,
        nodeName: node.data.name,
        assemblyId: node.data.assemblyId,
      };
      const first = assignments.get(assetId);
      if (first && (!first.assemblyId || first.assemblyId !== assignment.assemblyId)) {
        return { assetId, assetLabel: assignment.assetLabel ?? first.assetLabel, first, second: assignment };
      }
      assignments.set(assetId, assignment);
    }
  }
  return undefined;
}

export function duplicateAssetAssignmentMessage(conflict: DuplicateAssetAssignment) {
  const assetName = conflict.assetLabel || conflict.first.assetLabel || conflict.assetId;
  return `${assetName} is already assigned to ${conflict.first.nodeName}. Each physical or planned asset can fulfill only one item in a setup.`;
}

export function findDuplicateCableAssetAssignment(edges: readonly CableEdge[]): DuplicateCableAssetAssignment | undefined {
  const assignments = new Map<string, { edgeId: string; assetLabel?: string }>();
  for (const edge of edges) {
    const assetIds = edge.data.fulfillment === "owned"
      ? edge.data.assignedInventoryAssetIds?.length
        ? edge.data.assignedInventoryAssetIds
        : edge.data.assignedInventoryAssetId ? [edge.data.assignedInventoryAssetId] : []
      : [];
    for (const assetId of assetIds) {
      const first = assignments.get(assetId);
      if (first) {
        return {
          assetId,
          assetLabel: edge.data.assignedInventoryLabel ?? first.assetLabel,
          firstEdgeId: first.edgeId,
          secondEdgeId: edge.id,
        };
      }
      assignments.set(assetId, { edgeId: edge.id, assetLabel: edge.data.assignedInventoryLabel });
    }
  }
  return undefined;
}

export function duplicateCableAssetAssignmentMessage(conflict: DuplicateCableAssetAssignment) {
  return `${conflict.assetLabel || conflict.assetId} is assigned to more than one cable run. Each tagged cable can fulfill only one run in a setup.`;
}
