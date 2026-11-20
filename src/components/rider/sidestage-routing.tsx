import { useId } from "react";
import type { RackOverview } from "@/lib/rider/rack-overview";
import { rackOverviewWidth } from "@/lib/rider/rack-overview";

function Device({ x, y, width, name, detail }: {
  x: number; y: number; width: number; name: string; detail?: string;
}) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={width} height="1.65" rx=".15" fill="white" stroke="#294b43" strokeWidth=".07" />
    <text x={width / 2} y={detail ? .69 : 1.04} fontSize=".59" fontWeight="700">{name}</text>
    {detail && <text x={width / 2} y="1.31" fontSize=".43">{detail}</text>}
  </g>;
}

export function SidestageRouting({ width, layout }: { width: number; layout: RackOverview }) {
  const arrow = useId().replaceAll(":", "") + "-rack-arrow";
  const { top, rear, boxes } = layout;
  const line = (path: string, label: string) => <path aria-label={label} d={path}
    fill="none" stroke="#294b43" strokeWidth=".085" strokeLinejoin="round" markerEnd={`url(#${arrow})`} />;
  return <g transform={`translate(${width} ${top})`} textAnchor="middle" fill="#203d35" pointerEvents="none"
    aria-label="Sidestage rack signal flow">
    <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10Z" fill="#294b43" />
    </marker></defs>
    {boxes.map((box, i) => {
      const x = box.x + box.width / 2 - width;
      const y = box.y - top;
      const inlet = 5.3 - 2.8 * (i + .5) / boxes.length;
      const fromStageLeft = box.code === "L" || (box.code !== "U" && box.x + box.width >= width * .8);
      let path = `M${x} ${y} V${rear - top} H${inlet} V2.3`;
      if (box.x >= width) path = `M${x} ${y + box.height} V.7 H${inlet} V2.3`;
      else if (fromStageLeft) path = `M${box.x + box.width - width} ${y + box.height / 2} H${inlet} V2.3`;
      return <g key={box.id}>{line(path, box.label + " trunk to analog splitter")}</g>;
    })}
    <Device x={7.0} y={-2.35} width={5.5} name="Wireless mic RX" detail="2 receivers" />
    {line("M9.75 -.7 V.8 H6.55 V2.3", "Wireless receiver outputs to splitter 17–18")}
    <text x="9.0" y=".54" fontSize=".47">17–18</text>
    <Device x={2.25} y={2.3} width={5.5} name="Analog splitter" detail="18 inputs" />
    {line(`M7.75 3.12 H${rackOverviewWidth + .65}`, "House split tails to FOH")}
    <text x="9.05" y="2.85" fontSize=".47">Split 1–18</text>
    <text x="12.15" y="2.85" fontSize=".59" fontWeight="700">to FOH</text>
    {line("M3.1 3.95 V6.15", "Monitor tails 1–16 to S16")}
    <text x="3.38" y="5.18" textAnchor="start" fontSize=".47">1–16</text>
    {line("M6.85 3.95 V4.65 H8.65 V6.15", "Monitor tails 17–18 to X32 Rack")}
    <text x="7.8" y="5.55" fontSize=".47">17–18</text>
    <Device x={.6} y={6.15} width={4.3} name="S16" detail="Stage box" />
    <Device x={6.95} y={6.15} width={4.4} name="X32 Rack" detail="Monitor mixer" />
    <path d="M4.97 7.23 H6.88" stroke="#294b43" strokeWidth=".08" markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`} />
    <text x="5.92" y="6.94" fontSize=".45">AES50</text>
    {line("M11.35 6.98 H11.95 V5.12 H13.65", "Three X32 playback outputs to FOH channels 19–21")}
    <text x="12.83" y="4.8" textAnchor="end" fontSize=".47">Playback 19–21</text>
    {line("M2.75 7.8 V8.7 H4.5 V9.45", "S16 stereo outputs to IEM transmitters")}
    {line("M9.15 7.8 V8.7 H7.45 V9.45", "X32 stereo outputs to IEM transmitters")}
    <Device x={3.05} y={9.45} width={5.85} name="Wireless IEM TX" detail="5 active · 1 spare" />
    <text x="6.5" y="12.05" fontSize=".54" fontWeight="700">See rack guide p. 2 for channel routes.</text>
  </g>;
}
