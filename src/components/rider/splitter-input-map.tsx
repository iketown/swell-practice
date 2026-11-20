import type { RackMap } from "@/lib/rider/rack-map";
import { boxCode, wirelessRoutes, type RackInput } from "@/lib/rider/rack-inputs";
import type { Plot } from "@/lib/rider/model";

type Feed = { split: number; source: string; tail: string; assigned: boolean };
const width = 900;
const jackY = 242;
const jackRadius = 16;
const jackX = (split: number) => 128 + (split - 1) * 44;
const ink = "#264b40";

function tailFeed(row: RackInput): Feed {
  return {
    split: row.number,
    source: row.source,
    tail: row.socket.replace(/^([UL])·/, "$1"),
    assigned: row.channel !== null,
  };
}

function SourceGroup({ title, feeds, x, w, above }: {
  title: string; feeds: Feed[]; x: number; w: number; above: boolean;
}) {
  if (!feeds.length) return null;
  const top = above ? 6 : 352;
  const height = above ? 134 : 120;
  const cellWidth = w / feeds.length;
  const direction = above ? 1 : -1;
  const edge = above ? top + height : top;
  const tip = jackY - direction * jackRadius;

  return <g aria-label={title}>
    <rect x={x} y={top} width={w} height={height} rx="5" fill="white" stroke={ink} strokeWidth="1.5" />
    <text x={x + w / 2} y={above ? top + 23 : top + height - 10} textAnchor="middle" fontSize="19" fontWeight="bold">{title}</text>
    <path d={`M${x} ${above ? top+32 : top+height-32} h${w}`} stroke={ink} />
    {feeds.map((feed, index) => {
      const left = x + index * cellWidth;
      const center = left + cellWidth / 2;
      const dest = jackX(feed.split);
      const route = `${feed.tail} · ${feed.source} → split in ${feed.split}`;
      const path = `M${center} ${edge} v${direction*12} L${dest} ${tip-direction*30} V${tip}`;
      return <g key={feed.split}>
        {index > 0 && <path d={`M${left} ${above ? top+32 : top} v${height-32}`} stroke="#b1beb8" />}
        <foreignObject x={left + 2} y={above ? top + 33 : top + 23} width={cellWidth - 4} height={height - 56}>
          <div className="splitter-source-name">{feed.source}</div>
        </foreignObject>
        <text x={center} y={above ? edge - 7 : edge + 19} textAnchor="middle" fontSize="16" fontWeight="bold"
          textLength={feed.tail.length * 9 > cellWidth - 6 ? cellWidth - 6 : undefined} lengthAdjust="spacingAndGlyphs">{feed.tail}</text>
        {feed.assigned && <g aria-label={route}>
          <title>{route}</title>
          <path d={path} fill="none" stroke="white" strokeWidth="5" />
          <path d={path} fill="none" stroke={ink} strokeWidth="2" />
          <path d={`M${dest} ${tip} l-5 ${-direction*10} h10 Z`} fill={ink} />
        </g>}
      </g>;
    })}
  </g>;
}

export function SplitterInputMap({ inputs, plot, map }: { inputs: RackInput[]; plot: Plot; map: RackMap }) {
  const upper: Feed[] = [];
  const stageLeft: Feed[] = [];
  const upperNames = new Set<string>();
  for (const row of inputs) {
    const code = boxCode(row.boxName ?? "");
    if (code === "L") stageLeft.push(tailFeed(row));
    else {
      upperNames.add(code === "U" ? "Upstage box" : row.boxName ?? "Unassigned sources");
      upper.push(tailFeed(row));
    }
  }
  const receivers = wirelessRoutes(plot, map).map(rx => ({
    split: rx.channel, source: rx.source, tail: "XLR out", assigned: true,
  }));
  const routes = [...upper, ...stageLeft, ...receivers];
  return <div className="patch-bank splitter-input-map">
    <svg viewBox={`0 0 ${width} 480`} role="img" aria-label={routes.map(r =>
      `${r.tail}, ${r.source}, split input ${r.split}`).join(". ")}>
      <rect x="2" y={jackY-28} width="896" height="56" rx="5" fill="#eff3f1" stroke={ink} strokeWidth="2" />
      <text x="12" y={jackY-2} fontSize="16" fontWeight="bold">FOH splitter</text>
      <text x="12" y={jackY+17} fontSize="14">Analog inputs</text>
      {Array.from({length:18}, (_, i) => i + 1).map(port => (
        <g key={port}>
          <circle cx={jackX(port)} cy={jackY} r={jackRadius} fill="white" stroke={ink} strokeWidth="2" />
          <text x={jackX(port)} y={jackY+6} textAnchor="middle" fontSize="19" fontWeight="bold">{port}</text>
        </g>
      ))}
      <SourceGroup title={upperNames.size === 1 ? [...upperNames][0] : "Subsnake tails"} feeds={upper} x={3} w={894} above />
      <SourceGroup title="Stage-left box" feeds={stageLeft} x={3} w={555} above={false} />
      <SourceGroup title="Wireless mic receivers" feeds={receivers} x={594} w={303} above={false} />
    </svg>
  </div>;
}
