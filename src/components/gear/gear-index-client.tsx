"use client";

import {
  BoxesIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { GearAssetDialog } from "@/components/gear/gear-asset-dialog";
import { GearCheckInDialog } from "@/components/gear/gear-check-in-dialog";
import { GearDirectoryDialog } from "@/components/gear/gear-directory-dialog";
import { GearOrderDialog } from "@/components/gear/gear-order-dialog";
import { EquipmentTemplateDialog } from "@/components/setup-designer/equipment-template-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/hooks/use-admin";
import {
  lifecycleLabel,
  normalizeGearSearchText,
  paymentStatusLabel,
  purchaseOrderStatusLabel,
  type GearLocation,
  type GearParty,
  type InventoryAsset,
  type PurchaseOrder,
} from "@/lib/gear/domain";
import {
  listGearLocations,
  listGearParties,
  listInventoryAssets,
  listPurchaseOrders,
} from "@/lib/gear/repository";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { portGroupDisplayName, summarizePortGroups } from "@/lib/setup-designer/ports";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";

export function GearIndexClient({ initialQuery = "" }: { initialQuery?: string }) {
  const admin = useAdmin();
  const router = useRouter();
  const setupsHref = admin.isDemoAdmin ? "/setups?demo=1" : "/setups";
  const [definitions, setDefinitions] = useState<EquipmentTemplate[]>([]);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [parties, setParties] = useState<GearParty[]>([]);
  const [locations, setLocations] = useState<GearLocation[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [creatingDefinition, setCreatingDefinition] = useState(false);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetDialogLifecycle, setAssetDialogLifecycle] = useState<"planned" | "active">("planned");
  const [editingAsset, setEditingAsset] = useState<InventoryAsset | undefined>();
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | undefined>();
  const [checkingIn, setCheckingIn] = useState<InventoryAsset | null>(null);
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDefinitions, nextAssets, nextParties, nextLocations, nextOrders] = await Promise.all([
        listEquipmentTemplates(),
        listInventoryAssets(),
        listGearParties(),
        listGearLocations(),
        listPurchaseOrders(),
      ]);
      setDefinitions(nextDefinitions);
      setAssets(nextAssets);
      setParties(nextParties);
      setLocations(nextLocations);
      setOrders(nextOrders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the gear system.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.isAdmin) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [admin.isAdmin, refresh]);

  const normalizedQuery = normalizeGearSearchText(query);
  const definitionById = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const partyById = useMemo(() => new Map(parties.map((item) => [item.id, item])), [parties]);
  const locationById = useMemo(() => new Map(locations.map((item) => [item.id, item])), [locations]);
  const matchingDefinitions = useMemo(() => definitions.filter((item) => !normalizedQuery || [item.name, item.manufacturer, item.model, item.category].some((value) => normalizeGearSearchText(value ?? "").includes(normalizedQuery))), [definitions, normalizedQuery]);
  const matchingAssets = useMemo(() => assets.filter((item) => {
    const definition = definitionById.get(item.definitionId);
    return !normalizedQuery || [item.label, item.assetTag, item.serialNumber, definition?.name, definition?.manufacturer, definition?.model].some((value) => normalizeGearSearchText(value ?? "").includes(normalizedQuery));
  }), [assets, definitionById, normalizedQuery]);
  const activeAssets = matchingAssets.filter((item) => item.lifecycleStatus === "active");
  const purchaseQueue = matchingAssets.filter((item) => !["active", "retired", "cancelled"].includes(item.lifecycleStatus));
  const allPurchaseQueue = assets.filter((item) => !["active", "retired", "cancelled"].includes(item.lifecycleStatus));
  const inTransitCount = assets.filter((item) => item.lifecycleStatus === "in_transit").length;

  function beginCreateAsset(lifecycle: "planned" | "active") {
    setEditingAsset(undefined);
    setAssetDialogLifecycle(lifecycle);
    setAssetDialogOpen(true);
  }

  function beginEditAsset(asset: InventoryAsset) {
    setEditingAsset(asset);
    setAssetDialogLifecycle(asset.lifecycleStatus === "active" ? "active" : "planned");
    setAssetDialogOpen(true);
  }

  function beginOrder(order?: PurchaseOrder) {
    setEditingOrder(order);
    setOrderDialogOpen(true);
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <div className="p-5 sm:p-6">
            <p className="swell-page-kicker">Inventory and purchasing</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Gear</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              Define what equipment is, reserve assets before purchase, group them into orders, and check physical items into their first real location.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => beginCreateAsset("planned")}><PackagePlusIcon data-icon="inline-start" />Plan gear</Button>
              <Button variant="outline" onClick={() => beginCreateAsset("active")}><PackageCheckIcon data-icon="inline-start" />Register owned gear</Button>
              <Button variant="outline" onClick={() => setCreatingDefinition(true)}><PlusIcon data-icon="inline-start" />New definition</Button>
            </div>
          </div>
          <aside className="grid grid-cols-3 border-t bg-muted/35 lg:border-t-0 lg:border-l">
            <Metric label="On hand" value={assets.filter((item) => item.lifecycleStatus === "active").length} icon={PackageCheckIcon} />
            <Metric label="Purchase queue" value={assets.filter((item) => !["active", "retired", "cancelled"].includes(item.lifecycleStatus)).length} icon={ShoppingCartIcon} />
            <Metric label="In transit" value={inTransitCount} icon={TruckIcon} />
          </aside>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative min-w-0 flex-1 sm:max-w-md">
            <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, IDs, models, or serials..." className="pl-9" aria-label="Search gear" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPartyDialogOpen(true)}><UsersIcon data-icon="inline-start" />Owners</Button>
            <Button variant="outline" size="sm" onClick={() => setLocationDialogOpen(true)}><MapPinIcon data-icon="inline-start" />Locations</Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCwIcon data-icon="inline-start" />Refresh</Button>
            <Link href={setupsHref} className={buttonVariants({ variant: "outline", size: "sm" })}><BoxesIcon data-icon="inline-start" />Setups</Link>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2"><Skeleton className="h-12" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        ) : error ? (
          <Empty><EmptyHeader><EmptyTitle>Could not load gear</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader><Button variant="outline" onClick={() => void refresh()}>Try again</Button></Empty>
        ) : (
          <Tabs defaultValue="assets">
            <TabsList>
              <TabsTrigger value="assets">Assets <Badge variant="secondary">{assets.length}</Badge></TabsTrigger>
              <TabsTrigger value="definitions">Definitions <Badge variant="secondary">{definitions.length}</Badge></TabsTrigger>
              <TabsTrigger value="orders">Orders <Badge variant="secondary">{orders.length}</Badge></TabsTrigger>
            </TabsList>

            <TabsContent value="assets" className="flex flex-col gap-6 pt-4">
              <AssetSection
                title="Purchase queue"
                description="Permanent asset records that exist in the plan but are not yet checked into physical inventory."
                assets={purchaseQueue}
                definitions={definitionById}
                parties={partyById}
                locations={locationById}
                orders={orders}
                emptyTitle="Nothing waiting to be purchased"
                emptyDescription="Create planned gear from here or directly from a setup node."
                onEdit={beginEditAsset}
                onCheckIn={setCheckingIn}
              />
              <AssetSection
                title="On-hand inventory"
                description="Physical, QR-ready items with an owner and latest observed location."
                assets={activeAssets}
                definitions={definitionById}
                parties={partyById}
                locations={locationById}
                orders={orders}
                emptyTitle="No checked-in gear yet"
                emptyDescription="Register an owned item or check in something from the purchase queue."
                onEdit={beginEditAsset}
                onCheckIn={setCheckingIn}
              />
            </TabsContent>

            <TabsContent value="definitions" className="pt-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Reusable gear definitions</h2><p className="text-sm text-muted-foreground">AI-researched models, ports, icons, reference photos, and purchase sources.</p></div>
                <Button size="sm" onClick={() => setCreatingDefinition(true)}><PlusIcon data-icon="inline-start" />New definition</Button>
              </div>
              {matchingDefinitions.length ? (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {matchingDefinitions.map((definition) => {
                    const groups = summarizePortGroups(definition.ports);
                    const assetCount = assets.filter((asset) => asset.definitionId === definition.id).length;
                    return (
                      <article key={definition.id} className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center">
                        <span className="relative flex aspect-square overflow-hidden rounded-md border bg-muted">
                          {definition.image ? <Image src={definition.image.downloadUrl} alt="" fill sizes="64px" className="object-contain" unoptimized /> : <BoxesIcon className="m-auto size-5 text-muted-foreground" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold">{definition.name}</h3>
                          <p className="text-sm text-muted-foreground">{[definition.manufacturer, definition.model, definition.category].filter(Boolean).join(" · ")}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {groups.slice(0, 4).map((group) => <Badge key={[group.direction, group.connectorTypeId, group.gender, group.label].join("|")} variant="secondary">{portGroupDisplayName(group)}</Badge>)}
                            {groups.length > 4 ? <Badge variant="outline">+{groups.length - 4} port groups</Badge> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <Badge variant="outline">{assetCount} asset{assetCount === 1 ? "" : "s"}</Badge>
                          {definition.purchaseSource ? <a href={definition.purchaseSource.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>Source <ExternalLinkIcon data-icon="inline-end" /></a> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : <Empty><EmptyHeader><EmptyTitle>No matching definitions</EmptyTitle><EmptyDescription>Research a product page or create a model manually.</EmptyDescription></EmptyHeader><Button onClick={() => setCreatingDefinition(true)}><PlusIcon data-icon="inline-start" />Create definition</Button></Empty>}
            </TabsContent>

            <TabsContent value="orders" className="pt-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Purchase orders</h2><p className="text-sm text-muted-foreground">One vendor order can contain many reserved assets and one shared payment and shipment record.</p></div>
                <Button size="sm" onClick={() => beginOrder()} disabled={!allPurchaseQueue.length}><ShoppingCartIcon data-icon="inline-start" />New order</Button>
              </div>
              {orders.length ? (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {orders.map((order) => {
                    const quantity = order.lines.reduce((total, line) => total + line.quantity, 0);
                    return (
                      <article key={order.id} className="grid gap-4 border-b p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)_auto] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{order.vendor}</h3><Badge variant="secondary">{purchaseOrderStatusLabel(order.status)}</Badge><Badge variant="outline">{paymentStatusLabel(order.paymentStatus)}</Badge></div>
                          <p className="mt-1 text-sm text-muted-foreground">{quantity} item{quantity === 1 ? "" : "s"}{order.orderNumber ? ` · Order ${order.orderNumber}` : ""}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">{order.lines.map((line) => <Badge key={line.id} variant="outline">{line.quantity}× {line.description}</Badge>)}</div>
                        </div>
                        <div className="grid gap-1 text-sm text-muted-foreground">
                          <span>{order.trackingNumber ? `${order.carrier || "Tracking"}: ${order.trackingNumber}` : "No tracking number yet"}</span>
                          <span>{order.expectedArrivalDate ? `Expected ${formatDate(order.expectedArrivalDate)}` : "No expected date"}</span>
                          <span>{order.paidByPartyId ? `Paid by ${partyById.get(order.paidByPartyId)?.name ?? "recorded party"}${order.paymentAccountLabel ? ` · ${order.paymentAccountLabel}` : ""}` : "Payer not recorded"}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => beginOrder(order)}><PencilIcon data-icon="inline-start" />Edit order</Button>
                      </article>
                    );
                  })}
                </div>
              ) : <Empty><EmptyHeader><EmptyTitle>No purchase orders yet</EmptyTitle><EmptyDescription>Create planned assets first, then group them into a Sweetwater, backline, or local-store order.</EmptyDescription></EmptyHeader><Button onClick={() => beginOrder()} disabled={!allPurchaseQueue.length}><ShoppingCartIcon data-icon="inline-start" />Create first order</Button></Empty>}
            </TabsContent>
          </Tabs>
        )}
      </section>

      <EquipmentTemplateDialog open={creatingDefinition} onOpenChange={setCreatingDefinition} onCreated={(definition) => setDefinitions((current) => [...current, definition].sort((a, b) => a.name.localeCompare(b.name)))} />
      <GearAssetDialog
        key={`asset-${editingAsset?.id ?? "new"}-${assetDialogOpen ? "open" : "closed"}`}
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        definitions={definitions}
        assets={assets}
        parties={parties}
        locations={locations}
        asset={editingAsset}
        initialLifecycle={assetDialogLifecycle}
        onSaved={(saved) => {
          setAssets((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          toast.success(editingAsset ? "Gear asset updated." : saved.lifecycleStatus === "planned" ? "Planned gear added to the purchase queue." : "Physical gear registered.");
        }}
      />
      <GearOrderDialog
        key={`order-${editingOrder?.id ?? "new"}-${orderDialogOpen ? "open" : "closed"}`}
        open={orderDialogOpen}
        onOpenChange={setOrderDialogOpen}
        order={editingOrder}
        assets={assets}
        definitions={definitions}
        parties={parties}
        onSaved={() => { toast.success(editingOrder ? "Purchase order updated." : "Purchase order created."); void refresh(); }}
      />
      <GearCheckInDialog
        key={checkingIn?.id ?? "no-check-in"}
        open={Boolean(checkingIn)}
        onOpenChange={(open) => !open && setCheckingIn(null)}
        asset={checkingIn}
        locations={locations}
        actorId={admin.user?.uid ?? "demo-admin"}
        onCheckedIn={(assetId, locationId) => {
          setAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, lifecycleStatus: "active", currentLocationId: locationId, updatedAt: Date.now() } : asset));
          toast.success("Item checked in and added to location history.");
        }}
      />
      <GearDirectoryDialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen} kind="party" onPartyCreated={(party) => { setParties((current) => [...current, party].sort((a, b) => a.name.localeCompare(b.name))); toast.success("Owner or provider added."); }} />
      <GearDirectoryDialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen} kind="location" onLocationCreated={(location) => { setLocations((current) => [...current, location].sort((a, b) => a.name.localeCompare(b.name))); toast.success("Location added."); }} />
    </AppShell>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof PackageCheckIcon }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 border-r p-4 last:border-r-0 lg:p-5">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-mono text-2xl font-semibold tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function AssetSection({
  title,
  description,
  assets,
  definitions,
  parties,
  locations,
  orders,
  emptyTitle,
  emptyDescription,
  onEdit,
  onCheckIn,
}: {
  title: string;
  description: string;
  assets: InventoryAsset[];
  definitions: Map<string, EquipmentTemplate>;
  parties: Map<string, GearParty>;
  locations: Map<string, GearLocation>;
  orders: PurchaseOrder[];
  emptyTitle: string;
  emptyDescription: string;
  onEdit: (asset: InventoryAsset) => void;
  onCheckIn: (asset: InventoryAsset) => void;
}) {
  return (
    <section>
      <div className="mb-3"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>
      {assets.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {assets.map((asset) => {
            const definition = definitions.get(asset.definitionId);
            const owner = asset.ownerPartyId ? parties.get(asset.ownerPartyId) : undefined;
            const location = asset.currentLocationId ? locations.get(asset.currentLocationId) : undefined;
            const order = asset.purchaseOrderId ? orders.find((item) => item.id === asset.purchaseOrderId) : undefined;
            return (
              <article key={asset.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(12rem,0.7fr)_auto] md:items-center">
                <span className="relative flex aspect-square overflow-hidden rounded-md border bg-muted">
                  {asset.photos[0] ? <Image src={asset.photos[0].downloadUrl} alt="" fill sizes="56px" className="object-cover" unoptimized /> : definition?.image ? <Image src={definition.image.downloadUrl} alt="" fill sizes="56px" className="object-contain" unoptimized /> : <BoxesIcon className="m-auto size-4 text-muted-foreground" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{asset.label}</h3><Badge variant={asset.lifecycleStatus === "active" ? "secondary" : "outline"}>{lifecycleLabel(asset.lifecycleStatus)}</Badge></div>
                  <p className="truncate text-sm text-muted-foreground">{definition ? [definition.manufacturer, definition.model || definition.name].filter(Boolean).join(" · ") : "Missing gear definition"}</p>
                  <code className="mt-1 block text-xs text-muted-foreground">{asset.assetTag}</code>
                </div>
                <dl className="grid gap-1 text-sm">
                  <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-muted-foreground">Owner:</dt><dd className="min-w-0 truncate font-medium">{owner?.name ?? "Unassigned"}</dd></div>
                  <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-muted-foreground">Location:</dt><dd className="min-w-0 truncate font-medium">{location?.name ?? "Not checked in"}</dd></div>
                  {order ? <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 text-muted-foreground">Order:</dt><dd className="min-w-0 truncate font-medium">{order.vendor}</dd></div> : null}
                </dl>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button variant="outline" size="sm" onClick={() => onEdit(asset)}><PencilIcon data-icon="inline-start" />Edit</Button>
                  <Button size="sm" onClick={() => onCheckIn(asset)}><MapPinIcon data-icon="inline-start" />Check in</Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <Empty><EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader></Empty>}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
