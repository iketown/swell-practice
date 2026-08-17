"use client";

import { ExternalLinkIcon, SaveIcon, ShoppingCartIcon } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_STATUS_OPTIONS,
  PURCHASE_ORDER_STATUS_OPTIONS,
  createGearId,
  lifecycleLabel,
  type GearParty,
  type InventoryAsset,
  type PaymentStatus,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/gear/domain";
import { savePurchaseOrder } from "@/lib/gear/repository";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

export function GearOrderDialog({
  open,
  onOpenChange,
  order,
  assets,
  definitions,
  parties,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: PurchaseOrder;
  assets: InventoryAsset[];
  definitions: EquipmentTemplate[];
  parties: GearParty[];
  onSaved: (order: PurchaseOrder) => void;
}) {
  const [vendor, setVendor] = useState(order?.vendor ?? "");
  const [vendorUrl, setVendorUrl] = useState(order?.vendorUrl ?? "");
  const [status, setStatus] = useState<PurchaseOrderStatus>(order?.status ?? "cart");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(order?.paymentStatus ?? "not_paid");
  const [orderedByPartyId, setOrderedByPartyId] = useState(order?.orderedByPartyId ?? "");
  const [paidByPartyId, setPaidByPartyId] = useState(order?.paidByPartyId ?? "");
  const [paymentAccountLabel, setPaymentAccountLabel] = useState(order?.paymentAccountLabel ?? "");
  const [orderNumber, setOrderNumber] = useState(order?.orderNumber ?? "");
  const [carrier, setCarrier] = useState(order?.carrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber ?? "");
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(order?.expectedArrivalDate ?? "");
  const [orderedDate, setOrderedDate] = useState(order?.orderedDate ?? "");
  const [shippedDate, setShippedDate] = useState(order?.shippedDate ?? "");
  const [receivedDate, setReceivedDate] = useState(order?.receivedDate ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set(order?.lines.flatMap((line) => line.assetIds) ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingAssetIds = useMemo(() => new Set(order?.lines.flatMap((line) => line.assetIds) ?? []), [order]);
  const eligibleAssets = useMemo(() => assets.filter((asset) => {
    if (existingAssetIds.has(asset.id)) return true;
    if (asset.purchaseOrderId && asset.purchaseOrderId !== order?.id) return false;
    return !["active", "retired", "cancelled"].includes(asset.lifecycleStatus);
  }), [assets, existingAssetIds, order?.id]);

  function toggleAsset(assetId: string, checked: boolean) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (checked) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }

  function buildLines(): PurchaseOrderLine[] {
    const groups = new Map<string, InventoryAsset[]>();
    for (const asset of assets) {
      if (!selectedAssetIds.has(asset.id)) continue;
      const groupKey = asset.definitionId ? `definition:${asset.definitionId}` : `asset:${asset.id}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), asset]);
    }
    return Array.from(groups.values()).map((groupedAssets) => {
      const definitionId = groupedAssets[0]?.definitionId ?? "";
      const definition = definitions.find((item) => item.id === definitionId);
      const existingLine = definitionId
        ? order?.lines.find((line) => line.definitionId === definitionId)
        : order?.lines.find((line) => line.assetIds.includes(groupedAssets[0]?.id ?? ""));
      return {
        id: existingLine?.id ?? createGearId("line"),
        definitionId,
        description: definition?.name ?? groupedAssets[0]?.label ?? "Gear",
        quantity: groupedAssets.length,
        assetIds: groupedAssets.map((asset) => asset.id),
        productUrl: definition?.purchaseSource?.url,
        unitPrice: definition?.purchaseSource?.priceAmount,
        currency: definition?.purchaseSource?.priceCurrency,
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vendor.trim() || !selectedAssetIds.size || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await savePurchaseOrder({
        id: order?.id,
        vendor,
        vendorUrl,
        status,
        paymentStatus,
        orderedByPartyId: orderedByPartyId || undefined,
        paidByPartyId: paidByPartyId || undefined,
        paymentAccountLabel,
        orderNumber,
        carrier,
        trackingNumber,
        expectedArrivalDate: expectedArrivalDate || undefined,
        orderedDate: orderedDate || undefined,
        shippedDate: shippedDate || undefined,
        receivedDate: receivedDate || undefined,
        notes,
        lines: buildLines(),
        createdAt: order?.createdAt,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this purchase order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{order ? `Edit ${order.vendor} order` : "Create purchase order"}</DialogTitle>
          <DialogDescription>Group planned assets into one vendor order, then track payment, shipping, delivery, and receiving.</DialogDescription>
        </DialogHeader>

        <form id="gear-order-form" onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="gear-order-vendor">Vendor</FieldLabel>
              <Input id="gear-order-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Sweetwater" required disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-url">Vendor or cart URL</FieldLabel>
              <Input id="gear-order-url" type="url" value={vendorUrl} onChange={(event) => setVendorUrl(event.target.value)} placeholder="https://www.sweetwater.com/..." disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-status">Order status</FieldLabel>
              <Select value={status} onValueChange={(value) => value && setStatus(value as PurchaseOrderStatus)} disabled={saving}>
                <SelectTrigger id="gear-order-status" className="w-full">
                  <SelectValue>{PURCHASE_ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Choose status"}</SelectValue>
                </SelectTrigger>
                <SelectContent><SelectGroup>
                  {PURCHASE_ORDER_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-payment-status">Payment status</FieldLabel>
              <Select value={paymentStatus} onValueChange={(value) => value && setPaymentStatus(value as PaymentStatus)} disabled={saving}>
                <SelectTrigger id="gear-order-payment-status" className="w-full">
                  <SelectValue>{PAYMENT_STATUS_OPTIONS.find((option) => option.value === paymentStatus)?.label ?? "Choose payment status"}</SelectValue>
                </SelectTrigger>
                <SelectContent><SelectGroup>
                  {PAYMENT_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-4 rounded-lg border bg-muted/25 p-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="gear-order-placed-by">Order placed by</FieldLabel>
              <PartySelect id="gear-order-placed-by" value={orderedByPartyId} onChange={setOrderedByPartyId} parties={parties} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-paid-by">Paid by</FieldLabel>
              <PartySelect id="gear-order-paid-by" value={paidByPartyId} onChange={setPaidByPartyId} parties={parties} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-account">Payment account</FieldLabel>
              <Input id="gear-order-account" value={paymentAccountLabel} onChange={(event) => setPaymentAccountLabel(event.target.value)} placeholder="Band Amex" disabled={saving} />
              <FieldDescription>Store a friendly label only—never card or bank credentials.</FieldDescription>
            </Field>
          </FieldGroup>

          <FieldGroup className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="gear-order-number">Order number</FieldLabel>
              <Input id="gear-order-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-date">Order date</FieldLabel>
              <Input id="gear-order-date" type="date" value={orderedDate} onChange={(event) => setOrderedDate(event.target.value)} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-expected">Expected arrival</FieldLabel>
              <Input id="gear-order-expected" type="date" value={expectedArrivalDate} onChange={(event) => setExpectedArrivalDate(event.target.value)} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-carrier">Carrier</FieldLabel>
              <Input id="gear-order-carrier" value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="UPS" disabled={saving} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="gear-order-tracking">Tracking number</FieldLabel>
              <Input id="gear-order-tracking" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-shipped">Shipped date</FieldLabel>
              <Input id="gear-order-shipped" type="date" value={shippedDate} onChange={(event) => setShippedDate(event.target.value)} disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-order-received">Received date</FieldLabel>
              <Input id="gear-order-received" type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} disabled={saving} />
            </Field>
          </FieldGroup>

          <FieldGroup className="rounded-lg border p-4">
            <Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <FieldLabel>Assets in this order</FieldLabel>
                  <FieldDescription>Select the already-reserved asset records. Matching models are grouped into line items when saved.</FieldDescription>
                </div>
                <Badge variant="secondary">{selectedAssetIds.size} selected</Badge>
              </div>
            </Field>
            {eligibleAssets.length ? (
              <FieldGroup className="grid gap-2 sm:grid-cols-2">
                {eligibleAssets.map((asset) => {
                  const definition = definitions.find((item) => item.id === asset.definitionId);
                  const id = `gear-order-asset-${asset.id}`;
                  return (
                    <Field key={asset.id} orientation="horizontal" className="rounded-md border bg-background p-3">
                      <Checkbox id={id} checked={selectedAssetIds.has(asset.id)} onCheckedChange={(checked) => toggleAsset(asset.id, checked === true)} disabled={saving} />
                      <FieldLabel htmlFor={id} className="min-w-0 flex-1">
                        <span className="block truncate">{asset.label}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">{definition
                          ? `${[definition.manufacturer, definition.model || definition.name].filter(Boolean).join(" ")} · ${lifecycleLabel(asset.lifecycleStatus)}`
                          : `No reusable definition · ${lifecycleLabel(asset.lifecycleStatus)}`}</span>
                        {definition?.purchaseSource ? (
                          <a href={definition.purchaseSource.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-normal underline underline-offset-4" onClick={(event) => event.stopPropagation()}>
                            Product source <ExternalLinkIcon aria-hidden />
                          </a>
                        ) : null}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            ) : (
              <Empty className="border-0 py-8"><EmptyHeader><EmptyTitle>No planned assets available</EmptyTitle><EmptyDescription>Create planned gear first, then group it into an order.</EmptyDescription></EmptyHeader></Empty>
            )}
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="gear-order-notes">Order notes</FieldLabel>
            <Textarea id="gear-order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Call the rep, combine shipping, or confirm theater delivery instructions." rows={3} disabled={saving} />
          </Field>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="gear-order-form" disabled={saving || !vendor.trim() || !selectedAssetIds.size}>
            {order ? <SaveIcon data-icon="inline-start" /> : <ShoppingCartIcon data-icon="inline-start" />}
            {saving ? "Saving..." : order ? "Save order" : "Create order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartySelect({ id, value, onChange, parties, disabled }: { id: string; value: string; onChange: (value: string) => void; parties: GearParty[]; disabled: boolean }) {
  return (
    <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" || !next ? "" : next)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{value ? parties.find((party) => party.id === value)?.name ?? "Unknown party" : "Not recorded"}</SelectValue>
      </SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="none">Not recorded</SelectItem>
        {parties.map((party) => <SelectItem key={party.id} value={party.id}>{party.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  );
}
