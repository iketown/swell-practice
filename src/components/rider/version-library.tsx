"use client";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Copy,
  ArrowLeft,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { adminEmails } from "@/lib/firebase";
import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { riderRequest } from "@/lib/rider/version-client";
import {
  versionHref,
  type VersionList,
  type VersionSummary,
  type RevisionSummary,
} from "@/lib/rider/versions";
import type { Published } from "@/lib/rider/model";
import { ReleaseRegister, IssueDialog } from "./release-manager";
import { RiderWorkspace } from "./rider-workspace";

type Selection = Pick<VersionSummary, "id" | "name" | "revision">;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Could not load the rider library.";
type Location = { version?: string; revision?: string };

export function VersionLibrary({ version, revision }: Location) {
  const admin = useAdmin();
  const [login, setLogin] = useState(false);
  if (
    admin.user?.email &&
    adminEmails().includes(admin.user.email.toLowerCase())
  )
    return (
      <LibraryBody
        key={admin.user.uid}
        uid={admin.user.uid}
        version={version}
        revision={revision}
      />
    );
  return (
    <main className="rider">
      <div className="rider-screen version-library">
        <a href="/stage-plot" className="version-back">
          <ArrowLeft /> Public stage plot
        </a>
        <h1>Stage plot versions</h1>
        {admin.loading ? (
          <p role="status">Checking access…</p>
        ) : (
          <>
            <p>
              Sign in with a Swell administrator account to manage rider
              versions.
            </p>
            <button className="primary" onClick={() => setLogin(true)}>
              Admin sign in
            </button>
          </>
        )}
        <AdminSignInDialog
          open={login}
          onOpenChange={setLogin}
          title="Stage plot versions"
          description="Sign in with a Swell administrator account."
        />
      </div>
    </main>
  );
}

function LibraryBody({ uid, version, revision }: Location & { uid: string }) {
  const [list, setList] = useState<VersionList | null>(null);
  const [record, setRecord] = useState<Published | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<(Selection & { newId: string }) | null>(
    null,
  );
  const [name, setName] = useState("");
  const [publish, setPublish] = useState<Selection | null>(null);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (version) query.set("id", version);
    if (revision !== undefined) query.set("revision", revision);
    const request = version
      ? riderRequest<Published>("?" + query).then((data) => {
          if (active) setRecord(data);
        })
      : riderRequest<VersionList>().then((data) => {
          if (active) setList(data);
        });
    request.catch((e) => {
      if (active) setError(errorText(e));
    });
    return () => {
      active = false;
    };
  }, [version, revision, reload]);
  function startCopy(target: Selection) {
    setCopy({ ...target, newId: crypto.randomUUID() });
    setName((target.name + " copy").slice(0, 80));
    setPublish(null);
    setError("");
    setMessage("");
  }
  async function duplicate() {
    if (!copy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await riderRequest<{ id: string }>("", {
        action: "duplicate",
        id: copy.id,
        revision: copy.revision,
        name: name.trim(),
        newId: copy.newId,
      });
      window.location.assign(versionHref(result.id));
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  function saved(message: string) {
    setError("");
    setMessage(message);
    setPublish(null);
    setReload((n) => n + 1);
  }
  if (version && record)
    return (
      <RiderWorkspace
        initial={record}
        privateMode={revision === undefined ? "edit" : "history"}
        editorUid={uid}
      />
    );
  function actions(item: Selection, historical = false) {
    const live =
      !!list?.current.releaseNumber &&
      list.current.id === item.id &&
      list.current.revision === item.revision;
    return (
      <div className="version-actions">
        <a
          className="version-button"
          href={versionHref(item.id, historical ? item.revision : undefined)}
        >
          {historical ? "View revision" : "Edit plot"}
        </a>
        <button disabled={busy} onClick={() => startCopy(item)}>
          <Copy /> Duplicate
        </button>
        {live && (
          <span className="default-mark">
            <Check /> Public default
          </span>
        )}
        {!list?.releases.some(
          (row) =>
            row.id === item.id &&
            row.revision === item.revision &&
            row.replacement,
        ) && (
          <button
            disabled={busy}
            onClick={() => {
              setCopy(null);
              setPublish(item);
            }}
          >
            {list?.releases.some(
              (row) => row.id === item.id && row.revision === item.revision,
            )
              ? "Manage edition"
              : "Issue rider"}
          </button>
        )}
      </div>
    );
  }
  return (
    <main className="rider">
      <div className="rider-screen version-library">
        <a className="version-back" href="/stage-plot">
          <ArrowLeft /> Public stage plot
        </a>
        <h1>Stage plot versions</h1>
        {list && (
          <p className="version-intro">
            {list.current.releaseNumber ? (
              <>
                Public now{" "}
                <strong>
                  {list.versions.find((v) => v.id === list.current.id)?.name} ·
                  Rev {list.current.revision}
                </strong>{" "}
                <a href="/stage-plot" aria-label="Open public rider">
                  <ArrowUpRight />
                </a>
              </>
            ) : (
              "The public default is a working draft."
            )}
          </p>
        )}
        {message && (
          <p role="status" className="rider-message">
            {message}
          </p>
        )}
        {error && (
          <div role="alert" className="rider-message">
            {error}{" "}
            <button
              onClick={() => {
                setError("");
                setReload((n) => n + 1);
              }}
            >
              Reload
            </button>
          </div>
        )}
        {!list && !error && (
          <p role="status">Loading {version ? "revision" : "versions"}…</p>
        )}
        {publish && list && (
          <IssueDialog
            item={publish}
            list={list}
            close={() => setPublish(null)}
            saved={saved}
          />
        )}
        {copy && (
          <dialog
            ref={(node) => {
              if (node && !node.open) node.showModal();
            }}
            aria-label="Duplicate version"
            className="version-dialog"
            onCancel={(e) => {
              if (busy) e.preventDefault();
              else {
                setCopy(null);
                setPublish(null);
              }
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                duplicate();
              }}
            >
              <h2>Duplicate version</h2>
              <p>
                Copy {copy.name} · Rev {copy.revision}
              </p>
              <label className="rider-field">
                Version name
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <div className="version-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCopy(null)}
                >
                  Cancel
                </button>
                <button className="primary" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create copy"}
                </button>
              </div>
            </form>
          </dialog>
        )}
        {list && (
          <ReleaseRegister list={list} manage={setPublish} saved={saved} />
        )}
        <h2>Saved setups</h2>
        {list?.versions.map((item) => (
          <section className="version-row" key={item.id}>
            <div className="version-main">
              <div>
                <h2>{item.name}</h2>
                <p>
                  {list.current.releaseNumber
                    ? "Rev " + item.revision + " · "
                    : "Draft · "}
                  Saved {item.date}
                </p>
              </div>
              {actions(item)}
            </div>
            <RevisionHistory
              key={item.revision}
              item={item}
              actions={actions}
            />
          </section>
        ))}
      </div>
    </main>
  );
}

function RevisionHistory({
  item,
  actions,
}: {
  item: VersionSummary;
  actions: (item: Selection, historical: boolean) => React.ReactNode;
}) {
  const [rows, setRows] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setRows(
        await riderRequest<RevisionSummary[]>(
          "?id=" + encodeURIComponent(item.id) + "&history=1",
        ),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <details
      className="revision-history"
      onToggle={(e) => {
        if (e.currentTarget.open && !rows) load();
      }}
    >
      <summary>
        <ChevronDown /> Revision history
      </summary>
      {error ? (
        <p role="alert">
          {error} <button onClick={load}>Retry</button>
        </p>
      ) : !rows ? (
        <p>Loading revisions…</p>
      ) : (
        rows.map((r) => (
          <div className="history-row" key={r.revision}>
            <span>
              <strong>Rev {r.revision}</strong> · {r.date}
            </span>
            {actions({ ...item, revision: r.revision }, true)}
          </div>
        ))
      )}
    </details>
  );
}
