"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListPlusIcon,
  PrinterIcon,
  RulerIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GEAR_SHEET_LABEL_FORMAT,
  gearSheetRemainingCellCount,
  gearSheetStartIndex,
  placeGearSheetLabels,
  printGearLabelSheet,
  splitCableLabelDescription,
  type GearSheetLabelItem,
  type GearSheetLabelPlacement,
} from "@/lib/gear/labels";
import { cn } from "@/lib/utils";

const CALIBRATION_STORAGE_KEY = "swell-gear-mr610-mac-calibration";
const MINIMUM_OFFSET_MM = -6;
const MAXIMUM_OFFSET_MM = 6;

export function GearSheetLabelPrinter({
  queue,
  queueableAssets,
  onQueueAssets,
  onRemove,
  onMove,
  onClear,
}: {
  queue: GearSheetLabelItem[];
  queueableAssets: GearSheetLabelItem[];
  onQueueAssets: (items: GearSheetLabelItem[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onClear: () => void;
}) {
  const [startRow, setStartRow] = useState(1);
  const [startColumn, setStartColumn] = useState(1);
  const [xOffset, setXOffset] = useState("0");
  const [yOffset, setYOffset] = useState("0");
  const printSheetRef = useRef<HTMLDivElement>(null);
  const alignmentSheetRef = useRef<HTMLDivElement>(null);
  const calibrationLoaded = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
        if (saved) {
          const value = JSON.parse(saved) as { xOffsetMm?: unknown; yOffsetMm?: unknown };
          if (typeof value.xOffsetMm === "number" && Number.isFinite(value.xOffsetMm)) setXOffset(String(value.xOffsetMm));
          if (typeof value.yOffsetMm === "number" && Number.isFinite(value.yOffsetMm)) setYOffset(String(value.yOffsetMm));
        }
      } catch {
        window.localStorage.removeItem(CALIBRATION_STORAGE_KEY);
      } finally {
        calibrationLoaded.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const xOffsetMm = xOffset.trim() ? Number(xOffset) : Number.NaN;
  const yOffsetMm = yOffset.trim() ? Number(yOffset) : Number.NaN;
  const xOffsetValid = Number.isFinite(xOffsetMm)
    && xOffsetMm >= MINIMUM_OFFSET_MM
    && xOffsetMm <= MAXIMUM_OFFSET_MM;
  const yOffsetValid = Number.isFinite(yOffsetMm)
    && yOffsetMm >= MINIMUM_OFFSET_MM
    && yOffsetMm <= MAXIMUM_OFFSET_MM;
  const offsetsValid = xOffsetValid && yOffsetValid;
  const capacity = gearSheetRemainingCellCount(startRow, startColumn);
  const placements = useMemo(() => placeGearSheetLabels(queue, startRow, startColumn), [queue, startColumn, startRow]);
  const placementBySlot = useMemo(() => new Map(placements.map((placement) => [placement.slotIndex, placement])), [placements]);
  const startIndex = gearSheetStartIndex(startRow, startColumn);
  const endPlacement = placements[placements.length - 1];
  const queueOverflow = queue.length > capacity;
  const queuedIds = useMemo(() => new Set(queue.map((item) => item.id)), [queue]);
  const unqueuedAssets = queueableAssets.filter((item) => !queuedIds.has(item.id));

  useEffect(() => {
    if (!calibrationLoaded.current || !offsetsValid) return;
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify({ xOffsetMm, yOffsetMm }));
  }, [offsetsValid, xOffsetMm, yOffsetMm]);

  function printQueue() {
    if (!printSheetRef.current || !queue.length || queueOverflow || !offsetsValid) return;
    const opened = printGearLabelSheet(printSheetRef.current, {
      title: `${queue.length} cable labels`,
      xOffsetMm,
      yOffsetMm,
    });
    if (!opened) toast.error("The browser blocked the print window. Allow pop-ups for this site and try again.");
  }

  function printAlignmentTest() {
    if (!alignmentSheetRef.current || !offsetsValid) return;
    const opened = printGearLabelSheet(alignmentSheetRef.current, {
      title: "MR610-MAC alignment test",
      xOffsetMm,
      yOffsetMm,
    });
    if (!opened) toast.error("The browser blocked the print window. Allow pop-ups for this site and try again.");
  }

  return (
    <section className="min-w-0 bg-card" aria-labelledby="sheet-label-queue-heading">
      <div className="flex flex-col gap-3 border-b p-4 pr-12 sm:flex-row sm:items-start sm:justify-between sm:p-5 sm:pr-14">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sheet-label-queue-heading" className="text-lg font-semibold">Cable label queue</h2>
            <Badge variant={queue.length ? "secondary" : "outline"}>{queue.length} queued</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            MR610-MAC stock has 8 columns and 4 rows. Only assets tagged Cables with a saved length can enter this queue. Each centered label emphasizes its length, end types, four-digit cable ID, and The Swell website against the laminate edge.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onQueueAssets(unqueuedAssets)} disabled={!unqueuedAssets.length}>
          <ListPlusIcon data-icon="inline-start" />
          Add visible cables ({unqueuedAssets.length})
        </Button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 p-4 sm:p-5 lg:border-r">
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="gear-sheet-start-row">Starting row</FieldLabel>
              <Select value={String(startRow)} onValueChange={(value) => value && setStartRow(Number(value))}>
                <SelectTrigger id="gear-sheet-start-row" className="w-full"><SelectValue>{`Row ${startRow}`}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>
                  {Array.from({ length: GEAR_SHEET_LABEL_FORMAT.rows }, (_, index) => index + 1).map((row) => <SelectItem key={row} value={String(row)}>Row {row}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-sheet-start-column">Starting column</FieldLabel>
              <Select value={String(startColumn)} onValueChange={(value) => value && setStartColumn(Number(value))}>
                <SelectTrigger id="gear-sheet-start-column" className="w-full"><SelectValue>{`Column ${startColumn}`}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>
                  {Array.from({ length: GEAR_SHEET_LABEL_FORMAT.columns }, (_, index) => index + 1).map((column) => <SelectItem key={column} value={String(column)}>Column {column}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field data-invalid={!xOffsetValid}>
              <FieldLabel htmlFor="gear-sheet-x-offset">Horizontal offset (mm)</FieldLabel>
              <Input id="gear-sheet-x-offset" type="number" min={MINIMUM_OFFSET_MM} max={MAXIMUM_OFFSET_MM} step="0.25" value={xOffset} onChange={(event) => setXOffset(event.target.value)} aria-invalid={!xOffsetValid} />
            </Field>
            <Field data-invalid={!yOffsetValid}>
              <FieldLabel htmlFor="gear-sheet-y-offset">Vertical offset (mm)</FieldLabel>
              <Input id="gear-sheet-y-offset" type="number" min={MINIMUM_OFFSET_MM} max={MAXIMUM_OFFSET_MM} step="0.25" value={yOffset} onChange={(event) => setYOffset(event.target.value)} aria-invalid={!yOffsetValid} />
            </Field>
          </FieldGroup>
          <FieldDescription className="mt-2">
            Positive horizontal values move right; positive vertical values move down. Offsets are saved on this browser for future sheets.
          </FieldDescription>

          <div className="mt-5 overflow-x-auto pb-1">
            <div className="grid min-w-[40rem] grid-cols-8 gap-x-1 gap-y-4" aria-label="MR610-MAC sheet placement preview">
              {Array.from({ length: GEAR_SHEET_LABEL_FORMAT.rows * GEAR_SHEET_LABEL_FORMAT.columns }, (_, slotIndex) => {
                const row = Math.floor(slotIndex / GEAR_SHEET_LABEL_FORMAT.columns) + 1;
                const column = slotIndex % GEAR_SHEET_LABEL_FORMAT.columns + 1;
                const placement = placementBySlot.get(slotIndex);
                const isStart = slotIndex === startIndex;
                const isSkipped = slotIndex < startIndex;
                return (
                  <button
                    key={slotIndex}
                    type="button"
                    className={cn(
                      "relative flex min-w-0 flex-col justify-between overflow-hidden rounded border p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55",
                      placement ? "border-primary bg-primary/10" : isSkipped ? "bg-muted/45 text-muted-foreground" : "bg-background hover:bg-muted/35",
                      isStart && "ring-2 ring-primary ring-offset-1",
                    )}
                    style={{ aspectRatio: `${GEAR_SHEET_LABEL_FORMAT.printableWidthIn} / ${GEAR_SHEET_LABEL_FORMAT.printableHeightIn}` }}
                    onClick={() => {
                      setStartRow(row);
                      setStartColumn(column);
                    }}
                    aria-label={`Start printing at row ${row}, column ${column}${placement ? `, currently ${placement.assetTag}` : ""}`}
                    aria-pressed={isStart}
                  >
                    <span className="text-[9px] font-medium leading-none text-muted-foreground">R{row} C{column}</span>
                    {placement ? (
                      <span className="min-w-0">
                        <span className="block truncate text-[9px] font-semibold leading-tight">{placement.assetTag}</span>
                        <span className="block text-[8px] leading-none text-muted-foreground">#{placement.slotIndex - startIndex + 1}</span>
                      </span>
                    ) : isSkipped ? <span className="text-[8px] leading-none">skip</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm" aria-live="polite">
              {queueOverflow ? (
                <p className="font-medium text-destructive">Only {capacity} cells remain from row {startRow}, column {startColumn}. Choose an earlier start or remove {queue.length - capacity} label{queue.length - capacity === 1 ? "" : "s"}.</p>
              ) : queue.length ? (
                <p><span className="font-medium">{queue.length} label{queue.length === 1 ? "" : "s"}</span> will fill through row {endPlacement.row}, column {endPlacement.column}. {capacity - queue.length} later cell{capacity - queue.length === 1 ? "" : "s"} will remain unused.</p>
              ) : (
                <p className="text-muted-foreground">Queue Cables-tagged assets below, then choose the first unused cell.</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={printAlignmentTest} disabled={!offsetsValid}>
                <RulerIcon data-icon="inline-start" />
                Print alignment test
              </Button>
              <Button type="button" size="sm" onClick={printQueue} disabled={!queue.length || queueOverflow || !offsetsValid}>
                <PrinterIcon data-icon="inline-start" />
                Print {queue.length || "queue"}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            First print the alignment test on plain Letter paper. In the print dialog choose Actual size or 100%, use no margins, and turn off headers and footers. Hold the test page behind the label sheet; adjust the millimeter offsets until every outlined box matches the smaller printable area.
          </p>
        </div>

        <aside className="min-w-0 border-t p-4 lg:border-t-0" aria-label="Queued cable labels">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Print order</h3>
            <Button type="button" variant="ghost" size="xs" onClick={onClear} disabled={!queue.length}>
              <Trash2Icon data-icon="inline-start" />
              Clear
            </Button>
          </div>
          {queue.length ? (
            <ol className="mt-3 flex max-h-80 flex-col overflow-y-auto border-y">
              {queue.map((item, index) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2 border-b py-2 last:border-b-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] font-semibold">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.assetName}</span>
                    <code className="block truncate text-[10px] text-muted-foreground">{item.assetTag}</code>
                  </span>
                  <span className="flex shrink-0">
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(item.id, -1)} disabled={index === 0} aria-label={`Move ${item.assetTag} earlier`}><ArrowUpIcon /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(item.id, 1)} disabled={index === queue.length - 1} aria-label={`Move ${item.assetTag} later`}><ArrowDownIcon /></Button>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.assetTag} from print queue`}><XIcon /></Button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty className="mt-3 min-h-32 border-y p-3">
              <EmptyHeader>
                <EmptyMedia variant="icon"><TagIcon /></EmptyMedia>
                <EmptyTitle>No labels queued</EmptyTitle>
                <EmptyDescription>Add the Cables tag in an asset editor, then use Queue label below.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </aside>
      </div>

      <GearSheetPrintPage ref={printSheetRef} placements={placements} />
      <GearSheetAlignmentPage ref={alignmentSheetRef} />
    </section>
  );
}

function GearSheetPrintPage({
  ref,
  placements,
}: {
  ref: RefObject<HTMLDivElement | null>;
  placements: GearSheetLabelPlacement[];
}) {
  return (
    <div ref={ref} className="gear-sheet-print-page" style={hiddenSheetStyle} aria-hidden="true">
      {placements.map((placement) => <GearSheetAssetLabel key={placement.id} placement={placement} />)}
    </div>
  );
}

function GearSheetAssetLabel({ placement }: { placement: GearSheetLabelPlacement }) {
  const cableCode = placement.assetTag.trim();
  const assetName = placement.assetName.trim() || "Gear asset";
  const cableDescription = splitCableLabelDescription(assetName);

  return (
    <div
      className="gear-sheet-print-label"
      role="img"
      aria-label={`Cable label for ${assetName}, cable ID ${cableCode}`}
      style={{
        position: "absolute",
        left: `${GEAR_SHEET_LABEL_FORMAT.leftIn + (placement.column - 1) * GEAR_SHEET_LABEL_FORMAT.printableWidthIn}in`,
        top: `${GEAR_SHEET_LABEL_FORMAT.topIn + (placement.row - 1) * GEAR_SHEET_LABEL_FORMAT.rowPitchIn}in`,
        width: `${GEAR_SHEET_LABEL_FORMAT.printableWidthIn}in`,
        height: `${GEAR_SHEET_LABEL_FORMAT.printableHeightIn}in`,
        overflow: "hidden",
        background: "rgb(255 255 255)",
        color: "rgb(10 10 10)",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0.7mm 0.7mm 0.45mm",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "5.5mm",
            flex: "0 0 5.5mm",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15.5pt",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
            letterSpacing: "0.25pt",
            lineHeight: 0.9,
            whiteSpace: "nowrap",
          }}
        >
          {cableCode}
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "4.6mm",
            flex: "0 0 4.6mm",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            fontSize: "12.2pt",
            fontWeight: 700,
            lineHeight: 0.9,
            whiteSpace: "nowrap",
          }}
        >
          {cableDescription.length}
        </div>
        <div
          style={{
            width: "100%",
            height: "3mm",
            flex: "0 0 3mm",
            overflow: "hidden",
            textAlign: "center",
            fontFamily: '"Arial Narrow", Arial, Helvetica, sans-serif',
            fontSize: cableDescription.endTypes.length > 32 ? "5.4pt" : cableDescription.endTypes.length > 26 ? "6.2pt" : "7.2pt",
            fontWeight: 700,
            letterSpacing: "-0.05pt",
            lineHeight: 1.15,
            whiteSpace: "nowrap",
          }}
        >
          {cableDescription.endTypes}
        </div>
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            width: "100%",
            height: "3mm",
            flex: "0 0 3mm",
            alignItems: "flex-end",
            justifyContent: "center",
            fontSize: "7.3pt",
            fontWeight: 400,
            letterSpacing: "0.02pt",
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

function GearSheetAlignmentPage({ ref }: { ref: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={ref} className="gear-sheet-print-page" style={hiddenSheetStyle} aria-hidden="true">
      {Array.from({ length: GEAR_SHEET_LABEL_FORMAT.rows * GEAR_SHEET_LABEL_FORMAT.columns }, (_, slotIndex) => {
        const row = Math.floor(slotIndex / GEAR_SHEET_LABEL_FORMAT.columns) + 1;
        const column = slotIndex % GEAR_SHEET_LABEL_FORMAT.columns + 1;
        return (
          <div
            key={slotIndex}
            className="gear-sheet-alignment-cell"
            style={{
              position: "absolute",
              left: `${GEAR_SHEET_LABEL_FORMAT.leftIn + (column - 1) * GEAR_SHEET_LABEL_FORMAT.printableWidthIn}in`,
              top: `${GEAR_SHEET_LABEL_FORMAT.topIn + (row - 1) * GEAR_SHEET_LABEL_FORMAT.rowPitchIn}in`,
              width: `${GEAR_SHEET_LABEL_FORMAT.printableWidthIn}in`,
              height: `${GEAR_SHEET_LABEL_FORMAT.printableHeightIn}in`,
              border: "0.5pt solid rgb(10 10 10)",
              background: "rgb(255 255 255)",
              color: "rgb(10 10 10)",
              fontFamily: "Arial, Helvetica, sans-serif",
            }}
          >
            <span style={{ position: "absolute", left: "1.1mm", top: "0.8mm", fontSize: "5pt", fontWeight: 700 }}>R{row} C{column}</span>
            <span style={{ position: "absolute", left: "50%", top: "50%", width: "6mm", height: "0.35pt", transform: "translate(-50%, -50%)", background: "rgb(10 10 10)" }} />
            <span style={{ position: "absolute", left: "50%", top: "50%", width: "0.35pt", height: "6mm", transform: "translate(-50%, -50%)", background: "rgb(10 10 10)" }} />
          </div>
        );
      })}
    </div>
  );
}

const hiddenSheetStyle = {
  position: "fixed",
  left: "-200vw",
  top: 0,
  width: `${GEAR_SHEET_LABEL_FORMAT.pageWidthIn}in`,
  height: `${GEAR_SHEET_LABEL_FORMAT.pageHeightIn}in`,
  overflow: "hidden",
  background: "rgb(255 255 255)",
} as const;
