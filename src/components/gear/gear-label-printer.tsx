"use client";

import {
  BarcodeFormat,
  EncodeHintType,
  QRCodeWriter,
} from "@zxing/library";
import JsBarcode from "jsbarcode";
import { BarcodeIcon, PrinterIcon, QrCodeIcon } from "lucide-react";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_GEAR_LABEL_FORMAT,
  gearLabelPayload,
  printGearLabel,
  splitCableLabelDescription,
  type GearLabelKind,
} from "@/lib/gear/labels";

type SingleLabelKind = Extract<GearLabelKind, "qr" | "barcode">;

export function GearLabelPrinter({
  assetTag,
  assetName,
  isCable = false,
}: {
  assetTag: string;
  assetName: string;
  isCable?: boolean;
}) {
  const labelRef = useRef<HTMLDivElement>(null);
  const [labelKind, setLabelKind] = useState<SingleLabelKind>(isCable ? "barcode" : "qr");
  const payload = gearLabelPayload(labelKind, assetTag);

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
          <h3 id="gear-label-heading" className="font-semibold">Print 1 × 1½ inch {isCable ? "cable barrel" : "gear"} label</h3>
          <p className="text-sm text-muted-foreground">
            {labelKind === "qr"
              ? "The four-digit number leads the 1-inch edge, and the QR code opens the public gear page."
              : "A tall Code 128 barcode leads the label, with the inventory number and item description grouped at the bottom."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ToggleGroup
            aria-label="Label code format"
            variant="outline"
            size="sm"
            spacing={0}
            value={[labelKind]}
            onValueChange={(values) => {
              const nextKind = values[0] as SingleLabelKind | undefined;
              if (nextKind) setLabelKind(nextKind);
            }}
          >
            <ToggleGroupItem value="qr"><QrCodeIcon data-icon="inline-start" />QR</ToggleGroupItem>
            <ToggleGroupItem value="barcode"><BarcodeIcon data-icon="inline-start" />Barcode</ToggleGroupItem>
          </ToggleGroup>
          <Button type="button" onClick={print}>
            <PrinterIcon data-icon="inline-start" />
            Print {labelKind === "qr" ? "QR" : "barcode"} label
          </Button>
        </div>
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.8fr)]">
        <GearLabelPreview ref={labelRef} assetTag={assetTag} assetName={assetName} labelKind={labelKind} isCable={isCable} />
        <div className="min-w-0 space-y-3 text-sm text-muted-foreground">
          <p>Load the 1 × 1½ inch stock in portrait orientation. Choose the exact 1 × 1½ inch paper size, 100% scale, portrait orientation, and no margins.</p>
          <div className="min-w-0 rounded-md bg-background px-3 py-2 text-xs">
            <span className="block font-medium text-foreground">{labelKind === "qr" ? "QR code destination" : "Barcode value"}</span>
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
  labelKind,
  isCable,
}: {
  ref: RefObject<HTMLDivElement | null>;
  assetTag: string;
  assetName: string;
  labelKind: SingleLabelKind;
  isCable: boolean;
}) {
  const cleanTag = gearLabelPayload("barcode", assetTag).padStart(4, "0");
  const cleanName = assetName.trim() || "Gear asset";

  return (
    <div className="flex min-w-0 items-center justify-center rounded-lg bg-secondary/60 p-4">
      <div
        ref={ref}
        className="gear-print-label"
        role="img"
        aria-label={`${labelKind === "qr" ? "QR" : "Code 128 barcode"} label for ${cleanName}, inventory number ${cleanTag}`}
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
        {labelKind === "qr"
          ? <QrGearLabel assetTag={cleanTag} assetName={cleanName} />
          : <BarcodeGearLabel assetTag={cleanTag} assetName={cleanName} isCable={isCable} />}
      </div>
    </div>
  );
}

function BarcodeGearLabel({ assetTag, assetName, isCable }: { assetTag: string; assetName: string; isCable: boolean }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const cableDescription = isCable ? splitCableLabelDescription(assetName) : null;

  useEffect(() => {
    if (!barcodeRef.current) return;
    // Numeric Code 128C gives a four-digit ID the fewest possible modules.
    // The SVG fills the label width; its 10-module margins remain blank quiet zones.
    JsBarcode(barcodeRef.current, gearLabelPayload("barcode", assetTag), {
      format: "CODE128C",
      width: 1,
      height: 78,
      displayValue: false,
      margin: 0,
      marginLeft: 10,
      marginRight: 10,
      background: "rgb(255 255 255)",
      lineColor: "rgb(10 10 10)",
    });
  }, [assetTag]);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        alignItems: "center",
        padding: "4.5mm 0 0.65mm",
      }}
    >
      <svg
        ref={barcodeRef}
        aria-hidden="true"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        style={{
          display: "block",
          width: "100%",
          height: "18.5mm",
          flex: "0 0 18.5mm",
          overflow: "visible",
        }}
      />

      <div
        style={{
          display: "flex",
          width: "100%",
          flex: "1 1 auto",
          minHeight: 0,
          flexDirection: "column",
          alignItems: "center",
          padding: "0.35mm 0.7mm 0",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "5mm",
            flex: "0 0 5mm",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: '"Arial Black", Arial, Helvetica, sans-serif',
            fontSize: "4.4mm",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 900,
            letterSpacing: "0.9mm",
            lineHeight: 0.9,
            whiteSpace: "nowrap",
          }}
        >
          {assetTag}
        </div>

        {cableDescription?.length ? (
          <>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "3.2mm",
                flex: "0 0 3.2mm",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                fontSize: "2.8mm",
                fontWeight: 800,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {cableDescription.length}
            </div>
            <div
              style={{
                width: "100%",
                height: "2.4mm",
                flex: "0 0 2.4mm",
                overflow: "hidden",
                textAlign: "center",
                textOverflow: "clip",
                fontFamily: '"Arial Narrow", Arial, Helvetica, sans-serif',
                fontSize: cableDescription.endTypes.length > 25 ? "1.5mm" : cableDescription.endTypes.length > 20 ? "1.65mm" : "1.8mm",
                fontWeight: 700,
                letterSpacing: "-0.01mm",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
              }}
            >
              {cableDescription.endTypes}
            </div>
          </>
        ) : (
          <div
            style={{
              display: "-webkit-box",
              width: "100%",
              minHeight: 0,
              overflow: "hidden",
              textAlign: "center",
              fontSize: assetName.length > 34 ? "1.55mm" : assetName.length > 26 ? "1.75mm" : "2mm",
              fontWeight: 700,
              lineHeight: 1.05,
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {assetName}
          </div>
        )}

        <div
          aria-hidden="true"
          style={{
            display: "flex",
            height: "2.2mm",
            flex: "0 0 2.2mm",
            alignItems: "flex-end",
            justifyContent: "center",
            marginTop: "auto",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "1.7mm",
            fontWeight: 400,
            letterSpacing: "0.06mm",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <span>www.</span><strong style={{ fontWeight: 700 }}>TheSwell</strong><span>.live</span>
        </div>
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
