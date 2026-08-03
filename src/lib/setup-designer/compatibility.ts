import type { Connection } from "@xyflow/react";

import { connectorSnapshot, oppositeGender } from "@/lib/setup-designer/catalog";
import type {
  CableEdge,
  ConnectorSnapshot,
  EquipmentPort,
  SetupNode,
} from "@/lib/setup-designer/domain";

export interface ConnectionValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sourceNode?: SetupNode;
  targetNode?: SetupNode;
  sourcePort?: EquipmentPort;
  targetPort?: EquipmentPort;
}

export function findPort(node: SetupNode | undefined, portId: string | null | undefined) {
  if (!node || !portId) return undefined;
  return node.data.ports.find((port) => port.id === portId);
}

export function validateConnection(
  connection: Connection,
  nodes: readonly SetupNode[],
  edges: readonly CableEdge[],
  ignoredEdgeId?: string,
): ConnectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  const sourcePort = findPort(sourceNode, connection.sourceHandle);
  const targetPort = findPort(targetNode, connection.targetHandle);

  if (!sourceNode || !sourcePort) errors.push("Choose a specific equipment output.");
  if (!targetNode || !targetPort) errors.push("Choose a specific equipment input.");
  if (sourcePort && sourcePort.direction !== "output") errors.push("A cable must start at an output.");
  if (targetPort && targetPort.direction !== "input") errors.push("A cable must end at an input.");
  if (connection.source === connection.target && connection.sourceHandle === connection.targetHandle) {
    errors.push("A port cannot connect to itself.");
  }

  const occupiedSource = edges.some((edge) => edge.id !== ignoredEdgeId && edge.source === connection.source && edge.sourceHandle === connection.sourceHandle);
  const occupiedTarget = edges.some((edge) => edge.id !== ignoredEdgeId && edge.target === connection.target && edge.targetHandle === connection.targetHandle);
  if (occupiedSource) errors.push("That output already has a cable.");
  if (occupiedTarget) errors.push("That input already has a cable.");

  if (sourcePort && targetPort && sourcePort.signalType && targetPort.signalType && sourcePort.signalType !== targetPort.signalType) {
    const analogSignals = new Set(["microphone", "instrument", "analog-line"]);
    if (!(analogSignals.has(sourcePort.signalType) && analogSignals.has(targetPort.signalType))) {
      warnings.push(`${sourcePort.signalType} output is feeding a ${targetPort.signalType} input.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, sourceNode, targetNode, sourcePort, targetPort };
}

export function matingCableEnd(port: EquipmentPort, preferredTypeId?: string): ConnectorSnapshot {
  const acceptedTypes = port.connector.acceptedCableTypeIds;
  const matchingPreferredType = preferredTypeId && acceptedTypes?.includes(preferredTypeId) ? preferredTypeId : undefined;
  const cableTypeId = matchingPreferredType ?? acceptedTypes?.[0] ?? port.connector.typeId;
  return connectorSnapshot(
    cableTypeId,
    oppositeGender(port.connector.gender),
    acceptedTypes ? undefined : port.connector.specification,
  );
}

export function cableEndMatesPort(end: ConnectorSnapshot, port: EquipmentPort) {
  const acceptedTypes = port.connector.acceptedCableTypeIds ?? [port.connector.typeId];
  const typeMatches = acceptedTypes.includes(end.typeId);
  const genderMatches = port.connector.gender === "none" || end.gender === "none" || end.gender === oppositeGender(port.connector.gender);
  return { typeMatches, genderMatches, valid: typeMatches && genderMatches };
}
