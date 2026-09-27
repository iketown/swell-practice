"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyCategoryCreate } from "@/components/money/money-categories";
import { MoneyGearMatcher } from "@/components/money/money-gear-matcher";
import type { MoneyCategory } from "@/lib/money/categories";
import { MoneySelect } from "@/components/money/money-field";
import {
  entrySchema,
  KINDS,
  isExpenseKind,
  parseMoney,
  type EntryInput,
  type EntryKind,
  type MoneyDraft,
  type MoneyEntry,
  type MoneySnapshot,
  type Person,
} from "@/lib/money/domain";
import { editableFields } from "@/lib/money/edits";
import { planGearChoices } from "@/lib/money/gear-match";
import { assembleGearReview, initialGearReview } from "@/lib/money/gear-review";
import { editEntry, moneyRequest, saveEntry } from "@/lib/money/client";
import type { PurchaseOrder } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

const dollars = (v?: number) => (v ? (v / 100).toFixed(2) : "");
export function MoneyEntryForm({
  snapshot,
  definitions = [],
  orders = [],
  demo,
  onSaved,
  onCancel,
  onCategoriesChanged,
  draft,
  order,
  editing,
  onReload,
}: {
  snapshot: MoneySnapshot;
  definitions?: EquipmentTemplate[];
  orders?: PurchaseOrder[];
  demo: boolean;
  onSaved: (entry: MoneyEntry) => void;
  onCancel: () => void;
  onCategoriesChanged: (categories: MoneyCategory[]) => void;
  draft?: MoneyDraft;
  order?: PurchaseOrder;
  editing?: MoneyEntry;
  onReload?: () => Promise<void>;
}) {
  const initial = editing
    ? { ...editing, kind: editing.kind as EntryKind }
    : draft?.input;
  const resolvedOrder = order ?? orders.find((item) => item.id === initial?.purchaseOrderId);
  const lockedOrderAssetIds = resolvedOrder?.lines.flatMap((line) => line.assetIds) ?? [];
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? "purchase");
  const [date, setDate] = useState(
    initial?.date ??
      order?.orderedDate ??
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "America/Chicago",
      }).format(new Date()),
  );
  const [description, setDescription] = useState(
    initial?.description ?? (order ? `${order.vendor} order` : ""),
  );
  const [counterparty, setCounterparty] = useState(
    initial?.counterparty ?? order?.vendor ?? "",
  );
  const [category, setCategory] = useState(
    initial?.category ?? (order ? "Gear" : ""),
  );
  const [addingCategory, setAddingCategory] = useState(false);
  const selectedCategory =
    snapshot.categories.find((c) => !c.deleted && c.name === category)?.name ??
    (editing?.category === category ? category : "");
  const [amount, setAmount] = useState(dollars(initial?.amountCents));
  const [payer, setPayer] = useState(
    initial?.funding &&
      Object.values(initial.funding).filter(Boolean).length > 1
      ? "split"
      : initial?.funding?.chris
        ? "chris"
        : initial?.funding?.company
          ? "company"
          : order?.paidByPartyId === "party-cron"
            ? "chris"
            : draft && !draft.input
              ? "__choose__"
            : "ike",
  );
  const [ike, setIke] = useState(dollars(initial?.funding?.ike));
  const [chris, setChris] = useState(dollars(initial?.funding?.chris));
  const [company, setCompany] = useState(dollars(initial?.funding?.company));
  const [person, setPerson] = useState<Person>(initial?.person ?? "ike");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [vendorOrderNumber, setVendorOrderNumber] = useState(initial?.vendorOrderNumber ?? order?.orderNumber ?? "");
  const [receiptIds, setReceiptIds] = useState<string[]>(
    draft?.receiptIds ?? [],
  );
  const [receiptNames, setReceiptNames] = useState<string[]>([]);
  const [gear, setGear] = useState<EntryInput["gear"]>(initial?.gear ?? []);
  const [gearPlan, setGearPlan] = useState(() => {
    const savedPlan = draft?.gearChoices;
    const freshPlan = draft?.input?.kind === "purchase" && draft.input.gear?.length
      ? planGearChoices({ kind: "purchase", gear: draft.input.gear, vendorOrderNumber: draft.input.vendorOrderNumber || "" }, snapshot.assets, definitions, orders) || undefined
      : undefined;
    // Grid choices are made in this form, so refresh suggestions when the gear inventory changes.
    // Preserve only explicit answers from older chat-based reviews.
    return savedPlan?.lines.some((line) => line.choice) ? savedPlan : freshPlan ?? savedPlan;
  });
  const [gearReviews, setGearReviews] = useState(() => initialGearReview(initial?.gear ?? [], gearPlan,
    [...(initial?.existingAssetIds ?? []), ...lockedOrderAssetIds]));
  const [noGearConfirmed, setNoGearConfirmed] = useState(false);
  const [additionalAssetIds, setAdditionalAssetIds] = useState(() => {
    const lineIds = new Set(initialGearReview(initial?.gear ?? [], gearPlan).flatMap((review) => review.assetIds));
    return [...new Set([...(initial?.existingAssetIds ?? []), ...lockedOrderAssetIds])]
      .filter((id) => !lineIds.has(id));
  });
  const [related, setRelated] = useState(initial?.relatedEntryId ?? "");
  const [duplicateReason, setDuplicateReason] = useState(
    editing?.duplicateReason ?? "",
  );
  const [editReason, setEditReason] = useState("");
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [readingGear, setReadingGear] = useState(false),
    [error, setError] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const hasFunding = isExpenseKind(kind) || kind === "refund",
    hasGear = kind === "purchase" || kind === "loaned_gear";
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Use a receipt smaller than 4 MB for web upload.");
      const form = new FormData();
      form.set("file", file);
      const receipt = await moneyRequest<{ id: string; filename: string }>(
        "/api/money/receipts",
        { method: "POST", body: form },
      );
      setReceiptIds((ids) => [...new Set([...ids, receipt.id])]);
      setReceiptNames((names) => [...names, receipt.filename]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function readGearItems() {
    setReadingGear(true);
    setError("");
    try {
      if (!receiptIds.length) throw new Error("Attach a receipt before asking Ronnie to find its gear.");
      if (receiptIds.length > 4) throw new Error("Ronnie can read up to four attached receipt files at once.");
      const result = await moneyRequest<{ gear: EntryInput["gear"]; gearChoices?: NonNullable<MoneyDraft["gearChoices"]> }>("/api/money/gear-items", {
        method: "POST",
        body: JSON.stringify(draft && receiptIds.length === draft.receiptIds.length &&
          receiptIds.every((id) => draft.receiptIds.includes(id))
          ? { draftId: draft.id }
          : { receiptIds, text: [description, notes].filter(Boolean).join("\n"), vendorOrderNumber }),
      });
      const plan = planGearChoices({ kind: "purchase", gear: result.gear, vendorOrderNumber }, snapshot.assets, definitions, orders) || result.gearChoices || undefined;
      setGear(result.gear);
      setGearPlan(plan);
      setGearReviews(initialGearReview(result.gear, plan, additionalAssetIds));
      setNoGearConfirmed(false);
      change();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the receipt items.");
    } finally {
      setReadingGear(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (readingGear) throw new Error("Wait for Ronnie to finish reading the receipt.");
      if (!selectedCategory && !(editing && category === editing.category))
        throw new Error("Choose a category or add a new one.");
      if (!editing && kind === "purchase" && selectedCategory === "Gear" && receiptIds.length &&
        !gear.length && !additionalAssetIds.length && !noGearConfirmed)
        throw new Error("Review the receipt items, or confirm that this Gear expense has no trackable gear.");
      const amountCents = kind === "loaned_gear" ? 0 : parseMoney(amount);
      const funding = { ike: 0, chris: 0, company: 0 };
      if (hasFunding) {
        if (payer === "__choose__")
          throw new Error("Choose who paid before recording this transaction.");
        if (payer === "split") {
          funding.ike = parseMoney(ike || "0");
          funding.chris = parseMoney(chris || "0");
          funding.company = parseMoney(company || "0");
        } else funding[payer as keyof typeof funding] = amountCents;
      }
      const gearReview = !editing && hasGear
        ? assembleGearReview(gear, gearReviews, additionalAssetIds)
        : { gear: [], existingAssetIds: [] };
      const input: EntryInput = entrySchema.parse({
        kind,
        date,
        description,
        counterparty,
        category: selectedCategory,
        amountCents,
        funding,
        person,
        notes,
        receiptIds: editing?.receiptIds ?? receiptIds,
        gear: editing?.gear ?? (hasGear ? gearReview.gear : []),
        existingAssetIds: editing?.existingAssetIds ?? gearReview.existingAssetIds,
        purchaseOrderId:
          editing?.purchaseOrderId ??
          (kind === "purchase"
            ? (order?.id ?? initial?.purchaseOrderId ?? "")
            : ""),
        vendorOrderNumber: kind === "purchase" || kind === "refund" ? vendorOrderNumber : "",
        relatedEntryId: kind === "refund" ? related : "",
        duplicateReason,
      });
      const entry = editing
        ? await editEntry(
            editing.id,
            {
              fields: editableFields(input),
              revision: editing.revision ?? 0,
              operationId,
              reason: editReason,
            },
            demo,
          )
        : await saveEntry(input, operationId, demo, draft?.id);
      toast.success(
        editing
          ? "Changes saved to transaction history."
          : "Transaction recorded.",
      );
      onSaved(entry);
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues.map((issue) => issue.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Could not save.",
      );
    } finally {
      setBusy(false);
    }
  }
  // A definitive validation/conflict response allows edits; a retry of unchanged data retains its ID.
  const change = () => setOperationId(crypto.randomUUID());
  return (
    <section
      className="swell-panel p-5 sm:p-6"
      aria-label={editing ? "Edit transaction" : "Record transaction"}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {editing
            ? "Edit transaction"
            : draft
              ? "Review receipt entry"
              : order
                ? "Reconcile gear order"
                : "Record a transaction"}
        </h2>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Close
        </Button>
      </div>
      {draft?.questions.length ? (
        <Alert className="mb-5">
          <AlertDescription>{draft.questions.join(" ")}</AlertDescription>
        </Alert>
      ) : null}
      {editing ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Changes update this transaction and its balances. Your receipts and
          gear codes stay linked. Every saved edit is recorded in the history.
        </p>
      ) : null}
      {order ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Existing gear codes will be linked. Enter the actual amount paid,
          including tax and shipping.
        </p>
      ) : null}
      <form onSubmit={submit} onChange={change}>
        <FieldGroup>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <MoneySelect
              id="money-kind"
              label="Transaction type"
              disabled={Boolean(
                editing && (editing.assetIds.length || editing.purchaseOrderId),
              )}
              value={kind}
              onChange={(v) => {
                setKind(v as EntryKind);
                if (
                  v === "band_payment" &&
                  snapshot.categories.some(
                    (c) => !c.deleted && c.name === "Band payments",
                  )
                )
                  setCategory("Band payments");
                change();
              }}
              description={
                kind === "band_payment"
                  ? "Money paid to musicians for rehearsals, sessions, or gigs. Personal payments increase what The Swell owes that payer; company payments reduce company cash."
                  : kind === "income"
                    ? "Money received by The Swell, such as a venue paying for a gig. This increases company cash."
                    : undefined
              }
              options={Object.entries(KINDS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Field>
              <FieldLabel htmlFor="money-date">Payment date</FieldLabel>
              <Input
                id="money-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor="money-description">
              What was it for?
            </FieldLabel>
            <Input
              id="money-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                kind === "band_payment"
                  ? "Band payment for Friday’s rehearsal"
                  : "Four XLR cables for the live rig"
              }
              maxLength={500}
              required
            />
          </Field>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="money-counterparty">
                {kind === "band_payment"
                  ? "Band member(s) paid"
                  : kind === "income"
                    ? "Venue / customer"
                    : "Merchant / recipient"}
              </FieldLabel>
              <Input
                id="money-counterparty"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder={
                  kind === "band_payment"
                    ? "Names of the musicians paid"
                    : kind === "income"
                      ? "Venue or client name"
                      : "Sweetwater or musician’s name"
                }
                required={kind === "band_payment"}
                maxLength={200}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <MoneySelect
                id="money-category"
                label="Category"
                value={selectedCategory || "__choose__"}
                onChange={(value) => {
                  setCategory(value === "__choose__" ? "" : value);
                  change();
                }}
                options={[
                  { value: "__choose__", label: "Choose a category" },
                  ...(editing &&
                  !snapshot.categories.some(
                    (c) => !c.deleted && c.name === editing.category,
                  )
                    ? [
                        {
                          value: editing.category,
                          label: `${editing.category || "Uncategorized"} (current)`,
                        },
                      ]
                    : []),
                  ...snapshot.categories
                    .filter((c) => !c.deleted)
                    .map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setAddingCategory((v) => !v)}
              >
                {addingCategory ? "Cancel new category" : "+ New category"}
              </Button>
            </div>
          </FieldGroup>
          {kind === "purchase" || kind === "refund" ? (
            <Field>
              <FieldLabel htmlFor="money-vendor-order">Vendor order number (optional)</FieldLabel>
              <Input
                id="money-vendor-order"
                value={vendorOrderNumber}
                onChange={(event) => setVendorOrderNumber(event.target.value)}
                maxLength={100}
                placeholder="40486367"
              />
            </Field>
          ) : null}
          {addingCategory ? (
            <MoneyCategoryCreate
              id="transaction-new-category"
              demo={demo}
              onCreated={(categories, name) => {
                onCategoriesChanged(categories);
                setCategory(name);
                setAddingCategory(false);
                change();
              }}
            />
          ) : null}
          {kind !== "loaned_gear" ? (
            <Field>
              <FieldLabel htmlFor="money-amount">
                {kind === "income"
                  ? "Total received (USD)"
                  : "Total paid (USD)"}
              </FieldLabel>
              <Input
                id="money-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <FieldDescription>
                {kind === "income"
                  ? "Total received into The Swell’s account."
                  : kind === "band_payment"
                    ? "Total paid to the named musicians. Use separate transactions if you want a separate record for each person."
                    : "Actual paid total, including tax and shipping. Recorded once for the whole transaction."}
              </FieldDescription>
            </Field>
          ) : (
            <Alert>
              <AlertDescription>
                Personally owned gear stays with its owner. This creates gear
                records with no reimbursement or funding credit.
              </AlertDescription>
            </Alert>
          )}
          {hasFunding ? (
            <>
              <MoneySelect
                id="money-payer"
                label={
                  kind === "refund" ? "Who received the refund?" : "Who paid?"
                }
                value={payer}
                onChange={(v) => {
                  setPayer(v);
                  change();
                }}
                options={[
                  { value: "__choose__", label: "Choose who paid" },
                  { value: "ike", label: "Ike, personally" },
                  { value: "chris", label: "Chris, personally" },
                  { value: "company", label: "The Swell’s account" },
                  { value: "split", label: "Split between payers" },
                ]}
              />
              {payer === "split" ? (
                <FieldGroup className="grid gap-4 sm:grid-cols-3">
                  {[
                    { id: "ike", label: "Ike", value: ike, set: setIke },
                    {
                      id: "chris",
                      label: "Chris",
                      value: chris,
                      set: setChris,
                    },
                    {
                      id: "company",
                      label: "Company",
                      value: company,
                      set: setCompany,
                    },
                  ].map((p) => (
                    <Field key={p.id}>
                      <FieldLabel htmlFor={`split-${p.id}`}>
                        {p.label} (USD)
                      </FieldLabel>
                      <Input
                        id={`split-${p.id}`}
                        inputMode="decimal"
                        value={p.value}
                        onChange={(e) => p.set(e.target.value)}
                        placeholder="0.00"
                      />
                    </Field>
                  ))}
                </FieldGroup>
              ) : null}
            </>
          ) : kind !== "income" ? (
            <MoneySelect
              id="money-person"
              disabled={Boolean(
                editing && kind === "loaned_gear" && editing.assetIds.length,
              )}
              label={
                kind === "transfer"
                  ? "Who sent the money?"
                  : kind === "deposit"
                    ? "Who deposited their own money?"
                    : kind === "loaned_gear"
                      ? "Who owns the gear?"
                      : "Who received the money?"
              }
              value={person}
              onChange={(v) => {
                setPerson(v as Person);
                change();
              }}
              options={[
                { value: "ike", label: "Ike" },
                { value: "chris", label: "Chris" },
              ]}
              description={
                kind === "transfer"
                  ? `Money sent to ${person === "ike" ? "Chris" : "Ike"} to equalize funding. This is not another band expense.`
                  : undefined
              }
            />
          ) : null}
          {kind === "refund" ? (
            <MoneySelect
              id="money-original"
              label="Original purchase"
              value={related || "none"}
              onChange={(v) => {
                setRelated(v === "none" ? "" : v);
                change();
              }}
              options={[
                { value: "none", label: "Choose purchase" },
                ...snapshot.entries
                  .filter(
                    (e) =>
                      e.kind === "purchase" &&
                      !snapshot.entries.some((r) => r.reversesId === e.id),
                  )
                  .map((e) => ({
                    value: e.id,
                    label: `${e.date} · ${e.description}`,
                  })),
              ]}
            />
          ) : null}
          {!editing ? (
            <Field>
              <FieldLabel htmlFor="money-receipt">Receipts</FieldLabel>
              <Input
                id="money-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={demo || uploading || receiptIds.length >= 10}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <FieldDescription>
                {demo
                  ? "Receipt uploads are disabled in the local demo."
                  : uploading
                    ? "Uploading receipt…"
                    : `${receiptIds.length} attached${receiptNames.length ? `: ${receiptNames.join(", ")}` : ""}. Private to administrators.`}
              </FieldDescription>
              {kind === "purchase" && receiptIds.length && !demo ? (
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button type="button" variant="outline" disabled={readingGear || uploading || busy || receiptIds.length > 4} onClick={() => void readGearItems()}>
                    {readingGear ? "Ronnie is reading…" : "Ask Ronnie to parse receipt"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {receiptIds.length > 4
                      ? "Ronnie can read up to four receipt files at once."
                      : gear.length
                        ? "Reading again replaces the unsaved item matches below."
                        : "She’ll suggest existing gear codes for you to review."}
                  </span>
                </div>
              ) : null}
            </Field>
          ) : null}
          {hasGear && !editing ? (
            <>
            <MoneyGearMatcher
              lines={gear}
              reviews={gearReviews}
              additionalAssetIds={additionalAssetIds}
              lockedAssetIds={lockedOrderAssetIds}
              assets={snapshot.assets}
              definitions={definitions}
              plan={gearPlan}
              kind={kind as "purchase" | "loaned_gear"}
              person={person}
              onLinesChange={setGear}
              onReviewsChange={setGearReviews}
              onAdditionalChange={setAdditionalAssetIds}
              onTouched={change}
            />
            {kind === "purchase" && category === "Gear" && receiptIds.length && !gear.length && !additionalAssetIds.length ? (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={noGearConfirmed} onCheckedChange={(checked) => { setNoGearConfirmed(checked === true); change(); }} />
                No trackable gear on this receipt
              </label>
            ) : null}
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="money-notes">Notes</FieldLabel>
            <Textarea
              id="money-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
            />
          </Field>
          {editing ? (
            <Field>
              <FieldLabel htmlFor="money-edit-reason">
                Reason for edit (optional)
              </FieldLabel>
              <Input
                id="money-edit-reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Corrected payment date"
              />
            </Field>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Separate payment with the same date and amount?
            </summary>
            <Field className="mt-3">
              <FieldLabel htmlFor="duplicate-reason">
                Why this is not a duplicate
              </FieldLabel>
              <Input
                id="duplicate-reason"
                value={duplicateReason}
                onChange={(e) => setDuplicateReason(e.target.value)}
                maxLength={500}
              />
            </Field>
          </details>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
              {editing && onReload ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onReload()}
                >
                  Reload latest transaction
                </Button>
              ) : null}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || uploading || readingGear}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : "Record transaction"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
