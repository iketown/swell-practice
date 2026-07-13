import { MemberPartsClient } from "@/components/member-parts-client";

export default async function MemberPage({ params }: { params: Promise<{ memberSlug: string }> }) {
  const { memberSlug } = await params;
  return <MemberPartsClient memberSlug={memberSlug} />;
}
