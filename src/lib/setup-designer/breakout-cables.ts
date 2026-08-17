import { CABLE_COLORS } from "@/lib/setup-designer/catalog";
import {
  formatCableDefinitionConnector,
  formatCableDefinitionName,
  isCableDefinition,
} from "@/lib/setup-designer/cable-definitions";
import {
  createSetupId,
  type CableDefinitionEndKey,
  type CableEdge,
  type EquipmentPort,
  type EquipmentTemplate,
  type SetupNode,
} from "@/lib/setup-designer/domain";

export function isBreakoutCableDefinition(template: Pick<EquipmentTemplate, "definitionKind" | "cableEnds">) {
  const end1Count = template.cableEnds?.end1.length ?? 0;
  const end2Count = template.cableEnds?.end2.length ?? 0;
  return isCableDefinition(template)
    && Boolean(template.cableEnds)
    && ((end1Count === 1 && end2Count > 1) || (end2Count === 1 && end1Count > 1));
}

export function isPlaceableCableDefinition(template: Pick<EquipmentTemplate, "definitionKind" | "cableEnds">) {
  return isCableDefinition(template)
    && Boolean(template.cableEnds?.end1.length)
    && Boolean(template.cableEnds?.end2.length);
}

export function placementFromCableDefinition(
  template: EquipmentTemplate,
  x: number,
  y: number,
): { nodes: SetupNode[]; edges: CableEdge[]; primaryNodeId: string } {
  if (!template.cableEnds || !isPlaceableCableDefinition(template)) {
    throw new Error("Cable definitions need at least one connector on each end.");
  }

  const breakout = isBreakoutCableDefinition(template);
  const inputEnd = template.connectedInventory ? "end1" : preferredInputEnd(template);
  const outputEnd: CableDefinitionEndKey = inputEnd === "end1" ? "end2" : "end1";
  const color = CABLE_COLORS[Math.abs(hashString(template.id)) % CABLE_COLORS.length];
  const ports = [
    ...portsForCableEnd(template, inputEnd, "input", breakout),
    ...portsForCableEnd(template, outputEnd, "output", breakout),
  ];
  const nodeId = createSetupId(breakout ? "breakout" : "cable-node");
  const node: SetupNode = {
    id: nodeId,
    type: "equipment",
    position: { x, y },
    data: {
      templateId: template.id,
      templateVersion: template.version,
      name: template.name || formatCableDefinitionName(template.cableEnds),
      category: template.connectedInventory ? "Connected gear" : breakout ? "Breakout cable" : "Cable",
      equipmentKind: "device",
      cableAssembly: {
        definitionId: template.id,
        definitionVersion: template.version,
        ends: structuredClone(template.cableEnds),
        inputEnd,
        outputEnd,
        color,
        connectedInventory: template.connectedInventory ? structuredClone(template.connectedInventory) : undefined,
      },
      physicalDimensions: breakout ? { widthInches: 4, depthInches: 2 } : { widthInches: 4, depthInches: 1 },
      notes: template.notes,
      ports,
      showInSignalView: true,
      showPortNumbers: false,
      showPortLabels: true,
      isExpanded: false,
      fulfillment: template.connectedInventory ? "owned" : "unplanned",
    },
  };
  return { nodes: [node], edges: [], primaryNodeId: nodeId };
}

export type CableAssemblyLeg = NonNullable<CableEdge["data"]["cableAssemblyLeg"]>;

export function cableAssemblyLegsForEdge(edge: Pick<CableEdge, "data">): CableAssemblyLeg[] {
  if (edge.data.cableAssemblyLegs?.length) return edge.data.cableAssemblyLegs;
  return edge.data.cableAssemblyLeg ? [edge.data.cableAssemblyLeg] : [];
}

export function cableAssemblyLegForNode(edge: Pick<CableEdge, "data">, nodeId: string) {
  return cableAssemblyLegsForEdge(edge).find((leg) => leg.nodeId === nodeId);
}

export function primaryCableAssemblyLeg(edge: Pick<CableEdge, "data">) {
  return cableAssemblyLegsForEdge(edge).find((leg) => leg.primary);
}

export function edgeHasCableAssemblyLeg(edge: Pick<CableEdge, "data">) {
  return cableAssemblyLegsForEdge(edge).length > 0;
}

export function edgeIsCableAssemblyPrimary(edge: Pick<CableEdge, "data">) {
  return cableAssemblyLegsForEdge(edge).some((leg) => leg.primary);
}

export function cableAssemblyRequirementEdges(edges: readonly CableEdge[]) {
  return edges.filter((edge) => !edge.data.internalTransport && (!edgeHasCableAssemblyLeg(edge) || edgeIsCableAssemblyPrimary(edge)));
}

export function primaryCableAssemblyEdge(edges: readonly CableEdge[], nodeId: string) {
  return edges.find((edge) => cableAssemblyLegForNode(edge, nodeId)?.primary);
}

export function cableAssemblyEdges(edges: readonly CableEdge[], nodeId: string) {
  return edges.filter((edge) => Boolean(cableAssemblyLegForNode(edge, nodeId)));
}

export function cableAssemblyRequirementEdgeId(edge: CableEdge, edges: readonly CableEdge[]) {
  if (edgeIsCableAssemblyPrimary(edge)) return edge.id;
  const nodeId = cableAssemblyLegsForEdge(edge)[0]?.nodeId;
  return nodeId ? primaryCableAssemblyEdge(edges, nodeId)?.id ?? edge.id : edge.id;
}

export function cableAssemblyPortLabel(end: CableDefinitionEndKey, index: number, count: number, connectorTypeId: string, breakout = true) {
  if (breakout && count === 2) return index === 0 ? "Left" : "Right";
  if (breakout && count === 1 && (connectorTypeId === "quarter-trs" || connectorTypeId === "mini-trs")) return "Stereo";
  return `${end === "end1" ? "End 1" : "End 2"}${count > 1 ? ` · ${index + 1}` : ""}`;
}

export function cableAssemblyPortDescription(port: EquipmentPort) {
  return `${port.label ?? `Connector ${port.number}`} · ${formatCableDefinitionConnector(port.connector)}`;
}

function portsForCableEnd(
  template: EquipmentTemplate,
  end: CableDefinitionEndKey,
  direction: EquipmentPort["direction"],
  breakout: boolean,
) {
  const connectors = template.cableEnds?.[end] ?? [];
  const otherEnd: CableDefinitionEndKey = end === "end1" ? "end2" : "end1";
  const connectedLabels = direction === "input"
    ? template.connectedInventory?.inputLabels
    : template.connectedInventory?.outputLabels;
  return connectors.map((connector, index): EquipmentPort => ({
    id: `cable-${end}-${index + 1}`,
    direction,
    number: index + 1,
    label: connectedLabels?.[index] ?? cableAssemblyPortLabel(end, index, connectors.length, connector.typeId, breakout),
    connector: structuredClone(connector),
    signalType: "analog-line",
    channelCapacity: direction === "output" ? Math.max(1, template.cableEnds?.[otherEnd].length ?? 1) : 1,
  }));
}

function preferredInputEnd(template: EquipmentTemplate): CableDefinitionEndKey {
  const ends = template.cableEnds!;
  if (ends.end1.length !== ends.end2.length) return ends.end1.length > ends.end2.length ? "end1" : "end2";
  const end1Score = ends.end1.reduce((total, connector) => total + inputGenderScore(connector.gender), 0);
  const end2Score = ends.end2.reduce((total, connector) => total + inputGenderScore(connector.gender), 0);
  return end2Score > end1Score ? "end2" : "end1";
}

function inputGenderScore(gender: EquipmentPort["connector"]["gender"]) {
  if (gender === "female") return 2;
  if (gender === "none") return 1;
  return 0;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return hash;
}
