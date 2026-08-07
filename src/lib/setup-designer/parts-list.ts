import { portsByDirection } from "@/lib/setup-designer/ports";
import { portDisplayNameForNode } from "@/lib/setup-designer/snake-topology";
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
  const ends = [connectorLabel(edge.data.endA), connectorLabel(edge.data.endB)].sort((left, right) => left.localeCompare(right));
  const length = edge.data.estimatedLength ? `${edge.data.estimatedLength}${edge.data.lengthUnit}` : "length-tbd";
  return `${ends.join("::")}::${edge.data.cableSpecification ?? ""}::${length}`;
}

export function deriveCableRuns(nodes: readonly SetupNode[], edges: readonly CableEdge[]): CableRunRow[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return edges.filter((edge) => !edge.data.internalTransport).map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const sourcePort = sourceNode?.data.ports.find((port) => port.id === edge.sourceHandle);
    const targetPort = targetNode?.data.ports.find((port) => port.id === edge.targetHandle);
    const unresolved = !sourceNode || !targetNode || !sourcePort || !targetPort;

    return {
      edgeId: edge.id,
      cable: `${connectorLabel(edge.data.endA)} → ${connectorLabel(edge.data.endB)}`,
      from: sourceNode && sourcePort
        ? `${sourceNode.data.name} / ${portDisplayNameForNode(sourceNode, sourcePort, true, true)}`
        : "Unresolved source",
      to: targetNode && targetPort
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
      ...(transport ? {
        detail: `${transport.channelCount}-channel ${transport.kind === "split-snake" ? "split snake" : "snake"}${transport.length ? ` · ${transport.length} ${transport.lengthUnit}` : ""} · ${transport.endpoints.length} endpoints`,
      } : {}),
    };
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
