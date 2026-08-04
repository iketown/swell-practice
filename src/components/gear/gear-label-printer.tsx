"use client";

import { BarcodeIcon, PrinterIcon, QrCodeIcon } from "lucide-react";
import JsBarcode from "jsbarcode";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_GEAR_LABEL_FORMAT,
  GEAR_LABEL_FORMATS,
  gearLabelPayload,
  printGearLabel,
  type GearLabelKind,
  type GearLabelFormat,
} from "@/lib/gear/labels";

export function GearLabelPrinter({ assetTag, assetName }: { assetTag: string; assetName: string }) {
  const [kind, setKind] = useState<GearLabelKind>("qr");
  const [formatId, setFormatId] = useState(DEFAULT_GEAR_LABEL_FORMAT.id);
  const labelRef = useRef<HTMLDivElement>(null);
  const format = GEAR_LABEL_FORMATS.find((item) => item.id === formatId) ?? DEFAULT_GEAR_LABEL_FORMAT;
  const payload = gearLabelPayload(kind, assetTag);

  function print() {
    if (!labelRef.current) return;
    if (!printGearLabel(labelRef.current, format)) {
      toast.error("The browser blocked the print window. Allow pop-ups for this site and try again.");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-muted/25 p-4" aria-labelledby="gear-label-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="gear-label-heading" className="font-semibold">Print asset label</h3>
          <p className="text-sm text-muted-foreground">Sized for DYMO 30336 stock. Choose the code this label should carry.</p>
        </div>
        <Button type="button" onClick={print}>
          <PrinterIcon data-icon="inline-start" />
          Open print dialog
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.9fr)]">
        <GearLabelPreview ref={labelRef} kind={kind} format={format} assetTag={assetTag} assetName={assetName} />

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel id="gear-label-kind">Code on label</FieldLabel>
            <ToggleGroup
              aria-labelledby="gear-label-kind"
              className="w-full"
              variant="outline"
              spacing={0}
              value={[kind]}
              onValueChange={(values) => {
                const value = values[0] as GearLabelKind | undefined;
                if (value) setKind(value);
              }}
            >
              <ToggleGroupItem value="qr" className="flex-1">
                <QrCodeIcon data-icon="inline-start" />
                QR check-in
              </ToggleGroupItem>
              <ToggleGroupItem value="barcode" className="flex-1">
                <BarcodeIcon data-icon="inline-start" />
                Asset barcode
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {kind === "qr" ? "The QR code opens this item’s check-in page." : "The Code 128 barcode contains only the asset ID."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="gear-label-format">Label stock</FieldLabel>
            <Select value={formatId} onValueChange={(value) => value && setFormatId(value as GearLabelFormat["id"])}>
              <SelectTrigger id="gear-label-format" className="w-full"><SelectValue>{format.name}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup>
                {GEAR_LABEL_FORMATS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            <FieldDescription>In the print dialog, choose the DYMO printer and print at 100% scale with no margins.</FieldDescription>
          </Field>

          <div className="min-w-0 rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
            <span className="block font-medium text-foreground">Encoded value</span>
            <code className="block truncate" title={payload}>{payload}</code>
          </div>
        </FieldGroup>
      </div>
    </section>
  );
}

function GearLabelPreview({
  ref,
  kind,
  format,
  assetTag,
  assetName,
}: {
  ref: RefObject<HTMLDivElement | null>;
  kind: GearLabelKind;
  format: GearLabelFormat;
  assetTag: string;
  assetName: string;
}) {
  const cleanTag = assetTag.trim().toUpperCase();
  const cleanName = assetName.trim() || "Gear asset";

  return (
    <div className="flex min-w-0 items-center justify-center rounded-lg bg-secondary/60 p-4">
      <div
        ref={ref}
        className="gear-print-label"
        role="img"
        aria-label={`${kind === "qr" ? "QR check-in" : "Code 128 barcode"} label for ${cleanName}, ${cleanTag}`}
        style={{
          width: "100%",
          maxWidth: "432px",
          aspectRatio: `${format.widthMm} / ${format.heightMm}`,
          overflow: "hidden",
          border: "1px solid rgb(205 201 192)",
          borderRadius: "4px",
          background: "rgb(255 255 255)",
          color: "rgb(10 10 10)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        {kind === "qr"
          ? <QrLabel assetTag={cleanTag} assetName={cleanName} />
          : <BarcodeLabel assetTag={cleanTag} assetName={cleanName} />}
      </div>
    </div>
  );
}

function QrLabel({ assetTag, assetName }: { assetTag: string; assetName: string }) {
  const url = gearLabelPayload("qr", assetTag);
  const qr = useMemo(() => createQrSvgData(url), [url]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.6mm", width: "100%", height: "100%", padding: "2mm" }}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        shapeRendering="crispEdges"
        style={{ display: "block", width: "21mm", height: "21mm", flex: "0 0 21mm", background: "rgb(255 255 255)" }}
      >
        <rect width={qr.size} height={qr.size} fill="rgb(255 255 255)" />
        <path d={qr.path} fill="rgb(10 10 10)" />
      </svg>
      <div style={{ display: "flex", minWidth: 0, height: "20.5mm", flex: 1, flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ fontSize: "1.8mm", fontWeight: 700, letterSpacing: "0.25mm" }}>THE SWELL</div>
        <div
          style={{
            display: "-webkit-box",
            overflow: "hidden",
            fontSize: assetName.length > 30 ? "2.6mm" : "3.2mm",
            fontWeight: 700,
            lineHeight: 1.03,
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
        >
          {assetName}
        </div>
        <div>
          <div style={{ overflow: "hidden", fontFamily: "Courier New, monospace", fontSize: assetTag.length > 14 ? "2.5mm" : "3.1mm", fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>{assetTag}</div>
          <div style={{ marginTop: "0.8mm", fontSize: "1.6mm", fontWeight: 700, letterSpacing: "0.14mm" }}>SCAN TO CHECK IN</div>
        </div>
      </div>
    </div>
  );
}

function BarcodeLabel({ assetTag, assetName }: { assetTag: string; assetName: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, assetTag, {
      format: "CODE128",
      width: 2,
      height: 48,
      displayValue: false,
      margin: 0,
      background: "rgb(255 255 255)",
      lineColor: "rgb(10 10 10)",
    });
  }, [assetTag]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column", padding: "1.7mm 2mm 1.5mm" }}>
      <div style={{ display: "flex", minWidth: 0, alignItems: "baseline", justifyContent: "space-between", gap: "2mm" }}>
        <div style={{ overflow: "hidden", fontSize: assetName.length > 34 ? "2.4mm" : "2.9mm", fontWeight: 700, lineHeight: 1.1, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assetName}</div>
        <div style={{ flex: "0 0 auto", fontSize: "1.7mm", fontWeight: 700, letterSpacing: "0.22mm" }}>THE SWELL</div>
      </div>
      <svg
        ref={barcodeRef}
        aria-hidden="true"
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: "13mm", marginTop: "1.2mm", overflow: "visible" }}
      />
      <div style={{ marginTop: "0.7mm", textAlign: "center", fontFamily: "Courier New, monospace", fontSize: assetTag.length > 18 ? "2.6mm" : "3.2mm", fontWeight: 700, letterSpacing: "0.2mm", lineHeight: 1 }}>{assetTag}</div>
    </div>
  );
}

function createQrSvgData(value: string) {
  const hints = new Map<EncodeHintType, number>([[EncodeHintType.MARGIN, 4]]);
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
