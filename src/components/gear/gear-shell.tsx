import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

function gearNavClassName(active = false) {
  return cn(
    "rounded-md border px-4 py-2 text-sm font-semibold outline-none transition-[transform,background-color,color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-foreground hover:border-primary hover:bg-muted",
  );
}

export function GearShell({
  assetTag,
  active = "single",
  children,
  isAdmin = false,
  isDemoAdmin = false,
  wide = false,
}: {
  assetTag?: string;
  active?: "single" | "batch" | "pack";
  children: React.ReactNode;
  isAdmin?: boolean;
  isDemoAdmin?: boolean;
  wide?: boolean;
}) {
  const demoQuery = isDemoAdmin ? "?demo=1" : "";
  const navItems = [
    ...(assetTag ? [{ href: `/g/${encodeURIComponent(assetTag.toLowerCase())}${demoQuery}`, label: "Check in", key: "single" as const }] : []),
    ...(isAdmin || active === "batch" ? [{ href: `/gear/check-in${demoQuery}`, label: "Scan multiple", key: "batch" as const }] : []),
    ...(isAdmin || active === "pack" ? [{ href: `/gear/pack${demoQuery}`, label: "Pack a bag", key: "pack" as const }] : []),
    ...(isAdmin ? [{ href: `/gear${demoQuery}`, label: "Inventory", key: "inventory" as const }] : []),
  ];

  return (
    <div className="swell-shell min-h-screen text-foreground">
      <header className="swell-header border-b">
        <div className={cn("mx-auto flex flex-col gap-3 px-4 py-4 sm:px-6", wide ? "max-w-7xl" : "max-w-xl")}>
          <div className="flex items-center justify-between gap-4">
            <Image
              src="/swell-logo-horizontal-stripes.svg"
              alt="The Swell"
              width={8192}
              height={3680}
              priority
              className="h-9 w-auto sm:h-11"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Gear</p>
          </div>
          <nav aria-label="Gear sections" className="flex w-full gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const current = item.key === active;
              return (
                <Link
                  aria-current={current ? "page" : undefined}
                  className={gearNavClassName(current)}
                  href={item.href}
                  key={item.key}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto flex w-full flex-col gap-5 px-4 py-6 sm:px-6", wide ? "max-w-7xl" : "max-w-xl")}>
        {children}
      </main>
    </div>
  );
}
