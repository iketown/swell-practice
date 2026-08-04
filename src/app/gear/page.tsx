import { GearIndexClient } from "@/components/gear/gear-index-client";

export default async function GearPage({ searchParams }: { searchParams: Promise<{ asset?: string | string[] }> }) {
  const { asset } = await searchParams;
  return <GearIndexClient initialQuery={Array.isArray(asset) ? asset[0] : asset} />;
}
