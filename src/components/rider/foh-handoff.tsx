import { byNumber, type Plot } from "@/lib/rider/model";
import { housePlayback, splitHouseChannel, type RackMap } from "@/lib/rider/rack-map";

export function FohHandoff({ plot, map }: { plot: Plot; map: RackMap }) {
  const inputs = byNumber(plot).filter(input => input.number >= 1 && input.number <= 18);
  const playback = housePlayback(map);
  return <div className="foh-handoff">
    <p><strong>{inputs.length + playback.length} house inputs at stage left.</strong> Take the labeled house tails from the analog splitter and three line-level XLR feeds from the X32 Rack.</p>
    <table>
      <caption>Live inputs · analog splitter</caption>
      <thead><tr><th>FOH ch.</th><th>Source</th><th>House cable</th></tr></thead>
      <tbody>{inputs.map(input => <tr key={input.id}>
        <th scope="row">{splitHouseChannel(input)}</th><td>{input.source}</td><td>Split tail {input.number}</td>
      </tr>)}</tbody>
    </table>
    <table>
      <caption>Playback · X32 Rack rear outputs</caption>
      <thead><tr><th>FOH ch.</th><th>Source</th><th>House cable</th></tr></thead>
      <tbody>{playback.map(stem => <tr key={stem.channel}>
        <th scope="row">{stem.foh}</th><td>{stem.source} · CH {stem.channel}</td><td>X32 XLR OUT {stem.port}</td>
      </tr>)}</tbody>
    </table>
    <p>Confirm phantom power with the monitor engineer on the splitter’s direct leg. Keep phantom off on the wireless receivers and the three playback inputs.</p>
    <p><strong>Monitor only</strong> · X32 CH 29 carries click. All five stereo IEM mixes stay with the band.</p>
  </div>;
}
