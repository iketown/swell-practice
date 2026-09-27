"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import { MoneyDetail } from "@/components/money/money-detail";
import { MoneyEntryForm } from "@/components/money/money-entry-form";
import { MoneyCategories } from "@/components/money/money-categories";
import { MoneyAgentChat } from "@/components/money/money-agent-chat";
import { MoneyPlaybook } from "@/components/money/money-playbook";
import type { MoneyCategory } from "@/lib/money/categories";
import { MoneySelect } from "@/components/money/money-field";
import {
  csvExport,
  equalization,
  KINDS,
  isExpenseKind,
  money,
  PEOPLE,
  totals,
  type MoneyDraft,
  type MoneyEntry,
  type MoneySnapshot,
} from "@/lib/money/domain";
import { loadMoney, moneyRequest } from "@/lib/money/client";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { listPurchaseOrders } from "@/lib/gear/repository";
import type { PurchaseOrder } from "@/lib/gear/domain";

export function MoneyClient({
  entryId,
  draftId,
  playbookOpen = false,
}: {
  entryId?: string;
  draftId?: string;
  playbookOpen?: boolean;
}) {
  const admin = useAdmin(),
    router = useRouter(),
    demo = admin.isDemoAdmin,
    suffix = demo ? "?demo=1" : "";
  const [snapshot, setSnapshot] = useState<MoneySnapshot | null>(null),
    [definitions, setDefinitions] = useState<EquipmentTemplate[]>([]),
    [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState<MoneyDraft>(),
    [order, setOrder] = useState<PurchaseOrder>();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [categoryFilter, setCategoryFilter] = useState(""),
    [managingCategories, setManagingCategories] = useState(false),
    [managingPlaybook, setManagingPlaybook] = useState(playbookOpen),
    [intake, setIntake] = useState(false),
    [intakeText, setIntakeText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [reading, setReading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, templates, purchases] = await Promise.all([
        loadMoney(demo),
        listEquipmentTemplates(),
        listPurchaseOrders(),
      ]);
      setSnapshot(data);
      setDefinitions(templates);
      setOrders(purchases);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    if (!admin.loading && admin.isAdmin) {
      const t = window.setTimeout(() => void refresh(), 0);
      return () => window.clearTimeout(t);
    }
  }, [admin.loading, admin.isAdmin, refresh]);
  const requestedDraft = snapshot?.drafts.find((d) => d.id === draftId),
    activeDraft = draft ?? requestedDraft;
  const entry = snapshot?.entries.find((e) => e.id === entryId);
  const summary = useMemo(() => totals(snapshot?.entries ?? []), [snapshot]),
    balance = useMemo(() => equalization(snapshot?.entries ?? []), [snapshot]);
  const rows = useMemo(
    () =>
      snapshot?.entries.filter(
        (e) =>
          (filter === "all" || e.kind === filter) &&
          (!categoryFilter || e.category === categoryFilter) &&
          [e.description, e.counterparty, e.category, e.vendorOrderNumber, ...e.assetTags]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      ) ?? [],
    [snapshot, filter, categoryFilter, query],
  );
  const unreconciled = orders.filter(
    (o) =>
      !snapshot?.entries.some(
        (e) =>
          (e.purchaseOrderId === o.id || Boolean(o.orderNumber && e.vendorOrderNumber === o.orderNumber && e.counterparty.trim().toLowerCase() === o.vendor.trim().toLowerCase())) &&
          e.kind === "purchase" &&
          !snapshot.entries.some((r) => r.reversesId === e.id),
      ),
  );
  function categoriesChanged(categories: MoneyCategory[]) {
    setSnapshot((current) => (current ? { ...current, categories } : current));
  }
  async function saved(next: MoneyEntry) {
    setCreating(false);
    setDraft(undefined);
    setOrder(undefined);
    await refresh();
    router.push(`/money/${next.id}${suffix}`);
  }
  function closeForm() {
    setCreating(false);
    setDraft(undefined);
    setOrder(undefined);
    if (draftId) router.push(`/money${suffix}`);
  }
  async function readReceipt() {
    setReading(true);
    setError("");
    try {
      if (!file && !intakeText.trim())
        throw new Error("Add a receipt or describe the transaction.");
      const receiptIds: string[] = [];
      if (file) {
        if (file.size > 4 * 1024 * 1024)
          throw new Error("Use a receipt smaller than 4 MB.");
        const form = new FormData();
        form.set("file", file);
        const receipt = await moneyRequest<{ id: string }>(
          "/api/money/receipts",
          { method: "POST", body: form },
        );
        receiptIds.push(receipt.id);
      }
      const result = await moneyRequest<MoneyDraft>("/api/money/intake", {
        method: "POST",
        body: JSON.stringify({ text: intakeText, receiptIds }),
      });
      setDraft(result);
      setCreating(true);
      setIntake(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function dismiss(id: string) {
    try {
      await moneyRequest(`/api/money/drafts/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportCsv() {
    const blob = new Blob([csvExport(rows)], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "the-swell-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (admin.loading)
    return (
      <AppShell>
        <Skeleton className="h-40" />
      </AppShell>
    );
  if (!admin.isAdmin)
    return (
      <AppShell>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Money is private</EmptyTitle>
            <EmptyDescription>
              Sign in as an administrator to view receipts, gear purchases, and
              partner balances.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {entryId ? (
            <Link
              href={`/money${suffix}`}
              className="text-sm text-primary underline underline-offset-4"
            >
              ← All transactions
            </Link>
          ) : (
            <>
              <p className="swell-page-kicker">Private to administrators</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Money
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                What we’ve put in, what’s still due, and where the money went.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/gear${suffix}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Gear
          </Link>
          {!entryId ? (
            <>
              <Button
                variant="outline"
                onClick={() => setManagingCategories((v) => !v)}
                disabled={!snapshot}
              >
                Manage categories
              </Button>
              <Button
                variant="outline"
                onClick={() => setManagingPlaybook((v) => !v)}
                disabled={demo}
              >
                Swell playbook
              </Button>
              <Button
                variant="outline"
                onClick={() => setIntake((v) => !v)}
                disabled={demo}
              >
                Receipt form
              </Button>
              <Button
                onClick={() => {
                  setCreating(true);
                  setDraft(undefined);
                  setOrder(undefined);
                }}
              >
                Record transaction
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {demo ? (
        <Alert>
          <AlertTitle>Local demo</AlertTitle>
          <AlertDescription>
            Sample entries stay in this browser. This view never reads or writes
            the live financial ledger.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Try again
          </Button>
        </Alert>
      ) : null}
      {loading && !snapshot ? <Skeleton className="h-64" /> : null}
      {!entryId && !demo && managingPlaybook ? (
        <MoneyPlaybook onClose={() => setManagingPlaybook(false)} />
      ) : null}
      {!entryId && !demo ? (
        <MoneyAgentChat
          key={admin.user?.uid}
          onRecorded={refresh}
        />
      ) : null}
      {!entryId && demo ? (
        <Alert>
          <AlertTitle>Ronnie-bot</AlertTitle>
          <AlertDescription>
            Sign in as a Money administrator to chat with Ronnie. The local demo cannot access private receipts or the live ledger.
          </AlertDescription>
        </Alert>
      ) : null}
      {snapshot && managingCategories ? (
        <MoneyCategories
          categories={snapshot.categories}
          demo={demo}
          onChanged={categoriesChanged}
          onClose={() => setManagingCategories(false)}
        />
      ) : null}
      {snapshot && (creating || activeDraft) ? (
        <MoneyEntryForm
          key={activeDraft?.id ?? order?.id ?? "new"}
          snapshot={snapshot}
          definitions={definitions}
          orders={orders}
          demo={demo}
          draft={activeDraft}
          order={order}
          onSaved={(next) => void saved(next)}
          onCancel={closeForm}
          onCategoriesChanged={categoriesChanged}
        />
      ) : null}
      {intake && !demo ? (
        <section className="swell-panel p-5">
          <h2 className="mb-4 text-lg font-semibold">Start with a receipt</h2>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="intake-text">
                Who paid, and what was it for?
              </FieldLabel>
              <Textarea
                id="intake-text"
                value={intakeText}
                onChange={(e) => setIntakeText(e.target.value)}
                placeholder="Ike bought four XLR cables for The Swell"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="intake-file">
                Receipt photo or PDF
              </FieldLabel>
              <Input
                id="intake-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              The receipt is read by the configured AI service. Review the
              extracted details before recording.
            </p>
            <div>
              <Button onClick={() => void readReceipt()} disabled={reading}>
                {reading ? "Reading receipt…" : "Read receipt"}
              </Button>
            </div>
          </FieldGroup>
        </section>
      ) : null}
      {snapshot && entryId ? (
        entry ? (
          <MoneyDetail
            key={entry.id}
            entry={entry}
            snapshot={snapshot}
            definitions={definitions}
            demo={demo}
            onChanged={refresh}
            onCategoriesChanged={categoriesChanged}
            onCorrect={(original) => {
              setDraft({
                id: "",
                status: "pending",
                text: "",
                questions: [],
                receiptIds: original.receiptIds,
                createdAt: Date.now(),
                input: {
                  ...original,
                  kind:
                    original.kind === "reversal" ? "purchase" : original.kind,
                  gear: [],
                  existingAssetIds: original.assetIds,
                  duplicateReason: "",
                },
              });
              setCreating(true);
            }}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Transaction not found</EmptyTitle>
              <EmptyDescription>
                Return to Money to find the transaction.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : null}
      {snapshot && !entryId ? (
        <>
          <section className="swell-panel overflow-hidden">
            <div className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Where we stand</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Outstanding advances, after partner transfers, refunds, and
                company repayments. Ownership remains 50/50.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Personally paid*
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Company repayments*
                  </TableHead>
                  <TableHead className="text-right">Still due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["ike", "chris"] as const).map((person) => {
                  const reversedIds = new Set(
                    snapshot.entries.flatMap((e) =>
                      e.reversesId ? [e.reversesId] : [],
                    ),
                  );
                  const active = snapshot.entries.filter(
                    (e) => e.kind !== "reversal" && !reversedIds.has(e.id),
                  );
                  const paid = active
                      .filter((e) => isExpenseKind(e.kind))
                      .reduce((n, e) => n + e.funding[person], 0),
                    repaid = active
                      .filter(
                        (e) => e.kind === "repayment" && e.person === person,
                      )
                      .reduce((n, e) => n + e.amountCents, 0);
                  return (
                    <TableRow key={person}>
                      <TableCell className="font-semibold">
                        {PEOPLE[person]}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {money(paid)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {money(repaid)}
                      </TableCell>
                      <TableCell className="text-right text-lg font-semibold tabular-nums">
                        {money(summary[person])}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-2 border-t bg-muted/30 p-5">
              <p className="font-medium">
                {!balance.difference
                  ? "You’re even."
                  : `${PEOPLE[balance.from]} can send ${PEOPLE[balance.from === "ike" ? "chris" : "ike"]} ${money(balance.transferCents)} to equalize${balance.remainderCents ? " within one cent" : ""}.`}
              </p>
              {balance.difference ? (
                <p className="text-sm text-muted-foreground">
                  Or {PEOPLE[balance.from]} can fund the next{" "}
                  {money(balance.difference)} of approved expenses, if the other
                  partner adds no more funding.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                *Personal payments and repayments are historical totals. Still
                due also includes deposits, refunds, and equalization transfers.
                Negative means money returned exceeds recorded funding.
              </p>
            </div>
          </section>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <p>
              Expenses less refunds:{" "}
              <strong className="tabular-nums">
                {money(summary.spending)}
              </strong>
            </p>
            <p>
              Recorded company cash:{" "}
              <strong className="tabular-nums">{money(summary.company)}</strong>
            </p>
            <p>
              Income received:{" "}
              <strong className="tabular-nums">{money(summary.income)}</strong>
            </p>
          </div>
          {snapshot.drafts.length ? (
            <section className="swell-panel p-5">
              <h2 className="font-semibold">
                Needs clarification{" "}
                <Badge variant="secondary">{snapshot.drafts.length}</Badge>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These drafts do not affect balances or create gear.
              </p>
              <div className="mt-3 flex flex-col divide-y">
                {snapshot.drafts.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {d.input?.description ?? d.text ?? "Receipt entry"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {d.questions.join(" ")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDraft(d);
                        setCreating(true);
                      }}
                    >
                      Review
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void dismiss(d.id)}
                      disabled={demo}
                    >
                      Dismiss
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Ledger</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={!rows.length}
                >
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </div>
            </div>
            <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_13rem_13rem]">
              <Field>
                <FieldLabel htmlFor="ledger-search">
                  Search transactions or gear codes
                </FieldLabel>
                <Input
                  id="ledger-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Merchant, rehearsal, 0012…"
                />
              </Field>
              <MoneySelect
                id="ledger-kind"
                label="Transaction type"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All transactions" },
                  ...Object.entries(KINDS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                  { value: "reversal", label: "Reversals" },
                ]}
              />
              <MoneySelect
                id="ledger-category"
                label="Category"
                value={categoryFilter || "__all__"}
                onChange={(value) =>
                  setCategoryFilter(value === "__all__" ? "" : value)
                }
                options={[
                  { value: "__all__", label: "All categories" },
                  ...[
                    ...new Set([
                      ...snapshot.categories
                        .filter((c) => !c.deleted)
                        .map((c) => c.name),
                      ...snapshot.entries
                        .map((e) => e.category)
                        .filter(Boolean),
                    ]),
                  ]
                    .sort((a, b) => a.localeCompare(b))
                    .map((name) => ({ value: name, label: name })),
                ]}
              />
            </FieldGroup>
            {rows.length ? (
              <div className="overflow-hidden rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell">
                        Date
                      </TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Gear codes
                      </TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">
                        Ike Δ
                      </TableHead>
                      <TableHead className="hidden text-right lg:table-cell">
                        Chris Δ
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {e.date}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {e.date}
                          </p>
                          <Link
                            href={`/money/${e.id}${suffix}`}
                            className="font-medium text-primary underline underline-offset-4"
                          >
                            {e.description}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {e.category ||
                              (e.kind === "reversal"
                                ? "Reversal"
                                : KINDS[e.kind])}
                            {e.category
                              ? ` · ${e.kind === "reversal" ? "Reversal" : KINDS[e.kind]}`
                              : ""}
                            {e.counterparty ? ` · ${e.counterparty}` : ""}
                            {snapshot.entries.some((r) => r.reversesId === e.id)
                              ? " · Reversed"
                              : ""}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 sm:hidden">
                            {e.assetTags.map((tag) => (
                              <Link
                                key={tag}
                                href={`/gear?asset=${tag}${demo ? "&demo=1" : ""}`}
                                className="font-mono text-xs text-primary underline"
                              >
                                {tag}
                              </Link>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex max-w-48 flex-wrap gap-1">
                            {e.assetTags.map((tag) => (
                              <Link
                                key={tag}
                                href={`/gear?asset=${tag}${demo ? "&demo=1" : ""}`}
                                className="rounded border px-1.5 py-0.5 font-mono text-xs text-primary"
                              >
                                {tag}
                              </Link>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(e.amountCents)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">
                          {money(e.effects.ike)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">
                          {money(e.effects.chris)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyTitle>
                    {snapshot.entries.length
                      ? "No matching transactions"
                      : "Start with what you’ve already paid"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {snapshot.entries.length
                      ? "Try a different search, category, or transaction type."
                      : "Record purchases, rehearsal payments, and transfers between you. Purchases can link existing gear codes or create new ones."}
                  </EmptyDescription>
                </EmptyHeader>
                {!snapshot.entries.length ? (
                  <Button onClick={() => setCreating(true)}>
                    Record the first transaction
                  </Button>
                ) : null}
              </Empty>
            )}
          </section>
          {unreconciled.length ? (
            <section className="swell-panel p-5">
              <details>
                <summary className="cursor-pointer font-semibold">
                  Gear orders to reconcile ({unreconciled.length})
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  These orders have no confirmed ledger purchase. Verify the
                  actual amount paid; product prices are not receipts.
                </p>
                <div className="mt-3 flex flex-col divide-y">
                  {unreconciled.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium">
                          {o.vendor} {o.orderNumber}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {o.orderedDate ?? "Date needed"} ·{" "}
                          {o.paymentStatus.replaceAll("_", " ")} ·{" "}
                          {o.lines.flatMap((l) => l.assetIds).length} gear items
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOrder(o);
                          setDraft(undefined);
                          setCreating(true);
                        }}
                      >
                        Record payment
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
