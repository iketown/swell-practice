import { stageBoxPatch, pointFor, type Plot } from "@/lib/rider/model";
import { boxColors } from "@/lib/rider/stage-box";
import { estimateInputXlr, inputXlrAllocation } from "@/lib/rider/input-xlr";

/** Connection instructions omit placement dimensions; stock cable lengths are estimates. */
export function CablePatchSchedule({
  plot: p,
  showDrawnConnections = false,
}: {
  plot: Plot;
  showDrawnConnections?: boolean;
}) {
  const rows = stageBoxPatch(p);
  const patches = new Map(rows.map(row => [row.input.id, row]));

  function endpointLabel(id: string, otherId: string) {
    const patch = patches.get(otherId);
    if (patch?.box && patch.box.id === id) {
      return <strong style={{ color: boxColors[patch.box.color] }}>{patch.box.label} · Ch {patch.channel}</strong>;
    }
    return pointFor(p, id)?.label;
  }

  const boxCode = (label: string) => {
    if (/^upstage(?: box)?$/i.test(label.trim())) return "U";
    if (/^stage[ -]left(?: box)?$/i.test(label.trim())) return "L";
    return null;
  };
  const boxLegend = p.stageBoxes
    .filter(box => boxCode(box.label))
    .map(box => `${boxCode(box.label)} = ${box.label}`)
    .join(" · ");

  return <div className="stand-placement-panel cable-patch-schedule">
    <p className="hint">{boxLegend && <><strong>{boxLegend}</strong><br /></>}
      Sockets start at 1 in each stage box and follow plot input order. Estimated XLR lengths include mic height and 5 ft of slack, rounded up to stock.</p>
    <table className="stagebox-patch-table">
      <thead><tr>
        <th>Plot input</th><th>Source / position</th><th>Stage box patch</th><th>XLR length (est.)</th>
      </tr></thead>
      <tbody>{rows.map(({ input, box, channel }) => {
        const allocation = inputXlrAllocation(p, input);
        const neededFeet = estimateInputXlr(p, input)?.stockFeet;
        const allocatedFeet = allocation && /^\d+\s*ft$/.test(allocation.spec) ? Number.parseInt(allocation.spec) : null;
        const patchLabel = box && `${boxCode(box.label) ?? box.label} - ${channel}`;
        return <tr key={input.id}>
          <td>#{input.number}</td>
          <td>{input.source} · {input.station}</td>
          <td>{box ? <strong style={{ color: boxColors[box.color] }}>{patchLabel}</strong> : "No box assigned"}</td>
          <td>
            {allocation
              ? <>{allocation.quantity !== 1 && `${allocation.quantity ?? "TBD"} × `}{allocation.spec || "Length to confirm"}</>
              : box ? "Not allocated" : "—"}
            {neededFeet != null && allocatedFeet !== null && neededFeet > allocatedFeet && <div>{neededFeet} ft needed for this route</div>}
          </td>
        </tr>;
      })}</tbody>
    </table>
    {showDrawnConnections && p.cables.length > 0 && <>
      <h2>Drawn connections</h2>
      <table>
        <thead><tr><th>Run</th><th>From</th><th>To</th><th>Cable / stock length</th></tr></thead>
        <tbody>{p.cables.map((run, index) => {
          const allocation = p.gear.find(g => g.id === run.gearId);
          return <tr key={run.id}>
            <td>R{index + 1}</td>
            <td>{endpointLabel(run.fromId, run.toId)}</td>
            <td>{endpointLabel(run.toId, run.fromId)}</td>
            <td>{allocation ? [allocation.item, allocation.spec].filter(Boolean).join(" · ") : "To confirm"}</td>
          </tr>;
        })}</tbody>
      </table>
    </>}
  </div>;
}
