import { connectorSnapshot } from "@/lib/setup-designer/catalog";
import {
  createSetupId,
  type ConnectorGender,
  type EquipmentPort,
  type PortDirection,
} from "@/lib/setup-designer/domain";

export interface PortDefaults {
  connectorTypeId?: string;
  connectorGender?: ConnectorGender;
  signalType?: string;
  labelPrefix?: string;
}

export interface EquipmentPortGroupSummary {
  count: number;
  direction: PortDirection;
  label: string;
  connectorTypeId: string;
  connectorLabel: string;
  gender: ConnectorGender;
  signalType?: string;
  specification?: string;
  channelCapacity?: number;
}

export function portGroupDisplayName(group: EquipmentPortGroupSummary) {
  const label = group.label.trim();
  const directionPattern = group.direction === "input" ? /\b(in|input|inputs)$/i : /\b(out|output|outputs)$/i;
  return `${group.count}× ${label}${directionPattern.test(label) ? "" : group.direction === "input" ? " in" : " out"}`;
}

export function createPort(direction: PortDirection, number: number, defaults: PortDefaults = {}): EquipmentPort {
  return {
    id: createSetupId("port"),
    direction,
    number,
    ...(defaults.labelPrefix ? { label: `${defaults.labelPrefix} ${number}` } : {}),
    connector: connectorSnapshot(
      defaults.connectorTypeId ?? "xlr",
      defaults.connectorGender ?? (direction === "input" ? "female" : "male"),
    ),
    signalType: defaults.signalType ?? "analog-line",
  };
}

export function portsByDirection(ports: readonly EquipmentPort[], direction: PortDirection) {
  return ports
    .filter((port) => port.direction === direction)
    .sort((left, right) => left.number - right.number);
}

function orderedPorts(ports: readonly EquipmentPort[]) {
  const inputs = portsByDirection(ports, "input").map((port, index) => ({ ...port, number: index + 1 }));
  const outputs = portsByDirection(ports, "output").map((port, index) => ({ ...port, number: index + 1 }));
  return [...inputs, ...outputs];
}

export function appendPortBank(
  ports: readonly EquipmentPort[],
  direction: PortDirection,
  rawCount: number,
  defaults: PortDefaults = {},
) {
  const count = Math.max(1, Math.min(128, Math.floor(rawCount || 1)));
  const directionPorts = portsByDirection(ports, direction);
  const labelPrefix = defaults.labelPrefix?.trim() || (direction === "input" ? "Input" : "Output");
  const bank = Array.from({ length: Math.min(count, 128 - directionPorts.length) }, (_, index) => ({
    ...createPort(direction, directionPorts.length + index + 1, defaults),
    label: count === 1 ? labelPrefix : `${labelPrefix} ${index + 1}`,
  }));
  return orderedPorts([...ports, ...bank]);
}

export function removePort(ports: readonly EquipmentPort[], portId: string) {
  return orderedPorts(ports.filter((port) => port.id !== portId));
}

export function summarizePortGroups(ports: readonly EquipmentPort[]): EquipmentPortGroupSummary[] {
  const groups = new Map<string, EquipmentPortGroupSummary>();

  for (const port of orderedPorts(ports)) {
    const fallbackLabel = port.direction === "input" ? "Input" : "Output";
    const label = (port.label?.trim() || fallbackLabel).replace(/\s+\d+$/, "");
    const key = [
      port.direction,
      label,
      port.connector.typeId,
      port.connector.gender,
      port.signalType ?? "",
      port.connector.specification ?? "",
      port.channelCapacity ?? "",
    ].join("|");
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    groups.set(key, {
      count: 1,
      direction: port.direction,
      label,
      connectorTypeId: port.connector.typeId,
      connectorLabel: port.connector.label,
      gender: port.connector.gender,
      signalType: port.signalType,
      specification: port.connector.specification,
      channelCapacity: port.channelCapacity,
    });
  }

  return [...groups.values()];
}

export function equipmentPortsFromData(value: unknown): EquipmentPort[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const ports = value.flatMap((item): EquipmentPort[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const data = item as Record<string, unknown>;
    if (data.direction !== "input" && data.direction !== "output") return [];
    const connectorData = data.connector && typeof data.connector === "object" && !Array.isArray(data.connector)
      ? data.connector as Record<string, unknown>
      : {};
    const rawGender = connectorData.gender;
    const gender: ConnectorGender = rawGender === "male" || rawGender === "female" || rawGender === "none"
      ? rawGender
      : "none";
    const storedId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : createSetupId("port");
    const id = usedIds.has(storedId) ? createSetupId("port") : storedId;
    usedIds.add(id);
    const channelCapacity = Number(data.channelCapacity);
    return [{
      id,
      direction: data.direction,
      number: Number.isFinite(Number(data.number)) ? Math.max(1, Math.floor(Number(data.number))) : 1,
      ...(typeof data.label === "string" && data.label.trim() ? { label: data.label } : {}),
      connector: connectorSnapshot(
        typeof connectorData.typeId === "string" ? connectorData.typeId : "other",
        gender,
        typeof connectorData.specification === "string" ? connectorData.specification : undefined,
      ),
      signalType: typeof data.signalType === "string" && data.signalType ? data.signalType : "other",
      ...(Number.isInteger(channelCapacity) && channelCapacity > 0 ? { channelCapacity } : {}),
    }];
  });
  return orderedPorts(ports);
}

export function resizePortGroup(
  ports: readonly EquipmentPort[],
  direction: PortDirection,
  rawCount: number,
  defaults: PortDefaults = {},
) {
  const count = Math.max(0, Math.min(128, Math.floor(rawCount || 0)));
  const otherPorts = ports.filter((port) => port.direction !== direction);
  const current = portsByDirection(ports, direction);
  const retained = current.slice(0, count).map((port, index) => ({ ...port, number: index + 1 }));
  const removed = current.slice(count);

  while (retained.length < count) {
    retained.push(createPort(direction, retained.length + 1, defaults));
  }

  return {
    ports: direction === "input" ? [...retained, ...otherPorts] : [...otherPorts, ...retained],
    removed,
  };
}

export function updatePort(ports: readonly EquipmentPort[], nextPort: EquipmentPort) {
  return orderedPorts(ports.map((port) => port.id === nextPort.id ? nextPort : port));
}

export function portDisplayName(port: EquipmentPort, showNumber = true, showLabel = true) {
  const pieces = [
    showNumber ? String(port.number) : "",
    showLabel ? port.label?.trim() ?? "" : "",
  ].filter(Boolean);
  return pieces.join(" · ") || (port.direction === "input" ? "Input" : "Output");
}
