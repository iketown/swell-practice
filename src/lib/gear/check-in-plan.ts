import type {
  CheckInDestination,
  CheckInMethod,
  GearLocation,
  InventoryAsset,
  InventoryCheckIn,
  InventoryConnectionSet,
} from "@/lib/gear/domain";

export const CONTAINER_LOCATION_CONFIRMATION_MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_CONTAINER_NESTING_DEPTH = 5;

function placementSnapshotForAsset(
  assetId: string,
  assetsById: ReadonlyMap<string, InventoryAsset>,
  resolving = new Set<string>(),
): Pick<InventoryAsset, "effectiveLocationId" | "currentLocationId" | "locationInheritedFromAssetId" | "ancestorContainerIds"> {
  const asset = assetsById.get(assetId);
  if (!asset) return { locationInheritedFromAssetId: undefined, ancestorContainerIds: [] };
  if (resolving.has(assetId)) throw new Error("A container cannot be placed inside itself.");
  const placement = asset.currentPlacement;
  if (!placement) return { ancestorContainerIds: [] };
  if (placement.kind === "location") {
    return {
      effectiveLocationId: placement.locationId,
      currentLocationId: placement.locationId,
      locationInheritedFromAssetId: undefined,
      ancestorContainerIds: [],
    };
  }

  const container = assetsById.get(placement.containerAssetId);
  if (!container?.canContainAssets) throw new Error("The selected container no longer exists.");
  const nextResolving = new Set(resolving).add(assetId);
  const parentSnapshot = placementSnapshotForAsset(container.id, assetsById, nextResolving);
  const ancestorContainerIds = [container.id, ...(parentSnapshot.ancestorContainerIds ?? [])];
  if (ancestorContainerIds.length > MAX_CONTAINER_NESTING_DEPTH)
    throw new Error(`Containers can be nested up to ${MAX_CONTAINER_NESTING_DEPTH} levels deep.`);
  return {
    effectiveLocationId: parentSnapshot.effectiveLocationId,
    currentLocationId: parentSnapshot.effectiveLocationId,
    locationInheritedFromAssetId: container.id,
    ancestorContainerIds,
  };
}

export function withResolvedPlacementSnapshots(
  assets: readonly InventoryAsset[],
  directlyPlacedAssets: readonly InventoryAsset[],
  checkedInAt: number,
) {
  const directlyPlacedById = new Map(directlyPlacedAssets.map((asset) => [asset.id, asset]));
  const assetsById = new Map(assets.map((asset) => [asset.id, directlyPlacedById.get(asset.id) ?? asset]));
  const previousById = new Map(assets.map((asset) => [asset.id, asset]));
  const propagatedAssets: InventoryAsset[] = [];

  for (const asset of assetsById.values()) {
    const snapshot = placementSnapshotForAsset(asset.id, assetsById);
    const previous = previousById.get(asset.id) ?? asset;
    const changed = directlyPlacedById.has(asset.id)
      || snapshot.effectiveLocationId !== previous.effectiveLocationId
      || snapshot.currentLocationId !== previous.currentLocationId
      || snapshot.locationInheritedFromAssetId !== previous.locationInheritedFromAssetId
      || JSON.stringify(snapshot.ancestorContainerIds ?? []) !== JSON.stringify(previous.ancestorContainerIds ?? []);
    if (!changed) continue;
    const updated = { ...asset, ...snapshot, updatedAt: checkedInAt };
    assetsById.set(asset.id, updated);
    propagatedAssets.push(updated);
  }

  return {
    propagatedAssets,
    directlyPlacedAssets: directlyPlacedAssets.map((asset) => assetsById.get(asset.id) ?? asset),
  };
}

export function planInventoryCheckIn(
  assets: readonly InventoryAsset[],
  connectionSets: readonly InventoryConnectionSet[],
  locations: readonly GearLocation[],
  input: {
    sourceAssetIds: string[];
    destination: CheckInDestination;
    method: CheckInMethod;
    actorId: string;
    operationId: string;
    checkedInAt: number;
    notes?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  },
) {
  if (!input.sourceAssetIds.length) throw new Error("Choose at least one gear item to check in.");
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const expandedIds = new Set<string>();
  for (const id of input.sourceAssetIds) {
    const source = byId.get(id);
    if (!source) throw new Error("A selected gear item no longer exists.");
    const connectionSet = (source.connectionSetId
      ? connectionSets.find((item) => item.id === source.connectionSetId)
      : undefined) ?? connectionSets.find((item) => item.memberAssetIds.includes(id));
    for (const memberId of connectionSet?.memberAssetIds.length ? connectionSet.memberAssetIds : [id]) {
      if (!byId.has(memberId)) throw new Error("A connected gear item no longer exists.");
      expandedIds.add(memberId);
    }
  }
  const destinationLocationId = input.destination.kind === "location" ? input.destination.locationId : undefined;
  if (destinationLocationId && !locations.some((location) => location.id === destinationLocationId && location.status === "active"))
    throw new Error("The selected location no longer exists.");

  const affectedAssets = [...expandedIds].map((id) => byId.get(id)!);
  if (input.destination.kind === "container") {
    const container = byId.get(input.destination.containerAssetId);
    if (!container?.canContainAssets) throw new Error("Choose a registered container.");
    if (expandedIds.has(container.id) || container.ancestorContainerIds?.some((id) => expandedIds.has(id)))
      throw new Error("A container cannot be placed inside itself or one of its contents.");
    if (container.currentPlacement?.kind !== "location" || !container.effectiveLocationId || !container.lastPlacedAt)
      throw new Error("Check the container into a location before adding items.");
    if (input.checkedInAt - container.lastPlacedAt > CONTAINER_LOCATION_CONFIRMATION_MAX_AGE_MS)
      throw new Error("Confirm the container's current location before adding items.");
  }

  const checkIns: InventoryCheckIn[] = affectedAssets.map((asset) => ({
    id: `${input.operationId}-${asset.id}`,
    assetId: asset.id,
    destination: input.destination,
    locationId: input.destination.kind === "location" ? input.destination.locationId : undefined,
    method: input.method,
    actorId: input.actorId,
    operationId: input.operationId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    notes: input.notes?.trim() || undefined,
    checkedInAt: input.checkedInAt,
  }));
  const directlyPlacedAssets = affectedAssets.map((asset): InventoryAsset => ({
    ...asset,
    lifecycleStatus: "active",
    currentPlacement: input.destination,
    lastPlacedAt: input.checkedInAt,
    updatedAt: input.checkedInAt,
  }));
  return {
    operationId: input.operationId,
    checkIns,
    affectedAssetIds: [...expandedIds],
    ...withResolvedPlacementSnapshots(assets, directlyPlacedAssets, input.checkedInAt),
  };
}
