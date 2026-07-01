import Image from "next/image";
import Link from "next/link";

import { AdminLogin } from "@/components/admin-login";
import { Button } from "@/components/ui/button";
import { DEFAULT_PART_SLUGS, partLabel } from "@/lib/domain";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="swell-shell min-h-screen text-foreground">
      <header className="swell-header border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/swell-logo-horizontal-stripes.svg" alt="The Swell" width={8192} height={3680} priority className="h-9 w-auto sm:h-11" />
              <span className="flex flex-col gap-0.5">
                <span className="sr-only">The Swell Parts</span>
                <span className="text-xs font-medium text-muted-foreground sm:text-sm">Songs, charts, demos</span>
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Button render={<Link href="/" />} variant="ghost" size="sm" nativeButton={false}>
                Songs
              </Button>
            </nav>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {DEFAULT_PART_SLUGS.map((slug) => (
              <Button key={slug} render={<Link href={`/parts/${slug}`} />} variant="secondary" size="sm" nativeButton={false} className="swell-soft-chip">
                {partLabel(slug)}
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <AdminLogin />
    </div>
  );
}
