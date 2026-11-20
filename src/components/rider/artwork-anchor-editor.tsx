"use client";
import { useId, useRef, type PointerEvent } from "react";
import { objectImage } from "@/lib/rider/model";

type Point = { x: number; y: number };
export function ArtworkAnchorEditor({ asset, label, width, height, anchor, onChange }: {
  asset: string; label: string; width: number; height: number;
  anchor: Point; onChange: (point: Point) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const help = useId();
  function choose(e: PointerEvent<SVGSVGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    onChange({ x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) });
  }
  return <section className="artwork-anchor-editor" aria-label="Artwork anchor editor">
    <div>
      <h3>Artwork anchor</h3>
      <p id={help}>Click the stand’s base or drag the crosshair onto it. For other items, choose the point you want to measure to. The stage position stays fixed while the artwork adjusts around it.</p>
      <p className="hint">Arrow keys move the anchor 1 inch. Hold Shift for a finer adjustment. Save changes to apply, or Cancel to discard.</p>
    </div>
    <svg ref={svg} viewBox={`-.25 -.25 ${width + .5} ${height + .5}`}
      role="button" tabIndex={0} aria-label={`Adjust anchor for ${label}`} aria-describedby={help}
      onPointerDown={(e) => { if (e.button !== 0 || !e.isPrimary) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; choose(e); }}
      onPointerMove={(e) => { if (dragging.current) choose(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onLostPointerCapture={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? .01 : 1 / 12;
        const delta: Record<string, Point> = { ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step }, ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 } };
        if (!delta[e.key]) return;
        e.preventDefault();
        onChange({ x: Math.max(0, Math.min(width, anchor.x + delta[e.key].x)), y: Math.max(0, Math.min(height, anchor.y + delta[e.key].y)) });
      }}>
      <rect x="-.25" y="-.25" width={width + .5} height={height + .5} fill="#f1f3ed" />
      {asset === "stage-riser" || asset === "drum-rug" || asset === "monitor-table" || asset === "symbol" || asset === "label" ?
        <rect width={width} height={height} fill="#d4dfd3" stroke="#708579" strokeWidth=".03" /> :
        <image href={objectImage(asset)} width={width} height={height} preserveAspectRatio="none" />}
      <rect width={width} height={height} fill="none" stroke="#8d9e93" strokeWidth=".02" strokeDasharray=".1 .08" />
      <g data-artwork-anchor="true" transform={`translate(${anchor.x} ${anchor.y})`} pointerEvents="none">
        <circle r=".17" fill="#fffefa" fillOpacity=".8" stroke="#b34229" strokeWidth=".04" />
        <path d="M-.28 0h.56M0-.28v.56" stroke="#fffefa" strokeWidth=".10" />
        <path d="M-.28 0h.56M0-.28v.56" stroke="#b34229" strokeWidth=".04" />
      </g>
    </svg>
  </section>;
}
