import { canonicalizeAssetTag } from "@/lib/gear/domain";

export type GearLabelKind = "datamatrix" | "qr" | "barcode";

export interface GearLabelFormat {
  id: string;
  name: string;
  shortName: string;
  widthMm: number;
  heightMm: number;
  dymoProductNumber: string;
}

export interface GearSheetLabelItem {
  id: string;
  assetTag: string;
  assetName: string;
}

export interface GearSheetLabelPlacement extends GearSheetLabelItem {
  column: number;
  row: number;
  slotIndex: number;
}

export const GEAR_SHEET_LABEL_FORMAT = {
  id: "mr610-mac",
  name: "MR610-MAC self-laminating sheet",
  columns: 8,
  rows: 4,
  pageWidthIn: 8.5,
  pageHeightIn: 11,
  leftIn: 360 / 1440,
  topIn: 584 / 1440,
  printableWidthIn: 1440 / 1440,
  printableHeightIn: 1083 / 1440,
  laminateHeightIn: 2160 / 1440,
  rowGapIn: 567 / 1440,
  rowPitchIn: (1083 + 2160 + 567) / 1440,
} as const;

export const GEAR_LABEL_FORMATS: GearLabelFormat[] = [
  {
    id: "gear-1x1.5",
    name: "LabelWriter 450 Turbo · 1 × 1½ in",
    shortName: "1 × 1½ in",
    widthMm: 25.4,
    heightMm: 38.1,
    dymoProductNumber: "custom-1x1.5",
  },
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
  return kind === "barcode" ? canonicalizeAssetTag(assetTag) : gearCheckInUrl(assetTag);
}

export function splitCableLabelDescription(assetName: string) {
  const match = assetName.match(/^((?:\d+(?:\.\d+)?'(?:\s+\d+(?:\.\d+)?")?)|(?:\d+(?:\.\d+)?"))\s+(.+)$/);
  if (!match) return { length: "", endTypes: assetName };
  return { length: match[1], endTypes: match[2] };
}

export function gearSheetStartIndex(row: number, column: number) {
  const safeRow = Math.min(Math.max(Math.trunc(row), 1), GEAR_SHEET_LABEL_FORMAT.rows);
  const safeColumn = Math.min(Math.max(Math.trunc(column), 1), GEAR_SHEET_LABEL_FORMAT.columns);
  return (safeRow - 1) * GEAR_SHEET_LABEL_FORMAT.columns + safeColumn - 1;
}

export function gearSheetRemainingCellCount(row: number, column: number) {
  return GEAR_SHEET_LABEL_FORMAT.rows * GEAR_SHEET_LABEL_FORMAT.columns - gearSheetStartIndex(row, column);
}

export function placeGearSheetLabels(items: GearSheetLabelItem[], startRow: number, startColumn: number) {
  const startIndex = gearSheetStartIndex(startRow, startColumn);
  const capacity = gearSheetRemainingCellCount(startRow, startColumn);

  return items.slice(0, capacity).map<GearSheetLabelPlacement>((item, index) => {
    const slotIndex = startIndex + index;
    return {
      ...item,
      slotIndex,
      row: Math.floor(slotIndex / GEAR_SHEET_LABEL_FORMAT.columns) + 1,
      column: slotIndex % GEAR_SHEET_LABEL_FORMAT.columns + 1,
    };
  });
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

export function printGearLabelSheet(
  element: HTMLElement,
  {
    title,
    xOffsetMm = 0,
    yOffsetMm = 0,
  }: {
    title: string;
    xOffsetMm?: number;
    yOffsetMm?: number;
  },
) {
  const printWindow = window.open("", "gear-sheet-label-print", "popup,width=920,height=760");
  if (!printWindow) return false;

  const safeXOffsetMm = Number.isFinite(xOffsetMm) ? xOffsetMm : 0;
  const safeYOffsetMm = Number.isFinite(yOffsetMm) ? yOffsetMm : 0;
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const sheetMarkup = element.outerHTML;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      @page { size: letter portrait; margin: 0; }
      * { box-sizing: border-box; }
      html, body {
        width: ${GEAR_SHEET_LABEL_FORMAT.pageWidthIn}in;
        height: ${GEAR_SHEET_LABEL_FORMAT.pageHeightIn}in;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: white;
      }
      .gear-sheet-print-page {
        position: relative !important;
        inset: auto !important;
        width: ${GEAR_SHEET_LABEL_FORMAT.pageWidthIn}in !important;
        height: ${GEAR_SHEET_LABEL_FORMAT.pageHeightIn}in !important;
        transform: translate(${safeXOffsetMm}mm, ${safeYOffsetMm}mm);
        transform-origin: top left;
        overflow: hidden;
        background: white;
        color: rgb(10 10 10);
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .gear-sheet-print-label,
      .gear-sheet-alignment-cell {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      @media screen {
        html, body {
          width: 100%;
          min-width: 760px;
          height: auto;
          min-height: 100%;
          overflow: auto;
          background: rgb(236 234 228);
        }
        body {
          display: grid;
          place-items: start center;
          padding: 28px;
        }
        .gear-sheet-print-page {
          box-shadow: 0 18px 48px rgb(36 31 25 / 0.18);
        }
      }
      @media print {
        html, body {
          width: ${GEAR_SHEET_LABEL_FORMAT.pageWidthIn}in;
          height: ${GEAR_SHEET_LABEL_FORMAT.pageHeightIn}in;
        }
      }
    </style>
  </head>
  <body>${sheetMarkup}</body>
</html>`);
  printWindow.document.close();

  const openDialog = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(openDialog, 100);
  } else {
    printWindow.addEventListener("load", () => window.setTimeout(openDialog, 100), { once: true });
  }

  return true;
}
