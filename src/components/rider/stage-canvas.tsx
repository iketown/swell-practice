"use client";
import { useId, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  boxColors,
  boxFrame,
  boxHeaderHeight,
  boxRowHeight,
  plotPerimeter,
  sideStageWidth,
} from "@/lib/rider/stage-box";
import { byNumber, objectImage, type Plot } from "@/lib/rider/model";
import { objectAnchor, stageAnchor } from "@/lib/rider/placement";
import { printFrame } from "@/lib/rider/print-frame";
import { symbolTransform } from "@/lib/rider/screen-layout";
import { instrumentLabel } from "@/lib/rider/instrument-label";

import {
  defaultLayers,
  visibleObject,
  type PlotLayers,
} from "@/lib/rider/plot-layers";
import { CableLayer, type RoutingControls } from "./cable-layer";
import { StandMeasurements, feetInches, isStand } from "./stand-placement";
import { StageCableGuide } from "./stage-cable-guide";

type Props = {
  plot: Plot;
  editing: boolean;
  symbolScale?: number;
  printLayout?: boolean;
  view?: import("@/lib/rider/plot-layers").StageView;
  layers?: PlotLayers;
  highlighted?: string[];
  routing?: RoutingControls;
  active: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onEdit?: (id: string) => void;
};
export function StageCanvas({
  plot: p,
  editing,
  symbolScale = 1,
  view = "Overview",
  printLayout = false,
  layers = defaultLayers,
  highlighted = [],
  routing,
  active,
  selected,
  onHover,
  onSelect,
  onMove,
  onEdit,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
  } | null>(null);
  const grid = useId().replaceAll(":", "");
  const side = sideStageWidth;
  const sortedInputs = byNumber(p);
  const colorsByBox = new Map(
    p.stageBoxes.map((b) => [b.id, boxColors[b.color]]),
  );
  const { width: w, depth: h } = p;
  const kick = sortedInputs.find(input => input.kind === "Mic" && /\bkick\b/i.test(input.source));
  const drumBox = p.stageBoxes.find(box => box.id === kick?.stageBoxId)
    ?? p.stageBoxes.find(box => /\b(drum|upstage)\b/i.test(box.label));
  const drumFrame = drumBox && boxFrame(p, drumBox, p.inputs.filter(input => input.stageBoxId === drumBox.id));
  const sideBox = p.stageBoxes.find(box => box !== drumBox && box.x >= w);
  const sideFrame = sideBox && boxFrame(p, sideBox, p.inputs.filter(input => input.stageBoxId === sideBox.id));
  const drumRug = p.objects.find(object => object.asset === "drum-rug");
  const chrisStand = p.objects.find(object => object.id === "mic-chris");
  const brianStand = p.objects.find(object => object.id === "mic-brian");
  function displayedBox(frame: typeof drumFrame) {
    if (!frame) return undefined;
    return {
      x: frame.x + frame.width / 2 * (1 - symbolScale),
      y: frame.y + frame.height / 2 * (1 - symbolScale),
      width: frame.width * symbolScale,
      height: frame.height * symbolScale,
    };
  }
  function local(e: ReactPointerEvent<SVGGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  }
  function handlers(id: string, x: number, y: number, marker = false) {
    if (!editing && !marker) return {};
    return {
      tabIndex: 0,
      role: "button",
      focusable: true,
      onPointerEnter: () => {
        if (!drag.current) onHover(id);
      },
      onPointerLeave: () => onHover(null),
      onFocus: () => onHover(id),
      onBlur: () => onHover(null),
      onClick: () => onSelect(id),
      onDoubleClick: () => { if (editing) onEdit?.(id); },
      onPointerDown: (e: ReactPointerEvent<SVGGElement>) => {
        if (!editing || e.button !== 0) return;
        const pos = local(e);
        if (!pos) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onSelect(id);
        drag.current = {
          id,
          dx: pos.x - x,
          dy: pos.y - y,
          startX: e.clientX,
          startY: e.clientY,
        };
      },
      onPointerMove: (e: ReactPointerEvent<SVGGElement>) => {
        const d = drag.current;
        if (
          !d ||
          d.id !== id ||
          Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 2
        )
          return;
        const pos = local(e);
        if (pos) onMove(id, pos.x - d.dx, pos.y - d.dy);
      },
      onPointerUp: () => {
        drag.current = null;
      },
      onPointerCancel: () => {
        drag.current = null;
      },
      onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
          return;
        }
        if (!editing) return;
        const n = e.shiftKey ? 1 : 0.1;
        const steps: Record<string, [number, number]> = {
          ArrowUp: [0, -n],
          ArrowDown: [0, n],
          ArrowLeft: [-n, 0],
          ArrowRight: [n, 0],
        };
        if (steps[e.key]) {
          e.preventDefault();
          onSelect(id);
          onMove(id, x + steps[e.key][0], y + steps[e.key][1]);
        }
      },
    };
  }
  return (
    <svg
      ref={svg}
      className={"rider-canvas" + (editing ? " editing" : "")}
      aria-label="The Swell stage plot, viewed from the audience"
      viewBox={printLayout ? printFrame(p, view) : [
        -plotPerimeter.left,
        -plotPerimeter.top,
        w + side + plotPerimeter.left + plotPerimeter.right,
        h + plotPerimeter.top + plotPerimeter.bottom,
      ].join(" ")}
    >
      <title>{`The Swell · ${w} ft wide × ${h} ft deep playing area · 2 ft grid squares`}</title>
      <defs>
        <pattern id={grid} width="2" height="2" patternUnits="userSpaceOnUse">
          <path
            d="M 2 0 H 0 V 2"
            fill="none"
            stroke="#bdc9c1"
            strokeWidth=".03"
          />
        </pattern>
      </defs>
      <rect x="0" y="0" width={w} height={h} fill="#fff" />
      <rect x="0" y="0" width={w} height={h} fill={"url(#" + grid + ")"} />
      <rect x={w} width={side} height={h} fill="#eef1ed" />
      <rect
        width={w + side}
        height={h}
        fill="none"
        stroke="#829490"
        strokeWidth=".048"
      />
      <path
        d={`M${w} 0v${h}`}
        stroke="#728780"
        strokeWidth=".04"
        strokeDasharray=".23 .18"
      />
      <g className="stage-orientation">
        <text x={w / 2} y={-0.52}>
          UPSTAGE / REAR
        </text>
        <text x={w + side / 2} y={0.89}>
          SIDESTAGE
        </text>
        <text x={w + side / 2} y={1.48} fontSize=".34">2 FT GRID</text>
        <text x={0.32} y={h + 0.71} textAnchor="start">
          STAGE RIGHT
        </text>
        <text x={w - 0.32} y={h + 0.71} textAnchor="end">
          STAGE LEFT
        </text>
        <text x={w / 2} y={h + 2.13}>
          DOWNSTAGE / AUDIENCE
        </text>
      </g>
      {view !== "Cable patch and routing" && <>
      <g stroke="#687b76" strokeWidth=".043" fill="none">
        <path
          d={`M0 ${h + 0.69}v.55m0-.28h${w}m0 .28v-.55M-.25 0h-.64m.3 0v${h}m-.3 0h.64`}
        />
      </g>
      <g className="stage-dimension">
        <text x={w / 2} y={h + 1.11}>
          {w} ft wide
        </text>
        <text transform={`translate(-.59 ${h / 2}) rotate(-90)`}>
          {h} ft deep
        </text>
      </g>
      </>}
      <StageCableGuide
        width={w}
        depth={h}
        drumBox={displayedBox(drumFrame)}
        stageLeftBox={displayedBox(sideFrame)}
        drumRug={drumRug && { x: drumRug.x, y: drumRug.y, width: drumRug.w, height: drumRug.h }}
        kick={kick}
        chrisBase={chrisStand && stageAnchor(chrisStand)}
        brianBase={brianStand && stageAnchor(brianStand)}
        view={view}
      />
      {view !== "Overview" && <path d={`M${w / 2} 0V${h}`} stroke="#728780" strokeWidth=".035" strokeDasharray=".2 .15" pointerEvents="none" /> }
      {p.objects.filter((o) => o.asset === "drum-rug").map((o) => <g key={o.id} data-point={o.id} aria-label={o.label} {...handlers(o.id, o.x, o.y)}>
        <title>{`${o.label} · ${o.w} × ${o.h} ft · reference: downstage centre`}</title>
        <rect x={o.x} y={o.y} width={o.w} height={o.h} rx=".08" fill="#dce4dc" fillOpacity={view === "Stand placement" ? .7 : .32} stroke="#708579" strokeWidth=".045" strokeDasharray=".14 .1" />
        <text x={o.x + o.w / 2} y={o.y + .45} textAnchor="middle" fontSize=".4" fill="#425d50">DRUM RUG {o.w} × {o.h} ft</text>
        {editing && selected === o.id && <rect x={o.x} y={o.y} width={o.w} height={o.h} className="rider-selected" />}
      </g>)}
      {view === "Stand placement" && p.objects.filter(o => o.asset === "monitor-table").map(o => (
        <g key={o.id} data-point={o.id} aria-label={o.label} {...handlers(o.id, o.x, o.y)}>
          <rect x={o.x} y={o.y} width={o.w} height={o.h} rx=".08"
            fill="#e0e7e1" fillOpacity=".85" stroke="#476158" strokeWidth=".06" />
          <text x={o.x + o.w / 2} y={o.y + o.h / 2 - .2} textAnchor="middle"
            fontSize={Math.min(.4, o.w / 7.6)} fontWeight="700" fill="#203b38">
            {o.label}
            <tspan x={o.x + o.w / 2} dy=".47" fontWeight="500">
              {printLayout ? `${Math.max(o.w, o.h)} × ${Math.min(o.w, o.h)} ft` : `${feetInches(Math.max(o.w, o.h))} × ${Math.round(Math.min(o.w, o.h) * 12)}″`}
            </tspan>
          </text>
          {editing && selected === o.id && <rect x={o.x} y={o.y} width={o.w} height={o.h} className="rider-selected" />}
        </g>
      ))}
      {p.objects.map((o) => {
        if (o.asset === "drum-rug" || o.asset === "monitor-table" || (view === "Stand placement" && !isStand(o))) return null;
        const selectable = view !== "Stand placement" || isStand(o);
        const hot = selectable && (active === o.id || highlighted.includes(o.id));
        const visible = visibleObject(o, layers) || hot;
        const kitOnly =
          !visible &&
          o.asset === "sam" &&
          !layers.people &&
          (!o.layer || o.layer === "people");
        if (!visible && !kitOnly) return null;
        const label = kitOnly ? "Drum kit" : o.label;
        const sidestageEquipment = view === "Cable patch and routing" && o.x >= w;
        const showAtFullOpacity = view === "Overview" || isStand(o) ||
          (sidestageEquipment && o.asset === "label");
        const contextOpacity = sidestageEquipment ? 0.62 : 0.18;
        return (
          <g
            key={o.id}
            opacity={showAtFullOpacity ? 1 : contextOpacity}
            data-point={o.id}
            aria-label={label}
            transform={symbolTransform(o.x, o.y, symbolScale, o.w, o.h, objectAnchor(o))}
            pointerEvents={selectable ? undefined : "none"}
            {...(selectable ? handlers(o.id, o.x, o.y) : {})}
          >
            <title>{label}</title>
            {kitOnly ? (
              <image
                href="/stage-symbols/drum-kit.svg"
                width={o.w}
                height={o.h}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : o.asset === "label" ? (
              <g opacity={o.opacity}>
                <rect width={o.w} height={o.h} fill="#fff" fillOpacity=".88" />
                <text
                  x={o.w / 2}
                  y={o.h * 0.8}
                  textAnchor="middle"
                  fontSize={o.h * 0.98}
                  fontWeight="750"
                  fill="#172d33"
                >
                  {o.label}
                </text>
              </g>
            ) : o.asset === "symbol" ? (
              <g opacity={o.opacity}>
                <rect
                  width={o.w}
                  height={o.h}
                  fill="#e2eee8"
                  stroke="#356858"
                  strokeWidth=".05"
                  rx=".09"
                />
                <text
                  x={o.w / 2}
                  y={o.h * 0.57}
                  textAnchor="middle"
                  fontSize={Math.min(0.46, o.w / (o.label.length * 0.58))}
                >
                  {o.label}
                </text>
              </g>
            ) : (
              <image
                href={objectImage(o.asset)}
                width={o.w}
                height={o.h}
                preserveAspectRatio="none"
                opacity={o.opacity}
                style={o.asset === "sennheiser-ek-iem-g4" ? { mixBlendMode: "multiply" } : undefined}
              />
            )}
            {hot && (
              <rect
                className="equipment-highlight"
                x="-.12"
                y="-.12"
                width={o.w + 0.24}
                height={o.h + 0.24}
                rx=".12"
              />
            )}
            {editing && selectable && (
              <rect
                className={selected === o.id ? "rider-selected" : "rider-hit"}
                width={o.w}
                height={o.h}
              />
            )}
          </g>
        );
      })}
      {view === "Stand placement" && <StandMeasurements plot={p} selected={selected} printLayout={printLayout} />}
      {p.objects.map((o) => {
        const caption = instrumentLabel(o);
        if (view === "Stand placement" || !caption || !visibleObject(o, layers)) return null;
        return (
          <g
            key={o.id}
            data-instrument-label={o.id}
            transform={symbolTransform(o.x, o.y, symbolScale, o.w, o.h, objectAnchor(o))}
            pointerEvents="none"
            aria-hidden="true"
          >
            <text
              className="instrument-caption"
              x={o.w / 2}
              y={o.h + 0.4}
              textAnchor="middle"
            >
              {caption}
            </text>
          </g>
        );
      })}
      {layers.cables && (routing || view === "Cable patch and routing") && <CableLayer plot={p} labels={view === "Cable patch and routing"} symbolScale={symbolScale} {...(routing ?? { selected: null, onSelect: () => {} })} />}
      {layers.stageBoxes &&
        p.stageBoxes.map((box) => {
          const members = sortedInputs.filter((i) => i.stageBoxId === box.id);
          const frame = boxFrame(p, box, members);
          const color = boxColors[box.color];
          return (
            <g
              key={box.id}
              data-stage-box={box.id}
              transform={symbolTransform(frame.x, frame.y, symbolScale, frame.width, frame.height)}
            >
              <g
                data-point={box.id}
                className="stage-box-shell"
                aria-label={`Stage box ${box.label}`}
                {...handlers(box.id, frame.x, frame.y)}
              >
                <title>{`Stage box · ${box.label}`}</title>
                <rect
                  x="0"
                  y="0"
                  width={frame.width}
                  height={frame.height}
                  rx=".09"
                  fill="white"
                  stroke={color}
                  strokeWidth=".09"
                />
                <rect
                  x=".01"
                  y=".01"
                  width={frame.width - 0.02}
                  height={boxHeaderHeight}
                  rx=".06"
                  fill={color}
                />
                <text
                  x={frame.width / 2}
                  y={boxHeaderHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={Math.min(
                    0.42,
                    (frame.width - 0.2) /
                      (Math.max(box.label.length, 1) * 0.68),
                  )}
                  fontWeight="700"
                >
                  {box.label}
                </text>
                {!members.length && (
                  <text
                    x={frame.width / 2}
                    y={boxHeaderHeight + boxRowHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#475650"
                    fontSize=".35"
                  >
                    Unassigned
                  </text>
                )}
                {highlighted.includes(box.id) && (
                  <rect
                    className="equipment-highlight"
                    x="-.12"
                    y="-.12"
                    width={frame.width + 0.24}
                    height={frame.height + 0.24}
                    rx=".12"
                  />
                )}
                {editing && selected === box.id && (
                  <rect
                    x="-.14"
                    y="-.14"
                    width={frame.width + 0.28}
                    height={frame.height + 0.28}
                    className="rider-selected"
                  />
                )}
              </g>
              {members.map((input, index) => {
                const hot =
                  active === input.id || highlighted.includes(input.id);
                const x = (index % frame.columns) * frame.cellWidth;
                const y =
                  boxHeaderHeight +
                  Math.floor(index / frame.columns) * boxRowHeight;
                return (
                  <g
                    key={input.id}
                    className="stage-box-channel"
                    data-box-input={input.id}
                    transform={`translate(${x} ${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${box.label}, input ${input.number}, ${input.source}`}
                    onPointerEnter={() => onHover(input.id)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(input.id)}
                    onBlur={() => onHover(null)}
                    onClick={() => onSelect(input.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(input.id);
                      }
                    }}
                  >
                    <title>{`Input ${input.number} · ${input.source}`}</title>
                    <rect
                      x=".035"
                      y=".02"
                      width={frame.cellWidth - 0.07}
                      height={boxRowHeight - 0.04}
                      rx=".07"
                      fill={hot ? "#ffd872" : "transparent"}
                    />
                    <text
                      x={frame.cellWidth / 2}
                      y={boxRowHeight / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={input.number > 99 ? ".42" : ".51"}
                      fontWeight="700"
                      fill="#20352c"
                    >
                      {input.number}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      {layers.inputs &&
        p.inputs.map((i) => {
          const hot = active === i.id || highlighted.includes(i.id);
          const di = i.kind === "DI";
          const boxColor = i.stageBoxId
            ? colorsByBox.get(i.stageBoxId)
            : undefined;
          return (
            <g
              key={i.id}
              data-point={i.id}
              className={"rider-pin" + (hot ? " active" : "")}
              aria-label={`Input ${i.number}, ${i.source}`}
              transform={symbolTransform(i.x, i.y, symbolScale)}
              {...handlers(i.id, i.x, i.y, true)}
            >
              <title>{`Input ${i.number} · ${i.source}`}</title>
              <rect
                x={-0.56}
                y={-0.62}
                width="1.12"
                height="1.24"
                fill="transparent"
              />
              {hot && (
                <rect
                  x={-0.67}
                  y={-0.72}
                  width="1.34"
                  height="1.44"
                  rx=".13"
                  fill="#ffd872"
                />
              )}
              <rect
                x="-.38"
                y={di ? "-.51" : "-.39"}
                width=".76"
                height={di ? "1.02" : ".78"}
                rx=".045"
                fill={hot ? "#125c68" : di ? "#253c41" : "white"}
                stroke={boxColor ?? "#243d40"}
                strokeWidth={boxColor ? ".10" : ".055"}
              />
              <text
                textAnchor="middle"
                y={di ? ".04" : ".19"}
                fontSize=".53"
                fontWeight="750"
                fill={hot || di ? "white" : "#1a3035"}
              >
                {i.number}
              </text>
              {di && (
                <text
                  y=".4"
                  textAnchor="middle"
                  fill="white"
                  fontWeight="600"
                  fontSize=".26"
                >
                  DI
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
