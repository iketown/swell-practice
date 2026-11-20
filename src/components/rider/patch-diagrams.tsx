import type { ReactNode } from "react";
import type { Plot } from "@/lib/rider/model";
import { type RackMap } from "@/lib/rider/rack-map";
import { rackInputs } from "@/lib/rider/rack-inputs";

import { WirelessRackMap } from "./wireless-rack-map";
import { SplitterInputMap } from "./splitter-input-map";
import { SubsnakePanelMap } from "./subsnake-panel-map";

export function PatchDiagrams({ plot, map, title }: { plot: Plot; map: RackMap; title?: (name: string) => ReactNode }) {
  const inputs = rackInputs(plot, map);
  const sheet = (key: string, name: string, content: ReactNode) =>
    <section key={key} className={title ? "print-sheet patch-sheet" : "patch-sheet"}>
      {title ? title(name) : <h2>{name}</h2>}{content}
    </section>;
  return <>
    {sheet("splitter-inputs", "FOH splitter inputs", <SplitterInputMap inputs={inputs} plot={plot} map={map} />)}
    {sheet("s16-inputs", "Analog split to S16 inputs", <SubsnakePanelMap print={Boolean(title)} inputs={inputs} />)}
    {sheet("rack-wireless-ears", "Wireless mics & stereo ears", <WirelessRackMap plot={plot} map={map}/>)}
  </>;
}
