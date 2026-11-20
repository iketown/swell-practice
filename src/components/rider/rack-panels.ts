// Coordinates in the 615 × 116 front-panel image, as seen by a technician facing the rack.
export const s16Front = { src: "/stage-plot/panels/s16-front.png", width: 615, height: 116 };

export function s16InputCenter(port: number) {
  return { x: 51 + ((port - 1) % 8) * 33.2, y: port <= 8 ? 37 : 86 };
}

export const x32Rear = { src: "/stage-plot/panels/x32-rear.png", width: 492, height: 152 };

export function rackOutputCenter(device: string, port: number) {
  return device === "S16"
    ? { x: 332 + (port - 1) * 33.1, y: 86 }
    : { x: 228 - (port - 1) * 29.7, y: 76 };
}

export function x32WirelessCenter(localXlr: boolean, port: number) {
  return localXlr
    ? { x: 471 - (port - 1) * 30, y: 31 }
    : { x: 228 - (port - 1) * 22, y: 20 };
}
