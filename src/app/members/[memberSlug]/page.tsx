import { BandAccessForm } from "@/components/band-access-form";
import { MemberPartsClient } from "@/components/member-parts-client";
import { hasBandAccess } from "@/lib/server/band-session";

export default async function MemberPage({ params }: { params: Promise<{ memberSlug: string }> }) {
  if (!(await hasBandAccess())) return <BandAccessForm />;
  const { memberSlug } = await params;
  return <MemberPartsClient memberSlug={memberSlug} />;
}
