import { GearScanClient } from "@/components/gear/gear-scan-client";
import { canonicalizeAssetTag } from "@/lib/gear/domain";

export default async function GearAssetShortLink({ params }: { params: Promise<{ assetTag: string }> }) {
  const { assetTag } = await params;
  return <GearScanClient assetTag={canonicalizeAssetTag(assetTag)} />;
}
