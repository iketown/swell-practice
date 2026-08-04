"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnBeforeDelete,
  type Viewport,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { ArrowLeftIcon, BoxesIcon, FocusIcon, SaveIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { GearLocation, GearParty, InventoryAsset } from "@/lib/gear/domain";
import { listGearLocations, listGearParties, listInventoryAssets } from "@/lib/gear/repository";
import { findAssetAssignment } from "@/lib/setup-designer/asset-assignments";
import { CABLE_COLORS } from "@/lib/setup-designer/catalog";
import { cableEndMatesPort, matingCableEnd, validateConnection } from "@/lib/setup-designer/compatibility";
import {
  createSetupId,
  type CableEdge,
  type EquipmentNodeData,
  type EquipmentTemplate,
  type SetupGraph,
  type SetupMetadata,
  type SetupNode,
} from "@/lib/setup-designer/domain";
import { deriveCableRuns, deriveEquipmentUsage, groupCableRuns } from "@/lib/setup-designer/parts-list";
import { graphByteSize, normalizeSetupGraph, setupGraphFromData } from "@/lib/setup-designer/serialization";
import { externalCableCount, placementFromTemplate, withTransportChannelLabels } from "@/lib/setup-designer/snake-topology";
import {
  SetupRevisionConflictError,
  getSetupWorkspace,
  listEquipmentTemplates,
  saveSetupWorkspace,
} from "@/lib/setup-designer/repository";
import { cn } from "@/lib/utils";

const nodeTypes = { equipment: EquipmentNode };
const edgeTypes = { signalCable: SignalCableEdge };
const GRAPH_WARNING_BYTES = 750 * 1024;
const GRAPH_MAX_BYTES = 1024 * 1024;

export function SetupWorkspaceClient({ setupId }: { setupId: string }) {
  return (
    <ReactFlowProvider>
      <SetupWorkspace setupId={setupId} />
    </ReactFlowProvider>
  );
}

function SetupWorkspace({ setupId }: { setupId: string }) {
  const admin = useAdmin();
  const router = useRouter();
  const setupsHref = admin.isDemoAdmin ? "/setups?demo=1" : "/setups";
  const gearHref = admin.isDemoAdmin ? "/gear?demo=1" : "/gear";
  const reactFlow = useReactFlow<SetupNode, CableEdge>();
  const [nodes, setNodes, applyNodeChanges] = useNodesState<SetupNode>([]);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<CableEdge>([]);
  const [metadata, setMetadata] = useState<SetupMetadata | null>(null);
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [parties, setParties] = useState<GearParty[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [draggedTemplate, setDraggedTemplate] = useState<EquipmentTemplate | null>(null);
  const loadedRef = useRef(false);
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
        setNodes(graph.nodes);
        setEdges(graph.edges);
        setViewport(graph.viewport);
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
      const graph = normalizeSetupGraph({ nodes, edges, viewport, revision: baseRevision });
      window.localStorage.setItem(recoveryKey, JSON.stringify({ baseRevision, graph }));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [baseRevision, dirty, edges, nodes, recoveryKey, viewport]);

  useEffect(() => {
    const preventLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!metadata || saving || !dirty) return;
    const graph = normalizeSetupGraph({ nodes, edges, viewport, revision: baseRevision });
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
      setMetadata((current) => current ? { ...current, revision, nodeCount: deriveEquipmentUsage(nodes).length, cableCount: externalCableCount(edges), updatedAt: Date.now() } : current);
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
  }, [actorId, baseRevision, dirty, edges, metadata, nodes, recoveryKey, saving, setupId, viewport]);

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

  const onNodesChange = useCallback((changes: NodeChange<SetupNode>[]) => {
    applyNodeChanges(changes);
    if (changes.some((change) => change.type !== "select" && change.type !== "dimensions")) setDirty(true);
  }, [applyNodeChanges]);

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
    setDirty(true);
  }, [edges, nodes, setEdges]);

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
    setDirty(true);
    toast.success("Cable repatched.");
  }, [edges, nodes, setEdges]);

  const placeTemplate = useCallback((template: EquipmentTemplate, position: { x: number; y: number }, focusPlacedNode: boolean) => {
    const placement = placementFromTemplate(template, position.x, position.y);
    setNodes((current) => [...current, ...placement.nodes]);
    if (placement.edges.length) setEdges((current) => [...current, ...placement.edges]);
    setSelectedNodeId(placement.primaryNodeId);
    setSelectedEdgeId(null);
    setDirty(true);
    toast.success(placement.nodes.length > 1 ? `${template.name} added as ${placement.nodes.length} linked endpoints.` : `${template.name} added.`);
    if (focusPlacedNode) {
      window.requestAnimationFrame(() => {
        void reactFlow.fitView({ nodes: placement.nodes.map((node) => ({ id: node.id })), duration: 240, maxZoom: 1.1, padding: 0.35 });
      });
    }
  }, [reactFlow, setEdges, setNodes]);

  const addTemplate = useCallback((template: EquipmentTemplate) => {
    const preferredPosition = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.48, y: window.innerHeight * 0.48 });
    const rightEdge = nodes.length
      ? Math.max(...nodes.map((item) => item.position.x + (item.measured?.width ?? 288)))
      : preferredPosition.x - 96;
    const topEdge = nodes.length ? Math.min(...nodes.map((item) => item.position.y)) : preferredPosition.y;
    placeTemplate(template, { x: rightEdge + 96, y: topEdge }, true);
  }, [nodes, placeTemplate, reactFlow]);

  const dropTemplate = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const templateId = event.dataTransfer.getData(EQUIPMENT_TEMPLATE_DRAG_MIME) || event.dataTransfer.getData("text/plain");
    const template = templates.find((item) => item.id === templateId);
    setDraggedTemplate(null);
    if (!template) return;

    const pointerPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const position = {
      x: Math.round((pointerPosition.x - 60) / 16) * 16,
      y: Math.round((pointerPosition.y - 68) / 16) * 16,
    };
    placeTemplate(template, position, false);
  }, [placeTemplate, reactFlow, templates]);

  const allowTemplateDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!draggedTemplate && !event.dataTransfer.types.includes(EQUIPMENT_TEMPLATE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, [draggedTemplate]);

  const updateNodeData = useCallback((nodeId: string, data: EquipmentNodeData) => {
    if (data.fulfillment === "owned" && data.assignedAssetId) {
      const existingAssignment = findAssetAssignment(nodes, data.assignedAssetId, nodeId);
      if (existingAssignment) {
        return `${data.assignedAssetLabel || "This asset"} is already being used in this setup by ${existingAssignment.nodeName}.`;
      }
    }
    const previous = nodes.find((node) => node.id === nodeId);
    const nextPortIds = new Set(data.ports.map((port) => port.id));
    const removedPortIds = previous?.data.ports.filter((port) => !nextPortIds.has(port.id)).map((port) => port.id) ?? [];
    const affectedEdges = edges.filter((edge) => removedPortIds.includes(edge.sourceHandle) || removedPortIds.includes(edge.targetHandle));
    if (affectedEdges.length && !window.confirm(`This removes ${affectedEdges.length} connected cable${affectedEdges.length === 1 ? "" : "s"}. Continue?`)) return "Changes were not applied.";
    const assemblyId = previous?.data.assemblyId;
    setNodes((current) => current.map((node) => {
      if (node.id === nodeId) return { ...node, data };
      if (!assemblyId || node.data.assemblyId !== assemblyId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          fulfillment: data.fulfillment,
          assignedAssetId: data.assignedAssetId,
          assignedAssetLabel: data.assignedAssetLabel,
          assignedUnitId: data.assignedUnitId,
          assignedUnitLabel: data.assignedUnitLabel,
          providerPartyId: data.providerPartyId,
          providerPartyName: data.providerPartyName,
        },
      };
    }));
    if (affectedEdges.length) setEdges((current) => current.filter((edge) => !affectedEdges.some((removed) => removed.id === edge.id)));
    setDirty(true);
    return null;
  }, [edges, nodes, setEdges, setNodes]);

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    const willExpand = !reactFlow.getNode(nodeId)?.data.isExpanded;
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, isExpanded: !node.data.isExpanded },
    } : node));
    setDirty(true);
    if (willExpand) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        void reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 220, maxZoom: 0.9, padding: 0.25 });
      }));
    }
  }, [reactFlow, setNodes]);

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
    setDirty(true);
  }, [edges, nodes, setEdges, setNodes]);

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

  const displayNodes = useMemo(() => withTransportChannelLabels(nodes, edges), [edges, nodes]);
  const cableRows = useMemo(() => deriveCableRuns(displayNodes, edges), [displayNodes, edges]);
  const cableGroups = useMemo(() => groupCableRuns(cableRows), [cableRows]);
  const equipmentRows = useMemo(() => deriveEquipmentUsage(displayNodes), [displayNodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  function selectNode(nodeId: string, openDialog = false) {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    if (openDialog) setNodeDialogOpen(true);
    void reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 240, maxZoom: 1.1, padding: 0.5 });
  }

  function selectEdge(edgeId: string) {
    if (edges.find((edge) => edge.id === edgeId)?.data.internalTransport) return;
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
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
          <p className="truncate text-xs text-muted-foreground">{metadata.description || `${equipmentRows.length} equipment · ${externalCableCount(edges)} cables`}</p>
        </div>
        <Badge variant={dirty ? "secondary" : "outline"}>{saving ? "Saving" : dirty ? "Unsaved" : `Saved · r${baseRevision}`}</Badge>
        <Button variant="outline" size="sm" onClick={() => void reactFlow.fitView({ duration: 240, padding: 0.15 })} disabled={!nodes.length}>
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
          className={cn("setup-flow-canvas relative min-h-[520px] bg-background", draggedTemplate && "setup-flow-canvas-drop-ready")}
          aria-label="Setup signal-flow canvas"
        >
          {draggedTemplate ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm" aria-hidden>
              Drop to place {draggedTemplate.name}
            </div>
          ) : null}
          <EquipmentNodeActionsContext.Provider value={equipmentNodeActions}>
          <ReactFlow<SetupNode, CableEdge>
            nodes={displayNodes}
            edges={edges}
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
            onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
            onNodeDoubleClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); setNodeDialogOpen(true); }}
            onEdgeClick={(_, edge) => { if (!edge.data.internalTransport) selectEdge(edge.id); }}
            onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
            onDragOver={allowTemplateDrop}
            onDrop={dropTemplate}
            onMoveEnd={(_, nextViewport) => { setViewport(nextViewport); if (loadedRef.current) setDirty(true); }}
            defaultViewport={viewport}
            minZoom={0.15}
            maxZoom={2}
            snapToGrid
            snapGrid={[16, 16]}
            fitView={!nodes.length}
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
        </section>
        <aside className="setup-parts-panel flex min-h-0 flex-col border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div><h2 className="text-sm font-semibold">Patch & equipment</h2><p className="text-xs text-muted-foreground">Select a cable to edit it.</p></div>
            {selectedEdge ? <Button variant="ghost" size="sm" onClick={() => setSelectedEdgeId(null)}>Done</Button> : null}
          </div>
          <PartsListPanel
            selectedEdge={selectedEdge}
            cableRows={cableRows}
            cableGroups={cableGroups}
            equipmentRows={equipmentRows}
            onCableChange={(nextEdge) => { setEdges((current) => current.map((edge) => edge.id === nextEdge.id ? nextEdge : edge)); setDirty(true); }}
            onCableDelete={(edgeId) => { setEdges((current) => current.filter((edge) => edge.id !== edgeId)); setSelectedEdgeId(null); setDirty(true); }}
            onCableSelect={selectEdge}
            onEquipmentSelect={(nodeId) => selectNode(nodeId, true)}
          />
        </aside>
      </div>

      <EquipmentNodeDialog
        key={`${selectedNode?.id ?? "none"}-${nodeDialogOpen ? "open" : "closed"}`}
        node={selectedNode}
        setupId={setupId}
        gearHref={gearHref}
        templates={templates}
        assets={assets}
        parties={parties}
        locations={locations}
        setupNodes={nodes}
        open={nodeDialogOpen}
        onOpenChange={setNodeDialogOpen}
        onSave={updateNodeData}
        onDelete={deleteNode}
        onTemplateUpdated={(updatedTemplate) => setTemplates((current) => current.map((template) => template.id === updatedTemplate.id ? updatedTemplate : template))}
        onAssetCreated={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
      />
    </AppShell>
  );
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
