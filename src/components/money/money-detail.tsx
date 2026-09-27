"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoneyEntryForm } from "@/components/money/money-entry-form";
import { MoneyHistory } from "@/components/money/money-history";
import type { MoneyCategory } from "@/lib/money/categories";
import { MoneySelect } from "@/components/money/money-field";
import {
  KINDS,
  money,
  PEOPLE,
  type MoneyEntry,
  type MoneySnapshot,
} from "@/lib/money/domain";
import {
  attachReceipt,
  reverseEntry,
  saveGearDetails,
  viewReceipt,
} from "@/lib/money/client";
import { formatCableLength } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

export function MoneyDetail({
  entry,
  snapshot,
  definitions,
  demo,
  onChanged,
  onCorrect,
  onCategoriesChanged,
}: {
  entry: MoneyEntry;
  snapshot: MoneySnapshot;
  definitions: EquipmentTemplate[];
  demo: boolean;
  onChanged: () => Promise<void>;
  onCorrect: (entry: MoneyEntry) => void;
  onCategoriesChanged: (categories: MoneyCategory[]) => void;
}) {
  const [editing, setEditing] = useState<MoneyEntry | null>(null);
  const assets = snapshot.assets.filter((a) => entry.assetIds.includes(a.id));
  const [selected, setSelected] = useState<string[]>(assets.map((a) => a.id));
  const [length, setLength] = useState(""),
    [manufacturer, setManufacturer] = useState(""),
    [definition, setDefinition] = useState("none"),
    [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [receiptUrl, setReceiptUrl] = useState("");
  const [addingReceipt, setAddingReceipt] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const reversed = snapshot.entries.find((e) => e.reversesId === entry.id);
  useEffect(
    () => () => {
      if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    },
    [receiptUrl],
  );
  const onlyCables = assets
    .filter((a) => selected.includes(a.id))
    .every((a) => a.tags.includes("Cables"));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!selected.length) throw new Error("Select at least one gear item.");
      if (length && (!Number.isFinite(Number(length)) || Number(length) <= 0))
        throw new Error("Enter a positive cable length.");
      await saveGearDetails(
        entry.id,
        {
          assetIds: selected,
          ...(length ? { lengthInches: Number(length) * 12 } : {}),
          ...(manufacturer ? { manufacturer } : {}),
          ...(label ? { label } : {}),
          ...(definition !== "none" ? { definitionId: definition } : {}),
        },
        demo,
      );
      await onChanged();
      setLength("");
      setManufacturer("");
      setLabel("");
      setDefinition("none");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reverse() {
    setBusy(true);
    setError("");
    try {
      await reverseEntry(entry, reason, demo);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveReceipt(event: FormEvent) {
    event.preventDefault();
    if (!receiptFile || demo) return;
    setBusy(true);
    setReceiptError("");
    try {
      await attachReceipt(entry.id, receiptFile);
      await onChanged();
      setReceiptFile(null);
      setAddingReceipt(false);
      toast.success("Receipt attached. Transaction amounts are unchanged.");
    } catch (e) {
      setReceiptError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openReceipt(id: string) {
    setError("");
    try {
      setReceiptUrl(await viewReceipt(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {editing ? (
        <MoneyEntryForm
          editing={editing}
          onReload={async () => {
            await onChanged();
            setEditing(null);
          }}
          snapshot={snapshot}
          demo={demo}
          onCancel={() => setEditing(null)}
          onCategoriesChanged={onCategoriesChanged}
          onSaved={() => {
            setEditing(null);
            void onChanged();
          }}
        />
      ) : null}
      <section className="swell-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="swell-page-kicker">
              {entry.date} ·{" "}
              {entry.kind === "reversal" ? "Reversal" : KINDS[entry.kind]}
            </p>
            <h1 className="mt-2 text-2xl font-semibold break-words">
              {entry.description}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[entry.counterparty, entry.category].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <p className="text-2xl font-semibold tabular-nums">
              {money(entry.amountCents)}
            </p>
            {entry.kind !== "reversal" && !reversed ? (
              <Button
                variant="outline"
                disabled={busy || Boolean(editing)}
                onClick={() => setEditing(entry)}
              >
                Edit transaction
              </Button>
            ) : null}
          </div>
        </div>
        {reversed ? (
          <Alert className="mt-4">
            <AlertDescription>
              Reversed: {reversed.notes}. The original receipt and gear codes
              remain in the history.
            </AlertDescription>
          </Alert>
        ) : null}
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Ike’s funding change", amount: entry.effects.ike },
            { label: "Chris’s funding change", amount: entry.effects.chris },
            { label: "Company cash change", amount: entry.effects.company },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {item.amount > 0 ? "+" : ""}
                {money(item.amount)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(entry.funding)
            .filter(([, v]) => v)
            .map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key === "company"
                  ? "The Swell"
                  : PEOPLE[key as keyof typeof PEOPLE]}
                : {money(value)}
              </Badge>
            ))}
          {![
            "purchase",
            "band_payment",
            "refund",
            "income",
            "reversal",
          ].includes(entry.kind) ? (
            <Badge variant="outline">
              {entry.kind === "transfer"
                ? `From ${PEOPLE[entry.person]} to ${PEOPLE[entry.person === "ike" ? "chris" : "ike"]}`
                : PEOPLE[entry.person]}
            </Badge>
          ) : null}
          <Badge variant="outline">
            {entry.source === "telegram" ? "Telegram entry" : "Website entry"}
          </Badge>
        </div>
        {entry.notes ? (
          <p className="mt-4 whitespace-pre-wrap text-sm">{entry.notes}</p>
        ) : null}
        {entry.vendorOrderNumber ? (
          <p className="mt-2 text-sm text-muted-foreground">Vendor order {entry.vendorOrderNumber}</p>
        ) : null}
        {entry.relatedEntryId ? (
          <Link
            href={`/money/${entry.relatedEntryId}${demo ? "?demo=1" : ""}`}
            className="mt-3 inline-block text-sm text-primary underline"
          >
            View original purchase
          </Link>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Receipts</h2>
          {entry.kind !== "reversal" ? (
            <Button
              variant="outline"
              disabled={busy || entry.receiptIds.length >= 10}
              onClick={() => {
                setAddingReceipt((v) => !v);
                setReceiptFile(null);
                setReceiptError("");
              }}
            >
              {addingReceipt ? "Close upload" : "Add receipt"}
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {entry.receiptIds.map((id, i) => (
            <Button
              key={id}
              variant="outline"
              onClick={() => void openReceipt(id)}
              disabled={demo}
            >
              View receipt {i + 1}
            </Button>
          ))}
          {!entry.receiptIds.length ? (
            <p className="text-sm text-muted-foreground">
              No receipt attached.
            </p>
          ) : null}
        </div>
        {addingReceipt ? (
          <form className="mt-4" onSubmit={saveReceipt}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="entry-receipt">
                  Receipt photo or PDF
                </FieldLabel>
                <Input
                  id="entry-receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={busy || demo}
                  onChange={(e) => {
                    setReceiptFile(e.target.files?.[0] ?? null);
                    setReceiptError("");
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  {demo
                    ? "Receipt uploads are disabled in the local demo."
                    : "JPEG, PNG, WebP, or PDF, up to 4 MB. Adding a receipt does not change the amount, payer, or gear."}
                </p>
              </Field>
              {receiptError ? (
                <Alert variant="destructive">
                  <AlertDescription>{receiptError}</AlertDescription>
                </Alert>
              ) : null}
              <div>
                <Button type="submit" disabled={busy || demo || !receiptFile}>
                  {busy ? "Attaching receipt…" : "Save receipt"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : null}
        {entry.receiptIds.length >= 10 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            This transaction has the maximum of 10 receipts.
          </p>
        ) : null}
        {entry.receiptAttachments?.length ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Receipt added{" "}
            {new Date(
              entry.receiptAttachments[entry.receiptAttachments.length - 1]
                .addedAt,
            ).toLocaleString()}
            .
          </p>
        ) : null}
        {receiptUrl ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Open receipt in a new tab
              </a>
              <Button variant="ghost" onClick={() => setReceiptUrl("")}>
                Close receipt
              </Button>
            </div>
            <iframe
              title="Private purchase receipt"
              src={receiptUrl}
              className="h-[32rem] w-full rounded-lg border bg-muted"
            />
          </div>
        ) : null}
        <p className="mt-5 break-all text-xs text-muted-foreground">
          Recorded {new Date(entry.createdAt).toLocaleString()} ·{" "}
          {entry.createdBy} · {entry.id}
        </p>
      </section>
      {assets.length ? (
        <section className="swell-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">The exact gear</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These codes identify the physical items linked to this transaction.
            Select items to fill in shared details.
          </p>
          <div className="my-5 flex flex-col divide-y">
            {assets.map((asset) => (
              <div key={asset.id} className="flex items-start gap-3 py-3">
                <Checkbox
                  id={`select-${asset.id}`}
                  checked={selected.includes(asset.id)}
                  onCheckedChange={(checked) =>
                    setSelected((s) =>
                      checked
                        ? [...new Set([...s, asset.id])]
                        : s.filter((id) => id !== asset.id),
                    )
                  }
                />
                <label
                  htmlFor={`select-${asset.id}`}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="mr-3 font-mono font-semibold">
                    {asset.assetTag}
                  </span>
                  <span className="font-medium">{asset.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {asset.ownerPartyId === "party-the-swell"
                      ? "Owned by The Swell"
                      : `Personally owned by ${asset.ownerPartyId === "party-ike" ? "Ike" : "Chris"}`}
                    {asset.cableLengthInches
                      ? ` · ${formatCableLength(asset.cableLengthInches)}`
                      : ""}
                    {asset.cableManufacturer
                      ? ` · ${asset.cableManufacturer}`
                      : ""}
                  </span>
                  {asset.detailsNeeded ? (
                    <Badge variant="outline" className="mt-2">
                      Details needed
                    </Badge>
                  ) : null}
                </label>
                <Link
                  href={`/gear?asset=${asset.assetTag}${demo ? "&demo=1" : ""}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open gear
                </Link>
              </div>
            ))}
          </div>
          <form onSubmit={save}>
            <FieldGroup>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bulk-label">Shared item name</FieldLabel>
                  <Input
                    id="bulk-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Leave unchanged"
                    maxLength={160}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bulk-brand">
                    Brand / manufacturer
                  </FieldLabel>
                  <Input
                    id="bulk-brand"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="Leave unchanged"
                    maxLength={100}
                  />
                </Field>
                {onlyCables ? (
                  <Field>
                    <FieldLabel htmlFor="bulk-length">
                      Cable length (feet)
                    </FieldLabel>
                    <Input
                      id="bulk-length"
                      inputMode="decimal"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="e.g. 20"
                    />
                  </Field>
                ) : null}
                <MoneySelect
                  id="bulk-definition"
                  label="Reusable gear definition"
                  value={definition}
                  onChange={setDefinition}
                  options={[
                    { value: "none", label: "Leave unchanged" },
                    ...definitions
                      .filter((d) =>
                        onlyCables
                          ? d.definitionKind === "cable"
                          : d.definitionKind !== "cable",
                      )
                      .map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              </FieldGroup>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !selected.length ||
                    (!length &&
                      !manufacturer &&
                      !label &&
                      definition === "none")
                  }
                >
                  {busy ? "Saving…" : `Apply to ${selected.length} selected`}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Gear details do not change the amount due.
                </p>
              </div>
            </FieldGroup>
          </form>
        </section>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <MoneyHistory
        edits={(snapshot.edits ?? []).filter((e) => e.entryId === entry.id)}
      />
      {entry.kind !== "reversal" ? (
        <section className="swell-panel p-5">
          <details>
            <summary className="cursor-pointer font-medium">
              Reverse / cancel this transaction
            </summary>
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">
              Use Edit transaction for corrections. Reverse only to cancel this
              entry entirely. Gear keeps its original codes. A return of
              purchased gear should be recorded as a refund instead.
            </p>
            {reversed ? (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => onCorrect(entry)}
              >
                Create corrected entry with these gear codes
              </Button>
            ) : (
              <FieldGroup className="mt-4">
                <Field>
                  <FieldLabel htmlFor="reverse-reason">
                    Reason for reversal
                  </FieldLabel>
                  <Input
                    id="reverse-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Wrong payer or amount"
                    maxLength={1000}
                  />
                </Field>
                <div>
                  <Button
                    variant="destructive"
                    onClick={() => void reverse()}
                    disabled={busy || Boolean(editing) || !reason.trim()}
                  >
                    Reverse entry
                  </Button>
                </div>
              </FieldGroup>
            )}
          </details>
        </section>
      ) : null}
    </>
  );
}
