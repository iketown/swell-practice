import { redirect } from "next/navigation";
import { RiderWorkspace } from "@/components/rider/rider-workspace";
import { checkHref, packetFromQuery, releaseCode } from "@/lib/rider/releases";
import { publicReleaseList, readIssuedRider } from "@/lib/server/stage-rider";
import "../../stage-plot/stage-plot.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Issued tech rider | The Swell",
  robots: { index: false },
};

export default async function IssuedRider({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; packet?: string }>;
}) {
  const { ver, packet } = await searchParams;
  const code = releaseCode.safeParse(ver);
  if (!code.success) redirect("/sp");
  const edition = (await publicReleaseList()).find(
    (row) => row.code === code.data,
  );
  const recipient = packetFromQuery(packet);
  if (!edition || edition.replacement)
    redirect(checkHref(code.data, recipient));
  return (
    <RiderWorkspace
      key={edition.code + recipient}
      initial={await readIssuedRider(edition)}
      issuedPacket={recipient}
    />
  );
}
