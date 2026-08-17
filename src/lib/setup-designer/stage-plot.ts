import type {
  CableEdge,
  SetupNode,
  StageArea,
  StageConnectionAnchor,
  StageConnectionSide,
  StagePlan,
  StagePosition,
  StageRoute,
  StageWaypoint,
} from "@/lib/setup-designer/domain";
import { cableAssemblyEdges, edgeHasCableAssemblyLeg, edgeIsCableAssemblyPrimary, primaryCableAssemblyLeg } from "@/lib/setup-designer/breakout-cables";

export const STAGE_PIXELS_PER_FOOT = 32;
export const STAGE_POSITION_INCREMENT_FEET = 0.25;
export const STAGE_WAYPOINT_HIT_SIZE_PIXELS = 44;
export const STAGE_WAYPOINT_MARKER_SIZE_PIXELS = 24;
export const MIN_STAGE_DIMENSION_FEET = 1 / 12;
export const DEFAULT_STAGE_ROUTE: StageRoute = {
  waypointIds: [],
  sourceDropFeet: 0,
  targetDropFeet: 0,
  serviceSlackFeet: 3,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function constrainStageArea(area: StageArea, stage: Pick<StagePlan, "widthFeet" | "depthFeet">): StageArea {
  const widthFeet = Math.min(stage.widthFeet, Math.max(0.5, area.widthFeet));
  const depthFeet = Math.min(stage.depthFeet, Math.max(0.5, area.depthFeet));
  return {
    ...area,
    widthFeet,
    depthFeet,
    xFeet: clamp(area.xFeet, 0, Math.max(0, stage.widthFeet - widthFeet)),
    yFeet: clamp(area.yFeet, 0, Math.max(0, stage.depthFeet - depthFeet)),
  };
}

function defaultFootprint(node: SetupNode) {
  if (node.data.cableAssembly) return {
    widthFeet: (node.data.physicalDimensions?.widthInches ?? 4) / 12,
    depthFeet: (node.data.physicalDimensions?.depthInches ?? 2) / 12,
  };
  const measuredWidth = node.data.physicalDimensions?.widthInches;
  const measuredDepth = node.data.physicalDimensions?.depthInches;
  if (measuredWidth && measuredDepth) {
    return { widthFeet: measuredWidth / 12, depthFeet: measuredDepth / 12 };
  }
  const category = node.data.category.toLowerCase();
  const name = node.data.name.toLowerCase();
  const description = `${category} ${name}`;
  if (description.includes("drum kit") || description.includes("drum set")) return { widthFeet: 8, depthFeet: 6 };
  if (description.includes("nord") || description.includes("keyboard") || description.includes("piano")) return { widthFeet: 42 / 12, depthFeet: 14 / 12 };
  if (description.includes("x32")) return { widthFeet: 35.4 / 12, depthFeet: 20.8 / 12 };
  if (description.includes("mixer") || description.includes("console")) return { widthFeet: 3, depthFeet: 2 };
  if (description.includes("guitar stand") || description.includes("mic stand") || description.includes("microphone stand")) return { widthFeet: 2, depthFeet: 2 };
  if (description.includes("direct box") || description.includes("d.i.")) return { widthFeet: 5 / 12, depthFeet: 4 / 12 };
  if (description.includes("microphone") || description.includes(" mic")) return { widthFeet: 7 / 12, depthFeet: 2 / 12 };
  if (description.includes("stage box")) return { widthFeet: 17 / 12, depthFeet: 9 / 12 };
  if (description.includes("guitar") || description.includes("bass")) return { widthFeet: 40 / 12, depthFeet: 14 / 12 };
  if (description.includes("rack")) return { widthFeet: 3, depthFeet: 3 };
  return { widthFeet: 2.5, depthFeet: 2.5 };
}

const DEFAULT_INPUT_ANCHOR: StageConnectionAnchor = { side: "left", offset: 0.5 };
const DEFAULT_OUTPUT_ANCHOR: StageConnectionAnchor = { side: "right", offset: 0.5 };

function normalizeDegrees(value: number | undefined) {
  const degrees = Number.isFinite(value) ? Number(value) : 0;
  return ((degrees % 360) + 360) % 360;
}

function normalizeAnchor(value: StageConnectionAnchor | undefined, fallback: StageConnectionAnchor): StageConnectionAnchor {
  const validSides: StageConnectionSide[] = ["top", "right", "bottom", "left"];
  return {
    side: value && validSides.includes(value.side) ? value.side : fallback.side,
    offset: clamp(Number(value?.offset ?? fallback.offset), 0, 1),
  };
}

export function stagePositionForNode(node: SetupNode, stage: Pick<StagePlan, "widthFeet" | "depthFeet">): Required<StagePosition> {
  const footprint = defaultFootprint(node);
  const widthFeet = Math.max(MIN_STAGE_DIMENSION_FEET, node.stagePosition?.widthFeet ?? footprint.widthFeet);
  const depthFeet = Math.max(MIN_STAGE_DIMENSION_FEET, node.stagePosition?.depthFeet ?? footprint.depthFeet);
  const seededX = 2 + Math.max(0, node.position.x) / STAGE_PIXELS_PER_FOOT;
  const seededY = 2 + Math.max(0, node.position.y) / STAGE_PIXELS_PER_FOOT;
  return {
    xFeet: clamp(node.stagePosition?.xFeet ?? seededX, 0, Math.max(0, stage.widthFeet - widthFeet)),
    yFeet: clamp(node.stagePosition?.yFeet ?? seededY, 0, Math.max(0, stage.depthFeet - depthFeet)),
    widthFeet,
    depthFeet,
    rotationDegrees: normalizeDegrees(node.stagePosition?.rotationDegrees),
    inputAnchor: normalizeAnchor(node.stagePosition?.inputAnchor, DEFAULT_INPUT_ANCHOR),
    outputAnchor: normalizeAnchor(node.stagePosition?.outputAnchor, DEFAULT_OUTPUT_ANCHOR),
  };
}

export interface StageNodeGeometry {
  bodyWidthPixels: number;
  bodyHeightPixels: number;
  boundingWidthPixels: number;
  boundingHeightPixels: number;
  canvasPosition: { x: number; y: number };
}

export function stageNodeGeometry(position: Required<StagePosition>): StageNodeGeometry {
  const radians = position.rotationDegrees * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const boundingWidthFeet = position.widthFeet * cosine + position.depthFeet * sine;
  const boundingHeightFeet = position.widthFeet * sine + position.depthFeet * cosine;
  const centerXFeet = position.xFeet + position.widthFeet / 2;
  const centerYFeet = position.yFeet + position.depthFeet / 2;
  return {
    bodyWidthPixels: position.widthFeet * STAGE_PIXELS_PER_FOOT,
    bodyHeightPixels: position.depthFeet * STAGE_PIXELS_PER_FOOT,
    boundingWidthPixels: boundingWidthFeet * STAGE_PIXELS_PER_FOOT,
    boundingHeightPixels: boundingHeightFeet * STAGE_PIXELS_PER_FOOT,
    canvasPosition: {
      x: (centerXFeet - boundingWidthFeet / 2) * STAGE_PIXELS_PER_FOOT,
      y: (centerYFeet - boundingHeightFeet / 2) * STAGE_PIXELS_PER_FOOT,
    },
  };
}

export function stagePositionFromCanvasPosition(
  position: Required<StagePosition>,
  canvasPosition: { x: number; y: number },
): Required<StagePosition> {
  const geometry = stageNodeGeometry(position);
  const centerXFeet = (canvasPosition.x + geometry.boundingWidthPixels / 2) / STAGE_PIXELS_PER_FOOT;
  const centerYFeet = (canvasPosition.y + geometry.boundingHeightPixels / 2) / STAGE_PIXELS_PER_FOOT;
  return {
    ...position,
    xFeet: centerXFeet - position.widthFeet / 2,
    yFeet: centerYFeet - position.depthFeet / 2,
  };
}

export function ensureStagePositions(nodes: readonly SetupNode[], stage: Pick<StagePlan, "widthFeet" | "depthFeet">): SetupNode[] {
  return nodes.map((node) => ({
    ...node,
    stagePosition: stagePositionForNode(node, stage),
  }));
}

export function stageRouteFor(edge: CableEdge): StageRoute {
  return {
    ...DEFAULT_STAGE_ROUTE,
    ...edge.data.stageRoute,
    waypointIds: edge.data.stageRoute?.waypointIds ?? [],
  };
}

export interface FeetPoint {
  xFeet: number;
  yFeet: number;
}

function rotateLocalPoint(point: FeetPoint, center: FeetPoint, degrees: number): FeetPoint {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.xFeet - center.xFeet;
  const y = point.yFeet - center.yFeet;
  return {
    xFeet: center.xFeet + x * cosine - y * sine,
    yFeet: center.yFeet + x * sine + y * cosine,
  };
}

export function stageConnectionPoint(position: Required<StagePosition>, direction: "input" | "output"): FeetPoint {
  const anchor = direction === "input" ? position.inputAnchor : position.outputAnchor;
  const point = anchor.side === "left" ? { xFeet: 0, yFeet: position.depthFeet * anchor.offset }
    : anchor.side === "right" ? { xFeet: position.widthFeet, yFeet: position.depthFeet * anchor.offset }
      : anchor.side === "top" ? { xFeet: position.widthFeet * anchor.offset, yFeet: 0 }
        : { xFeet: position.widthFeet * anchor.offset, yFeet: position.depthFeet };
  const rotated = rotateLocalPoint(point, { xFeet: position.widthFeet / 2, yFeet: position.depthFeet / 2 }, position.rotationDegrees);
  return { xFeet: position.xFeet + rotated.xFeet, yFeet: position.yFeet + rotated.yFeet };
}

export function rotatedAnchorSide(anchor: StageConnectionAnchor, rotationDegrees: number): StageConnectionSide {
  const vector = anchor.side === "left" ? { x: -1, y: 0 }
    : anchor.side === "right" ? { x: 1, y: 0 }
      : anchor.side === "top" ? { x: 0, y: -1 }
        : { x: 0, y: 1 };
  const radians = rotationDegrees * Math.PI / 180;
  const x = vector.x * Math.cos(radians) - vector.y * Math.sin(radians);
  const y = vector.x * Math.sin(radians) + vector.y * Math.cos(radians);
  return Math.abs(x) >= Math.abs(y) ? (x >= 0 ? "right" : "left") : (y >= 0 ? "bottom" : "top");
}

export function stageAnchorArrowRotation(side: StageConnectionSide) {
  const rotations: Record<StageConnectionSide, number> = {
    top: 0,
    right: 90,
    bottom: 180,
    left: -90,
  };
  return rotations[side];
}

export function stageAnchorCanvasPlacement(position: Required<StagePosition>, direction: "input" | "output") {
  const geometry = stageNodeGeometry(position);
  const point = stageConnectionPoint(position, direction);
  return {
    x: point.xFeet * STAGE_PIXELS_PER_FOOT - geometry.canvasPosition.x,
    y: point.yFeet * STAGE_PIXELS_PER_FOOT - geometry.canvasPosition.y,
    side: rotatedAnchorSide(direction === "input" ? position.inputAnchor : position.outputAnchor, position.rotationDegrees),
  };
}

function cableEndpoint(node: SetupNode, side: "source" | "target", stage: Pick<StagePlan, "widthFeet" | "depthFeet">): FeetPoint {
  const position = stagePositionForNode(node, stage);
  return stageConnectionPoint(position, side === "source" ? "output" : "input");
}

function manhattanDistance(points: readonly FeetPoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.abs(points[index].xFeet - points[index - 1].xFeet);
    total += Math.abs(points[index].yFeet - points[index - 1].yFeet);
  }
  return total;
}

export function requiredCableLengthFeet(
  edge: CableEdge,
  nodes: readonly SetupNode[],
  stage: StagePlan,
) {
  if (edge.data.internalTransport) return edge.data.lengthUnit === "m"
    ? (edge.data.estimatedLength ?? 0) * 3.28084
    : edge.data.estimatedLength ?? 0;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return undefined;
  const waypointMap = new Map(stage.waypoints.map((waypoint) => [waypoint.id, waypoint]));
  const route = stageRouteFor(edge);
  const points: FeetPoint[] = [
    cableEndpoint(source, "source", stage),
    ...route.waypointIds.flatMap((id) => {
      const waypoint = waypointMap.get(id);
      return waypoint ? [waypoint.position] : [];
    }),
    cableEndpoint(target, "target", stage),
  ];
  return manhattanDistance(points) + route.sourceDropFeet + route.targetDropFeet + route.serviceSlackFeet;
}

function requiredCableSegmentLengthFeet(
  edge: CableEdge,
  nodes: readonly SetupNode[],
  stage: StagePlan,
) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return undefined;
  const waypointMap = new Map(stage.waypoints.map((waypoint) => [waypoint.id, waypoint]));
  const route = stageRouteFor(edge);
  const points: FeetPoint[] = [
    cableEndpoint(source, "source", stage),
    ...route.waypointIds.flatMap((id) => {
      const waypoint = waypointMap.get(id);
      return waypoint ? [waypoint.position] : [];
    }),
    cableEndpoint(target, "target", stage),
  ];
  return manhattanDistance(points) + route.sourceDropFeet + route.targetDropFeet;
}

function requiredCableAssemblyLengthFeet(
  primaryEdge: CableEdge,
  nodes: readonly SetupNode[],
  edges: readonly CableEdge[],
  stage: StagePlan,
) {
  const nodeId = primaryCableAssemblyLeg(primaryEdge)?.nodeId;
  if (!nodeId) return requiredCableLengthFeet(primaryEdge, nodes, stage);
  const assemblyNode = nodes.find((node) => node.id === nodeId);
  const legs = cableAssemblyEdges(edges, nodeId);
  const primaryLength = requiredCableSegmentLengthFeet(primaryEdge, nodes, stage);
  const ordinaryCable = assemblyNode?.data.cableAssembly
    && assemblyNode.data.cableAssembly.ends.end1.length === 1
    && assemblyNode.data.cableAssembly.ends.end2.length === 1;
  if (ordinaryCable) return primaryLength === undefined ? undefined : primaryLength + stageRouteFor(primaryEdge).serviceSlackFeet;
  const branchLengths = legs
    .filter((edge) => edge.id !== primaryEdge.id)
    .map((edge) => requiredCableSegmentLengthFeet(edge, nodes, stage))
    .filter((length): length is number => length !== undefined);
  if (primaryLength === undefined || !branchLengths.length) return undefined;
  return primaryLength + Math.max(...branchLengths) + stageRouteFor(primaryEdge).serviceSlackFeet;
}

function roundedRequiredLength(length: number) {
  return Math.ceil(length * 2) / 2;
}

export function withMeasuredStageCableLengths(
  nodes: readonly SetupNode[],
  edges: readonly CableEdge[],
  stage: StagePlan,
): CableEdge[] {
  return edges.map((edge) => {
    if (edge.data.internalTransport) return edge;
    const requiredFeet = edgeIsCableAssemblyPrimary(edge)
      ? requiredCableAssemblyLengthFeet(edge, nodes, edges, stage)
      : edgeHasCableAssemblyLeg(edge)
        ? requiredCableSegmentLengthFeet(edge, nodes, stage)
        : requiredCableLengthFeet(edge, nodes, stage);
    if (requiredFeet === undefined) return edge;
    const measured = edge.data.lengthUnit === "m" ? requiredFeet / 3.28084 : requiredFeet;
    return {
      ...edge,
      data: {
        ...edge.data,
        estimatedLength: roundedRequiredLength(measured),
        stageRoute: stageRouteFor(edge),
      },
    };
  });
}

export function waypointUsageCount(waypoint: StageWaypoint, edges: readonly CableEdge[]) {
  return edges.filter((edge) => edge.data.stageRoute?.waypointIds.includes(waypoint.id)).length;
}
