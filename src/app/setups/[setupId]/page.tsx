import { SetupWorkspaceClient } from "@/components/setup-designer/setup-workspace-client";

export default async function SetupWorkspacePage({ params }: { params: Promise<{ setupId: string }> }) {
  const { setupId } = await params;
  return <SetupWorkspaceClient setupId={setupId} />;
}
