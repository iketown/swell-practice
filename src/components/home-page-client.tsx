"use client";

import Image from "next/image";

import { SectionTabs } from "@/components/section-tabs";

export function HomePageClient() {
  return (
    <div className="swell-shell min-h-[100dvh] text-foreground">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl items-center px-6 py-12 sm:px-8">
        <div className="flex w-full flex-col items-center gap-10">
          <Image
            alt="The Swell"
            className="h-auto w-full max-w-2xl"
            height={3680}
            priority
            src="/swell-logo-horizontal-stripes.svg"
            width={8192}
          />
          <SectionTabs />
        </div>
      </main>
    </div>
  );
}
