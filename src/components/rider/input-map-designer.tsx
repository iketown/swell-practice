"use client";

import { useState } from "react";
import type { Published } from "@/lib/rider/model";
import {
  applyRackMap,
  standardRackMap,
  stems,
  supportsRackMap,
  type RackMap,
} from "@/lib/rider/rack-map";
import { rackInputs } from "@/lib/rider/rack-inputs";
import { riderRequest } from "@/lib/rider/version-client";
import { PrintPacket } from "./print-packet";
import { RackChannelGuide } from "./rack-channel-guide";

export function InputMapDesigner({
  initial,
  template,
}: {
  initial: Published;
  template?: boolean;
}) {
  const [record, setRecord] = useState(initial);
  const [map, setMap] = useState<RackMap>(
    initial.plot.rackMap ?? standardRackMap,
  );
  const [trace, setTrace] = useState(
    "Select a labeled socket to trace its connection.",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const changed =
    !record.plot.rackMap ||
    map.housePorts.some((p, i) => p !== record.plot.rackMap?.housePorts[i]);
  const inputs = rackInputs(record.plot);
  const preview = { ...record, plot: { ...record.plot, rackMap: map } };
  const compatible = template || supportsRackMap(record.plot);
  function setOutput(index: number, port: number) {
    const ports: RackMap["housePorts"] = [...map.housePorts];
    const used = ports.indexOf(port);
    if (used !== -1) ports[used] = ports[index];
    ports[index] = port;
    setMap({ ...map, housePorts: ports });
    setMessage("");
    setTrace("Select a labeled socket to trace its connection.");
  }
  async function save() {
    if (!record.versionId || template || !compatible) return;
    setBusy(true);
    try {
      const next = await riderRequest<Published>("", {
        action: "save",
        id: record.versionId,
        revision: record.revision,
        expectedHead: record.revision,
        plot: applyRackMap(record.plot, map),
      });
      setRecord(next);
      setMessage("Saved rider revision " + next.revision + ".");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save revision.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="rider">
      <div className="rider-screen rack-design">
        <nav>
          <a
            href={
              template
                ? "/stage-plot"
                : "/stage-plot/list?version=" +
                  encodeURIComponent(record.versionId!)
            }
          >
            ← Stage plot
          </a>
          {template && (
            <a href="/stage-plot/input-map?version=standard">
              Edit Standard rider →
            </a>
          )}
        </nav>
        <h1>Rack channel guide</h1>
        <p>
          {template
            ? "Standard setup · Design preview"
            : record.versionName + " · Rev " + record.revision}{" "}
          · Stage left
        </p>
        {compatible ? (
          <>
            <div className="rack-edit-actions">
              <strong>House playback XLR outs</strong>
              {stems.map((stem, i) => (
                <label key={stem}>
                  {stem}
                  <select
                    aria-label={stem + " house output"}
                    value={map.housePorts[i]}
                    disabled={busy}
                    onChange={(e) => setOutput(i, Number(e.target.value))}
                  >
                    {[3, 4, 5, 6, 7, 8].map((port) => (
                      <option key={port}>{port}</option>
                    ))}
                  </select>
                </label>
              ))}
              <button type="button" onClick={() => window.print()}>
                Print guide
              </button>
              {!template && (
                <button
                  type="button"
                  className="primary"
                  onClick={save}
                  disabled={!changed || busy}
                >
                  {busy ? "Saving…" : "Save rider revision"}
                </button>
              )}
            </div>
            {message && <p role="status">{message}</p>}
            <p className="rack-trace" aria-live="polite">
              {trace}
            </p>
            <RackChannelGuide inputs={inputs} map={map} onTrace={setTrace} />
          </>
        ) : (
          <p>
            This setup uses a different input list. The Standard rack guide
            requires 16 wired inputs and the two wireless vocal channels.
          </p>
        )}
      </div>
      {compatible && (
        <PrintPacket
          record={preview}
          packet="Audio production"
          pages={["Rack channel guide"]}
          unsaved={template || changed}
        />
      )}
    </main>
  );
}
