import type { Metadata } from "next";
import { VersionLibrary } from "@/components/rider/version-library";
import { standardInputs } from "@/lib/rider/rack-inputs";
import type { Published } from "@/lib/rider/model";
import "../stage-plot.css";

export const metadata: Metadata = {
  title: "Rack channel guide | The Swell",
  robots: { index: false },
};

export default async function InputMapPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { version } = await searchParams;
  if (version)
    return <VersionLibrary key={version} version={version} inputMap />;
  // Preview the documented Standard design without reading a private revision.
  const record: Published = {
    revision: 0,
    date: "2026-11-20",
    versionName: "Standard design preview",
    plot: {
      configuration: "Five-piece show",
      width: 24,
      depth: 20,
      contact: "",
      monitors: "",
      power: "",
      objects: [],
      cables: [],
      cableNodes: [],
      gear: [],
      stageBoxes: [
        { id: "U", label: "upstage box", color: "Teal", x: 0, y: 0 },
        { id: "L", label: "stage left box", color: "Teal", x: 0, y: 0 },
      ],
      inputs: [...standardInputs, {source:"Brian wireless vocal", socket:"", number:17}, {source:"Chris wireless vocal", socket:"", number:18}].map((row) => ({
        id: "template-" + row.number,
        number: row.number,
        source: row.source,
        stageBoxId: row.socket[0],
        station: "",
        kind: "Line",
        foh: "",
        patch: "",
        phantom: "",
        notes: "",
        x: 0,
        y: 0,
      })),
    },
  };
  return <VersionLibrary version="standard" inputMap designPreview={record} />;
}
