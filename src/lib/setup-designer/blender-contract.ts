import { z } from "zod";

// Equipment protocol v1 is separate from the existing stage-outline POST protocol.
const finite = z.number().finite();
const positive = finite.positive();
const revision = z.number().int().nonnegative();
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const angle = finite.min(-360).max(360);
const dimensions = z.object({
  widthMeters: positive,
  depthMeters: positive,
  heightMeters: positive,
}).strict();

export const BlenderAttachmentSchema = z.object({
  parentNodeId: identifier,
  offsetMeters: z.object({ x: finite, y: finite, z: finite }).strict(),
  rotationXYZDegrees: z.object({ x: angle, y: angle, z: angle }).strict(),
}).strict();
export type BlenderAttachment = z.infer<typeof BlenderAttachmentSchema>;

export const Stage3dSchema = z.object({
  schemaVersion: z.literal(1),
  elevationFeet: finite,
  pitchDegrees: angle,
  rollDegrees: angle,
  footprintMode: z.enum(["physical", "custom"]),
  attachment: BlenderAttachmentSchema.optional(),
  dimensionOverride: z.literal(true).optional(),
}).strict();

export type Stage3d = z.infer<typeof Stage3dSchema>;

export const BlenderPoseSchema = z.object({
  centerXMeters: finite,
  centerYMeters: finite,
  elevationMeters: finite,
  headingDegrees: finite.min(0).lt(360),
  pitchDegrees: angle,
  rollDegrees: angle,
}).strict();

export type BlenderPose = z.infer<typeof BlenderPoseSchema>;

const footprint = z.object({
  widthMeters: positive,
  depthMeters: positive,
  mode: z.enum(["physical", "custom"]),
}).strict();

export const BlenderCalibrationSchema = z.object({
  schemaVersion: z.literal(1),
  setupId: identifier,
  stageObjectName: z.string().min(1).max(256),
  originWorldMeters: z.object({ x: finite, y: finite, z: finite }).strict(),
  frameYawDegrees: angle,
  metersPerBlenderUnit: positive,
}).strict();

export type BlenderCalibration = z.infer<typeof BlenderCalibrationSchema>;

const cableEndpoint = z.object({
  nodeId: identifier, portId: z.string(), label: z.string(), connector: z.string(),
  side: z.enum(["left", "right", "top", "bottom"]), offset: finite.min(0).max(1),
  portIndex: revision, portCount: z.number().int().positive(),
}).strict();
export const BlenderCableSchema = z.object({
  edgeId: z.string().min(1), source: cableEndpoint, target: cableEndpoint,
  color: z.string(), signalType: z.string(), channelCapacity: positive,
  isTrunk: z.boolean(), assemblyIds: z.array(z.string()),
  waypoints: z.array(z.object({ id: identifier, label: z.string(), xMeters: finite, yMeters: finite }).strict()),
  sourceDropMeters: finite.nonnegative(), targetDropMeters: finite.nonnegative(), slackMeters: finite.nonnegative(),
  websiteLengthMeters: finite.nonnegative().optional(),
}).strict();

export const BlenderWaypointSchema = z.object({ id: identifier, label: z.string(), xMeters: finite, yMeters: finite }).strict();
export const BlenderWaypointPatchSchema = z.object({
  waypointId: identifier, xMeters: finite.optional(), yMeters: finite.optional(),
}).strict().refine(value => value.xMeters !== undefined || value.yMeters !== undefined, { message: "Waypoint patch must change X or Y." });

export const BlenderSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  setupId: identifier,
  revision,
  stage: z.object({
    widthMeters: positive,
    depthMeters: positive,
    outlineMeters: z.array(z.object({ xMeters: finite, yMeters: finite }).strict()).min(3).max(256).optional(),
  }).strict(),
  waypoints: z.array(BlenderWaypointSchema).max(1000).optional(),
  cables: z.array(BlenderCableSchema).max(10000).optional(),
  items: z.array(z.object({
    nodeId: identifier,
    name: z.string().min(1).max(512),
    kind: z.enum(["equipment", "performer", "transport-endpoint", "cable"]),
    modelHint: z.string().optional(),
    templateId: identifier.optional(),
    templateVersion: revision.optional(),
    currentDefinitionVersion: revision.optional(),
    currentDefinitionDimensions: dimensions.partial().optional(),
    assignedAssetId: identifier.optional(),
    assemblyId: identifier.optional(),
    transportEndpointId: identifier.optional(),
    pose: BlenderPoseSchema,
    attachment: BlenderAttachmentSchema.optional(),
    footprint,
    // Missing dimensions stay missing; a visual fallback is never a measurement.
    dimensions: dimensions.partial(),
    dimensionsSourceText: z.string().optional(),
  }).strict()).max(1000),
}).strict().refine((value) => new Set(value.items.map((item) => item.nodeId)).size === value.items.length, {
  message: "Snapshot contains duplicate node IDs.",
});

const correctionFields = {
  values: dimensions,
  measurementKind: z.enum(["measured", "modeled-estimate"]),
};

export const BlenderDimensionCorrectionSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("placement"), ...correctionFields }).strict(),
  z.object({
    scope: z.literal("definition"),
    templateId: identifier,
    expectedDefinitionVersion: revision,
    ...correctionFields,
  }).strict(),
]);

const posePatch = BlenderPoseSchema.partial().refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Pose patch must contain at least one field.",
});

export const BlenderItemPatchSchema = z.object({
  nodeId: identifier,
  pose: posePatch.optional(),
  footprint: footprint.optional(),
  dimensions: BlenderDimensionCorrectionSchema.optional(),
  attachment: BlenderAttachmentSchema.nullable().optional(),
}).strict().refine((value) => value.pose !== undefined || value.footprint !== undefined || value.dimensions !== undefined || value.attachment !== undefined, {
  message: "Item patch must change pose, footprint, or dimensions.",
});

export const BlenderPatchSchema = z.object({
  schemaVersion: z.literal(1),
  setupId: identifier,
  baseRevision: revision,
  mutationId: z.uuid(),
  clientId: z.uuid(),
  changes: z.array(BlenderItemPatchSchema).max(100),
  waypointChanges: z.array(BlenderWaypointPatchSchema).max(100).optional(),
}).strict().superRefine((value, context) => {
  const waypoints = (value.waypointChanges ?? []).map(item => item.waypointId);
  if (!value.changes.length && !waypoints.length) context.addIssue({ code: "custom", message: "Patch must contain changes." });
  if (new Set(waypoints).size !== waypoints.length) context.addIssue({ code: "custom", message: "Only one patch per waypoint is allowed.", path: ["waypointChanges"] });
  const nodes = value.changes.map((item) => item.nodeId);
  if (new Set(nodes).size !== nodes.length) {
    context.addIssue({ code: "custom", message: "Only one patch per node is allowed.", path: ["changes"] });
  }
  const definitions = value.changes.flatMap((item) => item.dimensions?.scope === "definition" ? [item.dimensions.templateId] : []);
  if (new Set(definitions).size !== definitions.length) {
    context.addIssue({ code: "custom", message: "Correct each definition once per request.", path: ["changes"] });
  }
});

export type BlenderPatch = z.infer<typeof BlenderPatchSchema>;

export const BlenderAcknowledgementSchema = z.object({
  schemaVersion: z.literal(1),
  setupId: identifier,
  mutationId: z.uuid(),
  revision,
  replayed: z.boolean(),
  changedNodeIds: z.array(identifier),
  changedWaypointIds: z.array(identifier).optional(),
  correctedDefinitions: z.array(z.object({ templateId: identifier, version: revision }).strict()),
}).strict();
