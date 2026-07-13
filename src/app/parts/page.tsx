import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { DEFAULT_PART_SLUGS } from "@/lib/domain";

const vocalPartSlugs = DEFAULT_PART_SLUGS.filter((slug) => slug.startsWith("voc_"));
const instrumentalPartSlugs = DEFAULT_PART_SLUGS.filter((slug) => !slug.startsWith("voc_"));

export default function PartsPage() {
  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-8 p-4 sm:p-6">
        <div>
          <p className="swell-page-kicker">Practice library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Parts</h1>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <PartGroup title="Vocal parts" partSlugs={vocalPartSlugs} />
          <PartGroup title="Instrumental parts" partSlugs={instrumentalPartSlugs} />
        </div>
      </section>
    </AppShell>
  );
}

function PartGroup({
  partSlugs,
  title,
}: {
  partSlugs: readonly string[];
  title: string;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2
        className="text-muted-foreground mb-3 text-sm font-semibold uppercase tracking-[0.08em]"
        id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
      >
        {title}
      </h2>
      <div className="border-t">
        {partSlugs.map((partSlug) => (
          <Link
            className="hover:bg-muted/50 hover:text-primary focus-visible:ring-ring block border-b px-3 py-3 font-mono text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset"
            href={`/parts/${partSlug}`}
            key={partSlug}
          >
            {partSlug}
          </Link>
        ))}
      </div>
    </section>
  );
}
