import { canonicalizeAssetTag } from "@/lib/gear/domain";

export type GearLabelKind = "qr" | "barcode";

export interface GearLabelFormat {
  id: string;
  name: string;
  shortName: string;
  widthMm: number;
  heightMm: number;
  dymoProductNumber: string;
}

export const GEAR_LABEL_FORMATS: GearLabelFormat[] = [
  {
    id: "dymo-30336",
    name: "DYMO 30336 · 1 × 2⅛ in",
    shortName: "1 × 2⅛ in",
    widthMm: 54,
    heightMm: 25,
    dymoProductNumber: "30336",
  },
];

export const DEFAULT_GEAR_LABEL_FORMAT = GEAR_LABEL_FORMATS[0];

export function gearCheckInUrl(assetTag: string) {
  return `https://theswell.live/g/${encodeURIComponent(canonicalizeAssetTag(assetTag).toLowerCase())}`;
}

export function gearLabelPayload(kind: GearLabelKind, assetTag: string) {
  return kind === "qr" ? gearCheckInUrl(assetTag) : canonicalizeAssetTag(assetTag);
}

export function printGearLabel(element: HTMLElement, format: GearLabelFormat) {
  const printWindow = window.open("", "gear-label-print", "popup,width=760,height=520");
  if (!printWindow) return false;

  const labelMarkup = element.outerHTML;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gear label</title>
    <style>
      @page { size: ${format.widthMm}mm ${format.heightMm}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: white; }
      body { width: ${format.widthMm}mm; height: ${format.heightMm}mm; overflow: hidden; }
      .gear-print-label {
        width: ${format.widthMm}mm !important;
        height: ${format.heightMm}mm !important;
        max-width: none !important;
        aspect-ratio: auto !important;
        border: 0 !important;
        border-radius: 0 !important;
      }
      @media screen {
        html, body { width: 100%; height: 100%; background: rgb(236 234 228); }
        body { display: grid; place-items: center; padding: 32px; }
        .gear-print-label { box-shadow: 0 16px 38px rgb(36 31 25 / 0.18); }
      }
      @media print {
        html, body { width: ${format.widthMm}mm; height: ${format.heightMm}mm; }
      }
    </style>
  </head>
  <body>${labelMarkup}</body>
</html>`);
  printWindow.document.close();

  const openDialog = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(openDialog, 80);
  } else {
    printWindow.addEventListener("load", () => window.setTimeout(openDialog, 80), { once: true });
  }

  return true;
}
