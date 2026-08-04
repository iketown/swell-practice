import type { SetupNode } from "@/lib/setup-designer/domain";

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
    && item.data.assignedAssetId === assetId
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
    const assetId = node.data.fulfillment === "owned" ? node.data.assignedAssetId : undefined;
    if (!assetId) continue;
    const assignment: AssetAssignment = {
      assetId,
      assetLabel: node.data.assignedAssetLabel,
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
  return undefined;
}

export function duplicateAssetAssignmentMessage(conflict: DuplicateAssetAssignment) {
  const assetName = conflict.assetLabel || conflict.first.assetLabel || conflict.assetId;
  return `${assetName} is already assigned to ${conflict.first.nodeName}. Each physical or planned asset can fulfill only one item in a setup.`;
}
