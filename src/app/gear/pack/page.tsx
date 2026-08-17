import { GearPackClient } from "@/components/gear/gear-pack-client";

export default async function GearPackPage({
  searchParams,
}: {
  searchParams: Promise<{ container?: string | string[] }>;
}) {
  const { container } = await searchParams;
  return <GearPackClient initialContainerTag={Array.isArray(container) ? container[0] : container} />;
}
