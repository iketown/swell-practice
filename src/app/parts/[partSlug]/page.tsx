import { PartPageClient } from "@/components/part-page-client";

export default async function PartPage({
  params,
}: {
  params: Promise<{ partSlug: string }>;
}) {
  const { partSlug } = await params;
  return <PartPageClient partSlug={partSlug} />;
}
