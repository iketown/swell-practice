import type { ConnectorGender, ConnectorSnapshot, ConnectorType } from "@/lib/setup-designer/domain";

export const CONNECTOR_TYPES: ConnectorType[] = [
  { id: "xlr", label: "XLR", family: "xlr", usesGender: true, defaultSignalTypes: ["microphone", "analog-line", "digital-audio"] },
  {
    id: "combo-xlr-trs",
    label: "Combo XLR/TRS",
    family: "combo-xlr-trs",
    usesGender: true,
    fixedGender: "female",
    portOnly: true,
    acceptedCableTypeIds: ["xlr", "quarter-trs"],
    defaultSignalTypes: ["microphone", "instrument", "analog-line"],
  },
  { id: "quarter-ts", label: "1/4-inch TS", family: "quarter-inch", usesGender: true, defaultSignalTypes: ["instrument", "analog-line"] },
  { id: "quarter-trs", label: "1/4-inch TRS", family: "quarter-inch", usesGender: true, defaultSignalTypes: ["analog-line"] },
  { id: "mini-ts", label: "3.5 mm TS", family: "mini-jack", usesGender: true, defaultSignalTypes: ["analog-line"] },
  { id: "mini-trs", label: "3.5 mm TRS", family: "mini-jack", usesGender: true, defaultSignalTypes: ["analog-line"] },
  { id: "rca", label: "RCA", family: "rca", usesGender: true, defaultSignalTypes: ["analog-line", "digital-audio"] },
  { id: "speakon", label: "speakON", family: "speakon", usesGender: false, defaultSignalTypes: ["speaker-level"] },
  { id: "rj45", label: "RJ45", family: "rj45", usesGender: false, defaultSignalTypes: ["network-control", "digital-audio"] },
  { id: "bnc", label: "BNC", family: "bnc", usesGender: true, defaultSignalTypes: ["video", "digital-audio"] },
  { id: "hdmi", label: "HDMI", family: "hdmi", usesGender: true, defaultSignalTypes: ["video", "digital-audio"] },
  { id: "usb-a", label: "USB-A", family: "usb", usesGender: true, defaultSignalTypes: ["network-control", "digital-audio", "power"] },
  { id: "usb-b", label: "USB-B", family: "usb", usesGender: true, defaultSignalTypes: ["network-control", "digital-audio"] },
  { id: "usb-c", label: "USB-C", family: "usb", usesGender: true, defaultSignalTypes: ["network-control", "digital-audio", "video", "power"] },
  { id: "toslink", label: "Optical / TOSLINK", family: "toslink", usesGender: false, defaultSignalTypes: ["digital-audio"] },
  { id: "midi-din", label: "MIDI DIN", family: "midi-din", usesGender: true, defaultSignalTypes: ["midi"] },
  { id: "iec", label: "IEC", family: "iec", usesGender: true, defaultSignalTypes: ["power"] },
  { id: "edison", label: "Edison", family: "edison", usesGender: true, defaultSignalTypes: ["power"] },
  { id: "other", label: "Other", family: "other", usesGender: false, defaultSignalTypes: ["other"] },
];

export const CABLE_CONNECTOR_TYPES = CONNECTOR_TYPES.filter((connector) => !connector.portOnly);

export const SIGNAL_TYPES = [
  { id: "microphone", label: "Microphone" },
  { id: "instrument", label: "Instrument" },
  { id: "analog-line", label: "Analog line" },
  { id: "speaker-level", label: "Speaker-level" },
  { id: "digital-audio", label: "Digital audio" },
  { id: "network-control", label: "Network / control" },
  { id: "video", label: "Video" },
  { id: "midi", label: "MIDI" },
  { id: "power", label: "Power" },
  { id: "other", label: "Other" },
] as const;

export const CABLE_COLORS = [
  "#287d8e",
  "#d85c41",
  "#b78318",
  "#557a35",
  "#76558e",
  "#415f9d",
  "#8b6546",
] as const;

export function connectorSnapshot(typeId: string, gender: ConnectorGender, specification?: string): ConnectorSnapshot {
  const connector = CONNECTOR_TYPES.find((item) => item.id === typeId) ?? CONNECTOR_TYPES[CONNECTOR_TYPES.length - 1];
  return {
    typeId: connector.id,
    label: connector.label,
    gender: connector.fixedGender ?? (connector.usesGender ? gender : "none"),
    ...(specification?.trim() ? { specification: specification.trim() } : {}),
    ...(connector.acceptedCableTypeIds ? { acceptedCableTypeIds: [...connector.acceptedCableTypeIds] } : {}),
  };
}

export function connectorType(typeId: string) {
  return CONNECTOR_TYPES.find((item) => item.id === typeId) ?? CONNECTOR_TYPES[CONNECTOR_TYPES.length - 1];
}

export function oppositeGender(gender: ConnectorGender): ConnectorGender {
  if (gender === "male") return "female";
  if (gender === "female") return "male";
  return "none";
}
