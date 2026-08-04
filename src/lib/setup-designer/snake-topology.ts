import type { CableEdge, EquipmentKind, EquipmentPort, EquipmentTemplate, EquipmentTransportTopology, SetupNode } from "@/lib/setup-designer/domain";
import { createSetupId } from "@/lib/setup-designer/domain";
import { portDisplayName } from "@/lib/setup-designer/ports";
import { nodeFromTemplate } from "@/lib/setup-designer/sample-data";

const TRUNK_COLOR = "oklch(0.48 0.08 215)";

export function defaultTransportTopology(kind: Exclude<EquipmentKind, "device">): EquipmentTransportTopology {
  return {
    kind,
    lengthUnit: "ft",
    channelCount: 8,
    endpoints: kind === "split-snake"
      ? [
          { id: "side-a", label: "Side A · input box", style: "box" },
          { id: "side-b-foh", label: "Side B · FOH fan", style: "fan" },
          { id: "side-b-monitors", label: "Side B · monitor fan", style: "fan" },
        ]
      : [
          { id: "side-a", label: "Side A · box", style: "box" },
          { id: "side-b", label: "Side B · fan", style: "fan" },
        ],
  };
}

export function placementFromTemplate(
  template: EquipmentTemplate,
  x: number,
  y: number,
): { nodes: SetupNode[]; edges: CableEdge[]; primaryNodeId: string } {
  if (template.equipmentKind === "device" || !template.transport) {
    const node = nodeFromTemplate(template, createSetupId("node"), x, y);
    return { nodes: [node], edges: [], primaryNodeId: node.id };
  }

  const topology = template.transport;
  const assemblyId = createSetupId("assembly");
  const endpointNodes = topology.endpoints.map((endpoint, index) => {
    const nodeId = createSetupId("node");
    const endpointPorts = template.ports.filter((port) => port.endpointId === endpoint.id);
    const fallbackPorts = endpointPorts.length
      ? endpointPorts
      : template.ports.filter((port) => index === 0 ? port.direction === "input" : port.direction === "output");
    const position = index === 0
      ? { x, y }
      : { x: x + 440, y: y + (topology.kind === "split-snake" ? (index - 1.5) * 240 : 0) };
    const node = nodeFromTemplate(template, nodeId, position.x, position.y, `${template.name} · ${endpoint.label}`);
    node.data = {
      ...node.data,
      ports: structuredClone(fallbackPorts),
      assemblyId,
      transportEndpointId: endpoint.id,
      transportEndpointLabel: endpoint.label,
      transportPrimary: index === 0,
    };
    return node;
  });

  const primary = endpointNodes[0];
  const edges = endpointNodes.slice(1).map((target, index): CableEdge => ({
    id: createSetupId("snake-trunk"),
    type: "signalCable",
    source: primary.id,
    sourceHandle: "transport-trunk-source",
    target: target.id,
    targetHandle: "transport-trunk-target",
    animated: false,
    selectable: false,
    deletable: false,
    reconnectable: false,
    data: {
      name: `${template.name} internal trunk ${index + 1}`,
      color: TRUNK_COLOR,
      endA: { typeId: "snake-trunk", label: "Snake trunk", gender: "none" },
      endB: { typeId: "snake-trunk", label: "Snake trunk", gender: "none" },
      channelCapacity: topology.channelCount,
      estimatedLength: topology.length,
      lengthUnit: topology.lengthUnit,
      fulfillment: "owned",
      internalTransport: {
        assemblyId,
        kind: topology.kind,
        channelCount: topology.channelCount,
        endpointAId: primary.data.transportEndpointId!,
        endpointBId: target.data.transportEndpointId!,
        endpointALabel: primary.data.transportEndpointLabel!,
        endpointBLabel: target.data.transportEndpointLabel!,
      },
    },
  }));

  return { nodes: endpointNodes, edges, primaryNodeId: primary.id };
}

export function withTransportChannelLabels(nodes: readonly SetupNode[], edges: readonly CableEdge[]): SetupNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const labelsByAssembly = new Map<string, Map<string, string>>();

  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false;
    for (const edge of edges) {
      if (edge.data.internalTransport) continue;
      const target = nodeMap.get(edge.target);
      const targetPort = target?.data.ports.find((port) => port.id === edge.targetHandle);
      if (!target?.data.assemblyId || !targetPort?.channelKey) continue;
      const source = nodeMap.get(edge.source);
      const sourcePort = source?.data.ports.find((port) => port.id === edge.sourceHandle);
      if (!source) continue;
      const inherited = source.data.assemblyId && sourcePort?.channelKey
        ? labelsByAssembly.get(source.data.assemblyId)?.get(sourcePort.channelKey)
        : undefined;
      const label = inherited || source.data.name;
      const assemblyLabels = labelsByAssembly.get(target.data.assemblyId) ?? new Map<string, string>();
      if (assemblyLabels.get(targetPort.channelKey) !== label) {
        assemblyLabels.set(targetPort.channelKey, label);
        labelsByAssembly.set(target.data.assemblyId, assemblyLabels);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return nodes.map((node) => {
    const labels = node.data.assemblyId ? labelsByAssembly.get(node.data.assemblyId) : undefined;
    return labels?.size ? {
      ...node,
      data: { ...node.data, transportChannelLabels: Object.fromEntries(labels) },
    } : node;
  });
}

export function portDisplayNameForNode(node: Pick<SetupNode, "data">, port: EquipmentPort, showNumber = true, showLabel = true) {
  const carriedLabel = port.channelKey ? node.data.transportChannelLabels?.[port.channelKey] : undefined;
  if (!carriedLabel) return portDisplayName(port, showNumber, showLabel);
  const channelNumber = port.channelKey?.match(/(\d+)$/)?.[1] ?? String(port.number);
  return `Snake ch ${channelNumber} (${carriedLabel})`;
}

export function externalCableCount(edges: readonly CableEdge[]) {
  return edges.filter((edge) => !edge.data.internalTransport).length;
}
