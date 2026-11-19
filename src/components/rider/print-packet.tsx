import {
  canonical,
  byNumber,
  micFor,
  type Published,
} from "@/lib/rider/model";
import { printedUrl } from "@/lib/rider/printed-version";
import { EquipmentAdvance } from "./equipment-advance";
import { PrintQr, qrDataUrl } from "./print-qr";
import { CablePatchSchedule } from "./cable-patch-schedule";
import { StandPlacementPanel } from "./stand-placement";
import { viewLayers, defaultLayers } from "@/lib/rider/plot-layers";
import { StageCanvas } from "./stage-canvas";
export type Packet = "Full rider" | "Audio production" | "Backline";
export const riderPages = [
  "Stage plot",
  "Equipment advance",
  "Audio input key",
] as const;
export const setupPages = ["Stand placement", "Cable patch and routing"] as const;
export type RiderPage = (typeof riderPages)[number] | (typeof setupPages)[number];

const noop = () => {};
export function PrintPacket({
  record,
  packet,
  pages,
  preview = false,
  unsaved = false,
}: {
  record: Published;
  packet: Packet;
  pages: readonly RiderPage[];
  preview?: boolean;
  unsaved?: boolean;
}) {
  const { plot: p, revision, date } = record;
  const savedIssue = !record.releaseNumber
    ? "Version 1 draft"
    : preview
      ? "Version preview · Rev " + revision
      : "Published · Version " + record.releaseNumber;
  const issue = unsaved ? "Unsaved draft" : savedIssue;
  const dateText = unsaved ? "Based on " + date : date;
  const qrUrl = unsaved ? canonical : printedUrl(record, preview);
  const title = (name: string) => (
    <header className="print-title">
      <div>
        <strong>THE SWELL</strong>
        <h1>{name}</h1>
      </div>
      <div>
        {record.versionName && <>{record.versionName} · </>}
        {p.configuration}
        <br />
        {issue} · {dateText}
      </div>
    </header>
  );
  const inputs = byNumber(p);
  const boxesById = new Map(p.stageBoxes.map((b) => [b.id, b.label]));
  return (
    <article className="rider-print">
      <style>{`@page {size: letter landscape; margin: .25in .25in 1.3in;
        @bottom-left { width:75%; margin-left:.5in; border-top:.7pt solid #506562; padding-top:8pt; vertical-align:top; white-space:pre-line; content:${JSON.stringify("THE SWELL · Latest rider: theswell.live/stage-plot\n" + issue + " · " + record.versionName + " · " + dateText).replaceAll("\\n", "\\A ")}; font:9pt Arial; line-height:1.4; }
        @bottom-right { width:15%; margin-right:.5in; border-top:.7pt solid #506562; padding-top:8pt; vertical-align:top; content:url("${qrDataUrl(qrUrl)}"); }
        @bottom-center { width:10%; white-space:nowrap; vertical-align:bottom; padding-bottom:5pt; content:"Page " counter(page); font:8pt Arial; }
      }`}</style>
      <footer className="print-version-footer">
        <div>
          <strong>
            {record.releaseNumber && !unsaved
              ? "Check your printed revision"
              : "Online stage plot"}
          </strong>
          <span>
            Latest rider · <a href={canonical}>theswell.live/stage-plot</a>
          </span>
          <small>
            {issue} · {record.versionName} · {dateText}
          </small>
        </div>
        <PrintQr url={qrUrl} label={unsaved ? "Open the latest rider online" : "Check this printed revision online"} />
      </footer>
      {pages.includes("Stage plot") && (
        <section className="print-sheet print-diagram-sheet">
          {title("Stage plot")}
          <StageCanvas
            printLayout
            plot={p}
            editing={false}
            selected={null}
            active={null}
            onHover={noop}
            onSelect={noop}
            onMove={noop}
          />
          <div className="print-legend">
            <b>Grid: 2 ft squares</b> · <b>Input key</b> □ Number = mic / line &nbsp; ▣ DI = direct input
            &nbsp; ⚡ = AC drop{" "}
            {p.stageBoxes.length > 0 &&
              " · Outlined box = assigned plot inputs"}{" "}
            &nbsp; · &nbsp; Audience at bottom. Symbols illustrative.
          </div>
        </section>
      )}
      {pages.includes("Equipment advance") && <EquipmentAdvance plot={p} packet={packet} title={title} />}
      {pages.includes("Audio input key") && (
        <section className="print-sheet">
          {title("Audio input key")}
          <table>
            <thead>
              <tr>
                <th>Plot #</th>
                <th>Source</th>
                <th>Station</th>
                <th>Mic / connection</th>
                <th>Stage box</th>
                <th>FOH ch.</th>
                <th>Local patch / phantom / notes</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>{i.source}</td>
                  <td>{i.station}</td>
                  <td>{micFor(p, i)}</td>
                  <td>
                    {i.stageBoxId ? boxesById.get(i.stageBoxId) : "Unassigned"}
                  </td>
                  <td>{i.foh || "TBC"}</td>
                  <td>
                    {[i.patch, i.phantom, i.notes]
                      .filter(Boolean)
                      .join(" · ") || "To confirm"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {setupPages.filter((page) => preview && pages.includes(page)).map((view) => <div className="setup-print-group" key={view}><section className="print-sheet print-diagram-sheet">
        {title(view)}
        <StageCanvas printLayout plot={p} view={view} layers={viewLayers(view, defaultLayers)} editing={false} selected={null} active={null} onHover={noop} onSelect={noop} onMove={noop} />
        <div className="print-legend"><b>Grid: 2 ft squares</b> · {view === "Stand placement" ? "Crosshairs mark the points measured from centreline and the downstage edge." : "Stage-box grids show plot inputs in socket order. Read left to right, starting at socket 1 in each box."}</div>
      </section>
        {view === "Stand placement" && <section className="print-sheet">{title("Stand placement schedule")}<StandPlacementPanel plot={p} selected={null} editing={false} printLayout onSelect={noop} onChange={noop} /></section>}
        {view === "Cable patch and routing" && <section className="print-sheet">{title("Cable patch schedule")}<CablePatchSchedule plot={p} /></section>}
      </div>)}
    </article>
  );
}
