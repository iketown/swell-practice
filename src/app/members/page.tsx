import { BandAccessForm } from "@/components/band-access-form";
import { MemberIndexClient } from "@/components/member-index-client";
import { hasBandAccess } from "@/lib/server/band-session";
import { readBandMembers } from "@/lib/server/member-library";

export default async function MembersPage() {
  if (!(await hasBandAccess())) return <BandAccessForm />;
  const members = (await readBandMembers()).filter((member) => !member.hidden);
  return <MemberIndexClient members={members} />;
}
