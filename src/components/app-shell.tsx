import Image from "next/image";
import Link from "next/link";

import { SectionTabs } from "@/components/section-tabs";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "workspace";
}) {
  return (
    <div className="swell-shell min-h-screen text-foreground">
      <header className="swell-header border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/swell-logo-horizontal-stripes.svg" alt="The Swell" width={8192} height={3680} priority className="h-9 w-auto sm:h-11" />
              <span className="flex flex-col gap-0.5">
                <span className="sr-only">The Swell Parts</span>
                <span className="text-xs font-medium text-muted-foreground sm:text-sm">Songs, charts, demos</span>
              </span>
            </Link>
          </div>
          <SectionTabs />
        </div>
      </header>
      <main
        className={cn(
          "mx-auto flex w-full flex-col",
          variant === "workspace"
            ? "max-w-none gap-2 px-2 py-2 sm:px-3"
            : "max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8",
        )}
      >
        {children}
      </main>
    </div>
  );
}
