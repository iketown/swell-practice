"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";

const sections = [
  { href: "/admin", label: "Songs" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/bands", label: "Bands" },
] as const;

export function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => {
        const active = section.href === "/admin" ? pathname === section.href : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "default" : "outline",
              size: "sm",
              className: active ? undefined : "bg-card",
            })}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
