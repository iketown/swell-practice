import { portsByDirection } from "@/lib/setup-designer/ports";
import { portDisplayNameForNode } from "@/lib/setup-designer/snake-topology";
import { cableAssemblyEdges, cableAssemblyLegForNode, cableAssemblyRequirementEdges, primaryCableAssemblyLeg } from "@/lib/setup-designer/breakout-cables";
import { formatCableDefinitionName } from "@/lib/setup-designer/cable-definitions";
import type {
  CableEdge,
  CableRunGroup,
  CableRunRow,
  ConnectorSnapshot,
  EquipmentUsageRow,
  SetupNode,
} from "@/lib/setup-designer/domain";

function connectorLabel(connector: ConnectorSnapshot) {
  return [connector.label, connector.gender === "none" ? "" : connector.gender, connector.specification].filter(Boolean).join(" ");
}

function normalizedCableKey(edge: CableEdge) {
  const ends = edge.data.cableEnds
    ? [
        edge.data.cableEnds.end1.map(connectorLabel).sort().join(" + "),
        edge.data.cableEnds.end2.map(connectorLabel).sort().join(" + "),
      ].sort((left, right) => left.localeCompare(right))
    : [connectorLabel(edge.data.endA), connectorLabel(edge.data.endB)].sort((left, right) => left.localeCompare(right));
  const length = edge.data.estimatedLength ? `${edge.data.estimatedLength}${edge.data.lengthUnit}` : "length-tbd";
  return `${ends.join("::")}::${edge.data.cableSpecification ?? ""}::${length}`;
}

export function deriveCableRuns(nodes: readonly SetupNode[], edges: readonly CableEdge[]): CableRunRow[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return cableAssemblyRequirementEdges(edges).map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const sourcePort = sourceNode?.data.ports.find((port) => port.id === edge.sourceHandle);
    const targetPort = targetNode?.data.ports.find((port) => port.id === edge.targetHandle);
    const assemblyNodeId = primaryCableAssemblyLeg(edge)?.nodeId;
    const assemblyNode = assemblyNodeId ? nodeMap.get(assemblyNodeId) : undefined;
    const assemblyLegs = assemblyNodeId ? cableAssemblyEdges(edges, assemblyNodeId) : [];
    const connectedAssemblyPortIds = new Set(assemblyLegs.map((leg) => assemblyNodeId ? cableAssemblyLegForNode(leg, assemblyNodeId)?.portId : undefined).filter(Boolean));
    const unresolved = !sourceNode || !targetNode || !sourcePort || !targetPort
      || Boolean(assemblyNode && assemblyNode.data.ports.some((port) => !connectedAssemblyPortIds.has(port.id)));
    const assemblyInputs = assemblyNode ? connectedEndpoints(assemblyNode, assemblyLegs, nodeMap, "input") : [];
    const assemblyOutputs = assemblyNode ? connectedEndpoints(assemblyNode, assemblyLegs, nodeMap, "output") : [];

    return {
      edgeId: edge.id,
      cable: edge.data.cableEnds ? formatCableDefinitionName(edge.data.cableEnds) : `${connectorLabel(edge.data.endA)} → ${connectorLabel(edge.data.endB)}`,
      from: assemblyInputs.length ? assemblyInputs.join(" + ") : sourceNode && sourcePort
        ? `${sourceNode.data.name} / ${portDisplayNameForNode(sourceNode, sourcePort, true, true)}`
        : "Unresolved source",
      to: assemblyOutputs.length ? assemblyOutputs.join(" + ") : targetNode && targetPort
        ? `${targetNode.data.name} / ${portDisplayNameForNode(targetNode, targetPort, true, true)}`
        : "Unresolved destination",
      length: edge.data.estimatedLength,
      lengthUnit: edge.data.lengthUnit,
      fulfillment: edge.data.fulfillment,
      assignedInventoryAssetId: edge.data.assignedInventoryAssetId,
      assignedInventoryLabel: edge.data.assignedInventoryLabel,
      notes: edge.data.notes,
      exceptionReason: edge.data.exception?.reason,
      unresolved,
      groupKey: normalizedCableKey(edge),
    };
  });
}

export function groupCableRuns(rows: readonly CableRunRow[]): CableRunGroup[] {
  const groups = new Map<string, CableRunGroup>();
  for (const row of rows) {
    const current = groups.get(row.groupKey) ?? {
      key: row.groupKey,
      cable: row.cable,
      length: row.length,
      lengthUnit: row.lengthUnit,
      quantity: 0,
      owned: 0,
      rent: 0,
      buy: 0,
      unplanned: 0,
    };
    current.quantity += 1;
    current[row.fulfillment] += 1;
    groups.set(row.groupKey, current);
  }
  return [...groups.values()].sort((left, right) => left.cable.localeCompare(right.cable));
}

export function deriveEquipmentUsage(nodes: readonly SetupNode[]): EquipmentUsageRow[] {
  const grouped = new Map<string, SetupNode[]>();
  for (const node of nodes) {
    if (node.data.cableAssembly) continue;
    const key = node.data.assemblyId ?? node.id;
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  }
  return [...grouped.values()].map((group) => {
    const primary = group.find((node) => node.data.transportPrimary) ?? group[0];
    const transport = primary.data.transport;
    const baseName = primary.data.assemblyId && primary.data.transportEndpointLabel
      ? primary.data.name.replace(new RegExp(`\\s*·\\s*${escapeRegExp(primary.data.transportEndpointLabel)}$`), "")
      : primary.data.name;
    return {
      nodeId: primary.id,
      name: baseName,
      category: primary.data.category,
      assignmentLabel: primary.data.assignedAssetLabel ?? primary.data.providerPartyName,
      fulfillment: primary.data.fulfillment,
      inputCount: group.reduce((total, node) => total + portsByDirection(node.data.ports, "input").length, 0),
      outputCount: group.reduce((total, node) => total + portsByDirection(node.data.ports, "output").length, 0),
      needsPowerSource: primary.data.needsPowerSource === true || primary.data.needsPowerAdapter === true,
      needsPowerAdapter: primary.data.needsPowerAdapter === true,
      ...(transport ? {
        detail: `${transport.channelCount}-channel ${transport.kind === "split-snake" ? "split snake" : "snake"}${transport.length ? ` · ${transport.length} ${transport.lengthUnit}` : ""} · ${transport.endpoints.length} endpoints`,
      } : {}),
    };
  });
}

function connectedEndpoints(
  assemblyNode: SetupNode,
  legs: readonly CableEdge[],
  nodeMap: ReadonlyMap<string, SetupNode>,
  direction: "input" | "output",
) {
  return legs.flatMap((leg) => {
    const assemblyAtTarget = leg.target === assemblyNode.id;
    const assemblyPortId = assemblyAtTarget ? leg.targetHandle : leg.sourceHandle;
    const assemblyPort = assemblyNode.data.ports.find((port) => port.id === assemblyPortId);
    if (assemblyPort?.direction !== direction) return [];
    const equipmentNode = nodeMap.get(assemblyAtTarget ? leg.source : leg.target);
    const equipmentPort = equipmentNode?.data.ports.find((port) => port.id === (assemblyAtTarget ? leg.sourceHandle : leg.targetHandle));
    if (!equipmentNode || !equipmentPort) return [];
    return [`${equipmentNode.data.name} / ${portDisplayNameForNode(equipmentNode, equipmentPort, true, true)}`];
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
