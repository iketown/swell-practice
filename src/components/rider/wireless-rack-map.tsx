import type { Plot } from "@/lib/rider/model";
import { wirelessRoutes } from "@/lib/rider/rack-inputs";
import { earRoutes, type RackMap } from "@/lib/rider/rack-map";
import { rackOutputCenter, s16Front, x32Rear, x32WirelessCenter } from "./rack-panels";

const upper = { ...s16Front, x: 6, y: 0, scale: 1 };
const lower = { ...x32Rear, x: 242, y: 342, scale: 1.1 };
const boxTop = 197;
const boxBottom = 271;
const ink = "#254a40";
type Point = { x: number; y: number };

function socketOnMap(panel: typeof upper, socket: Point): Point {
  return { x: panel.x + socket.x * panel.scale, y: panel.y + socket.y * panel.scale };
}

function PanelImage({ panel }: { panel: typeof upper }) {
  return <image className="rack-panel-artwork" href={panel.src} x={panel.x} y={panel.y} width={panel.width * panel.scale} height={panel.height * panel.scale} />;
}

function Wire({ path, label, end, direction }: {
  path: string; label: string; end: Point; direction: "up" | "down" | "right";
}) {
  const angle = { up: 180, down: 0, right: -90 }[direction];
  return <g aria-label={label}>
    <title>{label}</title>
    <path d={path} fill="none" stroke="white" strokeWidth="5" />
    <path d={path} fill="none" stroke={ink} strokeWidth="2" />
    <path transform={`translate(${end.x} ${end.y}) rotate(${angle})`} d="M0 0 l-4 -8 h8 Z" fill={ink} />
  </g>;
}

function PortLabel({ x, y, label }: Point & { label: string }) {
  return <g>
    <rect x={x-14} y={y-9} width="28" height="18" fill="white" />
    <text x={x} y={y+5} textAnchor="middle" fontSize="14" fontWeight="bold">{label}</text>
  </g>;
}

type Mix = ReturnType<typeof earRoutes>[number];
function IemTransmitter({ mix, cx, x32 }: { mix: Mix; cx: number; x32: typeof lower }) {
  const s16 = mix.device === "S16";
  const panel = s16 ? upper : x32;
  return <g>
    <rect x={cx-59} y={boxTop} width="118" height={boxBottom-boxTop} rx="4" fill="#f3f6f4" stroke={ink} strokeWidth="1.7" />
    <g textAnchor="middle">
      <text x={cx} y={s16 ? 231 : 215} fontSize="14" fontWeight="bold">IEM TX {mix.tx}</text>
      <text x={cx} y={s16 ? 249 : 234} fontSize="18" fontWeight="bold">{mix.name}</text>
      <text x={cx} y={s16 ? 265 : 250} fontSize="13">Bus {mix.bus} / {mix.bus+1}</text>
    </g>
    {["L","R"].map((side, index) => {
      const port = mix.out + index;
      const jack = socketOnMap(panel, rackOutputCenter(mix.device, port));
      // X32 rear outputs run right to left. Mirror the schematic terminals to keep the pair uncrossed.
      const end = { x: cx + (index ? 32 : -32) * (s16 ? 1 : -1), y: s16 ? boxTop : boxBottom };
      const laneX = s16 ? jack.x : jack.x - 13;
      const exitPath = s16 ? `V132` : `l-13 -13 V323`;
      const path = `M${jack.x} ${jack.y} ${exitPath} L${end.x} ${end.y + (s16 ? -12 : 12)} V${end.y}`;
      return <g key={side}>
        <Wire path={path} end={end} direction={s16 ? "down" : "up"}
          label={`${mix.device} OUT ${port} → IEM TX ${mix.tx} ${side} in · ${mix.name}`} />
        <PortLabel x={laneX} y={s16 ? 124 : 333} label={String(port)} />
        <text x={end.x} y={s16 ? 212 : 266} textAnchor="middle" fontSize="12" fontWeight="bold">{port} → {side} IN</text>
      </g>;
    })}
  </g>;
}

type Receiver = ReturnType<typeof wirelessRoutes>[number];
function MicReceiver({ rx, cx, local, x32 }: { rx: Receiver; cx: number; local: boolean; x32: typeof lower }) {
  const name = rx.source.replace(/ wireless vocal$/i,"");
  const splitX = cx-19;
  const jack = socketOnMap(x32, x32WirelessCenter(local, rx.port));
  const house = { x: splitX+23, y: 316 };
  return <g>
    <rect x={cx-59} y={boxTop} width="118" height={boxBottom-boxTop} rx="4" fill="white" stroke={ink} strokeWidth="1.7" />
    <g textAnchor="middle">
      <text x={cx} y="215" fontSize="14" fontWeight="bold">MIC RX · CH {rx.channel}</text>
      <text x={cx} y="237" fontSize="17" fontWeight="bold"
        textLength={name.length > 11 ? 108 : undefined} lengthAdjust="spacingAndGlyphs">{name}</text>
      <text x={splitX} y="265" fontSize="13" fontWeight="bold">XLR OUT</text>
    </g>
    <Wire path={`M${splitX} ${boxBottom} V284`} end={{x:splitX,y:284}} direction="down"
      label={`${rx.source} XLR out → split ${rx.channel}`} />
    <rect x={splitX-30} y="285" width="60" height="22" rx="3" fill="white" stroke={ink} />
    <text x={splitX} y="301" fontSize="14" textAnchor="middle" fontWeight="bold">Split {rx.channel}</text>
    <Wire path={`M${splitX} 307 V318 L${jack.x} 326 V${jack.y}`} end={jack} direction="down"
      label={`Split ${rx.channel} monitor leg → X32 ${rx.input} → CH ${rx.channel}`} />
    <Wire path={`M${splitX} 316 H${house.x}`} end={house} direction="right" label={`Split ${rx.channel} house leg → FOH tail ${rx.channel}`} />
    <circle cx={splitX} cy="316" r="3" fill={ink} />
    <text x={house.x+3} y="320" fontSize="13">FOH {rx.channel}</text>
    <PortLabel x={jack.x} y={local ? 333 : 348} label={String(rx.port)} />
  </g>;
}

export function WirelessRackMap({ plot, map }: { plot: Plot; map: RackMap }) {
  const mixes = earRoutes(map).sort((a, b) =>
    a.device.localeCompare(b.device) || a.out - b.out
  );
  const extraPatched = mixes.length === 6;
  const receiverShift = extraPatched ? 129 : 0;
  const x32 = { ...lower, x: lower.x + receiverShift };
  const receivers = wirelessRoutes(plot,map).sort((a,b) => b.port-a.port);
  const local = map.layout === "s16-v2";
  const description = [
    "TX6 and its matched bodypack receiver are available for a guest or other use.",
    ...mixes.map(m => `${m.device} outputs ${m.out} and ${m.out + 1} to ${m.name}, IEM TX ${m.tx}, left and right.`),
    ...receivers.map(r => `${r.source} to split ${r.channel}, FOH tail ${r.channel} and X32 ${r.input}, channel ${r.channel}.`),
  ].join(" ");
  return <div className="patch-bank wireless-rack-map">
    <svg viewBox={`0 0 ${900 + receiverShift} 515`} role="img" aria-label={description}>
      <PanelImage panel={upper} />
      <PanelImage panel={x32} />
      <g fill={ink}>
        <text x="650" y="51" fontSize="24" fontWeight="bold">S16</text>
        <text x="650" y="73" fontSize="15">Front panel</text>
        <text x="650" y="94" fontSize="15">XLR outputs</text>
        <text x="2" y="373" fontSize="24" fontWeight="bold">X32 Rack</text>
        <text x="2" y="394" fontSize="15">Rear panel</text>
        <text x="2" y="419" fontSize="14">TX6 + matched bodypack receiver</text>
        <text x="2" y="437" fontSize="14">{extraPatched ? "Extra stereo mix for guest use." : "Patch for guest or other use."}</text>
        <text x="2" y="463" fontSize="14">Keep phantom off on both</text>
        <text x="2" y="481" fontSize="14">wireless mic split legs.</text>
      </g>
      {mixes.map((mix, i) => <IemTransmitter key={mix.tx} mix={mix} x32={x32} cx={62 + 129*i} />)}
      {receivers.map((rx,i) => <MicReceiver key={rx.channel} rx={rx} x32={x32} cx={707+receiverShift+129*i} local={local} />)}
      <text x={x32.x + (extraPatched ? 60 : 118)} y="336" fontSize="14" fontWeight="bold">XLR OUT</text>
      <text x={receiverShift + (local ? 816 : 528)} y="336" fontSize="14" fontWeight="bold">{local ? "XLR IN" : "AUX IN"}</text>
    </svg>
  </div>;
}
