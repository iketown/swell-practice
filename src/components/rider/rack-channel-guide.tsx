import Image from "next/image";
import { earRoutes, playbackChannels, type RackMap } from "@/lib/rider/rack-map";
import { type wirelessRoutes, type RackInput } from "@/lib/rider/rack-inputs";

import { rackOutputCenter, s16Front, s16InputCenter, x32Rear, x32WirelessCenter } from "./rack-panels";

type Pin = { x: number; y: number; label: string; route: string; iem?: boolean };
function Panel({
  device,
  pins,
  onTrace,
}: {
  device: "s16" | "x32";
  pins: Pin[];
  onTrace?: (route: string) => void;
}) {
  const s16 = device === "s16";
  const width = s16 ? s16Front.width : x32Rear.width;
  const height = s16 ? s16Front.height : x32Rear.height;
  return (
    <div className="rack-panel-scroll">
      <figure className={"rack-panel " + device}>
        <Image
          className="rack-panel-artwork"
          alt={
            s16
              ? "Behringer S16 front panel"
              : "Behringer X32 Rack rear panel, viewed from behind"
          }
          src={
            s16 ? s16Front.src : x32Rear.src
          }
          width={width}
          height={height}
          unoptimized
          priority
        />
        {pins.map((pin) => {
          const style = {
            left: (pin.x / width) * 100 + "%",
            top: (pin.y / height) * 100 + "%",
          };
          const className = pin.iem ? "rack-pin iem-output" : "rack-pin";
          return onTrace ? (
            <button
              type="button"
              key={pin.route}
              style={style}
              className={className}
              title={pin.route}
              aria-label={pin.route}
              onClick={() => onTrace(pin.route)}
            >
              {pin.label}
            </button>
          ) : (
            <span key={pin.route} style={style} className={className}>
              {pin.label}
            </span>
          );
        })}
      </figure>
    </div>
  );
}

export function RackChannelGuide({
  inputs,
  receivers,
  map,
  onTrace,
}: {
  inputs: RackInput[];
  receivers: ReturnType<typeof wirelessRoutes>;
  map: RackMap;
  onTrace?: (route: string) => void;
}) {
  const ears = earRoutes(map);
  const extraPatched = ears.length === 6;
  const s16: Pin[] = inputs.map(({ number, source, socket, s16 }) => ({
    ...s16InputCenter(s16),
    label: String(s16),
    route: `${source} · ${socket} → split ${number} → S16 IN ${s16} → X32 CH ${number}`,
  }));
  const local = map.layout === "s16-v2";
  const wireless = receivers.map(({ channel, source, input, port }) => {
    return {
      ...x32WirelessCenter(local, port),
      label: String(channel),
      route: `${source} RX → split ${channel} → ${input} → CH ${channel}`,
    };
  });
  const playback = playbackChannels(map);
  const x32: Pin[] = [
    ...wireless,
    {
      x: 391,
      y: 121,
      label: "A",
      route: "X32 AES50 A ↔ S16 rear AES50 A · shielded Cat5e etherCON",
    },
    {
      x: 169,
      y: 129,
      label: "USB",
      route: playback.map(s => `USB ${s.usb} → CH ${s.channel} ${s.label}`).join(" · "),
    },
  ];
  for (const mix of ears) {
    for (const [index, side] of ["L", "R"].entries()) {
      const out = mix.out + index;
      const label = `IEM ${mix.tx}${side}`;
      const pin = {
        iem: true,
        label,
        route: `${label} · Bus ${mix.bus + index} → ${mix.device} OUT ${out} → TX${mix.tx} ${side} · ${mix.name}`,
      };
      const panel = mix.device === "S16" ? s16 : x32;
      panel.push({ ...pin, ...rackOutputCenter(mix.device, out) });
    }
  }
  for (const stem of playback) {
    if (stem.port === null) continue;
    x32.push({
      ...rackOutputCenter("X32", stem.port),
      label: String(stem.channel),
      route: `CH ${stem.channel} ${stem.label} → X32 XLR OUT ${stem.port} → FOH line input ${stem.foh}`,
    });
  }
  return (
    <div className="rack-guide">
      <p className="rack-flow">
        <strong>Stage-left analog split</strong> · Bring the upstage trunk,
        stage-left inputs and both mic receivers to split 1–18. Give FOH one
        labeled set of 18 tails. Agree who supplies phantom on the direct leg.
      </p>
      <section>
        <h2>
          S16 <small>Front panel · band side of split</small>
        </h2>
        <Panel device="s16" pins={s16} onTrace={onTrace} />
        <p>
          <strong>Inputs 1–16</strong> · Split numbers match X32 channels. Follow the S16 input assignment below. U = upstage subsnake. L = stage-left subsnake.
        </p>
        <div className="rack-inputs">
          {[inputs.slice(0, 8), inputs.slice(8)].map((rows, index) => (
            <table key={index}>
              <thead>
                <tr>
                  <th>Socket</th>
                  <th>Split / CH</th><th>S16 IN</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.number}>
                    <td>{row.socket}</td>
                    <td>
                      <b>{row.number}</b>
                    </td>
                    <td>{row.s16}</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>
      <section>
        <h2>
          X32 Rack <small>Rear panel · stage left</small>
        </h2>
        <div className="rack-rear">
          <Panel device="x32" pins={x32} onTrace={onTrace} />
          <div className="rack-wireless">
            <strong>Wireless mic receivers</strong>
            {wireless.map((pin) => (
              <p key={pin.label}>{pin.route}</p>
            ))}
            <p>
              {local
                ? "Use separate CH 17/18 strips. Keep phantom off on both split legs. Match RX mic/line level at soundcheck."
                : "Use separate CH 17/18 strips, line-level RX outputs, phantom off and balanced TRS into AUX IN."}
            </p>
          </div>
        </div>
        <div className="rack-link">
          <div className="rack-detail">
            <Image
              className="rack-panel-artwork"
              alt="S16 rear AES50 block. Port A is on the left."
              src="/stage-plot/panels/s16-aes50.png"
              unoptimized
              priority
              width={410}
              height={268}
            />
            <span>A</span>
          </div>
          <p>
            <strong>AES50 A ↔ A</strong> · S16 rear A (left) to X32 rear A
            (right). Use shielded Cat5e etherCON. X32 internal clock, S16
            standard mode, outputs 1–8. Assign each AES50 A input to the X32 channel listed above.
          </p>
        </div>
      </section>
      <div className="rack-lower">
        <section>
          <h2>
            Stereo ears <small>Odd = L · even = R</small>
          </h2>
          <table>
            <thead>
              <tr>
                <th>TX / artist</th>
                <th>Mix buses</th>
                <th>XLR outputs L / R</th>
              </tr>
            </thead>
            <tbody>
              {ears.map((mix) => (
                <tr key={mix.tx}>
                  <td>
                    <b>TX{mix.tx}</b> {mix.name}
                  </td>
                  <td>
                    {mix.bus} / {mix.bus + 1}
                  </td>
                  <td>
                    {mix.device} {mix.out} / {mix.out + 1}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Use AES50 A for S16 outputs and local XLR for X32 outputs. {extraPatched ? "TX6 Extra feeds the matched guest bodypack." : "TX6 and its matched bodypack are available for guest use."}
          </p>
        </section>
        <section>
          <h2>
            Playback <small>Mac → expansion-card USB</small>
          </h2>
          <table>
            <thead>
              <tr>
                <th>X32 channel</th>
                <th>USB</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {playback.map((stem) => (
                <tr key={stem.channel}>
                  <td>
                    <b>{stem.channel}</b> {stem.label}
                  </td>
                  <td>{stem.usb}</td>
                  <td>{stem.port === null ? "Band IEMs only" : `XLR ${stem.port} → FOH ${stem.foh}`}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </section>
      </div>
      <small className="rack-credit">
        Panel drawings: Behringer S16 Quick Start Guide, pp. 1, 10 · X32 Rack
        User Manual, p. 10.
      </small>
    </div>
  );
}
