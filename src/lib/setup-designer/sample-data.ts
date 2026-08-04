import { CABLE_COLORS, connectorSnapshot } from "@/lib/setup-designer/catalog";
import type {
  CableEdge,
  EquipmentPort,
  EquipmentTemplate,
  PortDirection,
  SetupGraph,
  SetupMetadata,
  SetupNode,
  SetupWorkspace,
} from "@/lib/setup-designer/domain";

function samplePorts(
  templateId: string,
  direction: PortDirection,
  count: number,
  connectorTypeId: string,
  connectorGender: "male" | "female" | "none",
  signalType: string,
  labelPrefix: string,
  specification?: string,
): EquipmentPort[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${templateId}-${direction}-${index + 1}`,
    direction,
    number: index + 1,
    label: `${labelPrefix} ${index + 1}`,
    connector: connectorSnapshot(connectorTypeId, connectorGender, specification),
    signalType,
  }));
}

function template(input: Omit<EquipmentTemplate, "version" | "status" | "showPortNumbers" | "showPortLabels" | "ownedUnits" | "referenceImages" | "equipmentKind"> & Partial<Pick<EquipmentTemplate, "showPortNumbers" | "showPortLabels" | "ownedUnits" | "referenceImages" | "equipmentKind">>): EquipmentTemplate {
  return {
    ...input,
    showPortNumbers: input.showPortNumbers ?? true,
    showPortLabels: input.showPortLabels ?? true,
    ownedUnits: input.ownedUnits ?? [],
    referenceImages: input.referenceImages ?? [],
    equipmentKind: input.equipmentKind ?? "device",
    version: 1,
    status: "active",
  };
}

export const SAMPLE_EQUIPMENT_TEMPLATES: EquipmentTemplate[] = [
  template({
    id: "template-vocal-mic",
    name: "Vocal microphone",
    manufacturer: "Shure",
    model: "SM58",
    category: "Microphone",
    ports: samplePorts("vocal-mic", "output", 1, "xlr", "male", "microphone", "Output"),
    ownedUnits: [
      { id: "sm58-1", label: "SM58 #1" },
      { id: "sm58-2", label: "SM58 #2" },
      { id: "sm58-3", label: "SM58 #3" },
    ],
  }),
  template({
    id: "template-kick-mic",
    name: "Kick drum mic",
    category: "Drum microphone",
    ports: samplePorts("kick-mic", "output", 1, "xlr", "male", "microphone", "Output"),
  }),
  template({
    id: "template-snare-mic",
    name: "Snare drum mic",
    category: "Drum microphone",
    ports: samplePorts("snare-mic", "output", 1, "xlr", "male", "microphone", "Output"),
  }),
  template({
    id: "template-tom-mic",
    name: "Tom mic",
    category: "Drum microphone",
    ports: samplePorts("tom-mic", "output", 1, "xlr", "male", "microphone", "Output"),
  }),
  template({
    id: "template-overhead-mic",
    name: "Drum overhead mic",
    category: "Drum microphone",
    ports: samplePorts("overhead-mic", "output", 1, "xlr", "male", "microphone", "Output"),
  }),
  template({
    id: "template-guitar",
    name: "Electric guitar",
    category: "Instrument",
    ports: samplePorts("guitar", "output", 1, "quarter-ts", "female", "instrument", "Output"),
  }),
  template({
    id: "template-guitar-di",
    name: "Guitar D.I.",
    manufacturer: "Radial",
    model: "JDI",
    category: "Direct box",
    ports: [
      ...samplePorts("guitar-di", "input", 1, "quarter-ts", "female", "instrument", "Instrument in"),
      ...samplePorts("guitar-di", "output", 1, "xlr", "male", "microphone", "Balanced out"),
    ],
    ownedUnits: [{ id: "jdi-1", label: "Radial JDI #1" }],
  }),
  template({
    id: "template-bass",
    name: "Electric bass",
    category: "Instrument",
    ports: samplePorts("bass", "output", 1, "quarter-ts", "female", "instrument", "Output"),
  }),
  template({
    id: "template-bass-di",
    name: "Bass D.I.",
    category: "Direct box",
    ports: [
      ...samplePorts("bass-di", "input", 1, "quarter-ts", "female", "instrument", "Instrument in"),
      ...samplePorts("bass-di", "output", 1, "xlr", "male", "microphone", "Balanced out"),
    ],
    ownedUnits: [{ id: "bass-di-1", label: "Bass D.I. #1" }],
  }),
  template({
    id: "template-stage-box",
    name: "Stage box",
    category: "Stage box",
    ports: [
      ...samplePorts("stage-box-xlr", "input", 16, "xlr", "female", "microphone", "XLR in"),
      ...samplePorts("stage-box-trs", "input", 8, "quarter-trs", "female", "analog-line", "TRS in"),
      ...samplePorts("stage-box-return", "output", 8, "xlr", "male", "analog-line", "Return"),
      ...samplePorts("stage-box-aes", "output", 1, "rj45", "none", "digital-audio", "AES50", "Cat5e / Cat6"),
    ].map((port, index, ports) => {
      const directionPorts = ports.filter((item) => item.direction === port.direction);
      const directionIndex = directionPorts.findIndex((item) => item.id === port.id);
      return { ...port, number: directionIndex + 1 };
    }),
  }),
  template({
    id: "template-x32",
    name: "Behringer X32",
    manufacturer: "Behringer",
    model: "X32",
    category: "Mixer",
    ports: [
      ...samplePorts("x32-input", "input", 16, "xlr", "female", "microphone", "Local in"),
      ...samplePorts("x32-aes", "input", 1, "rj45", "none", "digital-audio", "AES50 A", "Cat5e / Cat6"),
      ...samplePorts("x32-output", "output", 8, "xlr", "male", "analog-line", "Local out"),
    ].map((port, index, ports) => {
      const directionPorts = ports.filter((item) => item.direction === port.direction);
      const directionIndex = directionPorts.findIndex((item) => item.id === port.id);
      return { ...port, number: directionIndex + 1 };
    }),
    ownedUnits: [{ id: "x32-main", label: "The Swell X32" }],
  }),
];

export function nodeFromTemplate(templateValue: EquipmentTemplate, id: string, x: number, y: number, name = templateValue.name): SetupNode {
  return {
    id,
    type: "equipment",
    position: { x, y },
    data: {
      templateId: templateValue.id,
      templateVersion: templateValue.version,
      name,
      category: templateValue.category,
      equipmentKind: templateValue.equipmentKind,
      transport: templateValue.transport ? structuredClone(templateValue.transport) : undefined,
      notes: templateValue.notes,
      image: templateValue.image,
      ports: structuredClone(templateValue.ports),
      showPortNumbers: templateValue.showPortNumbers,
      showPortLabels: templateValue.showPortLabels,
      isExpanded: false,
      fulfillment: "unplanned",
    },
  };
}

const vocalTemplate = SAMPLE_EQUIPMENT_TEMPLATES.find((item) => item.id === "template-vocal-mic")!;
const stageBoxTemplate = SAMPLE_EQUIPMENT_TEMPLATES.find((item) => item.id === "template-stage-box")!;
const mixerTemplate = SAMPLE_EQUIPMENT_TEMPLATES.find((item) => item.id === "template-x32")!;

const sampleNodes: SetupNode[] = [
  nodeFromTemplate(vocalTemplate, "sample-vocal-3", 40, 140, "Vocal 3"),
  nodeFromTemplate(stageBoxTemplate, "sample-stage-box", 430, 40),
  nodeFromTemplate(mixerTemplate, "sample-mixer", 900, 80),
];

const sampleEdges: CableEdge[] = [
  {
    id: "sample-cable-vocal-stagebox",
    type: "signalCable",
    source: "sample-vocal-3",
    sourceHandle: sampleNodes[0].data.ports[0].id,
    target: "sample-stage-box",
    targetHandle: sampleNodes[1].data.ports.find((port) => port.direction === "input")!.id,
    animated: true,
    data: {
      color: CABLE_COLORS[0],
      endA: connectorSnapshot("xlr", "female"),
      endB: connectorSnapshot("xlr", "male"),
      signalType: "microphone",
      estimatedLength: 25,
      lengthUnit: "ft",
      fulfillment: "owned",
      assignedInventoryLabel: "25 ft XLR #3",
    },
  },
  {
    id: "sample-cable-stagebox-mixer",
    type: "signalCable",
    source: "sample-stage-box",
    sourceHandle: sampleNodes[1].data.ports.find((port) => port.connector.typeId === "rj45")!.id,
    target: "sample-mixer",
    targetHandle: sampleNodes[2].data.ports.find((port) => port.connector.typeId === "rj45")!.id,
    animated: true,
    data: {
      color: CABLE_COLORS[5],
      endA: connectorSnapshot("rj45", "none", "Cat6"),
      endB: connectorSnapshot("rj45", "none", "Cat6"),
      cableSpecification: "Shielded Cat6",
      signalType: "digital-audio",
      channelCapacity: 48,
      estimatedLength: 100,
      lengthUnit: "ft",
      fulfillment: "rent",
    },
  },
];

const sampleMetadata: SetupMetadata = {
  id: "sample-live-setup",
  name: "Live vocal patch",
  description: "A starting example for microphones, stage box, and the X32.",
  status: "active",
  graphSchemaVersion: 1,
  revision: 1,
  nodeCount: sampleNodes.length,
  cableCount: sampleEdges.length,
  updatedAt: Date.now(),
};

export const SAMPLE_SETUP_WORKSPACE: SetupWorkspace = {
  metadata: sampleMetadata,
  graph: {
    schemaVersion: 1,
    revision: 1,
    nodes: sampleNodes,
    edges: sampleEdges,
    viewport: { x: 10, y: 10, zoom: 0.7 },
  },
};

export const SAMPLE_SETUP_GRAPH: SetupGraph = SAMPLE_SETUP_WORKSPACE.graph;
