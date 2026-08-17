import type { CableEdge, EquipmentKind, EquipmentPort, EquipmentTemplate, EquipmentTransportTopology, SetupNode } from "@/lib/setup-designer/domain";
import { createSetupId } from "@/lib/setup-designer/domain";
import { cableAssemblyRequirementEdges, isPlaceableCableDefinition, placementFromCableDefinition } from "@/lib/setup-designer/breakout-cables";
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
  if (isPlaceableCableDefinition(template)) return placementFromCableDefinition(template, x, y);
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
  const externalEdges = edges.filter((edge) => !edge.data.internalTransport);
  const incomingEdgeByAssemblyChannel = new Map<string, CableEdge>();
  const incomingEdgeByTargetPort = new Map<string, CableEdge>();

  for (const edge of externalEdges) {
    incomingEdgeByTargetPort.set(`${edge.target}:${edge.targetHandle}`, edge);
    const target = nodeMap.get(edge.target);
    const targetPort = target?.data.ports.find((port) => port.id === edge.targetHandle);
    if (!target?.data.assemblyId || !targetPort?.channelKey) continue;
    incomingEdgeByAssemblyChannel.set(assemblyChannelKey(target.data.assemblyId, targetPort.channelKey), edge);
  }

  function upstreamPathFromSource(source: SetupNode, sourcePort: EquipmentPort | undefined, visited: ReadonlySet<string>): string[] {
    if (source.data.cableAssembly) {
      const routeKey = `cable:${source.id}`;
      if (visited.has(routeKey)) return [];
      const nextVisited = new Set([...visited, routeKey]);
      const paths = source.data.ports
        .filter((port) => port.direction === "input")
        .flatMap((port) => {
          const incomingEdge = incomingEdgeByTargetPort.get(`${source.id}:${port.id}`);
          const upstreamNode = incomingEdge ? nodeMap.get(incomingEdge.source) : undefined;
          const upstreamPort = upstreamNode?.data.ports.find((candidate) => candidate.id === incomingEdge?.sourceHandle);
          return upstreamNode ? upstreamPathFromSource(upstreamNode, upstreamPort, nextVisited) : [];
        });
      return [...new Set(paths)];
    }
    if (!source.data.assemblyId || !sourcePort?.channelKey) return [source.data.name];

    const routeKey = assemblyChannelKey(source.data.assemblyId, sourcePort.channelKey);
    // Name the endpoint that directly feeds the downstream input (for example,
    // BOX_A 2), rather than the assembly's primary stage-box endpoint.
    const transportHop = `${conciseTransportName(source)} ${channelNumber(sourcePort)}`;
    if (visited.has(routeKey)) return [];

    const incomingEdge = incomingEdgeByAssemblyChannel.get(routeKey);
    if (!incomingEdge) return [transportHop];

    const upstreamNode = nodeMap.get(incomingEdge.source);
    const upstreamPort = upstreamNode?.data.ports.find((port) => port.id === incomingEdge.sourceHandle);
    if (!upstreamNode) return [transportHop];

    return [
      ...upstreamPathFromSource(upstreamNode, upstreamPort, new Set([...visited, routeKey])),
      transportHop,
    ];
  }

  const labelsByAssembly = new Map<string, Map<string, string>>();
  const pathsByNode = new Map<string, Map<string, string[]>>();

  for (const edge of externalEdges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    const sourcePort = source?.data.ports.find((port) => port.id === edge.sourceHandle);
    const targetPort = target?.data.ports.find((port) => port.id === edge.targetHandle);
    if (!source || !target || !targetPort) continue;

    const signalPath = upstreamPathFromSource(source, sourcePort, new Set());
    if (signalPath.length) {
      const nodePaths = pathsByNode.get(target.id) ?? new Map<string, string[]>();
      nodePaths.set(targetPort.id, signalPath);
      pathsByNode.set(target.id, nodePaths);
    }

    if (!target.data.assemblyId || !targetPort.channelKey || !signalPath.length) continue;
    const assemblyLabels = labelsByAssembly.get(target.data.assemblyId) ?? new Map<string, string>();
    assemblyLabels.set(targetPort.channelKey, signalPath[0]);
    labelsByAssembly.set(target.data.assemblyId, assemblyLabels);
  }

  return nodes.map((node) => {
    const labels = node.data.assemblyId ? labelsByAssembly.get(node.data.assemblyId) : undefined;
    const paths = pathsByNode.get(node.id);
    const data = { ...node.data };
    delete data.transportChannelLabels;
    delete data.signalPathLabels;
    return {
      ...node,
      data: {
        ...data,
        ...(labels?.size ? { transportChannelLabels: Object.fromEntries(labels) } : {}),
        ...(paths?.size ? { signalPathLabels: Object.fromEntries(paths) } : {}),
      },
    };
  });
}

function assemblyChannelKey(assemblyId: string, channelKey: string) {
  return `${assemblyId}:${channelKey}`;
}

function channelNumber(port: EquipmentPort) {
  return port.channelKey?.match(/(\d+)$/)?.[1] ?? String(port.number);
}

function conciseTransportName(node: SetupNode) {
  const endpointSuffix = node.data.transportEndpointLabel ? ` · ${node.data.transportEndpointLabel}` : "";
  const baseName = endpointSuffix && node.data.name.endsWith(endpointSuffix)
    ? node.data.name.slice(0, -endpointSuffix.length)
    : node.data.name;
  return baseName.replace(/\s+snake$/i, "").trim() || node.data.name;
}

export function portDisplayNameForNode(node: Pick<SetupNode, "data">, port: EquipmentPort, showNumber = true, showLabel = true) {
  const carriedLabel = port.channelKey ? node.data.transportChannelLabels?.[port.channelKey] : undefined;
  if (!carriedLabel) return portDisplayName(port, showNumber, showLabel);
  return `Snake ch ${channelNumber(port)} (${carriedLabel})`;
}

export function externalCableCount(edges: readonly CableEdge[]) {
  return cableAssemblyRequirementEdges(edges).length;
}
