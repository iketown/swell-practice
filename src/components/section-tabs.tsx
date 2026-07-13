"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAdmin } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";

const baseTabs = [
  { href: "/songs", label: "Songs" },
  { href: "/parts", label: "Parts" },
  { href: "/members", label: "Members" },
] as const;

export function SectionTabs() {
  const admin = useAdmin();
  const pathname = usePathname();
  const tabs = admin.isAdmin
    ? [...baseTabs, { href: "/assignments", label: "Assignments" }]
    : baseTabs;

  return (
    <nav aria-label="Library sections" className="flex w-full gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring rounded-md border px-4 py-2 text-sm font-semibold transition-[transform,background-color,color,border-color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-px",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:border-primary hover:bg-muted",
            )}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
