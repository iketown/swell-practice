"use client";

import { useState } from "react";
import type { Published } from "@/lib/rider/model";
import {
  applyRackMap,
  standardRackMap,
  standardS16Inputs, standardEarPairs, standardWirelessInputs, earRoutes,
  stems,
  supportsRackMap,
  type RackMap,
} from "@/lib/rider/rack-map";
import { PatchDiagrams } from "./patch-diagrams";
import { rackInputs, wirelessRoutes } from "@/lib/rider/rack-inputs";
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
    { ...standardRackMap, ...initial.plot.rackMap, s16Inputs: initial.plot.rackMap?.s16Inputs ?? standardS16Inputs },
  );
  const [trace, setTrace] = useState(
    "Select a labeled socket to trace its connection.",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const savedMap = record.plot.rackMap;
  const changed = !savedMap?.s16Inputs ||
    map.housePorts.some((n, i) => n !== savedMap.housePorts[i]) ||
    map.s16Inputs?.some((n, i) => n !== savedMap.s16Inputs?.[i]) ||
    standardWirelessInputs.some((n, i) => (map.wirelessInputs?.[i] ?? n) !== (savedMap.wirelessInputs?.[i] ?? n)) ||
    standardEarPairs.some((n, i) => (map.earPairs?.[i] ?? n) !== (savedMap.earPairs?.[i] ?? n));
  const inputs = rackInputs(record.plot, map);
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
  function swapPort(field: "s16Inputs" | "wirelessInputs" | "earPairs", channel: number, port: number) {
    const defaults = { s16Inputs: standardS16Inputs, wirelessInputs: standardWirelessInputs, earPairs: standardEarPairs };
    const ports = [...(map[field] ?? defaults[field])];
    const other = ports.indexOf(port);
    ports[other] = ports[channel - 1];
    ports[channel - 1] = port;
    setMap({ ...map, [field]: ports });
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
            <details className="rack-port-editor">
              <summary>Edit channel assignments</summary>
              <p>Choosing an occupied socket swaps its assignment. Match any routing changes in the X32 show scene before line check.</p>
              <h3>Subsnake monitor tails</h3><div>{inputs.map(row => <label key={row.number}>
                <span>Split {row.number} · {row.source}</span>
                <select aria-label={`S16 input for split ${row.number}`} disabled={busy} value={row.s16} onChange={e => swapPort("s16Inputs", row.number, Number(e.target.value))}>
                  {standardS16Inputs.map(port => <option key={port} value={port}>S16 IN {port}</option>)}
                </select>
              </label>)}</div>
              <h3>Wireless receiver tails</h3><div>{wirelessRoutes(record.plot, map).map((rx, i) => <label key={rx.channel}>
                <span>{rx.source} · split {rx.channel}</span>
                <select aria-label={`Rack input for split ${rx.channel}`} value={rx.port} disabled={busy} onChange={e => swapPort("wirelessInputs", i + 1, Number(e.target.value))}>
                  {standardWirelessInputs.map(port => <option key={port} value={port}>{map.layout === "s16-v2" ? "XLR IN" : "AUX IN"} {port}</option>)}
                </select>
              </label>)}</div>
              <h3>Stereo transmitter feeds</h3><div>{earRoutes(map).map(mix => <label key={mix.tx}>
                <span>TX {mix.tx} · {mix.name}</span>
                <select aria-label={`Outputs for TX ${mix.tx}`} value={(map.earPairs ?? standardEarPairs)[mix.tx - 1]} disabled={busy} onChange={e => swapPort("earPairs", mix.tx, Number(e.target.value))}>
                  {standardEarPairs.map(pair => <option key={pair} value={pair}>{pair === 5 ? "X32 Rack 1/2" : `S16 ${pair * 2 - 1}/${pair * 2}`}</option>)}
                </select>
              </label>)}</div>
            </details>
            {message && <p role="status">{message}</p>}
            <p className="rack-trace" aria-live="polite">
              {trace}
            </p>
            <PatchDiagrams plot={record.plot} map={map} />
            <RackChannelGuide inputs={inputs} receivers={wirelessRoutes(record.plot, map)} map={map} onTrace={setTrace} />
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
