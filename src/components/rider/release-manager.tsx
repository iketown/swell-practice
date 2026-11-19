"use client";
import { useState, type FormEvent } from "react";
import { riderRequest } from "@/lib/rider/version-client";
import { checkHref, type RiderRelease } from "@/lib/rider/releases";
import {
  standardVersionId,
  type VersionList,
  type VersionSummary,
} from "@/lib/rider/versions";

type Selection = Pick<VersionSummary, "id" | "name" | "revision">;
function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}
function suggestedCode(item: Selection, rows: RiderRelease[]) {
  const [year, month, day] = localDate().split("-");
  const base =
    item.id === standardVersionId
      ? [month, day, year.slice(-2)].join(".")
      : item.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 50)
          .replace(/^-|-$/g, "") || "rider";
  let code = base;
  for (let n = 2; rows.some((row) => row.code === code); n++)
    code = base + "-" + n;
  return code;
}

export function IssueDialog({
  item,
  list,
  close,
  saved,
}: {
  item: Selection;
  list: VersionList;
  close: () => void;
  saved: (message: string) => void;
}) {
  const issued = list.releases.find(
    (row) => row.id === item.id && row.revision === item.revision,
  );
  const [code, setCode] = useState(
    issued?.code ?? suggestedCode(item, list.releases),
  );
  const [replace, setReplace] = useState<string[]>([]);
  const [makeDefault, setDefault] = useState(
    !list.current.releaseNumber && item.id === standardVersionId,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const candidates = list.releases.filter(
    (row) =>
      row.id === item.id && row.revision < item.revision && !row.replacement,
  );
  const current = list.releases.find(
    (row) =>
      list.current.releaseNumber &&
      row.id === list.current.id &&
      row.revision === list.current.revision,
  );
  const inheritsDefault = !!current && replace.includes(current.code);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await riderRequest<{ code: string }>("", {
        action: "issue",
        id: item.id,
        revision: item.revision,
        code,
        replace,
        makeDefault,
        publicRevision: list.current.publicRevision,
      });
      saved(
        "Issued rider " + result.code + " is available to print and share.",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <dialog
      className="version-dialog release-dialog"
      aria-label="Issue rider"
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
    >
      <form onSubmit={submit}>
        <h2>{issued ? "Manage issued rider" : "Issue rider"}</h2>
        <p>
          {item.name} · Saved revision {item.revision}
        </p>
        <label className="rider-field">
          Permanent edition code
          <input
            value={code}
            disabled={!!issued}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            required
            maxLength={64}
          />
        </label>
        <p>Recipients can open this edition using its QR code or link.</p>
        {candidates.length > 0 && (
          <fieldset>
            <legend>Require a reprint for these copies</legend>
            <p>Leave all unchecked for a compatible change.</p>
            {candidates.map((row) => (
              <label key={row.code}>
                <input
                  type="checkbox"
                  checked={replace.includes(row.code)}
                  onChange={(e) =>
                    setReplace(
                      e.target.checked
                        ? [...replace, row.code]
                        : replace.filter((code) => code !== row.code),
                    )
                  }
                />
                {row.code} · Rev {row.revision}
              </label>
            ))}
          </fieldset>
        )}
        <label>
          <input
            type="checkbox"
            checked={makeDefault || current?.code === code || inheritsDefault}
            disabled={current?.code === code || inheritsDefault}
            onChange={(e) => setDefault(e.target.checked)}
          />
          Use as the public default at /stage-plot
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="version-actions">
          <button type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : issued ? "Save changes" : "Issue rider"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function ReleaseRegister({
  list,
  manage,
  saved,
}: {
  list: VersionList;
  manage: (row: RiderRelease) => void;
  saved: (message: string) => void;
}) {
  const [filter, setFilter] = useState("All editions");
  const [sending, setSending] = useState<{
    code: string;
    operationId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sending) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await riderRequest("", {
        action: "sent",
        ...sending,
        date: String(fields.get("date")),
        recipient: String(fields.get("recipient")),
      });
      setSending(null);
      saved("Delivery recorded.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = list.releases
    .filter((row) => {
      if (filter === "Sent")
        return list.deliveries.some((d) => d.code === row.code);
      if (filter === "Needs reprint") return !!row.replacement;
      if (filter === "Still okay") return !row.replacement;
      return true;
    })
    .reverse();
  return (
    <section className="release-register">
      <h2>Issued riders</h2>
      <label>
        Show{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {["All editions", "Sent", "Still okay", "Needs reprint"].map(
            (option) => (
              <option key={option}>{option}</option>
            ),
          )}
        </select>
      </label>
      {!rows.length && (
        <p>
          {list.releases.length
            ? "No editions match."
            : "Choose Issue rider beside a saved setup to create its first edition."}
        </p>
      )}
      {rows.map((row) => (
        <div className="release-entry" key={row.code}>
          <div className="version-main">
            <div>
              <strong>{row.name}</strong> · Rev {row.revision} · {row.date}
              <br />
              <a href={checkHref(row.code)}>{row.code}</a> ·{" "}
              {row.replacement ? (
                <>
                  Needs reprint →{" "}
                  <a href={checkHref(row.replacement)}>{row.replacement}</a>
                </>
              ) : (
                "Still okay"
              )}
            </div>
            <div className="version-actions">
              {!row.replacement && (
                <button onClick={() => manage(row)}>Manage</button>
              )}
              <button
                onClick={() => {
                  setError("");
                  setSending({
                    code: row.code,
                    operationId: crypto.randomUUID(),
                  });
                }}
              >
                Log delivery
              </button>
            </div>
          </div>
          {list.deliveries
            .filter((d) => d.code === row.code)
            .map((d, i) => (
              <p key={i}>
                Sent {d.date} · {d.recipient}
              </p>
            ))}
        </div>
      ))}
      {sending && (
        <dialog
          className="version-dialog"
          aria-label="Log delivery"
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setSending(null);
          }}
        >
          <form onSubmit={logDelivery}>
            <h2>Log delivery · {sending.code}</h2>
            <label className="rider-field">
              Venue or recipient
              <input name="recipient" required maxLength={120} autoFocus />
            </label>
            <label className="rider-field">
              Date sent
              <input
                type="date"
                name="date"
                required
                defaultValue={localDate()}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="version-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setSending(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Record delivery
              </button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
