"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnBeforeDelete,
  type ReactFlowInstance,
  type Viewport,
  reconnectEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { ArrowLeftIcon, AudioLinesIcon, BoxesIcon, CableIcon, EyeOffIcon, FocusIcon, LandPlotIcon, MapIcon, MapPinIcon, MapPinPlusIcon, SaveIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EQUIPMENT_TEMPLATE_DRAG_MIME, EquipmentLibrary } from "@/components/setup-designer/equipment-library";
import { EquipmentNode, EquipmentNodeActionsContext } from "@/components/setup-designer/equipment-node";
import { EquipmentNodeDialog } from "@/components/setup-designer/equipment-node-dialog";
import { PartsListPanel } from "@/components/setup-designer/parts-list-panel";
import { SignalCableEdge } from "@/components/setup-designer/signal-cable-edge";
import { StageCableEdge, type StageCanvasCableEdge } from "@/components/setup-designer/stage-cable-edge";
import { StageAreaInspector, StageCableInspector, StageItemInspector, StageLayoutInspector, StageMultiSelectionInspector, StageWaypointInspector } from "@/components/setup-designer/stage-inspector";
import {
  StageAreaNode,
  StageEquipmentNode,
  StageFloorNode,
  StageWaypointNode,
  type StageAreaCanvasNode,
  type StageCanvasNode,
  type StageEquipmentCanvasNode,
  type StageFloorCanvasNode,
  type StageWaypointCanvasNode,
} from "@/components/setup-designer/stage-plot-node";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdmin } from "@/hooks/use-admin";
import type { GearLocation, GearParty, InventoryAsset } from "@/lib/gear/domain";
import { listGearLocations, listGearParties, listInventoryAssets } from "@/lib/gear/repository";
import { cableInventoryAssignmentLabel } from "@/lib/setup-designer/cable-matching";
import { findAssetAssignment } from "@/lib/setup-designer/asset-assignments";
import { CABLE_COLORS } from "@/lib/setup-designer/catalog";
import { cableEndMatesPort, matingCableEnd, validateConnection } from "@/lib/setup-designer/compatibility";
import {
  createSetupId,
  emptySetupGraph,
  type CableEdge,
  type EquipmentNodeData,
  type EquipmentTemplate,
  type SetupGraph,
  type SetupMetadata,
  type SetupNode,
  type SetupWorkspaceView,
  type StageArea,
  type StagePlan,
  type StagePosition,
  type StageWaypoint,
} from "@/lib/setup-designer/domain";
import { deriveCableRuns, deriveEquipmentUsage, groupCableRuns } from "@/lib/setup-designer/parts-list";
import { graphByteSize, normalizeSetupGraph, setupGraphFromData } from "@/lib/setup-designer/serialization";
import { externalCableCount, placementFromTemplate, withTransportChannelLabels } from "@/lib/setup-designer/snake-topology";
import {
  STAGE_PIXELS_PER_FOOT,
  constrainStageArea,
  ensureStagePositions,
  stageNodeGeometry,
  stagePositionForNode,
  stagePositionFromCanvasPosition,
  stageRouteFor,
  waypointUsageCount,
  withMeasuredStageCableLengths,
} from "@/lib/setup-designer/stage-plot";
import {
  SetupRevisionConflictError,
  getSetupWorkspace,
  listEquipmentTemplates,
  saveSetupWorkspace,
} from "@/lib/setup-designer/repository";
import { cn } from "@/lib/utils";

const nodeTypes = { equipment: EquipmentNode };
const edgeTypes = { signalCable: SignalCableEdge };
const stageNodeTypes = { stageArea: StageAreaNode, stageEquipment: StageEquipmentNode, stageWaypoint: StageWaypointNode, stageFloor: StageFloorNode };
const stageEdgeTypes = { stageCable: StageCableEdge };
const GRAPH_WARNING_BYTES = 750 * 1024;
const GRAPH_MAX_BYTES = 1024 * 1024;

export function SetupWorkspaceClient({ setupId }: { setupId: string }) {
  return <SetupWorkspace setupId={setupId} />;
}

function SetupWorkspace({ setupId }: { setupId: string }) {
  const admin = useAdmin();
  const router = useRouter();
  const setupsHref = admin.isDemoAdmin ? "/setups?demo=1" : "/setups";
  const gearHref = admin.isDemoAdmin ? "/gear?demo=1" : "/gear";
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes, applyNodeChanges] = useNodesState<SetupNode>([]);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CableEdge>([]);
  const [metadata, setMetadata] = useState<SetupMetadata | null>(null);
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [parties, setParties] = useState<GearParty[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [stagePlan, setStagePlan] = useState<StagePlan>(() => emptySetupGraph().stage);
  const [activeView, setActiveView] = useState<SetupWorkspaceView>("signal");
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedStageNodeIds, setSelectedStageNodeIdsState] = useState<string[]>([]);
  const selectedStageNodeIdsRef = useRef<string[]>([]);
  const setSelectedStageNodeIds = useCallback((ids: string[]) => {
    const nextIds = [...new Set(ids)];
    selectedStageNodeIdsRef.current = nextIds;
    setSelectedStageNodeIdsState((current) => (
      current.length === nextIds.length && current.every((id) => nextIds.includes(id)) ? current : nextIds
    ));
  }, []);
  const [stageLayoutOpen, setStageLayoutOpen] = useState(false);
  const [stageCablesVisible, setStageCablesVisible] = useState(true);
  const [stageWaypointsVisible, setStageWaypointsVisible] = useState(true);
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [draggedTemplate, setDraggedTemplate] = useState<EquipmentTemplate | null>(null);
  const loadedRef = useRef(false);
  const additiveStageSelectionRef = useRef<string[] | null>(null);
  const reconnectingEdgeIdRef = useRef<string | null>(null);
  const reconnectValidationErrorRef = useRef<string | null>(null);
  const recoveryKey = `swell-parts:setup-recovery:${setupId}`;
  const actorId = admin.user?.uid ?? "demo-admin";

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    let active = true;
    Promise.all([getSetupWorkspace(setupId), listEquipmentTemplates(), listInventoryAssets(), listGearParties(), listGearLocations()])
      .then(([workspace, equipmentTemplates, inventoryAssets, gearParties, gearLocations]) => {
        if (!active) return;
        if (!workspace) {
          setError("This setup does not exist or was archived.");
          return;
        }
        let graph = workspace.graph;
        const recovered = window.localStorage.getItem(recoveryKey);
        if (recovered) {
          try {
            const parsed = JSON.parse(recovered) as { baseRevision: number; graph: SetupGraph };
            if (parsed.baseRevision === workspace.metadata.revision) {
              graph = setupGraphFromData(parsed.graph, parsed.baseRevision);
              setDirty(true);
              toast.info("Recovered unsaved setup changes from this browser.");
            }
          } catch {
            window.localStorage.removeItem(recoveryKey);
          }
        }
        setMetadata(workspace.metadata);
        setBaseRevision(workspace.metadata.revision);
        setNodes(ensureStagePositions(graph.nodes, graph.stage));
        setEdges(graph.edges);
        setViewport(graph.viewport);
        setStagePlan(graph.stage);
        setTemplates(equipmentTemplates);
        setAssets(inventoryAssets);
        setParties(gearParties);
        setLocations(gearLocations);
        loadedRef.current = true;
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load this setup."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [admin.isAdmin, recoveryKey, setEdges, setNodes, setupId]);

  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    const timeout = window.setTimeout(() => {
      const graph = normalizeSetupGraph({ nodes, edges, viewport, stage: stagePlan, revision: baseRevision });
      window.localStorage.setItem(recoveryKey, JSON.stringify({ baseRevision, graph }));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [baseRevision, dirty, edges, nodes, recoveryKey, stagePlan, viewport]);

  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [dirty]);

  const measuredEdges = useMemo(
    () => withMeasuredStageCableLengths(nodes, edges, stagePlan),
    [edges, nodes, stagePlan],
  );

  const save = useCallback(async () => {
    if (!metadata || saving || !dirty) return;
    const graph = normalizeSetupGraph({ nodes, edges: measuredEdges, viewport, stage: stagePlan, revision: baseRevision });
    const size = graphByteSize(graph);
    if (size >= GRAPH_MAX_BYTES) {
      toast.error("This setup is too large for one Firestore document. Download or simplify it before saving.");
      return;
    }
    if (size >= GRAPH_WARNING_BYTES) toast.warning("This setup is approaching Firestore's graph size limit.");
    setSaving(true);
    try {
      const revision = await saveSetupWorkspace(setupId, graph, baseRevision, actorId);
      setBaseRevision(revision);
      setEdges(graph.edges);
      setMetadata((current) => current ? { ...current, revision, nodeCount: deriveEquipmentUsage(nodes).length, cableCount: externalCableCount(graph.edges), updatedAt: Date.now() } : current);
      setDirty(false);
      window.localStorage.removeItem(recoveryKey);
      toast.success("Setup saved.");
    } catch (caught) {
      if (caught instanceof SetupRevisionConflictError) {
        toast.error("A newer setup revision exists. Reload before saving again.");
      } else {
        toast.error(caught instanceof Error ? caught.message : "Could not save this setup.");
      }
    } finally {
      setSaving(false);
    }
  }, [actorId, baseRevision, dirty, measuredEdges, metadata, nodes, recoveryKey, saving, setEdges, setupId, stagePlan, viewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const syncStageSelection = useCallback((ids: string[]) => {
    const validIds = [...new Set(ids)].filter((id) => nodes.some((node) => node.id === id) || stagePlan.areas.some((area) => area.id === id));
    if (selectedStageNodeIdsRef.current.length === validIds.length && selectedStageNodeIdsRef.current.every((id) => validIds.includes(id))) return;
    setSelectedStageNodeIds(validIds);
    if (!validIds.length) {
      setSelectedNodeId(null);
      setSelectedAreaId(null);
      return;
    }

    setHoveredEdgeId(null);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setStageLayoutOpen(false);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    if (validIds.length > 1) {
      setSelectedNodeId(null);
      setSelectedAreaId(null);
      return;
    }

    const [itemId] = validIds;
    if (nodes.some((node) => node.id === itemId)) {
      setSelectedNodeId(itemId);
      setSelectedAreaId(null);
    } else {
      setSelectedNodeId(null);
      setSelectedAreaId(itemId);
    }
  }, [nodes, setEdges, setSelectedStageNodeIds, stagePlan.areas]);

  const onNodesChange = useCallback((changes: NodeChange<SetupNode>[]) => {
    applyNodeChanges(changes);
    if (changes.some((change) => change.type !== "select" && change.type !== "dimensions")) setDirty(true);
  }, [applyNodeChanges]);

  const onStageNodesChange = useCallback((changes: NodeChange<StageCanvasNode>[]) => {
    const selectionChanges = changes.filter((change) => change.type === "select");
    if (selectionChanges.length) {
      const selectableIds = new Set([...nodes.map((node) => node.id), ...stagePlan.areas.map((area) => area.id)]);
      const retainedIds = additiveStageSelectionRef.current;
      const nextIds = new Set(retainedIds ?? selectedStageNodeIdsRef.current);
      selectionChanges.forEach((change) => {
        if (!selectableIds.has(change.id)) return;
        if (change.selected) nextIds.add(change.id);
        else if (!retainedIds?.includes(change.id)) nextIds.delete(change.id);
      });
      syncStageSelection([...nextIds]);
    }
    const positionChanges = changes.flatMap((change) => change.type === "position" && change.position ? [change] : []);
    if (!positionChanges.length) return;
    const waypointIds = new Set(stagePlan.waypoints.map((waypoint) => waypoint.id));
    setNodes((current) => current.map((node) => {
      const change = positionChanges.find((item) => item.id === node.id);
      if (!change || change.type !== "position" || !change.position) return node;
      const currentPosition = stagePositionForNode(node, stagePlan);
      const nextPosition = stagePositionFromCanvasPosition(currentPosition, change.position);
      return {
        ...node,
        stagePosition: {
          ...nextPosition,
          xFeet: Math.max(0, nextPosition.xFeet),
          yFeet: Math.max(0, nextPosition.yFeet),
        },
      };
    }));
    setStagePlan((current) => ({
      ...current,
      areas: current.areas.map((area) => {
        const change = positionChanges.find((item) => item.id === area.id);
        if (!change || change.type !== "position" || !change.position) return area;
        return constrainStageArea({
          ...area,
          xFeet: change.position.x / STAGE_PIXELS_PER_FOOT,
          yFeet: change.position.y / STAGE_PIXELS_PER_FOOT,
        }, current);
      }),
      waypoints: current.waypoints.map((waypoint) => {
        const change = positionChanges.find((item) => item.id === waypoint.id);
        if (!waypointIds.has(waypoint.id) || !change || change.type !== "position" || !change.position) return waypoint;
        return {
          ...waypoint,
          position: {
            xFeet: Math.max(0, (change.position.x + 20) / STAGE_PIXELS_PER_FOOT),
            yFeet: Math.max(0, (change.position.y + 20) / STAGE_PIXELS_PER_FOOT),
          },
        };
      }),
    }));
    setDirty(true);
  }, [nodes, setNodes, stagePlan, syncStageSelection]);

  const onEdgesChange = useCallback((changes: EdgeChange<CableEdge>[]) => {
    applyEdgeChanges(changes);
    if (changes.some((change) => change.type !== "select")) setDirty(true);
  }, [applyEdgeChanges]);

  const onConnect = useCallback((connection: Connection) => {
    const validation = validateConnection(connection, nodes, edges);
    if (!validation.valid || !validation.sourcePort || !validation.targetPort) {
      toast.error(validation.errors[0] ?? "Those ports cannot be connected.");
      return;
    }
    const edgeId = createSetupId("cable");
    const edge: CableEdge = {
      id: edgeId,
      type: "signalCable",
      source: connection.source!,
      sourceHandle: connection.sourceHandle!,
      target: connection.target!,
      targetHandle: connection.targetHandle!,
      animated: true,
      data: {
        color: CABLE_COLORS[edges.length % CABLE_COLORS.length],
        endA: matingCableEnd(validation.sourcePort, validation.targetPort.connector.typeId),
        endB: matingCableEnd(validation.targetPort, validation.sourcePort.connector.typeId),
        signalType: validation.sourcePort.signalType,
        channelCapacity: validation.sourcePort.channelCapacity,
        lengthUnit: "ft",
        fulfillment: "unplanned",
        ...(validation.warnings.length ? { exception: { reason: validation.warnings.join(" ") } } : {}),
      },
    };
    setEdges((current) => [...current, edge]);
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setSelectedAreaId(null);
    setSelectedStageNodeIds([]);
    setStageLayoutOpen(false);
    setDirty(true);
  }, [edges, nodes, setEdges, setSelectedStageNodeIds]);

  const connectionIsValid = useCallback((connection: Connection) => {
    const reconnectingEdgeId = reconnectingEdgeIdRef.current;
    const validation = validateConnection(connection, nodes, edges, reconnectingEdgeId ?? undefined);
    if (!validation.valid) {
      if (reconnectingEdgeId) reconnectValidationErrorRef.current = validation.errors[0] ?? "That port cannot accept this cable.";
      return false;
    }

    if (reconnectingEdgeId) {
      const edge = edges.find((item) => item.id === reconnectingEdgeId);
      const cableError = edge ? reconnectCableEndError(edge, connection, validation.sourcePort, validation.targetPort) : undefined;
      reconnectValidationErrorRef.current = cableError ?? null;
      if (cableError) return false;
    }
    return true;
  }, [edges, nodes]);

  const onReconnect = useCallback((edge: CableEdge, connection: Connection) => {
    const validation = validateConnection(connection, nodes, edges, edge.id);
    const cableError = reconnectCableEndError(edge, connection, validation.sourcePort, validation.targetPort);
    if (!validation.valid || cableError) {
      toast.error(validation.errors[0] ?? cableError ?? "That port cannot accept this cable.");
      return;
    }

    const nextData = validation.warnings.length && !edge.data.exception
      ? { ...edge.data, exception: { reason: validation.warnings.join(" ") } }
      : edge.data;
    setEdges((current) => reconnectEdge(edge, connection, current, { shouldReplaceId: false }).map((item) => (
      item.id === edge.id ? { ...item, data: nextData } : item
    )));
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setSelectedAreaId(null);
    setSelectedStageNodeIds([]);
    setStageLayoutOpen(false);
    setDirty(true);
    toast.success("Cable repatched.");
  }, [edges, nodes, setEdges, setSelectedStageNodeIds]);

  const placeTemplate = useCallback((
    template: EquipmentTemplate,
    position: { x: number; y: number },
    focusPlacedNode: boolean,
    stageAnchor?: { xFeet: number; yFeet: number },
  ) => {
    const placement = placementFromTemplate(template, position.x, position.y);
    const stagedPlacement = ensureStagePositions(placement.nodes, stagePlan).map((node, index) => {
      if (!stageAnchor) return node;
      const footprint = stagePositionForNode(node, stagePlan);
      return {
        ...node,
        stagePosition: {
          ...footprint,
          xFeet: Math.max(0, stageAnchor.xFeet + index * 3),
          yFeet: Math.max(0, stageAnchor.yFeet + index * 2),
        },
      };
    });
    setNodes((current) => [...current, ...stagedPlacement]);
    if (placement.edges.length) setEdges((current) => [...current, ...placement.edges]);
    setSelectedNodeId(placement.primaryNodeId);
    setSelectedStageNodeIds([placement.primaryNodeId]);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setSelectedAreaId(null);
    setStageLayoutOpen(false);
    setDirty(true);
    toast.success(stagedPlacement.length > 1 ? `${template.name} added as ${stagedPlacement.length} linked endpoints.` : `${template.name} added.`);
    if (focusPlacedNode) {
      window.requestAnimationFrame(() => {
        void reactFlowRef.current?.fitView({ nodes: stagedPlacement.map((node) => ({ id: node.id })), duration: 240, maxZoom: 1.1, padding: 0.35 });
      });
    }
  }, [setEdges, setNodes, setSelectedStageNodeIds, stagePlan]);

  const addTemplate = useCallback((template: EquipmentTemplate) => {
    const preferredPosition = reactFlowRef.current?.screenToFlowPosition({ x: window.innerWidth * 0.48, y: window.innerHeight * 0.48 }) ?? { x: 0, y: 0 };
    const rightEdge = nodes.length
      ? Math.max(...nodes.map((item) => item.position.x + (item.measured?.width ?? 288)))
      : preferredPosition.x - 96;
    const topEdge = nodes.length ? Math.min(...nodes.map((item) => item.position.y)) : preferredPosition.y;
    const stageAnchor = activeView === "stage" ? {
      xFeet: Math.max(0, preferredPosition.x / STAGE_PIXELS_PER_FOOT),
      yFeet: Math.max(0, preferredPosition.y / STAGE_PIXELS_PER_FOOT),
    } : undefined;
    placeTemplate(template, { x: rightEdge + 96, y: topEdge }, true, stageAnchor);
  }, [activeView, nodes, placeTemplate]);

  const dropTemplate = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const templateId = event.dataTransfer.getData(EQUIPMENT_TEMPLATE_DRAG_MIME) || event.dataTransfer.getData("text/plain");
    const template = templates.find((item) => item.id === templateId);
    setDraggedTemplate(null);
    if (!template) return;

    const pointerPosition = reactFlowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
    const position = {
      x: Math.round((pointerPosition.x - 60) / 16) * 16,
      y: Math.round((pointerPosition.y - 68) / 16) * 16,
    };
    const signalPosition = activeView === "signal" ? position : {
      x: nodes.length ? Math.max(...nodes.map((item) => item.position.x + (item.measured?.width ?? 288))) + 96 : 0,
      y: nodes.length ? Math.min(...nodes.map((item) => item.position.y)) : 0,
    };
    const stageAnchor = activeView === "stage" ? {
      xFeet: Math.max(0, pointerPosition.x / STAGE_PIXELS_PER_FOOT),
      yFeet: Math.max(0, pointerPosition.y / STAGE_PIXELS_PER_FOOT),
    } : undefined;
    placeTemplate(template, signalPosition, false, stageAnchor);
  }, [activeView, nodes, placeTemplate, templates]);

  const allowTemplateDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!draggedTemplate && !event.dataTransfer.types.includes(EQUIPMENT_TEMPLATE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [draggedTemplate]);

  const updateNodeData = useCallback((
    nodeId: string,
    data: EquipmentNodeData,
    options?: { reassignAssetFromNodeId?: string },
  ) => {
    if (data.fulfillment === "owned" && data.assignedAssetId) {
      const existingAssignment = findAssetAssignment(nodes, data.assignedAssetId, nodeId);
      if (existingAssignment && existingAssignment.nodeId !== options?.reassignAssetFromNodeId) {
        return `${data.assignedAssetLabel || "This asset"} is already being used in this setup by ${existingAssignment.nodeName}.`;
      }
    }
    const previous = nodes.find((node) => node.id === nodeId);
    const nextPortIds = new Set(data.ports.map((port) => port.id));
    const removedPortIds = previous?.data.ports.filter((port) => !nextPortIds.has(port.id)).map((port) => port.id) ?? [];
    const affectedEdges = edges.filter((edge) => removedPortIds.includes(edge.sourceHandle) || removedPortIds.includes(edge.targetHandle));
    if (affectedEdges.length && !window.confirm(`This removes ${affectedEdges.length} connected cable${affectedEdges.length === 1 ? "" : "s"}. Continue?`)) return "Changes were not applied.";
    const assemblyId = previous?.data.assemblyId;
    const reassignedFrom = options?.reassignAssetFromNodeId
      ? nodes.find((node) => node.id === options.reassignAssetFromNodeId)
      : undefined;
    const reassignedAssemblyId = reassignedFrom?.data.assemblyId;
    setNodes((current) => current.map((node) => {
      if (node.id === nodeId) return { ...node, data };
      if (assemblyId && node.data.assemblyId === assemblyId) return {
        ...node,
        data: {
          ...node.data,
          fulfillment: data.fulfillment,
          assignedAssetId: data.assignedAssetId,
          assignedAssetLabel: data.assignedAssetLabel,
          providerPartyId: data.providerPartyId,
          providerPartyName: data.providerPartyName,
        },
      };
      const isReassignedSource = node.id === options?.reassignAssetFromNodeId
        || Boolean(reassignedAssemblyId && node.data.assemblyId === reassignedAssemblyId);
      if (!isReassignedSource || node.data.assignedAssetId !== data.assignedAssetId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          assignedAssetId: undefined,
          assignedAssetLabel: undefined,
        },
      };
    }));
    if (affectedEdges.length) setEdges((current) => current.filter((edge) => !affectedEdges.some((removed) => removed.id === edge.id)));
    setDirty(true);
    return null;
  }, [edges, nodes, setEdges, setNodes]);

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    const willExpand = !nodes.find((node) => node.id === nodeId)?.data.isExpanded;
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, isExpanded: !node.data.isExpanded },
    } : node));
    setDirty(true);
    if (willExpand) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        void reactFlowRef.current?.fitView({ nodes: [{ id: nodeId }], duration: 220, maxZoom: 0.9, padding: 0.25 });
      }));
    }
  }, [nodes, setNodes]);

  const equipmentNodeActions = useMemo(() => ({ toggleExpanded: toggleNodeExpanded }), [toggleNodeExpanded]);

  const deleteNode = useCallback((nodeId: string) => {
    const selected = nodes.find((node) => node.id === nodeId);
    const assemblyNodeIds = new Set(selected?.data.assemblyId
      ? nodes.filter((node) => node.data.assemblyId === selected.data.assemblyId).map((node) => node.id)
      : [nodeId]);
    const connected = edges.filter((edge) => assemblyNodeIds.has(edge.source) || assemblyNodeIds.has(edge.target));
    const externalConnected = connected.filter((edge) => !edge.data.internalTransport);
    const subject = assemblyNodeIds.size > 1 ? `this snake and its ${assemblyNodeIds.size} endpoints` : "this node";
    if (connected.length && !window.confirm(`Remove ${subject}${externalConnected.length ? ` and ${externalConnected.length} connected cable${externalConnected.length === 1 ? "" : "s"}` : ""}?`)) return;
    setNodes((current) => current.filter((node) => !assemblyNodeIds.has(node.id)));
    setEdges((current) => current.filter((edge) => !assemblyNodeIds.has(edge.source) && !assemblyNodeIds.has(edge.target)));
    setSelectedNodeId(null);
    setSelectedStageNodeIds([]);
    setDirty(true);
  }, [edges, nodes, setEdges, setNodes, setSelectedStageNodeIds]);

  const beforeKeyboardDelete = useCallback<OnBeforeDelete<SetupNode, CableEdge>>(async ({ nodes: nodesToDelete, edges: edgesToDelete }) => {
    const assemblyIds = new Set(nodesToDelete.flatMap((node) => node.data.assemblyId ? [node.data.assemblyId] : []));
    if (!assemblyIds.size) return true;

    const expandedNodes = nodes.filter((node) => nodesToDelete.some((candidate) => candidate.id === node.id) || (node.data.assemblyId && assemblyIds.has(node.data.assemblyId)));
    const expandedNodeIds = new Set(expandedNodes.map((node) => node.id));
    const expandedEdges = edges.filter((edge) => (
      edgesToDelete.some((candidate) => candidate.id === edge.id)
      || expandedNodeIds.has(edge.source)
      || expandedNodeIds.has(edge.target)
    ));
    const externalCableTotal = expandedEdges.filter((edge) => !edge.data.internalTransport).length;
    const snakeLabel = assemblyIds.size === 1 ? "this snake" : `these ${assemblyIds.size} snakes`;
    const cableLabel = externalCableTotal ? ` and ${externalCableTotal} connected cable${externalCableTotal === 1 ? "" : "s"}` : "";
    if (!window.confirm(`Remove ${snakeLabel}${cableLabel}?`)) return false;
    return { nodes: expandedNodes, edges: expandedEdges };
  }, [edges, nodes]);

  const updateStageNodePosition = useCallback((nodeId: string, position: Required<StagePosition>) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, stagePosition: position } : node));
    setDirty(true);
  }, [setNodes]);

  const updateStageNodeSignalVisibility = useCallback((nodeId: string, visible: boolean) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, showInSignalView: visible },
    } : node));
    setDirty(true);
  }, [setNodes]);

  const updateStageDimensions = useCallback((widthFeet: number, depthFeet: number) => {
    const bounds = {
      widthFeet: Math.min(200, Math.max(4, widthFeet)),
      depthFeet: Math.min(200, Math.max(4, depthFeet)),
    };
    setNodes((current) => current.map((node) => ({
      ...node,
      stagePosition: stagePositionForNode(node, bounds),
    })));
    setStagePlan((current) => ({
      ...current,
      ...bounds,
      areas: current.areas.map((area) => constrainStageArea(area, bounds)),
      waypoints: current.waypoints.map((waypoint) => ({
        ...waypoint,
        position: {
          xFeet: Math.min(bounds.widthFeet, Math.max(0, waypoint.position.xFeet)),
          yFeet: Math.min(bounds.depthFeet, Math.max(0, waypoint.position.yFeet)),
        },
      })),
    }));
    setDirty(true);
  }, [setNodes]);

  const addStageArea = useCallback(() => {
    const widthFeet = Math.min(8, stagePlan.widthFeet);
    const depthFeet = Math.min(6, stagePlan.depthFeet);
    const area: StageArea = {
      id: createSetupId("area"),
      label: `Area ${stagePlan.areas.length + 1}`,
      xFeet: Math.max(0, (stagePlan.widthFeet - widthFeet) / 2),
      yFeet: Math.max(0, (stagePlan.depthFeet - depthFeet) / 2),
      widthFeet,
      depthFeet,
    };
    setStagePlan((current) => ({ ...current, areas: [...current.areas, area] }));
    setSelectedAreaId(area.id);
    setSelectedStageNodeIds([area.id]);
    setStageLayoutOpen(false);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setDirty(true);
    toast.success("Stage area added.");
  }, [setSelectedStageNodeIds, stagePlan.areas.length, stagePlan.depthFeet, stagePlan.widthFeet]);

  const updateStageArea = useCallback((area: StageArea) => {
    setStagePlan((current) => ({
      ...current,
      areas: current.areas.map((item) => item.id === area.id ? constrainStageArea(area, current) : item),
    }));
    setDirty(true);
  }, []);

  const deleteStageArea = useCallback((areaId: string) => {
    setStagePlan((current) => ({ ...current, areas: current.areas.filter((area) => area.id !== areaId) }));
    setSelectedAreaId(null);
    setSelectedStageNodeIds([]);
    setStageLayoutOpen(true);
    setDirty(true);
  }, [setSelectedStageNodeIds]);

  const addStageWaypoint = useCallback((edgeId?: string) => {
    const center = reactFlowRef.current?.screenToFlowPosition({ x: window.innerWidth * 0.54, y: window.innerHeight * 0.5 }) ?? { x: stagePlan.widthFeet * STAGE_PIXELS_PER_FOOT / 2, y: stagePlan.depthFeet * STAGE_PIXELS_PER_FOOT / 2 };
    const waypoint: StageWaypoint = {
      id: createSetupId("waypoint"),
      label: `Cord waypoint ${stagePlan.waypoints.length + 1}`,
      position: {
        xFeet: Math.max(0, center.x / STAGE_PIXELS_PER_FOOT),
        yFeet: Math.max(0, center.y / STAGE_PIXELS_PER_FOOT),
      },
    };
    setStagePlan((current) => ({ ...current, waypoints: [...current.waypoints, waypoint] }));
    if (edgeId) {
      setEdges((current) => current.map((edge) => edge.id === edgeId ? {
        ...edge,
        data: {
          ...edge.data,
          stageRoute: {
            ...stageRouteFor(edge),
            waypointIds: [...stageRouteFor(edge).waypointIds, waypoint.id],
          },
        },
      } : edge));
    } else {
      setSelectedWaypointId(waypoint.id);
      setSelectedAreaId(null);
      setSelectedStageNodeIds([]);
      setStageLayoutOpen(false);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
    setDirty(true);
    toast.success(edgeId ? "Waypoint added to this cord." : "Stage waypoint added.");
  }, [setEdges, setSelectedStageNodeIds, stagePlan.depthFeet, stagePlan.waypoints.length, stagePlan.widthFeet]);

  const toggleWaypointOnCable = useCallback((edgeId: string, waypointId: string) => {
    let added = false;
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const route = stageRouteFor(edge);
      const alreadyIncluded = route.waypointIds.includes(waypointId);
      added = !alreadyIncluded;
      return {
        ...edge,
        data: {
          ...edge.data,
          stageRoute: {
            ...route,
            waypointIds: alreadyIncluded
              ? route.waypointIds.filter((id) => id !== waypointId)
              : [...route.waypointIds, waypointId],
          },
        },
      };
    }));
    setDirty(true);
    toast.success(added ? "Waypoint added to cord route." : "Waypoint removed from cord route.");
  }, [setEdges]);

  const updateStageWaypoint = useCallback((waypoint: StageWaypoint) => {
    setStagePlan((current) => ({
      ...current,
      waypoints: current.waypoints.map((item) => item.id === waypoint.id ? waypoint : item),
    }));
    setDirty(true);
  }, []);

  const deleteStageWaypoint = useCallback((waypointId: string) => {
    const cableCount = edges.filter((edge) => edge.data.stageRoute?.waypointIds.includes(waypointId)).length;
    if (cableCount && !window.confirm(`Remove this waypoint from ${cableCount} cord route${cableCount === 1 ? "" : "s"}?`)) return;
    setStagePlan((current) => ({ ...current, waypoints: current.waypoints.filter((waypoint) => waypoint.id !== waypointId) }));
    setEdges((current) => current.map((edge) => edge.data.stageRoute?.waypointIds.includes(waypointId) ? {
      ...edge,
      data: {
        ...edge.data,
        stageRoute: {
          ...stageRouteFor(edge),
          waypointIds: stageRouteFor(edge).waypointIds.filter((id) => id !== waypointId),
        },
      },
    } : edge));
    setSelectedWaypointId(null);
    setDirty(true);
  }, [edges, setEdges]);

  const displayNodes = useMemo(() => withTransportChannelLabels(nodes, edges), [edges, nodes]);
  const signalDisplayNodes = useMemo(() => displayNodes.filter((node) => node.data.showInSignalView !== false), [displayNodes]);
  const signalNodeIds = useMemo(() => new Set(signalDisplayNodes.map((node) => node.id)), [signalDisplayNodes]);
  const signalDisplayEdges = useMemo(() => measuredEdges.filter((edge) => signalNodeIds.has(edge.source) && signalNodeIds.has(edge.target)), [measuredEdges, signalNodeIds]);
  const selectedEdge = measuredEdges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const stageCanvasNodes = useMemo<StageCanvasNode[]>(() => {
    const selectedRouteWaypointIds = selectedEdge?.data.stageRoute?.waypointIds ?? [];
    const floor: StageFloorCanvasNode = {
      id: "stage-floor",
      type: "stageFloor",
      position: { x: 0, y: 0 },
      data: { widthFeet: stagePlan.widthFeet, depthFeet: stagePlan.depthFeet },
      style: { width: stagePlan.widthFeet * STAGE_PIXELS_PER_FOOT, height: stagePlan.depthFeet * STAGE_PIXELS_PER_FOOT, pointerEvents: "none" },
      draggable: false,
      selectable: false,
      deletable: false,
      focusable: false,
      zIndex: -10,
    };
    const equipment = displayNodes.map((node): StageEquipmentCanvasNode => {
      const stagePosition = stagePositionForNode(node, stagePlan);
      const geometry = stageNodeGeometry(stagePosition);
      return {
        id: node.id,
        type: "stageEquipment",
        position: geometry.canvasPosition,
        data: { ...node.data, stagePosition },
        style: {
          width: geometry.boundingWidthPixels,
          height: geometry.boundingHeightPixels,
        },
        selected: selectedStageNodeIds.includes(node.id),
      };
    });
    const areas = stagePlan.areas.map((area): StageAreaCanvasNode => ({
      id: area.id,
      type: "stageArea",
      position: {
        x: area.xFeet * STAGE_PIXELS_PER_FOOT,
        y: area.yFeet * STAGE_PIXELS_PER_FOOT,
      },
      data: {
        label: area.label,
        widthFeet: area.widthFeet,
        depthFeet: area.depthFeet,
      },
      style: {
        width: area.widthFeet * STAGE_PIXELS_PER_FOOT,
        height: area.depthFeet * STAGE_PIXELS_PER_FOOT,
      },
      selected: selectedStageNodeIds.includes(area.id),
      zIndex: -5,
    }));
    const waypoints = stagePlan.waypoints.map((waypoint): StageWaypointCanvasNode => ({
      id: waypoint.id,
      type: "stageWaypoint",
      position: {
        x: waypoint.position.xFeet * STAGE_PIXELS_PER_FOOT - 20,
        y: waypoint.position.yFeet * STAGE_PIXELS_PER_FOOT - 20,
      },
      data: {
        label: waypoint.label,
        cableCount: waypointUsageCount(waypoint, measuredEdges),
        routeIndex: selectedRouteWaypointIds.includes(waypoint.id) ? selectedRouteWaypointIds.indexOf(waypoint.id) + 1 : undefined,
      },
      selected: waypoint.id === selectedWaypointId,
      selectable: false,
      zIndex: 4,
    }));
    return [floor, ...areas, ...equipment, ...(stageWaypointsVisible ? waypoints : [])];
  }, [displayNodes, measuredEdges, selectedEdge, selectedStageNodeIds, selectedWaypointId, stagePlan, stageWaypointsVisible]);
  const stageCanvasEdges = useMemo<StageCanvasCableEdge[]>(() => stageCablesVisible ? measuredEdges.map((edge) => ({
    ...edge,
    type: "stageCable",
    animated: false,
    selected: edge.id === selectedEdgeId,
    data: { ...edge.data, stageHovered: edge.id === hoveredEdgeId },
    zIndex: edge.id === selectedEdgeId ? 21 : edge.id === hoveredEdgeId ? 20 : edge.zIndex,
  })) : [], [hoveredEdgeId, measuredEdges, selectedEdgeId, stageCablesVisible]);
  const cableRows = useMemo(() => deriveCableRuns(displayNodes, measuredEdges), [displayNodes, measuredEdges]);
  const cableGroups = useMemo(() => groupCableRuns(cableRows), [cableRows]);
  const equipmentRows = useMemo(() => deriveEquipmentUsage(displayNodes), [displayNodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedWaypoint = stagePlan.waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null;
  const selectedArea = stagePlan.areas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedStageNodeIdSet = new Set(selectedStageNodeIds);
  const selectedStageEquipmentCount = displayNodes.filter((node) => selectedStageNodeIdSet.has(node.id)).length;
  const selectedStageAreaCount = stagePlan.areas.filter((area) => selectedStageNodeIdSet.has(area.id)).length;

  function selectNode(nodeId: string, openDialog = false) {
    setSelectedNodeId(nodeId);
    setSelectedStageNodeIds([nodeId]);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setSelectedAreaId(null);
    setStageLayoutOpen(false);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    if (openDialog) setNodeDialogOpen(true);
    void reactFlowRef.current?.fitView({ nodes: [{ id: nodeId }], duration: 240, maxZoom: 1.1, padding: 0.5 });
  }

  function selectEdge(edgeId: string) {
    if (edges.find((edge) => edge.id === edgeId)?.data.internalTransport) return;
    setHoveredEdgeId(null);
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setSelectedWaypointId(null);
    setSelectedAreaId(null);
    setSelectedStageNodeIds([]);
    setStageLayoutOpen(false);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
  }

  function selectStageArea(areaId: string) {
    setSelectedAreaId(areaId);
    setSelectedStageNodeIds([areaId]);
    setStageLayoutOpen(false);
    setHoveredEdgeId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }

  function openStageLayout() {
    setStageLayoutOpen(true);
    setSelectedAreaId(null);
    setSelectedStageNodeIds([]);
    setHoveredEdgeId(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }

  function toggleStageCables() {
    const nextVisible = !stageCablesVisible;
    setStageCablesVisible(nextVisible);
    if (nextVisible) return;
    setHoveredEdgeId(null);
    setSelectedEdgeId(null);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }

  function toggleStageWaypoints() {
    const nextVisible = !stageWaypointsVisible;
    setStageWaypointsVisible(nextVisible);
    if (!nextVisible) setSelectedWaypointId(null);
  }

  function switchWorkspaceView(nextView: SetupWorkspaceView) {
    if (nextView === activeView) return;
    const sharedNodeId = selectedNode && (nextView === "stage" || selectedNode.data.showInSignalView !== false) ? selectedNode.id : null;
    setActiveView(nextView);
    setHoveredEdgeId(null);
    setSelectedNodeId(sharedNodeId);
    setSelectedEdgeId(null);
    setSelectedWaypointId(null);
    setSelectedAreaId(null);
    setSelectedStageNodeIds(sharedNodeId ? [sharedNodeId] : []);
    setStageLayoutOpen(false);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === sharedNodeId })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
  }

  function assignCableInventory(edgeId: string, asset?: InventoryAsset) {
    setEdges((current) => current.map((edge) => edge.id === edgeId ? {
      ...edge,
      data: {
        ...edge.data,
        assignedInventoryAssetId: asset?.id,
        assignedInventoryLabel: asset ? cableInventoryAssignmentLabel(asset) : undefined,
        fulfillment: asset ? "owned" : edge.data.fulfillment === "owned" ? "unplanned" : edge.data.fulfillment,
      },
    } : edge));
    setDirty(true);
  }

  function autoAssignCableInventory(assignments: ReadonlyMap<string, InventoryAsset>) {
    setEdges((current) => current.map((edge) => {
      if (edge.data.internalTransport) return edge;
      const asset = assignments.get(edge.id);
      return {
        ...edge,
        data: {
          ...edge.data,
          assignedInventoryAssetId: asset?.id,
          assignedInventoryLabel: asset ? cableInventoryAssignmentLabel(asset) : undefined,
          fulfillment: asset ? "owned" : edge.data.fulfillment === "owned" ? "unplanned" : edge.data.fulfillment,
        },
      };
    }));
    setDirty(true);
    toast.success(`${assignments.size} cable${assignments.size === 1 ? "" : "s"} matched to on-hand inventory.`);
  }

  if (admin.loading || !admin.isAdmin) return null;

  if (loading) return (
    <AppShell variant="workspace">
      <Skeleton className="h-12 w-full" />
      <div className="grid min-h-[70dvh] grid-cols-[260px_1fr_350px] gap-2"><Skeleton /><Skeleton /><Skeleton /></div>
    </AppShell>
  );

  if (error || !metadata) return (
    <AppShell>
      <Empty><EmptyHeader><EmptyTitle>Could not open setup</EmptyTitle><EmptyDescription>{error ?? "Setup not found."}</EmptyDescription></EmptyHeader><Link href={setupsHref} className={buttonVariants({ variant: "outline" })}>Back to setups</Link></Empty>
    </AppShell>
  );

  return (
    <AppShell variant="workspace">
      <header className="setup-workspace-toolbar flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <Link href={setupsHref} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Back to setups"><ArrowLeftIcon /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{metadata.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{activeView === "stage" ? `${stagePlan.widthFeet} × ${stagePlan.depthFeet} ft · ${stagePlan.areas.length} area${stagePlan.areas.length === 1 ? "" : "s"} · ${stagePlan.waypoints.length} waypoint${stagePlan.waypoints.length === 1 ? "" : "s"}` : metadata.description || `${equipmentRows.length} equipment · ${externalCableCount(edges)} cables`}</p>
        </div>
        <ToggleGroup
          aria-label="Setup view"
          variant="outline"
          size="sm"
          spacing={0}
          value={[activeView]}
          onValueChange={(value) => {
            const nextView = value[0] as SetupWorkspaceView | undefined;
            if (nextView) switchWorkspaceView(nextView);
          }}
        >
          <ToggleGroupItem value="signal"><AudioLinesIcon data-icon="inline-start" />SIGNAL</ToggleGroupItem>
          <ToggleGroupItem value="stage"><MapIcon data-icon="inline-start" />STAGE</ToggleGroupItem>
        </ToggleGroup>
        <Badge variant={dirty ? "secondary" : "outline"}>{saving ? "Saving" : dirty ? "Unsaved" : `Saved · r${baseRevision}`}</Badge>
        {activeView === "stage" ? (
          <>
            <Button variant={stageLayoutOpen || selectedArea ? "secondary" : "outline"} size="sm" onClick={openStageLayout}>
              <LandPlotIcon data-icon="inline-start" />
              Stage layout
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={!stageCablesVisible}
              onClick={toggleStageCables}
            >
              {stageCablesVisible ? <EyeOffIcon data-icon="inline-start" /> : <CableIcon data-icon="inline-start" />}
              {stageCablesVisible ? "Hide cables" : "Show cables"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={!stageWaypointsVisible}
              onClick={toggleStageWaypoints}
            >
              {stageWaypointsVisible ? <EyeOffIcon data-icon="inline-start" /> : <MapPinIcon data-icon="inline-start" />}
              {stageWaypointsVisible ? "Hide waypoints" : "Show waypoints"}
            </Button>
            {stageWaypointsVisible ? (
              <Button variant="outline" size="sm" onClick={() => addStageWaypoint()}>
                <MapPinPlusIcon data-icon="inline-start" />
                Waypoint
              </Button>
            ) : null}
          </>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void reactFlowRef.current?.fitView({ duration: 240, padding: 0.15 })} disabled={!nodes.length}>
          <FocusIcon data-icon="inline-start" />
          Fit
        </Button>
        <Link href={gearHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <BoxesIcon data-icon="inline-start" />
          Gear
        </Link>
        <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          <SaveIcon data-icon="inline-start" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </header>

      <div className="setup-workspace-grid min-h-[calc(100dvh-12.5rem)] overflow-hidden rounded-lg border bg-card shadow-sm">
        <EquipmentLibrary
          templates={templates}
          onTemplateCreated={(template) => setTemplates((current) => [...current, template].sort((left, right) => left.name.localeCompare(right.name)))}
          onTemplateUpdated={(template) => {
            setTemplates((current) => current.map((item) => item.id === template.id ? template : item).sort((left, right) => left.name.localeCompare(right.name)));
            toast.success(`${template.name} definition updated. New nodes will use its latest ports.`);
          }}
          onTemplateArchived={(template) => {
            setTemplates((current) => current.filter((item) => item.id !== template.id));
            toast.success(`${template.name} removed from the equipment rack.`);
          }}
          onAdd={addTemplate}
          onDragStateChange={setDraggedTemplate}
        />
        <section
          className={cn("setup-flow-canvas relative min-h-[520px] bg-background", activeView === "stage" && "setup-stage-canvas", draggedTemplate && "setup-flow-canvas-drop-ready")}
          aria-label={activeView === "stage" ? "Setup stage plot canvas" : "Setup signal-flow canvas"}
          onPointerDownCapture={(event) => {
            if (activeView !== "stage" || !(event.target as Element).classList.contains("react-flow__pane")) return;
            additiveStageSelectionRef.current = event.shiftKey ? [...selectedStageNodeIdsRef.current] : null;
          }}
          onFocusCapture={(event) => {
            if (activeView !== "stage") return;
            const edgeId = (event.target as Element).closest<SVGGElement>(".react-flow__edge")?.dataset.id;
            if (edgeId && !edges.find((edge) => edge.id === edgeId)?.data.internalTransport) setHoveredEdgeId(edgeId);
          }}
          onBlurCapture={(event) => {
            if (activeView !== "stage") return;
            const edgeId = (event.target as Element).closest<SVGGElement>(".react-flow__edge")?.dataset.id;
            if (edgeId) setHoveredEdgeId((current) => current === edgeId ? null : current);
          }}
        >
          {activeView === "stage" ? (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border bg-card/95 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground shadow-sm" aria-hidden>
              Drag to select · Shift-drag adds · Space-drag pans
            </div>
          ) : null}
          {draggedTemplate ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm" aria-hidden>
              Drop to place {draggedTemplate.name}
            </div>
          ) : null}
          {activeView === "signal" ? (
            <EquipmentNodeActionsContext.Provider value={equipmentNodeActions}>
              <ReactFlow<SetupNode, CableEdge>
                key="signal"
                nodes={signalDisplayNodes}
                edges={signalDisplayEdges}
                onInit={(instance) => { reactFlowRef.current = instance as unknown as ReactFlowInstance; }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onBeforeDelete={beforeKeyboardDelete}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onReconnectStart={(_, edge) => {
                  reconnectingEdgeIdRef.current = edge.id;
                  reconnectValidationErrorRef.current = null;
                  selectEdge(edge.id);
                }}
                onReconnectEnd={(_, __, ___, connectionState) => {
                  if (connectionState.toHandle && connectionState.isValid === false) {
                    toast.error(reconnectValidationErrorRef.current ?? "That port cannot accept this cable.");
                  }
                  reconnectingEdgeIdRef.current = null;
                  reconnectValidationErrorRef.current = null;
                }}
                connectionRadius={30}
                isValidConnection={connectionIsValid}
                onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); setSelectedWaypointId(null); setSelectedAreaId(null); setSelectedStageNodeIds([]); setStageLayoutOpen(false); }}
                onNodeDoubleClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); setSelectedWaypointId(null); setSelectedAreaId(null); setSelectedStageNodeIds([]); setStageLayoutOpen(false); setNodeDialogOpen(true); }}
                onEdgeClick={(_, edge) => { if (!edge.data.internalTransport) selectEdge(edge.id); }}
                onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedWaypointId(null); setSelectedAreaId(null); setSelectedStageNodeIds([]); setStageLayoutOpen(false); }}
                onDragOver={allowTemplateDrop}
                onDrop={dropTemplate}
                onMoveEnd={(_, nextViewport) => { setViewport(nextViewport); if (loadedRef.current) setDirty(true); }}
                defaultViewport={viewport}
                minZoom={0.15}
                maxZoom={2}
                snapToGrid
                snapGrid={[16, 16]}
                fitView={!signalDisplayNodes.length}
                colorMode="light"
                deleteKeyCode={["Backspace", "Delete"]}
                defaultEdgeOptions={{ type: "signalCable", animated: true }}
                edgesReconnectable
                reconnectRadius={14}
                proOptions={{ hideAttribution: false }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="var(--border)" />
                <Controls position="bottom-left" />
                <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} />
              </ReactFlow>
            </EquipmentNodeActionsContext.Provider>
          ) : (
            <ReactFlow<StageCanvasNode, StageCanvasCableEdge>
              key="stage"
              nodes={stageCanvasNodes}
              edges={stageCanvasEdges}
              onInit={(instance) => { reactFlowRef.current = instance as unknown as ReactFlowInstance; }}
              nodeTypes={stageNodeTypes}
              edgeTypes={stageEdgeTypes}
              onNodesChange={onStageNodesChange}
              onSelectionEnd={() => {
                const retainedIds = additiveStageSelectionRef.current;
                additiveStageSelectionRef.current = null;
                if (retainedIds?.length) syncStageSelection([...retainedIds, ...selectedStageNodeIdsRef.current]);
              }}
              onNodeClick={(event, node) => {
                if (node.type === "stageFloor") {
                  openStageLayout();
                  return;
                }
                if (node.type === "stageArea") {
                  if (event.shiftKey) return;
                  selectStageArea(node.id);
                  return;
                }
                if (node.type === "stageWaypoint") {
                  if (selectedEdgeId) {
                    toggleWaypointOnCable(selectedEdgeId, node.id);
                  } else {
                    setSelectedWaypointId(node.id);
                    setSelectedAreaId(null);
                    setSelectedStageNodeIds([]);
                    setStageLayoutOpen(false);
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                  }
                  return;
                }
                if (event.shiftKey) return;
                setSelectedNodeId(node.id);
                setSelectedStageNodeIds([node.id]);
                setSelectedWaypointId(null);
                setSelectedEdgeId(null);
                setSelectedAreaId(null);
                setStageLayoutOpen(false);
              }}
              onNodeDoubleClick={(_, node) => {
                if (node.type !== "stageEquipment") return;
                setSelectedNodeId(node.id);
                setSelectedStageNodeIds([node.id]);
                setSelectedWaypointId(null);
                setSelectedEdgeId(null);
                setSelectedAreaId(null);
                setStageLayoutOpen(false);
                setNodeDialogOpen(true);
              }}
              onEdgeClick={(_, edge) => { if (!edge.data.internalTransport) selectEdge(edge.id); }}
              onEdgeMouseEnter={(_, edge) => { if (!edge.data.internalTransport) setHoveredEdgeId(edge.id); }}
              onEdgeMouseLeave={(_, edge) => setHoveredEdgeId((current) => current === edge.id ? null : current)}
              onPaneClick={() => { setHoveredEdgeId(null); setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedWaypointId(null); setSelectedAreaId(null); setSelectedStageNodeIds([]); setStageLayoutOpen(false); }}
              onDragOver={allowTemplateDrop}
              onDrop={dropTemplate}
              onMoveEnd={(_, nextViewport) => {
                setStagePlan((current) => ({ ...current, viewport: nextViewport }));
                if (loadedRef.current) setDirty(true);
              }}
              defaultViewport={stagePlan.viewport}
              minZoom={0.2}
              maxZoom={2}
              snapToGrid
              snapGrid={[STAGE_PIXELS_PER_FOOT / 2, STAGE_PIXELS_PER_FOOT / 2]}
              colorMode="light"
              nodesConnectable={false}
              edgesReconnectable={false}
              elevateNodesOnSelect={false}
              elementsSelectable
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              selectionKeyCode={null}
              multiSelectionKeyCode="Shift"
              panActivationKeyCode="Space"
              panOnDrag={[1, 2]}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Lines} gap={STAGE_PIXELS_PER_FOOT} size={1} color="var(--border)" />
              <Controls position="bottom-left" />
              <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} />
            </ReactFlow>
          )}
        </section>
        <aside className="setup-parts-panel flex min-h-0 flex-col border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div><h2 className="text-sm font-semibold">{activeView === "stage" ? "Placement & layout" : "Patch & equipment"}</h2><p className="text-xs text-muted-foreground">{activeView === "stage" ? "Select gear, an area, a cord, or a waypoint." : "Select a cable to edit it."}</p></div>
            {selectedEdge || selectedNode || selectedWaypoint || selectedArea || selectedStageNodeIds.length > 1 || stageLayoutOpen ? <Button variant="ghost" size="sm" onClick={() => { setSelectedEdgeId(null); setSelectedNodeId(null); setSelectedWaypointId(null); setSelectedAreaId(null); setSelectedStageNodeIds([]); setStageLayoutOpen(false); }}>Done</Button> : null}
          </div>
          {activeView === "stage" && selectedStageNodeIds.length > 1 ? (
            <StageMultiSelectionInspector
              equipmentCount={selectedStageEquipmentCount}
              areaCount={selectedStageAreaCount}
            />
          ) : activeView === "stage" && selectedEdge ? (
            <StageCableInspector
              edge={selectedEdge}
              waypoints={stagePlan.waypoints}
              onChange={(nextEdge) => { setEdges((current) => current.map((edge) => edge.id === nextEdge.id ? nextEdge : edge)); setDirty(true); }}
              onDelete={(edgeId) => { setEdges((current) => current.filter((edge) => edge.id !== edgeId)); setSelectedEdgeId(null); setDirty(true); }}
              onAddWaypoint={addStageWaypoint}
              onRemoveWaypoint={toggleWaypointOnCable}
            />
          ) : activeView === "stage" && selectedNode ? (
            <StageItemInspector
              node={selectedNode}
              stage={stagePlan}
              onPositionChange={(position) => updateStageNodePosition(selectedNode.id, position)}
              onSignalVisibilityChange={(visible) => updateStageNodeSignalVisibility(selectedNode.id, visible)}
              onEdit={() => setNodeDialogOpen(true)}
            />
          ) : activeView === "stage" && selectedWaypoint ? (
            <StageWaypointInspector
              waypoint={selectedWaypoint}
              cableCount={waypointUsageCount(selectedWaypoint, measuredEdges)}
              onChange={updateStageWaypoint}
              onDelete={deleteStageWaypoint}
            />
          ) : activeView === "stage" && selectedArea ? (
            <StageAreaInspector
              area={selectedArea}
              stage={stagePlan}
              onChange={updateStageArea}
              onDelete={deleteStageArea}
              onBack={openStageLayout}
            />
          ) : activeView === "stage" && stageLayoutOpen ? (
            <StageLayoutInspector
              stage={stagePlan}
              onDimensionsChange={updateStageDimensions}
              onAddArea={addStageArea}
              onAreaSelect={selectStageArea}
            />
          ) : (
            <PartsListPanel
              selectedEdge={activeView === "signal" ? selectedEdge : null}
              cableRows={cableRows}
              cableGroups={cableGroups}
              equipmentRows={equipmentRows}
              edges={measuredEdges}
              templates={templates}
              assets={assets}
              onCableChange={(nextEdge) => { setEdges((current) => current.map((edge) => edge.id === nextEdge.id ? nextEdge : edge)); setDirty(true); }}
              onCableDelete={(edgeId) => { setEdges((current) => current.filter((edge) => edge.id !== edgeId)); setSelectedEdgeId(null); setDirty(true); }}
              onCableSelect={selectEdge}
              hoveredEdgeId={activeView === "stage" ? hoveredEdgeId : null}
              onCableHoverChange={(edgeId) => { if (activeView === "stage") setHoveredEdgeId(edgeId); }}
              onEquipmentSelect={(nodeId) => selectNode(nodeId, true)}
              onCableInventoryAssign={assignCableInventory}
              onCableInventoryAutoAssign={autoAssignCableInventory}
            />
          )}
        </aside>
      </div>

      <EquipmentNodeDialog
        key={`${selectedNode?.id ?? "none"}-${nodeDialogOpen ? "open" : "closed"}`}
        node={selectedNode}
        setupId={setupId}
        templates={templates}
        assets={assets}
        parties={parties}
        locations={locations}
        setupNodes={nodes}
        open={nodeDialogOpen}
        onOpenChange={setNodeDialogOpen}
        onSave={updateNodeData}
        onDelete={deleteNode}
        onTemplateUpdated={(updatedTemplate) => {
          setTemplates((current) => current.map((template) => template.id === updatedTemplate.id ? updatedTemplate : template));
          setNodes((current) => current.map((node) => node.data.templateId === updatedTemplate.id ? {
            ...node,
            data: {
              ...node.data,
              templateVersion: updatedTemplate.version,
              ...(updatedTemplate.image ? { image: imageSnapshot(updatedTemplate.image) } : {}),
              ...(updatedTemplate.stageImage ? { stageImage: imageSnapshot(updatedTemplate.stageImage) } : {}),
            },
          } : node));
          setDirty(true);
        }}
        onAssetCreated={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
      />
    </AppShell>
  );
}

function imageSnapshot(image: NonNullable<EquipmentTemplate["image"]>) {
  return {
    storagePath: image.storagePath,
    downloadUrl: image.downloadUrl,
    contentType: image.contentType,
  };
}

function reconnectCableEndError(
  edge: CableEdge,
  connection: Connection,
  sourcePort: ReturnType<typeof validateConnection>["sourcePort"],
  targetPort: ReturnType<typeof validateConnection>["targetPort"],
) {
  const sourceChanged = connection.source !== edge.source || connection.sourceHandle !== edge.sourceHandle;
  if (sourceChanged && sourcePort) {
    const mating = cableEndMatesPort(edge.data.endA, sourcePort);
    if (!mating.valid) return `${connectorDescription(edge.data.endA)} does not fit the new ${connectorDescription(sourcePort.connector)} output.`;
  }

  const targetChanged = connection.target !== edge.target || connection.targetHandle !== edge.targetHandle;
  if (targetChanged && targetPort) {
    const mating = cableEndMatesPort(edge.data.endB, targetPort);
    if (!mating.valid) return `${connectorDescription(edge.data.endB)} does not fit the new ${connectorDescription(targetPort.connector)} input.`;
  }
  return undefined;
}

function connectorDescription(connector: CableEdge["data"]["endA"]) {
  return [connector.label, connector.gender === "none" ? null : connector.gender, connector.specification].filter(Boolean).join(" ");
}
