import type { Metadata } from "next";

import { ProjectContributionsClient } from "@/components/project-contributions-client";

export const metadata: Metadata = {
  title: "Project Contributions | The Swell Parts",
  description: "Weight project steps, track dependencies, and calculate contributor shares in hours and percent.",
};

export default function ProjectsPage() {
  return <ProjectContributionsClient />;
}
