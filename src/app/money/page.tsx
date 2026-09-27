import { MoneyClient } from "@/components/money/money-client";
export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; playbook?: string }>;
}) {
  const { draft, playbook } = await searchParams;
  return <MoneyClient key={playbook === "1" ? "playbook" : "money"} draftId={draft} playbookOpen={playbook === "1"} />;
}
