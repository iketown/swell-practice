"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { moneyRequest } from "@/lib/money/client";
import { PEOPLE } from "@/lib/money/domain";
import type { PlaybookAction, PlaybookRule, PlaybookSnapshot } from "@/lib/money/playbook";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function MoneyPlaybook({ onClose }: { onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<PlaybookSnapshot>();
  const [editing, setEditing] = useState<PlaybookRule | null>(null);
  const [title, setTitle] = useState("");
  const [rule, setRule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(async () => {
    try {
      setSnapshot(await moneyRequest<PlaybookSnapshot>("/api/money/playbook"));
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  function edit(item: PlaybookRule) {
    setEditing(item);
    setTitle(item.title);
    setRule(item.rule);
    setError("");
  }
  function clear() {
    setEditing(null);
    setTitle("");
    setRule("");
  }
  async function save(action: PlaybookAction) {
    setBusy(true);
    setError("");
    try {
      await moneyRequest("/api/money/playbook", { method: "PATCH", body: JSON.stringify(action) });
      clear();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = snapshot?.rules.filter((item) => !item.archived).sort((a, b) => a.title.localeCompare(b.title)) || [];
  const archived = snapshot?.rules.filter((item) => item.archived).sort((a, b) => a.title.localeCompare(b.title)) || [];
  return (
    <section className="swell-panel p-5 sm:p-6" aria-label="Swell playbook" id="swell-playbook">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Swell playbook</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Standing policies and customary rates that Ronnie can remember and update. Each change has a history. Recorded payments and balances still come from the ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>Refresh</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      {error ? <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="mt-5 rounded-lg border bg-muted/10 p-4">
        <h3 className="font-medium">{editing ? `Edit ${editing.title}` : "Add a policy"}</h3>
        <div className="mt-3 grid gap-3">
          <Field>
            <FieldLabel htmlFor="playbook-title">Title</FieldLabel>
            <Input id="playbook-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} disabled={busy} placeholder="Meals, rehearsal pay, travel…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="playbook-rule">Standing rule</FieldLabel>
            <Textarea id="playbook-rule" value={rule} onChange={(event) => setRule(event.target.value)} maxLength={1200} rows={3} disabled={busy} placeholder="Write the rule and any exceptions clearly." />
          </Field>
          <div className="flex gap-2">
            <Button type="button" disabled={busy || title.trim().length < 3 || rule.trim().length < 5} onClick={() => void save(editing
              ? { action: "update", operationId: crypto.randomUUID(), id: editing.id, revision: editing.revision, title, rule }
              : { action: "create", operationId: crypto.randomUUID(), title, rule })}>
              {busy ? "Saving…" : editing ? "Save change" : "Add to playbook"}
            </Button>
            {editing ? <Button type="button" variant="ghost" onClick={clear} disabled={busy}>Cancel</Button> : null}
          </div>
        </div>
      </div>
      {!snapshot ? <p className="mt-4 text-sm text-muted-foreground">Loading playbook…</p> : null}
      {snapshot && !active.length ? <p className="mt-5 text-sm text-muted-foreground">No standing rules yet. You can add one here or ask Ronnie to remember a clear policy in chat.</p> : null}
      <ul className="mt-4 divide-y">
        {active.map((item) => (
          <li key={item.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.rule}</p>
                <p className="mt-2 text-xs text-muted-foreground">Updated {dateTime.format(item.updatedAt)} by {PEOPLE[item.updatedByPerson]}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(item)} disabled={busy}>Edit</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void save({ action: "archive", operationId: crypto.randomUUID(), id: item.id, revision: item.revision })} disabled={busy}>Archive</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {archived.length ? (
        <details className="mt-4 border-t pt-4" open={showArchived} onToggle={(event) => setShowArchived(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">Archived rules ({archived.length})</summary>
          <ul className="mt-3 space-y-3">
            {archived.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                <div><p className="font-medium">{item.title}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.rule}</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => void save({ action: "restore", operationId: crypto.randomUUID(), id: item.id, revision: item.revision })} disabled={busy}>Restore</Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {snapshot?.edits.length ? (
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">Change history ({snapshot.edits.length} recent)</summary>
          <ol className="mt-3 space-y-3">
            {snapshot.edits.map((change) => (
              <li key={change.id} className="border-l-2 pl-3 text-sm">
                <p className="font-medium">{change.after.title} · {change.action}</p>
                <p className="text-xs text-muted-foreground">{dateTime.format(change.changedAt)} · {PEOPLE[change.changedByPerson]} via {change.source === "chat" ? "Ronnie" : "form"}</p>
                {change.before && change.before.rule !== change.after.rule ? <p className="mt-1 text-xs text-muted-foreground">Before: {change.before.rule}</p> : null}
                <p className="mt-1 whitespace-pre-wrap">After: {change.after.rule}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
