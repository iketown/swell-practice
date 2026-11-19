import type { Metadata } from "next";
import { RiderWorkspace } from "@/components/rider/rider-workspace";
import { readRider } from "@/lib/server/stage-rider";
import "./stage-plot.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stage Plot & Technical Rider | The Swell",
  description:
    "Current stage plot, audio input key and printable production rider for The Swell.",
  alternates: { canonical: "https://theswell.live/stage-plot" },
};
export default async function StagePlotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const param = (key: string) =>
    Array.isArray(query[key]) ? query[key]?.[0] : query[key];
  const date = param("ver");
  const scanned =
    date === undefined
      ? undefined
      : {
          date,
          issue: param("rev"),
          version: param("v"),
          revision: param("r"),
        };
  const rider = await readRider();
  return <RiderWorkspace initial={rider} scanned={scanned} />;
}
