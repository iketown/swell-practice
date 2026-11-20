import { byNumber, type Plot } from "@/lib/rider/model";
import { playbackChannels, splitHouseChannel, type RackMap } from "@/lib/rider/rack-map";

export function FohHandoff({ plot, map }: { plot: Plot; map: RackMap }) {
  const inputs = byNumber(plot).filter(input => input.number >= 1 && input.number <= 18);
  const playback = playbackChannels(map);
  const houseFeeds = map.housePorts.length;
  return <div className="foh-handoff">
    <p><strong>{inputs.length + houseFeeds} house inputs at stage left.</strong> Take the labeled house tails from the analog splitter and {houseFeeds} line-level XLR feeds from the X32 Rack.</p>
    <table>
      <caption>Live inputs · analog splitter</caption>
      <thead><tr><th>FOH ch.</th><th>Source</th><th>House cable</th></tr></thead>
      <tbody>{inputs.map(input => <tr key={input.id}>
        <th scope="row">{splitHouseChannel(input)}</th><td>{input.source}</td><td>Split tail {input.number}</td>
      </tr>)}</tbody>
    </table>
    <table>
      <caption>Playback · X32 Rack</caption>
      <thead><tr><th>X32 ch.</th><th>Source</th><th>USB return</th><th>X32 XLR out</th><th>FOH ch.</th></tr></thead>
      <tbody>{playback.map(stem => <tr key={stem.channel}>
        <th scope="row">{stem.channel}</th><td>{stem.label}</td><td>{stem.usb}</td>
        <td>{stem.port ?? "—"}</td><td>{stem.foh ?? "Band IEMs only"}</td>
      </tr>)}</tbody>
    </table>
    <p>Confirm phantom power with the monitor engineer on the splitter’s direct leg. Keep phantom off on the wireless receivers and the playback inputs.</p>
  </div>;
}
