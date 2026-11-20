// Coordinates in the 615 × 116 front-panel image, as seen by a technician facing the rack.
export const s16Front = { src: "/stage-plot/panels/s16-front.png", width: 615, height: 116 };

export function s16InputCenter(port: number) {
  return { x: 51 + ((port - 1) % 8) * 33.2, y: port <= 8 ? 37 : 86 };
}
