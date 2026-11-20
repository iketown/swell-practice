import type { RackInput } from "@/lib/rider/rack-inputs";
import { s16Front, s16InputCenter } from "./s16-panel";

const width = 744;
const panelWidth = 578;
const scale = panelWidth / s16Front.width;
const panelX = width - panelWidth;
const panelHeight = s16Front.height * scale;

type TailGroup = { rows: RackInput[]; above: boolean; code: "U" | "L" };
function TailLabels({ rows, above, code }: TailGroup) {
  if (!rows.length) return null;
  return (
    <div className="subsnake-tail-labels" style={{gridTemplateColumns: `repeat(${rows.length}, 1fr)`}}>
      {rows.map(row => (
        <div key={row.number}>
          {!above && <span>Split in {row.number}</span>}
          <strong>{code}{row.channel}</strong>
          <b>{row.source}</b>
          {above && <span>Split in {row.number}</span>}
        </div>
      ))}
    </div>
  );
}

function CableArrows({ rows, above, code, height }: TailGroup & { height: number }) {
  const panelY = (height - panelHeight) / 2;
  const direction = above ? 1 : -1;
  const edge = above ? 0 : height;
  const labelY = above ? panelY - 14 : panelY + panelHeight + 14;
  return rows.map((row, i) => {
    const socket = s16InputCenter(row.s16);
    const x = panelX + scale * socket.x;
    const y = panelY + scale * socket.y;
    const startX = width * (i + 0.5) / rows.length;
    // When repatched across banks, pass between the nearer jacks to reach the far one.
    const farRow = (row.s16 <= 8) !== above;
    const laneX = farRow ? x + direction * 15 : x;
    const tipY = y - direction * 2;
    const path = `M ${startX} ${edge} v ${direction * 10} L ${laneX} ${labelY - direction * 19}
      V ${tipY - direction * (farRow ? 24 : 10)} L ${x} ${tipY - direction * 8} V ${tipY}`;
    return (
      <g key={row.number}>
        <title>{`${code}${row.channel} · ${row.source} → split ${row.number} → S16 IN ${row.s16}`}</title>
        <path d={path} fill="none" stroke="white" strokeWidth="5" />
        <path d={path} fill="none" stroke="#1c4c40" strokeWidth="2.2" />
        <path d={`M ${x} ${tipY} l -5 ${-direction * 10} h 10 Z`} fill="#163d33" stroke="white" strokeWidth="1" />
        <rect x={laneX - 10} y={labelY - 9} width="20" height="18" rx="3" fill="white" />
        <text x={laneX} y={labelY + 5} textAnchor="middle" fontSize="15" fontWeight="700">{row.s16}</text>
      </g>
    );
  });
}

export function SubsnakePanelMap({ inputs, code, print }: { inputs: RackInput[]; code: "U" | "L"; print: boolean }) {
  const height = print ? 216 : 350;
  const panelY = (height - panelHeight) / 2;
  const above: RackInput[] = [];
  const below: RackInput[] = [];
  for (const row of inputs) {
    const fromAbove = code === "U" ? (row.channel ?? 0) <= 6 : row.s16 <= 8;
    (fromAbove ? above : below).push(row);
  }
  return (
    <div className="patch-bank subsnake-panel-map">
      <div className="subsnake-panel-content">
        <TailLabels code={code} rows={above} above />
        <svg viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={inputs.map(r => `${r.source}, tail ${r.channel}, split ${r.number}, S16 input ${r.s16}, X32 channel ${r.number}`).join(". ")}>
          <image href={s16Front.src} x={panelX} y={panelY} width={panelWidth} height={panelHeight}/>
          <text x="0" y={height / 2 - 8} fontSize="15">Behringer</text>
          <text x="0" y={height / 2 + 23} fontSize="32" fontWeight="700">S16</text>
          <text x="0" y={height / 2 + 45} className="patch-cap">FRONT PANEL</text>
          <CableArrows height={height} code={code} rows={above} above />
          <CableArrows height={height} code={code} rows={below} above={false} />
        </svg>
        <TailLabels code={code} rows={below} above={false} />
      </div>
    </div>
  );
}
