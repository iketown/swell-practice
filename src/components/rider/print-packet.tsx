import Image from "next/image";
import type { ReactNode } from "react";
import {
  byNumber,
  micFor,
  type Published,
} from "@/lib/rider/model";
import type { RecipientPacket } from "@/lib/rider/releases";
import { printedUrl } from "@/lib/rider/printed-version";
import { EquipmentAdvance } from "./equipment-advance";
import { PrintQr, qrDataUrl } from "./print-qr";
import { CablePatchSchedule } from "./cable-patch-schedule";
import { StandPlacementPanel } from "./stand-placement";
import { viewLayers, defaultLayers } from "@/lib/rider/plot-layers";
import { StageCanvas } from "./stage-canvas";
export type Packet = RecipientPacket;
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
  const code = unsaved ? undefined : record.releaseCode;
  const issue = code ? "Issued · " + code : unsaved ? "Unsaved draft" : "Working draft · Rev " + revision;
  const dateText = unsaved ? "Based on " + date : date;
  const qrUrl = printedUrl(code, packet);
  const visibleUrl = qrUrl.replace("https://", "");
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
  const diagramFooter = (legend: ReactNode) => (
    <footer className="diagram-footer">
      <div>
        <div className="print-legend">{legend}</div>
        <a href={qrUrl}>{visibleUrl}</a>
      </div>
      <PrintQr url={qrUrl} label="Check this rider online" />
    </footer>
  );
  const inputs = byNumber(p);
  const boxesById = new Map(p.stageBoxes.map((b) => [b.id, b.label]));
  return (
    <article className="rider-print">
      <style>{`@page {size: letter portrait; margin: .375in .375in 1.28in;
        @bottom-left { width:75%; margin-bottom:.5in; overflow-wrap:anywhere; border-top:.7pt solid #506562; padding-top:4pt; vertical-align:top; white-space:pre-line; content:${JSON.stringify("THE SWELL · " + visibleUrl + "\n" + issue + " · " + record.versionName + " · " + dateText).replaceAll("\\n", "\\A ")}; font:9pt Arial; line-height:1.4; }
        @bottom-right { width:15%; margin-bottom:.5in; border-top:.7pt solid #506562; padding-top:4pt; vertical-align:top; content:url("${qrDataUrl(qrUrl)}"); }
        @bottom-center { width:10%; margin-bottom:.5in; white-space:nowrap; vertical-align:top; padding-top:9pt; content:"Page " counter(page); font:8pt Arial; }
      }
      @page riderMap {
        size: letter landscape; margin: .375in .375in .68in;
        @bottom-left { content: none; border: 0; }
        @bottom-right { content: none; border: 0; }
        @bottom-center { padding: 0; vertical-align: middle; }
      }`}</style>
      <footer className="print-version-footer">
        <div>
          <strong>
            {code
              ? "Check your printed revision"
              : "Online stage plot"}
          </strong>
          <span>
            <a href={qrUrl}>{visibleUrl}</a>
          </span>
          <small>
            {issue} · {record.versionName} · {dateText}
          </small>
        </div>
        <PrintQr url={qrUrl} label={unsaved ? "Open the latest rider online" : "Check this printed revision online"} />
      </footer>
      <section className="print-sheet print-cover">
        <Image alt="The Swell" src="/01-swell-logo.svg" width={240} height={104} unoptimized priority />
        <h1>Technical rider</h1>
        <h2>{record.versionName} · {packet}</h2>
        <p>{issue} · {dateText}</p>
        <div className="cover-check">
          <PrintQr url={qrUrl} label="Check this rider online" />
          <div>
            <strong>Before working from this rider, please check this link to make sure you have the latest and correct tech rider.</strong>
            <a href={qrUrl}>{visibleUrl}</a>
            {!code && <p>Working copy. Request an issued edition before advancing the show.</p>}
          </div>
        </div>
      </section>
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
          {diagramFooter(<>
            <b>Grid: 2 ft squares</b> · <b>Input key</b> □ Number = mic / line &nbsp; ▣ DI = direct input
            &nbsp; ⚡ = AC drop{" "}
            {p.stageBoxes.length > 0 &&
              " · Outlined box = assigned plot inputs"}{" "}
            &nbsp; · &nbsp; Audience at bottom. Symbols illustrative.
          </>)}
        </section>
      )}
      {pages.includes("Equipment advance") && <EquipmentAdvance plot={p} packet={packet} title={title} />}
      {pages.includes("Audio input key") && (
        <section className="print-sheet">
          {title("Audio input key")}
          <table className="print-input-key">
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
        {diagramFooter(<><b>Grid: 2 ft squares</b> · {view === "Stand placement" ? "Crosshairs mark the points measured from centreline and the downstage edge." : "Stage-box grids show plot inputs in socket order. Read left to right, starting at socket 1 in each box."}</>)}
      </section>
        {view === "Stand placement" && <section className="print-sheet">{title("Stand placement schedule")}<StandPlacementPanel plot={p} selected={null} editing={false} printLayout onSelect={noop} onChange={noop} /></section>}
        {view === "Cable patch and routing" && <section className="print-sheet">{title("Cable patch schedule")}<CablePatchSchedule plot={p} /></section>}
      </div>)}
    </article>
  );
}
