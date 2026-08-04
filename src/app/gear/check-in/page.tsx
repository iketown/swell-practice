import { GearBatchCheckInClient } from "@/components/gear/gear-batch-check-in-client";

export default async function GearBatchCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string | string[] }>;
}) {
  const { location } = await searchParams;
  return (
    <GearBatchCheckInClient
      initialLocationId={Array.isArray(location) ? location[0] : location}
    />
  );
}
