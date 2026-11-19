"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { plotPerimeter, sideStageWidth } from "@/lib/rider/stage-box";
import { screenStageSpacing } from "@/lib/rider/screen-layout";

const levels = [50, 75, 100, 125, 150, 200, 300, 400];
const zoomHelp =
  "Pinch or Ctrl/⌘-scroll to zoom. Drag open space to pan when enlarged.";
type Position = { x: number; y: number };

export function StageViewport({
  width,
  depth,
  layers,
  routing,
  children,
}: {
  width: number;
  depth: number;
  layers: ReactNode;
  routing: ReactNode;
  children: ReactNode;
}) {
  const helpId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [chosenZoom, setZoom] = useState<number | null>(null);
  const requested = useRef(100);
  const [size, setSize] = useState<{ fitWidth: number; initialZoom: number } | null>(null);
  const zoom = chosenZoom ?? size?.initialZoom ?? 100;
  const anchor = useRef<{ point: Position; fraction: Position } | null>(null);
  const pan = useRef<{ pointerId: number; left: number; top: number } | null>(
    null,
  );

  const ratio =
    (width + sideStageWidth + plotPerimeter.left + plotPerimeter.right) /
    (depth + plotPerimeter.top + plotPerimeter.bottom);
  useLayoutEffect(() => {
    const port = viewport.current;
    if (!port) return;
    const measure = () => {
      const fullWidth = port.clientHeight * ratio;
      const fitWidth = Math.min(port.clientWidth, fullWidth);
      if (fitWidth > 0) {
        // On narrow screens, pan inside the canvas rather than reducing the symbols.
        setSize({ fitWidth, initialZoom: Math.min(screenStageSpacing, fullWidth / fitWidth) * 100 });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(port);
    return () => observer.disconnect();
  }, [ratio]);
  function zoomTo(value: number, point?: Position) {
    const next = Math.max(
      levels[0],
      Math.min(levels[levels.length - 1], Math.round(value)),
    );
    const port = viewport.current?.getBoundingClientRect();
    const rect = sheet.current?.getBoundingClientRect();
    if (
      !port ||
      !rect ||
      !rect.width ||
      !rect.height ||
      requested.current === next
    )
      return;
    const focus = point ?? {
      x: port.left + port.width / 2,
      y: port.top + port.height / 2,
    };
    anchor.current = {
      point: focus,
      fraction: {
        x: (focus.x - rect.left) / rect.width,
        y: (focus.y - rect.top) / rect.height,
      },
    };
    requested.current = next;
    setZoom(next);
  }

  useLayoutEffect(() => {
    requested.current = zoom;
    const spot = anchor.current;
    const rect = sheet.current?.getBoundingClientRect();
    if (spot && rect && viewport.current) {
      viewport.current.scrollBy({
        left: rect.left + rect.width * spot.fraction.x - spot.point.x,
        top: rect.top + rect.height * spot.fraction.y - spot.point.y,
        behavior: "instant",
      });
    } else if (chosenZoom === null && viewport.current) {
      const port = viewport.current;
      port.scrollLeft = (port.scrollWidth - port.clientWidth) / 2;
    }
    anchor.current = null;
  }, [zoom, chosenZoom, size]);

  useEffect(() => {
    const port = viewport.current;
    if (!port) return;
    function wheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? port!.clientHeight : 1;
      zoomTo(requested.current * Math.exp(-e.deltaY * unit * 0.012), {
        x: e.clientX,
        y: e.clientY,
      });
    }
    port.addEventListener("wheel", wheel, { passive: false });
    return () => port.removeEventListener("wheel", wheel);
  }, []);

  function startPan(e: PointerEvent<HTMLDivElement>) {
    if (zoom <= 100 || !e.isPrimary || (e.button !== 0 && e.button !== 1))
      return;
    if (
      e.button === 0 &&
      e.target instanceof Element &&
      e.target.closest('[role="button"]')
    )
      return;
    e.preventDefault();
    const port = e.currentTarget;
    port.setPointerCapture(e.pointerId);
    pan.current = {
      pointerId: e.pointerId,
      left: port.scrollLeft + e.clientX,
      top: port.scrollTop + e.clientY,
    };
  }

  const smaller = levels.findLast((value) => value < zoom);
  const larger = levels.find((value) => value > zoom);
  return (
    <>
      <div className="stage-view-tools">
        {layers}
        <div className="stage-zoom" role="group" aria-label="Stage zoom">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!smaller}
            onClick={() => smaller && zoomTo(smaller)}
          >
            <Minus />
          </button>
          <output aria-label="Stage zoom level" title={zoomHelp}>
            {Math.round(zoom)}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!larger}
            onClick={() => larger && zoomTo(larger)}
          >
            <Plus />
          </button>
          <button
            type="button"
            title="Fit the whole stage"
            onClick={() => zoomTo(100)}
          >
            <Maximize />
            Fit stage
          </button>
        </div>
      </div>
      {routing}
      <span id={helpId} className="sr-only">
        {zoomHelp}
      </span>
      <div
        className="stage-frame"
        style={{
          aspectRatio: ratio / screenStageSpacing,
          "--stage-spacing": screenStageSpacing,
        } as CSSProperties}
      >
        <div
          className="stage-viewport"
          data-can-pan={zoom > 100}
          ref={viewport}
          tabIndex={0}
          role="region"
          aria-label="Stage canvas viewport"
          aria-describedby={helpId}
          onPointerDown={startPan}
          onPointerMove={(e) => {
            if (pan.current?.pointerId !== e.pointerId) return;
            e.currentTarget.scrollTo(
              pan.current.left - e.clientX,
              pan.current.top - e.clientY,
            );
          }}
          onLostPointerCapture={(e) => {
            if (pan.current?.pointerId === e.pointerId) pan.current = null;
          }}
        >
          <div
            className="stage-zoom-sheet"
            ref={sheet}
            style={{
              width: size === null ? "100%" : (size.fitWidth * zoom) / 100,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
