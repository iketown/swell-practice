"use client";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  cablePosition,
  drawCables,
  insertNode,
  removeNode,
  moveNode,
  nearestLeg,
  dragPlacement,
  type Point,
} from "@/lib/rider/cable-routing";
import type { Plot } from "@/lib/rider/model";
import { symbolTransform } from "@/lib/rider/screen-layout";

export type RoutingControls = {
  selected: string | null;
  onSelect: (id: string) => void;
  onChange?: (plot: Plot) => void;
};

export function CableLayer({
  plot,
  symbolScale,
  selected,
  labels = false,
  onSelect,
  onChange,
}: { plot: Plot; symbolScale: number; labels?: boolean } & RoutingControls) {
  const group = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    pointer: number;
    origin: Point;
    delta: Point;
    cursor: Point;
    free: boolean;
    radius: number;
  } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const placement = useMemo(
    () =>
      drag &&
      dragPlacement(
        plot,
        drag.id,
        drag.origin,
        drag.cursor,
        drag.free,
        drag.radius,
      ),
    [plot, drag],
  );
  const preview = useMemo(
    () =>
      drag && placement?.moved
        ? moveNode(plot, drag.id, placement.point, undefined, drag.free)
        : plot,
    [drag, plot, placement],
  );
  const routes = useMemo(() => drawCables(preview), [preview]);
  const owners = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of plot.cables)
      for (const id of c.nodeIds) {
        const runs = map.get(id);
        if (runs) runs.push(c.id);
        else map.set(id, [c.id]);
      }
    return map;
  }, [plot.cables]);
  const active = routes.find((r) => r.run.id === (hover ?? selected));
  function local(e: { clientX: number; clientY: number }) {
    const ctm = group.current?.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  }
  function hit(e: { clientX: number; clientY: number }) {
    const point = local(e);
    return point && nearestLeg(routes, point);
  }
  function previewDrag(e: PointerEvent<SVGGElement>) {
    const point = local(e);
    const ctm = group.current?.getScreenCTM();
    if (!drag || drag.pointer !== e.pointerId || !point || !ctm) return;
    return {
      ...drag,
      cursor: { x: point.x + drag.delta.x, y: point.y + drag.delta.y },
      free: e.shiftKey,
      radius: 14 / Math.hypot(ctm.a, ctm.b),
    };
  }
  return (
    <g className="rider-cables" ref={group}>
      {routes.map((r) => {
        const hot = active?.run.id === r.run.id;
        const label = r.from.label + " → " + r.to.label;
        const starts = plot.cables.filter((run) => run.fromId === r.run.fromId);
        const numbers = starts.map(run => plot.cables.indexOf(run) + 1);
        const sidestageBundle = r.from.x > plot.width && numbers.length > 2 &&
          numbers.every((n, index) => n === numbers[0] + index);
        const startLabel = sidestageBundle
          ? `R${numbers[0]}–R${numbers.at(-1)}`
          : numbers.map(n => `R${n}`).join(", ");
        return (
          <g
            key={r.run.id}
            data-cable={r.run.id}
            opacity={!active || hot ? 1 : 0.52}
          >
            <title>{label}</title>
            {labels && starts[0]?.id === r.run.id && (
              <text
                x={r.from.x + (sidestageBundle ? 0 : 0.6)}
                y={r.from.y - (sidestageBundle ? 1.02 : 0.2)}
                textAnchor={sidestageBundle ? "middle" : undefined}
                fontSize=".34"
                fontWeight="700"
                fill={r.color}
                stroke="#fffefa"
                strokeWidth=".12"
                paintOrder="stroke"
              >
                {startLabel}
              </text>
            )}
            <path
              d={r.path}
              fill="none"
              stroke="white"
              strokeWidth={hot ? 0.10 : 0.075}
              strokeLinejoin="round"
            />
            <path
              className="cable-line"
              d={r.path}
              fill="none"
              stroke={r.color}
              strokeWidth={hot ? 0.065 : 0.048}
              strokeLinejoin="round"
            />
            <circle
              cx={r.from.x}
              cy={r.from.y}
              r={0.14 * symbolScale}
              fill="white"
              stroke={r.color}
              strokeWidth=".075"
            />
            <rect
              x={r.to.x - 0.14 * symbolScale}
              y={r.to.y - 0.14 * symbolScale}
              width={0.28 * symbolScale}
              height={0.28 * symbolScale}
              fill={r.color}
              stroke="white"
              strokeWidth=".045"
            />
            <path
              className="cable-hit"
              d={r.path}
              role="button"
              tabIndex={0}
              aria-label={label}
              onFocus={() => setHover(r.run.id)}
              onBlur={() => setHover(null)}
              onPointerMove={(e) => setHover(hit(e)?.id ?? null)}
              onPointerLeave={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.run.id);
                }
              }}
              onClick={(e) => {
                const leg = hit(e);
                if (!leg) return;
                onSelect(leg.id);
                if (onChange && e.altKey) {
                  onChange(
                    insertNode(plot, leg.id, leg.index, {
                      id: crypto.randomUUID(),
                      ...cablePosition(plot, leg.point),
                      ...(leg.diagonal ? { diagonal: true } : {}),
                    }),
                  );
                }
              }}
            />
          </g>
        );
      })}
      {active &&
        !drag &&
        [active.from, active.to].map((p, i) => (
          <text
            key={i}
            className="cable-end-label"
            x={p.x}
            y={p.y + (i ? 0.59 : -0.32)}
            textAnchor={
              p.x < 2 ? "start" : p.x > plot.width + 3 ? "end" : "middle"
            }
          >
            {(i ? "To · " : "From · ") + p.label}
          </text>
        ))}
      {onChange &&
        preview.cableNodes.map((n) => {
          const runs = owners.get(n.id) ?? [];
          if (!runs.length) return null;
          const snapping = placement?.target === n.id;
          const label =
            runs.length > 1
              ? "Shared node, " + runs.length + " cables"
              : "Cable node";
          return (
            <g
              key={n.id}
              data-cable-node={n.id}
              className="cable-node"
              aria-label={label}
              role="button"
              tabIndex={0}
              transform={symbolTransform(n.x, n.y, symbolScale)}
              onClick={(e) => {
                e.stopPropagation();
                if (!e.altKey) return;
                e.preventDefault();
                setDrag(null);
                setHover(null);
                onChange(removeNode(plot, n.id));
              }}
              onPointerDown={(e) => {
                if (e.button !== 0 || !e.isPrimary) return;
                e.stopPropagation();
                if (e.altKey) return;
                const point = local(e);
                if (!point) return;
                e.preventDefault();
                e.currentTarget.focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                if (!selected || !runs.includes(selected)) onSelect(runs[0]);
                setHover(null);
                setDrag({
                  id: n.id,
                  pointer: e.pointerId,
                  origin: n,
                  delta: { x: n.x - point.x, y: n.y - point.y },
                  cursor: n,
                  free: e.shiftKey,
                  radius: 0,
                });
              }}
              onPointerMove={(e) => {
                const next = previewDrag(e);
                if (next) setDrag(next);
              }}
              onPointerUp={(e) => {
                const next = previewDrag(e);
                if (!next) return;
                const drop = dragPlacement(
                  plot,
                  next.id,
                  next.origin,
                  next.cursor,
                  next.free,
                  next.radius,
                );
                if (drop.moved)
                  onChange(
                    moveNode(plot, n.id, drop.point, drop.target, next.free),
                  );
                setDrag(null);
              }}
              onLostPointerCapture={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
              onKeyUp={(e) => {
                if (e.key === "Shift")
                  setDrag((d) => (d ? { ...d, free: false } : d));
              }}
              onKeyDown={(e) => {
                if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  setDrag(null);
                  onChange(removeNode(plot, n.id));
                  return;
                }
                if (e.key === "Shift" && !e.repeat)
                  setDrag((d) => (d ? { ...d, free: true } : d));
                if (drag) return;
                const step = e.shiftKey ? 0.5 : 0.1;
                const shifts: Record<string, Point> = {
                  ArrowLeft: { x: -step, y: 0 },
                  ArrowRight: { x: step, y: 0 },
                  ArrowUp: { x: 0, y: -step },
                  ArrowDown: { x: 0, y: step },
                };
                const shift = shifts[e.key];
                if (shift) {
                  e.preventDefault();
                  onChange(
                    moveNode(
                      plot,
                      n.id,
                      cablePosition(plot, {
                        x: n.x + shift.x,
                        y: n.y + shift.y,
                      }),
                    ),
                  );
                }
              }}
            >
              <title>
                {label + " · Alt/Option-click to remove this bend from its cables. Drag along an axis; hold Shift for a diagonal."}
              </title>
              <circle r=".30" fill="transparent" />
              {(snapping || runs.length > 1) && (
                <circle
                  className="node-ring"
                  r={snapping ? 0.32 : 0.21}
                  fill={snapping ? "#ffe299" : "white"}
                  fillOpacity=".85"
                  stroke="#15515b"
                  strokeWidth=".045"
                />
              )}
              <circle
                className="node-dot"
                r=".115"
                fill="white"
                stroke="#244e56"
                strokeWidth=".055"
              />
            </g>
          );
        })}
    </g>
  );
}
