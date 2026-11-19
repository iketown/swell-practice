import type { Metadata } from "next";
import { RiderWorkspace } from "@/components/rider/rider-workspace";
import { redirect } from "next/navigation";
import { checkHref } from "@/lib/rider/releases";
import { publicReleaseList, readRider } from "@/lib/server/stage-rider";
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
  if (date !== undefined) {
    const rows = await publicReleaseList();
    const id = param("v"),
      rev = param("r"),
      issue = param("rev");
    const release =
      id !== undefined || rev !== undefined
        ? rows.find((row) => row.id === id && String(row.revision) === rev)
        : rows.find(
            (row) =>
              row.legacyPublicRevision !== undefined &&
              row.date === date &&
              String(row.legacyPublicRevision) === issue,
          );
    redirect(release ? checkHref(release.code) : "/sp?legacy=1");
  }
  return <RiderWorkspace initial={await readRider()} />;
}
