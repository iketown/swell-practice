import type { ReactNode } from "react";
import type { Plot } from "@/lib/rider/model";
import { earRoutes, type RackMap } from "@/lib/rider/rack-map";
import { boxCode, rackInputs, wirelessRoutes, type RackInput } from "@/lib/rider/rack-inputs";

import { SubsnakePanelMap } from "./subsnake-panel-map";

function InputBank({ inputs, first, code }: { inputs: RackInput[]; first: number; code: string }) {
  // Order the wires by destination so their horizontal and vertical legs never cross.
  const rows = inputs.filter(row => row.s16 >= first && row.s16 < first + 8).sort((a,b) => a.s16 - b.s16);
  if (!rows.length) return null;
  const jackX = (n: number) => 389 + (n - first) * 44;
  const height = 91 + rows.length * 36;
  return <div className="patch-bank"><svg viewBox={`0 0 720 ${height}`} role="img" aria-label={rows.map(r => `${r.source}, tail ${r.channel ?? "unassigned"}, split ${r.number}, S16 input ${r.s16}, X32 channel ${r.number}`).join(". ")}>
    <text className="patch-cap" x="369" y="16">S16 FRONT · {first === 1 ? "TOP" : "BOTTOM"} ROW</text>
    <rect x="367" y="24" width="352" height="45" rx="6" fill="#f1f4f3" stroke="#8f9d98"/>
    {Array.from({ length: 8 }, (_, i) => {
      const n = first + i, active = rows.some(r => r.s16 === n);
      return <g key={n}>
        <circle cx={jackX(n)} cy="46" r="16" fill={active ? "#fff" : "none"} stroke={active ? "#193e36" : "#9fa9a5"} strokeWidth={active ? 2.6 : 1} />
        <text x={jackX(n)} y="52" textAnchor="middle" fontSize="17" fontWeight={active ? 700 : 400} fill={active ? "#152f29" : "#707b76"}>{n}</text>
      </g>;
    })}
    <text className="patch-cap" x="2" y="79">SOURCE</text>
    <text className="patch-cap" x="215" y="79" textAnchor="middle">TAIL</text>
    <text className="patch-cap" x="308" y="79" textAnchor="middle">SPLIT IN</text>
    {rows.map((r,i) => {
      const y = 104 + i * 36, x = jackX(r.s16);
      return <g key={r.number}>
        <text x="2" y={y + 5} fontSize="15" textLength={r.source.length > 24 ? 172 : undefined} lengthAdjust="spacingAndGlyphs">{r.source}</text>
        <rect x="188" y={y-13} width="54" height="26" rx="4" fill="white" stroke="#354a43" />
        <text x="215" y={y+5} textAnchor="middle" fontWeight="bold" fontSize="15">{r.channel == null ? "?" : code + r.channel}</text>
        <path d={`M243 ${y} H287 m42 0 H${x} V66`} fill="none" stroke="#31574d" strokeWidth="2"/>
        <path d={`M${x-4} 70 l4 -7 4 7`} fill="#31574d"/>
        <rect x="288" y={y-13} width="40" height="26" rx="3" fill="white" stroke="#31574d"/>
        <text x="308" y={y+5} textAnchor="middle" fontSize="16" fontWeight="bold">{r.number}</text>
      </g>;
    })}
  </svg></div>;
}

function WirelessAndEars({ plot, map }: { plot: Plot; map: RackMap }) {
  return <div className="patch-body">
    <h3>Wireless microphones</h3>
    {wirelessRoutes(plot, map).map(rx => <div className="patch-rx" key={rx.channel}>
      <div><b>{rx.source}</b><small>Receiver XLR out</small></div>
      <span className="patch-wire" />
      <div className="patch-socket"><small>Split in</small><b>{rx.channel}</b></div>
      <svg viewBox="0 0 44 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35 H12 V16 H43 M12 35 V54 H43" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      <div className="patch-legs"><span><b>X32 Rack {rx.input}</b> → CH {rx.channel}</span><span>House tail <b>{rx.channel}</b> → FOH</span></div>
    </div>)}
    <p>Keep phantom off on both wireless split legs.</p>
    <h3>Stereo in-ear monitors</h3>
    <div className="patch-iem-head"><span>Mix buses L / R</span><span>Physical XLR outputs</span><span>Transmitter inputs</span></div>
    {earRoutes(map).map(mix => <div key={mix.tx} className="patch-iem">
      <div><b>{mix.name}</b><small>Bus {mix.bus} / {mix.bus + 1}</small></div>
      <div className="patch-iem-outs"><b>{mix.device === "X32" ? "X32 Rack" : "S16"} OUT</b>
        {[0,1].map(i => <span key={i}>{mix.out + i}</span>)}</div>
      <div className="patch-pair"><span className="patch-wire" /><span className="patch-wire" /></div>
      <div className="patch-iem-ins"><span>L</span><span>R</span><b>TX {mix.tx}</b></div>
    </div>)}
    <p>TX 6 is the spare. Leave its audio inputs open.</p>
  </div>;
}

export function PatchDiagrams({ plot, map, title }: { plot: Plot; map: RackMap; title?: (name: string) => ReactNode }) {
  const groups = new Map<string | undefined, RackInput[]>();
  for (const row of rackInputs(plot, map)) {
    const group = groups.get(row.boxId);
    if (group) group.push(row);
    else groups.set(row.boxId, [row]);
  }
  const sheet = (key: string, name: string, content: ReactNode) =>
    <section key={key} className={title ? "print-sheet patch-sheet" : "patch-sheet"}>
      {title ? title(name) : <h2>{name}</h2>}{content}
    </section>;
  return <>
    {Array.from(groups, ([id, rows]) => {
      const label = rows[0].boxName, code = label ? boxCode(label) ?? "" : "";
      const name = code === "U" ? "Upstage subsnake" : code === "L" ? "Stage-left subsnake" : label ?? "Unassigned wired inputs";
      return sheet(id ?? "unassigned", name, <div className="patch-body">
        <p>{id ? <>Find the numbered tail from the {label}. Plug it into the marked analog split input at stage left.</> : <>Assign these sources to a subsnake before patching.</>}</p>
        {(code === "U" || code === "L") ? <SubsnakePanelMap code={code} inputs={rows} /> : [1,9].map(first => <InputBank key={first} first={first} inputs={rows} code={code} />)}
        <div className="patch-handoff"><h3>At the split</h3>
          <p><b>Monitor leg</b> → S16 front input shown above → AES50 A → X32 channel with the split number.</p>
          <p><b>House leg</b> → hand FOH the tail labeled with the split number and source.</p>
        </div>
      </div>);
    })}
    {sheet("rack-wireless-ears", "Wireless mics & stereo ears", <WirelessAndEars plot={plot} map={map}/>)}
  </>;
}
