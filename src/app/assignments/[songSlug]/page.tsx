import { AssignmentBoardClient } from "@/components/assignment-board-client";

export default async function SongAssignmentsPage({ params }: { params: Promise<{ songSlug: string }> }) {
  const { songSlug } = await params;
  return <AssignmentBoardClient songSlug={songSlug} />;
}
