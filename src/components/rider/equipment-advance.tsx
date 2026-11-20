import type { ReactNode } from "react";
import { quantityText, rollup, type Plot } from "@/lib/rider/model";
import { sideStageCables } from "@/lib/rider/side-stage-cables";
import type { Packet } from "./print-packet";

type Requirement = ReturnType<typeof rollup>[number] & {
  cableLengths?: Pick<ReturnType<typeof rollup>[number], "spec" | "quantity" | "unknown">[];
};

function combineCableLengths(rows: Requirement[]): Requirement[] {
  const result: Requirement[] = [];
  for (const row of rows) {
    if (!/^(instrument|xlr) cables?$/i.test(row.item)) { result.push(row); continue; }
    const item = /^xlr/i.test(row.item) ? "XLR cables" : "Instrument cables";
    let combined = result.find(g => g.cableLengths && g.item === item && g.provider === row.provider && g.required === row.required && g.confirmed === row.confirmed);
    if (!combined) {
      combined = { ...row, item, spec: "", quantity: 0, unknown: 0, stations: new Set(), allocations: [], cableLengths: [] };
      result.push(combined);
    }
    combined.quantity += row.quantity;
    combined.unknown += row.unknown;
    row.stations.forEach(station => combined.stations.add(station));
    combined.allocations.push(...row.allocations);
    const length = combined.cableLengths!.find(length => length.spec === row.spec);
    if (length) { length.quantity += row.quantity; length.unknown += row.unknown; }
    else combined.cableLengths!.push({ spec: row.spec, quantity: row.quantity, unknown: row.unknown });
  }
  for (const row of result) row.cableLengths?.sort((a, b) => (Number.parseFloat(b.spec) || 0) - (Number.parseFloat(a.spec) || 0) || a.spec.localeCompare(b.spec));
  return result;
}
const categories = ["Instruments", "Drums", "Stands and hardware", "Drum microphones", "Microphones and DI boxes", "Side Stage Cables", "Main Stage Cables", "Analog Drop Snakes", "Monitors and audio systems", "Stage, risers and power", "Personnel", "Accessories and other equipment"] as const;
type Category = typeof categories[number];
function isDrumMicrophone(g: Plot["gear"][number], plot: Plot) {
  return /microphone|\bmic\b|condenser|\bsm57\b|\bksm32\b|beta 52a/i.test(`${g.item} ${g.spec}`)
    && !/stand|mount|cable/i.test(g.item)
    && g.sourceIds.some(id => plot.inputs.some(input => input.id === id && input.kind === "Mic" && /kick|snare|hi.hat|overhead|drum|\btom\b/i.test(input.source)));
}
function category(row: Requirement, plot?: Plot): Category {
  if (plot && row.allocations.every(g => isDrumMicrophone(g, plot))) return "Drum microphones";
  const item = row.item.toLowerCase();
  const text = `${item} ${row.spec}`.toLowerCase();
  if (/technician|engineer|personnel|operator|crew/.test(item)) return "Personnel";
  if (/^(drum kit|drums|drum rug|cymbals?|drum hardware|drum throne)$/.test(item) || (item === "instrument / backline" && /^drums?$/i.test(row.spec))) return "Drums";
  if (/stand|mount|hardware|throne/.test(item)) return "Stands and hardware";
  if (/splitter/.test(item) || /digital stage.?box/.test(text)) return "Monitors and audio systems";
  if (/stage.?box|drop snake|subsnake/.test(item)) return "Analog Drop Snakes";
  if (/cable|snake|loom/.test(item)) {
    const atRack = [...row.stations].some(station => /sidestage|side stage|stage.left rack/i.test(station));
    return atRack ? "Side Stage Cables" : "Main Stage Cables";
  }
  if (/microphone|\bmic\b|\bdi\b|direct box/.test(item)) return "Microphones and DI boxes";
  if (/rug|riser|platform|power|ac drop|\btable\b/.test(item)) return "Stage, risers and power";
  if (/monitor|console|mixer|iem|in.ear|speaker|kemper|hx stomp/.test(text)) return "Monitors and audio systems";
  if (/instrument|guitar|bass|cello|keyboard|drum/.test(item) && !/pickup/.test(item)) return "Instruments";
  return "Accessories and other equipment";
}

// Keep supplier instructions distinct from imported ledger/audit commentary.
function supplierNotes(g: Requirement, plot: Plot): string[] {
  const notes = [...new Set(g.allocations.map(a => a.notes.trim()).filter(note => note && note.toLowerCase() !== g.spec.toLowerCase()))];
  return [...new Set(notes.flatMap(note => {
    if (/^(Source says|Model is source|Stand type listed|Planning placeholder|Instrument listed|Plotted location|Confirm stand or mounting|Regular XLR sax|Allocation:|Two basses total:|One dedicated stand|acoustic guitar stand|electric guitar stand)/i.test(note)) return [];
    if (/^Backline cello\./.test(note)) return ["Supply ready for the separately requested pickup to be fitted and tested."];
    if (/^Separate from the cello rental\./.test(note)) return ["Include mounting hardware; fit and test on the supplied cello. Match pickup to DI/preamp #6."];
    if (/^Required acoustic signal chain:/.test(note)) {
      const allocation = g.allocations.find(a => a.notes.trim() === note);
      const input = plot.inputs.find(i => i.kind === "DI" && allocation?.sourceIds.includes(i.id));
      const destination = input ? `DI #${input.number}` : "DI";
      return [`Acoustic guitar → tuner → ${destination}. Include footswitch tuning mute, bypass and compatible pedal power.`];
    }
    if (/^Shared drum kit record\./.test(note)) return ["Drum package specifications will be supplied separately."];
    if (/^Sized to support four-piece kit/.test(note)) return [];
    if (/^Stage-input estimate:/.test(note)) return ["3-pin XLR female-to-male. Estimated stage-input stock lengths include perimeter/local drum routing, mic rise and slack. Verify reach at setup. Monitor/FOH/trunk cabling and spares are separate."];
    if (/^instrument cables?$/i.test(g.item) && /Shielded 1\/4 in TS male-to-male/.test(note)) return ["Shielded 1/4 in TS male-to-male."];
    return note.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }))];
}

function requestName(g: Requirement) {
  if (g.item !== "Instrument / backline") return g.item;
  if (/acoustic|aco gtr/i.test(g.spec)) return "Acoustic guitar";
  if (/drum/i.test(g.spec)) return "Drum kit";
  if (/sax/i.test(g.spec)) return "Saxophone";
  return g.spec || g.item;
}

function drumSections(g: Requirement) {
  if (category(g) !== "Drums") return [];
  const notes = g.allocations.map(a => a.notes).join("\n\n");
  if (!notes.startsWith("## ")) return [];
  return notes.split(/^## /m).filter(Boolean).map(block => {
    const [heading, ...lines] = block.trim().split(/\r?\n/);
    return { heading, paragraphs: lines.filter(line => line.trim() && !line.startsWith("- ")), bullets: lines.filter(line => line.startsWith("- ")).map(line => line.slice(2)) };
  });
}

function DrumPackage({ requirement: g }: { requirement: Requirement }) {
  return <div className="advance-drum-package">
    <p className="drum-package-title"><strong>{quantityText(g)} × {requestName(g)}</strong> · {[...g.stations].join(", ")}</p>
    {g.spec && <p>{g.spec}</p>}
    <div className="drum-spec-sections">{drumSections(g).map(section => <section className="drum-spec-section" key={section.heading}>
      <h3>{section.heading}</h3>
      {section.paragraphs.map(line => <p key={line}>{line}</p>)}
      {section.bullets.length > 0 && <ul>{section.bullets.map(line => <li key={line}>{line}</li>)}</ul>}
    </section>)}</div>
  </div>;
}

function RequirementNotes({ notes }: { notes: string[] }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const note of notes) {
    const list = note.startsWith("- ");
    const line = list ? note.slice(2) : note;
    const previous = blocks.at(-1);
    if (previous?.list === list) previous.lines.push(line);
    else blocks.push({ list, lines: [line] });
  }
  return blocks.map((block, index) => block.list
    ? <ul className="advance-note-list" key={index}>{block.lines.map(line => <li key={line}>{line}</li>)}</ul>
    : <div key={index}>{block.lines.map(line => <div className="advance-note" key={line}>{line}</div>)}</div>);
}

function Requirements({ rows, plot, rackCables, unresolved = false }: { rows: Requirement[]; plot: Plot; rackCables?: ReturnType<typeof sideStageCables>; unresolved?: boolean }) {
  return <>{categories.map(name => {
    const firstChannel = (g: Requirement) => Math.min(...g.allocations.flatMap(a => a.sourceIds).map(id => plot.inputs.find(input => input.id === id)?.number ?? Infinity));
    const standOrder = (g: Requirement) => /vocal mic stands/i.test(g.item) ? 0 : /stands for drum mics/i.test(g.item) ? 1 : /stands for sax\/cello/i.test(g.item) ? 2 : 3;
    const group = rows.filter(row => category(row, plot) === name).sort((a, b) => (name === "Drum microphones" ? firstChannel(a) - firstChannel(b) : name === "Stands and hardware" ? standOrder(a) - standOrder(b) : 0) || a.item.localeCompare(b.item) || a.spec.localeCompare(b.spec));
    const patch = name === "Side Stage Cables" && rackCables?.included.size ? rackCables : undefined;
    if (!group.length && !patch) return null;
    const packages = group.filter(g => drumSections(g).length > 0);
    const tableRows = group.filter(g => !packages.includes(g));
    return <section className={"advance-category" + (name === "Drums" ? " advance-drums" : name === "Drum microphones" ? " advance-drum-mics" : name === "Stage, risers and power" ? " advance-stage" : "")} key={name}>
      <h2>{name}</h2>
      {patch && <div className="side-stage-cables">
        <p>Allow approximately 10 ft per run for the monitor and wireless mic connections on the stage-left rack table.</p>
        {([["Monitors", patch.monitors], ["Wireless mics", patch.wireless]] as const).map(([heading, lines]) =>
          lines.length > 0 && <div key={heading}><h3>{heading}</h3>
            <ul className="advance-note-list">{lines.map(line => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
      </div>}
      {name === "Drums" && !packages.length && group.some(g => g.item === "Drum kit" || (g.item === "Instrument / backline" && /^drums?$/i.test(g.spec))) && <p>Drum package details to follow from The Swell. Existing listed items below remain part of the advance.</p>}
      {packages.map(g => <DrumPackage requirement={g} key={g.allocations[0].id} />)}
      {tableRows.length > 0 && <table className="advance-table">
        <colgroup><col className="advance-qty" /><col /><col className="advance-use" /></colgroup>
        <thead><tr><th>Qty.</th><th>Description</th><th>Ref.</th></tr></thead>
        <tbody>{tableRows.map(g => {
          const channels = [...new Set(g.allocations.flatMap(a => a.sourceIds).map(id => plot.inputs.find(i => i.id === id)?.number).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
          const notes = supplierNotes(g, plot);
          return <tr key={g.allocations[0].id}>
            <td>{quantityText(g)}</td>
            <td><strong>{requestName(g)}</strong>{!g.required && <span> (optional)</span>}{g.spec && g.item !== "Instrument / backline" && <div>{g.spec}</div>}{g.cableLengths && <ul className="advance-note-list">{g.cableLengths.map(length => <li key={length.spec}>{quantityText(length)} @ {length.spec || "length to confirm"}</li>)}</ul>}<RequirementNotes notes={notes} /></td>
            <td>{unresolved && <div>Supplier to confirm</div>}{[...g.stations].join(", ")}{channels.length > 0 && <div>#{channels.join(", #")}</div>}</td>
          </tr>;
        })}</tbody>
      </table>}
    </section>;
  })}</>;
}

export function EquipmentAdvance({ plot, packet, title }: { plot: Plot; packet: Packet; title: (name: string) => ReactNode }) {
  // Confirmation belongs in the editor, not the supplier order or its grouping key.
  const rackCables = sideStageCables(plot);
  const requests = plot.gear.filter(g => !rackCables.included.has(g.id)).map(g => ({ ...g, confirmed: false }));
  // A drum SM57 and a sax/cello spare must retain their distinct uses even if
  // their procurement item/specification is identical.
  const rows = combineCableLengths([
    ...rollup(requests.filter(g => isDrumMicrophone(g, plot))),
    ...rollup(requests.filter(g => !isDrumMicrophone(g, plot))),
  ]);
  const backline = rows.filter(g => g.provider === "Backline");
  const audio = rows.filter(g => g.provider === "Venue production");
  const band = rows.filter(g => g.provider === "The Swell");
  const unresolved = rows.filter(g => g.provider === "To confirm");
  const full = packet === "Full rider";
  return <>
    {(full || packet === "Backline") && <section className="print-sheet advance-sheet" data-advance="backline">
      {title("Backline requirements")}
      <p className="advance-intro">Provided by the backline supplier. Quantities below are totals, including listed backups. TBD means the quantity still needs agreement.</p>
      <Requirements rows={backline} plot={plot} />
      {!backline.length && <p>No backline requirements assigned yet.</p>}
    </section>}
    {(full || packet === "Audio production") && <section className="print-sheet advance-sheet" data-advance="audio">
      {title("Audio requirements")}
      <p className="advance-intro">Provided by venue production. Quantities below are totals. See the audio input key for channel details; items with unassigned suppliers are listed separately.</p>
      <section className="advance-category"><h2>Monitors</h2><p>{plot.monitors || "Monitor system, mix count and output connections need to be specified."}</p></section>
      <Requirements rows={audio} plot={plot} rackCables={rackCables} />
      <section className="advance-category"><h2>Power and production details</h2><p>{plot.power || "Power requirements need to be specified."}</p>
        {!audio.some(g => /riser|platform/i.test(g.item)) && <p>Risers: no requirement recorded; confirm whether any are needed.</p>}
        {!audio.some(g => /personnel|engineer|technician|operator|crew/i.test(g.item)) && <p>Personnel: crew roles and coverage have not been specified.</p>}
      </section>
      <section className="advance-category"><h2>Production contact</h2><p>{plot.contact || "Production contact needs to be specified."}</p></section>
    </section>}
    {band.length > 0 && <section className="print-sheet advance-sheet" data-advance="band">
      {title("The Swell brings")}
      <p className="advance-intro">Band-provided equipment, for coordination. These items are excluded from the supplier requirements above.</p>
      <Requirements rows={band} plot={plot} />
    </section>}
    {unresolved.length > 0 && <section className="print-sheet advance-sheet" data-advance="unassigned">
      {title("Supply responsibilities to confirm")}
      <p className="advance-intro">These requirements have no assigned supplier. Agree responsibility before treating either supplier list as a complete order. TBD quantities are not inferred from input counts.</p>
      <Requirements rows={unresolved} plot={plot} unresolved />
    </section>}
  </>;
}
