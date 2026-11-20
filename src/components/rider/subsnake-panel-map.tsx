import type { RackInput } from "@/lib/rider/rack-inputs";
import { s16Front, s16InputCenter } from "./rack-panels";

const width = 744;
const panelWidth = 578;
const scale = panelWidth / s16Front.width;
const panelX = width - panelWidth;
const panelHeight = s16Front.height * scale;

type TailGroup = { rows: RackInput[]; above: boolean };
function tailLabel(row: RackInput) {
  // Keep named and unassigned boxes readable; shorten the two Standard labels for the crew.
  return row.socket.replace(/^([UL])·/, "$1");
}

function TailLabels({ rows, above }: TailGroup) {
  if (!rows.length) return null;
  return (
    <div className="subsnake-tail-labels" style={{gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`}}>
      {rows.map(row => (
        <div key={row.number} className={above ? "split-route" : "split-route from-below"}>
          <div className="split-source"><strong>{tailLabel(row)}</strong><b>{row.source}</b></div>
          <div className="split-terminals">
            <span>Split in {row.number}</span>
            <span>Monitor tail {row.number}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CableArrows({ rows, above, height }: TailGroup & { height: number }) {
  const panelY = (height - panelHeight) / 2;
  const direction = above ? 1 : -1;
  const edge = above ? 0 : height;
  const labelY = above ? panelY - 14 : panelY + panelHeight + 14;
  return rows.map((row, i) => {
    const socket = s16InputCenter(row.s16);
    const x = panelX + scale * socket.x;
    const y = panelY + scale * socket.y;
    const startX = width * (i + 0.5) / rows.length;
    const tipY = y - direction * 2;
    const path = `M ${startX} ${edge} v ${direction * 10} L ${x} ${labelY - direction * 19} V ${tipY}`;
    return (
      <g key={row.number}>
        <title>{`${tailLabel(row)} · ${row.source} → split in ${row.number} → monitor tail ${row.number} → S16 IN ${row.s16}`}</title>
        <path d={path} fill="none" stroke="white" strokeWidth="5" />
        <path d={path} fill="none" stroke="#1c4c40" strokeWidth="2.2" />
        <path d={`M ${x} ${tipY} l -5 ${-direction * 10} h 10 Z`} fill="#163d33" stroke="white" strokeWidth="1" />
        <rect x={x - 10} y={labelY - 9} width="20" height="18" rx="3" fill="white" />
        <text x={x} y={labelY + 5} textAnchor="middle" fontSize="15" fontWeight="700">{row.s16}</text>
      </g>
    );
  });
}

export function SubsnakePanelMap({ inputs, print }: { inputs: RackInput[]; print: boolean }) {
  const height = print ? 216 : 350;
  const panelY = (height - panelHeight) / 2;
  const byPort = [...inputs].sort((a, b) => a.s16 - b.s16);
  const above = byPort.filter(row => row.s16 <= 8);
  const below = byPort.filter(row => row.s16 > 8);
  return (
    <div className="patch-bank subsnake-panel-map">
      <div className="split-handoff">
        <div><b>Subsnake tails → analog split inputs</b><small>U = upstage · L = stage left</small></div>
        <svg viewBox="0 0 42 48" aria-hidden="true"><path d="M0 24 H10 V11 H38 M10 24 V37 H38 M33 7 l6 4 -6 4 M33 33 l6 4 -6 4" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        <div><span><b>Monitor tails</b> → S16 inputs shown below</span><span><b>House tails</b> → FOH with matching split numbers</span></div>
      </div>
      <div className="subsnake-panel-content">
        <TailLabels rows={above} above />
        <svg viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={inputs.map(r => `${r.source}, subsnake tail ${tailLabel(r)}, split in ${r.number}, monitor tail ${r.number}, S16 input ${r.s16}, X32 channel ${r.number}`).join(". ")}>
          <image href={s16Front.src} x={panelX} y={panelY} width={panelWidth} height={panelHeight}/>
          <text x="0" y={height / 2 - 8} fontSize="15">Behringer</text>
          <text x="0" y={height / 2 + 23} fontSize="32" fontWeight="700">S16</text>
          <text x="0" y={height / 2 + 45} className="patch-cap">FRONT PANEL</text>
          <CableArrows height={height} rows={above} above />
          <CableArrows height={height} rows={below} above={false} />
        </svg>
        <TailLabels rows={below} above={false} />
      </div>
      <p className="split-console-link"><b>S16 AES50 A → X32 Rack AES50 A.</b> The X32 channel matches the split input number.</p>
    </div>
  );
}
