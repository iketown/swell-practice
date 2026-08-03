import type { Metadata } from "next";

import { SystemDocsPage } from "@/components/system-docs-page";

export const metadata: Metadata = {
  title: "System Guide | The Swell Parts",
  description: "How The Swell plans stages, routes signals, tracks gear, and packs for rehearsals and shows.",
};

export default function DocsPage() {
  return <SystemDocsPage />;
}
