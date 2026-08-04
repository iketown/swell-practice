import { redirect } from "next/navigation";

import { canonicalizeAssetTag } from "@/lib/gear/domain";

export default async function GearAssetShortLink({ params }: { params: Promise<{ assetTag: string }> }) {
  const { assetTag } = await params;
  redirect(`/gear?asset=${encodeURIComponent(canonicalizeAssetTag(assetTag))}`);
}
