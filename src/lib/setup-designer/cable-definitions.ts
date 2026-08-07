import { connectorSnapshot } from "@/lib/setup-designer/catalog";
import type { CableDefinitionEnds, ConnectorGender, ConnectorSnapshot, EquipmentTemplate } from "@/lib/setup-designer/domain";

export const MAX_CONNECTORS_PER_CABLE_END = 16;

export function createDefaultCableDefinitionEnds(): CableDefinitionEnds {
  return {
    end1: [connectorSnapshot("xlr", "female")],
    end2: [connectorSnapshot("xlr", "male")],
  };
}

export function normalizeCableDefinitionEnds(value: unknown): CableDefinitionEnds | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const end1 = normalizeCableEnd(data.end1);
  const end2 = normalizeCableEnd(data.end2);
  return end1.length && end2.length ? { end1, end2 } : undefined;
}

export function isCableDefinition(template: Pick<EquipmentTemplate, "definitionKind">) {
  return template.definitionKind === "cable";
}

export function formatCableDefinitionEnd(connectors: readonly ConnectorSnapshot[]) {
  return connectors.map(formatCableDefinitionConnector).join(" + ");
}

export function formatCableDefinitionName(ends: CableDefinitionEnds) {
  return `${formatCableDefinitionShortEnd(ends.end1)} → ${formatCableDefinitionShortEnd(ends.end2)}`;
}

export function formatCableDefinitionShortEnd(connectors: readonly ConnectorSnapshot[]) {
  const labels = connectors.map(formatCableDefinitionShortConnector);
  return labels.length > 1 ? `[${labels.join(" + ")}]` : labels[0] ?? "Unknown";
}

export function formatCableDefinitionShortConnector(connector: ConnectorSnapshot) {
  const typeLabel = CABLE_CONNECTOR_ABBREVIATIONS[connector.typeId] ?? connector.label;
  const genderLabel = connector.gender === "male" ? "M" : connector.gender === "female" ? "F" : "";
  return genderLabel ? `${typeLabel}-${genderLabel}` : typeLabel;
}

export function formatCableDefinitionConnector(connector: ConnectorSnapshot) {
  return `${connector.label}${connector.gender === "none" ? "" : ` ${connector.gender}`}`;
}

const CABLE_CONNECTOR_ABBREVIATIONS: Record<string, string> = {
  xlr: "XLR",
  "quarter-ts": "TS",
  "quarter-trs": "TRS",
  "mini-ts": "3.5 TS",
  "mini-trs": "3.5 TRS",
  rca: "RCA",
  speakon: "speakON",
  rj45: "RJ45",
  bnc: "BNC",
  hdmi: "HDMI",
  "usb-a": "USB-A",
  "usb-b": "USB-B",
  "usb-c": "USB-C",
  toslink: "TOSLINK",
  "midi-din": "MIDI",
  iec: "IEC",
  edison: "Edison",
};

function normalizeCableEnd(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CONNECTORS_PER_CABLE_END).flatMap((item): ConnectorSnapshot[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const connector = item as Record<string, unknown>;
    if (typeof connector.typeId !== "string") return [];
    const gender: ConnectorGender = connector.gender === "male" || connector.gender === "female" ? connector.gender : "none";
    return [connectorSnapshot(
      connector.typeId,
      gender,
      typeof connector.specification === "string" ? connector.specification : undefined,
    )];
  });
}
