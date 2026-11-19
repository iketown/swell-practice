"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ImageLogo from "next/image";
import { auth, adminEmails } from "@/lib/firebase";
import { useAdmin } from "@/hooks/use-admin";
import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  ChevronDown,
  ClipboardList,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Printer,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";
import {
  canonical,
  byNumber,
  providers,
  quantityText,
  rollup,
  micFor,
  plotSchema,
  type Plot,
  type Published,
} from "@/lib/rider/model";
import { moveStandPair } from "@/lib/rider/instrument-stands";
import { boxFrame, boxColors } from "@/lib/rider/stage-box";
import { riderRequest } from "@/lib/rider/version-client";
import { standardVersionId, versionHref } from "@/lib/rider/versions";
import { checkHref } from "@/lib/rider/releases";
import {
  stageViews,
  viewLayers,
  type StageView,
  defaultLayers,
  layerLabels,
  type PlotLayers,
} from "@/lib/rider/plot-layers";
import {
  cablePosition,
  drawCables,
  insertNode,
} from "@/lib/rider/cable-routing";
import {
  isEquipmentObject,
  reconcileEquipment,
  linkedEquipment,
  allocationPoints,
} from "@/lib/rider/equipment";
import { cableName, isCableAllocation } from "@/lib/rider/cable-manifest";
import { updateEstimatedInputXlr } from "@/lib/rider/input-xlr";
import { CablePatchSchedule } from "./cable-patch-schedule";
import { StandPlacementPanel, isStandPlacementItem } from "./stand-placement";
import { StageCanvas } from "./stage-canvas";
import { screenStageSpacing } from "@/lib/rider/screen-layout";
import { StageViewport } from "./stage-viewport";
import { SupplierFeedback } from "./supplier-feedback";
import { EditorDialog, type EditTarget } from "./editor-dialog";
import {
  PrintPacket,
  riderPages,
  setupPages,
  type Packet,
  type RiderPage,
} from "./print-packet";

const kinds = [
  "Input key",
  "Equipment",
  "Advance notes",
  "Cable runs",
] as const;
type Tab = (typeof kinds)[number];
const fail = (e: unknown) =>
  e instanceof Error ? e.message : "Could not complete the action.";
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
function restoreDraft(record: Published, uid: string) {
  const prefix = "swell-stage-plot:draft:" + uid;
  try {
    const saved =
      localStorage.getItem(prefix + ":" + record.versionId) ??
      (record.versionId === standardVersionId
        ? localStorage.getItem(prefix)
        : null);
    if (saved) {
      const data = JSON.parse(saved);
      const parsed = plotSchema.safeParse(data.plot);
      if (parsed.success && Number.isInteger(data.revision)) {
        return { ...record, revision: data.revision, plot: parsed.data };
      }
    }
  } catch {
    /* Browser storage may be unavailable. */
  }
  return record;
}

export function RiderWorkspace({
  initial,
  privateMode,
  editorUid = "",
  issuedPacket,
}: {
  initial: Published;
  privateMode?: "edit" | "history";
  editorUid?: string;
  issuedPacket?: Packet;
}) {
  const admin = useAdmin();
  const allowed =
    !!admin.user?.email &&
    adminEmails().includes(admin.user.email.toLowerCase());
  const [record, setRecord] = useState(initial),
    [draft, setDraft] = useState<Published | null>(() =>
      privateMode === "edit" ? restoreDraft(initial, editorUid) : null,
    );
  const editing = !!draft && allowed && editorUid === admin.user?.uid;
  const unsaved = editing && draft !== record;
  const p = useMemo(
    () => {
      const plot = reconcileEquipment(editing ? draft!.plot : record.plot);
      return editing ? updateEstimatedInputXlr(plot) : plot;
    },
    [editing, draft, record],
  );
  const [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState<Tab>("Input key");
  const [selected, select] = useState<string | null>(null),
    [hover, setHover] = useState<string | null>(null),
    [target, setTarget] = useState<EditTarget | null>(null);
  const [view, setView] = useState<StageView>("Overview");
  const [layers, setLayers] = useState(defaultLayers),
    [routeId, setRouteId] = useState<string | null>(null),
    [packet, setPacket] = useState<Packet>(issuedPacket ?? "Full rider"),
    [provider, setProvider] = useState("All suppliers"),
    [station, setStation] = useState("All stations");
  const [equipmentHover, setEquipmentHover] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null),
    [confirmReset, setConfirmReset] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [pages, setPages] = useState<readonly RiderPage[]>(privateMode ? [...riderPages, ...setupPages] : issuedPacket === "Backline" ? ["Stage plot", "Equipment advance"] : riderPages);
  const released = !!record.releaseNumber || !!record.releaseCode;
  const staleDraft = released && !!draft && draft.revision !== record.revision;
  const printOptions = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const panel = printOptions.current;
      if (
        panel?.open &&
        event.target instanceof Node &&
        !panel.contains(event.target)
      )
        panel.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  function choosePacket(next: Packet) {
    setPacket(next);
    setPages(
      next === "Backline" ? ["Stage plot", "Equipment advance"] : privateMode ? [...riderPages, ...setupPages] : riderPages,
    );
  }
  function togglePage(page: RiderPage) {
    setPages((current) => {
      if (!current.includes(page)) return [...current, page];
      return current.length > 1
        ? current.filter((value) => value !== page)
        : current;
    });
  }
  const legacyKey = "swell-stage-plot:draft:" + editorUid;
  const storageKey = legacyKey + ":" + initial.versionId;
  useEffect(() => {
    if (issuedPacket || privateMode || !released) return;
    async function refresh() {
      try {
        const res = await fetch("/api/stage-plot", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Published;
        setRecord((prev) => (next.revision > prev.revision ? next : prev));
      } catch {
        /* A visible published revision stays usable offline. */
      }
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [issuedPacket, privateMode, released]);
  useEffect(() => {
    if (!editing || !draft || draft === record) return;
    const persist = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        setMessage(
          "Browser storage is full. Save or download your draft before leaving.",
        );
      }
    };
    const timer = setTimeout(persist, 180);
    window.addEventListener("pagehide", persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", persist);
    };
  }, [draft, editing, storageKey, record]);
  async function edit(fresh = false) {
    const editor = auth?.currentUser;
    if (!editor?.email || !adminEmails().includes(editor.email.toLowerCase())) {
      setLogin(true);
      if (editor)
        setMessage("This account does not have stage plot editing access.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (!privateMode) {
        const response = await fetch("/api/stage-plot", { cache: "no-store" });
        if (!response.ok) throw Error("Could not load the current default.");
        const publicRider: Published = await response.json();
        window.location.assign(
          versionHref(publicRider.versionId ?? standardVersionId),
        );
        return;
      }
      const latest = await riderRequest<Published>(
        "?id=" + encodeURIComponent(initial.versionId!),
      );
      setRecord(latest);
      if (fresh) {
        localStorage.removeItem(storageKey);
        if (initial.versionId === standardVersionId)
          localStorage.removeItem(legacyKey);
      }
      setDraft(fresh ? latest : restoreDraft(latest, editorUid));
      setConfirmReset(false);
      select(null);
    } catch (e) {
      setMessage(fail(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveRevision() {
    if (!editing || !draft) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await riderRequest<Published>("", {
        action: "save",
        id: initial.versionId!,
        revision: draft.revision,
        plot: draft.plot,
      });
      setRecord(next);
      setDraft(next.releaseNumber ? null : next);
      localStorage.removeItem(storageKey);
      if (initial.versionId === standardVersionId)
        localStorage.removeItem(legacyKey);

      select(null);
      setMessage(
        next.releaseNumber
          ? "Revision " + next.revision + " saved."
          : "Draft saved.",
      );
    } catch (e) {
      setMessage(fail(e));
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    if (printOptions.current) printOptions.current.open = false;
    setPrintBusy(true);
    try {
      if (issuedPacket && initial.releaseCode) {
        const res = await fetch("/api/stage-plot?code=" + encodeURIComponent(initial.releaseCode), { cache: "no-store" });
        if (res.status === 409 || res.status === 404) {
          window.location.assign(checkHref(initial.releaseCode, packet));
          return;
        }
        if (!res.ok) throw Error("Could not verify this edition. Please try printing again.");
      } else if (!privateMode && released)
        try {
          const res = await fetch("/api/stage-plot", {
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) throw Error();
          const latest = (await res.json()) as Published;
          setRecord(latest);
        } catch {
          setMessage(
            "Printing the last loaded published revision. The latest online revision could not be checked.",
          );
        }
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      await document.fonts.ready;
      await Promise.all(
        [
          ...document.querySelectorAll<SVGImageElement>(".rider-print image"),
        ].map((el) => {
          const img = new Image();
          img.src = el.href.baseVal;
          return img.decode().catch(() => {});
        }),
      );
      window.print();
    } catch (e) {
      setMessage(fail(e));
    } finally {
      setPrintBusy(false);
    }
  }
  function change(plot: Plot, id?: string, nextTarget?: EditTarget) {
    if (editing) {
      setDraft((prev) => (prev ? { ...prev, plot } : prev));
      select(id ?? null);
    }
    setTarget(nextTarget ?? null);
  }
  function move(id: string, x: number, y: number) {
    setDraft((prev) => {
      if (!prev || !editing) return prev;
      const p = prev.plot;
      const box = p.stageBoxes.find((b) => b.id === id);
      if (box) {
        const frame = boxFrame(
          p,
          { ...box, x, y },
          p.inputs.filter((i) => i.stageBoxId === id),
        );
        return {
          ...prev,
          plot: {
            ...p,
            stageBoxes: p.stageBoxes.map((b) =>
              b.id === id
                ? {
                    ...b,
                    x: Math.round(frame.x * 100) / 100,
                    y: Math.round(frame.y * 100) / 100,
                  }
                : b,
            ),
          },
        };
      }
      const clip = (n: number, max: number) =>
        Math.round(Math.min(Math.max(0, max), Math.max(0, n)) * 100) / 100;
      return {
        ...prev,
        plot: {
          ...p,
          objects: moveStandPair(p, id, x, y),
          inputs: p.inputs.map((i) =>
            i.id === id
              ? {
                  ...i,
                  x: Math.max(0.4, clip(x, p.width + 4.6)),
                  y: Math.max(0.5, clip(y, p.depth - 0.5)),
                }
              : i,
          ),
        },
      };
    });
  }
  function downloadDraft() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ ...draft, plot: p }, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "swell-stage-plot-draft.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const internal = !!privateMode && allowed;
  const visibleLayers = viewLayers(internal ? view : "Overview", layers);
  const cableView = internal && visibleLayers.cables;
  const route = p.cables.find((c) => c.id === routeId);
  function toggleLayer(key: keyof PlotLayers) {
    const visible = !layers[key];
    setLayers((prev) => ({ ...prev, [key]: visible }));
    if (key === "cables") setTab(visible ? "Cable runs" : "Input key");
  }
  function viewCable(id: string) {
    setRouteId(id);
    setView("Cable patch and routing");
    setLayers((prev) => (prev.cables ? prev : { ...prev, cables: true }));
    setTab("Cable runs");
  }
  function updateRouting(plot: Plot) {
    if (!editing) return;
    const check = plotSchema.safeParse(plot);
    if (!check.success) {
      setMessage(check.error.issues[0].message);
      return;
    }
    setDraft((prev) => (prev ? { ...prev, plot } : prev));
  }
  function addBend() {
    if (!editing || !route) return;
    const drawing = drawCables(p).find((r) => r.run.id === route.id);
    if (!drawing) return;
    const lengths = drawing.legs.map(({ a, b }) =>
      Math.hypot(b.x - a.x, b.y - a.y),
    );
    const index = lengths.indexOf(Math.max(...lengths));
    const { a, b, span } = drawing.legs[index] ?? {
      a: drawing.from,
      b: drawing.to,
      span: 0,
    };
    updateRouting(
      insertNode(p, route.id, span, {
        id: crypto.randomUUID(),
        ...cablePosition(p, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        ...(a.x !== b.x && a.y !== b.y ? { diagonal: true } : {}),
      }),
    );
  }
  const active = hover ?? selected,
    source = p.inputs.find((i) => i.id === active);

  const boxesById = new Map(p.stageBoxes.map((b) => [b.id, b]));
  const ordered = byNumber(p),
    stations = [
      ...new Set(p.gear.map((g) => g.station).filter(Boolean)),
    ].sort();
  const totals = rollup(
    p.gear.filter(
      (g) =>
        (provider === "All suppliers" || g.provider === provider) &&
        (station === "All stations" || g.station === station),
    ),
  );
  const stageEquipment = [
    ...p.objects.filter(isEquipmentObject).map((o) => ({
      id: o.id,
      label: o.asset === "sam" ? "Drum kit" : o.label,
      kind: "object" as const,
    })),
    ...p.stageBoxes.map((b) => ({
      id: b.id,
      label: "Stage box · " + b.label,
      kind: "box" as const,
    })),
  ];
  const equipmentScroll = useRef<HTMLDivElement>(null);
  const [equipmentTarget, setEquipmentTarget] = useState<{ id: string } | null>(
    null,
  );
  useEffect(() => {
    if (tab !== "Equipment" || !equipmentTarget) return;
    const panel = equipmentScroll.current;
    if (!panel) return;
    const row = [
      ...panel.querySelectorAll<HTMLElement>(
        "[data-equipment-object], [data-equipment-allocation]",
      ),
    ].find(
      (row) =>
        row.dataset.equipmentObject === equipmentTarget.id ||
        row.dataset.equipmentAllocation === equipmentTarget.id,
    );
    if (!row) return;
    const a = row.getBoundingClientRect(),
      b = panel.getBoundingClientRect();
    if (a.top < b.top || a.bottom > b.bottom)
      panel.scrollTop += a.top - b.top - 8;
  }, [equipmentTarget, tab, expanded]);
  function setSupplier(gearId: string, value: string) {
    change({
      ...p,
      gear: p.gear.map((g) =>
        g.id === gearId
          ? {
              ...g,
              provider: value as typeof g.provider,
              confirmed: g.confirmed && g.provider === value,
            }
          : g,
      ),
    });
  }
  function equipmentEvents(ids: string[]) {
    return {
      onMouseEnter: () => setEquipmentHover(ids),
      onMouseLeave: () => setEquipmentHover([]),
      onFocusCapture: () => setEquipmentHover(ids),
      onBlurCapture: () => setEquipmentHover([]),
    };
  }
  function choose(id: string) {
    if (id && view === "Stand placement" && !p.objects.some((o) => o.id === id && isStandPlacementItem(o))) return;
    select(id);
    const point = stageEquipment.find((o) => o.id === id);
    const run = p.cables.find((c) => c.id === id);
    const entries = run
      ? p.gear.filter((g) => g.id === run.gearId)
      : linkedEquipment(p, id);
    if (point || entries.length) {
      setProvider("All suppliers");
      setStation("All stations");
      setTab("Equipment");
      setEquipmentTarget({ id: point ? id : entries[0].id });
      if (!point) {
        setExpanded(
          rollup(p.gear).find((g) =>
            g.allocations.some((a) => a.id === entries[0].id),
          )!.allocations[0].id,
        );
      }
    } else if (p.inputs.some((i) => i.id === id)) setTab("Input key");
  }
  return (
    <main className={"rider" + (tab === "Equipment" ? " equipment-view" : "")}>
      <div className="rider-screen">
        {editing && (
          <SupplierFeedback
            plot={p}
            onHighlight={setEquipmentHover}
            onReview={(id) => {
              setProvider("All suppliers");
              setStation("All stations");
              setTab("Equipment");
              setExpanded(id);
              setEquipmentTarget({ id });
            }}
          />
        )}
        {privateMode && (
          <a className="version-back" href="/stage-plot/list">
            ← Stage plot versions
          </a>
        )}
        <header className="rider-top">
          <div className="rider-heading">
            <h1>Stage Plot</h1>
            <p>
              {privateMode || issuedPacket ? record.versionName + " · " : ""}
              {p.configuration} · {p.width} × {p.depth} ft
            </p>
          </div>
          <div className="rider-rev">
            <span>
              Revised{" "}
              <time dateTime={record.date}>{dateLabel(record.date)}</time>
            </span>
            <small>
              {issuedPacket ? "Issued · " + record.releaseCode : !released
                ? "Version 1 draft"
                : privateMode
                  ? (editing ? "Editing" : "Saved") +
                    " · Rev " +
                    (editing ? draft!.revision : record.versionRevision)
                  : "Issued · " + record.releaseCode}
            </small>
          </div>
          <div className="rider-print-control">
            <button
              className="primary print-button"
              disabled={printBusy}
              onClick={print}
            >
              <Printer aria-hidden="true" />
              {printBusy
                ? "Preparing…"
                : privateMode
                  ? unsaved
                    ? "Print current draft"
                    : released
                      ? "Print saved revision"
                      : "Print saved draft"
                  : "Print rider"}
            </button>
            <details
              ref={printOptions}
              className="print-picker"
              onKeyDown={(e) => {
                if (e.key === "Escape" && e.currentTarget.open) {
                  e.preventDefault();
                  e.currentTarget.open = false;
                  e.currentTarget.querySelector("summary")?.focus();
                }
              }}
              onBlur={(e) => {
                if (
                  e.relatedTarget instanceof Node &&
                  !e.currentTarget.contains(e.relatedTarget)
                )
                  e.currentTarget.open = false;
              }}
            >
              <summary
                aria-label="Choose rider pages"
                title="Choose rider pages"
              >
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="print-menu">
                <fieldset>
                  <legend>Pages to print</legend>
                  {[...riderPages, ...(privateMode && allowed ? setupPages : [])].map((page) => (
                    <label key={page}>
                      <input
                        type="checkbox"
                        checked={pages.includes(page)}
                        disabled={pages.length === 1 && pages.includes(page)}
                        onChange={() => togglePage(page)}
                      />
                      {page}
                    </label>
                  ))}
                </fieldset>
                <label className="rider-field">
                  <span>Recipient</span>
                  <select
                    aria-label="Recipient"
                    value={packet}
                    onChange={(e) => choosePacket(e.target.value as Packet)}
                  >
                    {["Full rider", "Audio production", "Backline"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </div>
        </header>
        {message && (
          <div className="rider-message" role="status">
            {message}
          </div>
        )}
        {editing && staleDraft && (
          <p className="rider-message" role="status">
            Your browser draft is based on an older revision. Download it or
            load the latest revision in Draft options.
          </p>
        )}
        {editing && (
          <div className="rider-tools">
            <button onClick={() => setTarget({ kind: "object" })}>
              <Plus />
              Stage item
            </button>
            <button onClick={() => setTarget({ kind: "box" })}>
              <Plus />
              Stage box
            </button>
            <button onClick={() => setTarget({ kind: "input" })}>
              <Plus />
              Input
            </button>
            <button onClick={() => setTarget({ kind: "settings" })}>
              <SlidersHorizontal />
              Rider settings
            </button>
            <details>
              <summary>Draft options</summary>
              <button onClick={downloadDraft}>
                <ArrowDownToLine />
                Download draft
              </button>
              <button
                onClick={() =>
                  confirmReset ? edit(true) : setConfirmReset(true)
                }
              >
                {confirmReset
                  ? "Confirm replacing local draft"
                  : "Load latest revision"}
              </button>
            </details>
          </div>
        )}
        <section className="plot-paper">
          <header>
            <span>
              <MapPin size={15} /> Stage plan
            </span>
            <div className="plot-actions">
              <small>Audience view</small>{" "}
              {allowed && !privateMode && (
                <a className="version-button" href="/stage-plot/list">
                  Versions
                </a>
              )}
              {editing ? (
                <>
                  <button
                    className="primary"
                    onClick={saveRevision}
                    disabled={busy || draft === record || staleDraft}
                  >
                    {busy
                      ? "Saving…"
                      : released
                        ? "Save revision"
                        : "Save draft"}
                  </button>
                </>
              ) : privateMode === "history" || issuedPacket ? null : (
                <button disabled={busy} onClick={() => edit()}>
                  <Pencil size={15} />
                  Edit plot
                </button>
              )}
            </div>
          </header>
          {internal && <div className="stage-view-selector" role="group" aria-label="Stage view">
            {stageViews.map((name) => <button key={name} type="button" aria-pressed={view === name} onClick={() => { setView(name); if (name === "Stand placement" && !p.objects.some((o) => o.id === selected && isStandPlacementItem(o))) select(null); }}>{name}</button>)}
            <span className="hint">One layout · changes appear in every view</span>
          </div>}
          <StageViewport
            width={p.width}
            depth={p.depth}
            layers={
              (!internal || view === "Overview") && <fieldset className="plot-layers" aria-label="Visible layers">
                <legend>Visible layers</legend>
                {(Object.keys(layerLabels) as (keyof PlotLayers)[])
                  .filter((k) => k !== "cables" || internal)
                  .map((key) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={layers[key]}
                        onChange={() => toggleLayer(key)}
                      />
                      {layerLabels[key]}
                    </label>
                  ))}
              </fieldset>
            }
            routing={
              cableView && (
                <div className="route-controls">
                  <label className="rider-field">
                    <span>Trace a cable</span>
                    <select
                      value={route?.id ?? ""}
                      onChange={(e) => setRouteId(e.target.value || null)}
                    >
                      <option value="">
                        All cable runs ({p.cables.length})
                      </option>
                      {p.cables.map((c, i) => (
                        <option key={c.id} value={c.id}>
                          {cableName(p, c)}
                          {p.cables.some(
                            (other) =>
                              other.id !== c.id &&
                              other.fromId === c.fromId &&
                              other.toId === c.toId,
                          )
                            ? " · Run " + (i + 1)
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editing && (
                    <>
                      {route && (
                        <button type="button" onClick={addBend}>
                          <Plus />
                          Add node
                        </button>
                      )}
                      <p className="hint">
                        {p.cables.length
                          ? "Alt/Option-click a cable to add a node; Alt/Option-click a node to remove it from its cables. Drag along an axis, hold Shift for a diagonal, or drag nodes together to share a bend."
                          : "Choose Add cable to connect two endpoints."}
                      </p>
                    </>
                  )}
                </div>
              )
            }
          >
            <StageCanvas
              plot={p}
              symbolScale={!internal || view === "Overview" ? 1 / screenStageSpacing : 1}
              editing={editing}
              layers={visibleLayers}
              view={internal ? view : "Overview"}
              routing={
                internal
                  ? {
                      selected: route?.id ?? null,
                      onSelect: (id) => {
                        setRouteId(id);
                        choose(id);
                      },
                      onChange: editing ? updateRouting : undefined,
                    }
                  : undefined
              }
              highlighted={equipmentHover}
              selected={selected}
              active={active}
              onHover={setHover}
              onSelect={choose}
              onMove={move}
              onEdit={(id) => setTarget({ kind: p.objects.some((o) => o.id === id) ? "object" : p.stageBoxes.some((b) => b.id === id) ? "box" : "input", id })}
            />
          </StageViewport>
          {internal && view === "Stand placement" && <StandPlacementPanel plot={p} selected={selected} editing={editing} onSelect={select} onChange={(next) => updateRouting(next)} />}
          {internal && view === "Cable patch and routing" && <p className="setup-view-note">Working cable map: {p.cables.length} drawn runs. Input numbers identify sources; verify physical sockets, cable reach and routing at setup.</p>}
          {internal && view === "Cable patch and routing" && <CablePatchSchedule plot={p} showDrawnConnections />}
          <footer>
            <span>Grid: 2 ft squares</span>
            <span>
              <b className="mini-pin">1</b> Mic / line
            </span>
            <span>
              <b className="mini-pin di">DI</b> Direct input
            </span>
            <span>
              <b className="mini-pin">ϟ</b> AC drop
            </span>
            {layers.stageBoxes && p.stageBoxes.length > 0 && (
              <span>
                <b className="mini-box" aria-hidden="true" /> Stage box
              </span>
            )}
            <span className="plot-source">
              {cableView
                ? "○ Cable start · ■ Cable end"
                : source
                  ? `Input ${source.number} · ${source.source} · ${micFor(p, source)}`
                  : "Select a number to find its input."}
            </span>
          </footer>
        </section>
        {editing && (
          <div className="selection-tools">
            {" "}
            <label className="rider-field">
              <span>Select a stage item</span>
              <select
                aria-label="Select a stage item"
                value={selected ?? ""}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">Choose an item</option>
                {p.objects.filter((o) => view !== "Stand placement" || isStandPlacementItem(o)).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
                {view !== "Stand placement" && p.stageBoxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    Stage box · {b.label}
                  </option>
                ))}
                {view !== "Stand placement" && ordered.map((i) => (
                  <option key={i.id} value={i.id}>
                    Input {i.number} · {i.source}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <button
                onClick={() =>
                  setTarget({
                    kind: boxesById.has(selected)
                      ? "box"
                      : p.inputs.some((i) => i.id === selected)
                        ? "input"
                        : "object",
                    id: selected,
                  })
                }
              >
                <Pencil size={14} />
                Edit selected item
              </button>
            )}
            <p className="hint">
              Drag to position. Double-click to edit artwork and anchor. Arrow keys nudge a focused item.
            </p>
          </div>
        )}
        <section className="rider-data">
          <nav aria-label="Rider sections">
            {kinds
              .filter((k) => internal || k !== "Cable runs")
              .map((k, index) => {
                const Icon = [ClipboardList, Layers, Box, Waypoints][index];
                return (
                  <button
                    aria-pressed={tab === k}
                    key={k}
                    onClick={() => {
                      setEquipmentHover([]);
                      setTab(k);
                      if (k === "Cable runs")
                        setLayers((prev) => ({ ...prev, cables: true }));
                    }}
                  >
                    <Icon size={16} />
                    {k}
                    {k === "Input key" && <small>{p.inputs.length}</small>}
                  </button>
                );
              })}
          </nav>
          <div
            ref={equipmentScroll}
            className="rider-data-scroll"
            tabIndex={0}
            role="region"
            aria-label={tab + " list"}
          >
            {tab === "Input key" && (
              <>
                <div className="table-heading">
                  <h2>Audio input key</h2>
                  {editing && (
                    <button onClick={() => setTarget({ kind: "input" })}>
                      <Plus />
                      Add input
                    </button>
                  )}
                </div>
                <div className="rider-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Plot #</th>
                        <th>Source</th>
                        <th>Station</th>
                        <th>Mic / connection</th>
                        <th>Stage box</th>
                        <th>FOH ch.</th>
                        {editing && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {ordered.map((i) => (
                        <tr
                          key={i.id}
                          data-input={i.id}
                          className={active === i.id ? "hot" : ""}
                          onMouseEnter={() => setHover(i.id)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => select(i.id)}
                        >
                          <td>
                            <button
                              className="table-pin"
                              aria-label={"Locate input " + i.number}
                              onFocus={() => setHover(i.id)}
                              onBlur={() => setHover(null)}
                            >
                              {String(i.number).padStart(2, "0")}
                            </button>
                          </td>
                          <td>
                            <strong>{i.source}</strong>
                            {[i.patch, i.phantom, i.notes].filter(Boolean)
                              .length > 0 && (
                              <small>
                                {[i.patch, i.phantom, i.notes]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            )}
                          </td>
                          <td>{i.station}</td>
                          <td>{micFor(p, i)}</td>
                          <td>
                            {editing ? (
                              <select
                                aria-label={`Stage box for input ${i.number}`}
                                value={i.stageBoxId ?? ""}
                                onChange={(e) => {
                                  const stageBoxId = e.target.value || null;
                                  change(
                                    {
                                      ...p,
                                      inputs: p.inputs.map((input) =>
                                        input.id === i.id
                                          ? { ...input, stageBoxId }
                                          : input,
                                      ),
                                    },
                                    i.id,
                                  );
                                }}
                              >
                                <option value="">Unassigned</option>
                                {p.stageBoxes.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.label}
                                  </option>
                                ))}
                              </select>
                            ) : i.stageBoxId ? (
                              <span
                                className="box-tag"
                                style={{
                                  borderColor:
                                    boxColors[
                                      boxesById.get(i.stageBoxId)!.color
                                    ],
                                }}
                              >
                                {boxesById.get(i.stageBoxId)!.label}
                              </span>
                            ) : (
                              "Unassigned"
                            )}
                          </td>
                          <td>{i.foh || "TBC"}</td>
                          {editing && (
                            <td>
                              <button
                                aria-label={"Edit input " + i.number}
                                onClick={() =>
                                  setTarget({ kind: "input", id: i.id })
                                }
                              >
                                <Pencil size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {tab === "Equipment" && (
              <>
                <div className="table-heading">
                  <h2>On stage</h2>
                  {editing && (
                    <button onClick={() => setTarget({ kind: "object" })}>
                      <Plus />
                      Stage item
                    </button>
                  )}
                </div>
                <div className="stage-equipment-list">
                  {stageEquipment.map((o) => (
                    <div
                      key={o.id}
                      className={
                        "stage-equipment-row" +
                        (active === o.id || equipmentHover.includes(o.id)
                          ? " hot"
                          : "")
                      }
                      data-equipment-object={o.id}
                      {...equipmentEvents([o.id])}
                    >
                      <button
                        type="button"
                        className="locate-equipment"
                        onClick={() => select(o.id)}
                        aria-label={"Locate " + o.label}
                      >
                        <span>{o.label}</span>
                        <MapPin size={15} />
                      </button>
                      <div className="equipment-suppliers">
                        {linkedEquipment(p, o.id).map((g) => (
                          <label key={g.id}>
                            <span>{g.item}</span>
                            {editing ? (
                              <select
                                aria-label={
                                  "Supplied by for " + o.label + " · " + g.item
                                }
                                value={g.provider}
                                onChange={(e) =>
                                  setSupplier(g.id, e.target.value)
                                }
                              >
                                {providers.map((v) => (
                                  <option key={v}>{v}</option>
                                ))}
                              </select>
                            ) : (
                              <strong>{g.provider}</strong>
                            )}
                            {editing && (
                              <button
                                type="button"
                                aria-label={
                                  "Edit equipment for " +
                                  o.label +
                                  " · " +
                                  g.item
                                }
                                onClick={() =>
                                  setTarget({ kind: "gear", id: g.id })
                                }
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                          </label>
                        ))}
                      </div>
                      {editing && (
                        <button
                          type="button"
                          aria-label={"Edit " + o.label}
                          onClick={() => setTarget({ kind: o.kind, id: o.id })}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="table-heading">
                  <h2>Equipment totals</h2>
                  {editing && (
                    <button onClick={() => setTarget({ kind: "gear" })}>
                      <Plus />
                      Add allocation
                    </button>
                  )}
                </div>
                <div className="rider-filters">
                  <label>
                    Supplier{" "}
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {["All suppliers", ...providers].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Station{" "}
                    <select
                      value={station}
                      onChange={(e) => setStation(e.target.value)}
                    >
                      {["All stations", ...stations].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {totals.map((g) => {
                  const key = g.allocations[0].id;
                  return (
                    <div
                      className={
                        "gear-group" +
                        (allocationPoints(
                          p,
                          g.allocations.map((a) => a.id),
                        ).includes(active ?? "")
                          ? " selected-equipment"
                          : "")
                      }
                      key={key}
                      {...equipmentEvents(
                        allocationPoints(
                          p,
                          g.allocations.map((a) => a.id),
                        ),
                      )}
                    >
                      <button
                        className="gear-row"
                        aria-expanded={expanded === key}
                        onClick={() =>
                          setExpanded(expanded === key ? null : key)
                        }
                      >
                        <b>{quantityText(g)}</b>
                        <span>
                          <strong>
                            {[g.spec, g.item].filter(Boolean).join(" · ")}
                          </strong>
                          <small>{[...g.stations].join(", ")}</small>
                        </span>
                        <span>
                          {g.provider}
                          <small>
                            {g.confirmed
                              ? "Confirmed"
                              : g.required
                                ? "Listed requirement"
                                : "To confirm"}
                          </small>
                        </span>
                        <ChevronDown size={16} />
                      </button>
                      {expanded === key && (
                        <div className="allocations">
                          {g.allocations.map((a) => (
                            <div
                              key={a.id}
                              data-equipment-allocation={a.id}
                              {...equipmentEvents(allocationPoints(p, [a.id]))}
                            >
                              <div>
                                <strong>
                                  {a.station || "Shared"} ·{" "}
                                  {a.quantity ?? "TBD"} × {a.item}
                                </strong>
                                {internal &&
                                  p.cables
                                    .filter((c) => c.gearId === a.id)
                                    .map((c) => (
                                      <small key={c.id}>
                                        {cableName(p, c)}
                                      </small>
                                    ))}
                                <small>
                                  {a.sourceIds
                                    .map(
                                      (id) =>
                                        p.inputs.find((i) => i.id === id)
                                          ?.number,
                                    )
                                    .filter(Boolean)
                                    .map((n) => "#" + n)
                                    .join(", ") || "Stage equipment"}{" "}
                                  {a.notes && " · " + a.notes}
                                </small>
                              </div>
                              {editing && (
                                <button
                                  aria-label={"Edit allocation " + a.id}
                                  onClick={() =>
                                    setTarget({ kind: "gear", id: a.id })
                                  }
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!totals.length && <p>No matching equipment.</p>}
              </>
            )}
            {tab === "Advance notes" && (
              <>
                <div className="table-heading">
                  <h2>Advance notes</h2>
                  {editing && (
                    <button onClick={() => setTarget({ kind: "settings" })}>
                      Edit notes
                    </button>
                  )}
                </div>
                <dl className="advance-list">
                  {[
                    ["Monitors and house handoff", p.monitors],
                    ["Power", p.power],
                    ["Production contact", p.contact],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || "To confirm"}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {tab === "Cable runs" && internal && (
              <>
                <div className="table-heading">
                  <h2>Cable runs</h2>
                  {editing && (
                    <button onClick={() => setTarget({ kind: "cable" })}>
                      <Plus />
                      Add cable
                    </button>
                  )}
                </div>
                <p className="hint">
                  Each run adds one cable to the equipment manifest. Matching
                  cables are totaled under Equipment.
                </p>
                {p.cables.map((c) => {
                  const g = p.gear.find((g) => g.id === c.gearId);
                  return (
                    <div
                      className={
                        "run-row" +
                        (route?.id === c.id && cableView ? " traced" : "")
                      }
                      key={c.id}
                    >
                      <div>
                        <strong>{cableName(p, c)}</strong>
                        <small>
                          {g?.station} · {g?.item} ·{" "}
                          {g?.spec || "Specification to confirm"}
                        </small>
                      </div>
                      <button
                        aria-pressed={route?.id === c.id && cableView}
                        onClick={() => {
                          viewCable(c.id);
                          document
                            .querySelector(".plot-paper")
                            ?.scrollIntoView({ block: "start" });
                        }}
                      >
                        Trace
                      </button>
                      {editing && (
                        <button
                          onClick={() => setTarget({ kind: "cable", id: c.id })}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  );
                })}
                <details className="unrouted-cables">
                  <summary>Equipment entries without a complete route</summary>
                  {p.gear
                    .filter(isCableAllocation)
                    .filter((g) =>
                      g.quantity === null
                        ? !p.cables.some((c) => c.gearId === g.id)
                        : p.cables.filter((c) => c.gearId === g.id).length <
                          g.quantity,
                    )
                    .map((g) => (
                      <div key={g.id} className="run-row">
                        <div>
                          {g.station} · {g.item} ·{" "}
                          {g.spec || "Specification to confirm"} ·{" "}
                          {g.quantity === null
                            ? "Quantity TBD"
                            : g.quantity -
                              p.cables.filter((c) => c.gearId === g.id).length +
                              " unassigned"}
                          <small>
                            {g.sourceIds
                              .map((id) => p.inputs.find((i) => i.id === id))
                              .filter((i) => i !== undefined)
                              .map((i) => i.number + " · " + i.source)
                              .join(", ")}
                          </small>
                        </div>
                        {editing && (
                          <button
                            onClick={() =>
                              setTarget({ kind: "cable", allocationId: g.id })
                            }
                          >
                            Route cable
                          </button>
                        )}
                      </div>
                    ))}
                </details>
              </>
            )}
          </div>
        </section>
        <footer className="rider-bottom">
          <ImageLogo
            src="/swell-logo-horizontal-stripes.svg"
            alt="The Swell"
            width={74}
            height={34}
            unoptimized
          />
          <a href={record.releaseCode ? checkHref(record.releaseCode, packet) : canonical}>
            Check rider <ArrowUpRight size={14} />
          </a>
        </footer>
        {editing && target && (
          <EditorDialog
            key={
              target.kind +
              (target.id ?? target.repeatOf ?? target.allocationId ?? "")
            }
            plot={p}
            target={target}
            onClose={() => setTarget(null)}
            onSave={change}
          />
        )}
        <AdminSignInDialog
          open={login}
          onOpenChange={setLogin}
          title="Edit the stage plot"
          description="Sign in with a Swell administrator account to edit and publish the rider."
          onSignedIn={() => edit()}
        />
      </div>
      <PrintPacket
        record={editing ? { ...draft, plot: p } : record}
        packet={packet}
        pages={pages}
        preview={!!privateMode}
        unsaved={unsaved}
      />
    </main>
  );
}
