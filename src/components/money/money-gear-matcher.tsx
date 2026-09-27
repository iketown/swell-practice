"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { MoneySelect } from "@/components/money/money-field";
import { formatCableLength, normalizeGearSearchText, type InventoryAsset } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import type { EntryInput, Person } from "@/lib/money/domain";
import type { GearChoicePlan } from "@/lib/money/gear-match";
import type { GearLineReview } from "@/lib/money/gear-review";

function GearSearch({ id, label, assets, definitions, excluded, transferOwnership, onSelect }: {
  id: string;
  label: string;
  assets: InventoryAsset[];
  definitions: EquipmentTemplate[];
  excluded: Set<string>;
  transferOwnership: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const definitionsById = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const matches = useMemo(() => {
    const terms = query.trim().split(/\s+/).map(normalizeGearSearchText).filter(Boolean);
    if (!terms.length) return [];
    return assets.filter((asset) => {
      if (excluded.has(asset.id)) return false;
      const template = definitionsById.get(asset.definitionId);
      const feet = asset.cableLengthInches ? asset.cableLengthInches / 12 : 0;
      const lengths = feet ? `${feet}ft ${feet} foot` : "";
      const haystack = normalizeGearSearchText(`${asset.assetTag} ${asset.label} ${template?.name || ""} ${template?.model || ""} ${asset.cableManufacturer || ""} ${lengths}`);
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 12);
  }, [assets, definitionsById, excluded, query]);
  return (
    <div className="space-y-2">
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, name, or model" className="pl-9" autoComplete="off" />
        </div>
      </Field>
      {query.trim() ? (
        <div className="max-h-52 overflow-y-auto rounded-md border bg-background" role="list" aria-label={`${label} results`}>
          {matches.length ? matches.map((asset) => {
            const template = definitionsById.get(asset.definitionId);
            const personalOwner = transferOwnership && asset.ownerPartyId && asset.ownerPartyId !== "party-the-swell"
              ? asset.ownerPartyId === "party-ike" ? "Ike" : asset.ownerPartyId === "party-cron" ? "Chris" : "another owner"
              : "";
            return (
              <div key={asset.id} role="listitem" className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold tabular-nums">{asset.assetTag}</span>
                  <span className="ml-2 text-sm">{asset.label}</span>
                  {template?.model || asset.cableLengthInches || asset.cableManufacturer ? (
                    <p className="text-xs text-muted-foreground">
                      {[template?.model, asset.cableLengthInches ? formatCableLength(asset.cableLengthInches) : "", asset.cableManufacturer].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {personalOwner ? <p className="text-xs text-amber-700 dark:text-amber-400">Owned by {personalOwner}; linking this purchase transfers ownership to The Swell.</p> : null}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => onSelect(asset.id)}>
                  {personalOwner ? "Link & transfer" : "Link"}
                </Button>
              </div>
            );
          }) : <p className="px-3 py-3 text-sm text-muted-foreground">No available gear matches. Try another term or create new gear.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function MoneyGearMatcher({
  lines, reviews, additionalAssetIds, lockedAssetIds, assets, definitions, plan, kind, person,
  onLinesChange, onReviewsChange, onAdditionalChange, onTouched,
}: {
  lines: EntryInput["gear"];
  reviews: GearLineReview[];
  additionalAssetIds: string[];
  lockedAssetIds: string[];
  assets: InventoryAsset[];
  definitions: EquipmentTemplate[];
  plan?: GearChoicePlan;
  kind: "purchase" | "loaned_gear";
  person: Person;
  onLinesChange: (lines: EntryInput["gear"]) => void;
  onReviewsChange: (reviews: GearLineReview[]) => void;
  onAdditionalChange: (ids: string[]) => void;
  onTouched: () => void;
}) {
  const available = assets.filter((asset) => !asset.moneyEntryId && /^\d{4}$/.test(asset.assetTag) &&
    !["retired", "cancelled", "planned", "cart"].includes(asset.lifecycleStatus) &&
    (!asset.purchaseOrderId || asset.purchaseOrderId === plan?.orderId) &&
    (kind === "purchase"
      ? true
      : !asset.ownerPartyId || asset.ownerPartyId === (person === "ike" ? "party-ike" : "party-cron")));
  const used = new Set([...additionalAssetIds, ...reviews.flatMap((review) => review.assetIds)]);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const setReview = (index: number, review: GearLineReview) => {
    onReviewsChange(reviews.map((item, itemIndex) => itemIndex === index ? review : item));
    onTouched();
  };
  const linkedCount = additionalAssetIds.length + reviews.reduce((count, review) => count + (review.reviewed ? review.assetIds.length : 0), 0);
  const suggestedCount = reviews.reduce((count, review) => count + (!review.reviewed && review.suggested ? review.assetIds.length : 0), 0);
  const pendingLinkedCount = reviews.reduce((count, review) => count + (!review.reviewed && !review.suggested ? review.assetIds.length : 0), 0);
  const newCount = lines.reduce((count, line, index) => count + (reviews[index]?.reviewed ? Math.max(0, line.quantity - reviews[index].assetIds.length) : 0), 0);
  const unresolvedCount = lines.reduce((count, line, index) => count + (reviews[index]?.reviewed ? 0 : line.quantity), 0);
  const reviewedLineCount = lines.filter((_, index) => reviews[index]?.reviewed).length;
  return (
    <FieldGroup>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Gear on this receipt</h3>
          <p className="text-sm text-muted-foreground">Review each item Ronnie found. Link an existing code or create a new record for the remaining quantity.{lines.length ? <span className="ml-1 font-medium">{reviewedLineCount} of {lines.length} reviewed.</span> : null}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => {
          onLinesChange([...lines, { label: "", quantity: 1, isCable: false, definitionId: "", manufacturer: "" }]);
          onReviewsChange([...reviews, { assetIds: [], reviewed: false, suggested: false }]);
          onTouched();
        }}>Add receipt item</Button>
      </div>
      {!lines.length && !additionalAssetIds.length ? (
        <p className="text-sm text-muted-foreground">No gear is linked. Leave this section empty for clothing, meals, services, and other non-gear expenses.</p>
      ) : null}
      {lines.map((line, index) => {
        const review = reviews[index] || { assetIds: [], reviewed: false, suggested: false };
        const suggestions = plan?.lines.find((item) => item.lineIndex === index)?.candidates || [];
        const status = review.reviewed
          ? review.assetIds.length < line.quantity ? "New gear approved" : "Accepted"
          : "Needs review";
        return (
          <div key={index} data-review-state={review.reviewed ? "complete" : "pending"} className="money-review-row space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Receipt item {index + 1}</p>
              <span className="money-review-status inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold" role="status">
                {review.reviewed ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
                {status}
              </span>
            </div>
            {!review.reviewed ? <p className="text-xs text-muted-foreground">{review.suggested || suggestions.length ? "Check Ronnie’s suggested gear codes, or choose another match." : "Find existing gear or approve new records."}</p> : null}
            <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_auto]">
              <Field>
                <FieldLabel htmlFor={`gear-label-${index}`}>Item name</FieldLabel>
                <Input id={`gear-label-${index}`} value={line.label} required placeholder="XLR cable" onChange={(event) => {
                  onLinesChange(lines.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item));
                  setReview(index, { ...review, reviewed: false, suggested: false });
                  onTouched();
                }} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`gear-count-${index}`}>Quantity</FieldLabel>
                <Input id={`gear-count-${index}`} type="number" min={1} max={100} required value={line.quantity} onChange={(event) => {
                  const quantity = Number(event.target.value);
                  onLinesChange(lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity } : item));
                  setReview(index, { ...review, assetIds: review.assetIds.slice(0, Math.max(0, quantity)), reviewed: false, suggested: false });
                  onTouched();
                }} />
              </Field>
              <MoneySelect id={`gear-type-${index}`} label="Kind" value={line.isCable ? "cable" : "equipment"}
                onChange={(value) => {
                  onLinesChange(lines.map((item, itemIndex) => itemIndex === index ? { ...item, isCable: value === "cable" } : item));
                  setReview(index, { ...review, reviewed: false, suggested: false });
                  onTouched();
                }} options={[{ value: "cable", label: "Cable" }, { value: "equipment", label: "Equipment" }]} />
              <Button type="button" variant="ghost" className="self-end" aria-label={`Remove receipt item ${index + 1}`}
                onClick={() => {
                  onLinesChange(lines.filter((_, itemIndex) => itemIndex !== index));
                  onReviewsChange(reviews.filter((_, itemIndex) => itemIndex !== index));
                  onTouched();
                }}>Remove</Button>
            </FieldGroup>
            {review.assetIds.length ? (
              <div className="space-y-2">
                {review.assetIds.map((id) => {
                  const asset = assetById.get(id);
                  return asset ? (
                    <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      <div>
                        <span className="font-mono font-semibold tabular-nums">{asset.assetTag}</span>
                        <span className="ml-2">{asset.label}</span>
                        {review.suggested && !review.reviewed ? <span className="ml-2 text-xs text-muted-foreground">Ronnie’s guess</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link className="text-xs text-primary underline underline-offset-4" href={`/g/${asset.assetTag}`} target="_blank">Inspect</Link>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setReview(index, { assetIds: review.assetIds.filter((item) => item !== id), reviewed: false, suggested: false })}>Not this one</Button>
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            ) : null}
            {suggestions.some((candidate) => !used.has(candidate.id)) ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{review.assetIds.length ? "Other suggestions:" : "Possible matches:"}</span>
                {suggestions.filter((candidate) => !used.has(candidate.id)).map((candidate) => (
                  <Button key={candidate.id} type="button" variant="outline" size="sm" onClick={() => {
                    const assetIds = line.quantity === 1 ? [candidate.id] : [...review.assetIds, candidate.id];
                    if (assetIds.length <= line.quantity) setReview(index, { assetIds, reviewed: assetIds.length === line.quantity, suggested: false });
                  }}>{candidate.code} {candidate.label}</Button>
                ))}
              </div>
            ) : null}
            {review.assetIds.length < line.quantity ? (
              <GearSearch id={`gear-search-${index}`} label="Search registered gear for this item" assets={available} definitions={definitions} excluded={used} transferOwnership={kind === "purchase"}
                onSelect={(id) => {
                  const assetIds = [...review.assetIds, id];
                  setReview(index, { assetIds, reviewed: assetIds.length === line.quantity, suggested: false });
                }} />
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {!review.reviewed && review.suggested && review.assetIds.length === line.quantity ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setReview(index, { ...review, reviewed: true, suggested: false })}>
                  Use suggested {review.assetIds.length === 1 ? "match" : "matches"}
                </Button>
              ) : null}
              {!review.reviewed && !review.suggested && review.assetIds.length === line.quantity ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setReview(index, { ...review, reviewed: true })}>
                  Confirm selected gear
                </Button>
              ) : null}
              {!review.reviewed && review.assetIds.length < line.quantity ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setReview(index, { ...review, reviewed: true, suggested: false })}>
                  Create {line.quantity - review.assetIds.length} new {line.quantity - review.assetIds.length === 1 ? "record" : "records"}{review.assetIds.length ? " for remaining items" : ""}
                </Button>
              ) : null}
              {review.assetIds.length ? <span className="text-xs text-muted-foreground">{review.assetIds.length} linked, {Math.max(0, line.quantity - review.assetIds.length)} {review.reviewed ? "new on save" : "remaining to decide"}</span> : null}
            </div>
          </div>
        );
      })}
      <div className="border-t pt-4">
        <GearSearch id="gear-search-additional" label="Find additional registered gear on this receipt" assets={available} definitions={definitions} excluded={used} transferOwnership={kind === "purchase"}
          onSelect={(id) => { onAdditionalChange([...additionalAssetIds, id]); onTouched(); }} />
      </div>
      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Records this transaction will cover</h4>
        <p className="text-xs text-muted-foreground">{linkedCount} existing confirmed{suggestedCount ? ` · ${suggestedCount} suggested` : ""}{pendingLinkedCount ? ` · ${pendingLinkedCount} selected, awaiting review` : ""} · {newCount} new selected{unresolvedCount ? ` · ${unresolvedCount} awaiting review` : ""}</p>
        {linkedCount || newCount || unresolvedCount ? (
          <div className="overflow-hidden rounded-md border" role="list" aria-label="Gear linked to this receipt">
            {lines.flatMap((line, index) => (reviews[index]?.assetIds || []).map((id) => ({ id, source: line.label || `Receipt item ${index + 1}`, reviewed: Boolean(reviews[index]?.reviewed) })))
              .concat(additionalAssetIds.map((id) => ({ id, source: lockedAssetIds.includes(id) ? "Gear order" : "Additional gear", reviewed: true }))).map(({ id, source, reviewed }) => {
                const asset = assetById.get(id);
                return asset ? (
                  <div key={id} role="listitem" data-review-state={reviewed ? "complete" : "pending"} className="money-review-row grid gap-1 border-b px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)]">
                    <span className="font-mono font-semibold tabular-nums">{asset.assetTag}</span><span>{asset.label}</span><span><span className="font-semibold">{reviewed ? "Accepted" : "Needs review"}</span><span className="text-muted-foreground"> · {source}</span></span>
                  </div>
                ) : null;
              })}
            {lines.map((line, index) => {
              const count = line.quantity - (reviews[index]?.assetIds.length || 0);
              return count > 0 ? (
                <div key={`new-${index}`} role="listitem" data-review-state={reviews[index]?.reviewed ? "complete" : "pending"} className="money-review-row grid gap-1 border-b px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="font-mono font-semibold tabular-nums">{reviews[index]?.reviewed ? "New" : "Review"} ×{count}</span><span>{line.label || `Receipt item ${index + 1}`}</span><span className="font-semibold">{reviews[index]?.reviewed ? "New gear approved; codes on save" : "Needs review"}</span>
                </div>
              ) : null;
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">No gear linked or scheduled for creation.</p>}
        {additionalAssetIds.length ? (
          <div className="flex flex-wrap gap-2">
            {additionalAssetIds.filter((id) => !lockedAssetIds.includes(id)).map((id) => {
              const asset = assetById.get(id);
              return asset ? <Button key={id} type="button" variant="ghost" size="sm" onClick={() => { onAdditionalChange(additionalAssetIds.filter((item) => item !== id)); onTouched(); }}>Remove {asset.assetTag}</Button> : null;
            })}
          </div>
        ) : null}
        {lockedAssetIds.length ? <p className="text-xs text-muted-foreground">Gear order items are included automatically. To change the order’s contents, update its Gear record before reconciliation.</p> : null}
      </div>
    </FieldGroup>
  );
}
