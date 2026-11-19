import type { Metadata } from "next";
import { VersionLibrary } from "@/components/rider/version-library";
import "../stage-plot.css";

export const metadata: Metadata = {
  title: "Stage plot versions | The Swell",
  robots: { index: false, follow: false },
};
export default async function VersionListPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; revision?: string }>;
}) {
  const { version, revision } = await searchParams;
  return (
    <VersionLibrary
      key={JSON.stringify([version, revision])}
      version={version}
      revision={revision}
    />
  );
}
