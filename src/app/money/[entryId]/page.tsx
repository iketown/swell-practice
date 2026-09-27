import { MoneyClient } from "@/components/money/money-client";
export default async function MoneyEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  return <MoneyClient entryId={entryId} />;
}
