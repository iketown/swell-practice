"use client";
import { useState } from "react";
import { separateInstrumentStands, needsInstrumentStand, syncStandMovement } from "@/lib/rider/instrument-stands";
import { stageAnchor, withAnchor, objectAnchor } from "@/lib/rider/placement";
import type { Plot, PlotObject } from "@/lib/rider/model";

export function isStand(o: PlotObject) {
  return o.asset === "hercules-gs414b-plus" || o.asset === "drum-rug" || o.layer === "stands" || o.asset === "boom" || o.asset === "drum-boom";
}
export function isStandPlacementItem(o: PlotObject) {
  return isStand(o) || o.asset === "monitor-table";
}
export function standBase(o: PlotObject) {
  return stageAnchor(o);
}
export function feetInches(feet: number) {
  const inches = Math.round(Math.abs(feet) * 12);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}
function printedOffset(offset: number, compact: boolean) {
  const feet = Math.round(Math.abs(offset));
  if (!feet) return "On centreline";
  if (compact) return feet + "′ " + (offset < 0 ? "SR" : "SL");
  return feet + " ft " + (offset < 0 ? "stage right" : "stage left");
}

export function StandMeasurements({ plot: p, selected, printLayout = false }: {
  plot: Plot; selected: string | null; printLayout?: boolean;
}) {
  const stands = p.objects.filter(isStand);
  return <g className="stand-measurements" pointerEvents="none">
    {stands.map((o, index) => {
      const b = standBase(o), hot = selected === o.id;
      const crowded = stands.some((other) => other.id !== o.id && Math.abs(standBase(other).x - b.x) < 3.6 && Math.abs(standBase(other).y - b.y) < 1.5);
      const stagger = crowded && index % 2 === 1;
      const labelY = b.y + (printLayout ? .87 : .6) + (stagger ? (printLayout ? 1.25 : .75) : 0);
      return <g key={o.id}>
        {hot && <path d={`M${p.width / 2} ${b.y}H${b.x}V${p.depth}`} stroke="#196166" strokeWidth=".045" fill="none" strokeDasharray=".12 .1" />}
        <path d={`M${b.x - 0.16} ${b.y}h.32M${b.x} ${b.y - 0.16}v.32`} stroke="#196166" strokeWidth=".06" />
        <text x={b.x + 0.22} y={b.y - 0.16} fontSize=".38" fill="#203b38" stroke="#fffefa" strokeWidth=".10" paintOrder="stroke" fontWeight="700">{o.asset === "drum-rug" ? "RUG" : `S${index + 1}`}{!printLayout && !o.placement && "?"}</text>
        {stagger && <path d={`M${b.x} ${b.y + .2}V${labelY - .38}`} stroke="#728780" strokeWidth=".025" />}
        <text x={b.x} y={labelY} textAnchor="middle" fontSize={printLayout ? .61 : .38} fontWeight={printLayout ? 600 : undefined} fill="#203b38" stroke="#fffefa" strokeWidth=".12" paintOrder="stroke">
          {printLayout ? printedOffset(b.x - p.width / 2, true) : Math.abs(b.x - p.width / 2) < 1 / 24 ? "On centreline" : `${feetInches(b.x - p.width / 2)} ${b.x < p.width / 2 ? "SR" : "SL"}`}
          <tspan x={b.x} dy={printLayout ? .67 : .43}>{printLayout ? `front ${Math.round(p.depth - b.y)}′` : `front: ${feetInches(p.depth - b.y)}`}</tspan>
        </text>
      </g>;
    })}
  </g>;
}

export function StandPlacementPanel({ plot: p, selected, editing, printLayout = false, onSelect, onChange }: {
  plot: Plot; selected: string | null; editing: boolean; printLayout?: boolean; onSelect: (id: string) => void; onChange: (p: Plot) => void;
}) {
  const [error, setError] = useState("");
  const stands = p.objects.filter(isStand);
  const object = stands.find((o) => o.id === selected);
  function patch(o: PlotObject, next: PlotObject) {
    setError("");
    onChange(syncStandMovement(p, { ...p, objects: p.objects.map((item) => item.id === o.id ? next : item) }, o.id));
  }
  function position(o: PlotObject, field: "offset" | "setback", value: number) {
    const base = standBase(o);
    const x = field === "offset" ? p.width / 2 + value : base.x;
    const y = field === "setback" ? p.depth - value : base.y;
    if (x < 0 || x > p.width || y < 0 || y > p.depth) { setError("Keep the stand base inside the playing area."); return; }
    const next = { ...o, x: o.x + x - base.x, y: o.y + y - base.y };
    if (next.x < -2 || next.y < -2) { setError("That position places the artwork outside the supported stage margin."); return; }
    patch(o, next);
  }
  function addRug() {
    const drummer = p.objects.find((o) => o.asset === "sam");
    const x = Math.max(0, Math.min(p.width - 6, (drummer ? drummer.x + drummer.w / 2 : p.width / 2) - 3));
    const y = Math.max(0, Math.min(p.depth - 6, drummer ? drummer.y - .5 : 1));
    const id = crypto.randomUUID();
    onChange({ ...p, objects: [...p.objects, { id, asset: "drum-rug", label: "Drum rug", layer: "equipment", x, y, w: 6, h: 6, opacity: 1, placement: { x: 3, y: 6 } }], gear: [...p.gear, { id: crypto.randomUUID(), item: "Drum rug", spec: "Approx. 6 × 6 ft; non-slip backing", quantity: 1, provider: "To confirm", plotIds: [id], sourceIds: [], station: "Sam", required: true, confirmed: false, notes: "Sized to support four-piece kit, pedals, cymbal stands and throne. Confirm fit with drummer. Plot measures downstage centre of rug." }] });
    onSelect(id);
  }
  return <div className="stand-placement-panel">
    {editing && p.objects.some(needsInstrumentStand) && <button type="button" onClick={() => { try { onChange(separateInstrumentStands(p)); } catch (e) { setError(e instanceof Error ? e.message : "Could not separate stands."); } }}>Separate guitars and Hercules stands</button>}
    {editing && !p.objects.some((o) => o.asset === "drum-rug") && <button type="button" onClick={addRug}>Add drum rug (6 × 6 ft)</button>}
    <p className="hint">
      Measure from centreline and the downstage edge to each stand base. For the rug, measure to the centre of its downstage edge.
      {!printLayout && " ? means the base reference is approximate. Nord support is included in its equipment artwork and needs a separate placement reference."}
    </p>
    {editing && object && <div className="stand-position-fields" key={object.id}>
      <strong>{object.label}</strong>
      <label>Centreline offset (ft, − SR / + SL)<input type="number" step={1 / 12} defaultValue={Number((standBase(object).x - p.width / 2).toFixed(3))} key={`x-${standBase(object).x}-${p.width}`} onBlur={(e) => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) position(object, "offset", e.target.valueAsNumber); }} /></label>
      <label>Upstage from front (ft)<input type="number" min="0" max={p.depth} step={1 / 12} defaultValue={Number((p.depth - standBase(object).y).toFixed(3))} key={`y-${standBase(object).y}-${p.depth}`} onBlur={(e) => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) position(object, "setback", e.target.valueAsNumber); }} /></label>
      <label>Base reference across artwork (ft)<input type="number" min="0" max="60" step="0.01" defaultValue={objectAnchor(object).x} onBlur={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 60) patch(object, withAnchor(object, { x: value, y: objectAnchor(object).y })); }} /></label>
      <label>Base reference down artwork (ft)<input type="number" min="0" max="60" step="0.01" defaultValue={objectAnchor(object).y} onBlur={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 60) patch(object, withAnchor(object, { x: objectAnchor(object).x, y: value })); }} /></label>
      {!object.placement && <button type="button" onClick={() => patch(object, { ...object, placement: objectAnchor(object) })}>Use marked base reference</button>}
      <label>Match another stand’s front setback<select value="" onChange={(e) => { const other = stands.find((s) => s.id === e.target.value); if (other) position(object, "setback", p.depth - standBase(other).y); }}><option value="">Choose a stand</option>{stands.filter((o) => o.id !== object.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      <span className="hint">Matching aligns the current positions. Later moves remain independent.</span>
    </div>}
    {error && <p role="alert">{error}</p>}
    <table><thead><tr><th>Item</th><th>Position / type</th><th>From centreline</th><th>From front edge</th>{!printLayout && <th>Base reference</th>}</tr></thead><tbody>{stands.map((o, index) => {
      const b = standBase(o), offset = b.x - p.width / 2;
      return <tr key={o.id} data-stand-id={o.id}><td>{editing ? <button type="button" aria-pressed={selected === o.id} onClick={() => onSelect(o.id)}>{o.asset === "drum-rug" ? "RUG" : `S${index + 1}`}</button> : o.asset === "drum-rug" ? "RUG" : `S${index + 1}`}</td><td>{o.label}{o.asset === "drum-rug" && (printLayout ? ` · ${o.w} × ${o.h} ft · downstage centre` : ` · ${feetInches(o.w)} × ${feetInches(o.h)} · downstage centre`)}</td><td className="stand-distance">{printLayout ? printedOffset(offset, false) : Math.abs(offset) < 1 / 24 ? "On centreline" : `${feetInches(offset)} ${offset < 0 ? "stage right" : "stage left"}`}</td><td className="stand-distance">{printLayout ? Math.round(p.depth - b.y) + " ft" : feetInches(p.depth - b.y)} upstage</td>{!printLayout && <td>{o.placement ? "Set" : "Approximate ?"}</td>}</tr>;
    })}</tbody></table>
  </div>;
}
