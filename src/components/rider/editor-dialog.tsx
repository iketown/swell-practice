"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  catalog,
  byNumber,
  pointFor,
  providers,
  plotSchema,
  removePoint,
  replaceRuns,
  resizePlayingArea,
  type Plot,
  type Gear,
  type Input,
  type PlotObject,
  type StageBox,
} from "@/lib/rider/model";

import { syncStandMovement } from "@/lib/rider/instrument-stands";
import { objectAnchor, stageAnchor } from "@/lib/rider/placement";
import { ArtworkAnchorEditor } from "./artwork-anchor-editor";
import { isEquipmentObject } from "@/lib/rider/equipment";
import { cableTypes, saveCable } from "@/lib/rider/cable-manifest";
import { StageBoxDialogTitle } from "./stage-box-dialog-title";
import { boxColors, boxFrame } from "@/lib/rider/stage-box";

export type EditTarget = {
  kind: "object" | "box" | "input" | "gear" | "cable" | "settings";
  id?: string;
  allocationId?: string;
  repeatOf?: string;
};
type Props = {
  plot: Plot;
  target: EditTarget;
  overview?: boolean;
  onClose: () => void;
  onSave: (p: Plot, id?: string, nextTarget?: EditTarget) => void;
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="rider-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function replace<T extends { id: string }>(arr: T[], entry: T) {
  return arr.some((i) => i.id === entry.id)
    ? arr.map((i) => (i.id === entry.id ? entry : i))
    : [...arr, entry];
}
async function uploadedImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 540 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not import the image.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.78);
    if (data.length > 180000) throw new Error("Choose a smaller image.");
    return { data, ratio: bitmap.width / bitmap.height };
  } finally {
    bitmap.close();
  }
}
export function EditorDialog({ plot: p, target: t, overview, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newDepth, setNewDepth] = useState(String(p.depth));
  const o = p.objects.find((x) => x.id === t.id),
    i = p.inputs.find((x) => x.id === t.id),
    g = p.gear.find((x) => x.id === t.id),
    c = p.cables.find((x) => x.id === t.id);
  const editingIcon = overview && o?.overviewPosition;
  const shownObject = o && editingIcon ? { ...o, ...editingIcon } : o;
  const lastCable = c ?? p.cables.find((run) => run.id === t.repeatOf);
  const cableGear = p.gear.find(
    (g) => g.id === (t.allocationId ?? lastCable?.gearId),
  );
  const [runNodes, setRunNodes] = useState(c?.nodeIds ?? []);
  const box = p.stageBoxes.find((b) => b.id === t.id);
  const frame = box
    ? boxFrame(
        p,
        box,
        p.inputs.filter((i) => i.stageBoxId === box.id),
      )
    : null;
  const [asset, setAsset] = useState(o?.asset ?? "boom");
  const initialShape = o ?? { ...catalog.boom, asset: "boom", x: p.width / 2, y: p.depth / 2 };
  const initialAnchor = objectAnchor(initialShape);
  const [anchorFraction, setAnchorFraction] = useState({ x: initialAnchor.x / initialShape.w, y: initialAnchor.y / initialShape.h });
  const [anchorEdited, setAnchorEdited] = useState(false);
  const [previewSize, setPreviewSize] = useState({ w: initialShape.w, h: initialShape.h });
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  function finish(next: Plot, id?: string, nextTarget?: EditTarget) {
    const result = plotSchema.safeParse(next);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    onSave(result.data, id, nextTarget);
  }
  function remove() {
    if (!deleting) {
      setDeleting(true);
      return;
    }
    const id = t.id!;
    if (t.kind === "gear")
      finish({
        ...replaceRuns(
          p,
          p.cables.filter((c) => c.gearId !== id),
        ),
        gear: p.gear.filter((g) => g.id !== id),
      });
    else if (t.kind === "cable")
      finish(
        replaceRuns(
          p,
          p.cables.filter((c) => c.id !== id),
        ),
      );
    else finish(removePoint(p, id));
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget),
      v = (key: string) => String(f.get(key) ?? "").trim(),
      n = (key: string) => Number(v(key));
    const id = t.id ?? crypto.randomUUID();
    try {
      if (t.kind === "object") {
        const file = f.get("upload");
        let key = asset;
        let shape = catalog[key] ?? {
          label: "Equipment",
          w: 2,
          h: 1,
          opacity: 1,
        };
        if (file instanceof File && file.size) {
          const image = await uploadedImage(file);
          key = image.data;
          shape = { ...shape, w: 2, h: 2 / image.ratio };
        }
        if (key === "upload") throw new Error("Choose an image to upload.");
        const entry: PlotObject = {
          id,
          asset: key,
          ...(o?.overviewPosition && { overviewPosition: o.overviewPosition }),
          ...(o?.overviewOnly && { overviewOnly: true }),
          ...(key === "stage-riser" ? { riserHeightInches: n("riserHeightInches") } : {}),
          ...(o?.standId ? { standId: o.standId } : {}),
          ...(o?.placement || anchorEdited || asset !== initialShape.asset ? { placement: { x: anchorFraction.x * (v("w") ? n("w") : shape.w), y: anchorFraction.y * (v("h") ? n("h") : shape.h) } } : {}),
          ...(v("layer") ? { layer: v("layer") as PlotObject["layer"] } : {}),
          label: v("label") || shape.label,
          x: p.width / 2 + n("x") - anchorFraction.x * (v("w") ? n("w") : shape.w),
          y: p.depth - n("y") - anchorFraction.y * (v("h") ? n("h") : shape.h),
          w: v("w") ? n("w") : shape.w,
          h: v("h") ? n("h") : shape.h,
          opacity: v("opacity") ? n("opacity") / 100 : shape.opacity,
        };
        if (editingIcon && o) {
          entry.overviewPosition = { x: entry.x, y: entry.y };
          entry.x = o.x;
          entry.y = o.y;
        }
        const objects = replace(p.objects, entry);
        if (v("order") === "front") {
          objects.splice(
            objects.findIndex((x) => x.id === id),
            1,
          );
          objects.push(entry);
        }
        if (v("order") === "back") {
          objects.splice(
            objects.findIndex((x) => x.id === id),
            1,
          );
          objects.unshift(entry);
        }
        finish(syncStandMovement(p, { ...p, objects }, id), id);
      } else if (t.kind === "box") {
        const nextBox: StageBox = {
          id,
          label: v("label"),
          color: v("color") as StageBox["color"],
          x: n("x"),
          y: n("y"),
        };
        const assigned = new Set(f.getAll("assigned").map(String));
        const inputs = p.inputs.map((input) => {
          if (input.stageBoxId && input.stageBoxId !== id) return input;
          if (assigned.has(input.id)) return { ...input, stageBoxId: id };
          return input.stageBoxId === id
            ? { ...input, stageBoxId: null }
            : input;
        });
        const pos = boxFrame(
          p,
          nextBox,
          inputs.filter((i) => i.stageBoxId === id),
        );
        finish(
          {
            ...p,
            inputs,
            stageBoxes: replace(p.stageBoxes, {
              ...nextBox,
              x: pos.x,
              y: pos.y,
            }),
          },
          id,
        );
      } else if (t.kind === "input") {
        const entry: Input = {
          id,
          number: n("number"),
          source: v("source"),
          station: v("station"),
          kind: v("kind") as Input["kind"],
          stageBoxId: v("stageBoxId") || null,
          foh: v("foh"),
          patch: v("patch"),
          phantom: v("phantom"),
          notes: v("notes"),
          ...(i?.overviewPosition && { overviewPosition: i.overviewPosition }),
          x: i?.x ?? p.width / 2,
          y: i?.y ?? p.depth / 2,
        };
        finish({ ...p, inputs: replace(p.inputs, entry) }, id);
      } else if (t.kind === "gear") {
        const entry: Gear = {
          ...g,
          id,
          item: v("item"),
          spec: v("spec"),
          station: v("station"),
          provider: v("provider") as Gear["provider"],
          quantity: v("quantity") ? n("quantity") : null,
          required: f.has("required"),
          confirmed: f.has("confirmed"),
          notes: v("notes"),
          sourceIds: f.getAll("sources").map(String),
          plotIds: f.getAll("plotIds").map(String),
        };
        const gear = replace(p.gear, entry).filter(
          (g) =>
            g.id === entry.id ||
            !g.createdForPlot ||
            !g.plotIds?.length ||
            !g.plotIds.every((id) => entry.plotIds?.includes(id)),
        );
        finish({ ...p, gear });
      } else if (t.kind === "cable") {
        const next = saveCable(p, {
          id,
          allocationId: t.allocationId,
          nodeIds: runNodes,
          fromId: v("fromId"),
          toId: v("toId"),
          item: v("item"),
          spec: v("spec"),
        });
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const again =
          submitter instanceof HTMLButtonElement &&
          submitter.value === "another";
        finish(
          next,
          undefined,
          again ? { kind: "cable", repeatOf: id } : undefined,
        );
      } else {
        finish({
          ...resizePlayingArea(
            p,
            n("width"),
            n("depth"),
            v("edge") === "upstage",
          ),
          configuration: v("configuration"),
          contact: v("contact"),
          power: v("power"),
          monitors: v("monitors"),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: string,
    label: string,
    value: string | number = "",
    required = false,
    type = "text",
  ) => (
    <Field label={label}>
      <input
        name={key}
        defaultValue={value}
        type={type}
        step={type === "number" ? "any" : undefined}
        required={required}
        onChange={(e) => {
          if ((key === "w" || key === "h") && e.target.valueAsNumber >= .15 && e.target.valueAsNumber <= 60) setPreviewSize((current) => ({ ...current, [key]: e.target.valueAsNumber }));
        }}
      />
    </Field>
  );
  const area = (key: string, label: string, value = "", rows = 2) => (
    <Field label={label}>
      <textarea name={key} defaultValue={value} rows={rows} />
    </Field>
  );
  const station = (value?: string) =>
    field("station", "Station / performer", value);
  const endpoints = [
    ...p.objects
      .filter((o) => o.asset !== "label" && !o.overviewOnly)
      .map((o) => ({ id: o.id, name: pointFor(p, o.id)!.label })),
    ...p.stageBoxes.map((box) => ({
      id: box.id,
      name: "Stage box · " + box.label,
    })),
    ...byNumber(p).map((i) => ({
      id: i.id,
      name:
        i.kind === "DI"
          ? "Direct box " + i.number + " · " + i.source
          : i.number + " · " + i.source,
    })),
  ];
  const title =
    t.kind === "settings"
      ? "Rider settings"
      : (t.id ? "Edit " : "Add ") +
        {
          object: "stage item",
          box: "stage box",
          input: "input",
          gear: "allocation",
          cable: "cable run",
        }[t.kind];
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className={"rider-dialog" + (t.kind === "box" ? " stage-box-dialog" : t.kind === "object" ? " artwork-dialog" : "")}
      onCancel={onClose}
    >
      <form onSubmit={save}>
        <header>
          {t.kind === "box" ? (
            <StageBoxDialogTitle title={title} />
          ) : (
            <h2>{title}</h2>
          )}
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="rider-fields">
          {t.kind === "object" && (
            <>
              <Field label="Artwork">
                <select
                  value={asset}
                  onChange={(e) => {
                    setAsset(e.target.value);
                    const form = e.currentTarget.form;
                    const values = form ? new FormData(form) : null;
                    const shape = catalog[e.target.value];
                    if (shape) setPreviewSize({ w: Number(values?.get("w")) || shape.w, h: Number(values?.get("h")) || shape.h });
                  }}
                >
                  {Object.entries(catalog).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                  <option value="label">Text label</option>
                  <option value="symbol">Equipment block</option>
                  <option value="upload">Upload image…</option>
                  {asset.startsWith("data:") && (
                    <option value={asset}>Current uploaded image</option>
                  )}
                </select>
              </Field>
              {asset === "upload" && (
                <Field label="Image file">
                  <input
                    type="file"
                    name="upload"
                    accept="image/png,image/jpeg,image/webp"
                    required
                  />
                </Field>
              )}
              {field("label", "Item name", o?.label)}
              {field(
                "x",
                "Anchor from centreline (ft, − SR / + SL)",
                shownObject ? stageAnchor(shownObject).x - p.width / 2 : 0,
                true,
                "number",
              )}
              {field(
                "y",
                "Anchor from front edge (ft)",
                shownObject ? p.depth - stageAnchor(shownObject).y : p.depth / 2,
                true,
                "number",
              )}
              {asset === "stage-riser" && field("riserHeightInches", "Deck height (in)", o?.riserHeightInches ?? 12, true, "number")}
              {field("w", asset === "stage-riser" ? "Deck width (ft)" : "Symbol width (ft)", o?.w ?? "", false, "number")}
              {field("h", asset === "stage-riser" ? "Deck depth (ft)" : "Symbol height (ft)", o?.h ?? "", false, "number")}
              {field(
                "opacity",
                "Opacity (%)",
                o ? Math.round(o.opacity * 100) : "",
                false,
                "number",
              )}
              {asset !== "upload" && <ArtworkAnchorEditor asset={asset} label={o?.label ?? "stage item"} width={previewSize.w} height={previewSize.h} anchor={{ x: anchorFraction.x * previewSize.w, y: anchorFraction.y * previewSize.h }} onChange={(point) => { setAnchorEdited(true); setAnchorFraction({ x: point.x / previewSize.w, y: point.y / previewSize.h }); }} />}
              <Field label="Visibility layer">
                <select name="layer" defaultValue={o?.layer ?? ""}>
                  <option value="">Use artwork default</option>
                  <option value="people">People</option>
                  <option value="stands">Stands</option>
                  <option value="equipment">Equipment</option>
                </select>
              </Field>
              <Field label="Stacking order">
                <select name="order">
                  <option value="">Current order</option>
                  <option value="front">Bring to front</option>
                  <option value="back">Send to back</option>
                </select>
              </Field>
            </>
          )}
          {t.kind === "box" && (
            <>
              <Field label="Box name">
                <input
                  name="label"
                  defaultValue={box?.label ?? ""}
                  placeholder="e.g. Stage right"
                  required
                  maxLength={30}
                />
              </Field>
              <Field label="Box color">
                <select
                  name="color"
                  defaultValue={
                    box?.color ??
                    Object.keys(boxColors)[
                      p.stageBoxes.length % Object.keys(boxColors).length
                    ]
                  }
                >
                  {Object.keys(boxColors).map((color) => (
                    <option key={color}>{color}</option>
                  ))}
                </select>
              </Field>
              {field(
                "x",
                "X from stage right (ft)",
                frame?.x ?? 0.5,
                true,
                "number",
              )}
              {field(
                "y",
                "Y from upstage (ft)",
                frame?.y ?? p.depth / 2,
                true,
                "number",
              )}
              <fieldset className="source-checks">
                <legend>Assigned inputs</legend>
                {byNumber(p).map((input) => {
                  const currentBox = p.stageBoxes.find(
                    (b) => b.id === input.stageBoxId && b.id !== box?.id,
                  );
                  return (
                    <label
                      key={input.id}
                      className={currentBox ? "assigned-elsewhere" : undefined}
                      tabIndex={currentBox ? 0 : undefined}
                      aria-describedby={
                        currentBox ? "box-assignment-" + input.id : undefined
                      }
                    >
                      <input
                        disabled={!!currentBox}
                        type="checkbox"
                        name="assigned"
                        value={input.id}
                        defaultChecked={!!box && input.stageBoxId === box.id}
                      />{" "}
                      {input.number} · {input.source}
                      {currentBox && (
                        <span role="tooltip" id={"box-assignment-" + input.id}>
                          Already assigned to {currentBox.label}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            </>
          )}
          {t.kind === "input" && (
            <>
              {field(
                "number",
                "Plot number",
                i?.number ?? Math.max(0, ...p.inputs.map((i) => i.number)) + 1,
                true,
                "number",
              )}
              {field("source", "Source name", i?.source, true)}
              {field("station", "Station / performer", i?.station, true)}
              <Field label="Connection">
                <select name="kind" defaultValue={i?.kind}>
                  {["Mic", "DI", "Line"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Stage box">
                <select name="stageBoxId" defaultValue={i?.stageBoxId ?? ""}>
                  <option value="">Unassigned</option>
                  {p.stageBoxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </Field>
              {field("foh", "FOH channel", i?.foh)}
              {field("patch", "Local socket / console patch", i?.patch)}
              {field("phantom", "Phantom requirement", i?.phantom)}
              {area("notes", "Notes", i?.notes)}
            </>
          )}
          {t.kind === "gear" && (
            <>
              {field("item", "Item", g?.item, true)}
              {field("spec", "Specification / cable length", g?.spec)}
              {station(g?.station)}
              {field(
                "quantity",
                "Quantity (blank if unknown)",
                g?.quantity ?? "",
                false,
                "number",
              )}
              <Field label="Supplied by">
                <select name="provider" defaultValue={g?.provider}>
                  {providers.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <fieldset className="source-checks">
                <legend>Linked stage equipment</legend>
                {[
                  ...p.objects.filter(isEquipmentObject).map((o) => ({
                    id: o.id,
                    label: o.asset === "sam" ? "Drum kit" : o.label,
                  })),
                  ...p.stageBoxes.map((b) => ({
                    id: b.id,
                    label: "Stage box · " + b.label,
                  })),
                ].map((point) => (
                  <label key={point.id}>
                    <input
                      type="checkbox"
                      name="plotIds"
                      value={point.id}
                      defaultChecked={g?.plotIds?.includes(point.id)}
                    />{" "}
                    {point.label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="source-checks">
                <legend>Linked inputs</legend>
                {byNumber(p).map((i) => (
                  <label key={i.id}>
                    <input
                      type="checkbox"
                      name="sources"
                      value={i.id}
                      defaultChecked={g?.sourceIds.includes(i.id)}
                    />{" "}
                    {i.number} · {i.source}
                  </label>
                ))}
              </fieldset>
              <label>
                <input
                  type="checkbox"
                  name="required"
                  defaultChecked={g?.required ?? true}
                />{" "}
                Required for this setup
              </label>
              <label>
                <input
                  type="checkbox"
                  name="confirmed"
                  defaultChecked={g?.confirmed}
                />{" "}
                Specification and supplier confirmed
              </label>
              {area("notes", g?.item === "Drum kit" ? "Drum package specification" : "Allocation notes", g?.notes, g?.item === "Drum kit" ? 18 : 2)}
            </>
          )}
          {t.kind === "cable" && (
            <>
              {["fromId", "toId"].map((key) => (
                <Field key={key} label={key === "fromId" ? "From" : "To"}>
                  <select
                    name={key}
                    defaultValue={
                      (key === "fromId" ? lastCable?.fromId : c?.toId) ?? ""
                    }
                    required
                  >
                    <option value="">Choose endpoint</option>
                    {endpoints.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="Cable type">
                <input
                  name="item"
                  list="rider-cable-types"
                  defaultValue={cableGear?.item ?? "Instrument cable"}
                  required
                  maxLength={150}
                />
                <datalist id="rider-cable-types">
                  {cableTypes.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </Field>
              <Field label="Cable length">
                <input
                  name="spec"
                  placeholder="e.g. 10 ft"
                  defaultValue={cableGear?.spec ?? ""}
                  maxLength={180}
                />
              </Field>
              {runNodes.length > 0 && (
                <div className="wide route-bend-list">
                  <strong>Nodes from start to end</strong>
                  {runNodes.map((id, index) => {
                    const n = p.cableNodes.find((n) => n.id === id)!;
                    const count = p.cables.filter((run) =>
                      run.nodeIds.includes(id),
                    ).length;
                    return (
                      <div key={id}>
                        <span>
                          Node {index + 1} · {n.x}, {n.y} ft
                          {count > 1 ? " · Shared" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRunNodes((nodes) =>
                              nodes.filter((n) => n !== id),
                            )
                          }
                        >
                          Remove from run
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {t.kind === "settings" && (
            <>
              {field("configuration", "Configuration", p.configuration, true)}
              {field("width", "Playing width (ft)", p.width, true, "number")}
              <Field label="Playing depth (ft)">
                <input
                  name="depth"
                  type="number"
                  min={6}
                  max={90}
                  step="any"
                  required
                  value={newDepth}
                  onChange={(e) => setNewDepth(e.target.value)}
                />
              </Field>
              {Number(newDepth) > p.depth && (
                <Field label="Add depth at">
                  <select name="edge" defaultValue="upstage">
                    <option value="upstage">
                      Upstage · behind the drummer
                    </option>
                    <option value="downstage">
                      Downstage · toward the audience
                    </option>
                  </select>
                </Field>
              )}
              {field(
                "contact",
                "Production contact for public rider",
                p.contact,
              )}
              {area("monitors", "Monitors and house handoff", p.monitors)}
              {area("power", "Power requirements", p.power)}
            </>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          {t.id && (
            <button type="button" className="danger" onClick={remove}>
              {deleting ? "Confirm removal" : "Remove"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {t.kind === "cable" && !c && (
            <button type="submit" disabled={busy} value="another">
              Save &amp; add another
            </button>
          )}
          <button disabled={busy} className="primary">
            {t.kind === "cable" && !c ? "Add cable" : "Save changes"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
