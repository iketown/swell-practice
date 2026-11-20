"use client";

import { useId } from "react";
import type { StageView } from "@/lib/rider/plot-layers";

type Frame = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Arrow = Point & { dx: number; dy: number };
type Guide = { label: string; path: string; arrows: Arrow[]; caption: Point & { angle?: number } };
const edgeGap = 0.13;
const midway = (a: number, b: number) => (a + b) / 2;

function outwardGuide(
  base: Point,
  bend: Point,
  side: Point,
  boxY: number,
  boxApproach: string,
  label: string,
): Guide {
  const dx = side.x - bend.x;
  const dy = side.y - bend.y;
  const length = Math.hypot(dx, dy);
  return {
    label,
    path: `M${base.x} ${base.y} V${bend.y} H${bend.x} L${side.x} ${side.y} V${boxY}${boxApproach}`,
    arrows: [
      { x: bend.x + dx * 0.24, y: bend.y + dy * 0.24, dx: dx / length, dy: dy / length },
      { x: side.x, y: midway(side.y, boxY), dx: 0, dy: -1 },
    ],
    caption: {
      x: bend.x + dx * 0.64,
      y: bend.y + dy * 0.64,
      angle: (Math.atan2(dx < 0 ? -dy : dy, Math.abs(dx)) * 180) / Math.PI,
    },
  };
}

function drumRugGuide(rug: Frame, box: Frame, kick?: Point): Guide {
  const endX = box.x + box.width + edgeGap;
  const rearY = box.y + box.height / 2;
  const east = Math.max(rug.x + rug.width + 0.8, endX + 1);
  const startX = Math.min(kick?.x ?? rug.x + rug.width / 2, east - 1);
  const startY = Math.max(rug.y + rug.height + 0.55, (kick?.y ?? 0) + 0.38, rearY + 1.5);
  const radius = 0.65;
  return {
    label: "Cable path from the kick around the east side of the drum rug to the upstage box",
    path: [
      `M${startX} ${startY} H${east - radius}`,
      `Q${east} ${startY} ${east} ${startY - radius}`,
      `V${rearY + radius} Q${east} ${rearY} ${east - radius} ${rearY} H${endX}`,
    ].join(" "),
    arrows: [
      { x: midway(startX, east - radius), y: startY, dx: 1, dy: 0 },
      { x: east, y: midway(startY, rearY), dx: 0, dy: -1 },
    ],
    caption: { x: midway(east - radius, endX), y: rearY },
  };
}

// Operational guidance, independent of the private, individual cable runs.
export function StageCableGuide({
  width: w,
  depth: h,
  drumBox,
  stageLeftBox,
  drumRug,
  kick,
  chrisBase,
  brianBase,
  view,
}: {
  width: number;
  depth: number;
  drumBox?: Frame;
  stageLeftBox?: Frame;
  drumRug?: Frame;
  kick?: Point;
  chrisBase?: Point;
  brianBase?: Point;
  view: StageView;
}) {
  const arrow = "cable-guide-" + useId().replaceAll(":", "");
  const arrowUrl = `url(#${arrow})`;
  const showPaths = view !== "Stand placement";
  // Leave space between the direction guides and the individual perimeter runs.
  const cableView = view === "Cable patch and routing";
  const west = cableView ? -0.2 : 0.25;
  const boxOnstage = stageLeftBox && stageLeftBox.x < w;
  const east = cableView && stageLeftBox && !boxOnstage
    ? Math.min(w + 0.25, stageLeftBox.x - edgeGap - 0.25)
    : w - 0.25;
  const clearLeft = w * 0.36;
  const clearRight = w - clearLeft;
  const centerTop = h * 0.61;
  const frontTop = h - Math.min(2.35, h * 0.12);
  const leadY = Math.min(frontTop - 0.25, h * 0.8575 + (cableView ? 0.22 : 0));
  const sideJoinY = h * 0.605 + (cableView ? 0.24 : 0);
  const westEnd = drumBox ? drumBox.x - edgeGap : w * 0.4;
  const rear = cableView ? -0.25 : 0.2;
  const westY = drumBox
    ? Math.max(drumBox.y + 0.22, Math.min(rear, drumBox.y + drumBox.height - 0.22))
    : rear;
  const rearRadius = Math.max(0, Math.min(1.75, (westEnd - west) * 0.75));
  const westBottom = drumBox && westEnd - west < 0.5
    ? { x: drumBox.x + drumBox.width / 2, y: drumBox.y + drumBox.height + edgeGap }
    : undefined;
  const westTurnY = westBottom ? westBottom.y + 0.65 : westY + rearRadius;
  const westApproach = westBottom
    ? ` H${westBottom.x} V${westBottom.y}`
    : ` Q${west} ${westY} ${west + rearRadius} ${westY} H${westEnd}`;
  const enterFromBelow = boxOnstage && east <= stageLeftBox.x + stageLeftBox.width;
  const eastY = enterFromBelow ? stageLeftBox.y + stageLeftBox.height + edgeGap : stageLeftBox
    ? stageLeftBox.y + stageLeftBox.height * (cableView ? 0.27 : 0.5)
    : h * 0.24;
  let eastEnd = "";
  if (stageLeftBox && !enterFromBelow) {
    const edge = boxOnstage ? stageLeftBox.x + stageLeftBox.width + edgeGap : stageLeftBox.x - edgeGap;
    eastEnd = ` H${edge}`;
  }
  const chris = chrisBase ?? { x: w / 3, y: leadY };
  const brian = brianBase ?? { x: w * 2 / 3, y: leadY };
  const paths: Guide[] = [
    outwardGuide(
      chris,
      { x: Math.min(w * 0.20, chris.x), y: leadY },
      { x: west, y: Math.max(westTurnY + 0.25, sideJoinY) },
      westTurnY,
      westApproach,
      chrisBase ? "Chris mic stand base diagonally to west perimeter and drum stagebox" : "West perimeter to drum stagebox",
    ),
    outwardGuide(
      brian,
      { x: Math.max(w * 0.77, brian.x), y: leadY },
      { x: east, y: Math.max(eastY + 0.25, sideJoinY) },
      eastY,
      eastEnd,
      brianBase ? "Brian mic stand base diagonally to east perimeter and stage-left box" : "East perimeter to stage-left box",
    ),
    ...(drumBox && drumRug ? [drumRugGuide(drumRug, drumBox, kick)] : []),
  ];
  return (
    <g
      className="stage-cable-guide"
      role="img"
      aria-label="Cable path guidance. No cables between the front performers or across the full downstage area."
      pointerEvents="none"
    >
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path
            d="M1 1 9 5 1 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        className="cable-clear-boundary"
        d={`M0 ${frontTop} H${clearLeft} V${centerTop} H${clearRight} V${frontTop} H${w} V${h} H0 Z`}
      />
      {showPaths && paths.map(({ label, path, arrows, caption }) => (
        <g key={label} aria-label={label}>
          <path className="dotted-cable-path" d={path} markerEnd={arrowUrl} />
          {arrows.map(({ x, y, dx, dy }, index) => (
            <path
              key={index}
              d={`M${x - dx * 0.1} ${y - dy * 0.1} L${x} ${y}`}
              fill="none"
              stroke="none"
              strokeWidth=".085"
              markerEnd={arrowUrl}
            />
          ))}
          <text
            className="cable-path-label"
            x={caption.x}
            y={caption.y}
            transform={caption.angle === undefined ? undefined : `rotate(${caption.angle}, ${caption.x}, ${caption.y})`}
            textAnchor="middle"
            dominantBaseline="central"
          >
            CABLE PATH
          </text>
        </g>
      ))}
      <g className="cable-clear-area">
        <rect
          x={clearLeft}
          y={centerTop}
          width={clearRight - clearLeft}
          height={1.15}
          rx=".16"
        />
        <text x={w / 2} y={centerTop + 0.49} textAnchor="middle">
          NO CABLES
          <tspan x={w / 2} dy=".41" fontSize=".28">KEEP PERFORMANCE AREA CLEAR</tspan>
        </text>
      </g>
      <g className="cable-clear-area">
        <text
          x={w / 2}
          y={midway(frontTop, h)}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: Math.min(0.44, (clearRight - clearLeft) / 14) }}
        >
          NO CABLES IN THIS AREA
        </text>
      </g>
      <text
        className="cable-front-label"
        x={w / 2}
        y={h + 1.60}
        textAnchor="middle"
      >
        KEEP FRONT OF STAGE CLEAR · NO CABLES
      </text>
    </g>
  );
}
