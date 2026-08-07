"use client";

import {
  BarcodeFormat,
  EncodeHintType,
  QRCodeWriter,
} from "@zxing/library";
import { PrinterIcon } from "lucide-react";
import { RefObject, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_GEAR_LABEL_FORMAT,
  gearLabelPayload,
  printGearLabel,
} from "@/lib/gear/labels";

export function GearLabelPrinter({ assetTag, assetName }: { assetTag: string; assetName: string }) {
  const labelRef = useRef<HTMLDivElement>(null);
  const payload = gearLabelPayload("qr", assetTag);

  function print() {
    if (!labelRef.current) return;
    if (!printGearLabel(labelRef.current, DEFAULT_GEAR_LABEL_FORMAT)) {
      toast.error("The browser blocked the print window. Allow pop-ups for this site and try again.");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-muted/25 p-4" aria-labelledby="gear-label-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 id="gear-label-heading" className="font-semibold">Print 1 × 1½ inch gear label</h3>
          <p className="text-sm text-muted-foreground">The four-digit number leads the 1-inch edge for fast reading. A LabelWriter 450 Turbo-safe top inset keeps it clear of the label feed boundary.</p>
        </div>
        <Button type="button" onClick={print}>
          <PrinterIcon data-icon="inline-start" />
          Open print dialog
        </Button>
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.8fr)]">
        <GearLabelPreview ref={labelRef} assetTag={assetTag} assetName={assetName} />
        <div className="min-w-0 space-y-3 text-sm text-muted-foreground">
          <p>Load the 1 × 1½ inch stock in portrait orientation. Choose the exact 1 × 1½ inch paper size, 100% scale, portrait orientation, and no margins.</p>
          <div className="min-w-0 rounded-md bg-background px-3 py-2 text-xs">
            <span className="block font-medium text-foreground">QR code destination</span>
            <code className="block truncate" title={payload}>{payload}</code>
          </div>
        </div>
      </div>
    </section>
  );
}

function GearLabelPreview({
  ref,
  assetTag,
  assetName,
}: {
  ref: RefObject<HTMLDivElement | null>;
  assetTag: string;
  assetName: string;
}) {
  const cleanTag = assetTag.trim().padStart(4, "0");
  const cleanName = assetName.trim() || "Gear asset";

  return (
    <div className="flex min-w-0 items-center justify-center rounded-lg bg-secondary/60 p-4">
      <div
        ref={ref}
        className="gear-print-label"
        role="img"
        aria-label={`QR gear label for ${cleanName}, inventory number ${cleanTag}`}
        style={{
          width: `${DEFAULT_GEAR_LABEL_FORMAT.widthMm}mm`,
          height: `${DEFAULT_GEAR_LABEL_FORMAT.heightMm}mm`,
          flex: "0 0 auto",
          overflow: "hidden",
          border: "1px solid rgb(205 201 192)",
          borderRadius: "4px",
          background: "rgb(255 255 255)",
          color: "rgb(10 10 10)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <QrGearLabel assetTag={cleanTag} assetName={cleanName} />
      </div>
    </div>
  );
}

function QrGearLabel({ assetTag, assetName }: { assetTag: string; assetName: string }) {
  const url = gearLabelPayload("qr", assetTag);
  const qr = useMemo(() => createQrSvgData(url), [url]);

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        padding: "4.5mm 1.15mm 0.7mm",
      }}
    >
      <VerticalSiteName side="left" />
      <VerticalSiteName side="right" />

      <div
        style={{
          display: "flex",
          width: "100%",
          height: "7.7mm",
          flex: "0 0 7.7mm",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "0.35mm solid rgb(10 10 10)",
          fontFamily: '"Arial Black", Arial, Helvetica, sans-serif',
          fontSize: "6.5mm",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 900,
          letterSpacing: "0.65mm",
          lineHeight: 0.9,
          whiteSpace: "nowrap",
        }}
      >
        {assetTag}
      </div>

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        shapeRendering="crispEdges"
        style={{
          display: "block",
          width: "18mm",
          height: "18mm",
          flex: "0 0 18mm",
          marginTop: "0.3mm",
          background: "rgb(255 255 255)",
        }}
      >
        <rect width={qr.size} height={qr.size} fill="rgb(255 255 255)" />
        <path d={qr.path} fill="rgb(10 10 10)" />
      </svg>

      <div
        style={{
          display: "-webkit-box",
          width: "18mm",
          minHeight: 0,
          marginTop: "0.3mm",
          overflow: "hidden",
          textAlign: "center",
          fontSize: assetName.length > 32 ? "1.8mm" : "2.1mm",
          fontWeight: 700,
          lineHeight: 1.05,
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
        }}
      >
        {assetName}
      </div>
    </div>
  );
}

function VerticalSiteName({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "flex",
        position: "absolute",
        top: "12.35mm",
        bottom: "0.55mm",
        left: side === "left" ? "1.25mm" : undefined,
        right: side === "right" ? "1.25mm" : undefined,
        width: "2.25mm",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "2.25mm",
        fontWeight: 400,
        letterSpacing: "0.1mm",
        lineHeight: 1,
        pointerEvents: "none",
        textOrientation: "mixed",
        transform: side === "right" ? "rotate(180deg)" : undefined,
        whiteSpace: "nowrap",
        writingMode: "vertical-rl",
      }}
    >
      <span style={{ fontSize: "1.85mm", letterSpacing: "0.06mm" }}>www.</span>
      <strong style={{ fontWeight: 700 }}>TheSwell</strong>
      <span style={{ fontSize: "1.85mm", letterSpacing: "0.06mm" }}>.live</span>
    </span>
  );
}

function createQrSvgData(value: string) {
  const hints = new Map<EncodeHintType, string | number>([
    [EncodeHintType.MARGIN, 4],
    [EncodeHintType.ERROR_CORRECTION, "Q"],
  ]);
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 1, 1, hints);
  const size = matrix.getWidth();
  const path: string[] = [];

  for (let y = 0; y < size; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= size; x += 1) {
      const dark = x < size && matrix.get(x, y);
      if (dark && runStart < 0) runStart = x;
      if (!dark && runStart >= 0) {
        path.push(`M${runStart} ${y}h${x - runStart}v1H${runStart}z`);
        runStart = -1;
      }
    }
  }

  return { path: path.join(""), size };
}
