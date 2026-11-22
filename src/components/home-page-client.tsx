"use client";

import Link from "next/link";

import { AdminLogin } from "@/components/admin-login";
import { HomeWaveLogo } from "@/components/home-wave-logo";
import { SectionTabs } from "@/components/section-tabs";
import { buttonVariants } from "@/components/ui/button";
import { useAdmin } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/sp", label: "DOCS" },
  { href: "https://www.theswellsounds.com/about", label: "PRESS" },
  { href: "/members", label: "BAND" },
];

export function HomePageClient() {
  const { isSignedInAdmin } = useAdmin();

  return (
    <div className="swell-shell min-h-[100dvh] text-foreground">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl items-center px-6 py-12 sm:px-8">
        <div className="flex w-full flex-col items-center gap-6">
          <HomeWaveLogo />
          {isSignedInAdmin ? <SectionTabs /> : (
            <nav aria-label="Site sections" className="flex flex-wrap justify-center gap-2 sm:gap-4">
              {publicLinks.map(({ href, label }) => (
                <Link key={label} href={href} className={buttonVariants({ variant: "ghost" })}>
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </main>
      {!isSignedInAdmin && (
        <AdminLogin
          active={false}
          iconOnly
          className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "fixed right-4 bottom-4 size-11")}
        />
      )}
    </div>
  );
}
