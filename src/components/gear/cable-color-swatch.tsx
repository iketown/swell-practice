import type { CableColor } from "@/lib/gear/domain";

const CABLE_COLOR_SWATCHES: Record<CableColor, string> = {
  black: "oklch(0.22 0.015 250)",
  grey: "oklch(0.58 0.015 250)",
  white: "oklch(0.97 0.006 90)",
  blue: "oklch(0.60 0.18 250)",
  purple: "oklch(0.56 0.20 300)",
  red: "oklch(0.60 0.22 25)",
  green: "oklch(0.62 0.16 145)",
  orange: "oklch(0.70 0.18 55)",
  yellow: "oklch(0.82 0.17 90)",
};

export function CableColorSwatch({ color }: { color: CableColor }) {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full border border-foreground/20"
      style={{ backgroundColor: CABLE_COLOR_SWATCHES[color] }}
    />
  );
}
